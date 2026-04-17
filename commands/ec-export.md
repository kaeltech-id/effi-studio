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
Write `.claude/memory-export.json` with this structure:
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
