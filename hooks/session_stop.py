#!/usr/bin/env python3
"""Triggers memory summarization when a Claude session ends."""

import sys
import json
import os
import subprocess
import time
import urllib.request

WORKER_URL = "http://localhost:37777"
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
    except Exception:
        pass


if __name__ == "__main__":
    main()
