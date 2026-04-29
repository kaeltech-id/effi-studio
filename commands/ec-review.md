Review all code changes from the last execution. Two-stage review: spec compliance first, then code quality.

**Branch detection:** Run:
```bash
BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
[ -z "$BRANCH" ] && BRANCH="default"
PLAN_FILE=".claude/plans/${BRANCH}.md"
DECISION_FILE=".claude/decisions/${BRANCH}.md"
REVIEW_DONE=".claude/.review-done-${BRANCH}"
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

**Mode check:** Run `cat .claude/.mode 2>/dev/null || echo "structured"` → note as MODE.
- If `vibe`: skip "Next: run /ec-git" suggestion at end of review
- If `structured` (or file absent): proceed normally

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

---

## Stage 2 — Code Quality Review

After spec compliance is confirmed, review code quality on all modified files.

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

### API Correctness (if docs available)
- Compare implemented API calls against cached docs
- Flag any usage of deprecated or incorrect APIs

Fix all issues found directly. Do not ask for permission to fix — fix and note what changed.

---

## Step 2 — Testing
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
- API correctness: ✓/✗ (if docs available)

### Fixes Applied
- {file}:{line} — {issue} → {what was fixed}

### Tests
- Unit tests: {added/skipped}
- Test results: {passed X / failed X — actual output}

### What Changed
{concise list of all files modified during review}
```

**If review is clean**, delete `{DECISION_FILE}` if it exists (run `rm -f {DECISION_FILE}`), then write the review-done sentinel: `touch {REVIEW_DONE}` — this lets `/ec-next` detect that review is complete and route to `/ec-git`.

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

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ |
| Tests | {added / skipped} |
```

Then update `docs/PROJECT.md` if it exists:
1. Replace `<!-- last_updated: {old_date} -->` on the first line with `<!-- last_updated: {today} -->`
2. Find the `## Changelog` table and append a new row:
   `| {date} | {feature_name} | {one-line summary of what was built} |`

If `docs/PROJECT.md` does not exist: show "(docs/PROJECT.md not found — run /ec-setup to generate it)" and skip.

If everything is clean: "No issues found. Ready to commit."
Next: run `/ec-git` to commit and push.
