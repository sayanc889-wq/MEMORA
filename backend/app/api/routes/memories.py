from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.memory import Memory
from app.schemas.memory import ALLOWED_CATEGORIES, MemoryCreate, MemoryResponse, MemoryUpdate

router = APIRouter(tags=["memories"])


@router.post("/memories", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
def create_memory(payload: MemoryCreate, db: Session = Depends(get_db)):
    memory = Memory(
        content=payload.content,
        title=payload.title,
        category=payload.category,
        importance=payload.importance,
        tags=payload.tags,
        occurred_at=payload.occurred_at,
        remind_at=payload.remind_at,
        is_pinned=payload.is_pinned,
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


@router.get("/memories", response_model=list[MemoryResponse])
def list_memories(
    q: str | None = None,
    category: str | None = None,
    min_importance: int | None = Query(default=None, ge=1, le=5),
    pinned: bool | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    has_reminder: bool | None = None,
    remind_before: datetime | None = None,
    db: Session = Depends(get_db),
):
    if category is not None and category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"category must be one of: {', '.join(ALLOWED_CATEGORIES)}",
        )

    statement = select(Memory)
    timeline = func.coalesce(Memory.occurred_at, Memory.created_at)

    if q is not None and q.strip():
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Memory.title.ilike(pattern),
                Memory.content.ilike(pattern),
                Memory.tags.ilike(pattern),
            )
        )

    if category is not None:
        statement = statement.where(Memory.category == category)

    if min_importance is not None:
        statement = statement.where(Memory.importance >= min_importance)

    if pinned is not None:
        statement = statement.where(Memory.is_pinned.is_(pinned))

    if from_date is not None:
        statement = statement.where(timeline >= from_date)

    if to_date is not None:
        statement = statement.where(timeline <= to_date)

    if has_reminder is True:
        statement = statement.where(Memory.remind_at.is_not(None))
    elif has_reminder is False:
        statement = statement.where(Memory.remind_at.is_(None))

    if remind_before is not None:
        statement = statement.where(Memory.remind_at.is_not(None))
        statement = statement.where(Memory.remind_at <= remind_before)

    statement = statement.order_by(
        Memory.is_pinned.desc(),
        timeline.desc(),
        Memory.id.desc(),
    )
    return db.scalars(statement).all()


@router.get("/memories/categories")
def list_categories():
    return ALLOWED_CATEGORIES


@router.get("/memories/{memory_id}", response_model=MemoryResponse)
def get_memory(memory_id: int, db: Session = Depends(get_db)):
    memory = db.get(Memory, memory_id)
    if memory is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")
    return memory


@router.put("/memories/{memory_id}", response_model=MemoryResponse)
def update_memory(memory_id: int, payload: MemoryUpdate, db: Session = Depends(get_db)):
    memory = db.get(Memory, memory_id)
    if memory is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(memory, field, value)

    db.commit()
    db.refresh(memory)
    return memory


@router.delete("/memories/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(memory_id: int, db: Session = Depends(get_db)):
    memory = db.get(Memory, memory_id)
    if memory is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")

    db.delete(memory)
    db.commit()
