import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LangchainDoc
from langchain_core.prompts import ChatPromptTemplate
from rank_bm25 import BM25Okapi
import pypdf
import docx

load_dotenv()

# ── Constants ──────────────────────────────────────────────────
CHROMA_PATH    = "./chroma_db"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
GROQ_MODEL     = "llama-3.1-8b-instant"
RRF_K          = 60  # Reciprocal Rank Fusion constant — standard default from IR literature

# ── Singleton clients ──────────────────────────────────────────
_embeddings  = None
_vectorstore = None
_llm         = None

# ── BM25 index cache ───────────────────────────────────────────
_bm25_index       = None
_bm25_corpus      = None   # list[LangchainDoc] aligned with _bm25_index
_bm25_chunk_count = None   # used to detect when the index is stale


def get_embeddings():
    global _embeddings
    if _embeddings is None:
        print("Loading embedding model (first time takes 1-2 min)...")
        _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
        print("✅ Embedding model loaded")
    return _embeddings


def get_vectorstore():
    global _vectorstore
    if _vectorstore is None:
        _vectorstore = Chroma(
            collection_name="hr_documents",
            embedding_function=get_embeddings(),
            persist_directory=CHROMA_PATH
        )
    return _vectorstore


def get_llm():
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

    # Split into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    chunks = splitter.split_text(text)

    # Create LangChain documents with metadata
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

    # Store in ChromaDB
    vectorstore = get_vectorstore()
    vectorstore.add_documents(docs)

    print(f"✅ Processed {filename}: {len(chunks)} chunks stored")
    return len(chunks)


# ── BM25 keyword search ─────────────────────────────────────────

def tokenize_text(text: str) -> list[str]:
    """
    Basic tokenizer for BM25: lowercase and split on whitespace.
    BM25 works on discrete tokens, not embeddings, so this doesn't
    need to be fancy — just consistent between indexing and querying.
    """
    return text.lower().split()


def build_bm25_index(force_rebuild: bool = False) -> tuple[BM25Okapi, list[LangchainDoc]]:
    """
    Build (or return cached) BM25 index over every chunk currently
    stored in ChromaDB.

    Rebuilds automatically if the number of chunks in ChromaDB has
    changed since the index was last built (e.g. a new document was
    uploaded, or one was deleted). Without this cache check, we'd be
    re-reading and re-tokenizing the entire corpus on every single
    question, which gets slow fast as the knowledge base grows.
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
    stored_texts = results.get("documents", [])
    stored_metadatas = results.get("metadatas", [])

    corpus = [
        LangchainDoc(page_content=text, metadata=metadata or {})
        for text, metadata in zip(stored_texts, stored_metadatas)
    ]

    if not corpus:
        # No documents uploaded yet — BM25Okapi errors on an empty corpus,
        # so guard against it instead of letting it crash the query flow.
        _bm25_index = None
        _bm25_corpus = []
        _bm25_chunk_count = current_count
        return _bm25_index, _bm25_corpus

    tokenized_corpus = [tokenize_text(doc.page_content) for doc in corpus]

    _bm25_index = BM25Okapi(tokenized_corpus)
    _bm25_corpus = corpus
    _bm25_chunk_count = current_count

    return _bm25_index, _bm25_corpus


def bm25_search(question: str, category: str = None, top_k: int = 10) -> list[tuple[LangchainDoc, float]]:
    """
    Run BM25 keyword search over the stored chunks.
    Returns a list of (document, bm25_score) tuples, highest score first.
    """
    index, corpus = build_bm25_index()

    if index is None or not corpus:
        return []

    tokenized_question = tokenize_text(question)
    scores = index.get_scores(tokenized_question)

    scored_docs = list(zip(corpus, scores))

    # BM25 doesn't support Chroma's native metadata filter, so apply it here
    if category and category != "All":
        scored_docs = [
            (doc, score) for doc, score in scored_docs
            if doc.metadata.get("category") == category
        ]

    scored_docs.sort(key=lambda pair: pair[1], reverse=True)
    return scored_docs[:top_k]


# ── Hybrid search (semantic + BM25 fusion) ──────────────────────

def _chunk_key(doc: LangchainDoc) -> tuple[str, str]:
    """Identity key used for deduplicating chunks across both search methods."""
    return (doc.metadata.get("source", "Unknown"), doc.page_content)


def hybrid_search(
    question: str,
    category: str = None,
    semantic_k: int = 10,
    bm25_k: int = 10,
    top_n: int = 5
) -> list[LangchainDoc]:
    """
    Combine ChromaDB semantic search with BM25 keyword search using
    Reciprocal Rank Fusion (RRF).

    RRF is used instead of adding raw scores together because cosine
    similarity (semantic) and BM25 scores are on incompatible scales —
    directly summing them would let whichever method has larger raw
    numbers dominate the ranking regardless of actual relevance. RRF
    instead scores each chunk based on its RANK in each list, so a
    chunk ranking well in both searches naturally rises to the top.
    """
    vectorstore = get_vectorstore()

    # Semantic search (existing behaviour, just pulling more candidates
    # than before so we have a proper pool to fuse against BM25)
    search_kwargs = {"k": semantic_k}
    if category and category != "All":
        search_kwargs["filter"] = {"category": category}

    retriever = vectorstore.as_retriever(search_kwargs=search_kwargs)
    semantic_docs = retriever.invoke(question)

    # BM25 keyword search
    bm25_results = bm25_search(question, category=category, top_k=bm25_k)

    # Fuse via Reciprocal Rank Fusion
    combined_scores: dict[tuple[str, str], float] = {}
    combined_docs: dict[tuple[str, str], LangchainDoc] = {}

    for rank, doc in enumerate(semantic_docs):
        key = _chunk_key(doc)
        combined_docs[key] = doc
        combined_scores[key] = combined_scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)

    for rank, (doc, _score) in enumerate(bm25_results):
        key = _chunk_key(doc)
        combined_docs[key] = doc
        combined_scores[key] = combined_scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)

    ranked_keys = sorted(combined_scores.items(), key=lambda pair: pair[1], reverse=True)
    top_docs = [combined_docs[key] for key, _score in ranked_keys[:top_n]]

    return top_docs


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

def query_documents(question: str, chat_history: list = [], category: str = None) -> dict:
    """
    Query the knowledge base using hybrid search (semantic + BM25).
    Returns answer + source documents.
    """
    llm = get_llm()

    # ── Retrieval: hybrid search replaces plain semantic-only retrieval ──
    relevant_docs = hybrid_search(question, category=category, top_n=5)

    if not relevant_docs:
        return {
            "answer": "I couldn't find any relevant information in the uploaded documents. Please make sure you have uploaded the relevant HR documents.",
            "sources": [],
            "chunks_used": 0
        }

    # Build context from retrieved chunks
    context = "\n\n---\n\n".join([
        f"[Source: {doc.metadata.get('source', 'Unknown')}]\n{doc.page_content}"
        for doc in relevant_docs
    ])

    # Build conversation history string
    history_str = ""
    if chat_history:
        for msg in chat_history[-6:]:  # Last 3 exchanges
            role = "User" if msg["role"] == "user" else "Assistant"
            history_str += f"{role}: {msg['content']}\n"

    # Build prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "{question}")
    ])

    # Run the chain
    chain = prompt | llm
    response = chain.invoke({
        "context": context,
        "history": history_str or "No previous conversation.",
        "question": question
    })

    # Extract unique sources
    sources = list(set([
        doc.metadata.get("source", "Unknown")
        for doc in relevant_docs
    ]))

    return {
        "answer": response.content,
        "sources": sources,
        "chunks_used": len(relevant_docs)
    }


# ── Document management ────────────────────────────────────────

def delete_document_from_vectorstore(filename: str):
    """Remove all chunks of a document from ChromaDB."""
    vectorstore = get_vectorstore()
    collection = vectorstore._collection
    results = collection.get(where={"source": filename})
    if results and results["ids"]:
        collection.delete(ids=results["ids"])
        print(f"✅ Deleted {len(results['ids'])} chunks for {filename}")

    # Invalidate the BM25 cache — the corpus just changed
    global _bm25_index, _bm25_corpus, _bm25_chunk_count
    _bm25_index = None
    _bm25_corpus = None
    _bm25_chunk_count = None


def get_vectorstore_stats() -> dict:
    """Get stats about the vector store."""
    vectorstore = get_vectorstore()
    count = vectorstore._collection.count()
    return {"total_chunks": count}