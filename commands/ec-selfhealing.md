Detect bugs and improvement opportunities in any project, then auto-fix them. Invoke directly — this skill runs its own full detect → plan → execute → re-verify cycle.

⚠️ STANDALONE RULE: This skill MUST ONLY be invoked directly by the user typing `/ec-selfhealing`. No other EffiClaude skill, command, or automated workflow may call this skill. If you detect this was triggered from within another skill's flow (not a direct user message): stop immediately and show — "⚠️ ec-selfhealing cannot be called from other skills. Type /ec-selfhealing directly."

## Step 0 — Guard + Load Context

**Standalone check:** Verify this was triggered by a direct user message. If another skill is the caller — stop per the STANDALONE RULE above.

**Branch detection + session lock:**
```bash
BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
[ -z "$BRANCH" ] && BRANCH="default"
# Its own file, never the shared plan. Writing to .claude/plans/{branch}.md
# would destroy an in-progress feature plan, which the file lock does not
# prevent: the lock stops concurrent access, not sequential overwriting.
# A separate file also keeps these plans out of the driver's routing, which
# probes .claude/plans/{branch}.md.
PLAN_FILE=".claude/plans/selfheal-${BRANCH}.md"
SESSION_ID=$(python3 -c "import uuid; print(str(uuid.uuid4())[:8])")
```

```bash
LOCK_RESULT=$(python3 ~/.efficlaude/server/file_lock.py acquire "$PLAN_FILE" "$SESSION_ID" 2>/dev/null \
  || echo '{"status":"error"}')
LOCK_STATUS=$(echo "$LOCK_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null)
```
- If LOCK_STATUS is `"busy"`: extract holder info, show "⚠️ Plan locked by: {holder}", ask "Abort or wait? (a/w):" — retry 18×10s then abort if still locked.
- If `"error"`: show "(lock unavailable — proceeding)" and continue.
- Note: SESSION_ID + PLAN_FILE for use in Steps 3–6.

**Context:**
- Read `.claude/project-config.json` if it exists → note project_name (fallback: basename of cwd)
- Read `.claude/context/stack.md` if it exists → inform agent tag detection per task
- Check worker: `curl -s http://localhost:37777/health` → show "(worker online ✓)" or "(worker OFFLINE ⚠️)"

**Scope:** Ask once: "Any specific path or module to focus on? (e.g. `src/` — or press Enter to scan everything)"
- User provides path → validate: `[ -e "{path}" ] || echo "not found"`. If not found: show "⚠️ Path not found: {path}" and ask again. If found: SCAN_ROOT = that path.
- Empty / Enter → SCAN_ROOT = `.`

## Step 1 — Bug & Issue Detection

Show "(scanning...)" before each group. Run only checks that apply to this project. Skip silently if tool not found or no files match.

### 1.1 Test Suite
```bash
# Python pytest — only run if pytest is installed
python3 -c "import pytest" 2>/dev/null \
  && python3 -m pytest --tb=short -q {SCAN_ROOT} 2>&1 | tail -40

# Node: jest
[ -f "package.json" ] && grep -q '"jest"' package.json \
  && npx jest --passWithNoTests --forceExit 2>&1 | tail -30

# Node: vitest
[ -f "package.json" ] && grep -q '"vitest"' package.json \
  && npx vitest run 2>&1 | tail -30

# Go
[ -f "go.mod" ] && go test ./... 2>&1 | tail -20
```
Capture: each FAILED test — file, test name, error message.

### 1.2 Syntax & Compile Errors
```bash
# Python
find {SCAN_ROOT} -name "*.py" \
  -not -path "*/node_modules/*" -not -path "*/.venv/*" \
  -not -path "*/__pycache__/*" -not -path "*/env/*" \
  | head -100 \
  | xargs -I{} python3 -m py_compile {} 2>&1 | grep -v "^$"

# TypeScript
[ -f "tsconfig.json" ] && npx tsc --noEmit 2>&1 | head -40
```

### 1.3 Linting
```bash
# Python: ruff preferred, fallback flake8
command -v ruff >/dev/null 2>&1 \
  && ruff check {SCAN_ROOT} --output-format=concise 2>&1 | head -30 \
  || { command -v flake8 >/dev/null 2>&1 \
       && flake8 {SCAN_ROOT} --max-line-length=120 2>&1 | head -30; }

# JS/TS
{ [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ] \
  || [ -f "eslint.config.js" ] || [ -f "eslint.config.mjs" ]; } \
  && npx eslint {SCAN_ROOT} --ext .ts,.tsx,.js,.jsx 2>&1 | head -30
```

### 1.4 Type Errors
```bash
# Python mypy (only if mypy is configured for this project)
{ [ -f "mypy.ini" ] \
  || grep -q "\[mypy\]" setup.cfg 2>/dev/null \
  || grep -q "mypy" pyproject.toml 2>/dev/null; } \
  && mypy {SCAN_ROOT} --ignore-missing-imports 2>&1 | head -20
```
TypeScript type errors are already covered by 1.2 (`tsc --noEmit`).

### 1.5 Recent Changes Scan
```bash
git log --oneline -10 2>/dev/null
git diff HEAD~5..HEAD --name-only 2>/dev/null | head -20
```
For each recently changed file within SCAN_ROOT: read it and flag obvious issues introduced (broken imports, missing `await`, unclosed resources, missing error handling, etc.).

### 1.6 Code Smell Scan
```bash
# Active TODO/FIXME/BUG/HACK markers (skip test files and node_modules)
grep -rn "TODO\|FIXME\|HACK\|BUG\b\|XXX" \
  --include="*.py" --include="*.ts" --include="*.tsx" \
  --include="*.js" --include="*.go" \
  {SCAN_ROOT} 2>/dev/null \
  | grep -v "node_modules\|\.git\|test\|spec\|__test" | head -20

# Debug artifacts left in production code
grep -rn "print(\|console\.log\|debugger;\|breakpoint()\|pdb\." \
  --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" \
  {SCAN_ROOT} 2>/dev/null \
  | grep -v "node_modules\|\.git\|test\|spec\|__test\|logger" | head -20
```

### 1.7 Improvement Opportunities
While reading scan results and recently changed files, also flag:
- Missing error handling around I/O, network calls, or subprocess
- Hardcoded values that should be constants or config
- Functions over 50 lines with a clear split point
- Missing type annotations on public-facing functions (Python/TS)
- N+1 patterns (database or API calls inside loops)

## Step 2 — Triage

Deduplicate and categorize all findings. Remove false positives (e.g. `print(` inside logging wrappers, TODO in docstrings that are intentional).

Present:
```
## Self-Healing Scan — {project_name}
Scanned: {SCAN_ROOT}

🔴 Critical ({n})
  1. {file}:{line} — {description}

🟡 High ({n})
  2. {file}:{line} — {description}

🟢 Medium ({n})
  3. {file}:{line} — {description}

⚪ Low / Improvements ({n})
  4. {file}:{line} — {description}

Total: {N} issues
```

If **zero issues found**:
  Show: "✅ No issues detected — codebase looks clean."
  Release lock: `python3 ~/.efficlaude/server/file_lock.py release "$PLAN_FILE" "$SESSION_ID" 2>/dev/null`
  Stop.

**Ask once:** "Fix all {N} issues? (y/n) — or type numbers to select (e.g. 1,3,5):"
- `n` → release lock, show "(no changes made)", stop
- `y` → fix all issues
- numbers (e.g. `2,4`) → fix only those numbered issues

## Step 3 — Generate Fix Plan

For each confirmed issue create one atomic fix task. Use the agent tag table from ec-feature (file extension → agent): `.py` → `ec-python`, `.ts`/`.tsx` → `ec-typescript` or `ec-react`, etc.

Write to `{PLAN_FILE}`:
```markdown
## Feature: Self-Healing Fix — {YYYY-MM-DD}

### Issues Detected
- 🔴 Critical: {count}
- 🟡 High: {count}
- 🟢 Medium: {count}
- ⚪ Low: {count}

### Tasks
- [ ] Task 1: Fix {issue_type} in {filename} [S] [agent: ec-xxx] — {one-line description}
- [ ] Task 2: Fix {issue_type} in {filename} [S] [agent: ec-xxx] — {one-line description}
```

Run `mkdir -p .claude/plans` then save to `{PLAN_FILE}`.

**No-Code Rule:** Do NOT write any fix code in this step. All code changes happen in Step 4 subagents only.

## Step 4 — Execute Fixes

Read all `- [ ]` tasks from `{PLAN_FILE}`. Compute total = count of all task lines (`- [ ]` + `- [x]`).

For each `- [ ]` task in document order:
1. Show: "▶ Fixing {current}/{total}: {task name}"
2. Spawn one subagent with:
   - Exact file path + line number of the issue
   - Issue description and severity level
   - Fix approach: **minimal and surgical** — fix only this specific issue, do not refactor surrounding code, do not add features, do not change behavior of working code
   - Verify step: exact command to re-run the check that caught this issue
   - Agent expertise context: if `[agent: ec-xxx]` tag present and `~/.claude/agents/ec-xxx.md` exists, prepend its body to the subagent prompt
3. Subagent MUST prove the fix works by running the verify step and showing actual output before claiming done
4. After subagent confirms: edit `{PLAN_FILE}` — replace `- [ ] Task N: {name}` with `- [x] Task N: {name}` for this task only
5. Show: "✓ Fixed {current}/{total}: {description of what changed}"

**If subagent cannot fix an issue:**
- Mark `- [!] Task N: {name}` in `{PLAN_FILE}` (manual intervention needed)
- Show: "⚠️ Task {n} needs manual fix: {reason}"
- Continue to next task — do not block

## Step 5 — Re-verify

Re-run the full detection suite from Step 1 using the same SCAN_ROOT and same commands.

Show comparison:
```
## Re-verification

Before: {N} issues
After:  {M} issues
Fixed:  {N-M} ✓
Manual: {manual_count} ⚠️
```

If M > 0: list each remaining issue with a one-line suggested manual fix approach.

## Step 6 — Release Lock + Report

Release plan lock:
```bash
python3 ~/.efficlaude/server/file_lock.py release "$PLAN_FILE" "$SESSION_ID" 2>/dev/null || true
```

If worker is running, save to memory:
```bash
curl -s -X POST http://localhost:37777/memory/observe \
  -H "Content-Type: application/json" \
  -d "{\"project\": \"{project_name}\", \"type\": \"selfhealing\", \"content\": \"Self-healing run on {SCAN_ROOT}: {N} issues found, {N-M} fixed, {manual_count} manual. Files touched: {touched_files}.\", \"metadata\": {\"source\": \"selfhealing\"}}"
```

Show final summary:
```
## Self-Healing Complete

Project:  {project_name}
Scanned:  {SCAN_ROOT}
Found:    {N} issues
Fixed:    {N-M} automatically ✓
Manual:   {manual_count} ⚠️
Files touched: {list}
```

If all fixed (M == 0 and manual_count == 0):
  "All issues resolved. Run /ec-git to commit the fixes."
If some remain:
  "Fix the {M} remaining issues above manually, then run /ec-git."
