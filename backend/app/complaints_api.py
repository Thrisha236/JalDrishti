"""Stage 5: demo sign-in, complaint submission with secure photo upload, and role-checked access."""

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from . import models as m
from . import integrations, photos
from . import read_model as rm
from .auth import CurrentUser, require_roles, village_ids_of
from .db import get_session

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(get_session)]
IST = timezone(timedelta(hours=5, minutes=30))
FIRST_CODE = 2048
DUPLICATE_WINDOW = timedelta(hours=6)


class Category(str, Enum):
    NO_WATER = "NO_WATER"
    LOW_WATER = "LOW_WATER"
    DIRTY_WATER = "DIRTY_WATER"
    BAD_SMELL = "BAD_SMELL"
    LEAKAGE = "LEAKAGE"
    DAMAGED_TAP = "DAMAGED_TAP"
    OTHER = "OTHER"


class Channel(str, Enum):
    """How the villager reported. Missed-call (IVR) and WhatsApp let people without a smartphone app report;
    in the prototype those channels are simulated in the app and post here as the signed-in villager."""
    APP = "APP"
    MISSED_CALL = "MISSED_CALL"
    WHATSAPP = "WHATSAPP"


def _now() -> str:
    return datetime.now(IST).isoformat(timespec="seconds")


def _audit(session: Session, actor: m.User, action: str, entity: str, entity_id: str, details: dict | None = None) -> None:
    session.add(m.AuditLog(at=_now(), actor_id=actor.id, action=action, entity=entity, entity_id=entity_id, details=details))


def _next_code(session: Session) -> str:
    """Lowest unused complaint number from 2048 upwards."""
    used = {int(c) for c in session.scalars(select(m.Complaint.public_code)) if c.isdigit()}
    n = FIRST_CODE
    while n in used:
        n += 1
    return str(n)


def _coarse_location(area: m.ServiceArea) -> dict:
    """The service area's centre: deliberately coarse, so no household can be pinpointed."""
    xs = [p[0] for p in area.polygon]
    ys = [p[1] for p in area.polygon]
    return {"x": round(sum(xs) / len(xs)), "y": round(sum(ys) / len(ys)), "precision": "approx_1km"}


GEO_ROUND_M = 25  # a geo-tagged report is rounded to the nearest 25 m: enough to find the lane, not the door


def _inside(point: tuple[float, float], polygon: list) -> bool:
    """Ray-casting point-in-polygon test, in the plan's metre coordinates."""
    x, y = point
    hit = False
    for (xi, yi), (xj, yj) in zip(polygon, polygon[-1:] + polygon[:-1]):
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
    return hit


def _geotag(area: m.ServiceArea, x: float, y: float) -> dict:
    """An opt-in precise location for a report, checked to be inside the villager's own area and then rounded."""
    if not _inside((x, y), area.polygon):
        raise HTTPException(422, "That spot is outside your area. Mark a place inside it, or share the area only.")
    r = GEO_ROUND_M
    return {"x": round(x / r) * r, "y": round(y / r) * r, "precision": "approx_25m"}


def _can_view(user: m.User, c: m.Complaint, session: Session) -> bool:
    if user.role == "citizen":
        return c.citizen_id == user.id
    if user.role in ("gp", "officer"):
        area = session.get(m.ServiceArea, c.service_area_id)
        return area.village_id in village_ids_of(user)
    return False


# ---------- complaints ----------

@router.post("/complaints", status_code=201)
async def create_complaint(
    user: CurrentUser,
    session: DB,
    category: Annotated[Category, Form()],
    service_area_id: Annotated[str, Form()],
    description: Annotated[str | None, Form(max_length=200)] = None,
    share_location: Annotated[bool, Form()] = True,
    photo: Annotated[UploadFile | None, File()] = None,
    channel: Annotated[Channel, Form()] = Channel.APP,
    geo_x: Annotated[float | None, Form()] = None,
    geo_y: Annotated[float | None, Form()] = None,
    geotag_consent: Annotated[bool, Form()] = False,
):
    require_roles(user, "citizen")
    area = session.get(m.ServiceArea, service_area_id)
    if area is None or area.village_id != user.village_id:
        raise HTTPException(422, "Choose an area in your own village")

    since = (datetime.now(IST) - DUPLICATE_WINDOW).isoformat(timespec="seconds")
    recent = session.scalars(
        select(m.Complaint).where(
            m.Complaint.citizen_id == user.id,
            m.Complaint.category == category.value,
            m.Complaint.service_area_id == service_area_id,
            m.Complaint.created_at >= since,
        )
    ).first()
    if recent is not None:
        raise HTTPException(409, f"You already reported this problem as #{recent.public_code}")

    storage_key = None
    if photo is not None and photo.filename:
        storage_key = photos.clean_and_store(await photos.read_limited(photo))

    code = _next_code(session)
    if (geo_x is None) != (geo_y is None):
        raise HTTPException(422, "Send both coordinates of the spot, or neither")
    if geo_x is not None:
        if not geotag_consent:
            raise HTTPException(422, "A precise location is only stored if you agree to it (geotag_consent)")
        if not share_location:
            raise HTTPException(422, "You chose not to share a location, so a spot cannot be stored")
        location = _geotag(area, geo_x, geo_y)
    else:
        location = _coarse_location(area) if share_location else {"x": None, "y": None, "precision": "not_shared"}
    order = session.query(m.Complaint).count() + 1000
    session.add(
        m.Complaint(
            public_code=code, ord=order, citizen_id=user.id, service_area_id=service_area_id, category=category.value,
            description=(description or "").strip() or None, created_at=_now(), location=location,
            linked_asset_id=None, is_simulated=False, channel=channel.value,
        )
    )
    session.flush()
    if storage_key:
        media_id = f"m-{storage_key[:12]}"
        session.add(m.ComplaintMedia(id=media_id, ord=0, complaint_code=code, file=storage_key, note=None, exif_stripped=True))
        session.flush()
        obs_code, message = photos.simulated_observation(category.value)
        session.add(
            m.ImageAnalysis(
                media_id=media_id, ord=order, engine="simulated-v0", is_simulated=True,
                observation_code=obs_code, message=message, disclaimer=photos.DISCLAIMER,
            )
        )
    session.flush()
    integrations.on_complaint(session, session.get(m.Complaint, code), "RECEIVED")
    _audit(session, user, "create", "complaint", code, {"category": category.value, "service_area_id": service_area_id, "has_photo": bool(storage_key), "channel": channel.value})
    session.commit()
    return rm.complaint_with_analysis(session, session.get(m.Complaint, code))


@router.get("/complaints/mine")
def my_complaints(user: CurrentUser, session: DB):
    require_roles(user, "citizen")
    rows = session.scalars(select(m.Complaint).where(m.Complaint.citizen_id == user.id).order_by(m.Complaint.created_at.desc())).all()
    return [rm.complaint_with_analysis(session, c) for c in rows]


@router.get("/complaints")
def complaints(user: CurrentUser, session: DB, village_id: Annotated[str | None, Query()] = None):
    """Complaint inbox for Gram Panchayat and officers, limited to the villages they are responsible for."""
    require_roles(user, "gp", "officer")
    allowed = village_ids_of(user)
    if village_id is not None:
        if village_id not in allowed:
            raise HTTPException(403, "Not your village")
        allowed = {village_id}
    area_ids = list(session.scalars(select(m.ServiceArea.id).where(m.ServiceArea.village_id.in_(allowed))))
    rows = session.scalars(select(m.Complaint).where(m.Complaint.service_area_id.in_(area_ids)).order_by(m.Complaint.created_at)).all()
    return [rm.complaint_with_analysis(session, c) for c in rows]


@router.get("/complaints/{code}")
def complaint(code: str, user: CurrentUser, session: DB):
    c = session.get(m.Complaint, code)
    if c is None or not _can_view(user, c, session):
        raise HTTPException(404, "Complaint not found")  # 404, not 403: don't reveal that it exists
    return rm.complaint_with_analysis(session, c)


@router.get("/media/{media_id}")
def media(media_id: str, user: CurrentUser, session: DB):
    """Serve a complaint photo only to its owner, or to GP/officers responsible for that village."""
    item = session.get(m.ComplaintMedia, media_id)
    c = session.get(m.Complaint, item.complaint_code) if item else None
    if item is None or c is None or not item.file or not _can_view(user, c, session):
        raise HTTPException(404, "Photo not found")
    path = photos.path_for(item.file)
    if not path.exists():
        raise HTTPException(404, "Photo not found")
    _audit(session, user, "view", "media", media_id)
    session.commit()
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


# ---------- demo ----------

@router.post("/demo/reset")
def demo_reset(user: CurrentUser, session: DB):
    """Reload the seed and delete uploaded photos, so the demo story can be run again. Demo mode only."""
    if not config.DEMO_MODE:
        raise HTTPException(404, "Not found")
    from .seed_loader import reset_database

    bind = session.get_bind()
    session.close()  # release this request's connection before tables are dropped (SQLite locks otherwise)
    reset_database(bind=bind)
    return {"status": "reset", "by": user.id}
