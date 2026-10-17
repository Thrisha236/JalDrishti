import copy

from app import read_model as rm
from app.risk import _round


def _expected_snapshot(seed):
    """The seed as the database should hold it before the demo: live-submitted complaints (and their photo
    analysis) are not pre-loaded, and the public snapshot carries no complaint descriptions."""
    expected = copy.deepcopy({k: v for k, v in seed.items() if k != "expected_risk"})
    story = expected["story"]
    live = [c for c in story["complaints"] if c.get("submitted_live")]
    live_media = {x["id"] for c in live for x in c["media"]}
    story["complaints"] = [c for c in story["complaints"] if not c.get("submitted_live")]
    for c in story["complaints"]:
        c["description"] = None
    story["image_analysis"] = [ia for ia in story["image_analysis"] if ia["media_id"] not in live_media]
    return expected


def test_snapshot_round_trips_the_seed(session, seed):
    """seed -> database -> snapshot must give back exactly the seed (minus the documented differences)."""
    snap = rm.snapshot(session)
    snap.pop("risk")
    expected = _expected_snapshot(seed)
    for key in expected:
        assert snap[key] == expected[key], f"mismatch in {key}"
    assert set(snap) == set(expected)


def test_story_complaint_2048_is_left_for_the_live_demo(session):
    codes = [c["public_code"] for c in rm.snapshot(session)["story"]["complaints"]]
    assert codes == ["2049", "2051"]


def test_python_risk_matches_expected(session, seed):
    for asset_id, want in seed["expected_risk"].items():
        if asset_id == "note":
            continue
        got = rm.risk_for(session, asset_id)
        assert got["score"] == want["score"], asset_id
        assert got["band"] == want["band"], asset_id
        assert got["factors"] == want["factors"], asset_id


def test_p21_is_high_and_explains_itself(session):
    r = rm.risk_for(session, "ast-p21")
    assert (r["score"], r["band"], r["label"]) == (72, "HIGH", "Inspect soon")
    assert r["missing"] == []
    assert r["details"]["age"] == "17 years (record)"


def test_missing_data_is_reported_not_guessed(session):
    r = rm.risk_for(session, "ast-k04")
    assert "pressure/flow sensor" in r["missing"]
    assert r["factors"]["pressure_per_flow_trend"] == 0


def test_rounding_is_half_up_like_javascript():
    assert _round(12.5) == 13
    assert _round(8.33) == 8
