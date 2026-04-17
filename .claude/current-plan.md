## Feature: Medium Issues Batch — All 5 Fixes

### Impact Analysis
- Files affected: install.sh, commands/ec-feature.md, commands/ec-review.md,
  server/worker.py, hooks/post_tool_use.py, hooks/prompt_submit.py,
  hooks/session_stop.py, server/memory.py, server/graph.py
- ⚠️ Breaking change risk: none — all fallbacks preserved, no API changes

### Reusable Existing Code
- `threading.Thread(target=..., daemon=True).start()` pattern — already in docs.py:193
- `os.environ.get('KEY', default)` pattern — already in worker.py for BASE_DIR
- `|| { echo "..."; exit 1; }` pattern — already in install.sh lines 25, 34

### Tasks
- [ ] Task 1: install.sh pip verify [S] — add exit code check after pip3 install
- [ ] Task 2: ec-feature.md remove delete [S] — remove decision.md delete instruction
- [ ] Task 3: ec-review.md add delete [S] — add decision.md delete after clean review
- [ ] Task 4: worker.py port env var [S] — replace 37777 with EFFICLAUDE_PORT env var
- [ ] Task 5: post_tool_use.py port env var [S] — replace WORKER_URL hardcoded port
- [ ] Task 6: prompt_submit.py port env var [S] — replace WORKER_URL hardcoded port
- [ ] Task 7: session_stop.py port env var [S] — replace WORKER_URL hardcoded port
- [ ] Task 8: memory.py async prune [S] — wrap _prune_on_startup in thread
- [ ] Task 9: graph.py export* pattern [S] — add export * from pattern to JS/TS

### Per Task Detail

**Task 1 — install.sh pip verify** `S`
- File: `install.sh`
- Reuse: `|| { echo "..."; exit 1; }` pattern (lines 25, 34)
- Code sample — replace lines 88-90:
  ```bash
  echo "Installing Python dependencies..."
  pip3 install -q -r "$SERVER_DIR/requirements.txt" \
    || { echo "  ✗ Failed to install Python dependencies. Check requirements.txt."; exit 1; }
  echo "  ✓ Python dependencies installed"
  ```
- Edge cases: pip3 not found → already fails with exit 1 from shell
- ⚠️ Breaking change: none
- Verify: `grep -A2 "pip3 install" /Users/admin/EffiClaude/install.sh` → must show `|| {` on next line
- Dependencies: none

**Task 2 — ec-feature.md remove delete instruction** `S`
- File: `commands/ec-feature.md`
- Reuse: none
- Code sample — replace this exact line:
  `- After planning is complete, delete \`.claude/decision.md\` so it doesn't carry over to next feature`
  with:
  `- Do NOT delete \`.claude/decision.md\` here — it will be deleted by \`/ec-review\` after a clean review`
- ⚠️ Breaking change: none
- Verify: `grep "delete.*decision\|decision.md" /Users/admin/EffiClaude/commands/ec-feature.md` → must NOT show delete instruction, must show "Do NOT delete"
- Dependencies: none

**Task 3 — ec-review.md add delete instruction** `S`
- File: `commands/ec-review.md`
- Reuse: none
- Code sample — insert before the line `If everything is clean: "No issues found. Ready to commit."`:
  ```
  **If review is clean**, delete `.claude/decision.md` if it exists (run `rm -f .claude/decision.md`), so it doesn't carry over to the next feature.

  ```
- Edge cases: decision.md may not exist → `rm -f` is safe (no error)
- ⚠️ Breaking change: none
- Verify: `grep -n "decision.md\|rm -f" /Users/admin/EffiClaude/commands/ec-review.md` → must show `rm -f .claude/decision.md`
- Dependencies: none

**Task 4 — worker.py port env var** `S`
- File: `server/worker.py`
- Reuse: `os.environ.get()` already used in file
- Code sample — replace the last line before `if __name__`:
  ```python
  # old:
  app.run(host='127.0.0.1', port=37777, debug=False, threaded=True)
  # new:
  app.run(host='127.0.0.1', port=int(os.environ.get('EFFICLAUDE_PORT', 37777)), debug=False, threaded=True)
  ```
- Edge cases: non-numeric env var → int() raises ValueError → acceptable loud failure
- ⚠️ Breaking change: none (default 37777 unchanged)
- Verify: `grep "EFFICLAUDE_PORT" /Users/admin/EffiClaude/server/worker.py`
- Dependencies: none

**Task 5 — post_tool_use.py port env var** `S`
- File: `hooks/post_tool_use.py`
- Reuse: none
- Code sample — replace line with `WORKER_URL = "http://localhost:37777"`:
  ```python
  WORKER_URL = f"http://localhost:{os.environ.get('EFFICLAUDE_PORT', '37777')}"
  ```
- Edge cases: `os` already imported
- ⚠️ Breaking change: none
- Verify: `grep "EFFICLAUDE_PORT" /Users/admin/EffiClaude/hooks/post_tool_use.py`
- Dependencies: none

**Task 6 — prompt_submit.py port env var** `S`
- File: `hooks/prompt_submit.py`
- Reuse: same pattern as Task 5
- Code sample — replace `WORKER_URL = "http://localhost:37777"`:
  ```python
  WORKER_URL = f"http://localhost:{os.environ.get('EFFICLAUDE_PORT', '37777')}"
  ```
- ⚠️ Breaking change: none
- Verify: `grep "EFFICLAUDE_PORT" /Users/admin/EffiClaude/hooks/prompt_submit.py`
- Dependencies: none

**Task 7 — session_stop.py port env var** `S`
- File: `hooks/session_stop.py`
- Reuse: same pattern as Task 5
- Code sample — replace `WORKER_URL = "http://localhost:37777"`:
  ```python
  WORKER_URL = f"http://localhost:{os.environ.get('EFFICLAUDE_PORT', '37777')}"
  ```
- ⚠️ Breaking change: none
- Verify: `grep "EFFICLAUDE_PORT" /Users/admin/EffiClaude/hooks/session_stop.py`
- Dependencies: none

**Task 8 — memory.py async prune** `S`
- File: `server/memory.py`
- Reuse: `threading` already imported (line 9); same Thread pattern as docs.py
- Code sample — replace `self._prune_on_startup()` in `__init__`:
  ```python
  # old:
  self._prune_on_startup()
  # new:
  threading.Thread(target=self._prune_on_startup, daemon=True).start()
  ```
- Edge cases: errors inside _prune_on_startup already caught with warn()
- ⚠️ Breaking change: none (same outcome, non-blocking)
- Verify: `grep "Thread.*prune\|prune.*Thread" /Users/admin/EffiClaude/server/memory.py`
- Dependencies: none

**Task 9 — graph.py export* pattern** `S`
- File: `server/graph.py`
- Reuse: existing `_extract_imports` patterns dict structure
- Code sample — add to both `javascript` and `typescript` lists in `_extract_imports`:
  ```python
  r'''export\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]''',
  ```
  Final javascript list:
  ```python
  'javascript': [
      r'''import\s+.*?from\s+['"]([^'"]+)['"]''',
      r'''require\s*\(\s*['"]([^'"]+)['"]\s*\)''',
      r'''import\s*\(\s*['"]([^'"]+)['"]\s*\)''',
      r'''export\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]''',
  ],
  ```
  Same addition for `typescript`.
- Edge cases: `export * as ns from './foo'` also covered by `(?:as\s+\w+\s+)?` optional group
- ⚠️ Breaking change: none (additive only)
- Verify: `python3 -c "import re; s = \"export * from './foo'\"; m = re.search(r'''export\s+\*\s+(?:as\s+\w+\s+)?from\s+['\"]([^'\"]+)['\"]''', s); print(m.group(1))"` → must print `./foo`
- Dependencies: none
