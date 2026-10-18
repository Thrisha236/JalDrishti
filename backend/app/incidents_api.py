"""Stage 9: incidents from evidence fusion, and maintenance tasks through their lifecycle.
Stage 10: restoration verification after the repair, and villager notifications."""

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import fusion, integrations
from . import verification
from . import models as m
from . import read_model as rm
from .auth import CurrentUser, require_roles, village_ids_of
from .db import get_session

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(get_session)]
IST = timezone(timedelta(hours=5, minutes=30))
TASK_FLOW = ["ASSIGNED", "INSPECTING", "REPAIRING", "REPAIRED"]


class FailureType(str, Enum):
    leak = "leak"
    joint_failure = "joint_failure"
    burst = "burst"
    blockage = "blockage"
    valve_fault = "valve_fault"
    pump_fault = "pump_fault"
    other = "other"


class AssessBody(BaseModel):
    asset_id: str
    complaint_codes: list[str] | None = Field(default=None, description="Leave out to use all unassigned reports in the area")


class TaskBody(BaseModel):
    incident_code: str
    assignee_id: str
    due_at: datetime | None = None


class ResolveBody(BaseModel):
    note: str = Field(min_length=5, max_length=300, description="Why the incident is closed without sensor verification")


class TaskUpdateBody(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=300)
    failure_type: FailureType | None = Field(default=None, description="Required when the repair is recorded")


def _now() -> datetime:
    return datetime.now(IST)


def _iso(dt: datetime) -> str:
    return dt.astimezone(IST).isoformat(timespec="seconds")


def _next_code(existing: list[str], prefix: str, start: int, width: int) -> str:
    used = {int(c[len(prefix):]) for c in existing if c.startswith(prefix) and c[len(prefix):].isdigit()}
    n = start
    while n in used:
        n += 1
    return f"{prefix}{n:0{width}d}"


def _audit(session: Session, user: m.User, action: str, entity: str, entity_id: str, details: dict | None = None) -> None:
    session.add(m.AuditLog(at=_iso(_now()), actor_id=user.id, action=action, entity=entity, entity_id=entity_id, details=details))


def _check_asset_access(session: Session, user: m.User, asset_id: str) -> m.Asset:
    asset = session.get(m.Asset, asset_id)
    if asset is None or asset.type != "pipeline":
        raise HTTPException(404, f"Unknown pipeline {asset_id}")
    if session.get(m.ServiceArea, asset.service_area_id).village_id not in village_ids_of(user):
        raise HTTPException(403, "Not your village")
    return asset


def _incident_for_user(session: Session, user: m.User, code: str) -> m.Incident:
    i = session.get(m.Incident, code)
    if i is None or session.get(m.ServiceArea, i.service_area_id).village_id not in village_ids_of(user):
        raise HTTPException(404, f"Unknown incident {code}")
    return i


# ---------- incidents ----------

@router.get("/incidents/suggestions")
def suggestions(user: CurrentUser, session: DB):
    """Pipelines where the current evidence is worth an incident (MEDIUM or HIGH) and none is open yet."""
    require_roles(user, "gp", "officer")
    area_ids = select(m.ServiceArea.id).where(m.ServiceArea.village_id.in_(village_ids_of(user)))
    out = []
    for a in session.scalars(select(m.Asset).where(m.Asset.type == "pipeline", m.Asset.service_area_id.in_(area_ids))):
        result = fusion.assess(session, a.id)
        if result["priority"] != "LOW" and result["open_incident"] is None:
            out.append(result)
    return sorted(out, key=lambda r: r["evidence_score"], reverse=True)


@router.post("/incidents/assess")
def assess(body: AssessBody, user: CurrentUser, session: DB):
    """Preview the fused evidence for a pipeline without creating anything."""
    require_roles(user, "gp", "officer")
    _check_asset_access(session, user, body.asset_id)
    try:
        return fusion.assess(session, body.asset_id, body.complaint_codes)
    except ValueError as err:
        raise HTTPException(422, str(err)) from err


@router.post("/incidents", status_code=201)
def open_incident(body: AssessBody, user: CurrentUser, session: DB):
    """The Gram Panchayat opens an incident from the current evidence. The system proposes; a person decides."""
    require_roles(user, "gp")
    _check_asset_access(session, user, body.asset_id)
    try:
        result = fusion.assess(session, body.asset_id, body.complaint_codes)
    except ValueError as err:
        raise HTTPException(422, str(err)) from err
    if result["open_incident"]:
        raise HTTPException(409, f"Incident {result['open_incident']} is already open for this pipeline")
    if result["priority"] == "LOW":
        raise HTTPException(422, f"Evidence score {result['evidence_score']} is too low to open an incident; keep monitoring")

    code = _next_code(list(session.scalars(select(m.Incident.code))), "INC-", 311, 4)
    now = _iso(_now())
    session.add(
        m.Incident(
            code=code, ord=1000 + session.query(m.Incident).count(), is_history=False, asset_id=body.asset_id,
            service_area_id=result["service_area_id"], opened_at=now, closed_at=None, status="TRIAGED",
            priority=result["priority"], evidence_score=result["evidence_score"], evidence_score_note=result["evidence_score_note"],
            probable_cause=result["probable_cause"], affected_estimate=result["affected_households"]["estimate"],
            affected_basis=result["affected_households"]["basis"], uncertainties=result["uncertainties"],
            sensor_health=result["sensor_health"], summary=None, is_mock=None, is_simulated=False,
        )
    )
    session.flush()
    for i, e in enumerate(result["evidence"]):
        session.add(m.IncidentEvidence(ord=i, incident_code=code, type=e["type"], ref=e["ref"], contribution=e["contribution"], text=e["text"]))
    for c in (session.get(m.Complaint, cc) for cc in result["complaint_codes"]):
        c.incident_code = code
        c.linked_asset_id = body.asset_id
    session.flush()
    verification.notify(session, code, "being_checked", now)
    integrations.on_incident(session, session.get(m.Incident, code))
    _audit(session, user, "open", "incident", code, {"evidence_score": result["evidence_score"], "priority": result["priority"], "complaints": result["complaint_codes"]})
    session.commit()
    return rm.incident_live(session, session.get(m.Incident, code))


@router.get("/incidents")
def list_incidents(user: CurrentUser, session: DB):
    require_roles(user, "gp", "officer")
    area_ids = select(m.ServiceArea.id).where(m.ServiceArea.village_id.in_(village_ids_of(user)))
    rows = session.scalars(select(m.Incident).where(m.Incident.service_area_id.in_(area_ids)).order_by(m.Incident.opened_at.desc())).all()
    return [rm.history_incident(i) if i.is_history else rm.incident_live(session, i) for i in rows]


@router.get("/incidents/{code}")
def get_incident(code: str, session: DB):
    i = session.get(m.Incident, code)
    if i is None:
        raise HTTPException(404, f"Unknown incident {code}")
    return rm.history_incident(i) if i.is_history else rm.incident_live(session, i)


@router.get("/incidents/{code}/verification")
def get_verification(code: str, session: DB):
    """Restoration check for an incident. Judges any supply windows that ended since the last look."""
    v = session.get(m.Verification, code)
    if v is None:
        raise HTTPException(404, f"No verification for incident {code}")
    verification.check(session, v)
    return {**rm.verification(session, v), **verification.progress(session, v)}


@router.post("/incidents/{code}/resolve")
def resolve_unverified(code: str, body: ResolveBody, user: CurrentUser, session: DB):
    """The Gram Panchayat closes a repaired incident without sensor proof (e.g. no sensor on the pipe).
    It is recorded as "Resolved - not sensor-verified", never as verified."""
    require_roles(user, "gp")
    inc = _incident_for_user(session, user, code)
    v = session.get(m.Verification, code)
    if inc.status != "REPAIR_DONE" or v is None or v.result not in verification.OPEN_RESULTS:
        raise HTTPException(409, f"Incident {code} is {inc.status}; only a repaired incident awaiting verification can be resolved")
    now = _iso(_now())
    v.result, v.verified_at, v.resolved_by, v.note = "RESOLVED_UNVERIFIED", now, user.id, body.note
    inc.status, inc.closed_at = "RESOLVED_UNVERIFIED", now
    verification.notify(session, code, "resolved_unverified", now)
    integrations.on_incident(session, inc)
    _audit(session, user, "resolve_unverified", "incident", code, {"method": v.method})
    session.commit()
    return {**rm.verification(session, v), **verification.progress(session, v)}


@router.get("/notifications/mine")
def my_notifications(user: CurrentUser, session: DB):
    """The signed-in user's notifications, newest first (in-app only in the prototype)."""
    rows = session.scalars(select(m.Notification).where(m.Notification.user_id == user.id).order_by(m.Notification.at.desc(), m.Notification.id.desc())).all()
    return [rm.notification(n) for n in rows]


# ---------- maintenance tasks ----------

@router.post("/tasks", status_code=201)
def create_task(body: TaskBody, user: CurrentUser, session: DB):
    require_roles(user, "gp")
    inc = _incident_for_user(session, user, body.incident_code)
    if inc.is_history or inc.status != "TRIAGED":
        raise HTTPException(409, f"Incident {inc.code} is {inc.status}; a task can only be created for a newly triaged incident")
    tech = session.get(m.User, body.assignee_id)
    if tech is None or tech.role != "technician" or tech.village_id != session.get(m.ServiceArea, inc.service_area_id).village_id:
        raise HTTPException(422, "Assign a technician from this village")
    now = _now()
    due = body.due_at.astimezone(IST) if body.due_at and body.due_at.tzinfo else (now + timedelta(days=1)).replace(hour=17, minute=0, second=0, microsecond=0)
    if due <= now:
        raise HTTPException(422, "Due time must be in the future")
    code = _next_code(list(session.scalars(select(m.MaintenanceTask.code))), "T-", 118, 3)
    session.add(m.MaintenanceTask(code=code, incident_code=inc.code, asset_id=inc.asset_id, assignee_id=tech.id, created_by=user.id, due_at=_iso(due), is_simulated=False))
    session.flush()
    session.add(m.TaskUpdate(ord=0, task_code=code, status="ASSIGNED", at=_iso(now), note=None))
    inc.status = "TASK_ASSIGNED"
    integrations.on_incident(session, inc)
    _audit(session, user, "create", "task", code, {"incident": inc.code, "assignee": tech.id})
    session.commit()
    return rm.task_live(session, session.get(m.MaintenanceTask, code))


@router.get("/tasks")
def list_tasks(user: CurrentUser, session: DB):
    require_roles(user, "gp", "officer")
    area_ids = select(m.ServiceArea.id).where(m.ServiceArea.village_id.in_(village_ids_of(user)))
    incident_codes = select(m.Incident.code).where(m.Incident.service_area_id.in_(area_ids))
    rows = session.scalars(select(m.MaintenanceTask).where(m.MaintenanceTask.incident_code.in_(incident_codes)).order_by(m.MaintenanceTask.code.desc())).all()
    return [rm.task_live(session, t) for t in rows]


@router.get("/tasks/{code}")
def get_task(code: str, session: DB):
    t = session.get(m.MaintenanceTask, code)
    if t is None:
        raise HTTPException(404, f"Unknown task {code}")
    return rm.task_live(session, t)


@router.post("/tasks/{code}/updates", status_code=201)
def update_task(code: str, body: TaskUpdateBody, user: CurrentUser, session: DB):
    """Move a task one step forward. Recording the repair also writes a repair record for the pipeline,
    which feeds its risk score (prior failures) and its history."""
    require_roles(user, "gp")
    t = session.get(m.MaintenanceTask, code)
    if t is None:
        raise HTTPException(404, f"Unknown task {code}")
    inc = _incident_for_user(session, user, t.incident_code)
    updates = rm._rows(session, m.TaskUpdate, m.TaskUpdate.task_code == code)
    current = updates[-1].status
    if current == TASK_FLOW[-1]:
        raise HTTPException(409, "The repair is already recorded")
    expected = TASK_FLOW[TASK_FLOW.index(current) + 1]
    if body.status != expected:
        raise HTTPException(409, f"Next step is {expected}, not {body.status}")
    if body.status == "REPAIRED" and body.failure_type is None:
        raise HTTPException(422, "Record what was repaired (failure_type)")

    now = _iso(_now())
    session.add(m.TaskUpdate(ord=len(updates), task_code=code, status=body.status, at=now, note=body.note))
    if body.status == "REPAIRED":
        repair_id = _next_code(list(session.scalars(select(m.Repair.id))), "rep-", 100, 3)
        session.add(
            m.Repair(id=repair_id, ord=1000 + session.query(m.Repair).count(), asset_id=t.asset_id, date=now[:10],
                     failure_type=body.failure_type.value, notes=body.note or f"Repaired under task {code}", incident_id=inc.code, is_mock=False)
        )
        inc.status = "REPAIR_DONE"
        verification.start(session, inc, now)
        integrations.on_incident(session, inc)
    if body.status == "REPAIRING":
        session.flush()
        verification.notify(session, inc.code, "repair_started", now)
    _audit(session, user, "update", "task", code, {"status": body.status, **({"failure_type": body.failure_type.value} if body.failure_type else {})})
    session.commit()
    return rm.task_live(session, t)
