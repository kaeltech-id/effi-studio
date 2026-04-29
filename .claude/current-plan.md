## Feature: Branch-Isolated State Files for Multi-Terminal Safety

### Impact Analysis
- Files affected: commands/ec-brainstorm.md, commands/ec-feature.md, commands/ec-execute.md, commands/ec-review.md, commands/ec-next.md
- ⚠️ Breaking change risk: existing `.claude/current-plan.md` / `.claude/decision.md` won't be found at new paths — mitigated by auto-migration in ec-execute

### Reusable Existing Code
- `git branch --show-current` — standard git command already used in ec-git context for branch-awareness

### Tasks
- [x] Task 1: ec-brainstorm: Branch detection + branch-aware decision path [S] — add BRANCH var, write decision to .claude/decisions/{BRANCH}.md instead of .claude/decision.md
- [x] Task 2: ec-feature: Add branch detection block [S] — add PLAN_FILE and DECISION_FILE vars after Mode check in Step 0
- [x] Task 3: ec-feature: Update current-plan.md references to PLAN_FILE [S] — replace all occurrences: incomplete guard, allowed writes, save-plan step
- [x] Task 4: ec-feature: Update decision.md references to DECISION_FILE [S] — replace all occurrences: check, expired note, delete, load note, no-delete note
- [x] Task 5: ec-execute: Branch detection + plan path update + auto-migration [M] — compute PLAN_FILE, auto-migrate .claude/current-plan.md if found, update all plan refs
- [x] Task 6: ec-review: Branch detection + update all branch-aware paths [M] — update current-plan → PLAN_FILE, decision.md → DECISION_FILE, .review-done → .review-done-{BRANCH}, review-summary → review-summaries/{BRANCH}.md
- [x] Task 7: ec-next: Branch detection + update all state-check file paths [S] — add BRANCH vars, update Check 1–4 bash commands to use branch-aware paths

### Per Task Detail

**Task 1 — ec-brainstorm: Branch detection + branch-aware decision path** `S`
- File: `commands/ec-brainstorm.md`
- Reuse: none
- Code sample: Add after the existing **Mode check** block in Step 0:
  ```
  **Branch detection:** Run:
  BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
  [ -z "$BRANCH" ] && BRANCH="default"
  DECISION_FILE=".claude/decisions/${BRANCH}.md"
  Note: "(branch: {BRANCH} → decision: {DECISION_FILE})"
  ```
  Then update the save block: replace `Save to .claude/decision.md` with `Run mkdir -p .claude/decisions then save to {DECISION_FILE}`.
  Also update "Allowed writes: .claude/decision.md and .claude/brainstorms/ only." to "Allowed writes: .claude/decisions/ and .claude/brainstorms/ only."
- Edge cases: not in git repo → BRANCH defaults to "default"; branch name with slashes (feature/foo) → sed replaces with dash → "feature-foo"
- ⚠️ Breaking change: none
- Verify: `grep -n "\.claude/decision\.md" commands/ec-brainstorm.md` returns 0 hardcoded refs; DECISION_FILE is defined and used in save step
- Dependencies: none

**Task 2 — ec-feature: Add branch detection block** `S`
- File: `commands/ec-feature.md`
- Reuse: same BRANCH detection pattern as Task 1
- Code sample: Add after the **Mode check** block in Step 0, before "No-Code Rule":
  ```
  **Branch detection:** Run:
  BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
  [ -z "$BRANCH" ] && BRANCH="default"
  PLAN_FILE=".claude/plans/${BRANCH}.md"
  DECISION_FILE=".claude/decisions/${BRANCH}.md"
  Note: "(branch: {BRANCH} → plan: {PLAN_FILE})"
  ```
- Edge cases: same as Task 1
- ⚠️ Breaking change: none — vars defined here, used in Tasks 3 & 4
- Verify: `grep -n "PLAN_FILE\|DECISION_FILE" commands/ec-feature.md` returns at least 2 hits in Step 0
- Dependencies: none

**Task 3 — ec-feature: Update current-plan.md references to PLAN_FILE** `S`
- File: `commands/ec-feature.md`
- Reuse: PLAN_FILE var from Task 2
- Code sample: Five replacements:
  1. `check if .claude/current-plan.md exists` → `check if {PLAN_FILE} exists`
  2. `⚠️ current-plan.md has {n} incomplete task(s). Overwrite and start fresh? (y/n):` → `⚠️ {PLAN_FILE} has {n} incomplete task(s). Overwrite and start fresh? (y/n):`
  3. `Run /ec-execute to finish the current plan, or manually delete .claude/current-plan.md.` → `Run /ec-execute to finish the current plan, or manually delete {PLAN_FILE}.`
  4. `Allowed writes: .claude/current-plan.md only.` → `Allowed writes: .claude/plans/ only.`
  5. `Save plan to .claude/current-plan.md.` → `Run mkdir -p .claude/plans then save plan to {PLAN_FILE}.`
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep -n "current-plan\.md" commands/ec-feature.md` returns 0 results
- Dependencies: Task 2

**Task 4 — ec-feature: Update decision.md references to DECISION_FILE** `S`
- File: `commands/ec-feature.md`
- Reuse: DECISION_FILE var from Task 2
- Code sample: Five replacements in Step 0 (Check for brainstorm decision section):
  1. `If .claude/decision.md exists, read it silently.` → `If {DECISION_FILE} exists, read it silently.`
  2. `(decision.md found but expired` → `({DECISION_FILE} found but expired`
  3. `delete .claude/decision.md, then proceed` → `delete {DECISION_FILE}, then proceed`
  4. `(decision.md loaded — using chosen approach from brainstorm)` → `({DECISION_FILE} loaded — using chosen approach from brainstorm)`
  5. `Do NOT delete .claude/decision.md here` → `Do NOT delete {DECISION_FILE} here`
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep -n "\.claude/decision\.md" commands/ec-feature.md` returns 0 results
- Dependencies: Task 2

**Task 5 — ec-execute: Branch detection + plan path update + auto-migration** `M`
- File: `commands/ec-execute.md`
- Reuse: same BRANCH detection pattern
- Code sample: Add branch detection + migration block at the very top of Step 0, before "Resume check":
  ```
  **Branch detection:** Run:
  BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
  [ -z "$BRANCH" ] && BRANCH="default"
  PLAN_FILE=".claude/plans/${BRANCH}.md"
  Note: "(branch: {BRANCH} → plan: {PLAN_FILE})"

  **Migration check:** If .claude/current-plan.md exists and {PLAN_FILE} does not:
  - Run: mkdir -p .claude/plans && mv .claude/current-plan.md {PLAN_FILE}
  - Show: "(migrated .claude/current-plan.md → {PLAN_FILE})"
  ```
  Then replace every hardcoded .claude/current-plan.md reference with {PLAN_FILE} (6 places: file list, resume-check description, no-tasks message, task-complete edit step, repeat-until condition, pre-run checklist).
- Edge cases: migration only runs when old file exists and new path doesn't — idempotent
- ⚠️ Breaking change: none — auto-migration handles upgrade for existing users transparently
- Verify: `grep -n "current-plan\.md" commands/ec-execute.md` returns 0 results
- Dependencies: none

**Task 6 — ec-review: Branch detection + update all state file paths** `M`
- File: `commands/ec-review.md`
- Reuse: same BRANCH detection pattern
- Code sample: Add branch detection block at very top of file description (before "Read .claude/current-plan.md"):
  ```
  **Branch detection:** Run:
  BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
  [ -z "$BRANCH" ] && BRANCH="default"
  PLAN_FILE=".claude/plans/${BRANCH}.md"
  DECISION_FILE=".claude/decisions/${BRANCH}.md"
  REVIEW_DONE=".claude/.review-done-${BRANCH}"
  REVIEW_SUMMARY=".claude/review-summaries/${BRANCH}.md"
  Note: "(branch: {BRANCH})"
  ```
  Then four path updates:
  1. All `.claude/current-plan.md` → `{PLAN_FILE}` (2 places)
  2. `rm -f .claude/decision.md` → `rm -f {DECISION_FILE}`
  3. `touch .claude/.review-done` → `touch {REVIEW_DONE}`
  4. `Write .claude/review-summary.md` → `Run mkdir -p .claude/review-summaries then write {REVIEW_SUMMARY}`; also update the template path reference in the write block
- Edge cases: review-summaries dir must be created before write
- ⚠️ Breaking change: .review-done path changes — must pair with Task 7
- Verify: `grep -n "current-plan\.md\|decision\.md\|review-done\b\|review-summary\.md" commands/ec-review.md` returns 0 results
- Dependencies: none (logically pairs with Task 7)

**Task 7 — ec-next: Branch detection + update all state-check file paths** `S`
- File: `commands/ec-next.md`
- Reuse: same BRANCH detection pattern
- Code sample: Add branch detection block before "## Step 1 — Detect State":
  ```
  **Branch detection:** Run:
  BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
  [ -z "$BRANCH" ] && BRANCH="default"
  PLAN_FILE=".claude/plans/${BRANCH}.md"
  DECISION_FILE=".claude/decisions/${BRANCH}.md"
  REVIEW_DONE=".claude/.review-done-${BRANCH}"
  ```
  Then update the five checks:
  - Check 1: `ls .claude/.review-done` → `ls {REVIEW_DONE}`
  - Check 2: `grep -c '- \[ \] Task' .claude/current-plan.md` → `grep -c '- \[ \] Task' {PLAN_FILE}`
  - Check 3: `ls .claude/current-plan.md` → `ls {PLAN_FILE}`
  - Check 4: `ls .claude/decision.md` → `ls {DECISION_FILE}`
  - Check 5: brainstorms stays unchanged
- Edge cases: none
- ⚠️ Breaking change: .review-done path must match ec-review — Tasks 6 and 7 must both use .review-done-{BRANCH}
- Verify: `grep -n "current-plan\.md\|decision\.md\|\.review-done\b" commands/ec-next.md` returns 0 results
- Dependencies: logically paired with Task 6
