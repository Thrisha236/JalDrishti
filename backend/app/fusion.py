"""Stage 9: evidence fusion. Combines four independent kinds of evidence about one pipeline into an
explainable incident assessment:

    evidence_score = 0.35 x sensor + 0.25 x complaints + 0.15 x risk + 0.10 x image

Each term is 0..1 and shown with its contribution, so anyone can check the arithmetic. The result is a
weighted *evidence score*, not a probability. HIGH priority needs a score of at least 0.6 AND at least
two independent kinds of evidence, so complaints alone or one sensor alone can never make an incident HIGH.
Weights are starting values for the demo, to be tuned with real incidents.
"""

import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from . import models as m
from . import read_model as rm

IST = timezone(timedelta(hours=5, minutes=30))
WEIGHTS = {"ALERT": 0.35, "COMPLAINTS": 0.25, "RISK": 0.15, "IMAGE": 0.10}
SIMULATED_IMAGE_FACTOR = 0.6  # a simulated photo observation counts for less than a real one would
COMPLAINTS_FOR_FULL_WEIGHT = 3
COMPLAINT_WINDOW = timedelta(hours=6)
CLUSTER_RADIUS_M = 600
HIGH_MIN, MEDIUM_MIN = 0.6, 0.35
RISK_STRENGTH = {"HIGH": 1.0, "MEDIUM": 0.5, "LOW": 0.0}
IMAGE_SIGNALS = {"POSSIBLE_VISIBLE_LEAK", "POSSIBLE_DAMAGED_FITTING", "POSSIBLE_DISCOLOURED_WATER"}
OPEN_INCIDENT = ("TRIAGED", "TASK_ASSIGNED", "REPAIR_DONE", "VERIFYING")

CAUSE_BY_RULE = {
    "HEAD_TAIL_FLOW_GAP": "Possible leak between the tank outlet and the tail of {pipe} (unconfirmed)",
    "TAIL_PRESSURE_LOW_IN_SUPPLY": "Possible leak or partial blockage on {pipe} (unconfirmed)",
    "PUMP_OFF_IN_SUPPLY": "Pump not running during supply: power or pump fault (unconfirmed)",
    "NO_FLOW_IN_SUPPLY": "No supply reaching the network: pump, valve or source problem (unconfirmed)",
}


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts)


def open_incident_for(session: Session, asset_id: str) -> m.Incident | None:
    return session.scalars(
        select(m.Incident).where(m.Incident.asset_id == asset_id, m.Incident.is_history.is_(False), m.Incident.status.in_(OPEN_INCIDENT))
    ).first()


def candidate_complaints(session: Session, area_id: str, now: datetime) -> list[m.Complaint]:
    """Unassigned complaints in the area: live ones from the last 6 hours, plus (demo mode only) the
    scripted reports from other demo villagers, which carry story dates rather than real ones."""
    rows = session.scalars(
        select(m.Complaint).where(m.Complaint.service_area_id == area_id, m.Complaint.incident_code.is_(None)).order_by(m.Complaint.created_at)
    ).all()
    out = []
    for c in rows:
        if c.is_simulated:
            if config.DEMO_MODE:
                out.append(c)
        elif now - _parse(c.created_at) <= COMPLAINT_WINDOW:
            out.append(c)
    return out


def _spread_m(complaints: list[m.Complaint]) -> float | None:
    pts = [(c.location["x"], c.location["y"]) for c in complaints if c.location.get("x") is not None]
    if len(pts) < 2:
        return None
    return max(math.dist(a, b) for i, a in enumerate(pts) for b in pts[i + 1:])


def assess(session: Session, asset_id: str, complaint_codes: list[str] | None = None, now: datetime | None = None) -> dict:
    now = now or datetime.now(IST)
    asset = session.get(m.Asset, asset_id)
    if asset is None or asset.type != "pipeline":
        raise ValueError(f"{asset_id} is not a pipeline")
    area = session.get(m.ServiceArea, asset.service_area_id)
    evidence, uncertainties = [], []

    # 1. Sensor alerts from the rules engine (live, open, water-service only)
    alerts = session.scalars(
        select(m.Alert).where(m.Alert.asset_id == asset_id, m.Alert.is_simulated.is_(False), m.Alert.cleared_at.is_(None))
    ).all()
    water = [a for a in alerts if a.kind == "WATER_SERVICE"]
    equipment = [a for a in alerts if a.kind == "EQUIPMENT_HEALTH"]
    if water:
        lead = sorted(water, key=lambda a: list(CAUSE_BY_RULE).index(a.rule_code) if a.rule_code in CAUSE_BY_RULE else 99)[0]
        evidence.append({"type": "ALERT", "ref": [a.id for a in water], "strength": 1.0, "text": lead.text})
    sensor_health = "OK" if not equipment else "DEGRADED: " + ", ".join(sorted({a.rule_code for a in equipment}))
    if equipment:
        uncertainties.append(f"Sensor health issue on this pipeline ({', '.join(a.id for a in equipment)}): sensor evidence may be incomplete")

    # 2. Complaints (chosen by the GP, or all unassigned ones in the area)
    if complaint_codes is not None:
        complaints = [c for c in (session.get(m.Complaint, code) for code in complaint_codes) if c is not None]
        if len(complaints) != len(complaint_codes):
            raise ValueError("Unknown complaint code")
        if any(c.service_area_id != area.id for c in complaints):
            raise ValueError("Complaints must be from the pipeline's service area")
        if any(c.incident_code for c in complaints):
            raise ValueError("A complaint already belongs to an incident")
    else:
        complaints = candidate_complaints(session, area.id, now)
    if complaints:
        n = len(complaints)
        spread = _spread_m(complaints)
        where = f"within {round(spread)} m" if spread is not None and spread <= CLUSTER_RADIUS_M else f"in {area.name}"
        scripted = sum(c.is_simulated for c in complaints)
        evidence.append({
            "type": "COMPLAINTS",
            "ref": [c.public_code for c in complaints],
            "strength": min(1.0, n / COMPLAINTS_FOR_FULL_WEIGHT),
            "text": f"{n} villager report{'s' if n != 1 else ''} {where} (#{', #'.join(c.public_code for c in complaints)})",
        })
        if scripted:
            uncertainties.append(f"{scripted} of the reports are scripted demo reports from other demo villagers")
        if spread is not None and spread > CLUSTER_RADIUS_M:
            uncertainties.append(f"Reports are spread over {round(spread)} m, so they may not share one cause")

    # 3. Pipeline risk (live-aware, from Stage 8)
    risk = rm.risk_for(session, asset_id)
    if RISK_STRENGTH[risk["band"]]:
        evidence.append({
            "type": "RISK", "ref": asset_id, "strength": RISK_STRENGTH[risk["band"]],
            "text": f"{asset.code} risk score {risk['score']} ({risk['band']}; {risk['details']['age']}, {risk['details']['prior_failures']})",
        })

    # 4. Photo observations on those complaints (simulated in this prototype)
    media_ids = [x.id for c in complaints for x in session.scalars(select(m.ComplaintMedia).where(m.ComplaintMedia.complaint_code == c.public_code))]
    observations = session.scalars(select(m.ImageAnalysis).where(m.ImageAnalysis.media_id.in_(media_ids))).all() if media_ids else []
    signals = [o for o in observations if o.observation_code in IMAGE_SIGNALS]
    if signals:
        simulated = all(o.is_simulated for o in signals)
        evidence.append({
            "type": "IMAGE", "ref": [o.media_id for o in signals], "strength": SIMULATED_IMAGE_FACTOR if simulated else 1.0,
            "text": f"{'Simulated observation' if simulated else 'Photo observation'}: {signals[0].message.split(' — ')[0].lower()}",
        })
        if simulated:
            uncertainties.append("Photo observation is a prototype simulation, weighted at 60%")

    for e in evidence:
        e["contribution"] = round(WEIGHTS[e["type"]] * e.pop("strength"), 2)
    score = round(sum(e["contribution"] for e in evidence), 2)
    kinds = {e["type"] for e in evidence if e["contribution"] > 0}
    if score >= HIGH_MIN and len(kinds) >= 2:
        priority = "HIGH"
    elif score >= MEDIUM_MIN:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    pipe = asset.code
    if water:
        cause = CAUSE_BY_RULE.get(lead.rule_code, "Water-service fault on {pipe} (unconfirmed)").format(pipe=pipe)
    elif complaints:
        cause = f"Villager reports without sensor confirmation: possible local fault on or near {pipe}, or a sensor blind spot"
    else:
        cause = "No current evidence of a fault"

    node = session.scalars(select(m.SensorNode).where(m.SensorNode.asset_id == asset_id)).first()
    if node is None:
        uncertainties.append("No sensor on this pipeline: only reports and records are available")
    elif water and any(a.rule_code in ("HEAD_TAIL_FLOW_GAP", "TAIL_PRESSURE_LOW_IN_SUPPLY") for a in water):
        uncertainties.append("No middle-pipeline sensor; leak position not localised")

    existing = open_incident_for(session, asset_id)
    return {
        "asset_id": asset_id, "asset_code": pipe, "service_area_id": area.id, "assessed_at": now.isoformat(timespec="seconds"),
        "evidence": evidence, "evidence_score": score, "evidence_score_note": "Weighted evidence score, not a probability",
        "weights": WEIGHTS, "priority": priority, "probable_cause": cause,
        "affected_households": {"estimate": area.household_count, "basis": f"{area.household_count_source}: {area.name}"},
        "uncertainties": uncertainties, "sensor_health": sensor_health,
        "complaint_codes": [c.public_code for c in complaints], "alert_ids": [a.id for a in water],
        "open_incident": existing.code if existing else None,
    }
