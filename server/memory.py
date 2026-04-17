import sqlite3
import json
import hashlib
import chromadb
from datetime import datetime


class MemoryEngine:
    def __init__(self, db_path, chroma_path):
        self.db_path = db_path
        self.chroma_client = chromadb.PersistentClient(path=chroma_path)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
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
            conn.commit()

    def _get_collection(self, project):
        key = hashlib.md5(project.encode()).hexdigest()[:8]
        return self.chroma_client.get_or_create_collection(f"mem_{key}")

    def save_observation(self, project, obs_type, content, metadata=None):
        now = datetime.utcnow().isoformat()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                'INSERT INTO observations (project, type, content, metadata, created_at) VALUES (?,?,?,?,?)',
                (project, obs_type, content, json.dumps(metadata or {}), now)
            )
            obs_id = cursor.lastrowid
            conn.commit()

        collection = self._get_collection(project)
        collection.add(
            documents=[content],
            metadatas=[{"type": obs_type, "created_at": now, **(metadata or {})}],
            ids=[str(obs_id)]
        )

    def search(self, project, query, limit=5):
        collection = self._get_collection(project)
        try:
            count = collection.count()
            if count == 0:
                return []
            results = collection.query(
                query_texts=[query],
                n_results=min(limit, count)
            )
            return [
                {"content": doc, "metadata": meta, "distance": dist}
                for doc, meta, dist in zip(
                    results['documents'][0],
                    results['metadatas'][0],
                    results['distances'][0]
                )
            ]
        except Exception:
            return []

    def get_recent(self, project, limit=20):
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

    def summarize_session(self, project, session_id=''):
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
