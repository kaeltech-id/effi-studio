## Feature: Rebrand Effi Studio — ribbon-E mark and the cool palette

### Impact Analysis
- Files affected: `studio/src/styles.css`, 19 component files under `studio/src/components/`, `studio/src/App.tsx`, `studio/src/assets/effi-mark.svg`, `studio/src/assets/effi-logo.svg`, `studio/icons-src/mkicon.py`, `studio/icons-src/effi-icon.svg`, `studio/icons-src/icon-1024.png`, all 17 files under `studio/src-tauri/icons/`, `studio/VERIFICATION.md`, `tests/test_studio_guards.py`
- ⚠️ Breaking change risk:
  - Deleting `--color-copper`, `--color-on-copper`, `--color-copper-tint` breaks every unrenamed call site at once. Tailwind resolves an unknown colour to no rule, so a missed site renders transparent or inherits — it fails silently, not loudly. Task 3's zero-occurrence assertion is the only thing that catches it.
  - `connections-page.tsx:1345,1363` carry `accent-copper` — Tailwind's `accent-color` utility, not the accent token. A blind `copper`→`accent` rename turns these into `accent-accent`, which is valid and correct but reads as a typo; Task 4 confirms it is deliberate.
  - `BrandMark` is consumed at three call sites (`experience-selector.tsx:227` size 16, `choose-tools.tsx:501` size 24, `choose-experiences.tsx:195` size 24). Changing its path data changes all three at once.

### Reusable Existing Code
- `studio/src/styles.css:10` `@theme` block — the single palette home; every colour in the app already resolves through it, so no component needs a colour edit beyond the token rename
- `studio/icons-src/mkicon.py:9` `in_squircle()` and `:35` `sample()` — the squircle maths and the supersampled rasteriser are geometry-independent and stay verbatim; only `in_mark()` and the colour constants change
- `studio/icons-src/effi-icon.svg` — the 64-segment superellipse path is reusable verbatim; only the mark path and the three literal hexes change
- `tests/test_studio_guards.py` `_repo()` and `_walk()` helpers — reused by the three new guard tests rather than re-implemented
- `studio/node_modules/.bin/tauri` — `npx tauri icon` replaces hand-authoring the 17 icon variants

### Design Contract
- Source: `/Users/admin/Developer/Projects/effi-studio/design/rebrand/effi-studio-mark-transparent.png` (mark geometry), `/Users/admin/Developer/Projects/effi-studio/design/rebrand/effi-studio-logo-navy.png` (lockup), `/Users/admin/Developer/Projects/effi-studio/design/rebrand/README.md` (palette table)  ·  Viewport: desktop app window, dark-only — no light theme and no `prefers-color-scheme` branch
- Layout: unchanged. This cycle alters colour tokens and brand vectors only; no component structure, section order, alignment or flex behaviour moves.
- Spacing: unchanged.
- Typography: unchanged — `--font-ui` and `--font-mono` keep their current stacks. The `effi-logo.svg` wordmark keeps its existing cap heights, baselines, stems and tracking; only its fill colour changes.
- Color: the complete replacement `@theme` block. Every value is binding; none may be re-chosen downstream.
  - `--color-ground: #080F24` — navy, verbatim from the rebrand README
  - `--color-surface: #0C142E` — derived from navy, 1.05:1 against ground
  - `--color-raised: #121C3C` — derived, 1.14:1 against ground
  - `--color-hover: #1A254C` — derived, 1.28:1 against ground
  - `--color-border: #2A3663` — derived, 1.64:1 against ground
  - `--color-text: #F5F8FF` — putih, verbatim; 17.89:1 on ground
  - `--color-muted: #9FB0D4` — cool slate; 8.73:1 on ground, 6.82:1 on hover (worst case)
  - `--color-accent: #76CFFF` — biru muda, verbatim; 10.99:1 on ground, 8.59:1 on hover
  - `--color-on-accent: #080F24` — navy on cyan, 10.99:1
  - `--color-accent-tint: #142A44`
  - `--color-brand-violet: #8B5CF6` — ungu, verbatim. Gradient and large decoration ONLY; 4.49:1 on navy fails AA for text
  - `--color-brand-blue: #4263EB` — biru, verbatim. Same restriction; 3.82:1 on navy
  - `--color-success: #7FD4A8` — 10.76:1 on ground
  - `--color-warning: #F0C86E` — 11.95:1 on ground
  - `--color-error: #FF8FA3` — 8.79:1 on ground
  - `--color-terminal: #DDE6F5`
  - `--color-copper`, `--color-on-copper`, `--color-copper-tint` are DELETED, not aliased
- Elements: the mark is a ribbon capital `E` — three sheared bars stacked top to bottom, joined down the left by two fold connectors so the whole reads as one ribbon turning back on itself. Measured proportions are in `### Grounding` and are binding. The top and middle bars shear left-going-down; the bottom bar shears right-going-down (measured, not assumed). The middle bar is inset on the right relative to the top. The lockup places this mark at the left, then "Effi Studio" in the existing wordmark geometry.
- Copy: "Effi Studio". No visible string in the running app changes this cycle.
- States: unchanged in structure. Every state resolving to `copper` today resolves to `accent` after the rename, at identical opacity and identical timing; `--duration-ui: 150ms` is untouched.
- Deviations allowed: the four derived navy ramp steps, `muted`, `accent-tint`, `terminal` and the status trio are not in the README table — they are derived and the values above are binding. The mark's rounded fold terminals in the raster may be rendered as straight-edged quadrilaterals: the counters are 2–3px at the 16px minimum and a rounded terminal closes them. The purple→cyan gradient belongs to the large lockup only; `BrandMark` stays `currentColor`. The three rebrand PNGs are a colour and geometry reference, not a shipped artefact — they carry generation artefacts and stay in `design/rebrand/`.

### Grounding
Measured output, transcribed verbatim.

Baseline line counts:
- `wc -l studio/src/styles.css` → 81
- `wc -l studio/src/components/brand-mark.tsx` → 37
- `wc -l studio/src/assets/effi-mark.svg` → 41
- `wc -l studio/src/assets/effi-logo.svg` → 99
- `wc -l studio/icons-src/mkicon.py` → 68
- `wc -l studio/icons-src/effi-icon.svg` → 105
- `wc -l tests/test_studio_guards.py` → 622
- `wc -l studio/VERIFICATION.md` → 188

Verified anchors:
- `@theme {` → `studio/src/styles.css:10`
- `--color-copper:` → `studio/src/styles.css:18`
- `--color-accent:` → `studio/src/styles.css:19`
- `--duration-ui:` → `studio/src/styles.css:35`
- `export function BrandMark` → `studio/src/components/brand-mark.tsx:12`
- `GROUND, SURFACE, COPPER` → `studio/icons-src/mkicon.py:4`
- `def in_mark(u, v):` → `studio/icons-src/mkicon.py:15`
- `def sample(x, y):` → `studio/icons-src/mkicon.py:35`
- `accent-copper` → `studio/src/components/connections-page.tsx:1345` and `:1363`
- `tests/test_brand_tokens.py` → `test -f` exit 1 (new file — no anchor)

Baseline string counts:
- `grep -ro "copper" studio/src | wc -l` → 189
- `grep -ro "copper\|COPPER\|Copper" studio/icons-src | wc -l` → 4
- `grep -ro "accent" studio/src | wc -l` → 14
- `grep -rnoE "#[0-9A-Fa-f]{6}" studio/src/components | wc -l` → 0
- `grep -coE "#[0-9A-Fa-f]{6}" studio/src/styles.css` → 14
- `grep -c "    def test_" tests/test_studio_guards.py` → 35
- `grep -c -i copper studio/VERIFICATION.md` → 5 (matching lines 28, 29, 41, 43, 69)
- `grep -c -i copper README.md` → 0
- `ls studio/src-tauri/icons | wc -l` → 17
- `grep -oE "#[0-9A-Fa-f]{6}" studio/icons-src/effi-icon.svg | sort -u` → `#101112 #17191B #E5A17C`

Per-file `copper` counts (sum 189):
styles.css 7 · App.tsx 5 · brand-mark.tsx 1 · terminal-pane.tsx 1 · flow-bar.tsx 3 · settings-page.tsx 7 · panel-section.tsx 1 · browser-pane.tsx 9 · diagnostics-panel.tsx 4 · device-pane.tsx 4 · connections-page.tsx 9 · experience-selector.tsx 9 · tab-strip.tsx 9 · choose-tools.tsx 14 · verify-landing.tsx 4 · setup-states.tsx 3 · add-tool-menu.tsx 6 · workbench.tsx 8 · install-pane.tsx 1 · choose-experiences.tsx 16 · effi-logo.svg 1 · effi-mark.svg 1
(These are case-SENSITIVE `grep -c` line counts; the 189 figure is a `grep -o` occurrence count, which is higher because several lines carry the token twice. Verify steps use case-INSENSITIVE `grep -c -i`, which reads higher on the two files holding a capitalised "Copper": styles.css 7 -> 8, VERIFICATION.md 4 -> 5.)

Baseline test result (studio subset): `python3 -m pytest tests/test_studio_guards.py tests/test_command_docs.py -q` → 151 passed in 0.34s
Baseline test result (whole tree, what Task 16 gates on): `python3 -m pytest tests/ -q` → 263 passed, 1 warning in 3.73s
Per-file collection: test_command_docs 110 · test_hooks 78 · test_studio_guards 41 · test_memory 22 · test_graph 6 · test_docs 5 · test_health 1
Baseline build: `cd studio && npm run build` → `✓ built in 298ms`, exit 0
Toolchain: `test -x studio/node_modules/.bin/tauri` → exit 0 · `python3 -m pytest --version` → pytest 8.4.2 · PIL not installed

Measured mark geometry — `design/rebrand/effi-studio-mark-transparent.png`, opaque bbox 138..1120 x 208..1068 (982 x 860, ratio 1.142), normalised so height = 24 units and the bbox top-left is the origin. Opaque horizontal runs per row:
```
y= 0.00  [(9.32, 27.21)]      y=12.00  [(4.97, 19.79)]
y= 1.20  [(6.47, 26.60)]      y=13.20  [(4.05, 18.84)]
y= 2.40  [(5.50, 25.70)]      y=14.40  [(3.13, 17.89)]
y= 3.60  [(4.60, 24.81)]      y=14.99  [(2.65, 17.02)]
y= 4.80  [(3.71, 23.92)]      y=15.60  [(2.20,  9.18)]
y= 6.00  [(2.82, 22.91)]      y=16.80  [(1.28,  8.20)]
y= 6.59  [(2.40,  9.60)]      y=17.39  [(0.84,  7.73)]
y= 7.79  [(1.51,  8.62)]      y=18.00  [(0.42, 23.05)]
y= 8.99  [(0.61, 7.65), (8.54, 21.77)]
y= 9.60  [(0.17, 21.68)]      y=19.20  [(0.61, 24.08)]
y=10.80  [(0.17, 20.71)]      y=20.40  [(1.79, 24.98)]
y=11.39  [(0.84, 20.26)]      y=21.60  [(2.96, 25.84)]
                              y=22.80  [(4.07, 26.71)]
                              y=24.00  [(6.14, 27.38)]
```
Derived structure: top bar y 0.0–6.0, edge slope dx/dy = −0.75, width ≈ 17.9 · fold A y 6.0–8.9, width ≈ 7.0, same slope · middle bar y 8.9–15.0, slope −0.79, width ≈ 14.4 (inset ≈ 3.5 on the right vs the top bar) · fold B y 15.0–18.0, width ≈ 6.9, same slope · bottom bar y 18.0–24.0, slope **+0.95**, width ≈ 22.7. Glyph aspect 27.4 wide × 24 tall.

Measured contrast (WCAG 2.1 relative luminance), already applied to the Design Contract:
- `#F5F8FF` on `#080F24` → 17.89:1 · on `#0C142E` → 17.10:1 · on `#121C3C` → 15.71:1 · on `#1A254C` → 13.98:1
- `#9FB0D4` on `#080F24` → 8.73:1 · on `#1A254C` → 6.82:1
- `#76CFFF` on `#080F24` → 10.99:1 · on `#1A254C` → 8.59:1 · `#080F24` on `#76CFFF` → 10.99:1
- `#7FD4A8` → 10.76:1 · `#F0C86E` → 11.95:1 · `#FF8FA3` → 8.79:1, all on `#080F24`
- `#8B5CF6` on `#080F24` → 4.49:1 (fails AA body text) · `#4263EB` on `#080F24` → 3.82:1 (fails AA body text)
- For reference, the palette being replaced: `#E5A17C` on `#101112` → 8.75:1

### Tasks
- [x] Task 1: Replace the @theme palette block [M] [agent: ec-tailwind] [design: design/rebrand/README.md#palette] — swap all 14 hexes for the navy/cyan set, delete the copper trio, promote accent to a real token
- [x] Task 2: Rewrite the styles.css header comment [S] [agent: ec-tailwind] — the comment still describes Precision Atelier, copper and the temporary accent alias
- [x] Task 3: Rename copper to accent across the component tree [M] [agent: ec-react] [design: design/rebrand/README.md#palette] — mechanical rename over 19 component files plus App.tsx
- [x] Task 4: Confirm the two accent-color checkbox sites [S] [agent: ec-react] [design: design/rebrand/README.md#palette] — connections-page.tsx:1345,1363 become accent-accent; prove it is deliberate, not a rename artefact
- [x] Task 5: Redraw effi-mark.svg as the ribbon E [M] [agent: ec-react] [design: design/rebrand/effi-studio-mark-transparent.png#mark] — new master vector from the measured geometry, still currentColor
- [x] Task 6: Sync brand-mark.tsx to the new master [S] [agent: ec-react] [design: design/rebrand/effi-studio-mark-transparent.png#mark] — copy the new path data verbatim into the inlined component
- [x] Task 7: Redraw effi-logo.svg as the new lockup [M] [agent: ec-react] [design: design/rebrand/effi-studio-logo-navy.png#lockup] — new mark plus the existing wordmark geometry, with the purple-to-cyan gradient
- [x] Task 8: Rewrite mkicon.py for the ribbon geometry [M] [agent: ec-python] [design: design/rebrand/effi-studio-mark-transparent.png#mark] — new colour constants and a new in_mark() body
- [x] Task 9: Regenerate icon-1024.png [S] [agent: ec-python] — run mkicon.py and verify the raster against the measured geometry
- [x] Task 10: Update effi-icon.svg to the new identity [S] [agent: ec-react] [design: design/rebrand/effi-studio-mark-transparent.png#mark] — three literal hexes and the mark path; the superellipse stays verbatim
- [x] Task 11: Regenerate the 17 Tauri icon files [S] — npx tauri icon from the new 1024 source, covering icns, ico and every PNG
- [x] Task 12: Update the copper prose in VERIFICATION.md [S] — four lines describing copper as the selection colour
- [x] Task 13: Guard that no copper token survives [S] [agent: ec-unit-test] — new test asserting zero occurrences across studio/
- [x] Task 14: Guard that violet and blue never take an interactive role [S] [agent: ec-unit-test] — new test barring them from text, border, ring, stroke and divide utilities
- [x] Task 15: Guard the contrast floors [M] [agent: ec-unit-test] — new test recomputing every token pair in the Design Contract against the AA floor
- [x] Task 16: Verify the build and the full suite [S] — tsc plus vite build and the whole pytest suite against the recorded baseline
- [x] Task 17: Rename the visible palette legend label [S] [agent: ec-react] [design: design/rebrand/README.md#palette] — settings-page.tsx:688 shows a cyan swatch labelled "Copper" to the user

### Per Task Detail

**Task 1 — Replace the @theme palette block** `M`
- File: `studio/src/styles.css`
- Anchor: `@theme {` at `studio/src/styles.css:10`
- Reuse: the block's existing shape — token order, the `--font-*` entries and `--duration-ui: 150ms` at `:35` are kept exactly as they are
- Code sample:
  ```css
  @theme {
    --color-ground: #080F24;
    --color-surface: #0C142E;
    --color-raised: #121C3C;
    --color-hover: #1A254C;
    --color-border: #2A3663;
    --color-text: #F5F8FF;
    --color-muted: #9FB0D4;
    --color-accent: #76CFFF;

    --color-on-accent: #080F24;
    --color-accent-tint: #142A44;
    --color-brand-violet: #8B5CF6;
    --color-brand-blue: #4263EB;
    --color-success: #7FD4A8;
    --color-warning: #F0C86E;
    --color-error: #FF8FA3;
    --color-terminal: #DDE6F5;

    --font-ui: ui-sans-serif, -apple-system, "SF Pro Text", system-ui, sans-serif;
    --font-mono: ui-monospace, "SF Mono", Menlo, monospace;

    --duration-ui: 150ms;
  }
  ```
- Do not touch: the `html, body, #root` rule, the `@media (prefers-reduced-motion: reduce)` block at `:70-81`, the `@import "tailwindcss"` line, and the `--duration-ui` value
- Edge cases: `--color-accent` currently exists as `var(--color-copper)` at `:19` — it must end up a literal hex, not an alias, or Tailwind resolves it to nothing once copper is gone. `--color-on-copper` and `--color-copper-tint` have 29 call sites between them and must not survive under their old names.
- ⚠️ Breaking change: deleting the copper trio breaks all 189 unrenamed call sites. Tailwind drops an unresolvable colour silently, so the failure is invisible until Task 3 lands. Tasks 1 and 3 must both complete before the app is looked at.
- Acceptance: the `@theme` block declares exactly the 16 colour tokens of the Design Contract with those exact hexes, no token named copper remains in the file, and the font and duration tokens are byte-identical to before.
- Verify (local): `grep -c -- "--color-copper" studio/src/styles.css` → `== 0`; `grep -c -- "--color-brand-violet: #8B5CF6" studio/src/styles.css` → `== 1`; `grep -c -- "--duration-ui: 150ms" studio/src/styles.css` → `== 1`; `grep -coE "#[0-9A-Fa-f]{6}" studio/src/styles.css` → `== 16` (baseline 14; the copper trio minus 3, the new tokens plus 5)
- Dependencies: none

**Task 2 — Rewrite the styles.css header comment** `S`
- File: `studio/src/styles.css`
- Anchor: `The Precision Atelier palette from DESIGN-SPEC.md` at `studio/src/styles.css:3`
- Reuse: none
- Code sample:
  ```css
  /* The rebrand palette from design/rebrand/README.md, copied, not re-chosen:
     navy surfaces, near-white text, cyan as the only interactive accent.
     Dark-only by design: there is no light theme and no prefers-color-scheme
     branch.
     Violet and blue are brand colours, not UI colours. They measure 4.49:1 and
     3.82:1 on navy, so neither may carry text, a border, an icon stroke or a
     focus ring -- they exist for the logo gradient and large decorative fills
     only. Cyan measures 10.99:1 and carries every interactive role.
     Accent means selection and primary action; success means healthy --
     separate names on purpose, so a selected checkbox can never be styled as
     "healthy". */
  ```
- Do not touch: the `@theme` block itself, and the MOTION comment at `:31-34` which still describes `--duration-ui` accurately
- Edge cases: the comment carries 2 of the file's 7 `copper` occurrences — leaving it stale would make the file's own documentation contradict its tokens.
- Acceptance: the header comment describes the navy/cyan palette and states the violet/blue restriction, and no occurrence of the word copper remains anywhere in the file.
- Verify (local): `grep -c -i copper studio/src/styles.css` → `== 0` (baseline 8 matching lines, case-insensitive); `grep -c "Precision Atelier" studio/src/styles.css` → `== 0` (baseline 1)
- Dependencies: Task 1

**Task 3 — Rename copper to accent across the component tree** `M`
- File: `studio/src/App.tsx` and all 19 files under `studio/src/components/` listed in the Grounding per-file table
- Anchor: `bg-copper` at `studio/src/components/choose-experiences.tsx` (16 occurrences, the densest site)
- Reuse: the rename is purely mechanical — `copper` → `accent`, `on-copper` → `on-accent`, `copper-tint` → `accent-tint`. Substring order matters: replacing the bare `copper` first already produces the correct `on-accent` and `accent-tint`, so one substitution covers all three.
- Code sample: for every matched file, `s/copper/accent/g`. Representative results:
  `bg-copper text-on-copper` → `bg-accent text-on-accent`;
  `bg-copper-tint` → `bg-accent-tint`;
  `ring-copper/30` → `ring-accent/30`;
  prose comments such as `copper is selection` → `accent is selection`.
- Do not touch: `studio/src/styles.css` (Tasks 1–2 own it), `studio/src/assets/effi-mark.svg` and `effi-logo.svg` (Tasks 5 and 7 own them), `studio/icons-src/` (Tasks 8 and 10), and any file outside `studio/src`
- Edge cases: `tree-row.tsx:63`, `flow-bar.tsx:147` and `stage-rail.tsx:10` already use `accent` via the old alias — they need no edit and must not be double-renamed into `accentaccent`. `git-mark.tsx:4` mentions accent in prose only. `connections-page.tsx:1345,1363` produce `accent-accent`, which Task 4 confirms.
- ⚠️ Breaking change: this is the other half of Task 1. Until both land, every renamed or unrenamed site resolves to a colour that no longer exists.
- Acceptance: no file under `studio/src` contains the string copper in any casing, every former copper utility now names accent, and no file contains the string `accentaccent`.
- Verify (local): `grep -ro "copper" studio/src | wc -l` → `== 0` (baseline 189); `grep -ro "accentaccent" studio/src | wc -l` → `== 0`; `grep -ro "accent" studio/src/components studio/src/App.tsx | wc -l` → `>= 185` (baseline 9 in those paths, plus the 189 total less the 8 in styles.css and the 2 in the SVG assets = 179 renamed, giving 188)
- Dependencies: none
  _(Tasks 1 and 3 touch disjoint files and may run concurrently; neither reads the other's output. The app is only coherent once both are done, which Task 16 is the gate for.)_

**Task 4 — Confirm the two accent-color checkbox sites** `S`
- File: `studio/src/components/connections-page.tsx`
- Anchor: `accent-copper` at `studio/src/components/connections-page.tsx:1345` and `:1363`
- Reuse: the existing `FOCUS` constant on both lines stays untouched. Note: these are `<input type="radio">` in the scope group (`name={fieldId('scope')}`), not checkboxes — Tailwind's `accent-color` paints the radio dot the same way, but the comment must say "radio dot", not "checkbox tick"
- Code sample:
  ```tsx
  {/* accent-accent is not a typo: the first token is Tailwind's accent-color
      utility, the second is our accent colour. It paints the native radio
      dot, which is why it is set here rather than inherited. */}
  <input
    type="radio"
    className={`h-4 w-4 shrink-0 accent-accent ${FOCUS}`}
  />
  ```
- Do not touch: the checkbox `onChange`, `checked` and label wiring on the surrounding lines — only the class string and the added comment change
- Edge cases: Task 3's blanket rename already produces `accent-accent`. If this task runs first the string is still `accent-copper` and Task 3 will rewrite it; the comment is what survives either order, so the comment is the deliverable.
- Acceptance: both checkboxes carry `accent-accent` and a comment stating that the doubling is Tailwind's utility name meeting the token name, so a later reader does not "fix" it.
- Verify (local): `grep -c "shrink-0 accent-accent" studio/src/components/connections-page.tsx` → `== 2` (a bare `accent-accent` count is unsatisfiable: the required comment text contains that literal string, so the line count is 4, not 2); `grep -c "accent-copper" studio/src/components/connections-page.tsx` → `== 0`; `grep -c "not a typo" studio/src/components/connections-page.tsx` → `== 2` (one comment per input)
- Dependencies: Task 3

**Task 5 — Redraw effi-mark.svg as the ribbon E** `M`
- File: `studio/src/assets/effi-mark.svg`
- Anchor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"` at `studio/src/assets/effi-mark.svg:1`
- Reuse: the file's existing contract — `viewBox="0 0 24 24"`, `role="img"`, `aria-label="Effi"`, every fill driven by `currentColor`, and a comment block documenting construction, clear space and minimum size. Keep all of it; only the geometry and its description change.
- Code sample: build from the measured table in `### Grounding`. The glyph is 27.4 wide × 24 tall, so fit it to the square box by scaling 24/27.4 = 0.876 and centring vertically — content lands in x 0..24, y 1.5..22.5. Five filled quadrilaterals, no strokes:
  ```xml
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" role="img" aria-label="Effi">
    <!-- Ribbon E. Three sheared bars joined down the left by two folds, so the
         whole reads as one ribbon turning back on itself. Geometry measured
         from design/rebrand/effi-studio-mark-transparent.png (opaque bbox
         982x860), normalised to height 24, then scaled 0.876 and offset y+1.5
         to fit the square box.

         The top and middle bars shear LEFT going down (dx/dy = -0.75 and
         -0.79); the bottom bar shears RIGHT (+0.95). That asymmetry is
         measured, not invented -- it is what makes the ribbon read as folded
         rather than as three parallel slabs. Do not "correct" it.

         The raster has rounded fold terminals. They are squared off here: at
         the 16px minimum the two counters are only 2-3px, and a rounded
         terminal closes them.

         Colour is currentColor throughout. The purple-to-cyan gradient lives
         on the large lockup (effi-logo.svg) only -- across a 20px glyph a
         gradient is invisible, and buying it here would cost currentColor,
         which is the one thing BrandMark depends on.

         CLEAR SPACE: half the glyph height on all four sides.
         Minimum size: 16px. -->
    <path fill="currentColor" d="M…top bar…Z"/>
    <path fill="currentColor" d="M…fold A…Z"/>
    <path fill="currentColor" d="M…middle bar…Z"/>
    <path fill="currentColor" d="M…fold B…Z"/>
    <path fill="currentColor" d="M…bottom bar…Z"/>
  </svg>
  ```
  Each `d` is four absolute points and `Z`, derived by applying `x' = x * 0.876`, `y' = y * 0.876 + 1.5` to the measured corners. Round to 2 decimals.
- Do not touch: nothing else in the file — it has no other content
- Edge cases: the two counters (gaps between bars) must stay open at 16px — they are 2.9 and 3.0 grid units, which is ~2px at 16px. Verify by rendering, not by reading. The glyph must not be stretched to fill the square box; the 1.142 aspect is preserved by the uniform 0.876 scale.
- Acceptance: the file renders a three-bar ribbon E matching the measured proportions, every fill is `currentColor`, the viewBox is still `0 0 24 24`, and both counters remain visibly open at 16px.
- Verify (local): `grep -c 'fill="currentColor"' studio/src/assets/effi-mark.svg` → `== 5`; `grep -c 'viewBox="0 0 24 24"' studio/src/assets/effi-mark.svg` → `== 1`; `grep -coE "#[0-9A-Fa-f]{6}" studio/src/assets/effi-mark.svg` → `== 0`; `grep -c -i copper studio/src/assets/effi-mark.svg` → `== 0`
- Dependencies: none

**Task 6 — Sync brand-mark.tsx to the new master** `S`
- File: `studio/src/components/brand-mark.tsx`
- Anchor: `export function BrandMark` at `studio/src/components/brand-mark.tsx:12`
- Reuse: the component's props, default `size = 20`, `aria-hidden="true"` and the existing doc comment structure all stay; only the five `<path>` elements and the comment's geometry notes change
- Code sample:
  ```tsx
  export function BrandMark({ size = 20 }: BrandMarkProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* Copied verbatim from assets/effi-mark.svg, which stays the master.
            Five filled quadrilaterals, no strokes — the counters are 2-3px at
            16px, so a stroke-based construction would close them. */}
        <path fill="currentColor" d="…" />
        {/* …four more, in master order… */}
      </svg>
    );
  }
  ```
- Do not touch: `BrandMarkProps`, the `size` default, `aria-hidden`, and the comment paragraph explaining why the mark is inlined rather than an `<img>` — that reasoning is unchanged and still correct
- Edge cases: the component renders at 16px once (`experience-selector.tsx:227`) and 24px twice (`choose-tools.tsx:501`, `choose-experiences.tsx:195`). The 16px case is the binding one.
- Acceptance: the component's path data is character-identical to the five `d` attributes in `effi-mark.svg`, and it still inherits `currentColor` at all three call sites.
- Verify (local): `grep -c 'fill="currentColor"' studio/src/components/brand-mark.tsx` → `== 5`; `grep -c "stroke=" studio/src/components/brand-mark.tsx` → `== 0`; extract every `d="…"` from both files and diff the two lists → identical
- Dependencies: Task 5

**Task 7 — Redraw effi-logo.svg as the new lockup** `M`
- File: `studio/src/assets/effi-logo.svg`
- Anchor: `viewBox="0 0 160 40"` at `studio/src/assets/effi-logo.svg:1`
- Reuse: the wordmark letterform paths and their stated geometry — cap height 16, baseline y28, stem 2.5 for "Effi"; cap height 10, baseline y28, stem 1.5, tracking 0.34em for the second word. Reuse them verbatim; this task does not redraw letters. Reuse the mark from Task 5 under one uniform transform, exactly as the file already does.
- Code sample:
  ```xml
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40" fill="none" role="img" aria-label="Effi Studio">
    <!-- DERIVED FROM effi-mark.svg — NOT REDRAWN. One uniform transform, no
         proportion change.
         The gradient lives HERE and only here: at lockup size it is legible,
         and the lockup is never asked to inherit currentColor the way the bare
         mark is. Violet and blue appear as gradient stops only — they measure
         4.49:1 and 3.82:1 on navy and may never carry text. -->
    <defs>
      <linearGradient id="effi-ribbon" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8B5CF6"/>
        <stop offset="0.55" stop-color="#4263EB"/>
        <stop offset="1" stop-color="#76CFFF"/>
      </linearGradient>
    </defs>
    <g transform="…uniform scale+translate…" fill="url(#effi-ribbon)">
      <!-- the five master quadrilaterals, path data verbatim from effi-mark.svg -->
    </g>
    <!-- wordmark, unchanged geometry -->
    <g fill="currentColor"> … </g>
  </svg>
  ```
- Do not touch: the wordmark path data, cap heights, baselines, stems or tracking; the 160x40 viewBox; the clear-space documentation
- Edge cases: the gradient `id` must be namespaced (`effi-ribbon`, not `g1`) — if this lockup is ever inlined twice in one document, colliding ids make the second instance adopt the first's gradient. The wordmark stays `currentColor` so the lockup still adapts to its surface; only the mark carries the gradient.
- Acceptance: the lockup shows the ribbon mark in a violet→blue→cyan gradient beside the unchanged "Effi Studio" wordmark, the mark's path data matches `effi-mark.svg` exactly, and the gradient id is unique enough to survive double inlining.
- Verify (local): `grep -c 'id="effi-ribbon"' studio/src/assets/effi-logo.svg` → `== 1`; `grep -c "8B5CF6" studio/src/assets/effi-logo.svg` → `== 1`; `grep -c "76CFFF" studio/src/assets/effi-logo.svg` → `== 1`; `grep -c -i copper studio/src/assets/effi-logo.svg` → `== 0`; `grep -c 'fill="currentColor"' studio/src/assets/effi-logo.svg` → `>= 1`
- Dependencies: Task 5

**Task 8 — Rewrite mkicon.py for the ribbon geometry** `M`
- File: `studio/icons-src/mkicon.py`
- Anchor: `GROUND, SURFACE, COPPER` at `studio/icons-src/mkicon.py:4`
- Reuse: `in_squircle()` at `:9`, the supersampling loop at `:48`, the PNG `chunk()` writer at `:59` and the `MARK`/`UNIT`/`ORIGIN` scaffolding at `:6-8` all stay verbatim — they are geometry-independent. Only the colour constants and the `in_mark()` body change.
- Code sample:
  ```python
  GROUND, SURFACE, ACCENT = (0x08,0x0F,0x24), (0x12,0x1C,0x3C), (0x76,0xCF,0xFF)

  def in_mark(u, v):
      """True inside effi-mark.svg, in its 24-unit grid. Five filled
      quadrilaterals -- three sheared bars and two folds -- so each piece is an
      intersection of half-planes, the same technique the old frame used.
      Corners come from the measured table in the plan's Grounding section."""
      for (x0, y0), (x1, y1), (x2, y2), (x3, y3) in QUADS:
          if inside_quad(u, v, (x0,y0), (x1,y1), (x2,y2), (x3,y3)):
              return True
      return False
  ```
  `QUADS` holds the same five corner sets as the SVG, expressed in the 24-unit grid before the 0.876 fit. `inside_quad` is a sign-consistency test across the four edges — convex quads only, which all five are.
- Do not touch: `N`, `SS`, `TILE_HALF`, `TILE_EXP`, the `MITER` constant may be deleted since no miter remains, the rasteriser loop, the PNG writer, and the output filename `icon-1024.png`
- Edge cases: the glyph is 27.4 wide × 24 tall, so the `MARK`/`UNIT`/`ORIGIN` scaffolding — written for a square 18-unit symbol — must apply the same 0.876 fit the SVG does, or the icon will be wider than its tile. The old `in_mark` returned True for a stroke region defined by inequality pairs; the new one must not keep any of that code.
- Acceptance: running the script emits a 1024×1024 PNG whose mark is the ribbon E at the same 51.95% canvas proportion, on a navy field with a navy-raised squircle, with no copper pixel anywhere.
- Verify (local): `grep -c -i copper studio/icons-src/mkicon.py` → `== 0`; `grep -c "0x76,0xCF,0xFF" studio/icons-src/mkicon.py` → `== 1`; `grep -c "MITER" studio/icons-src/mkicon.py` → `== 0`; `python3 -c "import ast;ast.parse(open('studio/icons-src/mkicon.py').read())"` → exit 0
- Dependencies: Task 5

**Task 9 — Regenerate icon-1024.png** `S`
- File: `studio/icons-src/icon-1024.png`
- Anchor: `open("icon-1024.png", "wb").write(png)` at `studio/icons-src/mkicon.py:67`
- Reuse: the script's own `print("wrote icon-1024.png", len(png), "bytes")` at `:68` as the success signal
- Code sample:
  ```bash
  cd studio/icons-src && python3 mkicon.py
  ```
- Do not touch: `mkicon.py` itself — if the output is wrong, the fix belongs in Task 8, not in a hand-edited PNG
- Edge cases: the script is a pure-stdlib rasteriser at 3× supersampling over 1024², which takes tens of seconds; do not mistake slowness for a hang. PIL is not installed, so verification must decode the PNG with `zlib` and `struct` directly, the way the geometry was measured.
- Acceptance: `icon-1024.png` is a fresh 1024×1024 PNG showing the ribbon E in cyan on the navy squircle, and its opaque mark region matches the measured proportions.
- Verify (local): `python3 -c "import struct;d=open('studio/icons-src/icon-1024.png','rb').read();print(struct.unpack('>II',d[16:24]))"` → `(1024, 1024)`; decode the pixels and assert the set of distinct colours is exactly `{#080F24, #121C3C, #76CFFF}` modulo antialiased blends, and that `#E5A17C` appears zero times
- Dependencies: Task 8

**Task 10 — Update effi-icon.svg to the new identity** `S`
- File: `studio/icons-src/effi-icon.svg`
- Anchor: `#E5A17C  mark        (copper)` at `studio/icons-src/effi-icon.svg:15`
- Reuse: the 64-segment superellipse path — `|x/412|^5 + |y/412|^5 = 1` fitted to 0.018px deviation — stays byte-identical. It is geometry no one should re-derive.
- Code sample: three literal substitutions in the comment and the paths — `#101112` → `#080F24` (field), `#17191B` → `#121C3C` (squircle), `#E5A17C` → `#76CFFF` (mark) — plus the mark path replaced by the five quadrilaterals from Task 5, scaled by 532/24 and translated to centre on (512, 512) with the same 0.876 aspect fit.
- Do not touch: the superellipse path data, the 1024 viewBox, the `role`/`aria-label`, and the comment paragraph explaining why literal hex is correct in this one file — that reasoning still holds
- Edge cases: this file and `mkicon.py` describe the same icon by two different methods. They must agree, or the SVG source and the shipped raster diverge silently. The comment's layout block quotes the three hexes explicitly and must be updated alongside the paths.
- Acceptance: the SVG renders the same icon `mkicon.py` rasterises — cyan ribbon E on a navy-raised squircle over a navy field — and its documented hexes match the ones it actually uses.
- Verify (local): `grep -oE "#[0-9A-Fa-f]{6}" studio/icons-src/effi-icon.svg | sort -u | tr '\n' ' '` → `#080F24 #121C3C #76CFFF `; `grep -c -i copper studio/icons-src/effi-icon.svg` → `== 0`
- Dependencies: Task 5

**Task 11 — Regenerate the 17 Tauri icon files** `S`
- File: all 17 files under `studio/src-tauri/icons/`
- Anchor: `studio/src-tauri/icons/icon.icns` (exists; 17 files total per Grounding)
- Reuse: `studio/node_modules/.bin/tauri` (`test -x` → exit 0), which generates every platform variant from one source
- Code sample:
  ```bash
  cd studio && npx tauri icon icons-src/icon-1024.png
  ```
- Do not touch: `studio/src-tauri/tauri.conf.json` — the icon list there already names these paths and does not change
- Edge cases: `tauri icon` may expect a square source with transparency; the generated tile is square and opaque. If it rejects the input, add an alpha channel in the generation step rather than hand-editing any output. The command rewrites files in place, so a partial run leaves a mixed-identity icon set — check all 17, not just `icon.png`.
- Acceptance: every one of the 17 files under `studio/src-tauri/icons/` has been rewritten from the new 1024 source, so the Dock, the installer and the Windows build all carry the ribbon E.
- Verify (local): `ls studio/src-tauri/icons | wc -l` → `== 17`; every file in that directory has an mtime newer than `studio/icons-src/mkicon.py`; `python3 -c` decoding `studio/src-tauri/icons/128x128.png` reports zero pixels equal to `#E5A17C`
- Dependencies: Task 9

**Task 12 — Update the copper prose in VERIFICATION.md** `S`
- File: `studio/VERIFICATION.md`
- Anchor: `the three-step rail with 01 active in copper` at `studio/VERIFICATION.md:28`
- Reuse: the document's existing voice and structure — this is a prose edit on four lines (28, 29, 41, 43, 69), not a rewrite
- Code sample: `copper` → `accent` on lines 28, 29 and 69; on lines 41 and 43 the quoted rule *"Copper is selection and primary action… the badge is never copper"* becomes *"Accent is selection and primary action… the badge is never accent"*, and the `#9CC5AF` reference on line 43 becomes `#7FD4A8` to match the new success token.
- Do not touch: every other line of the file — the layout, flow and interaction observations it records are unaffected by a palette change
- Edge cases: line 43 names a specific hex (`#9CC5AF`) that Task 1 replaces. Leaving it would leave the document asserting a value that no longer exists in `@theme`.
- Acceptance: the document describes selection as accent-coloured and quotes the current success hex, with no reference to copper remaining.
- Verify (local): `grep -c -i copper studio/VERIFICATION.md` → `== 0` (baseline 5 matching lines); `grep -c "9CC5AF" studio/VERIFICATION.md` → `== 0`; `grep -c "7FD4A8" studio/VERIFICATION.md` → `== 1`
- Dependencies: Task 1

**Task 13 — Guard that no copper token survives** `S`
- File: `tests/test_studio_guards.py`
- Anchor: `def test_the_window_declares_a_minimum_size` at `tests/test_studio_guards.py:611` — append the new class after it
- Reuse: the module's `_repo()` and `_walk()` helpers, and its existing class-per-concern layout
- Code sample:
  ```python
  class TestTheBrandPaletteIsTheOnlyPalette:
      """The rebrand deleted --color-copper outright rather than aliasing it.
      Tailwind resolves an unknown colour to no rule at all, so a surviving
      bg-copper renders transparent and reviews as 'looks fine' on a dark
      surface. Only a string check catches it."""

      def test_no_copper_token_survives_anywhere(self):
          hits = []
          for path in _walk('studio', {'.ts', '.tsx', '.css', '.svg', '.py', '.md'}):
              body = open(path, encoding='utf-8', errors='replace').read()
              if 'copper' in body.lower():
                  hits.append(os.path.relpath(path, _repo('.')))
          assert not hits, f'copper survives in: {hits}'
  ```
- Do not touch: the 35 existing test functions and their classes
- Edge cases: `_walk` must cover `.css`, `.svg`, `.py` and `.md` as well as `.ts`/`.tsx`, or the styles file, the two SVG masters, `mkicon.py` and `VERIFICATION.md` all escape the check. The match is case-insensitive so `COPPER` in `mkicon.py` is caught. `studio/node_modules` must be excluded or the walk is enormous. `_walk` at `tests/test_studio_guards.py:24` already skips `node_modules`, `target`, `.git` and `dist`, so this is settled — do not add a second exclusion list.
- Acceptance: the suite fails if any file under `studio/` reintroduces the word copper in any casing, and passes once Tasks 1, 2, 3, 5, 7, 8, 10 and 12 have all landed.
- Verify (local): `python3 -m pytest tests/test_studio_guards.py -q -k copper` → 1 passed; `grep -c "    def test_" tests/test_studio_guards.py` → `>= 36` (baseline 35)
- Dependencies: Task 1, Task 2, Task 3, Task 5, Task 7, Task 8, Task 10, Task 12, Task 17

**Task 14 — Guard that violet and blue never take an interactive role** `S`
- File: `tests/test_studio_guards.py`
- Anchor: `class TestTheBrandPaletteIsTheOnlyPalette` (created by Task 13) — add a second method to it
- Reuse: the class and helpers created in Task 13
- Code sample:
  ```python
      def test_violet_and_blue_never_carry_an_interactive_role(self):
          """#8B5CF6 measures 4.49:1 on navy and #4263EB measures 3.82:1 --
          both below the 4.5:1 AA floor for body text. They are gradient
          colours. The moment one is used as text, a border, an icon stroke or
          a focus ring, the app has an accessibility regression that renders
          perfectly well and is therefore invisible in review."""
          banned = re.compile(
              r'\b(?:text|border|ring|stroke|divide|outline|caret|placeholder|decoration)'
              r'-brand-(?:violet|blue)\b')
          hits = []
          for path in _walk('studio/src', {'.ts', '.tsx', '.css'}):
              body = open(path, encoding='utf-8', errors='replace').read()
              hits += [(os.path.relpath(path, _repo('.')), m)
                       for m in banned.findall(body)]
          assert not hits, f'brand colour used interactively: {hits}'
  ```
- Do not touch: Task 13's method
- Edge cases: `bg-brand-violet` and `from-brand-violet`/`to-brand-blue` are legitimate — the test must allow fills and gradient stops while barring the eight text-bearing and line-bearing prefixes. The regex must not match `--color-brand-violet` in the `@theme` declaration itself, which is why it requires one of the named utility prefixes immediately before `brand-`.
- Acceptance: the suite fails if any component ever gives violet or blue a text, border, ring, stroke, divide, outline, caret, placeholder or decoration role, while leaving background and gradient usage free.
- Verify (local): `python3 -m pytest tests/test_studio_guards.py -q -k interactive_role` → 1 passed; add a temporary `text-brand-violet` to any component, re-run, confirm it fails, then remove it
- Dependencies: Task 13

**Task 15 — Guard the contrast floors** `M`
- File: `tests/test_brand_tokens.py` (new file — confirmed absent, `test -f` exit 1)
- Reuse: nothing from the guards module — this test parses `styles.css` itself rather than hardcoding the palette, so it keeps testing the real tokens after any future change
- Code sample:
  ```python
  """Every text/surface pair in the shipped palette must clear WCAG AA.

  The palette is read out of styles.css rather than restated here: a test
  that hardcodes the hexes passes forever while the app drifts."""
  import os, re

  SURFACES = ('ground', 'surface', 'raised', 'hover')
  FOREGROUNDS = ('text', 'muted', 'accent', 'success', 'warning', 'error')
  AA = 4.5

  def _tokens():
      body = open(_styles(), encoding='utf-8').read()
      return {m[0]: m[1] for m in re.findall(
          r'--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6})', body)}

  def _ratio(a, b): ...  # WCAG 2.1 relative luminance

  def test_every_foreground_clears_aa_on_every_surface():
      t = _tokens()
      bad = [(f, s, round(_ratio(t[f], t[s]), 2))
             for f in FOREGROUNDS for s in SURFACES
             if _ratio(t[f], t[s]) < AA]
      assert not bad, f'below AA: {bad}'

  def test_on_accent_clears_aa_against_accent():
      t = _tokens()
      assert _ratio(t['on-accent'], t['accent']) >= AA

  def test_brand_colours_are_declared_but_not_text_safe():
      """Documents WHY violet and blue are restricted. If a future palette
      makes them text-safe, this test fails and the restriction in
      test_studio_guards.py can be revisited deliberately rather than by
      accident."""
      t = _tokens()
      assert _ratio(t['brand-violet'], t['ground']) < AA
      assert _ratio(t['brand-blue'], t['ground']) < AA
  ```
- Do not touch: `tests/test_studio_guards.py` — Tasks 13 and 14 own it
- Edge cases: the regex must tolerate the tokens being reordered or recommented. `terminal` and `accent-tint` are excluded from the foreground sweep — `accent-tint` is a surface and `terminal` is only ever drawn on `ground`, which the recorded 13.5:1 already clears. The third test asserts a *failure* condition on purpose; it is documentation, and its docstring must say so or a later reader will invert it.
- Acceptance: the file proves all 24 foreground/surface pairs clear 4.5:1 against the tokens actually declared in `styles.css`, and records the violet/blue restriction as a tested fact rather than a comment.
- Verify (local): `python3 -m pytest tests/test_brand_tokens.py -q` → 3 passed; temporarily set `--color-muted` to `#3A4668` in `styles.css`, re-run, confirm failure, then revert
- Dependencies: Task 1

**Task 16 — Verify the build and the full suite** `S`
- File: none — verification only
- Reuse: the recorded baselines — `263 passed` for the whole `tests/` tree, `151 passed` for the two-file studio subset, and `✓ built in 298ms`, all from `### Grounding`
- Code sample:
  ```bash
  cd studio && npm run build
  cd .. && python3 -m pytest tests/ -q
  ```
- Do not touch: anything. If this task finds a failure, the fix belongs in the task that caused it.
- Edge cases: `npm run build` is `tsc && vite build`, so a type error fails before Vite runs — a missing token produces no type error at all, which is exactly why Tasks 13–15 exist. The build emits a pre-existing chunk-size warning on a passing run; it is not a regression.
- Acceptance: the TypeScript build and the full pytest suite both pass, with a test count at or above the 263 whole-tree baseline plus the five new tests.
- Verify (global): `cd studio && npm run build` → exit 0; `python3 -m pytest tests/ -q` → exit 0 with `>= 268 passed` (baseline 263 across all 7 test files + 1 from Task 13 + 1 from Task 14 + 3 from Task 15, less none removed)
- Dependencies: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15, Task 17

**Task 17 — Rename the visible palette legend label** `S`
- File: `studio/src/components/settings-page.tsx`
- Anchor: `<dt className="shrink-0 text-xs leading-[18px] text-text">Copper</dt>` at `studio/src/components/settings-page.tsx:688`
- Reuse: the adjacent `Sage` row at `:698` is the pattern — a swatch, a colour word, and a sentence naming what the colour means. Match it exactly.
- Code sample:
  ```tsx
  <dt className="shrink-0 text-xs leading-[18px] text-text">Cyan</dt>
  ```
- Do not touch: the swatch `<span>` at `:684-687` (Task 3 already renamed its class to `bg-accent`), the `<dd>` description at `:689-691`, and the `Sage` row at `:693-702` — `--color-success: #7FD4A8` is still a green, so that label stays true
- Edge cases: this is the one place in the running app where a colour is named to the user in words. Task 3 correctly left it alone because the Design Contract said "Copy: unchanged" — that line was written before this legend was known, and it was wrong. The swatch beside it already renders cyan, so leaving the word makes the Appearance panel assert something the user can see is false.
- Acceptance: the Appearance palette legend names the accent swatch by its actual colour, so the word and the swatch agree, and no occurrence of the word copper survives anywhere under `studio/src`.
- Verify (local): `grep -c "Copper" studio/src/components/settings-page.tsx` → `== 0` (baseline 1); `grep -c ">Cyan</dt>" studio/src/components/settings-page.tsx` → `== 1` (baseline 0); `grep -ric copper studio/src | grep -v ':0$' | wc -l` → `== 1` (only `assets/effi-logo.svg`, which Task 7 owns)
- Dependencies: Task 3
