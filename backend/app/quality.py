"""Water-quality field tests (field test kits, FTK) judged against IS 10500:2012 limits.

JJM trains local women testers in every village to screen drinking water with field test kits. A kit is a
screening tool: a "safe" verdict means the sample passed the screen, not that the water is certified. Failed
screens raise an alert, send a boil-water advisory to the villagers of that zone, and request a confirmatory
sample through the (mock) WQMIS connector.

The limits mirror frontend/src/data/quality.js, which is still used to show verdicts when the backend is off."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m

IST = timezone(timedelta(hours=5, minutes=30))

# kind: presence | min | range | limits
PARAMS = {
    "bacteria": {"label": "Bacteria (H2S vial)", "unit": "", "kind": "presence"},
    "chlorine": {"label": "Residual chlorine", "unit": "mg/L", "kind": "min", "min": 0.2, "bounds": (0, 10)},
    "ph": {"label": "pH", "unit": "", "kind": "range", "range": (6.5, 8.5), "bounds": (0, 14)},
    "turbidity": {"label": "Turbidity", "unit": "NTU", "kind": "limits", "acceptable": 1, "permissible": 5, "bounds": (0, 1000)},
    "tds": {"label": "Total dissolved solids", "unit": "mg/L", "kind": "limits", "acceptable": 500, "permissible": 2000, "bounds": (0, 50000)},
    "fluoride": {"label": "Fluoride", "unit": "mg/L", "kind": "limits", "acceptable": 1.0, "permissible": 1.5, "bounds": (0, 50)},
    "nitrate": {"label": "Nitrate", "unit": "mg/L", "kind": "limits", "acceptable": 45, "permissible": 45, "bounds": (0, 1000)},
    "iron": {"label": "Iron", "unit": "mg/L", "kind": "limits", "acceptable": 0.3, "permissible": 0.3, "bounds": (0, 100)},
}
RANK = {"safe": 0, "untested": 0, "watch": 1, "unsafe": 2}
STANDARD = "IS 10500:2012 (acceptable and permissible limits)"
DISCLAIMER = "A field test kit is a screening tool, not a laboratory certificate. Confirm a failed result with a repeat or lab test."


def worse(a: str, b: str) -> str:
    return b if RANK[b] > RANK[a] else a


def judge(param_id: str, value, raw: bool = False) -> str | None:
    """'safe' | 'watch' | 'unsafe' for one measured value, or None when it was not measured."""
    if value is None or value == "":
        return None
    p = PARAMS[param_id]
    if p["kind"] == "presence":
        return "unsafe" if value == "present" else "safe"
    v = float(value)
    if p["kind"] == "min":
        # Raw source water is not chlorinated yet, so chlorine is judged only at the tank and the taps.
        return "safe" if raw else "safe" if v >= p["min"] else "watch" if v > 0 else "unsafe"
    if p["kind"] == "range":
        return "safe" if p["range"][0] <= v <= p["range"][1] else "watch"
    if v <= p["acceptable"]:
        return "safe"
    return "watch" if v <= p["permissible"] else "unsafe"


def verdict(point_type: str, values: dict) -> tuple[str, list[dict]]:
    """The overall verdict for one test and the parameters that caused it."""
    raw = point_type == "source"
    status, issues = "safe", []
    for pid, p in PARAMS.items():
        level = judge(pid, values.get(pid), raw)
        if level and level != "safe":
            issues.append({"param": pid, "label": p["label"], "unit": p["unit"], "value": values.get(pid), "level": level})
        if level:
            status = worse(status, level)
    return status, issues


def validate_values(values: dict) -> dict:
    """Keep only known parameters with sensible values; raise ValueError with a plain message otherwise."""
    clean = {}
    for pid, raw in values.items():
        if pid not in PARAMS:
            raise ValueError(f"Unknown test parameter '{pid}'")
        if raw is None or raw == "":
            continue
        p = PARAMS[pid]
        if p["kind"] == "presence":
            if raw not in ("present", "absent"):
                raise ValueError("Bacteria must be 'present' or 'absent'")
            clean[pid] = raw
            continue
        try:
            v = float(raw)
        except (TypeError, ValueError) as err:
            raise ValueError(f"{p['label']} must be a number") from err
        lo, hi = p["bounds"]
        if not lo <= v <= hi:
            raise ValueError(f"{p['label']} must be between {lo} and {hi}")
        clean[pid] = v
    if not clean:
        raise ValueError("Enter at least one measurement")
    return clean


def latest_by_point(session: Session) -> dict[str, m.WaterQualityTest]:
    """The most recent test at each point (ties broken by the order they were logged)."""
    rows = session.scalars(select(m.WaterQualityTest).order_by(m.WaterQualityTest.date, m.WaterQualityTest.ord))
    return {t.point_id: t for t in rows}


def zone_quality(session: Session, zone_id: str) -> str:
    """Worst of the latest tap tests in the zone and the tank (treated water): safe | watch | unsafe | untested."""
    points = {p.id: p for p in session.scalars(select(m.WaterQualityPoint))}
    latest = latest_by_point(session)
    relevant = [t for t in latest.values() if points[t.point_id].type == "tank" or points[t.point_id].service_area_id == zone_id]
    if not any(points[t.point_id].service_area_id == zone_id for t in relevant):
        return "untested"
    status = "safe"
    for t in relevant:
        status = worse(status, t.verdict)
    return status


def zone_summary(session: Session, zone_id: str) -> dict:
    """What a villager sees for their zone: the status and when it was last tested. No parameter values."""
    points = {p.id: p for p in session.scalars(select(m.WaterQualityPoint))}
    status = zone_quality(session, zone_id)
    dates = [t.date for t in latest_by_point(session).values() if points[t.point_id].service_area_id == zone_id]
    return {"service_area_id": zone_id, "status": status, "last_tested": max(dates) if dates else None, "disclaimer": DISCLAIMER}


def test_out(t: m.WaterQualityTest, point: m.WaterQualityPoint) -> dict:
    return {
        "id": t.id, "point_id": t.point_id, "point": point.label, "point_type": point.type, "service_area_id": point.service_area_id,
        "date": t.date, "tester": t.tester, "values": t.values, "verdict": t.verdict, "issues": t.issues or [], "is_mock": t.is_mock,
        "created_at": t.created_at,
    }


# ---------- advisories ----------

ADVISORY_BOIL = "advisory.boil_water"
ADVISORY_CLEARED = "advisory.cleared"


def advise(session: Session, point: m.WaterQualityPoint, previous: str | None, status: str, at: datetime) -> int:
    """Tell the villagers of a zone to boil water after a failed tap test, and when a later test passes again.
    Never sends the same advisory twice in a day."""
    if point.type != "tap" or not point.service_area_id:
        return 0
    key = ADVISORY_BOIL if status == "unsafe" else ADVISORY_CLEARED if previous == "unsafe" and status != "unsafe" else None
    if key is None:
        return 0
    day_start = at.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds")
    sent = 0
    for u in session.scalars(select(m.User).where(m.User.role == "citizen", m.User.service_area_id == point.service_area_id)):
        dup = session.scalars(select(m.Notification).where(m.Notification.user_id == u.id, m.Notification.message_key == key, m.Notification.at >= day_start)).first()
        if dup is None:
            session.add(m.Notification(ord=1000 + session.query(m.Notification).count(), user_id=u.id, complaint_code="", at=at.astimezone(IST).isoformat(timespec="seconds"), message_key=key, is_live=True))
            session.flush()
            sent += 1
    return sent


def today() -> str:
    return date.today().isoformat()


def now() -> datetime:
    return datetime.now(IST)
