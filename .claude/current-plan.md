## Feature: Fix 12 New Bugs — Create, Fix & Close GitHub Issues

### Impact Analysis
- Files affected: `server/memory.py`, `server/docs.py`, `server/graph.py`, `server/worker.py`, `server/logger.py`, `hooks/session_stop.py`, `hooks/prompt_submit.py`
- ⚠️ Breaking change risk: none — all changes are bug fixes with no API surface change

### Reusable Existing Code
- `_valid_project()` at `server/worker.py:68` — used in Task 7 to add missing validation
- `_is_safe_path()` at `server/worker.py:30` — used in Task 6 logic for root_dir guard
- `_lock` at `server/memory.py:12` — used in Task 5 and Task 12

### Tasks
- [x] Task 1: Create 12 GitHub issues [S] — Open all 12 bugs via gh issue create with severity labels
- [x] Task 2: Fix memory.export() raw metadata [S] [agent: ec-python] — Add json.loads() in export() like get_recent() does
- [x] Task 3: Fix stale ChromaDB chunks after library shrink [S] [agent: ec-python] — Change ids_to_delete to remove all IDs not in new_ids set
- [x] Task 4: Fix _rate_buckets memory leak [S] [agent: ec-python] — Delete key from _rate_buckets when bucket becomes empty
- [x] Task 5: Fix _prune_type() ChromaDB call outside _lock [S] [agent: ec-python] — Wrap collection.delete() inside _lock
- [x] Task 6: Fix root_dir path traversal in /graph/index [S] [agent: ec-python] — Reject root_dir containing null bytes or .. parts
- [x] Task 7: Fix /docs/register missing project validation [S] [agent: ec-python] — Add _valid_project() guard in docs_register()
- [x] Task 8: Fix ensure_commit_hook() overwriting existing hook [S] [agent: ec-python] — Guard already present at line 127 (pre-existing fix)
- [x] Task 9: Fix logger.py thread-safety [S] [agent: ec-python] — Add threading.Lock() around read-trim-write in warn()
- [x] Task 10: Fix check_update() premature timestamp write [S] [agent: ec-python] — Move UPDATE_CHECK_FILE write to after successful remote fetch
- [x] Task 11: Fix index_project() symlink traversal [S] [agent: ec-python] — Skip symlinks in rglob loop
- [x] Task 12: Fix import_data() TOCTOU race [S] [agent: ec-python] — Hold _lock around check-and-save in import_data()
- [x] Task 13: Fix _reconcile_chromadb() blocking startup [S] [agent: ec-python] — Run in daemon thread like _prune_on_startup
- [x] Task 14: Close all 12 GitHub issues [S] — gh issue close each issue number from Task 1

### Per Task Detail

**Task 1 — Create 12 GitHub issues** `S`
- File: none (GitHub CLI operation)
- Reuse: `gh issue create --repo kaeltech-id/EffiClaude`
- Code sample:
  ```bash
  gh issue create --repo kaeltech-id/EffiClaude \
    --title "[High] memory.export() returns metadata as raw string instead of parsed dict" \
    --body "In memory.py:311, export() returns r[2] (raw SQLite JSON string) instead of json.loads(r[2]). get_recent() at line 279 correctly parses it. This causes the /memory/export API to return metadata as a string, breaking ec-import." \
    --label "bug,high"
  # ... repeat for all 12 issues, capture issue numbers
  ```
- Edge cases: labels must exist in repo; create them if needed
- ⚠️ Breaking change: none
- Verify: `gh issue list --repo kaeltech-id/EffiClaude --state open --limit 20` shows 12 new issues
- Dependencies: none

**Task 2 — Fix memory.export() raw metadata** `S`
- File: `server/memory.py`
- Reuse: `json.loads()` pattern from `get_recent()` line 279
- Code sample:
  ```python
  # Change line 311:
  'observations': [{'type': r[0], 'content': r[1], 'metadata': json.loads(r[2] or '{}'), 'created_at': r[3]} for r in obs],
  ```
- Edge cases: `r[2]` may be None → `or '{}'` handles it
- ⚠️ Breaking change: none (fixes incorrect response schema)
- Verify: `curl -s "http://localhost:37777/memory/export?project=EffiClaude" | python3 -c "import json,sys; d=json.load(sys.stdin); obs=d['observations']; print(type(obs[0]['metadata']) if obs else 'no obs')"` prints `<class 'dict'>`
- Dependencies: none

**Task 3 — Fix stale ChromaDB chunks after library shrink** `S`
- File: `server/docs.py`
- Reuse: `new_ids` list built on line 141
- Code sample:
  ```python
  # Replace lines 143-145 with:
  new_ids_set = set(new_ids)
  ids_to_delete = [eid for eid in existing_ids if eid not in new_ids_set]
  if ids_to_delete:
      collection.delete(ids=ids_to_delete)
  ```
- Edge cases: empty `existing_ids` → `ids_to_delete` is empty → no delete call needed
- ⚠️ Breaking change: none
- Verify: manually upsert extra IDs into a docs collection, re-fetch library; confirm `collection.count()` matches `len(chunks)` after
- Dependencies: none

**Task 4 — Fix _rate_buckets memory leak** `S`
- File: `server/worker.py`
- Reuse: `bucket` variable already filtered on line 78
- Code sample:
  ```python
  # Replace lines 79-82 with:
  if bucket:
      _rate_buckets[ip] = bucket
  else:
      _rate_buckets.pop(ip, None)
  if len(_rate_buckets[ip]) >= _RATE_LIMIT if ip in _rate_buckets else False:
      return jsonify({"status": "error", "error": "rate limit exceeded"}), 429
  _rate_buckets[ip].append(now)
  ```
  Cleaner version:
  ```python
  bucket = [t for t in _rate_buckets[ip] if now - t < _RATE_WINDOW]
  if len(bucket) >= _RATE_LIMIT:
      _rate_buckets[ip] = bucket  # keep for next check
      return jsonify({"status": "error", "error": "rate limit exceeded"}), 429
  bucket.append(now)
  if bucket:
      _rate_buckets[ip] = bucket
  else:
      _rate_buckets.pop(ip, None)
  ```
- Edge cases: concurrent requests from same IP — GIL protects dict key access for simple ops
- ⚠️ Breaking change: none
- Verify: after `_RATE_WINDOW` seconds of silence from an IP, `ip not in _rate_buckets`
- Dependencies: none

**Task 5 — Fix _prune_type() ChromaDB call outside _lock** `S`
- File: `server/memory.py`
- Reuse: `_lock` from line 12
- Code sample:
  ```python
  # Replace lines 161-163:
  if excess_int_ids:
      with _lock:
          collection = self._get_collection(project)
          collection.delete(ids=[str(i) for i in excess_int_ids])
  ```
- Edge cases: `_lock` is not held at this point (released after SQLite block), so no deadlock
- ⚠️ Breaking change: none
- Verify: run concurrent prune calls; no ChromaDB exception about concurrent modification
- Dependencies: none

**Task 6 — Fix root_dir path traversal in /graph/index** `S`
- File: `server/worker.py`
- Reuse: `_is_safe_path()` pattern; note root_dir can be absolute (valid use case), so only block `..` and null bytes
- Code sample:
  ```python
  # In graph_index(), replace root_dir branch (lines 271-273):
  if root_dir:
      if '\x00' in root_dir or '..' in Path(root_dir).parts:
          return _err("invalid root_dir")
      count = graph.index_project(project, root_dir)
      return jsonify({"status": "indexed", "files": count, "root": root_dir})
  ```
- Edge cases: absolute paths like `/home/user/project` are valid; only `..` traversal is dangerous
- ⚠️ Breaking change: none
- Verify: `curl -X POST .../graph/index -d '{"project":"x","root_dir":"../../etc"}' -H 'Content-Type: application/json'` returns `{"status":"error","error":"invalid root_dir"}`
- Dependencies: none

**Task 7 — Fix /docs/register missing project validation** `S`
- File: `server/worker.py`
- Reuse: `_valid_project()` from line 68
- Code sample:
  ```python
  # In docs_register(), add after name check (after line 204):
  project = data.get('project', '')
  if project and not _valid_project(project):
      return _err("invalid project name")
  docs.register_library(
      name=name,
      project=project,
      source_type=data.get('source_type')
  )
  ```
- Edge cases: empty `project` is allowed (global/unscoped library)
- ⚠️ Breaking change: none
- Verify: `curl -X POST .../docs/register -d '{"name":"flask","project":"../../../etc"}' ...` returns 400
- Dependencies: none

**Task 8 — Fix ensure_commit_hook() overwriting existing hook** `S`
- File: `hooks/session_stop.py`
- Reuse: `os.path.exists()` already imported
- Code sample:
  ```python
  # Replace lines 127-131:
  if not os.path.exists(dst):
      shutil.copy2(src, dst)
      os.chmod(dst, 0o755)
  ```
- Edge cases: if user wants to update the hook, they run `install.sh` which always copies (intentional override there)
- ⚠️ Breaking change: none
- Verify: create a file at `dst` path; run `ensure_commit_hook()`; confirm file content unchanged
- Dependencies: none

**Task 9 — Fix logger.py thread-safety** `S`
- File: `server/logger.py`
- Reuse: `threading` stdlib
- Code sample:
  ```python
  import threading
  _log_lock = threading.Lock()

  def warn(tag: str, msg: str) -> None:
      _error_counts[tag] = _error_counts.get(tag, 0) + 1
      line = f"[{datetime.utcnow().isoformat(timespec='seconds')}] [{tag}] {msg}\n"
      try:
          LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
          with _log_lock:
              lines = LOG_PATH.read_text().splitlines(keepends=True) if LOG_PATH.exists() else []
              if len(lines) >= MAX_LOG_LINES:
                  lines = lines[-(MAX_LOG_LINES - 1):]
              LOG_PATH.write_text("".join(lines) + line)
      except Exception:
          pass
      if os.getenv("EFFICLAUDE_DEBUG"):
          print(line, end="", file=sys.stderr)
  ```
- Edge cases: `mkdir` is outside lock (safe — it's idempotent); only file read+write needs protection
- ⚠️ Breaking change: none
- Verify: spawn 20 concurrent threads each calling `warn("t", "msg")` 5 times; confirm 100 lines in log
- Dependencies: none

**Task 10 — Fix check_update() premature timestamp write** `S`
- File: `hooks/prompt_submit.py`
- Reuse: existing `UPDATE_CHECK_FILE` write pattern
- Code sample:
  ```python
  def check_update():
      try:
          if os.path.exists(UPDATE_CHECK_FILE):
              with open(UPDATE_CHECK_FILE) as f:
                  last = float(f.read().strip())
              if time.time() - last < 86400:
                  return None
          if not os.path.exists(VERSION_FILE):
              return None
          with open(VERSION_FILE) as f:
              local = f.read().strip()
          with urllib.request.urlopen(VERSION_URL, timeout=3) as resp:
              remote = resp.read().decode().strip()
          # Write timestamp only after successful remote fetch:
          with open(UPDATE_CHECK_FILE, 'w') as f:
              f.write(str(time.time()))
          if local != remote:
              return f"EffiClaude {remote} available (installed: {local}). Run: bash install.sh"
      except Exception:
          pass
      return None
  ```
- Edge cases: if fetch succeeds but version strings are equal, timestamp is still written (correct — no update needed)
- ⚠️ Breaking change: none
- Verify: simulate URLError; confirm `UPDATE_CHECK_FILE` is not created/updated
- Dependencies: none

**Task 11 — Fix index_project() symlink traversal** `S`
- File: `server/graph.py`
- Reuse: existing `path.is_file()` check on line 104
- Code sample:
  ```python
  # In index_project(), add symlink guard after line 101:
  for path in root.rglob('*'):
      if path.is_symlink():
          continue
      if any(part in IGNORE_DIRS for part in path.parts):
          continue
      if path.is_file() and path.suffix.lstrip('.') in EXTENSION_TO_LANG:
          ...
  ```
- Edge cases: legitimate source files accessed via symlink are skipped — acceptable for security
- ⚠️ Breaking change: none
- Verify: `ln -s /tmp /tmp/test_project/loop; index_project("p", "/tmp/test_project")` completes without hanging
- Dependencies: none

**Task 12 — Fix import_data() TOCTOU race** `S`
- File: `server/memory.py`
- Reuse: `_lock` from line 12; note save_observation() also acquires _lock, so use flag pattern
- Code sample:
  ```python
  # In import_data() obs loop, replace lines 320-343 with:
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
  ```
- Edge cases: tiny window between `should_save=True` and `save_observation()` — save_observation handles ChromaDB idempotently; duplicate unlikely
- ⚠️ Breaking change: none
- Verify: 10 concurrent `import_data()` calls with same payload → 1 row in observations
- Dependencies: none

**Task 13 — Fix _reconcile_chromadb() blocking startup** `S`
- File: `server/memory.py`
- Reuse: `threading.Thread` pattern from line 37
- Code sample:
  ```python
  # Change line 36 from:
  self._reconcile_chromadb()
  # To:
  threading.Thread(target=self._reconcile_chromadb, daemon=True).start()
  ```
- Edge cases: first few requests after startup may search before reconcile completes — FTS fallback handles this
- ⚠️ Breaking change: none
- Verify: worker starts in < 1 second even with large DB (reconcile runs in background)
- Dependencies: none

**Task 14 — Close all 12 GitHub issues** `S`
- File: none (GitHub CLI operation)
- Reuse: issue numbers captured from Task 1 output
- Code sample:
  ```bash
  # Close each issue with a comment referencing the fix:
  for num in <ISSUE_NUMBERS>; do
    gh issue close --repo kaeltech-id/EffiClaude "$num" \
      --comment "Fixed — all 12 bugs resolved in this session."
  done
  ```
- Edge cases: issues already closed → `gh issue close` is idempotent
- ⚠️ Breaking change: none
- Verify: `gh issue list --repo kaeltech-id/EffiClaude --state open` shows 0 of our 12 issues open
- Dependencies: Task 1 (issue numbers), Tasks 2-13 (all fixes done)
