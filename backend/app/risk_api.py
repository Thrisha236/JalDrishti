"""Stage 8: risk served by the backend, with versioned, validated, auditable scoring rules."""

import copy
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from . import read_model as rm
from .auth import CurrentUser, require_roles
from .db import get_session

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(get_session)]
IST = timezone(timedelta(hours=5, minutes=30))
FACTORS = ("age", "prior_failures", "corrosion_observation", "pressure_per_flow_trend", "material_susceptibility")


class NewRiskConfig(BaseModel):
    note: str = Field(min_length=5, max_length=300, description="Why the rules are changing (kept in the audit trail)")
    config: dict[str, Any]


def validate_risk_config(cfg: dict) -> list[str]:
    """Return a list of problems; empty means the config is safe to activate."""
    problems = []
    factors = cfg.get("factors", {})
    if set(factors) != set(FACTORS):
        return [f"factors must be exactly: {', '.join(FACTORS)}"]
    caps = {k: factors[k].get("max") for k in FACTORS}
    if any(not isinstance(v, (int, float)) or v < 0 for v in caps.values()):
        problems.append("every factor needs a non-negative max")
    elif sum(caps.values()) != 100:
        problems.append(f"factor maxima must add up to 100 (they add up to {sum(caps.values())})")

    age = factors["age"]
    if not 0 <= age.get("start_years", -1) < age.get("full_years", -1):
        problems.append("age: start_years must be at least 0 and below full_years")
    if not 0 <= age.get("estimate_multiplier", -1) <= 1:
        problems.append("age: estimate_multiplier must be between 0 and 1")
    pf = factors["prior_failures"]
    if any(v > pf.get("max", 0) or v < 0 for v in pf.get("points_by_count", {}).values()):
        problems.append("prior_failures: points must be between 0 and max")
    for name in ("corrosion_observation", "pressure_per_flow_trend"):
        if any(b["points"] > factors[name]["max"] or b["points"] < 0 for b in factors[name].get("bands", [])):
            problems.append(f"{name}: band points must be between 0 and max")
    mat = factors["material_susceptibility"]
    if "unknown" not in mat.get("points_by_material", {}):
        problems.append("material_susceptibility: an 'unknown' entry is required")
    if any(v > mat.get("max", 0) or v < 0 for v in mat.get("points_by_material", {}).values()):
        problems.append("material_susceptibility: points must be between 0 and max")

    bands = sorted(cfg.get("bands", []), key=lambda b: b.get("min", 0))
    if not bands or bands[0].get("min") != 0 or bands[-1].get("max") != 100:
        problems.append("bands must start at 0 and end at 100")
    elif any(a["max"] + 1 != b["min"] for a, b in zip(bands, bands[1:])):
        problems.append("bands must be contiguous with no gaps or overlaps")
    if {b.get("band") for b in bands} != {"LOW", "MEDIUM", "HIGH"}:
        problems.append("bands must be LOW, MEDIUM and HIGH")
    if "not a failure probability" not in cfg.get("statement", ""):
        problems.append("statement must keep saying the score is not a failure probability")
    return problems


def _version_row(r: m.RiskConfig) -> dict:
    return {"version": r.version, "created_at": r.created_at, "created_by": r.created_by, "note": r.note, "is_active": r.is_active, "config": r.config}


@router.get("/pipelines/{asset_id}/risk")
def pipeline_risk(asset_id: str, session: DB):
    """The score in use, the data source of every factor, recorded-vs-live comparison and what-if checks."""
    risk = rm.risk_for(session, asset_id)
    if risk is None:
        raise HTTPException(404, f"Unknown pipeline {asset_id}")
    return risk


@router.get("/risk/config")
def active_config(session: DB):
    row = session.scalars(select(m.RiskConfig).where(m.RiskConfig.is_active.is_(True))).one()
    return _version_row(row)


@router.get("/risk/config/versions")
def config_versions(session: DB):
    return [_version_row(r) for r in session.scalars(select(m.RiskConfig).order_by(m.RiskConfig.ord.desc()))]


@router.post("/risk/config", status_code=201)
def create_config(body: NewRiskConfig, user: CurrentUser, session: DB):
    """Officers publish a new version of the scoring rules. It becomes active immediately; old versions stay."""
    require_roles(user, "officer")
    cfg = copy.deepcopy(body.config)
    count = session.query(m.RiskConfig).count()
    cfg["version"] = f"risk-v0.{count + 1}"
    problems = validate_risk_config(cfg)
    if problems:
        raise HTTPException(422, {"message": "Risk rules not accepted", "problems": problems})
    now = datetime.now(IST).isoformat(timespec="seconds")
    for r in session.scalars(select(m.RiskConfig).where(m.RiskConfig.is_active.is_(True))):
        r.is_active = False
    session.add(m.RiskConfig(version=cfg["version"], ord=count, created_at=now, created_by=user.id, note=body.note, config=cfg, is_active=True))
    session.add(m.AuditLog(at=now, actor_id=user.id, action="create", entity="risk_config", entity_id=cfg["version"], details={"note": body.note}))
    session.commit()
    return _version_row(session.get(m.RiskConfig, cfg["version"]))


@router.post("/risk/config/{version}/activate")
def activate_config(version: str, user: CurrentUser, session: DB):
    """Roll back (or forward) to an existing version."""
    require_roles(user, "officer")
    target = session.get(m.RiskConfig, version)
    if target is None:
        raise HTTPException(404, f"Unknown risk rules version {version}")
    for r in session.scalars(select(m.RiskConfig).where(m.RiskConfig.is_active.is_(True))):
        r.is_active = False
    target.is_active = True
    now = datetime.now(IST).isoformat(timespec="seconds")
    session.add(m.AuditLog(at=now, actor_id=user.id, action="activate", entity="risk_config", entity_id=version, details=None))
    session.commit()
    return _version_row(target)
