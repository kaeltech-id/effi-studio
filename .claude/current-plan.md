## Feature: Graph Import Path Traversal Fix

### Impact Analysis
- Files affected: server/worker.py
- ⚠️ Breaking change risk: clients sending absolute file_path will get 400 (intentional)

### Reusable Existing Code
- Existing pattern `if not project: return jsonify({"error": ...}), 400` di worker.py — ikuti pola yang sama

### Tasks
- [ ] Task 1: Add VALID_NODE_TYPES + _is_safe_path() [S] — konstanta dan helper di worker.py
- [ ] Task 2: Validate nodes in graph_import() [S] — cek file_path + filter node_type
- [ ] Task 3: Validate edges in graph_import() [S] — cek source_file
- [ ] Task 4: Close GitHub issues #4 dan #7 [S] — sudah fixed di 0462edc, tutup via gh CLI

### Per Task Detail

**Task 1 — Add VALID_NODE_TYPES + _is_safe_path()** `S`
- File: `server/worker.py`
- Reuse: none
- Code sample:
  ```python
  VALID_NODE_TYPES = {"function", "class", "method", "module", "variable"}

  def _is_safe_path(p: str) -> bool:
      return bool(p) and not p.startswith('/') and '..' not in p.split('/')
  ```
  Letakkan setelah baris `CHROMA_PATH = ...` (sebelum `os.makedirs`)
- Edge cases: path kosong → `_is_safe_path('')` return False (handled)
- ⚠️ Breaking change: none (belum dipakai)
- Verify: `python3 -c "from worker import _is_safe_path, VALID_NODE_TYPES; assert not _is_safe_path('../etc/passwd'); assert not _is_safe_path('/abs'); assert _is_safe_path('src/foo.py'); print('ok')"`
- Dependencies: none

**Task 2 — Validate nodes in graph_import()** `S`
- File: `server/worker.py`
- Reuse: pola `return jsonify({"error": ...}), 400` yang sudah ada
- Code sample — ganti body `graph_import()`:
  ```python
  @app.route('/graph/import', methods=['POST'])
  def graph_import():
      data = request.json or {}
      project = data.get('project', '')
      if not project:
          return jsonify({"error": "project required"}), 400
      import_data = data.get('data', {})
      for node in import_data.get('nodes', []):
          fp = node.get('file_path', '')
          if not _is_safe_path(fp):
              return jsonify({"error": f"invalid file_path: {fp!r}"}), 400
          if node.get('node_type') not in VALID_NODE_TYPES:
              node['node_type'] = ''  # will be skipped by import_data empty check
      result = graph.import_data(project, import_data)
      return jsonify(result)
  ```
- Edge cases: `nodes` kosong → loop tidak jalan, aman; node_type invalid → di-blank → di-skip oleh `import_data`
- ⚠️ Breaking change: file_path absolut → 400 (intentional, documented di error msg)
- Verify: `curl -s -X POST http://localhost:37777/graph/import -H 'Content-Type: application/json' -d '{"project":"test","data":{"nodes":[{"file_path":"../etc/passwd","name":"x","node_type":"function"}]}}' | python3 -m json.tool`
- Dependencies: Task 1

**Task 3 — Validate edges in graph_import()** `S`
- File: `server/worker.py`
- Reuse: `_is_safe_path()` dari Task 1
- Code sample — tambahkan loop edges setelah loop nodes (sebelum `result = graph.import_data(...)`):
  ```python
  for edge in import_data.get('edges', []):
      src = edge.get('source_file', '')
      if not _is_safe_path(src):
          return jsonify({"error": f"invalid source_file: {src!r}"}), 400
  ```
- Edge cases: `edges` kosong → aman; `target_ref` tidak divalidasi (symbolic name)
- ⚠️ Breaking change: source_file absolut → 400
- Verify: `curl -s -X POST http://localhost:37777/graph/import -H 'Content-Type: application/json' -d '{"project":"test","data":{"edges":[{"source_file":"/abs/path.py","target_ref":"foo"}]}}' | python3 -m json.tool`
- Dependencies: Task 1, Task 2

**Task 4 — Close GitHub issues #4 dan #7** `S`
- File: none (GitHub API)
- Code sample:
  ```bash
  gh issue close 4 --comment "Fixed in commit 0462edc (chromadb ID-set reconcile logic)"
  gh issue close 7 --comment "Fixed in commit 0462edc (async docs refresh via threading.Thread)"
  ```
- Verify: `gh issue list --state closed` → #4 dan #7 muncul sebagai CLOSED
- Dependencies: none
