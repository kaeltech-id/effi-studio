from __future__ import annotations

import json
import os
import re
import sys
import time as _time
import urllib.parse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, request, jsonify, Response
from memory import MemoryEngine
from docs import DocsEngine
from graph import GraphEngine
from logger import get_counts, warn

app = Flask(__name__)

BASE_DIR = os.path.expanduser("~/.efficlaude")
DB_PATH = os.path.join(BASE_DIR, "efficlaude.db")
CHROMA_PATH = os.path.join(BASE_DIR, "chroma")

VALID_NODE_TYPES = {"function", "class", "method", "module", "variable"}


def _is_safe_path(p: str) -> bool:
    if not p or '\x00' in p:
        return False
    try:
        decoded = urllib.parse.unquote(p)
        path = Path(decoded)
        return not path.is_absolute() and '..' not in path.parts
    except Exception:
        return False

os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(CHROMA_PATH, exist_ok=True)

memory = MemoryEngine(DB_PATH, CHROMA_PATH)
docs = DocsEngine(DB_PATH, CHROMA_PATH)
graph = GraphEngine(DB_PATH)
_graph_executor = ThreadPoolExecutor(max_workers=2)
_rate_buckets: dict = defaultdict(list)
_RATE_LIMIT = int(os.getenv('EFFICLAUDE_RATE_LIMIT', '100'))
_RATE_WINDOW = 60.0


def _err(msg: str, code: int = 400) -> tuple:
    return jsonify({"status": "error", "error": msg}), code


def _int_param(name: str, default: int) -> tuple:
    raw = request.args.get(name, '')
    if not raw:
        return default, None
    try:
        return int(raw), None
    except (ValueError, TypeError):
        return None, f"'{name}' must be an integer"


_PROJECT_RE = re.compile(r'^[\w\-. ]{1,100}$')

def _valid_project(p: str) -> bool:
    return bool(p) and bool(_PROJECT_RE.match(p))


@app.before_request
def _rate_limit() -> None:
    if request.path == '/health':
        return
    ip = request.remote_addr or 'unknown'
    now = _time.time()
    bucket = [t for t in _rate_buckets[ip] if now - t < _RATE_WINDOW]
    _rate_buckets[ip] = bucket
    if len(bucket) >= _RATE_LIMIT:
        return jsonify({"status": "error", "error": "rate limit exceeded"}), 429
    _rate_buckets[ip].append(now)


@app.route('/health')
def health() -> Response:
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
        "tree_sitter": graph._ts_available,
        "error_counts": get_counts()
    })


# ── Memory endpoints ──────────────────────────────────────────────────────────

@app.route('/memory/observe', methods=['POST'])
def observe() -> Response:
    data = request.json or {}
    project = data.get('project', '')
    content = data.get('content', '')
    if not _valid_project(project) or not content:
        return _err("project and content required")
    metadata = data.get('metadata', {})
    if not isinstance(metadata, dict):
        return _err("metadata must be a JSON object")
    if len(json.dumps(metadata)) > 4096:
        return _err("metadata exceeds 4KB limit")
    for k, v in metadata.items():
        if not isinstance(k, str):
            return _err("metadata keys must be strings")
        if not isinstance(v, (str, int, float, bool, type(None))):
            return _err("metadata values must be primitive types")
    try:
        memory.save_observation(
            project=project,
            obs_type=data.get('type', 'general'),
            content=content,
            metadata=metadata
        )
    except Exception as e:
        warn("worker", f"observe failed: {e}")
        return _err("internal error", 500)
    return jsonify({"status": "saved"})


@app.route('/memory/search')
def memory_search() -> Response:
    q = request.args.get('q', '')
    project = request.args.get('project', '')
    limit, _e = _int_param('limit', 5)
    if _e:
        return _err(_e)
    if project and not _valid_project(project):
        return _err("invalid project name")
    if not q or not project:
        return jsonify([])
    return jsonify(memory.search(project, q, limit))


@app.route('/memory/context')
def memory_context() -> Response:
    project = request.args.get('project', '')
    limit, _e = _int_param('limit', 20)
    if _e:
        return _err(_e)
    if project and not _valid_project(project):
        return _err("invalid project name")
    if not project:
        return jsonify([])
    return jsonify(memory.get_recent(project, limit))


@app.route('/memory/summarize', methods=['POST'])
def summarize() -> Response:
    data = request.json or {}
    project = data.get('project', '')
    if not _valid_project(project):
        return _err("project required")
    summary = memory.summarize_session(project, data.get('session_id', ''))
    return jsonify({"summary": summary})


@app.route('/memory/export')
def memory_export() -> Response:
    project = request.args.get('project', '')
    if not _valid_project(project):
        return _err("project required")
    return jsonify(memory.export(project))


@app.route('/memory/import', methods=['POST'])
def memory_import() -> Response:
    data = request.json or {}
    project = data.get('project', '')
    if not _valid_project(project):
        return _err("project required")
    result = memory.import_data(project, data.get('data', {}))
    return jsonify(result)


# ── Docs endpoints ────────────────────────────────────────────────────────────

@app.route('/docs/register', methods=['POST'])
def docs_register() -> Response:
    data = request.json or {}
    name = data.get('name', '')
    if not name:
        return _err("name required")
    docs.register_library(
        name=name,
        project=data.get('project', ''),
        source_type=data.get('source_type')
    )
    return jsonify({"status": "registered", "library": name})


@app.route('/docs/search')
def docs_search() -> Response:
    q = request.args.get('q', '')
    project = request.args.get('project', '')
    limit, _e = _int_param('limit', 5)
    if _e:
        return _err(_e)
    if project and not _valid_project(project):
        return _err("invalid project name")
    if not q:
        return jsonify([])
    return jsonify(docs.search(project, q, limit))


@app.route('/docs/refresh', methods=['POST'])
def docs_refresh() -> Response:
    data = request.json or {}
    name = data.get('name', '')
    if not name:
        return _err("name required")
    count = docs.fetch_and_cache(name)
    return jsonify({"library": name, "chunks_cached": count})


@app.route('/docs/list')
def docs_list() -> Response:
    project = request.args.get('project', '')
    return jsonify(docs.list_libraries(project))


# ── Graph endpoints ───────────────────────────────────────────────────────────

@app.route('/graph/index', methods=['POST'])
def graph_index() -> Response:
    data = request.json or {}
    project = data.get('project', '')
    root_dir = data.get('root_dir', '')
    file_path = data.get('file_path', '')

    if not _valid_project(project):
        return _err("project required")

    if file_path:
        try:
            future = _graph_executor.submit(graph.index_file, project, file_path, root_dir or None)
            future.result(timeout=10)
            return jsonify({"status": "indexed", "file": file_path})
        except FuturesTimeout:
            warn("worker", f"tree-sitter timeout ({file_path})")
            return jsonify({"status": "error", "error": "indexing timed out", "file": file_path}), 504
        except Exception as e:
            warn("worker", f"graph index failed ({file_path}): {e}")
            return jsonify({"status": "error", "error": "indexing failed", "file": file_path}), 500

    if root_dir:
        count = graph.index_project(project, root_dir)
        return jsonify({"status": "indexed", "files": count, "root": root_dir})

    return _err("file_path or root_dir required")


@app.route('/graph/blast-radius')
def graph_blast_radius() -> Response:
    project = request.args.get('project', '')
    files = request.args.getlist('files')
    depth, _e = _int_param('depth', 2)
    if _e:
        return _err(_e)
    if project and not _valid_project(project):
        return _err("invalid project name")

    if not project or not files:
        return jsonify({"changed": [], "affected": [], "total_files": 0})

    result = graph.get_blast_radius(project, files, depth)
    return jsonify(result)


@app.route('/graph/summary')
def graph_summary() -> Response:
    project = request.args.get('project', '')
    if not _valid_project(project):
        return _err("project required")
    return jsonify(graph.get_summary(project))


@app.route('/graph/export')
def graph_export() -> Response:
    project = request.args.get('project', '')
    if not _valid_project(project):
        return _err("project required")
    return jsonify(graph.export(project))


@app.route('/graph/import', methods=['POST'])
def graph_import() -> Response:
    data = request.json or {}
    project = data.get('project', '')
    if not _valid_project(project):
        return _err("project required")
    import_data = data.get('data', {})
    for node in import_data.get('nodes', []):
        fp = node.get('file_path', '')
        if not _is_safe_path(fp):
            return _err(f"invalid file_path: {fp!r}")
        if node.get('node_type') not in VALID_NODE_TYPES:
            return _err(f"invalid node_type: {node.get('node_type')!r}")
    for edge in import_data.get('edges', []):
        src = edge.get('source_file', '')
        if not _is_safe_path(src):
            return _err(f"invalid source_file: {src!r}")
    result = graph.import_data(project, import_data)
    return jsonify(result)


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('EFFICLAUDE_PORT', 37777)), debug=False, threaded=True)
