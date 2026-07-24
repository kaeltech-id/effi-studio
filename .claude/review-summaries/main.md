# Review Summary — Grounded Artifacts: Evidence-Backed Decisions + Calibrated Plans
_Date: 2026-07-24_

## Feature
Grounded Artifacts — Evidence-Backed Decisions + Calibrated Plans

## Tasks completed
- [x] Task 1: Deepen ec-brainstorm decision template [M] [agent: ec-llm] — add Evidence, scored Options table, Constraints & Non-Goals, Verification Strategy, Open Questions; wire Step 2 to fill them
- [x] Task 2: Grounding Pass and task fields in ec-feature [L] [agent: ec-llm] — add read-only Grounding Pass, `## Grounding` plan section, four new per-task fields, traceability rule, self-review items
- [x] Task 3: Propagate Anchor and Acceptance in ec-execute [M] [agent: ec-llm] — inject the new fields into subagent prompts and enforce them in the Evidence Rule
- [x] Task 4: Tests for grounded artifacts [M] [agent: ec-python] — add TestGroundedArtifacts covering all three commands

## Files modified
- `commands/ec-brainstorm.md` — `**Record the evidence:**` directive in Step 2; decision template gained `## Evidence`, a scored `## Options Explored` table, `## Constraints`, `## Non-Goals`, `## Verification Strategy`, `## Open Questions`; template edge-case block
- `commands/ec-feature.md` — No-Code Rule extended with an explicit read-only allowance; new `## Step 2.5 — Grounding Pass (mandatory)` with the Traceability rule; `### Grounding` section in the plan template; per-task template extended to 11 fields (Anchor / Do not touch / Acceptance / Rollback added); 4 new self-review checklist items
- `commands/ec-execute.md` — 3 new subagent-prompt bullets (Anchor, Do not touch, Acceptance); Evidence Rule extended to items 1–9 including the Acceptance check and the Threshold-mismatch STOP rule; new `### Anchor Discipline` subsection
- `tests/test_command_docs.py` — new `TestGroundedArtifacts` class, 10 tests

Blast radius: no dependents — all changed command files are Markdown with no import graph; the test module imports only stdlib plus pytest.

## Issues fixed during review
- `commands/ec-feature.md` Step 4 checklist — the item read "Every task has an Anchor that was confirmed to exist by the Grounding Pass", which contradicts the per-task template's allowance of `Anchor: new file` where there is nothing to confirm → reworded to "…, or reads \"new file\"".

## Gap flagged for the next cycle (not fixed here — deliberately out of the executed plan's scope)
`/ec-review` Stage 1 verifies output against the task description and code sample, but does not yet check the new `Acceptance:` field. A task can therefore still pass review on command output alone, which is precisely the hole `Acceptance` exists to close in `/ec-execute`. Widening the edit during review would violate the Anchor Discipline rule this same feature just introduced, so it is recorded here instead.

## Threshold calibration outcome
Every Verify threshold in this plan was derived from a measured pre-change baseline recorded in the plan's `### Grounding` section, and every one hit exactly: Evidence `== 2`, Grounding Pass `== 1`, Anchor/Acceptance/Rollback `== 1` each, `[design:` unchanged at `5`, Anchor in ec-execute `== 2`, tests `52 → 62`. One threshold was caught wrong during plan self-review (Task 3's `Anchor:` count was written as `>= 3` when the specified edits produce 2) and corrected before execution. No subagent padded a file to satisfy a number — the over-building failure from the previous cycle did not recur.

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ |
| Template drift (GIT RULES) | ✓ in sync |
| Tests | added — 10 new, 62 passed |
