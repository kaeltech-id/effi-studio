# Feature: Batch C — Architectural Improvements (Determinism + Team Export + Blast Radius)

## Impact Analysis
- Files affected: `commands/ec-execute.md`, `commands/ec-git.md`, `commands/ec-review.md`, `server/graph.py`, `server/memory.py`, `server/worker.py`, `install.sh`
- New files: `commands/ec-export.md`, `commands/ec-import.md`
- ⚠️ Breaking change risk: none — all additive

## Reusable Existing Code
- `_extract_imports()` in `server/graph.py:236` — extend with dynamic import pattern
- `save_observation()` in `server/memory.py:189` — used inside `import_data()` for dedup
- Worker endpoint patterns in `server/worker.py:36` — same structure for new endpoints
- `check_update()` pattern in `hooks/prompt_submit.py:76` — same guard style for ec-export/import worker check

## Tasks
- [ ] Task 1: Verification anchor in ec-execute.md [S] — add pre-spawn checklist before subagents fire
- [ ] Task 2: Verification anchor in ec-git.md [S] — add pre-execute safety checklist before Step 3
- [ ] Task 3: Manual scope prompt in ec-review.md [S] — ask user for extra files after blast radius
- [ ] Task 4: Dynamic import + export/import in server/graph.py [M] — add import() pattern + export()/import_data()
- [ ] Task 5: export/import in server/memory.py [S] — add export()/import_data() methods
- [ ] Task 6: Worker export/import endpoints in server/worker.py [S] — 4 new endpoints
- [ ] Task 7: commands/ec-export.md [S] — new command: dump memory+graph to .claude/memory-export.json
- [ ] Task 8: commands/ec-import.md [S] — new command: load memory+graph from .claude/memory-export.json
- [ ] Task 9: install.sh COMMANDS array update [S] — add ec-export and ec-import

---

## Per Task Detail

**Task 1 — Verification anchor in ec-execute.md** `S`
- File: `commands/ec-execute.md`
- Reuse: none
- Code sample — insert between "## Step 3 — Group Tasks" and "## Step 4 — Execute with Evidence Verification":
  ```markdown
  ## Step 3.5 — Pre-spawn Verification Anchor
  Before spawning any subagent, explicitly confirm each item:
  - [ ] `.claude/current-plan.md` is loaded and all tasks are numbered
  - [ ] Every task has an exact file path, code sample, and verify step
  - [ ] No two tasks write to the same file (checked in Step 2)
  - [ ] Rollback snapshot was taken (Step 1.5)
  - [ ] Task dependency order is respected (sequential tasks listed after their dependencies)
  Only proceed after all items are confirmed. If any item fails, report and ask user before continuing.
  ```
- Edge cases: clean tree (no snapshot) → still confirm other 4 items
- ⚠️ Breaking change: none — additive
- Verify: `grep "Pre-spawn Verification Anchor" commands/ec-execute.md` → returns the heading
- Dependencies: none

---

**Task 2 — Verification anchor in ec-git.md** `S`
- File: `commands/ec-git.md`
- Reuse: none
- Code sample — insert between "## Step 2 — Gather Details" block and "## Step 3 — Execute":
  ```markdown
  ## Step 2.5 — Pre-execute Safety Checklist
  Before executing any git command, explicitly confirm all applicable items:
  - [ ] User gave explicit confirmation in Step 2 (never skip this)
  - [ ] **commit only:** conventional prefix is present in commit message
  - [ ] **commit only:** staged files do not include `.env`, credentials, or API keys
  - [ ] **push only:** correct remote and branch were confirmed
  - [ ] **destructive ops (reset --hard, branch -D, force push):** user typed explicit "yes" confirmation
  Skip non-applicable items. Only proceed to Step 3 after applicable items are confirmed.
  ```
- Edge cases: status/log operations → no items apply, proceed directly
- ⚠️ Breaking change: none — additive
- Verify: `grep "Pre-execute Safety Checklist" commands/ec-git.md` → returns the heading
- Dependencies: none

---

**Task 3 — Manual scope prompt in ec-review.md** `S`
- File: `commands/ec-review.md`
- Reuse: none
- Code sample — append to Step 1.5 (after the "If no affected files" line):
  ```markdown
  **Manual scope:** Ask once: "Any additional files to include in the review scope beyond what blast radius detected? (paste paths or 'no')"
  If user provides paths: add them to Stage 1 and Stage 2 review scope. Flag their issues as ⚠️ Manually scoped.
  If user says 'no' or worker is offline: skip.
  ```
- Edge cases: worker offline → blast radius not run, ask for manual scope unconditionally
- ⚠️ Breaking change: none — additive
- Verify: `grep "Manual scope" commands/ec-review.md` → returns the line
- Dependencies: none

---

**Task 4 — Dynamic import pattern + export/import in server/graph.py** `M`
- File: `server/graph.py`
- Reuse: `_extract_imports()` at line 236 — extend JS/TS pattern lists; `_init_db()` / `sqlite3.connect` pattern for export/import
- Code sample — part A: in `_extract_imports()`, add to javascript and typescript pattern lists:
  ```python
  r'''import\s*\(\s*['"]([^'"]+)['"]\s*\)''',
  ```
  Full updated sections:
  ```python
  'javascript': [
      r'''import\s+.*?from\s+['"]([^'"]+)['"]''',
      r'''require\s*\(\s*['"]([^'"]+)['"]\s*\)''',
      r'''import\s*\(\s*['"]([^'"]+)['"]\s*\)''',
  ],
  'typescript': [
      r'''import\s+.*?from\s+['"]([^'"]+)['"]''',
      r'''require\s*\(\s*['"]([^'"]+)['"]\s*\)''',
      r'''import\s*\(\s*['"]([^'"]+)['"]\s*\)''',
  ],
  ```

- Code sample — part B: add two methods after `get_summary()` at the end of the class:
  ```python
  def export(self, project: str) -> dict:
      with sqlite3.connect(self.db_path) as conn:
          nodes = conn.execute(
              'SELECT file_path, name, node_type, start_line, end_line, language FROM graph_nodes WHERE project=?',
              (project,)
          ).fetchall()
          edges = conn.execute(
              'SELECT source_file, target_ref, edge_type FROM graph_edges WHERE project=?',
              (project,)
          ).fetchall()
      return {
          'nodes': [{'file_path': r[0], 'name': r[1], 'node_type': r[2], 'start_line': r[3], 'end_line': r[4], 'language': r[5]} for r in nodes],
          'edges': [{'source_file': r[0], 'target_ref': r[1], 'edge_type': r[2]} for r in edges],
      }

  def import_data(self, project: str, data: dict) -> dict:
      now = datetime.utcnow().isoformat()
      nodes = data.get('nodes', [])
      edges = data.get('edges', [])
      with sqlite3.connect(self.db_path) as conn:
          for node in nodes:
              conn.execute(
                  'INSERT INTO graph_nodes (project, file_path, name, node_type, start_line, end_line, language, updated_at) VALUES (?,?,?,?,?,?,?,?)',
                  (project, node['file_path'], node['name'], node['node_type'], node.get('start_line', 0), node.get('end_line', 0), node.get('language', ''), now)
              )
          for edge in edges:
              conn.execute(
                  'INSERT INTO graph_edges (project, source_file, target_ref, edge_type, updated_at) VALUES (?,?,?,?,?)',
                  (project, edge['source_file'], edge['target_ref'], edge.get('edge_type', 'imports'), now)
              )
          conn.commit()
      return {'nodes_imported': len(nodes), 'edges_imported': len(edges)}
  ```
- Edge cases: empty data dict → inserts nothing, returns zeros; duplicate inserts accumulate in graph (acceptable for import use case)
- ⚠️ Breaking change: none — adds new patterns and new methods
- Verify: `grep "import\\\s\*\\\(" server/graph.py` → returns the new dynamic import line; `grep "def export\|def import_data" server/graph.py` → returns both method defs
- Dependencies: none

---

**Task 5 — export/import methods in server/memory.py** `S`
- File: `server/memory.py`
- Reuse: `save_observation()` at line 189 — used inside `import_data()` for dedup-safe insert; `sqlite3.connect(self.db_path)` pattern throughout
- Code sample — add two methods after `summarize_session()` at end of class:
  ```python
  def export(self, project: str) -> dict:
      with sqlite3.connect(self.db_path) as conn:
          obs = conn.execute(
              'SELECT type, content, metadata, created_at FROM observations WHERE project=? ORDER BY created_at ASC',
              (project,)
          ).fetchall()
          sums = conn.execute(
              'SELECT session_id, summary, created_at FROM summaries WHERE project=? ORDER BY created_at ASC',
              (project,)
          ).fetchall()
      return {
          'observations': [{'type': r[0], 'content': r[1], 'metadata': r[2], 'created_at': r[3]} for r in obs],
          'summaries': [{'session_id': r[0], 'summary': r[1], 'created_at': r[2]} for r in sums],
      }

  def import_data(self, project: str, data: dict) -> dict:
      obs_list = data.get('observations', [])
      sums_list = data.get('summaries', [])
      imported_obs = 0
      imported_sums = 0
      for obs in obs_list:
          try:
              with sqlite3.connect(self.db_path) as conn:
                  exists = conn.execute(
                      'SELECT id FROM observations WHERE project=? AND type=? AND content=?',
                      (project, obs.get('type', 'general'), obs.get('content', ''))
                  ).fetchone()
              if not exists:
                  meta = obs.get('metadata', '{}')
                  self.save_observation(project, obs.get('type', 'general'), obs.get('content', ''), json.loads(meta) if isinstance(meta, str) else meta)
                  imported_obs += 1
          except Exception:
              pass
      for s in sums_list:
          try:
              with sqlite3.connect(self.db_path) as conn:
                  exists = conn.execute(
                      'SELECT id FROM summaries WHERE project=? AND summary=?',
                      (project, s.get('summary', ''))
                  ).fetchone()
              if not exists:
                  with sqlite3.connect(self.db_path) as conn:
                      conn.execute(
                          'INSERT INTO summaries (project, session_id, summary, created_at) VALUES (?,?,?,?)',
                          (project, s.get('session_id', ''), s.get('summary', ''), s.get('created_at', datetime.utcnow().isoformat()))
                      )
                      conn.commit()
                  imported_sums += 1
          except Exception:
              pass
      return {'observations_imported': imported_obs, 'summaries_imported': imported_sums}
  ```
- Edge cases: empty data → returns zeros; duplicate content+type → skipped; metadata as str or dict → handled
- ⚠️ Breaking change: none — additive methods
- Verify: `grep "def export\|def import_data" server/memory.py` → returns both method defs
- Dependencies: none

---

**Task 6 — Worker export/import endpoints in server/worker.py** `S`
- File: `server/worker.py`
- Reuse: existing endpoint pattern throughout file; `memory` and `graph` engine instances at line 20-22
- Code sample — add after `@app.route('/memory/summarize')` block and after `@app.route('/graph/summary')` block:
  ```python
  # After /memory/summarize:
  @app.route('/memory/export')
  def memory_export():
      project = request.args.get('project', '')
      if not project:
          return jsonify({"error": "project required"}), 400
      return jsonify(memory.export(project))

  @app.route('/memory/import', methods=['POST'])
  def memory_import():
      data = request.json or {}
      project = data.get('project', '')
      if not project:
          return jsonify({"error": "project required"}), 400
      result = memory.import_data(project, data.get('data', {}))
      return jsonify(result)

  # After /graph/summary:
  @app.route('/graph/export')
  def graph_export():
      project = request.args.get('project', '')
      if not project:
          return jsonify({"error": "project required"}), 400
      return jsonify(graph.export(project))

  @app.route('/graph/import', methods=['POST'])
  def graph_import():
      data = request.json or {}
      project = data.get('project', '')
      if not project:
          return jsonify({"error": "project required"}), 400
      result = graph.import_data(project, data.get('data', {}))
      return jsonify(result)
  ```
- Edge cases: missing project → 400; empty data body → import_data handles gracefully
- ⚠️ Breaking change: none — new endpoints only
- Verify: `grep "memory_export\|memory_import\|graph_export\|graph_import" server/worker.py` → returns all 4 function names
- Dependencies: Task 4, Task 5

---

**Task 7 — commands/ec-export.md** `S`
- File: `commands/ec-export.md` (new)
- Reuse: worker check pattern from `commands/ec-setup.md:3`; project_name from `.claude/project-config.json`
- Code sample — full file content:
  ```markdown
  Export project memory and graph to a shareable JSON file at .claude/memory-export.json.

  ## Step 0 — Check Worker
  Check worker: `curl -s http://localhost:37777/health`
  - If running: show "(worker online ✓)" and proceed.
  - If offline: show "Worker offline — cannot export. Start worker first." and stop.

  ## Step 1 — Load Project Name
  Read `.claude/project-config.json` → get `project_name`.
  If file missing: use `basename $PWD` as project name.

  ## Step 2 — Fetch Export Data
  ```
  MEMORY=$(curl -s "http://localhost:37777/memory/export?project={project_name}")
  GRAPH=$(curl -s "http://localhost:37777/graph/export?project={project_name}")
  ```

  ## Step 3 — Write Export File
  Write `.claude/memory-export.json`:
  ```json
  {
    "project": "{project_name}",
    "exported_at": "{ISO timestamp — use date -u +%Y-%m-%dT%H:%M:%SZ}",
    "memory": {MEMORY response},
    "graph": {GRAPH response}
  }
  ```

  Show summary:
  - "Exported {observations count} observations, {summaries count} summaries"
  - "Exported {nodes count} graph nodes, {edges count} graph edges"
  - "Written to .claude/memory-export.json"
  - "Tip: commit this file to share memory with your team: `git add .claude/memory-export.json`"
  ```
- Edge cases: empty memory/graph → exports empty arrays (still valid JSON); missing project-config → use basename
- ⚠️ Breaking change: none — new file
- Verify: `test -f commands/ec-export.md && echo "ok"` → returns "ok"
- Dependencies: Task 6

---

**Task 8 — commands/ec-import.md** `S`
- File: `commands/ec-import.md` (new)
- Reuse: worker check pattern from `commands/ec-setup.md:3`
- Code sample — full file content:
  ```markdown
  Import project memory and graph from .claude/memory-export.json (shared via git).

  ## Step 0 — Check Worker
  Check worker: `curl -s http://localhost:37777/health`
  - If running: show "(worker online ✓)" and proceed.
  - If offline: show "Worker offline — cannot import. Start worker first." and stop.

  ## Step 1 — Check Export File
  Check if `.claude/memory-export.json` exists and is valid JSON.
  - If missing: show "No export file found. Pull from repo or run /ec-export first." and stop.
  - If invalid JSON: show "Export file is corrupted. Re-export with /ec-export." and stop.

  ## Step 2 — Load Project Name
  Read `project` field from `.claude/memory-export.json`.
  Also read `.claude/project-config.json` → get local `project_name`.
  If export project != local project: warn "Export is from project '{export.project}' but current project is '{local_project}'. Import anyway? (yes/no)"
  If user says no: stop.

  ## Step 3 — Import Memory
  ```
  curl -s -X POST http://localhost:37777/memory/import \
    -H "Content-Type: application/json" \
    -d '{"project": "{local_project_name}", "data": {memory section from export file}}'
  ```

  ## Step 4 — Import Graph
  ```
  curl -s -X POST http://localhost:37777/graph/import \
    -H "Content-Type: application/json" \
    -d '{"project": "{local_project_name}", "data": {graph section from export file}}'
  ```

  ## Step 5 — Confirm
  Show:
  - "Imported {observations_imported} observations, {summaries_imported} summaries"
  - "Imported {nodes_imported} graph nodes, {edges_imported} graph edges"
  - "Memory and graph are now available for /ec-feature and /ec-review"
  ```
- Edge cases: mismatched project → warn and confirm; invalid JSON → caught in Step 1
- ⚠️ Breaking change: none — new file
- Verify: `test -f commands/ec-import.md && echo "ok"` → returns "ok"
- Dependencies: Task 6

---

**Task 9 — install.sh COMMANDS array update** `S`
- File: `install.sh`
- Reuse: none
- Code sample — change line 13:
  ```bash
  # Before:
  COMMANDS=("ec-setup" "ec-feature" "ec-brainstorm" "ec-execute" "ec-review" "ec-git")
  # After:
  COMMANDS=("ec-setup" "ec-feature" "ec-brainstorm" "ec-execute" "ec-review" "ec-git" "ec-export" "ec-import")
  ```
- Edge cases: none
- ⚠️ Breaking change: none — additive
- Verify: `grep "ec-export.*ec-import" install.sh` → returns the COMMANDS line
- Dependencies: Task 7, Task 8
