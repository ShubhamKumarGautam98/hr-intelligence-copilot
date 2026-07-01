from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import documents, chat
from app.core.database import init_db
from app.core.rag_engine import get_embeddings, get_reranker, get_vectorstore

app = FastAPI(
    title="HR Intelligence Copilot",
    description="AI-powered enterprise knowledge assistant for HR documents",
    version="1.0.0"
)

# CORS — allow React frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])


@app.on_event("startup")
async def startup():
    """
    Initialise all resources at startup so the first user request
    is not penalised by model loading time.

    Without this, the first POST /api/chat/ask takes 60-90 seconds
    as both the embedding model and the cross-encoder reranker download
    and load into memory. Moving this to startup means the server logs
    show the delay clearly, and every request after that is fast.
    """
    init_db()
    print("⏳ Pre-loading embedding model...")
    get_embeddings()
    print("⏳ Pre-loading cross-encoder reranker...")
    get_reranker()
    print("⏳ Warming up vector store connection...")
    get_vectorstore()
    print("✅ All models loaded — server is ready to accept requests")


@app.get("/")
async def root():
    return {
        "message": "HR Intelligence Copilot API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}