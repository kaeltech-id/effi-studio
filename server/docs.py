import sqlite3
import json
import re
import requests
import chromadb
from datetime import datetime
from logger import warn
import threading

_lock = threading.Lock()


LIBRARY_SOURCES = {
    'react':        ('npm', 'https://registry.npmjs.org/react'),
    'next':         ('npm', 'https://registry.npmjs.org/next'),
    'nextjs':       ('npm', 'https://registry.npmjs.org/next'),
    'tailwindcss':  ('npm', 'https://registry.npmjs.org/tailwindcss'),
    'typescript':   ('npm', 'https://registry.npmjs.org/typescript'),
    'vue':          ('npm', 'https://registry.npmjs.org/vue'),
    'nuxt':         ('npm', 'https://registry.npmjs.org/nuxt'),
    'svelte':       ('npm', 'https://registry.npmjs.org/svelte'),
    'express':      ('npm', 'https://registry.npmjs.org/express'),
    'prisma':       ('npm', 'https://registry.npmjs.org/@prisma/client'),
    'zod':          ('npm', 'https://registry.npmjs.org/zod'),
    'axios':        ('npm', 'https://registry.npmjs.org/axios'),
    'fastapi':      ('pypi', 'https://pypi.org/pypi/fastapi/json'),
    'django':       ('pypi', 'https://pypi.org/pypi/django/json'),
    'flask':        ('pypi', 'https://pypi.org/pypi/flask/json'),
    'sqlalchemy':   ('pypi', 'https://pypi.org/pypi/sqlalchemy/json'),
    'pydantic':     ('pypi', 'https://pypi.org/pypi/pydantic/json'),
}

DOC_TTL_DAYS = 7


class DocsEngine:
    def __init__(self, db_path, chroma_path):
        self.db_path = db_path
        self.chroma_client = chromadb.PersistentClient(path=chroma_path)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS docs_libraries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    project TEXT NOT NULL DEFAULT '',
                    source_type TEXT,
                    last_fetched TEXT,
                    UNIQUE(name, project)
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS docs_chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    library TEXT NOT NULL,
                    chunk_index INTEGER,
                    content TEXT NOT NULL,
                    heading TEXT,
                    created_at TEXT NOT NULL
                )
            ''')
            conn.commit()

    def _get_collection(self, library):
        safe = re.sub(r'[^a-z0-9]', '_', library.lower())[:40]
        return self.chroma_client.get_or_create_collection(f"docs_{safe}")

    def _is_stale(self, name):
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                'SELECT last_fetched FROM docs_libraries WHERE name=?', (name,)
            ).fetchone()
        if not row or not row[0]:
            return True
        return (datetime.utcnow() - datetime.fromisoformat(row[0])).days >= DOC_TTL_DAYS

    def register_library(self, name, project='', source_type=None):
        name = name.lower()
        if source_type is None:
            source_type = LIBRARY_SOURCES.get(name, ('npm',))[0]
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                'INSERT OR IGNORE INTO docs_libraries (name, project, source_type) VALUES (?,?,?)',
                (name, project, source_type)
            )
            conn.commit()
        self.fetch_and_cache(name)

    def fetch_and_cache(self, name):
        name = name.lower()
        source_info = LIBRARY_SOURCES.get(name)
        if not source_info:
            return 0

        source_type, url = source_info
        try:
            resp = requests.get(url, timeout=15, headers={'Accept': 'application/json'})
            if resp.status_code != 200:
                return 0
            data = resp.json()

            if source_type == 'npm':
                version = data.get('dist-tags', {}).get('latest', '')
                description = data.get('description', '')
                readme = data.get('readme', '')[:8000]
                content = f"# {name} v{version}\n{description}\n\n{readme}"
            elif source_type == 'pypi':
                info = data.get('info', {})
                content = (
                    f"# {name} v{info.get('version', '')}\n"
                    f"{info.get('summary', '')}\n\n"
                    f"{info.get('description', '')[:8000]}"
                )
            else:
                return 0

            chunks = self._chunk_markdown(content, name)
            now = datetime.utcnow().isoformat()

            with _lock:
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute('DELETE FROM docs_chunks WHERE library=?', (name,))
                    for i, (heading, chunk) in enumerate(chunks):
                        conn.execute(
                            'INSERT INTO docs_chunks (library, chunk_index, content, heading, created_at) VALUES (?,?,?,?,?)',
                            (name, i, chunk, heading, now)
                        )
                    conn.execute(
                        'UPDATE docs_libraries SET last_fetched=? WHERE name=?', (now, name)
                    )
                    conn.commit()

                collection = self._get_collection(name)
                existing_ids = set(collection.get()['ids']) if collection.count() > 0 else set()
                new_ids = [f"{name}_{i}" for i in range(len(chunks))]

                ids_to_delete = [eid for eid in existing_ids if not eid.startswith(name + '_')]
                if ids_to_delete:
                    collection.delete(ids=ids_to_delete)

                collection.upsert(
                    documents=[c for _, c in chunks],
                    metadatas=[{"library": name, "heading": h} for h, _ in chunks],
                    ids=new_ids
                )
            return len(chunks)

        except Exception as e:
            warn("docs", f"fetch failed ({name}): {e}")
            return 0

    def _chunk_markdown(self, content, library, max_chars=600):
        chunks = []
        current_heading = library
        current_lines = []

        for line in content.split('\n'):
            if line.startswith('#'):
                if current_lines:
                    text = '\n'.join(current_lines).strip()
                    if text:
                        chunks.append((current_heading, text))
                current_heading = line.lstrip('#').strip()
                current_lines = [line]
            else:
                current_lines.append(line)
                if len('\n'.join(current_lines)) > max_chars:
                    chunks.append((current_heading, '\n'.join(current_lines).strip()))
                    current_lines = []

        if current_lines:
            text = '\n'.join(current_lines).strip()
            if text:
                chunks.append((current_heading, text))

        return chunks or [(library, content[:600])]

    def search(self, project, query, limit=5):
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT name FROM docs_libraries WHERE project=? OR project=''",
                (project,)
            ).fetchall()

        if not rows:
            return []

        all_results = []
        for (lib_name,) in rows:
            if self._is_stale(lib_name):
                threading.Thread(target=self.fetch_and_cache, args=(lib_name,), daemon=True).start()
            collection = self._get_collection(lib_name)
            try:
                count = collection.count()
                if count == 0:
                    continue
                results = collection.query(
                    query_texts=[query],
                    n_results=min(limit, count)
                )
                for doc, meta, dist in zip(
                    results['documents'][0],
                    results['metadatas'][0],
                    results['distances'][0]
                ):
                    all_results.append({
                        "library": lib_name,
                        "heading": meta.get('heading', ''),
                        "content": doc,
                        "distance": dist
                    })
            except Exception as e:
                warn("docs", f"search error ({lib_name}): {e}")
                continue

        all_results.sort(key=lambda x: x['distance'])
        return all_results[:limit]

    def list_libraries(self, project=''):
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT name, source_type, last_fetched FROM docs_libraries WHERE project=? OR project=''",
                (project,)
            ).fetchall()
        return [{"name": r[0], "source_type": r[1], "last_fetched": r[2]} for r in rows]
