def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "villages": 3}


def test_meta_carries_the_risk_statement(client):
    body = client.get("/api/v1/meta").json()
    assert body["is_mock"] is True
    assert "not a failure probability" in body["risk_statement"]


def test_village_detail_includes_schedules(client):
    body = client.get("/api/v1/villages/vil-ramapuram").json()
    north = next(a for a in body["service_areas"] if a["id"] == "sa-north")
    assert north["schedule"]["windows"] == [["06:00", "08:00"], ["18:00", "19:00"]]
    assert body["schemes"][0]["sujalam_bharat_id"].startswith("SB-DEMO")


def test_unknown_village_is_404(client):
    assert client.get("/api/v1/villages/nope").status_code == 404
    assert client.get("/api/v1/pipelines", params={"village_id": "nope"}).status_code == 404


def test_pipelines_are_ranked_by_risk(client):
    rows = client.get("/api/v1/pipelines", params={"village_id": "vil-ramapuram"}).json()
    codes = [r["asset"]["code"] for r in rows]
    assert codes == ["P-21", "P-14", "P-03", "P-09"]
    scores = [r["risk"]["score"] for r in rows]
    assert scores == sorted(scores, reverse=True)


def test_all_pipelines_across_villages(client):
    rows = client.get("/api/v1/pipelines").json()
    assert len(rows) == 6
    assert rows[0]["asset"]["code"] == "P-21"


def test_pipeline_detail_and_history(client):
    body = client.get("/api/v1/pipelines/ast-p21").json()
    assert body["risk"]["score"] == 72
    assert [r["date"] for r in body["repairs"]] == ["2023-11-14", "2024-08-22", "2025-09-03"]
    assert body["profile"]["diameter_mm"] is None
    assert client.get("/api/v1/pipelines/ast-pump1").status_code == 404


def test_complaints_are_coarse_and_filtered(client):
    rows = client.get("/api/v1/complaints", params={"village_id": "vil-ramapuram"}).json()
    assert [c["public_code"] for c in rows] == ["2048", "2049", "2051"]
    assert all(c["location"]["precision"] == "approx_1km" for c in rows)
    assert client.get("/api/v1/complaints", params={"village_id": "vil-kondapur"}).json() == []


def test_incident_evidence_sums_to_score(client):
    body = client.get("/api/v1/incidents/INC-0311").json()
    assert round(sum(e["contribution"] for e in body["evidence"]), 2) == body["evidence_score"] == 0.81
    assert "not a probability" in body["evidence_score_note"]


def test_history_incident_is_unverified(client):
    body = client.get("/api/v1/incidents/INC-0289").json()
    assert body["status"] == "RESOLVED_UNVERIFIED"


def test_verification_requires_both_windows(client):
    body = client.get("/api/v1/incidents/INC-0311/verification").json()
    assert body["result"] == "VERIFIED_RESTORED"
    assert [w["result"] for w in body["windows"]] == ["PASSED", "PASSED"]


def test_task_updates_in_order(client):
    body = client.get("/api/v1/tasks/T-118").json()
    assert [u["status"] for u in body["updates"]] == ["ASSIGNED", "INSPECTING", "REPAIRING", "REPAIRED"]


def test_snapshot_includes_server_risk(client):
    body = client.get("/api/v1/snapshot").json()
    assert body["risk"]["ast-p21"]["score"] == 72
    assert body["story"]["incident"]["code"] == "INC-0311"


def test_api_is_read_only_for_now(client):
    assert client.post("/api/v1/complaints", json={}).status_code == 405
