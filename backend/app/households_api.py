"""Household-level monitoring and the villager's daily service validation (feedback from the phone)."""

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import fhtc, quality
from . import models as m
from .auth import CurrentUser, require_roles, village_ids_of
from .db import get_session

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(get_session)]
IST = timezone(timedelta(hours=5, minutes=30))


class Quantity(str, Enum):
    ENOUGH = "ENOUGH"
    LOW = "LOW"
    NONE = "NONE"


class Appearance(str, Enum):
    CLEAR = "CLEAR"
    COLOURED = "COLOURED"
    SMELL = "SMELL"
    OTHER = "OTHER"


class ServiceCheckBody(BaseModel):
    got_water: bool
    quantity: Quantity | None = Field(default=None, description="ENOUGH or LOW when water came; leave out when it did not")
    quality: Appearance | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = Field(default=None, max_length=200)


def _now() -> datetime:
    return datetime.now(IST)


def _household_for(user: m.User) -> str:
    if not user.household_id:
        raise HTTPException(409, "Your account is not linked to a household yet. Ask your Gram Panchayat.")
    return user.household_id


def _scoped_household(session: Session, user: m.User, household_id: str) -> dict:
    """A household's detail, only for officials of its village."""
    parsed = fhtc.parse_household_id(household_id)
    area = session.get(m.ServiceArea, parsed[0]) if parsed else None
    if area is None or area.village_id not in village_ids_of(user):
        raise HTTPException(404, f"Unknown household {household_id}")
    detail = fhtc.household_detail(session, household_id, _now())
    if detail is None:
        raise HTTPException(404, f"Unknown household {household_id}")
    return detail


# ---------- the villager ----------

@router.post("/service-checks", status_code=201)
def submit_check(body: ServiceCheckBody, user: CurrentUser, session: DB):
    """Today's service validation for the villager's own household: did water come, how much, how did it look.
    A second submission the same day replaces the first."""
    require_roles(user, "citizen")
    household = _household_for(user)
    if body.got_water:
        if body.quantity not in (Quantity.ENOUGH, Quantity.LOW):
            raise HTTPException(422, "If water came, say whether it was enough or low")
        quantity, appearance = body.quantity.value, (body.quality.value if body.quality else None)
    else:
        quantity, appearance = "NONE", None  # no water means nothing to describe
    day = fhtc.today_ist(_now())
    now = _now().isoformat(timespec="seconds")
    row = session.scalars(select(m.ServiceCheck).where(m.ServiceCheck.user_id == user.id, m.ServiceCheck.day == day)).first()
    fields = dict(got_water=body.got_water, quantity=quantity, quality=appearance, rating=body.rating, comment=(body.comment or "").strip() or None, created_at=now)
    if row is None:
        row = m.ServiceCheck(user_id=user.id, household_id=household, service_area_id=user.service_area_id, day=day, **fields)
        session.add(row)
    else:
        for k, v in fields.items():
            setattr(row, k, v)
    session.add(m.AuditLog(at=now, actor_id=user.id, action="submit", entity="service_check", entity_id=household, details={"day": day, "got_water": body.got_water, "quantity": quantity}))
    session.commit()
    session.refresh(row)
    return {**fhtc.check_out(row), "household": household}


@router.get("/service-checks/mine")
def my_checks(user: CurrentUser, session: DB):
    require_roles(user, "citizen")
    household = _household_for(user)
    rows = session.scalars(select(m.ServiceCheck).where(m.ServiceCheck.user_id == user.id).order_by(m.ServiceCheck.day.desc())).all()[:14]
    day = fhtc.today_ist(_now())
    return {"household": household, "today": next((fhtc.check_out(c) for c in rows if c.day == day), None), "history": [fhtc.check_out(c) for c in rows]}


@router.get("/households/mine")
def my_household(user: CurrentUser, session: DB):
    """The villager's own tap: its status, how it was decided, and the zone's water-quality screen result."""
    require_roles(user, "citizen")
    detail = fhtc.household_detail(session, _household_for(user), _now())
    if detail is None:
        raise HTTPException(404, "Your household is not in the zone register")
    return {
        "household": detail["household"], "tap_id": detail["tap_id"], "zone": detail["zone"], "status": detail["status"], "status_source": detail["status_source"],
        "lpcd": detail["lpcd"], "checked_day": detail["checked_day"], "is_simulated": True,
        "checks": [fhtc.check_out(c) for c in session.scalars(select(m.ServiceCheck).where(m.ServiceCheck.user_id == user.id).order_by(m.ServiceCheck.day.desc())).all()[:14]],
        "water_quality": quality.zone_summary(session, detail["service_area_id"]),
    }


# ---------- Gram Panchayat and officers ----------

@router.get("/households")
def list_households(
    user: CurrentUser,
    session: DB,
    zone: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query(pattern="^(FUNCTIONAL|PARTIAL|NON_FUNCTIONAL)$")] = None,
    limit: Annotated[int, Query(ge=1, le=300)] = 100,
):
    """Household taps in the zones the user oversees, worst first. Filter by zone or status."""
    require_roles(user, "gp", "officer")
    now = _now()
    areas = [a for a in session.scalars(select(m.ServiceArea).order_by(m.ServiceArea.ord)) if a.village_id in village_ids_of(user) and (zone is None or a.id == zone)]
    if zone and not areas:
        raise HTTPException(404, "Unknown zone")
    rows = []
    for a in areas:
        rows += [{**h, "service_area_id": a.id, "zone": a.name} for h in fhtc.homes(session, a, now)]
    if status:
        rows = [h for h in rows if h["status"] == status]
    order = {"NON_FUNCTIONAL": 0, "PARTIAL": 1, "FUNCTIONAL": 2}
    rows.sort(key=lambda h: (order[h["status"]], h["lpcd"]))
    return {"total": len(rows), "households": rows[:limit]}


@router.get("/households/{household_id}")
def get_household(household_id: str, user: CurrentUser, session: DB):
    require_roles(user, "gp", "officer")
    detail = _scoped_household(session, user, household_id)
    if user.role != "gp":  # officers see the pattern, not villagers' free-text comments
        detail["checks"] = [{k: v for k, v in c.items() if k != "comment"} for c in detail["checks"]]
    return detail
