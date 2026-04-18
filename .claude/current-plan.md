## Feature: Post-Review Summary Doc + Setup Project Overview Doc

### Impact Analysis
- Files affected: `commands/ec-setup.md`, `commands/ec-review.md`
- New runtime files: `docs/PROJECT.md` (created by ec-setup), `.claude/review-summary.md` (created by ec-review)
- ⚠️ Breaking change risk: none — additive steps only, no existing behavior removed

### Reusable Existing Code
- `<!-- last_updated: {date} -->` pattern at `commands/ec-setup.md` (Step 3) — reuse same header pattern in docs/PROJECT.md
- Step numbering pattern in `commands/ec-review.md` — new step follows existing Step 4

### Tasks
- [x] Task 1: Add docs/PROJECT.md template + write instruction to ec-setup.md Step 3 [S] — write full project overview during setup
- [x] Task 2: Add .claude/review-summary.md write step to ec-review.md [S] — generate review output doc after Step 4
- [x] Task 3: Add docs/PROJECT.md update step to ec-review.md (same new Step 5) [S] — append changelog row + refresh last_updated

### Per Task Detail

**Task 1 — Add docs/PROJECT.md to ec-setup.md** `S`
- File: `commands/ec-setup.md`
- Reuse: `<!-- last_updated: {YYYY-MM-DD} -->` header pattern already in Step 3
- Code sample: add `### docs/PROJECT.md` block inside Step 3, after the conventions.md section:
  ```
  ### docs/PROJECT.md
  Create `docs/` directory if it doesn't exist, then write `docs/PROJECT.md`:

  <!-- last_updated: {YYYY-MM-DD} -->
  # {project_name}

  ## Overview
  {one-paragraph description based on scan + user answers}

  ## Stack
  {tech stack from stack.md}

  ## Project Structure
  {structure from structure.md}

  ## Commands
  | Command | Description |
  |---------|-------------|
  | /ec-setup | Initialize or update project configuration |
  | /ec-brainstorm | Explore solution approaches before planning |
  | /ec-feature | Plan a feature with tasks and file targets |
  | /ec-execute | Implement the current plan sequentially |
  | /ec-review | Review spec compliance and code quality |
  | /ec-git | Commit and push changes |

  ## Conventions
  {conventions from conventions.md}

  ## Changelog
  | Date | Feature | Summary |
  |------|---------|---------|
  | {date} | Initial setup | Project configured via /ec-setup |
  ```
- Edge cases: `docs/` may not exist — mkdir before write; if PROJECT.md already exists (re-run setup), overwrite it fully
- ⚠️ Breaking change: none
- Verify: after running /ec-setup, `cat docs/PROJECT.md` shows all sections with real content
- Dependencies: none

**Task 2 — Add .claude/review-summary.md write step to ec-review.md** `S`
- File: `commands/ec-review.md`
- Reuse: feature name parsed from `## Feature:` line in current-plan.md
- Code sample: add new `## Step 5 — Write Review Docs` section after the existing Step 4 clean/delete block, before "Next: run /ec-git":
  ```
  ## Step 5 — Write Review Docs

  Write `.claude/review-summary.md` (overwrite if exists):

  # Review Summary — {feature_name}
  _Date: {date}_

  ## Feature
  {feature name from `## Feature:` line in current-plan.md}

  ## Tasks Completed
  {all [x] task lines from current-plan.md, verbatim}

  ## Files Modified
  {list from blast radius scope + manually scoped files}

  ## Issues Fixed During Review
  {Stage 1 compliance fixes listed here}
  {Stage 2 quality fixes listed here}
  (If none: "No issues found.")

  ## Review Result
  | Check | Status |
  |-------|--------|
  | Spec compliance | ✓ |
  | Code quality | ✓ |
  | Tests | {added / skipped} |
  ```
- Edge cases: overwrite on each review cycle — one file, always latest feature; if no issues fixed, write "No issues found"
- ⚠️ Breaking change: none
- Verify: after /ec-review, `cat .claude/review-summary.md` shows complete feature summary
- Dependencies: none

**Task 3 — Add docs/PROJECT.md update step to ec-review.md** `S`
- File: `commands/ec-review.md`
- Reuse: same Step 5 from Task 2 — append instructions after review-summary write
- Code sample: append to Step 5 body after the review-summary block:
  ```
  Then update `docs/PROJECT.md` (if it exists):
  1. Replace `<!-- last_updated: {old_date} -->` with `<!-- last_updated: {today} -->`
  2. Find the `## Changelog` table and append a new row:
     `| {date} | {feature_name} | {one-line summary of what was built} |`

  If `docs/PROJECT.md` does not exist: show "(docs/PROJECT.md not found — run /ec-setup to generate it)" and skip.
  ```
- Edge cases: PROJECT.md not found → warn and skip, don't fail; feature_name taken from `## Feature:` line in current-plan.md; one-line summary = shortest description of the feature
- ⚠️ Breaking change: none
- Verify: after /ec-review, `tail -5 docs/PROJECT.md` shows new changelog row with today's date and feature name
- Dependencies: Task 1 (PROJECT.md must exist from ec-setup), Task 2 (same step in ec-review)
