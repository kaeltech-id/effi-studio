# Feature: Add Co-Authored-By rule to ec-setup CLAUDE.md template

## Impact Analysis
- Files affected: `commands/ec-setup.md`
- ⚠️ Breaking change risk: none

## Reusable Existing Code
- None

## Tasks
- [ ] Task 1: Patch template in ec-setup.md [S] — add missing Co-Authored-By rule line

## Per Task Detail

**Task 1 — Patch template in ec-setup.md** `S`
- File: `commands/ec-setup.md`
- Reuse: none
- Code sample:
  ```
  ## GIT RULES
  - NEVER perform any git operation autonomously
  - NEVER commit, push, pull, merge, branch, stash without /ec-git command
  - Git ONLY allowed when user explicitly runs /ec-git
  - NEVER add Co-Authored-By to commit messages
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "Co-Authored-By" commands/ec-setup.md` → must return the new line
- Dependencies: none
