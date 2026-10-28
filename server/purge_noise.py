#!/usr/bin/env python3
"""Purge historical `tool_use` noise from the memory corpus.

The write-side signal gate (hooks/post_tool_use.py) stops new noise from
arriving; this script removes what landed before the gate existed. It deletes
from `observations`, `obs_fts` and the Chroma collection together, and never
touches any observation type other than `tool_use`.
"""
from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

BASE_DIR = os.path.expanduser("~/.efficlaude")
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "efficlaude.db")
DEFAULT_CHROMA_PATH = os.path.join(BASE_DIR, "chroma")

TARGET_TYPE = "tool_use"
COMMAND_PREFIX = "Ran command: "
NOISE_PREFIXES = ("curl ", "cat ", "ls ", "echo ", "grep ", "sed -n", "wc ", "head ", "tail ")

_SEPARATORS = re.compile(r"&&|\|\||;|\||\n")
_NEUTRAL = re.compile(r"^(cd(\s|$)|#)")

SQLITE_CHUNK = 500
CHROMA_CHUNK = 500


def backup_command(db_path: str, chroma_path: str) -> str:
    return f"cp {db_path} {db_path}.bak && cp -R {chroma_path} {chroma_path}.bak"


def is_noise(content: str) -> bool:
    """Noise when every executed segment of the recorded command is noise.

    The write-side gate only tests the command's own prefix, so `cd x && curl y`
    slipped past it; splitting on shell separators catches those while a single
    signal-bearing segment (`cd x && cargo build`) still protects the row. The
    stored command is truncated at 120 chars, so a partial trailing segment is
    kept in the scan rather than dropped — dropping it would delete rows whose
    visible tail carries signal.
    """
    if not content.startswith(COMMAND_PREFIX):
        return False
    segments = [s.strip() for s in _SEPARATORS.split(content[len(COMMAND_PREFIX):])]
    saw_noise = False
    for segment in segments:
        if not segment or _NEUTRAL.match(segment):
            continue
        if not segment.startswith(NOISE_PREFIXES):
            return False
        saw_noise = True
    return saw_noise


def composition(conn: sqlite3.Connection) -> list[tuple[str, int]]:
    return conn.execute(
        "SELECT type, COUNT(*) FROM observations GROUP BY type ORDER BY 2 DESC, 1 ASC"
    ).fetchall()


def print_composition(label: str, rows: list[tuple[str, int]]) -> None:
    total = sum(count for _, count in rows)
    print(f"\n{label} (total {total}):")
    for obs_type, count in rows:
        share = (count / total * 100) if total else 0.0
        print(f"  {obs_type:<14} {count:>7}  {share:5.1f}%")


def noise_ids(conn: sqlite3.Connection) -> list[int]:
    rows = conn.execute(
        "SELECT id, content FROM observations WHERE type = ?", (TARGET_TYPE,)
    ).fetchall()
    return [obs_id for obs_id, content in rows if is_noise(content or "")]


def chunks(ids: list[int], size: int):
    for start in range(0, len(ids), size):
        yield ids[start:start + size]


def delete_from_sqlite(db_path: str, ids: list[int]) -> int:
    deleted = 0
    with sqlite3.connect(db_path) as conn:
        for batch in chunks(ids, SQLITE_CHUNK):
            placeholders = ",".join("?" * len(batch))
            cursor = conn.execute(
                f"DELETE FROM observations WHERE id IN ({placeholders}) AND type = ?",
                [*batch, TARGET_TYPE],
            )
            deleted += cursor.rowcount
            conn.execute(
                f"DELETE FROM obs_fts WHERE rowid IN ({placeholders})", batch
            )
        conn.commit()
    return deleted


def delete_from_chroma(collection, ids: list[int]) -> int:
    """Best-effort vector deletes; ids absent from the store are not fatal."""
    failed = 0
    for batch in chunks(ids, CHROMA_CHUNK):
        try:
            collection.delete(ids=[str(i) for i in batch])
        except Exception as e:
            failed += len(batch)
            print(f"  chroma delete failed for {len(batch)} ids: {e}", file=sys.stderr)
    return failed


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Delete historical noise rows of type 'tool_use' from the memory corpus."
    )
    parser.add_argument("--dry-run", action="store_true", help="report only; write nothing")
    parser.add_argument("--yes", action="store_true", help="confirm a real, destructive purge")
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help="SQLite path (default: %(default)s)")
    parser.add_argument(
        "--chroma", default=DEFAULT_CHROMA_PATH, help="Chroma path (default: %(default)s)"
    )
    return parser.parse_args(argv)


def connect_readonly(db_path: str) -> tuple[sqlite3.Connection, str]:
    """A connection that cannot write, even to the WAL or shm sidecars.

    `mode=ro` needs an existing shared-memory file on a WAL database, which is
    absent unless another process holds the db open. `immutable=1` then reads
    the main file alone — still zero writes, but it cannot see rows sitting in
    an un-checkpointed WAL, so the caller reports which path it took.
    """
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.execute("SELECT 1 FROM observations LIMIT 1").fetchone()
        return conn, "read-only"
    except sqlite3.OperationalError:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro&immutable=1", uri=True)
        return conn, "read-only (immutable; un-checkpointed WAL rows not visible)"


def run_dry(db_path: str) -> int:
    conn, mode = connect_readonly(db_path)
    try:
        before = composition(conn)
        candidates = noise_ids(conn)
    finally:
        conn.close()

    print(f"Opened {db_path} {mode}.")
    print_composition("BEFORE", before)
    print(f"\nNoise candidates (type='{TARGET_TYPE}'): {len(candidates)}")
    projected = [
        (obs_type, count - len(candidates) if obs_type == TARGET_TYPE else count)
        for obs_type, count in before
    ]
    print_composition("AFTER (projected)", sorted(projected, key=lambda r: (-r[1], r[0])))
    print("\nDRY RUN: nothing was written. No rows, FTS entries or vectors were deleted.")
    return 0


def run_purge(db_path: str, chroma_path: str) -> int:
    from memory import MemoryEngine

    engine = MemoryEngine(db_path, chroma_path)

    with sqlite3.connect(db_path) as conn:
        before = composition(conn)
        candidates = noise_ids(conn)

    print_composition("BEFORE", before)
    print(f"\nNoise candidates (type='{TARGET_TYPE}'): {len(candidates)}")

    if not candidates:
        print("Nothing to purge.")
        return 0

    deleted = delete_from_sqlite(db_path, candidates)
    print(f"Deleted {deleted} rows from observations and obs_fts.")

    engine._purge_fts_orphans()
    print("Swept FTS orphans and vacuumed.")

    failed = delete_from_chroma(engine._get_collection(), candidates)
    print(f"Deleted {len(candidates) - failed} ids from the Chroma collection.")

    with sqlite3.connect(db_path) as conn:
        print_composition("AFTER", composition(conn))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    db_path = os.path.abspath(os.path.expanduser(args.db))
    chroma_path = os.path.abspath(os.path.expanduser(args.chroma))

    if not os.path.exists(db_path):
        print(f"No database at {db_path}", file=sys.stderr)
        return 1

    if args.dry_run:
        return run_dry(db_path)

    if not args.yes:
        print(
            "REFUSING TO RUN: this permanently deletes historical observations.\n"
            "Back up first:\n"
            f"\n  {backup_command(db_path, chroma_path)}\n"
            "\nThen re-run with --yes, or inspect with --dry-run.",
            file=sys.stderr,
        )
        return 2

    return run_purge(db_path, chroma_path)


if __name__ == "__main__":
    sys.exit(main())
