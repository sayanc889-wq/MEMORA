from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.youtube_link import YoutubeLink
from app.schemas.youtube_link import YoutubeLinkCreate, YoutubeLinkResponse, YoutubeLinkUpdate

router = APIRouter(prefix="/youtube-links", tags=["youtube_links"])


@router.post("", response_model=YoutubeLinkResponse, status_code=status.HTTP_201_CREATED)
def create_youtube_link(
    payload: YoutubeLinkCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Saves a YouTube video link isolated to the authenticated user."""
    link = YoutubeLink(
        user_id=current_user.id,
        title=payload.title,
        url=payload.url,
        category=payload.category,
        channel_name=payload.channel_name,
        notes=payload.notes,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.get("", response_model=list[YoutubeLinkResponse])
def list_youtube_links(
    category: str | None = None,
    q: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves all YouTube links saved by the authenticated user."""
    stmt = select(YoutubeLink).where(YoutubeLink.user_id == current_user.id)

    if category and category != "all":
        stmt = stmt.where(YoutubeLink.category == category)

    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                YoutubeLink.title.ilike(term),
                YoutubeLink.notes.ilike(term),
                YoutubeLink.channel_name.ilike(term),
            )
        )

    stmt = stmt.order_by(YoutubeLink.created_at.desc(), YoutubeLink.id.desc())
    return db.scalars(stmt).all()


@router.get("/{link_id}", response_model=YoutubeLinkResponse)
def get_youtube_link(
    link_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    link = db.get(YoutubeLink, link_id)
    if not link or link.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    return link


@router.put("/{link_id}", response_model=YoutubeLinkResponse)
def update_youtube_link(
    link_id: int,
    payload: YoutubeLinkUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    link = db.get(YoutubeLink, link_id)
    if not link or link.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, val in updates.items():
        setattr(link, field, val)

    db.commit()
    db.refresh(link)
    return link


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_youtube_link(
    link_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    link = db.get(YoutubeLink, link_id)
    if not link or link.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    db.delete(link)
    db.commit()
