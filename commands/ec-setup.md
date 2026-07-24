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

**Existing setup detection:** Check whether any of `.claude/context/stack.md`, `.claude/context/structure.md`, `.claude/context/conventions.md`, or `.claude/context/notes.md` already exist and are non-empty.
- If any exist: set RESUME=yes. This is an add-to run, not a fresh setup — read them silently so you know what is already recorded.
- If none exist: set RESUME=no (fresh setup).

## Step 2 — Free-Form Capture (optional, additive)
There are NO fixed questions. Setup is free-form and never mandatory.

**If RESUME=no (fresh setup):**
Ask once, open-ended: "Ada yang mau kamu kasih tahu soal project ini? Apa aja — cara kerjanya, konvensi, gotcha, tools, URL, akun, apa pun yang menurut kamu setup. (atau ketik 'skip')"
- Accept any free-form text, in any shape. Do not force it into categories.
- If the user types 'skip': record nothing extra; the silent scan alone is enough.

**If RESUME=yes (add-to run):**
Show a 2–4 line summary of what is already recorded (from notes.md + detected stack).
Then ask ONLY: "Mau nambah atau ubah apa? (atau ketik 'done')"
- Whatever the user types is ADDED to existing setup — never restart from scratch, never re-ask prior questions.
- If the user types 'done': keep everything as-is and proceed.

Optional structured fields (ticket tool, design tool, API base URL, Figma key) are captured ONLY if the user volunteers them in their free-form answer — never interrogate for them. When volunteered, write them to project-config.json in Step 3 as before.

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

### .claude/context/notes.md (append-only — never overwrite)
Free-form project notes the user provided in Step 2. This file is the user's own content and MUST be preserved across re-runs.
- If it does not exist: create it with the `<!-- last_updated: {YYYY-MM-DD} -->` first line, then the user's notes under a `## {YYYY-MM-DD}` heading.
- If it already exists: APPEND a new `## {YYYY-MM-DD}` heading with only the newly added notes. Never delete or rewrite existing entries. If the new input merely corrects an earlier note, add a short "(updates: …)" line rather than editing the old text.
- If the user chose 'skip'/'done' with no new input: leave the file untouched.
Unlike `docs/PROJECT.md` (a derived overview, regenerated fresh each run) and the scan-detected context files, `notes.md` is user-authored and additive.

### docs/PROJECT.md
Create the `docs/` directory if it doesn't exist, then write `docs/PROJECT.md`:

```markdown
<!-- last_updated: {YYYY-MM-DD} -->
# {project_name}

## Overview
{one-paragraph description of what this project does, based on scan results and user answers}

## Stack
{tech stack content from .claude/context/stack.md}

## Project Structure
{structure content from .claude/context/structure.md}

## Commands
| Command | Description |
|---------|-------------|
| /ec-setup | Initialize or update project configuration |
| /ec-brainstorm | Explore solution approaches before planning |
| /ec-feature | Plan a feature with tasks and file targets |
| /ec-execute | Implement the current plan sequentially |
| /ec-review | Review spec compliance and code quality |
| /ec-git | Commit and push changes |

## Conventions
{conventions content from .claude/context/conventions.md}

## Changelog
| Date | Feature | Summary |
|------|---------|---------|
| {YYYY-MM-DD} | Initial setup | Project configured via /ec-setup |
```

If `docs/PROJECT.md` already exists (re-run of /ec-setup): overwrite it fully with fresh content.

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
Show full summary of saved config.
Ask: "Setup complete. Confirm (y/n):"
- If y: done
- If n: ask "Apa yang perlu diubah?" and loop back to update the relevant config
Next: run `/ec-brainstorm` to explore your first feature, or `/ec-feature` to plan directly.
