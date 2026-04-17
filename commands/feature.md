Run interactive feature planning. Read .claude/project-config.json and CLAUDE.md first.

## Step 0 — Load Memory & Check Worker
Silently check worker: `curl -s http://localhost:37777/health`

If worker is running:
- Load recent project memory (last 10 observations):
  `curl -s "http://localhost:37777/memory/context?project={project_name}&limit=10"`
- Use this memory to understand: what files have been touched recently, past decisions, patterns used.
- Note: "(memory loaded)" — do not dump raw memory to user.

If worker is offline:
- Continue without memory. Read .claude/context/ files for context.

## Step 1 — Gather Input
Ask ONE question at a time. Every input is optional — minimum viable input is a plain text description.

1. "How would you like to describe this feature?"
   - Option A: Ticket number (Jira, Linear, GitHub Issues, Notion, etc.)
   - Option B: Paste a link or description directly
   - Option C: Just tell me what you want to build
   - If ticket system configured in project-config.json: auto-fetch from that system
   - If no tool: accept any free-form text description

2. "Do you have a design reference? (Figma link / Sketch / screenshot path / text description / skip)"
   - Figma URL: extract file_key + node_id, fetch `https://api.figma.com/v1/files/{file_key}/nodes?ids={node_id}` with `X-Figma-Token: {figma_api_key}`
   - Screenshot path: read and analyze the image
   - Text description: use as-is
   - Skip: plan UI based on description only

3. "Any API contract? (paste JSON / OpenAPI / endpoint description / skip)"

4. "Anything else I should know? (or type 'done')"

## Step 2 — Analyze
Read .claude/context/stack.md, .claude/context/structure.md, .claude/context/conventions.md.

### Docs Lookup (if worker running)
For the feature being planned, search relevant docs:
```
curl -s "http://localhost:37777/docs/search?q={feature_keywords}&project={project_name}&limit=5"
```
Use returned docs snippets to ensure planned API usage is correct and up-to-date.
Do not show raw docs to user — silently incorporate into plan accuracy.

### Memory Cross-Check (if worker running)
Search memory for anything relevant to this feature:
```
curl -s "http://localhost:37777/memory/search?q={feature_keywords}&project={project_name}&limit=5"
```
Use results to: avoid re-creating things that already exist, follow past decisions, flag if this feature was attempted before.

### Reuse Scan
Silently scan existing codebase for:
- Components, hooks, utils that overlap with this feature
- Existing patterns that should be followed
- Anything reusable — reference in plan, do not recreate

### Impact Analysis
Identify existing files that will be modified or at risk of breaking.

### Breaking Change Detection
Flag any task that could break existing behavior, APIs, or shared components.

## Step 3 — Write Plan

### Task Granularity Rules
Each task must represent 2–5 minutes of focused work. One action per task.
Never write tasks like "implement the feature" or "handle edge cases".
Instead, split into atomic steps:
- "Write failing test for {behavior}"
- "Create {ComponentName} with {props}"
- "Add {endpoint} call in {file}"
- "Handle loading state in {component}"

Every task must include:
- Exact file path to create or modify
- Concrete code sample or clear expected output (no "fill in details")
- Specific verification step: how to confirm this task is done

```
## Feature: {feature_name}

### Impact Analysis
- Files affected: {list}
- ⚠️ Breaking change risk: {list or "none"}

### Reusable Existing Code
- {component/hook/util} at {path} — used for {reason}

### Tasks
- [ ] Task 1: {name} [S/M/L] — {one-line description}
- [ ] Task 2: {name} [S/M/L] — {one-line description}
- [ ] Task N: ...

### Per Task Detail
**Task 1 — {name}** `S/M/L`
- File: {exact path to create/modify}
- Reuse: {existing code to use, or "none"}
- Code sample: {concrete snippet or expected structure}
- Edge cases: loading state / empty state / error state
- ⚠️ Breaking change: {description or "none"}
- Verify: {exact command or check to confirm task is done}
- Dependencies: {other tasks, or "none"}

**Task 2 — {name}**
...
```

Size guide: S = <1hr · M = 1–3hr · L = >3hr

Save plan to `.claude/current-plan.md`.

## Step 4 — Self-Review Before Presenting
Before showing the plan, check:
- [ ] Every task has an exact file path
- [ ] Every task has a concrete code sample or expected output
- [ ] Every task has a verify step
- [ ] No task says "fill in details", "handle edge cases", or "similar to Task N"
- [ ] No task would take more than 5 minutes
- [ ] Dependencies are correctly ordered

Fix any issues found, then present the plan.

## Step 5 — Save Feature Intent to Memory (if worker running)
After plan is confirmed, save feature intent:
```
curl -s -X POST http://localhost:37777/memory/observe \
  -H "Content-Type: application/json" \
  -d '{
    "project": "{project_name}",
    "type": "feature_plan",
    "content": "Planning feature: {feature_name}. Tasks: {task_count}. Files: {affected_files}.",
    "metadata": {"source": "feature"}
  }'
```

## Step 6 — Confirm
Ask: "Does this plan look right? Anything to change before executing?"
Only tell user to run /execute after they approve.
