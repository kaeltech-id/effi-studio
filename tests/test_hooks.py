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


def _sentinel(tmp_path, **over):
    f = {"branch": "main", "created": str(int(time.time())),
         "stage": "execute", "stages_done": "feature", "iterations": "0"}
    f.update(over)
    p = tmp_path / ".claude" / ".autoflow"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("".join(f"{k}={v}\n" for k, v in f.items()))
    return p


def _plan(tmp_path, done=0, todo=0, branch="main"):
    p = tmp_path / ".claude" / "plans" / f"{branch}.md"
    p.parent.mkdir(parents=True, exist_ok=True)
    body = ["# Plan\n"]
    body += [f"- [x] finished task {i}\n" for i in range(done)]
    body += [f"- [ ] pending task {i}\n" for i in range(todo)]
    p.write_text("".join(body))
    return p


def _run_driver(hook_input=None, branch="main"):
    import session_stop
    with patch.object(session_stop, "_current_branch", return_value=branch):
        return session_stop.autoflow_driver(hook_input if hook_input is not None else {})


class TestAutoflowDriver:
    def test_returns_none_when_no_sentinel(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / ".claude").mkdir()
        assert _run_driver() is None

    def test_returns_none_when_stop_hook_active(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path)
        _plan(tmp_path, done=1, todo=2)
        assert _run_driver({"stop_hook_active": True}) is None

    def test_keeps_sentinel_when_stop_hook_active(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path)
        _plan(tmp_path, done=1, todo=2)
        _run_driver({"stop_hook_active": True})
        assert path.exists()

    def test_routes_to_execute_when_tasks_remain(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path)
        _plan(tmp_path, done=1, todo=2)
        payload = _run_driver()
        assert "/ec-execute" in payload["reason"]

    def test_routes_to_review_when_all_tasks_done(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path)
        _plan(tmp_path, done=2, todo=0)
        payload = _run_driver()
        assert "/ec-review" in payload["reason"]

    def test_routes_to_feature_when_only_decision_exists(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path)
        decision = tmp_path / ".claude" / "decisions" / "main.md"
        decision.parent.mkdir(parents=True)
        decision.write_text("# Decision\n")
        payload = _run_driver()
        assert "/ec-feature" in payload["reason"]

    def test_returns_none_when_review_done(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path)
        _plan(tmp_path, done=2, todo=0)
        (tmp_path / ".claude" / ".review-done-main").write_text("")
        assert _run_driver() is None

    def test_deletes_sentinel_when_review_done(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path)
        _plan(tmp_path, done=2, todo=0)
        (tmp_path / ".claude" / ".review-done-main").write_text("")
        _run_driver()
        assert not path.exists()

    @pytest.mark.parametrize("done,todo,expected", [
        pytest.param(1, 2, "/ec-execute", id="tasks remaining"),
        pytest.param(2, 0, "/ec-review", id="all tasks done"),
    ])
    def test_reason_never_instructs_git_stage(self, tmp_path, monkeypatch,
                                             done, todo, expected):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path)
        _plan(tmp_path, done=done, todo=todo)
        payload = _run_driver()
        assert expected in payload["reason"]
        assert "Invoke /ec-git" not in payload["reason"]

    @pytest.mark.parametrize("done,todo", [
        pytest.param(1, 2, id="tasks remaining"),
        pytest.param(2, 0, id="all tasks done"),
        pytest.param(0, 0, id="empty plan"),
    ])
    def test_next_command_is_never_git(self, tmp_path, monkeypatch, done, todo):
        monkeypatch.chdir(tmp_path)
        _plan(tmp_path, done=done, todo=todo)
        from session_stop import _next_autoflow_command
        assert _next_autoflow_command("main") != "/ec-git"

    def test_continues_when_progress_advanced(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, driver_stage="execute", driver_progress="1")
        _plan(tmp_path, done=2, todo=1)
        assert _run_driver() is not None

    def test_records_new_progress_in_sentinel(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, driver_stage="execute", driver_progress="1")
        _plan(tmp_path, done=2, todo=1)
        _run_driver()
        from session_stop import _parse_sentinel
        assert _parse_sentinel(str(path))["driver_progress"] == "2"

    def test_increments_iterations_in_sentinel(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, iterations="3")
        _plan(tmp_path, done=1, todo=1)
        _run_driver()
        from session_stop import _parse_sentinel
        assert _parse_sentinel(str(path))["iterations"] == "4"

    def test_returns_none_at_iteration_cap(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, iterations="40")
        _plan(tmp_path, done=1, todo=1)
        assert _run_driver() is None

    def test_deletes_sentinel_at_iteration_cap(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, iterations="40")
        _plan(tmp_path, done=1, todo=1)
        _run_driver()
        assert not path.exists()

    def test_returns_none_on_branch_mismatch(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, branch="other")
        _plan(tmp_path, done=1, todo=1)
        assert _run_driver() is None

    def test_deletes_sentinel_on_branch_mismatch(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, branch="other")
        _plan(tmp_path, done=1, todo=1)
        _run_driver()
        assert not path.exists()

    def test_returns_none_when_sentinel_stale(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path)
        _plan(tmp_path, done=1, todo=1)
        old = time.time() - 7201
        os.utime(str(path), (old, old))
        assert _run_driver() is None

    def test_deletes_sentinel_when_stale(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path)
        _plan(tmp_path, done=1, todo=1)
        old = time.time() - 7201
        os.utime(str(path), (old, old))
        _run_driver()
        assert not path.exists()

    def test_tolerates_non_numeric_sentinel_fields(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, iterations="abc",
                  driver_stage="execute", driver_progress="xyz")
        _plan(tmp_path, done=1, todo=1)
        payload = _run_driver()
        assert payload is not None

    def test_payload_decision_is_block(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path)
        _plan(tmp_path, done=1, todo=2)
        payload = _run_driver()
        assert payload["decision"] == "block"

    def test_payload_reason_is_non_empty_string(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path)
        _plan(tmp_path, done=1, todo=2)
        payload = _run_driver()
        assert isinstance(payload["reason"], str) and payload["reason"].strip()


class TestNoProgressTolerance:
    def test_returns_payload_on_first_no_progress_turn(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, driver_stage="execute", driver_progress="1")
        _plan(tmp_path, done=1, todo=1)
        assert _run_driver() is not None

    def test_keeps_sentinel_on_first_no_progress_turn(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, driver_stage="execute", driver_progress="1")
        _plan(tmp_path, done=1, todo=1)
        _run_driver()
        assert path.exists()

    def test_records_first_no_progress_turn(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, driver_stage="execute", driver_progress="1")
        _plan(tmp_path, done=1, todo=1)
        _run_driver()
        from session_stop import _parse_sentinel
        assert _parse_sentinel(str(path))["no_progress"] == "1"

    def test_returns_payload_on_second_no_progress_turn(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, driver_stage="execute", driver_progress="1",
                  no_progress="1")
        _plan(tmp_path, done=1, todo=1)
        assert _run_driver() is not None

    def test_records_second_no_progress_turn(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, driver_stage="execute", driver_progress="1",
                         no_progress="1")
        _plan(tmp_path, done=1, todo=1)
        _run_driver()
        from session_stop import _parse_sentinel
        assert _parse_sentinel(str(path))["no_progress"] == "2"

    def test_returns_none_on_third_no_progress_turn(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, driver_stage="execute", driver_progress="1",
                  no_progress="2")
        _plan(tmp_path, done=1, todo=1)
        assert _run_driver() is None

    def test_deletes_sentinel_on_third_no_progress_turn(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, driver_stage="execute", driver_progress="1",
                         no_progress="2")
        _plan(tmp_path, done=1, todo=1)
        _run_driver()
        assert not path.exists()

    def test_returns_payload_when_progress_resumes(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, driver_stage="execute", driver_progress="1",
                  no_progress="2")
        _plan(tmp_path, done=2, todo=1)
        assert _run_driver() is not None

    def test_resets_counter_when_progress_resumes(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, driver_stage="execute", driver_progress="1",
                         no_progress="2")
        _plan(tmp_path, done=2, todo=1)
        _run_driver()
        from session_stop import _parse_sentinel
        assert _parse_sentinel(str(path))["no_progress"] == "0"

    def test_returns_payload_when_stage_changes(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, stage="review", driver_stage="execute",
                  driver_progress="1", no_progress="2")
        _plan(tmp_path, done=1, todo=1)
        assert _run_driver() is not None

    def test_resets_counter_when_stage_changes(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, stage="review", driver_stage="execute",
                         driver_progress="1", no_progress="2")
        _plan(tmp_path, done=1, todo=1)
        _run_driver()
        from session_stop import _parse_sentinel
        assert _parse_sentinel(str(path))["no_progress"] == "0"

    def test_tolerates_non_numeric_no_progress(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, driver_stage="execute", driver_progress="1",
                  no_progress="abc")
        _plan(tmp_path, done=1, todo=1)
        assert _run_driver() is not None

    def test_counts_non_numeric_no_progress_as_zero(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        path = _sentinel(tmp_path, driver_stage="execute", driver_progress="1",
                         no_progress="abc")
        _plan(tmp_path, done=1, todo=1)
        _run_driver()
        from session_stop import _parse_sentinel
        assert _parse_sentinel(str(path))["no_progress"] == "1"

    def test_reason_warns_about_abandonment_on_no_progress(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, driver_stage="execute", driver_progress="1")
        _plan(tmp_path, done=1, todo=1)
        payload = _run_driver()
        assert "abandoned after 3" in payload["reason"]

    def test_reason_omits_warning_on_productive_turn(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        _sentinel(tmp_path, driver_stage="execute", driver_progress="1")
        _plan(tmp_path, done=2, todo=1)
        payload = _run_driver()
        assert "abandoned after 3" not in payload["reason"]

    def test_sentinel_order_includes_no_progress(self):
        from session_stop import _SENTINEL_ORDER
        assert "no_progress" in _SENTINEL_ORDER

    def test_max_no_progress_threshold_is_three(self):
        from session_stop import AUTOFLOW_MAX_NO_PROGRESS
        assert AUTOFLOW_MAX_NO_PROGRESS == 3


class TestSentinelIO:
    def test_parse_skips_line_without_separator(self, tmp_path):
        path = tmp_path / ".autoflow"
        path.write_text("branch=main\nnot a field\niterations=2\n")
        from session_stop import _parse_sentinel
        assert _parse_sentinel(str(path)) == {"branch": "main", "iterations": "2"}

    def test_parse_returns_none_for_empty_file(self, tmp_path):
        path = tmp_path / ".autoflow"
        path.write_text("")
        from session_stop import _parse_sentinel
        assert _parse_sentinel(str(path)) is None

    def test_parse_returns_none_for_missing_file(self, tmp_path):
        from session_stop import _parse_sentinel
        assert _parse_sentinel(str(tmp_path / "absent")) is None

    def test_write_round_trip_preserves_unknown_field(self, tmp_path):
        path = tmp_path / ".autoflow"
        fields = {"branch": "main", "iterations": "2", "custom_note": "keep-me"}
        from session_stop import _parse_sentinel, _write_sentinel
        _write_sentinel(str(path), fields)
        assert _parse_sentinel(str(path)) == fields

    def test_write_orders_known_fields_first(self, tmp_path):
        path = tmp_path / ".autoflow"
        from session_stop import _write_sentinel
        _write_sentinel(str(path), {"custom_note": "keep-me", "branch": "main"})
        assert path.read_text().splitlines()[0] == "branch=main"


class TestPlanCounts:
    def test_returns_none_when_plan_absent(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        from session_stop import _plan_counts
        assert _plan_counts("main") is None

    @pytest.mark.parametrize("done,todo", [
        pytest.param(0, 0, id="no tasks"),
        pytest.param(1, 0, id="single done task"),
        pytest.param(0, 1, id="single todo task"),
        pytest.param(3, 2, id="mixed tasks"),
    ])
    def test_counts_checkbox_lines(self, tmp_path, monkeypatch, done, todo):
        monkeypatch.chdir(tmp_path)
        _plan(tmp_path, done=done, todo=todo)
        from session_stop import _plan_counts
        assert _plan_counts("main") == (done, todo)
