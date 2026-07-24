## Feature: Grounded Artifacts — Evidence-Backed Decisions + Calibrated Plans

### Impact Analysis
- Files affected: `commands/ec-brainstorm.md`, `commands/ec-feature.md`, `commands/ec-execute.md`, `tests/test_command_docs.py`
- ⚠️ Breaking change risk: none — all changes are additive Markdown sections and new template fields. No existing tag format (`[agent:]`, `[design:]`) is touched. Existing decision and plan files without the new sections remain valid input to every downstream command. `tests/test_command_docs.py` asserts on existing strings only; nothing it checks is removed.

### Reusable Existing Code
- The Design Contract pattern just shipped (`commands/ec-feature.md` Step 1 → plan template → `commands/ec-execute.md` Design Contract Injection) — the same persist-as-text-then-inject shape is reused for Anchor/Acceptance; do not invent a second mechanism
- `commands/ec-execute.md:134` "### Agent Context Injection" and `:144` "### Design Contract Injection" — the new prompt bullets slot into the same Step 4 list those blocks feed
- `commands/ec-execute.md:154` "### Evidence Rule" numbered list, currently items 1–7 — extended, not replaced
- `commands/ec-feature.md:307` Step 4 self-review checklist — extended with falsifiable items, reusing the existing `- [ ]` shape
- `tests/test_command_docs.py` `TestDesignContractChain` class (added last cycle) — the new tests follow its exact `read_command` / plain-`assert` style

### Design Contract
- Source: none supplied — this feature changes command Markdown only and renders no UI. No fidelity claim applies.

### Grounding
Read-only measurements taken before authoring the tasks below. Every numeric threshold in a Verify step traces to a line here.

Baseline string counts (pre-change):
```
commands/ec-brainstorm.md   '## Evidence'             = 0
commands/ec-brainstorm.md   'Options Explored'        = 1
commands/ec-brainstorm.md   'Verification Strategy'   = 0
commands/ec-feature.md      '## Grounding'            = 0
commands/ec-feature.md      'Anchor:'                 = 0
commands/ec-feature.md      'Acceptance:'             = 0
commands/ec-execute.md      'Anchor:'                 = 0
commands/ec-execute.md      'Acceptance:'             = 0
```

Baseline line counts: `ec-brainstorm.md` 242 · `ec-feature.md` 339 · `ec-execute.md` 225

Baseline test suite: **52 passed**

Verified anchor locations (exact, from `grep -n`):
```
ec-brainstorm.md:29   **No-Code Rule:** This command MUST NOT create, edit, or write any project files.
ec-brainstorm.md:83   **Score each approach:**
ec-brainstorm.md:167  ## Options Explored
ec-brainstorm.md:187  ## Key Assumptions
ec-brainstorm.md:191  ## Risks & Mitigations
ec-brainstorm.md:194  ## Out of Scope
ec-brainstorm.md:197  _Created: {YYYY-MM-DD}_
ec-feature.md:86      **No-Code Rule:** This command MUST NOT create, edit, or write any project files.
ec-feature.md:224     ## Step 3 — Write Plan
ec-feature.md:251     ### Impact Analysis
ec-feature.md:276     ### Per Task Detail
ec-feature.md:290     Size guide: S = <1hr · M = 1–3hr · L = >3hr
ec-feature.md:307     ## Step 4 — Self-Review Before Presenting
ec-feature.md:314     - [ ] Dependencies are correctly ordered
ec-execute.md:125     - Edge cases to handle
ec-execute.md:154     ### Evidence Rule — mandatory for every subagent
ec-execute.md:162     7. If verification fails: fix and re-verify — do NOT claim done without evidence
```

Note on Task 1's threshold: `## Evidence` starts at 0 and Task 1 adds exactly one occurrence in the decision template plus one mention in the Step 2 carry-forward instruction → expected final count is exactly 2. Stated as `== 2`, not a guessed `>=`. This is the specific defect class this feature exists to prevent.

### Tasks
- [x] Task 1: Deepen ec-brainstorm decision template [M] [agent: ec-llm] — add Evidence, scored Options table, Constraints & Non-Goals, Verification Strategy, Open Questions; wire Step 2 to fill them
- [x] Task 2: Grounding Pass and task fields in ec-feature [L] [agent: ec-llm] — add read-only Grounding Pass, `## Grounding` plan section, four new per-task fields, traceability rule, self-review items
- [x] Task 3: Propagate Anchor and Acceptance in ec-execute [M] [agent: ec-llm] — inject the new fields into subagent prompts and enforce them in the Evidence Rule
- [x] Task 4: Tests for grounded artifacts [M] [agent: ec-python] — add TestGroundedArtifacts covering all three commands

### Per Task Detail

**Task 1 — Deepen ec-brainstorm decision template** `M`
- File: `commands/ec-brainstorm.md`
- Anchor: three exact strings, all confirmed present in Grounding above — `**Score each approach:**` (line 83), `## Options Explored` (line 167, inside the Step 5 fenced decision template), and `## Out of Scope` (line 194, same template)
- Reuse: the existing Step 5 fenced ```markdown decision template — extend it in place; do not create a second template
- Code sample: three edits.
  1. Immediately BEFORE the `**Score each approach:**` line, insert a carry-forward instruction:
     ```
     **Record the evidence:** while analysing, collect the concrete `file:line` citations that support the diagnosis — never a claim without a locator. Carry them into the decision file's `## Evidence` section. Carry the per-approach scores into the `## Options Explored` table, and the constraints, non-goals, verification strategy, and unresolved questions into their matching sections. Fill every section without asking the user — this must work identically on the `auto` path, which skips Step 4.
     ```
  2. In the Step 5 decision template, insert `## Evidence` between `## Problem` and `## Options Explored`, holding a bullet list of `` `file:line` — {what it shows} `` entries, and replace the three bullet-only `- **Option N — {name}**` lines with a scored table followed by the same bullets:
     ```
     ## Options Explored

     | # | Option | Effort | Reversibility | Risk | Fit | Result |
     |---|--------|--------|---------------|------|-----|--------|
     | 1 | {name} | {1-5} | {1-5} | {1-5} | {1-5} | Not chosen |
     | 2 | {name} | {1-5} | {1-5} | {1-5} | {1-5} | Not chosen |
     | 3 | {name} | {1-5} | {1-5} | {1-5} | {1-5} | **CHOSEN** |

     Scale 1–5; for Effort and Risk, higher is better (5 = low effort / low risk).

     - **Option 1 — {name}**: {one-line summary} → not chosen because: {reason}
     - **Option 2 — {name}**: {one-line summary} → not chosen because: {reason}
     - **Option 3 — {name}**: {one-line summary} → CHOSEN
     ```
  3. In the same template, insert `## Constraints` and `## Non-Goals` between `## Key Assumptions` and `## Risks & Mitigations`, and insert `## Verification Strategy` and `## Open Questions` between `## Risks & Mitigations` and `## Out of Scope`. Each carries a one-line instruction on what belongs in it; `## Open Questions` records each unresolved item together with the assumption taken so the plan can proceed.
- Do not touch: Step 3's displayed recommendation format (the fenced block under "## Step 3 — Present the Recommendation") — screen output length must not change; the `y / auto / n` gate; Step 7 auto-flow chain; the No-Code Rule at line 29
- Edge cases: a brainstorm with no repo evidence writes `## Evidence` with the single line `- none — reasoning is from the problem statement alone`; fewer than three options still renders the table with the rows that exist; no open questions writes `- none`
- ⚠️ Breaking change: none — decision files written before this change lack the new sections and must remain valid input to `/ec-feature`, which reads sections by name and ignores absent ones
- Acceptance: the Step 5 decision template contains all six new sections in the specified order, and Step 2 instructs that they be filled without user interaction
- Verify: `cd /Users/admin/Projects/EffiClaude && grep -c "## Evidence" commands/ec-brainstorm.md` → expect exactly `2` (baseline 0, Task adds 1 in the template + 1 in the Step 2 instruction); `grep -c "## Verification Strategy" commands/ec-brainstorm.md` → expect `>= 1` (baseline 0); `grep -c "^| # | Option |" commands/ec-brainstorm.md` → expect `1`; `python3 -m pytest tests/ -q | tail -1` → expect `52 passed` (baseline 52, this task adds no tests)
- Rollback: `git checkout -- commands/ec-brainstorm.md` — additive Markdown only, no state outside the file
- Dependencies: none

**Task 2 — Grounding Pass and task fields in ec-feature** `L`
- File: `commands/ec-feature.md`
- Anchor: four exact strings, all confirmed in Grounding above — `**No-Code Rule:** This command MUST NOT create, edit, or write any project files.` (line 86), `## Step 3 — Write Plan` (line 224), `### Per Task Detail` (line 276), and `- [ ] Dependencies are correctly ordered` (line 314, last item of the Step 4 checklist)
- Reuse: the existing `### Design Contract` plan-template section added last cycle sits directly above `### Tasks` — `### Grounding` goes immediately after it, following the same "structured block persisted as plain text" shape
- Code sample: five edits.
  1. Extend the No-Code Rule at line 86 with an explicit read allowance so the Grounding Pass is unambiguous:
     ```
     Reading is always allowed — this command MAY run read-only shell commands (`grep`, `grep -n`, `sed -n`, `wc -l`, `ls`, `git diff --stat`) to measure the codebase. It MUST NOT run any command that writes, deletes, or changes git state.
     ```
  2. Immediately BEFORE `## Step 3 — Write Plan`, insert a new step:
     ```
     ## Step 2.5 — Grounding Pass (mandatory)
     Before writing any task, measure the codebase instead of assuming it. For every file a task will touch:
     1. Confirm the file exists and record its line count: `wc -l {file}`
     2. Record the exact anchor string each task will locate, with its line number: `grep -n "{anchor}" {file}`
     3. For every string a Verify step will count, record its CURRENT count: `grep -c "{string}" {file}`
     4. Record the current test baseline if the project has a suite
     Write all of it into the plan's `### Grounding` section verbatim — actual output, never predicted output.
     **Traceability rule:** every numeric threshold in a Verify step MUST be derived from a baseline recorded here. Write `== n` when the exact post-change count is known from the baseline plus the edits specified; use `>= n` only when the edit count genuinely varies. A threshold that cannot be traced to a baseline is a planning defect — measure it, do not guess it.
     Only read-only commands are permitted here (see the No-Code Rule).
     ```
  3. In the Step 3 plan template, insert a `### Grounding` section between `### Design Contract` and `### Tasks`, carrying: baseline string counts, baseline line counts, baseline test result, and verified anchor locations.
  4. In `### Per Task Detail`, extend the field list to:
     ```
     **Task 1 — {name}** `S/M/L`
     - File: {exact path to create/modify}
     - Anchor: {exact existing string the executor must locate, with line number from Grounding — or "new file"}
     - Reuse: {existing code to use, or "none"}
     - Code sample: {concrete snippet or expected structure}
     - Do not touch: {files, sections, or behaviours this task must leave alone — or "n/a"}
     - Edge cases: loading state / empty state / error state
     - ⚠️ Breaking change: {description or "none"}
     - Acceptance: {the observable end state, stated independently of any command}
     - Verify: {exact command + expected value, traced to a baseline in ### Grounding}
     - Rollback: {how to undo this task — or "git checkout -- {file}"}
     - Dependencies: {other tasks, or "none"}
     ```
  5. After `- [ ] Dependencies are correctly ordered` in the Step 4 checklist, append four falsifiable items:
     ```
     - [ ] Every task has an Anchor that was confirmed to exist by the Grounding Pass
     - [ ] Every numeric threshold in a Verify step traces to a baseline in ### Grounding
     - [ ] Every task has an Acceptance stated independently of its Verify command
     - [ ] No Verify threshold was written without measuring the current value first
     ```
- Do not touch: the `[agent:]` and `[design:]` tag formats and their rules; the Flat Format Rules task-line shape; the `### Design Contract` section added last cycle; the Step 0 branch/autoflow/lock logic
- Edge cases: a brand-new file has no anchor → write `Anchor: new file`; a project with no test suite → the Grounding baseline records `no suite`; a task whose Verify is a file-existence check rather than a count → no threshold to trace, the rule is vacuous
- ⚠️ Breaking change: none — plans written before this change lack `### Grounding` and the new fields; `/ec-execute` must continue to run them, so the fields are read opportunistically and never required
- Acceptance: `/ec-feature` measures before it writes, the plan template carries a `### Grounding` section, every per-task entry has Anchor / Do not touch / Acceptance / Rollback, and the traceability rule is stated as a hard requirement
- Verify: `cd /Users/admin/Projects/EffiClaude && grep -c "## Step 2.5 — Grounding Pass" commands/ec-feature.md` → expect `1` (baseline 0); `grep -c "^- Anchor:" commands/ec-feature.md` → expect `1` (baseline 0, appears once in the per-task template); `grep -c "^- Acceptance:" commands/ec-feature.md` → expect `1` (baseline 0); `grep -c "^- Rollback:" commands/ec-feature.md` → expect `1`; `grep -c "Traceability rule" commands/ec-feature.md` → expect `>= 1`; `grep -c "\[design:" commands/ec-feature.md` → expect `5` (unchanged from last cycle, proving the tag rules survived); `python3 -m pytest tests/ -q | tail -1` → expect `52 passed`
- Rollback: `git checkout -- commands/ec-feature.md`
- Dependencies: none

**Task 3 — Propagate Anchor and Acceptance in ec-execute** `M`
- File: `commands/ec-execute.md`
- Anchor: two exact strings, confirmed in Grounding above — `- Edge cases to handle` (line 125, inside the Step 4 "Each subagent prompt must include:" list) and `7. If verification fails: fix and re-verify — do NOT claim done without evidence` (line 162, last item of the Evidence Rule list)
- Reuse: the Step 4 prompt bullet list and the Evidence Rule numbered list — both already extended once last cycle for the Design Contract; extend the same lists again rather than adding parallel structures
- Code sample: three edits.
  1. In the Step 4 "Each subagent prompt must include:" list, immediately after `- Edge cases to handle`, add:
     ```
     - The task's `Anchor:` string — the subagent must locate this exact text before editing, never guess placement
     - The task's `Do not touch:` boundary, stated as a hard constraint
     - The task's `Acceptance:` line — the observable end state, separate from the verify command
     ```
  2. In the Evidence Rule numbered list, insert two items BEFORE the existing final item, renumbering within this list only so it reads 1..9 with "If verification fails" last:
     ```
     {n}. Confirm the task's `Acceptance:` condition actually holds — a passing command with an unmet Acceptance is not done
     {n+1}. If the Verify threshold turns out to be wrong for the specified edits, report it as "Threshold mismatch: {expected} vs {actual}" and STOP — never add or alter content merely to satisfy a number
     ```
  3. Immediately after the Evidence Rule list, add a short guard block:
     ```
     ### Anchor Discipline
     - Locate the `Anchor:` string before editing; if it is absent from the target file, stop and report `(⚠️ anchor not found in {file} — plan is stale, not executing)`
     - Never widen an edit beyond what the task specifies to make a verify step pass
     - Respect `Do not touch:` absolutely — an edit inside that boundary is a failed task even if everything else verifies
     ```
- Do not touch: the `\[agent: (ec-\w+)\]` parse, the `\[design: (.+)#([^#\]]+)\]` parse, Agent Context Injection, Design Contract Injection, the Step 1 lock logic, Error Recovery and Timeout Rule sentinel handling
- Edge cases: a plan written before this change has no Anchor/Acceptance fields → the injection is skipped silently and execution proceeds exactly as today; `Anchor: new file` → nothing to locate, skip the check
- ⚠️ Breaking change: none — every addition is a new bullet, a new numbered item, or a new subsection; old plans still execute
- Acceptance: a subagent receives the Anchor, Do-not-touch, and Acceptance for its task, and cannot claim completion on a passing command alone when the Acceptance is unmet or the threshold is provably wrong
- Verify: `cd /Users/admin/Projects/EffiClaude && grep -c "Anchor:" commands/ec-execute.md` → expect exactly `2` (baseline 0; the specified edits add the string in exactly two places — one prompt bullet and one Anchor Discipline bullet; the `### Anchor Discipline` heading has no colon and does not match); `grep -c "^### Anchor Discipline" commands/ec-execute.md` → expect `1`; `grep -c "Threshold mismatch" commands/ec-execute.md` → expect `1`; `grep -c "Design Contract Injection" commands/ec-execute.md` → expect `1` (unchanged, proving last cycle's block survived); `python3 -m pytest tests/ -q | tail -1` → expect `52 passed`
- Rollback: `git checkout -- commands/ec-execute.md`
- Dependencies: Task 2 defines the field names this task consumes — ordering matters for coherence, not mechanics

**Task 4 — Tests for grounded artifacts** `M`
- File: `tests/test_command_docs.py`
- Anchor: the final line of the file, `        assert 'ec-git' in last_line`, and the existing class `class TestDesignContractChain:` — new tests are appended as a new class at end of file
- Reuse: the module's existing `read_command(name)` helper and the plain-`assert` style of `TestDesignContractChain`; do not add fixtures or new imports beyond what is already imported (`os`, `re`, `pytest`)
- Code sample: append a new class:
  ```python
  class TestGroundedArtifacts:
      def test_brainstorm_decision_template_has_new_sections(self):
          content = read_command('ec-brainstorm.md')
          for section in ['## Evidence', '## Constraints', '## Non-Goals',
                          '## Verification Strategy', '## Open Questions']:
              assert section in content, section

      def test_brainstorm_options_table_present(self):
          content = read_command('ec-brainstorm.md')
          assert '| # | Option |' in content

      def test_brainstorm_screen_format_unchanged(self):
          content = read_command('ec-brainstorm.md')
          assert '## Rekomendasi: {short name}' in content
          assert '**Key assumption:**' in content

      def test_feature_has_grounding_pass(self):
          content = read_command('ec-feature.md')
          assert '## Step 2.5 — Grounding Pass' in content
          assert '### Grounding' in content

      def test_feature_grounding_is_read_only(self):
          content = read_command('ec-feature.md')
          assert 'read-only' in content
          assert 'MUST NOT run any command that writes' in content

      def test_feature_task_template_has_new_fields(self):
          content = read_command('ec-feature.md')
          for field in ['- Anchor:', '- Do not touch:', '- Acceptance:', '- Rollback:']:
              assert field in content, field

      def test_feature_states_traceability_rule(self):
          content = read_command('ec-feature.md')
          assert 'Traceability rule' in content
          assert 'traces to a baseline' in content

      def test_execute_injects_anchor_and_acceptance(self):
          content = read_command('ec-execute.md')
          assert 'Anchor:' in content
          assert 'Acceptance:' in content
          assert '### Anchor Discipline' in content

      def test_execute_forbids_threshold_gaming(self):
          content = read_command('ec-execute.md')
          assert 'Threshold mismatch' in content

      def test_existing_tag_parsers_survive(self):
          content = read_command('ec-execute.md')
          assert '### Agent Context Injection' in content
          assert '### Design Contract Injection' in content
  ```
- Do not touch: the existing `TestDesignContractChain` class and every test above it; the module-level `COMMANDS_DIR` / `AGENTS_DIR` constants
- Edge cases: none — pure assertion tests over file contents
- ⚠️ Breaking change: none
- Acceptance: the suite fails if any of the three commands loses a grounded-artifact element, and passes on the implemented state
- Verify: `cd /Users/admin/Projects/EffiClaude && python3 -m pytest tests/ -q | tail -1` → expect `62 passed` (baseline 52 + exactly 10 new tests in this class); `python3 -m pytest tests/test_command_docs.py::TestGroundedArtifacts -q | tail -1` → expect `10 passed`
- Rollback: `git checkout -- tests/test_command_docs.py`
- Dependencies: Tasks 1, 2, and 3 — the assertions fail until all three land, so this task runs last
