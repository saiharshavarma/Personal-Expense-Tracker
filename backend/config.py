import logging
import warnings
from pydantic_settings import BaseSettings
from typing import Optional

logger = logging.getLogger(__name__)

_DEFAULT_SECRET = "change-this-secret-key-in-production-minimum-32-characters"


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://financeuser:financepassword@postgres:5432/finance_dashboard"
    secret_key: str = _DEFAULT_SECRET
    access_token_expire_hours: int = 24
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    cors_origins: str = "http://localhost:3000"
    # Optional API key for iOS Shortcut endpoint. If set, requests must include
    # X-iOS-API-Key header with this value. Leave blank to keep the endpoint open
    # (acceptable only on a fully private/local network).
    ios_api_key: Optional[str] = None
    # WebAuthn origin — override in .env for non-localhost deployments
    webauthn_origin: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()

# ── startup security checks ────────────────────────────────────────────────────
if settings.secret_key == _DEFAULT_SECRET:
    warnings.warn(
        "\n\n"
        "⚠️  SECURITY WARNING: SECRET_KEY is set to the default placeholder value.\n"
        "   JWT tokens are not secure. Set a strong, random SECRET_KEY in your .env:\n"
        "   python -c \"import secrets; print(secrets.token_urlsafe(48))\"\n",
        stacklevel=1,
    )
