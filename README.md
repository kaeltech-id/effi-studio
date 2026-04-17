# EffiClaude

> Claude Code commands that turn your ticket, design, and API contract into production-ready code — with one command.

Built for developers who want to move fast without cutting corners. Works with any stack, any project management tool, any design tool.

---

## Install

Run once. Commands are available globally across all your projects.

```bash
curl -fsSL https://raw.githubusercontent.com/kaeltech-id/EffiClaude/main/install.sh | bash
```

---

## Setup Per Project

In every new project folder, run once:

```
/setup
```

Claude will scan your existing code, ask you to confirm what it found, collect your credentials, and save everything. You never have to explain your project again.

> `.claude/project-config.json` is automatically added to `.gitignore`

---

## Commands

| Command | What it does |
|---|---|
| `/setup` | Scans your codebase, learns your stack & conventions, stores config for future sessions |
| `/feature` | Gathers your ticket, design, and API contract — then writes a detailed execution plan |
| `/execute` | Runs the plan using parallel subagents with pre-flight checks and error recovery |
| `/review` | Reviews code for quality, security, performance, and accessibility — auto-fixes issues |
| `/git` | The **only** way Claude can touch git. No surprise commits, ever |

---

## Full Workflow

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌─────────┐     ┌──────┐
│ /setup  │────▶│ /feature │────▶│ /execute │────▶│ /review │────▶│ /git │
│  once   │     │  plan    │     │  build   │     │  check  │     │ push │
└─────────┘     └──────────┘     └──────────┘     └─────────┘     └──────┘
```

---

## /setup — Project Configuration

Interactive onboarding. Claude scans your code first, then confirms with you:

- Tech stack, folder structure, naming conventions
- Project management tool *(Jira / Linear / GitHub Issues / Notion / Trello / none)*
- Design tool *(Figma / Sketch / screenshots / none)*
- Backend API base URL

Everything is saved to the project. Run once, works forever.

---

## /feature — Interactive Planning

Works with any input — from a full Jira ticket to a single sentence.

```
Claude: Ticket number or describe the feature?
You:    PROJ-123   (or just type what you want to build)

Claude: Design reference? (link / screenshot / skip)
You:    https://figma.com/...

Claude: Any API contract? (paste or skip)
You:    skip
```

Claude then produces a full plan including:

- **Reuse scan** — finds existing components, hooks, and utils to reuse instead of recreating
- **Impact analysis** — lists every existing file that will be touched
- **Breaking change warnings** — flags anything that could break existing behavior
- **Task breakdown** with size estimates: `S` < 1hr · `M` 1–3hr · `L` > 3hr
- **Edge cases per task** — loading state, empty state, error state

You review and approve the plan before anything gets written.

---

## /execute — Parallel Execution

Runs your approved plan using one subagent per task, simultaneously.

**Pre-flight check** — before running, Claude verifies:
- All referenced files exist
- No two tasks write to the same file
- Task dependencies are correctly ordered

**Progress updates** — you see which tasks are running and which are done.

**Error recovery** — if a task fails, Claude asks: *Retry / Skip / Fix manually?* It never silently moves on.

---

## /review — Automated Code Review

Claude reviews every file touched during execution and **fixes issues directly** — not just reports them.

| Check | What it catches |
|---|---|
| **Code quality** | Naming, structure, dead code, unused imports |
| **Type safety** | Implicit `any`, bad type assertions, missing types |
| **Performance** | Unnecessary re-renders, missing memoization, N+1 patterns |
| **Security** | Hardcoded secrets, XSS risks, exposed sensitive data |
| **Accessibility** | Missing `alt`, `aria-label`, keyboard navigation *(UI only)* |

After review, Claude will optionally generate unit tests and run your existing test suite.

When everything is clean: *"No issues found. Ready to commit."*

---

## /git — Controlled Git Operations

Claude will never touch git on its own. `/git` is the only entry point.

```
Claude: What do you want to do? (commit / push / pull / branch / merge)
You:    commit
Claude: Here's the diff. Commit message?
You:    feat: add user profile page
Claude: Confirm? → execute
```

---

## Project Memory

EffiClaude stores project knowledge so Claude stays consistent across every session:

```
your-project/
├── CLAUDE.md                   ← auto-loaded every session
└── .claude/
    ├── project-config.json     ← credentials & config (gitignored)
    ├── current-plan.md         ← latest feature plan
    └── context/
        ├── stack.md            ← tech stack detail
        ├── structure.md        ← folder architecture
        └── conventions.md      ← naming & code rules
```

---

## Multi-Repo Projects

One folder, multiple repos — one `/setup` covers everything:

```
my-project/        ← run /setup here
├── frontend/
├── mobile/
└── shared-ui/
```

---

## Requirements

- [Claude Code](https://claude.ai/code) installed
- Jira / Linear / GitHub / Figma credentials *(optional — only needed if you use them)*

---

## Contributing

Issues and PRs welcome at [github.com/kaeltech-id/EffiClaude](https://github.com/kaeltech-id/EffiClaude)

---

<p align="center">Built by <a href="https://github.com/kaeltech-id">kaeltech-id</a></p>
