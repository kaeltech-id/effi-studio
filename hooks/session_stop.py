#!/usr/bin/env python3
"""Triggers memory summarization when a Claude session ends."""

import sys
import json
import os
import urllib.request

WORKER_URL = "http://localhost:37777"


def get_project_name():
    try:
        config_path = os.path.join(os.getcwd(), ".claude", "project-config.json")
        with open(config_path) as f:
            return json.load(f).get("project_name", "unknown")
    except Exception:
        return os.path.basename(os.getcwd())


def main():
    project = get_project_name()
    payload = json.dumps({"project": project}).encode()
    req = urllib.request.Request(
        f"{WORKER_URL}/memory/summarize",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass


if __name__ == "__main__":
    main()
