from app import read_model as rm
from app.risk import _round


def test_snapshot_round_trips_the_seed(session, seed):
    """seed -> database -> snapshot must give back exactly the seed (minus test-only expected_risk)."""
    snap = rm.snapshot(session)
    snap.pop("risk")
    expected = {k: v for k, v in seed.items() if k != "expected_risk"}
    for key in expected:
        assert snap[key] == expected[key], f"mismatch in {key}"
    assert set(snap) == set(expected)


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
