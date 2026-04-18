# Decision: Medium Issues Batch — All 5 Fixes

## Problem
Five medium-priority issues remain open across the codebase: (1) install.sh silently ignores pip install failures; (2) decision.md is deleted at end of ec-feature before ec-execute completes, so it's lost if execution fails; (3) worker port 37777 is hardcoded in 4 files with no env override; (4) _prune_on_startup() blocks the worker process synchronously on every restart; (5) blast radius misses JS/TS `export * from '...'` re-export patterns.

## Options Explored
- **Option 1 — Batch all 5**: Fix all issues in one feature plan → CHOSEN
- **Option 2 — Two batches (quick wins first)**: #8/#9/#11 first, then #10/#12 → not chosen because: user prefers single cycle
- **Option 3 — Triage (3 of 5 only)**: Skip #8 and #9 → not chosen because: user wants all 5 fixed

## Chosen Approach
Fix all 5 in one feature plan across 6 files.

**#8 — install.sh pip verify:** After `pip3 install -q -r "$SERVER_DIR/requirements.txt"` (line 89), add `|| { echo "Error: Failed to install Python dependencies. Check requirements.txt."; exit 1; }`.

**#9 — decision.md safety:** Remove the `delete .claude/decision.md` instruction from `commands/ec-feature.md` (currently happens after plan confirm). Add delete instruction to `commands/ec-review.md` at the end of a clean review — only delete after the full cycle succeeds.

**#10 — Port configurable:** In all 4 locations, replace hardcoded `37777` with env var read. In `server/worker.py`: `port=int(os.environ.get('EFFICLAUDE_PORT', 37777))`. In all 3 hooks: `WORKER_URL = f"http://localhost:{os.environ.get('EFFICLAUDE_PORT', '37777')}"`.

**#11 — Async pruning:** In `server/memory.py` `__init__`, replace `self._prune_on_startup()` with `threading.Thread(target=self._prune_on_startup, daemon=True).start()`. Same pattern already used in docs.py for async refresh.

**#12 — Star imports blast radius:** In `server/graph.py` `_extract_imports`, add `r'''export\s+\*\s+from\s+['"]([^'"]+)['"]'''` to both `javascript` and `typescript` pattern lists.

## Key Assumptions
- decision.md is currently deleted in ec-feature.md after plan confirm (not in ec-review)
- threading is already imported in memory.py (used for locks)
- All 3 hooks use identical WORKER_URL constant pattern
- `export * from` is the only missing star-import pattern (Python `from x import *` already covered by existing regex)

## Risks & Mitigations
- ec-feature.md delete removal — decision.md will accumulate if user never completes ec-review → mitigation: 7-day expiry check already in ec-feature already handles this
- Port env var in hooks — if hooks load before env var is set, fallback to 37777 still works → mitigation: fallback is always present

## Out of Scope
- Low priority issues (#13–#16)
- Making port configurable in launchd plist / systemd service file

_Created: 2026-04-18_
