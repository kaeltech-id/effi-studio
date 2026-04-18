## Feature: Flat Task Execution + Resumable State

### Impact Analysis
- Files affected: commands/ec-execute.md, commands/ec-feature.md, commands/ec-brainstorm.md
- ⚠️ Breaking change risk: none — plan lama tanpa format checkbox sudah selesai semua

### Reusable Existing Code
- Format `- [ ] Task N` sudah ada di ec-feature.md — diperkuat, tidak diubah
- Pola `Read .claude/current-plan.md` sudah ada di ec-execute Step 1 — diperluas

### Tasks
- [x] Task 1: ec-execute sequential loop [M] — hapus Step 3 "Group Tasks", ganti dengan sequential loop + tandai [x] per task selesai
- [x] Task 2: ec-execute resume logic [S] — di Step 1, count [x] vs [ ], skip yang sudah [x], mulai dari [ ] pertama
- [x] Task 3: ec-execute progress display [S] — tampilkan "▶ Task N/Total: name" sebelum dan "✓ Task N/Total" sesudah tiap task
- [x] Task 4: ec-feature incomplete guard [S] — cek current-plan.md ada [ ] sebelum overwrite, minta konfirmasi y/n
- [x] Task 5: ec-feature flat format enforcement [S] — tambah Format Rules: no batch headers, no grouping, strict - [ ] format
- [x] Task 6: ec-brainstorm no-batch rule [S] — tambah constraint di Step 3: NEVER recommend batching/phasing, ONE complete approach

### Per Task Detail

**Task 1 — ec-execute sequential loop** `M`
- File: commands/ec-execute.md
- Reuse: none
- Code sample:
  Replace current Step 3 "Group Tasks" dengan:
  ```
  ## Step 3 — Execute Sequentially
  Read all tasks from `.claude/current-plan.md`. Find all lines matching `- [ ]`.
  total = count of all task lines (both [x] and [ ]).
  For each `- [ ]` task in document order:
    1. Show: "▶ Task {current}/{total}: {task name} [{size}]"
    2. Spawn one subagent with full task context (file path, code sample, verify step, relevant memory/docs)
    3. Subagent MUST run verify step and confirm output before claiming done
    4. After subagent confirms complete: edit `.claude/current-plan.md`, replace `- [ ] Task N` with `- [x] Task N` for this task only
    5. Show: "✓ Task {current}/{total}: {task name} — verified"
  Repeat until no `- [ ]` lines remain.
  ```
- ⚠️ Breaking change: hapus "parallel group" logic — tasks jalan satu per satu
- Verify: grep "Group Tasks\|parallel" commands/ec-execute.md returns no matches in Step 3; grep "\- \[x\]" commands/ec-execute.md returns a match
- Dependencies: none

**Task 2 — ec-execute resume logic** `S`
- File: commands/ec-execute.md
- Reuse: none
- Code sample:
  Tambah di Step 1, setelah baca current-plan.md:
  ```
  Count lines in current-plan.md:
  - done = count of lines matching `- [x]`
  - remaining = count of lines matching `- [ ]`

  If remaining == 0 and done > 0:
    Show: "All {done} tasks already complete — run /ec-review."
    Stop.
  If remaining == 0 and done == 0:
    Show: "No tasks found in current-plan.md. Run /ec-feature first."
    Stop.
  If done > 0 and remaining > 0:
    Show: "Resuming: {done} tasks already done, {remaining} remaining."
  ```
- Verify: ec-execute.md Step 1 mengandung tiga kondisi (all done / no tasks / resume) dengan string "Resuming:"
- Dependencies: Task 1

**Task 3 — ec-execute progress display** `S`
- File: commands/ec-execute.md
- Reuse: none
- Code sample:
  Di dalam loop Step 3, format wajib:
  ```
  Before spawn: "▶ Task {current}/{total}: {task_name} [{size}]"
  After verify: "✓ Task {current}/{total}: {task_name} — verified"
  ```
- Verify: ec-execute.md mengandung format string "▶ Task {current}/{total}" dan "✓ Task {current}/{total}"
- Dependencies: Task 1

**Task 4 — ec-feature incomplete guard** `S`
- File: commands/ec-feature.md
- Reuse: none
- Code sample:
  Tambah di Step 0, sebelum input gathering:
  ```
  **Incomplete plan guard:** Before proceeding, check if `.claude/current-plan.md` exists.
  If it exists, count lines matching `- [ ]`.
  If count > 0:
    Show: "⚠️ current-plan.md has {n} incomplete task(s). Overwrite and start fresh? (y/n):"
    If n: Stop — "Run /ec-execute to finish the current plan, or manually delete .claude/current-plan.md."
    If y: continue normally — plan will be overwritten at Step 3.
  ```
- Verify: ec-feature.md Step 0 mengandung "Incomplete plan guard" dengan count `- [ ]` dan y/n prompt
- Dependencies: none

**Task 5 — ec-feature flat format enforcement** `S`
- File: commands/ec-feature.md
- Reuse: none
- Code sample:
  Tambah di Step 3 Task Granularity Rules section:
  ```
  ### Flat Format Rules (mandatory — no exceptions)
  - Task list MUST be flat — no batch headers, no phase labels, no grouping of any kind
  - NEVER write: "## Batch A", "### Phase 1", "#### Group:", "**Wave 1**", or any grouping construct
  - Every task MUST use exact format: `- [ ] Task N: {name} [{size}] — {description}`
  - Task numbers are sequential integers 1 to N, no gaps, no sub-numbering (1.1, 1.2, etc.)
  - Size of the feature does not affect format — 3 tasks or 50 tasks use identical flat structure
  ```
- Verify: ec-feature.md Step 3 mengandung "Flat Format Rules" section dengan "NEVER write" list
- Dependencies: none

**Task 6 — ec-brainstorm no-batch rule** `S`
- File: commands/ec-brainstorm.md
- Reuse: none
- Code sample:
  Tambah di Step 3 Present the Recommendation, setelah format block:
  ```
  ### Recommendation Constraints (non-negotiable)
  - NEVER recommend batching, phasing, or splitting implementation into multiple /ec-execute cycles
  - The recommendation describes ONE complete approach, implemented in ONE /ec-feature + /ec-execute cycle
  - If scope seems large: that is fine — /ec-feature handles any number of tasks in a flat list
  - "Start with X, then do Y later" is not a recommendation — it is two recommendations. Pick one complete solution.
  ```
- Verify: ec-brainstorm.md Step 3 mengandung "NEVER recommend batching" dan "ONE complete approach"
- Dependencies: none
