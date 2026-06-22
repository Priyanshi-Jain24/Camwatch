from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_admin
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas import GoogleLoginRequest, GoogleSsoConfig, Token, UserCreate, UserOut

router = APIRouter()


def issue_token_for_user(user: User) -> Token:
    token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=token)


async def verify_google_credential(credential: str) -> dict:
    if not settings.GOOGLE_SSO_ENABLED or not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google SSO is not configured")

    try:
        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
            response = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": credential},
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Google token verification failed: {exc}")

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    payload = response.json()
    audience = payload.get("aud")
    email = (payload.get("email") or "").strip().lower()
    email_verified = str(payload.get("email_verified", "")).lower() == "true"

    if audience != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Google credential audience mismatch")
    if not email or not email_verified:
        raise HTTPException(status_code=401, detail="Google account email is not verified")

    return payload


@router.get("/google/config", response_model=GoogleSsoConfig)
async def google_sso_config():
    enabled = bool(settings.GOOGLE_SSO_ENABLED and settings.GOOGLE_CLIENT_ID)
    return GoogleSsoConfig(enabled=enabled, client_id=settings.GOOGLE_CLIENT_ID if enabled else None)


@router.post("/google/login", response_model=Token)
async def google_login(
    payload: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    google_payload = await verify_google_credential(payload.credential)
    email = google_payload["email"].strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=403, detail="Google account is not allowed in CamWatch")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    if not user.full_name and google_payload.get("name"):
        user.full_name = google_payload["name"]

    return issue_token_for_user(user)


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return issue_token_for_user(user)


@router.post("/register", response_model=UserOut)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.email == user_in.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=UserRole.USER.value,
        is_superuser=False,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
