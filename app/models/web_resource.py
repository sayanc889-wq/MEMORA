from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class WebResource(Base):
    __tablename__ = "web_resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, default="web")
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="study")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(String(300), nullable=True)
    remind_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    action: Mapped[str | None] = mapped_column(String(500), nullable=True)
    action_status: Mapped[str] = mapped_column(String(50), nullable=False, default="No Action")
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    todos_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)
