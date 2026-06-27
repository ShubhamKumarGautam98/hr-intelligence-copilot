import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db, Document
from app.core.rag_engine import process_document, delete_document_from_vectorstore, get_vectorstore_stats

router = APIRouter()

UPLOAD_DIR = "./uploads"
ALLOWED_TYPES = {"pdf", "docx", "txt", "md"}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    category: str = Form(default="General"),
    db: Session = Depends(get_db)
):
    """Upload and process a document into the knowledge base."""

    # Validate file type
    file_ext = file.filename.rsplit(".", 1)[-1].lower()
    if file_ext not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type .{file_ext} not supported. Allowed: {', '.join(ALLOWED_TYPES)}"
        )

    # Sanitise the filename before touching the filesystem.
    # os.path.basename() strips any directory components so that a filename
    # like "../../main.py" becomes just "main.py", preventing path traversal.
    # The UUID prefix guarantees uniqueness even when two users upload files
    # with identical names — this also fixes the silent-overwrite collision bug.
    safe_basename = os.path.basename(file.filename)
    if not safe_basename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    safe_filename = f"{uuid.uuid4().hex}_{safe_basename}"

    # Save file
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    with open(file_path, "wb") as f:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 25MB.")
        f.write(content)

    # Create DB record — safe_filename is the internal identifier used for all
    # filesystem and vectorstore operations. The original file.filename is only
    # used in the user-facing success message below.
    doc = Document(
        filename=safe_filename,
        file_type=file_ext,
        category=category,
        status="processing"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Process document — safe_filename must match what's stored on disk and
    # what will be recorded in ChromaDB metadata for later deletion to work.
    try:
        chunk_count = process_document(file_path, safe_filename, category)
        doc.chunk_count = chunk_count
        doc.status = "ready"
        db.commit()

        return {
            "success": True,
            "message": f"Document '{file.filename}' processed successfully",
            "document_id": doc.id,
            "chunks_created": chunk_count,
            "category": category
        }

    except Exception as e:
        doc.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


@router.get("/")
def list_documents(db: Session = Depends(get_db)):
    """List all uploaded documents."""
    docs = db.query(Document).order_by(Document.uploaded_at.desc()).all()
    return {
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "file_type": d.file_type,
                "category": d.category,
                "chunk_count": d.chunk_count,
                "status": d.status,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None
            }
            for d in docs
        ],
        "total": len(docs)
    }


@router.delete("/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db)):
    """Delete a document from the knowledge base."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove from vector store
    delete_document_from_vectorstore(doc.filename)

    # Remove file
    file_path = os.path.join(UPLOAD_DIR, doc.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    # Remove from DB
    db.delete(doc)
    db.commit()

    return {"success": True, "message": f"Document '{doc.filename}' deleted"}


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Get knowledge base statistics."""
    total_docs = db.query(Document).count()
    ready_docs = db.query(Document).filter(Document.status == "ready").count()
    vs_stats = get_vectorstore_stats()

    return {
        "total_documents": total_docs,
        "ready_documents": ready_docs,
        "total_chunks": vs_stats["total_chunks"]
    }