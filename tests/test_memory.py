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
    engine._reconcile_chromadb()
    results = engine.search("proj", "Orphaned")
    assert len(results) >= 1


def test_shared_collection_isolates_projects(db_path, chroma_path):
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("alpha", "obs", "alpha uses postgres")
    engine.save_observation("beta", "obs", "beta uses mongo")
    names = [c.name for c in engine.chroma_client.list_collections()]
    assert names == ["efficlaude_memory"]
    results = engine.search("alpha", "database")
    assert all("mongo" not in r["content"] for r in results)


def test_chroma_migration_wipes_legacy_layout(db_path, chroma_path):
    import chromadb
    client = chromadb.PersistentClient(path=chroma_path)
    client.get_or_create_collection("mem_deadbeef")
    del client
    engine = MemoryEngine(db_path, chroma_path)
    names = [c.name for c in engine.chroma_client.list_collections()]
    assert "mem_deadbeef" not in names
    assert engine._migrated is True


def test_prune_removes_fts_rows(db_path, chroma_path):
    engine = MemoryEngine(db_path, chroma_path)
    for i in range(3):
        engine.save_observation("proj", "decision", f"decision number {i}")
    engine._prune_type("proj", "decision", 1)
    with sqlite3.connect(db_path) as conn:
        orphans = conn.execute(
            "SELECT COUNT(*) FROM obs_fts f "
            "LEFT JOIN observations o ON f.rowid = o.id WHERE o.id IS NULL"
        ).fetchone()[0]
    assert orphans == 0


def test_summaries_capped_per_project(db_path, chroma_path):
    import memory as memory_mod
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "obs", "something happened")
    for _ in range(memory_mod.SUMMARY_TABLE_CAP + 5):
        engine.summarize_session("proj", session_id="s")
    with sqlite3.connect(db_path) as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM summaries WHERE project='proj'"
        ).fetchone()[0]
    assert count <= memory_mod.SUMMARY_TABLE_CAP


def test_fts_search_survives_punctuation(db_path, chroma_path):
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "obs", "worker handles rate limits")
    assert engine._fts_search("proj", 'rate/limits-"x"', 5) != []
