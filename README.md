# HR Intelligence Copilot

An AI-powered knowledge assistant that lets HR teams upload company documents — policies, contracts, handbooks — and get accurate, cited answers to natural-language questions in seconds, instead of digging through PDFs manually.

Ask *"What's our parental leave policy?"* and get a precise answer with the source document named, not a generic AI guess.

**Live demo:** [hr-intelligence-copilot-production.up.railway.app](https://hr-intelligence-copilot-production.up.railway.app)
**Source:** [github.com/ShubhamKumarGautam98/hr-intelligence-copilot](https://github.com/ShubhamKumarGautam98/hr-intelligence-copilot)

---

## What This Solves

HR teams sit on hundreds of pages of policy documents that employees rarely read and HR staff can't instantly search. Keyword search (Ctrl+F) misses paraphrased questions. Plain LLM chatbots hallucinate policy details with total confidence. This project combines both retrieval styles, filters the results through a reranker for precision, and adds a human approval step before anything sensitive reaches the requester — so answers are fast, grounded in real documents, and safe for topics like salary or termination.

---

## The Retrieval Pipeline

Most RAG demos stop at "embed and search." This one runs a three-stage pipeline before an answer is ever generated, because vector search alone is unreliable for exact terms (policy names, numbers, acronyms) and keyword search alone misses paraphrasing.

```
                    ┌─────────────────────┐
                    │   User Question      │
                    └──────────┬───────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                  ▼
   ┌─────────────────────┐          ┌─────────────────────────┐
   │  STAGE 1a: BM25       │          │  STAGE 1b: Vector Search │
   │  Keyword Search        │          │  (ChromaDB + MiniLM)     │
   │  — exact terms, IDs,   │          │  — semantic meaning,     │
   │  policy names           │          │  paraphrased questions   │
   └───────────┬─────────┘          └────────────┬────────────┘
               │                                  │
               └────────────────┬─────────────────┘
                                 ▼
                  ┌───────────────────────────────┐
                  │  Reciprocal Rank Fusion (RRF)   │
                  │  merges both ranked lists into   │
                  │  a single candidate set (top 10) │
                  └────────────────┬──────────────┘
                                   ▼
                  ┌───────────────────────────────┐
                  │  STAGE 2: Cross-Encoder Rerank  │
                  │  ms-marco-MiniLM-L-6-v2          │
                  │  scores each candidate against    │
                  │  the actual question → top 5      │
                  └────────────────┬──────────────┘
                                   ▼
                  ┌───────────────────────────────┐
                  │  STAGE 3: Sensitivity Gate       │
                  │  salary / termination / legal /  │
                  │  personal data → amber approval   │
                  │  card shown before the answer      │
                  └────────────────┬──────────────┘
                                   ▼
                        ┌─────────────────────┐
                        │  Groq (Llama 3.1)     │
                        │  generates cited        │
                        │  answer                 │
                        └─────────────────────┘
```

**Why three stages instead of one?**

| Stage | Problem it solves alone | Why it's not enough by itself |
|---|---|---|
| BM25 keyword search | Exact matches on policy names, numbers, section codes | Misses paraphrased or conversational questions |
| Vector similarity search | Understands meaning and paraphrasing | Can surface semantically-close but factually-wrong chunks |
| RRF fusion | Combines both without needing to tune a blend weight | — |
| Cross-encoder reranking | Directly compares question ↔ chunk (more accurate than embedding similarity) | Too slow to run on the whole corpus, so it only re-scores the top 10 candidates from fusion |
| Sensitivity gate | Prevents an AI-generated answer on high-stakes topics from reaching someone unreviewed | — |

---

## Features

| Feature | What it does |
|---|---|
| **Document upload** | Drag-and-drop PDF, Word (.docx), and TXT ingestion with type/size validation |
| **Hybrid search** | BM25 + semantic vector search, merged with Reciprocal Rank Fusion |
| **Cross-encoder reranking** | Re-scores the top 10 fused candidates down to the most relevant 5 using `ms-marco-MiniLM-L-6-v2` |
| **Human-in-the-loop gates** | Questions touching salary, termination, personal data, or legal topics surface an amber approval card before the answer is released |
| **Conversation memory** | Per-session chat history stored in SQLite, fed back into the LLM for context-aware follow-ups |
| **Source citations** | Every answer names the exact document(s) it was drawn from |
| **Query cache** | Repeated/duplicate questions are served instantly without re-running retrieval or the LLM |
| **Startup model preloading** | Embedding and reranker models load once at server startup, so the first real user request isn't slow |
| **Optimistic UI delete** | Document removal reflects instantly in the UI while the backend deletion completes in the background |

---

## Tech Stack

| Layer | Technology | Why this choice |
|---|---|---|
| Backend framework | **FastAPI** | Async-first, automatic OpenAPI docs, minimal boilerplate for a small team to move fast |
| LLM | **Groq API — Llama 3.1** | Groq's inference speed makes multi-stage pipelines (retrieve → rerank → generate) feel instant; free tier avoids OpenAI cost during development |
| Embeddings | **HuggingFace `all-MiniLM-L6-v2`** | Runs locally, no per-call cost, small enough to preload at startup, strong accuracy-to-size ratio for semantic search |
| Vector database | **ChromaDB** | Embedded, file-based, zero external infra to run locally or in a small container — right-sized for document volumes this project targets |
| Keyword search | **rank-bm25** | Lightweight, dependency-free BM25 implementation — no need for a separate search engine like Elasticsearch at this scale |
| Reranker | **sentence-transformers CrossEncoder (`ms-marco-MiniLM-L-6-v2`)** | Cross-encoders score query-document pairs jointly, which is meaningfully more accurate than cosine similarity alone, at the cost of only running it on a small candidate set |
| Memory / metadata | **SQLite + SQLAlchemy** | Zero-config relational storage for chat history and document metadata; easy to swap for Postgres later without rewriting the ORM layer |
| Frontend | **React + Vite + Tailwind CSS** | Fast dev server, component-driven UI, utility-first styling with no custom CSS files to maintain |
| Deployment | **Railway** | Simple git-push deploys, free tier sufficient for a demo-scale document assistant |

---

## Architecture

```
hr-intelligence-copilot/
├── main.py                     # FastAPI app entrypoint, router registration
├── .env                        # GROQ_API_KEY and other secrets (not committed)
├── app/
│   ├── core/
│   │   ├── database.py         # SQLAlchemy models: Document, ChatMemory
│   │   └── rag_engine.py       # Retrieval pipeline: BM25, vector search, RRF, reranking, generation
│   └── api/
│       ├── documents.py        # /api/documents — upload, list, delete
│       └── chat.py             # /api/chat — ask, history, sessions
└── frontend/                   # React + Vite + Tailwind client
```

**API surface:**

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/documents/upload` | POST | Upload and process a document into the knowledge base |
| `/api/documents/` | GET | List all uploaded documents and their status |
| `/api/documents/{id}` | DELETE | Remove a document and its vector chunks |
| `/api/documents/stats` | GET | Knowledge base statistics (doc count, chunk count) |
| `/api/chat/ask` | POST | Ask a question; runs the full retrieval pipeline |
| `/api/chat/history/{session_id}` | GET | Retrieve conversation history for a session |
| `/api/chat/history/{session_id}` | DELETE | Clear a session's history |
| `/api/chat/sessions` | GET | List all active chat sessions |

---

## Setup Guide

### Prerequisites
- Python 3.10+
- Node.js 18+ (for the frontend)
- A free [Groq API key](https://console.groq.com)

### 1. Clone the repository
```bash
git clone https://github.com/ShubhamKumarGautam98/hr-intelligence-copilot.git
cd hr-intelligence-copilot
```

### 2. Backend setup
```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

Create a `.env` file in the project root:
```env
GROQ_API_KEY=your_groq_api_key_here
```

Run the backend:
```bash
uvicorn main:app --reload --port 8000
```

The API will be live at `http://localhost:8000`, with interactive docs at `http://localhost:8000/docs`.

### 3. Frontend setup
```bash
cd frontend
npm install
npm run dev
```

The frontend will be live at `http://localhost:5173`.

### 4. First run
On startup, the embedding model and cross-encoder reranker are preloaded (this takes 1–2 minutes the very first time as they download). Once you see `✅ Database initialised` and the model-loaded logs, upload a document and start asking questions.

---

## Roadmap

- [x] Document upload with drag-and-drop
- [x] Hybrid BM25 + vector search with RRF fusion
- [x] Cross-encoder reranking
- [x] Human-in-the-loop approval gates for sensitive topics
- [x] Conversation memory and source citations
- [x] Query caching and startup model preloading
- [ ] **Feature 4 — LangGraph orchestration** *(next up)*: replace the current linear pipeline with a LangGraph state machine to support branching flows — e.g. automatic clarifying questions when a query is ambiguous, retries when retrieval confidence is low, and a cleaner separation between the retrieval, gating, and generation nodes
- [ ] Role-based access control (HR admin vs. employee views)
- [ ] Multi-document comparison answers ("How does this differ from the 2023 policy?")
- [ ] Analytics dashboard for most-asked questions and gate trigger rates

---
