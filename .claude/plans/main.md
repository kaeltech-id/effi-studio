## Feature: Proof Mode — pisahkan "mengubah" dari "membuktikan" di plan/refine/execute

### Impact Analysis
- Files affected: `commands/ec-brainstorm.md`, `commands/ec-plan.md`, `commands/ec-refine.md`, `commands/ec-execute.md`, `commands/ec-review.md`, `tests/test_command_docs.py`
- ⚠️ Breaking change risk: `tests/test_command_docs.py:385` asserts the Step 4 checklist has exactly 21 items; adding mode rules changes that count and the assertion must move with it. No other existing assertion breaks, because this cycle is additive — nothing is deleted from the command docs.

### Reusable Existing Code
- `commands/ec-plan.md:3-20` — the existing Step 0 block already reads the decision file and notes branch/AUTO state; the Proof Mode read is appended there rather than given its own step
- `commands/ec-plan.md:346` — the existing `**Exception-only fields.**` convention already expresses "this field is written only when it differs from the default"; Proof Mode reuses that same vocabulary instead of inventing a second one
- `commands/ec-brainstorm.md:222` — the decision template's section order is the insertion point; `## Proof Mode` lands immediately before `## Key Assumptions`
- `tests/test_command_docs.py` `read_command()` helper and class-docstring style — the new guards follow it exactly
- `commands/ec-execute.md:171,217` — Acceptance injection is already conditional ("if the task has no such line, inject nothing"), so a handoff-mode plan that omits Acceptance needs no executor change

### Grounding
Measured 2026-10-30 — real command output only.
- `wc -l`: `commands/ec-brainstorm.md` → 300 · `commands/ec-plan.md` → 432 · `commands/ec-refine.md` → 145 · `commands/ec-execute.md` → 319 · `commands/ec-review.md` → 317 · `tests/test_command_docs.py` → 601
- Baseline test result: `python3 -m pytest -q` → `238 passed, 1 warning in 4.29s`; `python3 -m pytest tests/test_command_docs.py -q` → `110 passed in 0.07s`
- Baseline string counts:
  - `grep -rc "Proof Mode" commands/` → `0` in every file
  - `grep -c -F "## Handoff" commands/ec-plan.md` → `0`
  - `grep -c -F "Write failing test" commands/ec-plan.md` → `1`
  - `grep -c -F "Verify (global)" commands/ec-plan.md` → `1`
  - task template field count (lines matching `^- [A-Za-z⚠]` inside the `**Task 1 — {name}**` block) → `12`
  - Step 4 checklist items (`^- \[ \]` between Step 4 and Step 5 headers) → `21`
- Verified anchors:
  - `## Key Assumptions` → `commands/ec-brainstorm.md:222`
  - `## Step 0 — Load Context & Memory` → `commands/ec-plan.md:3`
  - `## Step 2.5 — Grounding Pass (mandatory)` → `commands/ec-plan.md:222`
  - `- "Write failing test for {behavior}"` → `commands/ec-plan.md:256`
  - `- Baseline string counts:` → `commands/ec-plan.md:309`
  - `**Task 1 — {name}** \`S/M/L\`` → `commands/ec-plan.md:322`
  - `- Verify (global): {omit on most tasks` → `commands/ec-plan.md:332`
  - `- [ ] Every task that calls an API names its error-handling approach` → `commands/ec-plan.md` checklist tail
  - `**Branch detection:** Run:` → `commands/ec-refine.md:3`
  - `## Step 1 — Dry-run every Verify (local)` → `commands/ec-refine.md:55`
  - `## Step 2 — Pre-flight Check` → `commands/ec-execute.md:92`
  - `### Timeout Rule` → `commands/ec-execute.md:241`
  - `### Definitive global gate` → `commands/ec-review.md:183`
  - `Ask: "Add unit tests for this feature? (y/n):"` → `commands/ec-review.md:204`
  - `assert len(items) == 21` → `tests/test_command_docs.py:385`
  - `**Check for brainstorm decision:** If \`{DECISION_FILE}\` exists, read it silently.` → `commands/ec-plan.md:56`
  - `### Task Granularity Rules` → `commands/ec-plan.md:252`
  - `**Exception-only fields.**` → `commands/ec-plan.md:340`
  - `### Per Task Detail` → `commands/ec-plan.md:321`
  - `- [ ] Every task that calls an API names its error-handling approach` → `commands/ec-plan.md:385`
  - `# --- Exception-only fields + verify split in ec-plan.md ---` → `tests/test_command_docs.py:356`
  - `pytest` already imported at `tests/test_command_docs.py:3`, so Task 13's `@pytest.mark.parametrize` needs no new import
- Existing assertions that constrain this design (all must keep passing):
  - `tests/test_command_docs.py:261-263` requires `- Anchor:`, `- Do not touch:`, `- Acceptance:`, `- Rollback:` present in `ec-plan.md`
  - `tests/test_command_docs.py:266-268` requires `Traceability rule` and `traces to a baseline` present in `ec-plan.md`
  - `tests/test_command_docs.py:371-372` requires `- Verify (local):` and `- Verify (global):` present in `ec-plan.md`
  - `tests/test_command_docs.py:252-253` requires `## Step 2.5 — Grounding Pass` and `### Grounding` present in `ec-plan.md`
  - These are why the approach is mode-conditional rather than subtractive.

### Tasks
- [x] Task 1: Add Proof Mode to the decision template [S] — new `## Proof Mode` section in `commands/ec-brainstorm.md`
- [x] Task 2: Read Proof Mode in ec-plan Step 0 [S] — resolve mode, default `handoff` when absent
- [x] Task 3: State the deliverable rule and the proof rule [M] — two separate rules, deliverable first, with the allowed static-check list
- [x] Task 4: Replace the test-authoring granularity example [S] — drop the line that steers plans toward writing tests
- [x] Task 5: Mark task template fields by mode [M] — six required on `handoff`, the rest `in-cycle` or exception-only
- [x] Task 6: Add the Handoff block to the plan template [M] — where moved proof steps land
- [x] Task 7: Scope the Grounding Pass by mode [M] — slim pass on `handoff`, full baseline pass on `in-cycle`
- [x] Task 8: Add the new self-review checklist items [S] — keep the checklist authoritative
- [x] Task 9: Teach ec-refine the mode and the proof-verb rejection [M] — mechanical enforcement, not prose
- [x] Task 10: Teach ec-execute the mode, pre-flight abort, and outward-facing confirmation [M] — server work is a task, but never silent
- [x] Task 11: Scope the ec-review unit-test gate and global gate by mode [M] — stop asking for tests a handoff cycle declined
- [x] Task 12: Update the checklist-count assertion [S] — move it to the new exact count
- [x] Task 13: Add Proof Mode guard tests [M] [agent: ec-python] — lock every rule this cycle introduces

### Per Task Detail

**Task 1 — Add Proof Mode to the decision template** `S`
- File: `commands/ec-brainstorm.md`
- Anchor: `## Key Assumptions` → `commands/ec-brainstorm.md:222`
- Reuse: the template's existing section style — `##` heading, one italic `_..._` explainer line, then bullets
- Code sample: insert immediately before the anchor
  ```markdown
  ## Proof Mode
  _Who proves this cycle works. Omit the section and `/ec-plan` reads it as `handoff`._
  - `handoff` (default) — the cycle makes the change; you run, launch and verify it afterwards
  - `in-cycle` — the cycle also builds, launches and proves it, because the artifact or the running system IS the deliverable

  Mode: {handoff | in-cycle}
  ```
- Do not touch: the `## Design Contract` and `## Design Direction` sections above the anchor, and their mutual-exclusivity note; `## Key Assumptions` itself and every section after it
- Edge cases: a decision file written before this section existed is valid input — the absence of the section means `handoff`, which Task 2 implements; the template edge-case list already says old decision files are never rewritten
- Acceptance: the decision template offers Proof Mode as a declared section with `handoff` named as the default
- Verify (local): `grep -c -F '## Proof Mode' commands/ec-brainstorm.md` → `== 1` (baseline: `0` across all of `commands/`)
- Dependencies: none

**Task 2 — Read Proof Mode in ec-plan Step 0** `S`
- File: `commands/ec-plan.md`
- Anchor: `**Check for brainstorm decision:** If `{DECISION_FILE}` exists, read it silently.`
- Reuse: the surrounding decision-reading block, which already parses `## Design Contract` / `## Design Direction` out of the same file
- Code sample: append to that block's bullet list
  ```markdown
  - Parse `## Proof Mode` from the decision. If the section is absent, or names no mode, treat it as `handoff`.
    Note: "(proof mode: {MODE})". `PROOF_MODE` governs Step 2.5, the task template, and the Handoff block below.
  ```
- Do not touch: the Design Contract and Design Direction parsing rules in the same block; the expiry check; the saved-brainstorms fallback
- Edge cases: decision absent entirely (the saved-brainstorms path) → `handoff`; both mode words present → the first one wins and the note records it
- Acceptance: `/ec-plan` resolves a mode for every run, including runs with no decision file
- Verify (local): `grep -c -F 'proof mode:' commands/ec-plan.md` → `== 1` (baseline: `0`)
- Dependencies: none

**Task 3 — State the deliverable rule and the proof rule** `M`
- File: `commands/ec-plan.md`
- Anchor: `### Task Granularity Rules`
- Reuse: the existing `**Honest dependencies.**` / `**Two kinds of verification.**` bolded-rule format in the same document
- Code sample: insert before the anchor
  ```markdown
  ### What belongs in a task — deliverable first

  **Deliverable rule (applies in every mode).** Whatever the cycle was asked to
  produce is always a task, whatever its medium and however long it takes —
  writing code, editing config, running a migration, or entering a server to
  change its state. This rule is stated first and is never overridden: the mode
  below never judges whether work is "code".

  **Proof rule (`handoff` mode only).** A step whose only job is to prove the
  change works must not spend wall-clock inside the cycle. Building an artifact
  so it can be inspected, launching an app or a browser to look at it, bundling,
  compiling Rust, or running a suite to feel sure — all move to `## Handoff`.
  The one exception is a static check that finishes in about two seconds, which
  stays as `Verify (local)`. The allowed static checks are exactly:
  `grep`, `grep -c`, `test -f`, `test -x`, `bash -n`, `python3 -m json.tool`,
  `python3 -I -c` on a parse, and `tsc --noEmit`. Anything not on that list is a
  Handoff step, not a verify. Measured on this repo: 16 such checks cost 0.04s
  in total, `tsc` 2.19s, `cargo check` 35.97s, a universal DMG build 122s —
  which is where the line was drawn.

  In `in-cycle` mode the proof rule does not apply, because there the artifact or
  the running system is itself the deliverable and the deliverable rule covers it.
  ```
- Do not touch: `### Task Granularity Rules` itself and the `### Flat Format Rules` block after it
- Edge cases: a cycle whose deliverable genuinely is a build (the DMG release) declares `in-cycle` and is unaffected; a server-deploy cycle stays in `handoff` because the deploy is a deliverable, not a proof
- Acceptance: a reader can tell which of two rules applies to any step, and the deliverable rule is unambiguous that non-code work qualifies
- Verify (local): `grep -c -F 'Deliverable rule (applies in every mode)' commands/ec-plan.md` → `== 1` and `grep -c -F 'Proof rule (`handoff` mode only)' commands/ec-plan.md` → `== 1` (baseline: `0` for both)
- Dependencies: Task 2 (the rules reference `PROOF_MODE`, which Task 2 defines)

**Task 4 — Replace the test-authoring granularity example** `S`
- File: `commands/ec-plan.md`
- Anchor: `- "Write failing test for {behavior}"` → `commands/ec-plan.md:256`
- Code sample: replace that single line with
  ```markdown
  - "Add {field} to {type} in {file}"
  ```
- Do not touch: the three sibling example lines around it (`Create {ComponentName}`, `Add {endpoint} call`, `Handle loading state`); the granularity sentence above them
- Edge cases: `in-cycle` cycles may still plan test tasks — nothing forbids them, the example simply no longer steers every plan toward one
- Acceptance: the granularity examples no longer present writing a test as the canonical first task
- Verify (local): `grep -c -F 'Write failing test' commands/ec-plan.md` → `== 0` (baseline: `1` at line 256)
- Dependencies: none

**Task 5 — Mark task template fields by mode** `M`
- File: `commands/ec-plan.md`
- Anchor: `**Task 1 — {name}** \`S/M/L\`` → `commands/ec-plan.md:322`
- Reuse: the `**Exception-only fields.**` paragraph already in this document — the new note uses the same vocabulary rather than a second concept
- Code sample: leave all twelve field lines in place and add, after the `**Exception-only fields.**` paragraph
  ```markdown
  **Fields by proof mode.** On `handoff`, a task carries exactly six lines:
  `File`, `Anchor`, `Code sample`, `Do not touch`, `Verify (local)`,
  `Dependencies`. `Reuse` and `Edge cases` fold into `Code sample`; `Acceptance`
  folds into `Verify (local)`; `Verify (global)` is omitted entirely. `Anchor`
  and `Do not touch` are never dropped — they are what makes `/ec-execute`'s
  concurrent waves provably safe. `⚠️ Breaking change` and `Rollback` stay
  exception-only exactly as above. On `in-cycle`, every field documented above
  applies as written.
  ```
- Do not touch: all twelve existing field lines — `tests/test_command_docs.py:261-263` and `:371-372` require `- Anchor:`, `- Do not touch:`, `- Acceptance:`, `- Rollback:`, `- Verify (local):` and `- Verify (global):` to stay present in this file, each at `grep -c` of at least 1; also the `**Honest dependencies.**` and `**Two kinds of verification.**` paragraphs
- Edge cases: a handoff plan that still writes `Acceptance` is not an error, just verbose — the rule names the required six, it does not forbid extras
- Acceptance: a handoff-mode plan is specified to carry six field lines per task while the document still documents all twelve
- Verify (local): `grep -c -F '**Fields by proof mode.**' commands/ec-plan.md` → `== 1` (baseline: `0`)
- Dependencies: Task 2 (references the resolved mode)

**Task 6 — Add the Handoff block to the plan template** `M`
- File: `commands/ec-plan.md`
- Anchor: `### Per Task Detail`
- Reuse: the plan template's existing `###` section style and fenced-block layout
- Code sample: add to the plan template, after the `### Tasks` list section and before `### Per Task Detail`
  ```markdown
  ### Handoff
  _Written on `handoff` mode. The proof steps this plan deliberately does not run,
  as commands you can paste. Omit the section only when there are none._
  - {what it proves} → `{exact command}`   (e.g. "DMG is universal and mounts" → `cd studio && npm run build:dmg`)
  - {what to open} → {exact URL or app}    (e.g. "the new settings pane" → launch Effi Studio, Settings tab)
  ```
- Do not touch: `### Tasks`, `### Per Task Detail`, `### Grounding`, `### Impact Analysis` and the Design sections of the same template
- Edge cases: a cycle with no proof steps at all (pure doc edit) omits the section; `in-cycle` mode omits it because the cycle runs those steps itself
- Acceptance: a handoff plan ends with the exact commands the user needs, so nothing is lost by not running them
- Verify (local): `grep -c '^### Handoff$' commands/ec-plan.md` → `== 1` (baseline: `0`). Anchored to the heading at line start because Task 8's checklist items mention `### Handoff` in prose, which the plan's own Count stability rule says to anchor around rather than count loosely.
- Dependencies: Task 2 (the section is mode-gated)

**Task 7 — Scope the Grounding Pass by mode** `M`
- File: `commands/ec-plan.md`
- Anchor: `## Step 2.5 — Grounding Pass (mandatory)` → `commands/ec-plan.md:222`
- Reuse: the existing batched-probe script pattern in the same step — the slim pass is the same script with fewer probe lines
- Code sample: insert directly after the anchor line
  ```markdown
  **Scope by proof mode.** On `handoff`, the pass records only what stays
  checkable in milliseconds: the line count of each file a task touches, the
  exact `Anchor` string with its line number, and `test -f` for every file a
  task claims is new. Baseline string counts and the test baseline are skipped,
  because `handoff` produces no numeric thresholds for them to feed — which also
  means the traceability rule below has nothing to apply to. On `in-cycle` the
  full pass runs exactly as specified, baselines included.
  ```
- Do not touch: the `**Traceability rule:**` and `**Count stability rule.**` paragraphs — `tests/test_command_docs.py:266-268` requires the strings `Traceability rule` and `traces to a baseline` to stay present at `grep -c` of at least 1; also the read-only constraint sentence (`:256-258`) and the `## Step 2.5 — Grounding Pass` and `### Grounding` headings (`:252-253`)
- Edge cases: a handoff task that genuinely needs a count (say a `grep -c` verify) records that one baseline rather than all of them — the rule skips baselines nothing needs, it does not forbid one that is needed
- Acceptance: a handoff-mode grounding pass is specified as anchors plus new-file checks, and the traceability rule is explicitly scoped so it is not silently violated
- Verify (local): `grep -c -F '**Scope by proof mode.**' commands/ec-plan.md` → `== 1` (baseline: `0`)
- Dependencies: Task 2 (references the resolved mode)

**Task 8 — Add the new self-review checklist items** `S`
- File: `commands/ec-plan.md`
- Anchor: `- [ ] Every task that calls an API names its error-handling approach — reused existing handler, or a new handler to create`
- Reuse: the checklist's existing `- [ ]` one-line-per-rule format
- Code sample: append after the anchor
  ```markdown
  - [ ] Proof mode is resolved and noted, defaulting to `handoff` when the decision does not say
  - [ ] On `handoff`, no task builds, launches, serves, bundles, compiles Rust, or runs a suite — those are in `### Handoff`
  - [ ] On `handoff`, every `Verify (local)` is one of the allowed static checks
  - [ ] On `handoff`, `### Handoff` lists every proof step the plan chose not to run, or is omitted because there are none
  ```
- Do not touch: the 21 existing checklist items; `Fix any issues found, then present the plan.` after the list
- Edge cases: `tests/test_command_docs.py:385` pins the count at 21 and will fail until Task 12 updates it — that is the intended ordering, not a defect
- Acceptance: the checklist carries the new rules, so a plan violating them fails self-review rather than reaching `/ec-refine`
- Verify (local): `sed -n '/^## Step 4 — Self-Review/,/^## Step 5/p' commands/ec-plan.md | grep -c '^- \[ \]'` → `== 25` (baseline: `21`)
- Dependencies: Task 3 (the items reference the rules it defines), Task 6 (they reference `### Handoff`)

**Task 9 — Teach ec-refine the mode and the proof-verb rejection** `M`
- File: `commands/ec-refine.md`
- Anchor: `## Step 1 — Dry-run every Verify (local)` → `commands/ec-refine.md:55`
- Reuse: the existing verdict-table format in the same step, and the `UNVERIFIABLE` verdict already defined there
- Code sample: insert before the anchor
  ```markdown
  ## Step 0.9 — Proof mode and the proof-verb gate
  Read `## Proof Mode` from `{DECISION_FILE}`; absent means `handoff`. Note
  "(proof mode: {MODE})".

  On `handoff`, every `Verify (local)` must be one of the allowed static checks
  named in `/ec-plan`'s proof rule. Scan the plan and report a **DEFECT** for any
  task whose `Verify (local)` invokes a wall-clock proof step — matching any of
  `npm run build`, `npm run tauri`, `cargo build`, `cargo check`, `cargo test`,
  `pytest`, `vite build`, `hdiutil`, `docker build`, `playwright`, `cypress`,
  `curl` against a running server, or a launch of the app. Name the task and say
  the step belongs in `### Handoff`. This is the mechanical half of the proof
  rule: without it the rule is prose a plan can quietly ignore.

  On `handoff`, skip the baseline-traceability comparison in Step 2 — there are
  no recorded baselines to compare against. The anchor checks, the new-file
  checks, the dependency-edge check and the plan lint all still run; they are
  static and cost nothing.
  ```
- Do not touch: Step 1's verdict table, Step 3 anchors, Step 4 new-file absence, Step 4.5 dependency edges, Step 5's gate and sentinel handling
- Edge cases: `in-cycle` mode runs every existing step unchanged; a plan with no `Verify (local)` at all is still audited for anchors and dependency edges
- Acceptance: a handoff plan that smuggles in a build step fails `/ec-refine` by machine, not by reviewer judgement
- Verify (local): `grep -c -F 'proof-verb gate' commands/ec-refine.md` → `== 1` (baseline: `0`)
- Dependencies: Task 3 (the gate enforces the rule Task 3 writes)

**Task 10 — Teach ec-execute the mode, pre-flight abort, and outward-facing confirmation** `M`
- File: `commands/ec-execute.md`
- Anchor: `## Step 2 — Pre-flight Check` → `commands/ec-execute.md:92`
- Reuse: the pre-flight list's existing bullet format and its established "report it and ask / abort on AUTO" behaviour
- Code sample: append two bullets to the pre-flight list and a rule after it
  ```markdown
  - Proof mode resolved from `{DECISION_FILE}` (absent means `handoff`), noted as "(proof mode: {MODE})"
  - On `handoff`, no task's `Verify (local)` is a wall-clock proof step. One is a pre-flight failure: the step belongs in the plan's `### Handoff`, not in a task.

  **Outward-facing tasks always confirm.** The deliverable rule makes server
  work, deploys, migrations and release publication legitimate tasks. It does
  not make them silent. Before executing a task that changes state outside this
  working tree — SSH or remote shell, a deploy, a production migration, a
  package or release publish, a DNS or infrastructure change — stop and ask the
  user, naming the exact command and the target. Ask even when `AUTO=yes`:
  auto-flow confirms plan gates, never outward-facing effects. Git stays
  excluded entirely under `CLAUDE.md` GIT RULES.
  ```
- Do not touch: `### Execution units — co-location fusion`, `### Wave scheduling`, `### Anchor Discipline`, the Evidence Rule, `### Timeout Rule`, and the auto-flow sentinel handling
- Edge cases: a task that is outward-facing but read-only (listing remote state) needs no confirmation; a denied confirmation is a task failure routed through the existing Error Recovery path
- Acceptance: server and deploy work can be planned as tasks, and `/ec-execute` never performs one without asking first
- Verify (local): `grep -c -F 'Outward-facing tasks always confirm' commands/ec-execute.md` → `== 1` and `grep -c -F 'proof mode:' commands/ec-execute.md` → `>= 1` (baselines: `0` and `0`)
- Dependencies: Task 3 (references the proof rule and the deliverable rule by name)

**Task 11 — Scope the ec-review unit-test gate and global gate by mode** `M`
- File: `commands/ec-review.md`
- Anchor: `Ask: "Add unit tests for this feature? (y/n):"` → `commands/ec-review.md:204`
- Reuse: the conditional-gate style already used by this document's Design/Anti-slop gates ("Skip this gate entirely when...")
- Code sample: wrap the anchor's gate and amend the definitive global gate
  ```markdown
  On `handoff` proof mode, skip this gate entirely — the cycle declared that
  proving the change is the user's step, and asking for tests here contradicts it.
  Ask only on `in-cycle`.
  ```
  and in `### Definitive global gate`, add
  ```markdown
  On `handoff`, this gate runs static checks only — type-check, lint, syntax
  parse, and an existing fast suite — and never produces a distributable
  artifact or launches the app. Anything heavier is listed in the plan's
  `### Handoff` for the user. On `in-cycle` the gate runs in full as specified.
  ```
- Do not touch: Stage 1 spec compliance, the evidence audit, the scope-boundary check, Step 4's teardown and sentinel handling, Step 5's review-summary template; the two concurrent reviewer gates stay as they are
- Edge cases: a project with no fast suite skips that part cleanly, as the existing gate already allows; `in-cycle` behaviour is unchanged
- Acceptance: a handoff cycle is never asked to add tests it declared out of scope, and the review gate never builds an artifact the user will build themselves
- Verify (local): `grep -c -F 'Ask only on `in-cycle`' commands/ec-review.md` → `== 1` (baseline: `0`)
- Dependencies: Task 2 (mode resolution vocabulary)

**Task 12 — Update the checklist-count assertion** `S`
- File: `tests/test_command_docs.py`
- Anchor: `assert len(items) == 21, f'checklist has {len(items)} items'` → `tests/test_command_docs.py:385`
- Code sample:
  ```python
          assert len(items) == 25, f'checklist has {len(items)} items'
  ```
  and update the docstring above it from `all 21 rules` to `all 25 rules`
- Do not touch: every other assertion in the file; the `read_command` helper; the `SWEEP_FILES` / `RETIRED_COMMANDS` sweeps
- Edge cases: the count must stay exact rather than becoming `>=` — the test exists so a silently dropped rule fails
- Acceptance: the checklist guard tracks the real count and still fails if any rule is lost
- Verify (local): `grep -c -F 'assert len(items) == 25' tests/test_command_docs.py` → `== 1` (baseline: `grep -c -F 'assert len(items) == 21' tests/test_command_docs.py` → `1`)
- Dependencies: Task 8 (creates the four items this count reflects)

**Task 13 — Add Proof Mode guard tests** `M`
- File: `tests/test_command_docs.py`
- Anchor: `# --- Exception-only fields + verify split in ec-plan.md ---`
- Reuse: `read_command()` and the house class-docstring style that states what would silently break
- Code sample: append a new class at the end of the file
  ```python
  PROOF_MODE_COMMANDS = ['ec-brainstorm.md', 'ec-plan.md', 'ec-refine.md',
                         'ec-execute.md', 'ec-review.md']


  class TestProofMode:
      """Proof Mode moves wall-clock proof steps out of the task list and into a
      Handoff block. Each rule here is the only thing stopping that from
      decaying back into a plan that makes the user wait for a build they will
      redo themselves."""

      @pytest.mark.parametrize('name', PROOF_MODE_COMMANDS)
      def test_every_chain_command_knows_the_mode(self, name):
          assert 'Proof Mode' in read_command(name) or 'proof mode' in read_command(name)

      def test_deliverable_rule_comes_before_the_proof_rule(self):
          """Stated the other way round, the mode would reject the very
          non-code deliverables it is supposed to allow — server work, config,
          migrations."""
          content = read_command('ec-plan.md')
          assert content.index('Deliverable rule') < content.index('Proof rule')

      def test_deliverable_rule_names_non_code_work(self):
          content = read_command('ec-plan.md')
          for medium in ['config', 'migration', 'server']:
              assert medium in content, medium

      def test_handoff_defaults_when_undeclared(self):
          assert 'handoff' in read_command('ec-plan.md')

      def test_plan_template_has_a_handoff_block(self):
          assert '### Handoff' in read_command('ec-plan.md')

      def test_refine_rejects_proof_verbs_mechanically(self):
          content = read_command('ec-refine.md')
          assert 'proof-verb gate' in content
          for verb in ['cargo build', 'npm run build', 'pytest']:
              assert verb in content, verb

      def test_execute_confirms_outward_facing_tasks_even_on_auto(self):
          content = read_command('ec-execute.md')
          assert 'Outward-facing tasks always confirm' in content
          assert 'Ask even when `AUTO=yes`' in content

      def test_anchor_and_do_not_touch_survive_the_slim_template(self):
          """These two fields are what make concurrent waves provably safe."""
          content = read_command('ec-plan.md')
          assert '- Anchor:' in content
          assert '- Do not touch:' in content
          assert 'never dropped' in content
  ```
- Do not touch: every existing class and assertion in the file
- Edge cases: the parametrized mode check accepts either capitalisation so a command that only says "proof mode: {MODE}" in a note still passes
- Acceptance: every rule this cycle introduces is locked by a test that fails if the rule is removed
- Verify (local): `python3 -m pytest tests/test_command_docs.py -q 2>&1 | tail -1` → `>= 119 passed` with `0 failed` (baseline: `110 passed`; this task adds 9 test functions and Task 12 changes one in place)
- Verify (global): `python3 -m pytest -q 2>&1 | tail -1` → `>= 247 passed` with `0 failed` (baseline: `238 passed`)
- Dependencies: Task 1, Task 3, Task 6, Task 9, Task 10, Task 12

### Review-stage amendments (recorded 2026-10-30, after execution)
Two of this plan's `Verify (local)` values were invalidated by Stage 2 fixes in
`/ec-review`, by me, after their tasks had passed. Recorded so the archived plan
does not read as a fabrication:
- Task 2 — `grep -c 'proof mode:' commands/ec-plan.md` was `== 1` and is now `2`.
  Fixing B1 (the saved-brainstorm path never parsed the mode) added a second
  `(proof mode: {MODE})` note on that branch. Count above expectation, attributable.
- Task 11 — `grep -c 'Ask only on' commands/ec-review.md` was `== 1` and is now `0`.
  Fixing A7 reworded that gate: authoring a test is *changing*, so the offer now
  stands in both modes and only the slow suite moves to Handoff. The phrase the
  verify counted no longer exists. Verified at `1` when the task ran.
- One file outside this plan's declared `File:` set was edited during review:
  `hooks/session_stop.py`, for the pending-confirmation carve-out. It is the only
  part of the chain that runs as code, so the prose rule could not bind without it.
  The running copy is `~/.efficlaude/hooks/session_stop.py`; this edit takes effect
  after `bash install.sh`.

### Note on verify shape
Every `Verify (local)` in this plan is a single check whose value MOVES when the task
runs. Regression guards — strings that must merely stay present — live in `Do not touch`
with their minimum count, never in `Verify (local)`, because a threshold already satisfied
before the task runs cannot prove the task did anything. `/ec-refine` reported exactly that
defect on Tasks 5 and 7 of this plan's first revision.

### Handoff
_This cycle edits the command Markdown that drives the chain, so its effect is only observable on the NEXT cycle. Nothing here is runnable proof the orchestrator can produce._
- Proof Mode actually shortens a real plan → run `/ec-brainstorm` on any next feature, declare `Mode: handoff`, and compare the resulting plan's line count against the 506-line DMG plan in `.claude/plans/archive/`
- `/ec-refine` really rejects a smuggled build step → in that next cycle, put `npm run build` in a task's `Verify (local)` on purpose and confirm refine reports a DEFECT
- `/ec-execute` really asks before outward-facing work → plan a deploy-shaped task and confirm it stops to ask, including under `auto`
