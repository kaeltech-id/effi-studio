#!/usr/bin/env python3
"""Injects relevant memory + docs context before each user prompt."""

import sys
import json
import os
import urllib.request
import urllib.parse

WORKER_URL = "http://localhost:37777"
MAX_MEMORY_ITEMS = 5
MAX_DOCS_ITEMS = 3


def get_project_name():
    try:
        config_path = os.path.join(os.getcwd(), ".claude", "project-config.json")
        with open(config_path) as f:
            return json.load(f).get("project_name", "unknown")
    except Exception:
        return os.path.basename(os.getcwd())


def fetch(url, timeout=2):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def worker_running():
    result = fetch(f"{WORKER_URL}/health", timeout=1)
    return result is not None


def get_memory_context(project, query):
    encoded_q = urllib.parse.quote(query[:200])
    encoded_p = urllib.parse.quote(project)
    url = f"{WORKER_URL}/memory/search?q={encoded_q}&project={encoded_p}&limit={MAX_MEMORY_ITEMS}"
    return fetch(url) or []


def get_docs_context(project, query):
    encoded_q = urllib.parse.quote(query[:200])
    encoded_p = urllib.parse.quote(project)
    url = f"{WORKER_URL}/docs/search?q={encoded_q}&project={encoded_p}&limit={MAX_DOCS_ITEMS}"
    return fetch(url) or []


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
    except Exception:
        sys.exit(0)

    prompt = data.get("prompt", "")
    if not prompt or not worker_running():
        sys.exit(0)

    project = get_project_name()

    memory_items = get_memory_context(project, prompt)
    docs_items = get_docs_context(project, prompt)

    if not memory_items and not docs_items:
        sys.exit(0)

    parts = []

    if memory_items:
        mem_lines = [f"- [{m['metadata'].get('type', 'obs')}] {m['content']}" for m in memory_items]
        parts.append("**Relevant project memory:**\n" + "\n".join(mem_lines))

    if docs_items:
        doc_lines = [f"- [{d['library']} › {d['heading']}] {d['content'][:120]}" for d in docs_items]
        parts.append("**Relevant docs:**\n" + "\n".join(doc_lines))

    context_block = "\n\n".join(parts)
    print(f"<efficlaude-context>\n{context_block}\n</efficlaude-context>")


if __name__ == "__main__":
    main()
