# Review Summary — Design Direction — anti-slop as the second branch of Design Contract
_Date: 2026-09-10_

## Feature
Design Direction — anti-slop as the second branch of Design Contract

## Tasks completed
- [x] Task 1: Create ec-antislop agent file [M] [agent: ec-llm] — new agent carrying the dials, distilled rules, and attribution
- [x] Task 2: Register ec-antislop in install.sh [S] — append to the AGENTS array
- [x] Task 3: Branch ec-brainstorm carry-forward to Design Direction [S] [agent: ec-llm] — replace the one-line no-reference fallback
- [x] Task 4: Add Design Direction section to the decision template [S] [agent: ec-llm] — sibling of the Design Contract template block
- [x] Task 5: Teach ec-feature to load a Design Direction decision [S] [agent: ec-llm] — recognise the block when loading the decision file
- [x] Task 6: Emit Design Direction on the ec-feature skip branch [S] [agent: ec-llm] — replace the "no fidelity claim" dead end
- [x] Task 7: Add Design Direction block to the plan template [S] [agent: ec-llm] — with the mutual-exclusivity rule
- [x] Task 8: Add Design Direction rows to the ec-feature self-review checklist [S] [agent: ec-llm] — Step 4 gate entries
- [x] Task 9: Generalise the ec-execute injection heading [M] [agent: ec-llm] — inject whichever design block the plan contains
- [x] Task 10: Add the Anti-Slop gate to ec-review Stage 2 [M] [agent: ec-llm] — conditional on a Design Direction block
- [x] Task 11: Add the Anti-Slop line to the ec-review summary block [S] [agent: ec-llm] — report row beside the existing gates
- [x] Task 12: Add the precedence clause to 4 web frontend agents [S] [agent: ec-llm] — ec-react, ec-vue, ec-nextjs, ec-tailwind
- [x] Task 13: Add the precedence clause to 4 mobile frontend agents [S] [agent: ec-llm] — ec-react-native, ec-flutter, ec-ios, ec-android
- [x] Task 14: Add the Design Direction test class [M] [agent: ec-unit-test] — propagation-chain and mutual-exclusivity tests
- [x] Task 15: Add the agent-bloat guard test [S] [agent: ec-unit-test] — assert frontend agents stayed small
- [x] Task 16: Sync installed copies [S] — copy changed commands and agents into ~/.claude

## Files modified
- `agents/ec-antislop.md` (new)
- `install.sh`
- `commands/ec-brainstorm.md`
- `commands/ec-feature.md`
- `commands/ec-execute.md`
- `commands/ec-review.md`
- `agents/ec-react.md`, `ec-vue.md`, `ec-nextjs.md`, `ec-tailwind.md`, `ec-react-native.md`, `ec-flutter.md`, `ec-ios.md`, `ec-android.md`
- `tests/test_command_docs.py`
- installed copies under `~/.claude/commands/` and `~/.claude/agents/`

Blast radius: no dependents found — isolated change.

## Issues fixed during review
1. **`commands/ec-feature.md:223,259` — feature was inert on its own path.** Both `[design:]` tag definitions sourced `{source}` exclusively from the Design Contract Source line, which a Design Direction block does not have. No UI task on the no-reference path would have carried a design tag, and `commands/ec-execute.md` Step 0 fires the Direction branch only for tagged tasks — so the Design Direction block would never have been injected. Fixed by defining the literal sentinel `direction` as `{source}` on that path at both rule sites, and clarifying it in `commands/ec-execute.md:152`.
2. **`commands/ec-brainstorm.md:224`, `commands/ec-feature.md:291` — unreachable path in consumer projects.** Both Design Direction templates referenced the repo-relative `agents/ec-antislop.md`, which exists only inside the EffiClaude repo. Fixed to the installed `~/.claude/agents/ec-antislop.md`, matching the injection prompt and the agent precedence clause.

Three regression tests added to pin both fixes.

## Out of scope — pre-existing bug found, not fixed
`hooks/session_stop.py:212` treats `.claude/.review-done-{branch}` as an unconditional "chain complete" signal with no freshness check. This repo carried a stale marker from Aug 11, so the driver deleted `.claude/.autoflow` on the first Stop of this run. Unlike the sentinel (2-hour staleness guard), that marker never expires — one leftover file permanently disables auto-flow resume on a branch.

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ (2 issues fixed) |
| Code quality | ✓ |
| Tests | added — 124 passed, 0 failed |
