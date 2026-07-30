## Feature: Durable Auto-Flow — Stage State on Disk + Stop-Hook Driver

### Impact Analysis
- Files affected: `hooks/session_stop.py`, `commands/ec-brainstorm.md`, `commands/ec-feature.md`, `commands/ec-execute.md`, `commands/ec-review.md`, `tests/test_hooks.py`, `tests/test_command_docs.py`, plus installed copies `~/.efficlaude/hooks/session_stop.py` and `~/.claude/commands/ec-{brainstorm,feature,execute,review}.md`
- ⚠️ Breaking change risk:
  - `hooks/session_stop.py` is a registered `Stop` hook (`~/.claude/settings.json`). A crash or stray stdout here degrades every session. Mitigated by wrapping driver logic in try/except and by suppressing `check_uncommitted()`'s stdout whenever a JSON payload is emitted.
  - `main()` currently calls `sys.exit(0)` when the worker is unreachable (`hooks/session_stop.py:152`). Left as-is, that path would swallow the driver payload. Mitigated by catching `SystemExit` around the legacy body.
  - Sentinel gains new fields. Existing readers parse only `branch=` with `grep '^branch='` (`ec-feature.md:29`, `ec-execute.md:82`, `ec-review.md` equivalent), so extra lines are inert — verified by Task 7.

### Reusable Existing Code
- `_warn(tag, msg)` at `hooks/session_stop.py:16` — rotating log helper; reuse for all driver logging, no new logging code.
- Routing table at `commands/ec-next.md:47-53` — the next-command derivation is copied from here, truncated before the `/ec-git` row.
- Age + branch guard shell block at `commands/ec-execute.md:79-84` — the driver mirrors its semantics (7200s, branch match) in Python.
- `subprocess.run([... 'git' ...], capture_output=True, timeout=…)` pattern at `hooks/session_stop.py:119-122` — reuse for branch detection.
- Hook test pattern at `tests/test_hooks.py:35-53` — imports functions directly from `session_stop`; `sys.path.insert` already set up at `tests/test_hooks.py:9`.
- Command-doc assertion pattern at `tests/test_command_docs.py:8-10` (`read_command`) — reuse for Task 7.

### Grounding
Measured 2026-07-30 — real command output only.
- `wc -l hooks/session_stop.py` → 170
- `wc -l commands/ec-brainstorm.md` → 279
- `wc -l commands/ec-feature.md` → 370
- `wc -l commands/ec-execute.md` → 235
- `wc -l commands/ec-review.md` → 267
- `grep -c 'stage=' commands/ec-brainstorm.md` → 0
- `grep -c 'stage=' commands/ec-feature.md` → 0
- `grep -c 'stage=' commands/ec-execute.md` → 0
- `grep -c 'stage=' commands/ec-review.md` → 0
- `grep -c 'autoflow' hooks/session_stop.py` → 0
- `grep -c '^def ' hooks/session_stop.py` → 8
- `grep -c 'autoflow' commands/ec-brainstorm.md` → 2
- Baseline test result: `python3 -m pytest tests/ -q` → **62 passed, 1 warning** (exit 0)
- `python3 -c "import ast; ast.parse(open('hooks/session_stop.py').read())"` → parses OK
- Source vs installed parity: `diff -q` reports **identical** for `session_stop.py` and all four command files
- `ls .claude/.review-done-main` → ABSENT
- `ls .claude/brainstorms/` → ABSENT
- Verified anchors:
  - `def main():` → `hooks/session_stop.py:148`
  - `    release_stale_locks()` → `hooks/session_stop.py:149`
  - `if __name__ == "__main__":` → `hooks/session_stop.py:169`
  - `**Auto-Flow sentinel format**` → `commands/ec-brainstorm.md:125`
  - `printf 'branch=%s\ncreated=%s\n' "$BRANCH" "$(date +%s)" > .claude/.autoflow` → `commands/ec-brainstorm.md:270`
  - `When AUTO=yes: treat this run like vibe mode … consumed/removed by /ec-review.` → `commands/ec-feature.md:34`
  - `Next: run /ec-execute to implement this plan.` → `commands/ec-feature.md:370`
  - `When AUTO=yes: auto-skip confirmation gates (like vibe) … leave the sentinel for /ec-review to consume.` → `commands/ec-execute.md:86`
  - `Next: run /ec-review to review the results.` → `commands/ec-execute.md:235`
  - `When AUTO=yes: run the review without pausing … stops before git (see Step 4 teardown).` → `commands/ec-review.md:39`
  - `rm -f .claude/.autoflow` → `commands/ec-review.md:223`
  - `tests/test_hooks.py` → exists, pattern at line 35 (`test_check_uncommitted_no_output_when_clean`)
  - `tests/test_command_docs.py` → exists, `read_command` helper at line 8

### Sentinel Schema (target)
```
branch={branch}
created={unix_epoch}
stage={feature|execute|review}
stages_done={comma-separated completed stages, empty at start}
iterations={driver bookkeeping, starts 0}
driver_stage={last stage observed by the driver — driver-written}
driver_progress={last `- [x]` count observed by the driver — driver-written}
```
`stage=` / `stages_done=` are written by the commands. `iterations=` / `driver_stage=` / `driver_progress=` are written only by the driver. Authority for routing is the on-disk state files, never `stage=`.

### Tasks
- [x] Task 1: Add auto-flow driver to session_stop hook [L] [agent: ec-python] — add sentinel parse/write, branch + plan-progress readers, state-file routing, stall/cap guards, and JSON block emission; rewire main() to preserve all legacy behaviour
- [x] Task 2: Extend sentinel schema and writer in ec-brainstorm [M] — document the 7-field schema and make Step 7 write stage=feature, stages_done=, iterations=0
- [x] Task 3: Advance stage to execute at end of ec-feature [S] — write stage=execute and append feature to stages_done when planning completes
- [x] Task 4: Advance stage to review at end of ec-execute [S] — write stage=review and append execute to stages_done when all tasks complete
- [x] Task 5: State chain-end semantics in ec-review [S] — record that deleting the sentinel is the driver's chain-complete signal and that the driver never routes to git
- [x] Task 6: Unit-test the auto-flow driver [M] [agent: ec-unit-test] — cover parse, routing precedence, git exclusion, stall detection, iteration cap, stale sentinel, and stop_hook_active
- [x] Task 7: Doc-test sentinel schema and backward compatibility [S] [agent: ec-unit-test] — assert the schema appears in the command docs and that existing grep '^branch=' readers still match
- [x] Task 8: Sync source to installed copies [S] — copy the hook and four command files to ~/.efficlaude/hooks/ and ~/.claude/commands/

### Per Task Detail

**Task 1 — Add auto-flow driver to session_stop hook** `L`
- File: `hooks/session_stop.py`
- Anchor: `def main():` → `hooks/session_stop.py:148` (insert the new block immediately above it; then rename that `def main():` to `def _legacy_main(quiet=False):` and add a new `main()` below the inserted block)
- Reuse: `_warn()` at line 16 for all logging; the `subprocess.run` git pattern at lines 119-122; do not add a second logging helper
- Code sample:
  ```python
  # add to the import block at the top (re is not currently imported)
  import re

  AUTOFLOW_PATH = os.path.join(".claude", ".autoflow")
  AUTOFLOW_MAX_AGE = 7200
  AUTOFLOW_MAX_ITERATIONS = 40
  _SENTINEL_ORDER = ["branch", "created", "stage", "stages_done",
                     "iterations", "driver_stage", "driver_progress"]


  def _parse_sentinel(path):
      fields = {}
      try:
          with open(path) as f:
              for line in f:
                  line = line.strip()
                  if not line or "=" not in line:
                      continue
                  key, _, value = line.partition("=")
                  fields[key.strip()] = value.strip()
      except Exception:
          return None
      return fields or None


  def _write_sentinel(path, fields):
      lines = [f"{k}={fields[k]}" for k in _SENTINEL_ORDER if k in fields]
      lines += [f"{k}={v}" for k, v in fields.items() if k not in _SENTINEL_ORDER]
      with open(path, "w") as f:
          f.write("\n".join(lines) + "\n")


  def _current_branch():
      try:
          result = subprocess.run(
              ["git", "branch", "--show-current"],
              capture_output=True, text=True, cwd=os.getcwd(), timeout=3
          )
          return re.sub(r"[^a-zA-Z0-9._-]", "-", result.stdout.strip()) or "default"
      except Exception:
          return "default"


  def _plan_counts(branch):
      plan = os.path.join(".claude", "plans", f"{branch}.md")
      if not os.path.exists(plan):
          return None
      done = todo = 0
      try:
          with open(plan) as f:
              for line in f:
                  stripped = line.lstrip()
                  if stripped.startswith("- [x]"):
                      done += 1
                  elif stripped.startswith("- [ ]"):
                      todo += 1
      except Exception:
          return None
      return done, todo


  def _next_autoflow_command(branch):
      """Route from on-disk state, mirroring commands/ec-next.md:47-53 truncated
      before the /ec-git row. Returns None when the chain is finished."""
      if os.path.exists(os.path.join(".claude", f".review-done-{branch}")):
          return None
      counts = _plan_counts(branch)
      if counts is not None:
          done, todo = counts
          if todo > 0:
              return "/ec-execute"
          if done > 0:
              return "/ec-review"
      if os.path.exists(os.path.join(".claude", "decisions", f"{branch}.md")):
          return "/ec-feature"
      try:
          if any(n.endswith(".md")
                 for n in os.listdir(os.path.join(".claude", "brainstorms"))):
              return "/ec-feature"
      except Exception:
          pass
      return None


  def _autoflow_end(path, why):
      try:
          os.remove(path)
      except Exception:
          pass
      _warn("autoflow", f"chain ended: {why}")


  def autoflow_driver(hook_input):
      """Keep an auto-flow chain running across context loss. Returns a Stop-hook
      payload dict to emit, or None to let the session stop normally."""
      if hook_input.get("stop_hook_active"):
          return None
      path = AUTOFLOW_PATH
      fields = _parse_sentinel(path)
      if not fields:
          return None
      branch = _current_branch()
      try:
          age = time.time() - os.path.getmtime(path)
      except Exception:
          age = AUTOFLOW_MAX_AGE + 1
      if age > AUTOFLOW_MAX_AGE or fields.get("branch") != branch:
          _autoflow_end(path, "stale sentinel")
          return None
      try:
          iterations = int(fields.get("iterations") or 0)
      except ValueError:
          iterations = 0
      if iterations >= AUTOFLOW_MAX_ITERATIONS:
          _autoflow_end(path, f"iteration cap {AUTOFLOW_MAX_ITERATIONS} reached")
          return None
      next_command = _next_autoflow_command(branch)
      if next_command is None:
          _autoflow_end(path, "chain complete")
          return None
      counts = _plan_counts(branch)
      progress = counts[0] if counts else 0
      stage = fields.get("stage", "")
      seen_stage = fields.get("driver_stage")
      try:
          seen_progress = int(fields.get("driver_progress"))
      except (TypeError, ValueError):
          seen_progress = -1
      if seen_stage is not None and stage == seen_stage and progress <= seen_progress:
          _autoflow_end(path, f"no progress at stage={stage} progress={progress}")
          return None
      fields["driver_stage"] = stage
      fields["driver_progress"] = str(progress)
      fields["iterations"] = str(iterations + 1)
      _write_sentinel(path, fields)
      _warn("autoflow",
            f"resuming {next_command} (stage={stage} progress={progress} "
            f"iter={iterations + 1})")
      return {
          "decision": "block",
          "reason": (
              f"Auto-flow is still running on branch {branch} "
              f"(stage={stage or 'unknown'}, {progress} task(s) marked done). "
              f"Do not stop. Invoke {next_command} now and continue the chain "
              f"to completion. Never run git — the chain stops before /ec-git."
          ),
      }


  def _read_hook_input():
      try:
          raw = sys.stdin.read()
      except Exception:
          return {}
      try:
          return json.loads(raw) if raw.strip() else {}
      except Exception:
          return {}
  ```
  Then rename the existing `def main():` (line 148) to `def _legacy_main(quiet=False):` and guard its stdout-producing call:
  ```python
  def _legacy_main(quiet=False):
      release_stale_locks()
      if not quiet:
          check_uncommitted()
      if not ensure_worker(wait_secs=3):
          return
      # ...rest of the existing body unchanged...
  ```
  (`sys.exit(0)` at old line 152 becomes `return`; keep every other statement identical.)
  And add the new entry point:
  ```python
  def main():
      hook_input = _read_hook_input()
      payload = None
      try:
          payload = autoflow_driver(hook_input)
      except Exception as e:
          _warn("session_stop", f"autoflow driver failed: {e}")
      try:
          _legacy_main(quiet=payload is not None)
      except SystemExit:
          pass
      except Exception as e:
          _warn("session_stop", f"legacy main failed: {e}")
      if payload is not None:
          if os.environ.get("EFFICLAUDE_AUTOFLOW_MODE") == "exit2":
              print(payload["reason"], file=sys.stderr)
              sys.exit(2)
          print(json.dumps(payload))
  ```
- Do not touch: `_warn`, `get_project_name`, `ensure_worker`, `check_uncommitted`, `auto_export`, `ensure_commit_hook`, `release_stale_locks` bodies — all seven stay byte-identical. Do not touch `WORKER_URL` / `START_SH`. Do not change `if __name__ == "__main__": main()` at lines 169-170.
- Edge cases: no sentinel (return None, silent); malformed sentinel line without `=` (skipped); `iterations` / `driver_progress` non-numeric (defaults, no crash); plan file absent while decision file present (routes `/ec-feature`); `.claude/brainstorms/` absent (`os.listdir` raises, caught); stdin empty or not JSON (empty dict); git unavailable (branch `default`, sentinel branch will not match → chain ends cleanly rather than looping).
- ⚠️ Breaking change: this file is a live `Stop` hook. Emitting anything to stdout other than the JSON payload breaks the contract — that is why `check_uncommitted()` is suppressed when a payload exists. Catching `SystemExit` is required so the worker-offline path no longer discards the payload.
- Acceptance: importing `session_stop` exposes `autoflow_driver`, `_parse_sentinel`, `_write_sentinel`, `_current_branch`, `_plan_counts`, `_next_autoflow_command`, `_autoflow_end`, `_read_hook_input`, and `_legacy_main`; the seven pre-existing helpers still exist; and running the hook with no sentinel present produces no stdout.
- Verify: `python3 -c "import sys; sys.path.insert(0,'hooks'); import session_stop as s; new=['autoflow_driver','_parse_sentinel','_write_sentinel','_current_branch','_plan_counts','_next_autoflow_command','_autoflow_end','_read_hook_input','_legacy_main']; old=['_warn','get_project_name','ensure_worker','check_uncommitted','auto_export','ensure_commit_hook','release_stale_locks']; print(all(hasattr(s,n) for n in new+old))"` → prints `True` (presence check — no numeric threshold, nothing to trace)
- Rollback: `git checkout -- hooks/session_stop.py`
- Dependencies: none

**Task 2 — Extend sentinel schema and writer in ec-brainstorm** `M`
- File: `commands/ec-brainstorm.md`
- Anchor: `**Auto-Flow sentinel format**` → `commands/ec-brainstorm.md:125`, and `printf 'branch=%s\ncreated=%s\n' "$BRANCH" "$(date +%s)" > .claude/.autoflow` → `commands/ec-brainstorm.md:270`
- Reuse: the `### Sentinel Schema (target)` block in this plan file — copy the field list verbatim so hook and docs cannot drift
- Code sample: replace the two-line description at lines 125-126 with the full field list (`branch`, `created`, `stage`, `stages_done`, `iterations`, `driver_stage`, `driver_progress`), stating which fields are command-written and which are driver-written, that routing authority is the on-disk state files rather than `stage=`, and that the `Stop` hook `session_stop.py` drives the chain so it survives context loss and compaction. Replace the writer at line 270 with:
  ```bash
  printf 'branch=%s\ncreated=%s\nstage=feature\nstages_done=\niterations=0\n' \
    "$BRANCH" "$(date +%s)" > .claude/.autoflow
  ```
  Also amend the Step 3 `auto` bullet (line 122) to state that auto-flow survives context exhaustion because the driver resumes it from disk.
- Do not touch: Steps 0–6 apart from the line-122 bullet; the No-Code Rule block; the decision template.
- Edge cases: keep the 2-hour staleness rule and the branch-mismatch rule stated exactly as before — the driver depends on both; do not change `7200`.
- ⚠️ Breaking change: none — readers grep only `^branch=`.
- Acceptance: the sentinel format section names all seven fields and says which side writes each; Step 7's writer emits five lines including `stage=feature`.
- Verify: `grep -c 'stage=' commands/ec-brainstorm.md` → `>= 2` (baseline 0 in `### Grounding`; the schema block and the writer each add at least one, prose mentions may add more, so the count genuinely varies)
- Rollback: `git checkout -- commands/ec-brainstorm.md`
- Dependencies: none

**Task 3 — Advance stage to execute at end of ec-feature** `S`
- File: `commands/ec-feature.md`
- Anchor: `Next: run /ec-execute to implement this plan.` → `commands/ec-feature.md:370`
- Reuse: the sentinel-read shell block at `commands/ec-feature.md:25-33` — the update block goes in the same idiom
- Code sample: insert immediately above line 370, inside Step 6, a paragraph reading "**Auto-Flow stage advance:** If `AUTO=yes`, record that planning is done so the Stop-hook driver routes to the next stage even if this context is lost:" followed by a bash block:
  ```bash
  if [ -f .claude/.autoflow ]; then
    python3 - <<'PY'
  import os
  p = os.path.join(".claude", ".autoflow")
  f = {}
  for line in open(p):
      if "=" in line:
          k, _, v = line.strip().partition("=")
          f[k] = v
  f["stage"] = "execute"
  done = [s for s in f.get("stages_done", "").split(",") if s]
  if "feature" not in done:
      done.append("feature")
  f["stages_done"] = ",".join(done)
  order = ["branch", "created", "stage", "stages_done", "iterations",
           "driver_stage", "driver_progress"]
  keys = [k for k in order if k in f] + [k for k in f if k not in order]
  open(p, "w").write("\n".join(f"{k}={f[k]}" for k in keys) + "\n")
  PY
  fi
  ```
- Do not touch: the Auto-Flow check block at lines 23-34 (it must keep saying the sentinel is not deleted here); the confirm gate wording; Steps 0–5.
- Edge cases: sentinel absent → the `if` guard makes it a no-op; `stages_done` already containing `feature` → not duplicated; unknown extra fields → preserved by the order-then-remainder write.
- ⚠️ Breaking change: none.
- Acceptance: after a plan is written under `AUTO=yes`, `.claude/.autoflow` reads `stage=execute` and `stages_done` contains `feature`, with `branch=` and `created=` unchanged.
- Verify: `grep -c 'f\["stage"\] = "execute"' commands/ec-feature.md` → `== 1` (baseline 0 — the inserted block sets the field with Python assignment syntax, so the pattern must match `f["stage"] = "execute"`, not a literal `stage=execute`; corrected during execution after Task 3 reported a threshold mismatch against the original pattern)
- Rollback: `git checkout -- commands/ec-feature.md`
- Dependencies: Task 2 (schema must be defined first)

**Task 4 — Advance stage to review at end of ec-execute** `S`
- File: `commands/ec-execute.md`
- Anchor: `Next: run /ec-review to review the results.` → `commands/ec-execute.md:235`
- Reuse: the same inline-python update block as Task 3, with `stage=review` and `execute` appended to `stages_done`
- Code sample: insert immediately above line 235 (after the lock release) a paragraph reading "**Auto-Flow stage advance:** If `AUTO=yes`, record that execution is done so the Stop-hook driver routes to `/ec-review` even if this context is lost." followed by the same `bash` + heredoc shape as Task 3 but setting `f["stage"] = "review"` and appending `"execute"` to `stages_done`. Also append to the `When AUTO=yes` paragraph at line 86 a sentence stating that partial progress is safe because the driver re-invokes `/ec-execute` from the plan file's remaining `- [ ]` lines, so the sentinel must NOT be deleted merely because this context ended mid-plan.
- Do not touch: the Auto-Flow detection block at lines 76-84; Error Recovery (line 176) and Timeout Rule (line 184) sentinel deletions — those are genuine aborts and must keep deleting the sentinel; the per-task `[x]` update rule at line 107 (the driver's progress signal depends on it).
- Edge cases: sentinel absent → no-op via the `if` guard; execution ending mid-plan → `stage` stays `execute`, driver re-routes to `/ec-execute`, and the rising `[x]` count keeps the stall guard satisfied.
- ⚠️ Breaking change: none.
- Acceptance: the file states that a mid-plan context loss under `AUTO=yes` is resumed by the driver rather than requiring a manual re-invocation, and the stage advance to `review` runs only after all tasks complete.
- Verify: `grep -c 'f\["stage"\] = "review"' commands/ec-execute.md` → `== 1` (baseline 0 — same Python-assignment-syntax correction as Task 3; a literal `stage=review` never appears in the inserted block)
- Rollback: `git checkout -- commands/ec-execute.md`
- Dependencies: Task 2

**Task 5 — State chain-end semantics in ec-review** `S`
- File: `commands/ec-review.md`
- Anchor: `When AUTO=yes: run the review without pausing for confirmation.` → `commands/ec-review.md:39`
- Reuse: existing teardown block at lines 214-224 — no change to the `rm -f` itself
- Code sample: extend the line-39 paragraph with: deleting `.claude/.autoflow` is the signal the `Stop`-hook driver reads as "chain complete"; the driver never routes to `/ec-git` even once `.claude/.review-done-{BRANCH}` exists, so git stays manual per GIT RULES. Add one sentence near the teardown at line 223 noting the deletion is what stops the driver from blocking further turns. The phrase `never routes to` must appear literally.
- Do not touch: the two-stage review structure; `rm -f {DECISION_FILE}`; `touch {REVIEW_DONE}`; the plan-archival block at lines 215-222; the not-clean path at line 226.
- Edge cases: review not clean → sentinel still deleted (already the behaviour at line 226), so the driver stops rather than looping on an unfixed review.
- ⚠️ Breaking change: none.
- Acceptance: the file states that sentinel deletion is the driver's chain-complete signal and that the driver never routes to git.
- Verify: `grep -c 'never routes to' commands/ec-review.md` → `>= 1` (baseline 0 — string absent before this task)
- Rollback: `git checkout -- commands/ec-review.md`
- Dependencies: none

**Task 6 — Unit-test the auto-flow driver** `M`
- File: `tests/test_hooks.py`
- Anchor: `def test_check_uncommitted_no_output_when_clean(capsys):` → `tests/test_hooks.py:35` (append the new tests at end of file; `sys.path.insert` for `hooks/` already present at line 9)
- Reuse: the existing `from session_stop import …` + `tmp_path` + `monkeypatch.chdir` idiom already used at lines 35-95; `unittest.mock.patch` already imported at line 6
- Code sample: add a `TestAutoflowDriver` class whose helper writes a sentinel and a plan into `tmp_path`, chdirs there, and patches `session_stop._current_branch` to return `"main"`:
  ```python
  def _sentinel(tmp_path, **over):
      f = {"branch": "main", "created": str(int(time.time())),
           "stage": "execute", "stages_done": "feature", "iterations": "0"}
      f.update(over)
      p = tmp_path / ".claude" / ".autoflow"
      p.parent.mkdir(parents=True, exist_ok=True)
      p.write_text("".join(f"{k}={v}\n" for k, v in f.items()))
      return p
  ```
  Required cases:
  - no sentinel → `autoflow_driver({})` is `None`
  - `stop_hook_active: True` → `None` and the sentinel file still exists
  - plan with 1 `- [x]` and 2 `- [ ]` → payload `reason` contains `/ec-execute`
  - plan with 2 `- [x]` and 0 `- [ ]` → `reason` contains `/ec-review`
  - no plan, decision file present → `reason` contains `/ec-feature`
  - `.review-done-main` present → `None` and sentinel deleted
  - `_next_autoflow_command` never returns `/ec-git` for any routing case above, and the payload `reason`'s imperative is never `Invoke /ec-git` — corrected during execution: the original wording ("`reason` never contains `/ec-git`") is unsatisfiable, because the reason string deliberately ends with the negative instruction "Never run git — the chain stops before /ec-git."
  - stall: sentinel with `driver_stage=execute`, `driver_progress=1`, plan with 1 `- [x]` → `None` and sentinel deleted
  - progress: same sentinel but plan with 2 `- [x]` → payload returned, sentinel `driver_progress` becomes `2`
  - `iterations=40` → `None` and sentinel deleted
  - sentinel `branch=other` → `None` and sentinel deleted
  - sentinel `mtime` older than 7200s (`os.utime`) → `None` and sentinel deleted
  - `iterations=abc` and `driver_progress=xyz` → no exception, payload returned
  - `_parse_sentinel` on a file containing a line without `=` → that line ignored, other keys parsed
  - `_write_sentinel` round-trip preserves an unknown extra field
  - `payload["decision"] == "block"` and `payload["reason"]` is a non-empty string
- Do not touch: the four existing tests at lines 12-95 — they must keep passing unchanged.
- Edge cases: tests must not touch the real repo `.claude/` — every case uses `tmp_path` + `monkeypatch.chdir`; `_current_branch` is patched so no test depends on the actual git branch.
- ⚠️ Breaking change: none.
- Acceptance: the full suite passes with strictly more tests than the 62-test baseline, and no test writes outside `tmp_path`.
- Verify: `python3 -m pytest tests/ -q 2>&1 | tail -3` → reports `0 failed` and a passed count strictly greater than the baseline 62 recorded in `### Grounding`
- Rollback: `git checkout -- tests/test_hooks.py`
- Dependencies: Task 1

**Task 7 — Doc-test sentinel schema and backward compatibility** `S`
- File: `tests/test_command_docs.py`
- Anchor: `def read_command(name):` → `tests/test_command_docs.py:8` (append a new class at end of file, reusing this helper)
- Reuse: `read_command()` at line 8 — do not add a second file reader
- Code sample: add a `TestAutoflowSentinelSchema` class asserting:
  - `read_command('ec-brainstorm.md')` contains each of `stage=`, `stages_done=`, `iterations=` (present with `=` in the Step 7 `printf` writer) and `driver_stage`, `driver_progress` (documented as backticked names in the schema table, NOT with `=` — corrected during execution)
  - it still contains `2 hours` (staleness guard wording preserved). Corrected during execution: `7200` does not appear in ec-brainstorm.md at all — it lives in the three reader files (ec-feature/ec-execute/ec-review), each once.
  - `read_command('ec-feature.md')` contains `f["stage"] = "execute"` (Python assignment syntax — a literal `stage=execute` never appears; corrected during execution)
  - `read_command('ec-execute.md')` contains `f["stage"] = "review"`
  - `read_command('ec-review.md')` contains `never routes to`
  - backward compatibility: for the five-line sentinel body emitted by ec-brainstorm's writer, `re.search(r'^branch=(.*)$', body, re.M).group(1) == 'main'` — proving existing `grep '^branch='` readers still resolve the branch with the extra fields present
- Do not touch: every existing class in the file.
- Edge cases: assert on substrings only — never on line numbers, which shift as the docs grow.
- ⚠️ Breaking change: none.
- Acceptance: the schema is asserted in the docs, and the backward-compatibility assertion proves `^branch=` extraction is unaffected by the new fields.
- Verify: `python3 -m pytest tests/test_command_docs.py -q 2>&1 | tail -3` → reports `0 failed`
- Rollback: `git checkout -- tests/test_command_docs.py`
- Dependencies: Tasks 2, 3, 4, 5

**Task 8 — Sync source to installed copies** `S`
- File: `~/.efficlaude/hooks/session_stop.py` and `~/.claude/commands/ec-{brainstorm,feature,execute,review}.md`
- Anchor: new file — these are destination copies; source parity was confirmed `identical` in `### Grounding`
- Reuse: none — plain copy
- Code sample:
  ```bash
  cp hooks/session_stop.py ~/.efficlaude/hooks/session_stop.py
  for f in ec-brainstorm ec-feature ec-execute ec-review; do
    cp "commands/$f.md" "$HOME/.claude/commands/$f.md"
  done
  ```
- Do not touch: any other file under `~/.efficlaude/` or `~/.claude/` — in particular do not modify `~/.claude/settings.json`; the `Stop` hook is already registered and needs no change.
- Edge cases: run this only after Tasks 1–5 are complete, or the installed copies will lag the source.
- ⚠️ Breaking change: this activates the driver for every session on this machine. The `EFFICLAUDE_AUTOFLOW_MODE=exit2` escape hatch from Task 1 and the no-sentinel silent path are the safety nets.
- Acceptance: `diff -q` reports no differences between each source file and its installed copy.
- Verify: `diff -q hooks/session_stop.py ~/.efficlaude/hooks/session_stop.py && for f in ec-brainstorm ec-feature ec-execute ec-review; do diff -q "commands/$f.md" "$HOME/.claude/commands/$f.md" || exit 1; done && echo SYNCED` → prints `SYNCED` (exit-status check — no numeric threshold)
- Rollback: re-run `install.sh`, or `cp` from the restored source files
- Dependencies: Tasks 1, 2, 3, 4, 5
