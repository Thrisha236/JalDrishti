"""Interpretable pipeline risk score. Python port of shared/risk.mjs; tests keep the two in agreement
through seed.expected_risk. The score ranks inspection priority; it is not a failure probability."""

import math
from datetime import datetime, timezone

PLASTICS = {"pvc", "hdpe"}
DAYS_PER_MONTH = 30.4375


def _instant(value: str) -> datetime:
    """Parse an ISO date or datetime; bare dates are treated as UTC midnight, like JavaScript's Date."""
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def full_years_between(from_iso: str, to_iso: str) -> int:
    a, b = _instant(from_iso), _instant(to_iso)
    years = b.year - a.year
    if (b.month, b.day) < (a.month, a.day):
        years -= 1
    return years


def months_between(from_iso: str, to_iso: str) -> float:
    return (_instant(to_iso) - _instant(from_iso)).total_seconds() / 86400 / DAYS_PER_MONTH


def _round(x: float) -> int:
    """Round half up (JavaScript Math.round), not Python's round-half-to-even."""
    return math.floor(x + 0.5)


def _points_from_bands(value: float, bands: list[dict], min_key: str, max_key: str) -> int:
    for i, b in enumerate(bands):
        is_last = i == len(bands) - 1
        if value >= b[min_key] and (value < b[max_key] or (is_last and value <= b[max_key])):
            return b["points"]
    return 0


def score_pipeline(
    profile: dict,
    repairs: list[dict],
    inspections: list[dict],
    risk_config: dict,
    as_of: str,
) -> dict:
    """profile/repairs/inspections use the seed's field names; repairs and inspections are for this asset."""
    cfg = risk_config["factors"]
    factors: dict[str, int] = {}
    details: dict[str, str] = {}
    missing: list[str] = []

    # Age
    age = full_years_between(profile["install_date"], as_of)
    a = cfg["age"]
    pts = min(1, max(0, (age - a["start_years"]) / (a["full_years"] - a["start_years"]))) * a["max"]
    if profile["install_date_source"] == "estimate":
        pts *= a["estimate_multiplier"]
    factors["age"] = _round(pts)
    details["age"] = f"{age} years ({profile['install_date_source']})"

    # Prior failures within the window
    window = cfg["prior_failures"]["window_months"]
    recent = [r for r in repairs if 0 <= months_between(r["date"], as_of) <= window]
    key = "4+" if len(recent) >= 4 else str(len(recent))
    factors["prior_failures"] = cfg["prior_failures"]["points_by_count"][key]
    details["prior_failures"] = f"{len(recent)} in {window} months"

    # Corrosion observation
    if profile["material"] in PLASTICS:
        factors["corrosion_observation"] = 0
        details["corrosion_observation"] = "not applicable (plastic pipe)"
    else:
        graded = sorted((i for i in inspections if i.get("corrosion_grade") is not None), key=lambda i: i["date"], reverse=True)
        if not graded:
            factors["corrosion_observation"] = 0
            details["corrosion_observation"] = "no inspection on record"
            missing.append("corrosion inspection")
        else:
            latest = graded[0]
            c = cfg["corrosion_observation"]
            pts = _points_from_bands(latest["corrosion_grade"], c["bands"], "min", "max")
            stale = months_between(latest["date"], as_of) > c["stale_after_months"]
            if stale:
                pts *= c["stale_multiplier"]
            factors["corrosion_observation"] = _round(pts)
            details["corrosion_observation"] = f"{latest['corrosion_grade']}/100, {latest['method']}, {latest['date']}{' (stale)' if stale else ''}"

    # Pressure-per-flow trend
    drop = profile.get("pressure_per_flow_drop_pct")
    if drop is None:
        factors["pressure_per_flow_trend"] = 0
        details["pressure_per_flow_trend"] = "no sensor on this segment"
        missing.append("pressure/flow sensor")
    else:
        factors["pressure_per_flow_trend"] = _points_from_bands(drop, cfg["pressure_per_flow_trend"]["bands"], "min_drop_pct", "max_drop_pct")
        drop_txt = int(drop) if float(drop).is_integer() else drop
        details["pressure_per_flow_trend"] = f"{drop_txt}% below baseline ({profile['trend_source']})"

    # Material
    table = cfg["material_susceptibility"]["points_by_material"]
    factors["material_susceptibility"] = table.get(profile["material"], table["unknown"])
    details["material_susceptibility"] = f"{profile['material'].replace('_', ' ', 1)} ({profile['material_source']})"

    score = sum(factors.values())
    band = next(b for b in risk_config["bands"] if b["min"] <= score <= b["max"])
    return {
        "assetId": profile["asset_id"],
        "score": score,
        "band": band["band"],
        "label": band["label"],
        "factors": factors,
        "max": {k: v["max"] for k, v in cfg.items()},
        "details": details,
        "missing": missing,
    }
