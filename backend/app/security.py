"""Safeguards that apply to every request: security headers, a per-client rate limit and a request-size limit.

- Headers stop browsers from sniffing content types, embedding the API in a frame, leaking referrers, or caching
  signed-in data on a shared phone.
- The rate limit is a sliding one-minute window per client address, held in memory. It protects one server process; behind
  several servers use the proxy's limit as well (or move this to a shared store). Sensor ingestion gets a larger share.
- Oversized bodies are refused before they are read. Photos have their own, stricter limit on top of this."""

import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import config

INGEST_SHARE = 4  # sensor nodes may send this many times the per-minute limit
_hits: dict[str, deque] = defaultdict(deque)


def reset_rate_limits() -> None:
    _hits.clear()


def _client(request: Request) -> str:
    if config.TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _allowed(key: str, limit: int, now: float) -> tuple[bool, int]:
    q = _hits[key]
    while q and now - q[0] >= 60:
        q.popleft()
    if len(q) >= limit:
        return False, max(1, int(60 - (now - q[0])))
    q.append(now)
    return True, 0


def install(app: FastAPI) -> None:
    @app.middleware("http")
    async def safeguards(request: Request, call_next):
        path = request.url.path
        api = path.startswith("/api/v1")
        if api and path != "/api/v1/health":
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > config.MAX_BODY_BYTES:
                return JSONResponse({"detail": "Request is too large"}, status_code=413)
            if config.RATE_LIMIT_PER_MINUTE > 0:
                ingest = path.startswith("/api/v1/ingest")
                limit = config.RATE_LIMIT_PER_MINUTE * (INGEST_SHARE if ingest else 1)
                ok, wait = _allowed(f"{_client(request)}:{'ingest' if ingest else 'api'}", limit, time.monotonic())
                if not ok:
                    return JSONResponse({"detail": "Too many requests. Please wait a moment."}, status_code=429, headers={"Retry-After": str(wait)})
        response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "no-referrer")
        h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
        if api:
            h.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
            if path != "/api/v1/health":
                h.setdefault("Cache-Control", "no-store")  # signed-in data must not linger in a shared browser's cache
        return response
