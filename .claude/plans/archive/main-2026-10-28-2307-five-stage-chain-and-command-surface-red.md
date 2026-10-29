## Feature: Five-Stage Chain and Command Surface Reduction

### Impact Analysis
- Files affected: `commands/ec-feature.md` → `commands/ec-plan.md` (renamed), `commands/ec-refine.md` (new), `commands/ec-brainstorm.md`, `commands/ec-execute.md`, `commands/ec-review.md`, `commands/ec-git.md`, `commands/ec-setup.md`, `commands/ec-selfhealing.md`, `commands/ec-mode.md` + `ec-next.md` + `ec-export.md` + `ec-import.md` (deleted), `hooks/prompt_submit.py`, `hooks/session_stop.py`, `install.sh`, `CLAUDE.md`, `README.md`, `tests/test_command_docs.py`, `tests/test_hooks.py`, `studio/src-tauri/src/plan.rs`, `studio/src-tauri/src/doctor.rs`, `studio/src/lib/types.ts`, `studio/src/components/doctor-screen.tsx`
- ⚠️ Breaking change risk:
  - Every existing install keeps a stale `ec-feature.md` unless `LEGACY_COMMANDS` removes it. The orphaned `ec-design.md` on this machine is proof the list is the only cleanup mechanism and that it is easy to forget.
  - `.claude/.autoflow` sentinels written before this change carry `stage=feature`. Routing never reads `stage=` (`hooks/session_stop.py:209-229` uses disk state only), so an in-flight chain survives; the field becomes a stale label for one cycle and nothing more.
  - `Doctor` gains two fields on the IPC boundary, consumed by `doctor-screen.tsx`. Both sides change in this cycle.
  - `Stage` gains `Refine` and renames `Feature` → `Plan` on both sides of the IPC boundary. Any `.claude/plans/{branch}.md` currently mid-flight keeps working, because stage is derived from files, not stored.

### Reusable Existing Code
- `hooks/session_stop.py:209-229` (`_next_autoflow_command`) — the only router after this cycle; `/ec-refine` is added as a new branch rather than a new mechanism
- `.claude/.review-done-{branch}` convention (`hooks/session_stop.py:212`, `commands/ec-review.md`) — `.claude/.refined-{branch}` copies its shape exactly, so the driver's existing file-probe pattern is reused
- `commands/ec-feature.md:36,44` — the incomplete-plan guard and archive-before-overwrite; referenced by the selfhealing fix as the behaviour NOT to copy, since a separate plan file removes the need
- `install.sh:88` `LEGACY_COMMANDS` loop — the existing removal mechanism; this cycle adds entries, it does not invent a new uninstaller
- `studio/src/components/stage-rail.tsx:23-29` — renders `STAGES.map`, so a five-entry array renders five dots with no component change
- `studio/src-tauri/src/doctor.rs:34-55` (`worker_ok`) and its advisory row in `doctor-screen.tsx:86-90` — the pattern for a non-blocking check, reused for the agents row
- `commands/ec-plan.md` Grounding Pass and Verify conventions — `/ec-refine` consumes these, it does not redefine them

### Grounding
Measured 2026-10-28 — real command output only, never predicted.

Baseline line counts (`wc -l`):
- `commands/ec-feature.md` → 421
- `commands/ec-brainstorm.md` → 304
- `commands/ec-execute.md` → 285
- `commands/ec-review.md` → 312
- `commands/ec-git.md` → 78
- `commands/ec-setup.md` → 205
- `commands/ec-selfhealing.md` → 249
- `commands/ec-mode.md` → 20 · `ec-next.md` → 81 · `ec-export.md` → 33 · `ec-import.md` → 39
- `hooks/session_stop.py` → 372 · `hooks/prompt_submit.py` → 261
- `install.sh` → 278 · `README.md` → 220 · `CLAUDE.md` → 17
- `tests/test_command_docs.py` → 433 · `tests/test_hooks.py` → 614
- `studio/src-tauri/src/plan.rs` → 217 · `studio/src-tauri/src/doctor.rs` → 84
- `studio/src/lib/types.ts` → 67 · `studio/src/components/doctor-screen.tsx` → 159

New files confirmed ABSENT on disk:
- `commands/ec-refine.md` → absent
- `commands/ec-plan.md` → absent

Baseline `/ec-feature` reference counts (`grep -c '/ec-feature'`) — these are the numbers each rename task must drive to 0:
- `commands/ec-brainstorm.md` → 13
- `commands/ec-setup.md` → 6
- `README.md` → 4
- `CLAUDE.md` → 3
- `commands/ec-review.md` → 2
- `hooks/session_stop.py` → 2
- `commands/ec-execute.md` → 1
- `commands/ec-feature.md` → 1 (moves with the file)
- `tests/test_command_docs.py` → 1 · `tests/test_hooks.py` → 1

Baseline `MODE`/`vibe` line counts (`grep -c 'MODE\|vibe'`) — each must reach 0:
- `commands/ec-feature.md` → 4 · `ec-execute.md` → 3 · `ec-brainstorm.md` → 2 · `ec-review.md` → 2 · `ec-git.md` → 2
- `hooks/prompt_submit.py` → 2 (matched as `ec-mode|\.mode`) · `hooks/session_stop.py` → 1

Other baseline string counts (all 0 today unless stated):
- `/ec-refine` in `commands/ec-execute.md` → 0
- `refined-` in `hooks/session_stop.py` → 0
- `plans/selfheal-` in `commands/ec-selfhealing.md` → 0
- `Stage::Refine` in `studio/src-tauri/src/plan.rs` → 0
- `Stage::Plan` in `studio/src-tauri/src/plan.rs` → 0
- `'Refine'` in `studio/src/lib/types.ts` → 0
- `AGENTS` in `studio/src-tauri/src/doctor.rs` → 0
- `agentsFound` in `studio/src/lib/types.ts` → 0
- `agentsFound` in `studio/src/components/doctor-screen.tsx` → 0
- `ec-next` in `commands/ec-review.md` → 1 (must reach 0)

Baseline test and build results:
- `python3 -m pytest tests/ -q` → **195 passed**, 1 warning, 3.81s
- `cd studio && cargo check --manifest-path src-tauri/Cargo.toml` → exit 0
- `cd studio && npm run build` → exit 0

Verified anchors:
- `COMMANDS=("ec-setup" "ec-feature" ...)` → `install.sh:14`
- `LEGACY_COMMANDS=("setup" "feature" ... "design")` → `install.sh:88`
- `def _next_autoflow_command(branch):` → `hooks/session_stop.py:209`
- `return "/ec-feature"` → `hooks/session_stop.py:222` and `:226`
- `PLAN_FILE=".claude/plans/${BRANCH}.md"` → `commands/ec-selfhealing.md:13`
- `- After /ec-brainstorm completes → always suggest running /ec-feature` → `CLAUDE.md:13` and `commands/ec-setup.md:54`
- `| /ec-feature | Plan a feature with tasks and file targets |` → `commands/ec-setup.md:117`
- `const COMMANDS: [&str; 11] = [` → `studio/src-tauri/src/doctor.rs:11`
- `pub struct Doctor {` → `studio/src-tauri/src/doctor.rs:59`
- `pub enum Stage {` → `studio/src-tauri/src/plan.rs:35`
- `fn stage_from_name(name: &str) -> Option<Stage> {` → `studio/src-tauri/src/plan.rs:43`
- `fn derive_stage(` → `studio/src-tauri/src/plan.rs:75`
- `export type Stage = 'Idle' | 'Brainstorm' | 'Feature' | 'Execute' | 'Review';` → `studio/src/lib/types.ts:1`
- `export const STAGES: Stage[] =` → `studio/src/lib/types.ts:55`
- `export interface Doctor {` → `studio/src/lib/types.ts:57`
- `detail={doctor.workerOk ? 'online' : 'offline, memory unavailable'}` → `studio/src/components/doctor-screen.tsx:118`
- `for cmd in ['/ec-setup', '/ec-brainstorm', '/ec-feature',` → `tests/test_command_docs.py:34`
- `AUTOFLOW_COMMANDS = ['ec-brainstorm.md', 'ec-feature.md',` → `tests/test_command_docs.py:292`
- `from session_stop import _next_autoflow_command` → `tests/test_hooks.py:205`
- `commands/ec-refine.md` → new file — no anchor

### Tasks
- [x] Task 1: Rename ec-feature.md to ec-plan.md and strip its vibe branches [M] — move the file, fix its self-references, remove 4 MODE lines
- [x] Task 2: Create commands/ec-refine.md [L] — the pre-execution audit: dry-run every verify, re-measure baselines, check anchors and new-file claims
- [x] Task 3: Update ec-brainstorm.md for the rename and strip vibe [M] — 13 references plus 2 MODE lines
- [x] Task 4: Update ec-execute.md for the rename, strip vibe, require the refine sentinel [M] — 1 reference, 3 MODE lines, new precondition
- [x] Task 5: Update ec-review.md for the rename, strip vibe, tear down the refine sentinel [M] — 2 references, 2 MODE lines, 1 ec-next reference
- [x] Task 6: Strip vibe branches from ec-git.md [S] — 2 MODE lines
- [x] Task 7: Update ec-setup.md for the rename and the new chain [M] — 6 references plus the CLAUDE.md template and command table
- [x] Task 8: Update CLAUDE.md WORKFLOW RULES for the five-stage chain [S] — 3 references
- [x] Task 9: Update README.md for the rename and the eight-command surface [M] — 4 references plus the command list
- [x] Task 10: Give ec-selfhealing its own plan file [S] — removes the clobber without copying ec-plan's guard
- [x] Task 11: Delete the four retired command files [S] — ec-mode, ec-next, ec-export, ec-import
- [x] Task 12: Strip mode handling from hooks/prompt_submit.py [S] — 2 references to the retired .mode file
- [x] Task 13: Route the driver through refine and the renamed plan command [M] — session_stop.py router gains a refine branch
- [x] Task 14: Update install.sh COMMANDS to the eight-command surface [S] — ec-plan and ec-refine in, four out
- [x] Task 15: Add retired commands to install.sh LEGACY_COMMANDS [S] — ec-feature, ec-design, ec-mode, ec-next, ec-export, ec-import
- [x] Task 16: Add Refine and rename Feature to Plan in studio plan.rs [M] — Stage enum, stage_from_name, derive_stage
- [x] Task 17: Add Refine and rename Feature to Plan in studio types.ts [S] [agent: ec-typescript] — Stage union and STAGES array
- [x] Task 18: Update studio doctor.rs for eight commands and agent checking [M] — COMMANDS array plus a new AGENTS const
- [x] Task 19: Add agent fields to the Doctor type in studio types.ts [S] [agent: ec-typescript] — agentsFound and agentsExpected
- [x] Task 20: Render the agents row in doctor-screen.tsx [S] [agent: ec-react] — advisory, never blocking
- [x] Task 21: Update tests/test_command_docs.py for the new surface [M] [agent: ec-python] — command list and AUTOFLOW_COMMANDS
- [x] Task 22: Update tests/test_hooks.py and add refine routing tests [M] [agent: ec-python] — rename plus the new branch

### Per Task Detail

**Task 1 — Rename ec-feature.md to ec-plan.md and strip its vibe branches** `M`
- File: `commands/ec-plan.md` (moved from `commands/ec-feature.md`, 421 lines)
- Anchor: `**Mode check:** Run \`cat .claude/.mode 2>/dev/null || echo "structured"\`` — the MODE block to delete
- Reuse: the file's entire existing content; this is a move plus two edits, never a rewrite
- Code sample: move with `mv commands/ec-feature.md commands/ec-plan.md` (plain filesystem move — NOT `git mv`, because GIT RULES forbid git operations outside `/ec-git`). Then inside the moved file delete the whole `**Mode check:**` block and every `MODE is \`vibe\`` clause, leaving the `AUTO=yes` branch as the only gate-skipping condition. Replace the one `/ec-feature` self-reference.
- Do not touch: the Grounding Pass (Step 2.5), the Flat Format Rules, the exception-only field rules, the Design Contract / Design Direction logic, and the `AUTO=yes` handling — only the `MODE`/`vibe` conditions are removed
- Edge cases: Step 6's gate currently reads "If `AUTO=yes` **or** MODE is `vibe`" — it must become `AUTO=yes` alone, not be deleted; Step 5's memory save is currently skipped on vibe and must now always run
- Acceptance: the planning command lives at `commands/ec-plan.md`, contains no reference to the retired mode file, and still skips its gates on the auto path
- Verify (local): `test -f commands/ec-plan.md && test ! -f commands/ec-feature.md` → exit 0 AND `grep -c 'MODE\|vibe' commands/ec-plan.md` → `== 0` (baseline 4 in the file at its old path)
- Dependencies: none

**Task 2 — Create commands/ec-refine.md** `L`
- File: `commands/ec-refine.md`
- Reuse: `commands/ec-plan.md`'s Grounding and Verify conventions (consumed, never redefined); the `.claude/.review-done-{branch}` sentinel shape from `hooks/session_stop.py:212`; the branch-detection and auto-flow preamble shared by every command
- Code sample: the command's required structure —
  ```
  Audit the current plan before any code is written. Read {PLAN_FILE}.

  **No-Code Rule:** MUST NOT create, edit, or write any project file.
  Allowed writes: `.claude/.refined-{BRANCH}` only. Reporting a defect is the
  output; fixing it is /ec-plan's job.

  ## Step 1 — Dry-run every Verify (local)
  Every Verify (local) in a plan is a read-only command, so all of them can run
  BEFORE execution. At this moment the correct result is the task's recorded
  baseline in ### Grounding.
  - result == the task's stated expectation  → DEFECT: threshold already
    satisfied, so the command cannot prove the task did anything
  - result == the recorded baseline          → OK
  - command is not safely runnable           → UNVERIFIABLE, reported as such

  ## Step 2 — Re-measure Grounding against disk
  Re-run every `wc -l` and `grep -c` in ### Grounding. Any drift means the plan
  was written against a tree that has since moved.

  ## Step 3 — Confirm anchors exist
  For each task with an `Anchor:` line, grep the exact string in its `File:`.
  A missing anchor is a stale plan.

  ## Step 4 — Confirm new files are absent
  For each task whose `File:` is claimed new, confirm it does not exist. This is
  only checkable before execution, which is why it lives here.

  ## Step 5 — Report and gate
  Print one line per task: PASS / DEFECT / UNVERIFIABLE with the evidence.
  If any DEFECT: do not write the sentinel; stop and name the task. On the auto
  path, delete `.claude/.autoflow` so the chain stops here.
  If clean: `touch .claude/.refined-{BRANCH}` and hand off to /ec-execute.
  ```
- Do not touch: `{PLAN_FILE}` itself — refine reports, it never edits; `.claude/decisions/` and `.claude/plans/archive/` are also off limits
- Edge cases: a plan with zero tasks → report and refuse to write the sentinel; a Verify line with no numeric threshold (`test -f`, exit status) → PASS if the command is runnable, since there is nothing to compare; a Verify whose command would write anything → UNVERIFIABLE, never run; an already-present sentinel from an earlier run on the same branch → re-run the audit and refresh it rather than trusting it
- Acceptance: running the command against a plan prints a per-task verdict backed by real command output, writes `.claude/.refined-{BRANCH}` only when every task passes, and never modifies the plan
- Verify (local): `test -f commands/ec-refine.md` → exit 0 AND `grep -c 'refined-' commands/ec-refine.md` → `>= 1` AND `grep -c 'No-Code Rule' commands/ec-refine.md` → `== 1` (baseline: file absent)
- Dependencies: none

**Task 3 — Update ec-brainstorm.md for the rename and strip vibe** `M`
- File: `commands/ec-brainstorm.md`
- Anchor: `Next: run \`/ec-feature\` — it will load this decision automatically.`
- Reuse: the file's existing Step 7 auto-flow chain description, edited rather than rewritten
- Code sample: replace all 13 `/ec-feature` with `/ec-plan`; in Step 7 the chain becomes `/ec-plan` → `/ec-refine` → `/ec-execute` → `/ec-review`; the sentinel's `stage=` table gains `refine` as a legal value; delete the `**Mode check:**` block and the vibe clause in Step 5
- Do not touch: the SCAMPER and Six Thinking Hats analysis, the decision-file template, the Recommendation Constraints, and the sentinel field-ownership table's rule that commands never write driver-owned fields
- Edge cases: the sentinel documentation lists `feature | execute | review` as legal `stage=` values and must now list `plan | refine | execute | review`; the auto-flow description must name the four chained commands, not three
- Acceptance: the brainstorm command names the renamed planning command everywhere, describes the five-stage chain, and has no mode handling
- Verify (local): `grep -c '/ec-feature' commands/ec-brainstorm.md` → `== 0` (baseline 13) AND `grep -c 'MODE\|vibe' commands/ec-brainstorm.md` → `== 0` (baseline 2) AND `grep -c '/ec-refine' commands/ec-brainstorm.md` → `>= 1` (baseline 0)
- Dependencies: Task 1, Task 2

**Task 4 — Update ec-execute.md for the rename, strip vibe, require the refine sentinel** `M`
- File: `commands/ec-execute.md`
- Anchor: `**Mode check:** Run \`cat .claude/.mode 2>/dev/null || echo "structured"\``
- Reuse: the existing Resume check and Auto-Flow check blocks, extended rather than replaced
- Code sample: replace the 1 `/ec-feature`; remove 3 MODE lines; add a precondition after the resume check —
  ```
  **Refine gate:** Check `.claude/.refined-{BRANCH}`.
  - Absent: stop — "Plan has not been audited. Run /ec-refine first."
    On the auto path this is a chain error: delete `.claude/.autoflow` and stop.
  - Present: proceed, and delete it once every task is done, so the next plan
    on this branch must be audited afresh.
  ```
- Do not touch: the Evidence Rule, the co-location fusion rules, the Anchor Discipline block, the session lock, and the per-task plan-file marking — this task adds one gate and removes mode handling
- Edge cases: a resumed run mid-plan must not demand a second audit, so the gate checks the sentinel's presence rather than re-running refine; the sentinel is removed only after the final task, not per task, or a resumed run would fail its own gate
- Acceptance: execution refuses to start on a plan that has not been audited, and the audit does not carry over to the next plan on that branch
- Verify (local): `grep -c '/ec-feature' commands/ec-execute.md` → `== 0` (baseline 1) AND `grep -c 'MODE\|vibe' commands/ec-execute.md` → `== 0` (baseline 3) AND `grep -c 'refined-' commands/ec-execute.md` → `>= 1` (baseline 0)
- Dependencies: Task 2

**Task 5 — Update ec-review.md for the rename, strip vibe, tear down the refine sentinel** `M`
- File: `commands/ec-review.md`
- Anchor: `REVIEW_DONE=".claude/.review-done-${BRANCH}"`
- Reuse: the existing teardown block that removes `.claude/.autoflow` and archives the plan — the refine sentinel joins it
- Code sample: replace the 2 `/ec-feature`; remove 2 MODE lines; remove the 1 `ec-next` reference; add `.claude/.refined-${BRANCH}` to the branch-detection block and `rm -f` it in the Step 4 teardown beside `rm -f .claude/.autoflow`
- Do not touch: the two-stage review structure, the definitive global gate, the evidence audit, the scope boundary check, and the plan-lint rules
- Edge cases: teardown must remove the refine sentinel on both the clean and the not-clean path, exactly as `.claude/.autoflow` already is, or a failed review would leave the next plan pre-approved
- Acceptance: a completed review leaves neither an auto-flow sentinel nor a refine sentinel behind, on either path
- Verify (local): `grep -c '/ec-feature' commands/ec-review.md` → `== 0` (baseline 2) AND `grep -c 'MODE\|vibe' commands/ec-review.md` → `== 0` (baseline 2) AND `grep -c 'ec-next' commands/ec-review.md` → `== 0` (baseline 1) AND `grep -c 'refined-' commands/ec-review.md` → `>= 1` (baseline 0)
- Dependencies: Task 2

**Task 6 — Strip vibe branches from ec-git.md** `S`
- File: `commands/ec-git.md`
- Anchor: `**Mode check:** Run \`cat .claude/.mode 2>/dev/null || echo "structured"\``
- Reuse: none
- Code sample: delete the `**Mode check:**` block at Step 1 and the vibe clause in Step 3's next-step suggestion, leaving the suggestion unconditional
- Do not touch: everything else. The VERSION bump rules, the conventional-prefix gate, the safety checklist, and the confirmation gates are the reason this command exists and are unchanged.
- Edge cases: the `/ec-brainstorm` suggestion at the end currently only appears in structured mode and must now always appear
- Acceptance: the git command has no mode handling and always suggests the next step
- Verify (local): `grep -c 'MODE\|vibe' commands/ec-git.md` → `== 0` (baseline 2)
- Dependencies: none

**Task 7 — Update ec-setup.md for the rename and the new chain** `M`
- File: `commands/ec-setup.md`
- Anchor: `- After /ec-brainstorm completes → always suggest running /ec-feature` at `ec-setup.md:54`
- Reuse: the existing CLAUDE.md template block and the command table; both are edited in place
- Code sample: replace 6 `/ec-feature` with `/ec-plan`; the WORKFLOW RULES template becomes the five-stage chain with a refine line; the table row at line 117 becomes `| /ec-plan | Plan a feature with tasks and file targets |` and a `/ec-refine` row is added; the Figma line at 168 and the closing line at 205 name `/ec-plan`
- Do not touch: the GIT RULES block in the template — `ec-review.md:92-96` compares it against `CLAUDE.md` line by line, so any edit here must be mirrored there, and nothing in this cycle changes a git rule
- Edge cases: the template's WORKFLOW RULES and `CLAUDE.md`'s must stay identical, which is why Task 8 does the same edit to `CLAUDE.md`; the command table must list eight commands, not eleven
- Acceptance: a fresh `/ec-setup` run writes a `CLAUDE.md` describing the five-stage chain and an accurate eight-command table
- Verify (local): `grep -c '/ec-feature' commands/ec-setup.md` → `== 0` (baseline 6) AND `grep -c '/ec-refine' commands/ec-setup.md` → `>= 1` (baseline 0)
- Dependencies: Task 1, Task 2

**Task 8 — Update CLAUDE.md WORKFLOW RULES for the five-stage chain** `S`
- File: `CLAUDE.md`
- Anchor: `- After /ec-brainstorm completes → always suggest running /ec-feature` at `CLAUDE.md:13`
- Reuse: the identical block written by Task 7 into `commands/ec-setup.md` — the two must match verbatim
- Code sample:
  ```
  ## WORKFLOW RULES
  - After /ec-brainstorm completes → always suggest running /ec-plan
  - After /ec-plan completes → always suggest running /ec-refine
  - After /ec-refine is clean → always suggest running /ec-execute
  - After /ec-execute completes → always suggest running /ec-review
  - After /ec-review is clean → always suggest running /ec-git
  - Always guide user through the full flow: /ec-brainstorm → /ec-plan → /ec-refine → /ec-execute → /ec-review → /ec-git
  ```
- Do not touch: the `## GIT RULES` block — `ec-review.md:92-96` audits it against the `ec-setup.md` template, and changing it here without the template would be reported as drift
- Edge cases: this block must be byte-identical to the one Task 7 writes into the template, or the review's drift check fires on the next run
- Acceptance: the project's own context file describes the five-stage chain
- Verify (local): `grep -c '/ec-feature' CLAUDE.md` → `== 0` (baseline 3) AND `grep -c '/ec-refine' CLAUDE.md` → `>= 1` (baseline 0)
- Dependencies: Task 7

**Task 9 — Update README.md for the rename and the eight-command surface** `M`
- File: `README.md`
- Anchor: `/ec-feature`
- Reuse: the existing document structure — sections are edited, not reordered
- Code sample: replace 4 `/ec-feature` with `/ec-plan`; add `/ec-refine` to the command list with a one-line description; remove the entries for `/ec-mode`, `/ec-next`, `/ec-export` and `/ec-import`; update any workflow diagram to the five-stage chain
- Do not touch: the install instructions and the clone-then-install flow — unrelated to this change
- Edge cases: if README documents the retired commands in prose as well as a list, both must go, or the docs promise commands that no longer install
- Acceptance: the README documents exactly the eight commands that `install.sh` installs, in the five-stage order
- Verify (local): `grep -c '/ec-feature' README.md` → `== 0` (baseline 4) AND `grep -c '/ec-mode\|/ec-next\|/ec-export\|/ec-import' README.md` → `== 0` AND `grep -c '/ec-refine' README.md` → `>= 1`
- Dependencies: Task 1, Task 2

**Task 10 — Give ec-selfhealing its own plan file** `S`
- File: `commands/ec-selfhealing.md`
- Anchor: `PLAN_FILE=".claude/plans/${BRANCH}.md"` at `ec-selfhealing.md:13`
- Reuse: nothing from `ec-plan.md` — a separate file is what makes its guard unnecessary
- Code sample:
  ```bash
  # Its own file, never the shared plan. Writing to .claude/plans/{branch}.md
  # would destroy an in-progress feature plan, which the file lock does not
  # prevent: the lock stops concurrent access, not sequential overwriting.
  # A separate file also keeps these plans out of the driver's routing, which
  # probes .claude/plans/{branch}.md.
  PLAN_FILE=".claude/plans/selfheal-${BRANCH}.md"
  ```
- Do not touch: the STANDALONE RULE guard, the detection suite in Step 1, the triage in Step 2, and the subagent execution in Step 4 — only the file path changes. The file lock stays, since two selfhealing runs could still collide.
- ⚠️ Breaking change: a `.claude/plans/selfheal-{branch}.md` left behind by a previous run is no longer picked up by `/ec-execute`'s resume, which only reads `.claude/plans/{branch}.md`. That is the intended outcome: these plans are executed by selfhealing's own Step 4 loop and must not hijack the chain.
- Edge cases: `.claude/plans/` may not exist on a fresh project, so the existing `mkdir -p .claude/plans` must stay; the driver must not see this file, which is why the name is prefixed rather than placed in a subdirectory the router globs
- Acceptance: running selfhealing with an incomplete feature plan present leaves that plan byte-identical
- Verify (local): `grep -c 'plans/selfheal-' commands/ec-selfhealing.md` → `>= 1` (baseline 0) AND `grep -c 'plans/\${BRANCH}.md' commands/ec-selfhealing.md` → `== 0`
- Dependencies: none

**Task 11 — Delete the four retired command files** `S`
- File: `commands/ec-mode.md`, `commands/ec-next.md`, `commands/ec-export.md`, `commands/ec-import.md`
- Reuse: none
- Code sample: `rm -f commands/ec-mode.md commands/ec-next.md commands/ec-export.md commands/ec-import.md` — plain filesystem removal, never `git rm`, per GIT RULES
- Do not touch: `commands/ec-selfhealing.md` and `commands/ec-setup.md`, which the brainstorm explicitly kept; `.claude/memory-export.json`, which stays tracked so the export data survives the commands' removal
- Edge cases: deleting the files does not uninstall them from `~/.claude/commands` on any machine — Task 15's `LEGACY_COMMANDS` entries are what does that, and without them this task leaves four orphans exactly like `ec-design`
- Acceptance: the repository no longer carries the four retired commands
- Verify (local): `ls commands/ec-mode.md commands/ec-next.md commands/ec-export.md commands/ec-import.md 2>/dev/null | wc -l` → `== 0` (baseline 4 files present)
- Dependencies: none

**Task 12 — Strip mode handling from hooks/prompt_submit.py** `S`
- File: `hooks/prompt_submit.py`
- Anchor: `.mode`
- Reuse: the hook's existing silent-fail convention (`.claude/context/conventions.md`: hooks must not crash Claude)
- Code sample: remove the two `.mode` reads and whatever status text they drive, leaving the memory and docs injection untouched
- Do not touch: the memory injection, the docs injection, the relevance floor, and the error swallowing — a hook that raises would break every prompt
- Edge cases: if the mode value feeds a status line, that line is removed rather than left showing a constant; a project with a leftover `.claude/.mode` file is simply ignored, not cleaned up, since hooks must not delete user files
- Acceptance: the prompt hook no longer reads the retired mode file, and prompt injection is otherwise unchanged
- Verify (local): `grep -c 'ec-mode\|\.mode' hooks/prompt_submit.py` → `== 0` (baseline 2) AND `python3 -c "import ast,sys; ast.parse(open('hooks/prompt_submit.py').read())"` → exit 0
- Dependencies: Task 11

**Task 13 — Route the driver through refine and the renamed plan command** `M`
- File: `hooks/session_stop.py`
- Anchor: `def _next_autoflow_command(branch):` at `session_stop.py:209`
- Reuse: the function's existing on-disk probing shape; the `.review-done-{branch}` check at line 212 is the exact pattern the refine sentinel copies
- Code sample:
  ```python
  def _next_autoflow_command(branch):
      """Route from on-disk state. The refine sentinel sits between a written
      plan and execution: without probing it the router would read "plan with
      incomplete tasks" and skip the audit entirely on the auto path."""
      if os.path.exists(os.path.join(".claude", f".review-done-{branch}")):
          return None
      counts = _plan_counts(branch)
      if counts is not None:
          done, todo = counts
          refined = os.path.exists(
              os.path.join(".claude", f".refined-{branch}"))
          if todo > 0:
              return "/ec-execute" if refined else "/ec-refine"
          if done > 0:
              return "/ec-review"
      if os.path.exists(os.path.join(".claude", "decisions", f"{branch}.md")):
          return "/ec-plan"
      ...
          return "/ec-plan"
  ```
  The docstring's reference to `commands/ec-next.md` is dropped, since that file no longer exists; the two `return "/ec-feature"` become `/ec-plan`.
- Do not touch: `_SENTINEL_ORDER` at line 153 and the field-ownership rules, `_plan_counts`, the no-progress tracking, the iteration cap, and the rule that the router never returns `/ec-git`
- Edge cases: a plan with `todo == 0` routes to review regardless of the refine sentinel, because the audit is pointless once the work is done; a decision file with no plan yet routes to `/ec-plan` and the sentinel is irrelevant
- Acceptance: with a plan carrying incomplete tasks and no refine sentinel the driver routes to `/ec-refine`; with the sentinel present it routes to `/ec-execute`
- Verify (local): `grep -c '/ec-feature' hooks/session_stop.py` → `== 0` (baseline 2) AND `grep -c 'refined-' hooks/session_stop.py` → `>= 1` (baseline 0) AND `grep -c '/ec-plan' hooks/session_stop.py` → `>= 2` AND `python3 -c "import ast; ast.parse(open('hooks/session_stop.py').read())"` → exit 0
- Dependencies: Task 2

**Task 14 — Update install.sh COMMANDS to the eight-command surface** `S`
- File: `install.sh`
- Anchor: `COMMANDS=("ec-setup" "ec-feature" "ec-brainstorm" "ec-execute" "ec-review" "ec-git" "ec-export" "ec-import" "ec-mode" "ec-next" "ec-selfhealing")` at `install.sh:14`
- Reuse: the existing install loop, unchanged — only the array contents change
- Code sample:
  ```bash
  COMMANDS=("ec-setup" "ec-brainstorm" "ec-plan" "ec-refine" "ec-execute" "ec-review" "ec-git" "ec-selfhealing")
  ```
- Do not touch: the `AGENTS`, `SERVER_FILES` and `HOOK_FILES` arrays, `fetch_file`, and the `fail`/`step` helpers added last cycle
- Edge cases: the array order is the order the installer prints, so it is written in chain order to read as the workflow; `doctor.rs` must carry the identical list, which Task 18 does
- Acceptance: a fresh install places exactly the eight commands of the new surface
- Verify (local): `grep '^COMMANDS=(' install.sh | grep -c 'ec-plan'` → `== 1` AND `grep '^COMMANDS=(' install.sh | grep -c 'ec-refine'` → `== 1` AND `grep '^COMMANDS=(' install.sh | grep -c 'ec-feature\|ec-mode\|ec-next\|ec-export\|ec-import'` → `== 0` (scoped to the COMMANDS line, NOT the whole file: Task 15 deliberately adds all five of those names to LEGACY_COMMANDS, so a file-wide count would be invalidated by the very next task)
- Dependencies: Task 1, Task 2, Task 11

**Task 15 — Add retired commands to install.sh LEGACY_COMMANDS** `S`
- File: `install.sh`
- Anchor: `LEGACY_COMMANDS=("setup" "feature" "brainstorm" "execute" "review" "git" "design")` at `install.sh:88`
- Reuse: the existing removal loop immediately below the array, which already builds `${COMMANDS_DIR}/${cmd}.md` and reports each removal
- Code sample:
  ```bash
  # Both the unprefixed originals and the ec- prefixed commands this release
  # retires. The list previously removed "design" but not "ec-design", which is
  # why an orphaned ec-design.md is still installed on machines upgraded since.
  LEGACY_COMMANDS=("setup" "feature" "brainstorm" "execute" "review" "git" "design" \
                   "ec-feature" "ec-design" "ec-mode" "ec-next" "ec-export" "ec-import")
  ```
- Do not touch: the removal loop itself and its `${COMMANDS_DIR:?}` / `${cmd:?}` guards, which exist to make an unset variable fail rather than expand to a dangerous path
- Edge cases: the loop only removes files that exist, so listing a command never installed on this machine is a silent no-op; `ec-feature` must be listed even though the install loop no longer writes it, because every previously upgraded machine still has it
- Acceptance: running the installer on a machine that has the old surface leaves only the eight current commands in `~/.claude/commands`
- Verify (local): `sed -n '/^LEGACY_COMMANDS=(/,/)$/p' install.sh | grep -c '"ec-feature"'` → `== 1` AND `sed -n '/^LEGACY_COMMANDS=(/,/)$/p' install.sh | grep -c '"ec-design"'` → `== 1` (both scoped to the array: this task's own explanatory comment quotes `"ec-design"` to describe the omission it fixes, so a file-wide count could only reach 1 by deleting that comment)
- Dependencies: Task 14

**Task 16 — Add Refine and rename Feature to Plan in studio plan.rs** `M`
- File: `studio/src-tauri/src/plan.rs`
- Anchor: `pub enum Stage {` at `plan.rs:35`
- Reuse: `derive_stage`'s existing precedence-by-file-probe structure at `plan.rs:75`, extended with one more probe
- Code sample:
  ```rust
  pub enum Stage {
      Idle,
      Brainstorm,
      Plan,
      Refine,
      Execute,
      Review,
  }

  fn stage_from_name(name: &str) -> Option<Stage> {
      match name {
          "brainstorm" => Some(Stage::Brainstorm),
          "plan" => Some(Stage::Plan),
          "refine" => Some(Stage::Refine),
          "execute" => Some(Stage::Execute),
          "review" => Some(Stage::Review),
          _ => None,
      }
  }
  ```
  and in `derive_stage`, a plan with incomplete tasks reports `Refine` when `.claude/.refined-{branch}` is absent and `Execute` when it is present, mirroring the driver so the panel and the chain never disagree.
- Do not touch: `parse_tasks` and its deliberate rejection of `- [X]` (the driver is equally strict and the two must agree), `parse_autoflow`, `AUTOFLOW_MAX_AGE`, `current_branch`, and the history parsing
- Edge cases: an old sentinel carrying `stage=feature` now matches no arm and yields `None`, which `derive_stage` already handles by falling through to the file-based derivation — correct, since the file state is authoritative; `Idle` stays outside the rail
- Acceptance: Studio's stage derivation knows the five-stage chain and distinguishes an unaudited plan from an audited one
- Verify (local): `grep -c 'Stage::Refine' studio/src-tauri/src/plan.rs` → `>= 1` (baseline 0) AND `grep -c 'Stage::Plan' studio/src-tauri/src/plan.rs` → `>= 1` (baseline 0) AND `grep -c 'Stage::Feature' studio/src-tauri/src/plan.rs` → `== 0`
- Dependencies: Task 13

**Task 17 — Add Refine and rename Feature to Plan in studio types.ts** `S` [agent: ec-typescript]
- File: `studio/src/lib/types.ts`
- Anchor: `export type Stage = 'Idle' | 'Brainstorm' | 'Feature' | 'Execute' | 'Review';` at `types.ts:1`
- Reuse: `stage-rail.tsx:23-29` renders `STAGES.map`, so a five-entry array renders five dots with no component change — the rail is not edited
- Code sample:
  ```ts
  export type Stage = 'Idle' | 'Brainstorm' | 'Plan' | 'Refine' | 'Execute' | 'Review';

  /** The five dots of the stage rail, in workflow order. `Idle` is not one of them. */
  export const STAGES: Stage[] = ['Brainstorm', 'Plan', 'Refine', 'Execute', 'Review'];
  ```
- Do not touch: `stage-rail.tsx` — its `dotClass` and `STAGES.map` already generalise; editing it would be the defect, not the fix
- Edge cases: the literals must match `plan.rs`'s serde output exactly, or a stage renders as unknown and the rail shows nothing ringed; the existing comment says "four-dot" and must be corrected to five
- Acceptance: the sidebar, header and history rails all render five dots in chain order, with no change to the rail component
- Verify (local): `grep -c "'Refine'" studio/src/lib/types.ts` → `== 2` (the union member and the STAGES entry; baseline 0) AND `grep -c "'Feature'" studio/src/lib/types.ts` → `== 0`
- Dependencies: Task 16

**Task 18 — Update studio doctor.rs for eight commands and agent checking** `M`
- File: `studio/src-tauri/src/doctor.rs`
- Anchor: `const COMMANDS: [&str; 11] = [` at `doctor.rs:11`
- Reuse: `worker_ok` at `doctor.rs:34-55` as the model for a check that reports rather than blocks; the existing `commands_dir()` helper
- Code sample:
  ```rust
  /// The 8 commands install.sh:14 installs, copied from there rather than
  /// invented here — a list that drifts would call a complete install broken.
  const COMMANDS: [&str; 8] = [
      "ec-setup", "ec-brainstorm", "ec-plan", "ec-refine",
      "ec-execute", "ec-review", "ec-git", "ec-selfhealing",
  ];

  /// The 32 agents install.sh:15 installs. Checked but never blocking: a
  /// missing agent degrades /ec-execute to a warning, it does not stop work.
  const AGENTS: [&str; 32] = [ /* copied verbatim from install.sh:15 */ ];

  fn agents_dir() -> PathBuf {
      PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".claude/agents")
  }
  ```
  `Doctor` gains `agents_found` and `agents_expected`, filled the same way `commands_found` is.
- Do not touch: `worker_ok` and its `PROBE_TIMEOUT`, the hand-rolled GET and its recorded justification, and the rule that `run_doctor` never returns `Err`
- Edge cases: the agent list must be copied from `install.sh:15` rather than retyped, since a drifting list reports a healthy install as broken — the same reason recorded for the commands list at `doctor.rs:8-10`
- Acceptance: the doctor reports how many of the 32 agents are installed, and a shortfall does not prevent the app from opening
- Verify (local): `grep -c 'const AGENTS' studio/src-tauri/src/doctor.rs` → `== 1` (baseline 0) AND `grep -c 'const COMMANDS: \[&str; 8\]' studio/src-tauri/src/doctor.rs` → `== 1` AND `grep -c '"ec-feature"' studio/src-tauri/src/doctor.rs` → `== 0`
- Verify (global): `cd studio && cargo check --manifest-path src-tauri/Cargo.toml` → exit 0. Rust module boundary; baseline recorded exit 0.
- Dependencies: Task 14, Task 16

**Task 19 — Add agent fields to the Doctor type in studio types.ts** `S` [agent: ec-typescript]
- File: `studio/src/lib/types.ts`
- Anchor: `export interface Doctor {` at `types.ts:57`
- Reuse: `doctorBlocking` at `types.ts:65-67` and its recorded rule that only the first two rows gate the shell
- Code sample:
  ```ts
  export interface Doctor {
    claude: string | null;
    commandsFound: number;
    commandsExpected: number;
    agentsFound: number;
    agentsExpected: number;
    workerOk: boolean;
  }
  ```
  `doctorBlocking` is left exactly as it is: agents are advisory, so they must not appear in it.
- Do not touch: `doctorBlocking`'s body — adding agents to it would turn a degraded install into a locked-out app, which is the opposite of the intent
- Edge cases: the field names must match `doctor.rs`'s camelCase serde output, or they arrive as `undefined` and render as `NaN/NaN`
- Acceptance: the frontend can report agent coverage, and a missing agent still does not block the shell
- Verify (local): `grep -c 'agentsFound' studio/src/lib/types.ts` → `== 1` (baseline 0) AND `sed -n '/export function doctorBlocking/,/^}/p' studio/src/lib/types.ts | grep -c 'agentsFound'` → `== 0` (proves agents stayed out of the blocking condition)
- Dependencies: Task 18

**Task 20 — Render the agents row in doctor-screen.tsx** `S` [agent: ec-react]
- File: `studio/src/components/doctor-screen.tsx`
- Anchor: `detail={doctor.workerOk ? 'online' : 'offline, memory unavailable'}` at `doctor-screen.tsx:118`
- Reuse: the `Check` sub-component and its `optional` prop, which already styles the worker row as advisory — the agents row uses the same prop and needs no new component
- Code sample:
  ```tsx
  <Check
    ok={doctor.agentsFound >= doctor.agentsExpected}
    label="EffiClaude agents"
    optional
    detail={`${doctor.agentsFound}/${doctor.agentsExpected} in ~/.claude/agents`}
  />
  ```
  placed between the commands row and the worker row, matching install order.
- Do not touch: the install pane, the `onPtyExit` auto-recheck effect, the ref-held callbacks, and the claude-path override form — all shipped last cycle and unrelated
- Edge cases: the row carries `optional` so it renders muted like the worker row and never implies the app is broken; no em dash in the detail copy, since that is an anti-slop hard gate
- Acceptance: the doctor screen shows agent coverage as a third advisory row, and a shortfall leaves Continue available
- Verify (local): `grep -c 'agentsFound' studio/src/components/doctor-screen.tsx` → `>= 1` (baseline 0; `>=` because the row reads the field in both its `ok=` condition and its `detail=` string, a count the implementation decides) AND `grep -c 'EffiClaude agents' studio/src/components/doctor-screen.tsx` → `== 1`
- Verify (global): `cd studio && npm run build` → exit 0. Frontend module boundary; baseline recorded exit 0.
- Dependencies: Task 19

**Task 21 — Update tests/test_command_docs.py for the new surface** `M` [agent: ec-python]
- File: `tests/test_command_docs.py`
- Anchor: `AUTOFLOW_COMMANDS = ['ec-brainstorm.md', 'ec-feature.md',` at `test_command_docs.py:292`
- Reuse: the file's existing `read_command` helper and parametrize style
- Code sample: the command list at line 34 becomes `['/ec-setup', '/ec-brainstorm', '/ec-plan', '/ec-refine', ...]`; `AUTOFLOW_COMMANDS` replaces `ec-feature.md` with `ec-plan.md` and adds `ec-refine.md`; add two regression tests —
  ```python
  def test_no_command_references_a_retired_command():
      """ec-design proved a rename without a reference sweep leaves debris."""
      retired = ['/ec-mode', '/ec-next', '/ec-export', '/ec-import', '/ec-feature']

  def test_legacy_commands_covers_every_retired_command():
      """install.sh:88 removed "design" but not "ec-design", which is exactly
      how an orphan survived every upgrade."""
  ```
- Do not touch: `FRONTEND_AGENTS` at line 105 and the agent-file assertions — the 32 agents are unchanged this cycle
- Edge cases: the retired-reference test must scan `commands/`, `hooks/`, `README.md` and `CLAUDE.md` — and explicitly NOT `tests/`, because the retired names appear there as fixture data, including inside this very test, so a repo-wide sweep would fail on its own input
- Acceptance: the suite fails if any file references a retired command, and fails if `LEGACY_COMMANDS` omits one
- Verify (local): `grep -c 'ec-refine' tests/test_command_docs.py` → `>= 1` (baseline 0) AND `grep -c "'ec-feature.md'" tests/test_command_docs.py` → `== 0`
- Dependencies: Task 9, Task 11, Task 15

**Task 22 — Update tests/test_hooks.py and add refine routing tests** `M` [agent: ec-python]
- File: `tests/test_hooks.py`
- Anchor: `from session_stop import _next_autoflow_command` at `test_hooks.py:205`
- Reuse: the existing import and whatever tmp-directory fixture the surrounding tests use for on-disk state
- Code sample: the existing assertion keeps holding (the router never returns `/ec-git`); add —
  ```python
  def test_unrefined_plan_routes_to_refine():
      """A plan with work left and no .refined- sentinel must not reach execute:
      the driver routes from disk, so without this probe the audit is skipped
      entirely on the auto path."""

  def test_refined_plan_routes_to_execute():

  def test_completed_plan_routes_to_review_even_without_refine_sentinel():
      """Auditing a finished plan is pointless, so the sentinel is irrelevant here."""
  ```
- Do not touch: the sentinel field-ownership tests, the no-progress and iteration-cap tests, and the assertion that the router never returns `/ec-git`
- Edge cases: the three new tests must create real files in a temp directory rather than mocking `os.path.exists`, because the behaviour under test is precisely that routing reads disk
- Acceptance: the suite proves the driver routes an unaudited plan to refine, an audited one to execute, and a finished one to review
- Verify (local): `grep -c 'refined-' tests/test_hooks.py` → `>= 1` (baseline 0) AND `grep -c '/ec-feature' tests/test_hooks.py` → `== 0` (baseline 1)
- Verify (global): `python3 -m pytest tests/ -q` → all pass. This is the definitive suite gate; the baseline recorded 195 passed, and the count rises by the tests added in Tasks 21 and 22.
- Dependencies: Task 13, Task 21
