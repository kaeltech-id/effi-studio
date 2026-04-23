Route to the correct next EffiClaude workflow command by reading current project state.

## Step 1 — Detect State

Run all five checks in order. Collect each result before routing.

**Check 1 — Review sentinel:**
```
ls .claude/.review-done 2>/dev/null && echo "EXISTS" || echo "ABSENT"
```

**Check 2 — Incomplete tasks in plan:**
```
grep -c '- \[ \] Task' .claude/current-plan.md 2>/dev/null || echo "0"
```

**Check 3 — Completed tasks in plan (plan exists at all):**
```
ls .claude/current-plan.md 2>/dev/null && echo "EXISTS" || echo "ABSENT"
```

**Check 4 — Decision file:**
```
ls .claude/decision.md 2>/dev/null && echo "EXISTS" || echo "ABSENT"
```

**Check 5 — Saved brainstorm files:**
```
ls .claude/brainstorms/*.md 2>/dev/null && echo "EXISTS" || echo "ABSENT"
```

Treat any empty string or command error from `grep -c` as `0`.

## Step 2 — Route

Apply the routing table below in priority order — first match wins.

| Condition | Detected State | Next Command |
|-----------|---------------|--------------|
| Check 1 = EXISTS | Review done, ready to commit | `/ec-git` |
| Check 3 = EXISTS AND Check 2 > 0 | Plan in progress | `/ec-execute` |
| Check 3 = EXISTS AND Check 2 = 0 | Execution done, needs review | `/ec-review` |
| Check 4 = EXISTS OR Check 5 = EXISTS | Brainstorm done, needs planning | `/ec-feature` |
| None of the above | Fresh start | `/ec-brainstorm` |

Show:
```
State detected: {state_description}
→ Next: /{command}

Proceed? (y/n):
```

If user answers `y`: invoke the matched command immediately. Stop.

If user answers `n`: proceed to Step 3.

## Step 3 — Manual Override

Show:
```
Choose manually:
1. /ec-brainstorm — start a new feature brainstorm
2. /ec-feature    — plan a feature from a decision
3. /ec-execute    — resume an in-progress plan
4. /ec-review     — review completed changes
5. /ec-git        — commit and push

Enter number:
```

Map the entered number to the corresponding command and invoke it immediately.
