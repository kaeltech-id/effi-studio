# Feature: Brainstorm Backlog + Confirm (y/n) Standardization

## Impact Analysis
- Files affected: `commands/ec-brainstorm.md`, `commands/ec-feature.md`, `commands/ec-git.md`, `commands/ec-execute.md`, `commands/ec-import.md`, `commands/ec-review.md`, `commands/ec-setup.md`
- ⚠️ Breaking change risk: none — additive UX changes only

## Reusable Existing Code
- Step 5 decision.md template in `ec-brainstorm.md` — reused as-is for both save paths
- Step 0 decision.md check block in `ec-feature.md` — brainstorm picker inserted after it

## Tasks
- [ ] Task 1: brainstorm-save-choice [S] — add (now/save) prompt in ec-brainstorm Steps 5-6; save to .claude/brainstorms/ if "save"
- [ ] Task 2: feature-brainstorm-picker [S] — Step 0: list .claude/brainstorms/ files with numbered menu; Step 6: (y/n) confirm
- [ ] Task 3: git-confirm-yn [S] — replace all "Confirm before executing" and "Lanjut?" in ec-git with (y/n) format
- [ ] Task 4: execute-confirm-yn [S] — pre-flight issue prompt → (y/n)
- [ ] Task 5: import-confirm-yn [S] — import anyway prompt → (y/n)
- [ ] Task 6: review-confirm-yn [S] — unit tests prompt → (y/n)
- [ ] Task 7: setup-confirm-yn [S] — Step 6 setup confirm → (y/n)

---

## Per Task Detail

**Task 1 — brainstorm-save-choice** `S`
- File: `commands/ec-brainstorm.md`
- Reuse: existing decision.md template in Step 5 — used for both "now" and "save" paths
- Code sample:

  Replace **Step 5 — Save Decision** entirely with:
  ```markdown
  ## Step 5 — Save

  Ask: "Lanjut ke /ec-feature sekarang atau simpan untuk nanti? (now/save):"

  **If "now":**
  Save to `.claude/decision.md`. Replace `{YYYY-MM-DD}` with today's date (use `currentDate` context variable if available, otherwise `date +%Y-%m-%d`):

  ```markdown
  # Decision: {problem_title}

  ## Problem
  {problem statement in one paragraph}

  ## Options Explored
  - **Option 1 — {name}**: {one-line summary} → not chosen because: {reason}
  - **Option 2 — {name}**: {one-line summary} → not chosen because: {reason}
  - **Option 3 — {name}**: {one-line summary} → CHOSEN

  ## Chosen Approach
  {2-3 paragraph description of the chosen approach}

  ## Key Assumptions
  - {assumption 1}
  - {assumption 2}

  ## Risks & Mitigations
  - {risk} → {mitigation}

  ## Out of Scope
  - {what was explicitly not addressed}

  _Created: {YYYY-MM-DD}_
  ```

  **If "save":**
  Generate a slug from the problem title: lowercase, spaces→hyphens, max 5 words (e.g. "race-condition-memory-fix").
  Save to `.claude/brainstorms/{YYYY-MM-DD}-{slug}.md` using the exact same format as the decision.md template above.
  Create `.claude/brainstorms/` directory if it doesn't exist.
  Show: "Saved: .claude/brainstorms/{YYYY-MM-DD}-{slug}.md"

  **Both paths** — if worker running, save to memory:
  ```
  curl -s -X POST http://localhost:37777/memory/observe \
    -H "Content-Type: application/json" \
    -d '{
      "project": "{project_name}",
      "type": "decision",
      "content": "Brainstorm: {problem_title}. Chose: {chosen_option}. Because: {reason}.",
      "metadata": {"source": "brainstorm"}
    }'
  ```
  ```

  Replace **Step 6 — Hand Off** entirely with:
  ```markdown
  ## Step 6 — Hand Off
  Show summary of the decision.

  **If "now":**
  Next: run `/ec-feature` — it will load this decision automatically.

  **If "save":**
  Run `/ec-feature` when ready — it will show a numbered list of saved brainstorms to pick from.
  ```

- Edge cases: `.claude/brainstorms/` does not exist → create with `mkdir -p` before writing
- ⚠️ Breaking change: none — "now" path is identical to old behavior
- Verify: `grep -n "now/save\|brainstorms/" commands/ec-brainstorm.md` → returns both lines
- Dependencies: none

---

**Task 2 — feature-brainstorm-picker** `S`
- File: `commands/ec-feature.md`
- Reuse: existing Step 0 decision.md block — brainstorm picker inserted directly after it
- Code sample:

  Change 1 — In **Step 0**, after the existing `**Check for brainstorm decision:**` block (which ends with "After planning is complete, delete `.claude/decision.md`..."), add:

  ```markdown
  **Check for saved brainstorms:** If no `decision.md` was found:
  - Check if `.claude/brainstorms/` exists and contains `.md` files
  - If files found, list them numbered (read the `# Title` line from each file):
    ```
    Saved brainstorms:
    1. {filename} — {title}
    2. {filename} — {title}
    Pick a number to use, or 'skip' for a new feature:
    ```
  - If user picks a number: load that file as the decision source, pre-fill Chosen Approach, note "(brainstorm loaded: {filename})", delete the picked file after plan is complete
  - If user types 'skip' or no files exist: proceed to Step 1 normally
  ```

  Change 2 — Replace **Step 6 — Confirm**:
  ```markdown
  ## Step 6 — Confirm
  Ask: "Plan sudah benar? Confirm (y/n):"
  - If y: proceed
  - If n: ask "Apa yang perlu diubah?" → revise plan → re-confirm
  Next: run `/ec-execute` to implement this plan.
  ```

- Edge cases: `.claude/brainstorms/` exists but empty → treat as "no files", proceed to Step 1
- ⚠️ Breaking change: none
- Verify: `grep -n "brainstorms/\|Confirm (y/n)" commands/ec-feature.md` → returns both lines
- Dependencies: none (but logically after Task 1 since Task 1 creates the brainstorms/ files)

---

**Task 3 — git-confirm-yn** `S`
- File: `commands/ec-git.md`
- Reuse: none
- Code sample — four targeted replacements:

  Change 1 — commit section, replace `- Confirm before executing` with:
  ```
  - Ask: "Confirm (y/n):" before executing
  ```

  Change 2 — push section, replace:
  `Confirm: "Push ke {remote}/{branch}. Lanjut?"`
  with:
  `Ask: "Push ke {remote}/{branch}. Confirm (y/n):"`

  Change 3 — pull, branch, merge sections, replace each `- Confirm before executing` with:
  `- Ask: "Confirm (y/n):" before executing`

  Change 4 — lainnya section, replace `- Confirm exact command before executing` with:
  `- Show exact command to user, then ask: "Confirm (y/n):"`

- Edge cases: Safety checklist in Step 2.5 already handles destructive ops — leave "user typed explicit 'yes'" wording unchanged for destructive ops only
- ⚠️ Breaking change: none
- Verify: `grep "Confirm (y/n)" commands/ec-git.md | wc -l` → returns 5 or more lines; `grep "Lanjut" commands/ec-git.md` → returns 0 matches
- Dependencies: none

---

**Task 4 — execute-confirm-yn** `S`
- File: `commands/ec-execute.md`
- Reuse: none
- Code sample — replace in Step 2 Pre-flight Check:

  Change:
  `"Found pre-flight issue: {issue}. Continue anyway or adjust the plan?"`
  To:
  `"Found pre-flight issue: {issue}. Continue anyway? (y/n):"`

- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "y/n" commands/ec-execute.md` → returns the line; `grep "Continue anyway or" commands/ec-execute.md` → returns 0
- Dependencies: none

---

**Task 5 — import-confirm-yn** `S`
- File: `commands/ec-import.md`
- Reuse: none
- Code sample — replace in Step 2:

  Change:
  `Import anyway? (yes/no)`
  To:
  `Import anyway? (y/n):`

- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "y/n" commands/ec-import.md` → returns the line; `grep "yes/no" commands/ec-import.md` → returns 0
- Dependencies: none

---

**Task 6 — review-confirm-yn** `S`
- File: `commands/ec-review.md`
- Reuse: none
- Code sample — replace in Step 2 Testing section:

  Change:
  `Ask: "Do you want to add unit tests for this feature? (yes/no)"`
  To:
  `Ask: "Add unit tests for this feature? (y/n):"`

- Edge cases: "Any existing test suite to run? (provide path or skip)" — not a y/n, leave unchanged
- ⚠️ Breaking change: none
- Verify: `grep "y/n" commands/ec-review.md` → returns the line; `grep "yes/no" commands/ec-review.md` → returns 0
- Dependencies: none

---

**Task 7 — setup-confirm-yn** `S`
- File: `commands/ec-setup.md`
- Reuse: none
- Code sample — replace Step 6 — Confirm:

  Change:
  `Show full summary of saved config. Ask: "Setup complete. Anything you'd like to change?"`
  To:
  ```
  Show full summary of saved config.
  Ask: "Setup complete. Confirm (y/n):"
  - If y: done
  - If n: ask "Apa yang perlu diubah?" and loop back to update the relevant config
  ```

- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "Confirm (y/n)" commands/ec-setup.md` → returns the line; `grep "Anything you'd like" commands/ec-setup.md` → returns 0
- Dependencies: none
