import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LangchainDoc
from langchain_core.prompts import ChatPromptTemplate
import pypdf
import docx

load_dotenv()

# ── Constants ──────────────────────────────────────────────────
CHROMA_PATH    = "./chroma_db"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
GROQ_MODEL     = "llama-3.1-8b-instant"

# ── Singleton clients ──────────────────────────────────────────
_embeddings  = None
_vectorstore = None
_llm         = None


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
    Query the knowledge base using RAG.
    Returns answer + source documents.
    """
    vectorstore = get_vectorstore()
    llm = get_llm()

    # Build search filter
    search_kwargs = {"k": 5}
    if category and category != "All":
        search_kwargs["filter"] = {"category": category}

    # Retrieve relevant chunks
    retriever = vectorstore.as_retriever(search_kwargs=search_kwargs)
    relevant_docs = retriever.invoke(question)

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


def get_vectorstore_stats() -> dict:
    """Get stats about the vector store."""
    vectorstore = get_vectorstore()
    count = vectorstore._collection.count()
    return {"total_chunks": count}
