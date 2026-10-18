"""Stage 12: the integration hub. MOCK connectors for the national water platforms.

JalRakshak is meant to feed, and be keyed by, the platforms that already exist: Sujal Gaon / Sujalam Bharat
(village, scheme and asset IDs), IMIS (incidents and monitoring), the JJM Dashboard (tap functionality) and
WQMIS (water-quality sampling). Real access needs authorisation and the official specifications, which we do
not have. So every connector here is SIMULATED: messages are built in an illustrative format, "accepted" by a
mock endpoint and written to a log. Nothing leaves this server, and every screen says so.

What this shows honestly is the data flow: which ID is used as the key, what is sent, when, and what comes back.
Replacing a mock connector with a real one means swapping the `deliver` step; the crosswalk, the message
building and the audit log stay."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import fhtc, ml
from . import models as m

IST = timezone(timedelta(hours=5, minutes=30))
MONITORING_EVERY_SECONDS = 60
NOTICE = (
    "MOCK CONNECTORS. No real government system is contacted. Messages use an illustrative format, not the official "
    "IMIS or Sujalam Bharat schema, and every ID is a demo value. Real integration needs authorised access and the official specification."
)

CONNECTORS = {
    "sujal_gaon": {
        "name": "Sujal Gaon / Sujalam Bharat", "full_name": "Village, scheme and asset registry (IDs and GIS)", "prefix": "SGB", "direction": "PULL",
        "purpose": "The source of IDs. JalRakshak keys every village, service area and scheme on these.",
        "carries": ["Village LGD code", "Sujal Gaon ID per service area", "Sujalam Bharat ID per scheme", "Asset registry"],
    },
    "imis": {
        "name": "IMIS", "full_name": "JJM Integrated Management Information System", "prefix": "IMIS", "direction": "PUSH",
        "purpose": "Receives service incidents with their repair status, and monitoring snapshots, against the scheme and Sujal Gaon ID.",
        "carries": ["Incidents and repair status", "Sensor monitoring snapshots per service area"],
    },
    "jjm_dashboard": {
        "name": "JJM Dashboard", "full_name": "National tap-connection functionality reporting", "prefix": "JJMD", "direction": "PUSH",
        "purpose": "Receives how many household taps are functional, partly functional or not working, per village.",
        "carries": ["Functional / partial / non-functional taps per village"],
    },
    "wqmis": {
        "name": "WQMIS", "full_name": "Water Quality Management Information System", "prefix": "WQ", "direction": "PUSH",
        "purpose": "Receives sample requests when the quality outlook says a field-kit test is needed.",
        "carries": ["Sample requests with the pipeline and predicted risk"],
    },
}


def _iso(dt: datetime) -> str:
    return dt.astimezone(IST).isoformat(timespec="seconds")


def _log(session: Session, now: datetime, connector: str, direction: str, entity: str, entity_id: str, version: str, summary: str, payload: dict, trigger: str) -> m.IntegrationEvent:
    """Record one message. `deliver` is where a real connector would call the real API."""
    ev = m.IntegrationEvent(
        at=_iso(now), connector=connector, direction=direction, entity=entity, entity_id=entity_id, version=version,
        status="ACCEPTED_MOCK", external_ref=None, summary=summary, payload={"format": "illustrative", **payload}, trigger=trigger,
    )
    session.add(ev)
    session.flush()
    ev.external_ref = f"{CONNECTORS[connector]['prefix']}-MOCK-{ev.id:06d}"
    return ev


def _push_once(session: Session, now: datetime, connector: str, entity: str, entity_id: str, version: str, summary: str, payload: dict, trigger: str = "auto", direction: str = "PUSH") -> bool:
    """Send only when the state has changed since the last message about this entity."""
    last = session.scalars(
        select(m.IntegrationEvent).where(m.IntegrationEvent.connector == connector, m.IntegrationEvent.entity == entity, m.IntegrationEvent.entity_id == entity_id).order_by(m.IntegrationEvent.id.desc())
    ).first()
    if last is not None and last.version == version:
        return False
    _log(session, now, connector, direction, entity, entity_id, version, summary, payload, trigger)
    return True


# ---------- the ID crosswalk ----------

def crosswalk(session: Session, village_ids: set[str] | None = None) -> list[dict]:
    """Our IDs next to the (mock) national ones, village by village."""
    out = []
    for v in session.scalars(select(m.Village).order_by(m.Village.ord)):
        if village_ids is not None and v.id not in village_ids:
            continue
        schemes = list(session.scalars(select(m.Scheme).where(m.Scheme.village_id == v.id)))
        areas = list(session.scalars(select(m.ServiceArea).where(m.ServiceArea.village_id == v.id).order_by(m.ServiceArea.ord)))
        assets = list(session.scalars(select(m.Asset).where(m.Asset.scheme_id.in_([s.id for s in schemes]))))
        out.append({
            "village_id": v.id, "village": v.name, "lgd_code": v.lgd_code, "district": v.district, "state": v.state,
            "schemes": [{"scheme_id": s.id, "name": s.name, "sujalam_bharat_id": s.sujalam_bharat_id} for s in schemes],
            "service_areas": [{"service_area_id": a.id, "name": a.name, "sujal_gaon_id": a.sujal_gaon_id, "households": a.household_count, "resolved": bool(a.sujal_gaon_id), "note": a.sujal_gaon_note} for a in areas],
            "assets": len(assets), "all_resolved": all(a.sujal_gaon_id for a in areas) and bool(schemes),
        })
    return out


# ---------- incidents (pushed to IMIS as they change) ----------

def on_incident(session: Session, inc: m.Incident, at: datetime | None = None, trigger: str = "auto") -> bool:
    """Called whenever an incident is opened or changes status. Pushes the new state to the mock IMIS."""
    if inc.is_history or not inc.status:
        return False
    now = at or datetime.now(IST)
    area = session.get(m.ServiceArea, inc.service_area_id)
    asset = session.get(m.Asset, inc.asset_id)
    scheme = session.get(m.Scheme, asset.scheme_id)
    village = session.get(m.Village, area.village_id)
    payload = {
        "lgd_code": village.lgd_code, "sujalam_bharat_id": scheme.sujalam_bharat_id, "sujal_gaon_id": area.sujal_gaon_id,
        "incident": {"code": inc.code, "asset": asset.code, "priority": inc.priority, "status": inc.status, "opened_at": inc.opened_at,
                     "closed_at": inc.closed_at, "evidence_score": inc.evidence_score, "probable_cause": inc.probable_cause},
    }
    return _push_once(session, now, "imis", "incident", inc.code, inc.status, f"Incident {inc.code} on {asset.code}: {inc.status.replace('_', ' ').lower()}", payload, trigger)


# ---------- monitoring, functionality, quality (pushed on a schedule) ----------

def _push_monitoring(session: Session, now: datetime, trigger: str, throttle: bool) -> int:
    """One snapshot per node that has reported. Automatic pushes are throttled to one per node per minute."""
    sensors = ml.network_sensors(session)
    trusted = ml.trusted_sensor_ids(session, now)
    anomaly = ml.assess_anomaly(session, now)
    sent = 0
    for node in session.scalars(select(m.SensorNode).order_by(m.SensorNode.ord)):
        if node.last_seen_at is None:
            continue  # nothing to report yet
        if throttle:
            last = session.scalars(
                select(m.IntegrationEvent).where(m.IntegrationEvent.entity == "monitoring", m.IntegrationEvent.entity_id == node.id).order_by(m.IntegrationEvent.id.desc())
            ).first()
            if last is not None and (now - datetime.fromisoformat(last.at)).total_seconds() < MONITORING_EVERY_SECONDS:
                continue
        asset = session.get(m.Asset, node.asset_id)
        area = session.get(m.ServiceArea, asset.service_area_id)
        scheme = session.get(m.Scheme, asset.scheme_id)
        node_sensors = [s for s in sensors.values() if s.node_id == node.id]
        readings = {s.id: ml.live_median(session, s, now, trusted) for s in node_sensors}
        payload = {
            "sujalam_bharat_id": scheme.sujalam_bharat_id, "sujal_gaon_id": area.sujal_gaon_id,
            "node": {"id": node.id, "code": node.code, "last_seen_at": node.last_seen_at, "reporting": any(s.id in trusted for s in node_sensors)},
            "readings_median_2min": {k: (round(v, 3) if v is not None else None) for k, v in readings.items()},
            "anomaly_index": anomaly.get("index"), "simulated": True,
        }
        sent += _push_once(session, now, "imis", "monitoring", node.id, now.strftime("%Y%m%d%H%M%S%f"), f"Monitoring snapshot for {node.code} ({area.name}, {area.sujal_gaon_id})", payload, trigger)
    return sent


def _push_functionality(session: Session, now: datetime, trigger: str, force: bool) -> int:
    data = fhtc.summary(session, None, now)
    sent = 0
    for v in data["villages"]:
        version = f"{v['functional']}-{v['partial']}-{v['non_functional']}" + (now.strftime("-%H%M%S%f") if force else "")
        payload = {"lgd_code": v["lgd_code"], "households": v["households"], "functional": v["functional"], "partial": v["partial"], "non_functional": v["non_functional"],
                   "basis": "estimate from simulated sensors; not a field survey"}
        sent += _push_once(session, now, "jjm_dashboard", "functionality", v["village_id"], version, f"{v['name']}: {v['functional']} of {v['households']} taps functional ({v['functional_pct']}%)", payload, trigger)
    return sent


def _push_samples(session: Session, now: datetime, trigger: str) -> int:
    sent = 0
    for q in ml.quality_outlook(session, now):
        if q["level"] == "OK":
            continue
        area = session.get(m.ServiceArea, q["service_area_id"])
        payload = {"sujal_gaon_id": area.sujal_gaon_id, "pipeline": q["asset_code"], "risk": q["level"], "predicted_residual_chlorine_mg_l": q["predicted_residual_mg_l"],
                   "requested_test": "Field-test-kit residual chlorine and bacteriological vial at the tail tap", "note": "Indicator from a model, not a measurement"}
        sent += _push_once(session, now, "wqmis", "sample_request", q["asset_id"], q["level"], f"Sample request for {q['asset_code']} ({q['level'].replace('_', ' ').lower()}): {q['predicted_residual_mg_l']} mg/L predicted", payload, trigger)
    return sent


def _pull_registry(session: Session, now: datetime, trigger: str, force: bool) -> int:
    sent = 0
    for row in crosswalk(session):
        resolved = sum(1 for a in row["service_areas"] if a["resolved"])
        version = f"{resolved}/{len(row['service_areas'])}" + (now.strftime("-%H%M%S%f") if force else "")
        payload = {"lgd_code": row["lgd_code"], "schemes": [s["sujalam_bharat_id"] for s in row["schemes"]], "service_areas": {a["name"]: a["sujal_gaon_id"] for a in row["service_areas"]}, "assets": row["assets"]}
        sent += _push_once(session, now, "sujal_gaon", "registry", row["village_id"], version, f"{row['village']}: {resolved} of {len(row['service_areas'])} Sujal Gaon IDs resolved, {row['assets']} assets matched", payload, trigger, direction="PULL")
    return sent


def sync(session: Session, now: datetime | None = None) -> dict:
    """Run every connector now (the GP presses 'Sync now'). Always produces a fresh message per connector."""
    now = now or datetime.now(IST)
    counts = {
        "sujal_gaon": _pull_registry(session, now, "manual", True),
        "imis": _push_monitoring(session, now, "manual", False),
        "jjm_dashboard": _push_functionality(session, now, "manual", True),
        "wqmis": _push_samples(session, now, "manual"),
    }
    for inc in session.scalars(select(m.Incident).where(m.Incident.is_history.is_(False))):
        counts["imis"] += on_incident(session, inc, now, "manual")
    session.commit()
    return {"ran_at": _iso(now), "messages": sum(counts.values()), "by_connector": counts, "mock": True}


def _heavy_due(session: Session, now: datetime) -> bool:
    """The functionality and quality checks compute a lot, so they run at most once per interval."""
    row = session.get(m.Config, "integration_last_heavy")
    if row is not None and (now - datetime.fromisoformat(row.value)).total_seconds() < MONITORING_EVERY_SECONDS:
        return False
    session.merge(m.Config(key="integration_last_heavy", value=_iso(now)))
    return True


def auto_push(session: Session, now: datetime | None = None) -> int:
    """Called after every batch of readings: each node's monitoring snapshot about once a minute, then (also at most
    once a minute) tap functionality and sample requests, which are only sent when they have changed.
    It never raises: a failed push must not lose a sensor reading."""
    now = now or datetime.now(IST)
    try:
        sent = _push_monitoring(session, now, "auto", True)
        if _heavy_due(session, now):
            sent += _push_functionality(session, now, "auto", False) + _push_samples(session, now, "auto")
        session.commit()
        return sent
    except Exception:  # noqa: BLE001 - see docstring
        session.rollback()
        return 0


# ---------- reading the log ----------

def overview(session: Session) -> list[dict]:
    out = []
    for cid, c in CONNECTORS.items():
        events = list(session.scalars(select(m.IntegrationEvent).where(m.IntegrationEvent.connector == cid).order_by(m.IntegrationEvent.id.desc())))
        out.append({
            "id": cid, **{k: v for k, v in c.items() if k != "prefix"}, "status": "CONNECTED_MOCK", "messages": len(events),
            "last_at": events[0].at if events else None, "last_ref": events[0].external_ref if events else None, "last_summary": events[0].summary if events else None,
        })
    return out


def event(e: m.IntegrationEvent) -> dict:
    return {"id": e.id, "at": e.at, "version": e.version, "connector": e.connector, "connector_name": CONNECTORS[e.connector]["name"], "direction": e.direction, "entity": e.entity, "entity_id": e.entity_id,
            "status": e.status, "external_ref": e.external_ref, "summary": e.summary, "payload": e.payload, "trigger": e.trigger}
