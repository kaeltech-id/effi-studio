Execute the current feature plan sequentially, one task at a time, with resumable state.

## Step 1 — Load Context

**Branch detection:** Run:
```bash
BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
[ -z "$BRANCH" ] && BRANCH="default"
PLAN_FILE=".claude/plans/${BRANCH}.md"
```
Note: "(branch: {BRANCH} → plan: {PLAN_FILE})"

**Session lock:** Generate a session ID and acquire an exclusive lock on the plan file to prevent concurrent ec-execute runs:
```bash
SESSION_ID=$(python3 -c "import uuid; print(str(uuid.uuid4())[:8])")
LOCK_RESULT=$(python3 ~/.efficlaude/server/file_lock.py acquire "{PLAN_FILE}" "$SESSION_ID" 2>/dev/null \
  || echo '{"status":"error"}')
LOCK_STATUS=$(echo "$LOCK_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null)
```
- Note SESSION_ID — it will be needed in the release step.
- If LOCK_STATUS is `"busy"`:
  - Extract holder info: `echo "$LOCK_RESULT" | python3 -c "import sys,json; h=json.load(sys.stdin).get('holder',{}); print(f\"session {h.get('session_id','?')} (PID {h.get('pid','?')}) since {h.get('acquired_at','?')[:16]}\")"`
  - Show: "⚠️ Plan locked by another terminal: {holder_info}"
  - Ask: "Abort or wait for lock to clear? (a/w):"
    - If `a`: stop — "Run /ec-execute in the other terminal first, or delete `{PLAN_FILE}.lock` manually." If a `.claude/.autoflow` sentinel exists whose `branch=` matches the current branch, also run `rm -f .claude/.autoflow` before stopping (auto-flow cannot proceed past a busy lock).
    - If `w`: run retry loop (10-second intervals, up to 3 minutes):
      ```bash
      for i in $(seq 1 18); do
        sleep 10
        LOCK_RESULT=$(python3 ~/.efficlaude/server/file_lock.py acquire "{PLAN_FILE}" "$SESSION_ID" 2>/dev/null || echo '{"status":"error"}')
        LOCK_STATUS=$(echo "$LOCK_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null)
        [ "$LOCK_STATUS" = "acquired" ] && echo "Lock acquired after ${i}0 seconds." && break
        echo "Still waiting... attempt $i/18"
      done
      [ "$LOCK_STATUS" != "acquired" ] && echo "⚠️ Lock not cleared after 3 minutes. Aborting." && exit 1
      ```
- If LOCK_STATUS is `"error"` (file_lock.py not installed): show "(lock unavailable — proceeding without lock)" and continue normally.

**Migration check:** If `.claude/current-plan.md` exists and `{PLAN_FILE}` does not:
- Run: `mkdir -p .claude/plans && mv .claude/current-plan.md {PLAN_FILE}`
- Show: "(migrated .claude/current-plan.md → {PLAN_FILE})"

Read:
- `{PLAN_FILE}` — read the header sections (`### Impact Analysis` through `### Grounding`) and the `### Tasks` checklist ONLY. Do not read `### Per Task Detail` in full — a large plan is tens of thousands of tokens and only one task's block is needed at a time.
  Then, per task, read just that task's block: locate its start with `grep -n "^\*\*Task {N} —" {PLAN_FILE}`, take the next `^\*\*Task ` match as the end (or end-of-file for the last task), and read only that line range. The `### Grounding` section must be in the header read, because every Verify threshold traces to a baseline recorded there.
- `.claude/project-config.json`
- `.claude/context/stack.md`
- `.claude/context/structure.md`
- `.claude/context/conventions.md`
- `CLAUDE.md`

Check worker status: `curl -s http://localhost:37777/health`
- If running: show "(worker online ✓ — memory/docs/graph active)" then load memory and docs:
  `curl -s "http://localhost:37777/memory/search?q={feature_name}&project={project_name}&limit=5"`
  `curl -s "http://localhost:37777/docs/search?q={feature_keywords}&project={project_name}&limit=5"`
  Use these for your own orientation only. Do NOT forward memory or docs snippets into subagent prompts — the relevance floor in `hooks/prompt_submit.py` already decides what is worth injecting, and re-injecting per task multiplies any residual noise by the task count.
- If offline: show "(worker OFFLINE ⚠️ — memory/docs/graph unavailable)" and continue.

**Resume check:** After reading `{PLAN_FILE}`, count:
- `done` = number of lines matching `- [x]`
- `remaining` = number of lines matching `- [ ]`

If `remaining == 0` and `done > 0`:
  Show: "All {done} tasks already complete — run /ec-review."
  Stop.
If `remaining == 0` and `done == 0`:
  Show: "No tasks found in {PLAN_FILE}. Run /ec-feature first."
  Stop.
If `done > 0` and `remaining > 0`:
  Show: "Resuming: {done} tasks already done, {remaining} remaining."

**Mode check:** Run `cat .claude/.mode 2>/dev/null || echo "structured"` → note as MODE.
- If `vibe`: skip Step 6 memory save (`curl .../memory/observe`), skip "Next: run /ec-review" in Step 7 report
- If `structured` (or file absent): proceed normally

**Auto-Flow check:** Detect auto-flow chaining:
```bash
AUTOFLOW=".claude/.autoflow"
AUTO="no"
if [ -f "$AUTOFLOW" ]; then
  MTIME=$(stat -f %m "$AUTOFLOW" 2>/dev/null || stat -c %Y "$AUTOFLOW" 2>/dev/null || echo 0)
  AGE=$(( $(date +%s) - MTIME ))
  SENT_BRANCH=$(grep '^branch=' "$AUTOFLOW" 2>/dev/null | cut -d= -f2)
  if [ "$AGE" -gt 7200 ] || [ "$SENT_BRANCH" != "$BRANCH" ]; then rm -f "$AUTOFLOW"; else AUTO="yes"; fi
fi
```
When `AUTO=yes`: auto-skip confirmation gates (like `vibe`). On any abnormal stop, delete the sentinel (see Error Recovery / Timeout). On successful completion, leave the sentinel for `/ec-review` to consume. Partial progress is safe: if this context ends mid-plan (context exhaustion or compaction), the Stop-hook driver re-invokes `/ec-execute` from the plan file's remaining `- [ ]` lines — so do NOT delete the sentinel merely because the context ended mid-plan; only a genuine abort (Error Recovery / Timeout) deletes it.

## Step 2 — Pre-flight Check
Before executing, verify:
- All files referenced in the plan exist (if modifying existing files)
- No two tasks write to the same file (conflict risk)
- Dependencies between tasks are correctly ordered
- Every task has a verify step defined

If any issue found, report it and ask:
"Found pre-flight issue: {issue}. Continue anyway? (y/n):"
If `AUTO=yes`: do not prompt — abort the chain instead. Delete the sentinel (`rm -f .claude/.autoflow`), release the lock, report the pre-flight issue, and stop. Auto-flow never silently continues past a pre-flight failure.

## Step 3 — Execute Sequentially
Read all tasks from `{PLAN_FILE}`. Find all lines matching `- [ ]`.
Compute: total = count of ALL task lines (both `[x]` and `[ ]`).

### Execution units — co-location fusion
Before the loop, build execution units from the task list. Opening the same file once per task, re-deriving its conventions each time, and re-running its build each time is pure waste when consecutive tasks edit the same file.

1. Read each pending task's `File:` and `Dependencies:` lines (ranged read, per Step 1).
2. Fuse CONSECUTIVE pending tasks that share the same `File:` into one unit. A fusion run STOPS at:
   - a task with a `Dependencies:` edge pointing outside the run of fused tasks
   - a task whose name contains `GATE` — gates exist to stop work before cost is spent, so fusion must never cross one
   - a task carrying a `Verify (global)` line — that task is a module boundary
   - a task with no `File:` line, or whose `File:` names more than one path
3. Execute units in dependency order. Within a unit: open the file once, apply every task's change, then run each task's `Verify (local)` separately.
4. Mark `- [x]` for each task in the unit individually, and only after that task's own local verify passes.

Tasks that share a file but are separated by a task on a different file are NOT consecutive and must not be fused.

For each `- [ ]` task in document order:
1. Show: "▶ Task {current}/{total}: {task name} [{size}]"
2. Spawn one subagent with full task context (file path, code sample, verify step)
3. Each task's `Verify (local)` MUST be run and its real output confirmed before the task is marked done
4. A task carrying a `Verify (global)` line is a module boundary: run the global invariant after that task's unit completes. If it fails, STOP — do not continue to the next unit
5. Never substitute a global invariant for a missing local verify. "The project still compiles" is not evidence that this task is correct — it is a repo-wide property that holds whether or not this task did its job
6. After the task's local verify passes: edit `{PLAN_FILE}` — replace `- [ ] Task N: {name}` with `- [x] Task N: {name}` for this task only
7. Show: "✓ Task {current}/{total}: {task name} — verified"

A plan written before this convention has no `Verify (global)` lines at all; treat every verify as local and let `/ec-review` catch a broken build at its definitive gate.

Repeat until no `- [ ]` lines remain in `{PLAN_FILE}`.

## Step 3.5 — Pre-spawn Verification Anchor
Before spawning any subagent, explicitly confirm each item:
- [ ] `{PLAN_FILE}` is loaded and all tasks are numbered
- [ ] Every task has an exact file path, code sample, and verify step
- [ ] No two tasks write to the same file (checked in Step 2)
- [ ] `{PLAN_FILE}` will be updated with `[x]` after each task completes
Only proceed after all items are confirmed. If any item fails, report and ask user before continuing.

## Step 4 — Execute with Evidence Verification
For each task, spawn one subagent. Each subagent prompt must include:
- Task name, description, file path, code sample
- Only the context relevant to that specific task (stack, structure, conventions)
- Reuse instructions from plan
- Edge cases to handle
- The task's `Anchor:` string — the subagent must locate this exact text before editing, never guess placement; if the task has no such line, inject nothing and proceed as normal
- The task's `Do not touch:` boundary, stated as a hard constraint
- The task's `Acceptance:` line — the observable end state, separate from the verify command; if the task has no such line, inject nothing and proceed as normal
- The `### Design Contract` block from the plan, verbatim, for any task carrying a `[design:]` tag
- The API error-handling approach named in the task detail
- Clean code rules: readable, best practices, no unnecessary comments
- ⚠️ Breaking change note if flagged in plan
- The verify step from the plan
- Nothing from memory or docs search — see Step 1. Task-specific context only.

### Agent Context Injection
For each task, before spawning subagent, check for `[agent: ec-xxx]` tag in the task line:
1. Extract agent name: parse `[agent: (ec-\w+)]` from the task line
2. Check file exists: `~/.claude/agents/{agent-name}.md`
3. If found: read the file; extract body after the closing `---` of the YAML frontmatter (everything after the second `---` line)
4. Prepend to subagent prompt:
   "You are operating as a specialist with the following expertise:\n{agent_body}\n\n---\nApply this expertise to complete the following task:"
5. If agent file not found: show `(⚠️ agent {name} not installed — run install.sh to install agents)` and proceed without agent context
6. If no `[agent:]` tag: proceed normally — no agent context injected

### Design Block Injection
Step 0 — determine which block the plan carries: `### Design Contract` or `### Design Direction`. A plan has at most one.

**If the plan has `### Design Contract`:** follow steps 1-6 below unchanged.

**If the plan has `### Design Direction`:** for each task carrying a `[design:]` tag (its `{source}` reads `direction`, so there is no image to open), read the `### Design Direction` block from {PLAN_FILE} in full and prepend to the subagent prompt:
   "Design Direction — no visual reference exists for this task. Build to these dials and rules.\n{direction_block}\nRead ~/.claude/agents/ec-antislop.md and apply it in full. Report every purpose-gate use and every major design decision as 'Reason: {what} — {why}'."
If the plan has neither block: proceed normally — nothing injected.

For each task, before spawning subagent, check for a `[design: {source}#{frame}]` tag in the task line:
1. Extract source and frame: parse `\[design: (.+)#([^#\]]+)\]` from the task line — the separator is the LAST `#`, so a source URL containing a fragment still parses correctly
2. Read the `### Design Contract` block from `{PLAN_FILE}` in full
3. Append to the subagent prompt:
   "Design Contract — this is the specification of record for this task. Implement it 1:1.\n{contract_block}\nReference: {source} (frame: {frame})\nIf {source} is a readable local file, open it with the Read tool and inspect it before writing any code. Declare any deviation explicitly in your output."
4. If `{source}` is a path that no longer exists: show `(⚠️ design reference {source} missing — implementing from the Design Contract text only)` and proceed with the text block
5. If the task has a `[design:]` tag but `{PLAN_FILE}` has no Design Contract block: show `(⚠️ no Design Contract in plan — proceeding without visual spec)` and proceed
6. If no `[design:]` tag: proceed normally — no contract injected

### Evidence Rule — mandatory for every subagent
Each subagent MUST prove completion before claiming done:
1. Identify the verify step from the task
2. Run it (compile check, test, lint, or file existence check)
3. Read the actual output
4. Only claim task complete if output confirms success
5. If the task carried a `[design:]` tag: walk the Design Contract element list and confirm each element has a counterpart in the code, then report any deviation as "Deviation: {what} — {why}"
6. If the task added an API call: confirm the call has error handling covering network failure, non-2xx status, timeout, and malformed payload, and that the failure is visible in the UI — missing error handling means the task is not done
7. Confirm the task's `Acceptance:` condition actually holds — a passing command with an unmet Acceptance is not done; if the task carries no such line, skip this item
8. If the Verify threshold turns out to be wrong for the specified edits, report it as "Threshold mismatch: {expected} vs {actual}" and STOP — never add or alter content merely to satisfy a number
9. If verification fails: fix and re-verify — do NOT claim done without evidence

### Anchor Discipline
- Locate the `Anchor:` string before editing; if it is absent from the target file, stop and report `(⚠️ anchor not found in {file} — plan is stale, not executing)`. If the anchor reads `new file`, there is nothing to locate — skip the check. If the task carries no anchor line, skip the check
- Never widen an edit beyond what the task specifies to make a verify step pass
- Respect `Do not touch:` absolutely — an edit inside that boundary is a failed task even if everything else verifies

### Error Recovery
If a subagent fails or cannot verify:
- If `AUTO=yes`: delete the sentinel (`rm -f .claude/.autoflow`) so the auto-flow chain stops here; then surface the Retry/Skip/Fix choice to the user as normal.
- Report: "Task {name} failed: {reason}"
- Ask user: "Retry / Skip / Fix manually?"
- Do not continue to dependent tasks until resolved

### Timeout Rule
If a subagent has not completed within 10 minutes:
- Treat it as failed
- If `AUTO=yes`: delete the sentinel (`rm -f .claude/.autoflow`) so the auto-flow chain stops here; then surface the Retry/Skip/Fix choice to the user as normal.
- Report: "Task {name} timed out after 10 minutes"
- Ask user: "Retry / Skip / Fix manually?"

## Step 5 — Index Modified Files into Graph (if worker running)
After all tasks complete, index every created/modified file into the dependency graph:
```
for each modified_file in completed_tasks:
  curl -s -X POST http://localhost:37777/graph/index \
    -H "Content-Type: application/json" \
    -d '{"project": "{project_name}", "file_path": "{modified_file}", "root_dir": "{cwd}"}'
```
This enables blast radius analysis in the next /ec-review run.

## Step 6 — Save Execution Memory (if worker running)
After all tasks complete, save what was built:
```
curl -s -X POST http://localhost:37777/memory/observe \
  -H "Content-Type: application/json" \
  -d '{
    "project": "{project_name}",
    "type": "execution",
    "content": "Executed feature: {feature_name}. Created/modified: {files_list}. {n} tasks completed.",
    "metadata": {"source": "execute", "feature": "{feature_name}"}
  }'
```

## Step 7 — Report
```
## Execution Complete

### Summary
- Total tasks: {n}
- Completed: {n}
- Failed/Skipped: {n}

### Tasks
- ✓ Task 1 — {files modified} — verified: {how}
- ✓ Task 2 — {files modified} — verified: {how}
- ✗ Task 3 — {reason if failed}

### Breaking Changes Applied
- {description or "none"}
```

**Release lock:** After all tasks complete, release the plan file lock:
```bash
python3 ~/.efficlaude/server/file_lock.py release "{PLAN_FILE}" "$SESSION_ID" 2>/dev/null \
  && echo "(plan lock released)" || echo "(lock already clear)"
```

**Auto-Flow stage advance:** If `AUTO=yes`, record that execution is done so the Stop-hook driver routes to `/ec-review` even if this context is lost.
```bash
if [ -f .claude/.autoflow ]; then
  python3 - <<'PY'
import os
p = os.path.join(".claude", ".autoflow")
f = {}
for line in open(p):
    if "=" in line:
        k, _, v = line.strip().partition("=")
        f[k] = v
f["stage"] = "review"
done = [s for s in f.get("stages_done", "").split(",") if s]
if "execute" not in done:
    done.append("execute")
f["stages_done"] = ",".join(done)
order = ["branch", "created", "stage", "stages_done", "iterations",
         "driver_stage", "driver_progress"]
keys = [k for k in order if k in f] + [k for k in f if k not in order]
open(p, "w").write("\n".join(f"{k}={f[k]}" for k in keys) + "\n")
PY
fi
```

Next: run `/ec-review` to review the results.
