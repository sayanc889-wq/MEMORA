import os
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "MEMORA"
    sqlite_filename: str = "memora.db"

    # Database Configuration (PostgreSQL on Supabase/Neon/Render, fallback to SQLite)
    database_url_env: str | None = Field(default=None, alias="DATABASE_URL")

    # JWT Authentication
    jwt_secret_key: str = Field(
        default="memora-production-secret-jwt-key-2026-change-in-env",
        alias="JWT_SECRET",
    )
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Cloud Storage (Supabase Storage bucket)
    supabase_url: str | None = Field(default=None, alias="SUPABASE_URL")
    supabase_key: str | None = Field(default=None, alias="SUPABASE_KEY")
    supabase_bucket: str = Field(default="memora-documents", alias="SUPABASE_BUCKET")

    # CORS & Deployment
    frontend_url: str = Field(default="http://localhost:5173", alias="FRONTEND_URL")

    @property
    def data_dir(self) -> Path:
        return BACKEND_DIR / "data"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def database_url(self) -> str:
        # Check DATABASE_URL environment variable first
        env_url = self.database_url_env or os.getenv("DATABASE_URL")
        if env_url and env_url.strip():
            url = env_url.strip()
            # Render and Supabase often format PostgreSQL URIs as postgres://
            # SQLAlchemy 1.4+ requires postgresql:// or postgresql+psycopg2://
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+psycopg2://", 1)
            elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
                url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
            return url

        # Fallback to local SQLite for offline local development
        db_path = (self.data_dir / self.sqlite_filename).resolve()
        return f"sqlite:///{db_path.as_posix()}"


settings = Settings()