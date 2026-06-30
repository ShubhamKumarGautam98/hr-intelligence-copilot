import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api import documents, chat
from app.core.database import init_db

app = FastAPI(
    title="HR Intelligence Copilot",
    description="AI-powered enterprise knowledge assistant for HR documents",
    version="1.0.0"
)

# CORS — only needed when running the Vite dev server separately on :5173.
# In production the frontend is served from this same FastAPI process, so
# requests are same-origin and CORS doesn't apply, but leaving this enabled
# is harmless and keeps local development working unchanged.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers — registered before the static file mount so /api/* always
# resolves to these routes rather than falling through to the SPA fallback
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/health")
async def health():
    """Used by Render/Railway to confirm the service is alive."""
    return {"status": "healthy"}


# ── Serve the built React frontend ──────────────────────────────
# `npm run build` in /frontend produces /frontend/dist. We mount that
# directory's static assets (JS/CSS/images) and add a catch-all route so
# client-side routing works correctly on a full page refresh.
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """
        Catch-all that returns index.html for any non-API route.
        This lets the React app handle its own client-side routing —
        without it, refreshing the browser on a deep link would 404.
        """
        index_path = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index_path)
else:
    @app.get("/")
    async def root():
        """Fallback API-only response — shown if the frontend hasn't been built yet."""
        return {
            "message": "HR Intelligence Copilot API",
            "version": "1.0.0",
            "status": "running",
            "note": "Frontend not built — run 'npm run build' inside /frontend",
        }