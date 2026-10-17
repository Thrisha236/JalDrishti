"""Turn database rows back into the seed's JSON shape. The frontend consumes this shape, and the
round-trip test (seed -> database -> snapshot) proves nothing is lost on the way."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .risk import score_pipeline


def _drop_none(d: dict, *optional: str) -> dict:
    """Remove optional keys whose value is None (they were absent in the seed)."""
    return {k: v for k, v in d.items() if not (k in optional and v is None)}


def _rows(session: Session, model, *where):
    stmt = select(model)
    for w in where:
        stmt = stmt.where(w)
    return session.scalars(stmt.order_by(model.ord)).all()


def config(session: Session, key: str):
    row = session.get(m.Config, key)
    return row.value if row else None


# ---------- reference data ----------

def village(v: m.Village) -> dict:
    return {"id": v.id, "name": v.name, "lgd_code": v.lgd_code, "district": v.district, "state": v.state, "is_mock": v.is_mock}


def service_area(a: m.ServiceArea) -> dict:
    return _drop_none(
        {
            "id": a.id, "village_id": a.village_id, "name": a.name, "sujal_gaon_id": a.sujal_gaon_id,
            "sujal_gaon_note": a.sujal_gaon_note, "household_count": a.household_count,
            "household_count_source": a.household_count_source, "polygon": a.polygon, "is_mock": a.is_mock,
        },
        "sujal_gaon_note",
    )


def scheme(session: Session, s: m.Scheme) -> dict:
    links = _rows(session, m.SchemeServiceArea, m.SchemeServiceArea.scheme_id == s.id)
    return {
        "id": s.id, "village_id": s.village_id, "name": s.name, "sujalam_bharat_id": s.sujalam_bharat_id,
        "service_area_ids": [l.service_area_id for l in links], "is_mock": s.is_mock,
    }


def asset(a: m.Asset) -> dict:
    return {
        "id": a.id, "code": a.code, "type": a.type, "name": a.name, "scheme_id": a.scheme_id,
        "service_area_id": a.service_area_id, "geometry": a.geometry, "is_mock": a.is_mock,
    }


def _num(x):
    """Floats that hold whole numbers come back as ints, matching the seed's JSON."""
    return int(x) if isinstance(x, float) and x.is_integer() else x


def pipeline_profile(p: m.PipelineProfile) -> dict:
    return {
        "asset_id": p.asset_id, "material": p.material, "material_source": p.material_source, "diameter_mm": p.diameter_mm,
        "install_date": p.install_date, "install_date_source": p.install_date_source, "length_m": p.length_m,
        "pressure_per_flow_drop_pct": _num(p.pressure_per_flow_drop_pct), "trend_source": p.trend_source,
    }


def inspection(i: m.Inspection) -> dict:
    return {"id": i.id, "asset_id": i.asset_id, "date": i.date, "method": i.method, "corrosion_grade": i.corrosion_grade, "notes": i.notes, "is_mock": i.is_mock}


def repair(r: m.Repair) -> dict:
    return _drop_none(
        {"id": r.id, "asset_id": r.asset_id, "date": r.date, "failure_type": r.failure_type, "notes": r.notes, "incident_id": r.incident_id, "is_mock": r.is_mock},
        "incident_id",
    )


def sensor_node(n: m.SensorNode) -> dict:
    return {"id": n.id, "code": n.code, "asset_id": n.asset_id, "location": n.location, "power": n.power, "is_simulated": n.is_simulated}


def sensor(s: m.Sensor) -> dict:
    return _drop_none(
        {
            "id": s.id, "node_id": s.node_id, "kind": s.kind, "position": s.position, "unit": s.unit,
            "baseline": s.baseline, "normal_band": [s.band_low, s.band_high], "is_simulated": s.is_simulated,
        },
        "position",
    )


def schedule(s: m.SupplySchedule) -> dict:
    return {"service_area_id": s.service_area_id, "days": s.days, "windows": s.windows}


def user(u: m.User) -> dict:
    return _drop_none(
        {
            "id": u.id, "role": u.role, "display_name": u.display_name, "village_id": u.village_id,
            "service_area_id": u.service_area_id, "village_ids": u.village_ids, "language": u.language, "is_mock": u.is_mock,
        },
        "village_id", "service_area_id", "village_ids",
    )


# ---------- story / operational data ----------

def alert(a: m.Alert) -> dict:
    return _drop_none(
        {
            "id": a.id, "kind": a.kind, "rule_code": a.rule_code, "severity": a.severity, "asset_id": a.asset_id,
            "sensor_id": a.sensor_id, "service_area_id": a.service_area_id, "raised_at": a.raised_at,
            "details": a.details, "text": a.text, "is_simulated": a.is_simulated, "cleared_at": a.cleared_at,
        },
        "sensor_id", "details", "cleared_at",
    )


def complaint(session: Session, c: m.Complaint, public: bool = False) -> dict:
    """public=True is for the unauthenticated snapshot: the citizen's own words and the photo storage key are removed."""
    media = _rows(session, m.ComplaintMedia, m.ComplaintMedia.complaint_code == c.public_code)
    return {
        "public_code": c.public_code, "citizen_id": c.citizen_id, "service_area_id": c.service_area_id,
        "category": c.category, "description": None if public else c.description, "created_at": c.created_at,
        "location": c.location,
        "media": [{"id": x.id, "file": None, "note": x.note, "exif_stripped": x.exif_stripped} for x in media],
        "linked_asset_id": c.linked_asset_id, "is_simulated": c.is_simulated,
    }


def complaint_with_analysis(session: Session, c: m.Complaint) -> dict:
    """Authorised view (owner, GP or officer): description, photo ids and the simulated photo observation."""
    out = complaint(session, c)
    media_ids = [x["id"] for x in out["media"]]
    rows = session.scalars(select(m.ImageAnalysis).where(m.ImageAnalysis.media_id.in_(media_ids))).all() if media_ids else []
    out["image_analysis"] = [image_analysis(r) for r in rows]
    return out


def image_analysis(ia: m.ImageAnalysis) -> dict:
    return {
        "media_id": ia.media_id, "engine": ia.engine, "is_simulated": ia.is_simulated,
        "observation_code": ia.observation_code, "message": ia.message, "disclaimer": ia.disclaimer,
    }


def history_incident(i: m.Incident) -> dict:
    return {
        "code": i.code, "asset_id": i.asset_id, "service_area_id": i.service_area_id, "opened_at": i.opened_at,
        "closed_at": i.closed_at, "status": i.status, "summary": i.summary, "is_mock": i.is_mock,
    }


def incident(session: Session, i: m.Incident) -> dict:
    evidence = _rows(session, m.IncidentEvidence, m.IncidentEvidence.incident_code == i.code)
    return {
        "code": i.code, "asset_id": i.asset_id, "service_area_id": i.service_area_id, "opened_at": i.opened_at,
        "priority": i.priority, "evidence_score": i.evidence_score, "evidence_score_note": i.evidence_score_note,
        "probable_cause": i.probable_cause,
        "affected_households": {"estimate": i.affected_estimate, "basis": i.affected_basis},
        "evidence": [{"type": e.type, "ref": e.ref, "contribution": e.contribution, "text": e.text} for e in evidence],
        "uncertainties": i.uncertainties, "sensor_health": i.sensor_health, "is_simulated": i.is_simulated,
    }


def task(session: Session, t: m.MaintenanceTask) -> dict:
    updates = _rows(session, m.TaskUpdate, m.TaskUpdate.task_code == t.code)
    return {
        "code": t.code, "incident_code": t.incident_code, "asset_id": t.asset_id, "assignee_id": t.assignee_id,
        "created_by": t.created_by, "due_at": t.due_at,
        "updates": [_drop_none({"status": u.status, "at": u.at, "note": u.note}, "note") for u in updates],
        "is_simulated": t.is_simulated,
    }


def verification(session: Session, v: m.Verification) -> dict:
    windows = _rows(session, m.VerificationWindow, m.VerificationWindow.incident_code == v.incident_code)
    return {
        "incident_code": v.incident_code, "method": v.method, "rule": v.rule,
        "windows": [{"start": w.start, "end": w.end, "result": w.result, "tail_pressure_mean_bar": w.tail_pressure_mean_bar} for w in windows],
        "result": v.result, "verified_at": v.verified_at, "is_simulated": v.is_simulated,
    }


def notification(n: m.Notification) -> dict:
    return {"user_id": n.user_id, "complaint_code": n.complaint_code, "at": n.at, "message_key": n.message_key}


# ---------- risk ----------

def risk_for(session: Session, asset_id: str) -> dict | None:
    profile = session.get(m.PipelineProfile, asset_id)
    if profile is None:
        return None
    return score_pipeline(
        pipeline_profile(profile),
        [repair(r) for r in _rows(session, m.Repair, m.Repair.asset_id == asset_id)],
        [inspection(i) for i in _rows(session, m.Inspection, m.Inspection.asset_id == asset_id)],
        config(session, "risk_config"),
        config(session, "meta")["as_of"],
    )


def all_risk(session: Session) -> dict:
    return {p.asset_id: risk_for(session, p.asset_id) for p in _rows(session, m.PipelineProfile)}


# ---------- full snapshot ----------

def snapshot(session: Session) -> dict:
    """Everything the Stage 3 frontend reads, in the seed's shape, plus server-computed risk."""
    story_meta = config(session, "story_meta")
    current = session.scalars(select(m.Incident).where(m.Incident.is_history.is_(False)).order_by(m.Incident.ord)).first()
    current_task = session.scalars(select(m.MaintenanceTask)).first()
    current_ver = session.scalars(select(m.Verification)).first()
    return {
        "meta": config(session, "meta"),
        "risk_config": config(session, "risk_config"),
        "villages": [village(v) for v in _rows(session, m.Village)],
        "service_areas": [service_area(a) for a in _rows(session, m.ServiceArea)],
        "schemes": [scheme(session, s) for s in _rows(session, m.Scheme)],
        "assets": [asset(a) for a in _rows(session, m.Asset)],
        "pipeline_profiles": [pipeline_profile(p) for p in _rows(session, m.PipelineProfile)],
        "inspections": [inspection(i) for i in _rows(session, m.Inspection)],
        "repairs": [repair(r) for r in _rows(session, m.Repair)],
        "sensor_nodes": [sensor_node(n) for n in _rows(session, m.SensorNode)],
        "sensors": [sensor(s) for s in _rows(session, m.Sensor)],
        "supply_schedules": [schedule(s) for s in _rows(session, m.SupplySchedule)],
        "users": [user(u) for u in _rows(session, m.User)],
        "history_incidents": [history_incident(i) for i in _rows(session, m.Incident, m.Incident.is_history.is_(True))],
        "story": {
            **story_meta,
            "alerts": [alert(a) for a in _rows(session, m.Alert)],
            "complaints": [complaint(session, c, public=True) for c in _rows(session, m.Complaint)],
            "image_analysis": [image_analysis(x) for x in _rows(session, m.ImageAnalysis)],
            "incident": incident(session, current) if current else None,
            "task": task(session, current_task) if current_task else None,
            "verification": verification(session, current_ver) if current_ver else None,
            "notifications": [notification(n) for n in _rows(session, m.Notification)],
        },
        "risk": all_risk(session),
    }
