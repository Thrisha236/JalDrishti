import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app import config
from app import models as m

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "simulator"))
from scenarios import BASELINE, batches_for, values_for  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
KEYS = {"node-a": "dev-key-node-a", "node-b": "dev-key-node-b"}


@pytest.fixture(autouse=True)
def device_keys(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))


def send(client, body, key=None):
    return client.post("/api/v1/ingest/readings", json=body, headers={"X-Device-Key": key or KEYS[body["node_id"]]})


def run(client, scenario, ticks=3):
    rng = random.Random(1)
    for t in range(ticks):
        for body in batches_for(scenario, t, rng):
            assert send(client, body).status_code == 201


def latest(client, headers):
    live = client.get("/api/v1/telemetry/live", headers=headers).json()
    return live, {s["id"]: s["latest"]["value"] if s["latest"] else None for s in live["sensors"]}


# ---------- ingest ----------

def test_ingest_requires_the_right_device_key(client):
    body = {"node_id": "node-b", "readings": [{"sensor_id": "sen-tail-pressure", "value": 1.2}]}
    assert send(client, body, key="wrong").status_code == 401
    assert client.post("/api/v1/ingest/readings", json=body).status_code == 401
    assert send(client, {**body, "node_id": "node-z"}, key="x").status_code == 401


def test_node_can_only_report_its_own_sensors(client):
    body = {"node_id": "node-b", "readings": [{"sensor_id": "sen-pump-current", "value": 4.2}]}
    assert send(client, body).status_code == 422


def test_impossible_values_are_stored_but_flagged(client, as_gp):
    body = {"node_id": "node-b", "readings": [{"sensor_id": "sen-tail-pressure", "value": -3.0}]}
    r = send(client, body)
    assert r.status_code == 201 and r.json()["flagged"] == 1
    rows = client.get("/api/v1/readings", params={"sensor_id": "sen-tail-pressure"}, headers=as_gp).json()
    assert rows[-1]["quality_flag"] == "out_of_range"


def test_future_and_ancient_timestamps_are_rejected(client):
    base = {"node_id": "node-b", "readings": [{"sensor_id": "sen-tail-pressure", "value": 1.2}]}
    future = (datetime.now(IST) + timedelta(hours=1)).isoformat()
    ancient = (datetime.now(IST) - timedelta(days=8)).isoformat()
    assert send(client, {**base, "ts": future}).status_code == 422
    assert send(client, {**base, "ts": ancient}).status_code == 422


def test_replayed_readings_keep_their_timestamp_but_node_is_seen_now(client, as_gp, session):
    taken = (datetime.now(IST) - timedelta(minutes=3)).replace(microsecond=0)
    body = {"node_id": "node-b", "ts": taken.isoformat(), "readings": [{"sensor_id": "sen-tail-pressure", "value": 1.21}]}
    assert send(client, body).status_code == 201
    rows = client.get("/api/v1/readings", params={"sensor_id": "sen-tail-pressure"}, headers=as_gp).json()
    assert rows[-1]["ts"] == taken.isoformat()
    live, _ = latest(client, as_gp)
    node_b = next(n for n in live["nodes"] if n["id"] == "node-b")
    assert node_b["status"] == "online" and node_b["seconds_since"] < 5


def test_readings_need_sign_in_and_a_known_sensor(client, as_gp):
    assert client.get("/api/v1/readings", params={"sensor_id": "sen-tail-pressure"}).status_code == 401
    assert client.get("/api/v1/readings", params={"sensor_id": "nope"}, headers=as_gp).status_code == 404


def test_readings_are_oldest_first_and_limited(client, as_gp):
    run(client, "normal", ticks=5)
    rows = client.get("/api/v1/readings", params={"sensor_id": "sen-head-flow", "limit": 3}, headers=as_gp).json()
    assert len(rows) == 3
    assert [r["ts"] for r in rows] == sorted(r["ts"] for r in rows)


# ---------- live status ----------

def test_nodes_start_as_never_reported(client, as_gp):
    live, values = latest(client, as_gp)
    assert {n["status"] for n in live["nodes"]} == {"never_reported"}
    assert set(values.values()) == {None}


def test_silent_node_goes_offline_while_the_other_stays_online(client, as_gp, session):
    run(client, "normal", ticks=1)
    stale = (datetime.now(IST) - timedelta(seconds=config.NODE_OFFLINE_AFTER_SECONDS + 10)).isoformat(timespec="seconds")
    session.get(m.SensorNode, "node-b").last_seen_at = stale
    session.commit()
    live, _ = latest(client, as_gp)
    status = {n["id"]: n["status"] for n in live["nodes"]}
    assert status == {"node-a": "online", "node-b": "offline"}
    tail = next(s for s in live["sensors"] if s["id"] == "sen-tail-pressure")
    assert tail["node_status"] == "offline"  # the last value is shown, marked as coming from an offline node


# ---------- simulator scenarios ----------

def test_normal_scenario_stays_near_baseline():
    rng = random.Random(3)
    for t in range(20):
        for sensor, v in values_for("normal", t, rng).items():
            assert abs(v - BASELINE[sensor]) / BASELINE[sensor] < 0.1, sensor


def test_leak_drops_tail_while_head_keeps_flowing(client, as_gp):
    run(client, "leak")
    _, v = latest(client, as_gp)
    assert v["sen-tail-pressure"] < 0.85 < 1.05  # below the 1.05 bar normal band
    assert v["sen-head-flow"] - v["sen-tail-flow"] > 15  # water is lost between head and tail
    assert v["sen-pump-current"] > 3.5  # the pump is fine


def test_pump_off_stops_current_and_flow(client, as_gp):
    run(client, "pump-off")
    _, v = latest(client, as_gp)
    assert v["sen-pump-current"] == 0.0 and v["sen-head-flow"] == 0.0 and v["sen-tail-flow"] == 0.0
    assert v["sen-tail-pressure"] < 0.1


def test_node_offline_scenario_sends_nothing_from_node_b(client, as_gp):
    nodes = {b["node_id"] for b in batches_for("node-offline", 0, random.Random(0))}
    assert nodes == {"node-a"}
    run(client, "node-offline")
    live, v = latest(client, as_gp)
    status = {n["id"]: n["status"] for n in live["nodes"]}
    assert status == {"node-a": "online", "node-b": "never_reported"}
    assert v["sen-tail-pressure"] is None


def test_unknown_scenario_is_rejected():
    with pytest.raises(ValueError):
        values_for("flood", 0, random.Random(0))


def test_demo_reset_clears_readings(client, as_gp):
    run(client, "normal", ticks=2)
    client.post("/api/v1/demo/reset", headers=as_gp)
    _, v = latest(client, as_gp)
    assert set(v.values()) == {None}
