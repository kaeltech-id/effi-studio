## Feature: Auto-Flow Mode + Plan Archival

### Impact Analysis
- Files affected: `commands/ec-brainstorm.md`, `commands/ec-feature.md`, `commands/ec-execute.md`, `commands/ec-review.md`
- ⚠️ Breaking change risk: none — all new behavior is gated behind a `.claude/.autoflow` sentinel that only exists when the user picks `auto`. Without it, every command behaves exactly as today. Archival only adds copies; the active `{BRANCH}.md` slot and resume logic are untouched.

### Reusable Existing Code
- Sentinel/state-file pattern at `.claude/.mode` and `.claude/.review-done-{BRANCH}` — reuse the same flat-file convention for `.claude/.autoflow`.
- `file_lock.py` lock helpers (ec-execute Step 1) — auto-flow must NOT bypass these; left as-is.
- `vibe` mode gate-skip logic already present in each command's "Mode check" — auto-flow reuses the same "skip gate" branches by treating `AUTO=yes` like vibe for one run.

### Canonical sentinel format (reference for all tasks)
File `.claude/.autoflow`, two lines:
```
branch={BRANCH}
created={unix_epoch_seconds}
```
Read snippet (identical across ec-feature / ec-execute / ec-review — paste verbatim):
```bash
AUTOFLOW=".claude/.autoflow"
AUTO="no"
if [ -f "$AUTOFLOW" ]; then
  MTIME=$(stat -f %m "$AUTOFLOW" 2>/dev/null || stat -c %Y "$AUTOFLOW" 2>/dev/null || echo 0)
  AGE=$(( $(date +%s) - MTIME ))
  SENT_BRANCH=$(grep '^branch=' "$AUTOFLOW" 2>/dev/null | cut -d= -f2)
  if [ "$AGE" -gt 7200 ] || [ "$SENT_BRANCH" != "$BRANCH" ]; then
    rm -f "$AUTOFLOW"
  else
    AUTO="yes"
  fi
fi
```

### Tasks
- [x] Task 1: Sentinel read in ec-feature [S] — add Auto-Flow read block to ec-feature Step 0 (after Branch detection), defining AUTO
- [x] Task 2: Plan archival before overwrite [S] — archive existing plan to `.claude/plans/archive/` in ec-feature Incomplete plan guard
- [x] Task 3: Honor AUTO in ec-feature gates [S] — auto-overwrite at guard + auto-proceed at Step 6 confirm when AUTO=yes
- [x] Task 4: Sentinel read in ec-execute [S] — add Auto-Flow read block to ec-execute Step 1, defining AUTO
- [x] Task 5: Honor AUTO + cleanup in ec-execute [S] — auto-continue pre-flight when AUTO=yes; delete sentinel on abort/fail/timeout
- [x] Task 6: Sentinel read in ec-review [S] — add Auto-Flow read block to ec-review Step 1, defining AUTO
- [x] Task 7: Archival + sentinel teardown in ec-review [S] — archive active plan and delete sentinel at end of clean review; always stop before git
- [x] Task 8: Auto gate + sentinel spec in ec-brainstorm [S] — change Step 3 gate to (y/auto/n) and document the .autoflow format
- [x] Task 9: Auto-chain in ec-brainstorm [M] — auto branch writes sentinel and invokes /ec-feature → /ec-execute → /ec-review sequentially with fallback

### Per Task Detail

**Task 1 — Sentinel read in ec-feature** `S`
- File: `commands/ec-feature.md`
- Reuse: canonical read snippet above
- Anchor: Step 0, immediately after the **Branch detection** fenced block (the line `Note: "(branch: {BRANCH} → plan: {PLAN_FILE})"`).
- Code sample: insert a new subsection:
  ```markdown
  **Auto-Flow check:** Detect whether this run is part of an auto-flow chain:
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
  When `AUTO=yes`: treat this run like `vibe` mode for all confirmation gates (auto-skip). Do NOT delete the sentinel here — it is consumed/removed by `/ec-review`.
  ```
- Edge cases: stale sentinel (>2h) auto-removed; wrong-branch sentinel ignored; no sentinel → AUTO=no (normal).
- ⚠️ Breaking change: none
- Verify: `grep -q 'Auto-Flow check' commands/ec-feature.md && grep -q 'AUTO="yes"' commands/ec-feature.md`
- Dependencies: none

**Task 2 — Plan archival before overwrite** `S`
- File: `commands/ec-feature.md`
- Reuse: none
- Anchor: **Incomplete plan guard** section. Add an archival step that runs whenever `{PLAN_FILE}` exists and is about to be overwritten.
- Code sample: insert before "plan will be overwritten":
  ```markdown
  **Archive before overwrite:** If `{PLAN_FILE}` already exists, archive it before it is overwritten:
  ```bash
  if [ -f "$PLAN_FILE" ]; then
    mkdir -p .claude/plans/archive
    SLUG=$(grep -m1 '^## Feature:' "$PLAN_FILE" | sed 's/^## Feature: *//' | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-' | cut -c1-40)
    [ -z "$SLUG" ] && SLUG="plan"
    cp "$PLAN_FILE" ".claude/plans/archive/${BRANCH}-$(date +%Y-%m-%d-%H%M)-${SLUG}.md"
    echo "(archived previous plan → .claude/plans/archive/${BRANCH}-$(date +%Y-%m-%d-%H%M)-${SLUG}.md)"
  fi
  ```
  This write targets `.claude/plans/` — permitted by the No-Code Rule.
  ```
- Edge cases: no existing plan → skip; missing `## Feature:` line → slug defaults to `plan`.
- ⚠️ Breaking change: none (additive copy; active slot unchanged)
- Verify: `grep -q 'Archive before overwrite' commands/ec-feature.md && grep -q 'plans/archive' commands/ec-feature.md`
- Dependencies: none

**Task 3 — Honor AUTO in ec-feature gates** `S`
- File: `commands/ec-feature.md`
- Reuse: AUTO from Task 1
- Anchor A: **Incomplete plan guard** `If count > 0` block. Anchor B: **Step 6 — Confirm** (`Ask: "Plan sudah benar? Confirm (y/n):"`).
- Code sample (Anchor A) — append to the guard:
  ```markdown
  If `AUTO=yes`: skip the prompt — archive (Task 2 step) and overwrite automatically, then continue.
  ```
- Code sample (Anchor B) — extend the Step 6 vibe rule:
  ```markdown
  - If `AUTO=yes` (auto-flow) **or** MODE is `vibe`: skip this confirm gate and auto-proceed.
  ```
- Edge cases: AUTO=no → unchanged prompts.
- ⚠️ Breaking change: none
- Verify: `grep -c 'AUTO=yes' commands/ec-feature.md` returns ≥ 2
- Dependencies: Task 1, Task 2

**Task 4 — Sentinel read in ec-execute** `S`
- File: `commands/ec-execute.md`
- Reuse: canonical read snippet
- Anchor: Step 1, after the **Mode check** block (ends before `## Step 2`).
- Code sample: insert subsection:
  ```markdown
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
  When `AUTO=yes`: auto-skip confirmation gates (like `vibe`). On any abnormal stop, delete the sentinel (see Error Recovery / Timeout). On successful completion, leave the sentinel for `/ec-review` to consume.
  ```
- Edge cases: same as Task 1.
- ⚠️ Breaking change: none
- Verify: `grep -q 'Auto-Flow check' commands/ec-execute.md`
- Dependencies: none

**Task 5 — Honor AUTO + cleanup in ec-execute** `S`
- File: `commands/ec-execute.md`
- Reuse: AUTO from Task 4
- Anchor A: **Step 2 — Pre-flight Check** prompt (`"Found pre-flight issue: {issue}. Continue anyway? (y/n):"`). Anchor B: **Error Recovery** and **Timeout Rule**. Anchor C: lock-busy abort `If a:`.
- Code sample (Anchor A) — append:
  ```markdown
  If `AUTO=yes`: do not prompt — abort the chain instead. Delete the sentinel (`rm -f .claude/.autoflow`), release the lock, report the pre-flight issue, and stop. Auto-flow never silently continues past a pre-flight failure.
  ```
- Code sample (Anchor B) — append to both Error Recovery and Timeout:
  ```markdown
  If `AUTO=yes`: delete the sentinel (`rm -f .claude/.autoflow`) so the auto-flow chain stops here; then surface the Retry/Skip/Fix choice to the user as normal.
  ```
- Code sample (Anchor C) — append to the `If a:` abort line:
  ```markdown
  If `AUTO=yes`, also run `rm -f .claude/.autoflow` before stopping.
  ```
- Edge cases: AUTO=no → unchanged behavior everywhere.
- ⚠️ Breaking change: none
- Verify: `grep -c 'rm -f .claude/.autoflow' commands/ec-execute.md` returns ≥ 3
- Dependencies: Task 4

**Task 6 — Sentinel read in ec-review** `S`
- File: `commands/ec-review.md`
- Reuse: canonical read snippet
- Anchor: Step 1, after the **Mode check** block.
- Code sample: insert subsection:
  ```markdown
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
  When `AUTO=yes`: run the review without pausing for confirmation. This command is the END of the auto-flow chain — it always deletes the sentinel and stops before git (see Task 7).
  ```
- Edge cases: same as Task 1.
- ⚠️ Breaking change: none
- Verify: `grep -q 'Auto-Flow check' commands/ec-review.md`
- Dependencies: none

**Task 7 — Archival + sentinel teardown in ec-review** `S`
- File: `commands/ec-review.md`
- Reuse: AUTO from Task 6; archival snippet from Task 2
- Anchor: the **"If review is clean"** line and the closing **"Next: run /ec-git"**.
- Code sample (after the clean-review existing actions) — append:
  ```markdown
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
  ```
  ```
- Code sample (the not-clean branch) — add:
  ```markdown
  If review is NOT clean: also run `rm -f .claude/.autoflow` and stop — the auto-flow chain does not proceed to git.
  ```
- Code sample (end / "Next: run /ec-git") — clarify:
  ```markdown
  Auto-flow ends here: even when AUTO=yes, the chain STOPS at this point and only suggests `/ec-git`. Git is never run automatically (GIT RULES).
  ```
- Edge cases: clean and not-clean both delete the sentinel; AUTO=no still archives (harmless history).
- ⚠️ Breaking change: none
- Verify: `grep -q 'rm -f .claude/.autoflow' commands/ec-review.md && grep -q 'plans/archive' commands/ec-review.md`
- Dependencies: Task 6

**Task 8 — Auto gate + sentinel spec in ec-brainstorm** `S`
- File: `commands/ec-brainstorm.md`
- Reuse: none
- Anchor: Step 3 gate (`"Setuju lanjut dengan ini? (y/n — atau describe apa yang kurang):"` and its `- If y:` / `- If n` lines).
- Code sample — replace the gate block with:
  ```markdown
  "Setuju lanjut dengan ini? (y / auto / n — atau describe apa yang kurang):"
  - If y: proceed to Step 4 (normal sharpening flow)
  - If auto: skip Step 4 sharpening — go straight to Step 5 "now" save, then trigger the auto-flow chain (see Step 7). Auto-flow runs /ec-feature → /ec-execute → /ec-review with no further confirmation, stopping before git.
  - If n or feedback: adjust the recommendation, re-present, ask again. Do not revert to showing multiple options.

  **Auto-Flow sentinel format** (written by the auto path in Step 7): file `.claude/.autoflow`, two lines —
  `branch={BRANCH}` and `created={unix_epoch}`. Consumed and removed by /ec-review. Treated as stale (ignored + deleted) by any command if older than 2 hours or if its branch ≠ current branch.
  ```
- Edge cases: `n`/feedback unchanged; `y` unchanged.
- ⚠️ Breaking change: none (adds an option)
- Verify: `grep -q 'y / auto / n' commands/ec-brainstorm.md && grep -q 'Auto-Flow sentinel format' commands/ec-brainstorm.md`
- Dependencies: none

**Task 9 — Auto-chain in ec-brainstorm** `M`
- File: `commands/ec-brainstorm.md`
- Reuse: existing Step 5 "now" save path (writes DECISION_FILE)
- Anchor: end of **Step 6 — Hand Off** (after the `**If "now":**` next-run section). Add a new `## Step 7`.
- Code sample — add a new subsection:
  ```markdown
  ## Step 7 — Auto-Flow Chain (only if user chose `auto` in Step 3)
  After the decision file is saved (Step 5 "now" path), run the full chain automatically:
  1. Write the sentinel:
     ```bash
     mkdir -p .claude
     printf 'branch=%s\ncreated=%s\n' "$BRANCH" "$(date +%s)" > .claude/.autoflow
     ```
  2. Invoke `/ec-feature` via the Skill tool and let it run to completion (it auto-loads {DECISION_FILE}, auto-confirms because AUTO=yes).
  3. Then invoke `/ec-execute` via the Skill tool and let it run all tasks (auto-confirms because AUTO=yes).
  4. Then invoke `/ec-review` via the Skill tool (auto-runs, archives the plan, deletes the sentinel, stops before git).
  5. Surface a final summary and suggest `/ec-git`. Never run git.

  **Verification of mechanism:** If the Skill tool cannot be invoked from within a running command, FALL BACK to executing each command's steps inline in this same session, in the same order, honoring AUTO=yes at every gate. The end state must be identical (plan built, executed, reviewed, sentinel removed, stopped before git).

  **Failure handling:** If /ec-execute or /ec-review aborts (it will delete the sentinel itself), stop the chain and report where it stopped. Do not continue to the next stage.
  ```
- Edge cases: user chose `y` (not `auto`) → Step 7 skipped entirely; worker offline → chain still works (memory saves are best-effort).
- ⚠️ Breaking change: none
- Verify: `grep -q 'Step 7 — Auto-Flow Chain' commands/ec-brainstorm.md && grep -q '.claude/.autoflow' commands/ec-brainstorm.md`
- Dependencies: Task 8 (gate must offer `auto`); relies on Tasks 1-7 honoring the sentinel
