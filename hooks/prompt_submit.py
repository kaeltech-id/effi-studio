#!/usr/bin/env python3
"""Injects relevant memory + docs context before each user prompt."""

import sys
import json
import os
import re
import subprocess
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from datetime import datetime


def _warn(tag: str, msg: str) -> None:
    try:
        log = Path.home() / ".efficlaude" / "efficlaude.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        line = f"[{datetime.utcnow().isoformat(timespec='seconds')}] [{tag}] {msg}\n"
        lines = log.read_text().splitlines(keepends=True) if log.exists() else []
        if len(lines) >= 1000:
            lines = lines[-999:]
        log.write_text("".join(lines) + line)
        if os.getenv("EFFICLAUDE_DEBUG"):
            print(line, end="", file=sys.stderr)
    except Exception:
        pass


WORKER_URL = f"http://localhost:{os.environ.get('EFFICLAUDE_PORT', '37777')}"
MAX_MEMORY_ITEMS = 5
MAX_DOCS_ITEMS = 3
RELEVANCE_MARGIN = float(os.environ.get("EFFICLAUDE_RELEVANCE_MARGIN", "0.15"))
RELEVANCE_CEILING = float(os.environ.get("EFFICLAUDE_RELEVANCE_CEILING", "0.9"))
MIN_DOCS_CONTENT_CHARS = 80
_DOCS_STOP_HEADINGS = {"donate", "contributing", "license", "credits", "changelog",
                       "sponsors", "code of conduct"}
START_SH = os.path.expanduser("~/.efficlaude/server/start.sh")
WORKER_RESTART_WAIT_SECS = 5
VERSION_FILE = os.path.expanduser("~/.efficlaude/VERSION")
UPDATE_CHECK_FILE = os.path.expanduser("~/.efficlaude/.last_update_check")
REMOTE_VERSION_CACHE = os.path.expanduser("~/.efficlaude/.remote_version")
VERSION_URL = "https://raw.githubusercontent.com/kaeltech-id/EffiClaude/main/VERSION"


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


def ensure_worker():
    """Check worker health; auto-start if down. Returns (is_up: bool, was_restarted: bool)."""
    result = fetch(f"{WORKER_URL}/health", timeout=1)
    if result is not None:
        return (True, False)
    # Worker is down — attempt to start it
    try:
        subprocess.Popen(
            ["bash", START_SH],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        _warn("prompt_submit", f"worker start failed: {e}")
        return (False, False)
    # Retry health check every 1s up to WORKER_RESTART_WAIT_SECS
    for _ in range(WORKER_RESTART_WAIT_SECS):
        time.sleep(1)
        result = fetch(f"{WORKER_URL}/health", timeout=1)
        if result is not None:
            return (True, True)
    return (False, False)


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


def _relevance_floor(items):
    """Keep only items that clearly beat the pack. Silence beats a wrong answer."""
    scored = [i for i in items if isinstance(i.get("distance"), (int, float))]
    if not scored:
        return []
    if len(scored) == 1:
        return [i for i in scored if i["distance"] <= RELEVANCE_CEILING]
    dists = sorted(i["distance"] for i in scored)
    median = dists[len(dists) // 2]
    return [
        i for i in scored
        if i["distance"] <= RELEVANCE_CEILING and i["distance"] <= median - RELEVANCE_MARGIN
    ]


def _docs_gate(items):
    """Drop boilerplate headings and chunks too thin to be worth a prompt."""
    return [
        d for d in items
        if d.get("heading", "").strip().lower() not in _DOCS_STOP_HEADINGS
        and len(d.get("content", "").strip()) >= MIN_DOCS_CONTENT_CHARS
    ]


def check_update():
    try:
        if not os.path.exists(VERSION_FILE) or not os.path.exists(REMOTE_VERSION_CACHE):
            return None
        with open(VERSION_FILE) as f:
            local = f.read().strip()
        with open(REMOTE_VERSION_CACHE) as f:
            remote = f.read().strip()
        if remote and local != remote:
            return f"EffiClaude {remote} available (installed: {local}). Run: bash install.sh"
    except Exception:
        pass
    return None


def maybe_refresh_update():
    try:
        if os.path.exists(UPDATE_CHECK_FILE):
            with open(UPDATE_CHECK_FILE) as f:
                last = float(f.read().strip())
            if time.time() - last < 86400:
                return
        # Stamp the attempt now so a failing fetch can't defeat the 24h throttle.
        with open(UPDATE_CHECK_FILE, "w") as f:
            f.write(str(time.time()))
        subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "--refresh-update"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass


def refresh_update_cache():
    try:
        with urllib.request.urlopen(VERSION_URL, timeout=3) as resp:
            remote = resp.read().decode().strip()
        with open(REMOTE_VERSION_CACHE, "w") as f:
            f.write(remote)
    except Exception:
        pass


def check_context_staleness():
    try:
        stack_path = os.path.join(os.getcwd(), ".claude", "context", "stack.md")
        with open(stack_path) as f:
            header = f.read(300)
        match = re.search(r'<!--\s*last_updated:\s*(\d{4}-\d{2}-\d{2})\s*-->', header)
        if not match:
            return "(context age unknown — run /ec-setup to refresh)"
        date_str = match.group(1)
        last_ts = time.mktime(time.strptime(date_str, "%Y-%m-%d"))
        days = int((time.time() - last_ts) / 86400)
        if days > 30:
            return f"⚠️ Context files last updated {days} days ago. Consider running /ec-setup to refresh."
    except Exception:
        pass
    return None


def get_mode_indicator():
    try:
        mode_file = Path(os.getcwd()) / ".claude" / ".mode"
        if mode_file.exists() and mode_file.read_text().strip() == "vibe":
            return "⚡ **VIBE MODE active** — run `/ec-mode structured` to switch back"
    except Exception:
        pass
    return None


def main():
    if "--refresh-update" in sys.argv[1:]:
        refresh_update_cache()
        return

    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
    except Exception:
        sys.exit(0)

    prompt = data.get("prompt", "")
    if not prompt:
        sys.exit(0)
    is_up, was_restarted = ensure_worker()
    if not is_up:
        sys.exit(0)

    project = get_project_name()
    maybe_refresh_update()
    update_msg = check_update()
    staleness_msg = check_context_staleness()
    mode_indicator = get_mode_indicator()

    with ThreadPoolExecutor(max_workers=2) as ex:
        mem_future = ex.submit(get_memory_context, project, prompt)
        docs_future = ex.submit(get_docs_context, project, prompt)
        memory_items = mem_future.result()
        docs_items = docs_future.result()

    parts = []

    memory_items = _relevance_floor(memory_items)
    if memory_items:
        mem_lines = [f"- [{m['metadata'].get('type', 'obs')}] {m['content']}" for m in memory_items]
        parts.append("**Relevant project memory:**\n" + "\n".join(mem_lines))

    docs_items = _docs_gate(docs_items)
    if docs_items:
        doc_lines = [f"- [{d['library']} › {d['heading']}] {d['content'][:120]}" for d in docs_items]
        parts.append("**Relevant docs:**\n" + "\n".join(doc_lines))

    if was_restarted:
        parts.insert(0, "**EffiClaude worker was restarted — context may be partial.**")

    if update_msg:
        parts.insert(0, f"**{update_msg}**")

    if staleness_msg:
        parts.insert(0, f"**{staleness_msg}**")

    if mode_indicator:
        parts.insert(0, mode_indicator)

    if not parts:
        sys.exit(0)

    context_block = "\n\n".join(parts)
    print(f"<efficlaude-context>\n{context_block}\n</efficlaude-context>")


if __name__ == "__main__":
    main()
