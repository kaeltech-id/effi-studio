"""Every text/surface pair in the shipped palette must clear WCAG AA.

The palette is read out of styles.css rather than restated here: a test
that hardcodes the hexes passes forever while the app drifts."""

import os
import re

# The four surfaces anything is ever drawn on, and the six colours ever drawn
# as text. `terminal` and `accent-tint` are deliberately absent: accent-tint is
# itself a surface, and `terminal` is only ever drawn on `ground`. `on-accent`
# is the inverse case -- text ON the accent -- and has its own test below.
SURFACES = ('ground', 'surface', 'raised', 'hover')
FOREGROUNDS = ('text', 'muted', 'accent', 'success', 'warning', 'error')

AA = 4.5

# Every literal-hex token the @theme block declares. Named, not valued: this
# list is what stops a vacuous pass. A regex that silently matched nothing, or
# a token renamed out from under the sweep, fails here by name instead of
# leaving the sweep iterating over an empty palette.
DECLARED = (
    'ground', 'surface', 'raised', 'hover', 'border', 'text', 'muted',
    'accent', 'on-accent', 'accent-tint', 'brand-violet', 'brand-blue',
    'success', 'warning', 'error', 'terminal',
)

_CSS = os.path.join(os.path.dirname(__file__), '..', 'studio', 'src', 'styles.css')

# Order-independent and comment-independent: the block is located by name and
# each declaration is matched on its own, so reordering or re-commenting the
# tokens in styles.css cannot change what this parses.
_TOKEN = re.compile(r'--color-([a-z][a-z0-9-]*)\s*:\s*(#[0-9A-Fa-f]{6})\b')
_COMMENT = re.compile(r'/\*.*?\*/', re.S)


def _tokens():
    """Parse --color-NAME: #HEX out of the @theme block."""
    with open(_CSS, encoding='utf-8') as f:
        css = _COMMENT.sub('', f.read())

    start = css.find('@theme')
    assert start != -1, 'no @theme block in {}'.format(_CSS)
    open_brace = css.find('{', start)
    assert open_brace != -1, 'unterminated @theme block in {}'.format(_CSS)

    depth = 0
    end = -1
    for i in range(open_brace, len(css)):
        if css[i] == '{':
            depth += 1
        elif css[i] == '}':
            depth -= 1
            if depth == 0:
                end = i
                break
    assert end != -1, 'unclosed @theme block in {}'.format(_CSS)

    tokens = {name: hexval
              for name, hexval in _TOKEN.findall(css[open_brace:end])}

    missing = [n for n in DECLARED if n not in tokens]
    assert not missing, (
        'the @theme block in styles.css no longer declares {} as literal hex '
        '(parsed {} token(s): {}) -- the contrast sweep below would otherwise '
        'run over a palette this file never read'.format(
            ', '.join(missing), len(tokens), sorted(tokens)))
    return tokens


def _luminance(hexval):
    channels = [int(hexval[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
              for c in channels]
    return (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2])


def _ratio(a, b):
    """WCAG 2.1 relative-luminance contrast ratio."""
    la, lb = _luminance(a), _luminance(b)
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)


def test_every_foreground_clears_aa_on_every_surface():
    tokens = _tokens()
    pairs = [(fg, bg, _ratio(tokens[fg], tokens[bg]))
             for fg in FOREGROUNDS for bg in SURFACES]
    # Anti-vacuity: len(pairs) is the product by construction, so asserting
    # that proves nothing. What can genuinely go empty is the input lists.
    assert FOREGROUNDS and SURFACES, 'nothing to sweep'

    failures = [p for p in pairs if p[2] < AA]
    assert not failures, (
        '{} of {} text/surface pairs fall below WCAG AA {}:1 -- '.format(
            len(failures), len(pairs), AA)
        + '; '.join('{} on {} = {:.2f}:1'.format(fg, bg, r)
                    for fg, bg, r in failures))


def test_on_accent_clears_aa_against_accent():
    # text drawn ON the accent colour, e.g. a primary button label
    tokens = _tokens()
    ratio = _ratio(tokens['on-accent'], tokens['accent'])
    assert ratio >= AA, (
        'on-accent text over the accent fill is {:.2f}:1, below WCAG AA {}:1 '
        '-- every primary button label is unreadable'.format(ratio, AA))


def test_brand_colours_are_declared_but_not_text_safe():
    """Documents WHY violet and blue are restricted.

    This test asserts a FAILURE condition ON PURPOSE: both brand colours must
    measure BELOW AA against ground. That is why they are barred from being
    used as text anywhere, a restriction test_studio_guards.py enforces. Do not
    "fix" this by inverting the comparisons. If a future palette lightens them
    enough to be text-safe, this test fails, and that restriction can then be
    revisited deliberately rather than lapsing by accident.
    """
    tokens = _tokens()
    # Collected, not asserted in the loop: if a future palette lightens BOTH,
    # an in-loop assert reports only the first and hides the second.
    safe = [(name, _ratio(tokens[name], tokens['ground']))
            for name in ('brand-violet', 'brand-blue')
            if _ratio(tokens[name], tokens['ground']) >= AA]
    assert not safe, (
        '{} now measure(s) at or above WCAG AA {}:1 on ground. No longer '
        'unsafe as text, so the restriction in test_studio_guards.py is now a '
        'deliberate choice rather than an accessibility floor -- revisit it, '
        'then update this test: '.format(len(safe), AA)
        + '; '.join('{} = {:.2f}:1'.format(n, r) for n, r in safe))
