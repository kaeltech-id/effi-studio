# Naming Conventions & Code Rules

## File Naming
- Shell scripts: `kebab-case.sh`
- Python files: `snake_case.py`
- Command files: lowercase single-word (`setup.md`, `feature.md`)
- Config/data files: `kebab-case.json`
- Context files: lowercase single-word (`stack.md`, `structure.md`)

## Python
- Functions & variables: `snake_case`
- Classes: `PascalCase` (e.g., `MemoryEngine`, `DocsEngine`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `LIBRARY_SOURCES`, `WORKER_URL`)
- No unnecessary comments — code should be self-explanatory
- Error handling: silent fail on non-critical paths (hooks must not crash Claude)

## JSON Keys
- All keys: `snake_case` (e.g., `project_name`, `api_base_url`)

## Markdown (command files)
- Top-level: `# Title Case`
- Sections: `## Sentence case`
- Steps numbered, imperative tone
- Every instruction must be actionable and verifiable

## API Design (worker endpoints)
- REST, JSON in/out
- Graceful: return empty array `[]` instead of error when no results
- All endpoints accept `project` param for scoping data

## Git Rules
- NEVER perform git operations autonomously
- Only via explicit `/git` command from user
