"""Keeping the database a sensible size: old sensor readings are deleted after a retention period.

Readings are the only table that grows without bound (every node sends one every few seconds). Alerts, incidents,
complaints, tests and the audit log are kept: they are the record. The latest readings remain, so every
model and chart that looks back minutes or hours is unaffected."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.orm import Session

from . import config
from . import models as m

IST = timezone(timedelta(hours=5, minutes=30))


def purge_readings(session: Session, now: datetime | None = None, days: int | None = None) -> int:
    """Delete readings older than the retention period. Returns how many were removed. Zero days keeps everything."""
    days = config.READINGS_RETENTION_DAYS if days is None else days
    if days <= 0:
        return 0
    cutoff = ((now or datetime.now(IST)) - timedelta(days=days)).isoformat(timespec="seconds")
    result = session.execute(delete(m.Reading).where(m.Reading.ts < cutoff))
    session.commit()
    return result.rowcount or 0
