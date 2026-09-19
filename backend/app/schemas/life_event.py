from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

ALLOWED_EVENT_TYPES = [
    "Exam",
    "Scholarship",
    "Insurance Renewal",
    "Passport Renewal",
    "License Renewal",
    "Subscription Renewal",
    "Medical Report",
    "Tax Document",
    "Job Application",
    "College Submission",
    "General",
]


class LifeEventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    event_type: str = "General"
    description: str | None = None
    target_date: datetime | None = None
    status: str = "Active"

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value


class LifeEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    event_type: str
    description: str | None
    target_date: datetime | None
    status: str
    created_at: datetime


class DocumentRelationCreate(BaseModel):
    source_doc_id: int
    target_doc_id: int
    relation_type: str = "related_to"
    notes: str | None = None


class DocumentRelationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_doc_id: int
    target_doc_id: int
    relation_type: str
    notes: str | None
    created_at: datetime
