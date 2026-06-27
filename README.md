# 🧠 HR Intelligence Copilot

> AI-powered enterprise knowledge assistant — ask your HR documents anything, get accurate answers with source citations.

**🚧 Status: Actively in Development**

---

## 💡 What Is This?

HR Intelligence Copilot is an AI assistant that lets employees and HR managers ask questions in plain English and get accurate answers directly from company documents — with citations showing exactly which document and section the answer came from.

**No more searching through 50-page policy PDFs.**
**No more asking HR the same questions repeatedly.**

Upload your documents once. Ask anything. Get instant, accurate answers.

---

## 🎯 The Problem It Solves

Every company has knowledge scattered across dozens of documents:

- HR policies and employee handbooks
- Leave and attendance policies
- Payroll guides and salary structures
- Compliance documents and SOPs
- Onboarding materials and training guides

Employees waste hours searching through them — or worse, ask HR teams who then have to search through the same documents manually.

**HR Intelligence Copilot eliminates this entirely.**

---

## ✨ Features

| Feature | Description |
|---|---|
| 📄 **Document Upload** | Upload PDF, Word (.docx), TXT, and Markdown files |
| 🧠 **AI Understanding** | Documents split into chunks and converted to semantic vectors |
| 💬 **Natural Language Q&A** | Ask questions the way you'd ask a colleague |
| 📌 **Source Citations** | Every answer shows exactly which document it came from |
| 🧠 **Conversation Memory** | Follow-up questions work naturally — AI remembers context |
| 🗂️ **Categories** | Organise documents by department (HR, Finance, Legal, etc.) |
| 🗑️ **Document Management** | Add and remove documents from the knowledge base |
| 📊 **Admin Dashboard** | See uploaded documents, chunk counts, and system stats |

---

## 🔧 How It Works

```
You upload a PDF or Word document
            ↓
System extracts and cleans the text
            ↓
Text is split into small chunks (800 characters each)
            ↓
Each chunk is converted to a vector embedding
(a list of numbers that represent the meaning of the text)
            ↓
Vectors stored in ChromaDB (local vector database)
            ↓
You ask a question in plain English
            ↓
Question is converted to a vector
            ↓
System finds the 5 most semantically similar chunks
            ↓
Chunks sent to Llama 3.1 (via Groq API) as context
            ↓
AI generates an accurate answer using only those chunks
            ↓
Answer returned with source document names
            ↓
Conversation saved to memory for follow-up questions
```

This technique is called **RAG — Retrieval Augmented Generation**.
It ensures the AI only answers from your actual documents, not from general internet knowledge.

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Backend** | FastAPI (Python) | Fast, modern, auto-generates API docs |
| **LLM** | Groq API + Llama 3.1 | Free, extremely fast inference |
| **Embeddings** | HuggingFace sentence-transformers | Free, runs locally, no API cost |
| **Vector Database** | ChromaDB | Free, local, no setup required |
| **Conversation Memory** | SQLite + SQLAlchemy | Lightweight, persistent session storage |
| **Document Parsing** | pypdf + python-docx | PDF and Word file support |
| **Frontend** | React + Vite + Tailwind CSS | Fast, modern UI (in development) |
| **Deployment** | Railway / Render | Free tier hosting |

**Total infrastructure cost: ₹0**

---

## 🏗️ Architecture

```
hr-intelligence-copilot/
├── main.py                      # FastAPI app + CORS + router registration
├── .env                         # GROQ_API_KEY (never committed)
├── requirements.txt
├── chroma_db/                   # Vector store (auto-created)
├── uploads/                     # Uploaded documents (auto-created)
├── app/
│   ├── core/
│   │   ├── database.py          # SQLite models + session management
│   │   └── rag_engine.py        # RAG pipeline (embeddings + retrieval + LLM)
│   └── api/
│       ├── documents.py         # Upload / list / delete documents
│       └── chat.py              # Ask questions + conversation memory
└── frontend/                    # React app (in development)
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── hooks/
    │   └── utils/
    └── package.json
```

---

## 🚀 Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+ (for frontend)
- Free Groq API key from [console.groq.com](https://console.groq.com)

### Backend Setup

```bash
# Clone the repository
git clone https://github.com/ShubhamKumarGautam98/hr-intelligence-copilot.git
cd hr-intelligence-copilot

# Create virtual environment
python -m venv venv
venv\Scripts\activate       # Windows
source venv/bin/activate    # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Create .env file
echo GROQ_API_KEY=your_groq_key_here > .env

# Start the server
uvicorn main:app --reload
```

Backend runs at [http://localhost:8000](http://localhost:8000)

API documentation at [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend Setup (Coming Soon)

```bash
cd frontend
npm install
npm run dev
```

Frontend will run at [http://localhost:5173](http://localhost:5173)

---

## 🧪 Testing the API

Once the server is running, go to [http://localhost:8000/docs](http://localhost:8000/docs)

### Test 1 — Upload a Document
- Go to `POST /api/documents/upload`
- Upload any PDF or Word file
- Set a category (e.g. "HR Policy")
- Click Execute

### Test 2 — Ask a Question
- Go to `POST /api/chat/ask`
- Enter your question in the `question` field
- Click Execute
- See the answer + source documents

### Test 3 — Check Stats
- Go to `GET /api/documents/stats`
- See total documents and chunks in the knowledge base

---

## 🗺️ Roadmap

### Phase 1 — Backend (✅ Complete)
- [x] FastAPI server setup
- [x] Document upload and processing pipeline
- [x] ChromaDB vector storage
- [x] RAG query engine
- [x] Conversation memory per session
- [x] Document management (list, delete)

### Phase 2 — Frontend (🚧 In Progress)
- [ ] React app shell and routing
- [ ] Document upload interface
- [ ] Chat interface with message history
- [ ] Document library management
- [ ] Admin dashboard with stats

### Phase 3 — Advanced Features (📋 Planned)
- [ ] JWT authentication and user roles
- [ ] Multi-tenant support (separate knowledge bases per team)
- [ ] Hybrid search (semantic + keyword)
- [ ] Document summarisation
- [ ] PostgreSQL migration for production
- [ ] Docker deployment
- [ ] Deploy to Railway / Render

---

## 🧠 What I Learned Building This

- **RAG Architecture** — how to build a production retrieval pipeline with LangChain, ChromaDB, and HuggingFace embeddings
- **FastAPI** — async endpoints, dependency injection, file uploads, CORS
- **Vector Databases** — how embeddings work, semantic search vs keyword search
- **Groq API** — using Llama 3.1 as a free, fast alternative to OpenAI
- **LangChain** — prompt templates, chains, retrievers, document loaders

---

## 📬 Contact

**Shubham Kumar** — AI Automation Developer

- 🌐 [Portfolio](https://shubham-kumar.vercel.app)
- 💼 [LinkedIn](https://linkedin.com/in/shubham-kumar-395b89386)
- 🐙 [GitHub](https://github.com/ShubhamKumarGautam98)
- 📧 shubhamkmmmr@gmail.com

---

<p align="center">Built with ❤️ using FastAPI + LangChain + ChromaDB + Groq + React</p>