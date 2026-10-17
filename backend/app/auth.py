"""Demo sessions: a role picks a fictional demo user and receives a signed, expiring token.

This is deliberately small. It is enough to enforce role-based access to complaints and photos;
password login and JWT come in Stage 9."""

import base64
import hashlib
import hmac
import json
import time
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from . import config
from . import models as m
from .db import get_session

DEMO_USER_FOR_ROLE = {"citizen": "usr-citizen-north", "gp": "usr-gp-ramapuram", "officer": "usr-officer-block"}


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload: str) -> str:
    return hmac.new(config.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def create_token(user_id: str, now: float | None = None) -> str:
    payload = _b64(json.dumps({"sub": user_id, "exp": int((now or time.time()) + config.TOKEN_TTL_SECONDS)}).encode())
    return f"{payload}.{_sign(payload)}"


def read_token(token: str) -> str | None:
    """Return the user id for a valid, unexpired token, else None."""
    try:
        payload, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _sign(payload)):
            return None
        data = json.loads(_unb64(payload))
        if data["exp"] < time.time():
            return None
        return data["sub"]
    except (ValueError, KeyError, json.JSONDecodeError):
        return None


def current_user(
    session: Annotated[Session, Depends(get_session)],
    authorization: Annotated[str | None, Header()] = None,
) -> m.User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in required", headers={"WWW-Authenticate": "Bearer"})
    user_id = read_token(authorization.removeprefix("Bearer "))
    user = session.get(m.User, user_id) if user_id else None
    if user is None:
        raise HTTPException(401, "Session expired or invalid", headers={"WWW-Authenticate": "Bearer"})
    return user


CurrentUser = Annotated[m.User, Depends(current_user)]


def village_ids_of(user: m.User) -> set[str]:
    if user.role == "officer":
        return set(user.village_ids or [])
    return {user.village_id} if user.village_id else set()


def require_roles(user: m.User, *roles: str) -> None:
    if user.role not in roles:
        raise HTTPException(403, f"This action needs one of: {', '.join(roles)}")
