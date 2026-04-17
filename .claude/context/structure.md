# Folder Structure

```
EffiClaude/
├── commands/                  ← slash command definitions (Markdown)
│   ├── setup.md
│   ├── feature.md
│   ├── execute.md
│   ├── review.md
│   └── git.md
├── server/                    ← worker service (Python/Flask)
│   ├── worker.py              ← Flask app, all HTTP endpoints
│   ├── memory.py              ← MemoryEngine (SQLite + ChromaDB)
│   ├── docs.py                ← DocsEngine (fetch + cache + search)
│   ├── requirements.txt
│   ├── start.sh
│   └── stop.sh
├── hooks/                     ← Claude Code lifecycle hooks (Python)
│   ├── post_tool_use.py       ← captures Write/Edit/Bash → memory
│   ├── session_stop.py        ← summarizes session on Stop event
│   └── prompt_submit.py       ← injects memory + docs per prompt
├── launchers/                 ← daemon auto-start configs
│   ├── com.efficlaude.worker.plist   ← macOS launchd
│   └── efficlaude-worker.service     ← Linux systemd
├── install.sh                 ← global installer
├── CLAUDE.md                  ← auto-loaded project context
└── README.md
```

## Installed globally at runtime
```
~/.claude/commands/            ← copied from commands/
~/.efficlaude/
├── server/                    ← copied from server/
├── hooks/                     ← copied from hooks/
├── efficlaude.db              ← SQLite database
├── chroma/                    ← ChromaDB vector store
└── worker.pid                 ← running worker PID
```
