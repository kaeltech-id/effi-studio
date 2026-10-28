from __future__ import annotations

import hashlib
import os
import re
import shutil
import sqlite3
import json
import chromadb
from datetime import datetime
from pathlib import Path
from logger import warn
import threading

_lock = threading.Lock()

SCHEMA_VERSION = 2
TYPE_CAPS: dict[str, int] = {
    "tool_use": 200,
    "summary": 50,
    "decision": 100,
    "execution": 100,
    "review": 100,
    "feature_plan": 100,
    "setup": 50,
}
_MIGRATIONS: dict[int, list[str]] = {
    # 1 = baseline — no DDL changes needed, just establishes the versioning system
    2: [
        "ALTER TABLE observations ADD COLUMN content_hash TEXT",
        "ALTER TABLE observations ADD COLUMN seen_count INTEGER NOT NULL DEFAULT 1",
        "CREATE INDEX IF NOT EXISTS idx_obs_project_hash ON observations(project, content_hash)",
    ],
}
_CHROMA_FALLBACK_THRESHOLD = float(os.getenv('EFFICLAUDE_FTS_THRESHOLD', '1.2'))
SHARED_MEM_COLLECTION = "efficlaude_memory"
CHROMA_SCHEMA_VERSION = 3
SUMMARY_TABLE_CAP = int(os.getenv('EFFICLAUDE_SUMMARY_CAP', '50'))
_PROJECT_OVERFETCH = 5
REJECT_FILE = Path.home() / ".efficlaude" / ".observe_rejects.json"


def _fts_sanitize(query: str) -> str:
    """Quote each term so FTS5 cannot choke on punctuation."""
    terms = re.findall(r'[A-Za-z0-9_]+', query)
    return ' OR '.join(f'"{t}"' for t in terms)


def _content_hash(content: str) -> str:
    """Stable hash for dedup — whitespace-normalised so reruns collapse."""
    return hashlib.sha256(' '.join(content.split()).encode()).hexdigest()[:32]


def _bm25_to_distance(rank: float) -> float:
    """FTS5 rank is negative and unbounded; map to [0,1] where lower is better."""
    try:
        score = -float(rank)
    except (TypeError, ValueError):
        return 1.0
    return round(1.0 / (1.0 + score), 4) if score > 0 else 1.0


def _rrf(vector_items: list, fts_items: list, limit: int, k: int = 60) -> list:
    """Reciprocal rank fusion — ordering only, so the two scales never need calibrating."""
    scored: dict = {}
    for items in (vector_items, fts_items):
        for rank, item in enumerate(items, start=1):
            entry = scored.setdefault(item['content'], {"item": item, "score": 0.0})
            entry["score"] += 1.0 / (k + rank)
    ranked = sorted(scored.values(), key=lambda e: -e["score"])
    out = []
    for e in ranked[:limit]:
        item = dict(e["item"])
        item["fused_score"] = round(e["score"], 6)
        out.append(item)
    return out


def _resolve_ef():
    """The locally installed embedding function, or None to keep Chroma's default."""
    try:
        import embedder

        return embedder.get_embedding_function()
    except Exception as e:
        warn("memory", f"embedder unavailable: {e}")
        return None


def _migrate_chroma_layout(chroma_path: str, rebuild: bool = False) -> bool:
    """Wipe the stale chroma store once per layout version. Returns True if wiped.

    The marker is scoped to both the layout version and whether a custom
    embedding function is in use, so switching embedders discards vectors the
    other embedder wrote — exactly once, since the wipe then writes the marker.
    """
    suffix = "_ef" if rebuild else ""
    marker = Path(chroma_path) / f".layout_v{CHROMA_SCHEMA_VERSION}{suffix}"
    if marker.exists():
        return False
    other_marker = Path(chroma_path) / f".layout_v{CHROMA_SCHEMA_VERSION}{'' if suffix else '_ef'}"
    db = Path(chroma_path) / "chroma.sqlite3"
    legacy = 0
    if db.exists():
        try:
            with sqlite3.connect(str(db)) as conn:
                legacy = conn.execute(
                    "SELECT COUNT(*) FROM collections "
                    "WHERE name LIKE 'mem_%' OR name LIKE 'docs_%'"
                ).fetchone()[0]
        except Exception as e:
            warn("memory", f"chroma layout probe failed: {e}")
    stale = bool(legacy) or (db.exists() and (rebuild or other_marker.exists()))
    if stale:
        shutil.rmtree(chroma_path, ignore_errors=True)
        try:
            chromadb.api.client.SharedSystemClient.clear_system_cache()
        except Exception as e:
            warn("memory", f"chroma cache clear failed: {e}")
    Path(chroma_path).mkdir(parents=True, exist_ok=True)
    marker.touch()
    return stale


class MemoryEngine:
    def __init__(self, db_path, chroma_path):
        self.db_path = db_path
        self._embedding_function = _resolve_ef()
        self._migrated = _migrate_chroma_layout(
            chroma_path, rebuild=self._embedding_function is not None
        )
        self.chroma_client = chromadb.PersistentClient(path=chroma_path)
        self._init_db()
        self._migrate()
        if self._migrated:
            self._reconcile_chromadb()
        else:
            threading.Thread(target=self._reconcile_chromadb, daemon=True).start()
        threading.Thread(target=self._prune_on_startup, daemon=True).start()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute('''
                CREATE TABLE IF NOT EXISTS observations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project TEXT NOT NULL,
                    type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT,
                    created_at TEXT NOT NULL
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS summaries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project TEXT NOT NULL,
                    session_id TEXT,
                    summary TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            ''')
            try:
                conn.execute('''
                    CREATE VIRTUAL TABLE IF NOT EXISTS obs_fts
                    USING fts5(content, tokenize="porter ascii")
                ''')
            except Exception as e:
                warn("memory", f"fts init error: {e}")
            conn.execute('CREATE INDEX IF NOT EXISTS idx_obs_project_type ON observations(project, type)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_sum_project_created ON summaries(project, created_at)')
            conn.commit()

    def _migrate(self) -> None:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS schema_version (
                        version INTEGER NOT NULL
                    )
                ''')
                row = conn.execute(
                    'SELECT version FROM schema_version LIMIT 1'
                ).fetchone()
                current = row[0] if row else 0
                if current < SCHEMA_VERSION:
                    for v in range(current + 1, SCHEMA_VERSION + 1):
                        for sql in _MIGRATIONS.get(v, []):
                            try:
                                conn.execute(sql)
                            except Exception as e:
                                warn("memory", f"migration v{v} statement skipped: {e}")
                    if row:
                        conn.execute(
                            'UPDATE schema_version SET version = ?',
                            (SCHEMA_VERSION,)
                        )
                    else:
                        conn.execute(
                            'INSERT INTO schema_version (version) VALUES (?)',
                            (SCHEMA_VERSION,)
                        )
                    conn.commit()
        except Exception as e:
            warn("memory", f"migration error: {e}")

    def _reconcile_chromadb(self) -> None:
        try:
            with _lock:
                with sqlite3.connect(self.db_path) as conn:
                    projects = [r[0] for r in conn.execute(
                        'SELECT DISTINCT project FROM observations'
                    ).fetchall()]
            for project in projects:
                with _lock:
                    collection = self._get_collection(project)
                    chroma_ids: set = set()
                    offset, BATCH = 0, 500
                    while True:
                        batch = collection.get(limit=BATCH, offset=offset, where={"project": project})['ids']
                        if not batch:
                            break
                        chroma_ids.update(batch)
                        offset += len(batch)
                        if len(batch) < BATCH:
                            break
                    with sqlite3.connect(self.db_path) as conn:
                        rows = conn.execute(
                            'SELECT id, type, content, metadata, created_at FROM observations WHERE project=?',
                            (project,)
                        ).fetchall()
                    sqlite_ids = {str(r[0]) for r in rows}
                    missing = [r for r in rows if str(r[0]) not in chroma_ids]
                    orphans = [cid for cid in chroma_ids if cid not in sqlite_ids]
                    if missing:
                        collection.add(
                            documents=[r[2] for r in missing],
                            metadatas=[{"type": r[1], "created_at": r[4], "project": project, **json.loads(r[3] or '{}')} for r in missing],
                            ids=[str(r[0]) for r in missing]
                        )
                    if orphans:
                        collection.delete(ids=orphans)
        except Exception as e:
            warn("memory", f"chromadb reconcile error: {e}")

    def _get_collection(self, project=None):
        kwargs = {}
        if self._embedding_function is not None:
            kwargs["embedding_function"] = self._embedding_function
        return self.chroma_client.get_or_create_collection(SHARED_MEM_COLLECTION, **kwargs)

    def _prune_type(self, project: str, obs_type: str, cap: int) -> None:
        try:
            excess_int_ids: list = []
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("BEGIN EXCLUSIVE")
                rows = conn.execute(
                    'SELECT id FROM observations WHERE project=? AND type=? ORDER BY created_at ASC',
                    (project, obs_type)
                ).fetchall()
                if len(rows) > cap:
                    excess_int_ids = [r[0] for r in rows[:-cap]]
                    placeholders = ','.join('?' * len(excess_int_ids))
                    conn.execute(
                        f'DELETE FROM observations WHERE id IN ({placeholders})',
                        excess_int_ids
                    )
                    conn.execute(
                        f'DELETE FROM obs_fts WHERE rowid IN ({placeholders})',
                        excess_int_ids
                    )
                conn.commit()
            if excess_int_ids:
                with _lock:
                    collection = self._get_collection(project)
                    collection.delete(ids=[str(i) for i in excess_int_ids])
        except Exception as e:
            warn("memory", f"prune error (type={obs_type}): {e}")

    def _purge_fts_orphans(self) -> None:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    'DELETE FROM obs_fts WHERE rowid NOT IN (SELECT id FROM observations)'
                )
                conn.commit()
        except Exception as e:
            warn("memory", f"fts orphan purge error: {e}")
        try:
            conn = sqlite3.connect(self.db_path, isolation_level=None)
            conn.execute('VACUUM')
            conn.close()
        except Exception as e:
            warn("memory", f"vacuum error: {e}")

    def _prune_on_startup(self) -> None:
        self._purge_fts_orphans()
        try:
            placeholders = ','.join('?' * len(TYPE_CAPS))
            with sqlite3.connect(self.db_path) as conn:
                pairs = conn.execute(
                    f'SELECT DISTINCT project, type FROM observations WHERE type IN ({placeholders})',
                    list(TYPE_CAPS.keys())
                ).fetchall()
            for project, obs_type in pairs:
                self._prune_type(project, obs_type, TYPE_CAPS[obs_type])
        except Exception as e:
            warn("memory", f"prune on startup error: {e}")

    def _fts_search(self, project: str, query: str, limit: int) -> list:
        safe_query = _fts_sanitize(query)
        if not safe_query:
            return []
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute(
                    '''SELECT o.id, o.type, o.content, o.metadata, o.created_at, f.rank
                       FROM obs_fts f
                       JOIN observations o ON f.rowid = o.id
                       WHERE f.content MATCH ? AND o.project = ?
                       ORDER BY rank
                       LIMIT ?''',
                    (safe_query, project, limit)
                ).fetchall()
            return [
                {
                    "content": r[2],
                    "metadata": {**json.loads(r[3] or '{}'), "type": r[1], "created_at": r[4]},
                    "distance": _bm25_to_distance(r[5]),
                    "source": "fts"
                }
                for r in rows
            ]
        except Exception as e:
            warn("memory", f"fts search error: {e}")
            return []

    def save_observation(self, project: str, obs_type: str, content: str, metadata=None) -> None:
        now = datetime.utcnow().isoformat()
        with _lock:
            with sqlite3.connect(self.db_path) as conn:
                h = _content_hash(content)
                existing = conn.execute(
                    'SELECT id FROM observations WHERE project=? AND content_hash=?', (project, h)
                ).fetchone()
                if existing:
                    conn.execute(
                        'UPDATE observations SET seen_count = seen_count + 1, created_at = ? WHERE id = ?',
                        (now, existing[0])
                    )
                    conn.commit()
                    return  # no new row, so the _prune_type cap at the end does not apply
                cursor = conn.execute(
                    'INSERT INTO observations (project, type, content, metadata, created_at, content_hash) VALUES (?,?,?,?,?,?)',
                    (project, obs_type, content, json.dumps(metadata or {}), now, h)
                )
                obs_id = cursor.lastrowid
                try:
                    conn.execute('INSERT INTO obs_fts(rowid, content) VALUES (?, ?)', (obs_id, content))
                except Exception as e:
                    warn("memory", f"fts insert failed (id={obs_id}): {e}")
                conn.commit()
            collection = self._get_collection(project)
            chroma_ok = False
            for attempt in range(2):
                try:
                    collection.add(
                        documents=[content],
                        metadatas=[{"type": obs_type, "created_at": now, "project": project, **(metadata or {})}],
                        ids=[str(obs_id)]
                    )
                    chroma_ok = True
                    break
                except Exception as e:
                    if attempt == 1:
                        warn("memory", f"chromadb add failed: {e}")
            if not chroma_ok:
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute('DELETE FROM observations WHERE id=?', (obs_id,))
                    conn.execute('DELETE FROM obs_fts WHERE rowid=?', (obs_id,))
                    conn.commit()
        cap = TYPE_CAPS.get(obs_type)
        if cap is not None:
            self._prune_type(project, obs_type, cap)

    def search(self, project: str, query: str, limit: int = 5) -> list:
        collection = self._get_collection(project)
        try:
            count = collection.count()
            if count == 0:
                return self._fts_search(project, query, limit)
            results = collection.query(
                query_texts=[query],
                n_results=min(limit * _PROJECT_OVERFETCH, count),
                where={"project": project}
            )
            items = [
                {"content": doc, "metadata": meta, "distance": dist, "source": "vector"}
                for doc, meta, dist in zip(
                    results['documents'][0],
                    results['metadatas'][0],
                    results['distances'][0]
                )
            ][:limit]
            fts_items = self._fts_search(project, query, limit)
            if fts_items and all(item['distance'] > _CHROMA_FALLBACK_THRESHOLD for item in items):
                items = []
            return _rrf(items, fts_items, limit)
        except Exception as e:
            warn("memory", f"chromadb search error: {e}")
            return self._fts_search(project, query, limit)

    def get_recent(self, project: str, limit: int = 20) -> list:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                'SELECT type, content, metadata, created_at FROM observations '
                'WHERE project=? ORDER BY created_at DESC LIMIT ?',
                (project, limit)
            ).fetchall()
        return [
            {
                "type": r[0],
                "content": r[1],
                "metadata": json.loads(r[2] or '{}'),
                "created_at": r[3]
            }
            for r in rows
        ]

    def stats(self, project: str) -> dict:
        types: dict[str, int] = {}
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute(
                    'SELECT type, COUNT(*) FROM observations '
                    'WHERE project=? GROUP BY type',
                    (project,)
                ).fetchall()
            types = {r[0]: r[1] for r in rows}
        except Exception as e:
            warn("memory", f"stats query error: {e}")
        return {
            "types": types,
            "total": sum(types.values()),
            "rejects": self._read_rejects()
        }

    def _read_rejects(self) -> dict:
        try:
            with open(REJECT_FILE, encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            return {}
        return data if isinstance(data, dict) else {}

    def _prune_summaries(self, project: str) -> None:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    'DELETE FROM summaries WHERE project=? AND id NOT IN ('
                    '  SELECT id FROM summaries WHERE project=? '
                    '  ORDER BY created_at DESC, id DESC LIMIT ?'
                    ')',
                    (project, project, SUMMARY_TABLE_CAP)
                )
                conn.commit()
        except Exception as e:
            warn("memory", f"summaries prune error: {e}")

    def summarize_session(self, project: str, session_id: str = '') -> str:
        recent = self.get_recent(project, 50)
        if not recent:
            return "No observations recorded."
        lines = [f"[{o['type']}] {o['content'][:120]}" for o in recent[:20]]
        summary = "\n".join(lines)
        now = datetime.utcnow().isoformat()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                'INSERT INTO summaries (project, session_id, summary, created_at) VALUES (?,?,?,?)',
                (project, session_id, summary, now)
            )
            conn.commit()
        self._prune_summaries(project)
        return summary

    def export(self, project: str) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            obs = conn.execute(
                'SELECT type, content, metadata, created_at FROM observations WHERE project=? ORDER BY created_at ASC',
                (project,)
            ).fetchall()
            sums = conn.execute(
                'SELECT session_id, summary, created_at FROM summaries WHERE project=? ORDER BY created_at ASC',
                (project,)
            ).fetchall()
        return {
            'observations': [{'type': r[0], 'content': r[1], 'metadata': json.loads(r[2] or '{}'), 'created_at': r[3]} for r in obs],
            'summaries': [{'session_id': r[0], 'summary': r[1], 'created_at': r[2]} for r in sums],
        }

    def import_data(self, project: str, data: dict) -> dict:
        obs_list = data.get('observations', [])
        sums_list = data.get('summaries', [])
        imported_obs = 0
        imported_sums = 0
        for obs in obs_list:
            try:
                content = obs.get('content', '')
                obs_type = obs.get('type', 'general')
                meta = obs.get('metadata', '{}')
                try:
                    meta_dict = json.loads(meta) if isinstance(meta, str) else meta
                    if not isinstance(meta_dict, dict):
                        meta_dict = {}
                except (json.JSONDecodeError, TypeError):
                    meta_dict = {}
                should_save = False
                with _lock:
                    with sqlite3.connect(self.db_path) as conn:
                        exists = conn.execute(
                            'SELECT id FROM observations WHERE project=? AND type=? AND content=?',
                            (project, obs_type, content)
                        ).fetchone()
                    if not exists:
                        should_save = True
                if should_save:
                    self.save_observation(project, obs_type, content, meta_dict)
                    imported_obs += 1
            except Exception as e:
                warn("memory", f"import error: {e}")
        for s in sums_list:
            try:
                with sqlite3.connect(self.db_path) as conn:
                    exists = conn.execute(
                        'SELECT id FROM summaries WHERE project=? AND summary=?',
                        (project, s.get('summary', ''))
                    ).fetchone()
                if not exists:
                    with sqlite3.connect(self.db_path) as conn:
                        conn.execute(
                            'INSERT INTO summaries (project, session_id, summary, created_at) VALUES (?,?,?,?)',
                            (project, s.get('session_id', ''), s.get('summary', ''), s.get('created_at', datetime.utcnow().isoformat()))
                        )
                        conn.commit()
                    imported_sums += 1
            except Exception as e:
                warn("memory", f"import error: {e}")
        return {'observations_imported': imported_obs, 'summaries_imported': imported_sums}
