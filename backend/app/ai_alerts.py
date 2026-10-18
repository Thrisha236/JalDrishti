"""Alerts that do not come from a single threshold: the AI models, field-test results and villagers' reports.

These feed the same raise-and-clear machinery as the rules engine (rules.evaluate), so an alert opens when its
condition holds, stays open (with its latest numbers) while it does, and clears when it stops. Each has a `kind`:

- AI_PREDICTION: something the models expect (an unusual pattern, a forecast breach, a failure that is due)
- WATER_QUALITY: a failed field test, or the chlorine outlook says to test water
- COMMUNITY: derived from villagers' reports (clusters of complaints, households without water). These are NOT
  sensor evidence, so evidence fusion ignores them and never counts a complaint twice.
- WATER_SERVICE: intermittent supply, which comes from sensor readings

State is True (raise), False (clear) or None (cannot judge: keep as it is), exactly as in the rules engine."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import fhtc, ml, quality
from . import models as m
from .rules import Finding

ENGINE = "ai-v1"
CLUSTER_ALERT_MIN = 3  # reports from one place before it is worth an alert
NO_WATER_HOUSEHOLDS = 3  # households reporting no or little water in one zone
QUALITY_REPORT_HOUSEHOLDS = 2  # households reporting coloured or smelly water in one zone


def _zone_assets(session: Session) -> dict[str, m.Asset]:
    """One representative pipeline per zone, which zone-level alerts attach to."""
    out: dict[str, m.Asset] = {}
    for a in session.scalars(select(m.Asset).where(m.Asset.type == "pipeline").order_by(m.Asset.ord)):
        out.setdefault(a.service_area_id, a)
    return out


def findings(session: Session, now: datetime) -> list[Finding]:
    out: list[Finding] = []
    zone_asset = _zone_assets(session)
    areas = {a.id: a for a in session.scalars(select(m.ServiceArea))}
    sensors = ml.network_sensors(session)

    def add(rule, kind, severity, asset, state, text, details=None, area_id=None):
        out.append(Finding(rule, kind, severity, asset.id, area_id or asset.service_area_id, None, state, text, {"engine": ENGINE, **(details or {})}))

    # ---- 1. anomaly detection ----
    an = ml.assess_anomaly(session, now)
    if an.get("asset_id"):
        asset = session.get(m.Asset, an["asset_id"])
        state = True if an["status"] == "anomaly" else False if an["status"] == "normal" else None
        add("AI_ANOMALY", "AI_PREDICTION", "HIGH", asset, state, "AI: the network is behaving unusually. " + ("; ".join(an["explanation"]) or "Readings do not match normal operation."),
            {"model": an["model"], "anomaly_index": an.get("index")})

    # ---- 2. forecasts: a reading is on course to leave its normal band ----
    for key, rule in (("tail_pressure", "FORECAST_PRESSURE_BREACH"), ("tank", "FORECAST_TANK_LEVEL")):
        sensor = sensors.get(key)
        if sensor is None:
            continue
        f = ml.forecast_sensor(session, sensor, now)
        node = session.get(m.SensorNode, sensor.node_id)
        asset = session.get(m.Asset, node.asset_id)
        state = None if f["status"] != "ok" else f["level"] == "warning"  # "breach" belongs to the threshold rules
        add(rule, "AI_PREDICTION", "MEDIUM", asset, state, f"AI forecast: {f.get('message') or 'a reading is on course to leave its normal band'}",
            {"model": "Theil-Sen trend", "minutes_to_breach": f.get("minutes_to_breach"), "confidence": f.get("confidence"), "sensor_id": sensor.id})

    # ---- 3. water quality: the chlorine outlook, and failed field tests ----
    for q in ml.quality_outlook(session, now):
        asset = session.get(m.Asset, q["asset_id"])
        add("QUALITY_OUTLOOK_AT_RISK", "WATER_QUALITY", "HIGH", asset, q["level"] == "AT_RISK",
            f"Water-quality risk at the tail of {q['asset_code']}: {'; '.join(q['reasons']) or 'predicted chlorine is very low'}. {q['action']}",
            {"model": "chlorine decay", "predicted_residual_mg_l": q["predicted_residual_mg_l"], "disclaimer": q["disclaimer"]})
        add("QUALITY_OUTLOOK_WATCH", "WATER_QUALITY", "MEDIUM", asset, q["level"] == "WATCH",
            f"Water-quality watch at the tail of {q['asset_code']}: {'; '.join(q['reasons']) or 'predicted chlorine is getting low'}. {q['action']}",
            {"model": "chlorine decay", "predicted_residual_mg_l": q["predicted_residual_mg_l"], "disclaimer": q["disclaimer"]})
    latest = quality.latest_by_point(session)
    points = {p.id: p for p in session.scalars(select(m.WaterQualityPoint))}
    for zid, asset in zone_asset.items():
        status = quality.zone_quality(session, zid)
        zone_tests = [t for t in latest.values() if points[t.point_id].service_area_id == zid or points[t.point_id].type == "tank"]
        failed = sorted({i["label"] for t in zone_tests if t.verdict != "safe" for i in (t.issues or [])})
        add("QUALITY_TEST_UNSAFE", "WATER_QUALITY", "HIGH", asset, status == "unsafe",
            f"Field test failed in {areas[zid].name} ({', '.join(failed) or 'screen failed'}). Advise boiling drinking water and re-test within 48 hours.",
            {"model": "field test kit", "zone": areas[zid].name, "disclaimer": quality.DISCLAIMER}, zid)
        add("QUALITY_TEST_WATCH", "WATER_QUALITY", "MEDIUM", asset, status == "watch",
            f"Field test is borderline in {areas[zid].name} ({', '.join(failed) or 'near a limit'}). Re-test within a week.",
            {"model": "field test kit", "zone": areas[zid].name, "disclaimer": quality.DISCLAIMER}, zid)

    # ---- 4. infrastructure: a pipeline's failure window has passed ----
    for f in ml.failure_outlook(session):
        asset = session.get(m.Asset, f["asset_id"])
        add("FAILURE_DUE", "AI_PREDICTION", "MEDIUM", asset, f["priority"] == "HIGH" and f["timing"] in ("overdue", "due_soon"),
            f"{f['asset_code']} is due for inspection: {f['basis']}", {"model": "repeat-failure interval", "risk_score": f["risk_score"], "timing": f["timing"]})

    # ---- 5. supply regularity ----
    reg = ml.supply_regularity(session, now)
    if reg.get("asset_id"):
        asset = session.get(m.Asset, reg["asset_id"])
        state = None if reg["status"] != "ok" else reg["pattern"] == "intermittent"
        add("INTERMITTENT_SUPPLY", "WATER_SERVICE", "MEDIUM", asset, state, reg.get("message") or "Supply is intermittent.", {"model": reg["model"], "transitions": reg.get("transitions"), "on_pct": reg.get("on_pct")})

    # ---- 6. what villagers report (never counted as sensor evidence) ----
    clustered = {c["asset_id"]: c for c in ml.complaint_clusters(session, now) if c["size"] >= CLUSTER_ALERT_MIN}
    for asset in (a for a in session.scalars(select(m.Asset).where(m.Asset.type == "pipeline")) if a.service_area_id in areas):
        c = clustered.get(asset.id)
        add("COMPLAINT_CLUSTER", "COMMUNITY", "MEDIUM", asset, c is not None,
            f"{c['size']} villager reports within {max(c['radius_m'], 1)} m of {asset.code}: likely a network fault, not separate household problems." if c else "",
            {"model": "DBSCAN", "reports": c["complaint_codes"] if c else [], "coarse_location": c["coarse"] if c else None})
    for area in areas.values():
        asset = zone_asset.get(area.id)
        if asset is None:
            continue
        z = fhtc.assess_zone(session, area, now)
        v = z["validation"]
        short = v["no_water"] + v["low_water"]
        add("HOUSEHOLDS_NO_WATER", "COMMUNITY", "HIGH", asset, short >= NO_WATER_HOUSEHOLDS,
            f"{short} households in {z['name']} report no or too little water today ({v['local_faults']} look like local faults).",
            {"model": "service validation", "no_water": v["no_water"], "low_water": v["low_water"], "reported": v["reported"]}, z["service_area_id"])
        add("HOUSEHOLDS_QUALITY_REPORTS", "WATER_QUALITY", "MEDIUM", asset, v["quality_problems"] >= QUALITY_REPORT_HOUSEHOLDS,
            f"{v['quality_problems']} households in {z['name']} report coloured or smelly water. Collect a field-kit sample there.",
            {"model": "service validation", "quality_problems": v["quality_problems"]}, z["service_area_id"])
    return out
