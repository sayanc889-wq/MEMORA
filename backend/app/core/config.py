from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "MEMORA"
    sqlite_filename: str = "memora.db"

    @property
    def data_dir(self) -> Path:
        return BACKEND_DIR / "data"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def database_url(self) -> str:
        db_path = (self.data_dir / self.sqlite_filename).resolve()
        return f"sqlite:///{db_path.as_posix()}"


settings = Settings()