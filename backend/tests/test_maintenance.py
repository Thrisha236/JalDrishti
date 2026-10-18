"""The preventive maintenance planner: ranking, planning an inspection in one step, and closing it with no fault found."""

from datetime import datetime, timedelta, timezone

import pytest

from app import config
from app import models as m
from test_incidents import KEYS, leak

IST = timezone(timedelta(hours=5, minutes=30))
PRIORITIES = "/api/v1/maintenance/priorities"
PLAN = "/api/v1/maintenance/preventive"


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def items(client, headers):
    return {i["asset_code"]: i for i in client.get(PRIORITIES, headers=headers).json()["items"]}


def plan(client, headers, **body):
    return client.post(PLAN, json={"asset_id": "ast-p21", "assignee_id": "usr-tech-ravi", **body}, headers=headers)


# ---------- the ranking ----------

def test_the_planner_ranks_pipes_and_explains_why(client, as_gp):
    body = client.get(PRIORITIES, headers=as_gp).json()
    assert body["is_simulated"] is True and "not a probability" in body["note"] and "no costs or prices" in body["note"]
    assert sum(body["weights"].values()) == 100
    top = body["items"][0]
    assert top["asset_code"] == "P-21" and top["band"] == "HIGH" and top["score"] >= 50 and top["inspect_within_days"] == 14
    kinds = {r["type"] for r in top["reasons"]}
    assert {"RISK", "FAILURE_WINDOW"} <= kinds and "passed" in next(r["text"] for r in top["reasons"] if r["type"] == "FAILURE_WINDOW")
    assert [r["points"] for r in top["reasons"]] == sorted((r["points"] for r in top["reasons"]), reverse=True)
    assert abs(sum(r["points"] for r in top["reasons"]) - top["score"]) < 6  # the reasons add up to (about) the score
    assert top["action"].startswith("Inspect P-21 within 14 days") and top["households"] == 64
    scores = [i["score"] for i in body["items"]]
    assert scores == sorted(scores, reverse=True)
    assert [t["id"] for t in body["technicians"]] == ["usr-tech-ravi"]


def test_scope_and_roles(client, as_citizen, as_gp, as_officer):
    assert client.get(PRIORITIES).status_code == 401 and client.get(PRIORITIES, headers=as_citizen).status_code == 403
    assert set(items(client, as_gp)) == {"P-21", "P-14", "P-09", "P-03"}  # their own village only
    assert {"K-04", "S-02"} <= set(items(client, as_officer))


def test_live_signals_push_a_pipe_up_the_list(client, as_gp):
    before = items(client, as_gp)["P-21"]["score"]
    leak(client, ticks=8)
    after = items(client, as_gp)["P-21"]
    assert after["score"] > before and any(r["type"] == "LIVE" for r in after["reasons"])


# ---------- planning an inspection ----------

def test_planning_opens_a_preventive_incident_and_task_in_one_step(client, as_gp, session):
    r = plan(client, as_gp, note="Check the joints before the monsoon")
    assert r.status_code == 201
    inc, task = r.json()["incident"], r.json()["task"]
    assert inc["code"] == "INC-0311" and inc["origin"] == "PREVENTIVE" and inc["status"] == "TASK_ASSIGNED" and inc["priority"] == "HIGH"
    assert "no failure has occurred" in inc["probable_cause"].lower() and any("No failure" in u for u in inc["uncertainties"])
    assert {e["type"] for e in inc["evidence"]} >= {"RISK", "FAILURE_WINDOW"} and "not a probability" in inc["evidence_score_note"]
    assert task["code"] == "T-118" and task["origin"] == "PREVENTIVE" and task["assignee_name"].startswith("Ravi") and task["status"] == "ASSIGNED" and task["overdue"] is False
    assert datetime.fromisoformat(task["due_at"]) > datetime.now(IST) + timedelta(days=10)  # the planner's 14-day window
    after = items(client, as_gp)["P-21"]
    assert after["open_incident"] == "INC-0311" and after["open_task"] == "T-118"
    assert ("open", "incident", "INC-0311") in [(a.action, a.entity, a.entity_id) for a in session.query(m.AuditLog)]
    pushed = [e for e in client.get("/api/v1/integrations/events", params={"connector": "imis", "limit": 100}, headers=as_gp).json() if e["entity"] == "incident"]
    assert pushed and pushed[0]["payload"]["incident"]["status"] == "TASK_ASSIGNED"


def test_a_pipe_with_open_work_cannot_be_planned_twice(client, as_gp):
    assert plan(client, as_gp).status_code == 201
    assert plan(client, as_gp).status_code == 409


def test_planning_rules(client, as_citizen, as_gp, as_officer, session):
    assert plan(client, as_citizen).status_code == 403 and plan(client, as_officer).status_code == 403
    assert plan(client, as_gp, assignee_id="usr-gp-ramapuram").status_code == 422  # not a technician
    assert plan(client, as_gp, due_at="2020-01-01T10:00:00+05:30").status_code == 422
    assert plan(client, as_gp, asset_id="ast-oht1").status_code == 404  # not a pipeline
    assert plan(client, as_gp, asset_id="ast-nowhere").status_code == 404
    assert plan(client, as_gp, asset_id="ast-k04").status_code == 403  # another village
    assert plan(client, as_gp, note="x" * 201).status_code == 422
    assert session.query(m.Incident).filter_by(is_history=False).count() == 0  # nothing was half-created by the failures


# ---------- closing it ----------

def finish(client, headers, failure_type, status_steps=("INSPECTING", "REPAIRING")):
    url = "/api/v1/tasks/T-118/updates"
    for s in status_steps:
        client.post(url, json={"status": s}, headers=headers)
    return client.post(url, json={"status": "REPAIRED", "failure_type": failure_type}, headers=headers)


def test_no_fault_found_closes_the_incident_without_a_repair_record(client, as_gp, session):
    risk_before = client.get("/api/v1/pipelines/ast-p21/risk").json()["factors"]["prior_failures"]
    repairs_before = session.query(m.Repair).count()
    plan(client, as_gp)
    r = finish(client, as_gp, "no_fault_found")
    assert r.status_code == 201
    assert client.get("/api/v1/incidents/INC-0311").json()["status"] == "CLOSED_NO_FAULT"
    assert session.query(m.Repair).count() == repairs_before  # an inspection that finds nothing is not a failure
    assert client.get("/api/v1/pipelines/ast-p21/risk").json()["factors"]["prior_failures"] == risk_before
    assert client.get("/api/v1/incidents/INC-0311/verification").status_code == 404  # no restoration check to wait for
    assert items(client, as_gp)["P-21"]["open_incident"] is None  # ready to plan again later


def test_a_real_repair_after_a_preventive_inspection_is_recorded_normally(client, as_gp, session):
    plan(client, as_gp)
    finish(client, as_gp, "joint_failure")
    assert client.get("/api/v1/incidents/INC-0311").json()["status"] == "REPAIR_DONE"
    assert session.query(m.Repair).filter_by(incident_id="INC-0311").count() == 1
    assert client.get("/api/v1/incidents/INC-0311/verification").json()["result"] == "PENDING"


def test_overdue_tasks_are_flagged(client, as_gp, session):
    plan(client, as_gp)
    assert client.get("/api/v1/tasks", headers=as_gp).json()[0]["overdue"] is False
    session.query(m.MaintenanceTask).update({"due_at": (datetime.now(IST) - timedelta(days=1)).isoformat(timespec="seconds")})
    session.commit()
    assert client.get("/api/v1/tasks", headers=as_gp).json()[0]["overdue"] is True
    finish(client, as_gp, "no_fault_found")
    assert client.get("/api/v1/tasks", headers=as_gp).json()[0]["overdue"] is False  # done is not overdue
