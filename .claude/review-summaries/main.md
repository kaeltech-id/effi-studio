# Review Summary — Slim the interaction critical path
_Date: 2026-06-17_

## Feature
Slim the interaction critical path

## Tasks completed
- [x] Task 1: Add ThreadPoolExecutor import to prompt_submit [S] [agent: ec-python] — import concurrent.futures
- [x] Task 2: Parallelize memory + docs search in prompt_submit [S] [agent: ec-python] — run both worker calls concurrently
- [x] Task 3: Make check_update local-only (read cached remote version) [S] [agent: ec-python] — remove network call from prompt path
- [x] Task 4: Add background update refresh + --refresh-update handler [M] [agent: ec-python] — detached refresh of version cache
- [x] Task 5: Make post_tool_use observe fire-and-forget [M] [agent: ec-python] — detached self-reinvocation for the POST
- [x] Task 6: Verify end-to-end hook latency improvement [S] [agent: ec-python] — time both hooks with dummy stdin

## Files modified
- `hooks/prompt_submit.py`
- `hooks/post_tool_use.py`

Blast radius (reviewed, not modified): `tests/test_hooks.py`, `server/tests/test_hooks.py` — both import only `build_observation` and `check_context_staleness` (untouched); 5 + 12 tests pass.

## Issues fixed during review
- `hooks/prompt_submit.py` — `maybe_refresh_update()` throttle-defeat: the 24h throttle timestamp was only written after a successful fetch, so a persistently failing `VERSION_URL` (currently 404) would spawn a detached refresh subprocess on **every** prompt. Fixed by stamping `UPDATE_CHECK_FILE` at spawn-decision time (and removing the now-redundant timestamp write from `refresh_update_cache()`), throttling spawn attempts to once/24h regardless of fetch outcome. Verified.

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ |
| Tests | skipped (17 existing pass) |
