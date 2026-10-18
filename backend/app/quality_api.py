"""Water-quality field tests through the API: log a test, list results, and the zone status villagers see."""

from datetime import date as Date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import integrations, quality, rules
from . import models as m
from . import read_model as rm
from .auth import CurrentUser, require_roles, village_ids_of
from .db import get_session

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(get_session)]
MAX_AGE_DAYS = 365


class QualityTestBody(BaseModel):
    point_id: str
    date: Date | None = Field(default=None, description="Defaults to today; cannot be in the future")
    tester: str = Field(min_length=2, max_length=40)
    values: dict[str, float | str | None]


def _point_village(session: Session, point: m.WaterQualityPoint) -> str:
    """The village a test point belongs to: its zone's, or its asset's zone's (for the source and the tank)."""
    area_id = point.service_area_id or session.get(m.Asset, point.asset_id).service_area_id
    return session.get(m.ServiceArea, area_id).village_id


def _next_id(session: Session) -> str:
    used = {int(i[3:]) for i in session.scalars(select(m.WaterQualityTest.id)) if i.startswith("qt-") and i[3:].isdigit()}
    n = 1
    while n in used:
        n += 1
    return f"qt-{n}"


@router.get("/water-quality")
def list_quality(user: CurrentUser, session: DB, limit: Annotated[int, Query(ge=1, le=500)] = 100):
    """Points with their latest verdict, the recent tests, and the status of every zone (Gram Panchayat and officers)."""
    require_roles(user, "gp", "officer")
    villages = village_ids_of(user)
    points = [p for p in session.scalars(select(m.WaterQualityPoint).order_by(m.WaterQualityPoint.ord)) if _point_village(session, p) in villages]
    by_id = {p.id: p for p in points}
    latest = quality.latest_by_point(session)
    tests = [t for t in session.scalars(select(m.WaterQualityTest).order_by(m.WaterQualityTest.date.desc(), m.WaterQualityTest.ord.desc())) if t.point_id in by_id][:limit]
    areas = [a for a in session.scalars(select(m.ServiceArea).order_by(m.ServiceArea.ord)) if a.village_id in villages]
    meta = rm.config(session, "water_quality_meta")
    return {
        "standard": meta["standard"], "note": meta["note"], "disclaimer": quality.DISCLAIMER,
        "parameters": [{"id": pid, "label": p["label"], "unit": p["unit"], "kind": p["kind"]} for pid, p in quality.PARAMS.items()],
        "points": [
            {"id": p.id, "label": p.label, "type": p.type, "service_area_id": p.service_area_id, "sensor_code": p.sensor_code,
             "latest": quality.test_out(latest[p.id], p) if p.id in latest else None}
            for p in points
        ],
        "tests": [quality.test_out(t, by_id[t.point_id]) for t in tests],
        "zones": {a.id: quality.zone_summary(session, a.id) for a in areas},
    }


@router.get("/water-quality/summary")
def zone_status(user: CurrentUser, session: DB, zone: Annotated[str | None, Query()] = None):
    """The status of one zone. A villager gets their own zone; no measurements are shown, only the verdict and date."""
    if user.role == "citizen":
        zone = user.service_area_id
    elif zone is None:
        raise HTTPException(422, "Say which zone (zone=...)")
    area = session.get(m.ServiceArea, zone) if zone else None
    if area is None or area.village_id not in village_ids_of(user):
        raise HTTPException(404, "Unknown zone")
    return quality.zone_summary(session, area.id)


@router.post("/water-quality/tests", status_code=201)
def log_test(body: QualityTestBody, user: CurrentUser, session: DB):
    """A trained tester's field-test-kit result. Judged on the server; a failed tap test raises an alert and a boil-water advisory."""
    require_roles(user, "gp")
    point = session.get(m.WaterQualityPoint, body.point_id)
    if point is None or _point_village(session, point) not in village_ids_of(user):
        raise HTTPException(404, f"Unknown test point {body.point_id}")
    when = body.date or Date.today()
    if when > Date.today():
        raise HTTPException(422, "The test date cannot be in the future")
    if when < Date.today() - timedelta(days=MAX_AGE_DAYS):
        raise HTTPException(422, "The test date is more than a year ago")
    try:
        values = quality.validate_values(body.values)
    except ValueError as err:
        raise HTTPException(422, str(err)) from err

    previous = quality.latest_by_point(session).get(point.id)
    status, issues = quality.verdict(point.type, values)
    now = quality.now()
    test = m.WaterQualityTest(
        id=_next_id(session), ord=1000 + session.query(m.WaterQualityTest).count(), point_id=point.id, date=when.isoformat(),
        tester=body.tester.strip(), values=values, verdict=status, issues=issues, created_by=user.id,
        created_at=now.isoformat(timespec="seconds"), is_mock=False,
    )
    session.add(test)
    session.flush()
    advised = quality.advise(session, point, previous.verdict if previous else None, status, now)
    session.add(m.AuditLog(at=now.isoformat(timespec="seconds"), actor_id=user.id, action="log", entity="water_quality_test", entity_id=test.id, details={"point": point.id, "verdict": status, "advisories": advised}))
    integrations.on_quality_test(session, test, point, now)
    session.commit()
    rules.evaluate(session)  # a failed test becomes an alert straight away
    return {**quality.test_out(test, point), "advisories_sent": advised}
