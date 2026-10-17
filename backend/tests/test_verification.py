"""Stage 10: restoration verification from tail readings, manual resolution, and villager notifications."""

from datetime import datetime, timedelta

import pytest

from app import config
from app import models as m
from app import verification
from test_incidents import KEYS, leak, open_incident, report

WINDOW = 60


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)
    monkeypatch.setattr(config, "VERIFY_WINDOW_SECONDS", WINDOW)


def repaired(client, as_citizen, as_gp, before_repair=None) -> str:
    """Run the story up to a recorded repair on P-21 and return the incident code."""
    report(client, as_citizen)
    leak(client)
    code = open_incident(client, as_gp).json()["code"]
    task = client.post("/api/v1/tasks", json={"incident_code": code, "assignee_id": "usr-tech-ravi"}, headers=as_gp).json()["code"]
    url = f"/api/v1/tasks/{task}/updates"
    client.post(url, json={"status": "INSPECTING"}, headers=as_gp)
    client.post(url, json={"status": "REPAIRING"}, headers=as_gp)
    if before_repair:
        before_repair()
    assert client.post(url, json={"status": "REPAIRED", "failure_type": "leak"}, headers=as_gp).status_code == 201
    return code


def readings(session, start: datetime, seconds: int, pressure: float, flow: float, every: int = 5) -> None:
    """Tail readings at a fixed interval from one second after `start`, written straight to the store
    (timestamps may be in the future)."""
    for k in range(0, seconds, every):
        ts = (start + timedelta(seconds=k + 1)).isoformat(timespec="seconds")
        session.add(m.Reading(sensor_id="sen-tail-pressure", ts=ts, value=pressure + (k % 3) * 0.01, quality_flag="ok"))
        session.add(m.Reading(sensor_id="sen-tail-flow", ts=ts, value=flow + (k % 3) * 0.5, quality_flag="ok"))
    session.commit()


def check(session, code: str, now: datetime) -> m.Verification:
    session.expire_all()
    return verification.check(session, session.get(m.Verification, code), now)


def started(session, code) -> datetime:
    session.expire_all()
    return datetime.fromisoformat(session.get(m.Verification, code).started_at)


def keys(client, headers):
    return [n["message_key"] for n in client.get("/api/v1/notifications/mine", headers=headers).json()]


def test_repair_starts_a_pending_sensor_verification(client, as_citizen, as_gp):
    code = repaired(client, as_citizen, as_gp)
    v = client.get(f"/api/v1/incidents/{code}/verification").json()
    assert v["method"] == "sensor_window" and v["result"] == "PENDING" and v["windows"] == []
    assert v["required_windows"] == 2 and v["passed_in_row"] == 0 and v["current_window"] is not None
    assert v["window_seconds"] == WINDOW and "2 consecutive" in v["rule"]
    # The villager was told along the way, in-app.
    assert keys(client, as_citizen) == ["complaint.repair_started", "complaint.being_checked"]


def test_two_normal_windows_verify_close_and_notify_once(client, as_citizen, as_gp, session):
    code = repaired(client, as_citizen, as_gp)
    t0 = started(session, code)
    readings(session, t0, 2 * WINDOW, pressure=1.22, flow=45.0)

    v = check(session, code, t0 + timedelta(seconds=WINDOW + 1))
    assert v.result == "PENDING"  # one window passed, one to go
    v = check(session, code, t0 + timedelta(seconds=2 * WINDOW + 1))
    assert v.result == "VERIFIED_RESTORED" and v.verified_at == (t0 + timedelta(seconds=2 * WINDOW)).isoformat(timespec="seconds")

    body = client.get(f"/api/v1/incidents/{code}/verification").json()
    assert [w["result"] for w in body["windows"]] == ["PASSED", "PASSED"] and body["passed_in_row"] == 2
    assert body["windows"][0]["readings"] == WINDOW // 5 and 1.2 <= body["windows"][0]["tail_pressure_mean_bar"] <= 1.25
    assert body["current_window"] is None
    assert client.get(f"/api/v1/incidents/{code}").json()["status"] == "VERIFIED_RESTORED"

    mine = client.get("/api/v1/complaints/mine", headers=as_citizen).json()[0]
    assert mine["progress"][-1] == {"key": "restored", "at": v.verified_at}
    check(session, code, t0 + timedelta(seconds=5 * WINDOW))  # checking again changes nothing
    assert keys(client, as_citizen).count("complaint.restored_verified") == 1


def test_leak_still_present_fails_then_recovery_verifies(client, as_citizen, as_gp, session):
    code = repaired(client, as_citizen, as_gp)
    t0 = started(session, code)
    readings(session, t0, WINDOW, pressure=0.72, flow=30.0)  # repair did not fix it
    v = check(session, code, t0 + timedelta(seconds=WINDOW + 1))
    assert v.result == "RESTORATION_UNCONFIRMED"
    w = client.get(f"/api/v1/incidents/{code}/verification").json()["windows"][0]
    assert w["result"] == "FAILED" and "pressure" in w["reason"] and "flow" in w["reason"]
    assert "complaint.restored_verified" not in keys(client, as_citizen)

    readings(session, t0 + timedelta(seconds=WINDOW), 2 * WINDOW, pressure=1.22, flow=45.0)
    v = check(session, code, t0 + timedelta(seconds=3 * WINDOW + 1))
    assert v.result == "VERIFIED_RESTORED"  # two passes in a row after the failed window


def test_too_few_readings_is_inconclusive_and_empty_slots_are_skipped(client, as_citizen, as_gp, session):
    code = repaired(client, as_citizen, as_gp)
    t0 = started(session, code)
    readings(session, t0, 15, pressure=1.22, flow=45.0)  # 3 readings only
    # Next window empty (simulator not running), then two good windows.
    readings(session, t0 + timedelta(seconds=2 * WINDOW), 2 * WINDOW, pressure=1.22, flow=45.0)
    v = check(session, code, t0 + timedelta(seconds=4 * WINDOW + 1))
    windows = client.get(f"/api/v1/incidents/{code}/verification").json()["windows"]
    assert [w["result"] for w in windows] == ["INCONCLUSIVE", "PASSED", "PASSED"]
    assert "Only 3 readings" in windows[0]["reason"]
    assert v.result == "VERIFIED_RESTORED"


def test_a_sensor_fault_makes_the_window_inconclusive(client, as_citizen, as_gp, session):
    code = repaired(client, as_citizen, as_gp)
    t0 = started(session, code)
    readings(session, t0, 2 * WINDOW, pressure=1.22, flow=45.0)
    session.add(m.Alert(id="AL-900", ord=900, kind="EQUIPMENT_HEALTH", rule_code="SENSOR_STUCK", severity="MEDIUM", asset_id="ast-p21",
                        sensor_id="sen-tail-pressure", service_area_id="sa-north", raised_at=t0.isoformat(timespec="seconds"), details={},
                        text="stuck", is_simulated=False, cleared_at=(t0 + timedelta(seconds=WINDOW + 10)).isoformat(timespec="seconds")))
    session.commit()
    v = check(session, code, t0 + timedelta(seconds=2 * WINDOW + 1))
    windows = client.get(f"/api/v1/incidents/{code}/verification").json()["windows"]
    assert [w["result"] for w in windows] == ["INCONCLUSIVE", "INCONCLUSIVE"]  # the fault overlapped both
    assert "sensor stuck" in windows[0]["reason"] and v.result == "PENDING"


def test_scheduled_supply_windows_are_used_outside_demo(client, as_citizen, as_gp, session, monkeypatch):
    code = repaired(client, as_citizen, as_gp, before_repair=lambda: monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", False))
    session.expire_all()
    v = session.get(m.Verification, code)
    assert v.window_seconds is None
    t0 = started(session, code)
    # The next two scheduled North Area windows (06:00-08:00, 18:00-19:00) after the repair.
    slots = []
    day = t0.date()
    while len(slots) < 2:
        for s, e in (("06:00", "08:00"), ("18:00", "19:00")):
            ws = datetime.fromisoformat(f"{day}T{s}:00+05:30")
            we = datetime.fromisoformat(f"{day}T{e}:00+05:30")
            if we > t0 and len(slots) < 2:
                slots.append((max(ws, t0), we))  # a window already under way counts from the repair
        day += timedelta(days=1)
    first = min(600, int((slots[0][1] - slots[0][0]).total_seconds()) - 2)
    readings(session, slots[0][0], first, pressure=1.22, flow=45.0, every=1)
    v = check(session, code, slots[1][1] + timedelta(seconds=1))  # second window had no readings at all
    results = [w["result"] for w in client.get(f"/api/v1/incidents/{code}/verification").json()["windows"]]
    assert results == ["PASSED", "INCONCLUSIVE"] and v.result == "PENDING"  # silence in a supply window is not a pass


def test_gp_can_resolve_without_sensor_proof_and_it_says_so(client, as_citizen, as_gp, session):
    code = repaired(client, as_citizen, as_gp)
    url = f"/api/v1/incidents/{code}/resolve"
    assert client.post(url, json={"note": "Villagers confirm water is back"}, headers=as_citizen).status_code == 403
    assert client.post(url, json={"note": "ok"}, headers=as_gp).status_code == 422  # a reason is required
    r = client.post(url, json={"note": "Villagers confirm water is back"}, headers=as_gp)
    assert r.status_code == 200 and r.json()["result"] == "RESOLVED_UNVERIFIED" and r.json()["note"].startswith("Villagers")
    assert client.get(f"/api/v1/incidents/{code}").json()["status"] == "RESOLVED_UNVERIFIED"
    assert client.post(url, json={"note": "Again, please"}, headers=as_gp).status_code == 409
    progress = client.get("/api/v1/complaints/mine", headers=as_citizen).json()[0]["progress"]
    assert progress[-1]["key"] == "resolved_unverified"
    assert keys(client, as_citizen)[0] == "complaint.resolved_unverified"
    # Sensor readings arriving later do not turn it into "verified".
    t0 = started(session, code)
    readings(session, t0, 2 * WINDOW, pressure=1.22, flow=45.0)
    assert check(session, code, t0 + timedelta(seconds=3 * WINDOW)).result == "RESOLVED_UNVERIFIED"
    actions = [(a.action, a.entity_id) for a in session.query(m.AuditLog)]
    assert ("resolve_unverified", code) in actions


def test_resolve_needs_a_recorded_repair(client, as_citizen, as_gp):
    report(client, as_citizen)
    leak(client)
    code = open_incident(client, as_gp).json()["code"]
    assert client.post(f"/api/v1/incidents/{code}/resolve", json={"note": "Looks fine now"}, headers=as_gp).status_code == 409


def test_pipelines_without_tail_sensors_need_manual_resolution(session):
    assert verification.tail_sensors(session, "ast-p21") is not None
    assert verification.tail_sensors(session, "ast-p03") is None
    fake = m.Incident(code="INC-9999", ord=9999, is_history=False, asset_id="ast-p03", service_area_id="sa-central",
                      opened_at="2026-10-17T10:00:00+05:30", closed_at=None, status="REPAIR_DONE", priority="MEDIUM")
    session.add(fake)
    session.flush()
    v = verification.start(session, fake, "2026-10-17T11:00:00+05:30")
    assert v.method == "manual" and "not sensor-verified" in v.rule
    assert verification.check(session, v).result == "PENDING"  # never judged by sensors


def test_notifications_are_private_to_the_villager(client, as_citizen, as_gp):
    repaired(client, as_citizen, as_gp)
    assert keys(client, as_gp) == []
    assert client.get("/api/v1/notifications/mine").status_code == 401
    snap = client.get("/api/v1/snapshot").json()
    assert snap["story"]["notifications"] == []  # live notifications never appear in the public snapshot
