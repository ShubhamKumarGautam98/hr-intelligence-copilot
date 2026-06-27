from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime, timezone

DATABASE_URL = "sqlite:///./hr_copilot.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ── Models ─────────────────────────────────────────────────────

class Document(Base):
    __tablename__ = "documents"

    id          = Column(Integer, primary_key=True, index=True)
    filename    = Column(String(255), nullable=False)
    file_type   = Column(String(50))
    category    = Column(String(100), default="General")
    chunk_count = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    status      = Column(String(50), default="processing")  # processing | ready | error


class ChatMemory(Base):
    __tablename__ = "chat_memory"

    id         = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), nullable=False)
    role       = Column(String(20))   # user | assistant
    content    = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ── Helpers ────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    print("✅ Database initialised")