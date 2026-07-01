import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db, ChatMemory
from app.core.rag_engine import query_documents

router = APIRouter()


# ── Sensitive topic detection ───────────────────────────────────

# Each key is the human-readable topic label shown in the UI.
# Each value is a list of substrings; ONE match anywhere in the
# combined question+answer text is enough to flag the topic.
SENSITIVE_KEYWORDS: dict[str, list[str]] = {
    "salary / compensation": [
        "salary", "salaries", "pay", "wage", "wages",
        "compensation", "payroll", "bonus", "increment",
        "raise", "remuneration",
    ],
    "termination": [
        "termination", "terminate", "terminated", "fired",
        "dismissed", "dismiss", "layoff", "laid off", "redundan",
    ],
    "personal data": [
        "personal data", "home address", "phone number",
        "employee email", "date of birth", "private information",
    ],
    "legal / disciplinary": [
        "legal", "lawsuit", "litigation", "complaint",
        "disciplinary", "grievance", "investigation",
        "tribunal", "misconduct",
    ],
    "confidential": [
        "confidential", "restricted", "classified",
    ],
}


def detect_sensitive_topics(
    question: str,
    answer: str
) -> tuple[bool, list[str]]:
    """
    Scan the question and answer together for sensitive HR topics.

    Both texts are checked so that indirect questions (e.g. "what
    happened to John?") that produce sensitive answers are still caught,
    even when the question itself contains no sensitive keywords.

    Returns:
        is_sensitive: True if any topic matched.
        matched_topics: List of topic label strings that matched.
    """
    combined_text = f"{question} {answer}".lower()
    matched_topics: list[str] = []

    for topic_label, keywords in SENSITIVE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in combined_text:
                matched_topics.append(topic_label)
                break  # one keyword match per topic is enough

    return len(matched_topics) > 0, matched_topics


# ── Request / Response models ───────────────────────────────────

class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None
    category: Optional[str] = "All"


class ChatResponse(BaseModel):
    answer: str                              # empty string when pending approval
    sources: list
    session_id: str
    chunks_used: int
    requires_approval: bool = False
    pending_answer: Optional[str] = None    # populated when requires_approval is True
    matched_topics: list[str] = []          # which sensitive topics triggered the gate


class ApprovalRequest(BaseModel):
    session_id: str
    pending_answer: str
    sources: list[str]
    approved: bool


class ApprovalResponse(BaseModel):
    answer: str
    sources: list[str]
    session_id: str
    approved: bool


# ── Endpoints ───────────────────────────────────────────────────

@router.post("/ask", response_model=ChatResponse)
def ask_question(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Ask a question to the HR knowledge base.
    Maintains conversation memory per session.

    For sensitive topics, saves the user question to memory immediately
    but withholds saving the assistant answer until the user explicitly
    approves it via POST /api/chat/approve.
    """
    session_id = request.session_id or str(uuid.uuid4())

    # Get conversation history for this session
    history = (
        db.query(ChatMemory)
        .filter(ChatMemory.session_id == session_id)
        .order_by(ChatMemory.created_at.asc())
        .limit(10)
        .all()
    )

    history_list = [
        {"role": msg.role, "content": msg.content}
        for msg in history
    ]

    # Query RAG engine
    try:
        result = query_documents(
            question=request.question,
            chat_history=history_list,
            category=request.category
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error querying documents: {str(e)}"
        )

    # Detect sensitive topics across question + answer
    is_sensitive, matched_topics = detect_sensitive_topics(
        question=request.question,
        answer=result["answer"]
    )

    # Always save the user's question — this is never gated
    db.add(ChatMemory(
        session_id=session_id,
        role="user",
        content=request.question
    ))
    db.commit()

    if is_sensitive:
        # Do NOT write the assistant answer to memory yet.
        # It will be written (or a rejection note written instead)
        # inside the /approve endpoint once the human decides.
        return ChatResponse(
            answer="",
            sources=result["sources"],
            session_id=session_id,
            chunks_used=result["chunks_used"],
            requires_approval=True,
            pending_answer=result["answer"],
            matched_topics=matched_topics
        )

    # Non-sensitive path — save and return immediately as before
    db.add(ChatMemory(
        session_id=session_id,
        role="assistant",
        content=result["answer"]
    ))
    db.commit()

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
        session_id=session_id,
        chunks_used=result["chunks_used"],
        requires_approval=False,
        matched_topics=[]
    )


@router.post("/approve", response_model=ApprovalResponse)
def approve_answer(request: ApprovalRequest, db: Session = Depends(get_db)):
    """
    Human-in-the-loop approval gate.

    Approved: saves the assistant answer to ChatMemory so it becomes
    part of future conversation context, then returns it to the frontend
    for display with an amber 'human-approved' indicator.

    Rejected: saves a rejection notice to ChatMemory (so the session
    history stays coherent) and returns a standard message prompting
    the user to rephrase or contact HR directly.
    """
    if request.approved:
        db.add(ChatMemory(
            session_id=request.session_id,
            role="assistant",
            content=request.pending_answer
        ))
        db.commit()

        return ApprovalResponse(
            answer=request.pending_answer,
            sources=request.sources,
            session_id=request.session_id,
            approved=True
        )

    # Rejected path
    rejection_message = (
        "Response rejected. Please rephrase your question "
        "or contact HR directly."
    )
    db.add(ChatMemory(
        session_id=request.session_id,
        role="assistant",
        content=rejection_message
    ))
    db.commit()

    return ApprovalResponse(
        answer=rejection_message,
        sources=[],
        session_id=request.session_id,
        approved=False
    )


@router.get("/history/{session_id}")
def get_history(session_id: str, db: Session = Depends(get_db)):
    """Get conversation history for a session."""
    messages = (
        db.query(ChatMemory)
        .filter(ChatMemory.session_id == session_id)
        .order_by(ChatMemory.created_at.asc())
        .all()
    )

    return {
        "session_id": session_id,
        "messages": [
            {
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at.isoformat()
            }
            for msg in messages
        ],
        "total": len(messages)
    }


@router.delete("/history/{session_id}")
def clear_history(session_id: str, db: Session = Depends(get_db)):
    """Clear conversation history for a session."""
    db.query(ChatMemory)\
        .filter(ChatMemory.session_id == session_id)\
        .delete()
    db.commit()
    return {"success": True, "message": "Conversation history cleared"}


@router.get("/sessions")
def list_sessions(db: Session = Depends(get_db)):
    """List all active chat sessions."""
    sessions = db.query(ChatMemory.session_id).distinct().all()
    return {
        "sessions": [s[0] for s in sessions],
        "total": len(sessions)
    }