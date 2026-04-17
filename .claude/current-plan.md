# Feature: High Priority Fixes Group 1 — Data Integrity

## Impact Analysis
- Files affected: `server/memory.py`, `server/graph.py`
- ⚠️ Breaking change risk: none — same public API, only internal write serialization added

## Reusable Existing Code
- `from logger import warn` already imported in both files — no new imports beyond `threading`

## Tasks
- [ ] Task 1: fix-memory-integrity [S] — add threading lock + merge FTS INSERT into main transaction in save_observation()
- [ ] Task 2: fix-graph-lock [S] — add threading lock around DELETE+INSERT block in index_file()

---

## Per Task Detail

**Task 1 — fix-memory-integrity** `S`
- File: `server/memory.py`
- Reuse: existing `warn` import — already in place
- Code sample:

  Add after existing imports (line 8, after `from logger import warn`):
  ```python
  import threading
  
  _lock = threading.Lock()
  ```

  Replace `save_observation()` body (lines 196-227) with:
  ```python
  def save_observation(self, project, obs_type, content, metadata=None):
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
              except Exception:
                  pass
              conn.commit()
          collection = self._get_collection(project)
          for attempt in range(2):
              try:
                  collection.add(
                      documents=[content],
                      metadatas=[{"type": obs_type, "created_at": now, **(metadata or {})}],
                      ids=[str(obs_id)]
                  )
                  break
              except Exception as e:
                  if attempt == 1:
                      warn("memory", f"chromadb add failed: {e}")
      cap = TYPE_CAPS.get(obs_type)
      if cap is not None:
          self._prune_type(project, obs_type, cap)
  ```

  Key changes:
  - `import threading` + `_lock = threading.Lock()` added at module level
  - Entire SQLite + ChromaDB block wrapped in `with _lock:`
  - FTS INSERT moved inside the first `sqlite3.connect()` block (before `conn.commit()`), removing the second separate connection
  - FTS exception still silent (fire-and-forget as before)
  - `_prune_type()` call stays outside the lock (read-heavy, not a race target)

- Edge cases: FTS table may not exist — `try/except` around FTS INSERT is kept, same as before
- ⚠️ Breaking change: none
- Verify: `grep -n "_lock" server/memory.py` → returns 2 lines (declaration + usage); `grep -n "sqlite3.connect" server/memory.py | grep -c "save_observation" || python3 -c "import ast, sys; src=open('server/memory.py').read(); print('ok')"` — check there's only one connect block in save_observation
- Dependencies: none

---

**Task 2 — fix-graph-lock** `S`
- File: `server/graph.py`
- Reuse: existing `warn` import — already in place
- Code sample:

  Add after existing imports (line 6, after `from logger import warn`):
  ```python
  import threading
  
  _lock = threading.Lock()
  ```

  Wrap the write block in `index_file()` (lines 135-151):
  ```python
  with _lock:
      with sqlite3.connect(self.db_path) as conn:
          conn.execute('DELETE FROM graph_nodes WHERE project=? AND file_path=?', (project, rel_path))
          conn.execute('DELETE FROM graph_edges WHERE project=? AND source_file=?', (project, rel_path))

          for node in nodes:
              conn.execute(
                  'INSERT INTO graph_nodes (project, file_path, name, node_type, start_line, end_line, language, updated_at) VALUES (?,?,?,?,?,?,?,?)',
                  (project, rel_path, node['name'], node['type'], node['start'], node['end'], lang, now)
              )

          for imp in imports:
              conn.execute(
                  'INSERT INTO graph_edges (project, source_file, target_ref, edge_type, updated_at) VALUES (?,?,?,?,?)',
                  (project, rel_path, imp, 'imports', now)
              )

          conn.commit()
  ```

  Key changes:
  - `import threading` + `_lock = threading.Lock()` added at module level
  - Existing `with sqlite3.connect()` block wrapped in `with _lock:`

- Edge cases: none — lock just serializes writes, logic unchanged
- ⚠️ Breaking change: none
- Verify: `grep -n "_lock" server/graph.py` → returns 2 lines (declaration + usage)
- Dependencies: none (different file from Task 1 — both run in parallel)
