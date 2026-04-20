## Feature: Vibe vs Structured Mode Toggle

### Impact Analysis
- Files affected: commands/ec-mode.md (new), hooks/prompt_submit.py, commands/ec-brainstorm.md, commands/ec-feature.md, commands/ec-execute.md, commands/ec-review.md, commands/ec-git.md, install.sh
- ⚠️ Breaking change risk: none — all changes are additive; default=structured preserves existing behavior

### Reusable Existing Code
- `get_project_name()` at hooks/prompt_submit.py:41 — already reads .claude/ directory
- Python block in install.sh:113 — already writes to ~/.claude/settings.json, extend it for statusCommand

### Tasks
- [x] Task 1: Create ec-mode command [M] — new command file that reads/writes .claude/.mode and displays current mode
- [x] Task 2: Add mode indicator to prompt_submit.py [S] — inject ⚡ VIBE MODE line at top of context when mode=vibe
- [x] Task 3: Add mode check to ec-brainstorm.md [S] — skip confirmation gate, memory save, next-step suggestion in vibe mode
- [x] Task 4: Add mode check to ec-feature.md [S] — skip confirmation gate, memory save, next-step suggestion in vibe mode
- [x] Task 5: Add mode check to ec-execute.md [S] — skip memory save and next-step suggestion in vibe mode
- [x] Task 6: Add mode check to ec-review.md [S] — skip next-step suggestion in vibe mode
- [x] Task 7: Add mode check to ec-git.md [S] — skip next-step suggestion in vibe mode
- [x] Task 8: Update install.sh [S] — add ec-mode to COMMANDS array and statusCommand to settings.json Python block

### Per Task Detail

**Task 1 — Create ec-mode command** `M`
- File: `commands/ec-mode.md` (create new)
- Reuse: none
- Code sample:
```markdown
Read or set the current EffiClaude coding mode.

## Step 1 — Read current mode
Run: `cat .claude/.mode 2>/dev/null || echo "structured"`
Store result as MODE.

## Step 2 — Handle args

**If no args provided (just `/ec-mode`):**
Show current mode and stop:
- If MODE=vibe: "⚡ VIBE MODE — /ec-mode structured to switch back"
- If MODE=structured: "⚙️ STRUCTURED MODE — /ec-mode vibe to switch"

**If arg provided:**
- Accept `vibe` or `structured` only. Anything else: show "Usage: /ec-mode vibe | structured" and stop.
- If arg == MODE (no change): show "Already in {arg} mode — no change." and stop.
- Write mode: `echo "{arg}" > .claude/.mode`
- Show confirmation:
  - If switched to vibe: "⚡ VIBE MODE activated — confirmation gates, next-step suggestions, and memory saves disabled"
  - If switched to structured: "⚙️ STRUCTURED MODE activated — full workflow enabled"
```
- Edge cases: file doesn't exist → treat as structured; invalid arg → show usage and stop
- ⚠️ Breaking change: none
- Verify: run `/ec-mode` → shows STRUCTURED MODE; run `/ec-mode vibe` → shows VIBE MODE activated; run `/ec-mode` → shows VIBE MODE; run `/ec-mode structured` → shows STRUCTURED MODE activated
- Dependencies: none

**Task 2 — Add mode indicator to prompt_submit.py** `S`
- File: `hooks/prompt_submit.py`
- Reuse: existing `parts.insert(0, ...)` pattern at line 168; Path import already present at line 1
- Code sample — add function after `check_context_staleness()` (around line 133), before `def main()`:
```python
def get_mode_indicator():
    try:
        mode_file = Path(os.getcwd()) / ".claude" / ".mode"
        if mode_file.exists() and mode_file.read_text().strip() == "vibe":
            return "⚡ **VIBE MODE active** — run `/ec-mode structured` to switch back"
    except Exception:
        pass
    return None
```
  In `main()`, after `staleness_msg = check_context_staleness()` (around line 153), add:
```python
    mode_indicator = get_mode_indicator()
```
  Then right before `if not parts: sys.exit(0)` (around line 176), add:
```python
    if mode_indicator:
        parts.insert(0, mode_indicator)
```
- Edge cases: .mode file missing → return None (no indicator); read error → return None
- ⚠️ Breaking change: none
- Verify: `echo "vibe" > .claude/.mode` then send any prompt — efficlaude-context block should start with ⚡ VIBE MODE line. `rm .claude/.mode` then send prompt — line disappears.
- Dependencies: none

**Task 3 — Add mode check to ec-brainstorm.md** `S`
- File: `commands/ec-brainstorm.md`
- Reuse: none
- Code sample — insert this block at the END of Step 0, directly before the line `## Step 1 — Understand the Problem`:
```markdown
**Mode check:** Run `cat .claude/.mode 2>/dev/null || echo "structured"` → note as MODE.
- If `vibe`: skip all (y/n) confirmation gates, skip Step 5 memory save (`curl .../memory/observe`), skip Step 6 "Next: run /ec-feature" suggestion
- If `structured` (or file absent): proceed normally

```
- Edge cases: file absent → default to structured
- ⚠️ Breaking change: none
- Verify: `grep -n "Mode check" commands/ec-brainstorm.md` → line appears; verify it's before "## Step 1"
- Dependencies: Task 1

**Task 4 — Add mode check to ec-feature.md** `S`
- File: `commands/ec-feature.md`
- Reuse: none
- Code sample — insert at END of Step 0, directly before the line `## Step 1 — Gather Input`:
```markdown
**Mode check:** Run `cat .claude/.mode 2>/dev/null || echo "structured"` → note as MODE.
- If `vibe`: skip "Plan sudah benar? Confirm (y/n):" gate in Step 6 (auto-proceed), skip Step 5 memory save (`curl .../memory/observe`), skip "Next: run /ec-execute" suggestion
- If `structured` (or file absent): proceed normally

```
- Edge cases: file absent → default to structured
- ⚠️ Breaking change: none
- Verify: `grep -n "Mode check" commands/ec-feature.md` → line appears; verify it's before "## Step 1"
- Dependencies: Task 1

**Task 5 — Add mode check to ec-execute.md** `S`
- File: `commands/ec-execute.md`
- Reuse: none
- Code sample — insert at END of Step 1 (after the resume check block), directly before the line `## Step 1.5 — Rollback Snapshot`:
```markdown
**Mode check:** Run `cat .claude/.mode 2>/dev/null || echo "structured"` → note as MODE.
- If `vibe`: skip Step 6 memory save (`curl .../memory/observe`), skip "Next: run /ec-review" in Step 7 report
- If `structured` (or file absent): proceed normally

```
- Edge cases: file absent → default to structured
- ⚠️ Breaking change: none
- Verify: `grep -n "Mode check" commands/ec-execute.md` → line appears; verify it's before "## Step 1.5"
- Dependencies: Task 1

**Task 6 — Add mode check to ec-review.md** `S`
- File: `commands/ec-review.md`
- Reuse: none
- Code sample — insert at END of Step 1 (after worker status check), directly before the line `## Step 1.5 — Blast Radius Analysis`:
```markdown
**Mode check:** Run `cat .claude/.mode 2>/dev/null || echo "structured"` → note as MODE.
- If `vibe`: skip "Next: run /ec-git" suggestion at end of review
- If `structured` (or file absent): proceed normally

```
- Edge cases: file absent → default to structured
- ⚠️ Breaking change: none
- Verify: `grep -n "Mode check" commands/ec-review.md` → line appears; verify it's before "## Step 1.5"
- Dependencies: Task 1

**Task 7 — Add mode check to ec-git.md** `S`
- File: `commands/ec-git.md`
- Reuse: none
- Code sample — insert at the VERY TOP of Step 1, before the line `Ask: "Mau ngapain di git?"`:
```markdown
**Mode check:** Run `cat .claude/.mode 2>/dev/null || echo "structured"` → note as MODE.
- If `vibe`: skip "After commit/push: ... run /ec-brainstorm" suggestion in Step 3
- If `structured` (or file absent): proceed normally

```
- Edge cases: file absent → default to structured
- ⚠️ Breaking change: none
- Verify: `grep -n "Mode check" commands/ec-git.md` → line appears at top of Step 1
- Dependencies: Task 1

**Task 8 — Update install.sh** `S`
- File: `install.sh`
- Reuse: COMMANDS array at line 13; Python block at line 113
- Code sample — change 1, update COMMANDS line 13:
```bash
COMMANDS=("ec-setup" "ec-feature" "ec-brainstorm" "ec-execute" "ec-review" "ec-git" "ec-export" "ec-import" "ec-mode")
```
  Change 2 — in the Python block (after `settings["hooks"]["UserPromptSubmit"] = [...]`), add:
```python
settings["statusCommand"] = "mode=$(cat .claude/.mode 2>/dev/null || echo 'structured'); [ \"$mode\" = 'vibe' ] && echo '⚡ vibe' || echo ''"
```
- Edge cases: existing statusCommand → overwritten (idempotent)
- ⚠️ Breaking change: none
- Verify: `grep 'ec-mode' install.sh` → shows ec-mode in COMMANDS; `grep 'statusCommand' install.sh` → shows the line
- Dependencies: Task 1
