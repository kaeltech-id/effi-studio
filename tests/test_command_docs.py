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

    def test_commands_table_has_every_installed_command(self):
        for cmd in ['/ec-setup', '/ec-brainstorm', '/ec-plan', '/ec-refine',
                    '/ec-execute', '/ec-review', '/ec-git', '/ec-selfhealing']:
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

ALL_FRONTEND_AGENTS = FRONTEND_AGENTS + ['ec-tailwind']


def read_agent(name):
    with open(os.path.join(AGENTS_DIR, name + '.md')) as f:
        return f.read()


class TestDesignContractChain:
    def test_brainstorm_emits_contract(self):
        content = read_command('ec-brainstorm.md')
        assert '## Design Contract' in content
        assert '## Design Direction' in content

    def test_feature_builds_and_tags_contract(self):
        content = read_command('ec-plan.md')
        assert '### Design Contract' in content
        assert '[design: {source}#{frame}]' in content
        assert 'not determinable from reference' in content

    def test_execute_injects_contract(self):
        content = read_command('ec-execute.md')
        assert '### Design Block Injection' in content
        assert 'Deviation:' in content

    def test_design_tag_follows_agent_tag(self):
        content = read_command('ec-plan.md')
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


# --- Design Direction chain + anti-slop precedence ---

class TestDesignDirectionChain:
    def test_brainstorm_emits_direction(self):
        content = read_command('ec-brainstorm.md')
        assert '## Design Direction' in content
        assert 'never both' in content

    def test_feature_documents_mutual_exclusivity(self):
        content = read_command('ec-plan.md')
        assert '### Design Direction' in content
        assert content.count('never both') >= 2

    def test_execute_injects_either_block(self):
        content = read_command('ec-execute.md')
        assert '### Design Block Injection' in content
        assert '### Design Direction' in content
        assert '### Design Contract' in content

    def test_review_gate_is_conditional(self):
        content = read_command('ec-review.md')
        assert '### Anti-Slop (if the plan has a Design Direction)' in content
        assert 'Skip this gate entirely when the plan has a Design Contract' in content

    def test_antislop_agent_has_dials_and_tiers(self):
        content = read_agent('ec-antislop')
        for section in ['## Dials', '## Hard Gates', '## Purpose Gates',
                        '## Quality Locks', '## Reporting']:
            assert section in content, section
        for dial in ['ENERGY', 'RHYTHM', 'MOTION']:
            assert dial in content, dial

    def test_antislop_attributes_upstream(self):
        assert 'anti-slop' in read_agent('ec-antislop')

    def test_antislop_installed(self):
        with open(os.path.join(os.path.dirname(__file__), '..', 'install.sh')) as f:
            assert 'ec-antislop' in f.read()

    def test_all_frontend_agents_state_precedence(self):
        for agent in ALL_FRONTEND_AGENTS:
            content = read_agent(agent)
            assert '## Anti-Slop Precedence' in content, agent
            assert content.index('## Anti-Slop Precedence') < \
                content.index('## Visual Fidelity Protocol'), agent

    def test_frontend_agents_did_not_bloat(self):
        for agent in ALL_FRONTEND_AGENTS:
            lines = len(read_agent(agent).splitlines())
            assert lines <= 90, f'{agent} grew to {lines} lines'

    def test_direction_path_defines_design_tag_source(self):
        content = read_command('ec-plan.md')
        assert content.count('literal `direction`') == 2
        assert '[design: direction#SettingsPanel]' in content

    def test_execute_direction_branch_expects_direction_source(self):
        content = read_command('ec-execute.md')
        assert 'so there is no image to open' in content

    def test_antislop_referenced_by_installed_path(self):
        for name in ['ec-brainstorm.md', 'ec-plan.md', 'ec-execute.md']:
            content = read_command(name)
            assert '~/.claude/agents/ec-antislop.md' in content, name
        for agent in ALL_FRONTEND_AGENTS:
            assert '~/.claude/agents/ec-antislop.md' in read_agent(agent), agent


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
        content = read_command('ec-plan.md')
        assert '## Step 2.5 — Grounding Pass' in content
        assert '### Grounding' in content

    def test_feature_grounding_is_read_only(self):
        content = read_command('ec-plan.md')
        assert 'read-only' in content
        assert 'MUST NOT run any command that writes' in content

    def test_feature_task_template_has_new_fields(self):
        content = read_command('ec-plan.md')
        for field in ['- Anchor:', '- Do not touch:', '- Acceptance:', '- Rollback:']:
            assert field in content, field

    def test_feature_states_traceability_rule(self):
        content = read_command('ec-plan.md')
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
        assert '### Design Block Injection' in content


# --- Auto-flow sentinel schema + backward compatibility ---

SENTINEL_COMMAND_FIELDS = ['stage=', 'stages_done=', 'iterations=']

SENTINEL_DRIVER_FIELDS = ['driver_stage', 'driver_progress']

AUTOFLOW_COMMANDS = ['ec-brainstorm.md', 'ec-plan.md', 'ec-refine.md',
                     'ec-execute.md', 'ec-review.md']

BODY_COMMAND_WRITTEN = 'branch=main\ncreated=123\nstage=plan\nstages_done=\niterations=0\n'

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
        assert 'f["stage"] = "refine"' in read_command('ec-plan.md')

    def test_execute_advances_stage_to_review(self):
        assert 'f["stage"] = "review"' in read_command('ec-execute.md')

    def test_review_documents_no_git_routing(self):
        assert 'never routes to' in read_command('ec-review.md')

    @pytest.mark.parametrize('name', AUTOFLOW_COMMANDS)
    def test_command_still_references_sentinel_path(self, name):
        assert '.claude/.autoflow' in read_command(name)

    @pytest.mark.parametrize('name', ['ec-plan.md', 'ec-execute.md', 'ec-review.md'])
    def test_command_keeps_detection_idiom(self, name):
        assert 'AUTOFLOW=".claude/.autoflow"' in read_command(name)

    @pytest.mark.parametrize('name', ['ec-plan.md', 'ec-execute.md', 'ec-review.md'])
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
        assert 'stage=plan\\nstages_done=\\niterations=0\\n' in content

    def test_brainstorm_forbids_commands_writing_driver_fields(self):
        content = read_command('ec-brainstorm.md')
        assert 'those belong to the driver alone' in content


# --- Exception-only fields + verify split in ec-plan.md ---

class TestFeatureTemplateRules:
    def setup_method(self):
        self.content = read_command('ec-plan.md')

    def test_feature_template_has_no_default_rollback(self):
        """Exception-only fields must not ship with their defaults."""
        assert 'Breaking change: {description or "none"}' not in self.content
        assert 'or "new file"' not in self.content
        assert 'git checkout -- {file}' not in self.content
        assert '**Exception-only fields.**' in self.content

    def test_feature_template_declares_verify_split(self):
        """Both verify kinds must be documented."""
        assert '- Verify (local):' in self.content
        assert '- Verify (global):' in self.content

    def test_feature_template_requires_honest_dependencies(self):
        """The fabricated Task N-1 chain must be explicitly forbidden."""
        assert '**Honest dependencies.**' in self.content
        assert 'no fabricated Task N-1 chain' in self.content

    def test_feature_self_review_checklist_has_twenty_items(self):
        """The Step 4 checklist must keep all 20 rules."""
        start = self.content.index('## Step 4 — Self-Review Before Presenting')
        end = self.content.index('## Step 5 — Save Feature Intent to Memory')
        items = [line for line in self.content[start:end].splitlines()
                 if line.startswith('- [ ]')]
        assert len(items) == 20, f'checklist has {len(items)} items'


# --- Ranged reads, fusion and evidence rules in ec-execute.md ---

class TestExecuteTemplateRules:
    def setup_method(self):
        self.content = read_command('ec-execute.md')

    def test_execute_does_not_forward_memory_snippets(self):
        """Injection must not be multiplied by the task count."""
        assert 'Pass relevant snippets into each subagent' not in self.content
        assert 'Do NOT forward memory or docs snippets' in self.content

    def test_execute_uses_ranged_plan_reads(self):
        """A large plan must not be ingested in full per task."""
        assert 'Do not read `### Per Task Detail` in full' in self.content

    def test_execute_declares_colocation_fusion(self):
        """Consecutive same-file tasks fuse into one execution unit."""
        assert 'Fuse CONSECUTIVE' in self.content
        assert 'A fusion run STOPS at' in self.content
        for stop in ['`GATE`', 'Verify (global)', '`Dependencies:` edge pointing outside']:
            assert stop in self.content, stop

    def test_execute_forbids_global_invariant_as_local_evidence(self):
        """'The project still compiles' is not task-level evidence."""
        assert 'is not evidence that this task is correct' in self.content


# --- Definitive gate, plan lint and scope boundary in ec-review.md ---

class TestReviewTemplateRules:
    def setup_method(self):
        self.content = read_command('ec-review.md')

    def test_review_has_plan_lint_and_evidence_audit(self):
        """Review must flag default-valued fields and audit [x] claims."""
        assert '### Plan lint — exception-only fields' in self.content
        assert 'a default value IS the defect' in self.content
        assert '### Evidence audit' in self.content
        assert 're-run the local verify' in self.content

    def test_review_has_definitive_gate_and_scope_boundary(self):
        """Global invariants run once, here; scope is bounded by the plan."""
        assert '### Definitive global gate' in self.content
        assert 'this is the authoritative gate' in self.content
        assert '### Scope boundary' in self.content
        assert 'git status --short' in self.content


RETIRED_COMMANDS = ['/ec-mode', '/ec-next', '/ec-export', '/ec-import',
                    '/ec-feature', '/ec-design']

# tests/ is deliberately excluded: the retired names live there as fixture
# data, including inside this very test, so a repo-wide sweep would fail on
# its own input.
SWEEP_DIRS = ['commands', 'hooks']
SWEEP_FILES = ['README.md', 'CLAUDE.md', 'install.sh']


def _repo(*parts):
    return os.path.join(os.path.dirname(__file__), '..', *parts)


class TestStudioFlowBarCommands:
    """The flow bar types these strings into a live session. A command renamed
    in commands/ and not here would type one that does not exist."""

    CHAIN = ['/ec-brainstorm', '/ec-plan', '/ec-refine',
             '/ec-execute', '/ec-review', '/ec-git']

    def _named(self):
        with open(_repo('studio', 'src', 'lib', 'flow.ts')) as f:
            return re.findall(r"command: '(/ec-[a-z-]+)'", f.read())

    def test_every_named_command_exists(self):
        named = self._named()
        assert named, 'no FLOW_STEPS command literals found in flow.ts'
        for cmd in named:
            path = _repo('commands', cmd.lstrip('/') + '.md')
            assert os.path.isfile(path), (
                f'{cmd} is named by the flow bar but {path} is absent')

    def test_chain_is_complete_and_in_order(self):
        assert self._named() == self.CHAIN


class TestRetiredCommandsFullyRemoved:
    """ec-design proved a rename without a reference sweep leaves debris: the
    file stayed installed on every upgraded machine because LEGACY_COMMANDS
    removed "design" but not "ec-design"."""

    def test_no_shipped_file_references_a_retired_command(self):
        offenders = []
        targets = [_repo(f) for f in SWEEP_FILES]
        for d in SWEEP_DIRS:
            for root, _, names in os.walk(_repo(d)):
                targets += [os.path.join(root, n) for n in names
                            if n.endswith(('.md', '.py'))]
        for path in targets:
            with open(path) as f:
                body = f.read()
            for cmd in RETIRED_COMMANDS:
                if cmd in body:
                    offenders.append(f'{os.path.relpath(path, _repo())}: {cmd}')
        assert not offenders, 'Retired commands still referenced: ' + ', '.join(offenders)

    def test_legacy_commands_covers_every_retired_command(self):
        with open(_repo('install.sh')) as f:
            body = f.read()
        legacy = re.search(r'^LEGACY_COMMANDS=\((.*?)\)$', body, re.M | re.S)
        assert legacy, 'LEGACY_COMMANDS array not found in install.sh'
        listed = re.findall(r'"([^"]+)"', legacy.group(1))
        for cmd in RETIRED_COMMANDS:
            name = cmd.lstrip('/')
            assert name in listed, (
                f'{name} is retired but LEGACY_COMMANDS would leave it '
                f'installed on every upgraded machine')

    def test_installed_commands_are_exactly_the_eight(self):
        with open(_repo('install.sh')) as f:
            body = f.read()
        arr = re.search(r'^COMMANDS=\((.*?)\)$', body, re.M | re.S)
        assert arr, 'COMMANDS array not found in install.sh'
        assert re.findall(r'"([^"]+)"', arr.group(1)) == [
            'ec-setup', 'ec-brainstorm', 'ec-plan', 'ec-refine',
            'ec-execute', 'ec-review', 'ec-git', 'ec-selfhealing']
