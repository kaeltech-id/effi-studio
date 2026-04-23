# Review Summary — Fix all 28 open GitHub issues + close tickets
_Date: 2026-04-23_

## Feature
Fix all 28 open GitHub issues + close tickets

## Tasks completed
- [x] Task 1: Fix server/worker.py bugs and add route docs [S] — _is_safe_path() backslash + graph_index() str(e) + route docstrings
- [x] Task 2: Fix server/memory.py reconcile lock scope [S] — wrap project list read inside _lock
- [x] Task 3: Add type hints to server/docs.py [S] — Optional[str] source_type, _get_collection return type
- [x] Task 4: Add type hints to server/graph.py public methods [S] — index_project, index_file, _extract_nodes, _get_node_name
- [x] Task 5: Fix hooks/prompt_submit.py staleness unknown age [S] — return message when comment missing
- [x] Task 6: Fix hooks/session_stop.py export bak retention [S] — delete .bak older than 7 days after successful export
- [x] Task 7: Fix commands/ec-feature.md expired decision UX [S] — add "use it anyway" option
- [x] Task 8: Create tests/test_hooks.py [M] — unit tests for check_context_staleness, auto_export, check_uncommitted
- [x] Task 9: Close 19 already-fixed GitHub issues [S] — gh issue close with "Fixed in current codebase" comment
- [x] Task 10: Close 9 newly-fixed GitHub issues [S] — gh issue close with fix reference comment

## Files modified
server/worker.py, server/memory.py, server/docs.py, server/graph.py, hooks/prompt_submit.py, hooks/session_stop.py, commands/ec-feature.md, tests/test_hooks.py

## Issues fixed during review
No issues found.

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ |
| Tests | 5/5 passed |
