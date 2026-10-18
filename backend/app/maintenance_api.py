"""Preventive maintenance planning: which pipelines to inspect first, and a one-step way to plan the inspection.

The planner ranks pipelines by combining what is known about each: its risk score, whether its repeat-failure window has
passed, what the AI models and alert rules are saying right now, how often it has needed attention, and how long since it
was last inspected. The number is a RANKING for planning (0 to 100), not a probability of failure. It costs nothing to read:
no prices or budgets are involved. Planning an inspection opens a PREVENTIVE incident and its task in one step, and then it
follows the same path as any task (assign, inspect, repair or "no fault found", close)."""

from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import incidents_api, integrations, ml
from . import models as m
from . import read_model as rm
from .auth import CurrentUser, require_roles, village_ids_of
from .db import get_session

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(get_session)]
IST = timezone(timedelta(hours=5, minutes=30))

# How much each signal counts towards the planning score (they add up to 100).
WEIGHTS = {"risk": 40, "failure_window": 25, "live_signals": 15, "repeat_incidents": 10, "inspection_age": 10}
TIMING_POINTS = {"overdue": 100, "due_soon": 60, "unknown": 20, "later": 10}
LIVE_RULES = ("AI_ANOMALY", "FORECAST_PRESSURE_BREACH", "FORECAST_TANK_LEVEL", "QUALITY_OUTLOOK_AT_RISK", "QUALITY_OUTLOOK_WATCH", "HEAD_TAIL_FLOW_GAP", "TAIL_PRESSURE_LOW_IN_SUPPLY", "INTERMITTENT_SUPPLY", "NO_FLOW_IN_SUPPLY")
OPEN_STATUSES = ("TRIAGED", "TASK_ASSIGNED", "REPAIR_DONE")  # an incident in any of these is still being worked on
# HIGH needs the pipe to be risky AND past its expected failure window (or showing live trouble); MEDIUM is one of those.
BANDS = ((50, "HIGH", 14), (30, "MEDIUM", 45), (0, "LOW", 120))
NOTE = "A ranking for planning, from 0 to 100. It is not a probability of failure, and no costs or prices are used."


class PreventiveBody(BaseModel):
    asset_id: str
    assignee_id: str
    due_at: datetime | None = None
    note: str | None = Field(default=None, max_length=200)


def _months_since(iso: str, as_of: date) -> float:
    return max(0.0, (as_of - date.fromisoformat(iso[:10])).days / 30.4)


def _band(score: int) -> tuple[str, int]:
    return next((name, days) for floor, name, days in BANDS if score >= floor)


def plan(session: Session, village_ids: set[str]) -> list[dict]:
    """Every pipeline in the user's villages with its planning score, reasons and recommended action, highest first."""
    as_of = date.fromisoformat(rm.config(session, "meta")["as_of"][:10])
    failures = {f["asset_id"]: f for f in ml.failure_outlook(session, village_ids)}
    open_alerts: dict[str, list[m.Alert]] = {}
    for a in session.scalars(select(m.Alert).where(m.Alert.is_simulated.is_(False), m.Alert.cleared_at.is_(None))):
        if a.rule_code in LIVE_RULES:
            open_alerts.setdefault(a.asset_id, []).append(a)
    incidents = list(session.scalars(select(m.Incident)))
    inspections = list(session.scalars(select(m.Inspection)))
    out = []
    for asset_id, f in failures.items():
        asset = session.get(m.Asset, asset_id)
        area = session.get(m.ServiceArea, asset.service_area_id)
        risk_pts = f["risk_score"] or 0
        window_pts = TIMING_POINTS[f["timing"]]
        live = open_alerts.get(asset_id, [])
        live_pts = min(100, 60 * len(live)) if live else 0
        # A planned inspection is not a failure, so preventive incidents do not count as repeat incidents.
        recent = [i for i in incidents if i.asset_id == asset_id and i.origin != "PREVENTIVE" and _months_since(i.opened_at, as_of) <= 12]
        repeat_pts = min(100, round(100 * min(len(recent), 3) / 3))
        mine = [i.date for i in inspections if i.asset_id == asset_id]
        age_months = _months_since(max(mine), as_of) if mine else 36.0
        age_pts = min(100, round(100 * min(age_months, 24) / 24))
        parts = {"risk": risk_pts, "failure_window": window_pts, "live_signals": live_pts, "repeat_incidents": repeat_pts, "inspection_age": age_pts}
        score = round(sum(parts[k] * WEIGHTS[k] / 100 for k in WEIGHTS))
        band, within = _band(score)

        reasons = []
        if risk_pts:
            reasons.append({"type": "RISK", "points": round(risk_pts * WEIGHTS["risk"] / 100, 1), "text": f"Risk score {risk_pts}/100 ({f['risk_band']})"})
        if f["timing"] in ("overdue", "due_soon"):
            reasons.append({"type": "FAILURE_WINDOW", "points": round(window_pts * WEIGHTS["failure_window"] / 100, 1),
                            "text": (f"Expected failure window passed {f['days_overdue']} days ago" if f["timing"] == "overdue" else "Inside its expected failure window soon") + f" (fails about every {f['mtbf_days']} days)"})
        if live:
            reasons.append({"type": "LIVE", "points": round(live_pts * WEIGHTS["live_signals"] / 100, 1), "text": "Live signals now: " + "; ".join(sorted({a.rule_code.replace("_", " ").lower() for a in live}))})
        if recent:
            reasons.append({"type": "REPEAT", "points": round(repeat_pts * WEIGHTS["repeat_incidents"] / 100, 1), "text": f"{len(recent)} incident{'s' if len(recent) > 1 else ''} in the last 12 months"})
        if age_pts >= 50:
            reasons.append({"type": "INSPECTION_AGE", "points": round(age_pts * WEIGHTS["inspection_age"] / 100, 1), "text": "No inspection on record" if not mine else f"Last inspected {round(age_months)} months ago"})
        reasons.sort(key=lambda r: -r["points"])

        open_inc = next((i for i in incidents if i.asset_id == asset_id and not i.is_history and i.status in OPEN_STATUSES), None)
        task = session.scalars(select(m.MaintenanceTask).where(m.MaintenanceTask.incident_code == open_inc.code)).first() if open_inc else None
        action = f"Inspect {asset.code} within {within} days" + (f": {reasons[0]['text'].lower()}" if reasons else "")
        out.append({
            "asset_id": asset_id, "asset_code": asset.code, "name": asset.name, "service_area_id": area.id, "zone": area.name, "village_id": area.village_id, "sujal_gaon_id": area.sujal_gaon_id,
            "score": score, "band": band, "inspect_within_days": within, "action": action, "reasons": reasons, "weights": WEIGHTS, "households": area.household_count,
            "risk_score": f["risk_score"], "failure_timing": f["timing"], "open_incident": open_inc.code if open_inc else None, "open_task": task.code if task else None,
        })
    return sorted(out, key=lambda r: (-r["score"], r["asset_code"]))


@router.get("/maintenance/priorities")
def priorities(user: CurrentUser, session: DB):
    """Pipelines ranked for preventive attention. Officers see all their villages, the Gram Panchayat its own."""
    require_roles(user, "gp", "officer")
    rows = plan(session, village_ids_of(user))
    return {"as_of": ml.rm_as_of(session), "is_simulated": True, "note": NOTE, "weights": WEIGHTS, "items": rows,
            "technicians": [{"id": u.id, "name": u.display_name, "village_id": u.village_id} for u in session.scalars(select(m.User).where(m.User.role == "technician")) if u.village_id in village_ids_of(user)]}


@router.post("/maintenance/preventive", status_code=201)
def plan_inspection(body: PreventiveBody, user: CurrentUser, session: DB):
    """Plan a preventive inspection: opens a PREVENTIVE incident from the planner's reasons and its task, in one step."""
    require_roles(user, "gp")
    asset = session.get(m.Asset, body.asset_id)
    if asset is None or asset.type != "pipeline":
        raise HTTPException(404, f"Unknown pipeline {body.asset_id}")
    area = session.get(m.ServiceArea, asset.service_area_id)
    if area.village_id not in village_ids_of(user):
        raise HTTPException(403, "Not your village")
    item = next((r for r in plan(session, village_ids_of(user)) if r["asset_id"] == body.asset_id), None)
    if item is None:
        raise HTTPException(404, f"Unknown pipeline {body.asset_id}")
    if item["open_incident"]:
        raise HTTPException(409, f"{item['open_incident']} is already open for {asset.code}")

    now = datetime.now(IST)
    code = incidents_api._next_code(list(session.scalars(select(m.Incident.code))), "INC-", 311, 4)
    inc = m.Incident(
        code=code, ord=1000 + session.query(m.Incident).count(), is_history=False, asset_id=asset.id, service_area_id=area.id, opened_at=now.isoformat(timespec="seconds"), closed_at=None,
        status="TRIAGED", priority=item["band"], evidence_score=round(item["score"] / 100, 2), evidence_score_note="Planning score from the maintenance planner. A ranking, not a probability.",
        probable_cause="Preventive inspection: no failure has occurred. " + (item["reasons"][0]["text"] if item["reasons"] else "Routine planning."), affected_estimate=area.household_count,
        affected_basis="zone register (mock): households that would be affected by a failure", uncertainties=["No failure has been confirmed: this is a planned inspection", "The score ranks pipelines for planning; it is not a failure probability"],
        sensor_health=None, summary=body.note, is_mock=None, is_simulated=False, origin="PREVENTIVE",
    )
    session.add(inc)
    session.flush()
    for i, r in enumerate(item["reasons"] or [{"type": "PLANNED", "points": 0, "text": "Planned by the Gram Panchayat"}]):
        session.add(m.IncidentEvidence(ord=i, incident_code=code, type=r["type"], ref={"asset_id": asset.id}, contribution=round(r["points"] / 100, 3), text=r["text"]))
    incidents_api._audit(session, user, "open", "incident", code, {"origin": "PREVENTIVE", "planning_score": item["score"], "band": item["band"]})
    task = incidents_api.make_task(session, user, inc, body.assignee_id, body.due_at, default_days=item["inspect_within_days"])
    integrations.on_incident(session, inc)
    session.commit()
    return {"incident": rm.incident_live(session, session.get(m.Incident, code)), "task": rm.task_live(session, session.get(m.MaintenanceTask, task.code))}
