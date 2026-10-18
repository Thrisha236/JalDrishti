"""Security headers, rate limiting, request size, the production guard and reading retention."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import config, retention, security
from app import models as m
from app.main import app

IST = timezone(timedelta(hours=5, minutes=30))


def test_every_response_carries_the_security_headers(client, as_gp):
    r = client.get("/api/v1/pipelines", headers=as_gp)
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY" and r.headers["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"] and r.headers["cache-control"] == "no-store"
    assert "camera=()" in r.headers["permissions-policy"]
    health = client.get("/api/v1/health")
    assert health.headers["x-content-type-options"] == "nosniff" and "no-store" not in health.headers.get("cache-control", "")


def test_the_rate_limit_slows_a_client_that_hammers_the_api(client, monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", 5)
    statuses = [client.get("/api/v1/villages").status_code for _ in range(7)]
    assert statuses == [200] * 5 + [429] * 2
    limited = client.get("/api/v1/villages")
    assert limited.status_code == 429 and 1 <= int(limited.headers["retry-after"]) <= 60 and "Too many requests" in limited.json()["detail"]
    assert client.get("/api/v1/health").status_code == 200  # health checks are never limited


def test_sensor_ingestion_gets_a_larger_share(client, monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", 2)
    ingest = [client.post("/api/v1/ingest/readings", json={"node_id": "node-a", "readings": [{"sensor_id": "sen-pump-current", "value": 4}]}, headers={"X-Device-Key": "wrong"}).status_code for _ in range(9)]
    assert ingest[:8] == [401] * 8 and ingest[8] == 429  # 4 x 2 requests before the limit, and the wrong key never got in


def test_oversized_requests_are_refused_before_they_are_read(client):
    r = client.post("/api/v1/auth/login", content=b"{}", headers={"Content-Length": str(config.MAX_BODY_BYTES + 1), "Content-Type": "application/json"})
    assert r.status_code == 413


# ---------- the production guard ----------

def test_demo_settings_are_flagged_for_production():
    problems = config.check_production()
    text = " ".join(problems)
    assert "JALRAKSHAK_SECRET" in text and "JALRAKSHAK_DEMO=0" in text and "JALRAKSHAK_DEMO_PASSWORD" in text and "JALRAKSHAK_DEVICE_KEYS" in text and "PostgreSQL" in text


def test_a_properly_configured_deployment_has_no_problems(monkeypatch):
    monkeypatch.setenv("JALRAKSHAK_SECRET", "x" * 32)
    monkeypatch.setattr(config, "DEMO_MODE", False)
    monkeypatch.setattr(config, "DEMO_PASSWORD", "a-long-private-password")
    monkeypatch.setattr(config, "DEVICE_KEYS", {"node-a": "k" * 24})
    monkeypatch.setattr(config, "DATABASE_URL", "postgresql+psycopg://jal:secret@db/jalrakshak")
    assert config.check_production() == []


def test_production_refuses_to_start_with_demo_settings(engine, monkeypatch):
    monkeypatch.setattr(config, "ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="Refusing to start in production"):
        with TestClient(app):
            pass


def test_development_starts_normally(client):
    assert client.get("/api/v1/health").status_code == 200  # the startup guard is silent outside production


# ---------- retention ----------

def add_readings(session, now):
    for days_ago in (45, 31, 29, 1, 0):
        session.add(m.Reading(sensor_id="sen-tail-pressure", ts=(now - timedelta(days=days_ago)).isoformat(timespec="seconds"), value=1.2, quality_flag="ok"))
    session.commit()


def test_old_readings_are_deleted_and_recent_ones_kept(session):
    now = datetime.now(IST)
    add_readings(session, now)
    assert retention.purge_readings(session, now, days=30) == 2
    assert session.query(m.Reading).count() == 3
    assert retention.purge_readings(session, now, days=30) == 0  # nothing more to remove


def test_zero_days_keeps_everything(session):
    now = datetime.now(IST)
    add_readings(session, now)
    assert retention.purge_readings(session, now, days=0) == 0 and session.query(m.Reading).count() == 5


def test_incoming_readings_trigger_the_purge_but_not_other_records(client, session, monkeypatch):
    from app import integrations

    monkeypatch.setattr(config, "DEVICE_KEYS", {"node-a": "k", "node-b": "k2"})
    monkeypatch.setattr(integrations, "MONITORING_EVERY_SECONDS", 0)
    add_readings(session, datetime.now(IST))
    before = session.query(m.Alert).count() + session.query(m.Complaint).count() + session.query(m.AuditLog).count()
    r = client.post("/api/v1/ingest/readings", json={"node_id": "node-a", "readings": [{"sensor_id": "sen-pump-current", "value": 4.2}]}, headers={"X-Device-Key": "k"})
    assert r.status_code == 201
    session.expire_all()
    assert session.query(m.Reading).filter(m.Reading.ts < (datetime.now(IST) - timedelta(days=30)).isoformat()).count() == 0
    assert session.query(m.Alert).count() + session.query(m.Complaint).count() + session.query(m.AuditLog).count() >= before  # the record is never purged
