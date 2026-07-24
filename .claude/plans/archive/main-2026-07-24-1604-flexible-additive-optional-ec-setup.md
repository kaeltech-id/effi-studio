## Feature: Flexible, Additive, Optional ec-setup

### Impact Analysis
- Files affected: `commands/ec-setup.md`, `commands/ec-brainstorm.md`, `commands/ec-feature.md`, and their installed copies under `~/.claude/commands/`.
- ⚠️ Breaking change risk: `tests/test_command_docs.py` asserts the `docs/PROJECT.md` "overwrite it fully" string in ec-setup.md — that line and the `### docs/PROJECT.md` section must be preserved. All edits below leave them untouched.

### Reusable Existing Code
- `.claude/context/` load pattern — brainstorm Step 0 and feature Step 0/Step 2 already read `stack.md`/`structure.md`/`conventions.md`; we extend the same pattern with an optional `notes.md`.
- Existing `## Step` heading structure and `<!-- last_updated: {YYYY-MM-DD} -->` prefix convention in ec-setup — reused for the new `notes.md` file.
- Soft "worker OFFLINE" notice phrasing already used across commands — mirrored for the new soft setup notice.

### Tasks
- [x] Task 1: Add existing-setup detection to ec-setup Step 1 [S] — set RESUME flag when context/notes already exist
- [x] Task 2: Replace ec-setup Step 2 fixed Q&A with free-form additive capture [M] — open-ended prompt, append not restart
- [x] Task 3: Add append-only notes.md section to ec-setup Step 3 [S] — never wipe prior user input
- [x] Task 4: Add notes.md to ec-brainstorm Step 0 load line [S] — load-if-exists
- [x] Task 5: Downgrade ec-brainstorm onboarding hard-stop to soft notice [S] — setup optional, live-scan fallback
- [x] Task 6: Downgrade ec-feature onboarding hard-stop to soft notice [S] — setup optional, live-scan fallback
- [x] Task 7: Add notes.md to ec-feature Step 2 load line [S] — load-if-exists
- [x] Task 8: Sync all three edited command files to ~/.claude/commands/ [S] — source→installed parity
- [x] Task 9: Verify command-docs tests still pass [S] [agent: ec-unit-test] — pytest tests/test_command_docs.py tests/test_docs.py

### Per Task Detail

**Task 1 — Add existing-setup detection to ec-setup Step 1** `S`
- File: `commands/ec-setup.md`
- Reuse: existing "## Step 1 — Silent Scan" block
- Code sample: append to the end of the Step 1 block, before "## Step 2":
  ```markdown
  **Existing setup detection:** Check whether any of `.claude/context/stack.md`, `.claude/context/structure.md`, `.claude/context/conventions.md`, or `.claude/context/notes.md` already exist and are non-empty.
  - If any exist: set RESUME=yes. This is an add-to run, not a fresh setup — read them silently so you know what is already recorded.
  - If none exist: set RESUME=no (fresh setup).
  ```
- Edge cases: `.claude/context/` dir absent → treat as RESUME=no.
- ⚠️ Breaking change: none.
- Verify: `grep -q "Existing setup detection" commands/ec-setup.md`
- Dependencies: none

**Task 2 — Replace ec-setup Step 2 fixed Q&A with free-form additive capture** `M`
- File: `commands/ec-setup.md`
- Reuse: none
- Code sample: replace the entire block from `## Step 2 — Interactive Q&A` through its numbered list (the 8 fixed questions, ending at the "Anything else I should know about this project?" line) with:
  ```markdown
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
  ```
- Edge cases: empty answer / 'skip' / 'done' → proceed without writing new notes.
- ⚠️ Breaking change: removes the fixed 8-question flow — intended. project-config.json fields become opportunistic; Step 3 still writes the file with whatever was gathered (blank strings when not provided), matching its existing template.
- Verify: `grep -q "Free-Form Capture" commands/ec-setup.md && ! grep -q "Interactive Q&A" commands/ec-setup.md`
- Dependencies: Task 1 (uses RESUME flag)

**Task 3 — Add append-only notes.md section to ec-setup Step 3** `S`
- File: `commands/ec-setup.md`
- Reuse: the `### .claude/context/conventions.md` section as a placement anchor; the `<!-- last_updated -->` convention.
- Code sample: insert a new subsection in Step 3 immediately AFTER the `### .claude/context/conventions.md` block:
  ```markdown
  ### .claude/context/notes.md (append-only — never overwrite)
  Free-form project notes the user provided in Step 2. This file is the user's own content and MUST be preserved across re-runs.
  - If it does not exist: create it with the `<!-- last_updated: {YYYY-MM-DD} -->` first line, then the user's notes under a `## {YYYY-MM-DD}` heading.
  - If it already exists: APPEND a new `## {YYYY-MM-DD}` heading with only the newly added notes. Never delete or rewrite existing entries. If the new input merely corrects an earlier note, add a short "(updates: …)" line rather than editing the old text.
  - If the user chose 'skip'/'done' with no new input: leave the file untouched.
  Unlike `docs/PROJECT.md` (a derived overview, regenerated fresh each run) and the scan-detected context files, `notes.md` is user-authored and additive.
  ```
- Edge cases: no new notes → file untouched; first ever run with notes → file created.
- ⚠️ Breaking change: none — new file, additive.
- Verify: `grep -q "notes.md (append-only" commands/ec-setup.md`
- Dependencies: Task 2

**Task 4 — Add notes.md to ec-brainstorm Step 0 load line** `S`
- File: `commands/ec-brainstorm.md` (line 4)
- Reuse: existing load line
- Code sample: replace the line
  ``Read `.claude/context/stack.md`, `.claude/context/structure.md`, `.claude/context/conventions.md`.``
  with
  ``Read `.claude/context/stack.md`, `.claude/context/structure.md`, `.claude/context/conventions.md`, and `.claude/context/notes.md` — load each only if it exists (all optional).``
- Edge cases: files absent → skip that file.
- ⚠️ Breaking change: none.
- Verify: `grep -q "load each only if it exists" commands/ec-brainstorm.md`
- Dependencies: none

**Task 5 — Downgrade ec-brainstorm onboarding hard-stop to soft notice** `S`
- File: `commands/ec-brainstorm.md` (lines 11–13)
- Reuse: "worker OFFLINE" soft-notice phrasing style
- Code sample: replace the three lines starting `**Onboarding check:**` … ending `… and stop` with:
  ```markdown
  **Setup check (optional):** Check whether any of `.claude/context/stack.md`, `.claude/context/structure.md`, `.claude/context/conventions.md`, or `.claude/context/notes.md` exist and are non-empty.
  - If any present: use them for context and proceed normally.
  - If none present: show "(no setup found — working from a live scan; run /ec-setup anytime to add project context)", do a quick live scan of the repo for stack/structure, and proceed. Do NOT stop.
  ```
- Edge cases: partial context (some files present) → proceed with what exists.
- ⚠️ Breaking change: setup no longer blocks brainstorm — intended.
- Verify: `! grep -q "run /ec-setup first" commands/ec-brainstorm.md && grep -q "no setup found — working from a live scan" commands/ec-brainstorm.md`
- Dependencies: none

**Task 6 — Downgrade ec-feature onboarding hard-stop to soft notice** `S`
- File: `commands/ec-feature.md` (lines 10–12)
- Reuse: same soft-notice text as Task 5 for consistency
- Code sample: replace the three lines starting `**Onboarding check:**` … ending `… and stop` with the identical "Setup check (optional)" block from Task 5.
- Edge cases: same as Task 5.
- ⚠️ Breaking change: setup no longer blocks feature planning — intended.
- Verify: `! grep -q "run /ec-setup first" commands/ec-feature.md && grep -q "no setup found — working from a live scan" commands/ec-feature.md`
- Dependencies: none

**Task 7 — Add notes.md to ec-feature Step 2 load line** `S`
- File: `commands/ec-feature.md` (line 126)
- Reuse: existing load line
- Code sample: replace the line
  `Read .claude/context/stack.md, .claude/context/structure.md, .claude/context/conventions.md.`
  with
  `Read .claude/context/stack.md, .claude/context/structure.md, .claude/context/conventions.md, and .claude/context/notes.md — load each only if it exists (all optional).`
- Edge cases: files absent → skip.
- ⚠️ Breaking change: none.
- Verify: `grep -q "notes.md — load each only if it exists" commands/ec-feature.md`
- Dependencies: none

**Task 8 — Sync edited command files to ~/.claude/commands/** `S`
- File: `~/.claude/commands/ec-setup.md`, `~/.claude/commands/ec-brainstorm.md`, `~/.claude/commands/ec-feature.md`
- Reuse: none
- Code sample:
  ```bash
  cp commands/ec-setup.md ~/.claude/commands/ec-setup.md
  cp commands/ec-brainstorm.md ~/.claude/commands/ec-brainstorm.md
  cp commands/ec-feature.md ~/.claude/commands/ec-feature.md
  ```
- Edge cases: `~/.claude/commands/` must exist (verified present).
- ⚠️ Breaking change: none.
- Verify: `for c in ec-setup ec-brainstorm ec-feature; do diff -q commands/$c.md ~/.claude/commands/$c.md; done` → no output (identical).
- Dependencies: Tasks 1–7

**Task 9 — Verify command-docs tests still pass** `S` `agent: ec-unit-test`
- File: (no edit) `tests/test_command_docs.py`, `tests/test_docs.py`
- Reuse: existing pytest suite
- Code sample: `cd /Users/admin/Projects/EffiClaude && python3 -m pytest tests/test_command_docs.py tests/test_docs.py -q`
- Edge cases: if `test_overwrite_on_rerun_instruction_present` fails, the `docs/PROJECT.md` "overwrite it fully" line was accidentally touched — restore it.
- ⚠️ Breaking change: none — this task only verifies.
- Verify: pytest exits 0, all tests pass.
- Dependencies: Tasks 1–8
