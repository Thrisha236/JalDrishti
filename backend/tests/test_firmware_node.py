"""The node firmware and the gateway bridge, tested on a PC against the real API.

A fake board produces the electrical signals a real node would see (4-20 mA loop voltages, a pulse train, an acoustic
waveform, an echo time) from the same scenario values the simulator uses. The firmware logic turns them back into
readings, and the readings go through the real ingestion endpoint and rules. If the firmware's scaling were wrong,
these tests would fail."""

import importlib.util
import math
import random
import sys
from pathlib import Path

import pytest

from app import config
from app import models as m
from app.telemetry_api import ReadingBatch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "simulator"))
sys.path.insert(0, str(ROOT / "hardware" / "firmware"))
from scenarios import values_for  # noqa: E402
from node import Node, ac_rms_mv, ma_from_volts, scale_loop  # noqa: E402


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fw_config = load("fw_config", ROOT / "hardware" / "firmware" / "config.py")
bridge_mod = load("bridge", ROOT / "hardware" / "gateway" / "bridge.py")
KEYS = {"node-a": "dev-key-node-a", "node-b": "dev-key-node-b"}


class Cfg:
    """The firmware config for one node, with the node id changed."""

    def __init__(self, node_id):
        for k in dir(fw_config):
            if k.isupper():
                setattr(self, k, getattr(fw_config, k))
        self.NODE_ID = node_id


class FakeBoard:
    """What the pins would see for given true sensor values."""

    def __init__(self, truth, cfg):
        self.t, self.cfg = truth, cfg
        self.loops = {}

    def _loop_v(self, value, lo, hi):
        ma = 4 + (value - lo) / (hi - lo) * 16
        return ma / 1000 * self.cfg.SHUNT_OHMS

    def loop_volts(self, ch):
        spec = next(s for s in self.cfg.SENSORS[self.cfg.NODE_ID].values() if s.get("ads") == ch)
        sid = next(k for k, s in self.cfg.SENSORS[self.cfg.NODE_ID].items() if s is spec)
        if sid in self.loops:
            return self.loops[sid]
        return self._loop_v(self.t[sid], spec["lo"], spec["hi"])

    @staticmethod
    def _wave(rms_mv, n, bias=1650.0):
        amp = rms_mv * math.sqrt(2)
        return [bias + amp * math.sin(2 * math.pi * 500 * i / 4000) for i in range(n)]

    def acoustic_samples(self, n):
        sid = "sen-head-acoustic" if self.cfg.NODE_ID == "node-a" else "sen-tail-acoustic"
        return self._wave(self.t[sid], n)

    def ct_samples(self, n):
        return self._wave(self.t["sen-pump-current"] / 30.0 * 1000.0, n)

    def pulse_count_and_reset(self):
        sid = "sen-head-flow" if self.cfg.NODE_ID == "node-a" else "sen-tail-flow"
        return round(self.t[sid] * 7.5 * 5), 5.0

    def distance_m(self):
        return 4.5 - self.t["sen-tank-level"]

    def battery_volts(self):
        return 1.95

    def now_iso(self):
        return None


def sample_node(node_id, truth):
    cfg = Cfg(node_id)
    return Node(cfg, FakeBoard(truth, cfg)).sample()


def truth(scenario="normal", tick=0, seed=5):
    return values_for(scenario, tick, random.Random(seed))


# ---------- the arithmetic ----------

def test_loop_scaling():
    assert ma_from_volts(0.6, 150) == pytest.approx(4.0) and ma_from_volts(3.0, 150) == pytest.approx(20.0)
    assert scale_loop(4.0, 0, 10) == 0 and scale_loop(12.0, 0, 10) == 5 and scale_loop(20.0, 0, 5) == 5


def test_ac_rms_ignores_the_dc_bias():
    wave = FakeBoard._wave(40.0, 800, bias=1650.0)
    assert ac_rms_mv(wave) == pytest.approx(40.0, rel=0.01)
    assert ac_rms_mv([1650.0] * 100) == pytest.approx(0.0, abs=1e-9)


# ---------- signal to reading, and back ----------

@pytest.mark.parametrize("scenario", ["normal", "leak", "chlorine-drop"])
def test_firmware_recovers_the_true_values_from_the_electrical_signals(scenario):
    t = truth(scenario)
    got = {}
    for node_id in ("node-a", "node-b"):
        got.update({r["sensor_id"]: r["value"] for r in sample_node(node_id, t)["readings"]})
    for sensor_id, value in got.items():
        assert value == pytest.approx(t[sensor_id], rel=0.02, abs=0.01), sensor_id
    assert set(got) == {k for k in t}  # every sensor on both nodes is read


def test_the_batch_matches_the_api_contract():
    batch = sample_node("node-b", truth())
    parsed = ReadingBatch(**batch)  # the API's own validation model
    assert parsed.node_id == "node-b" and len(parsed.readings) == 4 and parsed.battery_v == pytest.approx(3.9)


def test_a_broken_loop_is_a_fault_not_a_reading():
    cfg = Cfg("node-b")
    board = FakeBoard(truth(), cfg)
    board.loops["sen-tail-chlorine"] = 0.0  # wire break: 0 mA
    node = Node(cfg, board)
    batch = node.sample()
    assert "sen-tail-chlorine" not in {r["sensor_id"] for r in batch["readings"]}
    assert "wire break" in node.faults["sen-tail-chlorine"]


# ---------- store and forward ----------

def test_batches_wait_while_the_link_is_down_and_go_in_order():
    node = Node(Cfg("node-b"), FakeBoard(truth(), Cfg("node-b")))
    sent, up = [], [False]

    def send(batch):
        if not up[0]:
            return False
        sent.append(batch["n"])
        return True

    for n in range(3):
        node.queue({"n": n})
    assert node.flush(send) == 0 and len(node.buffer) == 3
    up[0] = True
    assert node.flush(send) == 3 and sent == [0, 1, 2] and node.buffer == []


def test_a_rejected_batch_is_dropped_and_the_rest_still_go():
    node = Node(Cfg("node-b"), FakeBoard(truth(), Cfg("node-b")))
    seen = []

    def send(batch):
        if batch["n"] == 1:
            raise ValueError("rejected")
        seen.append(batch["n"])
        return True

    for n in range(3):
        node.queue({"n": n})
    assert node.flush(send) == 2 and seen == [0, 2]


def test_the_buffer_drops_the_oldest_when_full():
    cfg = Cfg("node-b")
    cfg.BUFFER_MAX = 3
    node = Node(cfg, FakeBoard(truth(), cfg))
    for n in range(5):
        node.queue({"n": n})
    assert [b["n"] for b in node.buffer] == [2, 3, 4]


# ---------- the gateway bridge ----------

def test_gateway_forwards_good_lines_and_refuses_unknown_nodes():
    posted = []
    b = bridge_mod.Bridge(KEYS, lambda batch, key: posted.append((batch["node_id"], key)) or True)
    good = '{"key":"dev-key-node-b","batch":{"node_id":"node-b","readings":[{"sensor_id":"sen-tail-flow","value":44.0}]}}'
    assert b.accept(good) == "queued" and b.flush() == 1 and posted == [("node-b", "dev-key-node-b")]
    assert b.accept(good.replace("dev-key-node-b", "wrong")) == "bad_key"
    assert b.accept("not json") == "bad_line" and b.flush() == 0


def test_gateway_keeps_batches_while_4g_is_down_and_stamps_them():
    up, got = [False], []
    def post_fn(batch, key):
        if not up[0]:
            return False
        got.append(batch)
        return True

    b = bridge_mod.Bridge(KEYS, post_fn)
    line = '{"key":"dev-key-node-b","batch":{"node_id":"node-b","readings":[{"sensor_id":"sen-tail-flow","value":44.0}]}}'
    b.accept(line)
    assert b.flush() == 0 and len(b.queue) == 1
    up[0] = True
    assert b.flush() == 1 and "ts" in got[0]  # original moment preserved for the replay


# ---------- end to end: firmware -> API -> alerts ----------

@pytest.fixture
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def post(client, batch):
    return client.post("/api/v1/ingest/readings", json=batch, headers={"X-Device-Key": KEYS[batch["node_id"]]})


def run_firmware(client, scenario, ticks=6):
    for t in range(ticks):
        tr = truth(scenario, t, seed=t + 1)
        for node_id in ("node-a", "node-b"):
            r = post(client, sample_node(node_id, tr))
            assert r.status_code == 201, r.text


def open_rules(session):
    return {a.rule_code for a in session.query(m.Alert).filter(m.Alert.is_simulated.is_(False), m.Alert.cleared_at.is_(None))}


def test_firmware_signals_of_a_leak_raise_the_leak_alerts(demo, client, session):
    run_firmware(client, "leak")
    assert {"ACOUSTIC_LEAK_SIGNATURE", "HEAD_TAIL_FLOW_GAP", "TAIL_PRESSURE_LOW_IN_SUPPLY"} <= open_rules(session)


def test_firmware_signals_of_a_chlorine_failure_raise_a_quality_alert_only(demo, client, session):
    run_firmware(client, "chlorine-drop", ticks=8)
    rules = open_rules(session)
    assert "QUALITY_OUTLOOK_AT_RISK" in rules
    assert not rules & {"HEAD_TAIL_FLOW_GAP", "ACOUSTIC_LEAK_SIGNATURE", "NO_FLOW_IN_SUPPLY"}


def test_normal_firmware_readings_raise_nothing(demo, client, session):
    run_firmware(client, "normal")
    assert not open_rules(session) & {"ACOUSTIC_LEAK_SIGNATURE", "HEAD_TAIL_FLOW_GAP", "TAIL_PRESSURE_LOW_IN_SUPPLY", "QUALITY_OUTLOOK_AT_RISK", "NO_FLOW_IN_SUPPLY"}
