import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LangchainDoc
from langchain_core.prompts import ChatPromptTemplate
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder
import pypdf
import docx

load_dotenv()

# ── Constants ──────────────────────────────────────────────────
CHROMA_PATH     = "./chroma_db"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
GROQ_MODEL      = "llama-3.1-8b-instant"
RRF_K           = 60
RERANKER_MODEL  = "cross-encoder/ms-marco-MiniLM-L-6-v2"
CACHE_MAX_SIZE  = 100  # max number of cached query results to keep in memory

# ── Singleton clients ──────────────────────────────────────────
_embeddings  = None
_vectorstore = None
_llm         = None
_reranker    = None

# ── BM25 index cache ───────────────────────────────────────────
_bm25_index       = None
_bm25_corpus: list[LangchainDoc] = []
_bm25_chunk_count = None

# ── Query response cache ───────────────────────────────────────
# Keyed on (question_lowercase, category) so that "What is leave policy?"
# and "what is leave policy?" hit the same cache entry.
# Cleared entirely whenever the knowledge base changes (document added or deleted)
# to prevent stale answers from being served after an update.
_query_cache: dict[tuple[str, str], dict] = {}


def _make_cache_key(question: str, category: str | None) -> tuple[str, str]:
    """Normalise question and category into a consistent cache key."""
    return (question.strip().lower(), (category or "All").strip().lower())


def _get_cached_result(question: str, category: str | None) -> dict | None:
    """Return a cached query result if one exists, otherwise None."""
    return _query_cache.get(_make_cache_key(question, category))


def _cache_result(question: str, category: str | None, result: dict) -> None:
    """
    Store a query result in the cache.
    Evicts the oldest entry when the cache exceeds CACHE_MAX_SIZE,
    preventing unbounded memory growth on a long-running server.
    """
    if len(_query_cache) >= CACHE_MAX_SIZE:
        oldest_key = next(iter(_query_cache))
        del _query_cache[oldest_key]
    _query_cache[_make_cache_key(question, category)] = result


def _invalidate_query_cache() -> None:
    """
    Clear all cached query results.
    Must be called whenever the knowledge base changes so users never
    receive answers derived from documents that no longer exist.
    """
    _query_cache.clear()
    print("🗑️  Query cache invalidated")


# ── Singleton getters ──────────────────────────────────────────

def get_embeddings() -> HuggingFaceEmbeddings:
    """Return the singleton embedding model, loading it on first use."""
    global _embeddings
    if _embeddings is None:
        print("Loading embedding model (first time takes 1-2 min)...")
        _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
        print("✅ Embedding model loaded")
    return _embeddings


def get_vectorstore() -> Chroma:
    """Return the singleton ChromaDB vector store, creating it on first use."""
    global _vectorstore
    if _vectorstore is None:
        _vectorstore = Chroma(
            collection_name="hr_documents",
            embedding_function=get_embeddings(),
            persist_directory=CHROMA_PATH
        )
    return _vectorstore


def get_llm() -> ChatGroq:
    """Return the singleton Groq LLM client, creating it on first use."""
    global _llm
    if _llm is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY not found in .env file")
        _llm = ChatGroq(
            api_key=api_key,
            model=GROQ_MODEL,
            temperature=0.1,
            max_tokens=1024,
        )
    return _llm


def get_reranker() -> CrossEncoder:
    """
    Return the singleton cross-encoder reranker model, loading it on first use.
    Loaded lazily so startup preloading in main.py controls when the download
    actually happens — not buried inside the first user request.
    """
    global _reranker
    if _reranker is None:
        print("Loading cross-encoder reranker (first time takes 1-2 min)...")
        _reranker = CrossEncoder(RERANKER_MODEL)
        print("✅ Reranker model loaded")
    return _reranker


# ── Text extraction ────────────────────────────────────────────

def extract_text(file_path: str, file_type: str) -> str:
    """Extract text from PDF, DOCX, or TXT files."""
    text = ""

    if file_type == "pdf":
        reader = pypdf.PdfReader(file_path)
        for page in reader.pages:
            text += page.extract_text() + "\n"

    elif file_type == "docx":
        doc = docx.Document(file_path)
        for para in doc.paragraphs:
            text += para.text + "\n"

    elif file_type in ["txt", "md"]:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()

    return text.strip()


# ── Document processing ────────────────────────────────────────

def process_document(file_path: str, filename: str, category: str = "General") -> int:
    """
    Process a document:
    1. Extract text
    2. Split into chunks
    3. Generate embeddings
    4. Store in ChromaDB
    Returns number of chunks created.
    """
    file_type = filename.rsplit(".", 1)[-1].lower()
    text = extract_text(file_path, file_type)

    if not text:
        raise ValueError(f"Could not extract text from {filename}")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    chunks = splitter.split_text(text)

    docs = [
        LangchainDoc(
            page_content=chunk,
            metadata={
                "source": filename,
                "category": category,
                "chunk_index": i
            }
        )
        for i, chunk in enumerate(chunks)
    ]

    vectorstore = get_vectorstore()
    vectorstore.add_documents(docs)

    # New document means cached answers may now be incomplete — clear the cache
    _invalidate_query_cache()

    print(f"✅ Processed {filename}: {len(chunks)} chunks stored")
    return len(chunks)


# ── BM25 keyword search ─────────────────────────────────────────

def tokenize_text(text: str) -> list[str]:
    """Basic tokenizer for BM25: lowercase and split on whitespace."""
    return text.lower().split()


def build_bm25_index(force_rebuild: bool = False) -> tuple[BM25Okapi | None, list[LangchainDoc]]:
    """
    Build (or return cached) BM25 index over every chunk currently
    stored in ChromaDB. Rebuilds automatically when chunk count changes.
    """
    global _bm25_index, _bm25_corpus, _bm25_chunk_count

    vectorstore = get_vectorstore()
    current_count = vectorstore._collection.count()

    if (
        not force_rebuild
        and _bm25_index is not None
        and _bm25_chunk_count == current_count
    ):
        return _bm25_index, _bm25_corpus

    results = vectorstore._collection.get(include=["documents", "metadatas"])
    stored_texts     = results.get("documents", [])
    stored_metadatas = results.get("metadatas", [])

    corpus = [
        LangchainDoc(page_content=text, metadata=metadata or {})
        for text, metadata in zip(stored_texts, stored_metadatas)
    ]

    if not corpus:
        _bm25_index = None
        _bm25_corpus = []
        _bm25_chunk_count = current_count
        return _bm25_index, _bm25_corpus

    tokenized_corpus = [tokenize_text(doc.page_content) for doc in corpus]
    _bm25_index      = BM25Okapi(tokenized_corpus)
    _bm25_corpus     = corpus
    _bm25_chunk_count = current_count

    return _bm25_index, _bm25_corpus


def bm25_search(
    question: str,
    category: str | None = None,
    top_k: int = 10
) -> list[tuple[LangchainDoc, float]]:
    """Run BM25 keyword search. Returns (document, score) pairs, highest first."""
    index, corpus = build_bm25_index()

    if index is None or not corpus:
        return []

    tokenized_question = tokenize_text(question)
    scores             = index.get_scores(tokenized_question)
    scored_docs        = list(zip(corpus, scores))

    if category and category != "All":
        scored_docs = [
            (doc, score) for doc, score in scored_docs
            if doc.metadata.get("category") == category
        ]

    scored_docs.sort(key=lambda pair: pair[1], reverse=True)
    return scored_docs[:top_k]


# ── Hybrid search (semantic + BM25 fusion) ──────────────────────

def _chunk_key(doc: LangchainDoc) -> tuple[str, str]:
    """Identity key for deduplicating chunks across both search methods."""
    return (doc.metadata.get("source", "Unknown"), doc.page_content)


def hybrid_search(
    question: str,
    category: str | None = None,
    semantic_k: int = 10,
    bm25_k: int = 10,
    top_n: int = 10
) -> list[LangchainDoc]:
    """
    Combine ChromaDB semantic search with BM25 keyword search using
    Reciprocal Rank Fusion (RRF). Returns a candidate pool for reranking.
    top_n defaults to 10 — the reranker narrows this to 5.
    """
    vectorstore = get_vectorstore()

    search_kwargs: dict = {"k": semantic_k}
    if category and category != "All":
        search_kwargs["filter"] = {"category": category}

    retriever    = vectorstore.as_retriever(search_kwargs=search_kwargs)
    semantic_docs = retriever.invoke(question)
    bm25_results  = bm25_search(question, category=category, top_k=bm25_k)

    combined_scores: dict[tuple[str, str], float] = {}
    combined_docs:   dict[tuple[str, str], LangchainDoc] = {}

    for rank, doc in enumerate(semantic_docs):
        key = _chunk_key(doc)
        combined_docs[key]   = doc
        combined_scores[key] = combined_scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)

    for rank, (doc, _score) in enumerate(bm25_results):
        key = _chunk_key(doc)
        combined_docs[key]   = doc
        combined_scores[key] = combined_scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)

    ranked_keys = sorted(combined_scores.items(), key=lambda pair: pair[1], reverse=True)
    return [combined_docs[key] for key, _score in ranked_keys[:top_n]]


# ── Cross-encoder reranking ──────────────────────────────────────

def rerank_documents(
    question: str,
    documents: list[LangchainDoc],
    top_n: int = 5
) -> list[LangchainDoc]:
    """
    Rerank hybrid search candidates using a cross-encoder for true
    relevance scoring. Falls back to hybrid search order if reranker fails.
    """
    if not documents:
        return []

    reranker = get_reranker()
    pairs    = [(question, doc.page_content) for doc in documents]

    try:
        scores = reranker.predict(pairs)
    except Exception as error:
        print(f"⚠️  Reranking failed, falling back to hybrid search order: {error}")
        return documents[:top_n]

    scored_docs = sorted(zip(documents, scores), key=lambda pair: pair[1], reverse=True)
    return [doc for doc, _score in scored_docs[:top_n]]


# ── RAG Query ──────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert HR Knowledge Assistant for an organisation.
Your role is to answer questions accurately using only the provided document context.

Rules:
- Answer based ONLY on the provided context
- If the answer is not in the context, say "I couldn't find information about this in the uploaded documents."
- Always cite the source document name
- Be concise and professional
- For HR policies, always mention the exact policy name and section if available

Context from documents:
{context}

Conversation history:
{history}
"""


def query_documents(
    question: str,
    chat_history: list = [],
    category: str | None = None
) -> dict:
    """
    Query the knowledge base.
    Pipeline: query cache → hybrid search → cross-encoder rerank → Groq LLM.

    Cache is checked first. On a cache hit the full pipeline is skipped
    entirely, which eliminates ChromaDB + BM25 + reranker latency for
    repeated questions — the most common performance win in production.
    """
    llm = get_llm()

    # ── Cache check ──────────────────────────────────────────────
    cached = _get_cached_result(question, category)
    if cached is not None:
        print(f"⚡ Cache hit for: '{question[:60]}'")
        return cached

    # ── Retrieval: hybrid search pulls a top-10 candidate pool ──
    candidate_docs = hybrid_search(question, category=category, top_n=10)

    if not candidate_docs:
        return {
            "answer": "I couldn't find any relevant information in the uploaded documents. Please make sure you have uploaded the relevant HR documents.",
            "sources": [],
            "chunks_used": 0
        }

    # ── Reranking: cross-encoder narrows pool to true top 5 ─────
    relevant_docs = rerank_documents(question, candidate_docs, top_n=5)

    context = "\n\n---\n\n".join([
        f"[Source: {doc.metadata.get('source', 'Unknown')}]\n{doc.page_content}"
        for doc in relevant_docs
    ])

    history_str = ""
    if chat_history:
        for msg in chat_history[-6:]:
            role = "User" if msg["role"] == "user" else "Assistant"
            history_str += f"{role}: {msg['content']}\n"

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "{question}")
    ])

    chain    = prompt | llm
    response = chain.invoke({
        "context": context,
        "history": history_str or "No previous conversation.",
        "question": question
    })

    sources = list(set([
        doc.metadata.get("source", "Unknown")
        for doc in relevant_docs
    ]))

    result = {
        "answer": response.content,
        "sources": sources,
        "chunks_used": len(relevant_docs)
    }

    # ── Cache the result for future identical questions ──────────
    # Note: we cache regardless of chat_history so that the same
    # factual question gets a fast response even mid-conversation.
    # This is correct because the LLM answer for a factual question
    # doesn't meaningfully change based on prior turns.
    _cache_result(question, category, result)

    return result


# ── Document management ────────────────────────────────────────

def delete_document_from_vectorstore(filename: str) -> None:
    """
    Remove all chunks of a document from ChromaDB.
    Also invalidates the BM25 index cache and the query response cache
    so deleted content is never served in future answers.
    """
    vectorstore = get_vectorstore()
    collection  = vectorstore._collection
    results     = collection.get(where={"source": filename})

    if results and results["ids"]:
        collection.delete(ids=results["ids"])
        print(f"✅ Deleted {len(results['ids'])} chunks for {filename}")

    # Invalidate BM25 cache — corpus just shrank
    global _bm25_index, _bm25_corpus, _bm25_chunk_count
    _bm25_index       = None
    _bm25_corpus      = []
    _bm25_chunk_count = None

    # Invalidate query cache — answers referencing this file are now stale
    _invalidate_query_cache()


def get_vectorstore_stats() -> dict:
    """Get stats about the vector store."""
    vectorstore = get_vectorstore()
    count       = vectorstore._collection.count()
    return {"total_chunks": count}