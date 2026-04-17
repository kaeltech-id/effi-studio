#!/usr/bin/env python3
"""Triggers memory summarization when a Claude session ends."""

import sys
import json
import os
import subprocess
import time
import urllib.request
import urllib.parse
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
START_SH = os.path.expanduser("~/.efficlaude/server/start.sh")


def get_project_name():
    try:
        config_path = os.path.join(os.getcwd(), ".claude", "project-config.json")
        with open(config_path) as f:
            return json.load(f).get("project_name", "unknown")
    except Exception:
        return os.path.basename(os.getcwd())


def ensure_worker(wait_secs=3):
    req = urllib.request.Request(f"{WORKER_URL}/health")
    try:
        urllib.request.urlopen(req, timeout=1)
        return True
    except Exception:
        pass
    try:
        subprocess.Popen(["bash", START_SH],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(wait_secs):
            time.sleep(1)
            try:
                urllib.request.urlopen(req, timeout=1)
                return True
            except Exception:
                continue
    except Exception:
        pass
    return False


def check_uncommitted():
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, cwd=os.getcwd(), timeout=5
        )
        if result.stdout.strip():
            print("\n⚠️  Uncommitted changes detected. Run /ec-git to commit before closing.")
    except Exception:
        pass


def auto_export(project):
    try:
        export_path = os.path.join(os.getcwd(), ".claude", "memory-export.json")
        if os.path.exists(export_path):
            if time.time() - os.path.getmtime(export_path) < 3600:
                return
        mem_req = urllib.request.Request(
            f"{WORKER_URL}/memory/export?project={urllib.parse.quote(project)}"
        )
        graph_req = urllib.request.Request(
            f"{WORKER_URL}/graph/export?project={urllib.parse.quote(project)}"
        )
        with urllib.request.urlopen(mem_req, timeout=5) as r:
            mem_data = json.loads(r.read())
        with urllib.request.urlopen(graph_req, timeout=5) as r:
            graph_data = json.loads(r.read())
        export = {
            "project": project,
            "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "memory": mem_data,
            "graph": graph_data,
        }
        os.makedirs(os.path.dirname(export_path), exist_ok=True)
        with open(export_path, 'w') as f:
            json.dump(export, f)
    except Exception as e:
        _warn("session_stop", f"auto_export failed: {e}")


def ensure_commit_hook():
    try:
        src = os.path.expanduser("~/.efficlaude/hooks/commit-msg")
        if not os.path.exists(src):
            return
        result = subprocess.run(
            ["git", "rev-parse", "--git-dir"],
            capture_output=True, text=True, cwd=os.getcwd(), timeout=3
        )
        git_dir = result.stdout.strip()
        if not git_dir:
            return
        dst = os.path.join(git_dir, "hooks", "commit-msg")
        if not os.path.exists(dst):
            import shutil
            shutil.copy2(src, dst)
            os.chmod(dst, 0o755)
    except Exception as e:
        _warn("session_stop", f"commit hook install failed: {e}")


def main():
    check_uncommitted()
    if not ensure_worker(wait_secs=3):
        sys.exit(0)
    project = get_project_name()
    payload = json.dumps({"project": project}).encode()
    req = urllib.request.Request(
        f"{WORKER_URL}/memory/summarize",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        _warn("session_stop", f"summarize failed: {e}")
    auto_export(project)
    ensure_commit_hook()


if __name__ == "__main__":
    main()
