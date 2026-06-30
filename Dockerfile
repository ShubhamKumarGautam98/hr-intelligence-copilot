# ── Stage 1: build the React frontend ────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./
RUN npm run build
# Output lands in /app/frontend/dist


# ── Stage 2: Python backend + built frontend ─────────────────────
FROM python:3.12-slim

WORKDIR /app

# System deps needed by chromadb / sentence-transformers at build time
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY main.py .
COPY app/ ./app/

# Built frontend from stage 1 — main.py serves this as static files
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Render/Railway inject PORT at runtime; default to 8000 for local docker run
ENV PORT=8000
EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
