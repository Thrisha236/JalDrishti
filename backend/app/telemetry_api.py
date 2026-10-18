"""Stage 6: sensor telemetry. Nodes (the simulator now, ESP32 nodes via the gateway later) post readings;
the dashboard reads them back. No alert rules yet; those arrive in Stage 7."""

import hmac
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from . import models as m
from . import read_model as rm
from . import integrations, rules
from . import verification
from .auth import CurrentUser
from .db import get_session

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(get_session)]
IST = timezone(timedelta(hours=5, minutes=30))

# Physically possible ranges per sensor kind. Values outside are stored but flagged.
PHYSICAL_RANGE = {
    "pump_current": (0.0, 60.0),  # A
    "tank_level": (0.0, 10.0),  # m
    "flow": (0.0, 1000.0),  # L/min
    "pressure": (0.0, 16.0),  # bar
}
MAX_REPLAY_AGE = timedelta(days=7)  # a gateway may replay buffered readings after a network outage
MAX_CLOCK_SKEW = timedelta(minutes=5)


class ReadingIn(BaseModel):
    sensor_id: str
    value: float


class ReadingBatch(BaseModel):
    node_id: str
    ts: datetime | None = Field(default=None, description="When the readings were taken; defaults to arrival time")
    battery_v: float | None = None
    readings: list[ReadingIn] = Field(min_length=1, max_length=50)


def _now() -> datetime:
    return datetime.now(IST)


def _iso(dt: datetime) -> str:
    return dt.astimezone(IST).isoformat(timespec="seconds")


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts)


@router.post("/ingest/readings", status_code=201)
def ingest(batch: ReadingBatch, session: DB, x_device_key: Annotated[str | None, Header()] = None):
    """Accept a batch of readings from one node. The node proves who it is with its device key."""
    expected = config.DEVICE_KEYS.get(batch.node_id)
    if expected is None or x_device_key is None or not hmac.compare_digest(expected, x_device_key):
        raise HTTPException(401, "Unknown node or wrong device key")
    node = session.get(m.SensorNode, batch.node_id)
    if node is None:
        raise HTTPException(404, f"Node {batch.node_id} is not registered")

    now = _now()
    taken = batch.ts.astimezone(IST) if batch.ts and batch.ts.tzinfo else (batch.ts.replace(tzinfo=IST) if batch.ts else now)
    if taken > now + MAX_CLOCK_SKEW:
        raise HTTPException(422, "Reading timestamp is in the future; check the node's clock")
    if taken < now - MAX_REPLAY_AGE:
        raise HTTPException(422, "Reading is older than 7 days")

    sensors = {s.id: s for s in session.scalars(select(m.Sensor).where(m.Sensor.node_id == node.id))}
    flagged = 0
    for r in batch.readings:
        sensor = sensors.get(r.sensor_id)
        if sensor is None:
            raise HTTPException(422, f"Sensor {r.sensor_id} does not belong to {node.id}")
        lo, hi = PHYSICAL_RANGE.get(sensor.kind, (float("-inf"), float("inf")))
        flag = "ok" if lo <= r.value <= hi else "out_of_range"
        flagged += flag != "ok"
        session.add(m.Reading(sensor_id=sensor.id, ts=_iso(taken), value=r.value, quality_flag=flag))

    # last_seen is when the node last reached us, even if it replays old readings.
    node.last_seen_at = _iso(now)
    if batch.battery_v is not None:
        node.battery_v = batch.battery_v
    session.commit()
    changes = rules.evaluate(session, now)
    verified = verification.check_open(session, now)
    integrations.auto_push(session, now)  # mock IMIS / JJM Dashboard / WQMIS feeds, about once a minute
    return {"accepted": len(batch.readings), "flagged": flagged, "node_id": node.id, "ts": _iso(taken), "alerts": changes, "verified": verified}


@router.get("/readings")
def readings(
    _user: CurrentUser,
    session: DB,
    sensor_id: Annotated[str, Query()],
    minutes: Annotated[int, Query(ge=1, le=1440)] = 10,
    limit: Annotated[int, Query(ge=1, le=2000)] = 500,
):
    """Recent readings for one sensor, oldest first (ready to chart)."""
    if session.get(m.Sensor, sensor_id) is None:
        raise HTTPException(404, f"Unknown sensor {sensor_id}")
    since = _iso(_now() - timedelta(minutes=minutes))
    rows = session.scalars(
        select(m.Reading).where(m.Reading.sensor_id == sensor_id, m.Reading.ts >= since).order_by(m.Reading.ts.desc(), m.Reading.id.desc()).limit(limit)
    ).all()
    return [{"ts": r.ts, "value": r.value, "quality_flag": r.quality_flag} for r in reversed(rows)]


def node_status(node: m.SensorNode, now: datetime | None = None) -> dict:
    now = now or _now()
    if node.last_seen_at is None:
        return {"status": "never_reported", "seconds_since": None}
    age = (now - _parse(node.last_seen_at)).total_seconds()
    return {"status": "online" if age <= config.NODE_OFFLINE_AFTER_SECONDS else "offline", "seconds_since": round(age)}


@router.get("/telemetry/live")
def live(_user: CurrentUser, session: DB):
    """Node health and the latest value of every sensor. 'offline' means the node stopped reporting:
    an equipment problem, which must not be read as a water-supply problem."""
    now = _now()
    nodes = session.scalars(select(m.SensorNode).order_by(m.SensorNode.ord)).all()
    out_nodes = [
        {"id": n.id, "code": n.code, "location": n.location, "power": n.power, "last_seen_at": n.last_seen_at, "battery_v": n.battery_v, **node_status(n, now)}
        for n in nodes
    ]
    status_by_node = {n["id"]: n["status"] for n in out_nodes}
    out_sensors = []
    for s in session.scalars(select(m.Sensor).order_by(m.Sensor.ord)):
        latest = session.scalars(select(m.Reading).where(m.Reading.sensor_id == s.id).order_by(m.Reading.ts.desc(), m.Reading.id.desc()).limit(1)).first()
        out_sensors.append(
            {
                "id": s.id, "node_id": s.node_id, "kind": s.kind, "position": s.position, "unit": s.unit,
                "baseline": s.baseline, "normal_band": [s.band_low, s.band_high],
                "node_status": status_by_node[s.node_id],
                "latest": {"ts": latest.ts, "value": latest.value, "quality_flag": latest.quality_flag} if latest else None,
            }
        )
    return {"server_time": _iso(now), "offline_after_seconds": config.NODE_OFFLINE_AFTER_SECONDS, "nodes": out_nodes, "sensors": out_sensors}


SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


def _live_alert(a: m.Alert) -> dict:
    return {**rm.alert(a), "rule_code": a.rule_code, "cleared_at": a.cleared_at}


@router.get("/alerts/active")
def active_alerts(_user: CurrentUser, session: DB):
    """Open alerts from the rules engine (scripted story alerts excluded). Re-evaluates first, so a node that
    has gone silent is noticed even when no new readings arrive."""
    rules.evaluate(session)
    rows = session.scalars(select(m.Alert).where(m.Alert.is_simulated.is_(False), m.Alert.cleared_at.is_(None))).all()
    rows = sorted(rows, key=lambda a: (a.kind != "WATER_SERVICE", SEVERITY_ORDER.get(a.severity, 9), a.raised_at))
    return [_live_alert(a) for a in rows]


@router.get("/alerts/recent")
def recent_alerts(_user: CurrentUser, session: DB, minutes: Annotated[int, Query(ge=1, le=1440)] = 60):
    """Live alerts raised in the last `minutes`, open or cleared, newest first."""
    since = _iso(_now() - timedelta(minutes=minutes))
    rows = session.scalars(
        select(m.Alert).where(m.Alert.is_simulated.is_(False), m.Alert.raised_at >= since).order_by(m.Alert.raised_at.desc(), m.Alert.ord.desc())
    ).all()
    return [_live_alert(a) for a in rows]
