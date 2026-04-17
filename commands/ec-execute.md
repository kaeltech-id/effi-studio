Execute the current feature plan using parallel subagents.

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

## Step 2 — Pre-flight Check
Before executing, verify:
- All files referenced in the plan exist (if modifying existing files)
- No two tasks write to the same file (conflict risk)
- Dependencies between tasks are correctly ordered
- Every task has a verify step defined

If any issue found, report it and ask:
"Found pre-flight issue: {issue}. Continue anyway or adjust the plan?"

## Step 3 — Group Tasks
From the plan:
- **Parallel**: tasks with no dependencies → run simultaneously
- **Sequential**: tasks that depend on others → run after their dependencies complete

## Step 4 — Execute with Evidence Verification
For each parallel group, show before starting:
```
Running group {n}: {task names} (parallel)
```

Spawn one subagent per task simultaneously. Each subagent prompt must include:
- Task name, description, file path, code sample
- Only the context relevant to that specific task (stack, structure, conventions)
- Reuse instructions from plan
- Edge cases to handle
- Clean code rules: readable, best practices, no unnecessary comments
- ⚠️ Breaking change note if flagged in plan
- The verify step from the plan
- Relevant memory snippets (if any)
- Relevant docs snippets (if any — ensures correct API usage)

### Evidence Rule — mandatory for every subagent
Each subagent MUST prove completion before claiming done:
1. Identify the verify step from the task
2. Run it (compile check, test, lint, or file existence check)
3. Read the actual output
4. Only claim task complete if output confirms success
5. If verification fails: fix and re-verify — do NOT claim done without evidence

Wait for ALL subagents in the group to finish before starting the next group.

### Error Recovery
If a subagent fails or cannot verify:
- Report: "Task {name} failed: {reason}"
- Ask user: "Retry / Skip / Fix manually?"
- Do not continue to dependent tasks until resolved

## Step 5 — Index Modified Files into Graph (if worker running)
After all tasks complete, index every created/modified file into the dependency graph:
```
for each modified_file in completed_tasks:
  curl -s -X POST http://localhost:37777/graph/index \
    -H "Content-Type: application/json" \
    -d '{"project": "{project_name}", "file_path": "{modified_file}", "root_dir": "{cwd}"}'
```
This enables blast radius analysis in the next /ec-review run.

## Step 7 — Save Execution Memory (if worker running)
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

## Step 6 — Report
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

Tell user to run /ec-review to review the results.
