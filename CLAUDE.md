# EffiClaude
Stack: Markdown + Bash + Python (Flask, ChromaDB, SQLite) — Claude Code slash command toolkit with persistent memory & docs engine
Config: .claude/project-config.json
Context: .claude/context/

## GIT RULES
- NEVER perform any git operation autonomously
- NEVER commit, push, pull, merge, branch, stash without /ec-git command
- Git ONLY allowed when user explicitly runs /ec-git
- NEVER add Co-Authored-By to commit messages

## WORKFLOW RULES
- After /ec-brainstorm completes → always suggest running /ec-plan
- After /ec-plan completes → always suggest running /ec-refine
- After /ec-refine is clean → always suggest running /ec-execute
- After /ec-execute completes → always suggest running /ec-review
- After /ec-review is clean → always suggest running /ec-git
- Always guide user through the full flow: /ec-brainstorm → /ec-plan → /ec-refine → /ec-execute → /ec-review → /ec-git
