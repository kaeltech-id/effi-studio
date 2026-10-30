# Review Summary — Proof Mode
_Date: 2026-10-30_

## Feature
Proof Mode — pisahkan "mengubah" dari "membuktikan" di plan/refine/execute

## Tasks completed
All 13 tasks `- [x]` (see `.claude/plans/archive/`). Waves: 3.

## Files modified
- `commands/ec-brainstorm.md`, `commands/ec-plan.md`, `commands/ec-refine.md`,
  `commands/ec-execute.md`, `commands/ec-review.md`, `tests/test_command_docs.py`
- `hooks/session_stop.py` — **outside the plan's declared File: set**, added during review
Blast radius: no dependents — isolated change.

## Issues fixed during review
Stage 1 clean; evidence audit 13/13 at execution time.

Stage 2 found severe defects in what had just shipped. Two independent reviewers;
every claim below was verified against the files before fixing.

**Blocking — the mode was unusable as shipped**
- `handoff` skipped every grounding baseline, but `/ec-refine` Step 1 can only
  reach its PASS row via a recorded baseline. The first real `handoff` plan using
  `grep -c` would be reported DEFECT, the chain would delete its own sentinel, and
  `/ec-plan` would regenerate the identical plan. Deadlock. This plan's own tasks
  used that exact pattern. → per-string baselines are now explicitly still recorded.
- The allowed-check whitelist (`ec-plan`) and the forbidden-verb blacklist
  (`ec-refine`) were not complements: `npm test`, `jest`, `vitest`, `go build`,
  `make`, `eslint`, `ruff`, `mypy` were on neither, so they passed refine and burned
  the wall-clock the mode exists to remove; while `wc -l`, `ls`, `jq`, `test -d`
  were cheap but unlisted, so correct plans were rejected by the letter.
  → one authoritative allowed-check rule in `ec-plan`, referenced by name elsewhere.
- `/ec-review` on `handoff` would reach for `cargo check` as the "equivalent"
  type-check — a 35.97s Rust compile, the very measurement used to draw the line.
- "a task carries exactly six lines / `Anchor` never dropped" contradicted
  `Anchor` being exception-only, so authors would write `Anchor: new file` on every
  new-file task and the plan lint would flag every one. → "six core lines" plus the
  exception-only lines, with `Anchor`'s own exception restored.
- Four unconditional checklist items (traceability, Acceptance, measured
  thresholds, API error handling) demanded the opposite of the `handoff` rules.
- The mode was never parsed on the saved-brainstorms path, and `/ec-review` deletes
  the decision file on a clean review — so a declared `in-cycle` silently became
  `handoff` and the record was destroyed. → the mode is now stamped into the plan
  file, which all four commands read and which survives both deletion paths.
- The `### Handoff` block — the deliverable of the whole mode — was written at plan
  time and never surfaced again; `/ec-execute`'s read order skips it and `/ec-review`
  never printed it. → `/ec-review` now echoes it verbatim in the report and summary.
- Nothing checked that a rejected proof step reappears in `### Handoff`, so deleting
  a proof step was the cheapest way to pass the gate — the exact decay path the
  guard class claims to prevent.
- "build the DMG" under the default mode pitted the never-overridden deliverable
  rule against the no-build checklist item, with no resolution. → escalate to
  `in-cycle` when the requested deliverable IS the artifact.
- Authoring a test is *changing*, not *proving*, so skipping the whole unit-test
  gate on `handoff` smuggled a scope decision into a proof decision. → the offer
  stands in both modes; only a slow suite moves to Handoff.

**Security — the new guardrail did not hold**
- The outward-facing confirmation bound the orchestrator, but subagents run the
  commands and the Step 4 prompt list never mentioned it — and pre-flight cannot
  even see `Code sample`, because Step 1 deliberately skips `### Per Task Detail`.
- `hooks/session_stop.py` injected "Do not stop. Invoke /ec-execute now and continue
  the chain to completion" with no carve-out for a pending confirmation. That is the
  only part of the system running as code, so it outranked the prose rule. Observed
  first-hand: this session received that message repeatedly.
  → `.claude/.awaiting-confirm-{branch}` makes the driver stay silent; proven at runtime.
- "auto-skip confirmation gates" was unqualified in `ec-execute` and `ec-plan`.
- The trigger set was a closed enumeration; `$HOME`, `~/.claude/`, messaging APIs,
  non-production datastores and global package installs all fell outside it, and a
  self-assessed read-only carve-out failed open. → principle over enumeration,
  ambiguity resolves to asking, no read-only escape.
- A denial routed straight into "Retry / Skip / Fix manually?" with nothing
  recording it. → `- [~]` marks a denied task durably.

**Tests** 122 → 137. Four shipped guards were near-vacuous and were rewritten:
`test_handoff_defaults_when_undeclared` asserted only that the word `handoff`
appeared somewhere in a file containing it 15 times — it would have passed on
"never default to handoff" and could not have caught the bug its own name describes.
All 19 Proof Mode guards were then mutation-tested: 14 mutations, every one caught,
after tightening one assertion that passed because a substring survived elsewhere.

## Known gaps, deliberately not closed
- `hooks/session_stop.py` edit takes effect only after `bash install.sh`; the
  running copy is `~/.efficlaude/hooks/session_stop.py`.
- No `PreToolUse` hook denies `ssh`/`kubectl`/`terraform` by default. The rule is
  still prose plus a sentinel; a real deny-by-default gate would be the actual
  control. Flagged, not built — it changes how the toolkit permissions behave.
- `.claude/decisions/main.md` listed "changing /ec-brainstorm" as a Non-Goal while
  Task 1 edits it. The edit is right; the non-goal was wrong.
- `studio/VERIFICATION.md:173` still reads "no DMG was built", false since the
  previous cycle. Out of scope both times.

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ after fixes |
| Security | ✓ after fixes (2 gaps flagged above) |
| Tests | 15 guards added · suite 265 passed, 0 failed |
| Compilation | n/a — no `.ts`/`.tsx`/`.rs` touched; deferred by design on `handoff` |
