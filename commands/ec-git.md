Handle git operations. This is the ONLY way git operations are allowed.

## Step 1 — What operation?
Ask: "Mau ngapain di git?"
Options: commit / push / pull / branch / merge / status / log / lainnya

## Step 2 — Gather Details (based on answer)

**commit:**
- Show `git status` and `git diff --staged` first
- Silently read `.claude/current-plan.md` if it exists for feature name and task context
- Generate a suggested conventional commit message from staged diff + plan context (infer prefix type from the nature of changes; always include the prefix)
- Ask: "Commit message: `{suggested_message}`. OK? (y/n):"
  - If y: use the suggested message, proceed
  - If n: ask "Commit message-nya apa?" — if the user's response has no conventional prefix, ask:
    "Pesan commit ini tidak ada conventional prefix. Tipe apa? (feat / fix / docs / chore / refactor / test)"
    Apply the answer as the prefix before proceeding.
- Edge case: if staged diff is empty, remind user to stage files first instead of generating a message
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
- Ask: "Confirm (y/n):" before executing

**push:**
- Run `git branch --show-current` to get current branch name
- Ask: "Push ke origin/{current_branch}. Confirm (y/n):"
  - If y: proceed with origin/{current_branch}
  - If n: ask "Push ke branch mana?" and use the user's answer as the branch
- Edge case: if `git branch --show-current` returns empty (detached HEAD), skip suggestion and ask "Push ke branch mana?" directly

**pull:**
- Show current branch
- Ask: "Pull dari mana? (default: origin/{current branch})"
- Ask: "Confirm (y/n):" before executing

**branch:**
- Ask: "Buat branch baru atau pindah branch? (buat/pindah)"
- Ask: "Nama branch-nya?"
- Ask: "Confirm (y/n):" before executing

**merge:**
- Show current branch
- Ask: "Merge dari branch mana?"
- Ask: "Confirm (y/n):" before executing

**lainnya:**
- Ask user to describe what they want
- Show exact command to user, then ask: "Confirm (y/n):"

## Step 2.5 — Pre-execute Safety Checklist
Before executing any git command, explicitly confirm all applicable items:
- [ ] User gave explicit confirmation in Step 2 (never skip this)
- [ ] **commit only:** conventional prefix is present in commit message
- [ ] **commit only:** staged files do not include `.env`, credentials, or API keys
- [ ] **push only:** correct remote and branch were confirmed
- [ ] **destructive ops (reset --hard, branch -D, force push):** user typed explicit "yes" confirmation
Skip non-applicable items. Only proceed to Step 3 after applicable items are confirmed.

## Step 3 — Execute
Only execute after explicit user confirmation.
Show result after done.

**Next step after each operation:**
- After commit/push: if this completes a feature → run `/ec-brainstorm` to plan the next one
- After pull/branch/merge: continue with your current workflow
