import sqlite3
import os
import re
import json
from datetime import datetime
from pathlib import Path
from logger import warn
import threading

_lock = threading.Lock()

EXTENSION_TO_LANG = {
    'py': 'python',
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'tsx',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'java': 'java',
    'cs': 'c_sharp',
    'cpp': 'cpp',
    'c': 'c',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
}

IGNORE_DIRS = {
    '.git', 'node_modules', '__pycache__', '.venv', 'venv', 'env',
    'dist', 'build', '.next', 'target', '.cache', 'coverage',
    '.pytest_cache', '.mypy_cache',
}

MAX_FILE_SIZE = 512 * 1024  # 512KB


class GraphEngine:
    def __init__(self, db_path):
        self.db_path = db_path
        self._parsers = {}
        self._ts_available = self._init_tree_sitter()
        self._init_db()

    def _init_tree_sitter(self):
        try:
            from tree_sitter_languages import get_parser
            self._ts_get_parser = get_parser
            return True
        except ImportError:
            return False

    def _get_parser(self, lang):
        if lang not in self._parsers:
            try:
                self._parsers[lang] = self._ts_get_parser(lang)
            except Exception:
                self._parsers[lang] = None
        return self._parsers.get(lang)

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute('''
                CREATE TABLE IF NOT EXISTS graph_nodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    name TEXT NOT NULL,
                    node_type TEXT NOT NULL,
                    start_line INTEGER DEFAULT 0,
                    end_line INTEGER DEFAULT 0,
                    language TEXT,
                    updated_at TEXT NOT NULL
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS graph_edges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project TEXT NOT NULL,
                    source_file TEXT NOT NULL,
                    target_ref TEXT NOT NULL,
                    edge_type TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_nodes_pf ON graph_nodes(project, file_path)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(project, source_file)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(project, target_ref)')
            conn.commit()

    # ── Indexing ──────────────────────────────────────────────────────────────

    def index_project(self, project, root_dir):
        root = Path(root_dir)
        indexed = 0
        for path in root.rglob('*'):
            if any(part in IGNORE_DIRS for part in path.parts):
                continue
            if path.is_file() and path.suffix.lstrip('.') in EXTENSION_TO_LANG:
                try:
                    self.index_file(project, str(path), root_dir)
                    indexed += 1
                except Exception as e:
                    warn("graph", f"index_file failed ({path}): {e}")
                    continue
        return indexed

    def index_file(self, project, file_path, root_dir=None):
        if root_dir and not Path(file_path).is_absolute():
            abs_path = Path(root_dir) / file_path
        else:
            abs_path = Path(file_path)

        if not abs_path.exists() or abs_path.stat().st_size > MAX_FILE_SIZE:
            return

        ext = abs_path.suffix.lstrip('.')
        lang = EXTENSION_TO_LANG.get(ext)
        if not lang:
            return

        try:
            source = abs_path.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            warn("graph", f"read failed ({abs_path}): {e}")
            return

        try:
            rel_path = str(abs_path.relative_to(root_dir)) if root_dir else file_path
        except ValueError:
            rel_path = file_path
        now = datetime.utcnow().isoformat()

        nodes = self._extract_nodes(source, lang, str(abs_path))
        imports = self._extract_imports(source, lang, str(abs_path), root_dir)

        with _lock:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('DELETE FROM graph_nodes WHERE project=? AND file_path=?', (project, rel_path))
                conn.execute('DELETE FROM graph_edges WHERE project=? AND source_file=?', (project, rel_path))

                for node in nodes:
                    conn.execute(
                        'INSERT INTO graph_nodes (project, file_path, name, node_type, start_line, end_line, language, updated_at) VALUES (?,?,?,?,?,?,?,?)',
                        (project, rel_path, node['name'], node['type'], node['start'], node['end'], lang, now)
                    )

                for imp in imports:
                    conn.execute(
                        'INSERT INTO graph_edges (project, source_file, target_ref, edge_type, updated_at) VALUES (?,?,?,?,?)',
                        (project, rel_path, imp, 'imports', now)
                    )

                conn.commit()

    # ── Extraction ────────────────────────────────────────────────────────────

    def _extract_nodes(self, source, lang, file_path):
        if self._ts_available:
            return self._extract_nodes_ts(source, lang)
        return self._extract_nodes_regex(source, lang)

    def _extract_nodes_ts(self, source, lang):
        parser = self._get_parser(lang)
        if not parser:
            return self._extract_nodes_regex(source, lang)

        try:
            tree = parser.parse(bytes(source, 'utf-8'))
            nodes = []
            self._walk_tree(tree.root_node, source, lang, nodes)
            return nodes
        except Exception as e:
            warn("graph", f"tree-sitter parse error: {e}")
            return self._extract_nodes_regex(source, lang)

    def _walk_tree(self, node, source, lang, results):
        FUNCTION_TYPES = {
            'function_definition', 'function_declaration', 'method_definition',
            'arrow_function', 'function_item',
        }
        CLASS_TYPES = {
            'class_definition', 'class_declaration', 'struct_item', 'impl_item',
        }

        if node.type in FUNCTION_TYPES:
            name = self._get_node_name(node, source)
            if name:
                results.append({
                    'name': name, 'type': 'function',
                    'start': node.start_point[0], 'end': node.end_point[0]
                })
        elif node.type in CLASS_TYPES:
            name = self._get_node_name(node, source)
            if name:
                results.append({
                    'name': name, 'type': 'class',
                    'start': node.start_point[0], 'end': node.end_point[0]
                })

        for child in node.children:
            self._walk_tree(child, source, lang, results)

    def _get_node_name(self, node, source):
        for child in node.children:
            if child.type in ('identifier', 'type_identifier', 'property_identifier'):
                return source[child.start_byte:child.end_byte]
        return None

    def _extract_nodes_regex(self, source, lang):
        nodes = []
        patterns = {
            'python': [
                (r'^(?:async\s+)?def\s+(\w+)', 'function'),
                (r'^class\s+(\w+)', 'class'),
            ],
            'javascript': [
                (r'(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\()', 'function'),
                (r'class\s+(\w+)', 'class'),
            ],
            'typescript': [
                (r'(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\()', 'function'),
                (r'(?:class|interface)\s+(\w+)', 'class'),
            ],
            'go': [
                (r'^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)', 'function'),
                (r'^type\s+(\w+)\s+struct', 'class'),
            ],
            'rust': [
                (r'^(?:pub\s+)?fn\s+(\w+)', 'function'),
                (r'^(?:pub\s+)?struct\s+(\w+)', 'class'),
            ],
        }
        for i, line in enumerate(source.splitlines()):
            for pattern, node_type in patterns.get(lang, []):
                m = re.search(pattern, line)
                if m:
                    name = next((g for g in m.groups() if g), None)
                    if name:
                        nodes.append({'name': name, 'type': node_type, 'start': i, 'end': i})
        return nodes

    def _extract_imports(self, source, lang, file_path, root_dir=None):
        imports = []
        patterns = {
            'python': [
                r'^\s*from\s+([\w.]+)\s+import',
                r'^\s*import\s+([\w.]+)',
            ],
            'javascript': [
                r'''import\s+.*?from\s+['"]([^'"]+)['"]''',
                r'''require\s*\(\s*['"]([^'"]+)['"]\s*\)''',
                r'''import\s*\(\s*['"]([^'"]+)['"]\s*\)''',
                r'''export\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]''',
            ],
            'typescript': [
                r'''import\s+.*?from\s+['"]([^'"]+)['"]''',
                r'''require\s*\(\s*['"]([^'"]+)['"]\s*\)''',
                r'''import\s*\(\s*['"]([^'"]+)['"]\s*\)''',
                r'''export\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]''',
            ],
            'go': [
                r'''"([\w./]+)"''',
            ],
            'rust': [
                r'use\s+([\w:]+)',
                r'mod\s+(\w+)',
            ],
        }
        for pattern in patterns.get(lang, []):
            for m in re.finditer(pattern, source, re.MULTILINE):
                ref = m.group(1)
                resolved = self._resolve_import(ref, lang, file_path, root_dir)
                imports.append(resolved or ref)
        if lang in ('javascript', 'typescript'):
            for m in re.finditer(r'import\s*\(\s*([^\'"`\)][^\)]*)\s*\)', source):
                imports.append('__dynamic__')
        return list(set(imports))

    def _resolve_import(self, ref, lang, source_file, root_dir):
        if not root_dir:
            return None
        source_dir = os.path.dirname(source_file)

        if lang in ('javascript', 'typescript') and ref.startswith('.'):
            for ext in ('ts', 'tsx', 'js', 'jsx'):
                candidate = os.path.normpath(os.path.join(source_dir, f"{ref}.{ext}"))
                if os.path.exists(candidate):
                    try:
                        return str(Path(candidate).relative_to(root_dir))
                    except ValueError:
                        pass
            for ext in ('ts', 'tsx', 'js', 'jsx'):
                candidate = os.path.normpath(os.path.join(source_dir, ref, f"index.{ext}"))
                if os.path.exists(candidate):
                    try:
                        return str(Path(candidate).relative_to(root_dir))
                    except ValueError:
                        pass

        if lang == 'python' and ref.startswith('.'):
            rel = ref.lstrip('.')
            candidate = os.path.normpath(os.path.join(source_dir, rel.replace('.', '/') + '.py'))
            if os.path.exists(candidate):
                try:
                    return str(Path(candidate).relative_to(root_dir))
                except ValueError:
                    pass

        return None

    # ── Blast Radius ──────────────────────────────────────────────────────────

    def get_blast_radius(self, project, changed_files, depth=2):
        """Return all files affected by changes to changed_files (BFS, up to depth)."""
        visited = set(changed_files)
        frontier = set(changed_files)

        for _ in range(depth):
            if not frontier:
                break
            next_frontier = set()
            with sqlite3.connect(self.db_path) as conn:
                for target in frontier:
                    # Match by full path, stem only, or stem without extension
                    stem = Path(target).stem
                    variants = list({target, stem, str(Path(target).with_suffix(''))})
                    placeholders = ','.join('?' * len(variants))
                    rows = conn.execute(
                        f'SELECT DISTINCT source_file FROM graph_edges WHERE project=? AND target_ref IN ({placeholders})',
                        [project] + variants
                    ).fetchall()
                    for (src,) in rows:
                        if src not in visited:
                            visited.add(src)
                            next_frontier.add(src)
            frontier = next_frontier

        direct = visited - set(changed_files)
        affected = sorted(direct)
        has_dynamic = '__dynamic__' in affected
        affected = [f for f in affected if f != '__dynamic__']
        return {
            'changed': list(changed_files),
            'affected': affected,
            'total_files': len(visited),
            'has_dynamic_imports': has_dynamic,
        }

    def get_summary(self, project):
        with sqlite3.connect(self.db_path) as conn:
            node_count = conn.execute(
                'SELECT COUNT(*) FROM graph_nodes WHERE project=?', (project,)
            ).fetchone()[0]
            edge_count = conn.execute(
                'SELECT COUNT(*) FROM graph_edges WHERE project=?', (project,)
            ).fetchone()[0]
            file_count = conn.execute(
                'SELECT COUNT(DISTINCT file_path) FROM graph_nodes WHERE project=?', (project,)
            ).fetchone()[0]
            languages = conn.execute(
                'SELECT language, COUNT(*) as cnt FROM graph_nodes WHERE project=? GROUP BY language ORDER BY cnt DESC',
                (project,)
            ).fetchall()
        return {
            'files': file_count,
            'nodes': node_count,
            'edges': edge_count,
            'languages': [{'lang': r[0], 'nodes': r[1]} for r in languages],
        }

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
        imported_nodes = 0
        imported_edges = 0
        with sqlite3.connect(self.db_path) as conn:
            for node in nodes:
                try:
                    fp = node.get('file_path', '')
                    name = node.get('name', '')
                    node_type = node.get('node_type', '')
                    if not fp or not name or not node_type:
                        continue
                    exists = conn.execute(
                        'SELECT id FROM graph_nodes WHERE project=? AND file_path=? AND name=? AND node_type=?',
                        (project, fp, name, node_type)
                    ).fetchone()
                    if not exists:
                        conn.execute(
                            'INSERT INTO graph_nodes (project, file_path, name, node_type, start_line, end_line, language, updated_at) VALUES (?,?,?,?,?,?,?,?)',
                            (project, fp, name, node_type,
                             node.get('start_line', 0), node.get('end_line', 0), node.get('language', ''), now)
                        )
                        imported_nodes += 1
                except Exception:
                    pass
            for edge in edges:
                try:
                    source = edge.get('source_file', '')
                    target = edge.get('target_ref', '')
                    if not source or not target:
                        continue
                    edge_type = edge.get('edge_type', 'imports')
                    exists = conn.execute(
                        'SELECT id FROM graph_edges WHERE project=? AND source_file=? AND target_ref=? AND edge_type=?',
                        (project, source, target, edge_type)
                    ).fetchone()
                    if not exists:
                        conn.execute(
                            'INSERT INTO graph_edges (project, source_file, target_ref, edge_type, updated_at) VALUES (?,?,?,?,?)',
                            (project, source, target, edge_type, now)
                        )
                        imported_edges += 1
                except Exception:
                    pass
            conn.commit()
        return {'nodes_imported': imported_nodes, 'edges_imported': imported_edges}
