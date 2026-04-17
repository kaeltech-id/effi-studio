# Feature: High Priority Fixes Group 2 — Reconcile, Validation, Async Docs

## Impact Analysis
- Files affected: `server/memory.py`, `server/graph.py`, `server/docs.py`
- ⚠️ Breaking change risk: none — same public API, internal behavior only

## Reusable Existing Code
- `_lock = threading.Lock()` pattern already in `memory.py` + `graph.py` — replicate in `docs.py`
- `warn("memory", ...)` / `warn("docs", ...)` already imported in all three files

## Tasks
- [ ] Task 1: fix-chromadb-reconcile [M] — replace count-based guard with ID-set diff, batch chroma get, add orphan cleanup, wrap writes in _lock
- [ ] Task 2: fix-graph-import-validation [S] — replace direct dict access with .get() + required-field guard + per-record try/except
- [ ] Task 3: fix-docs-async-refresh [S] — add threading lock, background daemon thread for stale refresh, fix existing_ids bug in fetch_and_cache

---

## Per Task Detail

**Task 1 — fix-chromadb-reconcile** `M`
- File: `server/memory.py`
- Reuse: existing `_lock`, `warn`, `json`, `sqlite3.connect(self.db_path)`
- Code sample:

  Replace `_reconcile_chromadb()` (lines 97–132) with:
  ```python
  def _reconcile_chromadb(self):
      try:
          with sqlite3.connect(self.db_path) as conn:
              projects = [r[0] for r in conn.execute(
                  'SELECT DISTINCT project FROM observations'
              ).fetchall()]

          for project in projects:
              collection = self._get_collection(project)

              chroma_ids = set()
              offset = 0
              BATCH = 500
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

              with _lock:
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
  ```

- Edge cases: empty collection (chroma_ids = {}, loop exits immediately on first batch); project with zero rows (missing and orphans both empty, no-ops)
- ⚠️ Breaking change: none
- Verify: `grep -n "BATCH\|chroma_ids\|sqlite_ids\|orphans" server/memory.py` → returns 6+ lines in _reconcile_chromadb
- Dependencies: none

---

**Task 2 — fix-graph-import-validation** `S`
- File: `server/graph.py`
- Reuse: existing `sqlite3.connect(self.db_path)`, `datetime.utcnow().isoformat()`
- Code sample:

  Replace `import_data()` (lines 386–417) with:
  ```python
  def import_data(self, project: str, data: dict) -> dict:
      now = datetime.utcnow().isoformat()
      nodes = data.get('nodes', [])
      edges = data.get('edges', [])
      imported_nodes = 0
      imported_edges = 0
      with sqlite3.connect(self.db_path) as conn:
          for node in nodes:
              try:
                  fp = node.get('file_path', '')
                  name = node.get('name', '')
                  node_type = node.get('node_type', '')
                  if not fp or not name or not node_type:
                      continue
                  exists = conn.execute(
                      'SELECT id FROM graph_nodes WHERE project=? AND file_path=? AND name=? AND node_type=?',
                      (project, fp, name, node_type)
                  ).fetchone()
                  if not exists:
                      conn.execute(
                          'INSERT INTO graph_nodes (project, file_path, name, node_type, start_line, end_line, language, updated_at) VALUES (?,?,?,?,?,?,?,?)',
                          (project, fp, name, node_type,
                           node.get('start_line', 0), node.get('end_line', 0), node.get('language', ''), now)
                      )
                      imported_nodes += 1
              except Exception:
                  pass
          for edge in edges:
              try:
                  source = edge.get('source_file', '')
                  target = edge.get('target_ref', '')
                  if not source or not target:
                      continue
                  edge_type = edge.get('edge_type', 'imports')
                  exists = conn.execute(
                      'SELECT id FROM graph_edges WHERE project=? AND source_file=? AND target_ref=? AND edge_type=?',
                      (project, source, target, edge_type)
                  ).fetchone()
                  if not exists:
                      conn.execute(
                          'INSERT INTO graph_edges (project, source_file, target_ref, edge_type, updated_at) VALUES (?,?,?,?,?)',
                          (project, source, target, edge_type, now)
                      )
                      imported_edges += 1
              except Exception:
                  pass
          conn.commit()
      return {'nodes_imported': imported_nodes, 'edges_imported': imported_edges}
  ```

- Edge cases: empty nodes/edges list (loops don't execute, returns 0/0); node missing required field (skipped via `continue`); duplicate record (skipped via `if not exists`)
- ⚠️ Breaking change: none — same return shape, same behavior for valid input
- Verify: `grep -n "\.get(" server/graph.py | grep -E "file_path|source_file"` → returns lines using `.get()` instead of direct access
- Dependencies: none (different file from Task 1 and Task 3 — runs in parallel)

---

**Task 3 — fix-docs-async-refresh** `S`
- File: `server/docs.py`
- Reuse: threading pattern from `memory.py` / `graph.py`
- Code sample:

  **Step A** — add after line 7 (`from logger import warn`):
  ```python
  import threading

  _lock = threading.Lock()
  ```

  **Step B** — in `fetch_and_cache()`, replace the SQLite + ChromaDB write block (lines 118–143) and fix the `existing_ids` bug. The full replacement from `now = datetime.utcnow().isoformat()` to `return len(chunks)`:
  ```python
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
  ```
  Note: also fixes the existing bug at line 132 — `{r['id'] for r in collection.get()['ids']}` was doing string subscript (`r['id']` on a str), changed to `set(collection.get()['ids'])`.

  **Step C** — in `search()`, replace lines 188–189:
  ```python
              if self._is_stale(lib_name):
                  self.fetch_and_cache(lib_name)
  ```
  with:
  ```python
              if self._is_stale(lib_name):
                  threading.Thread(target=self.fetch_and_cache, args=(lib_name,), daemon=True).start()
  ```

- Edge cases: library never fetched (count=0 in chroma, background thread fires and populates on next search); two concurrent searches on same stale library (both fire a daemon thread; `_lock` in `fetch_and_cache` serializes writes — second thread overwrites with same data, harmless)
- ⚠️ Breaking change: none — search returns same shape; first search for stale library returns current cache state (may be empty) instead of blocking
- Verify: `grep -n "_lock\|threading\|daemon" server/docs.py` → returns 4+ lines (import, declaration, Thread start, with _lock)
- Dependencies: none (different file from Task 1 and Task 2 — runs in parallel)
