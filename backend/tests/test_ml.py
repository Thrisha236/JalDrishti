"""Stage 12: AI early warning (anomaly, forecast, quality outlook, failure outlook) and tap-connection monitoring."""

import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app import config, fhtc, ml
from app import models as m

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "simulator"))
from scenarios import NODE_SENSORS, values_for  # noqa: E402

from test_incidents import KEYS  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))


def now_() -> datetime:
    """The current time. Read it fresh in each test: the full suite takes minutes, and a time fixed at import would make the readings look stale."""
    return datetime.now(IST)


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def feed(session, scenario: str, ticks: int, seconds_per_tick: float = 5.0, first_tick: int = 0, now: datetime | None = None):
    """Store simulated readings straight in the database, ending at `now`, and mark both nodes as just seen."""
    now = now or now_()
    rng = random.Random(11)
    sensors = {s.id: s for s in session.query(m.Sensor)}
    for k in range(ticks):
        ts = (now - timedelta(seconds=(ticks - 1 - k) * seconds_per_tick)).isoformat(timespec="seconds")
        for sensor_id, value in values_for(scenario, first_tick + k, rng).items():
            assert sensor_id in sensors
            session.add(m.Reading(sensor_id=sensor_id, ts=ts, value=value, quality_flag="ok"))
    for node in session.query(m.SensorNode):
        node.last_seen_at = now.isoformat(timespec="seconds")
    session.commit()


# ---------- anomaly detection ----------

def test_normal_operation_is_not_an_anomaly(session):
    feed(session, "normal", 30)
    a = ml.assess_anomaly(session, now_())
    assert a["status"] == "normal" and a["index"] < 50 and a["explanation"] == []
    assert a["model"].startswith("Isolation Forest") and "no accuracy is claimed" in a["note"]


def test_a_leak_is_flagged_with_the_readings_that_are_off(session):
    feed(session, "leak", 30)
    a = ml.assess_anomaly(session, now_())
    assert a["status"] == "anomaly" and a["index"] >= 50 and a["asset_code"] == "P-21"
    assert any("Tail pressure" in line and "below" in line for line in a["explanation"])
    gap = next(f for f in a["features"] if f["key"] == "flow_gap")
    assert gap["value"] > 30  # head sends much more than the tail receives


def test_no_trusted_data_means_no_judgement(session):
    feed(session, "normal", 30)
    assert ml.assess_anomaly(session, now_() + timedelta(minutes=10))["status"] == "insufficient_data"  # nodes stopped reporting
    session.query(m.Reading).delete()
    session.commit()
    a = ml.assess_anomaly(session, now_())
    assert a["status"] == "insufficient_data" and "Not enough trusted readings" in a["reason"]


# ---------- forecast ----------

def tail_pressure(session):
    return session.get(m.Sensor, "sen-tail-pressure")


def test_a_slow_slide_is_predicted_before_it_leaves_the_band(session):
    # 25 ticks of the degrading scenario: 1.22 -> 1.06 bar, still inside the 1.05-1.40 band.
    feed(session, "degrading", 25, seconds_per_tick=24)
    f = ml.forecast_sensor(session, tail_pressure(session), now_(), minutes=10)
    assert f["status"] == "ok" and f["current"] >= 1.05
    assert f["slope_per_min"] < 0 and f["level"] in ("warning", "watch") and f["minutes_to_breach"] > 0
    assert "drop below 1.05" in f["message"] and f["confidence"] in ("medium", "high")
    assert f["projection"][0]["t"] == 0 and f["projection"][-1]["value"] < f["projection"][0]["value"]


def test_steady_readings_forecast_nothing(session):
    feed(session, "normal", 30, seconds_per_tick=20)
    f = ml.forecast_sensor(session, tail_pressure(session), now_(), minutes=10)
    assert f["status"] == "ok" and f["level"] == "stable" and f["minutes_to_breach"] is None and f["message"] is None


def test_a_reading_already_out_of_band_is_reported_as_a_breach(session):
    feed(session, "leak", 30, seconds_per_tick=20)
    f = ml.forecast_sensor(session, tail_pressure(session), now_(), minutes=10)
    assert f["level"] == "breach" and "Already below" in f["message"]


def test_forecast_needs_enough_readings(session):
    feed(session, "normal", 4)
    f = ml.forecast_sensor(session, tail_pressure(session), now_(), minutes=10)
    assert f["status"] == "insufficient_data" and "at least 8" in f["reason"]


# ---------- water-quality outlook ----------

def test_quality_outlook_ok_watch_and_at_risk(session):
    feed(session, "normal", 30)
    ok = ml.quality_outlook(session, now_())[0]
    assert ok["level"] == "OK" and ok["data_source"] == "chlorine probe + live sensors" and ok["basis"] == "measured" and ok["predicted_residual_mg_l"] >= 0.4 and ok["asset_code"] == "P-21"
    assert "never certifies" in ok["disclaimer"] and ok["assumptions"]["diameter_assumed"] is True

    session.query(m.Reading).delete()
    feed(session, "leak", 30)
    watch = ml.quality_outlook(session, now_())[0]
    assert watch["level"] == "WATCH" and watch["water_age_hours"] > ok["water_age_hours"] and "field-kit" in watch["action"]

    session.query(m.Reading).delete()
    feed(session, "pump-off", 30)
    risk = ml.quality_outlook(session, now_())[0]
    assert risk["level"] == "AT_RISK" and any("drawn in" in r for r in risk["reasons"])


def test_quality_outlook_falls_back_to_baseline_and_says_so(session):
    q = ml.quality_outlook(session, now_())[0]
    assert q["data_source"].startswith("recorded baseline") and q["level"] == "OK"


# ---------- failure outlook ----------

def test_failure_outlook_learns_the_repeat_failure_interval(session):
    rows = {r["asset_code"]: r for r in ml.failure_outlook(session)}
    p21 = rows["P-21"]
    assert p21["failures_recorded"] == 3 and p21["mtbf_days"] == 330 and p21["timing"] == "overdue" and p21["priority"] == "HIGH"
    assert p21["days_overdue"] > 0 and p21["window"][0] < p21["expected_next"] < p21["window"][1]
    assert rows["P-09"]["timing"] == "unknown" and "Fewer than two" in rows["P-09"]["basis"]
    assert rows["P-14"]["failures_recorded"] == 1 and rows["P-14"]["mtbf_days"] is None
    order = [r["priority"] for r in ml.failure_outlook(session)]
    assert order == sorted(order, key={"HIGH": 0, "MEDIUM": 1, "LOW": 2}.get)  # most urgent first


def test_failure_outlook_is_limited_to_the_users_villages(session):
    only = ml.failure_outlook(session, {"vil-kondapur"})
    assert {r["village_id"] for r in only} == {"vil-kondapur"}


# ---------- tap connections (FHTC) ----------

def zone(summary, area_id):
    return next(z for z in summary["zones"] if z["service_area_id"] == area_id)


def test_normal_supply_keeps_the_taps_functional(session):
    feed(session, "normal", 30)
    s = fhtc.summary(session, {"vil-ramapuram"}, now_())
    north = zone(s, "sa-north")
    assert north["data_source"] == "live sensor" and north["households"] == 64
    assert north["functional"] + north["partial"] + north["non_functional"] == 64
    assert north["functional_pct"] >= 95 and s["is_simulated"] is True and "mock zone register" in s["basis"]


def test_a_leak_pushes_the_far_end_homes_below_55_litres(session):
    feed(session, "normal", 30)
    normal = zone(fhtc.summary(session, {"vil-ramapuram"}, now_()), "sa-north")
    session.query(m.Reading).delete()
    feed(session, "leak", 30)
    north = zone(fhtc.summary(session, {"vil-ramapuram"}, now_()), "sa-north")
    assert north["partial"] > 0 and north["functional_pct"] < normal["functional_pct"] and north["tail_bar"] < 0.8
    worst = north["worst"][0]
    assert worst["status"] == "PARTIAL" and worst["position"] > 0.5  # tail-end homes suffer first
    central = zone(fhtc.summary(session, {"vil-ramapuram"}, now_()), "sa-central")
    assert central["data_source"] == "head sensor + baseline" and central["functional_pct"] >= 95  # a leak on P-21 spares Central


def test_pump_failure_takes_every_zone_down(session):
    feed(session, "pump-off", 30)
    s = fhtc.summary(session, {"vil-ramapuram"}, now_())
    assert all(z["functional_pct"] == 0 and z["non_functional"] > 0 for z in s["zones"])
    assert s["functional_pct"] == 0


def test_without_live_data_it_uses_baselines_and_says_so(session):
    s = fhtc.summary(session, None, now_())
    assert {z["data_source"] for z in s["zones"]} == {"recorded baseline"}
    assert [v["name"] for v in s["villages"]] == ["Ramapuram", "Kondapur", "Sitarampalli"]
    assert s["history"][-1]["simulated"] is False and all(h["simulated"] for h in s["history"][:-1]) and len(s["history"]) == 14


# ---------- API ----------

def test_predictions_and_fhtc_need_a_signed_in_official(client, as_citizen, as_gp, as_officer):
    assert client.get("/api/v1/predictions").status_code == 401
    assert client.get("/api/v1/predictions", headers=as_citizen).status_code == 403
    assert client.get("/api/v1/fhtc", headers=as_citizen).status_code == 403
    p = client.get("/api/v1/predictions", headers=as_gp).json()
    assert p["is_simulated"] is True and {c["id"] for c in p["models"]} == {"anomaly", "forecast", "quality", "failure", "regularity", "clusters"}
    assert {f["village_id"] for f in p["failures"]} == {"vil-ramapuram"}  # the GP sees their own village
    assert {f["village_id"] for f in client.get("/api/v1/predictions", headers=as_officer).json()["failures"]} == {"vil-ramapuram", "vil-kondapur", "vil-sitarampalli"}
    assert [v["name"] for v in client.get("/api/v1/fhtc", headers=as_gp).json()["villages"]] == ["Ramapuram"]


def test_live_leak_readings_raise_the_early_warning_through_the_api(client, as_gp):
    from test_incidents import leak

    leak(client, ticks=6)
    p = client.get("/api/v1/predictions", headers=as_gp).json()
    assert p["anomaly"]["status"] == "anomaly" and p["attention_count"] >= 2
    assert p["quality"][0]["level"] in ("WATCH", "AT_RISK")
    north = next(z for z in client.get("/api/v1/fhtc", headers=as_gp).json()["zones"] if z["service_area_id"] == "sa-north")
    assert north["partial"] > 0 and north["data_source"] == "live sensor"


def test_the_simulator_has_a_degrading_scenario():
    rng = random.Random(1)
    early = values_for("degrading", 0, rng)["sen-tail-pressure"]
    late = values_for("degrading", 90, rng)["sen-tail-pressure"]
    assert early > 1.1 and late < 0.85
    assert set(NODE_SENSORS) == {"node-a", "node-b"}
