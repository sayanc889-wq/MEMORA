import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.web_resource import WebResource
from app.schemas.web_resource import (
    GenerateTodosRequest,
    GenerateTodosResponse,
    StudyTodoItem,
    UpdateTodosRequest,
    WebResourceCreate,
    WebResourceResponse,
    WebResourceSearchRequest,
    WebResourceSearchResponse,
    WebResourceSyncRequest,
    WebResourceSyncResponse,
    WebResourceUpdate,
)
from app.services.semantic_search import perform_semantic_search
from app.services.study_planner import generate_study_todos

router = APIRouter(prefix="/web-resources", tags=["web-resources"])


@router.get("", response_model=List[WebResourceResponse])
def list_web_resources(
    category: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    has_reminder: Optional[bool] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Lists saved web resources with optional filtering and keyword search."""
    stmt = select(WebResource).order_by(desc(WebResource.is_pinned), desc(WebResource.created_at))

    if category:
        stmt = stmt.where(WebResource.category == category)
    if source_type:
        stmt = stmt.where(WebResource.source_type == source_type)
    if has_reminder is True:
        stmt = stmt.where(WebResource.remind_at.is_not(None))
    elif has_reminder is False:
        stmt = stmt.where(WebResource.remind_at.is_(None))

    resources = db.scalars(stmt).all()

    if q and q.strip():
        # Quick fuzzy/semantic rank if q is provided on list endpoint
        search_results = perform_semantic_search(
            query=q,
            resources=list(resources),
            category_filter=category,
            source_type_filter=source_type,
            limit=limit,
        )
        return [res.resource for res in search_results]

    return resources[:limit]


@router.post("", response_model=WebResourceResponse, status_code=status.HTTP_201_CREATED)
def create_web_resource(
    payload: WebResourceCreate,
    db: Session = Depends(get_db),
):
    """Creates a new web resource (from browser extension or dashboard)."""
    # Detect source type if not explicitly set
    source_type = payload.source_type
    url_lower = payload.url.lower()
    if source_type == "web" or not source_type:
        if "youtube.com" in url_lower or "youtu.be" in url_lower:
            source_type = "youtube"
        elif "github.com" in url_lower:
            source_type = "github"
        elif url_lower.endswith(".pdf"):
            source_type = "pdf"
        elif any(k in url_lower for k in ["coursera", "udemy", "edx", "nptel", "mit.edu"]):
            source_type = "course"

    resource = WebResource(
        title=payload.title.strip(),
        url=payload.url.strip(),
        source_type=source_type,
        category=payload.category,
        notes=payload.notes.strip() if payload.notes else None,
        tags=payload.tags.strip() if payload.tags else None,
        remind_at=payload.remind_at,
        action=payload.action.strip() if payload.action else None,
        action_status=payload.action_status,
        metadata_json=payload.metadata_json,
        todos_json=payload.todos_json,
        summary=payload.summary,
        is_pinned=payload.is_pinned,
    )
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


@router.post("/search", response_model=WebResourceSearchResponse)
def search_web_resources_semantically(
    payload: WebResourceSearchRequest,
    db: Session = Depends(get_db),
):
    """Single semantic search across all web resources using concept expansion and vector similarity."""
    stmt = select(WebResource).order_by(desc(WebResource.created_at))
    all_resources = list(db.scalars(stmt).all())

    results = perform_semantic_search(
        query=payload.query,
        resources=all_resources,
        category_filter=payload.category,
        source_type_filter=payload.source_type,
        limit=payload.limit,
    )

    # Dynamic follow-up suggestion based on matched concepts
    followups = []
    if results:
        top_concepts = []
        for r in results[:3]:
            top_concepts.extend(r.matched_concepts)
        unique_concepts = list(set(top_concepts))[:3]
        if unique_concepts:
            followups.append(f"Explore related concepts: {', '.join(unique_concepts)}")
        if any(r.resource.source_type == "youtube" for r in results):
            followups.append("Filter to video lectures only")

    return WebResourceSearchResponse(
        query=payload.query,
        total_found=len(results),
        results=results,
        suggested_followups=followups,
    )


@router.post("/sync", response_model=WebResourceSyncResponse)
def sync_offline_resources(
    payload: WebResourceSyncRequest,
    db: Session = Depends(get_db),
):
    """Batch synchronizes resources saved offline in extension local storage."""
    created_ids = []
    for item in payload.items:
        # Check if URL already exists
        existing = db.scalars(select(WebResource).where(WebResource.url == item.url)).first()
        if existing:
            # Update notes/reminder/todos if newer
            if item.notes and not existing.notes:
                existing.notes = item.notes
            if item.remind_at:
                existing.remind_at = item.remind_at
            if item.todos_json:
                existing.todos_json = item.todos_json
            created_ids.append(existing.id)
        else:
            resource = WebResource(
                title=item.title.strip(),
                url=item.url.strip(),
                source_type=item.source_type,
                category=item.category,
                notes=item.notes.strip() if item.notes else None,
                tags=item.tags.strip() if item.tags else None,
                remind_at=item.remind_at,
                action=item.action.strip() if item.action else None,
                action_status=item.action_status,
                metadata_json=item.metadata_json,
                todos_json=item.todos_json,
                created_at=item.created_at or datetime.now(timezone.utc),
            )
            db.add(resource)
            db.flush()
            created_ids.append(resource.id)

    db.commit()
    return WebResourceSyncResponse(synced_count=len(created_ids), created_ids=created_ids)


@router.get("/{resource_id}", response_model=WebResourceResponse)
def get_web_resource(
    resource_id: int,
    db: Session = Depends(get_db),
):
    resource = db.get(WebResource, resource_id)
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Web resource not found")
    return resource


@router.put("/{resource_id}", response_model=WebResourceResponse)
def update_web_resource(
    resource_id: int,
    payload: WebResourceUpdate,
    db: Session = Depends(get_db),
):
    resource = db.get(WebResource, resource_id)
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Web resource not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(resource, field, value)

    db.commit()
    db.refresh(resource)
    return resource


@router.post("/generate-todos", response_model=GenerateTodosResponse)
def generate_todos_for_study(
    payload: GenerateTodosRequest,
):
    """Generates structured pedagogical study milestones and actionable todos for a resource/video."""
    plan = generate_study_todos(
        title=payload.title,
        url=payload.url,
        notes=payload.notes,
        tags=payload.tags,
        category=payload.category or "study",
    )
    return GenerateTodosResponse(
        topic=plan.topic,
        milestone_title=plan.milestone_title,
        todos=[StudyTodoItem(**t) for t in plan.todos],
    )


@router.put("/{resource_id}/todos", response_model=WebResourceResponse)
def update_resource_todos(
    resource_id: int,
    payload: UpdateTodosRequest,
    db: Session = Depends(get_db),
):
    """Updates todos and their completion state directly for milestone tracking."""
    resource = db.get(WebResource, resource_id)
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Web resource not found")

    todos_data = [t.model_dump() for t in payload.todos]
    resource.todos_json = json.dumps(todos_data)

    # Automatically synchronize action_status if all todos are completed
    if todos_data:
        all_completed = all(t.get("completed", False) for t in todos_data)
        if all_completed:
            resource.action_status = "Completed"
        elif resource.action_status in ("No Action", "Pending"):
            resource.action_status = "In Progress"

    db.commit()
    db.refresh(resource)
    return resource


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_web_resource(
    resource_id: int,
    db: Session = Depends(get_db),
):
    resource = db.get(WebResource, resource_id)
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Web resource not found")

    db.delete(resource)
    db.commit()
    return None
