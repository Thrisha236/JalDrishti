import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# SQLite for now; switching to PostgreSQL later is a change of this URL only.
DATABASE_URL = os.environ.get("JALRAKSHAK_DB", f"sqlite:///{(BACKEND_DIR / 'jalrakshak.db').as_posix()}")
SEED_PATH = Path(os.environ.get("JALRAKSHAK_SEED", REPO_ROOT / "seed" / "ramapuram.json"))

# The Vite dev server; the production build will be served from the same origin.
CORS_ORIGINS = os.environ.get("JALRAKSHAK_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
