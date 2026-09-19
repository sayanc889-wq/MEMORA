from datetime import datetime

from pydantic import BaseModel, Field, field_validator

ALLOWED_CATEGORIES = [
    "general",
    "study",
    "work",
    "personal",
    "finance",
    "project",
    "health",
]


class MemoryCreate(BaseModel):
    content: str
    title: str | None = None
    category: str = "general"
    importance: int = Field(default=3, ge=1, le=5)
    tags: str | None = None
    occurred_at: datetime | None = None
    remind_at: datetime | None = None
    is_pinned: bool = False

    @field_validator("content")
    @classmethod
    def content_must_not_be_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content must not be empty")
        return value.strip()

    @field_validator("title")
    @classmethod
    def title_strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("category")
    @classmethod
    def category_must_be_allowed(cls, value: str) -> str:
        if value not in ALLOWED_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(ALLOWED_CATEGORIES)}")
        return value


class MemoryUpdate(BaseModel):
    content: str | None = None
    title: str | None = None
    category: str | None = None
    importance: int | None = Field(default=None, ge=1, le=5)
    tags: str | None = None
    occurred_at: datetime | None = None
    remind_at: datetime | None = None
    is_pinned: bool | None = None

    @field_validator("content")
    @classmethod
    def content_must_not_be_empty(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.strip():
            raise ValueError("content must not be empty")
        return value.strip()

    @field_validator("title")
    @classmethod
    def title_strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("category")
    @classmethod
    def category_must_be_allowed(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in ALLOWED_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(ALLOWED_CATEGORIES)}")
        return value


class MemoryResponse(BaseModel):
    id: int
    content: str
    title: str | None
    category: str
    importance: int
    tags: str | None
    created_at: datetime
    occurred_at: datetime | None
    remind_at: datetime | None
    is_pinned: bool

    model_config = {"from_attributes": True}
