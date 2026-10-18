"""Write the API's OpenAPI description to docs/openapi.json, so other systems can read the contract without running it.

Usage, from the backend folder:  .\\.venv\\Scripts\\python.exe ..\\scripts\\export_openapi.py
Interoperability: any tool that reads OpenAPI 3 (client generators, API gateways, test tools) can use this file."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402

spec = app.openapi()
out = ROOT / "docs" / "openapi.json"
out.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Wrote {out.relative_to(ROOT)}: {len(spec['paths'])} paths, version {spec['info']['version']}")
