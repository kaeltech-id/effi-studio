# Decision: High Priority Fixes Group 1 — Data Integrity

## Problem
Two High priority issues in the EffiClaude worker threaten data integrity during parallel execution (the primary use case). Issue #3: `server/worker.py` runs with `threaded=True` but has no locks — concurrent `/memory/observe` and `/graph/index` calls can race on SQLite and ChromaDB writes. Issue #6: the FTS index insert in `save_observation()` opens a separate SQLite connection after the main observation is committed, so a crash between the two commits leaves the observation unsearchable via FTS keyword search.

## Options Explored
- **Option 1 — Single batch all 5**: Fix all 5 High issues in one pass → not chosen for Group 1 because threading locks are the riskiest change and deserve isolated review before mixing with logic/security/UX fixes
- **Option 2 — Two groups (data integrity first, then rest)**: Group 1 = #3 + #6, Group 2 = #4 + #5 + #7 → CHOSEN
- **Option 3 — Sequential one by one**: Fix each issue independently → not chosen because #3 and #6 both touch memory.py and are cleaner as one combined diff

## Chosen Approach
Fix issues #3 and #6 together in two files (`server/memory.py` and `server/graph.py`).

In `server/memory.py`: add `import threading` and a module-level `_lock = threading.Lock()`. Wrap the entire SQLite + ChromaDB write block in `save_observation()` with `with _lock:`, and merge the FTS INSERT into the same SQLite connection/transaction as the main observation INSERT (before `conn.commit()`). Also wrap the per-observation write block inside `import_data()` with the same lock.

In `server/graph.py`: add `import threading` and a module-level `_lock = threading.Lock()`. Wrap the DELETE + INSERT block inside `index_file()` with `with _lock:`.

Group 2 (issues #4 ChromaDB reconciliation, #5 graph import validation, #7 docs async refresh) will be a separate brainstorm + feature after Group 1 ships and is validated.

## Key Assumptions
- Flask runs single-process (not gunicorn multi-worker) — module-level lock is shared across all threads in the same process correctly
- ChromaDB is not thread-safe internally — lock must cover both the SQLite write and the ChromaDB add
- FTS virtual table creation failure (already silent) is kept as-is; only the FTS INSERT is moved into the main transaction

## Risks & Mitigations
- Lock held during ChromaDB add (can be slow) → acceptable tradeoff; ChromaDB adds are fast in practice and correctness > throughput for a dev tool
- Lock in graph.py blocks concurrent indexing → acceptable; graph writes are infrequent (only after /ec-execute)

## Out of Scope
- WAL mode for SQLite (overkill for single-process local tool)
- Issues #4, #5, #7 (Group 2 — next brainstorm)

_Created: 2026-04-18_
