"""Stage 7 rules engine: explainable, rule-based alerts on live readings.

Order of evaluation:
1. Sensor-health gate. A node that stopped reporting, a sensor sending impossible values, a stuck sensor,
   or two sensors that contradict each other raise EQUIPMENT_HEALTH alerts, and those sensors are excluded.
2. Water rules on the remaining (trusted) sensors only, and only during scheduled supply.

Every rule needs PERSIST consecutive readings to raise an alert and PERSIST consecutive readings to clear it,
so a single noisy value neither raises nor clears anything (hysteresis). Thresholds are explicit and tunable;
they are starting values for the bench rig, not field-validated settings.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config, integrations
from . import models as m

IST = timezone(timedelta(hours=5, minutes=30))
ENGINE = "rules-v1"
PERSIST = 3  # consecutive readings needed to raise or clear
STUCK_READINGS = 6  # identical non-zero values in a row => stuck sensor

THRESHOLDS = {
    "pump_off_current_a": 0.3,  # below this the pump is not running
    "no_flow_lpm": 2.0,  # below this there is effectively no flow
    "inconsistent_flow_lpm": 5.0,  # flow above this with the pump off is physically inconsistent
    "flow_gap_min_lpm": 8.0,  # head minus tail flow above max(this, fraction x head) suggests a leak
    "flow_gap_fraction": 0.15,
    "acoustic_leak_ratio": 1.6,  # acoustic level above this multiple of its normal level suggests leak noise
    "flow_gap_min_head_lpm": 10.0,  # only judge the gap when water is actually being sent
}


@dataclass
class Finding:
    """The current state of one rule for one asset/sensor: True raise, False clear, None unknown (keep as is)."""

    rule_code: str
    kind: str  # WATER_SERVICE | EQUIPMENT_HEALTH
    severity: str
    asset_id: str
    service_area_id: str
    sensor_id: str | None
    state: bool | None
    text: str = ""
    details: dict = field(default_factory=dict)

    @property
    def key(self) -> tuple:
        return (self.rule_code, self.asset_id, self.sensor_id)


def _iso(dt: datetime) -> str:
    return dt.astimezone(IST).isoformat(timespec="seconds")


def _latest(session: Session, sensor_id: str, n: int) -> list[m.Reading]:
    """The n most recent readings, newest first."""
    return list(
        session.scalars(
            select(m.Reading).where(m.Reading.sensor_id == sensor_id).order_by(m.Reading.ts.desc(), m.Reading.id.desc()).limit(n)
        )
    )


def _persist(values: list[float], pred) -> bool | None:
    if len(values) < PERSIST:
        return None
    hits = [pred(v) for v in values[:PERSIST]]
    return True if all(hits) else False if not any(hits) else None


def in_supply_window(session: Session, service_area_id: str, now: datetime) -> bool:
    if config.DEMO_SUPPLY_ALWAYS_ON:
        return True
    sched = session.scalars(select(m.SupplySchedule).where(m.SupplySchedule.service_area_id == service_area_id)).first()
    if sched is None:
        return False
    hhmm = now.astimezone(IST).strftime("%H:%M")
    return any(start <= hhmm < end for start, end in sched.windows)


def _sensor(session: Session, kind: str, position: str | None = None) -> m.Sensor | None:
    stmt = select(m.Sensor).where(m.Sensor.kind == kind)
    if position:
        stmt = stmt.where(m.Sensor.position == position)
    return session.scalars(stmt).first()


def check(session: Session, now: datetime) -> list[Finding]:
    findings: list[Finding] = []
    nodes = {n.id: n for n in session.scalars(select(m.SensorNode))}
    sensors = list(session.scalars(select(m.Sensor)))
    asset_area = {a.id: a.service_area_id for a in session.scalars(select(m.Asset))}
    names = {s.id: f"{nodes[s.node_id].code} {(s.position + ' ') if s.position else ''}{s.kind.replace('_', ' ')}" for s in sensors}
    data_note = "simulated sensor nodes" if all(n.is_simulated for n in nodes.values()) else "sensor nodes"
    trusted: set[str] = set()
    faulty: set[str] = set()  # sensors with a confirmed fault (stuck, impossible value, contradiction)

    # ---- 1. sensor-health gate ----
    for node in nodes.values():
        area = asset_area[node.asset_id]
        if node.last_seen_at is None:
            state, age = None, None  # never reported: nothing to judge yet
        else:
            age = round((now - datetime.fromisoformat(node.last_seen_at)).total_seconds())
            state = age > config.NODE_OFFLINE_AFTER_SECONDS
        findings.append(
            Finding(
                "NODE_OFFLINE", "EQUIPMENT_HEALTH", "MEDIUM", node.asset_id, area, None, state,
                f"{node.code} has not reported for {age} s. Check power, battery or antenna. This is an equipment alert, not a water-supply alert.",
                {"node_id": node.id, "seconds_since": age, "offline_after_seconds": config.NODE_OFFLINE_AFTER_SECONDS},
            )
        )
        if state is not False:
            continue  # offline or never reported: its sensors are not trusted
        for s in (x for x in sensors if x.node_id == node.id):
            recent = _latest(session, s.id, STUCK_READINGS)
            if not recent:
                continue
            bad_value = recent[0].quality_flag == "out_of_range"
            findings.append(
                Finding(
                    "SENSOR_OUT_OF_RANGE", "EQUIPMENT_HEALTH", "MEDIUM", node.asset_id, area, s.id, bad_value,
                    f"{names[s.id]} reported an impossible value ({recent[0].value} {s.unit}). Check the sensor; its readings are ignored.",
                    {"value": recent[0].value, "unit": s.unit},
                )
            )
            stuck = None
            if len(recent) == STUCK_READINGS:
                vals = {r.value for r in recent}
                stuck = len(vals) == 1 and recent[0].value != 0
            findings.append(
                Finding(
                    "SENSOR_STUCK", "EQUIPMENT_HEALTH", "MEDIUM", node.asset_id, area, s.id, stuck,
                    f"{names[s.id]} has reported exactly {recent[0].value} {s.unit} {STUCK_READINGS} times in a row; it may be stuck. Its readings are ignored.",
                    {"value": recent[0].value, "readings": STUCK_READINGS},
                )
            )
            if not bad_value and not stuck:
                trusted.add(s.id)
            else:
                faulty.add(s.id)

    pump = _sensor(session, "pump_current")
    head_flow = _sensor(session, "flow", "head")
    tail_flow = _sensor(session, "flow", "tail")
    tail_pressure = _sensor(session, "pressure", "tail")
    values = {s.id: [r.value for r in _latest(session, s.id, PERSIST)] for s in (pump, head_flow, tail_flow, tail_pressure) if s}

    # Physically inconsistent pair: water flowing while the pump draws no current.
    if pump and head_flow and pump.id in trusted and head_flow.id in trusted:
        pairs = list(zip(values[pump.id], values[head_flow.id]))
        state = _persist(pairs, lambda p: p[0] < THRESHOLDS["pump_off_current_a"] and p[1] > THRESHOLDS["inconsistent_flow_lpm"])
        node = nodes[head_flow.node_id]
        findings.append(
            Finding(
                "SENSOR_INCONSISTENT", "EQUIPMENT_HEALTH", "MEDIUM", node.asset_id, asset_area[node.asset_id], head_flow.id, state,
                (f"Head flow is {pairs[0][1]:.1f} L/min while the pump draws {pairs[0][0]:.1f} A. That cannot both be true, so one sensor is faulty. "
                 "Both are ignored by the water rules until this clears.") if pairs else "",
                {"pump_current_a": pairs[0][0] if pairs else None, "head_flow_lpm": pairs[0][1] if pairs else None},
            )
        )
        if state:
            trusted -= {pump.id, head_flow.id}
            faulty |= {pump.id, head_flow.id}

    # ---- 2. water rules (trusted sensors, scheduled supply only) ----
    def water(rule, asset_id, sensor, needed, pred_state, text, details):
        area = asset_area[asset_id]
        if any(s is not None and s.id in faulty for s in needed):
            # The evidence came from a sensor now known to be faulty: withdraw any alert built on it.
            state, details = False, {**details, "clear_reason": "withdrawn: depends on a faulty sensor"}
        elif any(s is None or s.id not in trusted for s in needed):
            state = None  # node offline or no data yet: cannot judge, keep the last known state
        elif not in_supply_window(session, area, now):
            state = False  # outside supply hours, low flow is expected
        else:
            state = pred_state
        supply = "demo: supply treated as always on" if config.DEMO_SUPPLY_ALWAYS_ON else "scheduled supply window"
        findings.append(
            Finding(rule, "WATER_SERVICE", "HIGH", asset_id, area, sensor.id if sensor else None, state, text,
                    {**details, "supply_window": supply, "persist_readings": PERSIST, "data": data_note})
        )

    if pump:
        v = values.get(pump.id, [])
        water("PUMP_OFF_IN_SUPPLY", nodes[pump.node_id].asset_id, pump, [pump],
              _persist(v, lambda x: x < THRESHOLDS["pump_off_current_a"]),
              f"Pump current is {v[0]:.1f} A: the pump appears stopped during scheduled supply." if v else "",
              {"pump_current_a": v[0] if v else None, "threshold_a": THRESHOLDS["pump_off_current_a"]})

    if head_flow and tail_flow and tail_pressure:
        tail_asset = nodes[tail_pressure.node_id].asset_id
        pairs = list(zip(values.get(head_flow.id, []), values.get(tail_flow.id, [])))
        water("NO_FLOW_IN_SUPPLY", tail_asset, tail_flow, [head_flow, tail_flow],
              _persist(pairs, lambda p: p[0] < THRESHOLDS["no_flow_lpm"] and p[1] < THRESHOLDS["no_flow_lpm"]),
              "No flow at the tank outlet or at the tail of P-21 during scheduled supply.",
              {"head_flow_lpm": pairs[0][0] if pairs else None, "tail_flow_lpm": pairs[0][1] if pairs else None})

        def gap(p):
            head, tail = p
            return head > THRESHOLDS["flow_gap_min_head_lpm"] and head - tail > max(THRESHOLDS["flow_gap_min_lpm"], THRESHOLDS["flow_gap_fraction"] * head)

        water("HEAD_TAIL_FLOW_GAP", tail_asset, tail_flow, [head_flow, tail_flow], _persist(pairs, gap),
              (f"{pairs[0][0]:.0f} L/min leaves the tank but only {pairs[0][1]:.0f} L/min reaches the tail of P-21: "
               "possible leak or open branch between them.") if pairs else "",
              {"head_flow_lpm": pairs[0][0] if pairs else None, "tail_flow_lpm": pairs[0][1] if pairs else None,
               "gap_lpm": round(pairs[0][0] - pairs[0][1], 1) if pairs else None})

        tp = values.get(tail_pressure.id, [])
        water("TAIL_PRESSURE_LOW_IN_SUPPLY", tail_asset, tail_pressure, [tail_pressure],
              _persist(tp, lambda x: x < tail_pressure.band_low),
              (f"Tail pressure {tp[0]:.2f} bar is below the normal band ({tail_pressure.band_low}–{tail_pressure.band_high} bar) "
               f"for {PERSIST} readings during supply.") if tp else "",
              {"tail_pressure_bar": tp[0] if tp else None, "normal_band": [tail_pressure.band_low, tail_pressure.band_high],
               "baseline_bar": tail_pressure.baseline})

    # Acoustic leak signature: a piezo clamp on the pipe hears the hiss of escaping water. A reading well above the
    # sensor's own normal level, held for PERSIST readings during supply, is leak evidence that is independent of flow.
    for pos in ("head", "tail"):
        ac = _sensor(session, "acoustic", pos)
        if ac is None or tail_pressure is None:
            continue
        tail_asset = nodes[tail_pressure.node_id].asset_id
        av = [r.value for r in _latest(session, ac.id, PERSIST)]
        ratio = (av[0] / ac.baseline) if av and ac.baseline else None
        water("ACOUSTIC_LEAK_SIGNATURE", tail_asset, ac, [ac],
              _persist(av, lambda x, base=ac.baseline: x > THRESHOLDS["acoustic_leak_ratio"] * base),
              (f"Acoustic sensor at the {pos} of P-21 reads {av[0]:.0f} {ac.unit}, {ratio:.1f}x its normal level: leak noise on the pipe.") if av else "",
              {"acoustic_mv": av[0] if av else None, "baseline_mv": ac.baseline, "ratio": round(ratio, 2) if ratio else None, "position": pos})

    from . import ai_alerts  # local import: ai_alerts builds the Finding objects defined above

    return findings + ai_alerts.findings(session, now)


def _next_alert_id(session: Session) -> str:
    nums = [int(a[3:]) for a in session.scalars(select(m.Alert.id)) if a.startswith("AL-") and a[3:].isdigit()]
    return f"AL-{max([99, *nums]) + 1}"


def evaluate(session: Session, now: datetime | None = None) -> dict:
    """Bring live alerts in line with the current findings. Idempotent: calling it twice changes nothing."""
    now = now or datetime.now(IST)
    open_alerts = {
        (a.rule_code, a.asset_id, a.sensor_id): a
        for a in session.scalars(select(m.Alert).where(m.Alert.is_simulated.is_(False), m.Alert.cleared_at.is_(None)))
    }
    raised, cleared = [], []
    for f in check(session, now):
        current = open_alerts.get(f.key)
        if f.state and current is None:
            alert = m.Alert(
                id=_next_alert_id(session), ord=1000 + session.query(m.Alert).count(), kind=f.kind, rule_code=f.rule_code,
                severity=f.severity, asset_id=f.asset_id, sensor_id=f.sensor_id, service_area_id=f.service_area_id,
                raised_at=_iso(now), details={"engine": ENGINE, **f.details}, text=f.text, is_simulated=False,
            )
            session.add(alert)
            session.flush()
            raised.append(alert.id)
            integrations.on_alert(session, alert, "OPEN", now)
        elif f.state and current is not None:
            current.text, current.details = f.text, {"engine": ENGINE, **f.details}  # keep the latest numbers
        elif f.state is False and current is not None:
            current.cleared_at = _iso(now)
            current.details = {**(current.details or {}), "cleared_reason": f.details.get("clear_reason", "condition no longer present")}
            cleared.append(current.id)
            integrations.on_alert(session, current, "CLEARED", now)
    session.commit()
    return {"raised": raised, "cleared": cleared}
