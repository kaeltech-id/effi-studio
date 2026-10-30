## Feature: Clamp the Studio shell to the window

### Impact Analysis
- Files affected:
  - `studio/src/styles.css` — the document chain gains the lock (1 block)
  - `studio/src/App.tsx` — shell root (1815), surface column `main` (1882), settings drawer column (2196)
  - `studio/src/components/connections-page.tsx` — root element (955)
  - `studio/src-tauri/tauri.conf.json` — window minimums (15-17)
  - `tests/test_studio_guards.py` — one new guard class (append after 491)
- ⚠️ Breaking change risk: **behavioural, intended** — after the lock, content that today is reachable by dragging the whole page is reachable only through its surface's own scroller. The surface audit below is what makes that safe, and the two gaps it found are fixed in this same plan.
- Ten-surface audit result (measured, not assumed): eight surfaces already own exactly one scroller through an unbroken `min-h-0` chain and are NOT touched — ChooseExperiences (`choose-experiences.tsx:176`), NeutralShell (`:328`), ChooseTools (`choose-tools.tsx:488`), the shared setup shell behind ReviewSetup and SetupStates (`setup-states.tsx:280`), VerifyLanding (`verify-landing.tsx:56`), Workbench (`workbench.tsx:177`, body `:266`), SettingsPage (`settings-page.tsx:479` + `:514`), Inspector (`workbench.tsx:569` + `:635` + `:682`). Two gaps found: ConnectionsPage and the settings drawer column.
- The confirmed in-flow overflow: `connections-page.tsx:955` is `h-full` while its wrapper (`App.tsx:2141`) also holds `ConnectionsExit` (`App.tsx:133`, `h-10 shrink-0`). The page therefore asks for 100% of a column that already spent 40px, so the wrapper's content is window height + 40px; nothing between it and `<html>` clips, so the document scrolls by one exit bar and paints `--color-ground` in the gap.
- No pane is unmounted and no view branch changes: every edit is a class string or a config key. The additive-sibling + `hidden` pattern that keeps a running `/ec-execute` alive (`App.tsx:1814-1830`, `2140-2167`) is untouched.

### Reusable Existing Code
- `tests/test_studio_guards.py:14-34` — `_repo`, `_read`, `_walk` helpers; the new guard class uses them rather than re-deriving paths.
- `tests/test_studio_guards.py:283-294` — `_strip_comments`, so a prohibition written in a comment is never read as a violation. The new class greps class strings, so it strips first exactly as `TestMotionDiscipline` does.
- `tests/test_studio_guards.py:112` — `test_the_sweep_actually_sees_the_real_commands`, the precedent for a guard proving its own pattern has teeth. The new class carries the same kind of test.
- `studio/src/styles.css:38-45` — the existing `html, body, #root` block is extended, not replaced; no second block and no new selector.
- `studio/src/components/tab-strip.tsx:300` — `overscroll-x-contain`, the already-shipped precedent for using an overscroll property in this codebase.
- Precision Atelier tokens (`styles.css:10-36`) — nothing new is defined; no edit in this plan touches a token.

### Design Direction
- Dials: ENERGY 1 · RHYTHM 2 · MOTION 1 — carried verbatim from `.claude/decisions/main.md`; all three are already fixed by the shipped Precision Atelier system and this change re-decides none of them.
- Palette: unchanged — `--color-ground` #101112, `--color-surface` #17191B, `--color-copper` #E5A17C as the only accent. The defect is ground being visible where no surface was intended; the fix is structural, so no token moves.
- Typography: unchanged — `--font-ui` system stack, `--font-mono` for paths, branches and counts.
- Identity motif: the app-shell box — fixed chrome, one scroller per surface, nothing escaping the window. This change enforces that motif rather than assuming it.
- Rules: apply ~/.claude/agents/ec-antislop.md in full — hard gates, purpose gates, quality locks.

### Grounding
Measured 2026-10-29, real command output only.
- Baseline line counts: `wc -l studio/src/styles.css` → 71 · `studio/src/App.tsx` → 2382 · `studio/src-tauri/tauri.conf.json` → 45 · `studio/src/components/connections-page.tsx` → 1469 · `tests/test_studio_guards.py` → 491
- Baseline string counts:
  - `grep -c "overflow" studio/src/styles.css` → 0
  - `grep -ro -- "h-screen" studio/src | wc -l` → 1
  - `grep -ro -- "overscroll" studio/src | wc -l` → 1 (`tab-strip.tsx:300`, `overscroll-x-contain`)
  - `grep -ro -- "overflow-y-auto" studio/src | wc -l` → 14
  - `grep -c -E "minWidth|minHeight" studio/src-tauri/tauri.conf.json` → 0
  - `grep -c "^class Test" tests/test_studio_guards.py` → 7
- Baseline test result: `python3 -m pytest tests/ -q` → `253 passed, 1 warning in 4.13s`
- Verified anchors:
  - Task 1 — `#root {` → `studio/src/styles.css:40` (`  height: 100%;` → `:41`)
  - Task 2 — `flex h-screen bg-ground text-text` → `studio/src/App.tsx:1815`
  - Task 3 — `flex min-w-0 flex-1 flex-col` → `studio/src/App.tsx:1882`
  - Task 4 — `flex w-96 shrink-0 flex-col border-l border-border bg-surface` → `studio/src/App.tsx:2196`
  - Task 5 — `flex h-full min-h-0 flex-col overflow-y-auto bg-ground text-text` → `studio/src/components/connections-page.tsx:955`
  - Task 6 — `"height": 760` → `studio/src-tauri/tauri.conf.json:17`
  - Task 7 — `def test_outline_none_never_cancels_an_outline_ring` → `tests/test_studio_guards.py:484` (append after the file's last line, 491)
  - Task 8 — no anchor, runs commands only
  - Task 9 — no anchor, runs commands only
- Absence checks: `test -f studio/src/lib/layout.ts` → 1 (absent; no new source file is created by this plan)

### Tasks
- [x] Task 1: Lock the document chain [S] [agent: ec-tailwind] [design: direction#shell] — add `overflow: hidden` and `overscroll-behavior: none` to the existing `html, body, #root` block
- [x] Task 2: Clip the shell root and drop the viewport unit [S] [agent: ec-react] [design: direction#shell] — `h-screen` → `h-full overflow-hidden` on the one root element
- [x] Task 3: Clip the surface column [S] [agent: ec-react] [design: direction#shell] — `overflow-hidden` on `<main>`, the column every full-height surface mounts into
- [x] Task 4: Clip the settings drawer column [S] [agent: ec-react] [design: direction#SettingsDrawer] — `overflow-hidden` on the `w-96` aside whose installer block cannot shrink
- [x] Task 5: Make ConnectionsPage a flex child instead of a full-height block [S] [agent: ec-react] [design: direction#Connections] — `h-full` → `min-h-0 flex-1`, the one confirmed in-flow overflow
- [x] Task 6: Declare the window's minimum size [S] — add `minWidth: 720` and `minHeight: 560` to the Tauri window
- [x] Task 7: Add the containment guard class [M] [agent: ec-python] — five tests in `tests/test_studio_guards.py` that fail when any part of the clamp is removed
- [x] Task 8: Run the module gate [S] — frontend type-check/build plus the full pytest suite
- [x] Task 9: Rebuild the app bundle [M] — produce a bundle that carries the fix, so the symptom can be checked in the real window

### Per Task Detail

**Task 1 — Lock the document chain** `S`
- File: `studio/src/styles.css`
- Anchor: `#root {` (line 40)
- Reuse: the existing `html, body, #root` block at 38-45 is extended in place — no second selector, no new block.
- Code sample:
```css
html,
body,
#root {
  height: 100%;
  margin: 0;
  /* The app-shell lock. Studio is a window, not a page: with `height: 100%`
     alone the document grows behind any descendant taller than the webview and
     the user can drag the whole interface off the top of the window, leaving
     bare --color-ground below it. `overflow: hidden` makes that structurally
     impossible rather than a property every future pane must remember, and
     `overscroll-behavior: none` removes the macOS rubber-band, which exposes
     the same gap without any element overflowing at all. Every surface scrolls
     in its OWN region -- 14 `overflow-y-auto` sites and counting. */
  overflow: hidden;
  overscroll-behavior: none;
  background: var(--color-ground);
  color: var(--color-text);
  font-family: var(--font-ui);
}
```
- Do not touch: the `@theme` block (10-36) and the `prefers-reduced-motion` net (63-77). No token is added, removed or renamed.
- Edge cases: loading state — the lock is static CSS and applies before React mounts, so the first paint is already clamped; empty state — n/a; error state — if a surface renders an error taller than its box, its own `overflow-y-auto` carries it, which Task 5 and the audit guarantee.
- Acceptance: the document can no longer scroll or rubber-band, in any window size and on any screen.
- Verify (local): `grep -A12 -F "#root {" studio/src/styles.css | grep -c -E '^  (overflow: hidden|overscroll-behavior: none);$'` → `== 2` (baseline: `grep -c "overflow" studio/src/styles.css` → 0). The window is 12 lines because the mandated comment sits between `margin: 0;` and the declarations, and the pattern is anchored to a declaration line so the comment's own prose mention of `overflow: hidden` is not counted as code — the same reason `tests/test_studio_guards.py:283` strips comments before grepping.
- Dependencies: none

**Task 2 — Clip the shell root and drop the viewport unit** `S`
- File: `studio/src/App.tsx`
- Anchor: `flex h-screen bg-ground text-text` (line 1815)
- Reuse: none — one class string changes.
- Code sample:
```tsx
    // `h-full`, not `h-screen`: the shell measures the box it is in, through
    // the locked html/body/#root chain, rather than the visual viewport, which
    // in WKWebView is not reliably the same number. `overflow-hidden` is the
    // second half of the lock in styles.css: the chrome stays put and every
    // surface below scrolls inside its own region.
    <div className="flex h-full overflow-hidden bg-ground text-text">
```
- Do not touch: the `sidebarBand` / `inspectorBand` strings above it (1800-1809) and every child of this element. The `fixed` drawers, scrims and doors keep their current classes.
- Edge cases: loading state — this element renders before the startup probe answers and must keep doing so; empty state — no project configured still renders the shell; error state — unchanged.
- Acceptance: the shell element is exactly the height of the webview box and clips its own children, and no viewport unit is left anywhere in the frontend.
- Verify (local): `grep -c -F 'flex h-full overflow-hidden bg-ground text-text' studio/src/App.tsx` → `== 1` and `grep -roE '(className="[^"]*)h-screen' studio/src | wc -l` → `== 0` (baseline 1). Scoped to class strings: the task mandates a comment that quotes `h-screen` in prose, so a bare pattern can never reach 0 and would be measuring the comment rather than the markup.
- Dependencies: none

**Task 3 — Clip the surface column** `S`
- File: `studio/src/App.tsx`
- Anchor: `flex min-w-0 flex-1 flex-col` (line 1882)
- Reuse: none — one class string changes.
- Code sample:
```tsx
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
```
- Do not touch: every child of `<main>`; their `min-h-0 flex-1` wrappers are already correct and are not re-written by this task.
- Edge cases: loading state — n/a; empty state — n/a; error state — n/a. This is a containment boundary, not a behaviour.
- Acceptance: a surface that outgrows its column is clipped at the column rather than pushing the shell, so one misbehaving pane can never move the chrome around it.
- Verify (local): `grep -c -F 'flex min-w-0 flex-1 flex-col overflow-hidden' studio/src/App.tsx` → `== 1` (baseline 0)
- Dependencies: none

**Task 4 — Clip the settings drawer column** `S`
- File: `studio/src/App.tsx`
- Anchor: `flex w-96 shrink-0 flex-col border-l border-border bg-surface` (line 2196)
- Reuse: none — one class string changes.
- Code sample:
```tsx
          className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-border bg-surface"
```
- Do not touch: `InstallPane` and its `h-64` terminal host (`install-pane.tsx:75`). The installer keeps its size; Task 6's `minHeight` is what guarantees there is room for it.
- Edge cases: loading state — the drawer opens with `installSessionId` still null and must keep rendering; empty state — n/a; error state — the `installError` paragraph stays `shrink-0` and visible.
- Acceptance: the drawer's non-shrinkable installer block can no longer push its own column past the window.
- Verify (local): `grep -c -F 'flex w-96 shrink-0 flex-col overflow-y-auto border-l' studio/src/App.tsx` → `== 1` (baseline 0)
- **REVISED IN REVIEW.** As planned this task clipped the drawer (`overflow-hidden`), and two independent review gates measured that its non-shrinkable stack — 40px close header + the installer's ~418px block (`install-pane.tsx:70`, holding an `h-64` terminal) + SettingsPage's own `shrink-0` heading and jump nav (`settings-page.tsx:481`, ~191px) — exceeds the 560px window minimum by ~89px. Clipping it put every Settings section out of reach, because nothing in the column scrolled and the document no longer could. Shipped as `overflow-y-auto`, which keeps the column reachable at ANY height instead of above one measured floor. Guarded by `TestShellContainment.test_the_settings_drawer_scrolls_rather_than_clipping`.
- Dependencies: none

**Task 5 — Make ConnectionsPage a flex child instead of a full-height block** `S`
- File: `studio/src/components/connections-page.tsx`
- Anchor: `flex h-full min-h-0 flex-col overflow-y-auto bg-ground text-text` (line 955)
- Reuse: the `min-h-0 flex-1` shape every other surface in this shell already uses (`App.tsx:2141`, `workbench.tsx:266`).
- Code sample:
```tsx
    /* `min-h-0 flex-1`, never `h-full`: this page is the SECOND child of its
       column (App.tsx:2141) -- ConnectionsExit above it is `h-10 shrink-0` --
       so asking for 100% of a column that already spent 40px made the column's
       content one exit bar taller than the window. With nothing clipping
       between here and <html>, that was a 40px page scroll onto bare ground. */
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-ground text-text">
```
- Do not touch: the grid below it (`:984`, `grid min-h-0 flex-1 … px-8 py-6`) and every section inside it. This task changes the root element only.
- ⚠️ Breaking change: the page now fills the space the exit bar leaves instead of the full column; its own scroller carries the remainder, so nothing becomes unreachable.
- Acceptance: opening Connections leaves the shell exactly window-height, with the page scrolling inside the space below the exit bar.
- Verify (local): `grep -c -F 'flex min-h-0 flex-1 flex-col overflow-y-auto bg-ground text-text' studio/src/components/connections-page.tsx` → `== 1` and `grep -c -F 'flex h-full min-h-0 flex-col overflow-y-auto bg-ground' studio/src/components/connections-page.tsx` → `== 0` (baseline 1)
- Dependencies: none

**Task 6 — Declare the window's minimum size** `S`
- File: `studio/src-tauri/tauri.conf.json`
- Anchor: `"height": 760` (line 17)
- Reuse: none — two keys added beside the existing two.
- Code sample:
```json
      {
        "title": "Effi Studio",
        "width": 1180,
        "height": 760,
        "minWidth": 720,
        "minHeight": 560
      }
```
  720x560 is derived from what the layout already implements, not invented: below 900px the sidebar is a drawer and below 1100px the inspector is one, so 720 is inside the band the frontend renders honestly (verified in review: `min-[900px]:` occurs 8× and `min-[1100px]:` 9× in `studio/src`).
  **CORRECTED IN REVIEW:** the original rationale claimed 560 "clears the settings drawer's tallest non-shrinkable stack (≈420px) with room left over". That figure was wrong — it counted the close header and the installer block but omitted SettingsPage's own `shrink-0` heading and jump nav (`settings-page.tsx:481`, ~191px), making the true stack ≈620-650px. 560 does NOT clear it. The drawer scrolls instead (see Task 4), so no window height hides its chrome; 560 stands on the workbench chrome, which fits it.
- Do not touch: `width` 1180 and `height` 760 — the default size does not change — and the `security.csp` / `devCsp` strings.
- Edge cases: loading state — n/a; empty state — n/a; error state — a malformed config fails the Tauri build loudly, which Task 9 would catch.
- Acceptance: the window cannot be dragged below a size the layout can render, so clipping can never hide a pane's chrome.
- Verify (local): `python3 -c "import json; w=json.load(open('studio/src-tauri/tauri.conf.json'))['app']['windows'][0]; print(w['minWidth'], w['minHeight'])"` → `720 560` (baseline: `grep -c -E "minWidth|minHeight"` → 0)
- Dependencies: none

**Task 7 — Add the containment guard class** `M`
- File: `tests/test_studio_guards.py`
- Anchor: `def test_outline_none_never_cancels_an_outline_ring` (line 484 — the class is appended after the file's last line, 491)
- Reuse: `_repo`, `_read`, `_walk` (14-34) and `_strip_comments` (283-294); the teeth test follows the precedent at 112.
- Code sample:
```python
class TestShellContainment:
    """The app-shell lock. Studio is a window, not a page: before this, nothing
    stopped the document from growing behind a descendant taller than the
    webview, and the user could drag the whole interface off the top of the
    window and sit looking at bare --color-ground. The fix is four class
    strings and two config keys, every one of which a later edit could quietly
    undo -- so each one is asserted here."""

    def _css(self):
        return _read('studio/src/styles.css')

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
        app = _strip_comments(_read('studio/src/App.tsx'))
        assert 'flex h-full overflow-hidden bg-ground text-text' in app, (
            'the shell root must clip: an unclipped root lets any overflowing '
            'pane lengthen the page')

    def test_no_viewport_unit_sizes_the_shell(self):
        """100vh is not the webview box in WKWebView. The shell measures the
        locked html/body/#root chain instead."""
        out = [os.path.relpath(p, _repo()).replace(os.sep, '/')
               for p in _walk('studio/src', {'.ts', '.tsx'})
               if 'h-screen' in _strip_comments(
                   open(p, encoding='utf-8', errors='replace').read())]
        assert not out, 'h-screen sizes the shell by the viewport: ' + ', '.join(out)

    def test_the_window_declares_a_minimum_size(self):
        import json
        win = json.loads(_read('studio/src-tauri/tauri.conf.json'))
        win = win['app']['windows'][0]
        missing = [k for k in ('minWidth', 'minHeight') if k not in win]
        assert not missing, (
            'without a minimum the window can be dragged below what the '
            'breakpoint bands render, and the clip then hides real chrome: '
            + ', '.join(missing))
```
- Do not touch: the seven existing guard classes and the module-level helpers; this class is appended, nothing above it is edited.
- Edge cases: loading state — n/a; empty state — `_walk` yielding nothing would make the sweep vacuous, which `test_the_block_matcher_actually_finds_the_rule` and the existing `test_studio_frontend_is_inside_the_swept_set` (140) both guard; error state — a missing file raises rather than passing quietly.
- Acceptance: removing any single piece of the clamp turns this class red, so the invariant can fail instead of drifting.
- **HARDENED IN REVIEW.** The shipped class is not the sample above. Four changes, each from a review finding: `test_the_shell_root_clips_its_children` matched the whole class string in order, which this very file rejects 140 lines earlier (`test_studio_guards.py:414-418`, "the invariant was intact and the guard cried wolf") — now matched on tokens; `test_no_viewport_unit_sizes_the_shell` caught only a bare `h-screen` inside a double-quoted `className`, missing `min-h-screen`, `max-h-screen`, `h-[100vh]`, single quotes and template literals (the dominant form in App.tsx) — now a comment-stripped whole-file pattern; `test_the_window_declares_a_minimum_size` asserted the keys existed, so `"minWidth": 0` would have passed a message claiming otherwise — now asserts the values against the audited floors; and `import json` moved to module scope. Three further guards were added for the review's own fixes (drawer scroll, popover bound, keyboard focus stops). All 10 mutation-checked: 6/6 mutations red, files restored byte-identical.
- Verify (local): `grep -c -- "^class Test" tests/test_studio_guards.py` → `== 8` (baseline 7) and `python3 -m pytest tests/test_studio_guards.py -q 2>&1 | tail -1` reports 0 failed
- Dependencies: Task 1, Task 2, Task 6 — the class asserts the exact strings and keys those three write, so it cannot pass before them.

**Task 8 — Run the module gate** `S`
- File: none — commands only
- Reuse: the existing `npm run build` script (`studio/package.json:7`, `tsc && vite build`) and `pytest.ini`.
- Code sample:
```bash
cd studio && npm run build && cd ..
python3 -m pytest tests/ -q
```
- Do not touch: `studio/dist/` is build output and is not inspected or edited; no lockfile and no dependency is added.
- Edge cases: loading state — n/a; empty state — n/a; error state — a `tsc` error must fail this task rather than be reported as a warning.
- Acceptance: the frontend type-checks and builds with the clamp in place, and the whole repo suite is green including the new guard.
- Verify (local): `cd studio && npm run build > /dev/null 2>&1; echo $?` → `0`
- Verify (global): `python3 -m pytest tests/ -q 2>&1 | tail -1` → `== 258 passed` (baseline 253 + the 5 tests of Task 7)
- Dependencies: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
 
**Task 9 — Rebuild the app bundle** `M`
- File: none — commands only
- Reuse: the existing `tauri` script (`studio/package.json:9`) and the `dmg` target already configured (`tauri.conf.json:28-32`).
- Code sample:
```bash
cd studio && npm run tauri build 2>&1 | tail -20
ls -l src-tauri/target/release/bundle/dmg/
```
- Do not touch: `/Applications/Effi Studio.app` — this task BUILDS the bundle and does not install it. Replacing the installed app is the user's step, offered at review time.
- Edge cases: loading state — n/a; empty state — n/a; error state — a Rust or bundling failure must be reported verbatim, not summarised as success.
- Acceptance: a fresh bundle exists that carries the clamp, so the reported symptom can be checked in the real window at the default size and at 720x560.
- Verify (global): `test "$(stat -f %m "/Applications/Effi Studio.app/Contents/MacOS/studio")" -gt "$(stat -f %m studio/src/styles.css)" && grep -c -o "overscroll-behavior:none" studio/dist/assets/*.css` → `1`
  The original check — `find … -name '*.dmg' -newer …` — was DEFECTIVE and is recorded here rather than quietly dropped: the dmg step failed (`bundle_dmg.sh` → `Finder got an error: AppleEvent timed out (-1712)`) and the check still returned 0, because it matched `rw.70184.Effi Studio_1.25.0_aarch64.dmg`, the read-write scratch image the failed script leaves behind. A check that goes green on a failed build's debris reports the opposite of the truth. The `.app` itself built and linked at 22:40 and was installed to /Applications at 22:48 with the user's explicit approval; the 21:45 build is kept in the session scratchpad. No distributable `.dmg` exists.
- Dependencies: Task 8

