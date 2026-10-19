"""Acoustic (leak noise) and residual-chlorine channels: what a node with those sensors sends, and what the platform does with it."""

import random
import sys
from pathlib import Path

import pytest

from app import config
from app import models as m
from app import ml

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "simulator"))
from scenarios import NODE_SENSORS, batches_for  # noqa: E402

KEYS = {"node-a": "dev-key-node-a", "node-b": "dev-key-node-b"}


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def send(client, body):
    return client.post("/api/v1/ingest/readings", json=body, headers={"X-Device-Key": KEYS[body["node_id"]]})


def run(client, scenario, ticks=6):
    rng = random.Random(3)
    for t in range(ticks):
        for body in batches_for(scenario, t, rng):
            assert send(client, body).status_code == 201


def open_rules(session):
    return {a.rule_code for a in session.query(m.Alert).filter(m.Alert.is_simulated.is_(False), m.Alert.cleared_at.is_(None))}


def test_the_two_new_sensor_kinds_are_registered_on_the_nodes(session):
    kinds = {(s.kind, s.position): s.node_id for s in session.query(m.Sensor)}
    assert kinds[("acoustic", "head")] == "node-a" and kinds[("acoustic", "tail")] == "node-b"
    assert kinds[("chlorine", "head")] == "node-a" and kinds[("chlorine", "tail")] == "node-b"
    assert {"sen-tail-acoustic", "sen-tail-chlorine"} <= set(NODE_SENSORS["node-b"])


def test_impossible_acoustic_and_chlorine_values_are_flagged(client):
    r = send(client, {"node_id": "node-b", "readings": [{"sensor_id": "sen-tail-chlorine", "value": 12.0}, {"sensor_id": "sen-tail-acoustic", "value": 5000.0}]})
    assert r.status_code == 201 and r.json()["flagged"] == 2


def test_normal_operation_raises_no_acoustic_or_chlorine_alert(client, session):
    run(client, "normal")
    assert "ACOUSTIC_LEAK_SIGNATURE" not in open_rules(session)
    assert "QUALITY_OUTLOOK_AT_RISK" not in open_rules(session)


def test_a_leak_is_heard_by_the_acoustic_sensors_and_seen_in_the_flow_gap(client, session):
    run(client, "leak")
    rules = open_rules(session)
    assert "ACOUSTIC_LEAK_SIGNATURE" in rules and "HEAD_TAIL_FLOW_GAP" in rules  # two independent kinds of evidence
    text = [a.text for a in session.query(m.Alert).filter_by(rule_code="ACOUSTIC_LEAK_SIGNATURE")]
    assert any("leak noise" in t and "normal level" in t for t in text)


def test_a_dosing_failure_is_caught_by_the_chlorine_probe_not_the_hydraulics(client, session):
    run(client, "chlorine-drop", ticks=8)
    rules = open_rules(session)
    assert "QUALITY_OUTLOOK_AT_RISK" in rules
    assert not rules & {"HEAD_TAIL_FLOW_GAP", "TAIL_PRESSURE_LOW_IN_SUPPLY", "ACOUSTIC_LEAK_SIGNATURE"}  # water supply itself is fine
    q = ml.quality_outlook(session)[0]
    assert q["basis"] == "measured" and q["measured_residual_mg_l"] < 0.2 and "never certifies" in q["disclaimer"]
    assert any(r.startswith("Measured residual chlorine") for r in q["reasons"])


def test_the_leak_alert_clears_when_the_pipe_is_quiet_again(client, session):
    run(client, "leak")
    assert "ACOUSTIC_LEAK_SIGNATURE" in open_rules(session)
    run(client, "normal", ticks=6)
    assert "ACOUSTIC_LEAK_SIGNATURE" not in open_rules(session)
