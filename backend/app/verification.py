"""Stage 10: restoration verification from live readings, and citizen notifications.

A recorded repair does not close an incident. The tail sensors on the repaired pipeline must show normal
pressure AND normal flow for REQUIRED_WINDOWS consecutive supply windows after the repair. Each window is:
- PASSED: enough trusted readings, and at least VERIFY_IN_BAND_SHARE of each sensor's readings in its normal band
- FAILED: enough readings, but pressure or flow stayed outside the band (the problem may not be fixed)
- INCONCLUSIVE: too few readings, or a sensor fault on the node during the window (never counted as a pass)
A FAILED or INCONCLUSIVE window resets the count. Pipelines without tail sensors cannot be sensor-verified;
the Gram Panchayat may close them as "Resolved — not sensor-verified", and the record says so.

Readings are indicators of supply, not a water-quality or safety certification.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from . import models as m

IST = timezone(timedelta(hours=5, minutes=30))
REQUIRED_WINDOWS = 2
SENSOR_RULE = f"Tail pressure and tail flow stay within their normal bands for {REQUIRED_WINDOWS} consecutive supply windows after the repair"
MANUAL_RULE = "No sensor covers this pipeline: the Gram Panchayat confirms restoration, recorded as not sensor-verified"
OPEN_RESULTS = ("PENDING", "RESTORATION_UNCONFIRMED")
MAX_WINDOWS_PER_CHECK = 500  # bounds the work done in one call after a long gap

# What each villager is told, as i18n keys. In-app only in the prototype.
NOTIFY = {
    "being_checked": "complaint.being_checked",
    "repair_started": "complaint.repair_started",
    "restored_verified": "complaint.restored_verified",
    "resolved_unverified": "complaint.resolved_unverified",
}


def _iso(dt: datetime) -> str:
    return dt.astimezone(IST).isoformat(timespec="seconds")


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts)


def tail_sensors(session: Session, asset_id: str) -> tuple[m.Sensor, m.Sensor] | None:
    """The tail pressure and tail flow sensors on a pipeline, or None if it has no such sensors."""
    node_ids = select(m.SensorNode.id).where(m.SensorNode.asset_id == asset_id)
    sensors = session.scalars(select(m.Sensor).where(m.Sensor.node_id.in_(node_ids), m.Sensor.position == "tail")).all()
    by_kind = {s.kind: s for s in sensors}
    if "pressure" in by_kind and "flow" in by_kind:
        return by_kind["pressure"], by_kind["flow"]
    return None


def notify(session: Session, incident_code: str, what: str, at: str) -> int:
    """Tell every villager whose report is grouped under the incident. Never sends the same message twice."""
    key = NOTIFY[what]
    sent = 0
    for c in session.scalars(select(m.Complaint).where(m.Complaint.incident_code == incident_code)):
        exists = session.scalars(
            select(m.Notification).where(m.Notification.complaint_code == c.public_code, m.Notification.user_id == c.citizen_id, m.Notification.message_key == key)
        ).first()
        if exists is None:
            session.add(m.Notification(ord=1000 + session.query(m.Notification).count(), user_id=c.citizen_id, complaint_code=c.public_code, at=at, message_key=key, is_live=True))
            session.flush()
            sent += 1
    return sent


def start(session: Session, inc: m.Incident, repaired_at: str) -> m.Verification:
    """Called when the repair is recorded. Sensor verification if the pipeline has tail sensors, else manual."""
    sensors = tail_sensors(session, inc.asset_id)
    v = m.Verification(
        incident_code=inc.code, method="sensor_window" if sensors else "manual", rule=SENSOR_RULE if sensors else MANUAL_RULE,
        result="PENDING", verified_at=None, is_simulated=False, started_at=repaired_at,
        window_seconds=config.VERIFY_WINDOW_SECONDS if config.DEMO_SUPPLY_ALWAYS_ON else None, checked_until=repaired_at,
    )
    session.add(v)
    return v


def _windows(session: Session, v: m.Verification, inc: m.Incident, now: datetime) -> list[tuple[datetime, datetime]]:
    """Windows that have ended since checked_until, oldest first. Readings count from the second after the
    repair, so values logged in the same second as the repair (still the old fault) are never included."""
    started, after = _parse(v.started_at), _parse(v.checked_until or v.started_at)
    first = started + timedelta(seconds=1)
    out = []
    if v.window_seconds:
        step = timedelta(seconds=v.window_seconds)
        k = int((after - started) / step)
        while len(out) < MAX_WINDOWS_PER_CHECK:
            ws = started + k * step
            we = ws + step
            if we > now:
                break
            if we > after:
                out.append((max(ws, first), we))
            k += 1
        return out
    sched = session.scalars(select(m.SupplySchedule).where(m.SupplySchedule.service_area_id == inc.service_area_id)).first()
    if sched is None:
        return out
    day = after.astimezone(IST).date()
    while day <= now.astimezone(IST).date() and len(out) < MAX_WINDOWS_PER_CHECK:
        for s, e in sched.windows:
            ws = datetime.fromisoformat(f"{day.isoformat()}T{s}:00").replace(tzinfo=IST)
            we = datetime.fromisoformat(f"{day.isoformat()}T{e}:00").replace(tzinfo=IST)
            if we <= started or we <= after or we > now:
                continue
            out.append((max(ws, first), we))
        day += timedelta(days=1)
    return out


def _sensor_fault(session: Session, asset_id: str, ws: str, we: str) -> m.Alert | None:
    """An equipment-health alert on this pipeline's sensors that overlapped the window."""
    rows = session.scalars(
        select(m.Alert).where(m.Alert.kind == "EQUIPMENT_HEALTH", m.Alert.is_simulated.is_(False), m.Alert.asset_id == asset_id, m.Alert.raised_at < we)
    ).all()
    return next((a for a in rows if a.cleared_at is None or a.cleared_at > ws), None)


def judge_window(session: Session, inc: m.Incident, pressure: m.Sensor, flow: m.Sensor, ws: str, we: str) -> dict | None:
    """The result of one window, or None when it holds no readings at all and supply is simulated
    (the simulator was simply not running, so there is nothing to judge)."""

    def values(s: m.Sensor) -> list[float]:
        rows = session.scalars(
            select(m.Reading.value).where(m.Reading.sensor_id == s.id, m.Reading.ts >= ws, m.Reading.ts < we, m.Reading.quality_flag == "ok")
        ).all()
        return list(rows)

    p, f = values(pressure), values(flow)
    if not p and not f and config.DEMO_SUPPLY_ALWAYS_ON:
        return None
    count = min(len(p), len(f))
    mean = lambda xs: round(sum(xs) / len(xs), 2) if xs else None  # noqa: E731
    out = {"start": ws, "end": we, "tail_pressure_mean_bar": mean(p), "tail_flow_mean_lpm": mean(f), "readings": count}

    fault = _sensor_fault(session, inc.asset_id, ws, we)
    if fault is not None:
        return {**out, "result": "INCONCLUSIVE", "reason": f"Sensor fault during the window ({fault.rule_code.replace('_', ' ').lower()}); readings not trusted"}
    if count < config.VERIFY_MIN_READINGS:
        return {**out, "result": "INCONCLUSIVE", "reason": f"Only {count} readings (need {config.VERIFY_MIN_READINGS} from each tail sensor)"}

    def share(xs: list[float], s: m.Sensor) -> float:
        return sum(s.band_low <= x <= s.band_high for x in xs) / len(xs)

    sp, sf = share(p, pressure), share(f, flow)
    problems = []
    if sp < config.VERIFY_IN_BAND_SHARE:
        problems.append(f"tail pressure in band only {sp:.0%} of the time (mean {out['tail_pressure_mean_bar']} bar, band {pressure.band_low}–{pressure.band_high})")
    if sf < config.VERIFY_IN_BAND_SHARE:
        problems.append(f"tail flow in band only {sf:.0%} of the time (mean {out['tail_flow_mean_lpm']} L/min, band {flow.band_low:g}–{flow.band_high:g})")
    if problems:
        return {**out, "result": "FAILED", "reason": "; ".join(problems).capitalize()}
    return {**out, "result": "PASSED", "reason": f"Pressure {sp:.0%} and flow {sf:.0%} of readings within normal bands"}


def check(session: Session, v: m.Verification, now: datetime | None = None) -> m.Verification:
    """Judge every window that has ended since the last check, then settle the result. Idempotent."""
    if v.method != "sensor_window" or v.result not in OPEN_RESULTS:
        return v
    now = now or datetime.now(IST)
    inc = session.get(m.Incident, v.incident_code)
    sensors = tail_sensors(session, inc.asset_id)
    if sensors is None:
        return v
    existing = session.query(m.VerificationWindow).filter_by(incident_code=v.incident_code).count()
    windows = _windows(session, v, inc, now)
    for ws, we in windows:
        result = judge_window(session, inc, *sensors, _iso(ws), _iso(we))
        if result is not None:
            session.add(m.VerificationWindow(ord=existing, incident_code=v.incident_code, **result))
            existing += 1
        v.checked_until = _iso(we)
    session.flush()

    in_row = 0
    rows = session.scalars(select(m.VerificationWindow).where(m.VerificationWindow.incident_code == v.incident_code).order_by(m.VerificationWindow.ord)).all()
    for w in rows:
        in_row = in_row + 1 if w.result == "PASSED" else 0
        if in_row >= REQUIRED_WINDOWS:
            v.result, v.verified_at = "VERIFIED_RESTORED", w.end
            inc.status, inc.closed_at = "VERIFIED_RESTORED", w.end
            notify(session, inc.code, "restored_verified", w.end)
            break
    else:
        if rows and rows[-1].result == "FAILED":
            v.result = "RESTORATION_UNCONFIRMED"
        elif v.result == "RESTORATION_UNCONFIRMED" and rows and rows[-1].result == "PASSED":
            v.result = "PENDING"  # recovering again; still needs consecutive passes
    session.commit()
    return v


def check_open(session: Session, now: datetime | None = None) -> list[str]:
    """Check every open sensor verification. Returns the incidents that became verified."""
    done = []
    for v in session.scalars(select(m.Verification).where(m.Verification.method == "sensor_window", m.Verification.result.in_(OPEN_RESULTS))).all():
        if check(session, v, now).result == "VERIFIED_RESTORED":
            done.append(v.incident_code)
    return done


def progress(session: Session, v: m.Verification, now: datetime | None = None) -> dict:
    """How far verification has got: consecutive passes so far and the window now in progress (demo slots only)."""
    rows = session.scalars(select(m.VerificationWindow).where(m.VerificationWindow.incident_code == v.incident_code).order_by(m.VerificationWindow.ord)).all()
    in_row = 0
    for w in rows:
        in_row = in_row + 1 if w.result == "PASSED" else 0
    out = {"required_windows": REQUIRED_WINDOWS, "passed_in_row": min(in_row, REQUIRED_WINDOWS), "current_window": None}
    if v.result in OPEN_RESULTS and v.method == "sensor_window" and v.window_seconds and v.started_at:
        now = now or datetime.now(IST)
        started, step = _parse(v.started_at), timedelta(seconds=v.window_seconds)
        k = max(0, int((now - started) / step))
        out["current_window"] = {"start": _iso(started + k * step), "end": _iso(started + (k + 1) * step)}
    return out
