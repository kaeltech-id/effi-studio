# Feature: Batch A — Critical Reliability (Worker Visibility + Rollback + Uncommitted Reminder + commit-msg Hook)

## Impact Analysis
- Files affected: `commands/ec-brainstorm.md`, `commands/ec-feature.md`, `commands/ec-execute.md`, `commands/ec-review.md`, `commands/ec-setup.md`, `hooks/session_stop.py`, `hooks/commit-msg` (new), `install.sh`
- ⚠️ Breaking change risk: none — additive changes only

## Reusable Existing Code
- `ensure_worker()` in `hooks/session_stop.py:24` — existing pattern for worker check
- `HOOK_FILES` array in `install.sh:16` — existing pattern for hook installation

## Tasks
- [ ] Task 1: Worker banner in ec-brainstorm.md [S] — replace silent check with visible status
- [ ] Task 2: Worker banner in ec-feature.md [S] — replace silent check with visible status
- [ ] Task 3: Worker banner in ec-execute.md [S] — replace silent check with visible status
- [ ] Task 4: Worker banner in ec-review.md [S] — replace silent check with visible status
- [ ] Task 5: Worker banner in ec-setup.md [S] — replace silent check with visible status
- [ ] Task 6: Rollback snapshot in ec-execute.md [S] — add Step 1.5 with git stash before execution
- [ ] Task 7: Uncommitted changes check in session_stop.py [S] — print reminder on session stop
- [ ] Task 8: Create hooks/commit-msg script [S] — bash script that auto-bumps VERSION
- [ ] Task 9: Update install.sh for commit-msg hook [S] — download + install to project .git/hooks/
- [ ] Task 10: Update ec-setup.md to install commit-msg hook per-project [S]

---

## Per Task Detail

**Task 1 — Worker banner in ec-brainstorm.md** `S`
- File: `commands/ec-brainstorm.md`
- Reuse: none
- Code sample — replace lines 6–11:
  ```
  Check worker status: `curl -s http://localhost:37777/health`
  - If running: show "(worker online ✓ — memory active)" then load relevant memory:
    `curl -s "http://localhost:37777/memory/search?q={problem_keywords}&project={project_name}&limit=5"`
  - If offline: show "(worker OFFLINE ⚠️ — memory unavailable)" and continue without memory

  Use memory to surface: past decisions, similar problems solved before, patterns already in use. Do not dump raw memory — silently inform your suggestions.
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "worker online\|worker OFFLINE" commands/ec-brainstorm.md` → returns both strings
- Dependencies: none

---

**Task 2 — Worker banner in ec-feature.md** `S`
- File: `commands/ec-feature.md`
- Reuse: none
- Code sample — replace line 4 `Silently check worker: \`curl -s http://localhost:37777/health\`` with:
  ```
  Check worker status: `curl -s http://localhost:37777/health`
  - If running: show "(worker online ✓ — memory active)" then load recent project memory
  - If offline: show "(worker OFFLINE ⚠️ — memory unavailable)" and continue without memory
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "worker online\|worker OFFLINE" commands/ec-feature.md` → returns both strings
- Dependencies: none

---

**Task 3 — Worker banner in ec-execute.md** `S`
- File: `commands/ec-execute.md`
- Reuse: none
- Code sample — replace lines starting with `Check worker: \`curl -s http://localhost:37777/health\`` through `- Pass relevant memory + docs snippets...`:
  ```
  Check worker status: `curl -s http://localhost:37777/health`
  - If running: show "(worker online ✓ — memory/docs/graph active)" then load memory and docs
  - If offline: show "(worker OFFLINE ⚠️ — memory/docs/graph unavailable)" and continue
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "worker online\|worker OFFLINE" commands/ec-execute.md` → returns both strings
- Dependencies: none

---

**Task 4 — Worker banner in ec-review.md** `S`
- File: `commands/ec-review.md`
- Reuse: none
- Code sample — replace `Check worker: \`curl -s http://localhost:37777/health\`` block:
  ```
  Check worker status: `curl -s http://localhost:37777/health`
  - If running: show "(worker online ✓ — memory/docs active)" then load memory and docs
  - If offline: show "(worker OFFLINE ⚠️ — memory/docs unavailable)" and continue
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "worker online\|worker OFFLINE" commands/ec-review.md` → returns both strings
- Dependencies: none

---

**Task 5 — Worker banner in ec-setup.md** `S`
- File: `commands/ec-setup.md`
- Reuse: none
- Code sample — replace Step 0 body (lines 4–9):
  ```
  Check worker status:
  ```
  curl -s http://localhost:37777/health
  ```
  - If running: show "(worker online ✓ — memory/docs active)" and proceed normally.
  - If not running: show "(worker OFFLINE ⚠️ — memory/docs unavailable)" and continue without those features.
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "worker online\|worker OFFLINE" commands/ec-setup.md` → returns both strings
- Dependencies: none

---

**Task 6 — Rollback snapshot in ec-execute.md** `S`
- File: `commands/ec-execute.md`
- Reuse: none
- Code sample — add new section between Step 1 and Step 2:
  ```markdown
  ## Step 1.5 — Rollback Snapshot
  Before any task executes, create a safety snapshot:
  ```
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  git stash --include-untracked -m "efficlaude-pre-execute-$TIMESTAMP" 2>/dev/null \
    && echo "Snapshot saved: efficlaude-pre-execute-$TIMESTAMP" \
    || echo "(nothing to snapshot — clean working tree)"
  ```
  Show the stash label to the user: "To restore if needed: `git stash pop`"
  If nothing to stash (clean tree): note it silently and continue.
  ```
- Edge cases: clean working tree → `git stash` returns "No local changes to save" — catch and continue
- ⚠️ Breaking change: none — additive step, existing steps unaffected
- Verify: `grep "efficlaude-pre-execute\|Rollback Snapshot" commands/ec-execute.md` → returns both strings
- Dependencies: Task 3 (same file — execute after T3)

---

**Task 7 — Uncommitted changes check in session_stop.py** `S`
- File: `hooks/session_stop.py`
- Reuse: `subprocess` already imported at line 7
- Code sample — add function before `main()` and call at end of `main()`:
  ```python
  def check_uncommitted():
      try:
          result = subprocess.run(
              ["git", "status", "--porcelain"],
              capture_output=True, text=True, cwd=os.getcwd(), timeout=5
          )
          if result.stdout.strip():
              print("\n⚠️  Uncommitted changes detected. Run /ec-git to commit before closing.")
      except Exception:
          pass
  ```
  At end of `main()`, after the `try/except` block, add:
  ```python
  check_uncommitted()
  ```
- Edge cases: not in git repo → `git status` returns error → caught by `except Exception: pass`
- ⚠️ Breaking change: none
- Verify: `grep "check_uncommitted\|Uncommitted changes" hooks/session_stop.py` → returns both strings
- Dependencies: none

---

**Task 8 — Create hooks/commit-msg script** `S`
- File: `hooks/commit-msg` (new file)
- Reuse: none
- Code sample (full file):
  ```bash
  #!/bin/bash
  # Auto-bumps VERSION based on conventional commit prefix
  COMMIT_MSG=$(cat "$1")
  VERSION_FILE="$(git rev-parse --show-toplevel 2>/dev/null)/VERSION"
  [ -f "$VERSION_FILE" ] || exit 0
  read -r CUR < "$VERSION_FILE"
  IFS='.' read -r MAJ MIN PAT <<< "$CUR"
  if echo "$COMMIT_MSG" | grep -qE '^feat!:|BREAKING CHANGE'; then
      NEW="$((MAJ+1)).0.0"
  elif echo "$COMMIT_MSG" | grep -qE '^feat:'; then
      NEW="$MAJ.$((MIN+1)).0"
  elif echo "$COMMIT_MSG" | grep -qE '^fix:'; then
      NEW="$MAJ.$MIN.$((PAT+1))"
  else
      exit 0
  fi
  echo "$NEW" > "$VERSION_FILE"
  git add "$VERSION_FILE"
  echo "VERSION bumped: $CUR → $NEW"
  ```
- Edge cases: no VERSION file → `exit 0` (no-op); non-conventional prefix → `exit 0` (no-op)
- ⚠️ Breaking change: none
- Verify: `bash -n hooks/commit-msg && echo "syntax ok"` → returns "syntax ok"
- Dependencies: none

---

**Task 9 — Update install.sh for commit-msg hook** `S`
- File: `install.sh`
- Reuse: `HOOK_FILES` array pattern at line 16, `HOOKS_DIR` variable
- Code sample — two changes:
  1. Add `"commit-msg"` to `HOOK_FILES` array (line 16):
     ```bash
     HOOK_FILES=("post_tool_use.py" "session_stop.py" "prompt_submit.py" "commit-msg")
     ```
  2. After the hooks loop (after line 76), add git hook installation:
     ```bash
     # Install commit-msg hook into current project's .git/hooks/
     if git rev-parse --git-dir > /dev/null 2>&1; then
       GIT_HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
       cp "$HOOKS_DIR/commit-msg" "$GIT_HOOKS_DIR/commit-msg"
       chmod +x "$GIT_HOOKS_DIR/commit-msg"
       echo "  ✓ commit-msg hook installed in .git/hooks/"
     fi
     ```
- Edge cases: not in git repo → `git rev-parse` fails → `if` block skipped silently
- ⚠️ Breaking change: none
- Verify: `grep "commit-msg" install.sh` → returns entries in HOOK_FILES and git hook block
- Dependencies: Task 8 (commit-msg file must exist before adding to install.sh)

---

**Task 10 — Update ec-setup.md to install commit-msg hook per-project** `S`
- File: `commands/ec-setup.md`
- Reuse: pattern from Step 3 existing file writes
- Code sample — add to Step 3, after `### .gitignore` section:
  ```markdown
  ### .git/hooks/commit-msg
  If `~/.efficlaude/hooks/commit-msg` exists:
  ```bash
  cp ~/.efficlaude/hooks/commit-msg .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg
  ```
  Show: "✓ commit-msg hook installed — VERSION auto-bumps on feat:/fix: commits"
  If `~/.efficlaude/hooks/commit-msg` does not exist: skip silently.
  ```
- Edge cases: project has no VERSION file — hook exits cleanly (exit 0 guard already in script)
- ⚠️ Breaking change: none
- Verify: `grep "commit-msg hook\|commit-msg" commands/ec-setup.md` → returns new lines
- Dependencies: Task 5 (same file — execute after T5), Task 8 (commit-msg script must exist)
