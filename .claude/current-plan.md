# Feature: README Rewrite — Hybrid Option 2+3

## Impact Analysis
- Files affected:
  - `README.md` (full rewrite)
- ⚠️ Breaking change risk: none — documentation only

## Reusable Existing Code
- Content dari README lama tetap dipakai sebagai referensi — jangan hapus fakta yang akurat, hanya restrukturisasi dan tambah visual

## Tasks
- [ ] Task 1: Hero section + flow diagram + install [M] — badges, tagline, before/after table, ASCII flow, install command
- [ ] Task 2: Per-command demos [M] — 6 commands masing-masing dengan mini contoh + "what you get"
- [ ] Task 3: Benefits + advanced features + footer [S] — why section, worker/etok/figma compact, contributing

## Per Task Detail

**Task 1 — Hero section + flow diagram + install** `M`
- File: `README.md` (full overwrite — starts fresh)
- Dependencies: none
- Target output structure:
  ```markdown
  # EffiClaude

  [![Python](https://img.shields.io/badge/python-3.8+-blue.svg)](...)
  [![Claude Code](https://img.shields.io/badge/Claude%20Code-required-blueviolet)](...)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](...)

  > Structured workflow for Claude Code — from ticket to commit, without losing context.

  Built for developers who want Claude to remember everything, plan precisely, and build with proof.

  ---

  ## Before / After

  | Without EffiClaude | With EffiClaude |
  |---|---|
  | Re-explain context every session | Memory persists — Claude knows what was built |
  | Plan features in chat, lose track | Atomic plan with exact files + verify steps |
  | Review manually, miss collateral damage | Blast radius analysis catches downstream breakage |
  | Claude guesses which library API to use | Cached docs ensure correct API usage every time |

  ---

  ## How it works

  ```
  ┌─────────┐     ┌────────────┐     ┌──────────┐     ┌──────────┐     ┌─────────┐     ┌──────┐
  │ /setup  │────▶│/brainstorm │────▶│ /feature │────▶│ /execute │────▶│ /review │────▶│ /git │
  │  once   │     │ (optional) │     │   plan   │     │  build   │     │  check  │     │ push │
  └─────────┘     └────────────┘     └──────────┘     └──────────┘     └─────────┘     └──────┘
  ```

  ---

  ## Install

  ```bash
  curl -fsSL https://raw.githubusercontent.com/kaeltech-id/EffiClaude/main/install.sh | bash
  ```

  **Requirements:** Python 3.8+ · [Claude Code](https://claude.ai/code)
  **Optional:** Rust (token optimizer) · Node.js (Figma MCP) — auto-detected

  Installs commands to `~/.claude/commands/`, starts worker daemon, registers hooks, builds `etok`.

  ---
  ```
- Edge cases: badges harus pakai URL yang valid (shields.io standard format)
- ⚠️ Breaking change: none
- Verify: `grep -c "Before / After" README.md` = 1 && `grep "How it works" README.md` mengembalikan 1 baris
- Dependencies: none

**Task 2 — Per-command demos** `M`
- File: `README.md` (append setelah Task 1 output)
- Dependencies: Task 1
- Target output structure (6 sections, masing-masing max 25 baris):
  ```markdown
  ## The Workflow

  ### /setup — once per project
  Scans your codebase, learns your stack, registers docs libraries, initializes memory.
  ```
  /setup
  ```
  > What you get: `CLAUDE.md` + `.claude/context/` + project memory initialized. Run once, works forever.

  ---

  ### /brainstorm — before complex features
  Explore approaches before committing. Claude presents 2–3 options, you pick one — decision is loaded automatically by `/feature`.
  ```
  You:    Users can't reset password without contacting support

  Claude: ## Option 1: Email Reset Flow  Effort: M · Risk: Low
          ## Option 2: SMS OTP            Effort: M · Risk: Medium
          ## Option 3: Magic Link         Effort: L · Risk: Low

  You:    Option 1
  ```
  > What you get: Decision saved to `.claude/decision.md`, auto-loaded by `/feature`.

  ---

  ### /feature — ticket to atomic plan
  Works with a Jira ticket, Figma link, API contract, or a plain sentence.
  ```
  Claude: Describe the feature (or ticket number)?
  You:    Add user profile page with avatar upload

  Claude: Design reference?
  You:    https://figma.com/design/abc123?node-id=12-34

  Claude: API contract?
  You:    skip
  ```
  > What you get: Plan with exact file paths, code samples, edge cases, and verify steps — approved by you before anything is written.

  ---

  ### /execute — parallel build with evidence
  Runs one subagent per task simultaneously. Each agent must prove completion before marking done.
  ```
  Running group 1: TaskA, TaskB, TaskC (parallel)

  ✓ TaskA — src/components/Avatar.tsx — verified: tsc --noEmit passed
  ✓ TaskB — src/api/upload.ts — verified: grep "uploadAvatar" passed
  ✓ TaskC — src/hooks/useProfile.ts — verified: file exists, parses ok
  ```
  > What you get: All modified files indexed into code graph for blast radius analysis.

  ---

  ### /review — blast radius + two-stage check
  Before reviewing code, computes which files are affected by your changes.
  ```
  Modified:     src/api/upload.ts
  Blast radius: src/api/index.ts, tests/upload.test.ts → also reviewed
  ```
  **Stage 1 — Spec compliance:** does the code match the approved plan?
  **Stage 2 — Code quality:** naming, types, performance, security, API correctness vs cached docs.
  Claude fixes all issues directly — not just reports them.
  > What you get: Clean code or a list of fixes applied. Ready to commit.

  ---

  ### /git — controlled git
  Claude never touches git autonomously. `/git` is the only entry point.
  ```
  Claude: What do you want to do? (commit / push / pull / branch / merge)
  You:    commit and push
  Claude: [shows diff] Commit message?
  You:    feat: add profile page with avatar upload
  Claude: Confirm → executes
  ```
  > What you get: No surprise commits, ever.

  ---
  ```
- Edge cases: code block fence di dalam code block harus pakai 3 backticks konsisten; jangan ada raw HTML
- ⚠️ Breaking change: none
- Verify: `grep -c "^### /" README.md` = 6 (satu per command)
- Dependencies: Task 1

**Task 3 — Benefits + advanced features + footer** `S`
- File: `README.md` (append setelah Task 2 output)
- Dependencies: Task 2
- Target output structure:
  ```markdown
  ## Why EffiClaude

  | | What it solves |
  |---|---|
  | **Persistent memory** | Claude remembers every file touched, decision made, and pattern used — across sessions |
  | **Parallel execution** | Multiple tasks run simultaneously via subagents — faster than sequential chat |
  | **Blast radius analysis** | Tree-sitter AST graph traces which files import from yours — no more surprise breakage |
  | **Docs caching** | Library docs cached locally — correct API usage without Claude guessing |
  | **Evidence-based tasks** | No task marked done without running its verify step |
  | **Token optimizer** | Shell wrappers compress `git`, `npm`, `docker` output by 60–90% before it reaches Claude |
  | **Figma MCP** | Paste any Figma frame link — Claude gets structured layout data, not a screenshot |

  ---

  ## Under the hood

  **Worker service** (`localhost:37777`) — Memory engine (SQLite + ChromaDB), Docs engine, Code graph engine (tree-sitter, 23 languages). Auto-starts on login via launchd/systemd.

  **Token optimizer (etok)** — Rust binary. Compresses `git status`, `git log`, `git diff`, `npm install`, `docker ps/logs/build`, `cargo test/build`. 60–90% reduction typical.

  **Figma MCP** — Registered automatically during `/setup` when Figma API key provided. Requires Node.js.

  ```bash
  # Worker commands
  curl http://localhost:37777/health
  bash ~/.efficlaude/server/start.sh
  bash ~/.efficlaude/server/stop.sh
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
  ```
- Edge cases: pastikan tidak ada duplikasi konten dari Task 1 atau Task 2
- ⚠️ Breaking change: none
- Verify: `wc -l README.md` output antara 220–320 baris && `grep "Why EffiClaude" README.md` ada 1 baris
- Dependencies: Task 1, Task 2
