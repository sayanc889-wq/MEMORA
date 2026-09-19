from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


ALLOWED_CATEGORIES = [
    "general",
    "study",
    "work",
    "personal",
    "finance",
    "project",
    "health",
]

ALLOWED_ACTION_STATUSES = [
    "No Action",
    "Pending",
    "In Progress",
    "Completed",
]


class DocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    category: str
    document_date: datetime | None = None
    expiry_date: datetime | None = None
    remind_at: datetime | None = None
    action: str | None = None
    action_status: str | None = "No Action"
    action_due_date: datetime | None = None
    is_important: bool = False

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in ALLOWED_CATEGORIES:
            raise ValueError(
                f"category must be one of: {', '.join(ALLOWED_CATEGORIES)}"
            )
        return value

    @field_validator("action_status")
    @classmethod
    def validate_action_status(cls, value: str | None) -> str:
        if not value:
            return "No Action"
        value = value.strip()
        if value not in ALLOWED_ACTION_STATUSES:
            raise ValueError(
                f"action_status must be one of: {', '.join(ALLOWED_ACTION_STATUSES)}"
            )
        return value


class DocumentUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    document_date: datetime | None = None
    expiry_date: datetime | None = None
    remind_at: datetime | None = None
    action: str | None = None
    action_status: str | None = None
    action_due_date: datetime | None = None
    is_important: bool | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().lower()
        if value not in ALLOWED_CATEGORIES:
            raise ValueError(
                f"category must be one of: {', '.join(ALLOWED_CATEGORIES)}"
            )
        return value

    @field_validator("action_status")
    @classmethod
    def validate_action_status(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if value not in ALLOWED_ACTION_STATUSES:
            raise ValueError(
                f"action_status must be one of: {', '.join(ALLOWED_ACTION_STATUSES)}"
            )
        return value


class ActionStatusUpdate(BaseModel):
    action_status: str
    action: str | None = None
    action_due_date: datetime | None = None

    @field_validator("action_status")
    @classmethod
    def validate_action_status(cls, value: str) -> str:
        value = value.strip()
        if value not in ALLOWED_ACTION_STATUSES:
            raise ValueError(
                f"action_status must be one of: {', '.join(ALLOWED_ACTION_STATUSES)}"
            )
        return value


class ActionSuggestionRequest(BaseModel):
    title: str
    category: str
    file_name: str | None = None
    description: str | None = None


class ActionSuggestionResponse(BaseModel):
    suggested_action: str
    reason: str
    confidence: float


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    category: str
    file_name: str
    file_path: str
    mime_type: str | None
    file_size: int
    document_date: datetime | None
    expiry_date: datetime | None
    remind_at: datetime | None
    action: str | None
    action_status: str
    action_due_date: datetime | None
    is_important: bool
    created_at: datetime
    updated_at: datetime