## Feature: Independence Scheduling — dependency waves, batched probes, concurrent review

### Impact Analysis
- Files affected: `commands/ec-execute.md`, `commands/ec-refine.md`, `commands/ec-plan.md`, `commands/ec-review.md`, `tests/test_command_docs.py`, `README.md`
- ⚠️ Breaking change risk: none to users. `tests/test_command_docs.py:385` asserts the ec-plan Step 4 checklist holds exactly 20 items; Task 18 adds a 21st, so Tasks 21–22 must land in the same cycle or the suite fails. No on-disk state format changes, so the auto-flow sentinel and plan-file contracts are untouched.

### Reusable Existing Code
- `commands/ec-execute.md:107` "### Execution units — co-location fusion" — already reads each task's `File:` and `Dependencies:` and already stops at `GATE` and `Verify (global)`. Waves reuse the units it builds and reuse its stop conditions as barrier conditions; nothing in it is replaced.
- `commands/ec-execute.md:128` — orchestrator is already the sole writer of `{PLAN_FILE}`. Reused unchanged; this is what makes a concurrent wave safe to record.
- `commands/ec-plan.md:320` — `Dependencies:` is already required to be honest. Reused as the scheduler's input; no new plan field is introduced.
- `commands/ec-refine.md:39-56` — every `Verify (local)` is already guaranteed read-only. Reused as the precondition that makes one batched probe script safe.
- `commands/ec-plan.md:222` Grounding Pass and `commands/ec-refine.md` Steps 1–3 already run the same shapes of probe (`grep -c`, `wc -l`, `test -f`); one `probe()` idiom serves both.

### Grounding
Measured 2026-10-29 — real command output only, never predicted.

- Baseline line counts: `wc -l commands/ec-execute.md` → 288 · `commands/ec-refine.md` → 117 · `commands/ec-plan.md` → 417 · `commands/ec-review.md` → 310 · `tests/test_command_docs.py` → 512 · `README.md` → 311
- Baseline test result: `python3 -m pytest tests/test_command_docs.py -q` → 94 passed · `python3 -m pytest -q` → 183 passed, 1 warning

Baseline string counts (strings a Verify step will count), all `grep -c -F`:
- `Execute in Dependency Waves` in ec-execute.md → 0
- `### Wave scheduling` in ec-execute.md → 0
- `Wave admission` in ec-execute.md → 0
- `WAVE_WIDTH` in ec-execute.md → 0
- `wave barrier` in ec-execute.md → 0
- `### Wave failure handling` in ec-execute.md → 0
- `three-line report` in ec-execute.md → 0
- `For each wave, in level order` in ec-execute.md → 0
- `degrades to waves of one` in ec-execute.md → 0
- `in document order` in ec-execute.md → 1
- `## Step 3 — Execute Sequentially` in ec-execute.md → 1
- `3. Execute units in dependency order.` in ec-execute.md → 1
- `### Batched probe script` in ec-refine.md → 0
- `timeout 10` in ec-refine.md → 0
- `## Step 4.5 — Confirm dependency edges are honest` in ec-refine.md → 0
- `created by another task` in ec-refine.md → 0
- `### Batched probe script` in ec-plan.md → 0
- `LEVELS this field into waves` in ec-plan.md → 0
- `derived at execution time, never authored` in ec-plan.md → 0
- `declares that edge` in ec-plan.md → 0
- `concurrent reviewers` in ec-review.md → 0
- `never relaxes a gate` in ec-review.md → 0
- `class TestIndependenceScheduling` in tests/test_command_docs.py → 0
- `assert len(items) == 21` in tests/test_command_docs.py → 0
- `assert len(items) == 20` in tests/test_command_docs.py → 1
- `gelombang` in README.md → 0
- `## Step 0.5 — Batched probe script` in ec-refine.md → 0
- `stands as its own wave` in ec-execute.md → 0
- `No two units in the same wave` in ec-execute.md → 0
- `**DEFECT**` in ec-refine.md → 2 · `**PASS**` → 1 · `**UNVERIFIABLE**` → 1 (verdict vocabulary Task 11 must preserve)
- `Menjalankan task berurutan beserta verifikasi lokalnya` in README.md → 1

Strings that must SURVIVE every edit (each test-protected, each currently 1):
- ec-execute.md: `Fuse CONSECUTIVE`, `A fusion run STOPS at`, `Do not read `### Per Task Detail` in full`, `is not evidence that this task is correct`, `Threshold mismatch`
- ec-plan.md: `MUST NOT run any command that writes`, `no fabricated Task N-1 chain`
- ec-review.md: `this is the authoritative gate`

Verified anchors (`grep -n -F`, each unique — n=1):
- `## Step 3 — Execute Sequentially` → commands/ec-execute.md:103
- `3. Execute units in dependency order.` → commands/ec-execute.md:116
- `Tasks that share a file but are separated` → commands/ec-execute.md:119
- `For each `- [ ]` task in document order:` → commands/ec-execute.md:121
- `A plan written before this convention has no` → commands/ec-execute.md:130
- `Repeat until no `- [ ]` lines remain` → commands/ec-execute.md:132
- `## Step 3.5 — Pre-spawn Verification Anchor` → commands/ec-execute.md:134
- `- The verify step from the plan` → commands/ec-execute.md:155
- `### Error Recovery` → commands/ec-execute.md:203
- `## Step 1 — Dry-run every Verify (local)` → commands/ec-refine.md:39
- `For each task, run its `Verify (local)` and compare:` → commands/ec-refine.md:45
- `## Step 2 — Re-measure Grounding against disk` → commands/ec-refine.md:58
- `## Step 3 — Confirm anchors exist` → commands/ec-refine.md:63
- `## Step 4 — Confirm new files are absent` → commands/ec-refine.md:68
- `## Step 5 — Report and gate` → commands/ec-refine.md:73
- `## Step 2.5 — Grounding Pass (mandatory)` → commands/ec-plan.md:222
- `### Flat Format Rules (mandatory — no exceptions)` → commands/ec-plan.md:253
- `**Honest dependencies.**` → commands/ec-plan.md:328
- `- [ ] Dependencies name only genuine prerequisites` → commands/ec-plan.md:364
- `- Dependencies: {ONLY the tasks whose output this task genuinely requires` → commands/ec-plan.md:320
- `## Stage 2 — Code Quality Review` → commands/ec-review.md:110
- `After spec compliance is confirmed, review code quality on all modified files.` → commands/ec-review.md:112
- `### API Correctness (if docs available)` → commands/ec-review.md:166
- `def test_feature_self_review_checklist_has_twenty_items(self):` → tests/test_command_docs.py:379
- `assert len(items) == 20` → tests/test_command_docs.py:385
- `class TestExecuteTemplateRules:` → tests/test_command_docs.py:390
- `Menjalankan task berurutan beserta verifikasi lokalnya` → README.md:124

No task creates a new file. Every task edits a file confirmed present above.

### Tasks
- [x] Task 1: ec-execute: rename Step 3 to dependency waves [S] [agent: ec-llm] — retitle the step and restate its opening two lines around waves instead of a serial walk
- [x] Task 2: ec-execute: hand fusion units to the scheduler [S] [agent: ec-llm] — change fusion list item 3 so it hands units to the wave scheduler instead of claiming to execute them
- [x] Task 3: ec-execute: insert Wave admission rule [S] [agent: ec-llm] — add the ### Wave scheduling section with the level rule and file-disjointness rule
- [x] Task 4: ec-execute: insert wave barrier and width rules [S] [agent: ec-llm] — add barrier conditions, WAVE_WIDTH cap, and the degradation statement to the scheduling section
- [x] Task 5: ec-execute: replace the serial loop with the wave loop [S] [agent: ec-llm] — swap the document-order per-task loop for a per-wave loop that spawns units concurrently in one message
- [x] Task 6: ec-execute: pin global invariants to the orchestrator [S] [agent: ec-llm] — state that Verify (global) runs in the orchestrator at barriers, never inside a parallel unit
- [x] Task 7: ec-execute: add the Wave failure handling section [S] [agent: ec-llm] — finish the wave, mark only passing tasks, report failures together, stop before the next wave
- [x] Task 8: ec-execute: add the three-line subagent report contract [S] [agent: ec-llm] — add the fixed report format to the Step 4 subagent prompt list
- [x] Task 9: ec-execute: extend Step 3.5 to cover wave admission [S] [agent: ec-llm] — add pre-spawn confirmations for file-disjointness and barrier isolation
- [x] Task 10: ec-refine: add the batched probe script section [S] [agent: ec-llm] — one generated script with per-probe timeout replaces per-task round-trips
- [x] Task 11: ec-refine: route Step 1 through the batched script [S] [agent: ec-llm] — replace the per-task dry-run instruction with a reference to the batched script
- [x] Task 12: ec-refine: route Steps 2 and 3 through the same script [S] [agent: ec-llm] — fold the Grounding re-measure and anchor checks into the same single run
- [x] Task 13: ec-refine: add Step 4.5 honest-dependency check [S] [agent: ec-llm] — a task editing a file another task creates must declare that edge
- [x] Task 14: ec-plan: add the batched probe script to the Grounding Pass [S] [agent: ec-llm] — measure the whole plan in one script instead of one call per task
- [x] Task 15: ec-plan: restate Honest dependencies around wave levelling [S] [agent: ec-llm] — record that ec-execute now levels this field into concurrent waves
- [x] Task 16: ec-plan: explain why waves are derived not authored [S] [agent: ec-llm] — justify the existing no-Wave-header rule in the Flat Format Rules
- [x] Task 17: ec-plan: add the created-file dependency rule to the template notes [S] [agent: ec-llm] — state the one dependency edge a plan may never omit
- [x] Task 18: ec-plan: add self-review checklist item 21 [S] [agent: ec-llm] — add the created-file edge check to the Step 4 checklist
- [x] Task 19: ec-review: fan out the Stage 2 dimensions [S] [agent: ec-llm] — spawn one concurrent reviewer per applicable gate in a single message and merge findings
- [x] Task 20: ec-review: state that concurrency relaxes no gate [S] [agent: ec-llm] — the definitive global gate still runs once, serially, in the orchestrator
- [x] Task 21: tests: retarget the checklist-count test to 21 items [S] [agent: ec-python] — rename the test and update its assertion
- [x] Task 22: tests: add TestIndependenceScheduling for ec-execute [S] [agent: ec-python] — assert the wave rules exist and the protected fusion and evidence strings survive
- [x] Task 23: tests: add refine, plan and review scheduling assertions [S] [agent: ec-python] — assert batched probes, the honest-dependency check, and review fan-out
- [x] Task 24: README: correct the ec-execute row [S] — the pipeline table calls execution sequential; it now runs in waves

### Per Task Detail

**Task 1 — ec-execute: rename Step 3 to dependency waves** `S`
- File: `commands/ec-execute.md`
- Anchor: `## Step 3 — Execute Sequentially` (line 103)
- Reuse: none
- Code sample: replace the three lines at 103–105
  ```
  ## Step 3 — Execute in Dependency Waves
  Read all tasks from `{PLAN_FILE}`. Find all lines matching `- [ ]`.
  Compute: total = count of ALL task lines (both `[x]` and `[ ]`).
  ```
  Only the heading text changes; the two lines below it stay byte-identical.
- Do not touch: the `### Execution units — co-location fusion` section, and every other heading in the file
- Edge cases: the old heading appears exactly once (baseline 1), so a literal replace is unambiguous; the em dash must be preserved
- Acceptance: Step 3's heading names waves rather than sequential execution, and no other heading changed
- Verify (local): `grep -c 'Execute in Dependency Waves' commands/ec-execute.md` → `== 1` (baseline 0) and `grep -c 'Step 3 — Execute Sequentially' commands/ec-execute.md` → `== 0` (baseline 1)
- Dependencies: none

**Task 2 — ec-execute: hand fusion units to the scheduler** `S`
- File: `commands/ec-execute.md`
- Anchor: `3. Execute units in dependency order.` (line 116)
- Reuse: the fusion section itself — it already builds the units; only its hand-off sentence changes
- Code sample: replace list item 3 with
  ```
  3. Hand the units to the wave scheduler below — it decides which may run together. Within a unit: open the file once, apply every task's change, then run each task's `Verify (local)` separately.
  ```
  Items 1, 2 and 4 of that list are unchanged.
- Do not touch: `Fuse CONSECUTIVE`, `A fusion run STOPS at` and the four stop conditions beneath it — `tests/test_command_docs.py` asserts all five strings
- Edge cases: the replacement must keep the `3.` numbering so items 1–4 stay a single ordered list
- Acceptance: fusion builds units and explicitly defers ordering to the scheduler; the four stop conditions are still listed verbatim
- Verify (local): `grep -c 'Hand the units to the wave scheduler' commands/ec-execute.md` → `== 1` (baseline 0) and `grep -c 'A fusion run STOPS at' commands/ec-execute.md` → `== 1` (baseline 1, must not change)
- Dependencies: none

**Task 3 — ec-execute: insert Wave admission rule** `S`
- File: `commands/ec-execute.md`
- Anchor: `Tasks that share a file but are separated` (line 119)
- Reuse: `File:` and `Dependencies:` as already parsed by the fusion section — no new plan field
- Code sample: insert immediately AFTER that paragraph
  ```
  ### Wave scheduling — concurrency the plan already proves safe
  A unit's independence is not a guess: `Dependencies:` and `File:` state it outright. Walking units one at a time discards that information, and on a 130-task plan it costs hours. Level the units instead.

  **Wave admission.** Unit U joins wave *k* when BOTH hold:
  - every unit U depends on sits in a wave below *k* — resolved transitively through each fused task's `Dependencies:`
  - no other unit already admitted to wave *k* names any path in U's `File:` set

  Two units that share even one path are never admitted to the same wave. That is the entire safety argument for concurrency here, and it is decidable from the plan alone — no diff inspection, no guessing.
  ```
- Do not touch: the fusion section above it and `## Step 3.5` below
- Edge cases: a unit whose `File:` names more than one path is already excluded from fusion, so its `File:` set is a single path; a task with no `File:` line is its own unit and conflicts with nothing
- Acceptance: the file states a decidable admission rule combining dependency level and file-set disjointness
- Verify (local): `grep -c 'Wave admission' commands/ec-execute.md` → `== 1` (baseline 0) and `grep -c '### Wave scheduling' commands/ec-execute.md` → `== 1` (baseline 0)
- Dependencies: none

**Task 4 — ec-execute: insert wave barrier and width rules** `S`
- File: `commands/ec-execute.md`
- Anchor: `no other unit already admitted to wave *k* names any path in U's` — inserted by Task 3
- Reuse: the `GATE` and `Verify (global)` stop conditions already defined in the fusion section; they become barrier conditions rather than new concepts
- Code sample: append to the `### Wave scheduling` section
  ```
  **Wave barriers.** A unit is admitted alone, as a wave of one, when any of its tasks:
  - carries a `Verify (global)` line — that task is a module boundary
  - has `GATE` in its name — a gate exists to stop work before cost is spent

  Nothing above a wave barrier is admitted until that wave's global invariant has run and passed. These are the same two conditions that stop a fusion run, used for the same reason.

  **Width.** Spawn at most `WAVE_WIDTH = 8` units concurrently; a wider wave splits into consecutive sub-waves of 8. This is the only tunable number in the scheduler — lower it and behaviour degrades smoothly toward serial execution.

  **Degradation.** A plan whose `Dependencies:` form a straight `Task N-1` chain degrades to waves of one — exactly today's behaviour, and not an error. A plan with honest `none` values and distinct `File:` paths yields wide waves. Wave width is a readout of plan quality, not of this scheduler.
  ```
- Do not touch: the Wave admission block written by Task 3
- Edge cases: a barrier unit that is also the only pending unit is a wave of one either way; `WAVE_WIDTH` must appear as a single literal so it can be changed in one place
- Acceptance: barriers, the concurrency cap, and the chain-plan degradation behaviour are all stated in the scheduling section
- Verify (local): `grep -c 'WAVE_WIDTH' commands/ec-execute.md` → `== 1` (baseline 0) and `grep -c 'wave barrier' commands/ec-execute.md` → `>= 1` (baseline 0) and `grep -c 'degrades to waves of one' commands/ec-execute.md` → `== 1` (baseline 0)
- Dependencies: Task 3 — this text is appended to the section Task 3 creates, and its anchor does not exist until then

**Task 5 — ec-execute: replace the serial loop with the wave loop** `S`
- File: `commands/ec-execute.md`
- Anchor: `For each `- [ ]` task in document order:` (line 121)
- Reuse: loop items 3, 5 and 6 of the existing list carry forward near-verbatim — the local-verify requirement, the global-invariant warning, and the orchestrator-only plan write
- Code sample: replace the whole 8-line block (the `For each ... in document order:` line and its seven numbered items) with
  ```
  For each wave, in level order:
  1. Show: "▶ Wave {w}: {m} unit(s), {k} task(s)"
  2. Spawn every unit in the wave as concurrent subagents **in a single message**. Spawning a wave's units one message at a time is the serial walk this step replaced — it is not an acceptable fallback
  3. Each task's `Verify (local)` MUST be run inside its own unit and its real output confirmed before that task is reported done
  4. Never substitute a global invariant for a missing local verify. "The project still compiles" is not evidence that this task is correct — it is a repo-wide property that holds whether or not this task did its job
  5. After the wave returns: for each task whose own local verify passed, edit `{PLAN_FILE}` — replace `- [ ] Task N: {name}` with `- [x] Task N: {name}` for that task only. The orchestrator is the sole writer of `{PLAN_FILE}`; no subagent ever edits it, and that is what makes recording a concurrent wave safe
  6. Show: "✓ Wave {w}: {k}/{k} verified" — or the failure report below
  ```
- Do not touch: the `A plan written before this convention` paragraph at line 130 and the `Repeat until no - [ ] lines remain` line at 132 — both stay
- Edge cases: item 4's wording is asserted verbatim by `test_execute_forbids_global_invariant_as_local_evidence`, so the phrase `is not evidence that this task is correct` must survive the rewrite character for character
- Acceptance: no instruction anywhere in the file walks tasks in document order, and the loop body spawns a wave per iteration
- Verify (local): `grep -c 'in document order' commands/ec-execute.md` → `== 0` (baseline 1) and `grep -c 'For each wave, in level order' commands/ec-execute.md` → `== 1` (baseline 0) and `grep -c 'is not evidence that this task is correct' commands/ec-execute.md` → `== 1` (baseline 1, must not change)
- Dependencies: Task 3 — item 2 refers to the wave the scheduler admits, so the scheduling section must exist for the loop to be coherent

**Task 6 — ec-execute: pin global invariants to the orchestrator** `S`
- File: `commands/ec-execute.md`
- Anchor: `A plan written before this convention has no` (line 130)
- Reuse: the module-boundary concept already defined at `commands/ec-plan.md:330`
- Code sample: insert immediately BEFORE that paragraph
  ```
  A `Verify (global)` never runs inside a unit. It runs here, in the orchestrator, after its barrier wave returns, and one at a time — concurrent builds would contend on a cargo or npm lock and a failure would be unattributable. If it fails, STOP: do not admit the next wave.
  ```
- Do not touch: the `A plan written before this convention` paragraph itself, and the `Repeat until` line after it
- Edge cases: a plan with no `Verify (global)` lines reaches this rule vacuously — the paragraph that follows already covers that case and is left in place
- Acceptance: the file states that global invariants execute only in the orchestrator at barriers, with the build-lock reason given
- Verify (local): `grep -c 'never runs inside a unit' commands/ec-execute.md` → `== 1` (baseline 0)
- Dependencies: none

**Task 7 — ec-execute: add the Wave failure handling section** `S`
- File: `commands/ec-execute.md`
- Anchor: `### Error Recovery` (line 203)
- Reuse: the existing Error Recovery block handles the per-task Retry/Skip/Fix choice and the `AUTO=yes` sentinel deletion — this section routes into it rather than duplicating it
- Code sample: insert immediately BEFORE `### Error Recovery`
  ```
  ### Wave failure handling
  A failure does not abort its wave mid-flight: the other units are already writing, and killing them would leave `{PLAN_FILE}` a less accurate resume point than letting them finish.
  1. Let every unit in the wave return
  2. Mark `- [x]` only for tasks whose own local verify passed. A failed task keeps its `- [ ]`, so `{PLAN_FILE}` stays a correct resume point
  3. Report every failure in the wave together — one report, not one per unit
  4. Do NOT admit the next wave
  5. Then follow Error Recovery below

  ```
- Do not touch: `### Error Recovery` and `### Timeout Rule` and their contents
- Edge cases: a single-unit wave that fails behaves exactly as today; a wave where some units pass leaves a mixed `[x]`/`[ ]` plan file, which is the intended resume state
- Acceptance: a mid-wave failure has a defined outcome that keeps the plan file accurate and stops before the next wave
- Verify (local): `grep -c '### Wave failure handling' commands/ec-execute.md` → `== 1` (baseline 0)
- Dependencies: none

**Task 8 — ec-execute: add the three-line subagent report contract** `S`
- File: `commands/ec-execute.md`
- Anchor: `- The verify step from the plan` (line 155)
- Reuse: the existing Step 4 bullet list of required subagent prompt contents — one more bullet, same list
- Code sample: insert as a new bullet immediately AFTER that line
  ```
  - The report contract: reply with a three-line report per task and nothing else — `task: {N}` · `verify: {command}` · `output: {last line of real output}`. Orchestrator context then grows with the wave count rather than the task count, which is what keeps a 130-task plan inside one context
  ```
- Do not touch: the `- Nothing from memory or docs search` bullet that follows, and the Evidence Rule section below
- Edge cases: a unit holding several fused tasks returns one three-line report per task, not one for the unit
- Acceptance: every spawned subagent is told to return a fixed-size report
- Verify (local): `grep -c 'three-line report' commands/ec-execute.md` → `== 1` (baseline 0)
- Dependencies: none

**Task 9 — ec-execute: extend Step 3.5 to cover wave admission** `S`
- File: `commands/ec-execute.md`
- Anchor: `## Step 3.5 — Pre-spawn Verification Anchor` (line 134)
- Reuse: the existing four-item pre-spawn checklist — two items appended, same format
- Code sample: append two items to that checklist, after the existing `{PLAN_FILE}` will be updated item
  ```
  - [ ] No two units in the same wave name a shared path in their `File:` sets
  - [ ] Every unit carrying a `GATE` task or a `Verify (global)` line stands as its own wave
  ```
- Do not touch: the four existing checklist items and the "Only proceed after all items are confirmed" line
- Edge cases: with one pending unit both new items hold trivially
- Acceptance: the pre-spawn gate checks the two properties that make a wave safe, not just the per-task ones
- Verify (local): `grep -c 'stands as its own wave' commands/ec-execute.md` → `== 1` (baseline 0) and `grep -c 'No two units in the same wave' commands/ec-execute.md` → `== 1` (baseline 0)
- Dependencies: none

**Task 10 — ec-refine: add the batched probe script section** `S`
- File: `commands/ec-refine.md`
- Anchor: `## Step 1 — Dry-run every Verify (local)` (line 39)
- Reuse: the read-only guarantee already established in the four lines beneath that heading — it is the precondition that makes one script safe
- Code sample: insert immediately BEFORE that heading
  ```
  ## Step 0.5 — Batched probe script
  Steps 1, 2 and 3 are all read-only probes over the same tree. Issued one call per task they are 130 round-trips on a 130-task plan — ten minutes of waiting for work that takes seconds. Emit ONE script holding every check, run it in a single call, and read the table it prints.

  ```bash
  probe() { printf '%s|%s|%s\n' "$1" "$2" "$(timeout 10 bash -c "$2" 2>&1 | tail -1)"; }
  # one probe line per check, for Steps 1, 2 and 3 together
  probe 'T1 verify'   'grep -c "foo" src/a.ts'
  probe 'T1 anchor'   'grep -n -F "export function foo" src/a.ts | head -1'
  probe 'grounding'   'wc -l < src/a.ts'
  probe 'T2 newfile'  'test -f src/b.ts; echo $?'
  ```

  Every probe is wrapped in `timeout 10`: batching means one hanging command would stall the whole audit instead of one round-trip. A probe that times out is UNVERIFIABLE, never a DEFECT.

  A command that would write, delete, or change git state is never put in the script at all — it is reported UNVERIFIABLE on sight, exactly as Step 1's table already requires.
  ```
- Do not touch: Step 1's verdict table and the read-only paragraph above it
- Edge cases: a plan with one task still runs through the script — there is no special case; a probe whose command is itself multi-line is quoted as one `bash -c` argument
- Acceptance: the audit's probes are defined as one batched run with a per-probe timeout, and write-capable commands are still excluded before execution
- Verify (local): `grep -c '## Step 0.5 — Batched probe script' commands/ec-refine.md` → `== 1` (baseline 0) and `grep -c 'timeout 10' commands/ec-refine.md` → `>= 1` (baseline 0)
- Dependencies: none

**Task 11 — ec-refine: route Step 1 through the batched script** `S`
- File: `commands/ec-refine.md`
- Anchor: `For each task, run its `Verify (local)` and compare:` (line 45)
- Reuse: the verdict table immediately below the anchor is unchanged — only how the observations are gathered changes
- Code sample: replace that one line with
  ```
  Collect every task's `Verify (local)` into the batched probe script above, run it once, then compare each observed value:
  ```
- Do not touch: the four-row verdict table and the no-numeric-threshold paragraph beneath it
- Edge cases: the table's UNVERIFIABLE row still applies to write-capable commands, which never enter the script
- Acceptance: Step 1 gathers its observations in one run and keeps its four verdicts unchanged
- Verify (local): `grep -c 'into the batched probe script above' commands/ec-refine.md` → `== 1` (baseline 0) and `grep -c 'equals the baseline recorded in' commands/ec-refine.md` → `== 1` (baseline 1, table must not change)
- Dependencies: Task 10 — the phrase "the batched probe script above" names a section that must already exist

**Task 12 — ec-refine: route Steps 2 and 3 through the same script** `S`
- File: `commands/ec-refine.md`
- Anchor: `## Step 2 — Re-measure Grounding against disk` (line 58)
- Reuse: the batched script from Task 10 — these probes go into the same run, not a second one
- Code sample: append one sentence to the Step 2 paragraph and one to the Step 3 paragraph
  ```
  These re-measurements belong in the same batched run as Step 1 — one script, one call, all three steps.
  ```
  and for Step 3
  ```
  These anchor greps belong in the same batched run as Steps 1 and 2.
  ```
- Do not touch: Step 4 and Step 5, and the drift and stale-plan wording in Steps 2 and 3
- Edge cases: a plan with no `Anchor:` lines contributes no anchor probes and the script is shorter — not an error
- Acceptance: all three read-only steps are stated as one batched run rather than three passes
- Verify (local): `grep -c 'same batched run' commands/ec-refine.md` → `== 2` (baseline 0)
- Dependencies: Task 10 — both sentences reference the batched run it defines

**Task 13 — ec-refine: add Step 4.5 honest-dependency check** `S`
- File: `commands/ec-refine.md`
- Anchor: `## Step 5 — Report and gate` (line 73)
- Reuse: the DEFECT/PASS/UNVERIFIABLE verdict vocabulary already defined in Step 1, and the `### Grounding` "new file — no anchor" marker already written by `/ec-plan`
- Code sample: insert immediately BEFORE that heading
  ```
  ## Step 4.5 — Confirm dependency edges are honest
  `/ec-execute` now levels `Dependencies:` into concurrent waves, so a missing edge no longer merely mis-orders work — it lets a task run before the file it edits exists. One case a plan may never get away with:

  For every task T whose `File:` is created by another task C in the same plan — C's `File:` equals T's and C is recorded in `### Grounding` as "new file — no anchor" — confirm T's `Dependencies:` names C, directly or transitively. A task that edits a file created by another task and declares `Dependencies: none` is a **DEFECT**: report it as a missing edge, naming both T and C.

  The reverse is not a defect. An edge that is present but unnecessary costs wave width, not correctness — report it as a note, never as a DEFECT, and never block the sentinel on it.

  This check is static: it reads the plan, runs nothing, and costs no time in the batched script.

  ```
- Do not touch: Step 5's reporting format, the DEFECT gate, and the sentinel-advance bash block
- Edge cases: a plan where no task creates a file has nothing to check and passes vacuously; a transitive edge (T → X → C) satisfies the rule
- Acceptance: a plan in which a task edits another task's newly created file without declaring the edge fails the audit by name
- Verify (local): `grep -c 'created by another task' commands/ec-refine.md` → `== 1` (baseline 0) and `grep -c '## Step 4.5 — Confirm dependency edges are honest' commands/ec-refine.md` → `== 1` (baseline 0)
- Dependencies: none

**Task 14 — ec-plan: add the batched probe script to the Grounding Pass** `S`
- File: `commands/ec-plan.md`
- Anchor: `## Step 2.5 — Grounding Pass (mandatory)` (line 222)
- Reuse: the same `probe()` idiom Task 10 adds to `/ec-refine` — one shape of probe serves both commands
- Code sample: insert as a new subsection after the four numbered measurement items and before the "Write all of it into the plan's `### Grounding` section" line
  ```
  ### Batched probe script
  Issue these measurements as ONE script, not one call per file or per task. A 130-task plan is several hundred read-only probes; as separate calls that is most of an hour of round-trips.

  ```bash
  probe() { printf '%s|%s|%s\n' "$1" "$2" "$(timeout 10 bash -c "$2" 2>&1 | tail -1)"; }
  probe 'lines src/a.ts'  'wc -l < src/a.ts'
  probe 'anchor T1'       'grep -n -F "export function foo" src/a.ts | head -1'
  probe 'count foo'       'grep -c -F "foo" src/a.ts'
  probe 'absent src/b.ts' 'test -f src/b.ts; echo $?'
  ```

  Every probe here is read-only, which is what makes batching safe. The output of the script IS the `### Grounding` content — transcribe it, never retype it from memory.
  ```
- Do not touch: the Traceability rule, the Count stability rule, and the `Only read-only commands are permitted here` line — `test_feature_grounding_is_read_only` asserts the last of those
- Edge cases: a probe whose anchor is absent prints an empty third field, which is exactly the signal that the anchor must be re-chosen before the plan is written
- Acceptance: the Grounding Pass is defined as one batched run whose output is transcribed into `### Grounding`
- Verify (local): `grep -c '### Batched probe script' commands/ec-plan.md` → `== 1` (baseline 0) and `grep -c 'MUST NOT run any command that writes' commands/ec-plan.md` → `== 1` (baseline 1, must not change)
- Dependencies: none

**Task 15 — ec-plan: restate Honest dependencies around wave levelling** `S`
- File: `commands/ec-plan.md`
- Anchor: `**Honest dependencies.**` (line 328)
- Reuse: the existing paragraph — extended, not replaced
- Code sample: replace the paragraph with
  ```
  **Honest dependencies.** A dependency means this task cannot start until that task's output exists. A straight 1→2→3→…→N chain is almost always fabricated, and `/ec-execute` LEVELS this field into waves of concurrent units — so a false edge directly narrows the wave and costs real minutes, while an empty value is a valid and common answer. One edge is mandatory: if this task edits a file another task in this plan creates, name that task. `/ec-refine` fails the plan for that omission, because under concurrency it would let this task run before the file exists.
  ```
- Do not touch: the `**Two kinds of verification.**` paragraph that follows and the `**Exception-only fields.**` paragraph above
- Edge cases: the string `no fabricated Task N-1 chain` lives in the Step 4 checklist, not here, so this rewrite cannot disturb it
- Acceptance: the plan template explains that false edges cost concurrency and names the one mandatory edge
- Verify (local): `grep -c 'LEVELS this field into waves' commands/ec-plan.md` → `== 1` (baseline 0) and `grep -c 'no fabricated Task N-1 chain' commands/ec-plan.md` → `== 1` (baseline 1, must not change)
- Dependencies: none

**Task 16 — ec-plan: explain why waves are derived not authored** `S`
- File: `commands/ec-plan.md`
- Anchor: `### Flat Format Rules (mandatory — no exceptions)` (line 253)
- Reuse: the existing rule already forbids `**Wave 1**` as a grouping construct — this adds the reason, not a new rule
- Code sample: insert as a new bullet at the END of the Flat Format Rules list
  ```
  - Why flat: `/ec-execute` groups the work itself, from `File:` and `Dependencies:`. Waves are derived at execution time, never authored — a hand-written grouping would freeze one ordering into the plan and override the only grouping that reflects the real graph
  ```
- Do not touch: the existing `NEVER write: "## Batch A", "### Phase 1"...` bullet, which the format tests depend on
- Edge cases: none — this is additive prose inside an existing list
- Acceptance: the flat-format rule carries the reason it exists, so a future editor does not "helpfully" add wave headers
- Verify (local): `grep -c 'derived at execution time, never authored' commands/ec-plan.md` → `== 1` (baseline 0)
- Dependencies: none

**Task 17 — ec-plan: add the created-file dependency rule to the template notes** `S`
- File: `commands/ec-plan.md`
- Anchor: `- Dependencies: {ONLY the tasks whose output this task genuinely requires`
- Reuse: the per-task template field list — the field's inline guidance is extended, no new field
- Code sample: extend that template line to
  ```
  - Dependencies: {ONLY the tasks whose output this task genuinely requires — "none" is the common and correct answer. Never write "Task N-1" merely because it precedes this one. The one edge that is never optional: the task that creates the file this task edits}
  ```
- Do not touch: every other field line in the template block
- Edge cases: a task that creates its own file has no such edge and keeps `none`
- Acceptance: the template field itself states the mandatory edge, so it is visible where tasks are written
- Verify (local): `grep -c 'the task that creates the file this task edits' commands/ec-plan.md` → `== 1` (baseline 0)
- Dependencies: none

**Task 18 — ec-plan: add self-review checklist item 21** `S`
- File: `commands/ec-plan.md`
- Anchor: `- [ ] Dependencies name only genuine prerequisites` (line 364)
- Reuse: the Step 4 checklist format, exactly as its 20 existing items
- Code sample: insert immediately AFTER that line
  ```
  - [ ] Every task that edits a file another task creates declares that edge
  ```
- Do not touch: the 20 existing checklist items and the "Fix any issues found, then present the plan." line
- Edge cases: `tests/test_command_docs.py:385` asserts the count is 20 and will fail until Task 21 lands — these two tasks are a single change split across two files
- ⚠️ Breaking change: `test_feature_self_review_checklist_has_twenty_items` fails between this task and Task 21. Both are in this plan, and the review gate runs the suite after all tasks
- Acceptance: the checklist holds 21 items, the new one naming the created-file edge
- Verify (local): `python3 -c "c=open('commands/ec-plan.md').read(); s=c.index('## Step 4 — Self-Review'); e=c.index('## Step 5 — Save Feature Intent'); print(len([l for l in c[s:e].splitlines() if l.startswith('- [ ]')]))"` → `21` (baseline 20)
- Dependencies: none

**Task 19 — ec-review: fan out the Stage 2 dimensions** `S`
- File: `commands/ec-review.md`
- Anchor: `After spec compliance is confirmed, review code quality on all modified files.` (under Stage 2, line 112)
- Reuse: the eight existing `###` gate subsections — each becomes one reviewer's brief, unchanged in content
- Code sample: insert immediately AFTER that line
  ```
  ### Reviewing the dimensions
  The gates below are independent: a security finding does not depend on a type-safety finding, and neither needs the other's output. Spawn one of these as concurrent reviewers **in a single message**, each over the same file set, then merge their findings into one list before fixing anything.

  Skip a gate that does not apply rather than spawning a reviewer that reports nothing — no Design Contract means no Visual Fidelity reviewer, no API calls means no API Error Handling reviewer. Merge first, fix second: two reviewers may land on the same line, and fixing as reports arrive would have them fighting over it.
  ```
- Do not touch: all eight gate subsections and the `Fix all issues found directly` line at the end of Stage 2
- Edge cases: a change touching one file with no UI and no API runs two or three reviewers, not eight; a single applicable gate is one reviewer and behaves as today
- Acceptance: Stage 2 states that applicable gates run concurrently and that findings merge before any fix is applied
- Verify (local): `grep -c 'concurrent reviewers' commands/ec-review.md` → `== 1` (baseline 0)
- Dependencies: none

**Task 20 — ec-review: state that concurrency relaxes no gate** `S`
- File: `commands/ec-review.md`
- Anchor: `### API Correctness (if docs available)` (line 166)
- Reuse: the definitive global gate already defined in Step 2 — this points at it rather than restating it
- Code sample: insert immediately BEFORE that heading
  ```
  Running the gates concurrently never relaxes a gate. Every gate above is applied in full, every finding is still fixed, and the definitive global gate in Step 2 still runs ONCE, serially, in the orchestrator — a build and a test suite must not race each other.

  ```
- Do not touch: `### API Correctness`, the `Fix all issues found directly` line, and the `### Definitive global gate` section in Step 2 — `test_review_has_definitive_gate_and_scope_boundary` asserts its wording
- Edge cases: none — additive prose
- Acceptance: the file states explicitly that fan-out changes scheduling only, and that the global gate stays serial and singular
- Verify (local): `grep -c 'never relaxes a gate' commands/ec-review.md` → `== 1` (baseline 0) and `grep -c 'this is the authoritative gate' commands/ec-review.md` → `== 1` (baseline 1, must not change)
- Dependencies: none

**Task 21 — tests: retarget the checklist-count test to 21 items** `S`
- File: `tests/test_command_docs.py`
- Anchor: `def test_feature_self_review_checklist_has_twenty_items(self):` (line 379)
- Reuse: the test body's slice-and-count logic is correct as written; only the expected number and the name change
- Code sample:
  ```python
      def test_feature_self_review_checklist_has_twenty_one_items(self):
          """The Step 4 checklist must keep all 21 rules."""
          start = self.content.index('## Step 4 — Self-Review Before Presenting')
          end = self.content.index('## Step 5 — Save Feature Intent to Memory')
          items = [line for line in self.content[start:end].splitlines()
                   if line.startswith('- [ ]')]
          assert len(items) == 21, f'checklist has {len(items)} items'
  ```
- Do not touch: the three sibling tests in `TestFeatureTemplateRules`
- Edge cases: the docstring says "20 rules" today and must move to 21 with the assertion, or the test lies about itself
- Acceptance: the suite asserts 21 checklist items and no test name or docstring still says twenty
- Verify (local): `grep -c 'assert len(items) == 21' tests/test_command_docs.py` → `== 1` (baseline 0) and `grep -c 'twenty_items' tests/test_command_docs.py` → `== 0` (baseline 1)
- Dependencies: Task 18 — the assertion is false until the 21st checklist item exists

**Task 22 — tests: add TestIndependenceScheduling for ec-execute** `S`
- File: `tests/test_command_docs.py`
- Anchor: `class TestExecuteTemplateRules:` (line 390)
- Reuse: the module's `read_command` helper and the one-class-per-concern layout
- Code sample: insert a new class immediately BEFORE `class TestExecuteTemplateRules:`
  ```python
  class TestIndependenceScheduling:
      """ec-execute levels the plan's DAG into concurrent waves. Each rule here
      is load-bearing: drop one and concurrency stops being provably safe."""

      def setup_method(self):
          self.content = read_command('ec-execute.md')

      def test_step3_is_wave_based_not_sequential(self):
          assert 'Execute in Dependency Waves' in self.content
          assert 'in document order' not in self.content

      def test_admission_rule_covers_dependencies_and_files(self):
          assert 'Wave admission' in self.content
          assert 'names any path in' in self.content

      def test_barriers_and_width_are_declared(self):
          assert 'WAVE_WIDTH' in self.content
          assert 'is admitted alone' in self.content
          assert 'degrades to waves of one' in self.content

      def test_wave_is_spawned_in_one_message(self):
          assert 'For each wave, in level order' in self.content
          assert 'in a single message' in self.content

      def test_global_invariants_stay_in_the_orchestrator(self):
          assert 'never runs inside a unit' in self.content

      def test_wave_failure_keeps_the_plan_file_accurate(self):
          assert '### Wave failure handling' in self.content
          assert 'Do NOT admit the next wave' in self.content

      def test_report_contract_bounds_orchestrator_context(self):
          assert 'three-line report' in self.content

      def test_fusion_survives_as_the_unit_builder(self):
          assert 'Fuse CONSECUTIVE' in self.content
          assert 'Hand the units to the wave scheduler' in self.content
  ```
- Do not touch: `class TestExecuteTemplateRules` and every other existing class
- Edge cases: `test_step3_is_wave_based_not_sequential` asserts absence, so it also guards against the serial instruction creeping back in a later edit
- Acceptance: the suite fails if any wave rule is removed from `ec-execute.md`, and still fails if the fusion section is deleted
- Verify (local): `grep -c 'class TestIndependenceScheduling' tests/test_command_docs.py` → `== 1` (baseline 0)
- Dependencies: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8 — every assertion reads a string those tasks write to `commands/ec-execute.md`

**Task 23 — tests: add refine, plan and review scheduling assertions** `S`
- File: `tests/test_command_docs.py`
- Anchor: `class TestIndependenceScheduling:` — inserted by Task 22
- Code sample: append a second class immediately after `TestIndependenceScheduling`
  ```python
  class TestBatchedProbesAndReviewFanout:
      """The other three stages walked their work serially too. Probes batch into
      one run; review gates fan out. Neither may weaken a check."""

      def test_refine_batches_its_probes_with_a_timeout(self):
          content = read_command('ec-refine.md')
          assert '## Step 0.5 — Batched probe script' in content
          assert 'timeout 10' in content
          assert 'same batched run' in content

      def test_refine_keeps_its_four_verdicts(self):
          content = read_command('ec-refine.md')
          for verdict in ['**DEFECT**', '**PASS**', '**UNVERIFIABLE**']:
              assert verdict in content, verdict

      def test_refine_checks_the_created_file_edge(self):
          content = read_command('ec-refine.md')
          assert '## Step 4.5 — Confirm dependency edges are honest' in content
          assert 'created by another task' in content

      def test_plan_batches_grounding_and_stays_read_only(self):
          content = read_command('ec-plan.md')
          assert '### Batched probe script' in content
          assert 'MUST NOT run any command that writes' in content

      def test_plan_explains_derived_waves(self):
          content = read_command('ec-plan.md')
          assert 'LEVELS this field into waves' in content
          assert 'derived at execution time, never authored' in content

      def test_review_fans_out_without_relaxing_a_gate(self):
          content = read_command('ec-review.md')
          assert 'concurrent reviewers' in content
          assert 'never relaxes a gate' in content
          assert 'this is the authoritative gate' in content
  ```
- Do not touch: `TestIndependenceScheduling` and every pre-existing class
- Edge cases: `test_refine_keeps_its_four_verdicts` guards the verdict vocabulary that Task 11's rewrite passes through, catching an over-eager replacement of Step 1
- Acceptance: the suite covers the refine, plan and review halves of the change and still asserts every gate that existed before it
- Verify (local): `grep -c 'class TestBatchedProbesAndReviewFanout' tests/test_command_docs.py` → `== 1` (baseline 0)
- Verify (global): `python3 -m pytest -q` → `183 passed` plus the 14 tests added by Tasks 22–23 → `197 passed` (baseline 183; the test file is the module boundary for the whole change)
- Dependencies: Task 10, Task 12, Task 13, Task 14, Task 15, Task 16, Task 19, Task 20, Task 22 — each assertion reads a string one of those tasks writes

**Task 24 — README: correct the ec-execute row** `S`
- File: `README.md`
- Anchor: `Menjalankan task berurutan beserta verifikasi lokalnya` (line 124)
- Reuse: the pipeline table's existing row format and Indonesian wording
- Code sample: replace the cell text with
  ```
  Menjalankan task dalam gelombang paralel beserta verifikasi lokalnya
  ```
  leaving the rest of the row — the link, the command name, and the output column — untouched.
- Do not touch: the mermaid diagram at lines 105–106 and every other table row
- Edge cases: the table uses `|` separators, so the replacement must not introduce one
- Acceptance: the README no longer describes execution as sequential
- Verify (local): `grep -c 'gelombang paralel' README.md` → `== 1` (baseline 0) and `grep -c 'Menjalankan task berurutan' README.md` → `== 0` (baseline 1)
- Dependencies: none
