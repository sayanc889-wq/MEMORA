from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.base import Base

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_missing_memory_columns() -> None:
    inspector = inspect(engine)
    if "memories" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("memories")}
    new_columns = {
        "title": "ALTER TABLE memories ADD COLUMN title VARCHAR",
        "occurred_at": "ALTER TABLE memories ADD COLUMN occurred_at DATETIME",
        "remind_at": "ALTER TABLE memories ADD COLUMN remind_at DATETIME",
        "is_pinned": "ALTER TABLE memories ADD COLUMN is_pinned BOOLEAN DEFAULT 0",
    }
    with engine.begin() as connection:
        for name, statement in new_columns.items():
            if name not in existing:
                connection.execute(text(statement))


def _add_missing_document_columns() -> None:
    inspector = inspect(engine)
    if "documents" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("documents")}
    new_columns = {
        "action": "ALTER TABLE documents ADD COLUMN action VARCHAR(500)",
        "action_status": "ALTER TABLE documents ADD COLUMN action_status VARCHAR(50) DEFAULT 'No Action'",
        "action_due_date": "ALTER TABLE documents ADD COLUMN action_due_date DATETIME",
    }
    with engine.begin() as connection:
        for name, statement in new_columns.items():
            if name not in existing:
                connection.execute(text(statement))
        # Ensure any document with an existing action has 'Pending' status if unset
        connection.execute(
            text(
                "UPDATE documents SET action_status = 'Pending' "
                "WHERE action IS NOT NULL AND TRIM(action) != '' "
                "AND (action_status IS NULL OR action_status = 'No Action')"
            )
        )


def init_db() -> None:
    from app.models import Document, Memory, LifeEvent, DocumentRelation  # noqa: F401

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)

    Base.metadata.create_all(bind=engine)
    _add_missing_memory_columns()
    _add_missing_document_columns()