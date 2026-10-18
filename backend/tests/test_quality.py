"""Field-test-kit water quality: verdicts, logging, advisories to villagers, and who may see what."""

from datetime import date, timedelta

import pytest

from app import quality

URL = "/api/v1/water-quality"


def post(client, headers, **body):
    payload = {"point_id": "tp-N-T1", "tester": "FTK tester 2", "values": {"bacteria": "absent", "chlorine": 0.4}, **body}
    return client.post(f"{URL}/tests", json=payload, headers=headers)


# ---------- the IS 10500 verdict ----------

@pytest.mark.parametrize(
    "param, value, expected",
    [
        ("bacteria", "absent", "safe"), ("bacteria", "present", "unsafe"),
        ("chlorine", 0.3, "safe"), ("chlorine", 0.1, "watch"), ("chlorine", 0, "unsafe"),
        ("ph", 7.2, "safe"), ("ph", 9.1, "watch"),
        ("turbidity", 0.8, "safe"), ("turbidity", 3, "watch"), ("turbidity", 8, "unsafe"),
        ("fluoride", 1.2, "watch"), ("fluoride", 2.0, "unsafe"), ("tds", 640, "watch"),
        ("nitrate", 40, "safe"), ("nitrate", 50, "unsafe"), ("iron", 0.31, "unsafe"),
    ],
)
def test_each_parameter_is_judged_against_the_limits(param, value, expected):
    assert quality.judge(param, value) == expected


def test_raw_source_water_is_not_judged_on_chlorine():
    assert quality.judge("chlorine", 0, raw=True) == "safe"
    assert quality.verdict("source", {"bacteria": "absent", "chlorine": 0})[0] == "safe"
    assert quality.verdict("tap", {"bacteria": "absent", "chlorine": 0})[0] == "unsafe"


def test_verdict_is_the_worst_parameter_and_names_the_cause():
    status, issues = quality.verdict("tap", {"bacteria": "absent", "chlorine": 0.3, "turbidity": 3, "fluoride": 2.0})
    assert status == "unsafe" and {i["param"] for i in issues} == {"turbidity", "fluoride"}
    assert next(i for i in issues if i["param"] == "fluoride")["level"] == "unsafe"


@pytest.mark.parametrize("values", [{}, {"bacteria": "maybe"}, {"ph": 15}, {"mystery": 1}, {"chlorine": "abc"}, {"turbidity": -1}])
def test_nonsense_measurements_are_refused(values):
    with pytest.raises(ValueError):
        quality.validate_values(values)


# ---------- the demo records and the API ----------

def test_the_demo_records_are_judged_on_the_server(client, as_gp):
    body = client.get(URL, headers=as_gp).json()
    assert "IS 10500" in body["standard"] and "screening tool" in body["disclaimer"]
    latest = {p["id"]: p["latest"]["verdict"] for p in body["points"] if p["latest"]}
    assert latest["tp-S-T1"] == "unsafe" and latest["tp-bw1"] == "watch" and latest["tp-N-T1"] == "safe"
    assert body["zones"]["sa-south"]["status"] == "unsafe" and body["zones"]["sa-north"]["status"] == "safe"
    assert body["zones"]["sa-south"]["last_tested"] == "2026-10-14" and len(body["tests"]) == 8


def test_only_officials_see_measurements_and_a_villager_sees_only_the_verdict(client, as_citizen, as_gp, as_officer):
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers=as_citizen).status_code == 403
    summary = client.get(f"{URL}/summary", headers=as_citizen).json()
    assert summary["service_area_id"] == "sa-north" and summary["status"] == "safe" and summary["last_tested"] == "2026-10-12"
    assert set(summary) == {"service_area_id", "status", "last_tested", "disclaimer"}  # no values, no tester names
    assert client.get(f"{URL}/summary", params={"zone": "sa-south"}, headers=as_citizen).json()["service_area_id"] == "sa-north"  # cannot ask about another zone
    assert client.get(f"{URL}/summary", headers=as_gp).status_code == 422
    assert client.get(f"{URL}/summary", params={"zone": "sa-south"}, headers=as_gp).json()["status"] == "unsafe"
    assert client.get(f"{URL}/summary", params={"zone": "sa-kondapur-main"}, headers=as_gp).status_code == 404  # another village
    assert len(client.get(URL, headers=as_officer).json()["points"]) == 8


def test_logging_a_passing_test_updates_the_zone(client, as_gp):
    r = post(client, as_gp, values={"bacteria": "absent", "chlorine": 0.5})
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == "qt-9" and body["verdict"] == "safe" and body["advisories_sent"] == 0 and body["is_mock"] is False
    assert client.get(URL, headers=as_gp).json()["tests"][0]["id"] == "qt-9"


def test_a_failed_tap_test_sends_a_boil_water_advisory_once_a_day(client, as_citizen, as_gp):
    r = post(client, as_gp, values={"bacteria": "present", "chlorine": 0})
    assert r.status_code == 201 and r.json()["verdict"] == "unsafe" and r.json()["advisories_sent"] == 3  # the three North Area villagers
    keys = [n["message_key"] for n in client.get("/api/v1/notifications/mine", headers=as_citizen).json()]
    assert keys == ["advisory.boil_water"]
    assert client.get(f"{URL}/summary", headers=as_citizen).json()["status"] == "unsafe"
    again = post(client, as_gp, values={"bacteria": "present"})
    assert again.json()["advisories_sent"] == 0  # not twice in one day
    cleared = post(client, as_gp, values={"bacteria": "absent", "chlorine": 0.4})
    assert cleared.json()["advisories_sent"] == 3
    assert [n["message_key"] for n in client.get("/api/v1/notifications/mine", headers=as_citizen).json()][0] == "advisory.cleared"


def test_a_failed_source_test_does_not_warn_villagers(client, as_citizen, as_gp):
    r = post(client, as_gp, point_id="tp-bw1", values={"bacteria": "present"})
    assert r.json()["verdict"] == "unsafe" and r.json()["advisories_sent"] == 0
    assert client.get("/api/v1/notifications/mine", headers=as_citizen).json() == []


def test_a_logged_test_goes_to_wqmis_without_the_testers_name(client, as_gp):
    post(client, as_gp, tester="Lakshmi Devi", values={"bacteria": "present"})
    events = client.get("/api/v1/integrations/events", params={"connector": "wqmis"}, headers=as_gp).json()
    sent = next(e for e in events if e["entity"] == "test_result" and e["entity_id"] == "qt-9")
    assert sent["payload"]["sample"]["verdict"] == "unsafe" and sent["payload"]["sujal_gaon_id"] == "SG-DEMO-0421"
    assert "Lakshmi" not in str(sent["payload"]) and "tester" not in sent["payload"]["sample"]


def test_test_logging_rules(client, as_citizen, as_gp, as_officer):
    assert post(client, as_citizen).status_code == 403
    assert post(client, as_officer).status_code == 403
    assert post(client, as_gp, point_id="tp-nowhere").status_code == 404
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert post(client, as_gp, date=tomorrow).status_code == 422
    assert post(client, as_gp, date=(date.today() - timedelta(days=400)).isoformat()).status_code == 422
    assert post(client, as_gp, values={}).status_code == 422
    assert post(client, as_gp, values={"ph": 20}).status_code == 422
    assert post(client, as_gp, tester="x").status_code == 422


def test_logged_tests_are_audited(client, as_gp, session):
    from app import models as m

    post(client, as_gp, values={"bacteria": "present"})
    assert ("log", "water_quality_test", "qt-9") in [(a.action, a.entity, a.entity_id) for a in session.query(m.AuditLog)]
