"""Repo guards for Studio invariants that nothing else can fail on.

Tasks 116, 122 and 126. Each of these invariants already held when this file
was written; the point is that none of them could FAIL before it. An invariant
with no test is a convention, and conventions drift silently.
"""

import json
import os
import re

import pytest


def _repo(*parts):
    return os.path.join(os.path.dirname(__file__), '..', *parts)


def _read(*parts):
    with open(_repo(*parts), encoding='utf-8', errors='replace') as f:
        return f.read()


def _walk(target, exts):
    """Every file under `target` with one of `exts`, skipping build output."""
    path = _repo(target)
    if os.path.isfile(path):
        yield path
        return
    for root, dirs, names in os.walk(path):
        dirs[:] = [d for d in dirs
                   if d not in {'node_modules', 'target', '.git', 'dist'}]
        for n in names:
            if os.path.splitext(n)[1] in exts:
                yield os.path.join(root, n)


# ─── Task 122: every command name a shipped surface types must exist ─────────

# tests/test_command_docs.py already sweeps commands/ and hooks/ for the six
# KNOWN-retired names. Two gaps it leaves, both of which shipped a real defect:
#
#   1. It does not look at studio/src at all. The /ec-feature reference that
#      reached task-panel.tsx:31 sat in the Studio frontend, so that sweep ran
#      green over it.
#   2. It is a blocklist. An INVENTED name has never been retired, so it is not
#      on the list -- /ec-setup-check, /ec-devices-check and /ec-build all
#      appear in the design package as proposals and would ship unnoticed.
#
# This guard is the positive form: a command reference must resolve to a file in
# commands/, whatever it is called.

# A command reference, not a path segment. The character before "/" must not
# continue a path (so agents/ec-react.md and design/effi-studio-v2 are not
# command references), and the name is post-filtered below rather than fenced
# with a lookahead -- a trailing lookahead lets the engine backtrack one
# character and match "/ec-revie" out of "/ec-review.", which is a bug that
# reports a defect that is not there.
_COMMAND_REF = re.compile(r'(?<![A-Za-z0-9_.~-])/((?:ec|effi)-[a-z0-9][a-z0-9-]*)')

# A "." followed by one of these is a filename, not the end of a sentence.
_EXTENSIONS = ('md', 'ts', 'tsx', 'rs', 'py', 'sh', 'json', 'css', 'html',
               'toml', 'svg', 'png', 'lock', 'jsonl')

# Shipped surfaces. tests/ is excluded for the reason test_command_docs.py
# states: retired names live there as fixture data, including in this file.
# The .claude/ working directories and design/ are excluded because they are
# RECORDS -- an archived plan or a brainstorm that mentions /ec-feature is
# describing history accurately, and rewriting history to please a linter is
# worse than the drift it would prevent.
_LIVE_SURFACES = [
    ('studio/src', {'.ts', '.tsx'}),
    ('studio/src-tauri/src', {'.rs'}),
    ('commands', {'.md'}),
    ('agents', {'.md'}),
    ('hooks', {'.py', '.md'}),
    ('server', {'.py'}),
    ('shell', {'.sh', '.py'}),
    ('launchers', {'.sh', '.py'}),
    ('install.sh', {'.sh'}),
    ('README.md', {'.md'}),
    ('CLAUDE.md', {'.md'}),
]


def _real_commands():
    return {n[:-3] for n in os.listdir(_repo('commands')) if n.endswith('.md')}


def _command_references():
    """(name, 'relpath:line') for every command reference in a live surface."""
    found = []
    for target, exts in _LIVE_SURFACES:
        if not os.path.exists(_repo(target)):
            continue
        for path in _walk(target, exts):
            text = open(path, encoding='utf-8', errors='replace').read()
            for m in _COMMAND_REF.finditer(text):
                name = m.group(1).rstrip('-')
                after = text[m.end():m.end() + 12]
                if after.startswith('/'):
                    continue                      # a directory
                if after.startswith('.') and after[1:].split('/')[0].split('"')[0].rstrip(',;:)\'`').split()[0:1] and \
                   any(after[1:].startswith(e) for e in _EXTENSIONS):
                    continue                      # a filename
                line = text.count('\n', 0, m.start()) + 1
                found.append((name, f'{os.path.relpath(path, _repo())}:{line}'))
    return found


class TestCommandNamesResolve:

    def test_the_sweep_actually_sees_the_real_commands(self):
        """A regex that matches nothing would make every test below vacuous.
        Three of these guards passed as false greens earlier in this project
        for exactly that reason, so the sweep proves it has teeth first."""
        names = {n for n, _ in _command_references()}
        real = _real_commands()
        assert len(real) == 8, f'expected 8 commands on disk, found {sorted(real)}'
        missing = real - names
        assert not missing, (
            'the sweep found no reference to ' + ', '.join(sorted(missing)) +
            ' -- it is matching too little to catch anything')

    def test_every_referenced_command_exists_on_disk(self):
        real = _real_commands()
        offenders = sorted({f'/{n} at {w}' for n, w in _command_references()
                            if n not in real})
        assert not offenders, (
            'These names are typed by a shipped surface but no file backs them '
            'in commands/:\n  ' + '\n  '.join(offenders))

    def test_the_effi_prefix_is_never_a_command(self):
        """The command prefix is ec-. An /effi-* name has never been a command,
        so it is always either a typo or an invention."""
        offenders = sorted({f'/{n} at {w}' for n, w in _command_references()
                            if n.startswith('effi-')})
        assert not offenders, (
            'The command prefix is ec-, not effi-:\n  ' + '\n  '.join(offenders))

    def test_studio_frontend_is_inside_the_swept_set(self):
        """The guard this one supplements excluded studio/src, which is where
        the /ec-feature defect actually lived. If that coverage is ever dropped
        this test says so instead of going quietly green."""
        swept = {t for t, _ in _LIVE_SURFACES}
        assert 'studio/src' in swept
        files = list(_walk('studio/src', {'.ts', '.tsx'}))
        assert len(files) > 20, f'only {len(files)} frontend files swept'


# ─── Task 126: install.sh and the directories it installs from agree ─────────

class TestInstallerComponentParity:
    """install.sh rejects an unknown --only component with `fail`, so a flag
    Studio can send that the installer does not know is not a degraded install:
    it is a hard failure in front of the user. Nothing checked that pairing."""

    def _bash_array(self, name):
        body = _read('install.sh')
        m = re.search(r'^%s=\((.*?)\)$' % re.escape(name), body, re.M | re.S)
        assert m, f'{name} array not found in install.sh'
        return re.findall(r'"([^"]+)"', m.group(1))

    def _setup_rs_flags(self):
        """Every string installer_flags() in setup.rs can return."""
        body = _read('studio', 'src-tauri', 'src', 'setup.rs')
        m = re.search(r'fn installer_flags\(.*?\n\}', body, re.S)
        assert m, 'installer_flags not found in setup.rs'
        return set(re.findall(r'"([a-z]+)"', m.group(0)))

    def test_every_flag_studio_can_send_is_one_install_sh_accepts(self):
        known = set(self._bash_array('INSTALL_COMPONENTS')) | \
                set(self._bash_array('EXTERNAL_COMPONENTS'))
        emitted = self._setup_rs_flags()
        assert emitted, 'no flags parsed out of installer_flags'
        unknown = sorted(emitted - known)
        assert not unknown, (
            'setup.rs can pass ' + ', '.join(unknown) +
            ' but install.sh fails on an unknown component, so this selection '
            'would abort the install in front of the user')

    def test_installed_commands_match_the_commands_directory(self):
        """The existing parity test compares install.sh to a hardcoded list, so
        adding commands/ec-foo.md without touching install.sh stays green and
        simply never installs the new command."""
        assert sorted(self._bash_array('COMMANDS')) == sorted(_real_commands())

    def test_installed_agents_match_the_agents_directory(self):
        on_disk = sorted(n[:-3] for n in os.listdir(_repo('agents'))
                         if n.endswith('.md'))
        assert sorted(self._bash_array('AGENTS')) == on_disk

    def test_installed_hook_files_exist(self):
        for f in self._bash_array('HOOK_FILES'):
            assert os.path.isfile(_repo('hooks', f)), \
                f'install.sh fetches hooks/{f} but it is not in the repo'

    def test_installed_server_files_exist(self):
        for f in self._bash_array('SERVER_FILES'):
            assert os.path.isfile(_repo('server', f)), \
                f'install.sh fetches server/{f} but it is not in the repo'

    def test_the_three_never_selected_components_stay_unreachable(self):
        """hooks, optimizer and daemon write to ~/.claude/settings.json and
        install a daemon. A bare install.sh still does all three -- that is the
        documented legacy path -- but no component a user can tick may ask for
        them."""
        emitted = self._setup_rs_flags()
        installable = set(self._bash_array('INSTALL_COMPONENTS'))
        for name in ('hooks', 'optimizer', 'daemon'):
            assert name in installable, \
                f'{name} vanished from INSTALL_COMPONENTS; the legacy path changed'
            assert name not in emitted, (
                f'installer_flags can now request {name}, which a per-component '
                f'selection must never be able to do')


# ─── Task 116: terminal input and live-region discipline ────────────────────

class TestTerminalInputDiscipline:
    """Three call sites may put bytes into a PTY, and each is a deliberate user
    action: the user's own keystrokes, the flow bar typing a command the user
    pressed, and the workbench composer sending a message the user typed and
    submitted. A fourth would mean some surface can type into a running
    /ec-execute without the user asking it to.

    The composer was admitted with Workbench v2. It is the same intent as the
    terminal — a person addressing the agent — through a different surface, and
    it writes only inside its own submit handler, never on a timer, a mount, or
    a model response."""

    WRITERS = {'studio/src/App.tsx', 'studio/src/components/terminal-pane.tsx',
               'studio/src/components/composer.tsx'}
    WRAPPER = 'studio/src/lib/tauri-api.ts'

    def _callers(self):
        out = set()
        for path in _walk('studio/src', {'.ts', '.tsx'}):
            if 'ptyWrite' in open(path, encoding='utf-8', errors='replace').read():
                out.add(os.path.relpath(path, _repo()).replace(os.sep, '/'))
        return out

    def test_only_the_two_known_surfaces_write_to_a_pty(self):
        callers = self._callers() - {self.WRAPPER}
        assert callers == self.WRITERS, (
            'PTY writers changed.\n  expected: ' + ', '.join(sorted(self.WRITERS)) +
            '\n  found:    ' + ', '.join(sorted(callers)) +
            '\nA new writer can type into a running session; justify it here.')

    def test_the_wrapper_is_the_only_definition(self):
        assert self.WRAPPER in self._callers()
        body = _read('studio', 'src', 'lib', 'tauri-api.ts')
        assert body.count("invoke<void>('pty_write'") == 1


class TestLiveRegionDiscipline:
    """Terminal output must never reach a live region. A screen reader cannot
    be made to read a build log as it scrolls; it would announce bytes forever
    and bury everything else the user asked for."""

    FORBIDDEN = [
        'studio/src/components/terminal-pane.tsx',
        'studio/src/components/task-panel.tsx',
        'studio/src/components/history-panel.tsx',
        'studio/src/components/workbench.tsx',
        'studio/src/components/agent-session-pane.tsx',
    ]

    @pytest.mark.parametrize('rel', FORBIDDEN)
    def test_no_live_region_on_a_streaming_surface(self, rel):
        path = _repo(rel)
        if not os.path.isfile(path):
            pytest.skip(f'{rel} not present')
        body = open(path, encoding='utf-8', errors='replace').read()
        for attr in ('aria-live=', 'role="alert"', 'role="status"', 'role="log"'):
            assert attr not in body, f'{rel} announces streaming content ({attr})'

    def test_live_regions_elsewhere_stay_countable(self):
        """Not a ban everywhere -- the setup summary legitimately announces one
        composed sentence when the selection changes. Pinning the count means a
        new one has to be looked at rather than absorbed."""
        sites = []
        for path in _walk('studio/src', {'.ts', '.tsx'}):
            body = open(path, encoding='utf-8', errors='replace').read()
            n = body.count('aria-live=')
            if n:
                sites.append((os.path.relpath(path, _repo()).replace(os.sep, '/'), n))
        assert sorted(sites) == [('studio/src/components/choose-tools.tsx', 1)], (
            'live regions changed: ' + repr(sites))

def _strip_comments(text):
    """Remove // line comments, /* block */ comments and JSX {/* */} comments.

    Four times in this feature a file-level grep flagged a COMMENT as code: a
    comment reading "No `aria-live` here", one explaining why `outline-none` is
    omitted, and one reading "No `behavior: 'smooth'` -- MOTION 1 forbids the
    animation". A check that cannot tell a prohibition from a violation reports
    the opposite of the truth, so anything matching on whole files strips them
    first. String literals are left alone: a prohibited token inside a rendered
    string is a real finding.
    """
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'(?m)^\s*//.*$|(?<=[;,)}\s])//[^\n]*$', '', text)


class TestMotionDiscipline:
    """Task 117. Motion is 120-160ms, reduced motion is honoured, and nothing
    animates to imply activity that cannot be observed."""

    def _sources(self):
        for path in _walk('studio/src', {'.ts', '.tsx'}):
            body = open(path, encoding='utf-8', errors='replace').read()
            yield (os.path.relpath(path, _repo()).replace(os.sep, '/'),
                   _strip_comments(body))

    def test_every_duration_is_in_the_120_to_160ms_band(self):
        out = []
        for rel, code in self._sources():
            for d in re.findall(r'duration-\[?(\d+)m?s?\]?', code):
                if not 120 <= int(d) <= 160:
                    out.append(f'{rel}: duration-{d}')
        assert not out, 'durations outside 120-160ms: ' + ', '.join(out)

    # Surfaces that scroll on their OWN, without the user asking: a plan
    # checklist advancing, a history list growing, terminal bytes arriving.
    # Animating those takes the reading position away from someone who is
    # trying to read something else, which is the "aggressive autoscroll" the
    # motion contract names.
    SELF_SCROLLING = (
        'studio/src/components/task-panel.tsx',
        'studio/src/components/history-panel.tsx',
        'studio/src/components/workbench.tsx',
        'studio/src/components/terminal-pane.tsx',
        'studio/src/components/tab-strip.tsx',
        'studio/src/components/agent-session-pane.tsx',
    )

    def test_no_animated_autoscroll_in_a_self_scrolling_surface(self):
        out = [rel for rel, code in self._sources()
               if rel in self.SELF_SCROLLING and 'smooth' in code]
        assert not out, (
            'these surfaces scroll without being asked, so an animated scroll '
            'takes the reading position: ' + ', '.join(out))

    def test_any_smooth_scroll_is_gated_on_the_motion_preference(self):
        """A user-initiated jump may animate -- the user asked to move, and it
        does not steal a position they were holding. It must still honour the
        preference, and the CSS net cannot do it: `scroll-behavior` set from
        JavaScript as a scrollIntoView option is not reachable by a stylesheet.
        So the gate has to be in the call itself."""
        for rel, code in self._sources():
            if 'smooth' not in code:
                continue
            assert 'prefers-reduced-motion' in code, (
                f'{rel} scrolls smoothly without consulting the preference')

    def test_every_animation_and_transition_is_guarded(self):
        """Per-utility guards are the mechanism; styles.css is only the net."""
        out = []
        for rel, code in self._sources():
            trans = len(re.findall(
                r'(?<!motion-reduce:)transition-(?:colors|opacity|transform|all|\[)', code))
            guard = code.count('motion-reduce:transition-none')
            anim = len(re.findall(
                r'(?<!motion-reduce:)animate-(?:spin|pulse|bounce|ping)', code))
            aguard = code.count('motion-reduce:animate-none')
            if trans > guard or anim > aguard:
                out.append(f'{rel} (transitions {trans}/{guard}, animations {anim}/{aguard})')
        assert not out, 'unguarded motion in: ' + ', '.join(out)

    def test_the_task_checklist_never_animates(self):
        """A pulse on a task list implies the app is watching work happen. It
        is read-only: the CLI is the sole writer of the plan file."""
        code = _strip_comments(_read('studio', 'src', 'components', 'task-panel.tsx'))
        assert not re.search(r'animate-\w+', code)

    def test_the_stylesheet_carries_the_net_and_one_named_duration(self):
        css = _read('studio', 'src', 'styles.css')
        assert css.count('prefers-reduced-motion') == 1
        m = re.search(r'--duration-ui:\s*(\d+)ms', css)
        assert m, 'no --duration-ui token in styles.css'
        assert 120 <= int(m.group(1)) <= 160


class TestWorkflowDispatchIsAddressed:
    """Task 78. A workflow command is typed into a real session as if the user
    had typed it, so a command that lands in the wrong surface is not a cosmetic
    bug -- it puts `/ec-execute` into a shell, a Codex REPL or nothing at all.

    The invariant is structural rather than defensive: `FlowBar` takes
    `target: FlowTarget | null`, and null renders no command buttons AT ALL --
    not dimmed, absent -- so there is no code path that can dispatch without a
    destination. These tests are what makes that arrangement able to fail.
    """

    def _flow_bar(self):
        return _strip_comments(_read('studio', 'src', 'components', 'flow-bar.tsx'))

    def _app(self):
        return _strip_comments(_read('studio', 'src', 'App.tsx'))

    def _agents_rs(self):
        return _read('studio', 'src-tauri', 'src', 'agents.rs')

    def test_no_untargeted_dispatch_remains(self):
        """The shape Task 78 names: a dispatch reading "whatever is current"."""
        assert 'onDispatch?.(textFor(s))' not in self._flow_bar()

    def test_every_dispatch_passes_the_targets_own_session_id(self):
        calls = re.findall(r'onDispatch\(([^)]*)\)', self._flow_bar())
        calls = [c for c in calls if 'sessionId' in c or 'text' in c]
        assert calls, 'no onDispatch call found in flow-bar.tsx'
        for c in calls:
            assert 'target.sessionId' in c, (
                f'onDispatch({c}) does not address the named target; an ambient '
                f'id can land in a surface the user was not told about')

    def test_the_host_requires_an_agent_tab_with_a_declared_adapter(self):
        """Excludes browser, ios, android and shell tabs by TYPE, and any
        provider that has not declared the capability."""
        app = self._app()
        m = re.search(r'flowCapable\s*=\s*\(tab:[^)]*\):\s*boolean\s*=>(.*?);', app, re.S)
        assert m, 'flowCapable not found in App.tsx'
        # Quote style and line wrapping are a formatter's business, not this
        # guard's. Pinning `tab.type === 'agent'` with single quotes made this
        # test fail the moment a formatter rewrote it to double quotes -- the
        # invariant was intact and the guard cried wolf. Normalise both before
        # matching, and match on meaning.
        body = re.sub(r'\s+', ' ', m.group(1)).replace('"', "'")
        assert "tab.type === 'agent'" in body, 'flowCapable does not require an agent tab'
        assert 'workflowAdapter' in body, 'flowCapable does not consult the declared capability'
        assert 'sessionId !== null' in body, 'flowCapable does not require a live session'

    def test_only_claude_code_declares_the_workflow_adapter(self):
        """`workflow_adapter: true` is the single switch that admits a provider
        to the flow. Codex is built in but declares nothing, on the stated rule
        that a capability is declared when its adapter lands, never before."""
        rs = self._agents_rs()
        m = re.search(r'const BUILT_INS:[^=]*=\s*\[(.*?)\n\];', rs, re.S)
        assert m, 'BUILT_INS not found in agents.rs'
        trues = m.group(1).count('workflow_adapter: true')
        assert trues == 1, (
            f'{trues} built-in providers declare workflow_adapter; exactly one '
            f'(Claude Code) has an adapter in this tree')

    def test_the_terminal_declares_nothing_and_is_not_a_provider(self):
        rs = self._agents_rs()
        m = re.search(r'pub fn shell_agent\(\).*?\n\}', rs, re.S)
        assert m, 'shell_agent not found'
        assert 'Capabilities::default()' in m.group(0), (
            'the terminal must declare no capability; a shell that claims the '
            'workflow adapter would receive /ec-execute')
        built = re.search(r'const BUILT_INS:[^=]*=\s*\[(.*?)\n\];', rs, re.S).group(1)
        assert 'SHELL_ID' not in built, (
            'SHELL_ID in BUILT_INS would offer the terminal as an AI provider '
            'in AddToolMenu, in Settings and to the workflow-adapter search')


class TestFocusAffordance:
    """Task 115. `appearance-none` removes the control the browser would have
    drawn, including its focus ring, so a control carrying it must supply one.
    Both onboarding checkboxes shipped with `appearance-none` AND
    `focus-visible:outline-none` and no substitute anywhere in either file --
    zero visible focus indicator on the first screens a new user sees.
    """

    def _class_strings(self):
        """Every class string in code, comments stripped. A file-level grep
        cannot tell a comment from a class list, and that has produced five
        false findings in this feature."""
        for path in _walk('studio/src', {'.tsx'}):
            code = _strip_comments(open(path, encoding='utf-8', errors='replace').read())
            rel = os.path.relpath(path, _repo()).replace(os.sep, '/')
            for m in re.finditer(r'["\'`]([^"\'`]*)["\'`]', code):
                cls = m.group(1)
                if 'focus-visible:' in cls or 'appearance-none' in cls:
                    yield rel, cls

    def test_an_appearance_none_control_supplies_its_own_focus_ring(self):
        out = []
        for rel, cls in self._class_strings():
            if 'appearance-none' not in cls:
                continue
            has = ('focus-visible:ring-' in cls
                   or 'focus-visible:outline-2' in cls
                   or 'peer-focus-visible:' in cls)
            if not has:
                out.append(f'{rel}: {cls[:90]}')
        assert not out, (
            'appearance-none removes the native focus ring, so these controls '
            'have no visible focus at all:\n  ' + '\n  '.join(out))

    def test_outline_none_never_cancels_an_outline_ring(self):
        """Tailwind v4 emits `outline-style: none` for `outline-none`, so the
        two together leave keyboard focus invisible. `outline-none` beside
        `ring-2` is SAFE -- a ring is a box-shadow, not an outline."""
        out = [f'{rel}: {cls[:90]}' for rel, cls in self._class_strings()
               if 'outline-none' in cls and 'outline-2' in cls]
        assert not out, (
            'outline-none cancels the outline ring beside it:\n  ' + '\n  '.join(out))


class TestShellContainment:
    """The app-shell lock. Studio is a window, not a page: before this, nothing
    stopped the document from growing behind a descendant taller than the
    webview, and the user could drag the whole interface off the top of the
    window and sit looking at bare --color-ground. The fix is four class
    strings and two config keys, every one of which a later edit could quietly
    undo -- so each one is asserted here."""

    def _css(self):
        return _read('studio', 'src', 'styles.css')

    def _document_block(self):
        """The `html, body, #root` rule, and nothing else in the file."""
        m = re.search(r'html,\s*body,\s*#root\s*\{(.*?)\}', self._css(), re.S)
        assert m, 'the html, body, #root block is gone from styles.css'
        return m.group(1)

    def test_the_block_matcher_actually_finds_the_rule(self):
        """A regex that matched nothing would make every test below vacuous."""
        assert 'height: 100%' in self._document_block()

    def test_the_document_chain_cannot_scroll(self):
        """Asserted against the DECLARATIONS, not the block text: the comment
        above them names both properties in prose, so a substring check would
        stay green with the rule itself deleted."""
        block = _strip_comments(self._document_block())
        missing = [d for d in ('overflow: hidden;', 'overscroll-behavior: none;')
                   if not re.search(r'(?m)^\s*' + re.escape(d) + r'$', block)]
        assert not missing, (
            'the document would scroll behind the shell again, exposing bare '
            'ground below it: ' + ', '.join(missing))

    def test_the_shell_root_clips_its_children(self):
        """Matched on MEANING, not on the class string in order: quote style,
        wrapping and utility order are a formatter's business, and pinning the
        whole string made an earlier guard in this file cry wolf over an intact
        invariant (see test_studio_guards.py:414-418)."""
        app = _strip_comments(_read('studio', 'src', 'App.tsx'))
        m = re.search(r'<div className="([^"]*bg-ground text-text[^"]*)"', app)
        assert m, 'the shell root element is gone from App.tsx'
        classes = m.group(1).split()
        missing = [c for c in ('h-full', 'overflow-hidden') if c not in classes]
        assert not missing, (
            'the shell root must clip and must measure its own box, not the '
            'viewport: ' + ', '.join(missing))

    def test_no_viewport_unit_sizes_the_shell(self):
        """100vh is not the webview box in WKWebView. The shell measures the
        locked html/body/#root chain instead. Scoped to class strings: the
        comment at the shell root quotes the old utility on purpose."""
        unit = re.compile(r'\b(?:min-|max-)?h-screen\b|\bh-\[100d?vh\]')
        out = []
        for path in _walk('studio/src', {'.ts', '.tsx'}):
            code = _strip_comments(
                open(path, encoding='utf-8', errors='replace').read())
            for hit in set(unit.findall(code)):
                out.append(
                    f'{os.path.relpath(path, _repo()).replace(os.sep, "/")}: {hit}')
        assert not out, (
            'these size the shell by the viewport rather than by the locked '
            'html/body/#root chain: ' + ', '.join(sorted(out)))

    # The floors the layout was actually audited at: 720 sits inside the
    # sub-900px sidebar-drawer band and the sub-1100px inspector-drawer band,
    # and 560 was measured against the workbench chrome. Asserted as VALUES,
    # because `"minWidth": 0` would satisfy the keys and none of the claim.
    MIN_WINDOW = {'minWidth': 720, 'minHeight': 560}

    def test_the_settings_drawer_scrolls_rather_than_clipping(self):
        """The one column that must NOT clip. Its non-shrinkable stack -- close
        header, the installer's `h-64` terminal block, and SettingsPage's own
        heading and jump nav -- is taller than the window minimum, so clipping
        it put every Settings section out of reach once the document lock
        removed the page-scroll fallback. Found in review, after the clip had
        already been applied here."""
        app = _strip_comments(_read('studio', 'src', 'App.tsx'))
        m = re.search(r'className="(flex w-96[^"]*)"', app)
        assert m, 'the settings drawer column is gone from App.tsx'
        classes = m.group(1).split()
        assert 'overflow-y-auto' in classes and 'overflow-hidden' not in classes, (
            'the settings drawer must scroll, not clip: its stack exceeds the '
            f'window minimum and nothing else can reach it -- got {m.group(1)!r}')

    def test_the_add_tool_popover_is_bounded(self):
        """`<main>` clips now, and this popover is inside it with no height of
        its own, so an unbounded menu loses its footer row at small window
        heights with no scroller behind it."""
        menu = _strip_comments(
            _read('studio', 'src', 'components', 'add-tool-menu.tsx'))
        m = re.search(r'absolute top-full[^`"]*', menu)
        assert m, 'the add-tool popover element is gone from add-tool-menu.tsx'
        assert 'max-h-[' in m.group(0) and 'overflow-y-auto' in m.group(0), (
            'the popover needs a height cap and its own scroller, or <main>'
            f"'s clip hides its last rows -- got {m.group(0)!r}")

    # Scroll regions whose last content is NOT focusable, so tabbing to the
    # final button leaves the text below it off screen. With the document
    # locked these need to be focus stops or a keyboard user cannot reach it.
    FOCUSABLE_SCROLLERS = (
        ('studio/src/components/verify-landing.tsx', 'verify-landing-heading'),
        ('studio/src/components/choose-experiences.tsx', 'choose-experiences-heading'),
        ('studio/src/components/choose-experiences.tsx', 'neutral-shell-heading'),
    )

    @pytest.mark.parametrize('rel,heading', FOCUSABLE_SCROLLERS)
    def test_a_page_scroller_is_reachable_from_the_keyboard(self, rel, heading):
        code = _strip_comments(_read(*rel.split('/')))
        m = re.search(r'<section\s+aria-labelledby="' + re.escape(heading)
                      + r'"(.*?)>', code, re.S)
        assert m, f'the section labelled by {heading} is gone from {rel}'
        el = m.group(1)
        assert 'tabIndex={0}' in el, (
            f'{rel}: this region scrolls and its last content is not '
            'focusable, so without a focus stop a keyboard user cannot scroll '
            'to it now that the document cannot move')

    def test_the_window_declares_a_minimum_size(self):
        conf = json.loads(_read('studio', 'src-tauri', 'tauri.conf.json'))
        win = conf['app']['windows'][0]
        bad = []
        for key, floor in self.MIN_WINDOW.items():
            got = win.get(key)
            if not isinstance(got, (int, float)) or got < floor:
                bad.append(f'{key}={got!r} (needs >= {floor})')
        assert not bad, (
            'without a minimum the window can be dragged below what the '
            'breakpoint bands render, and the clip then hides real chrome: '
            + ', '.join(bad))


# ─── Tasks 13 and 14: the navy + cyan palette is the only palette ────────────

_COPPER = re.compile(r'copper', re.I)

# A Tailwind utility role, not a CSS custom property. The role name must start
# a token (so `context-brand-violet` is not a text role), and `brand-` must
# follow it across a single `-`, so the `--color-brand-violet:` declaration in
# styles.css -- where `brand-` is preceded by `color`, which is not a role --
# cannot trip this.
_INTERACTIVE_BRAND = re.compile(
    r'(?<![A-Za-z0-9_-])'
    r'(?:text|border|ring|stroke|divide|outline|caret|placeholder|decoration)'
    r'-brand-(?:violet|blue)')


class TestTheBrandPaletteIsTheOnlyPalette:
    """The rebrand deleted --color-copper outright rather than aliasing it.
    Tailwind resolves an unknown colour to no rule at all, so a surviving
    bg-copper renders transparent and reviews as 'looks fine' on a dark
    surface. Only a string check catches it."""

    def test_no_copper_token_survives_in_studio(self):
        # Scope is studio/ on purpose, not the repo. This file names the
        # retired token in its own docstring and failure message, so a
        # repo-wide sweep would trip on itself.
        offenders = []
        scanned = 0
        for path in _walk('studio',
                          {'.ts', '.tsx', '.css', '.svg', '.py', '.md'}):
            scanned += 1
            with open(path, encoding='utf-8', errors='replace') as f:
                if _COPPER.search(f.read()):
                    offenders.append(os.path.relpath(path, _repo()))
        assert scanned > 20, (
            'only {} file(s) scanned -- the walk stopped resolving and this '
            'guard would pass over nothing'.format(scanned))
        assert not offenders, (
            'the copper palette is gone, so a surviving copper token names a '
            'colour Tailwind cannot resolve and renders as nothing at all: '
            + ', '.join(sorted(offenders)))

    def test_violet_and_blue_never_carry_an_interactive_role(self):
        """#8B5CF6 measures 4.49:1 on navy and #4263EB measures 3.82:1 --
        both below the 4.5:1 AA floor for body text. They are gradient
        colours. The moment one is used as text, a border, an icon stroke or
        a focus ring, the app has an accessibility regression that renders
        perfectly well and is therefore invisible in review."""
        offenders = []
        for path in _walk('studio/src', {'.ts', '.tsx', '.css'}):
            with open(path, encoding='utf-8', errors='replace') as f:
                text = f.read()
            rel = os.path.relpath(path, _repo())
            offenders += [f'{rel}: {hit}'
                          for hit in set(_INTERACTIVE_BRAND.findall(text))]
        assert not offenders, (
            'brand violet and brand blue are gradient and fill colours only; '
            'giving one a text, border, ring, stroke, divide, outline, caret, '
            'placeholder or decoration role drops it below the 4.5:1 AA floor '
            'on navy: ' + ', '.join(sorted(offenders)))


class TestTheMarkHasExactlyOneMaster:
    """studio/src/assets/effi-mark.svg holds the five quadrilaterals of the
    brand mark. Four files carry copies -- a React component that needs
    currentColor, the lockup, the icon source, and an analytic rasteriser in
    Python -- because they span three languages with no shared build step.
    The duplication is justified; its silent drift is not. Nothing else fails
    if one copy is edited alone: the app still builds, the icon still renders,
    and the mark is simply wrong in one place."""

    MASTER = 'studio/src/assets/effi-mark.svg'
    SVG_COPIES = ('studio/src/components/brand-mark.tsx',
                  'studio/src/assets/effi-logo.svg',
                  'studio/icons-src/effi-icon.svg')
    PATH_D = re.compile(r'd="(M[0-9][^"]*Z)"')
    NUM = re.compile(r'-?\d+\.?\d*')

    def _master(self):
        quads = self.PATH_D.findall(_read(self.MASTER))
        assert len(quads) == 5, (
            '{} should hold exactly five quadrilaterals, found {}'.format(
                self.MASTER, len(quads)))
        return quads

    @pytest.mark.parametrize('rel', SVG_COPIES)
    def test_every_svg_copy_is_character_identical(self, rel):
        """Containment, not extraction. Each consumer legitimately holds other
        paths too -- the lockup carries the wordmark letterforms, the icon
        source carries the squircle -- and they are small-coordinate paths like
        the mark, so no coordinate filter separates them. What must hold is
        that the master's five strings appear verbatim, in order."""
        master = self._master()
        body = _read(rel)
        missing = [d for d in master if d not in body]
        assert not missing, (
            '{} has drifted from {} -- {} of 5 quadrilaterals no longer appear '
            'verbatim. Edit the master and re-copy all four consumers '
            'together. Missing: {}'.format(
                rel, self.MASTER, len(missing), '; '.join(missing)))
        order = [body.index(d) for d in master]
        assert order == sorted(order), (
            '{} holds all five quadrilaterals but not in master order (top '
            'bar, fold A, middle bar, fold B, bottom bar); later consumers '
            'copy them positionally.'.format(rel))

    def test_the_rasteriser_carries_the_same_corners(self):
        """mkicon.py stores the corners as Python numbers, so string equality
        cannot be used -- 2.30 in the SVG is 2.3 here. Compare numerically."""
        master = [[float(n) for n in self.NUM.findall(d)]
                  for d in self._master()]
        body = _read('studio/icons-src/mkicon.py')
        start = body.index('QUADS')
        quads_src = body[start:body.index('\n\n', start)]
        nums = [float(n) for n in self.NUM.findall(
            quads_src[quads_src.index('['):])]
        flat = [n for quad in master for n in quad]
        assert nums == flat, (
            'studio/icons-src/mkicon.py QUADS no longer matches {}. The '
            'rasterised icon and the shipped vector would disagree.'.format(
                self.MASTER))
