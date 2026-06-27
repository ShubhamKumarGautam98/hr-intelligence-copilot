import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db, ChatMemory
from app.core.rag_engine import query_documents

router = APIRouter()


class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None
    category: Optional[str] = "All"


class ChatResponse(BaseModel):
    answer: str
    sources: list
    session_id: str
    chunks_used: int


@router.post("/ask", response_model=ChatResponse)
def ask_question(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Ask a question to the HR knowledge base.
    Maintains conversation memory per session.
    """
    # Generate session ID if not provided
    session_id = request.session_id or str(uuid.uuid4())

    # Get the most recent 6 messages (3 exchanges) for this session.
    # Ordering DESC then reversing guarantees we always get the latest context,
    # not the oldest — which matters once a conversation grows past 6 messages.
    # The limit matches the slice in rag_engine.query_documents so we never
    # fetch rows that are immediately discarded.
    history = db.query(ChatMemory)\
        .filter(ChatMemory.session_id == session_id)\
        .order_by(ChatMemory.created_at.desc())\
        .limit(6)\
        .all()

    history_list = [
        {"role": msg.role, "content": msg.content}
        for msg in reversed(history)
    ]

    # Query RAG engine
    try:
        result = query_documents(
            question=request.question,
            chat_history=history_list,
            category=request.category
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error querying documents: {str(e)}")

    # Save to memory
    db.add(ChatMemory(
        session_id=session_id,
        role="user",
        content=request.question
    ))
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
        chunks_used=result["chunks_used"]
    )


@router.get("/history/{session_id}")
def get_history(session_id: str, db: Session = Depends(get_db)):
    """Get conversation history for a session."""
    messages = db.query(ChatMemory)\
        .filter(ChatMemory.session_id == session_id)\
        .order_by(ChatMemory.created_at.asc())\
        .all()

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
    sessions = db.query(ChatMemory.session_id)\
        .distinct()\
        .all()
    return {
        "sessions": [s[0] for s in sessions],
        "total": len(sessions)
    }