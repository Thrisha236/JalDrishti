"""Live pressure-per-flow trend for pipelines that have pressure and flow sensors at one node.

Pressure delivered per unit of flow falls when a pipe leaks, wears or partly blocks. We compare the median
ratio over the last WINDOW_MINUTES with the sensors' recorded baseline (the 14-day baseline in the seed).
Only trustworthy readings count: quality 'ok' and enough flow for the ratio to mean something."""

from datetime import datetime, timedelta, timezone
from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m

IST = timezone(timedelta(hours=5, minutes=30))
WINDOW_MINUTES = 60
MIN_PAIRS = 6
MIN_FLOW_LPM = 10.0  # below this (pump off, no supply) pressure-per-flow is meaningless


def live_trend(session: Session, asset_id: str, now: datetime | None = None) -> tuple[dict | None, str | None]:
    """Return (trend, None) when a live trend can be measured, else (None, reason)."""
    now = now or datetime.now(IST)
    node = session.scalars(select(m.SensorNode).where(m.SensorNode.asset_id == asset_id)).first()
    if node is None:
        return None, "no sensor node on this pipeline"
    sensors = list(session.scalars(select(m.Sensor).where(m.Sensor.node_id == node.id)))
    pressure = next((s for s in sensors if s.kind == "pressure"), None)
    flow = next((s for s in sensors if s.kind == "flow"), None)
    if pressure is None or flow is None:
        return None, "pipeline node lacks a pressure or flow sensor"

    since = (now - timedelta(minutes=WINDOW_MINUTES)).astimezone(IST).isoformat(timespec="seconds")

    def series(sensor):
        """Readings grouped by timestamp, in arrival order (a replayed buffer can share one timestamp)."""
        rows = session.scalars(
            select(m.Reading)
            .where(m.Reading.sensor_id == sensor.id, m.Reading.ts >= since, m.Reading.quality_flag == "ok")
            .order_by(m.Reading.ts, m.Reading.id)
        )
        grouped: dict[str, list[float]] = {}
        for r in rows:
            grouped.setdefault(r.ts, []).append(r.value)
        return grouped

    p, f = series(pressure), series(flow)
    # Pressure and flow from the same batch share a timestamp; pair them in arrival order.
    pairs = [(pv, fv) for ts in p.keys() & f.keys() for pv, fv in zip(p[ts], f[ts])]
    ratios = [pv / fv for pv, fv in pairs if fv >= MIN_FLOW_LPM]
    if len(ratios) < MIN_PAIRS:
        return None, f"only {len(ratios)} usable readings in the last {WINDOW_MINUTES} min (need {MIN_PAIRS})"

    baseline = pressure.baseline / flow.baseline
    drop = max(0.0, round((1 - median(ratios) / baseline) * 100, 1))
    drop_txt = int(drop) if drop.is_integer() else drop
    return {
        "drop_pct": drop,
        "readings": len(ratios),
        "window_minutes": WINDOW_MINUTES,
        "detail": f"{drop_txt}% below baseline (live: median of {len(ratios)} readings in the last {WINDOW_MINUTES} min vs recorded baseline)",
    }, None
