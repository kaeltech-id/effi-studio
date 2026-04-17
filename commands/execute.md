Execute the current feature plan using parallel subagents.

## Step 1 — Load Context
Read these files:
- `.claude/current-plan.md` — the plan to execute
- `.claude/project-config.json` — project config
- `.claude/context/stack.md`
- `.claude/context/structure.md`
- `.claude/context/conventions.md`
- `CLAUDE.md`

## Step 2 — Identify Independent Tasks
From the plan, group tasks:
- **Parallel group**: tasks with no dependencies between them → run simultaneously
- **Sequential**: tasks that depend on previous tasks → run after dependencies done

## Step 3 — Execute
For each parallel group, spawn one subagent per task simultaneously using the Agent tool.

Each subagent prompt must include:
- Task description and implementation notes
- Relevant context (stack, structure, conventions)
- Clean code rules: readable, best practices, no unnecessary comments
- File paths to create/modify

Wait for ALL subagents in a group to complete before starting next group.

## Step 4 — Report
After all tasks done, show summary:
```
## Execution Complete

### Done
- Task 1: {status} — {files modified}
- Task 2: {status} — {files modified}

### Issues (if any)
- ...
```

Tell user to run /review to review the results.
