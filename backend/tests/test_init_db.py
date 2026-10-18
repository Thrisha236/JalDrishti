"""The deployment initialiser creates and seeds an empty database once, and never touches existing data."""

import pytest
from sqlalchemy.orm import Session

from app import init_db
from app import models as m
from app.db import make_engine


@pytest.fixture()
def empty_engine(tmp_path, monkeypatch):
    eng = make_engine(f"sqlite:///{(tmp_path / 'fresh.db').as_posix()}")
    monkeypatch.setattr(init_db, "engine", eng)
    yield eng
    eng.dispose()


def test_an_empty_database_gets_its_tables_and_the_demo_seed(empty_engine):
    assert "loaded" in init_db.init(load_demo_seed=True)
    with Session(empty_engine) as s:
        assert s.query(m.Village).count() == 3 and s.query(m.WaterQualityTest).count() == 8


def test_running_it_again_changes_nothing(empty_engine):
    init_db.init(load_demo_seed=True)
    with Session(empty_engine) as s:
        s.add(m.AuditLog(at="2026-10-18T10:00:00+05:30", actor_id="usr-gp-ramapuram", action="probe", entity="x", entity_id="1", details=None))
        s.commit()
    assert "nothing changed" in init_db.init(load_demo_seed=True)
    with Session(empty_engine) as s:
        assert s.query(m.AuditLog).filter_by(action="probe").count() == 1 and s.query(m.Village).count() == 3  # nothing dropped, nothing duplicated


def test_a_real_deployment_can_create_tables_without_demo_data(empty_engine):
    assert "No data loaded" in init_db.init(load_demo_seed=False)
    with Session(empty_engine) as s:
        assert s.query(m.Village).count() == 0
