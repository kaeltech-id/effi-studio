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

```
## Feature: {feature_name}

### Impact Analysis
- Files affected: {list}
- ⚠️ Breaking change risk: {list or "none"}

### Reusable Existing Code
- {component/hook/util} at {path} — used for {reason}

### Tasks
- [ ] Task 1: {name} [S/M/L] — {short description}
- [ ] Task 2: {name} [S/M/L] — {short description}
- [ ] Task N: ...

### Per Task Detail
**Task 1 — {name}** `S/M/L`
- Files to create/modify:
- Reuse: {existing code to use}
- Edge cases: loading state / empty state / error state / {feature-specific cases}
- ⚠️ Breaking change: {description or "none"}
- Implementation notes:
- Dependencies: {other tasks}

**Task 2 — {name}**
...
```

Size guide: S = <1hr, M = 1-3hr, L = >3hr

Save plan to `.claude/current-plan.md`.

## Step 4 — Confirm
Ask: "Does this plan look right? Anything to change before executing?"
Only tell user to run /execute after they approve.
