Execute the current feature plan sequentially, one task at a time, with resumable state.

## Step 1 — Load Context
Read:
- `.claude/current-plan.md` — the plan to execute
- `.claude/project-config.json`
- `.claude/context/stack.md`
- `.claude/context/structure.md`
- `.claude/context/conventions.md`
- `CLAUDE.md`

Check worker status: `curl -s http://localhost:37777/health`
- If running: show "(worker online ✓ — memory/docs/graph active)" then load memory and docs:
  `curl -s "http://localhost:37777/memory/search?q={feature_name}&project={project_name}&limit=5"`
  `curl -s "http://localhost:37777/docs/search?q={feature_keywords}&project={project_name}&limit=5"`
  Pass relevant snippets into each subagent's context.
- If offline: show "(worker OFFLINE ⚠️ — memory/docs/graph unavailable)" and continue.

**Resume check:** After reading `.claude/current-plan.md`, count:
- `done` = number of lines matching `- [x]`
- `remaining` = number of lines matching `- [ ]`

If `remaining == 0` and `done > 0`:
  Show: "All {done} tasks already complete — run /ec-review."
  Stop.
If `remaining == 0` and `done == 0`:
  Show: "No tasks found in current-plan.md. Run /ec-feature first."
  Stop.
If `done > 0` and `remaining > 0`:
  Show: "Resuming: {done} tasks already done, {remaining} remaining."

**Mode check:** Run `cat .claude/.mode 2>/dev/null || echo "structured"` → note as MODE.
- If `vibe`: skip Step 6 memory save (`curl .../memory/observe`), skip "Next: run /ec-review" in Step 7 report
- If `structured` (or file absent): proceed normally

## Step 2 — Pre-flight Check
Before executing, verify:
- All files referenced in the plan exist (if modifying existing files)
- No two tasks write to the same file (conflict risk)
- Dependencies between tasks are correctly ordered
- Every task has a verify step defined

If any issue found, report it and ask:
"Found pre-flight issue: {issue}. Continue anyway? (y/n):"

## Step 3 — Execute Sequentially
Read all tasks from `.claude/current-plan.md`. Find all lines matching `- [ ]`.
Compute: total = count of ALL task lines (both `[x]` and `[ ]`).

For each `- [ ]` task in document order:
1. Show: "▶ Task {current}/{total}: {task name} [{size}]"
2. Spawn one subagent with full task context (file path, code sample, verify step, relevant memory/docs snippets)
3. Subagent MUST run the verify step and confirm actual output before claiming done
4. After subagent confirms complete: edit `.claude/current-plan.md` — replace `- [ ] Task N: {name}` with `- [x] Task N: {name}` for this task only
5. Show: "✓ Task {current}/{total}: {task name} — verified"

Repeat until no `- [ ]` lines remain in `.claude/current-plan.md`.

## Step 3.5 — Pre-spawn Verification Anchor
Before spawning any subagent, explicitly confirm each item:
- [ ] `.claude/current-plan.md` is loaded and all tasks are numbered
- [ ] Every task has an exact file path, code sample, and verify step
- [ ] No two tasks write to the same file (checked in Step 2)
- [ ] `.claude/current-plan.md` will be updated with `[x]` after each task completes
Only proceed after all items are confirmed. If any item fails, report and ask user before continuing.

## Step 4 — Execute with Evidence Verification
For each task, spawn one subagent. Each subagent prompt must include:
- Task name, description, file path, code sample
- Only the context relevant to that specific task (stack, structure, conventions)
- Reuse instructions from plan
- Edge cases to handle
- Clean code rules: readable, best practices, no unnecessary comments
- ⚠️ Breaking change note if flagged in plan
- The verify step from the plan
- Relevant memory snippets (if any)
- Relevant docs snippets (if any — ensures correct API usage)

### Agent Context Injection
For each task, before spawning subagent, check for `[agent: ec-xxx]` tag in the task line:
1. Extract agent name: parse `[agent: (ec-\w+)]` from the task line
2. Check file exists: `~/.claude/agents/{agent-name}.md`
3. If found: read the file; extract body after the closing `---` of the YAML frontmatter (everything after the second `---` line)
4. Prepend to subagent prompt:
   "You are operating as a specialist with the following expertise:\n{agent_body}\n\n---\nApply this expertise to complete the following task:"
5. If agent file not found: show `(⚠️ agent {name} not installed — run install.sh to install agents)` and proceed without agent context
6. If no `[agent:]` tag: proceed normally — no agent context injected

### Evidence Rule — mandatory for every subagent
Each subagent MUST prove completion before claiming done:
1. Identify the verify step from the task
2. Run it (compile check, test, lint, or file existence check)
3. Read the actual output
4. Only claim task complete if output confirms success
5. If verification fails: fix and re-verify — do NOT claim done without evidence

### Error Recovery
If a subagent fails or cannot verify:
- Report: "Task {name} failed: {reason}"
- Ask user: "Retry / Skip / Fix manually?"
- Do not continue to dependent tasks until resolved

### Timeout Rule
If a subagent has not completed within 10 minutes:
- Treat it as failed
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

Next: run `/ec-review` to review the results.
