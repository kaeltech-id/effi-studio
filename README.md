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
| `/feature` | Gathers your ticket, design, and API contract — then writes a granular execution plan |
| `/execute` | Runs the plan using parallel subagents — every task must be verified before marked done |
| `/review` | Two-stage review: spec compliance first, then code quality — auto-fixes all issues |
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

## /feature — Granular Planning

Works with any input — from a full Jira ticket to a single sentence.

```
Claude: Ticket number or describe the feature?
You:    PROJ-123   (or just type what you want to build)

Claude: Design reference? (link / screenshot / skip)
You:    https://figma.com/...

Claude: Any API contract? (paste or skip)
You:    skip
```

Every plan includes:

- **Reuse scan** — finds existing components, hooks, and utils to reuse instead of recreating
- **Impact analysis** — lists every existing file that will be touched
- **Breaking change warnings** — flags anything that could affect existing behavior
- **Size estimates** per task: `S` < 1hr · `M` 1–3hr · `L` > 3hr

### Atomic Task Breakdown

Each task is scoped to **2–5 minutes of focused work** — one action, fully specified:

| Field | What it contains |
|---|---|
| File | Exact path to create or modify |
| Code sample | Concrete snippet or expected structure — no "fill in details" |
| Edge cases | Loading state, empty state, error state |
| Verify | Exact command or check to confirm the task is done |

Claude self-reviews the plan before presenting it. No vague tasks make it through.

You approve the plan before anything gets written.

---

## /execute — Parallel Execution with Evidence

Runs your approved plan using one subagent per task, simultaneously.

**Pre-flight check** — before running, Claude verifies:
- All referenced files exist
- No two tasks write to the same file
- Task dependencies are correctly ordered

**Evidence rule** — every subagent must prove completion:
1. Run the verify step from the task
2. Read the actual output
3. Only mark done if output confirms success
4. If verification fails: fix and re-verify

No task is marked complete without evidence.

**Error recovery** — if a task fails, Claude asks: *Retry / Skip / Fix manually?*

---

## /review — Two-Stage Code Review

Inspired by [Superpowers](https://github.com/obra/superpowers). Stage 2 only runs after Stage 1 is fully clean.

### Stage 1 — Spec Compliance
Verifies the implementation matches the approved plan exactly:
- Output matches task description and code sample
- All edge cases handled as specified
- Correct existing code reused as planned
- No over-building, no under-building

### Stage 2 — Code Quality

| Check | What it catches |
|---|---|
| **Code quality** | Naming, structure, dead code, unused imports |
| **Type safety** | Implicit `any`, bad type assertions, missing types |
| **Performance** | Unnecessary re-renders, missing memoization, N+1 patterns |
| **Security** | Hardcoded secrets, XSS risks, exposed sensitive data |
| **Accessibility** | Missing `alt`, `aria-label`, keyboard navigation *(UI only)* |

Claude fixes all issues directly — not just reports them.

After review, Claude will optionally generate unit tests and run your existing test suite with real output.

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
