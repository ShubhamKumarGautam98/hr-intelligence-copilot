from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api import documents, chat
from app.core.database import init_db
from app.core.rag_engine import get_embeddings, get_reranker, get_vectorstore
import os

app = FastAPI(
    title="HR Intelligence Copilot",
    description="AI-powered enterprise knowledge assistant for HR documents",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])

@app.on_event("startup")
async def startup():
    init_db()
    print("⏳ Pre-loading embedding model...")
    get_embeddings()
    print("⏳ Pre-loading cross-encoder reranker...")
    get_reranker()
    print("⏳ Warming up vector store connection...")
    get_vectorstore()
    print("✅ All models loaded — server is ready")

@app.get("/health")
async def health():
    return {"status": "healthy"}

# Serve React frontend static files
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")),
        name="assets"
    )

    @app.get("/")
    async def serve_root():
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
else:
    @app.get("/")
    async def root():
        return {
            "message": "HR Intelligence Copilot API",
            "version": "1.0.0",
            "status": "running"
        }