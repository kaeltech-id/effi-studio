from __future__ import annotations

import os
import sqlite3
import json
import hashlib
import chromadb
from datetime import datetime
from logger import warn
import threading

_lock = threading.Lock()

SCHEMA_VERSION = 1
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
}
_CHROMA_FALLBACK_THRESHOLD = float(os.getenv('EFFICLAUDE_FTS_THRESHOLD', '1.2'))


class MemoryEngine:
    def __init__(self, db_path, chroma_path):
        self.db_path = db_path
        self.chroma_client = chromadb.PersistentClient(path=chroma_path)
        self._init_db()
        self._migrate()
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
                            conn.execute(sql)
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
                        batch = collection.get(limit=BATCH, offset=offset)['ids']
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
                            metadatas=[{"type": r[1], "created_at": r[4], **json.loads(r[3] or '{}')} for r in missing],
                            ids=[str(r[0]) for r in missing]
                        )
                    if orphans:
                        collection.delete(ids=orphans)
        except Exception as e:
            warn("memory", f"chromadb reconcile error: {e}")

    def _get_collection(self, project):
        key = hashlib.md5(project.encode()).hexdigest()[:8]
        return self.chroma_client.get_or_create_collection(f"mem_{key}")

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
                conn.commit()
            if excess_int_ids:
                with _lock:
                    collection = self._get_collection(project)
                    collection.delete(ids=[str(i) for i in excess_int_ids])
        except Exception as e:
            warn("memory", f"prune error (type={obs_type}): {e}")

    def _prune_on_startup(self) -> None:
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
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute(
                    '''SELECT o.id, o.type, o.content, o.metadata, o.created_at
                       FROM obs_fts f
                       JOIN observations o ON f.rowid = o.id
                       WHERE f.content MATCH ? AND o.project = ?
                       ORDER BY o.created_at DESC
                       LIMIT ?''',
                    (query, project, limit)
                ).fetchall()
            return [
                {
                    "content": r[2],
                    "metadata": {**json.loads(r[3] or '{}'), "type": r[1], "created_at": r[4]},
                    "distance": 0.5
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
                cursor = conn.execute(
                    'INSERT INTO observations (project, type, content, metadata, created_at) VALUES (?,?,?,?,?)',
                    (project, obs_type, content, json.dumps(metadata or {}), now)
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
                        metadatas=[{"type": obs_type, "created_at": now, **(metadata or {})}],
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
                n_results=min(limit, count)
            )
            items = [
                {"content": doc, "metadata": meta, "distance": dist}
                for doc, meta, dist in zip(
                    results['documents'][0],
                    results['metadatas'][0],
                    results['distances'][0]
                )
            ]
            if all(item['distance'] > _CHROMA_FALLBACK_THRESHOLD for item in items):
                fts = self._fts_search(project, query, limit)
                if fts:
                    return fts
            return items
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
