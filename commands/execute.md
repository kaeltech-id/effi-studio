Execute the current feature plan using parallel subagents.

## Step 1 — Load Context
Read:
- `.claude/current-plan.md` — the plan to execute
- `.claude/project-config.json`
- `.claude/context/stack.md`
- `.claude/context/structure.md`
- `.claude/context/conventions.md`
- `CLAUDE.md`

## Step 2 — Pre-flight Check
Before executing, verify:
- All files referenced in the plan exist (if modifying existing files)
- No two tasks write to the same file (conflict risk)
- Dependencies between tasks are correctly ordered

If any issue found, report it and ask user to confirm before continuing:
"Found pre-flight issue: {issue}. Continue anyway or adjust the plan?"

## Step 3 — Group Tasks
From the plan:
- **Parallel**: tasks with no dependencies → run simultaneously
- **Sequential**: tasks that depend on others → run after their dependencies complete

## Step 4 — Execute with Progress Updates
For each parallel group:

Show before starting:
```
Running group {n}: {task names} (parallel)
```

Spawn one subagent per task simultaneously. Each subagent prompt must include:
- Task name, description, implementation notes
- Only the context relevant to that task (stack, structure, conventions)
- Reuse instructions from plan (existing components/utils to use)
- Edge cases to handle (loading, empty, error states)
- Clean code rules: readable, best practices, no unnecessary comments
- ⚠️ Breaking change note if flagged in plan
- File paths to create/modify

Wait for ALL subagents in the group to finish before starting the next group.

### Error Recovery
If a subagent fails or produces an error:
- Report clearly: "Task {name} failed: {reason}"
- Ask user: "Retry / Skip / Fix manually?"
- Do not continue to dependent tasks until resolved

## Step 5 — Report
```
## Execution Complete

### Summary
- Total tasks: {n}
- Completed: {n}
- Failed/Skipped: {n}

### Tasks
- ✓ Task 1 — {files created/modified}
- ✓ Task 2 — {files created/modified}
- ✗ Task 3 — {reason if failed}

### Breaking Changes Applied
- {description or "none"}
```

Tell user to run /review to review the results.
