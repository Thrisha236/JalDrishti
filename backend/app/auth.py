"""Sign-in with username and password, issuing a signed JWT (HS256) that carries the user id and role.

Every request still loads the user from the database, so a deleted or changed user loses access at once."""

import time
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from . import models as m
from .db import get_session
from .passwords import verify_password

router = APIRouter(prefix="/api/v1")
ALGORITHM = "HS256"
ISSUER = "jalrakshak"


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


# ---------- tokens ----------

def create_token(user_id: str, role: str | None = None, now: float | None = None) -> str:
    issued = int(now or time.time())
    claims = {"sub": user_id, "iat": issued, "exp": issued + config.TOKEN_TTL_SECONDS, "iss": ISSUER}
    if role:
        claims["role"] = role
    return jwt.encode(claims, config.SECRET_KEY, algorithm=ALGORITHM)


def read_token(token: str) -> str | None:
    """Return the user id for a valid, unexpired token, else None."""
    try:
        claims = jwt.decode(token, config.SECRET_KEY, algorithms=[ALGORITHM], issuer=ISSUER, options={"require": ["sub", "exp", "iat"]})
        return claims["sub"]
    except jwt.PyJWTError:
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


# ---------- sign-in ----------

_failures: dict[str, list[float]] = {}  # username -> recent failure times (in memory; per process)


def _locked(username: str, now: float) -> bool:
    recent = [t for t in _failures.get(username, []) if now - t < config.LOGIN_LOCK_SECONDS]
    _failures[username] = recent
    return len(recent) >= config.LOGIN_MAX_FAILURES


def reset_login_failures() -> None:
    _failures.clear()


@router.post("/auth/login")
def login(body: Credentials, session: Annotated[Session, Depends(get_session)]):
    """Exchange username and password for a session token. Errors never say which of the two was wrong."""
    now = time.time()
    name = body.username.strip().lower()
    if _locked(name, now):
        raise HTTPException(429, f"Too many attempts. Try again in {config.LOGIN_LOCK_SECONDS} seconds.")
    user = session.scalars(select(m.User).where(m.User.username == name)).first()
    if user is None or not verify_password(body.password, user.password_hash):
        _failures.setdefault(name, []).append(now)
        raise HTTPException(401, "Wrong username or password")
    _failures.pop(name, None)
    from .read_model import user as user_view

    return {"access_token": create_token(user.id, user.role), "token_type": "bearer", "expires_in": config.TOKEN_TTL_SECONDS, "user": user_view(user)}


@router.get("/auth/me")
def me(user: CurrentUser):
    from .read_model import user as user_view

    return user_view(user)
