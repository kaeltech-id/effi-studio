import unittest
import json
import sys
import os
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'hooks'))

from post_tool_use import build_observation
from prompt_submit import check_context_staleness


class TestBuildObservation(unittest.TestCase):
    def test_write(self):
        result = build_observation("Write", {"file_path": "foo.py"})
        self.assertIn("foo.py", result)

    def test_bash(self):
        result = build_observation("Bash", {"command": "ls -la"})
        self.assertIn("ls -la", result)

    def test_edit(self):
        result = build_observation("Edit", {"file_path": "x.py", "old_string": "old"})
        self.assertIn("x.py", result)

    def test_multiedit(self):
        result = build_observation("MultiEdit", {"edits": [{"file_path": "a.py"}, {"file_path": "b.py"}]})
        self.assertIn("Multi-edited", result)

    def test_unknown_tool_returns_none(self):
        self.assertIsNone(build_observation("UnknownTool", {}))

    def test_empty_tool_name_returns_none(self):
        self.assertIsNone(build_observation("", {}))


class TestContextStaleness(unittest.TestCase):
    def _make_stack(self, d, content):
        ctx = os.path.join(d, ".claude", "context")
        os.makedirs(ctx, exist_ok=True)
        with open(os.path.join(ctx, "stack.md"), "w") as f:
            f.write(content)

    def test_no_comment_returns_unknown_message(self):
        with tempfile.TemporaryDirectory() as d:
            self._make_stack(d, "# Stack\nno comment here\n")
            os.chdir(d)
            result = check_context_staleness()
            self.assertEqual(result, "(context age unknown — run /ec-setup to refresh)")

    def test_stale_returns_warning(self):
        with tempfile.TemporaryDirectory() as d:
            self._make_stack(d, "<!-- last_updated: 2020-01-01 -->\n# Stack\n")
            os.chdir(d)
            msg = check_context_staleness()
            self.assertIsNotNone(msg)
            self.assertIn("days ago", msg)

    def test_fresh_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            today = time.strftime("%Y-%m-%d")
            self._make_stack(d, f"<!-- last_updated: {today} -->\n# Stack\n")
            os.chdir(d)
            self.assertIsNone(check_context_staleness())

    def test_comment_with_extra_spaces(self):
        with tempfile.TemporaryDirectory() as d:
            self._make_stack(d, "<!--  last_updated:  2020-01-01  -->\n# Stack\n")
            os.chdir(d)
            msg = check_context_staleness()
            self.assertIsNotNone(msg)

    def test_comment_not_on_first_line(self):
        with tempfile.TemporaryDirectory() as d:
            self._make_stack(d, "# Stack\n<!-- last_updated: 2020-01-01 -->\n")
            os.chdir(d)
            msg = check_context_staleness()
            self.assertIsNotNone(msg)

    def test_missing_stack_file_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            os.chdir(d)
            self.assertIsNone(check_context_staleness())


if __name__ == '__main__':
    unittest.main()
