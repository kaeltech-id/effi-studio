Run interactive project setup. Follow these steps strictly.

## Step 0 — Check Worker
Check worker status:
```
curl -s http://localhost:37777/health
```
- If running: show "(worker online ✓ — memory/docs active)" and proceed normally.
- If not running: show "(worker OFFLINE ⚠️ — memory/docs unavailable)" and continue without those features.

## Step 1 — Silent Scan
Scan all repos/folders in this project directory. Detect:
- Tech stack per repo (framework, language, libraries, versions)
- Folder structure & architecture
- Naming conventions (files, folders, variables, components)
- Code patterns used

## Step 2 — Interactive Q&A
Ask ONE question at a time. Wait for user response before proceeding.

1. "What is this project called?"
2. "Tech stack I detected: [scan result]. Correct? Anything to add or change?"
3. "Folder structure: [scan result]. Correct? Any corrections?"
4. "Naming conventions I detected: [scan result]. Correct?"
5. "Do you use a project management tool? (Jira / Linear / GitHub Issues / Notion / Trello / other / none)"
   - If yes: "Base URL?" then "API key?" then "Project key or board ID?"
   - If none: skip
6. "Do you use Figma or another design tool? (Figma / Sketch / other / none)"
   - If Figma: "Figma API key?" then "Node.js is required for Figma MCP — is it installed? (yes / no / skip)"
   - If other: "How do you share designs? (link / screenshot / description)"
   - If none: skip
7. "Backend API base URL? (or skip)"
8. "Anything else I should know about this project?"

## Step 3 — Save Files

### CLAUDE.md
```
# {project_name}
Stack: {stack_summary}
Config: .claude/project-config.json
Context: .claude/context/

## GIT RULES
- NEVER perform any git operation autonomously
- NEVER commit, push, pull, merge, branch, stash without /ec-git command
- Git ONLY allowed when user explicitly runs /ec-git
- NEVER add Co-Authored-By to commit messages

## WORKFLOW RULES
- After /ec-brainstorm completes → always suggest running /ec-feature
- After /ec-feature plan approved → always suggest running /ec-execute
- After /ec-execute completes → always suggest running /ec-review
- After /ec-review is clean → always suggest running /ec-git
- Always guide user through the full flow: /ec-brainstorm → /ec-feature → /ec-execute → /ec-review → /ec-git
```

### .claude/project-config.json
```json
{
  "project_name": "",
  "ticket_tool": "",
  "ticket_base_url": "",
  "ticket_api_key": "",
  "ticket_project_key": "",
  "design_tool": "",
  "figma_api_key": "",
  "api_base_url": "",
  "blast_radius_depth": 2
}
```

When writing any `.claude/context/*.md` file, prepend the following as the very first line:
`<!-- last_updated: {YYYY-MM-DD} -->`
Replace `{YYYY-MM-DD}` with today's date (use the `currentDate` context variable if available, otherwise `date +%Y-%m-%d`).

### .claude/context/stack.md
Tech stack detail per repo.

### .claude/context/structure.md
Folder structure & architecture detail.

### .claude/context/conventions.md
Naming conventions & clean code rules.

### .gitignore
Add `.claude/project-config.json` to gitignore.

### .git/hooks/commit-msg
If `~/.efficlaude/hooks/commit-msg` exists:
```bash
cp ~/.efficlaude/hooks/commit-msg .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg
```
Show: "✓ commit-msg hook installed — VERSION auto-bumps on feat:/fix: commits"
If `~/.efficlaude/hooks/commit-msg` does not exist: skip silently.

## Step 3.5 — Register Figma MCP (if Figma API key provided + Node.js available)

If user provided a Figma API key AND Node.js is available, register `figma-context-mcp` as an MCP server in `~/.claude/settings.json`:

```python
import json, os

settings_path = os.path.expanduser("~/.claude/settings.json")
with open(settings_path) as f:
    settings = json.load(f)

settings.setdefault("mcpServers", {})
settings["mcpServers"]["figma"] = {
    "command": "npx",
    "args": ["-y", "figma-context-mcp"],
    "env": {
        "FIGMA_API_KEY": "{figma_api_key}"
    }
}

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
```

Show: "Figma MCP registered — paste any Figma frame link in /ec-feature to use it."

If Node.js not available: show "Node.js not found — install it and re-run /ec-setup to enable Figma MCP. Figma REST API fallback will be used."

## Step 4 — Register Docs Libraries (if worker running)
If the worker is online, detect which libraries from the stack are supported and register them:

Supported libraries: react, next, nextjs, tailwindcss, typescript, vue, nuxt, svelte, express, prisma, zod, axios, fastapi, django, flask, sqlalchemy, pydantic

For each detected library, call:
```
curl -s -X POST http://localhost:37777/docs/register \
  -H "Content-Type: application/json" \
  -d '{"name": "{library}", "project": "{project_name}"}'
```

Show: "Registered docs: react, next, tailwindcss ..." (only the ones actually registered)
This runs in the background — do not wait for confirmation before moving on.

## Step 5 — Initialize Project Memory (if worker running)
If the worker is online, save initial project context as a memory observation:
```
curl -s -X POST http://localhost:37777/memory/observe \
  -H "Content-Type: application/json" \
  -d '{
    "project": "{project_name}",
    "type": "setup",
    "content": "Project initialized. Stack: {stack_summary}. Structure: {structure_summary}.",
    "metadata": {"source": "setup"}
  }'
```

## Step 6 — Confirm
Show full summary of saved config. Ask: "Setup complete. Anything you'd like to change?"
