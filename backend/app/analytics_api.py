"""Analytics for every administrative level (State, District, Block, Village, Zone), GIS and CSV exports, and the audit log.

The same set of indicators is computed for any slice of the hierarchy, so a Gram Panchayat, a block officer and a state
official all read the same numbers at their own level, and can drill down. Access follows the user's villages: nobody
sees a village they are not responsible for, whatever level they ask for. Villages other than Ramapuram have no live
sensors in this prototype, so their tap functionality is a baseline estimate and is labelled that way."""

import csv
import io
import statistics
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config, fhtc, ml, quality, rules
from . import models as m
from .auth import CurrentUser, require_roles, village_ids_of
from .db import get_session

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(get_session)]
IST = timezone(timedelta(hours=5, minutes=30))
LEVELS = ("state", "district", "block", "village", "zone")
OPEN_INCIDENT = ("TRIAGED", "TASK_ASSIGNED", "REPAIR_DONE")
NOTES = [
    "Tap functionality is estimated from pipeline sensors and villagers' service checks; only Ramapuram has live sensors in this prototype.",
    "The 14-day trend before today is simulated history. Villages, IDs and map positions are fictional.",
]


def _now() -> datetime:
    return datetime.now(IST)


def _level_value(v: m.Village, level: str) -> str:
    return {"state": v.state, "district": v.district, "block": v.block or "(no block)", "village": v.id}[level]


def _label(v: m.Village, level: str) -> str:
    return v.name if level == "village" else _level_value(v, level)


def _median_hours(pairs: list[tuple[str, str]]) -> float | None:
    hrs = [(datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() / 3600 for a, b in pairs]
    hrs = [h for h in hrs if h >= 0]
    return round(statistics.median(hrs), 1) if hrs else None


class Slice:
    """Everything needed to compute indicators for a set of zones, with the expensive pieces computed once."""

    def __init__(self, session: Session, now: datetime):
        self.s, self.now = session, now
        self.areas = {a.id: a for a in session.scalars(select(m.ServiceArea).order_by(m.ServiceArea.ord))}
        self.zone_fhtc: dict[str, dict] = {}
        self.alerts = [a for a in session.scalars(select(m.Alert).where(m.Alert.is_simulated.is_(False), m.Alert.cleared_at.is_(None)))]
        self.incidents = [i for i in session.scalars(select(m.Incident)) if not i.is_history]
        self.complaints = list(session.scalars(select(m.Complaint)))
        self.tasks = list(session.scalars(select(m.MaintenanceTask)))
        self.updates = {}
        for u in session.scalars(select(m.TaskUpdate).order_by(m.TaskUpdate.ord)):
            self.updates.setdefault(u.task_code, []).append(u)
        self.incident_area = {i.code: i.service_area_id for i in session.scalars(select(m.Incident))}
        self.quality = {zid: quality.zone_quality(session, zid) for zid in self.areas}
        reg = ml.supply_regularity(session, now)
        self.regularity_area = session.get(m.Asset, reg["asset_id"]).service_area_id if reg.get("asset_id") else None
        self.regularity = reg

    def fhtc(self, zone_id: str) -> dict:
        if zone_id not in self.zone_fhtc:
            self.zone_fhtc[zone_id] = fhtc.assess_zone(self.s, self.areas[zone_id], self.now)
        return self.zone_fhtc[zone_id]

    def kpis(self, zone_ids: list[str]) -> dict:
        zs = [self.fhtc(z) for z in zone_ids]
        hh = sum(z["households"] for z in zs)
        functional, partial, non = (sum(z[k] for z in zs) for k in ("functional", "partial", "non_functional"))
        reported = sum(z["validation"]["reported"] for z in zs)
        zset = set(zone_ids)
        alerts = [a for a in self.alerts if a.service_area_id in zset]
        high = [a for a in alerts if a.severity in ("HIGH", "CRITICAL")]
        incidents = [i for i in self.incidents if i.service_area_id in zset]
        open_inc = [i for i in incidents if i.status in OPEN_INCIDENT]
        tasks = [t for t in self.tasks if self.incident_area.get(t.incident_code) in zset]
        overdue = [t for t in tasks if self.updates[t.code][-1].status != "REPAIRED" and datetime.fromisoformat(t.due_at) < self.now]
        mine = [c for c in self.complaints if c.service_area_id in zset and (c.is_simulated and config.DEMO_MODE or not c.is_simulated)]
        closed = {i.code for i in incidents if i.status not in OPEN_INCIDENT}
        open_complaints = [c for c in mine if c.incident_code is None or c.incident_code not in closed]
        inc_by_code = {i.code: i for i in incidents}
        to_incident = [(c.created_at, inc_by_code[c.incident_code].opened_at) for c in mine if c.incident_code in inc_by_code and not c.is_simulated]
        repairs = [(self.updates[t.code][0].at, self.updates[t.code][-1].at) for t in tasks if self.updates[t.code][-1].status == "REPAIRED"]
        counts = {k: sum(1 for z in zone_ids if self.quality[z] == k) for k in ("safe", "watch", "unsafe", "untested")}
        live = any(z["data_source"] == "live sensor" for z in zs)
        return {
            "zones": len(zone_ids), "households": hh, "functional": functional, "partial": partial, "non_functional": non,
            "functional_pct": round(100 * functional / hh) if hh else None, "validation_reported_pct": round(100 * reported / hh) if hh else 0,
            "no_water_reports": sum(z["validation"]["no_water"] for z in zs), "quality_problem_reports": sum(z["validation"]["quality_problems"] for z in zs),
            "alerts_open": len(alerts), "alerts_high": len(high), "alerts_unacknowledged_high": sum(1 for a in high if a.acknowledged_at is None),
            "incidents_open": len(open_inc), "tasks_open": sum(1 for t in tasks if self.updates[t.code][-1].status != "REPAIRED"), "tasks_overdue": len(overdue),
            "complaints_open": len(open_complaints), "complaints_total": len(mine),
            "median_hours_complaint_to_incident": _median_hours(to_incident), "median_hours_to_repair": _median_hours(repairs),
            "quality": counts, "supply_pattern": self.regularity.get("pattern") if self.regularity_area in zset else None,
            "data_basis": "live sensors" if live else "baseline estimate (no live sensors)",
        }


def _villages(session: Session, user: m.User, level: str, value: str | None) -> list[m.Village]:
    allowed = village_ids_of(user)
    out = [v for v in session.scalars(select(m.Village).order_by(m.Village.ord)) if v.id in allowed]
    if value is not None and level in ("state", "district", "block", "village"):
        out = [v for v in out if _level_value(v, level) == value]
    return out


@router.get("/analytics/summary")
def summary(
    user: CurrentUser,
    session: DB,
    level: Annotated[str | None, Query(pattern="^(state|district|block|village)$")] = None,
    id: Annotated[str | None, Query()] = None,
):
    """Indicators for one slice of the hierarchy and for each unit directly below it (the drill-down)."""
    require_roles(user, "gp", "officer")
    level = level or ("village" if user.role == "gp" else "state")
    villages = _villages(session, user, level, id)
    if not villages:
        raise HTTPException(404, "Nothing at that level that you can see")
    rules.evaluate(session)  # bring alerts up to date, as the Alert Center does
    now = _now()
    sl = Slice(session, now)
    zones = [a.id for a in sl.areas.values() if a.village_id in {v.id for v in villages}]
    totals = sl.kpis(zones)

    next_level = {"state": "district", "district": "block", "block": "village", "village": "zone"}[level]
    children = []
    if next_level == "zone":
        for zid in zones:
            a = sl.areas[zid]
            children.append({"id": zid, "label": a.name, "sujal_gaon_id": a.sujal_gaon_id, "kpis": sl.kpis([zid])})
    else:
        groups: dict[str, list[m.Village]] = {}
        for v in villages:
            groups.setdefault(_level_value(v, next_level), []).append(v)
        for value, vs in groups.items():
            ids = {v.id for v in vs}
            row = {"id": value, "label": _label(vs[0], next_level), "villages": len(vs), "kpis": sl.kpis([z for z in zones if sl.areas[z].village_id in ids])}
            if next_level == "village":
                row |= {"lgd_code": vs[0].lgd_code, "block": vs[0].block, "district": vs[0].district, "lat": vs[0].lat, "lon": vs[0].lon}
            children.append(row)
    children.sort(key=lambda c: (c["kpis"]["functional_pct"] is None, c["kpis"]["functional_pct"] or 0))  # the worst-served first

    v0 = villages[0]
    crumbs = []
    for lv in LEVELS[: LEVELS.index(level) + 1]:
        crumbs.append({"level": lv, "id": _level_value(v0, lv), "label": _label(v0, lv)})
    return {
        "level": level, "id": _level_value(v0, level), "label": _label(v0, level), "breadcrumb": crumbs, "villages": len(villages), "totals": totals,
        "children_level": next_level, "children": children, "trend": fhtc.history(totals["functional_pct"]),
        "generated_at": now.isoformat(timespec="seconds"), "is_simulated": True, "notes": NOTES,
    }


@router.get("/analytics/hierarchy")
def hierarchy(user: CurrentUser, session: DB):
    """State > district > block > village for the villages the user can see (to build a drill-down tree)."""
    require_roles(user, "gp", "officer")
    tree: dict = {}
    for v in _villages(session, user, "state", None):
        tree.setdefault(v.state, {}).setdefault(v.district, {}).setdefault(v.block or "(no block)", []).append({"id": v.id, "name": v.name, "lgd_code": v.lgd_code})
    return {"mock": True, "tree": [{"state": s, "districts": [{"district": d, "blocks": [{"block": b, "villages": vs} for b, vs in blocks.items()]} for d, blocks in districts.items()]} for s, districts in tree.items()]}


# ---------- GIS ----------

@router.get("/geo/villages.geojson")
def villages_geojson(user: CurrentUser, session: DB):
    """Villages as GeoJSON points (RFC 7946) with their current indicators, for any GIS tool. Positions are fictional."""
    require_roles(user, "gp", "officer")
    rules.evaluate(session)
    sl = Slice(session, _now())
    feats = []
    for v in _villages(session, user, "state", None):
        zones = [a.id for a in sl.areas.values() if a.village_id == v.id]
        k = sl.kpis(zones)
        feats.append({
            "type": "Feature", "geometry": {"type": "Point", "coordinates": [v.lon, v.lat]},
            "properties": {"id": v.id, "name": v.name, "lgd_code": v.lgd_code, "block": v.block, "district": v.district, "state": v.state, "households": k["households"],
                           "functional_pct": k["functional_pct"], "alerts_open": k["alerts_open"], "alerts_high": k["alerts_high"], "incidents_open": k["incidents_open"],
                           "quality_unsafe_zones": k["quality"]["unsafe"], "mock": True},
        })
    return JSONResponse({"type": "FeatureCollection", "name": "JalRakshak demo villages (fictional positions)", "features": feats}, media_type="application/geo+json")


# ---------- CSV exports (anonymised) ----------

def _cell(v) -> str:
    """Spreadsheet formula injection guard: a cell that starts with = + - @ is read as a formula by Excel."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def _csv(name: str, header: list[str], rows: list[list]) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow([_cell(c) for c in r])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})


@router.get("/export/{dataset}.csv")
def export(dataset: str, user: CurrentUser, session: DB):
    """Open-format exports of what the user may see. No names, phone numbers, complaint text or photos are included."""
    require_roles(user, "gp", "officer")
    villages = village_ids_of(user)
    areas = {a.id: a for a in session.scalars(select(m.ServiceArea)) if a.village_id in villages}
    vname = {v.id: v for v in session.scalars(select(m.Village))}
    now = _now()
    if dataset == "taps":
        rows = []
        for a in areas.values():
            for h in fhtc.homes(session, a, now):
                rows.append([h["tap_id"], vname[a.village_id].lgd_code, a.sujal_gaon_id, a.name, h["status"], h["lpcd"], h["pressure_bar"], h["status_source"], h["likely_cause"]])
        return _csv("taps", ["tap_id", "lgd_code", "sujal_gaon_id", "zone", "status", "litres_per_person_per_day", "pressure_bar", "status_source", "likely_cause"], rows)
    if dataset == "alerts":
        rows = [[a.id, a.kind, a.severity, a.rule_code, areas[a.service_area_id].name, a.raised_at, a.cleared_at, a.acknowledged_at, a.text]
                for a in session.scalars(select(m.Alert).where(m.Alert.is_simulated.is_(False)).order_by(m.Alert.ord)) if a.service_area_id in areas]
        return _csv("alerts", ["id", "kind", "severity", "rule", "zone", "raised_at", "cleared_at", "acknowledged_at", "text"], rows)
    if dataset == "complaints":
        rows = [[c.public_code, c.category, areas[c.service_area_id].name, c.created_at, c.channel, c.incident_code, "yes" if c.location and c.location.get("x") is not None else "no"]
                for c in session.scalars(select(m.Complaint).order_by(m.Complaint.ord)) if c.service_area_id in areas]
        return _csv("complaints", ["code", "category", "zone", "created_at", "channel", "incident", "location_shared"], rows)
    if dataset == "water-quality":
        points = {p.id: p for p in session.scalars(select(m.WaterQualityPoint))}
        rows = []
        for t in session.scalars(select(m.WaterQualityTest).order_by(m.WaterQualityTest.date, m.WaterQualityTest.ord)):
            p = points[t.point_id]
            area = p.service_area_id or session.get(m.Asset, p.asset_id).service_area_id
            if area in areas:
                rows.append([t.id, p.label, p.type, areas[area].name, t.date, t.verdict, "; ".join(i["label"] for i in (t.issues or []))])
        return _csv("water-quality", ["id", "point", "type", "zone", "date", "verdict", "failed_parameters"], rows)
    if dataset == "tasks":
        rows = []
        for t in session.scalars(select(m.MaintenanceTask).order_by(m.MaintenanceTask.code)):
            inc = session.get(m.Incident, t.incident_code)
            if inc and inc.service_area_id in areas:
                last = session.scalars(select(m.TaskUpdate).where(m.TaskUpdate.task_code == t.code).order_by(m.TaskUpdate.ord.desc())).first()
                rows.append([t.code, session.get(m.Asset, t.asset_id).code, inc.code, inc.origin, last.status if last else None, t.due_at])
        return _csv("tasks", ["code", "pipeline", "incident", "origin", "status", "due_at"], rows)
    raise HTTPException(404, "Unknown dataset. Choose taps, alerts, complaints, water-quality or tasks")


# ---------- audit log and system status ----------

@router.get("/audit")
def audit(
    user: CurrentUser,
    session: DB,
    entity: Annotated[str | None, Query()] = None,
    action: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    """Who did what, when: every write is recorded. Officers only. Free text and photos are never stored in it."""
    require_roles(user, "officer")
    stmt = select(m.AuditLog).order_by(m.AuditLog.id.desc()).limit(limit)
    if entity:
        stmt = stmt.where(m.AuditLog.entity == entity)
    if action:
        stmt = stmt.where(m.AuditLog.action == action)
    people = {u.id: u for u in session.scalars(select(m.User))}
    return [
        {"id": a.id, "at": a.at, "actor": people[a.actor_id].display_name if a.actor_id in people else a.actor_id, "role": people[a.actor_id].role if a.actor_id in people else None,
         "action": a.action, "entity": a.entity, "entity_id": a.entity_id, "details": a.details}
        for a in session.scalars(stmt)
    ]


@router.get("/system")
def system(user: CurrentUser, session: DB):
    """Deployment facts an administrator needs: database, data volumes, retention and which safeguards are on."""
    require_roles(user, "officer")
    first = session.scalars(select(m.Reading.ts).order_by(m.Reading.ts).limit(1)).first()
    return {
        "environment": config.ENVIRONMENT, "database": session.get_bind().dialect.name, "demo_mode": config.DEMO_MODE,
        "counts": {"readings": session.query(m.Reading).count(), "alerts": session.query(m.Alert).count(), "complaints": session.query(m.Complaint).count(),
                   "audit_entries": session.query(m.AuditLog).count(), "integration_messages": session.query(m.IntegrationEvent).count()},
        "oldest_reading": first, "readings_retention_days": config.READINGS_RETENTION_DAYS,
        "safeguards": {"rate_limit_per_minute": config.RATE_LIMIT_PER_MINUTE, "token_ttl_hours": config.TOKEN_TTL_SECONDS // 3600, "login_lockout_after": config.LOGIN_MAX_FAILURES,
                       "photos_exif_stripped": True, "security_headers": True, "passwords_hashed": "scrypt"},
    }
