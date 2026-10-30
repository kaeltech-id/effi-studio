Review all code changes from the last execution. Two-stage review: spec compliance first, then code quality.

**Branch detection:** Run:
```bash
BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
[ -z "$BRANCH" ] && BRANCH="default"
PLAN_FILE=".claude/plans/${BRANCH}.md"
DECISION_FILE=".claude/decisions/${BRANCH}.md"
REVIEW_DONE=".claude/.review-done-${BRANCH}"
REFINED=".claude/.refined-${BRANCH}"
REVIEW_SUMMARY=".claude/review-summaries/${BRANCH}.md"
```
Note: "(branch: {BRANCH})"

## Step 1 — Load Context
Read `{PLAN_FILE}`, `.claude/context/conventions.md`, `.claude/context/stack.md`.

Check worker status: `curl -s http://localhost:37777/health`
- If running: show "(worker online ✓ — memory/docs active)" then load memory and docs:
  `curl -s "http://localhost:37777/memory/search?q={feature_name}&project={project_name}&limit=5"`
  `curl -s "http://localhost:37777/docs/search?q={feature_keywords}&project={project_name}&limit=3"`
  Use memory to flag contradictions with past decisions. Use docs to verify API usage.
- If offline: show "(worker OFFLINE ⚠️ — memory/docs unavailable)" and continue.

**Auto-Flow check:** Detect auto-flow chaining:
```bash
AUTOFLOW=".claude/.autoflow"
AUTO="no"
if [ -f "$AUTOFLOW" ]; then
  MTIME=$(stat -f %m "$AUTOFLOW" 2>/dev/null || stat -c %Y "$AUTOFLOW" 2>/dev/null || echo 0)
  AGE=$(( $(date +%s) - MTIME ))
  SENT_BRANCH=$(grep '^branch=' "$AUTOFLOW" 2>/dev/null | cut -d= -f2)
  if [ "$AGE" -gt 7200 ] || [ "$SENT_BRANCH" != "$BRANCH" ]; then rm -f "$AUTOFLOW"; else AUTO="yes"; fi
fi
```
When `AUTO=yes`: run the review without pausing for confirmation. This command is the END of the auto-flow chain — it always deletes the sentinel and stops before git (see Step 4 teardown). Deleting `.claude/.autoflow` is exactly the signal the `Stop`-hook driver (`hooks/session_stop.py`) reads as "chain complete": with the sentinel gone the driver stops blocking and the session is free to end, whether or not the review came out clean. The driver never routes to `/ec-git` — not even once `.claude/.review-done-{BRANCH}` exists — so git stays manual per GIT RULES.

## Step 1.5 — Blast Radius Analysis (if worker running)
Extract all files modified during execution from `{PLAN_FILE}`.

Index changed files into the graph:
```
for each modified_file in plan:
  curl -s -X POST http://localhost:37777/graph/index \
    -H "Content-Type: application/json" \
    -d '{"project": "{project_name}", "file_path": "{modified_file}", "root_dir": "{cwd}"}'
```

Read `blast_radius_depth` from `.claude/project-config.json` (default: 2 if field absent).

Get blast radius — files that import from the changed files:
```
curl -s "http://localhost:37777/graph/blast-radius?project={project_name}&depth={blast_radius_depth}{&files=file1&files=file2...}"
```

If `affected` files are returned:
- Show: "Blast radius: {n} additional files may be affected → {list}"
- Include those files in Stage 1 and Stage 2 review scope
- Flag any breakage found in affected files as ⚠️ Collateral impact

If no affected files: note "No dependents found — isolated change."

**Manual scope:** Ask once: "Any additional files to include in the review scope beyond what blast radius detected? (paste paths or 'no')"
If user provides paths: add them to Stage 1 and Stage 2 review scope. Flag their issues as ⚠️ Manually scoped.
If user says 'no' or worker is offline: skip.

---

## Stage 1 — Spec Compliance Review

For each task in the plan, verify the implementation matches exactly what was specified.

Check:
- Does the output match the task description and code sample?
- Were all edge cases from the plan handled? (loading, empty, error states)
- Were the correct existing components/utils reused as specified?
- Were file paths created/modified exactly as planned?
- Any over-building (added unrequested features)?
- Any under-building (missing required behavior)?
- (If memory available) Does implementation contradict past architectural decisions?

For each mismatch: fix it directly. Do not ask for permission.

**Only proceed to Stage 2 after Stage 1 is fully clean.**

---

## Stage 1.5 — Template Drift Check
If `commands/ec-setup.md` exists in this project:
- Read `CLAUDE.md` and extract all lines inside the `## GIT RULES` block
- Read `commands/ec-setup.md` and extract the `## GIT RULES` block from the CLAUDE.md template section (between `## GIT RULES` and `## WORKFLOW RULES`)
- Compare both lists line by line
- If any rule is in CLAUDE.md but missing from the template: fix `commands/ec-setup.md` directly and note "Fixed template drift: added {rule}"
- If all rules match: note "Template drift check: ✓ GIT RULES in sync"
If `commands/ec-setup.md` does not exist: skip this check silently.

### Plan lint — exception-only fields
Read the plan that was executed (check `.claude/plans/{branch}.md`, and `.claude/plans/archive/` if the plan has already been archived) and flag:
- any `Rollback:` line that is merely a revert or delete of that task's own `File:`
- any per-task `⚠️ Breaking change:` line whose value is `none`
- any `Anchor:` line reading `new file`
- any `Dependencies:` values forming a straight `Task N-1` chain across more than 3 consecutive tasks

Do NOT check a task's `File:` "new file" claim against the disk here. By review time a new file exists precisely because its task created it, so the check fires on every correctly-executed new-file task. That claim is verifiable only at plan time, and `/ec-plan`'s Grounding Pass plus its self-review checklist item ("Every file a task claims is new was confirmed absent by the Grounding Pass") is where it belongs.

Report each as template drift with the task number. These fields are **exception-only**: their presence with a default value IS the defect, never their absence. Do NOT flag the plan-level `⚠️ Breaking change risk:` line in `### Impact Analysis` — that one legitimately reads "none".

---

## Stage 2 — Code Quality Review

After spec compliance is confirmed, review code quality on all modified files.

### Reviewing the dimensions
The gates below are independent: a security finding does not depend on a type-safety finding, and neither needs the other's output. Spawn ONE subagent PER APPLICABLE GATE as concurrent reviewers **in a single message**, at most 8 in flight, each over the same file set, then merge their findings into one list before fixing anything.

Skip a gate that does not apply rather than spawning a reviewer that reports nothing — no Design Contract means no Visual Fidelity reviewer, no API calls means no API Error Handling reviewer. Merge first, fix second: two reviewers may land on the same line, and fixing as reports arrive would have them fighting over it.

### Code Quality
- Naming, structure, file organization matches conventions
- Best practices for detected stack
- Readable logic, no unnecessary complexity
- No dead code, unused imports, leftover debug statements

### Type Safety
- No implicit `any` or `unknown` without justification
- All props, params, return types properly typed
- No type assertions (`as X`) where proper typing is possible

### Performance
- Unnecessary re-renders (missing `memo`, `useMemo`, `useCallback`)
- Heavy imports that could be lazy-loaded
- N+1 patterns or redundant API calls

### Security
- No hardcoded secrets, API keys, or tokens
- No dangerous patterns: `dangerouslySetInnerHTML`, `eval`, unescaped user input
- No sensitive data exposed in logs or responses

### Accessibility (UI components only)
- Images have `alt` text
- Interactive elements have `aria-label` where needed
- Keyboard navigation works
- Semantic HTML used correctly

### Visual Fidelity (if the plan has a Design Contract)
- Every element listed in the Design Contract has a counterpart in the implemented code
- No element was invented that the contract does not list
- Copy matches the contract exactly — no rewording, no placeholder text
- Spacing, typography, and color match the contract's measured values
- Every state the contract records is implemented, plus loading / empty / error on data-driven regions
- Any deviation is declared in the code or the execution report — an undeclared deviation is an issue to fix

### Anti-Slop (if the plan has a Design Direction)
- Implemented ENERGY, RHYTHM, and MOTION match the dials declared in the plan
- No hard gate is broken: no em dashes in UI copy, no invented statistics, no fictional people or testimonials, no dead buttons or nav links, no fabricated security or performance claims, no mobile overflow
- Every purpose-gate technique used (gradient, glow, glassmorphism, decorative icon, animation, shadow) carries a written reason, and that reason matches what the code actually does — an unverifiable reason is an issue to fix
- No AI template layout: hero + 3 identical cards, 3-step "How It Works", bento grid, fake terminal, 3 pricing tiers, generic footer
- CTAs name the product action; no buzzwords (AI-Powered, Seamless, Revolutionary, Effortless)
- Palette is 2-3 core colors plus 1 accent; radius is consistent; feature cards vary by hierarchy

Skip this gate entirely when the plan has a Design Contract or no design block.

### API Error Handling (any code that calls an API)
- Every call has error handling — none is left bare
- Existing project error handlers were reused where they exist; a new reusable handler was created where they did not
- Coverage includes network failure, non-2xx status, timeout, malformed or empty payload, and auth expiry
- Failures surface in the UI as a recoverable state — no blank screen, no endless spinner
- No empty catch blocks and no log-only handling

Running the gates concurrently never relaxes a gate. Every gate above is applied in full, every finding is still fixed, and the definitive global gate in Step 2 still runs ONCE, serially, in the orchestrator — a build and a test suite must not race each other.

### API Correctness (if docs available)
- Compare implemented API calls against cached docs
- Flag any usage of deprecated or incorrect APIs

Fix all issues found directly. Do not ask for permission to fix — fix and note what changed.

---

## Step 2 — Testing

### Definitive global gate
Run every global invariant for this project ONCE, here, and record the real output:
- the build — `cargo build`, `npm run build`, or this project's equivalent
- the type-check — `tsc --noEmit`, `mypy`, or equivalent
- the full test suite

`/ec-execute` no longer runs these per task, so on `in-cycle` **this is the authoritative gate** and a failure here is a review failure. On `handoff` it is the authoritative STATIC gate only: compilation is deliberately deferred to the user, so a clean review on `handoff` never claims the code was built. Skip cleanly any step this project does not have — a missing build step is not a failure. If the plan exceeds 40 tasks, the evidence audit below may sample rather than re-run everything; this gate never samples.

**Scope by proof mode.** Resolve the mode first: read the `Proof mode:` line from `{PLAN_FILE}`, falling back to `## Proof Mode` in `{DECISION_FILE}`; when neither says, treat it as `handoff`. On `handoff`, skip the build step and any launch step entirely: run only the project's cheap static checks — a syntax parse, a JSON/YAML parse, `tsc --noEmit`, and the existing test suite when it finishes in seconds. Do NOT run a whole-project linter, and do NOT reach for `cargo check` as the "equivalent" type-check: it is a Rust compile, measured at 35.97s on this repo, and `/ec-plan`'s allowed-check rule names it a Handoff step. Never produce a distributable artifact and never launch the app. Anything heavier stays in the plan's `### Handoff` for the user to run. On `in-cycle` the gate runs in full exactly as specified above.

### Evidence audit
For each `- [x]` task in the plan, confirm its `Verify (local)` evidence was actually produced:
- re-run the local verify and compare against the plan's stated expectation
- flag any task marked done whose local verify now fails, or whose threshold was never measurable

This closes the failure mode where a subagent invents output to clear a threshold. A local verify that was correct when the task ran but was invalidated by a LATER task's change is a plan-ordering defect, not a fabrication — report it as such.

**How to tell the two apart.** A fabrication shows a count BELOW the expectation, or a string that was never written. A plan-ordering defect shows a count ABOVE it, and every extra occurrence is attributable by line number to a later or concurrent task in the same plan — inside a wave there is no earlier or later, so a same-wave sibling's write is attributable, not a fabrication. Always attribute before judging: run the bare `grep -n` and name which task added each extra hit. Only an unattributable discrepancy is a fabrication. Report plan-ordering defects against `/ec-plan`'s count-stability rule, not against the task that ran.

### Scope boundary
Collect every `File:` value in the plan. Then run `git status --short` (read-only — never stage, commit or revert) and confirm every changed path appears in that list. Report any path that does not as an out-of-scope change, naming the task that should have declared it. Exclude workflow artefacts written by the commands themselves (`.claude/plans/`, `.claude/decisions/`, `.claude/docs/`, review summaries) and build output that belongs in gitignore (for example `token-optimizer/target/`).

### Unit tests
On `handoff`, ask the authoring half of this gate but not the running half. Writing a test is **changing** — a code deliverable — so the offer stands in every mode; executing a slow suite is **proving**, and that belongs in `### Handoff`. So on `handoff`: ask the question below, add the tests if the user says yes, and then stop — do not run a suite that takes more than seconds, list it in the Handoff block instead. On `in-cycle`, ask and run as specified:

Ask: "Add unit tests for this feature? (y/n):"

If yes:
- Generate unit tests for new functions/components
- Follow existing test patterns in the project
- Cover: happy path, edge cases (empty, error, loading), breaking change scenarios

Ask: "Any existing test suite to run? (provide path or skip)"

If yes: run the tests and report results with evidence (actual output, not assumption).

---

## Step 3 — Save Review Memory (if worker running)
After review is complete, save outcome:
```
curl -s -X POST http://localhost:37777/memory/observe \
  -H "Content-Type: application/json" \
  -d '{
    "project": "{project_name}",
    "type": "review",
    "content": "Reviewed feature: {feature_name}. Issues fixed: {issues_count}. Files reviewed: {files_list}.",
    "metadata": {"source": "review", "feature": "{feature_name}"}
  }'
```

---

## Step 4 — Report

```
## Review Summary

### Stage 1 — Spec Compliance   ✓/✗
- {task}: {compliant or what was fixed}

### Stage 2 — Code Quality
- Code quality:    ✓/✗
- Type safety:     ✓/✗
- Performance:     ✓/✗
- Security:        ✓/✗
- Accessibility:   ✓/✗ (UI only)
- Anti-slop:       ✓/✗ (Design Direction only)
- API correctness: ✓/✗ (if docs available)

### Fixes Applied
- {file}:{line} — {issue} → {what was fixed}

### Tests
- Unit tests: {added/skipped}
- Test results: {passed X / failed X — actual output}

### What Changed
{concise list of all files modified during review}

### Handoff — your turn
{the plan's `### Handoff` block, echoed verbatim. Omit this section only when the plan had none.}
```

The Handoff block is the whole point of `handoff` mode and the plan is archived moments later, so this report is the last place the user sees it. Echo it verbatim rather than summarising, and copy it into `{REVIEW_SUMMARY}` as well.

**If review is clean**, delete `{DECISION_FILE}` if it exists (run `rm -f {DECISION_FILE}`), then write the review-done sentinel: `touch {REVIEW_DONE}` — this records that review is complete so the next run routes to `/ec-git`.

Then archive the completed plan and tear down any auto-flow sentinel:
```bash
if [ -f "$PLAN_FILE" ]; then
  mkdir -p .claude/plans/archive
  SLUG=$(grep -m1 '^## Feature:' "$PLAN_FILE" | sed 's/^## Feature: *//' | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-' | cut -c1-40)
  [ -z "$SLUG" ] && SLUG="plan"
  cp "$PLAN_FILE" ".claude/plans/archive/${BRANCH}-$(date +%Y-%m-%d-%H%M)-${SLUG}.md"
  echo "(plan archived → .claude/plans/archive/)"
fi
rm -f .claude/.autoflow
rm -f "$REFINED"
```
Removing the sentinel in that last line is what stops the `Stop`-hook driver from blocking further turns.

**If review is NOT clean** (unresolved issues remain): also run `rm -f .claude/.autoflow` and `rm -f "$REFINED"` and stop — the auto-flow chain does not proceed to git.

## Step 5 — Write Review Docs

Run `mkdir -p .claude/review-summaries` then write `{REVIEW_SUMMARY}` (overwrite if it already exists):

```markdown
# Review Summary — {feature_name}
_Date: {date}_

## Feature
{feature name from the `## Feature:` line in {PLAN_FILE}}

## Tasks completed
{copy all `- [x]` task lines from {PLAN_FILE} verbatim, one per line}

## Files modified
{list all files from blast radius scope + any manually scoped files reviewed}

## Issues fixed during review
{list Stage 1 compliance fixes and Stage 2 quality fixes here}
If none: "No issues found."

## Handoff — your turn
{the plan's `### Handoff` block, verbatim, or "none"}

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ |
| Tests | {added / skipped} |
| Compilation | {verified here on `in-cycle` / deferred to Handoff on `handoff`} |
```

Then update `docs/PROJECT.md` if it exists:
1. Replace `<!-- last_updated: {old_date} -->` on the first line with `<!-- last_updated: {today} -->`
2. Find the `## Changelog` table and append a new row:
   `| {date} | {feature_name} | {one-line summary of what was built} |`

If `docs/PROJECT.md` does not exist: show "(docs/PROJECT.md not found — run /ec-setup to generate it)" and skip.

If everything is clean: "No issues found. Ready to commit."
Next: run `/ec-git` to commit and push.

Auto-flow ends here: even when AUTO=yes, the chain STOPS at this point and only suggests `/ec-git`. Git is never run automatically (GIT RULES).
