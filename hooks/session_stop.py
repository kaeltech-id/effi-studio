#!/usr/bin/env python3
"""Triggers memory summarization when a Claude session ends."""

import sys
import json
import os
import re
import shutil
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
            shutil.copy2(export_path, export_path + '.bak')
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
        bak = export_path + '.bak'
        try:
            if os.path.exists(bak) and time.time() - os.path.getmtime(bak) > 86400 * 7:
                os.remove(bak)
        except Exception:
            pass
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


def release_stale_locks() -> None:
    lock_helper = Path.home() / ".efficlaude" / "server" / "file_lock.py"
    if not lock_helper.exists():
        return
    try:
        subprocess.run(
            [sys.executable, str(lock_helper), "clean", ".claude"],
            capture_output=True, timeout=5
        )
    except Exception as e:
        _warn("session_stop", f"lock cleanup failed: {e}")


AUTOFLOW_PATH = os.path.join(".claude", ".autoflow")
AUTOFLOW_MAX_AGE = 7200
AUTOFLOW_MAX_ITERATIONS = 40
AUTOFLOW_MAX_NO_PROGRESS = 3
_SENTINEL_ORDER = ["branch", "created", "stage", "stages_done",
                   "iterations", "driver_stage", "driver_progress",
                   "no_progress"]


def _parse_sentinel(path):
    fields = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                fields[key.strip()] = value.strip()
    except Exception:
        return None
    return fields or None


def _write_sentinel(path, fields):
    lines = [f"{k}={fields[k]}" for k in _SENTINEL_ORDER if k in fields]
    lines += [f"{k}={v}" for k, v in fields.items() if k not in _SENTINEL_ORDER]
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def _current_branch():
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True, text=True, cwd=os.getcwd(), timeout=3
        )
        return re.sub(r"[^a-zA-Z0-9._-]", "-", result.stdout.strip()) or "default"
    except Exception:
        return "default"


def _plan_counts(branch):
    plan = os.path.join(".claude", "plans", f"{branch}.md")
    if not os.path.exists(plan):
        return None
    done = todo = 0
    try:
        with open(plan) as f:
            for line in f:
                stripped = line.lstrip()
                if stripped.startswith("- [x]"):
                    done += 1
                elif stripped.startswith("- [ ]"):
                    todo += 1
    except Exception:
        return None
    return done, todo


def _next_autoflow_command(branch):
    """Route from on-disk state, mirroring commands/ec-next.md:47-53 truncated
    before the /ec-git row. Returns None when the chain is finished."""
    if os.path.exists(os.path.join(".claude", f".review-done-{branch}")):
        return None
    counts = _plan_counts(branch)
    if counts is not None:
        done, todo = counts
        if todo > 0:
            return "/ec-execute"
        if done > 0:
            return "/ec-review"
    if os.path.exists(os.path.join(".claude", "decisions", f"{branch}.md")):
        return "/ec-feature"
    try:
        if any(n.endswith(".md")
               for n in os.listdir(os.path.join(".claude", "brainstorms"))):
            return "/ec-feature"
    except Exception:
        pass
    return None


def _autoflow_end(path, why):
    try:
        os.remove(path)
    except Exception:
        pass
    _warn("autoflow", f"chain ended: {why}")


def autoflow_driver(hook_input):
    """Keep an auto-flow chain running across context loss. Returns a Stop-hook
    payload dict to emit, or None to let the session stop normally."""
    if hook_input.get("stop_hook_active"):
        return None
    path = AUTOFLOW_PATH
    fields = _parse_sentinel(path)
    if not fields:
        return None
    branch = _current_branch()
    try:
        age = time.time() - os.path.getmtime(path)
    except Exception:
        age = AUTOFLOW_MAX_AGE + 1
    if age > AUTOFLOW_MAX_AGE or fields.get("branch") != branch:
        _autoflow_end(path, "stale sentinel")
        return None
    try:
        iterations = int(fields.get("iterations") or 0)
    except ValueError:
        iterations = 0
    if iterations >= AUTOFLOW_MAX_ITERATIONS:
        _autoflow_end(path, f"iteration cap {AUTOFLOW_MAX_ITERATIONS} reached")
        return None
    next_command = _next_autoflow_command(branch)
    if next_command is None:
        _autoflow_end(path, "chain complete")
        return None
    counts = _plan_counts(branch)
    progress = counts[0] if counts else 0
    stage = fields.get("stage", "")
    seen_stage = fields.get("driver_stage")
    try:
        seen_progress = int(fields.get("driver_progress"))
    except (TypeError, ValueError):
        seen_progress = -1
    try:
        no_progress = int(fields.get("no_progress") or 0)
    except ValueError:
        no_progress = 0
    if seen_stage is not None and stage == seen_stage and progress <= seen_progress:
        no_progress += 1
        if no_progress >= AUTOFLOW_MAX_NO_PROGRESS:
            _autoflow_end(
                path,
                f"no progress for {no_progress} turns at stage={stage} "
                f"progress={progress}"
            )
            return None
    else:
        no_progress = 0
    fields["driver_stage"] = stage
    fields["driver_progress"] = str(progress)
    fields["iterations"] = str(iterations + 1)
    fields["no_progress"] = str(no_progress)
    _write_sentinel(path, fields)
    _warn("autoflow",
          f"resuming {next_command} (stage={stage} progress={progress} "
          f"iter={iterations + 1} no_progress={no_progress})")
    retry_note = ""
    if no_progress:
        retry_note = (
            f" This stage has produced no new completed work for {no_progress} "
            f"turn(s); it will be abandoned after {AUTOFLOW_MAX_NO_PROGRESS}, "
            f"so make concrete progress now."
        )
    return {
        "decision": "block",
        "reason": (
            f"Auto-flow is still running on branch {branch} "
            f"(stage={stage or 'unknown'}, {progress} task(s) marked done). "
            f"Do not stop. Invoke {next_command} now and continue the chain "
            f"to completion. Never run git — the chain stops before /ec-git."
            f"{retry_note}"
        ),
    }


def _read_hook_input():
    try:
        raw = sys.stdin.read()
    except Exception:
        return {}
    try:
        return json.loads(raw) if raw.strip() else {}
    except Exception:
        return {}


def _legacy_main(quiet=False):
    release_stale_locks()
    if not quiet:
        check_uncommitted()
    if not ensure_worker(wait_secs=3):
        return
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


def main():
    hook_input = _read_hook_input()
    payload = None
    try:
        payload = autoflow_driver(hook_input)
    except Exception as e:
        _warn("session_stop", f"autoflow driver failed: {e}")
    try:
        _legacy_main(quiet=payload is not None)
    except SystemExit:
        pass
    except Exception as e:
        _warn("session_stop", f"legacy main failed: {e}")
    if payload is not None:
        if os.environ.get("EFFICLAUDE_AUTOFLOW_MODE") == "exit2":
            print(payload["reason"], file=sys.stderr)
            sys.exit(2)
        print(json.dumps(payload))


if __name__ == "__main__":
    main()
