# Review Summary — /ec-selfhealing Standalone Self-Healing Skill
_Date: 2026-05-12_

## Feature
/ec-selfhealing Standalone Self-Healing Skill

## Tasks completed
- [x] Task 1: Create ec-selfhealing.md [L] — full standalone skill: guard, detection suite (tests/syntax/lint/type/smells), triage, plan, execute loop, re-verify, report
- [x] Task 2: Update install.sh COMMANDS array [S] — add ec-selfhealing to COMMANDS array at line 14

## Files modified
commands/ec-selfhealing.md (new), install.sh

## Issues fixed during review
- commands/ec-selfhealing.md:31 — SCAN_ROOT validation missing: added `[ -e "{path}" ]` check with re-ask on invalid path
- commands/ec-selfhealing.md:40 — pytest ran without checking if installed: added `python3 -c "import pytest" 2>/dev/null &&` guard

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ |
| Tests | skipped |
