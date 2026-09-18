## Feature: Design Direction — anti-slop as the second branch of Design Contract

### Impact Analysis
- Files affected: `agents/ec-antislop.md` (new), `install.sh`, `commands/ec-brainstorm.md`, `commands/ec-feature.md`, `commands/ec-execute.md`, `commands/ec-review.md`, `agents/ec-react.md`, `agents/ec-vue.md`, `agents/ec-nextjs.md`, `agents/ec-react-native.md`, `agents/ec-tailwind.md`, `agents/ec-flutter.md`, `agents/ec-ios.md`, `agents/ec-android.md`, `tests/test_command_docs.py`, installed copies under `~/.claude`
- ⚠️ Breaking change risk: `commands/ec-execute.md` `### Design Contract Injection` is the propagation path for every existing UI task. Generalising it must leave the Design Contract branch byte-identical in behaviour, or every reference-backed feature regresses. Task 10 is additive only — a second branch beside the existing one, never a rewrite of it.

### Reusable Existing Code
- `### Design Contract Injection` at `commands/ec-execute.md:147` — the per-task block-injection mechanism; Design Direction reuses it rather than adding a parallel path
- `### Visual Fidelity (if the plan has a Design Contract)` at `commands/ec-review.md:133` — the conditional-gate pattern the Anti-Slop gate copies
- `## Visual Fidelity Protocol` at `agents/ec-react.md:50` — the agent-protocol section shape the precedence clause sits beside
- `FRONTEND_AGENTS` list at `tests/test_command_docs.py:105` — existing frontend-agent fixture, extended rather than duplicated
- `AGENTS=(...)` array at `install.sh:15` — existing agent install loop; `ec-antislop` is appended, no new loop

### Grounding
Measured 2026-09-10 — real command output only.
- Baseline string counts:
  - `grep -c "Design Direction" commands/ec-brainstorm.md` → 0
  - `grep -c "Design Direction" commands/ec-feature.md` → 0
  - `grep -c "Design Direction" commands/ec-execute.md` → 0
  - `grep -c "Design Direction" commands/ec-review.md` → 0
  - `grep -c "Design Direction" tests/test_command_docs.py` → 0
  - `grep -c "ec-antislop" install.sh` → 0
  - `grep -c "Anti-Slop" agents/ec-react.md` → 0 (same for ec-vue, ec-nextjs, ec-react-native, ec-tailwind, ec-flutter, ec-ios, ec-android)
  - `grep -c "^class Test" tests/test_command_docs.py` → 5
  - `grep -c "^- \[ \] " commands/ec-feature.md` → 16 (3 task-template lines + 13 checklist rows)
- Baseline line counts: `wc -l` → ec-brainstorm.md 296 · ec-feature.md 395 · ec-execute.md 259 · ec-review.md 268 · install.sh 265 · tests/test_command_docs.py 283 · ec-react.md 75 · ec-vue.md 65 · ec-nextjs.md 65 · ec-react-native.md 68 · ec-tailwind.md 55 · ec-flutter.md 70 · ec-ios.md 62 · ec-android.md 65
- Baseline test result: `python3 -m pytest -q` → 112 passed, 1 warning
- Verified anchors:
  - `agents/ec-antislop.md` → new file — no anchor
  - `AGENTS=("ec-react"` → `install.sh:15`
  - `record the single line` → `commands/ec-brainstorm.md:81`
  - `## Design Contract` (decision template) → `commands/ec-brainstorm.md:206`
  - `do not re-ask question 2` → `commands/ec-feature.md:65`
  - `**If skip and the feature has UI scope:**` → `commands/ec-feature.md:138`
  - `### Design Contract` (plan template) → `commands/ec-feature.md:272`
  - `- [ ] Design Contract is present and self-contained` → `commands/ec-feature.md:346`
  - `### Design Contract Injection` → `commands/ec-execute.md:147`
  - `### Visual Fidelity (if the plan has a Design Contract)` → `commands/ec-review.md:133`
  - `FRONTEND_AGENTS = [` → `tests/test_command_docs.py:105` (parametrized at line 150; `ec-tailwind` exception pinned at line 156)
  - `- Accessibility:   ✓/✗ (UI only)` → `commands/ec-review.md:198`
  - `## Visual Fidelity Protocol` → ec-react.md:50 · ec-vue.md:42 · ec-nextjs.md:40 · ec-react-native.md:42 · ec-tailwind.md:37 · ec-flutter.md:45 · ec-ios.md:37 · ec-android.md:40 (all 8 confirmed present)

### Tasks
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

### Per Task Detail

**Task 1 — Create ec-antislop agent file** `M`
- File: `agents/ec-antislop.md` (create)
- Anchor: new file — no anchor
- Reuse: frontmatter shape from `agents/ec-reviewer.md` (`name`, `description`, `tools`)
- Code sample:
```markdown
---
name: ec-antislop
description: Distilled anti-slop design ruleset. Invoked when UI is built with no visual reference — supplies dials, hard gates, and purpose gates.
tools: Read, Grep, Glob
---

Distilled from github.com/miqdadbadjuber/anti-slop (paraphrased, 2026-09-10). Applies ONLY when the plan carries a `### Design Direction` block. When the plan carries a `### Design Contract`, that contract wins outright and this file is silent.

## Dials
Every UI declares three dials, 1=Calm 2=Balanced 3=Bold:
| Dial | 1 | 2 | 3 |
|---|---|---|---|
| ENERGY | restrained, GOV.UK | Stripe, Vercel | showcase |
| RHYTHM | uniform grid | consistent with breaks | asymmetric, mixed |
| MOTION | hover only | scroll reveal | parallax, choreography |

## Hard Gates — breaking one is a failure
- No em dashes in UI copy
- No invented numbers or statistics — omit rather than fabricate
- No AI avatars, invented person names, or fictional testimonials
- Confirm assets exist before referencing them; use labelled placeholders
- Nav links point only to sections or pages that exist
- Every button, link, and form has real behaviour or is removed
- Microcopy and FAQ entries are product-specific, never template filler
- No fabricated security, compliance, or performance claims
- Mobile layout has no overflow, clipping, or broken state
- If a theme toggle exists, both themes are fully implemented

## Purpose Gates — allowed only with a written one-line reason
- Gradient or glow: max 2 elements, stated hierarchy or brand purpose
- Glassmorphism: max 2 elements, never navbar + cards + modal together
- Icons: content-relevant only, no decorative sparkles
- Animation: stated UX purpose, and must match the declared MOTION dial
- Shadow: expresses elevation, never decorative float

## Quality Locks
- No AI template layouts: hero + 3 identical cards, 3-step "How It Works", bento grid, fake terminal, 3 pricing tiers, generic footer
- CTAs name the product action, never "Get Started"
- No buzzwords: AI-Powered, Seamless, Revolutionary, Effortless
- Max 2-3 core colors plus 1 accent
- Do not clone Linear, Vercel, Stripe, Notion, or Apple
- Radius consistent with the system — not every element pill-shaped
- Feature cards vary by hierarchy, not identical size, icon, and padding

## Reporting
Every purpose-gate use and every major design decision is reported as one line: "Reason: {what} — {why}". A reason that does not match the built code is a failure, not a pass.
```
- Do not touch: any existing file in `agents/`
- Edge cases: n/a — static prompt file
- ⚠️ Breaking change: none — new file, referenced by nothing until Task 9
- Acceptance: the file exists with valid frontmatter, the three dials, and the three rule tiers
- Verify: `test -f agents/ec-antislop.md && grep -c "^## " agents/ec-antislop.md` → `== 5` (Dials, Hard Gates, Purpose Gates, Quality Locks, Reporting)
- Rollback: `rm agents/ec-antislop.md`
- Dependencies: none

**Task 2 — Register ec-antislop in install.sh** `S`
- File: `install.sh`
- Anchor: `AGENTS=("ec-react"` → `install.sh:15`
- Reuse: existing `for agent in "${AGENTS[@]}"` loop at `install.sh:79` — no new loop
- Code sample: append `"ec-antislop"` as the final element of the `AGENTS=(...)` array on line 15
- Do not touch: `SERVER_FILES`, `HOOK_FILES`, the install loops themselves
- Edge cases: n/a
- ⚠️ Breaking change: none — additive array element
- Acceptance: a fresh install copies `ec-antislop.md` into `~/.claude/agents/`
- Verify: `grep -c "ec-antislop" install.sh` → `== 1` (baseline 0, one element added)
- Rollback: `git checkout -- install.sh`
- Dependencies: Task 1

**Task 3 — Branch ec-brainstorm carry-forward to Design Direction** `S`
- File: `commands/ec-brainstorm.md`
- Anchor: `record the single line` → `commands/ec-brainstorm.md:81`
- Reuse: none
- Code sample: replace the trailing sentence of line 81 so the no-reference branch reads:
```
If no reference was supplied, do NOT write a Design Contract — draft a `## Design Direction` section instead using the field list in the decision template in Step 5, inferring the three dials from the problem description. A decision file carries a Design Contract or a Design Direction, never both.
```
- Do not touch: the reference-supplied half of line 81, which must keep drafting a Design Contract unchanged
- Edge cases: non-UI features produce neither block — leave that path untouched
- ⚠️ Breaking change: none — only the previously-dead no-reference branch changes
- Acceptance: the no-reference branch instructs a Design Direction and states mutual exclusivity
- Verify: `grep -c "Design Direction" commands/ec-brainstorm.md` → `>= 1` (baseline 0; Task 4 adds more to the same file)
- Rollback: `git checkout -- commands/ec-brainstorm.md`
- Dependencies: none

**Task 4 — Add Design Direction section to the decision template** `S`
- File: `commands/ec-brainstorm.md`
- Anchor: `## Design Contract` → `commands/ec-brainstorm.md:206`
- Reuse: the field-list shape of the `## Design Contract` template block directly above
- Code sample: insert immediately after the Design Contract template block ends:
```
## Design Direction
_Include this section only when the problem has UI/frontend scope AND no visual reference was supplied. Mutually exclusive with ## Design Contract._
- Dials: ENERGY {1-3} · RHYTHM {1-3} · MOTION {1-3} — {one-line reason for each}
- Palette: {2-3 core colors + 1 accent, hex} — {reason}
- Typography: {headline face, body face, scale} — {reason}
- Identity motif: {the repeated gesture or pattern specific to this product}
- Rules: apply agents/ec-antislop.md in full — hard gates, purpose gates, quality locks
```
- Do not touch: the `## Design Contract` template block itself
- Edge cases: no UI scope → section omitted entirely
- ⚠️ Breaking change: none
- Acceptance: the decision template offers Design Direction as a documented sibling section
- Verify: `grep -c "^## Design Direction$" commands/ec-brainstorm.md` → `== 1` (baseline 0)
- Rollback: `git checkout -- commands/ec-brainstorm.md`
- Dependencies: Task 3

**Task 5 — Teach ec-feature to load a Design Direction decision** `S`
- File: `commands/ec-feature.md`
- Anchor: `do not re-ask question 2` → `commands/ec-feature.md:65`
- Reuse: the existing decision-loading bullet directly above
- Code sample: add a sibling bullet immediately after line 65:
```
- If the decision file contains a `## Design Direction` section, load it verbatim as the starting Design Direction and skip question 2 entirely — the user already declined a reference at brainstorm time. A plan carries a Design Contract or a Design Direction, never both.
```
- Do not touch: line 65 itself — the Design Contract loading rule stays byte-identical
- Edge cases: decision file with neither block → existing behaviour unchanged
- ⚠️ Breaking change: none — additive bullet
- Acceptance: a Design Direction decision reaches `/ec-feature` without re-asking for a reference
- Verify: `grep -c "Design Direction" commands/ec-feature.md` → `>= 1` (baseline 0; Tasks 6-8 add more to the same file)
- Rollback: `git checkout -- commands/ec-feature.md`
- Dependencies: Task 4

**Task 6 — Emit Design Direction on the ec-feature skip branch** `S`
- File: `commands/ec-feature.md`
- Anchor: `**If skip and the feature has UI scope:**` → `commands/ec-feature.md:138`
- Reuse: none
- Code sample: replace line 138 with:
```
   **If skip and the feature has UI scope:** write no Design Contract. Build a `### Design Direction` block instead, inferring the three dials from the feature description and stating a one-line reason for each; the plan then carries a Design Direction and no `### Design Contract`.
```
- Do not touch: line 140 (`**If the feature has no UI scope:**`) — no-UI features still get neither block
- Edge cases: skip on a non-UI feature → falls through to line 140 unchanged
- ⚠️ Breaking change: none — replaces a branch that previously produced an ungoverned plan
- Acceptance: choosing "skip" on a UI feature yields a Design Direction rather than a fidelity disclaimer
- Verify: `grep -c "no fidelity claim can be made" commands/ec-feature.md` → `== 0` (baseline 1, removed)
- Rollback: `git checkout -- commands/ec-feature.md`
- Dependencies: Task 5

**Task 7 — Add Design Direction block to the plan template** `S`
- File: `commands/ec-feature.md`
- Anchor: `### Design Contract` (plan template) → `commands/ec-feature.md:272`
- Reuse: the `### Design Contract` plan-template block and its trailing omit-rule sentence
- Code sample: insert after the Design Contract plan-template block and its "Omit this whole section" line:
```
### Design Direction
- Dials: ENERGY {1-3} · RHYTHM {1-3} · MOTION {1-3} — {one-line reason for each}
- Palette: {2-3 core colors + 1 accent, hex} — {reason}
- Typography: {headline face, body face, scale} — {reason}
- Identity motif: {the repeated gesture or pattern specific to this product}
- Rules: apply agents/ec-antislop.md in full — hard gates, purpose gates, quality locks

Include this section only when the feature has UI scope AND no visual reference was supplied. A plan contains `### Design Contract` or `### Design Direction`, never both, and never neither when the feature has UI scope.
```
- Do not touch: the `### Design Contract` plan-template block
- Edge cases: non-UI feature → neither block, as today
- ⚠️ Breaking change: none
- Acceptance: the plan template documents both blocks and their mutual exclusivity
- Verify: `grep -c "never both" commands/ec-feature.md` → `>= 2` (baseline 0; Task 5 adds one, this task adds one)
- Rollback: `git checkout -- commands/ec-feature.md`
- Dependencies: Task 6

**Task 8 — Add Design Direction rows to the ec-feature self-review checklist** `S`
- File: `commands/ec-feature.md`
- Anchor: `- [ ] Design Contract is present and self-contained` → `commands/ec-feature.md:346`
- Reuse: the checklist row shape directly above
- Code sample: insert two rows after line 347:
```
  - [ ] A UI feature carries exactly one of ### Design Contract / ### Design Direction — never both, never neither
  - [ ] Design Direction states all three dials with a one-line reason each
```
- Do not touch: the existing Design Contract and `[design:]` checklist rows
- Edge cases: n/a
- ⚠️ Breaking change: none
- Acceptance: Step 4 refuses to present a UI plan carrying both blocks or neither
- Verify: `grep -c "^- \[ \] " commands/ec-feature.md` → `== 18` (baseline 16, two rows added). The two sample rows above are indented two spaces in this plan so they never match this pattern or the executor's task counter — write them unindented into ec-feature.md.
- Rollback: `git checkout -- commands/ec-feature.md`
- Dependencies: Task 7

**Task 9 — Generalise the ec-execute injection heading** `M`
- File: `commands/ec-execute.md`
- Anchor: `### Design Contract Injection` → `commands/ec-execute.md:147`
- Reuse: the entire existing 6-step injection procedure — extended, not rewritten
- Code sample: rename the heading to `### Design Block Injection` and add a step 0 plus a Design Direction branch, leaving steps 1-6 of the Design Contract path unaltered:
```
### Design Block Injection
Step 0 — determine which block the plan carries: `### Design Contract` or `### Design Direction`. A plan has at most one.

**If the plan has `### Design Contract`:** follow steps 1-6 below unchanged.

**If the plan has `### Design Direction`:** for each task carrying a `[design:]` tag, read the `### Design Direction` block from {PLAN_FILE} in full and prepend to the subagent prompt:
   "Design Direction — no visual reference exists for this task. Build to these dials and rules.\n{direction_block}\nRead ~/.claude/agents/ec-antislop.md and apply it in full. Report every purpose-gate use and every major design decision as 'Reason: {what} — {why}'."
If the plan has neither block: proceed normally — nothing injected.
```
- Do not touch: numbered steps 1-6 at `commands/ec-execute.md:148-155` — the Design Contract path must stay byte-identical
- Edge cases: plan with neither block (non-UI feature) → nothing injected, as today; task tagged `[design:]` but no block present → existing warning at step 5 still applies
- ⚠️ Breaking change: this is the propagation path for every existing UI task. Mitigated by leaving steps 1-6 untouched and adding the Direction branch beside them.
- Acceptance: a UI task injects its contract when one exists, its direction when one exists, and nothing when neither does
- Verify: `grep -c "Design Contract Injection" commands/ec-execute.md` → `== 0` and `grep -c "Design Block Injection" commands/ec-execute.md` → `== 1` (baseline 1 and 0)
- Rollback: `git checkout -- commands/ec-execute.md`
- Dependencies: Task 1, Task 7

**Task 10 — Add the Anti-Slop gate to ec-review Stage 2** `M`
- File: `commands/ec-review.md`
- Anchor: `### Visual Fidelity (if the plan has a Design Contract)` → `commands/ec-review.md:133`
- Reuse: the conditional-gate shape of the Visual Fidelity section directly above
- Code sample: insert a new gate after the Visual Fidelity section ends and before `### API Error Handling`:
```
### Anti-Slop (if the plan has a Design Direction)
- Implemented ENERGY, RHYTHM, and MOTION match the dials declared in the plan
- No hard gate is broken: no em dashes in UI copy, no invented statistics, no fictional people or testimonials, no dead buttons or nav links, no fabricated security or performance claims, no mobile overflow
- Every purpose-gate technique used (gradient, glow, glassmorphism, decorative icon, animation, shadow) carries a written reason, and that reason matches what the code actually does — an unverifiable reason is an issue to fix
- No AI template layout: hero + 3 identical cards, 3-step "How It Works", bento grid, fake terminal, 3 pricing tiers, generic footer
- CTAs name the product action; no buzzwords (AI-Powered, Seamless, Revolutionary, Effortless)
- Palette is 2-3 core colors plus 1 accent; radius is consistent; feature cards vary by hierarchy
Skip this gate entirely when the plan has a Design Contract or no design block.
```
- Do not touch: the Visual Fidelity gate and the API Error Handling gate — both stay byte-identical
- Edge cases: plan with a Design Contract → gate skipped; no design block → gate skipped
- ⚠️ Breaking change: none — additive conditional gate
- Acceptance: a Design Direction plan is graded on dials and slop rules; a Design Contract plan is not
- Verify: `grep -c "^### Anti-Slop (if the plan has a Design Direction)$" commands/ec-review.md` → `== 1` (baseline 0)
- Rollback: `git checkout -- commands/ec-review.md`
- Dependencies: Task 7

**Task 11 — Add the Anti-Slop line to the ec-review summary block** `S`
- File: `commands/ec-review.md`
- Anchor: `- Accessibility:   ✓/✗ (UI only)` in the Stage 2 summary block
- Reuse: the summary-row format of the surrounding lines
- Code sample: add one row to the Stage 2 summary block:
```
- Anti-slop:       ✓/✗ (Design Direction only)
```
- Do not touch: the existing summary rows
- Edge cases: gate skipped → row renders as n/a
- ⚠️ Breaking change: none
- Acceptance: the review report shows the anti-slop verdict alongside the other Stage 2 gates
- Verify: `grep -c "Anti-slop:" commands/ec-review.md` → `== 1` (baseline 0)
- Rollback: `git checkout -- commands/ec-review.md`
- Dependencies: Task 10

**Task 12 — Add the precedence clause to 4 web frontend agents** `S`
- File: `agents/ec-react.md`, `agents/ec-vue.md`, `agents/ec-nextjs.md`, `agents/ec-tailwind.md`
- Anchor: `## Visual Fidelity Protocol` → `agents/ec-react.md:50`, `agents/ec-tailwind.md:37`, and the equivalent heading in ec-vue.md and ec-nextjs.md
- Reuse: none — new 4-line section per file, identical text
- Code sample: insert immediately before `## Visual Fidelity Protocol` in each file:
```
## Anti-Slop Precedence
- A Design Contract in the prompt is the specification of record and wins outright — never question, justify, or "improve" what the reference specifies
- A Design Direction in the prompt means no reference exists: apply ~/.claude/agents/ec-antislop.md in full and report each purpose-gate use as "Reason: {what} — {why}"
- Neither block present: build to the feature description; make no fidelity claim
```
- Do not touch: `## Visual Fidelity Protocol` and `## API Error Protocol` in any of the four files
- Edge cases: `ec-tailwind.md` has fidelity only and no API Error Protocol — insert the same clause anyway
- ⚠️ Breaking change: none
- Acceptance: each of the four agents states which block wins before its fidelity protocol runs
- Verify: `grep -lc "Anti-Slop Precedence" agents/ec-react.md agents/ec-vue.md agents/ec-nextjs.md agents/ec-tailwind.md | wc -l` → `== 4` (baseline 0 in each)
- Rollback: `git checkout -- agents/ec-react.md agents/ec-vue.md agents/ec-nextjs.md agents/ec-tailwind.md`
- Dependencies: Task 1

**Task 13 — Add the precedence clause to 4 mobile frontend agents** `S`
- File: `agents/ec-react-native.md`, `agents/ec-flutter.md`, `agents/ec-ios.md`, `agents/ec-android.md`
- Anchor: `## Visual Fidelity Protocol` in each of the four files
- Reuse: the exact `## Anti-Slop Precedence` text written in Task 12 — identical across all 8 agents
- Code sample: same 4-line section as Task 12, inserted immediately before `## Visual Fidelity Protocol`
- Do not touch: `## Visual Fidelity Protocol` and `## API Error Protocol` in any of the four files
- Edge cases: none
- ⚠️ Breaking change: none
- Acceptance: all 8 frontend agents carry the identical precedence clause
- Verify: `grep -lc "Anti-Slop Precedence" agents/ec-react-native.md agents/ec-flutter.md agents/ec-ios.md agents/ec-android.md | wc -l` → `== 4` (baseline 0 in each)
- Rollback: `git checkout -- agents/ec-react-native.md agents/ec-flutter.md agents/ec-ios.md agents/ec-android.md`
- Dependencies: Task 12

**Task 14 — Add the Design Direction test class** `M`
- File: `tests/test_command_docs.py`
- Anchor: `FRONTEND_AGENTS = [` → `tests/test_command_docs.py:105`
- Reuse: `read_command`, `read_agent`, and the `FRONTEND_AGENTS` list already defined in the file. Do NOT add `ec-tailwind` to `FRONTEND_AGENTS` — that list is parametrized by `test_frontend_agents_have_both_protocols` at `tests/test_command_docs.py:150`, which asserts `## API Error Protocol`, and `ec-tailwind` deliberately lacks it (`test_tailwind_has_fidelity_without_api_protocol` at line 156 pins that). Define a new module-level `ALL_FRONTEND_AGENTS = FRONTEND_AGENTS + ['ec-tailwind']` instead.
- Code sample:
```python
class TestDesignDirectionChain:
    def test_brainstorm_emits_direction(self):
        content = read_command('ec-brainstorm.md')
        assert '## Design Direction' in content
        assert 'never both' in content

    def test_feature_documents_mutual_exclusivity(self):
        content = read_command('ec-feature.md')
        assert '### Design Direction' in content
        assert content.count('never both') >= 2

    def test_execute_injects_either_block(self):
        content = read_command('ec-execute.md')
        assert '### Design Block Injection' in content
        assert '### Design Direction' in content
        assert '### Design Contract' in content

    def test_review_gate_is_conditional(self):
        content = read_command('ec-review.md')
        assert '### Anti-Slop (if the plan has a Design Direction)' in content
        assert 'Skip this gate entirely when the plan has a Design Contract' in content

    def test_antislop_agent_has_dials_and_tiers(self):
        content = read_agent('ec-antislop')
        for section in ['## Dials', '## Hard Gates', '## Purpose Gates',
                        '## Quality Locks', '## Reporting']:
            assert section in content, section
        for dial in ['ENERGY', 'RHYTHM', 'MOTION']:
            assert dial in content, dial

    def test_antislop_attributes_upstream(self):
        assert 'anti-slop' in read_agent('ec-antislop')

    def test_antislop_installed(self):
        with open(os.path.join(os.path.dirname(__file__), '..', 'install.sh')) as f:
            assert 'ec-antislop' in f.read()

    def test_all_frontend_agents_state_precedence(self):
        for agent in ALL_FRONTEND_AGENTS:
            content = read_agent(agent)
            assert '## Anti-Slop Precedence' in content, agent
            assert content.index('## Anti-Slop Precedence') < \
                content.index('## Visual Fidelity Protocol'), agent
```
- Do not touch: `TestDesignContractChain` — the existing contract tests must keep passing untouched
- Edge cases: measured — `FRONTEND_AGENTS` IS parametrized at `tests/test_command_docs.py:150` and asserts `## API Error Protocol`, so mutating it would fail on `ec-tailwind`. `ALL_FRONTEND_AGENTS` is therefore a separate list and `FRONTEND_AGENTS` is left untouched. `test_all_frontend_agents_state_precedence` is a plain loop, not parametrized, so it collects as 1 test.
- ⚠️ Breaking change: none
- Acceptance: the propagation chain, mutual exclusivity, and agent precedence are all asserted
- Verify: `python3 -m pytest -q` → `120 passed` (baseline 112, 8 new tests)
- Rollback: `git checkout -- tests/test_command_docs.py`
- Dependencies: Tasks 1-13

**Task 15 — Add the agent-bloat guard test** `S`
- File: `tests/test_command_docs.py`
- Anchor: end of `class TestDesignDirectionChain` added in Task 14
- Reuse: `ALL_FRONTEND_AGENTS` defined in Task 14, and `AGENTS_DIR`
- Code sample:
```python
    def test_frontend_agents_did_not_bloat(self):
        for agent in ALL_FRONTEND_AGENTS:
            lines = len(read_agent(agent).splitlines())
            assert lines <= 90, f'{agent} grew to {lines} lines'
```
- Do not touch: any other test
- Edge cases: largest baseline is `ec-react.md` at 75 lines; a 4-line clause plus blank lines lands near 80, so 90 is the ceiling that catches vendoring without flagging this change
- ⚠️ Breaking change: none
- Acceptance: a future attempt to paste the full ruleset into the agents fails the suite
- Verify: `python3 -m pytest -q` → `121 passed` (Task 14 leaves 120, one test added)
- Rollback: `git checkout -- tests/test_command_docs.py`
- Dependencies: Task 14

**Task 16 — Sync installed copies** `S`
- File: `~/.claude/commands/ec-brainstorm.md`, `~/.claude/commands/ec-feature.md`, `~/.claude/commands/ec-execute.md`, `~/.claude/commands/ec-review.md`, `~/.claude/agents/ec-antislop.md`, and the 8 frontend agent files under `~/.claude/agents/`
- Anchor: n/a — file copy
- Reuse: `cp` per file; do not re-run `install.sh`, which would also touch the server and hooks
- Code sample:
```bash
cp commands/ec-brainstorm.md commands/ec-feature.md commands/ec-execute.md commands/ec-review.md ~/.claude/commands/
cp agents/ec-antislop.md agents/ec-react.md agents/ec-vue.md agents/ec-nextjs.md agents/ec-tailwind.md agents/ec-react-native.md agents/ec-flutter.md agents/ec-ios.md agents/ec-android.md ~/.claude/agents/
```
- Do not touch: `~/.efficlaude/server/`, `~/.efficlaude/hooks/`, `~/.claude/settings.json`
- Edge cases: `~/.claude/agents/` already exists — `install.sh:9` creates it, so no mkdir needed
- ⚠️ Breaking change: none
- Acceptance: the installed commands and agents match the repo
- Verify: `diff -q commands/ec-execute.md ~/.claude/commands/ec-execute.md && diff -q agents/ec-antislop.md ~/.claude/agents/ec-antislop.md` → exit status 0
- Rollback: re-run `bash install.sh`
- Dependencies: Tasks 1-15
