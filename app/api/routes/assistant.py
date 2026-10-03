from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.document import DocumentResponse
from app.services.assistant import ask_memora

router = APIRouter(tags=["assistant"])


class AssistantQueryRequest(BaseModel):
    query: str


class AssistantQueryResponse(BaseModel):
    reply: str
    intent: str
    matching_documents: list[DocumentResponse]
    count: int


@router.post("/assistant/ask", response_model=AssistantQueryResponse)
def handle_assistant_query(
    payload: AssistantQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Processes user query and answers life admin questions with matching documents isolated to user."""
    result = ask_memora(query=payload.query, db=db, user_id=current_user.id)
    return result
