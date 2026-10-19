import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app import config
from app import models as m
from app import rules

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "simulator"))
from scenarios import batches_for  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
KEYS = {"node-a": "dev-key-node-a", "node-b": "dev-key-node-b"}
WATER = {"PUMP_OFF_IN_SUPPLY", "NO_FLOW_IN_SUPPLY", "HEAD_TAIL_FLOW_GAP", "TAIL_PRESSURE_LOW_IN_SUPPLY"}


@pytest.fixture(autouse=True)
def demo_settings(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def send(client, body):
    r = client.post("/api/v1/ingest/readings", json=body, headers={"X-Device-Key": KEYS[body["node_id"]]})
    assert r.status_code == 201, r.text
    return r.json()


def run(client, scenario, ticks, start=0):
    rng = random.Random(7 + start)
    for t in range(start, start + ticks):
        for body in batches_for(scenario, t, rng):
            send(client, body)


def node_b(value_p, value_f=45.0):
    return {"node_id": "node-b", "readings": [{"sensor_id": "sen-tail-pressure", "value": value_p}, {"sensor_id": "sen-tail-flow", "value": value_f}]}


def node_a(current, head_flow, head_p=1.8, level=3.7):
    return {"node_id": "node-a", "readings": [
        {"sensor_id": "sen-pump-current", "value": current}, {"sensor_id": "sen-tank-level", "value": level},
        {"sensor_id": "sen-head-flow", "value": head_flow}, {"sensor_id": "sen-head-pressure", "value": head_p}]}


def active(client, headers):
    return client.get("/api/v1/alerts/active", headers=headers).json()


def codes(alerts):
    return {a["rule_code"] for a in alerts}


# ---------- water rules ----------

def test_normal_operation_raises_nothing(client, as_gp):
    run(client, "normal", 6)
    assert active(client, as_gp) == []


def test_leak_raises_flow_gap_and_low_tail_pressure(client, as_gp):
    run(client, "leak", 4)
    alerts = active(client, as_gp)
    assert codes(alerts) == {"HEAD_TAIL_FLOW_GAP", "TAIL_PRESSURE_LOW_IN_SUPPLY", "ACOUSTIC_LEAK_SIGNATURE"}
    assert {a["kind"] for a in alerts} == {"WATER_SERVICE"}
    gap = next(a for a in alerts if a["rule_code"] == "HEAD_TAIL_FLOW_GAP")
    assert gap["asset_id"] == "ast-p21" and gap["service_area_id"] == "sa-north"
    assert gap["details"]["gap_lpm"] > 15 and gap["details"]["engine"] == "rules-v1"
    assert "possible leak" in gap["text"]


def test_pump_off_raises_pump_and_no_flow(client, as_gp):
    run(client, "pump-off", 4)
    assert codes(active(client, as_gp)) == {"PUMP_OFF_IN_SUPPLY", "NO_FLOW_IN_SUPPLY", "TAIL_PRESSURE_LOW_IN_SUPPLY"}


def test_a_short_blip_does_not_raise_an_alert(client, as_gp):
    run(client, "normal", 3)
    run(client, "leak", PERSIST_MINUS_ONE := rules.PERSIST - 1, start=3)
    assert PERSIST_MINUS_ONE == 2
    assert active(client, as_gp) == []


def test_alerts_clear_after_recovery_and_stay_in_history(client, as_gp):
    run(client, "leak", 4)
    assert active(client, as_gp)
    run(client, "normal", rules.PERSIST, start=4)
    assert active(client, as_gp) == []
    recent = client.get("/api/v1/alerts/recent", headers=as_gp).json()
    assert {a["rule_code"] for a in recent} == {"HEAD_TAIL_FLOW_GAP", "TAIL_PRESSURE_LOW_IN_SUPPLY", "ACOUSTIC_LEAK_SIGNATURE"}
    assert all(a["cleared_at"] for a in recent)


def test_evaluation_is_idempotent(client, as_gp, session):
    run(client, "leak", 4)
    first = active(client, as_gp)
    assert rules.evaluate(session) == {"raised": [], "cleared": []}
    assert [a["id"] for a in active(client, as_gp)] == [a["id"] for a in first]
    assert first[0]["id"].startswith("AL-1")  # live alerts start at AL-100; story fixtures keep AL-76/77


def test_water_rules_respect_the_supply_schedule(client, session, monkeypatch):
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", False)
    morning = datetime(2026, 11, 2, 7, 0, tzinfo=IST)
    night = datetime(2026, 11, 2, 2, 0, tzinfo=IST)
    assert rules.in_supply_window(session, "sa-north", morning)
    assert not rules.in_supply_window(session, "sa-north", night)

    run(client, "leak", 4)  # ingest evaluates at the real current time
    for node in session.query(m.SensorNode):
        node.last_seen_at = night.isoformat()
    session.commit()
    findings = {f.rule_code: f.state for f in rules.check(session, night + timedelta(seconds=5)) if f.kind == "WATER_SERVICE"}
    assert findings and not any(findings.values())  # outside supply hours, low pressure is not a fault


# ---------- sensor-health gate ----------

def test_silent_node_raises_equipment_alert_not_water_alert(client, as_gp, session):
    run(client, "normal", 3)
    run(client, "leak", 2, start=3)  # not yet persistent
    session.get(m.SensorNode, "node-b").last_seen_at = (datetime.now(IST) - timedelta(seconds=60)).isoformat(timespec="seconds")
    session.commit()
    send(client, node_a(4.2, 54.0))  # node A keeps reporting
    alerts = active(client, as_gp)
    assert codes(alerts) == {"NODE_OFFLINE"}
    assert alerts[0]["kind"] == "EQUIPMENT_HEALTH" and "not a water-supply alert" in alerts[0]["text"]


def test_node_offline_clears_when_it_reports_again(client, as_gp, session):
    run(client, "normal", 3)
    session.get(m.SensorNode, "node-b").last_seen_at = (datetime.now(IST) - timedelta(seconds=60)).isoformat(timespec="seconds")
    session.commit()
    assert codes(active(client, as_gp)) == {"NODE_OFFLINE"}
    run(client, "normal", 1, start=3)
    assert active(client, as_gp) == []


def test_stuck_sensor_is_flagged_and_ignored(client, as_gp):
    for i in range(rules.STUCK_READINGS):
        jitter = i * 0.01  # every other sensor varies a little, as real sensors do
        send(client, node_a(4.2 + jitter, 48.0 + 10 * jitter, 1.8 + jitter / 10, 3.7 + jitter / 10))
        send(client, node_b(0.70, 45.0 + 10 * jitter))  # tail pressure identical every time: stuck, not a real drop
    alerts = active(client, as_gp)
    assert codes(alerts) == {"SENSOR_STUCK"}
    assert [a["sensor_id"] for a in alerts] == ["sen-tail-pressure"]
    # The low-pressure alert raised before the sensor was recognised as stuck is withdrawn, with the reason kept.
    withdrawn = [a for a in client.get("/api/v1/alerts/recent", headers=as_gp).json() if a["rule_code"] == "TAIL_PRESSURE_LOW_IN_SUPPLY"]
    assert withdrawn and withdrawn[0]["cleared_at"]
    assert withdrawn[0]["details"]["cleared_reason"] == "withdrawn: depends on a faulty sensor"


def test_impossible_value_is_flagged_and_ignored(client, as_gp):
    for i in range(3):
        send(client, node_a(4.2, 48.0 + i * 0.3))
        send(client, node_b(-3.0 if i == 2 else 1.2 + i * 0.01))
    alerts = active(client, as_gp)
    assert codes(alerts) == {"SENSOR_OUT_OF_RANGE"}
    assert alerts[0]["details"]["value"] == -3.0


def test_flow_without_pump_current_is_a_sensor_fault_not_a_pump_fault(client, as_gp):
    for i in range(3):
        send(client, node_a(0.0, 48.0 + i * 0.4))  # pump "off" yet water flowing
        send(client, node_b(1.2 + i * 0.01, 45.0 + i * 0.3))
    alerts = active(client, as_gp)
    assert codes(alerts) == {"SENSOR_INCONSISTENT"}
    assert not codes(alerts) & WATER


# ---------- endpoints ----------

def test_alert_endpoints_need_sign_in(client):
    assert client.get("/api/v1/alerts/active").status_code == 401
    assert client.get("/api/v1/alerts/recent").status_code == 401


def test_story_fixture_alerts_are_not_live_alerts(client, as_gp):
    assert active(client, as_gp) == []
    all_alerts = client.get("/api/v1/alerts").json()
    assert {a["id"] for a in all_alerts} == {"AL-76", "AL-77"}


def test_water_alerts_are_listed_before_equipment_alerts(client, as_gp, session):
    run(client, "leak", 4)
    session.get(m.SensorNode, "node-a").last_seen_at = (datetime.now(IST) - timedelta(seconds=60)).isoformat(timespec="seconds")
    session.commit()
    kinds = [a["kind"] for a in active(client, as_gp)]
    assert kinds[0] == "WATER_SERVICE" and kinds[-1] == "EQUIPMENT_HEALTH"
