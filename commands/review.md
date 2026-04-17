Review all code changes from the last execution.

## Step 1 — Load Context
Read `.claude/current-plan.md` and `.claude/context/conventions.md`.

## Step 2 — Review Code
For each file modified in the plan:
- Check against conventions (naming, structure, clean code)
- Check correctness and best practices
- Check consistency across files

## Step 3 — Testing
Ask: "Mau tambah unit test untuk fitur ini? (ya/tidak)"

If yes:
- Generate unit tests for new functions/components
- Follow existing test patterns in the project

Ask: "Ada existing test cases yang perlu dijalankan? (ya: sebutkan path / tidak)"

If yes: run the specified tests and report results.

## Step 4 — Report
```
## Review Summary

### Code Quality
- Conventions: ✓/✗ {notes}
- Best practices: ✓/✗ {notes}
- Readability: ✓/✗ {notes}

### Issues Found
- {file}: {issue} → {fix applied}

### Tests
- Unit tests: {added/skipped}
- Existing tests: {passed/failed/skipped}
```

If issues found and fixed, list all changes made.
