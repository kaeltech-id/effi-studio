# Feature: Batch E — Fix All 9 Remaining Weaknesses

## Impact Analysis
- Files affected: `server/memory.py`, `server/worker.py`, `server/graph.py`, `hooks/session_stop.py`, `commands/ec-execute.md`
- ⚠️ Breaking change risk: none — all additive or internal fixes

## Reusable Existing Code
- `TYPE_CAPS` dict in `server/memory.py` line 11 — extend, do not replace
- `collection.add()` in `save_observation()` `server/memory.py` ~line 206 — wrap with retry loop
- `/health` endpoint in `server/worker.py` ~line 25 — replace hardcoded version with file read
- `import_data()` in `server/graph.py` ~line 371 — add SELECT before INSERT
- `_extract_imports()` in `server/graph.py` ~line 236 — add dynamic import detection
- `get_blast_radius()` in `server/graph.py` ~line 302 — add `has_dynamic_imports` field
- `main()` in `hooks/session_stop.py` — append two function calls at end
- Step 1.5 stash command in `commands/ec-execute.md` line 22 — fix pathspec
- Step 4 Evidence Rule in `commands/ec-execute.md` — add Timeout Rule after

## Tasks
- [ ] Task 1: memory-caps-and-retry [S] — extend TYPE_CAPS + wrap ChromaDB add() with retry
- [ ] Task 2: execute-stash-and-timeout [S] — fix stash pathspec + add 10min timeout rule
- [ ] Task 3: health-version [S] — read VERSION file in /health endpoint
- [ ] Task 4: graph-dedup-and-dynamic [S] — dedup import_data() + detect non-literal dynamic imports
- [ ] Task 5: session-stop-auto-export-hook [S] — auto_export() + ensure_commit_hook() in session_stop

---

## Per Task Detail

**Task 1 — memory-caps-and-retry** `S`
- File: `server/memory.py`
- Reuse: existing `TYPE_CAPS` dict at line 11; existing `collection.add()` block ~line 206
- Code sample:

  Change 1 — Replace `TYPE_CAPS` dict:
  ```python
  TYPE_CAPS: dict[str, int] = {
      "tool_use": 200,
      "summary": 50,
      "decision": 100,
      "execution": 100,
      "review": 100,
      "feature_plan": 100,
      "setup": 50,
  }
  ```

  Change 2 — Wrap `collection.add()` in `save_observation()` with retry:
  ```python
  for attempt in range(2):
      try:
          collection.add(
              documents=[content],
              metadatas=[{"type": obs_type, "created_at": now, **(metadata or {})}],
              ids=[str(obs_id)]
          )
          break
      except Exception:
          if attempt == 1:
              pass
  ```

- Edge cases: if both attempts fail, observation is silently skipped (same as before, just with one retry)
- ⚠️ Breaking change: none
- Verify: `grep -n "decision\|execution\|review\|feature_plan\|setup" server/memory.py` → returns the 5 new type lines; `grep -n "for attempt in range" server/memory.py` → returns the retry loop line
- Dependencies: none

---

**Task 2 — execute-stash-and-timeout** `S`
- File: `commands/ec-execute.md`
- Reuse: existing Step 1.5 stash block; existing Evidence Rule in Step 4
- Code sample:

  Change 1 — In Step 1.5, replace stash command:
  ```
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  git stash push --include-untracked -m "efficlaude-pre-execute-$TIMESTAMP" -- . ':(exclude).claude' 2>/dev/null \
    && echo "Snapshot saved: efficlaude-pre-execute-$TIMESTAMP" \
    || echo "(nothing to snapshot — clean working tree)"
  ```

  Change 2 — After `### Error Recovery` block in Step 4, add new section:
  ```
  ### Timeout Rule
  If a subagent has not completed within 10 minutes:
  - Treat it as failed
  - Report: "Task {name} timed out after 10 minutes"
  - Ask user: "Retry / Skip / Fix manually?"
  ```

- Edge cases: repos with no `.claude/` dir — pathspec still works (no-op exclude)
- ⚠️ Breaking change: none
- Verify: `grep "exclude\)\.claude" commands/ec-execute.md` → returns the new stash line; `grep "Timeout Rule" commands/ec-execute.md` → returns the heading
- Dependencies: none

---

**Task 3 — health-version** `S`
- File: `server/worker.py`
- Reuse: existing `/health` endpoint ~line 25
- Code sample — Replace `/health` function body:
  ```python
  @app.route('/health')
  def health():
      version = "unknown"
      try:
          version_path = os.path.join(os.path.dirname(__file__), '..', 'VERSION')
          with open(os.path.normpath(version_path)) as f:
              version = f.read().strip()
      except Exception:
          pass
      return jsonify({
          "status": "ok",
          "version": version,
          "tree_sitter": graph._ts_available
      })
  ```
- Edge cases: VERSION file missing → returns "unknown" (safe fallback)
- ⚠️ Breaking change: none — response shape unchanged
- Verify: `python3 -c "import ast; ast.parse(open('server/worker.py').read()); print('ok')"` → prints `ok`; also `grep -n "version_path\|normpath" server/worker.py` → returns both lines
- Dependencies: none

---

**Task 4 — graph-dedup-and-dynamic** `S`
- File: `server/graph.py`
- Reuse: existing `import_data()` ~line 371; existing `_extract_imports()` ~line 236; existing `get_blast_radius()` ~line 302
- Code sample:

  Change 1 — Replace body of `import_data()` (keep signature):
  ```python
  now = datetime.utcnow().isoformat()
  nodes = data.get('nodes', [])
  edges = data.get('edges', [])
  imported_nodes = 0
  imported_edges = 0
  with sqlite3.connect(self.db_path) as conn:
      for node in nodes:
          exists = conn.execute(
              'SELECT id FROM graph_nodes WHERE project=? AND file_path=? AND name=? AND node_type=?',
              (project, node['file_path'], node['name'], node['node_type'])
          ).fetchone()
          if not exists:
              conn.execute(
                  'INSERT INTO graph_nodes (project, file_path, name, node_type, start_line, end_line, language, updated_at) VALUES (?,?,?,?,?,?,?,?)',
                  (project, node['file_path'], node['name'], node['node_type'],
                   node.get('start_line', 0), node.get('end_line', 0), node.get('language', ''), now)
              )
              imported_nodes += 1
      for edge in edges:
          exists = conn.execute(
              'SELECT id FROM graph_edges WHERE project=? AND source_file=? AND target_ref=? AND edge_type=?',
              (project, edge['source_file'], edge['target_ref'], edge.get('edge_type', 'imports'))
          ).fetchone()
          if not exists:
              conn.execute(
                  'INSERT INTO graph_edges (project, source_file, target_ref, edge_type, updated_at) VALUES (?,?,?,?,?)',
                  (project, edge['source_file'], edge['target_ref'], edge.get('edge_type', 'imports'), now)
              )
              imported_edges += 1
      conn.commit()
  return {'nodes_imported': imported_nodes, 'edges_imported': imported_edges}
  ```

  Change 2 — In `_extract_imports()`, after JS/TS static import detection block, add:
  ```python
  if lang in ('javascript', 'typescript'):
      for m in re.finditer(r'import\s*\(\s*([^\'"`\)][^\)]*)\s*\)', source):
          imports.append('__dynamic__')
  ```

  Change 3 — In `get_blast_radius()`, before returning the result dict, add:
  ```python
  has_dynamic = '__dynamic__' in affected
  affected = [f for f in affected if f != '__dynamic__']
  ```
  And include `"has_dynamic_imports": has_dynamic` in the returned dict.

- Edge cases: `__dynamic__` filtered from affected list so it never shows as a real file path
- ⚠️ Breaking change: none — `has_dynamic_imports` is additive to response
- Verify: `python3 -c "import ast; ast.parse(open('server/graph.py').read()); print('ok')"` → prints `ok`; `grep -n "__dynamic__\|has_dynamic_imports" server/graph.py` → returns all 3 reference lines
- Dependencies: none

---

**Task 5 — session-stop-auto-export-hook** `S`
- File: `hooks/session_stop.py`
- Reuse: existing `WORKER_URL`, `subprocess`, `json`, `os` imports; existing `main()` function
- Code sample:

  Change 1 — Add `import urllib.parse` and `import time` to imports (near top with other stdlib imports).

  Change 2 — Add two new functions before `main()`:
  ```python
  def auto_export(project):
      try:
          export_path = os.path.join(os.getcwd(), ".claude", "memory-export.json")
          if os.path.exists(export_path):
              if time.time() - os.path.getmtime(export_path) < 3600:
                  return
          mem_req = urllib.request.Request(
              f"{WORKER_URL}/memory/export?project={urllib.parse.quote(project)}"
          )
          graph_req = urllib.request.Request(
              f"{WORKER_URL}/graph/export?project={urllib.parse.quote(project)}"
          )
          with urllib.request.urlopen(mem_req, timeout=5) as r:
              mem_data = json.loads(r.read())
          with urllib.request.urlopen(graph_req, timeout=5) as r:
              graph_data = json.loads(r.read())
          export = {
              "project": project,
              "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "memory": mem_data,
              "graph": graph_data,
          }
          os.makedirs(os.path.dirname(export_path), exist_ok=True)
          with open(export_path, 'w') as f:
              json.dump(export, f)
      except Exception:
          pass


  def ensure_commit_hook():
      try:
          src = os.path.expanduser("~/.efficlaude/hooks/commit-msg")
          if not os.path.exists(src):
              return
          result = subprocess.run(
              ["git", "rev-parse", "--git-dir"],
              capture_output=True, text=True, cwd=os.getcwd(), timeout=3
          )
          git_dir = result.stdout.strip()
          if not git_dir:
              return
          dst = os.path.join(git_dir, "hooks", "commit-msg")
          if not os.path.exists(dst):
              import shutil
              shutil.copy2(src, dst)
              os.chmod(dst, 0o755)
      except Exception:
          pass
  ```

  Change 3 — At the end of `main()`, append:
  ```python
  auto_export(project)
  ensure_commit_hook()
  ```

- Edge cases: worker offline → `auto_export` fails silently (try/except); no `.git` dir → `ensure_commit_hook` fails silently; export < 1 hour old → skipped
- ⚠️ Breaking change: none — additive only
- Verify: `python3 -c "import ast; ast.parse(open('hooks/session_stop.py').read()); print('ok')"` → prints `ok`; `grep -n "auto_export\|ensure_commit_hook\|urllib.parse\|import time" hooks/session_stop.py` → returns all 4 reference lines
- Dependencies: none
