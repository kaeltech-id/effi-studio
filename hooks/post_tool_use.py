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
REJECT_FILE = Path.home() / ".efficlaude" / ".observe_rejects.json"


def _record_reject(reason, tool_name):
    try:
        try:
            data = json.loads(REJECT_FILE.read_text())
        except Exception:
            data = {}
        if not isinstance(data, dict):
            data = {}
        key = f"{reason}:{tool_name}"
        data[key] = data.get(key, 0) + 1
        REJECT_FILE.parent.mkdir(parents=True, exist_ok=True)
        REJECT_FILE.write_text(json.dumps(data))
    except Exception as e:
        _warn("post_tool_use", f"reject counter failed: {e}")


def get_project_name():
    try:
        config_path = os.path.join(os.getcwd(), ".claude", "project-config.json")
        with open(config_path) as f:
            return json.load(f).get("project_name", "unknown")
    except Exception:
        return os.path.basename(os.getcwd())


SIGNAL_MIN_DURATION_MS = int(os.environ.get("EFFICLAUDE_SIGNAL_MS", "5000"))
_NOISE_PREFIXES = ("curl ", "cat ", "ls ", "echo ", "grep ", "sed -n", "wc ", "head ", "tail ")
_INTERNAL_DIR = ".claude"
_EXIT_KEYS = ("exit_code", "exitCode", "returncode", "return_code", "exit_status", "status", "code")
_DURATION_KEYS = ("duration_ms", "durationMs", "duration", "elapsed_ms", "elapsedMs", "took_ms")


def _edited_paths(tool_name, tool_input):
    try:
        if tool_name == "MultiEdit":
            raw = [e.get("file_path", "") for e in tool_input.get("edits", []) or []]
        else:
            raw = [tool_input.get("file_path", "")]
        return [str(p) for p in raw if str(p).strip()]
    except Exception:
        return []


def _is_internal(path):
    try:
        resolved = Path(str(path).strip()).expanduser()
        if _INTERNAL_DIR in resolved.parts:
            return True
        efficlaude = str(Path.home() / ".efficlaude")
        text = str(resolved)
        return text == efficlaude or text.startswith(efficlaude + os.sep)
    except Exception:
        return True


def _coerce_int(value):
    try:
        return int(float(value))
    except Exception:
        return None


def _payload_value(tool_response, keys):
    if not isinstance(tool_response, dict):
        return None
    for key in keys:
        if key in tool_response:
            found = _coerce_int(tool_response.get(key))
            if found is not None:
                return found
    return None


def _exit_code(tool_response):
    found = _payload_value(tool_response, _EXIT_KEYS)
    return found if found is not None else 0


def _duration_ms(tool_response):
    found = _payload_value(tool_response, _DURATION_KEYS)
    return found if found is not None else 0


def _has_signal(tool_name, tool_input, tool_response):
    """True when this tool call carries evidence worth storing."""
    try:
        if tool_name in ("Write", "Edit", "MultiEdit"):
            return any(not _is_internal(p) for p in _edited_paths(tool_name, tool_input))
        if tool_name == "Bash":
            if _exit_code(tool_response) != 0:
                return True
            if _duration_ms(tool_response) >= SIGNAL_MIN_DURATION_MS:
                return True
            cmd = str(tool_input.get("command", "")).strip()
            return not cmd.startswith(_NOISE_PREFIXES)
    except Exception as e:
        _warn("post_tool_use", f"signal check failed: {e}")
    return False


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
    if len(sys.argv) >= 4 and sys.argv[1] == "--observe":
        if ensure_worker_quick():
            try:
                post_observation(sys.argv[2], sys.argv[3])
            except Exception as e:
                _warn("post_tool_use", f"observe failed: {e}")
        return

    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
    except Exception:
        sys.exit(0)

    tool_name = data.get("tool_name", "")
    if tool_name not in TRACKED_TOOLS:
        sys.exit(0)

    tool_input = data.get("tool_input", {})
    tool_response = data.get("tool_response")
    if os.getenv("EFFICLAUDE_DEBUG"):
        try:
            if isinstance(tool_response, dict):
                _warn("post_tool_use", f"tool_response keys: {sorted(tool_response)}")
        except Exception:
            pass

    if not _has_signal(tool_name, tool_input, tool_response):
        _record_reject("no_signal", tool_name)
        sys.exit(0)

    observation = build_observation(tool_name, tool_input)
    if not observation:
        sys.exit(0)

    project = get_project_name()
    try:
        subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "--observe", project, observation],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass


if __name__ == "__main__":
    main()
