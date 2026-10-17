import copy
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app import config
from app import models as m
from app import trends
from app.risk_api import validate_risk_config

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "simulator"))
from scenarios import batches_for  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
KEYS = {"node-a": "dev-key-node-a", "node-b": "dev-key-node-b"}


@pytest.fixture(autouse=True)
def device_keys(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))


def run(client, scenario, ticks):
    rng = random.Random(11)
    for t in range(ticks):
        for body in batches_for(scenario, t, rng):
            r = client.post("/api/v1/ingest/readings", json=body, headers={"X-Device-Key": KEYS[body["node_id"]]})
            assert r.status_code == 201


def risk(client, asset="ast-p21"):
    r = client.get(f"/api/v1/pipelines/{asset}/risk")
    assert r.status_code == 200
    return r.json()


# ---------- live trend ----------

def test_without_readings_the_recorded_trend_is_used(client):
    body = risk(client)
    assert (body["score"], body["band"], body["trend_basis"]) == (72, "HIGH", "record")
    assert body["sources"] == {
        "age": "record", "prior_failures": "record", "corrosion_observation": "inspection",
        "pressure_per_flow_trend": "record", "material_susceptibility": "assumption table",
    }
    assert body["comparison"]["live"] is None
    assert "usable readings" in body["comparison"]["live_unavailable_reason"]
    assert body["config_version"] == "risk-v0.1"


def test_too_few_live_readings_fall_back_to_record(client):
    run(client, "normal", trends.MIN_PAIRS - 1)
    assert risk(client)["trend_basis"] == "record"


def test_normal_live_readings_replace_the_recorded_trend(client):
    run(client, "normal", 8)
    body = risk(client)
    assert body["trend_basis"] == "live" and body["sources"]["pressure_per_flow_trend"] == "live sensor"
    assert body["factors"]["pressure_per_flow_trend"] == 0  # healthy pipe right now
    assert (body["score"], body["band"]) == (60, "MEDIUM")
    assert body["comparison"]["recorded"]["score"] == 72
    assert body["comparison"]["live"]["score"] == 60


def test_leak_readings_raise_the_live_trend(client):
    run(client, "leak", 8)
    body = risk(client)
    assert body["trend_basis"] == "live"
    assert 8 < float(body["details"]["pressure_per_flow_trend"].split("%")[0]) < 15
    assert body["factors"]["pressure_per_flow_trend"] == 6
    assert (body["score"], body["band"]) == (66, "HIGH")


def test_pump_off_readings_are_not_used_for_the_trend(client):
    run(client, "pump-off", 8)  # no flow: pressure-per-flow is meaningless
    assert risk(client)["trend_basis"] == "record"


def test_old_and_flagged_readings_are_ignored(client, session):
    run(client, "leak", 8)
    old = (datetime.now(IST) - timedelta(minutes=trends.WINDOW_MINUTES + 5)).isoformat(timespec="seconds")
    session.query(m.Reading).update({m.Reading.ts: old})
    session.commit()
    assert risk(client)["trend_basis"] == "record"


def test_pipelines_without_sensors_report_why(client):
    body = risk(client, "ast-k04")
    assert body["comparison"]["live_unavailable_reason"] == "no sensor node on this pipeline"
    assert body["sources"]["pressure_per_flow_trend"] == "missing"


def test_pipeline_list_uses_the_live_score(client):
    run(client, "normal", 8)
    rows = client.get("/api/v1/pipelines", params={"village_id": "vil-ramapuram"}).json()
    p21 = next(r for r in rows if r["asset"]["code"] == "P-21")
    assert p21["risk"]["score"] == 60


# ---------- what-if ----------

def test_estimated_install_date_shows_what_confirmation_would_change(client):
    body = risk(client, "ast-k04")
    age = next(w for w in body["what_if"] if w["factor"] == "age")
    assert body["sources"]["age"] == "estimate"
    assert body["factors"]["age"] == 13 and age["points"] == 25
    assert age["score"] == body["score"] + 12


def test_missing_inspection_shows_the_unknown_points(client):
    body = risk(client, "ast-p14")
    corrosion = next(w for w in body["what_if"] if w["factor"] == "corrosion_observation")
    assert corrosion["points"] == 20 and corrosion["score"] == body["score"] + 20


def test_stale_inspection_shows_effect_of_reinspection(client, session):
    ins = session.get(m.Inspection, "ins-001")
    ins.date = "2024-01-10"  # more than 24 months before as_of
    session.commit()
    body = risk(client)
    assert body["sources"]["corrosion_observation"] == "inspection (stale)"
    assert body["factors"]["corrosion_observation"] == 6
    reinspect = next(w for w in body["what_if"] if w["factor"] == "corrosion_observation")
    assert reinspect["points"] == 12


# ---------- versioned rules ----------

def stricter(seed_cfg):
    cfg = copy.deepcopy(seed_cfg)
    cfg["bands"] = [
        {"band": "LOW", "min": 0, "max": 29, "label": "Monitor"},
        {"band": "MEDIUM", "min": 30, "max": 54, "label": "Plan inspection"},
        {"band": "HIGH", "min": 55, "max": 100, "label": "Inspect soon"},
    ]
    return cfg


def test_seed_rules_are_valid(seed):
    assert validate_risk_config(seed["risk_config"]) == []


def test_officer_publishes_a_new_version_and_scores_follow(client, as_officer, seed):
    r = client.post("/api/v1/risk/config", json={"note": "Lower HIGH threshold for monsoon season", "config": stricter(seed["risk_config"])}, headers=as_officer)
    assert r.status_code == 201
    assert r.json()["version"] == "risk-v0.2" and r.json()["is_active"]
    body = risk(client, "ast-k04")
    assert body["config_version"] == "risk-v0.2" and body["band"] == "MEDIUM"  # 47 is MEDIUM under both
    s02 = risk(client, "ast-s02")
    assert s02["score"] == 43 and s02["band"] == "MEDIUM"
    versions = client.get("/api/v1/risk/config/versions").json()
    assert [v["version"] for v in versions] == ["risk-v0.2", "risk-v0.1"]
    assert [v["is_active"] for v in versions] == [True, False]


def test_rollback_restores_the_previous_rules(client, as_officer, seed):
    client.post("/api/v1/risk/config", json={"note": "Trial thresholds", "config": stricter(seed["risk_config"])}, headers=as_officer)
    assert client.post("/api/v1/risk/config/risk-v0.1/activate", headers=as_officer).status_code == 200
    assert client.get("/api/v1/risk/config").json()["version"] == "risk-v0.1"
    assert client.get("/api/v1/snapshot").json()["risk_config"]["version"] == "risk-v0.1"


def test_only_officers_change_rules(client, as_gp, as_citizen, seed):
    body = {"note": "Trying to change rules", "config": seed["risk_config"]}
    assert client.post("/api/v1/risk/config", json=body, headers=as_gp).status_code == 403
    assert client.post("/api/v1/risk/config", json=body, headers=as_citizen).status_code == 403
    assert client.post("/api/v1/risk/config", json=body).status_code == 401
    assert client.post("/api/v1/risk/config/risk-v0.1/activate", headers=as_gp).status_code == 403


@pytest.mark.parametrize(
    ("mutate", "problem"),
    [
        (lambda c: c["factors"]["age"].update(max=30), "add up to 100"),
        (lambda c: c["factors"]["material_susceptibility"]["points_by_material"].update(iron=15), "material_susceptibility"),
        (lambda c: c["bands"][1].update(min=45), "contiguous"),
        (lambda c: c.update(statement="Risk score."), "not a failure probability"),
        (lambda c: c["factors"]["material_susceptibility"]["points_by_material"].pop("unknown"), "'unknown'"),
    ],
)
def test_invalid_rules_are_rejected(client, as_officer, seed, mutate, problem):
    cfg = copy.deepcopy(seed["risk_config"])
    mutate(cfg)
    r = client.post("/api/v1/risk/config", json={"note": "Invalid change attempt", "config": cfg}, headers=as_officer)
    assert r.status_code == 422
    assert any(problem in p for p in r.json()["detail"]["problems"])
    assert client.get("/api/v1/risk/config").json()["version"] == "risk-v0.1"


def test_rule_changes_are_audited(client, as_officer, seed, session):
    client.post("/api/v1/risk/config", json={"note": "Audit check", "config": stricter(seed["risk_config"])}, headers=as_officer)
    client.post("/api/v1/risk/config/risk-v0.1/activate", headers=as_officer)
    rows = session.query(m.AuditLog).filter(m.AuditLog.entity == "risk_config").all()
    assert [(r.action, r.entity_id, r.actor_id) for r in rows] == [("create", "risk-v0.2", "usr-officer-block"), ("activate", "risk-v0.1", "usr-officer-block")]
