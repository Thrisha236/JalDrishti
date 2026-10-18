"""Turn database rows back into the seed's JSON shape. The frontend consumes this shape, and the
round-trip test (seed -> database -> snapshot) proves nothing is lost on the way."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .risk import score_pipeline
from .trends import live_trend


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
    return {"id": v.id, "name": v.name, "lgd_code": v.lgd_code, "block": v.block, "district": v.district, "state": v.state, "lat": v.lat, "lon": v.lon, "is_mock": v.is_mock}


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
            "id": u.id, "username": u.username, "role": u.role, "display_name": u.display_name, "village_id": u.village_id,
            "service_area_id": u.service_area_id, "household_id": u.household_id, "village_ids": u.village_ids, "language": u.language, "is_mock": u.is_mock,
        },
        "username", "village_id", "service_area_id", "household_id", "village_ids",
    )


def water_quality(session: Session) -> dict:
    """The field-test points and the recorded tests, in the seed's shape (verdicts come from /water-quality)."""
    meta = config(session, "water_quality_meta")
    points = [
        _drop_none(
            {"id": p.id, "label": p.label, "type": p.type, "service_area_id": p.service_area_id, "asset_id": p.asset_id, "sensor_code": p.sensor_code},
            "asset_id", "sensor_code",
        )
        for p in _rows(session, m.WaterQualityPoint)
    ]
    tests = [{"id": t.id, "point_id": t.point_id, "date": t.date, "tester": t.tester, "values": t.values, "is_mock": t.is_mock} for t in _rows(session, m.WaterQualityTest)]
    return {"standard": meta["standard"], "note": meta["note"], "points": points, "tests": tests}


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
        **({"incident_code": c.incident_code} if c.incident_code else {}),
        # Only non-app channels are listed, so seed complaints round-trip unchanged.
        **({"channel": c.channel} if c.channel and c.channel != "APP" else {}),
    }


def complaint_progress(session: Session, c: m.Complaint) -> list[dict]:
    """What has happened to a complaint, from real records only: received, grouped into an incident,
    repair started, repair done, and how it was closed (verified by sensors, or resolved without sensor proof)."""
    events = [{"key": "received", "at": c.created_at}]
    if c.incident_code:
        inc = session.get(m.Incident, c.incident_code)
        events.append({"key": "checking", "at": inc.opened_at})
        t = session.scalars(select(m.MaintenanceTask).where(m.MaintenanceTask.incident_code == inc.code)).first()
        if t:
            for u in _rows(session, m.TaskUpdate, m.TaskUpdate.task_code == t.code):
                if u.status == "REPAIRING":
                    events.append({"key": "repair_started", "at": u.at})
                if u.status == "REPAIRED":
                    events.append({"key": "repaired", "at": u.at})
        v = session.get(m.Verification, inc.code)
        if v is not None and v.result == "VERIFIED_RESTORED":
            events.append({"key": "restored", "at": v.verified_at})
        elif v is not None and v.result == "RESOLVED_UNVERIFIED":
            events.append({"key": "resolved_unverified", "at": v.verified_at})
        elif inc.status == "CLOSED_NO_FAULT":
            events.append({"key": "resolved_unverified", "at": inc.closed_at})
    return events


def complaint_with_analysis(session: Session, c: m.Complaint) -> dict:
    """Authorised view (owner, GP or officer): description, photo ids and the simulated photo observation."""
    out = complaint(session, c)
    media_ids = [x["id"] for x in out["media"]]
    rows = session.scalars(select(m.ImageAnalysis).where(m.ImageAnalysis.media_id.in_(media_ids))).all() if media_ids else []
    out["image_analysis"] = [image_analysis(r) for r in rows]
    out["progress"] = complaint_progress(session, c)
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


def incident_live(session: Session, i: m.Incident) -> dict:
    """Incident with its lifecycle: status, grouped complaints and the maintenance task, if any."""
    t = session.scalars(select(m.MaintenanceTask).where(m.MaintenanceTask.incident_code == i.code)).first()
    complaints = session.scalars(select(m.Complaint.public_code).where(m.Complaint.incident_code == i.code).order_by(m.Complaint.created_at)).all()
    return {**incident(session, i), "status": i.status, "origin": i.origin, "complaint_codes": list(complaints), "task_code": t.code if t else None}


def task(session: Session, t: m.MaintenanceTask) -> dict:
    updates = _rows(session, m.TaskUpdate, m.TaskUpdate.task_code == t.code)
    return {
        "code": t.code, "incident_code": t.incident_code, "asset_id": t.asset_id, "assignee_id": t.assignee_id,
        "created_by": t.created_by, "due_at": t.due_at,
        "updates": [_drop_none({"status": u.status, "at": u.at, "note": u.note}, "note") for u in updates],
        "is_simulated": t.is_simulated,
    }


def task_live(session: Session, t: m.MaintenanceTask) -> dict:
    out = task(session, t)
    assignee = session.get(m.User, t.assignee_id)
    status = out["updates"][-1]["status"] if out["updates"] else None
    overdue = status != "REPAIRED" and datetime.fromisoformat(t.due_at) < datetime.now(datetime.fromisoformat(t.due_at).tzinfo)
    inc = session.get(m.Incident, t.incident_code)
    return {**out, "status": status, "assignee_name": assignee.display_name, "overdue": bool(overdue), "origin": inc.origin if inc else "FUSION"}


def verification(session: Session, v: m.Verification) -> dict:
    windows = _rows(session, m.VerificationWindow, m.VerificationWindow.incident_code == v.incident_code)
    return {
        "incident_code": v.incident_code, "method": v.method, "rule": v.rule,
        "windows": [
            _drop_none({"start": w.start, "end": w.end, "result": w.result, "tail_pressure_mean_bar": w.tail_pressure_mean_bar,
                        "tail_flow_mean_lpm": w.tail_flow_mean_lpm, "readings": w.readings, "reason": w.reason},
                       "tail_flow_mean_lpm", "readings", "reason")
            for w in windows
        ],
        "result": v.result, "verified_at": v.verified_at, "is_simulated": v.is_simulated,
        **_drop_none({"started_at": v.started_at, "window_seconds": v.window_seconds, "note": v.note}, "started_at", "window_seconds", "note"),
    }


def notification(n: m.Notification) -> dict:
    return {"user_id": n.user_id, "complaint_code": n.complaint_code, "at": n.at, "message_key": n.message_key}


# ---------- risk ----------

def active_risk_config(session: Session) -> dict:
    row = session.scalars(select(m.RiskConfig).where(m.RiskConfig.is_active.is_(True))).one()
    return row.config


def risk_for(session: Session, asset_id: str, use_live: bool = True) -> dict | None:
    """The risk score the system uses, plus how each data source affected it:
    - comparison: score with the recorded trend vs with the live (measured) trend
    - what_if: how the score would move if uncertain inputs were confirmed (estimated date, stale inspection)."""
    profile_row = session.get(m.PipelineProfile, asset_id)
    if profile_row is None:
        return None
    profile = pipeline_profile(profile_row)
    repairs = [repair(r) for r in _rows(session, m.Repair, m.Repair.asset_id == asset_id)]
    inspections = [inspection(i) for i in _rows(session, m.Inspection, m.Inspection.asset_id == asset_id)]
    cfg = active_risk_config(session)
    as_of = config(session, "meta")["as_of"]

    def score(p=profile, ins=inspections, trend=None):
        return score_pipeline(p, repairs, ins, cfg, as_of, trend)

    recorded = score()
    trend, reason = live_trend(session, asset_id) if use_live else (None, "live data not requested")
    live = score(trend=trend) if trend else None
    used = live or recorded

    def brief(r):
        return {"score": r["score"], "band": r["band"], "trend_points": r["factors"]["pressure_per_flow_trend"], "trend_detail": r["details"]["pressure_per_flow_trend"]}

    what_if = []
    if profile["install_date_source"] == "estimate":
        alt = score(p={**profile, "install_date_source": "record"}, trend=trend)
        what_if.append({"factor": "age", "if": "installation date confirmed from records", "points": alt["factors"]["age"], "score": alt["score"], "band": alt["band"]})
    if used["sources"]["corrosion_observation"] == "inspection (stale)":
        latest = max((i for i in inspections if i["corrosion_grade"] is not None), key=lambda i: i["date"])
        alt = score(ins=[*inspections, {**latest, "id": "what-if", "date": as_of[:10]}], trend=trend)
        what_if.append({"factor": "corrosion_observation", "if": "re-inspected now with the same grade", "points": alt["factors"]["corrosion_observation"], "score": alt["score"], "band": alt["band"]})
    if used["sources"]["corrosion_observation"] == "missing":
        top = cfg["factors"]["corrosion_observation"]["max"]
        what_if.append({"factor": "corrosion_observation", "if": "an inspection finds severe corrosion", "points": top, "score": used["score"] + top, "band": None})

    return {
        **used,
        "trend_basis": "live" if live else "record",
        "comparison": {"recorded": brief(recorded), "live": brief(live) if live else None, "live_unavailable_reason": reason},
        "what_if": what_if,
    }


def all_risk(session: Session) -> dict:
    return {p.asset_id: risk_for(session, p.asset_id) for p in _rows(session, m.PipelineProfile)}


# ---------- full snapshot ----------

def snapshot(session: Session) -> dict:
    """Everything the Stage 3 frontend reads, in the seed's shape, plus server-computed risk."""
    story_meta = config(session, "story_meta")
    current = session.scalars(select(m.Incident).where(m.Incident.is_history.is_(False)).order_by(m.Incident.ord.desc())).first()
    current_task = session.scalars(select(m.MaintenanceTask).order_by(m.MaintenanceTask.code.desc())).first()
    current_ver = session.scalars(select(m.Verification)).first()
    return {
        "meta": config(session, "meta"),
        "risk_config": active_risk_config(session),
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
        "water_quality": water_quality(session),
        "history_incidents": [history_incident(i) for i in _rows(session, m.Incident, m.Incident.is_history.is_(True))],
        "story": {
            **story_meta,
            "alerts": [alert(a) for a in _rows(session, m.Alert)],
            "complaints": [complaint(session, c, public=True) for c in _rows(session, m.Complaint)],
            "image_analysis": [image_analysis(x) for x in _rows(session, m.ImageAnalysis)],
            "incident": incident(session, current) if current else None,
            "task": task(session, current_task) if current_task else None,
            "verification": verification(session, current_ver) if current_ver else None,
            # Scripted notifications only: live ones belong to a signed-in villager (GET /notifications/mine).
            "notifications": [notification(n) for n in _rows(session, m.Notification, m.Notification.is_live.is_(False))],
        },
        "risk": all_risk(session),
    }
