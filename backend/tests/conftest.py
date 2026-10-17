import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import config
from app.config import SEED_PATH
from app.db import get_session, make_engine
from app.main import app
from app.seed_loader import reset_database


@pytest.fixture(scope="session")
def seed():
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


@pytest.fixture()
def engine(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path / "uploads")
    eng = make_engine(f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    reset_database(SEED_PATH, bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def session(engine):
    with sessionmaker(bind=engine)() as s:
        yield s


@pytest.fixture(autouse=True)
def fresh_login_limits():
    from app.auth import reset_login_failures

    reset_login_failures()
    yield
    reset_login_failures()


@pytest.fixture()
def client(engine):
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def override():
        with Session() as s:
            yield s

    app.dependency_overrides[get_session] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


USERNAMES = {"citizen": "villager1", "citizen2": "villager2", "gp": "gp.ramapuram", "officer": "officer.block"}


def login(client, role):
    r = client.post("/api/v1/auth/login", json={"username": USERNAMES[role], "password": config.DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def as_citizen(client):
    return login(client, "citizen")


@pytest.fixture()
def as_gp(client):
    return login(client, "gp")


@pytest.fixture()
def as_officer(client):
    return login(client, "officer")
