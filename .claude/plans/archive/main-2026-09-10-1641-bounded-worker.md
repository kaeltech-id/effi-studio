## Feature: Bounded Worker

### Impact Analysis
- Files affected: `server/memory.py`, `server/docs.py`, `server/worker.py`, `server/logger.py`, `server/stop.sh`, `launchers/com.efficlaude.worker.plist`, `launchers/efficlaude-worker.service`, `tests/test_memory.py`, `tests/test_health.py` (new)
- ⚠️ Breaking change risk:
  - ChromaDB storage layout changes from 185 per-entity collections to 2 shared collections. The existing `~/.efficlaude/chroma` directory (126 MB) is wiped once and rebuilt from SQLite. Embeddings that have no SQLite row are lost by design — those are the orphans polluting search.
  - `docs_*` collections are wiped in the same migration; `docs_chunks` (27 rows) is the rebuild source, and `fetch_and_cache` re-populates on next stale check.
  - `worker.pid` semantics change: worker.py becomes the sole writer. `start.sh` and `watchdog.sh` keep spawning but no longer own the truth.

### Reusable Existing Code
- `MemoryEngine._reconcile_chromadb` at `server/memory.py:101` — already rebuilds ChromaDB from SQLite; reused as the migration engine rather than writing a new rebuild path.
- `TYPE_CAPS` + `_prune_type` at `server/memory.py:15,144` — existing retention pattern; the `summaries` table cap follows it instead of inventing a second mechanism.
- `logger.warn` line-cap logic at `server/logger.py:19-22` — same size-bounding idea reused for `worker.log`, extracted into a shared helper.
- `_CHROMA_FALLBACK_THRESHOLD` FTS fallback at `server/memory.py:260-263` — already the safety net for weak vector hits; relied on to cover recall loss from `where`-filtering.
- `docs_chunks` table at `server/docs.py:59` — source of truth for rebuilding the docs vector index.

### Grounding
Measured 2026-08-11 against the repo at `/Users/admin/Projects/EffiClaude`. Real command output only.

Baseline string counts (`grep -c "{string}" {file}`):
- `server/memory.py` `_get_collection` → 5
- `server/memory.py` `collection.delete` → 2
- `server/memory.py` `obs_fts` → 4
- `server/memory.py` `TYPE_CAPS` → 5
- `server/memory.py` `where=` → 0
- `server/memory.py` `_sanitize` → 0
- `server/docs.py` `_get_collection` → 3
- `server/docs.py` `where=` → 0
- `server/docs.py` `collection.query` → 1
- `server/worker.py` `status": "ok"` → 1
- `server/worker.py` `degraded` → 0
- `server/worker.py` `worker.pid` → 0
- `server/worker.py` `rotate` → 0
- `server/logger.py` `MAX_LOG_LINES` → 3
- `server/stop.sh` `PIDFILE` → 10
- `server/stop.sh` `launchctl` → 0
- `launchers/com.efficlaude.worker.plist` `key` → 7
- `launchers/com.efficlaude.worker.plist` `SoftResourceLimits` → 0
- `launchers/efficlaude-worker.service` `Limit` → 0
- `install.sh` `launchctl` → 2

Baseline line counts (`wc -l {file}`):
- `server/memory.py` → 363
- `server/docs.py` → 232
- `server/worker.py` → 346
- `server/logger.py` → 30
- `server/start.sh` → 14
- `server/stop.sh` → 30
- `server/watchdog.sh` → 30
- `launchers/com.efficlaude.worker.plist` → 23
- `launchers/efficlaude-worker.service` → 15
- `install.sh` → 265
- `tests/test_memory.py` → 58
- `tests/conftest.py` → 15

Baseline test result: `python3 -m pytest tests/ -q` → **139 passed, 1 warning in 1.70s**

⚠️ Corrected during execution. The bare `python3 -m pytest -q` command reports only **106 passed** because the tracked file `server/tests/test_hooks.py` (12 tests, last modified 2026-04-24) collides with `tests/test_hooks.py` (57 tests) under `--import-mode=importlib`, so 45 hook tests never run. All test Verify steps below therefore pin the explicit `tests/` path. The stale duplicate is a pre-existing defect outside this plan's scope — recorded here and carried into review, not fixed by these tasks.

Baseline runtime measurements (live system, worker PID 1122, uptime 5 days):
- `lsof -p 1122 | wc -l` → 325 ; `lsof -p 1122 | grep -c chroma` → 237
- `launchctl limit maxfiles` → soft **256**, hard unlimited
- `sqlite3 ~/.efficlaude/chroma/chroma.sqlite3 "SELECT COUNT(*), SUM(name LIKE 'mem_%') FROM collections"` → **185 total, 169 `mem_*`** (remaining 16 are `docs_*`)
- `du -sh ~/.efficlaude/chroma` → **126M**
- `du -h ~/.efficlaude/worker.log` → **30M** ; `wc -l` → **913341**
- `ls -la ~/.efficlaude/efficlaude.db` → **31825920 bytes (31.8 MB)**
- `SELECT COUNT(*) FROM observations` → **9982** ; `FROM obs_fts` → **36467** ; `FROM summaries` → **4209**
- `SELECT COUNT(*) FROM obs_fts f LEFT JOIN observations o ON f.rowid=o.id WHERE o.id IS NULL` → **26543** orphans
- `curl -s localhost:37777/health` → `{"error_counts":{"docs":16,"graph":10,"memory":505,"worker":593},"status":"ok",...}`
- `cat ~/.efficlaude/worker.pid` → **9934** (process dead; real listener is PID 1122 owned by launchd)

Baseline FD-cost probe (chromadb 1.5.8, isolated process, `lsof -p $$ | wc -l`):
- baseline → 58 FDs
- after creating 30 collections → 190 FDs (**+132**, ≈4.4 FD per collection)
- after 1 shared collection holding 30 projects via metadata → 200 FDs (**+10**, constant)
- `where={"project": "p7"}` on `query` returned exactly the p7 document; `where` accepted by `query`, `get`, and `delete`

Verified anchors:
- `def _get_collection(self, project):` → `server/memory.py:140`
- `def _prune_type(self, project: str, obs_type: str, cap: int) -> None:` → `server/memory.py:144`
- `def _prune_on_startup(self) -> None:` → `server/memory.py:168`
- `def _fts_search(self, project: str, query: str, limit: int) -> list:` → `server/memory.py:181`
- `def save_observation(self, project: str, obs_type: str, content: str, metadata=None) -> None:` → `server/memory.py:205`
- `def search(self, project: str, query: str, limit: int = 5) -> list:` → `server/memory.py:242`
- `def summarize_session(self, project: str, session_id: str = '') -> str:` → `server/memory.py:286`
- `def _reconcile_chromadb(self) -> None:` → `server/memory.py:101`
- `def __init__(self, db_path, chroma_path):` → `server/memory.py:31`
- `TYPE_CAPS: dict[str, int] = {` → `server/memory.py:15`
- `f'DELETE FROM observations WHERE id IN ({placeholders})',` → `server/memory.py:157`
- `def _get_collection(self, library: str):` → `server/docs.py:70`
- `existing_ids = set(collection.get()['ids']) if collection.count() > 0 else set()` → `server/docs.py:140`
- `for (lib_name,) in rows:` → `server/docs.py:196`
- `self.chroma_client = chromadb.PersistentClient(path=chroma_path)` → `server/docs.py:41`
- `def health() -> Response:` → `server/worker.py:90`
- `"status": "ok",` → `server/worker.py:100`
- `app.run(host='127.0.0.1', port=int(os.environ.get('EFFICLAUDE_PORT', 37777)), debug=False, threaded=True)` → `server/worker.py:346`
- `MAX_LOG_LINES = int(os.getenv('EFFICLAUDE_MAX_LOG_LINES', '1000'))` → `server/logger.py:8`
- `def get_counts() -> dict:` → `server/logger.py:29`
- `<key>KeepAlive</key>` → `launchers/com.efficlaude.worker.plist:14`
- `</dict>` → `launchers/com.efficlaude.worker.plist:22`
- `RestartSec=5` → `launchers/efficlaude-worker.service:9`
- `if [ -f "$PIDFILE" ]; then` → `server/stop.sh:18`
- `def test_reconcile_chromadb_fills_missing(db_path, chroma_path):` → `tests/test_memory.py:41`
- `tests/test_docs.py` → 51 lines, 5 existing DocsEngine tests (checked — not the home for health tests)
- `tests/test_health.py` → new file — no anchor

### Tasks
- [x] Task 1: Raise launchd FD limit [S] — add SoftResourceLimits/HardResourceLimits NumberOfFiles to the macOS plist
- [x] Task 2: Raise systemd FD limit [S] — add LimitNOFILE to the Linux unit file
- [x] Task 3: Declare shared-collection constants [S] [agent: ec-python] — add SHARED_MEM_COLLECTION and CHROMA_SCHEMA_VERSION to memory.py
- [x] Task 4: Add chroma migration guard [M] [agent: ec-python] — wipe the legacy per-entity chroma store once, before any client is constructed
- [x] Task 5: Collapse memory collections to one [S] [agent: ec-python] — rewrite MemoryEngine._get_collection to return the shared collection
- [x] Task 6: Stamp project into chroma metadata [S] [agent: ec-python] — save_observation writes project alongside type/created_at
- [x] Task 7: Filter memory search by project [M] [agent: ec-python] — pass where={"project": ...} with over-fetch in search()
- [x] Task 8: Make reconcile shared-collection aware [M] [agent: ec-python] — scope id diffing per project via where-filtered get()
- [x] Task 9: Run reconcile synchronously after migration [S] [agent: ec-python] — rebuild before serving instead of in a daemon thread
- [x] Task 10: Collapse docs collections to one [S] [agent: ec-python] — rewrite DocsEngine._get_collection to return the shared docs collection
- [x] Task 11: Scope docs upsert diffing by library [S] [agent: ec-python] — replace the whole-collection get() at docs.py:140 with a where-filtered get
- [x] Task 12: Collapse docs search to one query [M] [agent: ec-python] — replace the per-library query loop with a single $in-filtered query
- [x] Task 13: Delete obs_fts rows on prune [S] [agent: ec-python] — extend _prune_type to purge the FTS index in the same transaction
- [x] Task 14: Purge existing obs_fts orphans [S] [agent: ec-python] — one-time startup sweep of rows with no observation
- [x] Task 15: Cap the summaries table [M] [agent: ec-python] — add SUMMARY_TABLE_CAP and _prune_summaries, called from summarize_session
- [x] Task 16: Index the retention query paths [S] [agent: ec-python] — add indexes on summaries(project, created_at) and observations(project, type)
- [x] Task 17: Compact the database after purge [S] [agent: ec-python] — VACUUM once at startup after the orphan sweep
- [x] Task 18: Sanitize FTS5 queries [M] [agent: ec-python] — quote query terms before MATCH so punctuation cannot kill the fallback
- [x] Task 19: Add a size-based log rotator [M] [agent: ec-python] — rotate_if_large helper in logger.py
- [x] Task 20: Rotate worker.log at startup [S] [agent: ec-python] — call the rotator before Flask binds the port
- [x] Task 21: Report degraded health [M] [agent: ec-python] — /health returns "degraded" once error_counts crosses the threshold
- [x] Task 22: Self-register the worker PID [S] [agent: ec-python] — worker.py writes its own PID so the pidfile cannot go stale
- [x] Task 23: Unload launchd before stopping [M] — stop.sh unloads the LaunchAgent so KeepAlive cannot resurrect the worker
- [x] Task 24: Test project isolation in the shared collection [M] [agent: ec-unit-test] — prove cross-project leakage cannot occur
- [x] Task 25: Test retention and FTS hardening [M] [agent: ec-unit-test] — cover obs_fts pruning, summaries cap, and punctuation queries
- [x] Task 26: Test degraded health reporting [S] [agent: ec-unit-test] — new tests/test_health.py covering the ok/degraded boundary

### Per Task Detail

**Task 1 — Raise launchd FD limit** `S`
- File: `launchers/com.efficlaude.worker.plist`
- Anchor: `</dict>` → `launchers/com.efficlaude.worker.plist:22`
- Reuse: none
- Code sample: insert immediately before the closing `</dict>`:
  ```xml
  <key>SoftResourceLimits</key>
  <dict>
    <key>NumberOfFiles</key>
    <integer>8192</integer>
  </dict>
  <key>HardResourceLimits</key>
  <dict>
    <key>NumberOfFiles</key>
    <integer>8192</integer>
  </dict>
  ```
- Do not touch: `KeepAlive`, `StandardOutPath`, `StandardErrorPath`, `ProgramArguments`, `WorkingDirectory` — `install.sh:225` does a literal `EFFICLAUDE_HOME` substitution over this file and must keep matching.
- Edge cases: file must stay valid plist XML; `install.sh` pipes it through `sed` unchanged.
- ⚠️ Breaking change: none
- Acceptance: the LaunchAgent definition requests an 8192-file limit instead of inheriting the 256 default.
- Verify: `plutil -lint launchers/com.efficlaude.worker.plist` exits 0, and `grep -c "SoftResourceLimits" launchers/com.efficlaude.worker.plist` → `== 1` (baseline 0)
- Rollback: `git checkout -- launchers/com.efficlaude.worker.plist`
- Dependencies: none

**Task 2 — Raise systemd FD limit** `S`
- File: `launchers/efficlaude-worker.service`
- Anchor: `RestartSec=5` → `launchers/efficlaude-worker.service:9`
- Reuse: none
- Code sample: add on the line after `RestartSec=5`, inside `[Service]`:
  ```ini
  LimitNOFILE=8192
  ```
- Do not touch: `ExecStart`, `StandardOutput`, `StandardError`, `WorkingDirectory` — same `EFFICLAUDE_HOME` substitution at `install.sh:238`.
- Edge cases: must stay inside the `[Service]` stanza, not `[Unit]` or `[Install]`.
- ⚠️ Breaking change: none
- Acceptance: the Linux unit requests the same 8192-file ceiling as the macOS plist.
- Verify: `grep -c "^LimitNOFILE=8192" launchers/efficlaude-worker.service` → `== 1` (baseline `Limit` count 0)
- Rollback: `git checkout -- launchers/efficlaude-worker.service`
- Dependencies: none

**Task 3 — Declare shared-collection constants** `S`
- File: `server/memory.py`
- Anchor: `_CHROMA_FALLBACK_THRESHOLD = float(os.getenv('EFFICLAUDE_FTS_THRESHOLD', '1.2'))` → `server/memory.py:27`
- Reuse: follows the existing module-constant style (`TYPE_CAPS`, `SCHEMA_VERSION`)
- Code sample: add after line 27:
  ```python
  SHARED_MEM_COLLECTION = "efficlaude_memory"
  CHROMA_SCHEMA_VERSION = 2
  SUMMARY_TABLE_CAP = int(os.getenv('EFFICLAUDE_SUMMARY_CAP', '50'))
  _PROJECT_OVERFETCH = 5
  ```
- Do not touch: `SCHEMA_VERSION` and `_MIGRATIONS` — those version the SQLite schema, which is unchanged; the chroma layout gets its own version counter.
- Edge cases: collection name must satisfy chroma 1.5.8 validation (3–512 chars, `[a-zA-Z0-9._-]`, alphanumeric first and last) — `efficlaude_memory` does.
- ⚠️ Breaking change: none on its own
- Acceptance: the module exposes the shared collection name, chroma layout version, summaries cap, and over-fetch factor as named constants.
- Verify: `python3 -c "import sys; sys.path.insert(0,'server'); import memory; print(memory.SHARED_MEM_COLLECTION, memory.CHROMA_SCHEMA_VERSION, memory.SUMMARY_TABLE_CAP, memory._PROJECT_OVERFETCH)"` prints `efficlaude_memory 2 50 5`
- Rollback: `git checkout -- server/memory.py`
- Dependencies: none

**Task 4 — Add chroma migration guard** `M`
- File: `server/memory.py`
- Anchor: `def __init__(self, db_path, chroma_path):` → `server/memory.py:31`
- Reuse: `_reconcile_chromadb` at `server/memory.py:101` is the rebuild engine — this task only clears the ground for it
- Code sample: add a module-level function and call it as the first statement of `__init__`, before `chromadb.PersistentClient` is constructed:
  ```python
  def _migrate_chroma_layout(chroma_path: str) -> bool:
      """Wipe the legacy per-entity chroma store once. Returns True if wiped."""
      marker = Path(chroma_path) / f".layout_v{CHROMA_SCHEMA_VERSION}"
      if marker.exists():
          return False
      db = Path(chroma_path) / "chroma.sqlite3"
      legacy = 0
      if db.exists():
          try:
              with sqlite3.connect(str(db)) as conn:
                  legacy = conn.execute(
                      "SELECT COUNT(*) FROM collections WHERE name LIKE 'mem_%' OR name LIKE 'docs_%'"
                  ).fetchone()[0]
          except Exception as e:
              warn("memory", f"chroma layout probe failed: {e}")
      if legacy:
          shutil.rmtree(chroma_path, ignore_errors=True)
      Path(chroma_path).mkdir(parents=True, exist_ok=True)
      marker.touch()
      return bool(legacy)
  ```
  In `__init__`:
  ```python
  self._migrated = _migrate_chroma_layout(chroma_path)
  ```
  Add `import shutil` and `from pathlib import Path` to the imports.
- Do not touch: the SQLite `observations`/`summaries` tables — they are the source of truth and must survive the wipe untouched.
- Edge cases: fresh install (no `chroma.sqlite3`) → no wipe, marker written, returns False. Marker already present → no-op. Probe failure → logged via `warn`, treated as "no legacy", never raises.
- ⚠️ Breaking change: yes — deletes `~/.efficlaude/chroma` (126 MB, 185 collections) on first run after upgrade. Safe because chroma is derived: `observations` (9982 rows) and `docs_chunks` (27 rows) rebuild it.
- Acceptance: on a store containing legacy `mem_*`/`docs_*` collections, the chroma directory is emptied exactly once and a version marker prevents it happening again.
- Verify: `python3 -m pytest tests/ -q` → `139 passed` (baseline unchanged — proves no regression); Task 24 adds the migration-specific assertions
- Rollback: `git checkout -- server/memory.py` (the wiped chroma store rebuilds itself from SQLite on next start regardless)
- Dependencies: Task 3

**Task 5 — Collapse memory collections to one** `S`
- File: `server/memory.py`
- Anchor: `def _get_collection(self, project):` → `server/memory.py:140`
- Reuse: none
- Code sample: replace the method body — drop the per-project md5 name entirely:
  ```python
  def _get_collection(self, project=None):
      return self.chroma_client.get_or_create_collection(SHARED_MEM_COLLECTION)
  ```
  The `project` parameter stays for call-site compatibility but is no longer used for naming.
- Do not touch: the `hashlib` import if other code uses it — verify with `grep -n hashlib server/memory.py` and remove only if `_get_collection` was the sole consumer.
- Edge cases: all four existing call sites (`server/memory.py:110,163,219,243`) keep passing a project argument and must keep working unchanged.
- ⚠️ Breaking change: yes — collection naming changes; handled by Task 4's migration.
- Acceptance: every call to `_get_collection` returns the same single chroma collection regardless of project.
- Verify: `grep -c "_get_collection" server/memory.py` → `== 5` (baseline 5 — the definition plus four call sites, count unchanged), and `grep -c "mem_" server/memory.py` → `== 1` (corrected during execution from `== 0`: Task 4's migration guard legitimately contains the legacy-name probe `LIKE 'mem_%'`, so the only acceptable remaining occurrence is that one at `server/memory.py:49` — the `f"mem_{key}"` naming is gone)
- Rollback: `git checkout -- server/memory.py`
- Dependencies: Task 3

**Task 6 — Stamp project into chroma metadata** `S`
- File: `server/memory.py`
- Anchor: `def save_observation(self, project: str, obs_type: str, content: str, metadata=None) -> None:` → `server/memory.py:205`
- Reuse: existing metadata-merge shape at `server/memory.py:225`
- Code sample: in the `collection.add` call inside the retry loop, add `project` to the metadata dict:
  ```python
  metadatas=[{"type": obs_type, "created_at": now, "project": project, **(metadata or {})}],
  ```
- Do not touch: the SQLite insert above it, the two-attempt retry, or the rollback-on-failure branch at `server/memory.py:233-237`.
- Edge cases: a caller-supplied `metadata` key named `project` would override the real one — place `project` before the `**` spread so this is a deliberate, documented precedence, matching how `type` and `created_at` already behave.
- ⚠️ Breaking change: none — additive metadata field
- Acceptance: every vector written carries the project it belongs to, so the shared collection can be filtered.
- Verify: `grep -c 'created_at": now, "project": project' server/memory.py` → `== 1` (baseline 0 — string chosen to be unique to this call site, since later tasks also introduce `"project": project`)
- Rollback: `git checkout -- server/memory.py`
- Dependencies: Task 5

**Task 7 — Filter memory search by project** `M`
- File: `server/memory.py`
- Anchor: `def search(self, project: str, query: str, limit: int = 5) -> list:` → `server/memory.py:242`
- Reuse: the existing FTS fallback at `server/memory.py:260-263` stays exactly as-is — it is the recall safety net
- Code sample: replace the count/query block:
  ```python
  count = collection.count()
  if count == 0:
      return self._fts_search(project, query, limit)
  results = collection.query(
      query_texts=[query],
      n_results=min(limit * _PROJECT_OVERFETCH, count),
      where={"project": project}
  )
  ```
  Then truncate the assembled `items` list to `limit` before the fallback check:
  ```python
  items = items[:limit]
  ```
- Do not touch: `_CHROMA_FALLBACK_THRESHOLD` logic, the `except` branch, or the returned item shape (`content`/`metadata`/`distance`) — `hooks/prompt_submit.py:203` reads `m['metadata']` and `m['content']`.
- Edge cases: a project with zero vectors in a non-empty shared collection returns `[]` from the query → the `all(... > threshold)` check on an empty list is vacuously true, so the FTS fallback fires; that is the desired path.
- ⚠️ Breaking change: none to the response contract
- Acceptance: searching project A never returns an observation belonging to project B, and a project with no vectors still falls back to FTS.
- Verify: `grep -c 'n_results=min(limit \* _PROJECT_OVERFETCH, count)' server/memory.py` → `== 1` (baseline 0) and `grep -c 'where=' server/memory.py` → `== 1` (baseline 0)
- Rollback: `git checkout -- server/memory.py`
- Dependencies: Task 6

**Task 8 — Make reconcile shared-collection aware** `M`
- File: `server/memory.py`
- Anchor: `def _reconcile_chromadb(self) -> None:` → `server/memory.py:101`
- Reuse: the existing paginated `get`/diff/`add`/`delete` structure — only the scoping changes
- Code sample: inside the per-project loop, scope the id sweep with a where-filter:
  ```python
  batch = collection.get(limit=BATCH, offset=offset, where={"project": project})['ids']
  ```
  and include `project` in the rebuilt metadata:
  ```python
  metadatas=[{"type": r[1], "created_at": r[4], "project": project, **json.loads(r[3] or '{}')} for r in missing],
  ```
- Do not touch: the outer `_lock` usage, the `BATCH = 500` pagination, or the orphan-delete-by-ids call — ids remain globally unique because they are SQLite rowids.
- Edge cases: two projects can no longer collide on ids because `observations.id` is a single AUTOINCREMENT sequence across all projects.
- ⚠️ Breaking change: none
- Acceptance: reconcile rebuilds and prunes each project's slice of the shared collection without touching other projects' vectors.
- Verify: `grep -c 'offset=offset, where=' server/memory.py` → `== 1` (baseline 0) and `grep -c 'where=' server/memory.py` → `== 2` (1 from Task 7, 1 added here)
- Rollback: `git checkout -- server/memory.py`
- Dependencies: Task 7

**Task 9 — Run reconcile synchronously after migration** `S`
- File: `server/memory.py`
- Anchor: `threading.Thread(target=self._reconcile_chromadb, daemon=True).start()` → `server/memory.py:36`
- Reuse: `self._migrated` flag set by Task 4
- Code sample: replace line 36 with:
  ```python
  if self._migrated:
      self._reconcile_chromadb()
  else:
      threading.Thread(target=self._reconcile_chromadb, daemon=True).start()
  ```
- Do not touch: the `_prune_on_startup` daemon thread on the next line — it is independent and may stay async.
- Edge cases: on a large store the synchronous rebuild delays worker startup; it runs only once, guarded by the version marker from Task 4.
- ⚠️ Breaking change: none
- Acceptance: after a layout migration the worker does not serve a single request against a half-built index.
- Verify: `grep -c "if self._migrated:" server/memory.py` → `== 1`
- Rollback: `git checkout -- server/memory.py`
- Dependencies: Tasks 4, 8

**Task 10 — Collapse docs collections to one** `S`
- File: `server/docs.py`
- Anchor: `def _get_collection(self, library: str):` → `server/docs.py:70`
- Reuse: mirrors the memory-side change from Task 5
- Code sample: add `SHARED_DOCS_COLLECTION = "efficlaude_docs"` beside `DOC_TTL_DAYS` (line 35), then:
  ```python
  def _get_collection(self, library: str = ''):
      return self.chroma_client.get_or_create_collection(SHARED_DOCS_COLLECTION)
  ```
- Do not touch: the `re` import if still used elsewhere — check with `grep -n "re\." server/docs.py` before removing.
- Edge cases: the `library` metadata field already exists on every upsert at `server/docs.py:150`, so no data-shape change is needed to make filtering possible.
- ⚠️ Breaking change: yes — the 16 `docs_*` collections are replaced; Task 4's migration wipes them and `fetch_and_cache` repopulates on the next staleness check.
- Acceptance: all cached library documentation lives in one chroma collection instead of one per library.
- Verify: `grep -c "_get_collection" server/docs.py` → `== 3` (baseline 3 — definition plus two call sites, count unchanged), and `grep -c 'f"docs_{safe}"' server/docs.py` → `== 0`
- Rollback: `git checkout -- server/docs.py`
- Dependencies: Task 4

**Task 11 — Scope docs upsert diffing by library** `S`
- File: `server/docs.py`
- Anchor: `existing_ids = set(collection.get()['ids']) if collection.count() > 0 else set()` → `server/docs.py:140`
- Reuse: none
- Code sample: replace that line with a library-scoped fetch, since an unfiltered `get()` would now return every library's chunks:
  ```python
  existing_ids = set(collection.get(where={"library": name})['ids'])
  ```
- Do not touch: the `ids_to_delete` computation and `collection.upsert` below — the id scheme `f"{name}_{i}"` already namespaces by library.
- Edge cases: an empty shared collection returns `{'ids': []}` from a filtered `get`, so the `collection.count() > 0` guard is no longer needed and its removal is intentional.
- ⚠️ Breaking change: none — without this change, refreshing one library would delete every other library's chunks.
- Acceptance: refreshing one library's docs leaves every other library's cached chunks intact.
- Verify: `grep -c 'where={"library": name}' server/docs.py` → `== 1` (baseline `where=` count 0)
- Rollback: `git checkout -- server/docs.py`
- Dependencies: Task 10

**Task 12 — Collapse docs search to one query** `M`
- File: `server/docs.py`
- Anchor: `for (lib_name,) in rows:` → `server/docs.py:196`
- Reuse: the existing staleness-triggered background refresh and the final `sort`/slice
- Code sample: keep the staleness loop, then replace the per-library query with a single filtered query:
  ```python
  lib_names = [r[0] for r in rows]
  for lib_name in lib_names:
      if self._is_stale(lib_name):
          threading.Thread(target=self.fetch_and_cache, args=(lib_name,), daemon=True).start()

  collection = self._get_collection()
  all_results = []
  try:
      count = collection.count()
      if count == 0:
          return []
      results = collection.query(
          query_texts=[query],
          n_results=min(limit * len(lib_names), count),
          where={"library": {"$in": lib_names}}
      )
      for doc, meta, dist in zip(
          results['documents'][0],
          results['metadatas'][0],
          results['distances'][0]
      ):
          all_results.append({
              "library": meta.get('library', ''),
              "heading": meta.get('heading', ''),
              "content": doc,
              "distance": dist
          })
  except Exception as e:
      warn("docs", f"search error: {e}")
      return []
  ```
- Do not touch: the `docs_libraries` lookup above it, or the trailing `all_results.sort(...)` / `return all_results[:limit]`.
- Edge cases: `hooks/prompt_submit.py:207` reads `d['library']` and `d['heading']` — the `library` value now comes from metadata rather than the loop variable, so the metadata field written at `server/docs.py:150` must be present (it is).
- ⚠️ Breaking change: none to the response contract
- Acceptance: a docs search issues one vector query total instead of one per registered library, and results still name their source library.
- Verify: `grep -c "for (lib_name,) in rows:" server/docs.py` → `== 0` (baseline 1 — proves the per-library query loop is gone), `grep -c "collection.query" server/docs.py` → `== 1` (baseline 1), and `grep -c '"\$in"' server/docs.py` → `== 1` (baseline 0)
- Rollback: `git checkout -- server/docs.py`
- Dependencies: Task 11

**Task 13 — Delete obs_fts rows on prune** `S`
- File: `server/memory.py`
- Anchor: `f'DELETE FROM observations WHERE id IN ({placeholders})',` → `server/memory.py:157`
- Reuse: the existing `BEGIN EXCLUSIVE` transaction that already wraps the delete
- Code sample: add a matching FTS delete inside the same transaction, immediately after the observations delete:
  ```python
  conn.execute(
      f'DELETE FROM obs_fts WHERE rowid IN ({placeholders})',
      excess_int_ids
  )
  ```
- Do not touch: the chroma `collection.delete(ids=...)` below the transaction — it stays outside the SQLite lock.
- Edge cases: the same `placeholders`/`excess_int_ids` are reused, so the two deletes cannot diverge.
- ⚠️ Breaking change: none
- Acceptance: pruning an observation removes its FTS row in the same atomic step, so the two tables can no longer drift.
- Verify: `grep -c "obs_fts" server/memory.py` → `== 5` (baseline 4, one added)
- Rollback: `git checkout -- server/memory.py`
- Dependencies: none

**Task 14 — Purge existing obs_fts orphans** `S`
- File: `server/memory.py`
- Anchor: `def _prune_on_startup(self) -> None:` → `server/memory.py:168`
- Reuse: the existing startup-prune entry point
- Code sample: add a method and call it as the first statement of `_prune_on_startup`:
  ```python
  def _purge_fts_orphans(self) -> None:
      try:
          with sqlite3.connect(self.db_path) as conn:
              conn.execute(
                  'DELETE FROM obs_fts WHERE rowid NOT IN (SELECT id FROM observations)'
              )
              conn.commit()
      except Exception as e:
          warn("memory", f"fts orphan purge error: {e}")
  ```
- Do not touch: the `TYPE_CAPS` sweep that follows — it must still run after the purge.
- Edge cases: on a fresh database both tables are empty and the delete is a no-op. Wrapped in try/except per the silent-fail convention in `.claude/context/conventions.md`.
- ⚠️ Breaking change: none — deletes only index rows with no backing observation
- Acceptance: the 26543 orphaned FTS rows measured in Grounding are gone after one worker start, and the count stays at zero.
- Verify: after restarting the worker, `sqlite3 ~/.efficlaude/efficlaude.db "SELECT COUNT(*) FROM obs_fts f LEFT JOIN observations o ON f.rowid=o.id WHERE o.id IS NULL"` → `== 0` (baseline 26543)
- Rollback: `git checkout -- server/memory.py`
- Dependencies: Task 13

**Task 15 — Cap the summaries table** `M`
- File: `server/memory.py`
- Anchor: `def summarize_session(self, project: str, session_id: str = '') -> str:` → `server/memory.py:286`
- Reuse: `SUMMARY_TABLE_CAP` from Task 3; mirrors the `_prune_type` pattern at `server/memory.py:144`
- Code sample: add a prune method and call it at the end of `summarize_session`, after the insert commits:
  ```python
  def _prune_summaries(self, project: str) -> None:
      try:
          with sqlite3.connect(self.db_path) as conn:
              conn.execute(
                  'DELETE FROM summaries WHERE project=? AND id NOT IN ('
                  '  SELECT id FROM summaries WHERE project=? '
                  '  ORDER BY created_at DESC LIMIT ?'
                  ')',
                  (project, project, SUMMARY_TABLE_CAP)
              )
              conn.commit()
      except Exception as e:
          warn("memory", f"summaries prune error: {e}")
  ```
  At the end of `summarize_session`, before `return summary`:
  ```python
  self._prune_summaries(project)
  ```
- Do not touch: `export` at `server/memory.py:301` — it must keep reading whatever summaries survive; and `import_data`'s summary branch, which is out of scope.
- Edge cases: a project with fewer than the cap keeps all rows. The subquery is per-project, so pruning one project never touches another.
- ⚠️ Breaking change: yes — historical summaries beyond the newest 50 per project are deleted. Grounding measured 4209 rows totalling 9 MB of text, read by nothing except `export`.
- Acceptance: no project retains more than 50 summaries, and the newest are the ones kept.
- Verify: after restarting the worker and triggering one summarize, `sqlite3 ~/.efficlaude/efficlaude.db "SELECT MAX(c) FROM (SELECT COUNT(*) c FROM summaries GROUP BY project)"` → `<= 50` (baseline total 4209 rows across all projects)
- Rollback: `git checkout -- server/memory.py`
- Dependencies: Task 3

**Task 16 — Index the retention query paths** `S`
- File: `server/memory.py`
- Anchor: `CREATE VIRTUAL TABLE IF NOT EXISTS obs_fts` → `server/memory.py:64`
- Reuse: the existing `_init_db` DDL block
- Code sample: add before the `conn.commit()` at the end of `_init_db`:
  ```python
  conn.execute('CREATE INDEX IF NOT EXISTS idx_obs_project_type ON observations(project, type)')
  conn.execute('CREATE INDEX IF NOT EXISTS idx_sum_project_created ON summaries(project, created_at)')
  ```
- Do not touch: the FTS virtual table creation and its try/except wrapper.
- Edge cases: `IF NOT EXISTS` makes this idempotent across restarts; no migration entry needed.
- ⚠️ Breaking change: none
- Acceptance: the per-project prune queries in `_prune_type` and `_prune_summaries` are index-backed rather than full scans.
- Verify: after restarting the worker, `sqlite3 ~/.efficlaude/efficlaude.db ".indexes"` lists both `idx_obs_project_type` and `idx_sum_project_created`
- Rollback: `git checkout -- server/memory.py`
- Dependencies: Task 15

**Task 17 — Compact the database after purge** `S`
- File: `server/memory.py`
- Anchor: `def _purge_fts_orphans(self) -> None:` (added by Task 14)
- Reuse: none
- Code sample: append to `_purge_fts_orphans`, after the delete commits, using a separate connection because VACUUM cannot run inside a transaction:
  ```python
  try:
      conn = sqlite3.connect(self.db_path, isolation_level=None)
      conn.execute('VACUUM')
      conn.close()
  except Exception as e:
      warn("memory", f"vacuum error: {e}")
  ```
- Do not touch: the WAL pragmas in `_init_db` — VACUUM preserves `journal_mode=WAL`.
- Edge cases: VACUUM needs free disk equal to the database size (31.8 MB) — negligible. It runs at startup before Flask binds the port, so it cannot contend with live requests.
- ⚠️ Breaking change: none
- Acceptance: the database file shrinks to reflect the rows actually retained after the orphan purge and summaries cap.
- Verify: after restarting the worker, `ls -la ~/.efficlaude/efficlaude.db` shows a size below the 31825920-byte baseline
- Rollback: `git checkout -- server/memory.py`
- Dependencies: Tasks 14, 15

**Task 18 — Sanitize FTS5 queries** `M`
- File: `server/memory.py`
- Anchor: `def _fts_search(self, project: str, query: str, limit: int) -> list:` → `server/memory.py:181`
- Reuse: none
- Code sample: add a module-level helper and apply it before `MATCH`:
  ```python
  def _fts_sanitize(query: str) -> str:
      """Quote each term so FTS5 cannot choke on punctuation."""
      terms = re.findall(r'[A-Za-z0-9_]+', query)
      return ' OR '.join(f'"{t}"' for t in terms)
  ```
  In `_fts_search`, before the SQL:
  ```python
  safe_query = _fts_sanitize(query)
  if not safe_query:
      return []
  ```
  and pass `safe_query` instead of `query` in the parameter tuple.
- Do not touch: the returned item shape or the fixed `"distance": 0.5` — `search()` compares that value against `_CHROMA_FALLBACK_THRESHOLD`.
- Edge cases: a query of pure punctuation yields no terms → return `[]` early rather than issuing an empty `MATCH`. `OR` is used rather than `AND` because FTS is the fallback path and should widen, not narrow, recall.
- ⚠️ Breaking change: none — previously these queries raised and returned `[]` anyway
- Acceptance: a query containing `/`, `-`, or `"` returns results instead of logging an FTS5 syntax error.
- Verify: `grep -c "_fts_sanitize" server/memory.py` → `== 2` (baseline `_sanitize` count 0 — one definition, one call site); `python3 -c "import sys; sys.path.insert(0,'server'); from memory import _fts_sanitize; print(_fts_sanitize('a/b-c\"d'))"` prints `"a" OR "b" OR "c" OR "d"`
- Rollback: `git checkout -- server/memory.py`
- Dependencies: none

**Task 19 — Add a size-based log rotator** `M`
- File: `server/logger.py`
- Anchor: `MAX_LOG_LINES = int(os.getenv('EFFICLAUDE_MAX_LOG_LINES', '1000'))` → `server/logger.py:8`
- Reuse: generalises the line-cap idea already used by `warn` at `server/logger.py:19-22`
- Code sample: add constants after line 8 and a helper after `warn`:
  ```python
  WORKER_LOG_PATH = Path.home() / ".efficlaude" / "worker.log"
  MAX_WORKER_LOG_BYTES = int(os.getenv('EFFICLAUDE_MAX_LOG_BYTES', str(5 * 1024 * 1024)))


  def rotate_if_large(path: Path = WORKER_LOG_PATH, max_bytes: int = MAX_WORKER_LOG_BYTES) -> bool:
      """Move an oversized log aside, keeping one backup. Returns True if rotated."""
      try:
          if not path.exists() or path.stat().st_size <= max_bytes:
              return False
          backup = path.with_suffix(path.suffix + ".1")
          if backup.exists():
              backup.unlink()
          path.rename(backup)
          return True
      except Exception:
          return False
  ```
- Do not touch: `warn`, `get_counts`, `_error_counts`, or `_log_lock` — `warn` already bounds `efficlaude.log` by line count and is unchanged.
- Edge cases: the worker's stdout is redirected by launchd/systemd/`start.sh`, so rotation must happen at startup before the file handle is written to, not mid-run — hence Task 20's placement. Silent-fail per `.claude/context/conventions.md`.
- ⚠️ Breaking change: none
- Acceptance: an oversized `worker.log` is moved to `worker.log.1` and a fresh file starts, keeping exactly one generation of history.
- Verify: `grep -c "MAX_LOG_LINES" server/logger.py` → `== 3` (baseline 3, unchanged — proving `warn` was not disturbed); `grep -c "def rotate_if_large" server/logger.py` → `== 1`
- Rollback: `git checkout -- server/logger.py`
- Dependencies: none

**Task 20 — Rotate worker.log at startup** `S`
- File: `server/worker.py`
- Anchor: `app.run(host='127.0.0.1', port=int(os.environ.get('EFFICLAUDE_PORT', 37777)), debug=False, threaded=True)` → `server/worker.py:346`
- Reuse: `rotate_if_large` from Task 19
- Code sample: extend the logger import at `server/worker.py:19` to `from logger import get_counts, warn, rotate_if_large`, then inside the `__main__` block before `app.run`:
  ```python
  rotate_if_large()
  ```
- Do not touch: the `app.run` arguments — host, port, and `threaded=True` stay as they are.
- Edge cases: must sit inside `if __name__ == '__main__':` so importing `worker` in tests never rotates a real log.
- ⚠️ Breaking change: none
- Acceptance: starting the worker with a 30 MB `worker.log` leaves a fresh empty log and one `worker.log.1` backup.
- Verify: `grep -c "rotate" server/worker.py` → `== 2` (baseline 0 — one import, one call)
- Rollback: `git checkout -- server/worker.py`
- Dependencies: Task 19

**Task 21 — Report degraded health** `M`
- File: `server/worker.py`
- Anchor: `"status": "ok",` → `server/worker.py:100`
- Reuse: `get_counts()` already imported at `server/worker.py:19` and already returned in the payload at `server/worker.py:103`
- Code sample: add a module-level threshold near `_RATE_LIMIT` (line 48):
  ```python
  _HEALTH_ERROR_THRESHOLD = int(os.getenv('EFFICLAUDE_HEALTH_ERROR_THRESHOLD', '50'))
  ```
  In `health()`, compute the status before building the response:
  ```python
  counts = get_counts()
  total_errors = sum(counts.values())
  status = "degraded" if total_errors >= _HEALTH_ERROR_THRESHOLD else "ok"
  ```
  and use `"status": status` plus `"error_counts": counts` in the returned dict.
- Do not touch: the version-reading block above it, or the `/health` exemption in `_rate_limit` at `server/worker.py:74` — health must stay unthrottled.
- Edge cases: commands treat any HTTP 200 from `/health` as "worker online"; `degraded` still returns 200 so nothing hard-fails, it just stops claiming health it does not have.
- ⚠️ Breaking change: none — `status` was already a free-form string field
- Acceptance: a worker that has accumulated 50 or more logged errors reports `degraded` instead of `ok`, while a clean worker still reports `ok`.
- Verify: `grep -c "degraded" server/worker.py` → `== 1` (baseline 0); with the current live counts (`memory:505, worker:593`) `curl -s localhost:37777/health` returns `"status":"degraded"` after restart
- Rollback: `git checkout -- server/worker.py`
- Dependencies: none

**Task 22 — Self-register the worker PID** `S`
- File: `server/worker.py`
- Anchor: `app.run(host='127.0.0.1', port=int(os.environ.get('EFFICLAUDE_PORT', 37777)), debug=False, threaded=True)` → `server/worker.py:346`
- Reuse: `BASE_DIR` already defined at `server/worker.py:23`
- Code sample: in the `__main__` block, after `rotate_if_large()` and before `app.run`:
  ```python
  try:
      with open(os.path.join(BASE_DIR, "worker.pid"), "w") as f:
          f.write(str(os.getpid()))
  except Exception as e:
      warn("worker", f"pidfile write failed: {e}")
  ```
- Do not touch: `server/start.sh` and `server/watchdog.sh` — they may keep writing the pidfile first; the worker's own write happens last and therefore wins, which is the point.
- Edge cases: whichever of launchd, `start.sh`, or `watchdog.sh` spawns the process, the pidfile ends up holding the PID that actually bound the port.
- ⚠️ Breaking change: none — the pidfile keeps its existing format (bare integer)
- Acceptance: `worker.pid` always names the live listening process, never a dead one.
- Verify: `grep -c "worker.pid" server/worker.py` → `== 1` (baseline 0); after restart, `cat ~/.efficlaude/worker.pid` matches the PID from `lsof -nP -iTCP:37777 -sTCP:LISTEN` (baseline: pidfile held dead PID 9934 while PID 1122 held the port)
- Rollback: `git checkout -- server/worker.py`
- Dependencies: Task 20

**Task 23 — Unload launchd before stopping** `M`
- File: `server/stop.sh`
- Anchor: `if [ -f "$PIDFILE" ]; then` → `server/stop.sh:18`
- Reuse: the existing watchdog-first shutdown ordering at `server/stop.sh:6-16`
- Code sample: insert between the watchdog block and the pidfile block, so the supervisor is disarmed before the process is killed:
  ```bash
  PLIST="$HOME/Library/LaunchAgents/com.efficlaude.worker.plist"
  if [ -f "$PLIST" ]; then
    launchctl unload "$PLIST" 2>/dev/null && \
      echo "EffiClaude LaunchAgent unloaded (run install.sh or 'launchctl load' to re-enable)"
  fi
  ```
- Do not touch: the watchdog shutdown block above — it must still run first, and its ordering comment explains why.
- Edge cases: on Linux the plist path does not exist and the block is skipped. `launchctl unload` on an already-unloaded agent is harmless and is silenced. The message tells the user how to re-arm, since unloading is otherwise invisible.
- ⚠️ Breaking change: yes — `stop.sh` on macOS now disables auto-start until the agent is loaded again. Without this, `KeepAlive` immediately resurrects the worker and `stop.sh` appears to do nothing.
- Acceptance: after `stop.sh` on macOS, nothing is listening on port 37777 and nothing respawns it.
- Verify: `bash -n server/stop.sh` exits 0; `grep -c "launchctl unload" server/stop.sh` → `== 1` (baseline 0). Corrected during execution from `grep -c "launchctl"` → `== 1`: the task's own code sample contains the word twice (the command, plus the `'launchctl load'` hint inside the echo), so the bare count is 2 and the narrower string is the meaningful check.
- Rollback: `git checkout -- server/stop.sh`
- Dependencies: none

**Task 24 — Test project isolation in the shared collection** `M`
- File: `tests/test_memory.py`
- Anchor: `def test_reconcile_chromadb_fills_missing(db_path, chroma_path):` → `tests/test_memory.py:41`
- Reuse: `db_path` and `chroma_path` fixtures from `tests/conftest.py:9,14`
- Code sample: append to the file:
  ```python
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
  ```
- Do not touch: the five existing tests — they must keep passing unchanged.
- Edge cases: `list_collections()` in chromadb 1.5.8 returns collection objects with a `.name` attribute. The migration test constructs a legacy collection first so the guard has something real to detect.
- ⚠️ Breaking change: none
- Acceptance: cross-project leakage and failed migration both fail the suite loudly.
- Verify: `python3 -m pytest tests/test_memory.py -q` → `7 passed` (baseline: 5 tests in this file, 106 total)
- Rollback: `git checkout -- tests/test_memory.py`
- Dependencies: Tasks 4, 5, 6, 7

**Task 25 — Test retention and FTS hardening** `M`
- File: `tests/test_memory.py`
- Anchor: `def test_shared_collection_isolates_projects(db_path, chroma_path):` (added by Task 24)
- Reuse: same fixtures
- Code sample: append:
  ```python
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
  ```
- Do not touch: tests added by Task 24.
- Edge cases: `_fts_search` is called directly rather than through `search()` so the assertion cannot be satisfied by the vector path instead of the FTS path.
- ⚠️ Breaking change: none
- Acceptance: FTS orphan drift, unbounded summaries, and punctuation-crashing queries each fail the suite if reintroduced.
- Verify: `python3 -m pytest tests/test_memory.py -q` → `10 passed`
- Rollback: `git checkout -- tests/test_memory.py`
- Dependencies: Tasks 13, 15, 18, 24

**Task 26 — Test degraded health reporting** `S`
- File: `tests/test_health.py`
- Anchor: new file — no anchor. (`tests/test_docs.py` was checked and already holds 5 unrelated DocsEngine tests, so health gets its own file.)
- Reuse: Flask's built-in test client; no new dependency
- Code sample: create `tests/test_health.py`:
  ```python
  import sys
  import os

  sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))


  def test_health_reports_degraded_above_threshold(monkeypatch, tmp_path):
      monkeypatch.setenv("HOME", str(tmp_path))
      import worker
      monkeypatch.setattr(worker, "_HEALTH_ERROR_THRESHOLD", 3)
      monkeypatch.setattr(worker, "get_counts", lambda: {"memory": 5})
      with worker.app.test_client() as client:
          assert client.get("/health").get_json()["status"] == "degraded"
      monkeypatch.setattr(worker, "get_counts", lambda: {"memory": 1})
      with worker.app.test_client() as client:
          assert client.get("/health").get_json()["status"] == "ok"
  ```
- Do not touch: `tests/conftest.py` — the existing `sys.path` insertion there already covers `server/`, so this file's own insert is belt-and-braces and harmless.
- Edge cases: importing `worker` constructs `MemoryEngine`/`DocsEngine`/`GraphEngine` against `~/.efficlaude`; the `HOME` monkeypatch redirects that to a temp directory so the real store is untouched.
- ⚠️ Breaking change: none
- Acceptance: both sides of the ok/degraded boundary are asserted, so the health signal cannot silently revert to always-ok.
- Verify: `python3 -m pytest tests/ -q` → `145 passed` (baseline 139; +2 from Task 24, +3 from Task 25, +1 here)
- Rollback: `rm tests/test_health.py`
- Dependencies: Task 21
