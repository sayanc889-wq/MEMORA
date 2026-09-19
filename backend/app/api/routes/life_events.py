from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.document import Document
from app.models.life_event import DocumentRelation, LifeEvent
from app.schemas.life_event import (
    DocumentRelationCreate,
    DocumentRelationResponse,
    LifeEventCreate,
    LifeEventResponse,
)

router = APIRouter(tags=["life_events"])


@router.get("/life-events", response_model=list[LifeEventResponse])
def list_life_events(db: Session = Depends(get_db)):
    stmt = select(LifeEvent).order_by(LifeEvent.target_date.asc().nulls_last(), LifeEvent.id.desc())
    return db.scalars(stmt).all()


@router.post("/life-events", response_model=LifeEventResponse, status_code=status.HTTP_201_CREATED)
def create_life_event(payload: LifeEventCreate, db: Session = Depends(get_db)):
    event = LifeEvent(
        title=payload.title,
        event_type=payload.event_type,
        description=payload.description,
        target_date=payload.target_date,
        status=payload.status,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/life-events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_life_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(LifeEvent, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Life event not found")
    db.delete(event)
    db.commit()


@router.post("/documents/relations", response_model=DocumentRelationResponse, status_code=status.HTTP_201_CREATED)
def create_document_relation(payload: DocumentRelationCreate, db: Session = Depends(get_db)):
    source = db.get(Document, payload.source_doc_id)
    target = db.get(Document, payload.target_doc_id)
    if not source or not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source or target document not found")

    rel = DocumentRelation(
        source_doc_id=payload.source_doc_id,
        target_doc_id=payload.target_doc_id,
        relation_type=payload.relation_type,
        notes=payload.notes,
    )
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return rel


@router.get("/documents/{document_id}/relations", response_model=list[DocumentRelationResponse])
def get_document_relations(document_id: int, db: Session = Depends(get_db)):
    stmt = select(DocumentRelation).where(
        (DocumentRelation.source_doc_id == document_id) | (DocumentRelation.target_doc_id == document_id)
    )
    return db.scalars(stmt).all()


@router.get("/graph/data")
def get_memory_graph_data(db: Session = Depends(get_db)):
    """Provides nodes and links for the interactive visual Memory Graph (Feature 7).

    Connects: Category/Entity -> Document -> Action -> Deadline -> Reminder.
    """
    documents = db.scalars(select(Document)).all()
    events = db.scalars(select(LifeEvent)).all()
    relations = db.scalars(select(DocumentRelation)).all()

    nodes = []
    links = []
    category_nodes = set()

    # Category and Document nodes
    for doc in documents:
        cat_id = f"cat_{doc.category}"
        if cat_id not in category_nodes:
            nodes.append({
                "id": cat_id,
                "label": doc.category.capitalize(),
                "type": "category",
                "color": "#8b5cf6",
            })
            category_nodes.add(cat_id)

        doc_node_id = f"doc_{doc.id}"
        nodes.append({
            "id": doc_node_id,
            "label": doc.title,
            "type": "document",
            "document_id": doc.id,
            "category": doc.category,
            "file_name": doc.file_name,
            "color": "#3b82f6",
        })
        links.append({
            "source": cat_id,
            "target": doc_node_id,
            "label": "contains",
        })

        if doc.action:
            action_id = f"act_{doc.id}"
            nodes.append({
                "id": action_id,
                "label": f"Action: {doc.action}",
                "type": "action",
                "status": doc.action_status,
                "document_id": doc.id,
                "color": "#10b981" if doc.action_status == "Completed" else "#f59e0b",
            })
            links.append({
                "source": doc_node_id,
                "target": action_id,
                "label": "requires",
            })

        if doc.expiry_date:
            exp_id = f"exp_{doc.id}"
            nodes.append({
                "id": exp_id,
                "label": f"Expiry: {doc.expiry_date.strftime('%d %b %Y')}",
                "type": "deadline",
                "document_id": doc.id,
                "color": "#ef4444",
            })
            links.append({
                "source": doc_node_id,
                "target": exp_id,
                "label": "expires_on",
            })

        if doc.remind_at:
            rem_id = f"rem_{doc.id}"
            nodes.append({
                "id": rem_id,
                "label": f"Reminder: {doc.remind_at.strftime('%d %b %H:%M')}",
                "type": "reminder",
                "document_id": doc.id,
                "color": "#06b6d4",
            })
            links.append({
                "source": doc_node_id,
                "target": rem_id,
                "label": "alerts_at",
            })

    # Custom Document Relations
    for rel in relations:
        links.append({
            "source": f"doc_{rel.source_doc_id}",
            "target": f"doc_{rel.target_doc_id}",
            "label": rel.relation_type,
        })

    # Life Events
    for ev in events:
        ev_id = f"event_{ev.id}"
        nodes.append({
            "id": ev_id,
            "label": f"Event: {ev.title}",
            "type": "life_event",
            "event_type": ev.event_type,
            "color": "#ec4899",
        })

    return {"nodes": nodes, "links": links}
