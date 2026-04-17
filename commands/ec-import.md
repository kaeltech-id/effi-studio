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
