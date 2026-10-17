import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.config import SEED_PATH
from app.db import get_session, make_engine
from app.main import app
from app.seed_loader import reset_database


@pytest.fixture(scope="session")
def seed():
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


@pytest.fixture()
def engine(tmp_path):
    eng = make_engine(f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    reset_database(SEED_PATH, bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def session(engine):
    with sessionmaker(bind=engine)() as s:
        yield s


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
