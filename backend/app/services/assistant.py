"""Ask MEMORA Assistant Service.

Rule-based query understanding and conversational assistant for life admin questions.
Does not require paid LLM APIs. Can be seamlessly upgraded with local Hugging Face / Ollama.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.document import Document
from app.schemas.document import DocumentResponse


def ask_memora(query: str, db: Session) -> Dict[str, Any]:
    """Processes user query and returns structured conversational answer."""
    q = query.strip().lower()
    now = datetime.now()

    # 1. Overdue tasks
    if any(k in q for k in ["overdue", "past due", "delayed", "missed deadline"]):
        stmt = (
            select(Document)
            .where(func.upper(Document.action_status) != "COMPLETED")
            .where(
                or_(
                    (Document.action_due_date.is_not(None)) & (Document.action_due_date < now),
                    (Document.action_due_date.is_(None))
                    & (Document.expiry_date.is_not(None))
                    & (Document.expiry_date < now),
                )
            )
            .order_by(Document.expiry_date.asc())
        )
        docs = db.scalars(stmt).all()
        if docs:
            items = [f"• {d.action or d.title} (Doc: {d.file_name})" for d in docs]
            reply = f"You have {len(docs)} overdue task(s):\n" + "\n".join(items)
        else:
            reply = "Great news! You have no overdue tasks right now."
        return {
            "reply": reply,
            "intent": "overdue_tasks",
            "matching_documents": [DocumentResponse.model_validate(d) for d in docs],
            "count": len(docs),
        }

    # 2. What do I need to do this week / upcoming
    if any(k in q for k in ["this week", "upcoming", "what do i need to do", "next few days", "to do"]):
        week_end = now + timedelta(days=7)
        stmt = (
            select(Document)
            .where(Document.action_status.in_(["Pending", "In Progress"]))
            .where(
                or_(
                    (Document.action_due_date.is_not(None)) & (Document.action_due_date <= week_end),
                    (Document.expiry_date.is_not(None)) & (Document.expiry_date <= week_end),
                    (Document.remind_at.is_not(None)) & (Document.remind_at <= week_end),
                )
            )
            .order_by(Document.action_due_date.asc(), Document.expiry_date.asc())
        )
        docs = db.scalars(stmt).all()
        if not docs:
            # Fallback to all pending actions if none specifically due this week
            stmt_all = (
                select(Document)
                .where(Document.action_status.in_(["Pending", "In Progress"]))
                .where(Document.action.is_not(None))
            )
            docs = db.scalars(stmt_all).all()

        if docs:
            items = [f"• {d.action or d.title} [Status: {d.action_status}]" for d in docs]
            reply = f"Here is what's on your agenda ({len(docs)} item(s)):\n" + "\n".join(items)
        else:
            reply = "You have no pending tasks scheduled for this week!"
        return {
            "reply": reply,
            "intent": "weekly_actions",
            "matching_documents": [DocumentResponse.model_validate(d) for d in docs],
            "count": len(docs),
        }

    # 3. Documents expiring soon
    if any(k in q for k in ["expir", "renewal", "validity"]):
        month_end = now + timedelta(days=30)
        stmt = (
            select(Document)
            .where(Document.expiry_date.is_not(None))
            .where(Document.expiry_date <= month_end)
            .order_by(Document.expiry_date.asc())
        )
        docs = db.scalars(stmt).all()
        if docs:
            items = [
                f"• {d.title} (Expires: {d.expiry_date.strftime('%d %b %Y') if d.expiry_date else 'Soon'})"
                for d in docs
            ]
            reply = f"Found {len(docs)} document(s) expiring within 30 days:\n" + "\n".join(items)
        else:
            # List all documents with any expiry date
            stmt_any = (
                select(Document)
                .where(Document.expiry_date.is_not(None))
                .order_by(Document.expiry_date.asc())
            )
            all_exp = db.scalars(stmt_any).all()
            if all_exp:
                items = [
                    f"• {d.title} (Expires: {d.expiry_date.strftime('%d %b %Y') if d.expiry_date else 'Unknown'})"
                    for d in all_exp[:5]
                ]
                reply = "No documents are expiring within 30 days. Here are your tracked expirations:\n" + "\n".join(items)
                docs = all_exp
            else:
                reply = "No documents currently have an expiration date configured."
                docs = []
        return {
            "reply": reply,
            "intent": "expiring_documents",
            "matching_documents": [DocumentResponse.model_validate(d) for d in docs],
            "count": len(docs),
        }

    # 4. Important documents with reminders
    if "important" in q and any(k in q for k in ["reminder", "remind"]):
        stmt = (
            select(Document)
            .where(Document.is_important.is_(True))
            .where(Document.remind_at.is_not(None))
            .order_by(Document.remind_at.asc())
        )
        docs = db.scalars(stmt).all()
        if docs:
            items = [
                f"• ⭐ {d.title} (Reminder set for: {d.remind_at.strftime('%d %b %Y %H:%M') if d.remind_at else 'Active'})"
                for d in docs
            ]
            reply = f"You have {len(docs)} important document(s) with reminders configured:\n" + "\n".join(items)
        else:
            reply = "You don't have any important documents with active reminders set."
        return {
            "reply": reply,
            "intent": "important_reminders",
            "matching_documents": [DocumentResponse.model_validate(d) for d in docs],
            "count": len(docs),
        }

    # 5. Pending actions
    if any(k in q for k in ["pending action", "show my pending", "pending task"]):
        stmt = (
            select(Document)
            .where(Document.action_status.in_(["Pending", "In Progress"]))
            .order_by(Document.is_important.desc(), Document.updated_at.desc())
        )
        docs = db.scalars(stmt).all()
        if docs:
            items = [f"• {d.action or d.title} ({d.category})" for d in docs]
            reply = f"You have {len(docs)} pending action(s):\n" + "\n".join(items)
        else:
            reply = "All actions are completed or none are currently pending!"
        return {
            "reply": reply,
            "intent": "pending_actions",
            "matching_documents": [DocumentResponse.model_validate(d) for d in docs],
            "count": len(docs),
        }

    # 6. Category queries (e.g. college, study, medical, finance, personal)
    category_map = {
        "college": "study",
        "study": "study",
        "student": "study",
        "medical": "health",
        "health": "health",
        "finance": "finance",
        "financial": "finance",
        "money": "finance",
        "personal": "personal",
        "work": "work",
        "job": "work",
    }
    found_cat = None
    for term, cat in category_map.items():
        if term in q:
            found_cat = cat
            break

    if found_cat:
        stmt = select(Document).where(Document.category == found_cat).order_by(Document.created_at.desc())
        docs = db.scalars(stmt).all()
        if docs:
            items = [f"• {d.title} ({d.file_name})" for d in docs]
            reply = f"Found {len(docs)} document(s) in category '{found_cat}':\n" + "\n".join(items)
        else:
            reply = f"No documents found under category '{found_cat}'."
        return {
            "reply": reply,
            "intent": f"category_{found_cat}",
            "matching_documents": [DocumentResponse.model_validate(d) for d in docs],
            "count": len(docs),
        }

    # 7. General search fallback across title, description, filename, action
    search_term = q.replace("show", "").replace("find", "").replace("search", "").replace("what", "").replace("which", "").strip()
    if search_term:
        pattern = f"%{search_term}%"
        stmt = (
            select(Document)
            .where(
                or_(
                    Document.title.ilike(pattern),
                    Document.description.ilike(pattern),
                    Document.file_name.ilike(pattern),
                    Document.action.ilike(pattern),
                    Document.category.ilike(pattern),
                )
            )
            .order_by(Document.is_important.desc(), Document.created_at.desc())
        )
        docs = db.scalars(stmt).all()
        if docs:
            items = [f"• {d.title} ({d.file_name})" for d in docs]
            reply = f"I found {len(docs)} document(s) matching '{search_term}':\n" + "\n".join(items)
        else:
            reply = f"I couldn't find any documents matching '{search_term}'. Try checking the spellings or asking about upcoming deadlines or categories."
        return {
            "reply": reply,
            "intent": "search",
            "matching_documents": [DocumentResponse.model_validate(d) for d in docs],
            "count": len(docs),
        }

    # Fallback greeting / capabilities
    stmt_total = select(Document)
    all_docs = db.scalars(stmt_total).all()
    pending = sum(1 for d in all_docs if d.action_status == "Pending")
    reply = (
        f"You have {len(all_docs)} total document(s) and {pending} pending action(s). "
        "You can ask me things like:\n"
        "• 'What documents are expiring soon?'\n"
        "• 'What do I need to do this week?'\n"
        "• 'Which important documents have reminders?'\n"
        "• 'Show my pending actions'\n"
        "• 'Which documents belong to college?'\n"
        "• 'Do I have any overdue tasks?'"
    )
    return {
        "reply": reply,
        "intent": "general_info",
        "matching_documents": [DocumentResponse.model_validate(d) for d in all_docs[:5]],
        "count": len(all_docs),
    }
