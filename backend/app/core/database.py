import logging
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.base import Base

logger = logging.getLogger("memora.database")

# Build engine according to connection protocol (PostgreSQL vs SQLite)
db_url = settings.database_url

if db_url.startswith("sqlite"):
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
    )
else:
    # Production Cloud PostgreSQL (Supabase / Neon / Render)
    # Using connection pooling, pre-ping to detect dropped connections, and connection recycling
    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=10,
        max_overflow=20,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _run_safe_alter(connection, table: str, column: str, sql_type: str, default: str | None = None) -> None:
    """Safely adds a column to an existing table if it does not already exist."""
    inspector = inspect(connection)
    if table not in inspector.get_table_names():
        return

    existing = {c["name"] for c in inspector.get_columns(table)}
    if column not in existing:
        default_clause = f" DEFAULT {default}" if default is not None else ""
        stmt = f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}{default_clause}"
        try:
            connection.execute(text(stmt))
            logger.info("Added missing column %s.%s", table, column)
        except Exception as e:
            logger.warning("Could not execute alter statement '%s': %s", stmt, e)


def _migrate_columns() -> None:
    """Ensures backward compatibility and auto-migrates missing columns across all tables."""
    with engine.begin() as conn:
        # Memories columns
        _run_safe_alter(conn, "memories", "title", "VARCHAR")
        _run_safe_alter(conn, "memories", "occurred_at", "TIMESTAMP")
        _run_safe_alter(conn, "memories", "remind_at", "TIMESTAMP")
        _run_safe_alter(conn, "memories", "is_pinned", "BOOLEAN", default="0" if db_url.startswith("sqlite") else "FALSE")
        _run_safe_alter(conn, "memories", "user_id", "INTEGER")

        # Documents columns
        _run_safe_alter(conn, "documents", "action", "VARCHAR(500)")
        _run_safe_alter(conn, "documents", "action_status", "VARCHAR(50)", default="'No Action'")
        _run_safe_alter(conn, "documents", "action_due_date", "TIMESTAMP")
        _run_safe_alter(conn, "documents", "user_id", "INTEGER")

        # Life Events columns
        _run_safe_alter(conn, "life_events", "user_id", "INTEGER")
        _run_safe_alter(conn, "document_relations", "user_id", "INTEGER")

        # Ensure any document with an existing action has 'Pending' status if unset
        try:
            conn.execute(
                text(
                    "UPDATE documents SET action_status = 'Pending' "
                    "WHERE action IS NOT NULL AND TRIM(action) != '' "
                    "AND (action_status IS NULL OR action_status = 'No Action')"
                )
            )
        except Exception:
            pass


def _ensure_default_seed() -> None:
    """Ensures at least one demo user exists and existing orphaned records are linked."""
    from app.models.user import User
    from app.core.security import hash_password

    with SessionLocal() as db:
        # Check if default demo user exists
        demo_user = db.query(User).filter(User.email == "demo@memora.app").first()
        if not demo_user:
            demo_user = User(
                email="demo@memora.app",
                hashed_password=hash_password("password123"),
                full_name="Demo User",
            )
            db.add(demo_user)
            db.commit()
            db.refresh(demo_user)
            logger.info("Created default demo user: demo@memora.app")

        # Associate any pre-existing records that have null user_id with demo_user
        try:
            with engine.begin() as conn:
                conn.execute(text(f"UPDATE documents SET user_id = {demo_user.id} WHERE user_id IS NULL"))
                conn.execute(text(f"UPDATE life_events SET user_id = {demo_user.id} WHERE user_id IS NULL"))
                conn.execute(text(f"UPDATE memories SET user_id = {demo_user.id} WHERE user_id IS NULL"))
                conn.execute(text(f"UPDATE document_relations SET user_id = {demo_user.id} WHERE user_id IS NULL"))
        except Exception as e:
            logger.warning("Could not associate orphaned rows: %s", e)


def init_db() -> None:
    from app.models import Base  # noqa: F401
    import app.models  # noqa: F401

    if db_url.startswith("sqlite"):
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        settings.uploads_dir.mkdir(parents=True, exist_ok=True)

    # Automatically create all tables (users, documents, youtube_links, life_events, memories, document_relations)
    Base.metadata.create_all(bind=engine)
    _migrate_columns()
    _ensure_default_seed()