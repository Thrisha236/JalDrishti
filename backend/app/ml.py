"""Stage 12: AI/ML early warning. Four small, explainable models on the live readings and the pipe records.

1. Anomaly detection: an Isolation Forest learns what normal operation looks like (tail and head pressure and
   flow, and the head-tail flow gap) and scores the latest two minutes. It flags combinations the fixed alert
   rules do not cover, and says which readings are off.
2. Forecast: a robust (Theil-Sen) trend on tail pressure and tank level predicts how many minutes remain
   before a reading leaves its normal band, so a slow leak is seen before it becomes an alert.
3. Water-quality outlook: a first-order chlorine decay model. Water that moves slowly through a pipe is older
   and has less residual chlorine left; low pressure also raises the risk of dirty water getting in.
   It is an indicator that says WHERE to collect a field-kit sample. It never certifies water as safe.
4. Failure outlook: from each pipe's repair history (mean time between failures) and its risk score.

Honest limits: the Isolation Forest is trained only on simulated normal operation; chlorine dose and decay rate
are assumptions; no accuracy or field result is claimed. Scores are rankings, not probabilities."""

import math
from datetime import date, datetime, timedelta, timezone
from statistics import median

import numpy as np
from sklearn.ensemble import IsolationForest
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from . import models as m

IST = timezone(timedelta(hours=5, minutes=30))
WINDOW_SECONDS = 120  # how much recent data the anomaly model looks at
MIN_READINGS = 3  # per sensor, in that window
MODEL_NOTE = "Trained on simulated normal operation only. Not validated on field data; no accuracy is claimed."

# Chlorine model assumptions (shown on screen). Starting values for the bench rig, not field measurements.
CHLORINE = {"dose_mg_l": 0.8, "decay_per_hour": 0.30, "at_risk_below": 0.2, "watch_below": 0.4, "default_diameter_mm": 100}
INGRESS_PRESSURE_BAR = 0.3  # below this, dirty water can be drawn into a leaking pipe


def _iso(dt: datetime) -> str:
    return dt.astimezone(IST).isoformat(timespec="seconds")


# ---------- shared helpers ----------

def network_sensors(session: Session) -> dict[str, m.Sensor]:
    """The sensors the models use, found by kind and position rather than by id."""
    by_key = {}
    for s in session.scalars(select(m.Sensor)):
        by_key.setdefault((s.kind, s.position), s)
    wanted = {
        "head_flow": ("flow", "head"), "head_pressure": ("pressure", "head"),
        "tail_flow": ("flow", "tail"), "tail_pressure": ("pressure", "tail"),
        "pump": ("pump_current", None), "tank": ("tank_level", None),
        "head_acoustic": ("acoustic", "head"), "tail_acoustic": ("acoustic", "tail"),
        "head_chlorine": ("chlorine", "head"), "tail_chlorine": ("chlorine", "tail"),
    }
    return {k: by_key[v] for k, v in wanted.items() if v in by_key}


def trusted_sensor_ids(session: Session, now: datetime) -> set[str]:
    """Sensors whose node is reporting and which have no open fault alert: the same gate the alert rules use."""
    nodes = {n.id: n for n in session.scalars(select(m.SensorNode))}
    faulty = {
        a.sensor_id
        for a in session.scalars(select(m.Alert).where(m.Alert.kind == "EQUIPMENT_HEALTH", m.Alert.is_simulated.is_(False), m.Alert.cleared_at.is_(None)))
        if a.sensor_id
    }
    out = set()
    for s in session.scalars(select(m.Sensor)):
        node = nodes.get(s.node_id)
        if node and node.last_seen_at and (now - datetime.fromisoformat(node.last_seen_at)).total_seconds() <= config.NODE_OFFLINE_AFTER_SECONDS and s.id not in faulty:
            out.add(s.id)
    return out


def recent_values(session: Session, sensor_id: str, now: datetime, seconds: int = WINDOW_SECONDS) -> list[float]:
    since = _iso(now - timedelta(seconds=seconds))
    return list(session.scalars(select(m.Reading.value).where(m.Reading.sensor_id == sensor_id, m.Reading.ts >= since, m.Reading.quality_flag == "ok")))


def live_median(session: Session, sensor: m.Sensor | None, now: datetime, trusted: set[str], seconds: int = WINDOW_SECONDS) -> float | None:
    if sensor is None or sensor.id not in trusted:
        return None
    vals = recent_values(session, sensor.id, now, seconds)
    return median(vals) if len(vals) >= MIN_READINGS else None


# ---------- 1. anomaly detection ----------

FEATURES = [
    ("tail_pressure", "Tail pressure", "bar"),
    ("tail_flow", "Tail flow", "L/min"),
    ("head_flow", "Head flow", "L/min"),
    ("head_pressure", "Head pressure", "bar"),
    ("flow_gap", "Head-to-tail flow gap", "% of head flow"),
]
_MODELS: dict[tuple, dict] = {}


def _baselines(sensors: dict[str, m.Sensor]) -> dict[str, float]:
    return {k: sensors[k].baseline for k in ("tail_pressure", "tail_flow", "head_flow", "head_pressure")}


def _train(base: dict[str, float]) -> dict:
    """Fit on synthetic normal operation around the sensors' recorded baselines (cached per baseline set)."""
    key = tuple(round(v, 4) for v in base.values())
    if key in _MODELS:
        return _MODELS[key]
    rng = np.random.default_rng(42)
    n = 2000
    demand = rng.normal(1.0, 0.04, n)  # day-to-day demand wobble, shared by both flows
    head_flow = base["head_flow"] * demand * (1 + rng.normal(0, 0.02, n))
    tail_flow = base["tail_flow"] * demand * (1 + rng.normal(0, 0.02, n))
    head_p = base["head_pressure"] * (1 - 0.3 * (demand - 1)) * (1 + rng.normal(0, 0.012, n))
    tail_p = base["tail_pressure"] * (1 - 0.3 * (demand - 1)) * (1 + rng.normal(0, 0.018, n))
    X = np.column_stack([tail_p / base["tail_pressure"], tail_flow / base["tail_flow"], head_flow / base["head_flow"], head_p / base["head_pressure"], (head_flow - tail_flow) / head_flow])
    forest = IsolationForest(n_estimators=150, contamination="auto", random_state=42).fit(X)
    scores = -forest.score_samples(X)
    centre = np.median(X, axis=0)
    spread = np.median(np.abs(X - centre), axis=0) * 1.4826
    spread = np.where(spread < 1e-6, 1e-6, spread)
    _MODELS[key] = {
        "forest": forest, "centre": centre, "spread": spread,
        "median": float(np.median(scores)), "limit": float(np.percentile(scores, 99.5)), "samples": n,
    }
    return _MODELS[key]


def assess_anomaly(session: Session, now: datetime | None = None) -> dict:
    """Is the network behaving like normal operation right now? Uses only trusted sensors and the last two minutes."""
    now = now or datetime.now(IST)
    sensors = network_sensors(session)
    base_info = {"model": "Isolation Forest (scikit-learn)", "note": MODEL_NOTE, "window_seconds": WINDOW_SECONDS}
    needed = ("tail_pressure", "tail_flow", "head_flow", "head_pressure")
    if any(k not in sensors for k in needed):
        return {**base_info, "status": "insufficient_data", "reason": "The pressure and flow sensors this model needs are not configured.", "index": None, "features": [], "explanation": []}
    trusted = trusted_sensor_ids(session, now)
    vals, missing = {}, []
    for k in needed:
        v = live_median(session, sensors[k], now, trusted)
        if v is None:
            missing.append(sensors[k].id)
        vals[k] = v
    if missing:
        return {**base_info, "status": "insufficient_data", "index": None, "features": [], "explanation": [],
                "reason": f"Not enough trusted readings in the last {WINDOW_SECONDS // 60} minutes ({', '.join(missing)}): node offline, sensor fault, or no data yet."}

    base = _baselines(sensors)
    model = _train(base)
    gap = (vals["head_flow"] - vals["tail_flow"]) / vals["head_flow"] if vals["head_flow"] > 1 else 0.0
    x = np.array([[vals["tail_pressure"] / base["tail_pressure"], vals["tail_flow"] / base["tail_flow"], vals["head_flow"] / base["head_flow"], vals["head_pressure"] / base["head_pressure"], gap]])
    score = float(-model["forest"].score_samples(x)[0])
    span = max(model["limit"] - model["median"], 1e-6)
    index = int(round(min(max((score - model["median"]) / span, 0.0), 2.0) * 50))  # 50 = edge of normal, 100 = twice as unusual
    z = (x[0] - model["centre"]) / model["spread"]

    features, explanation = [], []
    for i, (key, label, unit) in enumerate(FEATURES):
        if key == "flow_gap":
            value, ref = round(gap * 100, 1), round(float(model["centre"][i]) * 100, 1)
        else:
            value, ref = round(vals[key], 2), round(base[key], 2)
        dev = round((value - ref) / ref * 100, 1) if key != "flow_gap" and ref else None
        features.append({"key": key, "label": label, "unit": unit, "value": value, "normal": ref, "deviation_pct": dev, "z": round(float(z[i]), 1)})
    for f in sorted(features, key=lambda f: -abs(f["z"])):
        if abs(f["z"]) >= 3:
            if f["key"] == "flow_gap":
                explanation.append(f"{f['label']} is {f['value']}% (normal about {f['normal']}%)")
            else:
                explanation.append(f"{f['label']} is {f['value']} {f['unit']}, {abs(f['deviation_pct']):.0f}% {'below' if f['deviation_pct'] < 0 else 'above'} normal ({f['normal']})")
    tail_asset = session.get(m.SensorNode, sensors["tail_pressure"].node_id).asset_id
    code = session.get(m.Asset, tail_asset).code
    return {
        **base_info, "status": "anomaly" if score > model["limit"] else "normal", "index": index, "limit_index": 50,
        "asset_id": tail_asset, "asset_code": code, "features": features, "explanation": explanation[:3],
        "reason": None, "training_samples": model["samples"],
    }


# ---------- 2. forecast ----------

def _theil_sen(t: list[float], y: list[float]) -> tuple[float, float]:
    pts = list(zip(t, y))
    if len(pts) > 60:
        pts = pts[:: math.ceil(len(pts) / 60)]
    slopes = [(y2 - y1) / (t2 - t1) for i, (t1, y1) in enumerate(pts) for t2, y2 in pts[i + 1:] if t2 - t1 > 1e-9]
    slope = median(slopes) if slopes else 0.0
    intercept = median(yy - slope * tt for tt, yy in zip(t, y))
    return slope, intercept


def forecast_sensor(session: Session, sensor: m.Sensor, now: datetime | None = None, minutes: int = 10, horizon_min: int = 15) -> dict:
    """Trend of one sensor over the last few minutes and the time left before it leaves its normal band."""
    now = now or datetime.now(IST)
    since = _iso(now - timedelta(minutes=minutes))
    rows = session.execute(select(m.Reading.ts, m.Reading.value).where(m.Reading.sensor_id == sensor.id, m.Reading.ts >= since, m.Reading.quality_flag == "ok").order_by(m.Reading.ts)).all()
    out = {"sensor_id": sensor.id, "kind": sensor.kind, "unit": sensor.unit, "normal_band": [sensor.band_low, sensor.band_high], "window_minutes": minutes}
    if sensor.id not in trusted_sensor_ids(session, now):
        return {**out, "status": "insufficient_data", "reason": "Node is not reporting, or the sensor has a fault."}
    t = [(datetime.fromisoformat(ts) - now).total_seconds() / 60 for ts, _ in rows]
    y = [v for _, v in rows]
    if len(y) < 8 or (t[-1] - t[0]) < 1.0:
        return {**out, "status": "insufficient_data", "reason": f"Need at least 8 readings over 1 minute; have {len(y)}."}
    slope, intercept = _theil_sen(t, y)
    fitted = [intercept + slope * tt for tt in t]
    ss_res = sum((a - b) ** 2 for a, b in zip(y, fitted))
    mean_y = sum(y) / len(y)
    ss_tot = sum((a - mean_y) ** 2 for a in y)
    r2 = max(0.0, 1 - ss_res / ss_tot) if ss_tot > 1e-12 else 0.0
    confidence = "high" if r2 >= 0.7 and len(y) >= 20 else "medium" if r2 >= 0.3 else "low"
    current = median(y[-5:])
    low, high = sensor.band_low, sensor.band_high
    step = max(1, len(y) // 40)
    result = {
        **out, "status": "ok", "current": round(current, 3), "slope_per_min": round(slope, 4), "r2": round(r2, 2), "confidence": confidence, "readings": len(y),
        "history": [{"t": round(tt, 2), "value": round(v, 3)} for tt, v in list(zip(t, y))[::step]],
        "projection": [{"t": h, "value": round(max(0.0, intercept + slope * h), 3)} for h in range(0, horizon_min + 1, 1)],  # a pressure, flow or level cannot go below zero
        "minutes_to_breach": None, "level": "stable", "message": None,
    }
    unit = sensor.unit
    if current < low:
        result.update(level="breach", message=f"Already below the normal band ({current:.2f} {unit}, band {low}-{high}).")
    elif current > high:
        result.update(level="breach", message=f"Already above the normal band ({current:.2f} {unit}, band {low}-{high}).")
    elif confidence != "low" and slope < -1e-4:
        eta = (current - low) / -slope
        result["minutes_to_breach"] = round(eta, 1)
        level = "warning" if eta <= 30 else "watch" if eta <= 120 else "stable"
        when = f"{max(5, round(eta * 60))} s" if eta < 1 else f"{eta:.0f} min"
        result.update(level=level, message=f"Falling {abs(slope):.3f} {unit} per minute; expected to drop below {low} {unit} in about {when}." if level != "stable" else None)
    elif confidence != "low" and slope > 1e-4:
        eta = (high - current) / slope
        if eta <= 120:
            when = f"{max(5, round(eta * 60))} s" if eta < 1 else f"{eta:.0f} min"
            result.update(level="warning" if eta <= 30 else "watch", minutes_to_breach=round(eta, 1), message=f"Rising {slope:.3f} {unit} per minute; expected above {high} {unit} in about {when}.")
    return result


# ---------- 3. water-quality outlook ----------

def quality_outlook(session: Session, now: datetime | None = None) -> list[dict]:
    """Predicted residual chlorine at the tail of each pipeline that has tail sensors, from water age and pressure."""
    now = now or datetime.now(IST)
    sensors = network_sensors(session)
    tail_p, tail_f = sensors.get("tail_pressure"), sensors.get("tail_flow")
    if tail_p is None or tail_f is None:
        return []
    trusted = trusted_sensor_ids(session, now)
    asset = session.get(m.Asset, session.get(m.SensorNode, tail_p.node_id).asset_id)
    profile = session.get(m.PipelineProfile, asset.id)
    if profile is None or not profile.length_m:
        return []
    diameter = profile.diameter_mm or CHLORINE["default_diameter_mm"]
    volume_m3 = math.pi * (diameter / 2000) ** 2 * profile.length_m
    flow_live, pressure_live = live_median(session, tail_f, now, trusted), live_median(session, tail_p, now, trusted)
    flow = flow_live if flow_live is not None else tail_f.baseline
    pressure = pressure_live if pressure_live is not None else tail_p.baseline
    age_h = volume_m3 / (max(flow, 1.0) * 0.06)  # L/min -> m3/h
    model_residual = CHLORINE["dose_mg_l"] * math.exp(-CHLORINE["decay_per_hour"] * age_h)
    cl = sensors.get("tail_chlorine")
    measured = live_median(session, cl, now, trusted) if cl is not None else None
    residual = measured if measured is not None else model_residual
    lab = "Measured" if measured is not None else "Predicted"
    reasons = []
    level = "OK"
    if residual < CHLORINE["at_risk_below"]:
        level = "AT_RISK"
        reasons.append(f"{lab} residual chlorine {residual:.2f} mg/L is below the commonly used minimum of {CHLORINE['at_risk_below']} mg/L")
    elif residual < CHLORINE["watch_below"]:
        level = "WATCH"
        reasons.append(f"{lab} residual chlorine {residual:.2f} mg/L is getting low")
    if pressure < INGRESS_PRESSURE_BAR:
        level = "AT_RISK"
        reasons.append(f"Tail pressure {pressure:.2f} bar is very low: dirty water can be drawn in through leaks")
    elif pressure < tail_p.band_low and level == "OK":
        level = "WATCH"
        reasons.append(f"Tail pressure {pressure:.2f} bar is below the normal band, so the pipe is more exposed to ingress")
    action = {
        "OK": "No action needed. Keep the routine monthly field-kit tests.",
        "WATCH": "Collect a field-kit sample (residual chlorine and bacteria vial) at the tail tap within 24 hours.",
        "AT_RISK": "Collect a field-kit sample at the tail tap today and advise households to boil water until it passes.",
    }[level]
    return [{
        "asset_id": asset.id, "asset_code": asset.code, "service_area_id": asset.service_area_id, "level": level,
        "predicted_residual_mg_l": round(residual, 2), "basis": "measured" if measured is not None else "model", "model_residual_mg_l": round(model_residual, 2), "measured_residual_mg_l": round(measured, 2) if measured is not None else None, "water_age_hours": round(age_h, 1), "tail_pressure_bar": round(pressure, 2),
        "tail_flow_lpm": round(flow, 1), "data_source": ("chlorine probe + live sensors" if measured is not None else "live sensors") if flow_live is not None and pressure_live is not None else "recorded baseline (no live data)",
        "reasons": reasons, "action": action,
        "assumptions": {
            "chlorine_dose_mg_l": CHLORINE["dose_mg_l"], "decay_per_hour": CHLORINE["decay_per_hour"],
            "pipe_volume_m3": round(volume_m3, 2), "diameter_mm": diameter, "diameter_assumed": not profile.diameter_mm,
        },
        "disclaimer": "An indicator of where to test, not a measurement. It never certifies water as safe or unsafe: confirm with a field-kit or lab test.",
    }]


# ---------- 4. failure outlook ----------

def failure_outlook(session: Session, village_ids: set[str] | None = None) -> list[dict]:
    """Which pipelines are likely to need attention soonest: mean time between failures plus the risk score."""
    from . import read_model as rm  # local import: read_model imports a lot

    as_of = date.fromisoformat(rm.config(session, "meta")["as_of"][:10])
    areas = {a.id: a for a in session.scalars(select(m.ServiceArea))}
    out = []
    for p in session.scalars(select(m.PipelineProfile)):
        asset = session.get(m.Asset, p.asset_id)
        area = areas[asset.service_area_id]
        if village_ids is not None and area.village_id not in village_ids:
            continue
        risk = rm.risk_for(session, p.asset_id)
        dates = sorted(date.fromisoformat(r.date) for r in session.scalars(select(m.Repair).where(m.Repair.asset_id == p.asset_id)))
        intervals = [(b - a).days for a, b in zip(dates, dates[1:])]
        row = {
            "asset_id": p.asset_id, "asset_code": asset.code, "name": asset.name, "service_area_id": area.id, "village_id": area.village_id,
            "risk_score": risk["score"] if risk else None, "risk_band": risk["band"] if risk else None,
            "failures_recorded": len(dates), "last_failure": dates[-1].isoformat() if dates else None,
            "mtbf_days": None, "expected_next": None, "window": None, "timing": "unknown", "days_overdue": None,
        }
        basis = "Fewer than two recorded failures: no repeat-failure pattern to learn from yet."
        timing = "unknown"
        if len(intervals) >= 1:
            mtbf = sum(intervals) / len(intervals)
            spread = (sum((i - mtbf) ** 2 for i in intervals) / len(intervals)) ** 0.5 if len(intervals) >= 2 else 0.3 * mtbf
            spread = max(spread, 0.15 * mtbf)
            expected = dates[-1] + timedelta(days=round(mtbf))
            lo, hi = expected - timedelta(days=round(spread)), expected + timedelta(days=round(spread))
            timing = "overdue" if as_of > hi else "due_soon" if as_of >= lo - timedelta(days=60) else "later"
            row.update(mtbf_days=round(mtbf), expected_next=expected.isoformat(), window=[lo.isoformat(), hi.isoformat()], days_overdue=max(0, (as_of - hi).days) if timing == "overdue" else None)
            basis = f"{len(dates)} failures, on average {round(mtbf)} days apart; the last was {(as_of - dates[-1]).days} days before {as_of.isoformat()}."
            if len(intervals) == 1:
                basis += " Only one interval, so the window is wide."
        band = row["risk_band"]
        priority = "HIGH" if band == "HIGH" or timing == "overdue" else "MEDIUM" if band == "MEDIUM" or timing == "due_soon" else "LOW"
        row.update(timing=timing, priority=priority, basis=basis,
                   inspect_within_days={"HIGH": 14, "MEDIUM": 45, "LOW": 120}[priority])
        out.append(row)
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    return sorted(out, key=lambda r: (order[r["priority"]], -(r["risk_score"] or 0)))


# ---------- 5. supply regularity (is the water arriving steadily?) ----------

REGULARITY_MINUTES = 30
MIN_REGULARITY_READINGS = 12


def supply_regularity(session: Session, now: datetime | None = None, minutes: int = REGULARITY_MINUTES) -> dict:
    """Tail-end flow over the last half hour, during supply hours only: steady, intermittent (starting and stopping
    again and again), off, or unsteady. Intermittent supply is a common rural complaint that a single "no flow" rule misses."""
    from . import rules  # local import: rules imports the alert builders, which import this module

    now = now or datetime.now(IST)
    base = {"window_minutes": minutes, "model": "Flow on/off pattern during supply hours"}
    s = network_sensors(session).get("tail_flow")
    if s is None:
        return {**base, "status": "insufficient_data", "reason": "No tail flow sensor is configured."}
    if s.id not in trusted_sensor_ids(session, now):
        return {**base, "status": "insufficient_data", "reason": "The tail node is not reporting, or the sensor has a fault."}
    area_id = session.get(m.Asset, session.get(m.SensorNode, s.node_id).asset_id).service_area_id
    since = _iso(now - timedelta(minutes=minutes))
    rows = session.execute(select(m.Reading.ts, m.Reading.value).where(m.Reading.sensor_id == s.id, m.Reading.ts >= since, m.Reading.quality_flag == "ok").order_by(m.Reading.ts)).all()
    rows = [(ts, v) for ts, v in rows if rules.in_supply_window(session, area_id, datetime.fromisoformat(ts))]
    if len(rows) < MIN_REGULARITY_READINGS:
        return {**base, "status": "insufficient_data", "reason": f"Need at least {MIN_REGULARITY_READINGS} readings during supply hours; have {len(rows)}."}
    floor = 0.2 * s.baseline  # below a fifth of normal flow the tap is effectively dry
    on = [v >= floor for _, v in rows]
    transitions = sum(1 for a, b in zip(on, on[1:]) if a != b)
    on_pct = round(100 * sum(on) / len(on))
    if on_pct < 5:
        pattern, message = "off", "No water reached the tail end during supply hours."
    elif on_pct >= 90 and transitions <= 1:
        pattern, message = "steady", "Water is arriving steadily."
    elif transitions >= 4 and 15 <= on_pct <= 90:
        pattern, message = "intermittent", f"Supply is stopping and starting: flow was on {on_pct}% of the time with {transitions} switches in {minutes} minutes."
    else:
        pattern, message = "unsteady", f"Flow was on {on_pct}% of the time during supply hours."
    return {**base, "status": "ok", "pattern": pattern, "on_pct": on_pct, "transitions": transitions, "readings": len(rows), "message": message, "asset_id": session.get(m.SensorNode, s.node_id).asset_id}


# ---------- 6. complaint clusters (DBSCAN) ----------

CLUSTER_EPS_M = 120
CLUSTER_MIN_REPORTS = 3
CLUSTER_HOURS = 24


def _dist_to_line(p: tuple[float, float], line: list) -> float:
    best = float("inf")
    for (x0, y0), (x1, y1) in zip(line, line[1:]):
        dx, dy = x1 - x0, y1 - y0
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((p[0] - x0) * dx + (p[1] - y0) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(p[0] - (x0 + t * dx), p[1] - (y0 + t * dy)))
    return best


def complaint_clusters(session: Session, now: datetime | None = None, hours: int = CLUSTER_HOURS) -> list[dict]:
    """Groups of villager reports that sit close together on the map (DBSCAN, 120 m, at least 3 reports).
    A cluster along a pipe points at a network fault rather than three unrelated household problems.
    Reports shared with the coarse (zone-level) location cluster by zone; geo-tagged reports cluster by place."""
    from sklearn.cluster import DBSCAN

    now = now or datetime.now(IST)
    pts = []
    for c in session.scalars(select(m.Complaint)):
        if not c.location or c.location.get("x") is None:
            continue
        if c.is_simulated:
            if not config.DEMO_MODE:  # scripted reports carry story dates; they count only in demo mode
                continue
        elif now - datetime.fromisoformat(c.created_at) > timedelta(hours=hours):
            continue
        pts.append(c)
    if len(pts) < CLUSTER_MIN_REPORTS:
        return []
    labels = DBSCAN(eps=CLUSTER_EPS_M, min_samples=CLUSTER_MIN_REPORTS).fit_predict(np.array([[c.location["x"], c.location["y"]] for c in pts], dtype=float))
    village_of = {a.id: a.village_id for a in session.scalars(select(m.ServiceArea))}
    pipes = [(a, a.geometry["line"]) for a in session.scalars(select(m.Asset).where(m.Asset.type == "pipeline")) if a.geometry.get("line")]
    out = []
    for lab in sorted(set(labels) - {-1}):
        members = [c for c, l in zip(pts, labels) if l == lab]
        cx = sum(c.location["x"] for c in members) / len(members)
        cy = sum(c.location["y"] for c in members) / len(members)
        areas = [c.service_area_id for c in members]
        # Every village is drawn on the same plan, so only pipelines of the reports' own village can be the cause.
        own = [p for p in pipes if village_of[p[0].service_area_id] == village_of[max(set(areas), key=areas.count)]]
        asset, line = min(own, key=lambda p: _dist_to_line((cx, cy), p[1]))
        cats: dict[str, int] = {}
        for c in members:
            cats[c.category] = cats.get(c.category, 0) + 1
        out.append({
            "id": f"cluster-{lab + 1}", "size": len(members), "complaint_codes": sorted(c.public_code for c in members), "categories": cats,
            "service_area_id": max(set(areas), key=areas.count), "centre": [round(cx), round(cy)],
            "radius_m": round(max(math.hypot(c.location["x"] - cx, c.location["y"] - cy) for c in members)),
            "asset_id": asset.id, "asset_code": asset.code, "distance_to_pipe_m": round(_dist_to_line((cx, cy), line)),
            "coarse": all(c.location.get("precision") == "approx_1km" for c in members),
        })
    return sorted(out, key=lambda c: -c["size"])


# ---------- everything together ----------

def rm_as_of(session: Session) -> str:
    """The demo's 'today' used for the risk score and the failure outlook (from the seed's meta)."""
    from . import read_model as rm

    return rm.config(session, "meta")["as_of"][:10]


MODEL_CARDS = [
    {"id": "anomaly", "name": "Anomaly detection", "method": "Isolation Forest", "inputs": "Tail and head pressure and flow, head-to-tail flow gap (last 2 min, trusted sensors only)",
     "output": "Anomaly index (50 = edge of normal) and the readings that are off", "training": "2,000 synthetic windows of normal operation", "limits": MODEL_NOTE},
    {"id": "forecast", "name": "Disruption forecast", "method": "Theil-Sen robust trend", "inputs": "Last 10 min of tail pressure and tank level",
     "output": "Minutes until the reading leaves its normal band, with a confidence label", "training": "None: fitted to the live readings each time", "limits": "Assumes the recent trend continues; low-confidence trends are not forecast."},
    {"id": "quality", "name": "Water-quality outlook", "method": "First-order chlorine decay + low-pressure ingress check", "inputs": "Pipe volume, live tail flow and pressure",
     "output": "Predicted residual chlorine at the tail, and where to take a field-kit sample", "training": "None: physical model with assumed dose and decay rate", "limits": "Assumptions, not measurements. Indicator only; never a safety certification."},
    {"id": "regularity", "name": "Supply regularity", "method": "Flow on/off pattern", "inputs": "Last 30 min of tail flow, during supply hours only",
     "output": "Steady, intermittent, off or unsteady, with how often the water stopped", "training": "None: counted from the readings", "limits": "Needs 12 readings during supply hours; the dry-tap floor (a fifth of normal flow) is an assumption."},
    {"id": "clusters", "name": "Complaint clusters", "method": "DBSCAN (scikit-learn)", "inputs": "Where villagers' reports were made in the last 24 hours",
     "output": "Groups of at least 3 reports within 120 m, and the pipeline nearest to each group", "training": "None: unsupervised", "limits": "Reports shared at zone level (not geo-tagged) cluster by zone, so the pin is the zone centre."},
    {"id": "failure", "name": "Failure outlook", "method": "Mean time between failures + risk score", "inputs": "Repair history and the pipeline risk score",
     "output": "Expected window for the next failure and a priority", "training": "None: computed from records", "limits": "Needs at least two recorded failures; a ranking, not a probability."},
]


def predictions(session: Session, village_ids: set[str] | None = None, now: datetime | None = None) -> dict:
    now = now or datetime.now(IST)
    sensors = network_sensors(session)
    anomaly = assess_anomaly(session, now)
    forecasts = [forecast_sensor(session, sensors[k], now, minutes=10, horizon_min=15) for k in ("tail_pressure", "tank") if k in sensors]
    quality = quality_outlook(session, now)
    failures = failure_outlook(session, village_ids)
    regularity = supply_regularity(session, now)
    clusters = complaint_clusters(session, now)
    attention = (
        (1 if anomaly["status"] == "anomaly" else 0)
        + sum(1 for f in forecasts if f.get("level") in ("warning", "breach"))
        + sum(1 for q in quality if q["level"] != "OK")
        + sum(1 for f in failures if f["priority"] == "HIGH")
        + (1 if regularity.get("pattern") in ("intermittent", "off") else 0)
        + len(clusters)
    )
    return {
        "generated_at": _iso(now), "as_of": rm_as_of(session), "is_simulated": True, "attention_count": attention,
        "anomaly": anomaly, "forecasts": forecasts, "quality": quality, "failures": failures, "regularity": regularity, "clusters": clusters, "models": MODEL_CARDS,
        "note": "Models run on simulated sensor data in this prototype. Scores are rankings, not probabilities.",
    }
