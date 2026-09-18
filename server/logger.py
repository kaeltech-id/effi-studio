import os
import sys
import threading
from datetime import datetime
from pathlib import Path

LOG_PATH = Path.home() / ".efficlaude" / "efficlaude.log"
MAX_LOG_LINES = int(os.getenv('EFFICLAUDE_MAX_LOG_LINES', '1000'))
WORKER_LOG_PATH = Path.home() / ".efficlaude" / "worker.log"
MAX_WORKER_LOG_BYTES = int(os.getenv('EFFICLAUDE_MAX_LOG_BYTES', str(5 * 1024 * 1024)))
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


def rotate_if_large(path: Path = WORKER_LOG_PATH, max_bytes: int = MAX_WORKER_LOG_BYTES) -> bool:
    """Move an oversized log aside, keeping one backup. Returns True if rotated."""
    try:
        if not path.exists() or path.stat().st_size <= max_bytes:
            return False
        backup = path.with_suffix(path.suffix + ".1")
        if backup.exists():
            backup.unlink()
        path.rename(backup)
        return True
    except Exception:
        return False


def get_counts() -> dict:
    return dict(_error_counts)
