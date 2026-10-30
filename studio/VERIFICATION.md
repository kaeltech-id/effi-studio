# Effi Studio v2 — screenshot comparison against the design package

Every comparison below names the mockup it was made against and states its
**evidence level**, because they are not equal and saying so is the point.

| level | what it means |
|---|---|
| **captured** | the built bundle was rendered and screenshotted, and the image was looked at beside the mockup |
| **read** | the mockup was read and compared against the implementation's source and tests, with no screenshot of that surface |
| **n/a** | the mockup is not of app UI |

**What none of these are: the native app.** Every screenshot was taken in
headless Chrome against the real production bundle with `__TAURI_INTERNALS__`
stubbed and **sample data only**. There is no WKWebView, no native window, no
IPC, no PTY, and therefore no terminal with bytes in it. `screencapture` fails
in this environment with *"could not create image from display"* (exit 1), so
the native window could not be captured. See **Not verified** at the end.

Sizes captured: **1440x900, 1180x760, 980x700, 800x650** — the four target
sizes from Task 118.

---

## `mockups/01-choose-experiences.png` — **captured**
`screenshots/onboarding-01-choose-experiences.png`

Matches on structure, copy and palette: the `Effi STUDIO` wordmark, the
editorial column, the three-step rail with 01 active in accent, *"How will you
use Effi?"*, the Build card selected with an accent check and an `AVAILABLE`
badge, the Verify card inert with `COMING SOON` and *"Not available to install
yet."*, *"Build and Verify share one app"*, and the `Continue with Build` /
`Set up later` pair.

- **Defect found and fixed:** the content stopped at ~72% of the window height
  and the editorial column's `border-r` ended mid-page, hanging in open space.
  The `<section>` was `h-full` but the grid inside it sized to its content.
  Fixed with `min-h-full` on the grid, in this file and in the step-two
  equivalent.
- **Checked and found correct, not a defect:** the `AVAILABLE` badge reads
  paler than the mockup's green. The code is `border-success/40 text-success` —
  the mint token — carrying a deliberate rule: *"Accent is selection and primary
  action; mint is healthy. A checked box is never mint, and an availability
  badge is never accent."* The token is right; `#7FD4A8` is simply a
  desaturated mint that renders paler at 12px than the mockup's rendering.
- **Deviation:** the mockup draws a vertical connector line between the three
  step markers; the implementation draws the markers without it.

## `mockups/02-build-setup.png` — **captured**
`screenshots/onboarding-02-choose-tools.png`

Matches: *"Set up your Build workspace"*, the Agents / Tools / Connections jump
links with `Optional` on Connections, and per-row status words rather than
colour alone.

The honesty requirement is rendered verbatim rather than implied:
*"Detected means the program was found on this machine. Effi cannot see whether
you are signed in to it, and choosing none is a supported setup."* Codex reads
`Not on this machine`, Terminal reads `Included` with a non-interactive check
("Part of the app. Nothing to choose and nothing to download."), and the Android
row carries the backend's own sentence, `Android SDK not found at
~/Library/Android/sdk`, under a warning token rather than an error one.

- **Deviation:** same missing step-rail connector as 01.

## `mockups/03-build-workbench.png` — **captured at all four sizes**
`screenshots/workbench-1440x900.png`, `-1180x760`, `-980x700`, `-800x650`

Matches on hierarchy: the project header with branch, the one-row tab strip with
per-provider glyphs, the accent-selected tab, the Tasks/History inspector with
`Source: Claude plan`, a mint progress bar, `N complete · M remaining`, task text
**verbatim including its `[M]` and `[agent: …]` tags**, and the Project & Git
disclosure with the branch list and the unfinished-task warning.

Terminal room: the terminal keeps the dominant share at every band, and gains
the sidebar's and inspector's width as each leaves the flow. At 800x650 both are
drawers and the terminal has the full width.

- **Defect found and fixed (1):** project names collapsed — `orb…`/`atla…` at
  220px and to a **single letter** at 192px. In `tree-row.tsx` the name was the
  only flex item carrying `min-w-0`, so it absorbed the entire deficit while the
  stage rail and counter held their intrinsic width. **This mockup settled the
  fix**: its sidebar rows carry the project name and a branch line and **no
  stage dots and no counter at all**, so the rail was an addition that cost the
  name. Rail removed, counter kept, name given a floor.
- **Defect found and fixed (2):** `Verify` collapsed to `V…` in the Experiences
  card. Giving the name a floor merely **moved the victim** — the badge became
  `Coming so…` and the checkbox was clipped by the card edge. The 192px band
  cannot fit name + badge + checkbox on one line, so the row now wraps.
- **Deviation:** the mockup's sidebar rows carry a **branch meta line**
  (`main · development`); the implementation does not render one.
- **Deviation:** the mockup's stage rail is a **horizontal numbered row with
  descriptions** (`1 Brainstorm … 6 Git`) across the top of the workbench; the
  implementation draws five small dots in the header.
- **Deviation:** the mockup's task rows have **no strikethrough** on completed
  items; the implementation strikes them through.
- **Deviation:** the mockup puts Connections and Settings as **footer rows with
  chevrons** in the sidebar; the implementation uses a Connections card plus a
  Settings button in the workbench header.

## `mockups/04-browser-devices.png` — **captured (browser tab only)**
`screenshots/browser-tab.png`

- **Deliberate, documented deviation:** the mockup draws a rendered web page
  inside the tab. **There is no embedded surface on this build** — Tauri 2.12.5
  gates `Window::add_child` behind `all(desktop, feature = "unstable")`
  (`window/mod.rs:1224`), which `Cargo.toml` does not enable, and exposes no
  history navigation on `Webview` at all. So the pane is a **controller plus
  `Open externally`**, and `BUILD-CHANGES.md` §6 forbids drawing a fake frame or
  a placeholder screenshot in its place. Back/forward are labelled **"Previous
  address" / "Next address"** because they step through addresses typed in that
  tab, not a document's history.
- The device half of this mockup is **read**, not captured: a device tab is only
  reachable when that platform's diagnostics report `available`, which the
  sample data does not drive.

## `mockups/05-connections.png` — **captured**
`screenshots/connections.png`

Matches: the connector list with target, server/account, transport and status;
the Jira detail panel with Name / Workspace URL / Transport; the Authentication
disclosure; and the mandated order — configure, inspect scope, then connect.
GitHub renders as a catalogue entry labelled `Planned` with **no Configure
action at all** (not a disabled button).

- **Defect found and fixed:** the workspace **inspector was still rendered
  beside this full-page surface**, showing the active project's `Tasks 2/4` and
  `Project & Git` next to *"Connect your workflow"*. `<Inspector>` was gated on
  `onboardingView` when the correct predicate — `workspaceHidden`, already
  computed one line away — also covers Verify, the neutral shell and
  Connections. Now hidden by class, **not unmounted** (confirmed still present
  in the DOM), so the pane-mounted invariant holds.
- **Honest difference, not a defect:** every consumer cell reads
  `unsupportedByAgent` for Claude Code and Codex because `installed_adapters()`
  ships exactly one pair — Jira/Effi. The matrix drops its Action column
  entirely rather than drawing a column of dashes.

## `mockups/06-verify-coming-soon.png` — **read**
Not captured: the Verify landing is reached through internal view state the
sample-data harness cannot set. Compared against source and tests instead.
`Availability` comes from release configuration and never from a checkbox, so a
user cannot select their way into an unreleased experience; `enabled` is always
false while `comingSoon`, and the control renders its `reason` verbatim
(*"Not available to install yet."*), which **is** captured in 01 and in the
sidebar card at all four sizes.

## `mockups/07-dmg-install.png` — **n/a**
A macOS DMG install window, not app UI. The bundle identifier is deliberately
unchanged at `id.kaeltech.efficlaude.studio` (see `README.md`), and
`npm run tauri build` has **not** completed on this tree.

## `mockups/08-setup-states.png` — **read**
Not captured: these are per-component install/failure states that require a real
`run_setup` to reach. Compared against `setup-states.tsx` and `setup.rs`. The
four operations stay distinct (`linkExisting`, `enableBundled`, `setupExternal`,
`installSelected`), `installerStarted` stays separate from `readiness` so a
spawned process never reads as a finished install, and an empty selection
produces an **empty plan** rather than a default-everything one.

## `mockups/09-codex-and-add-tool.png` — **captured (add-tool menu)**
`screenshots/add-tool-menu.png`

The menu offers agents from the provider registry. Codex is listed and reads
`needsAttention` with the resolver's own words when its binary is absent, rather
than being dropped from the list. The **Terminal is deliberately not a provider
in the registry** (`SHELL_ID` is not in `BUILT_INS`, with a test that fails if it
is moved there), so it is never offered as an AI agent.

---

## Not verified

1. **Nothing has been run in the native app.** No Tauri window was opened, no
   DMG was built, no tab was switched by hand, and no terminal has ever had a
   byte in it. `screencapture` fails here (*"could not create image from
   display"*), so the native window cannot be captured without Screen Recording
   permission for the shell.
2. **The CSP has never been enforced by WKWebView.** It was exercised against
   the real bundle in headless Chrome with the exact production policy as a
   response header — zero violations, React mounted — but Chrome is Blink. The
   one unverified item that would be **fatal rather than degrading** is whether
   Tauri's `WKUserScript`-injected init scripts survive `script-src 'self'`.
   **The check to run: open the app, open a terminal tab, and look in the
   webview console for `Refused to`.**
3. **Keyboard shortcuts were not exercised at the four sizes.** Headless Chrome
   screenshots a layout; it does not press Cmd+Shift+]. The mechanisms are
   covered by code and by the repo guards.
4. The device pane, the setup states and the Verify landing were compared by
   reading, not by looking.
