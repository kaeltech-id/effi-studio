Run interactive feature planning. Read .claude/project-config.json first.

## Step 1 — Gather Input
Ask ONE question at a time:

1. "Jira ticket number? (contoh: PROJ-123, atau skip)"
   - If provided: fetch `https://{jira_base_url}/rest/api/3/issue/{ticket}` with Authorization header `Basic {base64(email:api_key)}`
   - Extract: summary, description, acceptance criteria, any Figma/API links

2. "Ada Figma frame link? (paste URL, atau skip)"
   - If provided: extract file_key and node_id from URL
   - Fetch `https://api.figma.com/v1/files/{file_key}/nodes?ids={node_id}` with header `X-Figma-Token: {figma_api_key}`
   - Analyze: components, layout, interactions

3. "Ada API contract tambahan? (paste atau skip)"
   - Accept JSON, OpenAPI spec, or plain text description

4. "Tambahan context lain? (atau ketik 'done')"

## Step 2 — Analyze
Read .claude/context/stack.md, .claude/context/structure.md, .claude/context/conventions.md.
Cross-reference all gathered input.

## Step 3 — Write Plan
Output a structured plan:

```
## Feature: {feature_name}

### Tasks
- [ ] Task 1: {nama} — {deskripsi singkat}
- [ ] Task 2: {nama} — {deskripsi singkat}
- [ ] Task N: ...

### Per Task Detail
**Task 1 — {nama}**
- Files to create/modify: 
- Implementation notes:
- Dependencies: (other tasks it depends on)

**Task 2 — {nama}**
...
```

Save plan to `.claude/current-plan.md`.

## Step 4 — Confirm
Ask: "Plan ini sudah benar? Mau ada yang diubah sebelum execute?"
Only proceed to tell user to run /execute after user approves.
