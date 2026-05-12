#!/usr/bin/env python3
"""File lock helper — prevent concurrent EffiClaude command collisions."""
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

STALE_MINUTES = 30


def lock_path(target: str) -> Path:
    p = Path(target)
    return p.parent / (p.name + ".lock")


def is_pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def is_stale(data: dict) -> bool:
    try:
        acquired = datetime.fromisoformat(data["acquired_at"])
        return not is_pid_alive(data["pid"]) or datetime.now() - acquired > timedelta(minutes=STALE_MINUTES)
    except Exception:
        return True


def acquire(target: str, session_id: str, command: str = "") -> int:
    lp = lock_path(target)
    if lp.exists():
        try:
            data = json.loads(lp.read_text())
            if not is_stale(data):
                print(json.dumps({"status": "busy", "holder": data}))
                return 1
        except Exception:
            pass
    lp.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "pid": os.getppid(),
        "session_id": session_id,
        "acquired_at": datetime.now().isoformat(),
        "command": command,
    }
    lp.write_text(json.dumps(payload))
    print(json.dumps({"status": "acquired"}))
    return 0


def release(target: str, session_id: str = "") -> int:
    lp = lock_path(target)
    if not lp.exists():
        print(json.dumps({"status": "not_found"}))
        return 0
    try:
        if session_id:
            data = json.loads(lp.read_text())
            if data.get("session_id") != session_id:
                print(json.dumps({"status": "not_owner"}))
                return 1
    except Exception:
        pass
    lp.unlink(missing_ok=True)
    print(json.dumps({"status": "released"}))
    return 0


def status(target: str) -> int:
    lp = lock_path(target)
    if not lp.exists():
        print(json.dumps({"status": "free"}))
        return 0
    try:
        data = json.loads(lp.read_text())
        stale = is_stale(data)
        print(json.dumps({"status": "stale" if stale else "locked", "holder": data}))
    except Exception:
        print(json.dumps({"status": "unknown"}))
    return 0


def clean(directory: str = ".claude") -> int:
    count = 0
    p = Path(directory)
    if not p.exists():
        print(json.dumps({"status": "cleaned", "count": 0}))
        return 0
    for lf in p.rglob("*.lock"):
        try:
            data = json.loads(lf.read_text())
            if is_stale(data):
                lf.unlink(missing_ok=True)
                count += 1
        except Exception:
            lf.unlink(missing_ok=True)
            count += 1
    print(json.dumps({"status": "cleaned", "count": count}))
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    target = sys.argv[2] if len(sys.argv) > 2 else ""
    session = sys.argv[3] if len(sys.argv) > 3 else ""
    ec_cmd = os.environ.get("EC_COMMAND", cmd)
    dispatch = {
        "acquire": lambda: acquire(target, session, ec_cmd),
        "release": lambda: release(target, session),
        "status": lambda: status(target),
        "clean": lambda: clean(target or ".claude"),
    }
    fn = dispatch.get(cmd)
    if fn is None:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(2)
    sys.exit(fn())
