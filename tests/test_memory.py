import sqlite3
import pytest
from datetime import datetime
from memory import MemoryEngine


def test_save_and_get_recent(db_path, chroma_path):
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "decision", "Use pytest for testing")
    recent = engine.get_recent("proj")
    assert len(recent) == 1
    assert recent[0]["content"] == "Use pytest for testing"
    assert recent[0]["type"] == "decision"


def test_search_returns_results(db_path, chroma_path):
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "obs", "ChromaDB stores embeddings")
    results = engine.search("proj", "embeddings")
    assert len(results) >= 1
    assert any("ChromaDB" in r["content"] for r in results)


def test_search_empty_collection(db_path, chroma_path):
    engine = MemoryEngine(db_path, chroma_path)
    results = engine.search("proj", "anything")
    assert results == []


def test_summarize_session(db_path, chroma_path):
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "obs", "First observation")
    engine.save_observation("proj", "decision", "Second observation")
    summary = engine.summarize_session("proj", session_id="s1")
    assert "First observation" in summary or "Second observation" in summary
    with sqlite3.connect(db_path) as conn:
        row = conn.execute("SELECT summary FROM summaries WHERE project='proj'").fetchone()
    assert row is not None


def test_reconcile_chromadb_fills_missing(db_path, chroma_path):
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS observations "
            "(id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT, type TEXT, "
            "content TEXT, metadata TEXT, created_at TEXT)"
        )
        conn.execute(
            "INSERT INTO observations (project, type, content, metadata, created_at) "
            "VALUES (?,?,?,?,?)",
            ("proj", "obs", "Orphaned in SQLite", "{}", now)
        )
        conn.commit()
    engine = MemoryEngine(db_path, chroma_path)
    results = engine.search("proj", "Orphaned")
    assert len(results) >= 1
