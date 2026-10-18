"""Stage 12: AI early warning, tap-connection monitoring and the (mock) integration hub, as API endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import fhtc, integrations, ml
from . import models as m
from .auth import CurrentUser, require_roles, village_ids_of
from .db import get_session

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(get_session)]


@router.get("/predictions")
def get_predictions(user: CurrentUser, session: DB):
    """Anomaly detection, disruption forecasts, the water-quality outlook and the failure outlook."""
    require_roles(user, "gp", "officer")
    return ml.predictions(session, village_ids_of(user))


@router.get("/fhtc")
def get_fhtc(user: CurrentUser, session: DB):
    """Estimated functionality of every household tap connection, by zone and village, from live readings."""
    require_roles(user, "gp", "officer")
    return fhtc.summary(session, village_ids_of(user))


@router.get("/integrations")
def get_integrations(user: CurrentUser, session: DB):
    require_roles(user, "gp", "officer")
    return {"mock": True, "notice": integrations.NOTICE, "connectors": integrations.overview(session)}


@router.get("/integrations/crosswalk")
def get_crosswalk(user: CurrentUser, session: DB):
    """Our village, service-area and scheme IDs next to the national (mock) IDs they are keyed on."""
    require_roles(user, "gp", "officer")
    return {"mock": True, "notice": integrations.NOTICE, "villages": integrations.crosswalk(session, village_ids_of(user))}


@router.get("/integrations/events")
def get_events(
    user: CurrentUser,
    session: DB,
    connector: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 40,
):
    require_roles(user, "gp", "officer")
    stmt = select(m.IntegrationEvent).order_by(m.IntegrationEvent.id.desc()).limit(limit)
    if connector:
        stmt = stmt.where(m.IntegrationEvent.connector == connector)
    return [integrations.event(e) for e in session.scalars(stmt)]


@router.post("/integrations/sync")
def post_sync(user: CurrentUser, session: DB):
    """Run every mock connector once, now. Nothing is sent outside this server."""
    require_roles(user, "gp", "officer")
    return integrations.sync(session)
