"""Load seed/ramapuram.json into the database (drops and recreates every table).

Usage, from the backend folder:  python -m app.seed_loader
"""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from . import config
from . import models as m
from .config import SEED_PATH
from .db import Base, SessionLocal, engine


def load_seed(session: Session, seed: dict) -> None:
    add = session.add
    add(m.Config(key="meta", value=seed["meta"]))
    add(m.Config(key="risk_config", value=seed["risk_config"]))
    add(m.Config(key="story_meta", value={"is_simulated": seed["story"]["is_simulated"], "summary": seed["story"]["summary"]}))

    for i, v in enumerate(seed["villages"]):
        add(m.Village(ord=i, **v))
    session.flush()
    for i, a in enumerate(seed["service_areas"]):
        add(m.ServiceArea(ord=i, **a))
    session.flush()
    for i, s in enumerate(seed["schemes"]):
        data = {k: v for k, v in s.items() if k != "service_area_ids"}
        add(m.Scheme(ord=i, **data))
        session.flush()
        for j, sa in enumerate(s["service_area_ids"]):
            add(m.SchemeServiceArea(scheme_id=s["id"], service_area_id=sa, ord=j))
    session.flush()
    for i, a in enumerate(seed["assets"]):
        add(m.Asset(ord=i, **a))
    session.flush()
    for i, p in enumerate(seed["pipeline_profiles"]):
        add(m.PipelineProfile(ord=i, **p))
    for i, r in enumerate(seed["inspections"]):
        add(m.Inspection(ord=i, **r))
    for i, r in enumerate(seed["repairs"]):
        add(m.Repair(ord=i, **r))
    for i, n in enumerate(seed["sensor_nodes"]):
        add(m.SensorNode(ord=i, **n))
    session.flush()
    for i, s in enumerate(seed["sensors"]):
        data = {k: v for k, v in s.items() if k != "normal_band"}
        add(m.Sensor(ord=i, band_low=s["normal_band"][0], band_high=s["normal_band"][1], **data))
    for i, s in enumerate(seed["supply_schedules"]):
        add(m.SupplySchedule(ord=i, **s))
    for i, u in enumerate(seed["users"]):
        add(m.User(ord=i, **u))
    session.flush()

    for i, h in enumerate(seed["history_incidents"]):
        add(m.Incident(ord=i, is_history=True, **h))

    story = seed["story"]
    for i, a in enumerate(story["alerts"]):
        add(m.Alert(ord=i, **a))
    # Complaints marked submitted_live are created by a real citizen submission during the demo,
    # so they (and their photos and photo analysis) are not pre-loaded.
    live_media = set()
    for i, c in enumerate(story["complaints"]):
        if c.get("submitted_live"):
            live_media.update(x["id"] for x in c["media"])
            continue
        data = {k: v for k, v in c.items() if k not in ("media", "submitted_live")}
        add(m.Complaint(ord=i, **data))
        session.flush()
        for j, media in enumerate(c["media"]):
            add(m.ComplaintMedia(ord=j, complaint_code=c["public_code"], **media))
    session.flush()
    for i, ia in enumerate(story["image_analysis"]):
        if ia["media_id"] not in live_media:
            add(m.ImageAnalysis(ord=i, **ia))

    inc = story["incident"]
    add(
        m.Incident(
            ord=len(seed["history_incidents"]),
            is_history=False,
            code=inc["code"],
            asset_id=inc["asset_id"],
            service_area_id=inc["service_area_id"],
            opened_at=inc["opened_at"],
            priority=inc["priority"],
            evidence_score=inc["evidence_score"],
            evidence_score_note=inc["evidence_score_note"],
            probable_cause=inc["probable_cause"],
            affected_estimate=inc["affected_households"]["estimate"],
            affected_basis=inc["affected_households"]["basis"],
            uncertainties=inc["uncertainties"],
            sensor_health=inc["sensor_health"],
            is_simulated=inc["is_simulated"],
        )
    )
    session.flush()
    for i, e in enumerate(inc["evidence"]):
        add(m.IncidentEvidence(ord=i, incident_code=inc["code"], **e))

    task = story["task"]
    add(m.MaintenanceTask(**{k: v for k, v in task.items() if k != "updates"}))
    session.flush()
    for i, u in enumerate(task["updates"]):
        add(m.TaskUpdate(ord=i, task_code=task["code"], **u))

    ver = story["verification"]
    add(m.Verification(**{k: v for k, v in ver.items() if k != "windows"}))
    session.flush()
    for i, w in enumerate(ver["windows"]):
        add(m.VerificationWindow(ord=i, incident_code=ver["incident_code"], **w))

    for i, n in enumerate(story["notifications"]):
        add(m.Notification(ord=i, **n))
    session.commit()


def reset_database(seed_path: Path = SEED_PATH, bind=engine) -> None:
    seed = json.loads(Path(seed_path).read_text(encoding="utf-8"))
    Base.metadata.drop_all(bind)
    Base.metadata.create_all(bind)
    with Session(bind) as session:
        load_seed(session, seed)
    # Uploaded photos belong to complaints that no longer exist after a reset.
    if config.UPLOAD_DIR.exists():
        for f in config.UPLOAD_DIR.glob("*.jpg"):
            f.unlink()


if __name__ == "__main__":
    reset_database()
    with SessionLocal() as s:
        print(f"Loaded {SEED_PATH.name}: {s.query(m.Asset).count()} assets, {s.query(m.Complaint).count()} complaints.")
