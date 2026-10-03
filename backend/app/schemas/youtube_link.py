from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator


class YoutubeLinkCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., min_length=5, max_length=500)
    category: str = Field(default="general", max_length=50)
    channel_name: str | None = Field(default=None, max_length=100)
    notes: str | None = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        v = v.strip()
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class YoutubeLinkUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    category: str | None = None
    channel_name: str | None = None
    notes: str | None = None


class YoutubeLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    url: str
    category: str
    channel_name: str | None
    notes: str | None
    created_at: datetime
