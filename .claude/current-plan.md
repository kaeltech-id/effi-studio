# Feature: Batch D — Command UX Consistency

## Impact Analysis
- Files affected: all 8 command files (`commands/ec-setup.md`, `commands/ec-brainstorm.md`, `commands/ec-feature.md`, `commands/ec-execute.md`, `commands/ec-review.md`, `commands/ec-git.md`, `commands/ec-export.md`, `commands/ec-import.md`)
- ⚠️ Breaking change risk: none — additive wording only

## Reusable Existing Code
- Existing worker check blocks in ec-brainstorm, ec-feature, ec-execute, ec-review — use as canonical format reference
- Existing "Tell user to run /ec-X" patterns — replace with standardized "Next:" prefix

## The 4-Rule Standard (reference for all tasks)
1. **Worker check** — `(worker online ✓ — {features} active)` / `(worker OFFLINE ⚠️ — {features} unavailable)`
2. **Next-step line** — ends every command with: `Next: run \`/ec-X\` to {action}.`
3. **Confirmation gate** — before irreversible action: show what will happen, ask "Lanjut?"
4. **Completion block** — summary of what was done + next-step line

## Tasks
- [ ] Task 1: ec-setup next-step [S] — add "Next: run /ec-brainstorm..." after Step 6
- [ ] Task 2: ec-git next-step [S] — add next-step guidance after "Show result after done"
- [ ] Task 3: ec-export worker format + next-step [S] — fix offline message + replace Tip with Next line
- [ ] Task 4: ec-import worker format + next-step [S] — fix offline message + add Next line at end
- [ ] Task 5: ec-brainstorm Step 6 standardize [S] — replace question with "Next: run /ec-feature"
- [ ] Task 6: ec-feature Step 6 next-step [S] — add explicit "Next: run /ec-execute" line
- [ ] Task 7: ec-execute Step 6 next-step [S] — replace "Tell user" with "Next:" prefix
- [ ] Task 8: ec-review Step 4 next-step [S] — replace "Tell user" with "Next:" prefix

---

## Per Task Detail

**Task 1 — ec-setup next-step** `S`
- File: `commands/ec-setup.md`
- Reuse: none
- Code sample — append at the end of Step 6 — Confirm, after `Ask: "Setup complete. Anything you'd like to change?"`:
  ```
  Next: run `/ec-brainstorm` to explore your first feature, or `/ec-feature` to plan directly.
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "Next: run" commands/ec-setup.md` → returns the line
- Dependencies: none

---

**Task 2 — ec-git next-step** `S`
- File: `commands/ec-git.md`
- Reuse: none
- Code sample — append after "Show result after done." at end of Step 3 — Execute:
  ```

  **Next step after each operation:**
  - After commit/push: if this completes a feature → run `/ec-brainstorm` to plan the next one
  - After pull/branch/merge: continue with your current workflow
  ```
- Edge cases: status/log → read-only, next-step still shows but user can ignore
- ⚠️ Breaking change: none
- Verify: `grep "Next step after" commands/ec-git.md` → returns the heading
- Dependencies: none

---

**Task 3 — ec-export worker format + next-step** `S`
- File: `commands/ec-export.md`
- Reuse: none
- Code sample:

  Change 1 — Step 0 offline message. Change:
  `- If offline: show "Worker offline — cannot export. Start worker first." and stop.`
  To:
  `- If offline: show "(worker OFFLINE ⚠️ — export unavailable)" and stop.`

  Change 2 — last line of Step 3. Change:
  `- "Tip: commit this file to share memory with your team: \`git add .claude/memory-export.json\`"`
  To:
  `- "Next: run \`/ec-git\` to commit \`.claude/memory-export.json\` and share with your team."`

- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "OFFLINE\|Next: run" commands/ec-export.md` → returns both lines
- Dependencies: none

---

**Task 4 — ec-import worker format + next-step** `S`
- File: `commands/ec-import.md`
- Reuse: none
- Code sample:

  Change 1 — Step 0 offline message. Change:
  `- If offline: show "Worker offline — cannot import. Start worker first." and stop.`
  To:
  `- If offline: show "(worker OFFLINE ⚠️ — import unavailable)" and stop.`

  Change 2 — append after last bullet in Step 5 — Confirm:
  ```

  Next: run `/ec-feature` or `/ec-review` to use the imported context.
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "OFFLINE\|Next: run" commands/ec-import.md` → returns both lines
- Dependencies: none

---

**Task 5 — ec-brainstorm Step 6 standardize** `S`
- File: `commands/ec-brainstorm.md`
- Reuse: none
- Code sample — in Step 6 — Hand Off, change:
  ```
  Show summary of the decision, then ask:
  "Ready to plan the implementation? Run /ec-feature — it will load this decision automatically."
  ```
  To:
  ```
  Show summary of the decision.
  Next: run `/ec-feature` — it will load this decision automatically.
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "Next: run" commands/ec-brainstorm.md` → returns the line
- Dependencies: none

---

**Task 6 — ec-feature Step 6 next-step** `S`
- File: `commands/ec-feature.md`
- Reuse: none
- Code sample — in Step 6 — Confirm, change:
  ```
  Ask: "Does this plan look right? Anything to change before executing?"
  Only tell user to run /ec-execute after they approve.
  ```
  To:
  ```
  Ask: "Does this plan look right? Anything to change before executing?"
  Next: run `/ec-execute` to implement this plan.
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "Next: run" commands/ec-feature.md` → returns the line
- Dependencies: none

---

**Task 7 — ec-execute Step 6 next-step** `S`
- File: `commands/ec-execute.md`
- Reuse: none
- Code sample — at the very end of the file, change:
  ```
  Tell user to run /ec-review to review the results.
  ```
  To:
  ```
  Next: run `/ec-review` to review the results.
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "Next: run" commands/ec-execute.md` → returns the line
- Dependencies: none

---

**Task 8 — ec-review Step 4 next-step** `S`
- File: `commands/ec-review.md`
- Reuse: none
- Code sample — at the very end of the file, change:
  ```
  If everything is clean: "No issues found. Ready to commit."
  Tell user to run /ec-git to commit and push.
  ```
  To:
  ```
  If everything is clean: "No issues found. Ready to commit."
  Next: run `/ec-git` to commit and push.
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "Next: run" commands/ec-review.md` → returns the line
- Dependencies: none
