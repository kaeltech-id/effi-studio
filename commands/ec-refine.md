Audit the current plan before any code is written. Read `.claude/project-config.json` and CLAUDE.md first.

**Branch detection:** Run:
```bash
BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
[ -z "$BRANCH" ] && BRANCH="default"
PLAN_FILE=".claude/plans/${BRANCH}.md"
REFINED=".claude/.refined-${BRANCH}"
```
Note: "(branch: {BRANCH} → plan: {PLAN_FILE})"

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
When `AUTO=yes`: this command still runs in full. Its checks are mechanical, not
interactive — there is no confirmation gate to skip. It blocks only on a failed
check, never to ask a question.

**No-Code Rule:** This command MUST NOT create, edit, or write any project file.
Allowed writes: `.claude/.refined-{BRANCH}` only.
Reporting a defect is the output; fixing it belongs to `/ec-plan`. A refine that
edits the plan silently becomes a second planner, and the audit then has no
independent reader.

**Plan check:** If `{PLAN_FILE}` does not exist, stop — "No plan to audit. Run /ec-plan first."
Count task lines (`- [ ]` plus `- [x]`). If zero, stop — "Plan has no tasks." and do NOT write the sentinel.

An existing `{REFINED}` from an earlier run is not evidence: re-run the full audit
and refresh it, because the plan may have been rewritten since.

## Step 1 — Dry-run every Verify (local)
Every `Verify (local)` a plan produces is a read-only command — a `grep -c`, a
`test -f`, a `bash -n`. That is what makes this step possible: all of them can
run BEFORE execution, when the correct result is still the task's recorded
baseline in `### Grounding`.

For each task, run its `Verify (local)` and compare:

| Observed | Verdict | Meaning |
|---|---|---|
| equals the task's stated expectation | **DEFECT** | The threshold is already satisfied, so the command cannot prove the task did anything |
| equals the baseline recorded in `### Grounding` | **PASS** | The check will move when the task runs |
| neither | **DEFECT** | The plan was measured against a tree that has since moved |
| command would write, delete, or change git state | **UNVERIFIABLE** | Never run it; report it |

A `Verify (local)` with no numeric threshold — file existence, exit status,
string presence — is PASS when the command is runnable, since there is nothing
to compare it against.

## Step 2 — Re-measure Grounding against disk
Re-run every `wc -l` and `grep -c` recorded in `### Grounding` and compare to the
recorded value. Any drift means the plan was written against a tree that has
since changed, and every threshold derived from it is suspect.

## Step 3 — Confirm anchors exist
For each task carrying an `Anchor:` line, grep that exact string in the task's
`File:`. A missing anchor is a stale plan: the executor would have to guess
placement, which the Anchor Discipline in `/ec-execute` forbids.

## Step 4 — Confirm new files are absent
For each task whose `File:` is claimed new, confirm it does not exist on disk.
This is checkable only before execution — afterwards the file exists precisely
because the task created it — which is why the check lives here and nowhere else.

## Step 5 — Report and gate
Print one line per task:
```
Task {N}: PASS | DEFECT | UNVERIFIABLE — {command} → {actual output}
```
Then a summary: `{n} pass · {n} defect · {n} unverifiable`.

**If any DEFECT:** do not write the sentinel. Name the task and the exact
mismatch. Fixing it is `/ec-plan`'s job, so say so. If `AUTO=yes`, also run
`rm -f .claude/.autoflow` — the chain stops here rather than executing a plan
known to be wrong.

**If any UNVERIFIABLE but no DEFECT:** write the sentinel and report the
unverifiable tasks, so the gap is recorded rather than hidden. A command this
step cannot safely run is a limitation of the audit, not a defect in the plan.

**If clean:** run `touch {REFINED}`, record the stage so the Stop-hook
driver has an accurate trail even if this context is lost, and show
"Plan audited: {n} tasks, all verifiable. Next: run `/ec-execute`."

```bash
if [ -f .claude/.autoflow ]; then
  python3 - <<'EOF'
import os
p = os.path.join(".claude", ".autoflow")
f = {}
for line in open(p):
    if "=" in line:
        k, _, v = line.strip().partition("=")
        f[k] = v
f["stage"] = "execute"
done = [s for s in f.get("stages_done", "").split(",") if s]
if "refine" not in done:
    done.append("refine")
f["stages_done"] = ",".join(done)
order = ["branch", "created", "stage", "stages_done", "iterations",
         "driver_stage", "driver_progress"]
keys = [k for k in order if k in f] + [k for k in f if k not in order]
open(p, "w").write("\n".join(f"{k}={f[k]}" for k in keys) + "\n")
EOF
fi
```

The sentinel is consumed by `/ec-execute` after its final task and removed by
`/ec-review` during teardown, so each plan on a branch must be audited afresh.
