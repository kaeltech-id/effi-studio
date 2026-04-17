# EffiClaude

> Claude Code commands that turn your ticket, design, and API contract into production-ready code — with one command.

Built for developers who want to move fast without cutting corners. Works with any stack, any project management tool, any design tool.

---

## Install

Run once. Commands, memory service, and token optimizer are installed globally.

```bash
curl -fsSL https://raw.githubusercontent.com/kaeltech-id/EffiClaude/main/install.sh | bash
```

**Requirements:** Python 3.8+, [Claude Code](https://claude.ai/code)
**Optional:** Rust/cargo (for token optimizer — auto-detected by installer)

The installer will:
- Install all slash commands to `~/.claude/commands/`
- Set up the EffiClaude worker service (memory + docs engine)
- Register Claude Code hooks for automatic context capture
- Build and install `etok` token optimizer (if Rust is available)
- Add shell wrappers to `~/.zshrc` / `~/.bashrc`
- Start the worker as a background daemon (auto-starts on login)

---

## Setup Per Project

In every new project folder, run once:

```
/setup
```

Claude will scan your existing code, ask you to confirm what it found, collect your credentials, and save everything — including registering your stack's libraries for docs lookup.

> `.claude/project-config.json` is automatically added to `.gitignore`

---

## Commands

| Command | What it does |
|---|---|
| `/setup` | Scans your codebase, learns your stack & conventions, registers docs libraries, initializes project memory |
| `/feature` | Gathers your ticket, design, and API contract — plans with memory context + up-to-date docs |
| `/execute` | Runs the plan using parallel subagents — every task verified with memory + docs context |
| `/review` | Two-stage review: spec compliance first, then code quality + API correctness — auto-fixes all issues |
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

## Memory Engine

EffiClaude runs a local worker service (`localhost:37777`) that gives Claude persistent memory and up-to-date docs across every session.

```
~/.efficlaude/
├── efficlaude.db       ← SQLite: observations, summaries, docs cache
├── chroma/             ← ChromaDB: semantic search index
├── server/             ← Worker service source
│   ├── worker.py
│   ├── memory.py
│   └── docs.py
└── hooks/              ← Claude Code hooks
    ├── post_tool_use.py    ← captures every Write/Edit/Bash
    ├── session_stop.py     ← summarizes session on stop
    └── prompt_submit.py    ← injects relevant context per prompt
```

### How it works

**Memory** — every file write, edit, and command is silently captured as an observation. At session end, observations are summarized. At the start of each prompt, the most relevant memories are injected as context — so Claude always knows what was built before, what decisions were made, and what patterns are in use.

**Docs** — when you run `/setup`, EffiClaude detects your stack and caches docs from npm/PyPI for your libraries (React, Next.js, Tailwind, TypeScript, FastAPI, and more). When planning or reviewing, Claude searches these cached docs to ensure correct, up-to-date API usage.

**Progressive disclosure** — context is injected in compact form first. Claude only expands what's relevant, keeping token usage minimal.

### Supported libraries (auto-detected from stack)

`react` · `next` · `tailwindcss` · `typescript` · `vue` · `nuxt` · `svelte` · `express` · `prisma` · `zod` · `axios` · `fastapi` · `django` · `flask` · `sqlalchemy` · `pydantic`

---

## /setup — Project Configuration

Interactive onboarding. Claude scans your code first, then confirms with you:

- Tech stack, folder structure, naming conventions
- Project management tool *(Jira / Linear / GitHub Issues / Notion / Trello / none)*
- Design tool *(Figma / Sketch / screenshots / none)*
- Backend API base URL

Then automatically:
- Registers detected libraries for docs caching
- Initializes project memory with stack context

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

Before writing the plan, Claude:
- **Loads project memory** — knows what was built before, avoids duplicating work
- **Searches cached docs** — ensures planned API calls match current library versions

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

Each subagent receives:
- The task specification
- Relevant memory snippets (past decisions, patterns)
- Relevant docs snippets (correct API usage)

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
- No contradictions with past architectural decisions (from memory)

### Stage 2 — Code Quality

| Check | What it catches |
|---|---|
| **Code quality** | Naming, structure, dead code, unused imports |
| **Type safety** | Implicit `any`, bad type assertions, missing types |
| **Performance** | Unnecessary re-renders, missing memoization, N+1 patterns |
| **Security** | Hardcoded secrets, XSS risks, exposed sensitive data |
| **Accessibility** | Missing `alt`, `aria-label`, keyboard navigation *(UI only)* |
| **API correctness** | Deprecated or incorrect API usage vs. cached docs |

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

## Project Memory Files

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

## Token Optimizer (etok)

EffiClaude ships a Rust-based token optimizer inspired by [RTK](https://github.com/rtk-ai/rtk). It intercepts common command outputs and compresses them before they reach Claude — reducing token usage by 60–90% on typical dev operations.

### How it works

Shell wrapper functions replace common commands. Output is piped through the `etok` binary, which applies smart filtering, deduplication, and truncation — then returns the compressed result to Claude.

```bash
# Before etok:  git status → 459 chars
# After etok:   git status → 129 chars  (-72%)
```

### Supported commands

| Command | What gets optimized |
|---|---|
| `git status` | Groups staged/unstaged/untracked, collapses boilerplate |
| `git log` | Compact one-line format per commit, caps at 20 entries |
| `git diff` | Removes context lines, keeps only `+`/`-` and headers |
| `git branch` | Caps at 15 branches |
| `npm/yarn/pnpm install` | Removes progress spinners, keeps summary + errors |
| `docker ps` | Caps at 20 containers |
| `docker logs` | Shows last 50 lines |
| `docker build` | Keeps only Step/Success/Error lines |
| `cargo test` | Shows only failures + summary |
| `cargo build/check` | Groups warnings, keeps errors |

### Manual usage

```bash
# Pipe any command through etok
git log --oneline | etok git log
npm install 2>&1 | etok npm install

# Check binary
~/.efficlaude/bin/etok
```

### Install Rust (if skipped during install)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Then re-run the EffiClaude installer
```

---

## Worker Service

The worker runs at `localhost:37777`. You can interact with it directly:

```bash
# Check status
curl http://localhost:37777/health

# Search project memory
curl "http://localhost:37777/memory/search?q=auth+flow&project=my-app"

# Search cached docs
curl "http://localhost:37777/docs/search?q=useRouter&project=my-app"

# List registered libraries
curl "http://localhost:37777/docs/list?project=my-app"

# Manually register a library
curl -X POST http://localhost:37777/docs/register \
  -H "Content-Type: application/json" \
  -d '{"name": "prisma", "project": "my-app"}'
```

Start/stop manually:
```bash
bash ~/.efficlaude/server/start.sh
bash ~/.efficlaude/server/stop.sh
```

---

## Contributing

Issues and PRs welcome at [github.com/kaeltech-id/EffiClaude](https://github.com/kaeltech-id/EffiClaude)

---

<p align="center">Built by <a href="https://github.com/kaeltech-id">kaeltech-id</a></p>
