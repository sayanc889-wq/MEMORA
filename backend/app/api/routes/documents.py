import re
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.models.document import Document
from app.schemas.document import (
    ALLOWED_CATEGORIES,
    ActionStatusUpdate,
    ActionSuggestionRequest,
    ActionSuggestionResponse,
    DocumentCreate,
    DocumentResponse,
    DocumentUpdate,
)
from app.services.intelligence import suggest_action_for_document

router = APIRouter(tags=["documents"])

MAX_FILE_SIZE = 20 * 1024 * 1024
SAFE_EXTENSION = re.compile(r"\.[A-Za-z0-9]{1,10}$")


def _safe_original_filename(filename: str | None) -> str:
    if not filename or not filename.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file name is missing")

    original_name = Path(filename).name
    if not original_name or original_name in {".", ".."}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid file name")
    return original_name


def _stored_filename(original_name: str) -> str:
    extension = Path(original_name).suffix.lower()
    if extension and not SAFE_EXTENSION.fullmatch(extension):
        extension = ""
    return f"{uuid.uuid4().hex}{extension}"


def _resolve_stored_file(file_path: str) -> Path | None:
    uploads_dir = settings.uploads_dir.resolve()
    stored_path = (settings.data_dir / file_path).resolve()
    if stored_path != uploads_dir and uploads_dir not in stored_path.parents:
        return None
    return stored_path


def _delete_stored_file(file_path: str) -> None:
    stored_path = _resolve_stored_file(file_path)
    if stored_path is not None and stored_path.is_file():
        stored_path.unlink()


@router.post("/documents/suggest-action", response_model=ActionSuggestionResponse)
def get_suggested_action(payload: ActionSuggestionRequest):
    """Returns a deterministic smart action suggestion based on document title/category/filename."""
    return suggest_action_for_document(
        title=payload.title,
        category=payload.category,
        file_name=payload.file_name,
        description=payload.description,
    )


@router.post("/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    title: str = Form(...),
    category: str = Form(...),
    file: UploadFile = File(...),
    description: str | None = Form(None),
    document_date: datetime | None = Form(None),
    expiry_date: datetime | None = Form(None),
    remind_at: datetime | None = Form(None),
    action: str | None = Form(None),
    action_status: str | None = Form(None),
    action_due_date: datetime | None = Form(None),
    is_important: bool = Form(False),
    db: Session = Depends(get_db),
):
    cleaned_action = action.strip() if action and action.strip() else None
    cleaned_status = action_status.strip() if action_status and action_status.strip() else None
    if cleaned_action and (not cleaned_status or cleaned_status == "No Action"):
        cleaned_status = "Pending"
    elif not cleaned_action and not cleaned_status:
        cleaned_status = "No Action"

    payload = DocumentCreate(
        title=title,
        description=description,
        category=category,
        document_date=document_date,
        expiry_date=expiry_date,
        remind_at=remind_at,
        action=cleaned_action,
        action_status=cleaned_status,
        action_due_date=action_due_date,
        is_important=is_important,
    )
    original_name = _safe_original_filename(file.filename)
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file is empty")
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="file is too large")

    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    stored_name = _stored_filename(original_name)
    destination = (settings.uploads_dir / stored_name).resolve()
    uploads_dir = settings.uploads_dir.resolve()
    if destination != uploads_dir and uploads_dir not in destination.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid storage path")

    destination.write_bytes(contents)

    document = Document(
        title=payload.title,
        description=payload.description,
        category=payload.category,
        file_name=original_name,
        file_path=f"uploads/{stored_name}",
        mime_type=file.content_type,
        file_size=len(contents),
        document_date=payload.document_date,
        expiry_date=payload.expiry_date,
        remind_at=payload.remind_at,
        action=payload.action,
        action_status=payload.action_status or "No Action",
        action_due_date=payload.action_due_date,
        is_important=payload.is_important,
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    return document


@router.get("/documents", response_model=list[DocumentResponse])
def list_documents(
    q: str | None = None,
    category: str | None = None,
    is_important: bool | None = None,
    has_expiry: bool | None = None,
    has_reminder: bool | None = None,
    action_status: str | None = None,
    has_action: bool | None = None,
    is_overdue: bool | None = None,
    db: Session = Depends(get_db),
):
    if category is not None and category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"category must be one of: {', '.join(ALLOWED_CATEGORIES)}",
        )

    statement = select(Document)

    if q is not None and q.strip():
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Document.title.ilike(pattern),
                Document.description.ilike(pattern),
                Document.file_name.ilike(pattern),
                Document.action.ilike(pattern),
                Document.category.ilike(pattern),
            )
        )

    if category is not None:
        statement = statement.where(Document.category == category)

    if is_important is not None:
        statement = statement.where(Document.is_important.is_(is_important))

    if has_expiry is True:
        statement = statement.where(Document.expiry_date.is_not(None))
    elif has_expiry is False:
        statement = statement.where(Document.expiry_date.is_(None))

    if has_reminder is True:
        statement = statement.where(Document.remind_at.is_not(None))
    elif has_reminder is False:
        statement = statement.where(Document.remind_at.is_(None))

    if action_status is not None:
        statement = statement.where(Document.action_status == action_status)

    if has_action is True:
        statement = statement.where(Document.action.is_not(None), Document.action != "")
    elif has_action is False:
        statement = statement.where(or_(Document.action.is_(None), Document.action == ""))

    if is_overdue is True:
        now = datetime.now()
        statement = statement.where(
            func.upper(Document.action_status) != "COMPLETED",
            or_(
                (Document.action_due_date.is_not(None)) & (Document.action_due_date < now),
                (Document.action_due_date.is_(None))
                & (Document.expiry_date.is_not(None))
                & (Document.expiry_date < now),
            ),
        )

    statement = statement.order_by(Document.created_at.desc(), Document.id.desc())
    return db.scalars(statement).all()


@router.get("/documents/categories")
def list_document_categories():
    return ALLOWED_CATEGORIES


@router.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document(document_id: int, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


@router.put("/documents/{document_id}", response_model=DocumentResponse)
def update_document(document_id: int, payload: DocumentUpdate, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    updates = payload.model_dump(exclude_unset=True)

    # Auto-adjust status if action was newly provided
    if "action" in updates:
        new_act = updates["action"]
        if new_act and new_act.strip():
            if "action_status" not in updates and document.action_status in ["No Action", None]:
                updates["action_status"] = "Pending"
        elif not new_act:
            if "action_status" not in updates:
                updates["action_status"] = "No Action"

    for field, value in updates.items():
        setattr(document, field, value)

    db.commit()
    db.refresh(document)
    return document


@router.patch("/documents/{document_id}/action-status", response_model=DocumentResponse)
def update_action_status(
    document_id: int,
    payload: ActionStatusUpdate,
    db: Session = Depends(get_db),
):
    """Quick endpoint to toggle or change action status (e.g. mark Completed)."""
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    document.action_status = payload.action_status
    if payload.action is not None:
        document.action = payload.action
    if payload.action_due_date is not None:
        document.action_due_date = payload.action_due_date

    db.commit()
    db.refresh(document)
    return document


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: int, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    file_path = document.file_path
    db.delete(document)
    db.commit()
    _delete_stored_file(file_path)


@router.get("/documents/{document_id}/file")
def download_document(
    document_id: int,
    db: Session = Depends(get_db),
):
    document = db.get(Document, document_id)

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    stored_path = _resolve_stored_file(document.file_path)

    if stored_path is None or not stored_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found",
        )

    return FileResponse(
        path=stored_path,
        media_type=document.mime_type or "application/octet-stream",
        filename=document.file_name,
    )
