"""Repo guards for the Workbench v2 Design Contract.

Task 14. The Contract's copy, its two declared deviations, its ban on the
mockup's sample data, and the token discipline that makes the palette match
are all plain strings in TSX. Nothing in the build fails on any of them: a
reworded placeholder, a restored `Explore` label, a hardcoded `orbit-web` or
a raw hex colour all compile, type-check and render. Only a string check
catches the drift.
"""

import os
import re

SRC = os.path.join(os.path.dirname(__file__), '..', 'studio', 'src')


def _read(*parts):
    with open(os.path.join(SRC, *parts), encoding='utf-8', errors='replace') as fh:
        return fh.read()


class TestContractCopy:
    """The mockup's strings are the spec. A reworded placeholder is the
    cheapest way for this UI to drift away from the design it was built to
    match, and it drifts without a single failing check."""

    def test_rail_copy(self):
        rail = _read('components', 'workspace-rail.tsx')
        assert 'Find a project…' in rail
        assert 'WORKSPACE' in rail
        assert 'Add project' in rail

    def test_activity_copy(self):
        panel = _read('components', 'project-activity.tsx')
        assert 'Project activity' in panel
        assert 'Everything moving forward.' in panel
        assert 'Recent history' in panel
        assert 'View all' in panel
        # The card's title is JSX, where the ampersand is written as an
        # entity. Matching the plain `&` form would report the card missing
        # while it is on screen.
        assert 'Project &amp; Git' in panel

    def test_composer_copy(self):
        composer = _read('components', 'composer.tsx')
        assert 'What would you like to build next?' in composer
        assert 'Enter to send · Shift + Enter for a new line' in composer


class TestDeclaredDeviations:
    """Two places where the build deliberately departs from the mockup, both
    recorded in the Design Contract. A silent reversal to the mockup's wording
    would mislabel the user's own /ec-* chain with four generic stage names,
    and would put a model selector on a composer that cannot know which model
    the agent is running."""

    def test_flow_bar_names_the_real_stages(self):
        flow = _read('components', 'flow-bar.tsx')
        assert 'Brainstorm' in flow and 'Refine' in flow
        assert 'Explore' not in flow

    def test_no_model_selector(self):
        assert 'Claude Sonnet' not in _read('components', 'composer.tsx')


class TestNoFabricatedData:
    """task-panel.tsx:10-30 set the precedent: show a value only when it is
    real. The mockup's names and numbers are sample data, and sample data that
    reaches a component looks exactly like a working feature until the user
    opens their own project and reads someone else's branch name."""

    SAMPLES = ['Jamie Smith', 'orbit-web', 'atlas-api', 'Website · main', 'Backend service']

    def test_mockup_sample_data_is_not_hardcoded(self):
        for name in ('workspace-rail.tsx', 'project-activity.tsx', 'composer.tsx',
                     'project-sidebar.tsx'):
            body = _read('components', name)
            for sample in self.SAMPLES:
                assert sample not in body, f'{name} hardcodes {sample!r}'

    def test_composer_sends_through_the_real_api(self):
        assert 'ptyWrite' in _read('components', 'composer.tsx'), (
            'a composer that only looks like it sends is the fabrication this '
            'Contract refuses everywhere else; the send path is ptyWrite')


class TestTokenDiscipline:
    """The palette already matches the mockup because every colour in the
    components is a theme token. One raw hex is how that silently stops being
    true: it renders a near-identical navy that no longer tracks the token it
    was copied from, so the next token change leaves it behind."""

    def test_no_raw_hex_in_components(self):
        root = os.path.join(SRC, 'components')
        offenders = []
        scanned = 0
        for name in sorted(os.listdir(root)):
            if not name.endswith('.tsx'):
                continue
            scanned += 1
            with open(os.path.join(root, name), encoding='utf-8', errors='replace') as fh:
                if re.search(r'#[0-9a-fA-F]{6}\b', fh.read()):
                    offenders.append(name)
        assert scanned > 20, (
            f'only {scanned} component(s) scanned -- the listing stopped '
            'resolving and this guard would pass over nothing')
        assert not offenders, f'raw hex colours in: {offenders}'
