import base64
import json
import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlparse

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.database import get_db
from db.models import UserPreferences

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


# ── Login rate limiter (in-memory, per client IP) ─────────────────────────────
_login_attempts: defaultdict[str, list[float]] = defaultdict(list)
_MAX_LOGIN_ATTEMPTS = 10
_LOGIN_WINDOW_S = 300  # 5-minute sliding window


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    # Prune attempts outside the window
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _LOGIN_WINDOW_S]
    if len(_login_attempts[ip]) >= _MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {_LOGIN_WINDOW_S // 60} minutes.",
        )
    _login_attempts[ip].append(now)


def _reset_rate_limit(ip: str) -> None:
    """Clear the counter for an IP on successful login."""
    _login_attempts.pop(ip, None)


# ── WebAuthn helpers ──────────────────────────────────────────────────────────

def _webauthn_rp_id() -> str:
    """
    Derive the WebAuthn relying party ID from the configured webauthn_origin.
    rp_id must be the effective domain (no scheme, no port) per the spec.
    """
    return urlparse(settings.webauthn_origin).hostname or "localhost"


def _hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    """Verify a password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ── helpers ────────────────────────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    payload = {**data, "exp": datetime.utcnow() + timedelta(hours=settings.access_token_expire_hours)}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


async def get_prefs(db: AsyncSession) -> UserPreferences:
    result = await db.execute(select(UserPreferences).where(UserPreferences.id == 1))
    prefs = result.scalar_one_or_none()
    if prefs is None:
        prefs = UserPreferences(id=1)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)
    return prefs


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=["HS256"])
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


# ── schemas ────────────────────────────────────────────────────────────────────

class SetupRequest(BaseModel):
    password: str
    confirm_password: str


class LoginRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_new_password: str


class WebAuthnFinishRequest(BaseModel):
    id: str
    rawId: str
    response: dict
    type: str
    clientExtensionResults: dict = Field(default_factory=dict)


# ── routes ─────────────────────────────────────────────────────────────────────

@router.get("/status")
async def auth_status(db: AsyncSession = Depends(get_db)):
    """Public endpoint — returns onboarding state and WebAuthn enrollment status."""
    prefs = await get_prefs(db)
    cred = prefs.webauthn_credential or {}
    return {
        "onboarding_complete": prefs.onboarding_complete,
        "has_webauthn": bool(cred.get("credential_id")),
        "has_password": bool(prefs.password_hash),
    }


@router.post("/setup")
async def setup(body: SetupRequest, db: AsyncSession = Depends(get_db)):
    """First-launch: create password and mark onboarding complete."""
    prefs = await get_prefs(db)
    if prefs.onboarding_complete:
        raise HTTPException(status_code=400, detail="Already set up. Use /login to authenticate.")
    if body.password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if len(body.password) < 12:
        raise HTTPException(status_code=400, detail="Password must be at least 12 characters")

    prefs.password_hash = _hash_password(body.password)
    prefs.onboarding_complete = True
    await db.commit()

    token = create_access_token({"sub": "local-user", "type": "password"})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/login")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    prefs = await get_prefs(db)
    if not prefs.onboarding_complete or not prefs.password_hash:
        raise HTTPException(status_code=400, detail="Setup required first")
    if not _verify_password(body.password, prefs.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    _reset_rate_limit(client_ip)
    token = create_access_token({"sub": "local-user", "type": "password"})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = await get_prefs(db)
    if not _verify_password(body.current_password, prefs.password_hash or ""):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if body.new_password != body.confirm_new_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")
    if len(body.new_password) < 12:
        raise HTTPException(status_code=400, detail="Password must be at least 12 characters")

    prefs.password_hash = _hash_password(body.new_password)
    await db.commit()
    return {"message": "Password updated"}


@router.get("/me")
async def me(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    prefs = await get_prefs(db)
    cred = prefs.webauthn_credential or {}
    return {
        "sub": user.get("sub"),
        "auth_type": user.get("type"),
        "onboarding_complete": prefs.onboarding_complete,
        "has_webauthn": bool(cred.get("credential_id")),
        "theme": prefs.theme,
    }


@router.post("/logout")
async def logout(_user=Depends(get_current_user)):
    # JWT is stateless — client must discard token
    return {"message": "Logged out"}


# ── WebAuthn ──────────────────────────────────────────────────────────────────

@router.get("/webauthn/register-begin")
async def webauthn_register_begin(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        from webauthn import generate_registration_options, options_to_json
        from webauthn.helpers.structs import (
            AuthenticatorSelectionCriteria,
            UserVerificationRequirement,
            AuthenticatorAttachment,
            ResidentKeyRequirement,
        )
        from webauthn.helpers.cose import COSEAlgorithmIdentifier
    except ImportError:
        raise HTTPException(status_code=500, detail="WebAuthn library not available")

    options = generate_registration_options(
        rp_id=_webauthn_rp_id(),
        rp_name="Finance Dashboard",
        user_id=b"local-user-1",
        user_name="finance_user",
        user_display_name="Finance Dashboard",
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        supported_pub_key_algs=[COSEAlgorithmIdentifier.ECDSA_SHA_256],
    )

    challenge_b64 = base64.urlsafe_b64encode(options.challenge).rstrip(b"=").decode()
    prefs = await get_prefs(db)
    cred_data = dict(prefs.webauthn_credential or {})
    cred_data["pending_reg_challenge"] = challenge_b64
    prefs.webauthn_credential = cred_data
    await db.commit()

    return json.loads(options_to_json(options))


@router.post("/webauthn/register-finish")
async def webauthn_register_finish(
    body: WebAuthnFinishRequest,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        from webauthn import verify_registration_response
        from webauthn.helpers.structs import RegistrationCredential, AuthenticatorAttestationResponse
        from webauthn.helpers import base64url_to_bytes
    except ImportError:
        raise HTTPException(status_code=500, detail="WebAuthn library not available")

    prefs = await get_prefs(db)
    cred_data = dict(prefs.webauthn_credential or {})
    challenge_b64 = cred_data.get("pending_reg_challenge")
    if not challenge_b64:
        raise HTTPException(status_code=400, detail="No pending registration challenge")

    # Pad base64url
    padding = 4 - len(challenge_b64) % 4
    if padding != 4:
        challenge_b64 += "=" * padding
    challenge_bytes = base64.urlsafe_b64decode(challenge_b64)

    try:
        reg_credential = RegistrationCredential(
            id=body.id,
            raw_id=base64url_to_bytes(body.rawId),
            response=AuthenticatorAttestationResponse(
                client_data_json=base64url_to_bytes(body.response["clientDataJSON"]),
                attestation_object=base64url_to_bytes(body.response["attestationObject"]),
            ),
            type=body.type,
        )
        verification = verify_registration_response(
            credential=reg_credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=_webauthn_rp_id(),
            expected_origin=settings.webauthn_origin,
            require_user_verification=True,
        )
    except Exception as e:
        logger.warning("WebAuthn registration failed: %s", e)
        raise HTTPException(status_code=400, detail="WebAuthn registration failed")

    cred_data["credential_id"] = base64.urlsafe_b64encode(verification.credential_id).rstrip(b"=").decode()
    cred_data["public_key"] = base64.urlsafe_b64encode(verification.credential_public_key).rstrip(b"=").decode()
    cred_data["sign_count"] = verification.sign_count
    cred_data.pop("pending_reg_challenge", None)
    prefs.webauthn_credential = cred_data
    await db.commit()

    return {"message": "Touch ID enrolled successfully"}


@router.get("/webauthn/authenticate-begin")
async def webauthn_authenticate_begin(request: Request, db: AsyncSession = Depends(get_db)):
    _check_rate_limit(request.client.host if request.client else "unknown")
    try:
        from webauthn import generate_authentication_options, options_to_json
        from webauthn.helpers.structs import (
            UserVerificationRequirement,
            PublicKeyCredentialDescriptor,
        )
        from webauthn.helpers import base64url_to_bytes
    except ImportError:
        raise HTTPException(status_code=500, detail="WebAuthn library not available")

    prefs = await get_prefs(db)
    cred_data = dict(prefs.webauthn_credential or {})
    cred_id_b64 = cred_data.get("credential_id")
    if not cred_id_b64:
        raise HTTPException(status_code=400, detail="Touch ID not enrolled")

    padding = 4 - len(cred_id_b64) % 4
    if padding != 4:
        cred_id_b64 += "=" * padding
    cred_id_bytes = base64.urlsafe_b64decode(cred_id_b64)

    options = generate_authentication_options(
        rp_id=_webauthn_rp_id(),
        user_verification=UserVerificationRequirement.REQUIRED,
        allow_credentials=[PublicKeyCredentialDescriptor(id=cred_id_bytes)],
    )

    challenge_b64 = base64.urlsafe_b64encode(options.challenge).rstrip(b"=").decode()
    cred_data["pending_auth_challenge"] = challenge_b64
    prefs.webauthn_credential = cred_data
    await db.commit()

    return json.loads(options_to_json(options))


@router.post("/webauthn/authenticate-finish")
async def webauthn_authenticate_finish(
    request: Request,
    body: WebAuthnFinishRequest,
    db: AsyncSession = Depends(get_db),
):
    _check_rate_limit(request.client.host if request.client else "unknown")
    try:
        from webauthn import verify_authentication_response
        from webauthn.helpers.structs import AuthenticationCredential, AuthenticatorAssertionResponse
        from webauthn.helpers import base64url_to_bytes
    except ImportError:
        raise HTTPException(status_code=500, detail="WebAuthn library not available")

    prefs = await get_prefs(db)
    cred_data = dict(prefs.webauthn_credential or {})

    challenge_b64 = cred_data.get("pending_auth_challenge")
    pub_key_b64 = cred_data.get("public_key")
    sign_count = cred_data.get("sign_count", 0)

    if not challenge_b64 or not pub_key_b64:
        raise HTTPException(status_code=400, detail="No pending authentication challenge or credential")

    def _decode_b64(s: str) -> bytes:
        padding = 4 - len(s) % 4
        if padding != 4:
            s += "=" * padding
        return base64.urlsafe_b64decode(s)

    challenge_bytes = _decode_b64(challenge_b64)
    pub_key_bytes = _decode_b64(pub_key_b64)

    response = body.response
    try:
        auth_credential = AuthenticationCredential(
            id=body.id,
            raw_id=base64url_to_bytes(body.rawId),
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(response["clientDataJSON"]),
                authenticator_data=base64url_to_bytes(response["authenticatorData"]),
                signature=base64url_to_bytes(response["signature"]),
                user_handle=base64url_to_bytes(response["userHandle"]) if response.get("userHandle") else None,
            ),
            type=body.type,
        )
        verification = verify_authentication_response(
            credential=auth_credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=_webauthn_rp_id(),
            expected_origin=settings.webauthn_origin,
            credential_public_key=pub_key_bytes,
            credential_current_sign_count=sign_count,
            require_user_verification=True,
        )
    except Exception as e:
        logger.warning("WebAuthn authentication failed: %s", e)
        raise HTTPException(status_code=401, detail="Touch ID verification failed")

    _reset_rate_limit(request.client.host if request.client else "unknown")
    cred_data["sign_count"] = verification.new_sign_count
    cred_data.pop("pending_auth_challenge", None)
    prefs.webauthn_credential = cred_data
    await db.commit()

    token = create_access_token({"sub": "local-user", "type": "webauthn"})
    return {"access_token": token, "token_type": "bearer"}
