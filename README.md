# EffiClaude

> Claude Code commands that turn your Jira ticket, Figma design, and API contract into production-ready code — with one command.

Built for frontend developers who want to move fast without cutting corners.

---

## What It Does

EffiClaude gives you 5 slash commands that handle your entire development workflow inside Claude Code:

| Command | What it does |
|---|---|
| `/setup` | Scans your codebase, learns your stack & conventions, stores everything for future sessions |
| `/feature` | Reads your Jira ticket, fetches your Figma frame, parses your API contract — then writes a plan |
| `/execute` | Runs the plan using parallel subagents. Multiple tasks done simultaneously |
| `/review` | Reviews generated code for quality, best practices, and optionally runs your test suite |
| `/git` | The **only** way Claude is allowed to touch git. No surprise commits, ever |

---

## Install

Run this once. Commands are installed globally and available in every project.

```bash
curl -fsSL https://raw.githubusercontent.com/kaeltech-id/EffiClaude/main/install.sh | bash
```

---

## Setup Per Project

In every new project folder, run once:

```
/setup
```

Claude will:
1. Silently scan your existing code
2. Ask you to confirm what it found (tech stack, folder structure, naming conventions)
3. Ask for your Jira, Figma, and API credentials
4. Save everything to the project — no need to repeat this again

> API keys are saved to `.claude/project-config.json` which is automatically added to `.gitignore`

---

## Workflow

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌─────────┐     ┌──────┐
│ /setup  │────▶│ /feature │────▶│ /execute │────▶│ /review │────▶│ /git │
│ once    │     │ planning │     │ parallel │     │ + tests │     │ push │
└─────────┘     └──────────┘     └──────────┘     └─────────┘     └──────┘
```

### /feature — Interactive Planning

```
Claude: Jira ticket number? (e.g. PROJ-123, or skip)
You:    PROJ-456

Claude: Figma frame link? (paste URL, or skip)
You:    https://figma.com/...

Claude: Any additional API contract? (paste or skip)
You:    skip

Claude: Here's the breakdown — 4 tasks. Approve?
You:    yes → run /execute
```

### /execute — Parallel Subagents

Claude spawns one subagent per task, all running at the same time. No waiting for one to finish before the next starts.

### /review — Code Quality Check

```
Claude: Want to add unit tests? (yes/no)
Claude: Any existing test cases to run? (provide path or skip)
Claude: Here's the review summary...
```

### /git — Controlled Git Operations

Claude will never commit, push, pull, or branch on its own.  
`/git` is the only entry point for all git operations — and it always asks before executing.

```
Claude: What do you want to do? (commit / push / pull / branch / merge)
You:    commit
Claude: Here's the diff. Commit message?
You:    feat: add user profile page
Claude: Confirm? → execute
```

---

## Project Memory

EffiClaude stores project knowledge so Claude stays consistent across sessions:

```
your-project/
├── CLAUDE.md                       ← auto-loaded every session (stack, rules)
└── .claude/
    ├── project-config.json         ← API keys (gitignored)
    ├── current-plan.md             ← latest feature plan
    └── context/
        ├── stack.md                ← tech stack detail
        ├── structure.md            ← folder architecture
        └── conventions.md          ← naming & code rules
```

No need to re-explain your project every session. Claude remembers.

---

## Multi-Repo Projects

EffiClaude is designed for projects with multiple repos under one folder:

```
my-project/          ← run /setup here
├── frontend/
├── mobile/
└── shared-ui/
```

One `/setup` covers the entire project.

---

## Requirements

- [Claude Code](https://claude.ai/code) installed
- Access to Claude Sonnet or Opus
- Jira, Figma API keys (optional — only needed for those integrations)

---

## Contributing

Issues and PRs welcome at [github.com/kaeltech-id/EffiClaude](https://github.com/kaeltech-id/EffiClaude)

---

<p align="center">Built by <a href="https://github.com/kaeltech-id">kaeltech-id</a></p>
