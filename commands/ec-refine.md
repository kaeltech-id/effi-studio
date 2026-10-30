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

## Step 0.5 — Batched probe script
Steps 1, 2 and 3 are all read-only probes over the same tree. Issued one call per task they are 130 round-trips on a 130-task plan — ten minutes of waiting for work that takes seconds. Emit ONE script holding every check, run it in a single call, and read the table it prints.

```bash
probe() { printf '%s|%s|%s\n' "$1" "$2" "$(timeout 10 bash -c "$2" 2>&1 | tail -1)"; }
# one probe line per check, for Steps 1, 2 and 3 together
probe 'T1 verify'   'grep -c "foo" src/a.ts'
probe 'T1 anchor'   'grep -n -F "export function foo" src/a.ts | head -1'
probe 'grounding'   'wc -l < src/a.ts'
probe 'T2 newfile'  'test -f src/b.ts; echo $?'
```

Every probe is wrapped in `timeout 10`: batching means one hanging command would stall the whole audit instead of one round-trip. A probe that times out is UNVERIFIABLE, never a DEFECT.

A command that would write, delete, or change git state is never put in the script at all — it is reported UNVERIFIABLE on sight, exactly as Step 1's table already requires.

## Step 0.9 — Proof mode and the proof-verb gate
`DECISION_FILE=".claude/decisions/${BRANCH}.md"`

Read the `Proof mode:` line from `{PLAN_FILE}` — `/ec-plan` stamps it there.
Fall back to `## Proof Mode` in `{DECISION_FILE}`; when neither says, it means
`handoff`. Note "(proof mode: {MODE})".

On `handoff`, every `Verify (local)` must satisfy the allowed-check rule in
`/ec-plan` — that paragraph is authoritative and lists both what qualifies and
what does not. Scan the plan and report a **DEFECT** for any task whose
`Verify (local)` is not an allowed check, including every runner that paragraph
names as a Handoff step: `npm run build`, `npm run tauri`, `vite build`,
`cargo build`, `cargo check`, `cargo test`, `go build`, `go test`, `make`,
`mvn`, `gradle`, `xcodebuild`, `pytest`, `npm test`, `jest`, `vitest`,
`eslint`, `ruff`, `mypy`, `hdiutil`, `docker build`, `playwright`, `cypress`,
`curl` against a running server, or a launch of the app. Judge anything on
neither list by the principle, and resolve ambiguity as a DEFECT. Name the task
and say the step belongs in `### Handoff`. This is the mechanical half of the
proof rule: without it the rule is prose a plan can quietly ignore.

**Removed proof steps must reappear.** For every proof step this gate rejects,
and for every build or launch the plan's feature plainly needs but no task
performs, confirm the plan's `### Handoff` block carries a bullet naming it.
A plan that drops a proof step and writes no Handoff bullet is a **DEFECT** —
otherwise deleting the proof is the cheapest way to pass this gate, which is
exactly how this mode would decay.

**Outward-facing scan — runs in both modes, independent of proof mode.** Scan
every task's `Code sample`, description and `Verify` lines for a command that
changes state outside this working tree: `ssh`, `scp`, `rsync`, `kubectl`,
`terraform`, `aws`, `gcloud`, `az`, `flyctl`, `vercel`, `npm publish`,
`docker push`, `gh`, any `--prod` flag, or a write under `$HOME`. Report each
as a **NOTE** naming the task and the target — not a DEFECT, because the
deliverable rule makes these legitimate tasks. The NOTE is what lets
`/ec-execute` know which tasks need confirmation before its own read order
reaches their detail.

On `handoff`, skip only the whole-project baseline comparison in Step 2. A
per-string baseline that a `grep -c` verify needed IS recorded by `/ec-plan`'s
grounding pass on `handoff`, so Step 1's PASS row stays reachable and must be
used normally. The anchor checks, the new-file checks, the dependency-edge
check and the plan lint all still run; they are static and cost nothing.

On `in-cycle` none of this section applies: every `Verify (local)` may name a
build, a launch or a suite, because there the artifact is the deliverable. Step
1 and Step 2 then run exactly as written, baselines and all. The outward-facing
scan above still runs, in both modes.

## Step 1 — Dry-run every Verify (local)
Every `Verify (local)` a plan produces is a read-only command — a `grep -c`, a
`test -f`, a `bash -n`. That is what makes this step possible: all of them can
run BEFORE execution, when the correct result is still the task's recorded
baseline in `### Grounding`.

Collect every task's `Verify (local)` into the batched probe script above, run it once, then compare each observed value:

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
since changed, and every threshold derived from it is suspect. These
re-measurements belong in the same batched run as Step 1 — one script, one call,
all three steps.

## Step 3 — Confirm anchors exist
For each task carrying an `Anchor:` line, grep that exact string in the task's
`File:`. A missing anchor is a stale plan: the executor would have to guess
placement, which the Anchor Discipline in `/ec-execute` forbids. These anchor
greps belong in the same batched run as Steps 1 and 2.

## Step 4 — Confirm new files are absent
For each task whose `File:` is claimed new, confirm it does not exist on disk.
This is checkable only before execution — afterwards the file exists precisely
because the task created it — which is why the check lives here and nowhere else.

## Step 4.5 — Confirm dependency edges are honest
`/ec-execute` now levels `Dependencies:` into concurrent waves, so a missing edge no longer merely mis-orders work — it lets a task run before the file it edits exists. One case a plan may never get away with:

For every task T whose `File:` is created by another task C in the same plan — C's `File:` equals T's and C is recorded in `### Grounding` as "new file — no anchor" — confirm T's `Dependencies:` names C, directly or transitively. A task that edits a file created by another task and declares `Dependencies: none` is a **DEFECT**: report it as a missing edge, naming both T and C.

The reverse is not a defect. An edge that is present but unnecessary costs wave width, not correctness — report it as a note, never as a DEFECT, and never block the sentinel on it.

This check is static: it reads the plan, runs nothing, and costs no time in the batched script.

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
