# Tech Stack

## Type
Claude Code slash command toolkit with persistent memory + docs engine. Zero external services — fully local.

## Languages
- **Markdown** (`.md`) — slash command definitions in `commands/`
- **Bash** (`.sh`) — installer and worker start/stop scripts
- **Python 3.8+** (`.py`) — worker service and hooks

## Python Dependencies
- `flask>=3.0.0` — HTTP worker service (localhost:37777)
- `chromadb>=0.5.0` — vector database for semantic search
- `requests>=2.31.0` — fetching library docs from npm/PyPI

## Storage
- **SQLite** — observations, summaries, docs cache (`~/.efficlaude/efficlaude.db`)
- **ChromaDB** — semantic search index (`~/.efficlaude/chroma/`)

## Distribution
- Install: `curl -fsSL ... | bash` → copies commands, server, hooks globally
- Worker runs as background daemon (launchd on macOS, systemd on Linux)
- Hooks registered in `~/.claude/settings.json`
