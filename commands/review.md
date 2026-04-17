Review all code changes from the last execution. Two-stage review: spec compliance first, then code quality.

## Step 1 — Load Context
Read `.claude/current-plan.md`, `.claude/context/conventions.md`, `.claude/context/stack.md`.

Check worker: `curl -s http://localhost:37777/health`

If worker is running:
- Load memory for consistency check:
  `curl -s "http://localhost:37777/memory/search?q={feature_name}&project={project_name}&limit=5"`
- Load docs for libraries used:
  `curl -s "http://localhost:37777/docs/search?q={feature_keywords}&project={project_name}&limit=3"`
- Use memory to flag: if this feature contradicts past decisions or patterns.
- Use docs to verify: API usage matches current library versions.

## Step 1.5 — Blast Radius Analysis (if worker running)
Extract all files modified during execution from `.claude/current-plan.md`.

Index changed files into the graph:
```
for each modified_file in plan:
  curl -s -X POST http://localhost:37777/graph/index \
    -H "Content-Type: application/json" \
    -d '{"project": "{project_name}", "file_path": "{modified_file}", "root_dir": "{cwd}"}'
```

Get blast radius — files that import from the changed files:
```
curl -s "http://localhost:37777/graph/blast-radius?project={project_name}&depth=2{&files=file1&files=file2...}"
```

If `affected` files are returned:
- Show: "Blast radius: {n} additional files may be affected → {list}"
- Include those files in Stage 1 and Stage 2 review scope
- Flag any breakage found in affected files as ⚠️ Collateral impact

If no affected files: note "No dependents found — isolated change."

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
Ask: "Do you want to add unit tests for this feature? (yes/no)"

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

If everything is clean: "No issues found. Ready to commit."
Tell user to run /git to commit and push.
