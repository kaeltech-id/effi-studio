# Review Summary — Fix 12 New Bugs — Create, Fix & Close GitHub Issues
_Date: 2026-04-24_

## Feature
Fix 12 New Bugs — Create, Fix & Close GitHub Issues

## Tasks completed
- [x] Task 1: Create 12 GitHub issues [S] — Open all 12 bugs via gh issue create with severity labels
- [x] Task 2: Fix memory.export() raw metadata [S] [agent: ec-python] — Add json.loads() in export() like get_recent() does
- [x] Task 3: Fix stale ChromaDB chunks after library shrink [S] [agent: ec-python] — Change ids_to_delete to remove all IDs not in new_ids set
- [x] Task 4: Fix _rate_buckets memory leak [S] [agent: ec-python] — Delete key from _rate_buckets when bucket becomes empty
- [x] Task 5: Fix _prune_type() ChromaDB call outside _lock [S] [agent: ec-python] — Wrap collection.delete() inside _lock
- [x] Task 6: Fix root_dir path traversal in /graph/index [S] [agent: ec-python] — Reject root_dir containing null bytes or .. parts
- [x] Task 7: Fix /docs/register missing project validation [S] [agent: ec-python] — Add _valid_project() guard in docs_register()
- [x] Task 8: Fix ensure_commit_hook() overwriting existing hook [S] [agent: ec-python] — Guard already present at line 127 (pre-existing fix)
- [x] Task 9: Fix logger.py thread-safety [S] [agent: ec-python] — Add threading.Lock() around read-trim-write in warn()
- [x] Task 10: Fix check_update() premature timestamp write [S] [agent: ec-python] — Move UPDATE_CHECK_FILE write to after successful remote fetch
- [x] Task 11: Fix index_project() symlink traversal [S] [agent: ec-python] — Skip symlinks in rglob loop
- [x] Task 12: Fix import_data() TOCTOU race [S] [agent: ec-python] — Hold _lock around check-and-save in import_data()
- [x] Task 13: Fix _reconcile_chromadb() blocking startup [S] [agent: ec-python] — Run in daemon thread like _prune_on_startup
- [x] Task 14: Close all 12 GitHub issues [S] — gh issue close each issue number from Task 1

## Files modified
- `server/memory.py` — Tasks 2, 5, 12, 13
- `server/docs.py` — Task 3
- `server/graph.py` — Task 11
- `server/worker.py` — Tasks 4, 6, 7
- `server/logger.py` — Task 9
- `hooks/prompt_submit.py` — Task 10
- `tests/test_memory.py` — review fix
- `server/tests/test_hooks.py` — review fix

## Issues fixed during review
- `server/worker.py:73` — `_rate_limit()` return type annotation corrected from `-> None` to `-> tuple | None`
- `server/tests/test_hooks.py:45` — `test_no_comment_returns_none` tested outdated behavior; renamed and corrected to assert the "unknown" message
- `tests/test_memory.py:55` — `test_reconcile_chromadb_fills_missing` broke due to Task 13 async change; added explicit `engine._reconcile_chromadb()` call

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Template drift (GIT RULES) | ✓ in sync |
| Code quality | ✓ |
| Type safety | ✓ |
| Security | ✓ |
| Tests | 50/50 passed |
