# EffiClaude Worker API

Base URL: `http://localhost:37777` (configurable via `EFFICLAUDE_PORT` env var)

## Global Rules

**Error response shape** (all endpoints):
```json
{"status": "error", "error": "<message>"}
```

**Rate limiting:** All endpoints except `/health` are limited to 100 requests/minute per IP. Returns HTTP 429 on breach. Configurable via `EFFICLAUDE_RATE_LIMIT` env var.

**Project name format:** Must match `^[\w\-. ]{1,100}$` (alphanumeric, hyphens, dots, spaces, max 100 chars).

---

## GET /health

Returns server status, version, tree-sitter availability, and accumulated error counts. Not subject to rate limiting.

**Parameters:** None

**Response:**
```json
{
  "status": "ok",
  "version": "1.2.3",
  "tree_sitter": true,
  "error_counts": {"warn": 0, "error": 0}
}
```

**Errors:** None (always returns 200 under normal conditions)

---

## POST /memory/observe

Stores a new observation (fact, decision, note) for a project into the memory engine.

**Request body:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | yes | Project name. Must match `^[\w\-. ]{1,100}$`. |
| content | string | yes | The observation text to store. |
| type | string | no | Observation type tag (e.g. `general`, `decision`, `bug`). Defaults to `general`. |
| metadata | object | no | Arbitrary key-value pairs attached to the observation. Keys must be strings; values must be primitive types (`string`, `number`, `boolean`, or `null`). Total serialized size must be under 4 KB. Defaults to `{}`. |

**Response:**
```json
{"status": "saved"}
```

**Errors:**
- `400` — `project` missing/invalid, `content` empty, `metadata` not a JSON object, metadata key is not a string, metadata value is not a primitive type, or metadata exceeds 4 KB
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal storage error

---

## GET /memory/search

Performs a semantic similarity search over observations stored for a project.

**Parameters (query string):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| q | string | yes | Search query text. Returns empty array if omitted. |
| project | string | yes | Project name. Returns empty array if omitted. |
| limit | integer | no | Maximum number of results to return. Defaults to `5`. |

**Response:**
```json
[
  {
    "id": "abc123",
    "content": "Observation text",
    "type": "general",
    "metadata": {},
    "score": 0.92,
    "created_at": "2026-04-18T10:00:00Z"
  }
]
```

Returns an empty array `[]` if `q` or `project` is not provided.

**Errors:**
- `400` — `limit` is not an integer, or `project` is provided but invalid
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## GET /memory/context

Returns the most recent observations for a project, ordered by recency (newest first).

**Parameters (query string):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | yes | Project name. Returns empty array if omitted. |
| limit | integer | no | Maximum number of observations to return. Defaults to `20`. |

**Response:**
```json
[
  {
    "id": "abc123",
    "content": "Observation text",
    "type": "general",
    "metadata": {},
    "created_at": "2026-04-18T10:00:00Z"
  }
]
```

Returns an empty array `[]` if `project` is not provided.

**Errors:**
- `400` — `limit` is not an integer, or `project` is provided but invalid
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## POST /memory/summarize

Generates a textual summary of memory observations for a project, optionally scoped to a session.

**Request body:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | yes | Project name. Must match `^[\w\-. ]{1,100}$`. |
| session_id | string | no | If provided, limits summarization to observations belonging to that session. |

**Response:**
```json
{"summary": "This project focuses on..."}
```

**Errors:**
- `400` — `project` missing or invalid
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## GET /memory/export

Exports all stored memory observations for a project as a JSON payload suitable for backup or sharing via `/memory/import`.

**Parameters (query string):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | yes | Project name. Must match `^[\w\-. ]{1,100}$`. |

**Response:**
```json
{
  "project": "my-project",
  "observations": [
    {
      "id": "abc123",
      "content": "Observation text",
      "type": "general",
      "metadata": {},
      "created_at": "2026-04-18T10:00:00Z"
    }
  ]
}
```

**Errors:**
- `400` — `project` missing or invalid
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## POST /memory/import

Imports previously exported memory observations into a project. Existing observations are preserved; duplicates are handled by the engine.

**Request body:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | yes | Project name. Must match `^[\w\-. ]{1,100}$`. |
| data | object | yes | Export payload produced by `GET /memory/export`. |

**Response:**
```json
{"status": "ok", "imported": 12}
```

**Errors:**
- `400` — `project` missing or invalid
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## POST /docs/register

Registers a documentation library (e.g. an external package's docs URL or local source) so it can be fetched and searched.

**Request body:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | yes | Unique name for the library (e.g. `flask`, `numpy`). |
| project | string | no | Associate the library with a specific project. |
| source_type | string | no | Source type hint for the fetch strategy (e.g. `url`, `local`). |

**Response:**
```json
{"status": "registered", "library": "flask"}
```

**Errors:**
- `400` — `name` missing or empty
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## GET /docs/search

Performs a semantic search over cached documentation chunks for a given query.

**Parameters (query string):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| q | string | yes | Search query text. Returns empty array if omitted. |
| project | string | no | Restrict search to libraries registered under this project. |
| limit | integer | no | Maximum number of chunks to return. Defaults to `5`. |

**Response:**
```json
[
  {
    "library": "flask",
    "chunk": "Flask is a micro web framework...",
    "score": 0.88,
    "url": "https://flask.palletsprojects.com/..."
  }
]
```

Returns an empty array `[]` if `q` is not provided.

**Errors:**
- `400` — `limit` is not an integer, or `project` is provided but invalid
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## POST /docs/refresh

Fetches and re-caches documentation content for a previously registered library. Use this to update stale cached chunks.

**Request body:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | yes | Name of the registered library to refresh. |

**Response:**
```json
{"library": "flask", "chunks_cached": 47}
```

**Errors:**
- `400` — `name` missing or empty
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — fetch or caching error

---

## GET /docs/list

Lists all registered documentation libraries, optionally filtered by project.

**Parameters (query string):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | no | If provided, returns only libraries associated with this project. If omitted, returns all libraries. |

**Response:**
```json
[
  {
    "name": "flask",
    "project": "my-project",
    "source_type": "url",
    "registered_at": "2026-04-18T10:00:00Z"
  }
]
```

**Errors:**
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## POST /graph/index

Indexes source code into the dependency graph. Accepts either a single file or an entire directory tree. When `file_path` is provided, parsing is executed with a 10-second timeout via a thread pool to guard against tree-sitter hangs.

**Request body:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | yes | Project name. Must match `^[\w\-. ]{1,100}$`. |
| file_path | string | no | Relative path to a single source file to index. If provided, `root_dir` is used as the root context but `file_path` takes precedence. |
| root_dir | string | no | Absolute or relative path to the project root directory. If `file_path` is absent, the entire directory tree under `root_dir` is indexed. One of `file_path` or `root_dir` must be supplied. |

**Response (single file):**
```json
{"status": "indexed", "file": "src/main.py"}
```

**Response (directory):**
```json
{"status": "indexed", "files": 34, "root": "/path/to/project"}
```

**Errors:**
- `400` — `project` missing/invalid, or neither `file_path` nor `root_dir` provided
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — indexing failed (parse or storage error)
- `504` — tree-sitter parse timed out (>10 s) for the given `file_path`

---

## GET /graph/blast-radius

Computes the set of files potentially affected by changes to a given list of files by traversing the dependency graph up to a configurable depth.

**Parameters (query string):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | yes | Project name. Must match `^[\w\-. ]{1,100}$`. |
| files | string (repeatable) | yes | One or more file paths to treat as changed. Pass multiple values as repeated `?files=a&files=b`. |
| depth | integer | no | Maximum traversal depth in the dependency graph. Defaults to `2`. |

**Response:**
```json
{
  "changed": ["src/main.py"],
  "affected": ["src/utils.py", "tests/test_main.py"],
  "total_files": 3
}
```

Returns `{"changed": [], "affected": [], "total_files": 0}` if `project` or `files` is not provided.

**Errors:**
- `400` — `depth` is not an integer, or `project` is provided but invalid
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## GET /graph/summary

Returns aggregate statistics about the dependency graph for a project (node counts, edge counts, top-imported modules, etc.).

**Parameters (query string):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | yes | Project name. Must match `^[\w\-. ]{1,100}$`. |

**Response:**
```json
{
  "project": "my-project",
  "nodes": 120,
  "edges": 340,
  "files": 30,
  "top_imports": ["os", "flask", "json"]
}
```

**Errors:**
- `400` — `project` missing or invalid
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## GET /graph/export

Exports the full dependency graph for a project (all nodes and edges) as a JSON payload suitable for backup or sharing via `/graph/import`.

**Parameters (query string):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | yes | Project name. Must match `^[\w\-. ]{1,100}$`. |

**Response:**
```json
{
  "project": "my-project",
  "nodes": [
    {
      "id": "node-1",
      "name": "my_function",
      "node_type": "function",
      "file_path": "src/utils.py",
      "line": 42
    }
  ],
  "edges": [
    {
      "source": "node-1",
      "target": "node-2",
      "source_file": "src/main.py"
    }
  ]
}
```

**Errors:**
- `400` — `project` missing or invalid
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal error

---

## POST /graph/import

Imports a previously exported dependency graph into a project. All node `file_path` and edge `source_file` values are validated for path traversal; `node_type` is validated against the allowed set.

**Request body:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | yes | Project name. Must match `^[\w\-. ]{1,100}$`. |
| data | object | yes | Export payload produced by `GET /graph/export`, containing `nodes` and `edges` arrays. |

**Node object fields:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| file_path | string | yes | Relative path to the source file. Must not be absolute and must not contain `..` segments. |
| node_type | string | yes | Symbol type. Must be one of: `function`, `class`, `method`, `module`, `variable`. |
| name | string | no | Symbol name. |
| line | integer | no | Line number in the source file. |

**Edge object fields:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| source_file | string | yes | Relative path to the file that declares the dependency. Must not be absolute and must not contain `..` segments. |
| source | string | no | ID of the source node. |
| target | string | no | ID of the target node. |

**Response:**
```json
{"status": "ok", "imported_nodes": 120, "imported_edges": 340}
```

**Errors:**
- `400` — `project` missing/invalid; any node has an invalid `file_path` (absolute path, `..` traversal, null byte, or empty); any node has a `node_type` not in `{function, class, method, module, variable}`; any edge has an invalid `source_file`
- `429` — rate limit exceeded (100 req/min per IP)
- `500` — internal storage error
