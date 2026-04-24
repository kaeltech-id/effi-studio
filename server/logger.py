import os
import sys
import threading
from datetime import datetime
from pathlib import Path

LOG_PATH = Path.home() / ".efficlaude" / "efficlaude.log"
MAX_LOG_LINES = int(os.getenv('EFFICLAUDE_MAX_LOG_LINES', '1000'))
_error_counts: dict[str, int] = {}
_log_lock = threading.Lock()


def warn(tag: str, msg: str) -> None:
    _error_counts[tag] = _error_counts.get(tag, 0) + 1
    line = f"[{datetime.utcnow().isoformat(timespec='seconds')}] [{tag}] {msg}\n"
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with _log_lock:
            lines = LOG_PATH.read_text().splitlines(keepends=True) if LOG_PATH.exists() else []
            if len(lines) >= MAX_LOG_LINES:
                lines = lines[-(MAX_LOG_LINES - 1):]
            LOG_PATH.write_text("".join(lines) + line)
    except Exception:
        pass
    if os.getenv("EFFICLAUDE_DEBUG"):
        print(line, end="", file=sys.stderr)


def get_counts() -> dict:
    return dict(_error_counts)
