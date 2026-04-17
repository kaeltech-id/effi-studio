# Feature: Memory Tiered Cap

## Impact Analysis
- Files affected: `server/memory.py`
- ⚠️ Breaking change risk: none — additive pruning only, existing API unchanged

## Reusable Existing Code
- `collection.delete(ids=[...])` pattern at `server/docs.py:136` — same ChromaDB delete call, confirmed working
- `_get_collection(project)` at `server/memory.py:114` — reused as-is in _prune_type

## Tasks
- [ ] Task 1: Add TYPE_CAPS constant [S] — define per-type hard caps as module-level dict in memory.py
- [ ] Task 2: Implement _prune_type() method [S] — deletes oldest excess rows from SQLite + ChromaDB for one project+type
- [ ] Task 3: Wire _prune_type() into save_observation() [S] — call after insert if type has a cap
- [ ] Task 4: Implement _prune_on_startup() and call from __init__ [S] — retroactive cleanup of existing noise

---

## Per Task Detail

**Task 1 — Add TYPE_CAPS constant** `S`
- File: `server/memory.py`
- Reuse: none
- Code sample: add after `SCHEMA_VERSION = 1` line (line 10):
  ```python
  TYPE_CAPS: dict[str, int] = {
      "tool_use": 200,
      "summary": 50,
  }
  ```
  Types absent from this dict (e.g. `decision`) are uncapped.
- Edge cases: none — dict lookup returns None for absent keys (used in Task 3)
- ⚠️ Breaking change: none
- Verify: `grep "TYPE_CAPS" server/memory.py` returns the constant definition
- Dependencies: none

---

**Task 2 — Implement _prune_type() method** `S`
- File: `server/memory.py` — add as a new private method after `_get_collection()`
- Reuse: `_get_collection(project)` for ChromaDB handle; `collection.delete(ids=...)` pattern from `docs.py:136`
- Code sample:
  ```python
  def _prune_type(self, project: str, obs_type: str, cap: int) -> None:
      try:
          with sqlite3.connect(self.db_path) as conn:
              rows = conn.execute(
                  'SELECT id FROM observations WHERE project=? AND type=? ORDER BY created_at ASC',
                  (project, obs_type)
              ).fetchall()
          if len(rows) <= cap:
              return
          excess_int_ids = [r[0] for r in rows[:-cap]]
          excess_str_ids = [str(i) for i in excess_int_ids]
          placeholders = ','.join('?' * len(excess_int_ids))
          with sqlite3.connect(self.db_path) as conn:
              conn.execute(
                  f'DELETE FROM observations WHERE id IN ({placeholders})',
                  excess_int_ids
              )
              conn.commit()
          collection = self._get_collection(project)
          collection.delete(ids=excess_str_ids)
      except Exception:
          pass
  ```
- Edge cases: `rows[:-cap]` is correct when `len(rows) > cap`; early return guards the empty-excess case
- ⚠️ Breaking change: none
- Verify: `python3 -c "import sys; sys.path.insert(0,'server'); from memory import MemoryEngine; print(hasattr(MemoryEngine, '_prune_type'))"`
- Dependencies: Task 1

---

**Task 3 — Wire _prune_type() into save_observation()** `S`
- File: `server/memory.py` — `save_observation()` method, append after the ChromaDB `collection.add()` call (line ~133)
- Reuse: `TYPE_CAPS` from Task 1, `_prune_type()` from Task 2
- Code sample: append at the end of `save_observation()`:
  ```python
  cap = TYPE_CAPS.get(obs_type)
  if cap is not None:
      self._prune_type(project, obs_type, cap)
  ```
- Edge cases: `TYPE_CAPS.get()` returns `None` for uncapped types — no prune called for `decision` etc.
- ⚠️ Breaking change: none — adds ~10ms on capped saves when pruning needed, negligible for local use
- Verify: send 201 `tool_use` observations via `/memory/observe`, then `SELECT COUNT(*) FROM observations WHERE type='tool_use'` should return ≤200
- Dependencies: Task 1, Task 2

---

**Task 4 — Implement _prune_on_startup() and call from __init__** `S`
- File: `server/memory.py` — new private method + one `__init__` call after `self._reconcile_chromadb()`
- Reuse: `TYPE_CAPS`, `_prune_type()`
- Code sample (method):
  ```python
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
      except Exception:
          pass
  ```
  Wire in `__init__`, after `self._reconcile_chromadb()`:
  ```python
  self._prune_on_startup()
  ```
- Edge cases: `TYPE_CAPS` always has entries in practice; `except Exception: pass` catches SQL edge cases
- ⚠️ Breaking change: none — one-time pruning on startup, idempotent
- Verify: restart worker (`curl -s http://localhost:37777/health`), then `SELECT COUNT(*), type FROM observations GROUP BY type` — `tool_use` ≤200, `summary` ≤50
- Dependencies: Task 1, Task 2
