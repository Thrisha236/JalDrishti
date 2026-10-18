"""Stage 12: the MOCK integration hub (IMIS, Sujal Gaon / Sujalam Bharat, JJM Dashboard, WQMIS)."""

import re

import pytest

from app import config, integrations
from app import models as m
from test_incidents import KEYS, leak, open_incident, report
from test_rules import run as run_scenario


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def events(client, headers, **params):
    return client.get("/api/v1/integrations/events", params={"limit": 200, **params}, headers=headers).json()


def test_everything_is_labelled_as_a_mock(client, as_gp):
    body = client.get("/api/v1/integrations", headers=as_gp).json()
    assert body["mock"] is True and "MOCK CONNECTORS" in body["notice"] and "No real government system is contacted" in body["notice"]
    assert {c["id"] for c in body["connectors"]} == {"sujal_gaon", "imis", "jjm_dashboard", "wqmis", "meri_panchayat"}
    assert {c["status"] for c in body["connectors"]} == {"CONNECTED_MOCK"}
    assert {c["direction"] for c in body["connectors"]} == {"PULL", "PUSH"}


def test_only_officials_can_use_the_hub(client, as_citizen, as_gp, as_officer):
    for path in ("integrations", "integrations/crosswalk", "integrations/events"):
        assert client.get(f"/api/v1/{path}").status_code == 401
        assert client.get(f"/api/v1/{path}", headers=as_citizen).status_code == 403
    assert client.post("/api/v1/integrations/sync", headers=as_citizen).status_code == 403
    assert client.post("/api/v1/integrations/sync", headers=as_officer).status_code == 200


def test_crosswalk_shows_our_ids_next_to_the_national_ones(client, as_gp, as_officer):
    mine = client.get("/api/v1/integrations/crosswalk", headers=as_gp).json()
    assert [v["village"] for v in mine["villages"]] == ["Ramapuram"]  # a GP sees their own village
    village = mine["villages"][0]
    assert village["lgd_code"] == "LGD-DEMO-001" and village["schemes"][0]["sujalam_bharat_id"] == "SB-DEMO-001"
    north = next(a for a in village["service_areas"] if a["service_area_id"] == "sa-north")
    assert north["sujal_gaon_id"] == "SG-DEMO-0421" and north["households"] == 64 and north["resolved"] is True
    south = next(a for a in village["service_areas"] if a["service_area_id"] == "sa-south")
    assert south["sujal_gaon_id"] is None and south["resolved"] is False and "Not yet issued" in south["note"]  # an honest gap, not an error
    assert village["all_resolved"] is False
    assert len(client.get("/api/v1/integrations/crosswalk", headers=as_officer).json()["villages"]) == 3


def test_sync_runs_every_connector_and_logs_mock_references(client, as_gp):
    first = client.post("/api/v1/integrations/sync", headers=as_gp).json()
    assert first["by_connector"]["sujal_gaon"] == 3 and first["by_connector"]["jjm_dashboard"] == 3
    assert first["by_connector"]["imis"] == 0  # no node has reported yet, so there is no monitoring data to send
    run_scenario(client, "normal", 3)
    r = client.post("/api/v1/integrations/sync", headers=as_gp).json()
    assert r["mock"] is True and r["by_connector"]["sujal_gaon"] == 3 and r["by_connector"]["jjm_dashboard"] == 3 and r["by_connector"]["imis"] == 2
    assert r["by_connector"]["wqmis"] == 0  # nothing needs a sample under normal conditions
    log = events(client, as_gp)
    assert len(log) >= r["messages"] and sum(e["trigger"] == "manual" for e in log) == first["messages"] + r["messages"]
    assert all(re.fullmatch(r"(SGB|IMIS|JJMD|WQ)-MOCK-\d{6}", e["external_ref"]) and e["status"] == "ACCEPTED_MOCK" for e in log)
    assert all(e["payload"]["format"] == "illustrative" for e in log)
    pull = next(e for e in log if e["connector"] == "sujal_gaon")
    assert pull["direction"] == "PULL" and pull["payload"]["lgd_code"].startswith("LGD-DEMO") and "SG-DEMO-0421" in str(events(client, as_gp, connector="sujal_gaon"))
    func = next(e for e in log if e["connector"] == "jjm_dashboard" and e["entity_id"] == "vil-ramapuram")
    assert func["direction"] == "PUSH" and "basis" in func["payload"] and "simulated" in func["payload"]["basis"]
    assert {e["connector"] for e in events(client, as_gp, connector="imis")} == {"imis"}


def test_messages_carry_no_personal_data(client, as_citizen, as_gp):
    report(client, as_citizen)
    leak(client)
    open_incident(client, as_gp)
    client.post("/api/v1/integrations/sync", headers=as_gp)
    text = str(events(client, as_gp))
    assert not re.search(r"\b\d{10}\b", text)  # no phone-number-like values
    for banned in ("villager1", "usr-citizen", "description", "password"):
        assert banned not in text


def test_incident_changes_are_pushed_to_imis_once_each(client, as_citizen, as_gp):
    report(client, as_citizen)
    leak(client)
    code = open_incident(client, as_gp).json()["code"]
    pushes = lambda: [(e["version"], e["payload"]["incident"]["status"]) for e in events(client, as_gp, connector="imis") if e["entity"] == "incident"][::-1]  # noqa: E731
    assert pushes() == [("TRIAGED", "TRIAGED")]
    task = client.post("/api/v1/tasks", json={"incident_code": code, "assignee_id": "usr-tech-ravi"}, headers=as_gp).json()["code"]
    url = f"/api/v1/tasks/{task}/updates"
    for status in ("INSPECTING", "REPAIRING"):
        client.post(url, json={"status": status}, headers=as_gp)
    client.post(url, json={"status": "REPAIRED", "failure_type": "leak"}, headers=as_gp)
    assert [v for v, _ in pushes()] == ["TRIAGED", "TASK_ASSIGNED", "REPAIR_DONE"]  # steps with no status change push nothing
    client.post(f"/api/v1/incidents/{code}/resolve", json={"note": "Villagers confirm water is back"}, headers=as_gp)
    assert [v for v, _ in pushes()][-1] == "RESOLVED_UNVERIFIED"
    first = next(e for e in events(client, as_gp, connector="imis") if e["entity"] == "incident")
    assert first["payload"]["sujal_gaon_id"] == "SG-DEMO-0421" and first["payload"]["sujalam_bharat_id"] == "SB-DEMO-001" and first["payload"]["lgd_code"] == "LGD-DEMO-001"


def test_pushing_the_same_state_twice_sends_nothing(session):
    inc = m.Incident(code="INC-9999", ord=9999, is_history=False, asset_id="ast-p21", service_area_id="sa-north", opened_at="2026-10-18T10:00:00+05:30",
                     closed_at=None, status="TRIAGED", priority="HIGH", evidence_score=0.8)
    session.add(inc)
    session.flush()
    assert integrations.on_incident(session, inc) is True
    assert integrations.on_incident(session, inc) is False
    inc.status = "TASK_ASSIGNED"
    assert integrations.on_incident(session, inc) is True


def test_incoming_readings_feed_imis_monitoring_about_once_a_minute(client, as_gp):
    run_scenario(client, "normal", 4)
    imis = [e for e in events(client, as_gp, connector="imis") if e["entity"] == "monitoring"]
    assert {e["entity_id"] for e in imis} == {"node-a", "node-b"} and all(e["trigger"] == "auto" for e in imis)
    run_scenario(client, "normal", 4, start=4)
    assert len([e for e in events(client, as_gp, connector="imis") if e["entity"] == "monitoring"]) == 2  # one per node, rate-limited
    node_b = next(e for e in imis if e["entity_id"] == "node-b")
    assert node_b["payload"]["sujal_gaon_id"] == "SG-DEMO-0421" and node_b["payload"]["node"]["reporting"] is True


def test_a_quality_risk_sends_a_sample_request_to_wqmis(client, as_gp, monkeypatch):
    monkeypatch.setattr(integrations, "MONITORING_EVERY_SECONDS", 0)  # let every batch of readings trigger the checks
    run_scenario(client, "pump-off", 6)
    wq = events(client, as_gp, connector="wqmis")
    assert len(wq) == 1 and wq[0]["entity"] == "sample_request" and wq[0]["payload"]["risk"] == "AT_RISK"
    assert "Indicator from a model" in wq[0]["payload"]["note"]
    assert any(e["connector"] == "jjm_dashboard" and e["entity"] == "functionality" and e["payload"]["non_functional"] > 0 for e in events(client, as_gp))


def test_a_failing_connector_never_loses_a_reading(client, as_gp, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("mock endpoint down")

    monkeypatch.setattr(integrations, "_push_monitoring", boom)
    run_scenario(client, "normal", 2)  # ingest still succeeds
    assert client.get("/api/v1/readings", params={"sensor_id": "sen-tail-pressure", "minutes": 5}, headers=as_gp).json()
