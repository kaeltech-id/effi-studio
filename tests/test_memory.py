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


def test_dedup_increments_seen_count(db_path, chroma_path):
    """Identical content collapses to one row with a frequency count."""
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "tool_use", "same content")
    engine.save_observation("proj", "tool_use", "same  content")
    with sqlite3.connect(db_path) as conn:
        row = conn.execute("SELECT COUNT(*), MAX(seen_count) FROM observations").fetchone()
    assert row == (1, 2)


def test_dedup_skips_fts_and_chroma_writes(db_path, chroma_path):
    """A deduped save returns early, leaving the FTS and vector indexes untouched."""
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "tool_use", "indexed exactly once")
    engine.save_observation("proj", "tool_use", "indexed   exactly once")
    with sqlite3.connect(db_path) as conn:
        fts_rows = conn.execute("SELECT COUNT(*) FROM obs_fts").fetchone()[0]
    assert fts_rows == 1
    assert engine._get_collection("proj").count() == 1


def test_bm25_to_distance_is_monotonic():
    """A better (more negative) FTS5 rank maps to a smaller distance."""
    import memory as memory_mod
    better = memory_mod._bm25_to_distance(-10.0)
    worse = memory_mod._bm25_to_distance(-1.0)
    assert 0.0 <= better < worse < 1.0


def test_bm25_to_distance_rejects_non_negative_rank():
    """Missing, zero and positive ranks carry no signal, so they map to the worst distance."""
    import memory as memory_mod
    assert memory_mod._bm25_to_distance(None) == 1.0
    assert memory_mod._bm25_to_distance(0) == 1.0
    assert memory_mod._bm25_to_distance(5.0) == 1.0


def test_rrf_prefers_item_ranked_by_both_paths():
    """An item on both result lists outranks a higher-placed single-path item."""
    import memory as memory_mod
    vector_items = [{"content": "x"}, {"content": "y"}]
    fts_items = [{"content": "y"}]
    fused = memory_mod._rrf(vector_items, fts_items, 5)
    assert [item["content"] for item in fused] == ["y", "x"]
    assert fused[0]["fused_score"] > fused[1]["fused_score"]


def test_rrf_damping_outranks_a_single_path_leader():
    """Cross-path agreement beats a rank-one hit seen by only one path."""
    import memory as memory_mod
    vector_items = [{"content": "a"}, {"content": "b"}, {"content": "c"}, {"content": "t"}]
    fts_items = [{"content": "d"}, {"content": "e"}, {"content": "g"}, {"content": "t"}]
    fused = memory_mod._rrf(vector_items, fts_items, 3)
    assert fused[0]["content"] == "t"
    assert fused[0]["fused_score"] > fused[1]["fused_score"]


def test_rrf_merges_duplicate_content_into_one_entry():
    """Content reached by both paths appears exactly once in the fused output."""
    import memory as memory_mod
    vector_items = [{"content": "shared"}, {"content": "only_vector"}]
    fts_items = [{"content": "shared"}, {"content": "only_fts"}]
    fused = memory_mod._rrf(vector_items, fts_items, 10)
    contents = [item["content"] for item in fused]
    assert len(contents) == len(set(contents))
    assert set(contents) == {"shared", "only_vector", "only_fts"}


def test_rrf_handles_empty_inputs():
    """One empty list still ranks the other; two empty lists fuse to nothing."""
    import memory as memory_mod
    assert memory_mod._rrf([], [], 5) == []
    assert memory_mod._rrf([], [], 0) == []
    only_fts = memory_mod._rrf([], [{"content": "a"}, {"content": "b"}], 5)
    assert [item["content"] for item in only_fts] == ["a", "b"]
    only_vector = memory_mod._rrf([{"content": "a"}], [], 5)
    assert [item["content"] for item in only_vector] == ["a"]


def test_search_results_are_source_tagged(db_path, chroma_path):
    """Every fused search hit records which retrieval path produced it."""
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "obs", "ChromaDB stores embeddings")
    engine.save_observation("proj", "obs", "SQLite FTS5 ranks with bm25")
    results = engine.search("proj", "embeddings")
    assert results
    assert all(r["source"] in {"fts", "vector"} for r in results)


def test_v1_to_v2_migration_adds_dedup_columns(db_path, chroma_path):
    """Opening a v1 database adds the dedup columns and backfills seen_count."""
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
            ("proj", "obs", "written before schema v2", "{}", now)
        )
        conn.commit()
    MemoryEngine(db_path, chroma_path)
    with sqlite3.connect(db_path) as conn:
        columns = {r[1] for r in conn.execute("PRAGMA table_info(observations)")}
        row = conn.execute(
            "SELECT content_hash, seen_count FROM observations WHERE project='proj'"
        ).fetchone()
    assert {"content_hash", "seen_count"} <= columns
    assert row[0] is None
    assert row[1] == 1


def test_legacy_null_hash_row_does_not_block_save(db_path, chroma_path):
    """A migrated row with a NULL hash cannot dedup, and saving over it still succeeds."""
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
            ("proj", "obs", "legacy content", "{}", now)
        )
        conn.commit()
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "obs", "legacy content")
    with sqlite3.connect(db_path) as conn:
        count = conn.execute("SELECT COUNT(*) FROM observations").fetchone()[0]
    assert count == 2


def test_content_hash_normalises_whitespace():
    """Whitespace differences hash alike, at a stable 32 characters."""
    import memory as memory_mod
    assert memory_mod._content_hash("a  b") == memory_mod._content_hash("a b")
    assert memory_mod._content_hash(" a\n\tb ") == memory_mod._content_hash("a b")
    assert memory_mod._content_hash("a b") != memory_mod._content_hash("ab")
    assert len(memory_mod._content_hash("a b")) == 32
