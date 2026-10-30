# Effi Studio

A workspace for building and verifying software — project context, agent
sessions, terminal, browser and device tools in one application.

One application, two experiences: **Build** (available now) and **Verify**
(coming soon). Effi Studio is provider-neutral: Claude Code, Codex and any
other CLI are just agent sessions in tabs, so nothing here is tied to a
single vendor.

Legacy names kept for compatibility: `~/.efficlaude`, `.claude` and the
`/ec-*` commands are internal implementation detail, not product names, and
are deliberately unrenamed so existing installs keep working.

## What the browser tab actually is in this build

**It is a controller, not an embedded browser.** There is no web page rendered
inside the tab, and nothing in the UI claims otherwise.

Two independent limits in the pinned toolkit put the embedded surface out of
reach, both read from the vendored source rather than inferred:

1. `src-tauri/Cargo.toml` declares `tauri = { version = "2", features = [] }`,
   which `Cargo.lock` resolves to **2.12.5**. `Window::add_child` is gated
   `#[cfg(any(test, all(desktop, feature = "unstable")))]`
   (`tauri-2.12.5/src/window/mod.rs:1224`) — outside the crate's own tests it
   needs `unstable` **and** desktop, so being a desktop build is not enough.
   `WebviewBuilder` is also `pub(crate)` without that feature, so a child
   webview cannot be constructed at all.
2. **Even with `unstable` enabled, Tauri 2.12.5 exposes no history navigation
   on `Webview`.** It offers `navigate`, `reload`, `url`, `set_bounds`, `eval`
   and `close`, and nothing else; a search of the whole crate source for
   `go_back`/`go_forward` returns no match. The underlying `wry` 0.57.1 *does*
   have `go_back`, `go_forward`, `can_go_back` and `can_go_forward`
   (`wry-0.57.1/src/lib.rs:2224-2237`) — Tauri simply does not re-export them.

The second limit is why **Previous address** and **Next address** are named
that way instead of Back and Forward. They step through addresses entered in
that tab — they are not a page's session history, and the pane says so in
plain words rather than letting the arrows imply it.

An `<iframe>` is not an alternative: an arbitrary site can refuse to be framed
with `X-Frame-Options`, so a framed page would work for some addresses and
silently fail for others. **Open externally** hands the address to the system
browser, which is the one path that always works, and the pane labels it
`Opens in a separate window`.

Nothing detects a dev server. A localhost address is one the user typed; the
app reads that string and never probes it, and it starts no server.

### Not verified in this environment

- **Nothing has been exercised in a running app.** No window was opened, no tab
  was switched, and no bundle was built. Every claim above comes from reading
  the toolkit source and from tests, not from use.
- The **certificate, download and popup** states are implemented but
  unexercised. With no embedded surface there is no request to observe, so
  those states arrive from whatever genuinely saw one; no code path in this
  build produces them yet.
- Whether a future Tauri with `unstable` would make the embedded surface work
  is **untested**. It was not enabled, so this is not a claim about it.

### Why the bundle identifier is still `id.kaeltech.efficlaude.studio`

The display name is now Effi Studio, but the bundle identifier is unchanged.
Changing it moves the app's state location and its macOS permission grants,
so it needs a migration of its own before it can move.

`productName` changing while the identifier stays is correct and intended: the
display name and the state key are different things. This is a recorded
decision, not an oversight for a later cycle to tidy up.

## What works, what was proven, and what was not

Four lists, deliberately separate. **A feature that is implemented but could not
be exercised here appears in two of them, and saying so is the point.** Nothing
below is listed as implemented because a menu, a form or a mockup exists.

### Implemented

- **One app, two experiences.** Build is available; Verify is Coming soon and
  **inert** — availability comes from release configuration, never from a
  checkbox, so no selection can turn on an unreleased experience.
- **The global Claude gate is gone.** Claude Code, Codex and any other CLI are
  agent sessions in tabs. A missing tool warns; it never blocks the app from
  opening.
- **Modular setup.** Each component is installed on its own. An empty selection
  produces an **empty plan**, not a default-everything one, and `hooks`,
  `optimizer` and `daemon` are reachable only by a bare `install.sh` run — no
  per-component selection can request them.
- **Multi-tab, multi-provider workbench** with per-project tabs, a one-row
  scrolling tab strip, an inspector carrying Tasks/History and a Project & Git
  disclosure, and four responsive bands (220/208/192 sidebar, 300/280
  inspector, both as drawers below 900px with only one overlay at a time).
- **Browser tab** as a controller plus `Open externally` (see above for why
  there is no embedded surface).
- **Device tabs** for iOS and Android with explicit ownership: a simulator the
  user started outside Effi is listed and usable but **never owned**, so Stop is
  refused for it, and closing a tab or quitting the app **releases the claim and
  kills nothing**.
- **Connections** with per-consumer status (Effi / Claude Code / Codex as three
  separate facts, never one verdict), a change preview before any Apply, and
  Disconnect separated from Revoke.
- **A read-only Jira connector** on Atlassian's documented Basic-auth path.
  Read-only is structural rather than promised: the only path the code can name
  comes from a one-variant match, and the transport returns **only an HTTP
  status code** — a mutation is unsayable, not switched off.
- **Custom MCP servers** configured from structured fields. No shell runs when
  the form opens, a pasted command line is **refused** rather than split by
  guesswork, and `env` carries variable **names only**, so a secret cannot be
  persisted into `studio.json`.
- **Secrets in the macOS keychain only** — never in project metadata, logs,
  fixtures or previews. The reference is three coordinates with nowhere to put a
  value, and the read is a **lend, not a get**: the accessor has no value in its
  return type, so a caller cannot keep it.

### Verified

- `cargo test --lib`, `cargo check`, `npx tsc --noEmit`, `npm run build` and
  `pytest` all green on a quiet tree.
- Repo guards that **fail on the real defect**, each mutation-tested: an
  invented `/ec-*` command name in any shipped surface (the pre-existing guard
  swept `commands/` and `hooks/` but not `studio/src`, which is exactly where
  the `/ec-feature` defect lived); a third process writing to a PTY; a live
  region on a streaming surface; motion outside 120–160ms; an unguarded
  animation; an `appearance-none` control with no focus ring; a workflow
  command reaching a non-Claude session; and `install.sh` disagreeing with the
  directories it installs from.
- **Session isolation**, proven with two real `/bin/cat` processes: each session
  received its own marker and **never** the other's.
- **Backward compatibility**: a `studio.json` written before the newer keys
  loads with every new field defaulted and nothing dropped.
- **The four target sizes**, screenshotted and compared against the design
  package — `VERIFICATION.md` and `screenshots/`. Four layout defects were found
  this way and fixed; none of them was reachable by any automated gate.

### Unavailable in this environment

- **The native app was never run.** No Tauri window was opened, no tab was
  switched by hand, and **no terminal has ever had a byte in it**.
  `screencapture` fails here with *"could not create image from display"*, so
  the native window cannot be captured without granting the shell macOS Screen
  Recording permission. Every screenshot is the real production bundle rendered
  in a browser with stubbed IPC and sample data.
- **`npm run build:dmg` produced an ad-hoc signed universal DMG on this tree**,
  verified by mounting it and reading its architectures — `lipo -archs` reports
  `x86_64 arm64`. It is **not notarized**, so a downloaded copy still needs the
  quarantine attribute removed.
- **The Content-Security-Policy has never been enforced by WKWebView.** It was
  exercised against the real bundle in headless Chrome with the exact production
  policy — zero violations, React mounted — but Chrome is Blink. The one
  unverified item that would be **fatal rather than degrading** is whether
  Tauri's injected init scripts survive `script-src 'self'`. *The check: open
  the app, open a terminal tab, and look in the webview console for `Refused
  to`.*
- **Keyboard shortcuts were not exercised at the four sizes.** Headless Chrome
  screenshots a layout; it does not press a chord.
- **No real Jira instance was contacted**, and nothing was created in one. The
  adapter is proven over a recording fake.
- **No real keychain item was written.** The logic is proven over an in-memory
  store; the `security` binary was exercised only against a throwaway keychain
  that was then deleted.
- **No simulator or emulator was booted.** Refusals are proven by a closure that
  **panics if it is ever reached**.

### Deferred

- **The embedded browsing surface.** It needs a Tauri build with `unstable`
  enabled *and* history navigation that Tauri 2.12.5 does not expose at all.
- **Writing Claude Code's or Codex's configuration.** The preview and the
  explicit Apply exist; the adapters that would do the writing do not, so every
  consumer cell for them reads `unsupportedByAgent`. Exactly one consumer pair
  ships an adapter: Jira/Effi.
- **A value-returning keychain read** lands with the first adapter that needs
  one; until then it would be a leak path with no consumer.
- **Narrowing `capabilities/default.json`** from `windows: ["main"]` to
  `webviews: ["main"]`. A window pattern grants the capability to every webview
  of that window, so a future browsing surface made as a child of `main` would
  inherit permissions nothing can subtract. Deferred because the capability
  system is exercised by no gate — only by a running window — and the cost of
  being wrong is a dead UI. Documented in `capabilities/browser-surface.json`.
- **The sidebar's branch meta line**, and the horizontal numbered stage rail the
  mockup draws across the workbench. See `VERIFICATION.md`.
- **Settings as an overlay below 1100px.** It stays an in-flow 384px column at
  every width, which is the behaviour it already had.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
