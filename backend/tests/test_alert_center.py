"""The Alert Center: AI, water-quality and community alerts, acknowledgement, escalation, clustering and regularity."""

from datetime import datetime, timedelta, timezone

import pytest

from app import config, fusion, ml
from app import models as m
from conftest import login
from test_incidents import KEYS, leak, report
from test_ml import feed, now_

IST = timezone(timedelta(hours=5, minutes=30))
FEED = "/api/v1/alerts/feed"


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def rules_of(client, headers, **params):
    return {a["rule_code"]: a for a in client.get(FEED, params={"status": "all", **params}, headers=headers).json()["alerts"]}


def check(client, headers, **body):
    return client.post("/api/v1/service-checks", json={"got_water": True, "quantity": "ENOUGH", **body}, headers=headers)


# ---------- the feed ----------

def test_the_demo_data_already_has_quality_and_failure_alerts(client, as_gp):
    alerts = rules_of(client, as_gp)
    unsafe = alerts["QUALITY_TEST_UNSAFE"]
    assert unsafe["kind"] == "WATER_QUALITY" and unsafe["severity"] == "HIGH" and unsafe["zone"] == "South" and "boiling" in unsafe["text"]
    assert "Bacteria" in unsafe["text"] and unsafe["details"]["disclaimer"].startswith("A field test kit is a screening tool")
    due = alerts["FAILURE_DUE"]
    assert due["kind"] == "AI_PREDICTION" and due["asset_code"] == "P-21" and "due for inspection" in due["text"]


def test_a_leak_adds_ai_alerts_next_to_the_rule_alerts(client, as_gp):
    leak(client, ticks=8)
    alerts = rules_of(client, as_gp)
    assert alerts["AI_ANOMALY"]["severity"] == "HIGH" and "behaving unusually" in alerts["AI_ANOMALY"]["text"] and alerts["AI_ANOMALY"]["details"]["engine"] == "ai-v1"
    assert alerts["HEAD_TAIL_FLOW_GAP"]["kind"] == "WATER_SERVICE" and alerts["HEAD_TAIL_FLOW_GAP"]["details"]["engine"] == "rules-v1"
    assert alerts["QUALITY_OUTLOOK_WATCH"]["kind"] == "WATER_QUALITY"
    # /alerts/active is still only the threshold rules
    active = {a["rule_code"] for a in client.get("/api/v1/alerts/active", headers=as_gp).json()}
    assert "HEAD_TAIL_FLOW_GAP" in active and not active & {"AI_ANOMALY", "QUALITY_TEST_UNSAFE", "FAILURE_DUE"}
    # and the public list never shows the AI, quality or community alerts
    assert {a["kind"] for a in client.get("/api/v1/alerts").json()} <= {"WATER_SERVICE", "EQUIPMENT_HEALTH"}


def test_filters_counts_and_roles(client, as_citizen, as_gp, as_officer):
    assert client.get(FEED).status_code == 401 and client.get(FEED, headers=as_citizen).status_code == 403
    body = client.get(FEED, headers=as_gp).json()
    assert body["counts"]["open"] == len(body["alerts"]) and body["counts"]["by_kind"]["WATER_QUALITY"] >= 1
    assert {k["id"] for k in body["kinds"]} == {"WATER_SERVICE", "EQUIPMENT_HEALTH", "AI_PREDICTION", "WATER_QUALITY", "COMMUNITY"}
    only = client.get(FEED, params={"kind": "WATER_QUALITY"}, headers=as_gp).json()["alerts"]
    assert only and {a["kind"] for a in only} == {"WATER_QUALITY"}
    assert client.get(FEED, params={"kind": "WEATHER"}, headers=as_gp).status_code == 422
    assert client.get(FEED, params={"status": "later"}, headers=as_gp).status_code == 422
    assert [a["severity"] for a in body["alerts"]] == sorted((a["severity"] for a in body["alerts"]), key={"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get)
    assert client.get(FEED, headers=as_officer).status_code == 200


# ---------- acknowledgement and escalation ----------

def test_acknowledging_records_who_and_when_and_keeps_the_alert_open(client, as_gp, as_officer, session):
    alert = rules_of(client, as_gp)["QUALITY_TEST_UNSAFE"]
    r = client.post(f"/api/v1/alerts/{alert['id']}/acknowledge", headers=as_gp)
    assert r.status_code == 200 and r.json()["acknowledged_by"] == "Demo GP Operator (Ramapuram)" and r.json()["status"] == "OPEN"
    first = r.json()["acknowledged_at"]
    again = client.post(f"/api/v1/alerts/{alert['id']}/acknowledge", headers=as_officer)
    assert again.json()["acknowledged_at"] == first and again.json()["acknowledged_by"] == "Demo GP Operator (Ramapuram)"  # the first acknowledgement stands
    assert ("acknowledge", "alert", alert["id"]) in [(a.action, a.entity, a.entity_id) for a in session.query(m.AuditLog)]
    open_unack = client.get(FEED, headers=as_gp).json()["counts"]["unacknowledged"]
    assert open_unack == client.get(FEED, headers=as_gp).json()["counts"]["open"] - 1


def test_acknowledging_needs_an_official_in_scope(client, as_citizen, as_gp):
    alert = rules_of(client, as_gp)["QUALITY_TEST_UNSAFE"]
    assert client.post(f"/api/v1/alerts/{alert['id']}/acknowledge", headers=as_citizen).status_code == 403
    assert client.post("/api/v1/alerts/AL-9999/acknowledge", headers=as_gp).status_code == 404
    assert client.post("/api/v1/alerts/AL-76/acknowledge", headers=as_gp).status_code == 404  # scripted story alerts are not live alerts


def test_a_high_alert_nobody_acknowledges_is_escalated_to_the_officer(client, as_gp, as_officer, session):
    alert = rules_of(client, as_gp)["QUALITY_TEST_UNSAFE"]
    assert client.get(FEED, params={"escalated": True}, headers=as_officer).json()["alerts"] == []
    row = session.get(m.Alert, alert["id"])
    row.raised_at = (datetime.now(IST) - timedelta(minutes=45)).isoformat(timespec="seconds")
    session.commit()
    escalated = client.get(FEED, params={"escalated": True}, headers=as_officer).json()
    assert [a["id"] for a in escalated["alerts"]] == [alert["id"]] and escalated["counts"]["escalated"] == 1
    client.post(f"/api/v1/alerts/{alert['id']}/acknowledge", headers=as_gp)
    assert client.get(FEED, params={"escalated": True}, headers=as_officer).json()["alerts"] == []


def test_a_passing_retest_clears_the_quality_alert(client, as_gp):
    assert "QUALITY_TEST_UNSAFE" in rules_of(client, as_gp, status="open")
    r = client.post("/api/v1/water-quality/tests", json={"point_id": "tp-S-T1", "tester": "FTK tester 4", "values": {"bacteria": "absent", "chlorine": 0.4}}, headers=as_gp)
    assert r.json()["verdict"] == "safe"
    after = rules_of(client, as_gp, status="all")["QUALITY_TEST_UNSAFE"]
    assert after["status"] == "CLEARED" and after["cleared_at"]


def test_alert_changes_are_pushed_to_imis_once_per_state(client, as_gp):
    alert = rules_of(client, as_gp)["QUALITY_TEST_UNSAFE"]
    client.post(f"/api/v1/alerts/{alert['id']}/acknowledge", headers=as_gp)
    pushes = [(e["entity_id"], e["version"]) for e in client.get("/api/v1/integrations/events", params={"connector": "imis", "limit": 200}, headers=as_gp).json() if e["entity"] == "alert"]
    assert (alert["id"], "OPEN") in pushes and (alert["id"], "ACKNOWLEDGED") in pushes and pushes.count((alert["id"], "OPEN")) == 1


# ---------- what villagers report ----------

def test_three_households_without_water_raise_a_community_alert(client, as_gp):
    for who in ("citizen", "citizen2"):
        check(client, login(client, who), got_water=False, quantity=None)
    assert "HOUSEHOLDS_NO_WATER" not in rules_of(client, as_gp, status="open")  # two is not yet a pattern
    client.post("/api/v1/service-checks", json={"got_water": False}, headers=login(client, "citizen"))
    # the third villager (villager3) is not in the test logins, so make them directly
    from app import auth

    token = auth.create_token("usr-citizen-north-3")
    client.post("/api/v1/service-checks", json={"got_water": True, "quantity": "LOW"}, headers={"Authorization": f"Bearer {token}"})
    alert = rules_of(client, as_gp, status="open")["HOUSEHOLDS_NO_WATER"]
    assert alert["kind"] == "COMMUNITY" and alert["severity"] == "HIGH" and "3 households in North Area" in alert["text"]
    assert alert["details"]["no_water"] == 2 and alert["details"]["low_water"] == 1


def test_community_alerts_are_never_counted_as_sensor_evidence(client, session):
    for who in ("citizen", "citizen2"):
        client.post("/api/v1/service-checks", json={"got_water": False}, headers=login(client, who))
    from app import auth

    client.post("/api/v1/service-checks", json={"got_water": False}, headers={"Authorization": f"Bearer {auth.create_token('usr-citizen-north-3')}"})
    client.get(FEED, headers=login(client, "gp"))
    assert session.query(m.Alert).filter_by(rule_code="HOUSEHOLDS_NO_WATER").count() == 1
    result = fusion.assess(session, "ast-p21")
    assert {e["type"] for e in result["evidence"]} == {"COMPLAINTS", "RISK"}  # no ALERT evidence from villagers' reports


def test_coloured_water_reports_ask_for_a_field_test(client, as_gp):
    for who in ("citizen", "citizen2"):
        check(client, login(client, who), quality="COLOURED")
    alert = rules_of(client, as_gp, status="open")["HOUSEHOLDS_QUALITY_REPORTS"]
    assert alert["kind"] == "WATER_QUALITY" and "coloured or smelly water" in alert["text"] and "field-kit sample" in alert["text"]


# ---------- DBSCAN complaint clusters ----------

def complaint(session, code, x, y, hours_ago=1, area="sa-north", category="LOW_WATER", precision="approx_25m"):
    session.add(m.Complaint(
        public_code=code, ord=5000 + int(code), citizen_id="usr-citizen-north", service_area_id=area, category=category, description=None,
        created_at=(datetime.now(IST) - timedelta(hours=hours_ago)).isoformat(timespec="seconds"), location={"x": x, "y": y, "precision": precision},
        linked_asset_id=None, is_simulated=False, channel="APP",
    ))


def test_nearby_reports_form_a_cluster_on_the_nearest_pipe(session, monkeypatch):
    monkeypatch.setattr(config, "DEMO_MODE", False)  # only the reports made here
    for i, (x, y) in enumerate([(760, 760), (775, 770), (790, 765), (750, 750)]):
        complaint(session, str(3000 + i), x, y)
    complaint(session, "3100", 200, 150, area="sa-south")  # far away: not part of it
    session.commit()
    clusters = ml.complaint_clusters(session, datetime.now(IST))
    assert len(clusters) == 1
    c = clusters[0]
    assert c["size"] == 4 and c["asset_code"] == "P-21" and c["distance_to_pipe_m"] < 80 and c["radius_m"] < 40 and c["coarse"] is False
    assert c["complaint_codes"] == ["3000", "3001", "3002", "3003"] and c["categories"] == {"LOW_WATER": 4}


def test_too_few_old_or_unlocated_reports_make_no_cluster(session, monkeypatch):
    monkeypatch.setattr(config, "DEMO_MODE", False)
    complaint(session, "3000", 760, 760)
    complaint(session, "3001", 770, 765)
    complaint(session, "3002", 765, 770, hours_ago=30)  # too old
    session.commit()
    assert ml.complaint_clusters(session, datetime.now(IST)) == []
    complaint(session, "3003", 755, 768)
    session.commit()
    assert len(ml.complaint_clusters(session, datetime.now(IST))) == 1  # the fourth, recent one completes it


def test_a_cluster_becomes_a_community_alert_and_clears(client, as_gp, session, monkeypatch):
    monkeypatch.setattr(config, "DEMO_MODE", False)
    for i, (x, y) in enumerate([(760, 760), (775, 770), (790, 765)]):
        complaint(session, str(3000 + i), x, y)
    session.commit()
    alert = rules_of(client, as_gp, status="open")["COMPLAINT_CLUSTER"]
    assert alert["kind"] == "COMMUNITY" and alert["asset_code"] == "P-21" and "3 villager reports" in alert["text"] and alert["details"]["reports"] == ["3000", "3001", "3002"]
    session.query(m.Complaint).filter(m.Complaint.public_code == "3002").delete()
    session.commit()
    assert rules_of(client, as_gp, status="all")["COMPLAINT_CLUSTER"]["status"] == "CLEARED"


# ---------- supply regularity ----------

def test_steady_intermittent_and_dry_supply_are_told_apart(session):
    feed(session, "normal", 40, seconds_per_tick=20)
    steady = ml.supply_regularity(session, now_())
    assert steady["status"] == "ok" and steady["pattern"] == "steady" and steady["on_pct"] >= 95

    session.query(m.Reading).delete()
    feed(session, "intermittent", 80, seconds_per_tick=20)
    flappy = ml.supply_regularity(session, now_())
    assert flappy["pattern"] == "intermittent" and flappy["transitions"] >= 4 and 30 <= flappy["on_pct"] <= 70 and "stopping and starting" in flappy["message"]

    session.query(m.Reading).delete()
    feed(session, "pump-off", 40, seconds_per_tick=20)
    assert ml.supply_regularity(session, now_())["pattern"] == "off"


def test_regularity_needs_trusted_data_and_enough_readings(session):
    assert ml.supply_regularity(session, now_())["status"] == "insufficient_data"
    feed(session, "normal", 5)
    assert "at least 12" in ml.supply_regularity(session, now_())["reason"]


def test_intermittent_supply_raises_an_alert_with_a_cause(client, as_gp, session):
    feed(session, "intermittent", 80, seconds_per_tick=20)
    alert = rules_of(client, as_gp, status="open")["INTERMITTENT_SUPPLY"]
    assert alert["kind"] == "WATER_SERVICE" and alert["asset_code"] == "P-21" and alert["details"]["transitions"] >= 4
    assert "valve operation" in fusion.CAUSE_BY_RULE["INTERMITTENT_SUPPLY"]
