import io
import random
import sys
from pathlib import Path

import pytest
from PIL import Image

from app import config
from app import models as m
from app.auth import create_token

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "simulator"))
from scenarios import batches_for  # noqa: E402

KEYS = {"node-a": "dev-key-node-a", "node-b": "dev-key-node-b"}


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def photo() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (64, 48), (80, 100, 120)).save(out, "JPEG")
    return out.getvalue()


def report(client, headers, with_photo=True):
    files = {"photo": ("pipe.jpg", photo(), "image/jpeg")} if with_photo else None
    r = client.post("/api/v1/complaints", data={"category": "LOW_WATER", "service_area_id": "sa-north"}, files=files, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["public_code"]


def leak(client, ticks=4):
    rng = random.Random(5)
    for t in range(ticks):
        for body in batches_for("leak", t, rng):
            assert client.post("/api/v1/ingest/readings", json=body, headers={"X-Device-Key": KEYS[body["node_id"]]}).status_code == 201


def assess(client, headers, **body):
    return client.post("/api/v1/incidents/assess", json={"asset_id": "ast-p21", **body}, headers=headers)


def open_incident(client, headers, **body):
    return client.post("/api/v1/incidents", json={"asset_id": "ast-p21", **body}, headers=headers)


# ---------- sign-in ----------

def test_login_returns_a_token_and_hides_the_password(client):
    r = client.post("/api/v1/auth/login", json={"username": "gp.ramapuram", "password": config.DEMO_PASSWORD})
    body = r.json()
    assert r.status_code == 200 and body["token_type"] == "bearer"
    assert body["user"]["id"] == "usr-gp-ramapuram" and "password_hash" not in body["user"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["username"] == "gp.ramapuram"


def test_wrong_password_and_unknown_user_look_the_same(client):
    a = client.post("/api/v1/auth/login", json={"username": "gp.ramapuram", "password": "nope"})
    b = client.post("/api/v1/auth/login", json={"username": "nobody", "password": "nope"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_technician_has_no_login(client):
    assert client.post("/api/v1/auth/login", json={"username": "usr-tech-ravi", "password": config.DEMO_PASSWORD}).status_code == 401


def test_repeated_failures_lock_the_username(client):
    for _ in range(config.LOGIN_MAX_FAILURES):
        client.post("/api/v1/auth/login", json={"username": "villager1", "password": "wrong"})
    r = client.post("/api/v1/auth/login", json={"username": "villager1", "password": config.DEMO_PASSWORD})
    assert r.status_code == 429


def test_tampered_or_expired_tokens_are_rejected(client):
    good = create_token("usr-gp-ramapuram", "gp")
    tampered = good[:-2] + ("AA" if not good.endswith("AA") else "BB")
    expired = create_token("usr-gp-ramapuram", "gp", now=1_000_000)
    for token in (tampered, expired, "not.a.token"):
        assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


# ---------- evidence fusion ----------

def test_full_story_evidence_reaches_high_with_four_kinds(client, as_citizen, as_gp):
    report(client, as_citizen)
    leak(client)
    body = assess(client, as_gp).json()
    kinds = {e["type"]: e["contribution"] for e in body["evidence"]}
    assert kinds == {"ALERT": 0.35, "COMPLAINTS": 0.25, "RISK": 0.15, "IMAGE": 0.06}
    assert body["evidence_score"] == 0.81 and body["priority"] == "HIGH"
    assert body["complaint_codes"] == ["2048", "2049", "2051"]
    assert "not a probability" in body["evidence_score_note"]
    assert "Possible leak" in body["probable_cause"]
    assert any("leak position not localised" in u for u in body["uncertainties"])
    assert body["affected_households"]["estimate"] == 64


def test_reports_without_sensor_confirmation_stay_medium(client, as_citizen, as_gp):
    report(client, as_citizen)
    body = assess(client, as_gp).json()
    assert {e["type"] for e in body["evidence"]} == {"COMPLAINTS", "RISK", "IMAGE"}
    assert body["priority"] == "MEDIUM"
    assert "without sensor confirmation" in body["probable_cause"]


def test_one_kind_of_evidence_alone_can_never_be_high(client, as_gp, session):
    # Only sensor alerts: no complaints (fixtures assigned elsewhere), low-risk pipe.
    leak(client)
    for c in session.query(m.Complaint):
        c.incident_code = None
    session.commit()
    body = assess(client, as_gp, complaint_codes=[]).json()
    assert body["priority"] != "HIGH"


def test_gp_can_choose_which_reports_to_include(client, as_citizen, as_gp):
    report(client, as_citizen)
    body = assess(client, as_gp, complaint_codes=["2048"]).json()
    assert body["complaint_codes"] == ["2048"]
    assert assess(client, as_gp, complaint_codes=["9999"]).status_code == 422


def test_suggestions_list_pipelines_worth_an_incident(client, as_citizen, as_gp):
    report(client, as_citizen)
    leak(client)
    rows = client.get("/api/v1/incidents/suggestions", headers=as_gp).json()
    assert rows[0]["asset_code"] == "P-21" and rows[0]["priority"] == "HIGH"


def test_only_officials_assess_and_only_gp_opens(client, as_citizen, as_officer):
    assert assess(client, as_citizen).status_code == 403
    assert open_incident(client, as_officer).status_code == 403
    assert assess(client, as_officer).status_code == 200


# ---------- incident and task lifecycle ----------

def test_open_incident_links_reports_and_blocks_duplicates(client, as_citizen, as_gp):
    report(client, as_citizen)
    leak(client)
    r = open_incident(client, as_gp)
    assert r.status_code == 201
    inc = r.json()
    assert inc["code"] == "INC-0311" and inc["status"] == "TRIAGED" and inc["evidence_score"] == 0.81
    assert inc["complaint_codes"] == ["2048", "2049", "2051"]
    mine = client.get("/api/v1/complaints/mine", headers=as_citizen).json()[0]
    assert mine["incident_code"] == "INC-0311" and mine["linked_asset_id"] == "ast-p21"
    assert [e["key"] for e in mine["progress"]] == ["received", "checking"]
    assert open_incident(client, as_gp).status_code == 409


def test_weak_evidence_does_not_open_an_incident(client, as_gp):
    r = client.post("/api/v1/incidents", json={"asset_id": "ast-p09", "complaint_codes": []}, headers=as_gp)
    assert r.status_code == 422 and "too low" in r.json()["detail"]


def test_task_lifecycle_records_a_repair_that_feeds_risk(client, as_citizen, as_gp):
    report(client, as_citizen)
    leak(client)
    open_incident(client, as_gp)
    before = client.get("/api/v1/pipelines/ast-p21/risk").json()["factors"]["prior_failures"]

    r = client.post("/api/v1/tasks", json={"incident_code": "INC-0311", "assignee_id": "usr-tech-ravi"}, headers=as_gp)
    assert r.status_code == 201
    task = r.json()
    assert task["code"] == "T-118" and task["status"] == "ASSIGNED" and task["assignee_name"].startswith("Ravi")
    assert client.get("/api/v1/incidents/INC-0311").json()["status"] == "TASK_ASSIGNED"

    url = "/api/v1/tasks/T-118/updates"
    assert client.post(url, json={"status": "REPAIRED", "failure_type": "leak"}, headers=as_gp).status_code == 409  # cannot skip steps
    assert client.post(url, json={"status": "INSPECTING"}, headers=as_gp).status_code == 201
    assert client.post(url, json={"status": "REPAIRING", "note": "Joint leak at collar"}, headers=as_gp).status_code == 201
    assert client.post(url, json={"status": "REPAIRED"}, headers=as_gp).status_code == 422  # must say what was repaired
    done = client.post(url, json={"status": "REPAIRED", "failure_type": "leak", "note": "Coupling replaced"}, headers=as_gp).json()
    assert [u["status"] for u in done["updates"]] == ["ASSIGNED", "INSPECTING", "REPAIRING", "REPAIRED"]
    assert client.get("/api/v1/incidents/INC-0311").json()["status"] == "REPAIR_DONE"

    pipe = client.get("/api/v1/pipelines/ast-p21").json()
    assert pipe["repairs"][-1]["incident_id"] == "INC-0311" and pipe["repairs"][-1]["failure_type"] == "leak"
    after = client.get("/api/v1/pipelines/ast-p21/risk").json()["factors"]["prior_failures"]
    assert (before, after) == (20, 25)  # a fourth failure in 36 months

    progress = client.get("/api/v1/complaints/mine", headers=as_citizen).json()[0]["progress"]
    assert [e["key"] for e in progress] == ["received", "checking", "repair_started", "repaired"]
    assert client.post(url, json={"status": "REPAIRED", "failure_type": "leak"}, headers=as_gp).status_code == 409


def test_task_rules(client, as_citizen, as_gp, as_officer):
    report(client, as_citizen)
    leak(client)
    open_incident(client, as_gp)
    body = {"incident_code": "INC-0311", "assignee_id": "usr-tech-ravi"}
    assert client.post("/api/v1/tasks", json={**body, "assignee_id": "usr-citizen-north"}, headers=as_gp).status_code == 422
    assert client.post("/api/v1/tasks", json={**body, "due_at": "2020-01-01T10:00:00+05:30"}, headers=as_gp).status_code == 422
    assert client.post("/api/v1/tasks", json=body, headers=as_officer).status_code == 403
    assert client.post("/api/v1/tasks", json=body, headers=as_gp).status_code == 201
    assert client.post("/api/v1/tasks", json=body, headers=as_gp).status_code == 409  # one task per incident
    assert [t["code"] for t in client.get("/api/v1/tasks", headers=as_gp).json()] == ["T-118"]


def test_incident_and_task_writes_are_audited(client, as_citizen, as_gp, session):
    report(client, as_citizen)
    leak(client)
    open_incident(client, as_gp)
    client.post("/api/v1/tasks", json={"incident_code": "INC-0311", "assignee_id": "usr-tech-ravi"}, headers=as_gp)
    actions = [(r.action, r.entity, r.entity_id) for r in session.query(m.AuditLog).order_by(m.AuditLog.id)]
    assert ("open", "incident", "INC-0311") in actions and ("create", "task", "T-118") in actions


def test_demo_reset_clears_live_incidents(client, as_citizen, as_gp):
    report(client, as_citizen)
    leak(client)
    open_incident(client, as_gp)
    client.post("/api/v1/demo/reset", headers=as_gp)
    assert client.get("/api/v1/incidents/INC-0311").status_code == 404
