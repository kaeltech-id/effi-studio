import sys
import os
import json
import time
import pytest
from unittest.mock import patch, MagicMock

# Add hooks dir to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'hooks'))


def test_staleness_returns_warning_when_old(tmp_path):
    """check_context_staleness warns when context is very old."""
    ctx = tmp_path / ".claude" / "context"
    ctx.mkdir(parents=True)
    (ctx / "stack.md").write_text("<!-- last_updated: 2020-01-01 -->\n# Tech Stack\n")
    with patch("os.getcwd", return_value=str(tmp_path)):
        from prompt_submit import check_context_staleness
        result = check_context_staleness()
    assert result is not None
    assert "days ago" in result


def test_staleness_returns_unknown_when_no_comment(tmp_path):
    """check_context_staleness returns unknown-age message when comment absent."""
    ctx = tmp_path / ".claude" / "context"
    ctx.mkdir(parents=True)
    (ctx / "stack.md").write_text("# Tech Stack\nNo comment here.\n")
    with patch("os.getcwd", return_value=str(tmp_path)):
        from prompt_submit import check_context_staleness
        result = check_context_staleness()
    assert result == "(context age unknown — run /ec-setup to refresh)"


def test_check_uncommitted_no_output_when_clean(capsys):
    """check_uncommitted prints nothing when working tree is clean."""
    from session_stop import check_uncommitted
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout="", returncode=0)
        check_uncommitted()
    captured = capsys.readouterr()
    assert "Uncommitted" not in captured.out


def test_check_uncommitted_warns_when_dirty(capsys):
    """check_uncommitted prints warning when there are uncommitted changes."""
    from session_stop import check_uncommitted
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout=" M modified_file.py", returncode=0)
        check_uncommitted()
    captured = capsys.readouterr()
    assert "Uncommitted" in captured.out


def test_auto_export_removes_stale_bak(tmp_path):
    """auto_export deletes .bak files older than 7 days after a successful export."""
    claude_dir = tmp_path / ".claude"
    claude_dir.mkdir()
    export_path = str(claude_dir / "memory-export.json")
    bak_path = export_path + ".bak"

    # Create a stale .bak file (8 days old) without a pre-existing export_path,
    # so auto_export won't hit the early-return guard and won't overwrite our bak.
    # We write the .bak directly; auto_export only copies to .bak when export_path
    # already exists, so we pre-place it and also create an old export_path so the
    # recency guard (< 3600s) is bypassed.
    with open(export_path, "w") as f:
        f.write("{}")
    old_mtime = time.time() - 86400 * 8
    os.utime(export_path, (old_mtime, old_mtime))

    # auto_export will shutil.copy2(export_path, bak_path) then overwrite the bak
    # mtime with a fresh copy — we need the bak to still be "old" after the copy.
    # We instead pre-create the bak with an old mtime and then patch shutil.copy2
    # so it doesn't reset the bak's mtime.
    with open(bak_path, "w") as f:
        f.write("{}")
    os.utime(bak_path, (old_mtime, old_mtime))

    mem_data = json.dumps({"observations": [], "summaries": []}).encode()
    graph_data = json.dumps({"nodes": [], "edges": []}).encode()

    def make_ctx_mgr(data):
        mock = MagicMock()
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)
        mock.read = MagicMock(return_value=data)
        return mock

    urlopen_responses = [make_ctx_mgr(mem_data), make_ctx_mgr(graph_data)]

    with patch("os.getcwd", return_value=str(tmp_path)), \
         patch("shutil.copy2"), \
         patch("urllib.request.urlopen", side_effect=urlopen_responses):
        from session_stop import auto_export
        auto_export("testproject")

    assert not os.path.exists(bak_path), ".bak file should have been deleted"
