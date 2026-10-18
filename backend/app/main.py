"""JalRakshak API (Stage 5: seed served from SQLite, plus complaint submission with secure photos).

Run from the backend folder:  uvicorn app.main:app --reload
Interactive docs:             http://127.0.0.1:8000/docs
"""

from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from . import read_model as rm
from .auth import router as auth_router
from .complaints_api import router as complaints_router
from .incidents_api import router as incidents_router
from .predictions_api import router as predictions_router
from .risk_api import router as risk_router
from .telemetry_api import router as telemetry_router
from .config import CORS_ORIGINS
from .db import get_session

app = FastAPI(
    title="JalRakshak API",
    version="0.5.0",
    description="Prototype. All villages, people, assets, IDs and readings are fictional demo data. No government system is integrated.",
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type", "X-Device-Key"])
app.include_router(auth_router)
app.include_router(complaints_router)
app.include_router(telemetry_router)
app.include_router(risk_router)
app.include_router(incidents_router)
app.include_router(predictions_router)

DB = Annotated[Session, Depends(get_session)]
API = "/api/v1"


def _area_ids(session: Session, village_id: str | None) -> list[str] | None:
    if village_id is None:
        return None
    if session.get(m.Village, village_id) is None:
        raise HTTPException(404, f"Unknown village {village_id}")
    return list(session.scalars(select(m.ServiceArea.id).where(m.ServiceArea.village_id == village_id)))


@app.get(f"{API}/health")
def health(session: DB):
    return {"status": "ok", "villages": session.query(m.Village).count()}


@app.get(f"{API}/meta")
def meta(session: DB):
    risk_config = rm.active_risk_config(session)
    return {**rm.config(session, "meta"), "risk_statement": risk_config["statement"], "risk_version": risk_config["version"]}


@app.get(f"{API}/snapshot")
def snapshot(session: DB):
    """Everything the current frontend needs in one call (seed shape plus server-computed risk)."""
    return rm.snapshot(session)


@app.get(f"{API}/villages")
def villages(session: DB):
    return [rm.village(v) for v in rm._rows(session, m.Village)]


@app.get(f"{API}/villages/{{village_id}}")
def village(village_id: str, session: DB):
    v = session.get(m.Village, village_id)
    if v is None:
        raise HTTPException(404, f"Unknown village {village_id}")
    areas = rm._rows(session, m.ServiceArea, m.ServiceArea.village_id == village_id)
    schedules = {s.service_area_id: rm.schedule(s) for s in rm._rows(session, m.SupplySchedule)}
    return {
        **rm.village(v),
        "service_areas": [{**rm.service_area(a), "schedule": schedules.get(a.id)} for a in areas],
        "schemes": [rm.scheme(session, s) for s in rm._rows(session, m.Scheme, m.Scheme.village_id == village_id)],
    }


@app.get(f"{API}/pipelines")
def pipelines(session: DB, village_id: Annotated[str | None, Query()] = None):
    """Pipelines ranked by inspection priority. The score is explainable and is not a failure probability."""
    area_ids = _area_ids(session, village_id)
    stmt = select(m.Asset).where(m.Asset.type == "pipeline")
    if area_ids is not None:
        stmt = stmt.where(m.Asset.service_area_id.in_(area_ids))
    rows = []
    for a in session.scalars(stmt.order_by(m.Asset.ord)):
        rows.append({"asset": rm.asset(a), "profile": rm.pipeline_profile(session.get(m.PipelineProfile, a.id)), "risk": rm.risk_for(session, a.id)})
    return sorted(rows, key=lambda r: r["risk"]["score"], reverse=True)


@app.get(f"{API}/pipelines/{{asset_id}}")
def pipeline(asset_id: str, session: DB):
    a = session.get(m.Asset, asset_id)
    profile = session.get(m.PipelineProfile, asset_id)
    if a is None or profile is None:
        raise HTTPException(404, f"Unknown pipeline {asset_id}")
    return {
        "asset": rm.asset(a),
        "profile": rm.pipeline_profile(profile),
        "risk": rm.risk_for(session, asset_id),
        "repairs": [rm.repair(r) for r in rm._rows(session, m.Repair, m.Repair.asset_id == asset_id)],
        "inspections": [rm.inspection(i) for i in rm._rows(session, m.Inspection, m.Inspection.asset_id == asset_id)],
    }


@app.get(f"{API}/alerts")
def alerts(session: DB, village_id: Annotated[str | None, Query()] = None):
    area_ids = _area_ids(session, village_id)
    rows = rm._rows(session, m.Alert, *([m.Alert.service_area_id.in_(area_ids)] if area_ids is not None else []))
    return [rm.alert(a) for a in rows]


