"""The Alert Center: every kind of alert in one feed, with acknowledgement and escalation.

Kinds: WATER_SERVICE (supply, pressure, leaks), EQUIPMENT_HEALTH (a sensor or node is faulty), AI_PREDICTION (the models
expect something), WATER_QUALITY (a failed field test or a chlorine risk) and COMMUNITY (villagers' reports)."""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import integrations, rules
from . import models as m
from .auth import CurrentUser, require_roles, village_ids_of
from .db import get_session

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(get_session)]
IST = timezone(timedelta(hours=5, minutes=30))
KINDS = ("WATER_SERVICE", "EQUIPMENT_HEALTH", "AI_PREDICTION", "WATER_QUALITY", "COMMUNITY")
SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
ESCALATE_AFTER = timedelta(minutes=30)  # a HIGH alert nobody has acknowledged this long is shown to the officers too

KIND_LABEL = {
    "WATER_SERVICE": "Water service", "EQUIPMENT_HEALTH": "Equipment", "AI_PREDICTION": "AI prediction",
    "WATER_QUALITY": "Water quality", "COMMUNITY": "Community reports",
}


def _now() -> datetime:
    return datetime.now(IST)


def _out(session: Session, a: m.Alert, now: datetime, names: dict[str, str]) -> dict:
    asset = session.get(m.Asset, a.asset_id)
    area = session.get(m.ServiceArea, a.service_area_id)
    raised = datetime.fromisoformat(a.raised_at)
    end = datetime.fromisoformat(a.cleared_at) if a.cleared_at else now
    escalated = a.cleared_at is None and a.acknowledged_at is None and a.severity in ("HIGH", "CRITICAL") and now - raised >= ESCALATE_AFTER
    return {
        "id": a.id, "kind": a.kind, "kind_label": KIND_LABEL.get(a.kind, a.kind), "rule_code": a.rule_code, "severity": a.severity,
        "status": "CLEARED" if a.cleared_at else "OPEN", "text": a.text, "asset_id": a.asset_id, "asset_code": asset.code, "service_area_id": a.service_area_id,
        "zone": area.name, "village_id": area.village_id, "sujal_gaon_id": area.sujal_gaon_id, "raised_at": a.raised_at, "cleared_at": a.cleared_at,
        "age_minutes": round((end - raised).total_seconds() / 60), "acknowledged_at": a.acknowledged_at,
        "acknowledged_by": names.get(a.acknowledged_by) if a.acknowledged_by else None, "escalated": escalated,
        "details": {k: v for k, v in (a.details or {}).items() if k != "engine"} | {"engine": (a.details or {}).get("engine")},
    }


@router.get("/alerts/feed")
def feed(
    user: CurrentUser,
    session: DB,
    status: Annotated[str, Query(pattern="^(open|cleared|all)$")] = "open",
    kind: Annotated[str | None, Query()] = None,
    escalated: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=300)] = 100,
):
    """Alerts for the user's villages, most urgent first. Re-evaluates first, so the feed is current."""
    require_roles(user, "gp", "officer")
    if kind is not None and kind not in KINDS:
        raise HTTPException(422, f"kind must be one of {', '.join(KINDS)}")
    rules.evaluate(session)
    now = _now()
    areas = select(m.ServiceArea.id).where(m.ServiceArea.village_id.in_(village_ids_of(user)))
    stmt = select(m.Alert).where(m.Alert.is_simulated.is_(False), m.Alert.service_area_id.in_(areas))
    if status == "open":
        stmt = stmt.where(m.Alert.cleared_at.is_(None))
    elif status == "cleared":
        stmt = stmt.where(m.Alert.cleared_at.is_not(None))
    if kind:
        stmt = stmt.where(m.Alert.kind == kind)
    names = {u.id: u.display_name for u in session.scalars(select(m.User))}
    rows = [_out(session, a, now, names) for a in session.scalars(stmt)]
    if escalated:
        rows = [r for r in rows if r["escalated"]]
    rows.sort(key=lambda r: (r["status"] != "OPEN", r["acknowledged_at"] is not None, SEVERITY_ORDER.get(r["severity"], 9), r["raised_at"]))
    everything = [_out(session, a, now, names) for a in session.scalars(select(m.Alert).where(m.Alert.is_simulated.is_(False), m.Alert.service_area_id.in_(areas), m.Alert.cleared_at.is_(None)))]
    return {
        "alerts": rows[:limit],
        "counts": {
            "open": len(everything), "unacknowledged": sum(1 for r in everything if not r["acknowledged_at"]), "escalated": sum(1 for r in everything if r["escalated"]),
            "high": sum(1 for r in everything if r["severity"] in ("HIGH", "CRITICAL")), "by_kind": {k: sum(1 for r in everything if r["kind"] == k) for k in KINDS},
        },
        "kinds": [{"id": k, "label": KIND_LABEL[k]} for k in KINDS],
    }


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge(alert_id: str, user: CurrentUser, session: DB):
    """Record that someone has seen an alert. It stays open until its condition clears; acknowledging twice changes nothing."""
    require_roles(user, "gp", "officer")
    a = session.get(m.Alert, alert_id)
    area = session.get(m.ServiceArea, a.service_area_id) if a else None
    if a is None or a.is_simulated or area.village_id not in village_ids_of(user):
        raise HTTPException(404, f"Unknown alert {alert_id}")
    if a.cleared_at:
        raise HTTPException(409, f"Alert {alert_id} has already cleared")
    if a.acknowledged_at is None:
        now = _now().isoformat(timespec="seconds")
        a.acknowledged_by, a.acknowledged_at = user.id, now
        session.add(m.AuditLog(at=now, actor_id=user.id, action="acknowledge", entity="alert", entity_id=a.id, details={"rule": a.rule_code, "severity": a.severity}))
        integrations.on_alert(session, a, "ACKNOWLEDGED")
        session.commit()
    names = {u.id: u.display_name for u in session.scalars(select(m.User))}
    return _out(session, a, _now(), names)
