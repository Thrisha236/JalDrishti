"""Multi-level analytics, GIS and CSV exports, the audit log and the system status."""

import csv
import io
import json

import pytest
from fastapi.testclient import TestClient

from app import analytics_api, config
from app.main import app
from conftest import login
from test_incidents import KEYS, leak
from test_ml import feed

SUMMARY = "/api/v1/analytics/summary"


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_KEYS", dict(KEYS))
    monkeypatch.setattr(config, "DEMO_SUPPLY_ALWAYS_ON", True)


def get(client, headers, **params):
    return client.get(SUMMARY, params=params, headers=headers)


def rows(response):
    return list(csv.reader(io.StringIO(response.text)))


# ---------- the hierarchy ----------

def test_the_state_view_splits_into_districts(client, as_officer):
    body = get(client, as_officer).json()
    assert body["level"] == "state" and body["id"] == "Demo State" and body["children_level"] == "district" and body["villages"] == 3
    assert body["totals"]["households"] == 193 + 112 + 87 and body["totals"]["zones"] == 5
    kids = {c["id"]: c for c in body["children"]}
    assert set(kids) == {"Demo District", "Demo District 2"} and kids["Demo District"]["villages"] == 2 and kids["Demo District 2"]["kpis"]["households"] == 87
    assert body["is_simulated"] is True and any("fictional" in n for n in body["notes"]) and len(body["trend"]) == 14


def test_drilling_down_state_district_block_village_zone(client, as_officer):
    district = get(client, as_officer, level="district", id="Demo District").json()
    assert district["children_level"] == "block" and [c["id"] for c in district["children"]] == ["Demo Block A"]
    block = get(client, as_officer, level="block", id="Demo Block A").json()
    assert block["children_level"] == "village" and {c["label"] for c in block["children"]} == {"Ramapuram", "Kondapur"}
    village = get(client, as_officer, level="village", id="vil-ramapuram").json()
    assert village["children_level"] == "zone" and {c["label"] for c in village["children"]} == {"North Area", "Central", "South"}
    assert [(b["level"], b["label"]) for b in village["breadcrumb"]] == [("state", "Demo State"), ("district", "Demo District"), ("block", "Demo Block A"), ("village", "Ramapuram")]
    north = next(c for c in village["children"] if c["id"] == "sa-north")
    assert north["sujal_gaon_id"] == "SG-DEMO-0421" and north["kpis"]["households"] == 64 and north["kpis"]["data_basis"].startswith("baseline")
    kondapur = next(c for c in block["children"] if c["label"] == "Kondapur")
    assert kondapur["lgd_code"] == "LGD-DEMO-002" and kondapur["lat"] and kondapur["lon"]


def test_a_gram_panchayat_only_ever_sees_its_own_village(client, as_gp):
    default = get(client, as_gp).json()
    assert default["level"] == "village" and default["label"] == "Ramapuram"
    state = get(client, as_gp, level="state").json()
    assert state["villages"] == 1 and state["totals"]["households"] == 193  # asking for a higher level reveals nothing more
    assert get(client, as_gp, level="village", id="vil-kondapur").status_code == 404
    assert get(client, as_gp, level="district", id="Demo District 2").status_code == 404


def test_validation_and_roles(client, as_citizen, as_officer):
    assert client.get(SUMMARY).status_code == 401 and get(client, as_citizen).status_code == 403
    assert get(client, as_officer, level="galaxy").status_code == 422
    assert get(client, as_officer, level="village", id="vil-nowhere").status_code == 404


def test_the_indicators_react_to_what_is_happening(client, as_officer, as_gp, session):
    quiet = get(client, as_officer, level="village", id="vil-ramapuram").json()["totals"]
    assert quiet["alerts_open"] >= 2 and quiet["functional_pct"] == 100  # the demo's failed field test and the overdue pipe
    assert quiet["quality"] == {"safe": 2, "watch": 0, "unsafe": 1, "untested": 0}
    feed(session, "leak", 30)
    leak(client, ticks=6)
    busy = get(client, as_officer, level="village", id="vil-ramapuram").json()["totals"]
    assert busy["functional_pct"] < 100 and busy["alerts_open"] > quiet["alerts_open"] and busy["data_basis"] == "live sensors"
    assert busy["alerts_high"] > quiet["alerts_high"] and busy["supply_pattern"] in ("steady", "unsteady", "intermittent", "off", None)
    unaffected = get(client, as_officer, level="village", id="vil-kondapur").json()["totals"]
    assert unaffected["functional_pct"] == 100 and unaffected["alerts_open"] == 0


def test_response_times_are_measured_from_real_work(client, as_citizen, as_gp):
    from test_incidents import open_incident, report

    assert get(client, as_gp).json()["totals"]["median_hours_to_repair"] is None
    report(client, as_citizen)
    leak(client)
    open_incident(client, as_gp)
    client.post("/api/v1/tasks", json={"incident_code": "INC-0311", "assignee_id": "usr-tech-ravi"}, headers=as_gp)
    for s in ("INSPECTING", "REPAIRING"):
        client.post("/api/v1/tasks/T-118/updates", json={"status": s}, headers=as_gp)
    client.post("/api/v1/tasks/T-118/updates", json={"status": "REPAIRED", "failure_type": "leak"}, headers=as_gp)
    t = get(client, as_gp).json()["totals"]
    assert t["median_hours_to_repair"] is not None and t["median_hours_to_repair"] < 1 and t["median_hours_complaint_to_incident"] is not None
    assert t["incidents_open"] == 1 and t["tasks_open"] == 0 and t["tasks_overdue"] == 0


# ---------- GIS ----------

def test_villages_as_geojson(client, as_gp, as_officer, as_citizen):
    assert client.get("/api/v1/geo/villages.geojson", headers=as_citizen).status_code == 403
    r = client.get("/api/v1/geo/villages.geojson", headers=as_officer)
    assert r.headers["content-type"].startswith("application/geo+json")
    fc = r.json()
    assert fc["type"] == "FeatureCollection" and "fictional" in fc["name"] and len(fc["features"]) == 3
    f = next(x for x in fc["features"] if x["properties"]["id"] == "vil-ramapuram")
    assert f["geometry"]["type"] == "Point" and f["geometry"]["coordinates"] == [79.982, 18.246]  # [longitude, latitude]
    assert f["properties"]["mock"] is True and f["properties"]["lgd_code"] == "LGD-DEMO-001" and f["properties"]["households"] == 193
    assert len(client.get("/api/v1/geo/villages.geojson", headers=as_gp).json()["features"]) == 1


def test_the_hierarchy_tree(client, as_officer):
    tree = client.get("/api/v1/analytics/hierarchy", headers=as_officer).json()
    assert tree["mock"] is True
    districts = {d["district"]: d for d in tree["tree"][0]["districts"]}
    assert set(districts) == {"Demo District", "Demo District 2"}
    assert [v["name"] for v in districts["Demo District"]["blocks"][0]["villages"]] == ["Ramapuram", "Kondapur"]


# ---------- exports ----------

def test_exports_are_scoped_anonymous_and_open_format(client, as_citizen, as_gp, as_officer):
    assert client.get("/api/v1/export/taps.csv", headers=as_citizen).status_code == 403
    taps = client.get("/api/v1/export/taps.csv", headers=as_gp)
    assert taps.headers["content-type"].startswith("text/csv") and "attachment" in taps.headers["content-disposition"]
    table = rows(taps)
    assert table[0][:4] == ["tap_id", "lgd_code", "sujal_gaon_id", "zone"] and len(table) == 1 + 193
    assert table[1][0].startswith("SG-DEMO-0421-T") and len(rows(client.get("/api/v1/export/taps.csv", headers=as_officer))) == 1 + 392
    assert client.get("/api/v1/export/nothing.csv", headers=as_gp).status_code == 404


def test_exports_never_contain_names_or_complaint_text(client, as_citizen, as_gp):
    client.post("/api/v1/complaints", data={"category": "LEAKAGE", "service_area_id": "sa-north", "description": "My name is Lakshmi and the pipe by my house leaks"}, headers=as_citizen)
    client.post("/api/v1/service-checks", json={"got_water": True, "quantity": "LOW", "comment": "Please call Lakshmi on my mobile"}, headers=as_citizen)
    everything = "".join(client.get(f"/api/v1/export/{d}.csv", headers=as_gp).text for d in ("taps", "alerts", "complaints", "water-quality", "tasks"))
    assert "Lakshmi" not in everything and "Demo Villager" not in everything and "villager1" not in everything and "usr-citizen" not in everything
    complaints = rows(client.get("/api/v1/export/complaints.csv", headers=as_gp))
    assert complaints[0] == ["code", "category", "zone", "created_at", "channel", "incident", "location_shared"] and any(r[1] == "LEAKAGE" for r in complaints[1:])


def test_spreadsheet_formulas_are_defused():
    assert analytics_api._cell("=HYPERLINK(\"http://evil\")") == "'=HYPERLINK(\"http://evil\")"
    assert analytics_api._cell("+1+1") == "'+1+1" and analytics_api._cell("@SUM(A1)") == "'@SUM(A1)" and analytics_api._cell("-2") == "'-2"
    assert analytics_api._cell("Plain text") == "Plain text" and analytics_api._cell(None) == "" and analytics_api._cell(12.5) == "12.5"


def test_the_water_quality_and_alert_exports(client, as_gp):
    wq = rows(client.get("/api/v1/export/water-quality.csv", headers=as_gp))
    assert wq[0] == ["id", "point", "type", "zone", "date", "verdict", "failed_parameters"] and len(wq) == 1 + 8
    assert any(r[5] == "unsafe" and "Bacteria" in r[6] for r in wq[1:])
    client.get("/api/v1/alerts/feed", headers=as_gp)
    assert any(r[3] == "QUALITY_TEST_UNSAFE" for r in rows(client.get("/api/v1/export/alerts.csv", headers=as_gp))[1:])


# ---------- the audit log and the system ----------

def test_the_audit_log_is_for_officers(client, as_citizen, as_gp, as_officer):
    client.post("/api/v1/water-quality/tests", json={"point_id": "tp-N-T1", "tester": "FTK tester 2", "values": {"bacteria": "absent"}}, headers=as_gp)
    assert client.get("/api/v1/audit").status_code == 401 and client.get("/api/v1/audit", headers=as_gp).status_code == 403
    entries = client.get("/api/v1/audit", headers=as_officer).json()
    assert entries[0]["entity"] == "water_quality_test" and entries[0]["actor"] == "Demo GP Operator (Ramapuram)" and entries[0]["role"] == "gp"
    assert client.get("/api/v1/audit", params={"entity": "complaint"}, headers=as_officer).json() == []
    assert len(client.get("/api/v1/audit", params={"limit": 1}, headers=as_officer).json()) == 1


def test_system_status(client, as_gp, as_officer):
    assert client.get("/api/v1/system", headers=as_gp).status_code == 403
    s = client.get("/api/v1/system", headers=as_officer).json()
    assert s["database"] == "sqlite" and s["environment"] == "development" and s["counts"]["complaints"] == 2
    assert s["safeguards"]["passwords_hashed"] == "scrypt" and s["readings_retention_days"] == 30
    assert json.dumps(s).count("password") == 1  # only the word describing the hash, never a secret
