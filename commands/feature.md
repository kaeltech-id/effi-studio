Run interactive feature planning. Read .claude/project-config.json and CLAUDE.md first.

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

## Step 5 — Confirm
Ask: "Does this plan look right? Anything to change before executing?"
Only tell user to run /execute after they approve.
