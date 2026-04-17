Review all code changes from the last execution. Two-stage review: spec compliance first, then code quality.

## Step 1 — Load Context
Read `.claude/current-plan.md`, `.claude/context/conventions.md`, `.claude/context/stack.md`.

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

## Step 3 — Report

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
