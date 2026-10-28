# EffiClaude

[![Python](https://img.shields.io/badge/python-3.8+-blue.svg)](https://python.org)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-required-blueviolet)](https://claude.ai/code)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Structured workflow for Claude Code — from ticket to commit, without losing context.

Built for developers who want Claude to remember everything, plan precisely, and build with proof.

---

## Before / After

| Without EffiClaude | With EffiClaude |
|---|---|
| Re-explain context every session | Memory persists — Claude knows what was built |
| Plan features in chat, easy to lose track | Atomic plan with exact files + verify steps |
| Review manually, miss collateral damage | Blast radius analysis catches downstream breakage |
| Claude guesses which library API to use | Cached docs ensure correct API usage every time |

---

## How it works

```
┌──────────┐     ┌───────────────┐     ┌────────────┐     ┌────────────┐     ┌───────────┐     ┌──────────┐
│/ec-setup │────▶│/ec-brainstorm │────▶│/ec-feature │────▶│/ec-execute │────▶│/ec-review │────▶│ /ec-git  │
│  once    │     │  (optional)   │     │    plan    │     │   build    │     │   check   │     │   push   │
└──────────┘     └───────────────┘     └────────────┘     └────────────┘     └───────────┘     └──────────┘
```

---

## Install

```bash
git clone git@github.com:kaeltech-id/EffiClaude.git
cd EffiClaude
bash install.sh
```

**Requirements:** Python 3.8+ · [Claude Code](https://claude.ai/code)  
**Optional:** Rust (token optimizer) · Node.js (Figma MCP) — auto-detected

Installs commands to `~/.claude/commands/`, starts worker daemon, registers hooks, builds `etok`.

---

## Studio (macOS app)

A desktop window over the same workflow: add your project folders, get a terminal
wired to your own `claude` in each one, and watch tasks tick off as `/ec-execute` runs.

Download the `.dmg` from [Releases](https://github.com/kaeltech-id/EffiClaude/releases),
drag it to Applications, then **right-click → Open** the first time — the app is
ad-hoc signed, not notarized, so a plain double-click is refused by Gatekeeper.

macOS 11+ only. Studio reads your projects' `.claude/` folders and never writes to them.

---

## The workflow

### /ec-setup — once per project

Scans your codebase, learns your stack, registers docs libraries, initializes project memory.

```
/ec-setup
```

> **What you get:** `CLAUDE.md` + `.claude/context/` + project memory initialized. Run once, works forever.

---

### /ec-brainstorm — before complex features

Explore approaches before committing. Claude presents 2–3 options with pros/cons — you pick one, decision is auto-loaded by `/ec-feature`.

```
You:    Users can't reset password without contacting support

Claude: ## Option 1: Email Reset Flow       Effort: M · Risk: Low
        ## Option 2: SMS OTP Reset           Effort: M · Risk: Medium
        ## Option 3: Magic Link + Fallback   Effort: L · Risk: Low

You:    Option 1
```

> **What you get:** Decision saved to `.claude/decision.md`, pre-loaded next time you run `/ec-feature`.

---

### /ec-feature — ticket to atomic plan

Works with a Jira ticket, Figma link, API contract, or a plain sentence.

```
Claude: Describe the feature (or paste ticket number)?
You:    Add user profile page with avatar upload

Claude: Design reference?
You:    https://figma.com/design/abc123?node-id=12-34

Claude: API contract?
You:    skip
```

Produces a plan with exact file paths, concrete code samples, edge cases, and verify steps per task — memory-informed to avoid re-creating existing work. You approve before anything is written.

> **What you get:** `.claude/current-plan.md` — ready for `/ec-execute`.

---

### /ec-execute — parallel build with evidence

Runs one subagent per task simultaneously. No task is marked done without running its verify step.

```
Running group 1: Avatar component, Upload hook, API endpoint (parallel)

✓ Avatar component   — src/components/Avatar.tsx      — tsc --noEmit passed
✓ Upload hook        — src/hooks/useAvatarUpload.ts   — file exists, parses ok
✓ API endpoint       — src/api/upload.ts              — grep "uploadAvatar" found
```

> **What you get:** All modified files indexed into code graph — blast radius ready for `/ec-review`.

---

### /ec-review — blast radius + two-stage check

Before reviewing code, traces which files are affected by your changes.

```
Modified:     src/api/upload.ts
Blast radius: src/api/index.ts, tests/upload.test.ts → also reviewed
```

**Stage 1 — Spec compliance:** implementation matches the approved plan exactly.  
**Stage 2 — Code quality:** naming, types, performance, security, API correctness vs cached docs.

Claude fixes all issues directly — not just reports them.

> **What you get:** Clean code or a list of applied fixes. Ready to commit.

---

### /ec-git — controlled git

Claude never touches git autonomously. `/ec-git` is the only entry point.

```
Claude: What do you want to do? (commit / push / pull / branch / merge)
You:    commit and push

Claude: [shows diff] Commit message?
You:    feat: add profile page with avatar upload

Claude: Confirmed → executes
```

> **What you get:** No surprise commits, ever.

---

## Why EffiClaude

| | What it solves |
|---|---|
| **Persistent memory** | Claude remembers every file touched, decision made, and pattern used — across sessions |
| **Parallel execution** | Multiple tasks run simultaneously via subagents — faster than sequential chat |
| **Blast radius analysis** | Tree-sitter AST graph traces which files import from yours — no more surprise breakage |
| **Docs caching** | Library docs cached locally — correct API usage without Claude guessing |
| **Evidence-based tasks** | No task marked done without running its verify step |
| **Token optimizer** | Shell wrappers compress `git`, `npm`, `docker` output 60–90% before it reaches Claude |
| **Figma MCP** | Paste any Figma frame link — Claude gets structured layout data, not a screenshot |

---

## Under the hood

**Worker service** (`localhost:37777`) — Memory engine (SQLite + ChromaDB), Docs engine, Code graph engine (tree-sitter, 23 languages). Auto-starts on login via launchd/systemd.

**Token optimizer (etok)** — Rust binary. Compresses `git status`, `git log`, `git diff`, `npm install`, `docker ps/logs/build`, `cargo test/build`. 60–90% reduction typical.

**Figma MCP** — Registered automatically during `/ec-setup` when Figma API key provided. Requires Node.js.

```bash
curl http://localhost:37777/health      # check status
bash ~/.efficlaude/server/start.sh      # start manually
bash ~/.efficlaude/server/stop.sh       # stop
```

---

## Project memory files

```
your-project/
├── CLAUDE.md                   ← auto-loaded every session
└── .claude/
    ├── project-config.json     ← credentials & config (gitignored)
    ├── current-plan.md         ← active feature plan
    └── context/
        ├── stack.md
        ├── structure.md
        └── conventions.md
```

---

## Contributing

Issues and PRs welcome at [github.com/kaeltech-id/EffiClaude](https://github.com/kaeltech-id/EffiClaude)

---

<p align="center">Built by <a href="https://github.com/kaeltech-id">kaeltech-id</a></p>
