"""Geo-tagged reports, and the sync of community feedback, service validations and household taps."""

import pytest

from app import config
from test_complaints import jpeg_with_gps, submit
from test_incidents import KEYS, leak, open_incident, report


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def events(client, headers, **params):
    return client.get("/api/v1/integrations/events", params={"limit": 200, **params}, headers=headers).json()


# ---------- geo-tagged observations: opt-in, inside the villager's own area, rounded ----------

def test_a_geotagged_report_is_stored_to_25_metres_only_with_consent(client, as_citizen):
    r = submit(client, as_citizen, geo_x="777", geo_y="812", geotag_consent="true")
    assert r.status_code == 201, r.text
    assert r.json()["location"] == {"x": 775, "y": 800, "precision": "approx_25m"}  # the lane, not the door


def test_a_precise_spot_needs_consent_and_a_place_inside_the_area(client, as_citizen):
    assert submit(client, as_citizen, geo_x="777", geo_y="812").status_code == 422  # no consent
    assert submit(client, as_citizen, geo_x="777", geo_y="812", geotag_consent="true", share_location="false").status_code == 422
    assert submit(client, as_citizen, geo_x="100", geo_y="100", geotag_consent="true", category="LEAKAGE").status_code == 422  # outside North Area
    assert submit(client, as_citizen, geo_x="777", geotag_consent="true", category="DIRTY_WATER").status_code == 422  # half a coordinate
    assert submit(client, as_citizen, geo_x="777", geo_y="812", geotag_consent="true", category="NO_WATER").status_code == 201


def test_without_a_spot_the_location_stays_coarse(client, as_citizen):
    assert submit(client, as_citizen).json()["location"]["precision"] == "approx_1km"
    assert submit(client, as_citizen, category="NO_WATER", share_location="false").json()["location"]["precision"] == "not_shared"


def test_a_geotagged_photo_still_loses_its_exif_gps(client, as_citizen):
    r = submit(client, as_citizen, jpeg_with_gps(), geo_x="777", geo_y="812", geotag_consent="true")
    assert r.status_code == 201 and r.json()["media"][0]["exif_stripped"] is True


# ---------- community feedback goes to Meri Panchayat, anonymised ----------

def test_a_report_goes_to_meri_panchayat_without_its_text_or_the_villager(client, as_citizen, as_gp):
    report(client, as_citizen)
    sent = [e for e in events(client, as_gp, connector="meri_panchayat") if e["entity"] == "feedback"]
    assert len(sent) == 1 and sent[0]["version"] == "RECEIVED"
    fb = sent[0]["payload"]["feedback"]
    assert fb["category"] == "LOW_WATER" and fb["channel"] == "APP" and fb["has_photo"] is True and fb["location_precision"] == "approx_1km"
    assert sent[0]["payload"]["sujal_gaon_id"] == "SG-DEMO-0421"
    text = str(sent[0])
    for banned in ("description", "villager", "usr-", "storage", "Very low water"):
        assert banned not in text


def test_the_report_follows_the_incident_to_resolution(client, as_citizen, as_gp):
    report(client, as_citizen)
    leak(client)
    code = open_incident(client, as_gp).json()["code"]
    task = client.post("/api/v1/tasks", json={"incident_code": code, "assignee_id": "usr-tech-ravi"}, headers=as_gp).json()["code"]
    for s in ("INSPECTING", "REPAIRING"):
        client.post(f"/api/v1/tasks/{task}/updates", json={"status": s}, headers=as_gp)
    client.post(f"/api/v1/tasks/{task}/updates", json={"status": "REPAIRED", "failure_type": "leak"}, headers=as_gp)
    client.post(f"/api/v1/incidents/{code}/resolve", json={"note": "Villagers confirm water is back"}, headers=as_gp)
    states = [e["version"] for e in events(client, as_gp, connector="meri_panchayat") if e["entity"] == "feedback"][::-1]
    assert states == ["RECEIVED", "UNDER_REVIEW", "REPAIR_DONE", "CLOSED"]


def test_scripted_story_reports_are_not_sent_as_live_feedback(client, as_gp):
    client.post("/api/v1/integrations/sync", headers=as_gp)
    assert [e for e in events(client, as_gp, connector="meri_panchayat") if e["entity"] == "feedback"] == []


# ---------- service validations and household taps ----------

def test_service_validations_are_counted_per_zone_never_per_household(client, as_citizen, as_gp):
    client.post("/api/v1/service-checks", json={"got_water": False, "comment": "Dry since morning, Lakshmi"}, headers=as_citizen)
    client.post("/api/v1/integrations/sync", headers=as_gp)
    sent = next(e for e in events(client, as_gp, connector="meri_panchayat") if e["entity"] == "service_validation")
    assert sent["payload"]["no_water"] == 1 and sent["payload"]["reported"] == 1 and sent["payload"]["households"] == 64 and sent["payload"]["date"]
    assert "sa-north-h12" not in str(sent) and "Lakshmi" not in str(sent) and "N-H12" not in str(sent)


def test_household_taps_that_are_not_working_go_to_the_jjm_dashboard_by_tap_id(client, as_citizen, as_gp):
    client.post("/api/v1/service-checks", json={"got_water": False}, headers=as_citizen)
    client.post("/api/v1/integrations/sync", headers=as_gp)
    sent = next(e for e in events(client, as_gp, connector="jjm_dashboard") if e["entity"] == "tap_status")
    assert sent["payload"]["taps"] == [{"tap_id": "SG-DEMO-0421-T012", "status": "NON_FUNCTIONAL", "source": "villager's service check"}]
    assert sent["payload"]["truncated"] is False and "1 taps not fully working" in sent["summary"]


def test_a_healthy_village_sends_no_empty_tap_reports(client, as_gp):
    client.post("/api/v1/integrations/sync", headers=as_gp)
    assert [e for e in events(client, as_gp, connector="jjm_dashboard") if e["entity"] == "tap_status"] == []


def test_open_alerts_are_included_in_a_full_sync(client, as_gp):
    client.get("/api/v1/alerts/feed", headers=as_gp)  # evaluates the demo's failed field test
    client.post("/api/v1/integrations/sync", headers=as_gp)
    assert any(e["entity"] == "alert" and e["payload"]["alert"]["rule"] == "QUALITY_TEST_UNSAFE" for e in events(client, as_gp, connector="imis"))
