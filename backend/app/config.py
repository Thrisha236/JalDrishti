import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# SQLite for now; switching to PostgreSQL later is a change of this URL only.
DATABASE_URL = os.environ.get("JALRAKSHAK_DB", f"sqlite:///{(BACKEND_DIR / 'jalrakshak.db').as_posix()}")
SEED_PATH = Path(os.environ.get("JALRAKSHAK_SEED", REPO_ROOT / "seed" / "ramapuram.json"))

# Citizen photos: stored outside any web root and served only through the role-checked /media endpoint.
UPLOAD_DIR = Path(os.environ.get("JALRAKSHAK_UPLOADS", BACKEND_DIR / "uploads"))
MAX_PHOTO_BYTES = 8 * 1024 * 1024
MAX_PHOTO_SIDE = 1600

# Signing key for demo session tokens. A random key per process is fine for the prototype
# (tokens simply stop working after a restart and the app logs in again).
SECRET_KEY = os.environ.get("JALRAKSHAK_SECRET") or os.urandom(32).hex()
TOKEN_TTL_SECONDS = 12 * 60 * 60

# Demo mode enables /api/v1/demo/reset. Turn it off for anything other than a local demo.
DEMO_MODE = os.environ.get("JALRAKSHAK_DEMO", "1") == "1"

# The Vite dev server; the production build will be served from the same origin.
CORS_ORIGINS = os.environ.get("JALRAKSHAK_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
