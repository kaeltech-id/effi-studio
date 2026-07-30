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
        assert '.claude/review-summaries' in self.content
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


# --- Design Contract propagation chain ---

AGENTS_DIR = os.path.join(os.path.dirname(__file__), '..', 'agents')

FRONTEND_AGENTS = ['ec-react', 'ec-vue', 'ec-nextjs', 'ec-react-native',
                   'ec-flutter', 'ec-ios', 'ec-android']


def read_agent(name):
    with open(os.path.join(AGENTS_DIR, name + '.md')) as f:
        return f.read()


class TestDesignContractChain:
    def test_brainstorm_emits_contract(self):
        content = read_command('ec-brainstorm.md')
        assert '## Design Contract' in content
        assert 'none supplied' in content

    def test_feature_builds_and_tags_contract(self):
        content = read_command('ec-feature.md')
        assert '### Design Contract' in content
        assert '[design: {source}#{frame}]' in content
        assert 'not determinable from reference' in content

    def test_execute_injects_contract(self):
        content = read_command('ec-execute.md')
        assert '### Design Contract Injection' in content
        assert 'Deviation:' in content

    def test_design_tag_follows_agent_tag(self):
        content = read_command('ec-feature.md')
        for line in content.splitlines():
            if '[agent:' in line and '[design:' in line:
                assert line.index('[agent:') < line.index('[design:'), line

    def test_agent_tag_regex_survives_design_tag(self):
        line = ('- [ ] Task 1: X [M] [agent: ec-react] '
                '[design: https://f.com/d?node-id=1-2#frag#Card] — build')
        assert re.search(r'\[agent: (ec-\w+)\]', line).group(1) == 'ec-react'
        m = re.search(r'\[design: (.+)#([^#\]]+)\]', line)
        assert m.group(1) == 'https://f.com/d?node-id=1-2#frag'
        assert m.group(2) == 'Card'

    def test_review_has_both_gates(self):
        content = read_command('ec-review.md')
        assert '### Visual Fidelity' in content
        assert '### API Error Handling' in content

    @pytest.mark.parametrize('agent', FRONTEND_AGENTS)
    def test_frontend_agents_have_both_protocols(self, agent):
        content = read_agent(agent)
        assert '## Visual Fidelity Protocol' in content
        assert '## API Error Protocol' in content

    def test_tailwind_has_fidelity_without_api_protocol(self):
        content = read_agent('ec-tailwind')
        assert '## Visual Fidelity Protocol' in content
        assert '## API Error Protocol' not in content


# --- Grounded artifacts across brainstorm / feature / execute ---

class TestGroundedArtifacts:
    def test_brainstorm_decision_template_has_new_sections(self):
        content = read_command('ec-brainstorm.md')
        for section in ['## Evidence', '## Constraints', '## Non-Goals',
                        '## Verification Strategy', '## Open Questions']:
            assert section in content, section

    def test_brainstorm_options_table_present(self):
        content = read_command('ec-brainstorm.md')
        assert '| # | Option |' in content

    def test_brainstorm_screen_format_unchanged(self):
        content = read_command('ec-brainstorm.md')
        assert '## Rekomendasi: {short name}' in content
        assert '**Key assumption:**' in content

    def test_feature_has_grounding_pass(self):
        content = read_command('ec-feature.md')
        assert '## Step 2.5 — Grounding Pass' in content
        assert '### Grounding' in content

    def test_feature_grounding_is_read_only(self):
        content = read_command('ec-feature.md')
        assert 'read-only' in content
        assert 'MUST NOT run any command that writes' in content

    def test_feature_task_template_has_new_fields(self):
        content = read_command('ec-feature.md')
        for field in ['- Anchor:', '- Do not touch:', '- Acceptance:', '- Rollback:']:
            assert field in content, field

    def test_feature_states_traceability_rule(self):
        content = read_command('ec-feature.md')
        assert 'Traceability rule' in content
        assert 'traces to a baseline' in content

    def test_execute_injects_anchor_and_acceptance(self):
        content = read_command('ec-execute.md')
        assert 'Anchor:' in content
        assert 'Acceptance:' in content
        assert '### Anchor Discipline' in content

    def test_execute_forbids_threshold_gaming(self):
        content = read_command('ec-execute.md')
        assert 'Threshold mismatch' in content

    def test_existing_tag_parsers_survive(self):
        content = read_command('ec-execute.md')
        assert '### Agent Context Injection' in content
        assert '### Design Contract Injection' in content


# --- Auto-flow sentinel schema + backward compatibility ---

SENTINEL_COMMAND_FIELDS = ['stage=', 'stages_done=', 'iterations=']

SENTINEL_DRIVER_FIELDS = ['driver_stage', 'driver_progress']

AUTOFLOW_COMMANDS = ['ec-brainstorm.md', 'ec-feature.md',
                     'ec-execute.md', 'ec-review.md']

BODY_COMMAND_WRITTEN = 'branch=main\ncreated=123\nstage=feature\nstages_done=\niterations=0\n'

BODY_WITH_DRIVER_FIELDS = BODY_COMMAND_WRITTEN + 'driver_stage=execute\ndriver_progress=3\n'


class TestAutoflowSentinelSchema:
    @pytest.mark.parametrize('field', SENTINEL_COMMAND_FIELDS)
    def test_brainstorm_documents_command_written_field(self, field):
        assert field in read_command('ec-brainstorm.md')

    @pytest.mark.parametrize('field', SENTINEL_DRIVER_FIELDS)
    def test_brainstorm_documents_driver_written_field(self, field):
        assert field in read_command('ec-brainstorm.md')

    def test_brainstorm_keeps_staleness_wording(self):
        assert '2 hours' in read_command('ec-brainstorm.md')

    def test_feature_advances_stage_to_execute(self):
        assert 'f["stage"] = "execute"' in read_command('ec-feature.md')

    def test_execute_advances_stage_to_review(self):
        assert 'f["stage"] = "review"' in read_command('ec-execute.md')

    def test_review_documents_no_git_routing(self):
        assert 'never routes to' in read_command('ec-review.md')

    @pytest.mark.parametrize('name', AUTOFLOW_COMMANDS)
    def test_command_still_references_sentinel_path(self, name):
        assert '.claude/.autoflow' in read_command(name)

    @pytest.mark.parametrize('name', ['ec-feature.md', 'ec-execute.md', 'ec-review.md'])
    def test_command_keeps_detection_idiom(self, name):
        assert 'AUTOFLOW=".claude/.autoflow"' in read_command(name)

    @pytest.mark.parametrize('name', ['ec-feature.md', 'ec-execute.md', 'ec-review.md'])
    def test_command_keeps_branch_extraction_idiom(self, name):
        assert "grep '^branch=' \"$AUTOFLOW\"" in read_command(name)

    def test_branch_extraction_survives_command_written_fields(self):
        match = re.search(r'^branch=(.*)$', BODY_COMMAND_WRITTEN, re.M)
        assert match.group(1) == 'main'

    def test_branch_extraction_survives_driver_written_fields(self):
        match = re.search(r'^branch=(.*)$', BODY_WITH_DRIVER_FIELDS, re.M)
        assert match.group(1) == 'main'

    def test_branch_is_first_line_of_sentinel(self):
        assert BODY_COMMAND_WRITTEN.split('\n')[0] == 'branch=main'

    def test_sentinel_writer_emits_five_command_written_lines(self):
        assert BODY_COMMAND_WRITTEN.count('\n') == 5

    def test_brainstorm_writer_matches_command_written_body(self):
        content = read_command('ec-brainstorm.md')
        assert 'stage=feature\\nstages_done=\\niterations=0\\n' in content

    def test_brainstorm_forbids_commands_writing_driver_fields(self):
        content = read_command('ec-brainstorm.md')
        assert 'those belong to the driver alone' in content
