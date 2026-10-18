"""Prepare the database for a deployment, safely.

Usage, from the backend folder:  python -m app.init_db

Unlike app.seed_loader (which DROPS every table for a clean demo), this only creates tables that are missing and loads the
demo seed ONLY when the database has no villages yet. Running it again changes nothing, so it is safe to run on every start.
For a real deployment, load your own villages instead of the demo seed (set JALRAKSHAK_SEED, or JALRAKSHAK_LOAD_SEED=0)."""

import json
import os

from sqlalchemy.orm import Session

from . import models as m
from .config import SEED_PATH
from .db import Base, engine
from .seed_loader import load_seed


def init(load_demo_seed: bool | None = None) -> str:
    Base.metadata.create_all(engine)
    if load_demo_seed is None:
        load_demo_seed = os.environ.get("JALRAKSHAK_LOAD_SEED", "1") == "1"
    with Session(engine) as session:
        if session.query(m.Village).count() > 0:
            return "Database already has data: nothing changed."
        if not load_demo_seed:
            return "Tables created. No data loaded (JALRAKSHAK_LOAD_SEED=0)."
        load_seed(session, json.loads(SEED_PATH.read_text(encoding="utf-8")))
        return f"Tables created and the demo seed ({SEED_PATH.name}) loaded."


if __name__ == "__main__":
    print(init())
