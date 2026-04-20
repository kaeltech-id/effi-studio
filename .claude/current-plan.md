## Feature: No-Code Guardrail + Agent-Augmented Planning

### Impact Analysis
- Files affected: `commands/ec-brainstorm.md`, `commands/ec-feature.md`
- ⚠️ Breaking change risk: none — additive only

### Reusable Existing Code
- Mode check block pattern in both files — same style used for No-Code Rule

### Tasks
- [x] Task 1: Add No-Code Rule to ec-brainstorm.md [S] — insert after Mode check in Step 0
- [x] Task 2: Add No-Code Rule to ec-feature.md [S] — insert after Mode check in Step 0
- [x] Task 3: Add Agent-Augmented Analysis to ec-feature.md Step 2 [S] — insert after Memory Cross-Check section

---

### Per Task Detail

**Task 1 — Add No-Code Rule to ec-brainstorm.md** `S`
- File: `commands/ec-brainstorm.md`
- Reuse: Mode check block style (bold label + dash rules)
- Code sample: insert after `- If \`structured\` (or file absent): proceed normally` in Step 0:
  ```
  **No-Code Rule:** This command MUST NOT create, edit, or write any project files.
  Allowed writes: `.claude/decision.md` and `.claude/brainstorms/` only.
  If you find yourself about to write code or modify project files — stop. That belongs in `/ec-execute`.
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "No-Code Rule" commands/ec-brainstorm.md` returns the line
- Dependencies: none

**Task 2 — Add No-Code Rule to ec-feature.md** `S`
- File: `commands/ec-feature.md`
- Reuse: same pattern as Task 1
- Code sample: insert after `- If \`structured\` (or file absent): proceed normally` in Step 0:
  ```
  **No-Code Rule:** This command MUST NOT create, edit, or write any project files.
  Allowed writes: `.claude/current-plan.md` only.
  If you find yourself about to write code or modify project files — stop. That belongs in `/ec-execute`.
  ```
- Edge cases: none
- ⚠️ Breaking change: none
- Verify: `grep "No-Code Rule" commands/ec-feature.md` returns the line
- Dependencies: none

**Task 3 — Add Agent-Augmented Analysis to ec-feature.md** `S`
- File: `commands/ec-feature.md`
- Reuse: agent detection table already in Step 2 for reference
- Code sample: insert after `### Memory Cross-Check` section (before `### Reuse Scan`):
  ```
  ### Agent-Augmented Analysis
  Based on `stack.md`, detect the primary stack(s) and read the relevant agent file(s):
  - Map stack to agent: `.py` → `ec-python`, `.tsx`/`.jsx` → `ec-react`, `.ts` server → `ec-nodejs`, `.vue` → `ec-vue`, `.dart` → `ec-flutter`, `.swift` → `ec-ios`, `.kt` → `ec-android`, `.go` → `ec-golang`, `.java` → `ec-java`, `.php` → `ec-php`
  - Read up to 2 most relevant: `cat ~/.claude/agents/{agent-name}.md`
  - If file not found: skip silently — analysis continues without it
  Apply domain knowledge to: reuse scan (idiomatic patterns/libs for this stack), impact analysis (common coupling risks), and per-task recommendations.
  Do not show agent file content to the user — apply silently.
  ```
- Edge cases: agent file missing → skip silently (already specified)
- ⚠️ Breaking change: none
- Verify: `grep "Agent-Augmented Analysis" commands/ec-feature.md` returns the line
- Dependencies: none
