#!/usr/bin/env python3
"""Captures Write/Edit/Bash tool usage as memory observations."""

import sys
import json
import os
import subprocess
import time
import urllib.request
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
TRACKED_TOOLS = {"Write", "Edit", "Bash", "MultiEdit"}
START_SH = os.path.expanduser("~/.efficlaude/server/start.sh")


def get_project_name():
    try:
        config_path = os.path.join(os.getcwd(), ".claude", "project-config.json")
        with open(config_path) as f:
            return json.load(f).get("project_name", "unknown")
    except Exception:
        return os.path.basename(os.getcwd())


def build_observation(tool_name, tool_input):
    if tool_name == "Write":
        return f"Wrote file: {tool_input.get('file_path', '')}"
    if tool_name == "Edit":
        return f"Edited file: {tool_input.get('file_path', '')} — {str(tool_input.get('old_string', ''))[:60]}"
    if tool_name == "MultiEdit":
        paths = [e.get("file_path", "") for e in tool_input.get("edits", [])]
        return f"Multi-edited: {', '.join(set(paths))}"
    if tool_name == "Bash":
        cmd = str(tool_input.get("command", ""))[:120]
        return f"Ran command: {cmd}"
    return None


def post_observation(project, content, obs_type="tool_use"):
    payload = json.dumps({
        "project": project,
        "type": obs_type,
        "content": content
    }).encode()
    req = urllib.request.Request(
        f"{WORKER_URL}/memory/observe",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    urllib.request.urlopen(req, timeout=2)


def ensure_worker_quick():
    req = urllib.request.Request(f"{WORKER_URL}/health")
    try:
        urllib.request.urlopen(req, timeout=1)
        return True
    except Exception:
        pass
    try:
        subprocess.Popen(["bash", START_SH],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
        urllib.request.urlopen(req, timeout=1)
        return True
    except Exception:
        return False


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
    except Exception:
        sys.exit(0)

    tool_name = data.get("tool_name", "")
    if tool_name not in TRACKED_TOOLS:
        sys.exit(0)

    observation = build_observation(tool_name, data.get("tool_input", {}))
    if not observation:
        sys.exit(0)

    project = get_project_name()
    if ensure_worker_quick():
        try:
            post_observation(project, observation)
        except Exception as e:
            _warn("post_tool_use", f"observe failed: {e}")


if __name__ == "__main__":
    main()
