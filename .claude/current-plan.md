## Feature: Fix Double VERSION Bump in ec-git

### Impact Analysis
- Files affected: commands/ec-git.md
- ⚠️ Breaking change risk: none — behavioral fix only, no interface change

### Reusable Existing Code
- `git show HEAD:VERSION` — standard git plumbing, no new tooling

### Tasks
- [x] Task 1: Fix base version source in ec-git auto-bump [S] — replace "read `VERSION`" with `git show HEAD:VERSION 2>/dev/null || cat VERSION` in the VERSION auto-bump block

### Per Task Detail
**Task 1 — Fix base version source in ec-git auto-bump** `S`
- File: `commands/ec-git.md`
- Reuse: none
- Code sample:
  ```
  - To bump: read base version via `git show HEAD:VERSION 2>/dev/null || cat VERSION`,
    split on `.`, increment the right segment (reset lower segments to 0 for major/minor),
    write back with `echo "X.Y.Z" > VERSION`, stage it
  ```
  Replace the current line:
  `- To bump: read \`VERSION\`, split on \`.\`, increment the right segment...`
- Edge cases: repo tanpa commit (HEAD:VERSION absent) → fallback `|| cat VERSION` handle ini; VERSION file tidak ada sama sekali → sudah dihandle oleh baris "If VERSION file missing → create it as `1.0.0` first"
- ⚠️ Breaking change: none
- Verify: baca `commands/ec-git.md`, konfirmasi baris "To bump:" menggunakan `git show HEAD:VERSION 2>/dev/null || cat VERSION`
- Dependencies: none
