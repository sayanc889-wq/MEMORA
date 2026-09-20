from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


ALLOWED_RESOURCE_CATEGORIES = [
    "study",
    "work",
    "project",
    "finance",
    "health",
    "personal",
    "general",
]

ALLOWED_SOURCE_TYPES = [
    "youtube",
    "article",
    "github",
    "pdf",
    "course",
    "documentation",
    "web",
]


class WebResourceBase(BaseModel):
    title: str = Field(..., max_length=300)
    url: str = Field(..., max_length=1000)
    source_type: str = Field(default="web")
    category: str = Field(default="study")
    notes: Optional[str] = None
    tags: Optional[str] = None
    remind_at: Optional[datetime] = None
    action: Optional[str] = None
    action_status: str = Field(default="No Action")
    metadata_json: Optional[str] = None
    summary: Optional[str] = None
    is_pinned: bool = False


class WebResourceCreate(WebResourceBase):
    pass


class WebResourceUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    source_type: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    remind_at: Optional[datetime] = None
    action: Optional[str] = None
    action_status: Optional[str] = None
    metadata_json: Optional[str] = None
    summary: Optional[str] = None
    is_pinned: Optional[bool] = None


class WebResourceResponse(WebResourceBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WebResourceSearchResult(BaseModel):
    resource: WebResourceResponse
    relevance_score: float
    matched_concepts: List[str] = []
    match_reason: str = ""


class WebResourceSearchRequest(BaseModel):
    query: str
    category: Optional[str] = None
    source_type: Optional[str] = None
    limit: int = Field(default=20, ge=1, le=100)


class WebResourceSearchResponse(BaseModel):
    query: str
    total_found: int
    results: List[WebResourceSearchResult]
    suggested_followups: List[str] = []


class WebResourceSyncItem(BaseModel):
    client_id: Optional[str] = None
    title: str
    url: str
    source_type: str = "web"
    category: str = "study"
    notes: Optional[str] = None
    tags: Optional[str] = None
    remind_at: Optional[datetime] = None
    action: Optional[str] = None
    action_status: str = "No Action"
    metadata_json: Optional[str] = None
    created_at: Optional[datetime] = None


class WebResourceSyncRequest(BaseModel):
    items: List[WebResourceSyncItem]


class WebResourceSyncResponse(BaseModel):
    synced_count: int
    created_ids: List[int]
