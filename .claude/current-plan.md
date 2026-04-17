# Feature: Batch B — Operational Quality (Template Drift Lint + Context Staleness Hook + FTS Fallback + Onboarding Check)

## Impact Analysis
- Files affected: `commands/ec-review.md`, `hooks/prompt_submit.py`, `commands/ec-feature.md` (remove stale check), `server/memory.py`, `commands/ec-brainstorm.md`, `commands/ec-feature.md`
- ⚠️ Breaking change risk: memory.py FTS table is additive; prompt_submit.py change is additive

## Reusable Existing Code
- `check_update()` pattern in `hooks/prompt_submit.py:76` — same structure for check_context_staleness()
- `_init_db()` in `server/memory.py:29` — add FTS table creation here
- `save_observation()` in `server/memory.py:159` — add FTS insert here
- `search()` in `server/memory.py:179` — add FTS fallback here

## Tasks
- [ ] Task 1: Template drift lint in ec-review.md [S] — add Stage 1.5 to compare CLAUDE.md vs ec-setup.md GIT RULES
- [ ] Task 2: Context staleness in prompt_submit.py [S] — add check_context_staleness(), fires every session
- [ ] Task 3: Remove stale check from ec-feature.md [S] — delete the Check context freshness block now in prompt_submit
- [ ] Task 4: FTS5 table in memory.py _init_db() [S] — CREATE VIRTUAL TABLE obs_fts
- [ ] Task 5: FTS5 insert in memory.py save_observation() [S] — INSERT to obs_fts on save
- [ ] Task 6: _fts_search() method in memory.py [S] — keyword search via FTS5
- [ ] Task 7: FTS fallback in memory.py search() [S] — call _fts_search when ChromaDB confidence low
- [ ] Task 8: Onboarding check in ec-brainstorm.md [S] — verify context files exist and non-empty in Step 0
- [ ] Task 9: Onboarding check in ec-feature.md [S] — same check in Step 0

---

## Per Task Detail

**Task 1 — Template drift lint in ec-review.md** `S`
- File: `commands/ec-review.md`
- Reuse: none
- Code sample — insert new section between "**Only proceed to Stage 2 after Stage 1 is fully clean.**" and "## Stage 2 — Code Quality Review":
  ```markdown
  ## Stage 1.5 — Template Drift Check
  If `commands/ec-setup.md` exists in this project:
  - Read `CLAUDE.md` and extract all lines inside the `## GIT RULES` block
  - Read `commands/ec-setup.md` and extract the `## GIT RULES` block from the CLAUDE.md template section (between `## GIT RULES` and `## WORKFLOW RULES`)
  - Compare both lists line by line
  - If any rule is in CLAUDE.md but missing from the template: fix `commands/ec-setup.md` directly and note "Fixed template drift: added {rule}"
  - If all rules match: note "Template drift check: ✓ GIT RULES in sync"
  If `commands/ec-setup.md` does not exist: skip this check silently.
  ```
- Edge cases: CLAUDE.md or ec-setup.md missing → skip silently
- ⚠️ Breaking change: none
- Verify: `grep "Template Drift Check\|template drift" commands/ec-review.md` → returns both strings
- Dependencies: none

---

**Task 2 — Context staleness in prompt_submit.py** `S`
- File: `hooks/prompt_submit.py`
- Reuse: `check_update()` function pattern at line 76 — same structure
- Code sample — add function after `check_update()`:
  ```python
  def check_context_staleness():
      try:
          stack_path = os.path.join(os.getcwd(), ".claude", "context", "stack.md")
          with open(stack_path) as f:
              first_line = f.readline().strip()
          if not first_line.startswith("<!-- last_updated:"):
              return None
          date_str = first_line.replace("<!-- last_updated:", "").replace("-->", "").strip()
          last_ts = time.mktime(time.strptime(date_str, "%Y-%m-%d"))
          days = int((time.time() - last_ts) / 86400)
          if days > 30:
              return f"⚠️ Context files last updated {days} days ago. Consider running /ec-setup to refresh."
      except Exception:
          pass
      return None
  ```
  In `main()`, after `update_msg = check_update()`, add:
  ```python
  staleness_msg = check_context_staleness()
  ```
  And after the `if update_msg:` block, add:
  ```python
  if staleness_msg:
      parts.insert(0, f"**{staleness_msg}**")
  ```
- Edge cases: no stack.md → returns None (skip); no last_updated tag → returns None; date parse error → caught by except
- ⚠️ Breaking change: none — additive
- Verify: `grep "check_context_staleness\|staleness_msg" hooks/prompt_submit.py` → returns both strings
- Dependencies: none

---

**Task 3 — Remove stale check from ec-feature.md** `S`
- File: `commands/ec-feature.md`
- Reuse: none
- Code sample — remove this entire block (lines 19–24):
  ```
  **Check context freshness:**
  Read the first line of `.claude/context/stack.md`.
  If it matches `<!-- last_updated: {date} -->`, parse the date and compare to today.
  If more than 30 days have passed, show:
  "⚠️ Context files last updated {n} days ago. Consider running /ec-setup to refresh stack, structure, and conventions."
  If the tag is absent, the file doesn't exist, or date parsing fails — skip silently.
  ```
- Edge cases: none
- ⚠️ Breaking change: none — check now handled by prompt_submit.py hook
- Verify: `grep "Check context freshness" commands/ec-feature.md` → returns no output (block removed)
- Dependencies: Task 2 (staleness check must be in prompt_submit before removing from ec-feature)

---

**Task 4 — FTS5 table in memory.py _init_db()** `S`
- File: `server/memory.py`
- Reuse: `_init_db()` method at line 29 — add after existing `conn.execute` blocks
- Code sample — add inside `_init_db()` after the `summaries` table creation, before `conn.commit()`:
  ```python
  conn.execute('''
      CREATE VIRTUAL TABLE IF NOT EXISTS obs_fts
      USING fts5(content, tokenize="porter ascii")
  ''')
  ```
- Edge cases: FTS5 not available (unlikely with Python 3.8+) → `except Exception: pass` in `_init_db` handles it — but actually _init_db doesn't have try/except. Add the FTS table creation inside a separate try/except so FTS failure doesn't break core DB init:
  ```python
  try:
      conn.execute('''
          CREATE VIRTUAL TABLE IF NOT EXISTS obs_fts
          USING fts5(content, tokenize="porter ascii")
      ''')
  except Exception:
      pass
  ```
- ⚠️ Breaking change: none — additive virtual table
- Verify: `python3 -c "import sys; sys.path.insert(0,'server'); from memory import MemoryEngine; import tempfile, os; m = MemoryEngine(os.path.join(tempfile.mkdtemp(),'t.db'), tempfile.mkdtemp()); print('ok')"` → returns "ok"
- Dependencies: none

---

**Task 5 — FTS5 insert in memory.py save_observation()** `S`
- File: `server/memory.py`
- Reuse: `save_observation()` at line 159 — add FTS insert after `obs_id = cursor.lastrowid`
- Code sample — add after `conn.commit()` inside `save_observation()`:
  ```python
  try:
      with sqlite3.connect(self.db_path) as conn:
          conn.execute('INSERT INTO obs_fts(rowid, content) VALUES (?, ?)', (obs_id, content))
          conn.commit()
  except Exception:
      pass
  ```
- Edge cases: FTS table missing (e.g. old DB without FTS) → caught by `except Exception: pass`
- ⚠️ Breaking change: none
- Verify: `grep "obs_fts\|INSERT INTO obs_fts" server/memory.py` → returns both strings
- Dependencies: Task 4 (FTS table must exist)

---

**Task 6 — _fts_search() method in memory.py** `S`
- File: `server/memory.py`
- Reuse: `_get_collection()` pattern; `sqlite3.connect(self.db_path)` pattern throughout
- Code sample — add new private method after `_prune_on_startup()`:
  ```python
  def _fts_search(self, project: str, query: str, limit: int) -> list:
      try:
          with sqlite3.connect(self.db_path) as conn:
              rows = conn.execute(
                  '''SELECT o.id, o.type, o.content, o.metadata, o.created_at
                     FROM obs_fts f
                     JOIN observations o ON f.rowid = o.id
                     WHERE f.content MATCH ? AND o.project = ?
                     ORDER BY o.created_at DESC
                     LIMIT ?''',
                  (query, project, limit)
              ).fetchall()
          return [
              {
                  "content": r[2],
                  "metadata": {**json.loads(r[3] or '{}'), "type": r[1], "created_at": r[4]},
                  "distance": 0.5
              }
              for r in rows
          ]
      except Exception:
          return []
  ```
- Edge cases: FTS5 query with special chars (*, ", ()) → caught by `except Exception: return []`; no results → returns `[]`
- ⚠️ Breaking change: none
- Verify: `grep "_fts_search" server/memory.py` → returns the method definition
- Dependencies: Task 4

---

**Task 7 — FTS fallback in memory.py search()** `S`
- File: `server/memory.py`
- Reuse: `_fts_search()` from Task 6
- Code sample — replace current `search()` method body:
  ```python
  def search(self, project, query, limit=5):
      collection = self._get_collection(project)
      try:
          count = collection.count()
          if count == 0:
              return self._fts_search(project, query, limit)
          results = collection.query(
              query_texts=[query],
              n_results=min(limit, count)
          )
          items = [
              {"content": doc, "metadata": meta, "distance": dist}
              for doc, meta, dist in zip(
                  results['documents'][0],
                  results['metadatas'][0],
                  results['distances'][0]
              )
          ]
          if all(item['distance'] > 1.5 for item in items):
              fts = self._fts_search(project, query, limit)
              if fts:
                  return fts
          return items
      except Exception:
          return self._fts_search(project, query, limit)
  ```
- Edge cases: ChromaDB empty → FTS fallback; all distances > 1.5 → FTS fallback; FTS also empty → returns `[]`
- ⚠️ Breaking change: none — same return shape, just adds fallback path
- Verify: `grep "_fts_search" server/memory.py | wc -l` → returns 3 or more (definition + 3 call sites)
- Dependencies: Task 5, Task 6

---

**Task 8 — Onboarding check in ec-brainstorm.md** `S`
- File: `commands/ec-brainstorm.md`
- Reuse: none
- Code sample — add after the worker status block in Step 0, before "## Step 1":
  ```markdown
  **Onboarding check:** Verify `.claude/context/stack.md`, `.claude/context/structure.md`, and `.claude/context/conventions.md` all exist and are non-empty.
  - If all present: proceed normally
  - If any are missing or empty: show "(context incomplete — run /ec-setup first to configure this project)" and stop
  ```
- Edge cases: files exist but are empty → still show warning
- ⚠️ Breaking change: none
- Verify: `grep "Onboarding check\|context incomplete" commands/ec-brainstorm.md` → returns both strings
- Dependencies: none

---

**Task 9 — Onboarding check in ec-feature.md** `S`
- File: `commands/ec-feature.md`
- Reuse: same pattern as Task 8
- Code sample — add after the worker status block in Step 0, before "**Check for brainstorm decision:**":
  ```markdown
  **Onboarding check:** Verify `.claude/context/stack.md`, `.claude/context/structure.md`, and `.claude/context/conventions.md` all exist and are non-empty.
  - If all present: proceed normally
  - If any are missing or empty: show "(context incomplete — run /ec-setup first to configure this project)" and stop
  ```
- Edge cases: files exist but are empty → still show warning
- ⚠️ Breaking change: none
- Verify: `grep "Onboarding check\|context incomplete" commands/ec-feature.md` → returns both strings
- Dependencies: Task 3 (same file — execute after T3)
