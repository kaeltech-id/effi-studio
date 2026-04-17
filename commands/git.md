Handle git operations. This is the ONLY way git operations are allowed.

## Step 1 — What operation?
Ask: "Mau ngapain di git?"
Options: commit / push / pull / branch / merge / status / log / lainnya

## Step 2 — Gather Details (based on answer)

**commit:**
- Show `git status` and `git diff --staged` first
- Ask: "Commit message?"
- Ask: "Ada file spesifik yang mau di-stage? (atau 'semua')"
- Confirm before executing

**push:**
- Show current branch
- Ask: "Push ke branch mana? (default: current branch)"
- Confirm: "Push ke {remote}/{branch}. Lanjut?"

**pull:**
- Show current branch
- Ask: "Pull dari mana? (default: origin/{current branch})"
- Confirm before executing

**branch:**
- Ask: "Buat branch baru atau pindah branch? (buat/pindah)"
- Ask: "Nama branch-nya?"
- Confirm before executing

**merge:**
- Show current branch
- Ask: "Merge dari branch mana?"
- Confirm before executing

**lainnya:**
- Ask user to describe what they want
- Confirm exact command before executing

## Step 3 — Execute
Only execute after explicit user confirmation.
Show result after done.
