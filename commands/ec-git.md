Handle git operations. This is the ONLY way git operations are allowed.

## Step 1 — What operation?
Ask: "Mau ngapain di git?"
Options: commit / push / pull / branch / merge / status / log / lainnya

## Step 2 — Gather Details (based on answer)

**commit:**
- Show `git status` and `git diff --staged` first
- Ask: "Commit message?"
- If the message has no conventional prefix (`feat`/`fix`/`docs`/`test`/`chore`/`refactor`/`style`/`perf`), ask:
  "Pesan commit ini tidak ada conventional prefix. Tipe apa? (feat / fix / docs / chore / refactor / test)"
  Apply the answer as the prefix before proceeding.
- **VERSION auto-bump** — inspect prefix after it's confirmed:
  - `feat!:` or message body contains `BREAKING CHANGE` → bump **major** (1.1.0 → 2.0.0)
  - `feat:` → bump **minor** (1.1.0 → 1.2.0)
  - `fix:` → bump **patch** (1.1.0 → 1.1.1)
  - `docs:` / `test:` / `chore:` / `refactor:` / `style:` / `perf:` → **no bump**
  - If VERSION file missing → create it as `1.0.0` first, then bump
  - To bump: read `VERSION`, split on `.`, increment the right segment (reset lower segments to 0 for major/minor), write back with `echo "X.Y.Z" > VERSION`, stage it
  - Show: "VERSION bumped: 1.1.0 → 1.2.0" (or "VERSION not bumped (docs: commit)")
- Ask: "Ada file spesifik yang mau di-stage? (atau 'semua')"
  - If bumped: always include `VERSION` in staged files
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
