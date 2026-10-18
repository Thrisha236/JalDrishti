"""Household-level monitoring and the villager's daily service validation."""

import pytest

from app import config, fhtc
from app import models as m
from test_incidents import KEYS
from test_ml import feed, now_

CHECKS = "/api/v1/service-checks"


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def check(client, headers, **body):
    return client.post(CHECKS, json={"got_water": True, "quantity": "ENOUGH", **body}, headers=headers)


def north(client, headers):
    return next(z for z in client.get("/api/v1/fhtc", headers=headers).json()["zones"] if z["service_area_id"] == "sa-north")


# ---------- the villager's service check ----------

def test_a_villager_reports_no_water_and_the_home_turns_red(client, as_citizen, as_gp):
    assert north(client, as_gp)["non_functional"] == 0
    r = client.post(CHECKS, json={"got_water": False, "quality": "SMELL", "comment": "Tap dry since morning"}, headers=as_citizen)
    assert r.status_code == 201
    body = r.json()
    assert body["household"] == "sa-north-h12" and body["got_water"] is False and body["quantity"] == "NONE" and body["quality"] is None  # nothing to describe
    zone = north(client, as_gp)
    assert zone["non_functional"] == 1 and zone["validation"]["reported"] == 1 and zone["validation"]["no_water"] == 1 and zone["validation"]["local_faults"] == 1


def test_a_second_check_the_same_day_replaces_the_first(client, as_citizen, session):
    check(client, as_citizen, quantity="LOW")
    r = check(client, as_citizen, quantity="ENOUGH", rating=4, quality="CLEAR")
    assert r.status_code == 201 and r.json()["quantity"] == "ENOUGH" and r.json()["rating"] == 4
    assert session.query(m.ServiceCheck).count() == 1
    mine = client.get(f"{CHECKS}/mine", headers=as_citizen).json()
    assert mine["today"]["quantity"] == "ENOUGH" and len(mine["history"]) == 1 and mine["household"] == "sa-north-h12"


@pytest.mark.parametrize("body", [{"got_water": True}, {"got_water": True, "quantity": "NONE"}, {"got_water": True, "quantity": "ENOUGH", "rating": 6}, {"got_water": True, "quantity": "ENOUGH", "comment": "x" * 201}])
def test_a_check_must_make_sense(client, as_citizen, body):
    assert client.post(CHECKS, json=body, headers=as_citizen).status_code == 422


def test_only_villagers_submit_checks_and_each_sees_only_their_own(client, as_citizen, as_gp):
    assert client.post(CHECKS, json={"got_water": True, "quantity": "ENOUGH"}).status_code == 401
    assert client.post(CHECKS, json={"got_water": True, "quantity": "ENOUGH"}, headers=as_gp).status_code == 403
    check(client, as_citizen)
    from conftest import login

    other = login(client, "citizen2")
    assert client.get(f"{CHECKS}/mine", headers=other).json()["history"] == []
    assert client.get(f"{CHECKS}/mine", headers=as_gp).status_code == 403


def test_a_villager_without_a_household_is_told_so(client, as_citizen, session):
    session.query(m.User).filter_by(id="usr-citizen-north").update({"household_id": None})
    session.commit()
    assert check(client, as_citizen).status_code == 409


def test_checks_are_audited_without_the_comment(client, as_citizen, session):
    check(client, as_citizen, comment="Please come and look at my tap")
    row = next(a for a in session.query(m.AuditLog) if a.entity == "service_check")
    assert row.details == {"day": fhtc.today_ist(), "got_water": True, "quantity": "ENOUGH"} and "Please" not in str(row.details)


# ---------- fusing the model with the villager ----------

def test_a_home_that_disagrees_with_a_healthy_network_is_a_local_fault(client, as_citizen, as_gp):
    client.post(CHECKS, json={"got_water": False}, headers=as_citizen)
    home = client.get("/api/v1/households/sa-north-h12", headers=as_gp).json()
    assert home["modelled_status"] == "FUNCTIONAL" and home["status"] == "NON_FUNCTIONAL" and home["likely_cause"] == "LOCAL"
    assert "connection, tap or storage" in home["likely_cause_text"] and home["status_source"] == "villager's service check"


def test_a_home_that_agrees_with_a_failing_network_is_a_network_problem(client, as_citizen, as_gp, session):
    feed(session, "pump-off", 30)
    client.post(CHECKS, json={"got_water": False}, headers=as_citizen)
    home = client.get("/api/v1/households/sa-north-h12", headers=as_gp).json()
    assert home["modelled_status"] == "NON_FUNCTIONAL" and home["likely_cause"] == "NETWORK"


def test_a_villager_with_water_overrules_a_cautious_model(client, as_citizen, as_gp, session):
    feed(session, "pump-off", 30)
    check(client, as_citizen, quantity="ENOUGH")
    home = client.get("/api/v1/households/sa-north-h12", headers=as_gp).json()
    assert home["modelled_status"] == "NON_FUNCTIONAL" and home["status"] == "FUNCTIONAL" and home["likely_cause"] == "NETWORK_ONLY"
    assert north(client, as_gp)["functional"] == 1  # only that home still has water


def test_quality_problems_are_counted(client, as_citizen, as_gp):
    check(client, as_citizen, quality="COLOURED")
    assert north(client, as_gp)["validation"]["quality_problems"] == 1


# ---------- my tap, and the Gram Panchayat's household view ----------

def test_my_tap(client, as_citizen):
    check(client, as_citizen, quantity="LOW")
    mine = client.get("/api/v1/households/mine", headers=as_citizen).json()
    assert mine["tap_id"] == "SG-DEMO-0421-T012" and mine["household"] == "N-H12" and mine["zone"] == "North Area"
    assert mine["status"] == "PARTIAL" and mine["status_source"] == "villager's service check" and mine["water_quality"]["status"] == "safe"
    assert "lpcd" in mine and "supply" not in mine and "pressure_bar" not in mine  # no network internals


def test_the_household_list_is_scoped_filtered_and_worst_first(client, as_citizen, as_gp, as_officer):
    assert client.get("/api/v1/households", headers=as_citizen).status_code == 403
    client.post(CHECKS, json={"got_water": False}, headers=as_citizen)
    body = client.get("/api/v1/households", params={"limit": 5}, headers=as_gp).json()
    assert body["total"] == 193 and body["households"][0]["map_id"] == "sa-north-h12" and body["households"][0]["status"] == "NON_FUNCTIONAL"
    bad = client.get("/api/v1/households", params={"status": "NON_FUNCTIONAL"}, headers=as_gp).json()
    assert bad["total"] == 1
    south = client.get("/api/v1/households", params={"zone": "sa-south", "limit": 300}, headers=as_gp).json()
    assert south["total"] == 71 and {h["service_area_id"] for h in south["households"]} == {"sa-south"}
    assert client.get("/api/v1/households", params={"zone": "sa-kondapur-main"}, headers=as_gp).status_code == 404  # another village
    assert client.get("/api/v1/households", params={"status": "BROKEN"}, headers=as_gp).status_code == 422
    assert client.get("/api/v1/households", params={"limit": 300}, headers=as_officer).json()["total"] == 193 + 112 + 87


def test_household_detail_rules(client, as_citizen, as_gp, as_officer):
    check(client, as_citizen, comment="Water is weak in the evening")
    gp = client.get("/api/v1/households/sa-north-h12", headers=as_gp).json()
    assert gp["checks"][0]["comment"] == "Water is weak in the evening" and gp["tap_id"] == "SG-DEMO-0421-T012" and gp["is_simulated"] is True
    assert "comment" not in client.get("/api/v1/households/sa-north-h12", headers=as_officer).json()["checks"][0]  # officers see the pattern, not the words
    assert client.get("/api/v1/households/sa-north-h12", headers=as_citizen).status_code == 403
    for bad in ("sa-north-h999", "sa-north-h0", "nonsense", "sa-north-hx", "sa-kondapur-main-h1"):
        assert client.get(f"/api/v1/households/{bad}", headers=as_gp).status_code == 404  # unknown, or another village


def test_tap_ids_are_built_on_the_sujal_gaon_id(session):
    north_zone = session.get(m.ServiceArea, "sa-north")
    south_zone = session.get(m.ServiceArea, "sa-south")
    assert fhtc.tap_id(north_zone, 0) == "SG-DEMO-0421-T001" and fhtc.tap_id(north_zone, 63) == "SG-DEMO-0421-T064"
    assert fhtc.tap_id(south_zone, 4) == "SA-SOUTH-T005"  # a zone without a Sujal Gaon ID is not given a fake one
    assert fhtc.parse_household_id("sa-north-h12") == ("sa-north", 11) and fhtc.parse_household_id("junk") is None
