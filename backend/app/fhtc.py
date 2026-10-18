"""Real-time monitoring of Functional Household Tap Connections (FHTC), at village and household level.

Jal Jeevan Mission judges a tap as functional when it delivers enough water (55 litres per person per day),
regularly, at adequate pressure and of acceptable quality. Two sources feed each household:

1. The network model. From live head and tail pressure and tail flow it estimates the water reaching each home:
   pressure is interpolated along the lane, and the water a home can draw grows with the square root of it.
2. The villager's own service check (a daily "did water come, how much, how did it look" on the phone).
   This is the ground truth for that tap. When it disagrees with the model, that is itself a finding: if the
   network looks fine but the home reports no water, the fault is probably local (the house connection, the tap
   or storage), not the pipeline.

Status: FUNCTIONAL at 55 L/person/day or more, PARTIAL from 30 to 54, NON_FUNCTIONAL below 30.
The households come from the zone register (mock). Their position along the lane is deterministic. Without
live sensors the model falls back to recorded baselines and says so. A deployment would add household tap
sensors or sample meters as a third source; the service check stays as the community validation."""

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
CHECK_VALID_DAYS = 1  # a service check counts today and for the day after
QUALITY_PROBLEMS = ("COLOURED", "SMELL", "OTHER")
BASIS = (
    "Estimated per household from live head and tail pressure and tail flow, then corrected by the villager's own service "
    "check where there is one. Household positions come from the mock zone register. A deployment would add household tap sensors."
)
CAUSE_TEXT = {
    "NETWORK": "The network readings and the home agree: supply is short on the pipeline.",
    "LOCAL": "The network looks fine but this home reports no water or too little: check its connection, tap or storage.",
    "NETWORK_ONLY": "The network model expects a shortage here, but the home reports water: the model may be too cautious.",
}


def _jitter(key: str, spread: float) -> float:
    h = int(hashlib.md5(key.encode()).hexdigest()[:8], 16)
    return (h / 0xFFFFFFFF - 0.5) * spread


def _classify(lpcd: float) -> str:
    return "FUNCTIONAL" if lpcd >= LPCD_TARGET else "PARTIAL" if lpcd >= LPCD_PARTIAL else "NON_FUNCTIONAL"


def parse_household_id(household_id: str) -> tuple[str, int] | None:
    """'sa-north-h12' -> ('sa-north', 11): the zone and the 0-based position in its register."""
    head, sep, tail = household_id.rpartition("-h")
    if not sep or not tail.isdigit() or int(tail) < 1:
        return None
    return head, int(tail) - 1


def tap_id(area: m.ServiceArea, index: int) -> str:
    """A mock FHTC id built on the zone's Sujal Gaon ID (zones without one use their own id)."""
    return f"{area.sujal_gaon_id or area.id.upper()}-T{index + 1:03d}"


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


def recent_checks(session: Session, area_id: str, now: datetime) -> dict[str, m.ServiceCheck]:
    """The latest service check per household in a zone from the last day or two."""
    since = (now.astimezone(IST).date() - timedelta(days=CHECK_VALID_DAYS)).isoformat()
    rows = session.scalars(select(m.ServiceCheck).where(m.ServiceCheck.service_area_id == area_id, m.ServiceCheck.day >= since).order_by(m.ServiceCheck.day, m.ServiceCheck.id))
    return {c.household_id: c for c in rows}


def _citizen_status(check: m.ServiceCheck) -> str:
    if not check.got_water or check.quantity == "NONE":
        return "NON_FUNCTIONAL"
    return "PARTIAL" if check.quantity == "LOW" else "FUNCTIONAL"


def homes(session: Session, area: m.ServiceArea, now: datetime, supply: dict | None = None) -> list[dict]:
    """Every household in a zone with its modelled and (if reported) villager-confirmed status."""
    supply = supply or zone_supply(session, area, now)
    checks = recent_checks(session, area.id, now)
    n = area.household_count
    prefix = area.name[0].upper()
    out = []
    for i in range(n):
        pos = (i + 0.5) / n
        pressure = supply["head_bar"] - (supply["head_bar"] - supply["tail_bar"]) * pos + _jitter(f"{area.id}-{i}", 0.12)
        reach = 1 - (1 - math.sqrt(supply["flow_ratio"])) * pos  # less flow reaches the far end
        lpcd = max(0, round(FULL_LPCD_AT_BAR * math.sqrt(max(pressure, 0.0) / 1.5) * reach + _jitter(f"{area.id}-{i}-q", 6)))
        modelled = _classify(lpcd)
        hid = f"{area.id}-h{i + 1}"
        check = checks.get(hid)
        status, source, cause = modelled, "network model", None
        if check is not None:
            status, source = _citizen_status(check), "villager's service check"
            if status != modelled:
                cause = "LOCAL" if modelled == "FUNCTIONAL" else "NETWORK_ONLY" if status == "FUNCTIONAL" else "NETWORK"
            elif status != "FUNCTIONAL":
                cause = "NETWORK"
        out.append({
            "household": f"{prefix}-H{i + 1}", "map_id": hid, "tap_id": tap_id(area, i), "pressure_bar": round(max(pressure, 0.0), 2), "lpcd": lpcd,
            "status": status, "modelled_status": modelled, "status_source": source, "position": round(pos, 2),
            "likely_cause": cause, "likely_cause_text": CAUSE_TEXT.get(cause),
            "quality_problem": bool(check and check.quality in QUALITY_PROBLEMS), "checked_day": check.day if check else None,
        })
    return out


def assess_zone(session: Session, area: m.ServiceArea, now: datetime) -> dict:
    supply = zone_supply(session, area, now)
    hs = homes(session, area, now, supply)
    n = area.household_count
    counts = {k: sum(1 for h in hs if h["status"] == k) for k in ("FUNCTIONAL", "PARTIAL", "NON_FUNCTIONAL")}
    validated = [h for h in hs if h["checked_day"]]
    worst = sorted(hs, key=lambda h: h["lpcd"] if not h["checked_day"] else {"NON_FUNCTIONAL": 0, "PARTIAL": 20, "FUNCTIONAL": 99}[h["status"]])[:5]
    return {
        "service_area_id": area.id, "name": area.name, "village_id": area.village_id, "sujal_gaon_id": area.sujal_gaon_id,
        "households": n, "functional": counts["FUNCTIONAL"], "partial": counts["PARTIAL"], "non_functional": counts["NON_FUNCTIONAL"],
        "functional_pct": round(100 * counts["FUNCTIONAL"] / n) if n else None,
        "avg_lpcd": round(sum(h["lpcd"] for h in hs) / n) if n else None,
        "head_bar": supply["head_bar"], "tail_bar": supply["tail_bar"], "data_source": supply["source"],
        "worst": worst,
        # Service validation by villagers: how many households reported in the last day or two, and what they said.
        "validation": {
            "reported": len(validated), "reported_pct": round(100 * len(validated) / n) if n else 0,
            "no_water": sum(1 for h in validated if h["status"] == "NON_FUNCTIONAL"), "low_water": sum(1 for h in validated if h["status"] == "PARTIAL"),
            "quality_problems": sum(1 for h in hs if h["quality_problem"]),
            "local_faults": sum(1 for h in validated if h["likely_cause"] == "LOCAL"),
        },
        # House ids on the map (the same ids as the 3D layout), so the map can colour the homes that are struggling.
        "affected_map_ids": {k: [h["map_id"] for h in hs if h["status"] == k] for k in ("PARTIAL", "NON_FUNCTIONAL")},
    }


def household_detail(session: Session, household_id: str, now: datetime | None = None) -> dict | None:
    """Everything about one household's tap: status, the reasons, the numbers and its recent service checks."""
    now = now or datetime.now(IST)
    parsed = parse_household_id(household_id)
    if parsed is None:
        return None
    area = session.get(m.ServiceArea, parsed[0])
    if area is None or parsed[1] >= area.household_count:
        return None
    supply = zone_supply(session, area, now)
    home = homes(session, area, now, supply)[parsed[1]]
    checks = session.scalars(select(m.ServiceCheck).where(m.ServiceCheck.household_id == household_id).order_by(m.ServiceCheck.day.desc())).all()[:14]
    return {
        **home, "service_area_id": area.id, "zone": area.name, "village_id": area.village_id, "sujal_gaon_id": area.sujal_gaon_id,
        "supply": supply, "is_simulated": True, "basis": BASIS,
        "checks": [check_out(c) for c in checks],
    }


def check_out(c: m.ServiceCheck, with_comment: bool = True) -> dict:
    out = {"id": c.id, "day": c.day, "got_water": c.got_water, "quantity": c.quantity, "quality": c.quality, "rating": c.rating, "created_at": c.created_at}
    if with_comment:
        out["comment"] = c.comment
    return out


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
        "validation": {k: sum(z["validation"][k] for z in zones) for k in ("reported", "no_water", "low_water", "quality_problems", "local_faults")},
    }


def today_ist(now: datetime | None = None) -> str:
    return (now or datetime.now(IST)).astimezone(IST).date().isoformat()
