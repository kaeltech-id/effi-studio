Review all code changes from the last execution. Fix issues found — do not just report them.

## Step 1 — Load Context
Read `.claude/current-plan.md`, `.claude/context/conventions.md`, `.claude/context/stack.md`.

## Step 2 — Review All Modified Files
For each file created or modified in the plan, check:

### Code Quality
- Conventions: naming, structure, file organization
- Best practices for the detected stack
- Readability: clear logic, no unnecessary complexity
- No dead code, unused imports, or leftover debug statements

### Type Safety
- No implicit `any` or `unknown` without justification
- All props, params, and return types properly typed
- No type assertions (`as X`) where proper typing is possible

### Performance
- Unnecessary re-renders (missing `memo`, `useMemo`, `useCallback` where needed)
- Heavy imports that could be lazy-loaded
- N+1 patterns or redundant API calls

### Security
- No hardcoded secrets, API keys, or tokens
- No dangerous patterns: `dangerouslySetInnerHTML`, `eval`, unescaped user input
- No exposed sensitive data in logs or responses

### Accessibility (UI components only)
- Images have `alt` text
- Interactive elements have `aria-label` where needed
- Keyboard navigation works (focus management, tab order)
- Color contrast and semantic HTML

Fix all issues found directly. Do not ask for permission to fix — just fix and note what was changed.

## Step 3 — Testing
Ask: "Do you want to add unit tests for this feature? (yes/no)"

If yes:
- Generate unit tests for new functions/components
- Follow existing test patterns in the project
- Cover: happy path, edge cases (empty, error, loading), and breaking change scenarios if any

Ask: "Any existing test suite to run? (provide path or skip)"

If yes: run the tests and report results.

## Step 4 — Report
```
## Review Summary

### Code Quality   ✓/✗
### Type Safety    ✓/✗
### Performance    ✓/✗
### Security       ✓/✗
### Accessibility  ✓/✗ (UI only)

### Fixes Applied
- {file}:{line} — {issue} → {what was fixed}

### Tests
- Unit tests: {added/skipped}
- Test results: {passed/failed/skipped}

### What Changed
{concise list of all files modified during review}
```

If everything is clean, say: "No issues found. Ready to commit."
Tell user to run /git to commit and push.
