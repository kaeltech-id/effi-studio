import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, request, jsonify
from memory import MemoryEngine
from docs import DocsEngine
from graph import GraphEngine
from logger import get_counts

app = Flask(__name__)

BASE_DIR = os.path.expanduser("~/.efficlaude")
DB_PATH = os.path.join(BASE_DIR, "efficlaude.db")
CHROMA_PATH = os.path.join(BASE_DIR, "chroma")

os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(CHROMA_PATH, exist_ok=True)

memory = MemoryEngine(DB_PATH, CHROMA_PATH)
docs = DocsEngine(DB_PATH, CHROMA_PATH)
graph = GraphEngine(DB_PATH)


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
        "tree_sitter": graph._ts_available,
        "error_counts": get_counts()
    })


# ── Memory endpoints ──────────────────────────────────────────────────────────

@app.route('/memory/observe', methods=['POST'])
def observe():
    data = request.json or {}
    project = data.get('project', '')
    content = data.get('content', '')
    if not project or not content:
        return jsonify({"error": "project and content required"}), 400
    memory.save_observation(
        project=project,
        obs_type=data.get('type', 'general'),
        content=content,
        metadata=data.get('metadata', {})
    )
    return jsonify({"status": "saved"})


@app.route('/memory/search')
def memory_search():
    q = request.args.get('q', '')
    project = request.args.get('project', '')
    limit = int(request.args.get('limit', 5))
    if not q or not project:
        return jsonify([])
    return jsonify(memory.search(project, q, limit))


@app.route('/memory/context')
def memory_context():
    project = request.args.get('project', '')
    limit = int(request.args.get('limit', 20))
    if not project:
        return jsonify([])
    return jsonify(memory.get_recent(project, limit))


@app.route('/memory/summarize', methods=['POST'])
def summarize():
    data = request.json or {}
    project = data.get('project', '')
    if not project:
        return jsonify({"error": "project required"}), 400
    summary = memory.summarize_session(project, data.get('session_id', ''))
    return jsonify({"summary": summary})


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


# ── Docs endpoints ────────────────────────────────────────────────────────────

@app.route('/docs/register', methods=['POST'])
def docs_register():
    data = request.json or {}
    name = data.get('name', '')
    if not name:
        return jsonify({"error": "name required"}), 400
    docs.register_library(
        name=name,
        project=data.get('project', ''),
        source_type=data.get('source_type')
    )
    return jsonify({"status": "registered", "library": name})


@app.route('/docs/search')
def docs_search():
    q = request.args.get('q', '')
    project = request.args.get('project', '')
    limit = int(request.args.get('limit', 5))
    if not q:
        return jsonify([])
    return jsonify(docs.search(project, q, limit))


@app.route('/docs/refresh', methods=['POST'])
def docs_refresh():
    data = request.json or {}
    name = data.get('name', '')
    if not name:
        return jsonify({"error": "name required"}), 400
    count = docs.fetch_and_cache(name)
    return jsonify({"library": name, "chunks_cached": count})


@app.route('/docs/list')
def docs_list():
    project = request.args.get('project', '')
    return jsonify(docs.list_libraries(project))


# ── Graph endpoints ───────────────────────────────────────────────────────────

@app.route('/graph/index', methods=['POST'])
def graph_index():
    data = request.json or {}
    project = data.get('project', '')
    root_dir = data.get('root_dir', '')
    file_path = data.get('file_path', '')

    if not project:
        return jsonify({"error": "project required"}), 400

    if file_path:
        try:
            graph.index_file(project, file_path, root_dir or None)
            return jsonify({"status": "indexed", "file": file_path})
        except Exception:
            return jsonify({"status": "error", "file": file_path, "reason": "indexing failed"}), 500

    if root_dir:
        count = graph.index_project(project, root_dir)
        return jsonify({"status": "indexed", "files": count, "root": root_dir})

    return jsonify({"error": "file_path or root_dir required"}), 400


@app.route('/graph/blast-radius')
def graph_blast_radius():
    project = request.args.get('project', '')
    files = request.args.getlist('files')
    depth = int(request.args.get('depth', 2))

    if not project or not files:
        return jsonify({"changed": [], "affected": [], "total_files": 0})

    result = graph.get_blast_radius(project, files, depth)
    return jsonify(result)


@app.route('/graph/summary')
def graph_summary():
    project = request.args.get('project', '')
    if not project:
        return jsonify({"error": "project required"}), 400
    return jsonify(graph.get_summary(project))


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


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=37777, debug=False, threaded=True)
