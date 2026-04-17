# EffiClaude
Stack: Markdown + Bash + Python (Flask, ChromaDB, SQLite) — Claude Code slash command toolkit with persistent memory & docs engine
Config: .claude/project-config.json
Context: .claude/context/

## GIT RULES
- NEVER perform any git operation autonomously
- NEVER commit, push, pull, merge, branch, stash without /git command
- Git ONLY allowed when user explicitly runs /git
- NEVER add Co-Authored-By to commit messages

## WORKFLOW RULES
- After /brainstorm completes → always suggest running /feature
- After /feature plan approved → always suggest running /execute
- After /execute completes → always suggest running /review
- After /review is clean → always suggest running /git
- Always guide user through the full flow: /brainstorm → /feature → /execute → /review → /git
