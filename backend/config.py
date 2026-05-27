from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://financeuser:financepassword@postgres:5432/finance_dashboard"
    secret_key: str = "change-this-secret-key-in-production-minimum-32-characters"
    access_token_expire_hours: int = 24
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    cors_origins: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
