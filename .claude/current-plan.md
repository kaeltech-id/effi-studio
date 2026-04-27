## Feature: Remove Stash dari ec-execute

### Impact Analysis
- Files affected: commands/ec-execute.md, ~/.claude/commands/ec-execute.md
- ⚠️ Breaking change risk: none — menghapus behavior yang mengganggu, tidak mengubah interface

### Reusable Existing Code
- none

### Tasks
- [x] Task 1: Hapus Step 1.5 dan referensinya dari commands/ec-execute.md [S] [agent: ec-refactor] — hapus blok ## Step 1.5 (Rollback Snapshot) dan baris "Rollback snapshot was taken (Step 1.5)" di Step 3.5
- [x] Task 2: Sync perubahan ke ~/.claude/commands/ec-execute.md [S] [agent: ec-refactor] — apply penghapusan identik ke installed copy yang dipakai Claude Code secara aktif

### Per Task Detail
**Task 1 — Hapus Step 1.5 dan referensinya dari commands/ec-execute.md** `S`
- File: /Users/admin/EffiClaude/commands/ec-execute.md
- Reuse: none
- Code sample: Hapus seluruh blok berikut (10 baris):
  ```
  ## Step 1.5 — Rollback Snapshot
  Before any task executes, create a safety snapshot:
  ```
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  git stash push --include-untracked -m "efficlaude-pre-execute-$TIMESTAMP" -- . ':(exclude).claude' 2>/dev/null \
    && echo "Snapshot saved: efficlaude-pre-execute-$TIMESTAMP" \
    || echo "(nothing to snapshot — clean working tree)"
  ```
  Show the stash label to the user: "To restore if needed: `git stash pop`"
  If nothing to stash (clean tree): note it silently and continue.
  ```
  Dan hapus baris ini dari Step 3.5:
  `- [ ] Rollback snapshot was taken (Step 1.5)`
- Edge cases: pastikan tidak ada blank line ganda yang tersisa
- ⚠️ Breaking change: none
- Verify: `grep -n "stash\|Step 1.5\|Rollback snapshot" /Users/admin/EffiClaude/commands/ec-execute.md` → 0 hasil
- Dependencies: none

**Task 2 — Sync perubahan ke ~/.claude/commands/ec-execute.md** `S`
- File: /Users/admin/.claude/commands/ec-execute.md
- Reuse: Task 1 sebagai referensi konten identik
- Code sample: apply penghapusan identik — blok ## Step 1.5 dan baris referensinya di Step 3.5
- Edge cases: file installed harus ada sebelum edit
- ⚠️ Breaking change: none
- Verify: `grep -n "stash\|Step 1.5\|Rollback snapshot" ~/.claude/commands/ec-execute.md` → 0 hasil
- Dependencies: Task 1
