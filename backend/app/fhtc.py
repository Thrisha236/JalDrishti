"""Stage 12: real-time monitoring of Functional Household Tap Connections (FHTC).

Jal Jeevan Mission judges a tap as functional when it delivers enough water (55 litres per person per day),
regularly, at adequate pressure and of acceptable quality. This module estimates the first and third of those
for every household in a service area, from live head and tail pressure and tail flow:

- the pressure at a home is interpolated between the head of the lane and its tail end
- the water a home can draw grows with the square root of that pressure
- homes are FUNCTIONAL at 55 L/person/day or more, PARTIAL from 30 to 54, NON_FUNCTIONAL below 30

The households come from the zone register (mock). Their position along the lane is deterministic, so a
village shows the same homes on every refresh. Without live sensors it falls back to recorded baselines and
says so. It is an estimate for monitoring and prioritising: a deployment would use household tap sensors or
sample meters, and quality and regularity come from the separate quality model and the supply schedule."""

import hashlib
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ml
from . import models as m

IST = timezone(timedelta(hours=5, minutes=30))
LPCD_TARGET = 55
LPCD_PARTIAL = 30
FULL_LPCD_AT_BAR = 72  # litres per person per day at 1.5 bar (assumption)
DEFAULT_HEAD_BAR, DEFAULT_TAIL_BAR = 1.8, 1.22
BASIS = (
    "Estimated per household from live head and tail pressure and tail flow. Household positions come from the "
    "mock zone register. A deployment would use household tap sensors or sample meters."
)


def _jitter(key: str, spread: float) -> float:
    h = int(hashlib.md5(key.encode()).hexdigest()[:8], 16)
    return (h / 0xFFFFFFFF - 0.5) * spread


def _classify(lpcd: float) -> str:
    return "FUNCTIONAL" if lpcd >= LPCD_TARGET else "PARTIAL" if lpcd >= LPCD_PARTIAL else "NON_FUNCTIONAL"


def zone_supply(session: Session, area: m.ServiceArea, now: datetime) -> dict:
    """Head and tail pressure and tail flow for one zone: live where a trusted sensor covers it, else baseline."""
    sensors = ml.network_sensors(session)
    trusted = ml.trusted_sensor_ids(session, now)
    head_s, tail_s, flow_s = sensors.get("head_pressure"), sensors.get("tail_pressure"), sensors.get("tail_flow")
    head_base = head_s.baseline if head_s else DEFAULT_HEAD_BAR
    head_live = ml.live_median(session, head_s, now, trusted)
    head = head_live if head_live is not None else head_base
    tail_node = session.get(m.SensorNode, tail_s.node_id) if tail_s else None
    tail_asset = session.get(m.Asset, tail_node.asset_id) if tail_node else None
    covered = bool(tail_asset and tail_asset.service_area_id == area.id)
    tail_live = ml.live_median(session, tail_s, now, trusted) if covered else None
    flow_live = ml.live_median(session, flow_s, now, trusted) if covered else None
    if tail_live is not None:
        tail, source = tail_live, "live sensor"
    else:
        base_tail = tail_s.baseline if tail_s else DEFAULT_TAIL_BAR
        # A zone without its own sensor still feels the pump: scale its recorded tail pressure by the head pressure.
        tail = base_tail * (head / head_base if head_base else 1.0)
        source = "head sensor + baseline" if head_live is not None else "recorded baseline"
    flow_ratio = min(1.0, flow_live / flow_s.baseline) if flow_live is not None and flow_s and flow_s.baseline else 1.0
    return {"head_bar": round(head, 2), "tail_bar": round(tail, 2), "flow_ratio": round(flow_ratio, 2), "source": source}


def assess_zone(session: Session, area: m.ServiceArea, now: datetime) -> dict:
    supply = zone_supply(session, area, now)
    n = area.household_count
    prefix = area.name[0].upper()
    homes = []
    for i in range(n):
        pos = (i + 0.5) / n
        pressure = supply["head_bar"] - (supply["head_bar"] - supply["tail_bar"]) * pos + _jitter(f"{area.id}-{i}", 0.12)
        reach = 1 - (1 - math.sqrt(supply["flow_ratio"])) * pos  # less flow reaches the far end
        lpcd = max(0, round(FULL_LPCD_AT_BAR * math.sqrt(max(pressure, 0.0) / 1.5) * reach + _jitter(f"{area.id}-{i}-q", 6)))
        homes.append({"household": f"{prefix}-H{i + 1}", "map_id": f"{area.id}-h{i + 1}", "pressure_bar": round(max(pressure, 0.0), 2), "lpcd": lpcd, "status": _classify(lpcd), "position": round(pos, 2)})
    counts = {k: sum(1 for h in homes if h["status"] == k) for k in ("FUNCTIONAL", "PARTIAL", "NON_FUNCTIONAL")}
    worst = sorted(homes, key=lambda h: h["lpcd"])[:5]
    return {
        "service_area_id": area.id, "name": area.name, "village_id": area.village_id, "sujal_gaon_id": area.sujal_gaon_id,
        "households": n, "functional": counts["FUNCTIONAL"], "partial": counts["PARTIAL"], "non_functional": counts["NON_FUNCTIONAL"],
        "functional_pct": round(100 * counts["FUNCTIONAL"] / n) if n else None,
        "avg_lpcd": round(sum(h["lpcd"] for h in homes) / n) if n else None,
        "head_bar": supply["head_bar"], "tail_bar": supply["tail_bar"], "data_source": supply["source"],
        "worst": worst,
        # House ids on the map (the same ids as the 3D layout), so the map can colour the homes that are struggling.
        "affected_map_ids": {k: [h["map_id"] for h in homes if h["status"] == k] for k in ("PARTIAL", "NON_FUNCTIONAL")},
    }


def history(current_pct: int | None, days: int = 14) -> list[dict]:
    """Fictional daily functionality for the last two weeks (labelled simulated), ending with today's live value."""
    today = datetime.now(IST).date()
    out = []
    for d in range(days - 1, 0, -1):
        day = today - timedelta(days=d)
        out.append({"date": day.isoformat(), "functional_pct": round(max(80, min(100, 94 + _jitter(f"hist-{day}", 8)))), "simulated": True})
    out.append({"date": today.isoformat(), "functional_pct": current_pct, "simulated": False})
    return out


def summary(session: Session, village_ids: set[str] | None = None, now: datetime | None = None) -> dict:
    now = now or datetime.now(IST)
    areas = list(session.scalars(select(m.ServiceArea).order_by(m.ServiceArea.ord)))
    zones = [assess_zone(session, a, now) for a in areas if village_ids is None or a.village_id in village_ids]
    total = sum(z["households"] for z in zones)
    sums = {k: sum(z[k] for z in zones) for k in ("functional", "partial", "non_functional")}
    pct = round(100 * sums["functional"] / total) if total else None
    villages = {v.id: v for v in session.scalars(select(m.Village))}
    by_village = []
    for vid in dict.fromkeys(z["village_id"] for z in zones):
        vz = [z for z in zones if z["village_id"] == vid]
        hh = sum(z["households"] for z in vz)
        by_village.append({
            "village_id": vid, "name": villages[vid].name, "lgd_code": villages[vid].lgd_code, "households": hh,
            "functional": sum(z["functional"] for z in vz), "partial": sum(z["partial"] for z in vz), "non_functional": sum(z["non_functional"] for z in vz),
            "functional_pct": round(100 * sum(z["functional"] for z in vz) / hh) if hh else None,
        })
    return {
        "assessed_at": now.isoformat(timespec="seconds"), "is_simulated": True, "basis": BASIS,
        "definition": f"Functional: at least {LPCD_TARGET} L/person/day. Partial: {LPCD_PARTIAL}-{LPCD_TARGET - 1}. Non-functional: below {LPCD_PARTIAL}.",
        "households": total, **sums, "functional_pct": pct, "zones": zones, "villages": by_village, "history": history(pct),
    }
