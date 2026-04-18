import os
import re
import pytest

COMMANDS_DIR = os.path.join(os.path.dirname(__file__), '..', 'commands')


def read_command(name):
    with open(os.path.join(COMMANDS_DIR, name)) as f:
        return f.read()


# --- ec-setup.md: docs/PROJECT.md section ---

class TestEcSetupProjectDoc:
    def setup_method(self):
        self.content = read_command('ec-setup.md')

    def test_section_heading_present(self):
        assert '### docs/PROJECT.md' in self.content

    def test_mkdir_instruction_present(self):
        assert "Create the `docs/` directory if it doesn't exist" in self.content

    def test_last_updated_header_present(self):
        assert '<!-- last_updated: {YYYY-MM-DD} -->' in self.content

    def test_all_required_sections_in_template(self):
        for section in ['## Overview', '## Stack', '## Project Structure',
                        '## Commands', '## Conventions', '## Changelog']:
            assert section in self.content, f'Missing section: {section}'

    def test_commands_table_has_all_six_commands(self):
        for cmd in ['/ec-setup', '/ec-brainstorm', '/ec-feature',
                    '/ec-execute', '/ec-review', '/ec-git']:
            assert cmd in self.content, f'Missing command in table: {cmd}'

    def test_changelog_initial_row_present(self):
        assert 'Initial setup' in self.content
        assert 'Project configured via /ec-setup' in self.content

    def test_overwrite_on_rerun_instruction_present(self):
        assert 'already exists' in self.content
        assert 'overwrite it fully' in self.content

    def test_section_placed_before_gitignore(self):
        setup_pos = self.content.find('### docs/PROJECT.md')
        gitignore_pos = self.content.find('### .gitignore')
        assert setup_pos != -1
        assert gitignore_pos != -1
        assert setup_pos < gitignore_pos


# --- ec-review.md: Step 5 section ---

class TestEcReviewStep5:
    def setup_method(self):
        self.content = read_command('ec-review.md')

    def test_step5_heading_present(self):
        assert '## Step 5 — Write Review Docs' in self.content

    def test_review_summary_write_instruction(self):
        assert '.claude/review-summary.md' in self.content
        assert 'overwrite if it already exists' in self.content

    def test_review_summary_template_sections(self):
        for section in ['## Feature', '## Tasks completed', '## Files modified',
                        '## Issues fixed during review', '## Review result']:
            assert section in self.content, f'Missing section: {section}'

    def test_review_result_table_present(self):
        assert '| Spec compliance |' in self.content
        assert '| Code quality |' in self.content
        assert '| Tests |' in self.content

    def test_no_issues_fallback_present(self):
        assert 'No issues found.' in self.content

    def test_project_md_update_instructions_present(self):
        assert 'docs/PROJECT.md' in self.content
        assert 'last_updated' in self.content
        assert '## Changelog' in self.content

    def test_project_md_not_found_guard_present(self):
        assert 'docs/PROJECT.md` does not exist' in self.content
        assert 'run /ec-setup to generate it' in self.content

    def test_step5_placed_before_next_line(self):
        step5_pos = self.content.find('## Step 5 — Write Review Docs')
        next_pos = self.content.find('Next: run `/ec-git`')
        assert step5_pos != -1
        assert next_pos != -1
        assert step5_pos < next_pos

    def test_file_ends_with_git_next_step(self):
        last_line = self.content.rstrip('\n').split('\n')[-1]
        assert 'ec-git' in last_line
