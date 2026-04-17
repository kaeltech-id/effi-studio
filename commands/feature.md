Run interactive feature planning. Read .claude/project-config.json first.

## Step 1 — Gather Input
Ask ONE question at a time:

1. "Jira ticket number? (e.g. PROJ-123, or skip)"
   - If provided: fetch `https://{jira_base_url}/rest/api/3/issue/{ticket}` with Authorization header `Basic {base64(email:api_key)}`
   - Extract: summary, description, acceptance criteria, any Figma/API links

2. "Figma frame link? (paste URL, or skip)"
   - If provided: extract file_key and node_id from URL
   - Fetch `https://api.figma.com/v1/files/{file_key}/nodes?ids={node_id}` with header `X-Figma-Token: {figma_api_key}`
   - Analyze: components, layout, interactions

3. "Any additional API contract? (paste or skip)"
   - Accept JSON, OpenAPI spec, or plain text description

4. "Any other context? (or type 'done')"

## Step 2 — Analyze
Read .claude/context/stack.md, .claude/context/structure.md, .claude/context/conventions.md.

### Reuse Scan
Silently scan existing codebase for:
- Components, hooks, utils that overlap with this feature
- Existing patterns that should be followed
- Anything that can be reused instead of created from scratch
Note reusable items — reference them in the plan instead of creating new ones.

### Impact Analysis
Identify existing files that will be affected or at risk of breaking.

## Step 3 — Write Plan
Output a structured plan:

```
## Feature: {feature_name}

### Impact Analysis
Files affected: {list of existing files that will be modified or at risk}

### Reusable Existing Code
- {component/hook/util} at {path} — used for {reason}

### Tasks
- [ ] Task 1: {name} — {short description}
- [ ] Task 2: {name} — {short description}
- [ ] Task N: ...

### Per Task Detail
**Task 1 — {name}**
- Files to create/modify:
- Reuse: {existing components/utils to use}
- Edge cases to handle: loading state / empty state / error state
- Implementation notes:
- Dependencies: (other tasks it depends on)

**Task 2 — {name}**
...
```

Save plan to `.claude/current-plan.md`.

## Step 4 — Confirm
Ask: "Does this plan look right? Anything to change before executing?"
Only tell user to run /execute after they approve.
