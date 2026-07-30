# Review Summary — Durable Auto-Flow: Stage State on Disk + Stop-Hook Driver
_Date: 2026-07-30_

## Feature
Durable Auto-Flow — Stage State on Disk + Stop-Hook Driver

## Tasks completed
- [x] Task 1: Add auto-flow driver to session_stop hook [L] [agent: ec-python] — add sentinel parse/write, branch + plan-progress readers, state-file routing, stall/cap guards, and JSON block emission; rewire main() to preserve all legacy behaviour
- [x] Task 2: Extend sentinel schema and writer in ec-brainstorm [M] — document the 7-field schema and make Step 7 write stage=feature, stages_done=, iterations=0
- [x] Task 3: Advance stage to execute at end of ec-feature [S] — write stage=execute and append feature to stages_done when planning completes
- [x] Task 4: Advance stage to review at end of ec-execute [S] — write stage=review and append execute to stages_done when all tasks complete
- [x] Task 5: State chain-end semantics in ec-review [S] — record that deleting the sentinel is the driver's chain-complete signal and that the driver never routes to git
- [x] Task 6: Unit-test the auto-flow driver [M] [agent: ec-unit-test] — cover parse, routing precedence, git exclusion, stall detection, iteration cap, stale sentinel, and stop_hook_active
- [x] Task 7: Doc-test sentinel schema and backward compatibility [S] [agent: ec-unit-test] — assert the schema appears in the command docs and that existing grep '^branch=' readers still match
- [x] Task 8: Sync source to installed copies [S] — copy the hook and four command files to ~/.efficlaude/hooks/ and ~/.claude/commands/

## Files modified
- `hooks/session_stop.py` — new auto-flow driver block (`AUTOFLOW_PATH`, `AUTOFLOW_MAX_AGE`, `AUTOFLOW_MAX_ITERATIONS`, `AUTOFLOW_MAX_NO_PROGRESS`, `_SENTINEL_ORDER`, and `_parse_sentinel` / `_write_sentinel` / `_current_branch` / `_plan_counts` / `_next_autoflow_command` / `_autoflow_end` / `autoflow_driver` / `_read_hook_input`); `main()` split into `_legacy_main(quiet=False)` + a new `main()`
- `commands/ec-brainstorm.md` — 8-field sentinel schema table with per-field write attribution and the progress-signal rule; Step 7 writer emits five lines; Step 3 `auto` bullet notes context-loss survival
- `commands/ec-feature.md` — Auto-Flow stage advance to `execute` at end of Step 6
- `commands/ec-execute.md` — Auto-Flow stage advance to `review` after lock release; `AUTO=yes` paragraph documents mid-plan resume
- `commands/ec-review.md` — chain-end semantics: sentinel deletion is the driver's "chain complete" signal; driver never routes to git
- `tests/test_hooks.py` — `TestAutoflowDriver`, `TestNoProgressTolerance`, `TestSentinelIO`, `TestPlanCounts`
- `tests/test_command_docs.py` — `TestAutoflowSentinelSchema`, including the `^branch=` backward-compatibility proof
- Installed copies: `~/.efficlaude/hooks/session_stop.py`, `~/.claude/commands/ec-{brainstorm,feature,execute,review}.md`

Blast radius: no dependents found — isolated change. Nothing in the repo imports the hook module, and the command files are Markdown with no import graph.

## Issues fixed during review

### Stage 1 — Spec compliance
All 8 tasks matched their specification. No over-building, no under-building against the plan text, correct reuse (`_warn`, the `subprocess.run` git pattern, `read_command`, the existing hook-test idiom), correct file paths, DO-NOT-TOUCH boundaries respected on every task.

Three defects in the **plan's own verify steps** were found during execution and corrected in `.claude/plans/main.md`. Subagents reported threshold mismatches rather than padding files to pass — the intended behaviour:
1. `grep -c 'stage=execute'` / `'stage=review'` can never match: the inserted blocks use Python assignment syntax `f["stage"] = "execute"`.
2. Asserting `reason` never contains `/ec-git` is unsatisfiable — the reason string deliberately ends with the negative instruction "Never run git — the chain stops before /ec-git." Replaced with the real invariant: `_next_autoflow_command` never *returns* `/ec-git`.
3. `driver_stage=` / `driver_progress=` are documented as backticked names in a schema table, not as `key=value`; and `7200` never appears in `ec-brainstorm.md` (it lives in the three reader files, once each).

### Stage 1.5 — Template drift
✓ GIT RULES in sync — all four rules identical between `CLAUDE.md` and the `commands/ec-setup.md` template.

### Stage 2 — Code quality
**One major defect found and fixed: the stall guard abandoned legitimate multi-turn stages.**

Pre-fix, `hooks/session_stop.py` ended the chain on the *second* consecutive turn without progress:
```python
if seen_stage is not None and stage == seen_stage and progress <= seen_progress:
    _autoflow_end(path, ...)
    return None
```
`/ec-execute` was safe because each completed task bumps the plan's `- [x]` count, but `/ec-feature` and `/ec-review` emit no incremental progress signal — a planning or review stage spanning two context windows would be wrongly abandoned. That reintroduces the exact class of failure this feature exists to eliminate, and violates the decision file's stated risk mitigation that the guard must not wrongly kill a resume.

Fix applied:
- `hooks/session_stop.py` — added `AUTOFLOW_MAX_NO_PROGRESS = 3` and a driver-written `no_progress` sentinel field (added to `_SENTINEL_ORDER`). The counter increments on a stalled turn and resets to `0` on real progress or a stage change; only on the 3rd consecutive stalled turn does the chain end. The blocking `reason` gains a warning sentence once the counter is non-zero.
- `commands/ec-brainstorm.md` — schema table extended to eight fields, documenting `no_progress` and the progress-signal rule.
- `tests/test_hooks.py` — added `TestNoProgressTolerance` (17 tests). Removed two superseded `TestAutoflowDriver` tests that encoded the old one-turn contract (`test_returns_none_when_stage_makes_no_progress`, `test_deletes_sentinel_when_stage_makes_no_progress`); the new class asserts the same end state at the corrected threshold.
- Installed copies re-synced.

Other Stage 2 checks: no secrets or dangerous patterns; no unused imports; no dead code or debug leftovers (the four `print()` calls are the debug-gated stderr path, the pre-existing legacy warning, and the two hook-contract emissions). Type safety and accessibility not applicable — Python hooks and Markdown, no UI. No API calls added, so the API error-handling and API-correctness checks do not apply.

## Verification evidence
- `python3 -m pytest tests/ -q` → **139 passed, 0 failed** (baseline before this feature: 62 passed)
- `diff -q` source vs installed → `SYNCED` for the hook and all four command files
- End-to-end smoke test against the **installed** hook in a throwaway git repo: emits `decision: block` routing to `/ec-feature`; tolerates 2 stalled turns; abandons on the 3rd with log line `chain ended: no progress for 3 turns at stage=feature progress=0`; counter resets to `0` the moment a task is marked `[x]`
- Live sentinel isolation held throughout — every subagent test used `tmp_path` + `monkeypatch.chdir`, and the real `.claude/.autoflow` mtime was byte-identical across suite runs

## Known open item
The end-to-end proof that Claude Code's `Stop` hook honours `{"decision":"block","reason":...}` remains **unverified** — this was the decision file's stated key assumption and cannot be tested from inside a subagent. The unit tests prove the driver returns the correct payload, not that the harness acts on it. The next real `auto` run settles it; `~/.efficlaude/efficlaude.log` records an `[autoflow] resuming /ec-…` line each time the driver fires. If the contract turns out unsupported, `EFFICLAUDE_AUTOFLOW_MODE=exit2` switches to the exit-code-2 + stderr mechanism with no code change.

## Carried forward from the previous cycle (still open, still out of scope)
`/ec-review` Stage 1 verifies output against the task description and code sample but still does not instruct a check of the per-task `Acceptance:` field. This review enforced Acceptance manually via subagent prompts, but the command file remains unchanged. Recorded again so it is not lost.

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ |
| Template drift (GIT RULES) | ✓ in sync |
| Tests | added — 139 passed, 0 failed |
