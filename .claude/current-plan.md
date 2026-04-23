## Feature: Fix all 28 open GitHub issues + close tickets

### Impact Analysis
- Files affected: `server/worker.py`, `server/memory.py`, `server/docs.py`, `server/graph.py`, `hooks/prompt_submit.py`, `hooks/session_stop.py`, `commands/ec-feature.md`, `tests/test_hooks.py` (new)
- ⚠️ Breaking change risk: none — all changes are additive or bug fixes

### Reusable Existing Code
- `_err()` helper at `server/worker.py:52` — reuse for consistent error responses
- `_lock` threading.Lock at `server/memory.py:12` — reuse in reconcile fix
- pytest fixture pattern from `tests/conftest.py` — reuse for hook tests
- `warn()` pattern from `server/logger.py` — reuse in any new error handlers

### Audit: already fixed in codebase (19 issues — close only, no code change)
- #14 commit-msg semver validation — lines 10-13 of hooks/commit-msg validate `^[0-9]+\.[0-9]+\.[0-9]+$`
- #17 ValueError on int params — `_int_param()` helper at worker.py:56-63
- #18 _prune_type race — uses `BEGIN EXCLUSIVE` single-connection at memory.py:147
- #19 invalid node_type silent corruption — returns `_err()` at worker.py:311
- #20 json.loads swallows JSONDecodeError — try-except at memory.py:328-333
- #22 no try-except in observe — wrapped at worker.py:121-130
- #24 bare except in memory.py — all have `warn()` calls
- #25 fetch_and_cache blocks — spawns background thread at docs.py:93, timeout=5s
- #26 no metadata validation — size+type checks at worker.py:111-120
- #27 project param no validation — `_valid_project()` at worker.py:66-70
- #29 lock scope in reconcile — SQLite reads are inside `with _lock:` at memory.py:120-124
- #30 ChromaDB sync failure — SQLite rollback at memory.py:231-235
- #31 FTS threshold uncalibrated — `EFFICLAUDE_FTS_THRESHOLD` env var at memory.py:27
- #32 tree-sitter no timeout — ThreadPoolExecutor 10s at worker.py:249-254
- #33 inconsistent error schema — `_err()` helper at worker.py:52-53
- #34 SQLite WAL not enabled — `PRAGMA journal_mode=WAL` at memory.py:41
- #36 MAX_LOG_LINES hardcoded — `EFFICLAUDE_MAX_LOG_LINES` env var at logger.py:7
- #37 no rate limiting — `_rate_limit()` before_request at worker.py:72-81
- #38 register_library blocks — spawns `threading.Thread` at docs.py:93

### Tasks
- [x] Task 1: Fix server/worker.py bugs and add route docs [S] — _is_safe_path() backslash + graph_index() str(e) + route docstrings
- [x] Task 2: Fix server/memory.py reconcile lock scope [S] — wrap project list read inside _lock
- [x] Task 3: Add type hints to server/docs.py [S] — Optional[str] source_type, _get_collection return type
- [x] Task 4: Add type hints to server/graph.py public methods [S] — index_project, index_file, _extract_nodes, _get_node_name
- [x] Task 5: Fix hooks/prompt_submit.py staleness unknown age [S] — return message when comment missing
- [x] Task 6: Fix hooks/session_stop.py export bak retention [S] — delete .bak older than 7 days after successful export
- [x] Task 7: Fix commands/ec-feature.md expired decision UX [S] — add "use it anyway" option
- [x] Task 8: Create tests/test_hooks.py [M] — unit tests for check_context_staleness, auto_export, check_uncommitted
- [x] Task 9: Close 19 already-fixed GitHub issues [S] — gh issue close with "Fixed in current codebase" comment
- [x] Task 10: Close 9 newly-fixed GitHub issues [S] — gh issue close with fix reference comment

### Per Task Detail

**Task 1 — Fix server/worker.py bugs + route docs** `S`
- File: `server/worker.py`
- Reuse: `_err()` at line 52
- Code sample:
  ```python
  # Line 31 — add backslash check for Windows-style paths (belt-and-suspenders):
  if not p or '\x00' in p or '\\' in p:
  
  # Line 257 — return actual error message not generic string:
  return jsonify({"status": "error", "error": str(e), "file": file_path}), 500
  
  # Route docstrings — add one-liner to each @app.route function, e.g.:
  @app.route('/memory/observe', methods=['POST'])
  def observe() -> Response:
      """Save a memory observation for a project."""
      # (add to all 12 routes: health, observe, memory_search, memory_context,
      #  summarize, memory_export, memory_import, docs_register, docs_search,
      #  docs_refresh, docs_list, graph_index, graph_blast_radius, graph_summary,
      #  graph_export, graph_import)
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "backslash\|str(e)\|docstring" server/worker.py` — check `grep '\\\\\\\\' server/worker.py` returns the new check line, `grep 'str(e)' server/worker.py` returns the error line, `grep '"""' server/worker.py | wc -l` returns >= 12
- Dependencies: none

**Task 2 — Fix server/memory.py reconcile lock scope** `S`
- File: `server/memory.py`
- Reuse: `_lock` at line 12
- Code sample:
  ```python
  # Current (lines 101-107) — project list read outside lock:
  def _reconcile_chromadb(self) -> None:
      try:
          with sqlite3.connect(self.db_path) as conn:
              projects = [r[0] for r in conn.execute(
                  'SELECT DISTINCT project FROM observations'
              ).fetchall()]
          for project in projects:
              with _lock:
  
  # Fix — wrap initial read inside _lock:
  def _reconcile_chromadb(self) -> None:
      try:
          with _lock:
              with sqlite3.connect(self.db_path) as conn:
                  projects = [r[0] for r in conn.execute(
                      'SELECT DISTINCT project FROM observations'
                  ).fetchall()]
          for project in projects:
              with _lock:
  ```
- Edge cases: lock is re-entrant per project — OK since we release before iterating
- ⚠️ Breaking change: none
- Verify: `grep -A3 "def _reconcile_chromadb" server/memory.py | grep "_lock"` returns the lock line
- Dependencies: none

**Task 3 — Add type hints to server/docs.py** `S`
- File: `server/docs.py`
- Reuse: `from __future__ import annotations` already present (enables `str | None` syntax)
- Code sample:
  ```python
  # register_library — source_type has no type hint:
  def register_library(self, name: str, project: str = '', source_type: str | None = None) -> None:
  
  # _get_collection — missing return type:
  def _get_collection(self, library: str):  # chromadb Collection type not importable simply
  # → just add parameter type: def _get_collection(self, library: str):
  
  # _init_db — missing return type:
  def _init_db(self) -> None:
  
  # _is_stale — already typed ✓
  # fetch_and_cache — already typed ✓
  # search — already typed ✓
  # list_libraries — already typed ✓
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "def register_library\|def _get_collection\|def _init_db" server/docs.py` — all show type annotations
- Dependencies: none

**Task 4 — Add type hints to server/graph.py public methods** `S`
- File: `server/graph.py`
- Reuse: `from __future__ import annotations` — add if not present (it's not in graph.py currently)
- Code sample:
  ```python
  # Add at top after existing imports:
  from __future__ import annotations
  
  # _init_db:
  def _init_db(self) -> None:
  
  # _init_tree_sitter:
  def _init_tree_sitter(self) -> bool:
  
  # _get_parser:
  def _get_parser(self, lang: str):
  
  # index_project:
  def index_project(self, project: str, root_dir: str) -> int:
  
  # index_file:
  def index_file(self, project: str, file_path: str, root_dir: str | None = None) -> None:
  
  # _extract_nodes:
  def _extract_nodes(self, source: str, lang: str, file_path: str) -> list:
  
  # _extract_nodes_ts:
  def _extract_nodes_ts(self, source: str, lang: str) -> list:
  
  # _walk_tree:
  def _walk_tree(self, node, source: str, lang: str, results: list) -> None:
  
  # _get_node_name:
  def _get_node_name(self, node, source: str) -> str | None:
  
  # _extract_nodes_regex:
  def _extract_nodes_regex(self, source: str, lang: str) -> list:
  ```
- Edge cases: `from __future__ import annotations` must be first import
- ⚠️ Breaking change: none
- Verify: `grep "def index_project\|def index_file\|def _extract_nodes" server/graph.py` — all show param types
- Dependencies: none

**Task 5 — Fix hooks/prompt_submit.py staleness unknown age** `S`
- File: `hooks/prompt_submit.py`
- Reuse: existing return string pattern at line 130
- Code sample:
  ```python
  # Current (line 124-125):
  if not match:
      return None
  # Fix:
  if not match:
      return "(context age unknown — run /ec-setup to refresh)"
  ```
- Edge cases: None — this is the only change needed in this function
- ⚠️ Breaking change: none — callers check truthiness, a non-None string is truthy
- Verify: `grep "context age unknown" hooks/prompt_submit.py` returns the new line
- Dependencies: none

**Task 6 — Fix hooks/session_stop.py export bak retention** `S`
- File: `hooks/session_stop.py`
- Reuse: `os.remove`, `os.path.getmtime`, `time.time()` — all already imported
- Code sample: In `auto_export()`, after the `with open(export_path, 'w') as f: json.dump(export, f)` block (around line 103), add:
  ```python
  # Clean up .bak if older than 7 days
  bak = export_path + '.bak'
  try:
      if os.path.exists(bak) and time.time() - os.path.getmtime(bak) > 86400 * 7:
          os.remove(bak)
  except Exception:
      pass
  ```
- Edge cases: `os.remove` may fail on permissions — wrapped in try/except silently
- ⚠️ Breaking change: none
- Verify: `grep "86400" hooks/session_stop.py` returns the retention line
- Dependencies: none

**Task 7 — Fix commands/ec-feature.md expired decision UX** `S`
- File: `commands/ec-feature.md`
- Reuse: existing decision expiry block at lines 23-27
- Code sample:
  ```markdown
  # Current (lines 23-27):
      - If older than 7 days:
          Show: "(decision.md found but expired — created {n} days ago)"
          Ask: "Delete and start fresh? (y/n):"
          - If y: delete `.claude/decision.md`, then proceed to saved brainstorms check
          - If n: skip this decision, proceed to saved brainstorms check (do NOT delete)
  
  # Fix:
      - If older than 7 days:
          Show: "(decision.md found but expired — created {n} days ago: \"{problem_title_from_first_line}\")"
          Ask: "Use it anyway? (y/n):"
          - If y: proceed normally using this decision — treat as if within 7 days
          - If n: delete `.claude/decision.md`, proceed to saved brainstorms check
  ```
- Edge cases: problem_title = first `# ` heading in decision.md (or filename if absent)
- ⚠️ Breaking change: none — UX change only
- Verify: `grep "Use it anyway" commands/ec-feature.md` returns the updated prompt line
- Dependencies: none

**Task 8 — Create tests/test_hooks.py** `M`
- File: `tests/test_hooks.py`
- Reuse: pytest fixture pattern from `tests/conftest.py` (tmp_path, sys.path.insert pattern)
- Code sample:
  ```python
  import sys, os, json, time
  import pytest
  from unittest.mock import patch, MagicMock
  
  sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'hooks'))
  
  # test check_context_staleness
  def test_staleness_returns_warning_when_old(tmp_path):
      from prompt_submit import check_context_staleness
      ctx = tmp_path / ".claude" / "context"
      ctx.mkdir(parents=True)
      (ctx / "stack.md").write_text("<!-- last_updated: 2020-01-01 -->")
      with patch("os.getcwd", return_value=str(tmp_path)):
          result = check_context_staleness()
      assert result is not None
      assert "days ago" in result
  
  def test_staleness_returns_unknown_when_no_comment(tmp_path):
      from prompt_submit import check_context_staleness
      ctx = tmp_path / ".claude" / "context"
      ctx.mkdir(parents=True)
      (ctx / "stack.md").write_text("# Tech Stack\n")
      with patch("os.getcwd", return_value=str(tmp_path)):
          result = check_context_staleness()
      assert result == "(context age unknown — run /ec-setup to refresh)"
  
  # test check_uncommitted
  def test_check_uncommitted_no_output_when_clean(capsys):
      from session_stop import check_uncommitted
      with patch("subprocess.run") as mock_run:
          mock_run.return_value = MagicMock(stdout="")
          check_uncommitted()
      captured = capsys.readouterr()
      assert "Uncommitted" not in captured.out
  
  def test_check_uncommitted_warns_when_dirty(capsys):
      from session_stop import check_uncommitted
      with patch("subprocess.run") as mock_run:
          mock_run.return_value = MagicMock(stdout="M modified_file.py")
          check_uncommitted()
      captured = capsys.readouterr()
      assert "Uncommitted" in captured.out
  
  # test auto_export bak cleanup
  def test_auto_export_removes_old_bak(tmp_path):
      from session_stop import auto_export
      export_path = tmp_path / ".claude" / "memory-export.json"
      export_path.parent.mkdir(parents=True)
      bak = str(export_path) + ".bak"
      # create stale .bak
      with open(bak, 'w') as f:
          f.write("{}")
      old_time = time.time() - 86400 * 8
      os.utime(bak, (old_time, old_time))
      with patch("os.getcwd", return_value=str(tmp_path)), \
           patch("urllib.request.urlopen") as mock_url:
          mock_url.return_value.__enter__ = lambda s: s
          mock_url.return_value.__exit__ = MagicMock(return_value=False)
          mock_url.return_value.read = lambda: json.dumps({"observations": [], "summaries": []}).encode()
          auto_export("testproject")
      assert not os.path.exists(bak)
  ```
- Edge cases: tests must mock os.getcwd and urllib — hooks use absolute paths derived from getcwd
- ⚠️ Breaking change: none
- Verify: `cd tests && python -m pytest test_hooks.py -v` — all 5 tests pass
- Dependencies: Task 5 (test_staleness_returns_unknown depends on Task 5 fix), Task 6 (test_auto_export_removes_old_bak depends on Task 6 fix)

**Task 9 — Close 19 already-fixed GitHub issues** `S`
- File: GitHub issues (via gh CLI)
- Reuse: none
- Code sample:
  ```bash
  REPO="kaeltech-id/EffiClaude"
  MSG="Fixed in current codebase — this issue was resolved in a prior commit. See current source for implementation."
  for n in 14 17 18 19 20 22 24 25 26 27 29 30 31 32 33 34 36 37 38; do
    gh issue close $n -R $REPO -c "$MSG"
  done
  ```
- Edge cases: some issues may already be closed — `gh issue close` will silently succeed
- ⚠️ Breaking change: none
- Verify: `gh issue list -R kaeltech-id/EffiClaude --state open --json number | python3 -c "import json,sys; nums={i['number'] for i in json.load(sys.stdin)}; print('ok' if not ({14,17,18,19,20,22,24,25,26,27,29,30,31,32,33,34,36,37,38} & nums) else 'FAIL')"` returns "ok"
- Dependencies: none

**Task 10 — Close 9 newly-fixed GitHub issues** `S`
- File: GitHub issues (via gh CLI)
- Reuse: none
- Code sample:
  ```bash
  REPO="kaeltech-id/EffiClaude"
  gh issue close 21 -R $REPO -c "Fixed: added backslash check to _is_safe_path() in server/worker.py"
  gh issue close 23 -R $REPO -c "Fixed: graph_index() now returns str(e) instead of generic 'indexing failed' string"
  gh issue close 28 -R $REPO -c "Fixed: project list read in _reconcile_chromadb() now inside _lock scope"
  gh issue close 13 -R $REPO -c "Fixed: check_context_staleness() returns unknown-age message when comment format is absent"
  gh issue close 39 -R $REPO -c "Fixed: auto_export() now cleans up .bak files older than 7 days"
  gh issue close 16 -R $REPO -c "Fixed: ec-feature.md now shows 'Use it anyway? (y/n):' for expired decisions, allowing reuse"
  gh issue close 35 -R $REPO -c "Fixed: added type hints to all public methods in server/docs.py and server/graph.py"
  gh issue close 40 -R $REPO -c "Fixed: added docstrings to all Flask route handlers in server/worker.py"
  gh issue close 15 -R $REPO -c "Fixed: added tests/test_hooks.py with 5 unit tests covering check_context_staleness, check_uncommitted, and auto_export"
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `gh issue list -R kaeltech-id/EffiClaude --state open --json number | python3 -c "import json,sys; print(len(json.load(sys.stdin)), 'open issues remaining')"` returns "0 open issues remaining"
- Dependencies: Tasks 1-8 must complete before closing
