//! The Browser tab's backend (DESIGN-SPEC.md:107-108).
//!
//! # What this module is, and why it is not an embedded webview
//!
//! `BUILD-CHANGES.md:69` and `CLAUDE-IMPLEMENTATION-PROMPT.md:118-124` require a
//! real native browsing surface and forbid two shortcuts: framing a remote page
//! into the app document (an arbitrary site cannot be assumed to permit being
//! framed — `X-Frame-Options` and CSP `frame-ancestors` block a large share of
//! the web, and a preview that fails silently on half of it is worse than none),
//! and loosening the whole app's security posture to make a preview work.
//!
//! Both documents also require the API to be verified against the official
//! documentation for the stack version actually in use before anything is
//! written. That was done, and the answer is that this build cannot draw an
//! embedded browsing surface. Three findings, each checked against the vendored
//! source of the locked crate AND the published docs for that exact version
//! (`docs.rs/tauri/2.12.5`):
//!
//! 1. A child webview is created only through `Window::add_child`, which
//!    `tauri-2.12.5/src/window/mod.rs:1224` gates behind
//!    `cfg(any(test, all(desktop, feature = "unstable")))`. The published docs
//!    state the same: "Available on desktop and crate feature `unstable` only".
//! 2. Its builder argument, `WebviewBuilder`, is emitted by the
//!    `unstable_struct!` macro at `tauri-2.12.5/src/webview/mod.rs:261-274`,
//!    which makes the type `pub` under `unstable` and `pub(crate)` otherwise.
//!    Without the feature there is no nameable type to pass.
//! 3. `studio/src-tauri/Cargo.toml` declares `tauri = { version = "2",
//!    features = [] }`, so `unstable` is off. Turning it on is a build-wide opt
//!    into an API Tauri documents as breaking between minor releases, which is
//!    not a decision this module may take on its own.
//!
//! A fourth finding would block two of the six operations even with `unstable`
//! enabled: Tauri 2.12.5 exposes **no** history navigation on `Webview`. The
//! underlying `wry-0.57.1` has `go_back`/`go_forward`
//! (`wry-0.57.1/src/lib.rs:2224-2233`), but Tauri does not re-export them —
//! `navigate`, `reload`, `url`, `set_bounds`, `set_size`, `set_position`, `eval`
//! and `close` are all present and ungated, and nothing named `back`, `forward`,
//! `go_back` or `go_forward` exists. Driving history through
//! `eval("history.back()")` would mean injecting script into remote content and
//! would still not answer whether a step back is possible, so it is not a
//! substitute.
//!
//! **The embedded surface is therefore unavailable on this build.** What follows
//! is the controller path that `CLAUDE-IMPLEMENTATION-PROMPT.md:124` asks for
//! when runtime integration cannot be verified: the address state, a validated
//! scheme boundary, the pane lifecycle, an isolated storage scope, and an
//! open-externally handoff. Every value a surface would need is computed here,
//! so attaching one later is a wiring change rather than a redesign.
//!
//! Nothing here probes for, detects, or starts a dev server
//! (`DESIGN-SPEC.md:108`). A localhost address is something the user typed.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri_plugin_opener::OpenerExt;

// ---------------------------------------------------------------------------
// Published capability
// ---------------------------------------------------------------------------

/// Published as a fact rather than assumed by the UI, exactly as
/// `devices.rs:46` publishes `EMBEDDED_PREVIEW_SUPPORTED`: the Browser tab can
/// then offer the external handoff without holding a second opinion about what
/// the backend can draw. A later build that enables `unstable` and gains
/// history navigation flips this one const and the screen follows.
const EMBEDDED_SURFACE_SUPPORTED: bool = false;

/// Why, in the words the user and the capability report both get. One const
/// because a reason that lives in two places drifts, and this one is quoted
/// outside the codebase.
const NO_EMBEDDED_SURFACE: &str = "This build cannot host an embedded browsing surface. Tauri 2.12.5 gates child webviews (Window::add_child, WebviewBuilder) behind its `unstable` feature, which this app does not enable, and exposes no back/forward history navigation on Webview at all. Verified against the vendored crate source and the published docs for 2.12.5.";

/// The honest fallback, in the vocabulary the device tab already uses for the
/// same situation (`DESIGN-SPEC.md:115`), so two optional tools in one app do
/// not describe one limitation two ways.
const EXTERNAL_FALLBACK: &str = "Opens in a separate window";

/// What remote content must never reach (`DESIGN-SPEC.md:108`,
/// `BUILD-CHANGES.md:69`). Enumerated rather than described because this is the
/// list a reviewer checks the surface against, and prose cannot be checked.
///
/// On this path the guarantee is structural and total: no webview is created, so
/// there is no object for any of these to be attached to. The list is published
/// anyway — it is the contract a future embedded surface inherits, and writing
/// it down now is what stops it being re-derived from memory later.
const DENIED_TO_REMOTE_CONTENT: [&str; 5] = [
    "privileged app IPC (no invoke handler, no Tauri API injection)",
    "project files on disk",
    "agent credentials",
    "PTY sessions and shell commands",
    "the app's own storage, cookies and cache",
];

/// What a browsing surface would need from the app's Content-Security-Policy.
///
/// Written as a requirement and not applied here, because nothing in this module
/// widens the app's posture to make a preview work — the prohibition in
/// `BUILD-CHANGES.md:69` and `CLAUDE-IMPLEMENTATION-PROMPT.md:124`. A child
/// webview is a separate security origin with its own CSP, so the app's policy
/// should be tightened without carving out any exception for this tab.
///
/// That tightening has since been done: `tauri.conf.json` no longer carries
/// `"csp": null`. The app window document now gets `default-src 'self'` with
/// `frame-src`, `child-src`, `worker-src`, `object-src`, `form-action` and
/// `frame-ancestors` all `'none'`, and the one relaxation — `'unsafe-inline'`
/// in `style-src` — is for the terminal pane, not for this tab: `@xterm/xterm`
/// builds four `<style>` elements at runtime and rewrites their CSS text on
/// every resize and theme change, so neither a hash nor a nonce can cover them.
/// A matching `devCsp` adds `'unsafe-inline'` to `script-src` and the Vite HMR
/// websocket to `connect-src` for `tauri dev` only; neither reaches a shipped
/// build. The requirement below is unchanged by any of it — the policy was
/// tightened with no exception asked for or granted on this tab's behalf.
const CSP_REQUIREMENT: &str = "None. A child webview is its own origin and does not inherit the app's CSP, so the app policy can be tightened to its strictest form without an exception for this tab. Do not add frame-src or widen default-src for the Browser tab: remote pages are never framed into the app document.";

/// The capability answer, for the UI and for the capability report.
///
/// `Serialize` only and no `Deserialize`: this is an answer, never an input —
/// the reasoning `lib.rs` records for `RetryState`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserCapability {
    /// False on this build. See `NO_EMBEDDED_SURFACE`.
    pub embedded_surface: bool,
    /// Reported so the UI never has to guess which stack it is running on, and
    /// so a capability report quotes the running version rather than a
    /// remembered one.
    pub tauri_version: &'static str,
    /// `None` exactly when `embedded_surface` is true.
    pub reason: Option<&'static str>,
    pub fallback: &'static str,
    pub denied_to_remote_content: Vec<&'static str>,
    pub csp_requirement: &'static str,
}

/// Read before the Browser tab draws its viewport area, so a tab that cannot
/// embed shows the controller and the external handoff instead of an empty box
/// that looks like a failed load.
#[tauri::command]
pub fn browser_capability() -> BrowserCapability {
    BrowserCapability {
        embedded_surface: EMBEDDED_SURFACE_SUPPORTED,
        tauri_version: tauri::VERSION,
        reason: if EMBEDDED_SURFACE_SUPPORTED {
            None
        } else {
            Some(NO_EMBEDDED_SURFACE)
        },
        fallback: EXTERNAL_FALLBACK,
        denied_to_remote_content: DENIED_TO_REMOTE_CONTENT.to_vec(),
        csp_requirement: CSP_REQUIREMENT,
    }
}

// ---------------------------------------------------------------------------
// The address boundary
// ---------------------------------------------------------------------------

/// The only two schemes a Browser tab may hold. An allowlist and not a
/// denylist: a denylist has to be complete to be correct, and the set of URL
/// schemes a platform will hand to a handler grows without this file changing.
///
/// `file:` is absent deliberately — it is the one scheme that turns an address
/// field into a project-file reader, which is the first thing
/// `DESIGN-SPEC.md:108` denies remote content.
const ALLOWED_SCHEMES: [&str; 2] = ["http", "https"];

/// Assumed when the user types a bare host. Not `https`, because the address
/// this tab exists to serve is a local dev server, and those overwhelmingly
/// speak plain HTTP; defaulting to `https` would make the common case fail with
/// a certificate error that reads as the server being broken.
const DEFAULT_SCHEME: &str = "http";

/// Bounded so a long-lived tab cannot grow its history without limit. The
/// oldest entry is dropped, which is what a browser does.
const MAX_HISTORY: usize = 64;

/// Turns what the user typed into an address this tab may hold, or explains why
/// it may not.
///
/// Returns the normalised string rather than a parsed URL type: Tauri's `Url`
/// would have to be reconstructed at every boundary anyway, and the one thing
/// this function exists to decide — is this scheme permitted — is decided here
/// once and then travels as a plain validated string.
pub fn normalize_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Enter an address.".to_string());
    }

    // Rejected before anything is parsed. A control character or an interior
    // space is how a single address field becomes two requests, and no
    // legitimate typed address contains one — a real space belongs percent
    // encoded, which survives this check.
    if trimmed
        .chars()
        .any(|c| c.is_control() || c == ' ' || c == '\t')
    {
        return Err("An address cannot contain spaces or control characters.".to_string());
    }

    let candidate = match explicit_scheme(trimmed) {
        Some(scheme) => {
            if !ALLOWED_SCHEMES.contains(&scheme.as_str()) {
                // Named back to the user. "Invalid URL" sends someone hunting
                // for a typo in an address whose only problem is its scheme.
                return Err(format!(
                    "{scheme}: addresses are not supported here — only {} and {}.",
                    ALLOWED_SCHEMES[0], ALLOWED_SCHEMES[1]
                ));
            }
            trimmed.to_string()
        }
        None => format!("{DEFAULT_SCHEME}://{trimmed}"),
    };

    let host = host_of(&candidate);
    if host.is_empty() {
        return Err("That address has no host.".to_string());
    }
    // Userinfo is a credential sitting in an address field, and this tab
    // persists its address state. Refused rather than stripped: stripping would
    // silently change where the request goes, and `BUILD-CHANGES.md:69` puts
    // credentials outside what this surface handles at all.
    if host.contains('@') {
        return Err("Remove the username and password from the address — this tab does not carry credentials.".to_string());
    }

    Ok(candidate)
}

/// The scheme the input states outright, or `None` when the input is a bare
/// host that should take `DEFAULT_SCHEME`.
///
/// The whole difficulty is `localhost:1420`, which has the shape of a scheme
/// and is in fact a host and a port — the single most likely thing to be typed
/// into this field. An all-digit remainder is therefore read as a port, which
/// is what separates it from `javascript:alert(1)` and `data:text/html,...`.
/// Those two must reach the rejection above, so a schemeless `scheme:` form is
/// reported as a scheme rather than quietly prefixed into
/// `http://javascript:alert(1)`.
fn explicit_scheme(input: &str) -> Option<String> {
    let (prefix, rest) = input.split_once(':')?;

    // RFC 3986 scheme shape. A prefix that cannot be a scheme means the colon
    // belongs to something else, so there is no explicit scheme here.
    let mut chars = prefix.chars();
    let first_is_alpha = chars.next().is_some_and(|c| c.is_ascii_alphabetic());
    let rest_is_schemeish =
        chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'));
    if prefix.is_empty() || !first_is_alpha || !rest_is_schemeish {
        return None;
    }

    if rest.starts_with("//") {
        return Some(prefix.to_ascii_lowercase());
    }
    // `host:port`, not `scheme:opaque`. The port is the segment up to the first
    // path, query or fragment delimiter, so `localhost:1420/settings` reads as a
    // host, a port and a path. Requiring the WHOLE remainder to be digits made
    // that address refuse itself with "localhost: addresses are not supported
    // here", naming the host as a bad scheme -- and a path after the port is the
    // ordinary way to reach a dev server route, which `DESIGN-SPEC.md:108` names
    // as the primary thing typed into this field.
    //
    // `!port.is_empty()` is load-bearing, not defensive: `file:/etc/passwd` has
    // an EMPTY segment before its first `/`, so it stays a scheme and stays
    // refused. `javascript:alert(1)`, `data:text/html,...` and
    // `mailto:someone@example.com` are untouched -- none of their segments is
    // all digits.
    //
    // This does admit one form today's rule refused: `javascript:1/alert(1)`
    // now normalises to `http://javascript:1/alert(1)`. That is not a new
    // execution path, it is the removal of one -- the `javascript:` scheme is
    // gone, replaced by an ordinary http request to a host that does not
    // resolve. `javascript:1` was already coerced this way before this change.
    let port = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(prefix.to_ascii_lowercase())
}

/// The authority component of an already-normalised `scheme://...` string.
fn host_of(url: &str) -> &str {
    let after_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    after_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default()
}

/// Whether this address points at the machine the app is running on.
///
/// Published on every view so the tab can label a local target, and for no
/// other purpose: it is a reading of a string the user typed. It is not a probe,
/// it does not mean a server answered, and nothing in this module starts one
/// (`DESIGN-SPEC.md:108` — do not claim a dev server was found automatically).
pub fn is_loopback(url: &str) -> bool {
    let host = host_of(url);
    let bare = host.rsplit_once(':').map_or(host, |(h, port)| {
        // Only a trailing all-digit segment is a port; an IPv6 literal's colons
        // are part of the address.
        if port.chars().all(|c| c.is_ascii_digit()) && !port.is_empty() {
            h
        } else {
            host
        }
    });
    let bare = bare.trim_start_matches('[').trim_end_matches(']');
    bare.eq_ignore_ascii_case("localhost")
        || bare == "::1"
        || bare.strip_prefix("127.").is_some_and(|tail| {
            tail.split('.').count() == 3
                && tail
                    .split('.')
                    .all(|o| !o.is_empty() && o.chars().all(|c| c.is_ascii_digit()))
        })
}

// ---------------------------------------------------------------------------
// Storage scope
// ---------------------------------------------------------------------------

/// Namespaced and versioned so that a later change to how the scope is derived
/// cannot silently hand a project the store it had under the old scheme.
const STORAGE_NAMESPACE: &str = "id.kaeltech.efficlaude.studio/browser/v1";

/// A storage identity for one project's browsing, isolated in both directions
/// the design package requires: not the app's own store, and not another
/// project's.
///
/// 16 bytes because that is exactly the shape the verified API takes —
/// `WebviewBuilder::data_store_identifier(self, [u8; 16])` at
/// `tauri-2.12.5/src/webview/mod.rs:1162`. Computing it on the controller path
/// is deliberate: the value an embedded surface would need already exists and is
/// already tested, so enabling the surface later does not also mean inventing
/// its isolation story under time pressure.
///
/// Derived rather than random, so a project's cookies and session storage
/// survive a relaunch, and derived from the project id alone, so two projects
/// cannot collide. FNV-1a rather than a hash crate: this needs determinism and
/// a wide spread, not cryptographic strength — nothing authenticates on it.
pub fn storage_scope_id(project_id: &str) -> [u8; 16] {
    /// FNV-1a 64, with the offset basis as a parameter so two independent runs
    /// over the same input fill both halves without one being a function of the
    /// other.
    fn fnv1a(seed: u64, bytes: &[u8]) -> u64 {
        const PRIME: u64 = 0x100_0000_01b3;
        bytes
            .iter()
            .fold(seed, |hash, &b| (hash ^ u64::from(b)).wrapping_mul(PRIME))
    }

    const BASIS: u64 = 0xcbf2_9ce4_8422_2325;
    let seeded = format!("{STORAGE_NAMESPACE}#{project_id}");
    let low = fnv1a(BASIS, seeded.as_bytes());
    // A different basis AND a different input, so the two halves cannot agree
    // for any project id.
    let high = fnv1a(
        BASIS ^ 0x5851_f42d_4c95_7f2d,
        format!("{seeded}#high").as_bytes(),
    );

    let mut id = [0u8; 16];
    id[..8].copy_from_slice(&low.to_le_bytes());
    id[8..].copy_from_slice(&high.to_le_bytes());
    // An all-zero identifier is the one value a webview runtime is entitled to
    // read as "use the default store" — i.e. as the app's own. Astronomically
    // unlikely from the hash above, and the consequence of hitting it is a
    // silent loss of the isolation this function exists to provide, so it is
    // handled rather than argued about.
    if id.iter().all(|&b| b == 0) {
        id[0] = 1;
    }
    id
}

/// The scope in the form a log line or a capability report can print.
pub fn storage_scope_hex(project_id: &str) -> String {
    storage_scope_id(project_id)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/// The smallest edge a pane may report, in logical pixels.
///
/// The guard matters more than the number. `terminal-pane.tsx:85-87` records
/// what a zero measurement does there — a hidden pane measures 0×0, and fitting
/// to that collapses the terminal and resizes the PTY behind a session that is
/// still running. A browsing surface has the same failure: a page laid out at
/// zero width loses its scroll position and its responsive breakpoint, and a
/// reflow at that size is work thrown away. So a zero-sized measurement is
/// never stored, and hiding is a state change rather than a resize to nothing.
const MIN_PANE_EDGE: f64 = 1.0;

/// Where the pane is, in the window's logical pixels.
///
/// Both `Serialize` and `Deserialize`: this one crosses in both directions —
/// the frontend measures the pane and sends it, and reads back whatever was
/// actually kept after the guard above.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PaneBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl PaneBounds {
    /// Whether these bounds describe a pane that is actually on screen.
    ///
    /// Non-finite values are rejected with the same answer as zero: a `NaN`
    /// arrives from a measurement taken mid-layout, and it would poison every
    /// later comparison rather than failing visibly.
    fn is_drawable(&self) -> bool {
        self.x.is_finite()
            && self.y.is_finite()
            && self.width.is_finite()
            && self.height.is_finite()
            && self.width >= MIN_PANE_EDGE
            && self.height >= MIN_PANE_EDGE
    }
}

/// The controller's own record of where the user has been in this tab.
///
/// Deliberately NOT a claim about a document's session history. There is no
/// document on this path, and even with `unstable` enabled Tauri 2.12.5 exposes
/// no history API to read one (see the module header). This is the list of
/// addresses this tab has held, which is what `back` and `forward` move through
/// and what the external handoff hands off. Naming it for what it is keeps a
/// later reader from assuming a webview is being asked anything.
#[derive(Default)]
struct History {
    entries: Vec<String>,
    /// Index into `entries`. Meaningless when `entries` is empty, which is why
    /// every read goes through `current`.
    cursor: usize,
}

impl History {
    fn current(&self) -> Option<&str> {
        self.entries.get(self.cursor).map(String::as_str)
    }

    /// Adds an address and moves to it, discarding anything that was forward of
    /// the cursor — navigating from a point you went back to abandons the
    /// branch you left, which is what every browser does.
    fn push(&mut self, url: String) {
        // A repeat of the current address is a reload, not a new entry. Without
        // this, holding Enter on an address field fills the history with one
        // URL and makes `back` appear broken.
        if self.current() == Some(url.as_str()) {
            return;
        }
        self.entries.truncate(self.cursor + 1);
        self.entries.push(url);
        if self.entries.len() > MAX_HISTORY {
            self.entries.remove(0);
        }
        self.cursor = self.entries.len() - 1;
    }

    fn can_go_back(&self) -> bool {
        self.cursor > 0
    }

    fn can_go_forward(&self) -> bool {
        self.cursor + 1 < self.entries.len()
    }

    fn back(&mut self) -> bool {
        if !self.can_go_back() {
            return false;
        }
        self.cursor -= 1;
        true
    }

    fn forward(&mut self) -> bool {
        if !self.can_go_forward() {
            return false;
        }
        self.cursor += 1;
        true
    }
}

/// One Browser tab's state.
///
/// Keyed by tab id and not by project id, for the reason `lib.rs:31-33` records
/// about PTY sessions: one project holds several tabs, and a key derived from
/// the project would let one tab's navigation land in another tab's address
/// field.
struct BrowserPane {
    /// Fixed for the pane's life. The storage scope is derived from it, so a
    /// pane that could change project would change store underneath itself.
    project_id: String,
    history: History,
    /// The last bounds that were actually drawable. Retained across a hide for
    /// the reason `MIN_PANE_EDGE` records: a hidden pane reports 0×0, and
    /// storing that would lose the geometry needed to show it again.
    bounds: Option<PaneBounds>,
    visible: bool,
    /// Incremented by `browser_reload`. With no document to reload, the honest
    /// mechanism is a token the pane watches: it changes, the pane re-requests
    /// its current address. A no-op reload would be a button that pretends.
    generation: u64,
}

/// Lifecycle, stated once so the four transitions cannot be re-invented per
/// call site:
///
/// - **create-on-open** — `browser_open` inserts the pane. Idempotent per tab
///   id, because StrictMode mounts a pane twice and both mounts carry the same
///   id (the reasoning `lib.rs` records for `pty_start`). A second open must
///   return the pane as it stands, never reset its history.
/// - **resize-with-the-pane** — `browser_set_bounds` stores drawable bounds and
///   ignores the rest, keeping the last good geometry.
/// - **hide-without-destroying** — `browser_set_visibility(false)` flips a flag
///   and keeps history, bounds and storage scope. It never resizes to 0×0.
/// - **destroy-on-close** — `browser_close` removes the pane. Closing a Browser
///   tab touches nothing else: no PTY, no watcher, no other tab
///   (`DESIGN-SPEC.md:92` — a browser close does not kill the shell).
#[derive(Default)]
pub struct BrowserRegistry(Mutex<HashMap<String, BrowserPane>>);

/// Everything the Browser tab draws, in one answer.
///
/// One view type for every command, so the frontend has a single shape to hold
/// and no command can return a partial picture that the UI then has to merge.
/// camelCase on the wire, for the reason recorded at `projects.rs:54-58`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserView {
    pub tab_id: String,
    pub project_id: String,
    /// `None` on a pane that has been opened but never navigated — a blank tab,
    /// which is a real state and not an error.
    pub url: Option<String>,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    /// A reading of `url`, never a probe. See `is_loopback`.
    pub loopback: bool,
    pub visible: bool,
    pub bounds: Option<PaneBounds>,
    /// Hex of this project's 16-byte store id. Published so the UI can show
    /// which scope a tab is using, and so the isolation is observable rather
    /// than merely asserted.
    pub storage_scope: String,
    /// Repeated on every view, not just on the capability call: the control row
    /// decides between a viewport and the external handoff on every render, and
    /// a stale capability cached once at mount is how a tab ends up drawing a
    /// surface this build cannot host.
    pub embedded_surface: bool,
    pub generation: u64,
}

impl BrowserPane {
    fn view(&self, tab_id: &str) -> BrowserView {
        let url = self.history.current().map(str::to_string);
        BrowserView {
            tab_id: tab_id.to_string(),
            project_id: self.project_id.clone(),
            loopback: url.as_deref().is_some_and(is_loopback),
            url,
            can_go_back: self.history.can_go_back(),
            can_go_forward: self.history.can_go_forward(),
            visible: self.visible,
            bounds: self.bounds,
            storage_scope: storage_scope_hex(&self.project_id),
            embedded_surface: EMBEDDED_SURFACE_SUPPORTED,
            generation: self.generation,
        }
    }
}

/// Every command below needs the same three steps — take the lock, find the
/// pane, answer with a view — and the two failures have to read the same way
/// wherever they happen. A closure keeps the mutation at the call site while
/// the lookup and the reply live here once.
fn with_pane<F>(reg: &BrowserRegistry, tab_id: &str, mutate: F) -> Result<BrowserView, String>
where
    F: FnOnce(&mut BrowserPane) -> Result<(), String>,
{
    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    let pane = map
        .get_mut(tab_id)
        .ok_or_else(|| format!("no browser tab: {tab_id}"))?;
    mutate(pane)?;
    Ok(pane.view(tab_id))
}

// ---------------------------------------------------------------------------
// Commands
//
// The three transitions that can fail against one tab while other tabs are
// live — open, navigate, close — are written as a seam taking
// `&BrowserRegistry`, with the `#[tauri::command]` wrapper doing nothing but
// unwrapping the state. The reason is the one `devices.rs:1049` records for
// `launch_with`: `tauri::State` is a newtype over a private borrow
// (`tauri-2.12.5/src/state.rs:20`) with no public constructor outside the
// crate's own `unstable`/`test` features, so a test cannot call a command that
// takes one. Without the seam, a test of cross-tab isolation would have to
// re-implement the command body and would then be asserting over its own copy
// rather than over the code that ships. No behaviour changes here: each wrapper
// is a single delegating call.
// ---------------------------------------------------------------------------

/// create-on-open. `url` is optional: a Browser tab opens blank and waits for
/// an address, because opening one must not navigate anywhere the user did not
/// ask for.
fn open_in(
    reg: &BrowserRegistry,
    tab_id: String,
    project_id: String,
    url: Option<String>,
) -> Result<BrowserView, String> {
    // Validated before the pane exists, so a rejected address leaves no
    // half-created tab behind.
    let initial = url
        .as_deref()
        .filter(|u| !u.trim().is_empty())
        .map(normalize_url)
        .transpose()?;

    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    // A second open on one id is the same tab, not a new one.
    if let Some(existing) = map.get(&tab_id) {
        return Ok(existing.view(&tab_id));
    }

    let mut pane = BrowserPane {
        project_id,
        history: History::default(),
        bounds: None,
        // Created hidden. The pane reports its geometry after layout, and a
        // surface shown before it has bounds would flash at the wrong size.
        visible: false,
        generation: 0,
    };
    if let Some(url) = initial {
        pane.history.push(url);
    }
    let view = pane.view(&tab_id);
    map.insert(tab_id, pane);
    Ok(view)
}

#[tauri::command]
pub fn browser_open(
    reg: tauri::State<BrowserRegistry>,
    tab_id: String,
    project_id: String,
    url: Option<String>,
) -> Result<BrowserView, String> {
    open_in(&reg, tab_id, project_id, url)
}

/// User navigation. The scheme boundary is enforced here, which is the only
/// door an address can come through — and it is enforced before the pane is
/// touched, so a refused address changes nothing at all.
fn navigate_in(reg: &BrowserRegistry, tab_id: &str, url: &str) -> Result<BrowserView, String> {
    let url = normalize_url(url)?;
    with_pane(reg, tab_id, |pane| {
        pane.history.push(url);
        Ok(())
    })
}

#[tauri::command]
pub fn browser_navigate(
    reg: tauri::State<BrowserRegistry>,
    tab_id: String,
    url: String,
) -> Result<BrowserView, String> {
    navigate_in(&reg, &tab_id, &url)
}

/// One step back through the addresses this tab has held. Reports an error
/// rather than succeeding silently at the start of history, so a UI that offers
/// the button when `can_go_back` is false finds out.
#[tauri::command]
pub fn browser_back(
    reg: tauri::State<BrowserRegistry>,
    tab_id: String,
) -> Result<BrowserView, String> {
    with_pane(&reg, &tab_id, |pane| {
        if pane.history.back() {
            Ok(())
        } else {
            Err("Nothing to go back to.".to_string())
        }
    })
}

#[tauri::command]
pub fn browser_forward(
    reg: tauri::State<BrowserRegistry>,
    tab_id: String,
) -> Result<BrowserView, String> {
    with_pane(&reg, &tab_id, |pane| {
        if pane.history.forward() {
            Ok(())
        } else {
            Err("Nothing to go forward to.".to_string())
        }
    })
}

/// Bumps the token the pane watches. Refused on a blank tab: there is no
/// address to reload, and answering `Ok` would make the button look like it did
/// something.
#[tauri::command]
pub fn browser_reload(
    reg: tauri::State<BrowserRegistry>,
    tab_id: String,
) -> Result<BrowserView, String> {
    with_pane(&reg, &tab_id, |pane| {
        if pane.history.current().is_none() {
            return Err("Nothing to reload — this tab has no address yet.".to_string());
        }
        pane.generation = pane.generation.wrapping_add(1);
        Ok(())
    })
}

/// resize-with-the-pane. A measurement that is not drawable is dropped and the
/// last good geometry kept — see `MIN_PANE_EDGE`. Reporting `Ok` here is
/// correct: a 0×0 measurement from a pane mid-hide is an ordinary event, not a
/// caller error, and the view returned says what was actually kept.
#[tauri::command]
pub fn browser_set_bounds(
    reg: tauri::State<BrowserRegistry>,
    tab_id: String,
    bounds: PaneBounds,
) -> Result<BrowserView, String> {
    with_pane(&reg, &tab_id, |pane| {
        if bounds.is_drawable() {
            pane.bounds = Some(bounds);
        }
        Ok(())
    })
}

/// hide-without-destroying, and its inverse. Everything but the flag survives:
/// history, bounds and the storage scope are all still there when the tab comes
/// back, which is what makes this different from closing it.
#[tauri::command]
pub fn browser_set_visibility(
    reg: tauri::State<BrowserRegistry>,
    tab_id: String,
    visible: bool,
) -> Result<BrowserView, String> {
    with_pane(&reg, &tab_id, |pane| {
        pane.visible = visible;
        Ok(())
    })
}

/// Read when a Browser tab re-mounts, so it redraws from the pane that is
/// already there instead of opening a second one.
#[tauri::command]
pub fn browser_view(
    reg: tauri::State<BrowserRegistry>,
    tab_id: String,
) -> Result<BrowserView, String> {
    with_pane(&reg, &tab_id, |_| Ok(()))
}

/// destroy-on-close. Removing the entry is the whole of it — nothing here owns
/// a process, so there is nothing to signal, and closing this tab must not
/// disturb any other (`DESIGN-SPEC.md:92`, `:145`).
fn close_in(reg: &BrowserRegistry, tab_id: &str) -> Result<(), String> {
    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    match map.remove(tab_id) {
        Some(_) => Ok(()),
        None => Err(format!("no browser tab: {tab_id}")),
    }
}

#[tauri::command]
pub fn browser_close(reg: tauri::State<BrowserRegistry>, tab_id: String) -> Result<(), String> {
    close_in(&reg, &tab_id)
}

/// The handoff this path exists to provide, and on this build the only way the
/// user actually sees the page (`EXTERNAL_FALLBACK`).
///
/// The address is re-validated on the way out rather than trusted because it was
/// validated on the way in. This is the one call that hands a string to the
/// operating system's URL handler, and a scheme check at the point of use is
/// what keeps that true no matter which path put the address in the pane — a
/// later build restoring tabs from disk would otherwise make persisted state
/// into an argument for `open`.
#[tauri::command]
pub fn browser_open_externally(
    app: tauri::AppHandle,
    reg: tauri::State<BrowserRegistry>,
    tab_id: String,
) -> Result<(), String> {
    let url = {
        let map = reg.0.lock().map_err(|e| e.to_string())?;
        let pane = map
            .get(&tab_id)
            .ok_or_else(|| format!("no browser tab: {tab_id}"))?;
        pane.history
            .current()
            .ok_or("This tab has no address to open yet.")?
            .to_string()
    };
    // Re-checked, and the lock is already released: opening is a platform call
    // and must not be made while holding a mutex every other command needs.
    let url = normalize_url(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- the scheme boundary ------------------------------------------------

    /// The case the Browser tab exists for, and the one `explicit_scheme` is
    /// shaped around: `host:port` must survive, because it looks exactly like a
    /// scheme.
    #[test]
    fn a_bare_localhost_address_gets_the_default_scheme() {
        assert_eq!(
            normalize_url("localhost:1420").unwrap(),
            "http://localhost:1420"
        );
        assert_eq!(
            normalize_url("127.0.0.1:3000").unwrap(),
            "http://127.0.0.1:3000"
        );
        assert_eq!(
            normalize_url("  example.com  ").unwrap(),
            "http://example.com"
        );
        // An explicit scheme is kept as it is.
        assert_eq!(
            normalize_url("https://example.com/a?b=c").unwrap(),
            "https://example.com/a?b=c"
        );
    }

    /// The security boundary. Each of these is a way an address field becomes
    /// something other than a web request, and the `scheme:opaque` forms are
    /// the ones that must not be quietly prefixed into a bare host.
    #[test]
    fn only_http_and_https_are_accepted() {
        for hostile in [
            "file:///etc/passwd",
            "file:/etc/passwd",
            "javascript:alert(1)",
            "data:text/html,<p>x",
            "asset://localhost/secret",
            "tauri://localhost",
            "ftp://example.com",
            "mailto:someone@example.com",
        ] {
            let refusal =
                normalize_url(hostile).expect_err(&format!("{hostile} must not be accepted"));
            // Reported as a scheme problem, so the user is not sent hunting for
            // a typo.
            assert!(
                refusal.contains("not supported"),
                "{hostile} refused with the wrong reason: {refusal}"
            );
        }
    }

    /// A rejected scheme must never reappear as a host. This is the specific
    /// bug the all-digit test in `explicit_scheme` could have caused if it had
    /// been written as "no `//` means no scheme".
    #[test]
    fn a_rejected_scheme_is_not_turned_into_a_host() {
        assert!(normalize_url("javascript:void(0)").is_err());
        assert!(
            !normalize_url("javascript:void(0)")
                .unwrap_or_default()
                .contains("http://javascript")
        );
    }

    /// The defect this test exists for: `localhost:1420/settings` was refused
    /// with "localhost: addresses are not supported here", because the
    /// host-and-port rule demanded the whole remainder be digits. A bare
    /// `localhost:1420` worked, so the failure appeared only once a route was
    /// typed -- which is the normal way to reach a dev server.
    #[test]
    fn a_host_and_port_may_carry_a_path_query_or_fragment() {
        for (typed, expected) in [
            ("localhost:1420/settings", "http://localhost:1420/settings"),
            ("localhost:1420/", "http://localhost:1420/"),
            ("localhost:1420?q=1", "http://localhost:1420?q=1"),
            ("localhost:1420#top", "http://localhost:1420#top"),
            (
                "127.0.0.1:3000/api/health",
                "http://127.0.0.1:3000/api/health",
            ),
            // Unchanged by the fix, and kept here so a later edit cannot move
            // it without this test noticing.
            ("localhost:1420", "http://localhost:1420"),
        ] {
            assert_eq!(
                normalize_url(typed).unwrap_or_else(|e| panic!("{typed} refused: {e}")),
                expected
            );
        }
    }

    /// The empty-segment case that makes the port rule safe. `file:/etc/passwd`
    /// has nothing before its first `/`, so it must stay a scheme and stay
    /// refused rather than becoming `http://file:/etc/passwd`.
    #[test]
    fn a_scheme_with_an_empty_first_segment_is_still_a_scheme() {
        let refusal = normalize_url("file:/etc/passwd").expect_err("must be refused");
        assert!(refusal.contains("not supported"), "wrong reason: {refusal}");
        assert!(normalize_url("mailto:someone@example.com").is_err());
        assert!(normalize_url("data:text/html,<p>x").is_err());
    }

    /// Stated rather than discovered later. Widening the port rule lets
    /// `javascript:<digits>/...` through as a host, and that is acceptable
    /// precisely because the dangerous part -- the scheme -- is what gets
    /// replaced. The result is an http request to a host that does not resolve,
    /// and it can execute nothing.
    #[test]
    fn a_digit_port_on_a_scheme_like_host_becomes_http_not_script() {
        let out = normalize_url("javascript:1/alert(1)").expect("coerced, not refused");
        assert!(out.starts_with("http://"), "{out}");
        assert!(!out.starts_with("javascript:"), "{out}");
        // The forms that matter are still refused, because their first segment
        // is not a port.
        assert!(normalize_url("javascript:alert(1)").is_err());
        assert!(normalize_url("javascript:void(0)").is_err());
    }

    #[test]
    fn credentials_and_split_addresses_are_refused() {
        assert!(normalize_url("http://user:pass@example.com").is_err());
        assert!(normalize_url("http://example.com/a b").is_err());
        assert!(normalize_url("http://example.com/\nHost: evil").is_err());
        assert!(normalize_url("").is_err());
        assert!(normalize_url("   ").is_err());
        assert!(normalize_url("http://").is_err());
    }

    /// A reading of the address, and only that — no probe ran to produce it.
    #[test]
    fn loopback_is_recognised_without_probing_anything() {
        for local in [
            "http://localhost:1420",
            "http://LOCALHOST",
            "http://127.0.0.1:3000/app",
            "http://127.1.2.3",
            "http://[::1]:8080",
        ] {
            assert!(is_loopback(local), "{local} is local");
        }
        for remote in [
            "https://example.com",
            "http://127.example.com",
            "https://not-localhost.dev",
        ] {
            assert!(!is_loopback(remote), "{remote} is not local");
        }
    }

    // -- storage scope ------------------------------------------------------

    /// The isolation the design package requires, in both directions: stable for
    /// one project so a session survives a relaunch, and different between
    /// projects so neither can read the other's cookies.
    #[test]
    fn a_storage_scope_is_stable_per_project_and_unique_between_them() {
        let a = storage_scope_id("8f14e45fceea167a");
        let b = storage_scope_id("c4ca4238a0b92382");
        assert_eq!(
            a,
            storage_scope_id("8f14e45fceea167a"),
            "must survive a relaunch"
        );
        assert_ne!(a, b, "two projects must not share a store");
        // The exact shape the verified API takes.
        assert_eq!(a.len(), 16);
        // All-zero would be read as the app's own default store.
        assert!(a.iter().any(|&x| x != 0) && b.iter().any(|&x| x != 0));
        // Neither half may be a copy of the other, or a project id would only
        // be contributing 8 bytes of spread.
        assert_ne!(a[..8], a[8..]);
        assert_eq!(storage_scope_hex("8f14e45fceea167a").len(), 32);
    }

    // -- lifecycle ----------------------------------------------------------

    fn registry() -> BrowserRegistry {
        BrowserRegistry::default()
    }

    fn bounds(width: f64, height: f64) -> PaneBounds {
        PaneBounds {
            x: 0.0,
            y: 0.0,
            width,
            height,
        }
    }

    /// The whole lifecycle in the order a tab lives it, including the guard that
    /// `terminal-pane.tsx:85-87` explains: a hidden pane reports 0×0 and that
    /// measurement must not be stored.
    #[test]
    fn a_hidden_pane_keeps_its_bounds_and_its_history() {
        let reg = registry();
        let mut map = reg.0.lock().unwrap();
        map.insert(
            "tab-1".to_string(),
            BrowserPane {
                project_id: "proj-a".to_string(),
                history: History::default(),
                bounds: None,
                visible: false,
                generation: 0,
            },
        );
        drop(map);

        let laid_out = with_pane(&reg, "tab-1", |p| {
            p.history.push("http://localhost:1420".to_string());
            p.bounds = Some(bounds(900.0, 600.0));
            p.visible = true;
            Ok(())
        })
        .unwrap();
        assert_eq!(laid_out.bounds, Some(bounds(900.0, 600.0)));

        // The hide: a 0x0 measurement arrives, and is dropped rather than
        // stored. This is the destructive case.
        let hidden = with_pane(&reg, "tab-1", |p| {
            if bounds(0.0, 0.0).is_drawable() {
                p.bounds = Some(bounds(0.0, 0.0));
            }
            p.visible = false;
            Ok(())
        })
        .unwrap();
        assert!(!hidden.visible);
        assert_eq!(
            hidden.bounds,
            Some(bounds(900.0, 600.0)),
            "a hidden pane must not be resized to 0x0"
        );
        assert_eq!(hidden.url.as_deref(), Some("http://localhost:1420"));
        assert!(hidden.loopback);

        // Destroy-on-close, and the pane is genuinely gone.
        assert!(reg.0.lock().unwrap().remove("tab-1").is_some());
        assert!(with_pane(&reg, "tab-1", |_| Ok(())).is_err());
    }

    /// A measurement taken mid-layout arrives as NaN. Kept out for the same
    /// reason zero is: it would poison every later comparison instead of
    /// failing where it happened.
    #[test]
    fn only_drawable_bounds_are_accepted() {
        assert!(bounds(900.0, 600.0).is_drawable());
        assert!(!bounds(0.0, 0.0).is_drawable());
        assert!(!bounds(900.0, 0.0).is_drawable());
        assert!(!bounds(f64::NAN, 600.0).is_drawable());
        assert!(!bounds(f64::INFINITY, 600.0).is_drawable());
        assert!(!bounds(0.5, 600.0).is_drawable());
    }

    /// Back and forward over the addresses the tab has held, including the
    /// branch-discarding rule and the duplicate suppression that otherwise makes
    /// `back` look broken.
    #[test]
    fn history_moves_both_ways_and_forward_is_dropped_on_a_new_address() {
        let mut h = History::default();
        assert!(!h.can_go_back() && !h.can_go_forward());
        assert_eq!(h.current(), None);

        h.push("http://a.test".to_string());
        h.push("http://b.test".to_string());
        // A repeat is a reload, not an entry.
        h.push("http://b.test".to_string());
        assert_eq!(h.entries.len(), 2);

        assert!(h.back());
        assert_eq!(h.current(), Some("http://a.test"));
        assert!(h.can_go_forward());
        assert!(!h.can_go_back());
        assert!(!h.back(), "already at the start");

        assert!(h.forward());
        assert_eq!(h.current(), Some("http://b.test"));
        assert!(!h.forward(), "already at the end");

        // Navigating from a point you went back to abandons the branch.
        h.back();
        h.push("http://c.test".to_string());
        assert_eq!(h.current(), Some("http://c.test"));
        assert!(!h.can_go_forward(), "b.test was abandoned");
        assert_eq!(h.entries.len(), 2);
    }

    /// The bound, and the cursor staying on the right entry as the oldest ones
    /// are dropped.
    #[test]
    fn history_is_bounded_and_the_cursor_follows() {
        let mut h = History::default();
        for i in 0..(MAX_HISTORY + 10) {
            h.push(format!("http://h{i}.test"));
        }
        assert_eq!(h.entries.len(), MAX_HISTORY);
        assert_eq!(
            h.current(),
            Some(format!("http://h{}.test", MAX_HISTORY + 9).as_str()),
            "the newest address stays current while the oldest are dropped"
        );
        assert!(h.can_go_back() && !h.can_go_forward());
    }

    // -- the published capability -------------------------------------------

    /// The report a later task quotes. It must state the limitation rather than
    /// imply a surface this build cannot host.
    #[test]
    fn the_capability_states_the_limitation_and_names_the_running_version() {
        let cap = browser_capability();
        assert!(
            !cap.embedded_surface,
            "this build cannot embed a browsing surface"
        );
        let reason = cap.reason.expect("an unavailable surface must say why");
        assert!(reason.contains("unstable"), "the reason must name the gate");
        assert_eq!(cap.fallback, EXTERNAL_FALLBACK);
        // Read from the crate, so the report cannot quote a remembered version.
        assert_eq!(cap.tauri_version, tauri::VERSION);
        assert!(cap.tauri_version.starts_with("2."));
        // The isolation contract travels with the capability.
        assert_eq!(cap.denied_to_remote_content.len(), 5);
        assert!(
            cap.denied_to_remote_content
                .iter()
                .any(|d| d.contains("IPC"))
        );
        // And nothing here asks for the app's policy to be widened.
        assert!(cap.csp_requirement.contains("None"));
    }

    // -- an address this build cannot reach ---------------------------------
    //
    // What "unreachable" means on this path, stated before it is tested,
    // because a test that pretended otherwise would be worse than none: this
    // module performs no network request. No webview is created (see the module
    // header), `is_loopback` reads a string, and nothing probes. So a dev
    // server that is not running is not observable here at all — the two
    // failures a navigation can actually produce are a refusal by
    // `normalize_url` and a navigation aimed at a tab that is not open. Both
    // are exercised below, alongside the case that reads as the bad one and is
    // not a failure at all: a perfectly valid address nothing is listening on,
    // which is accepted and recorded exactly like any other.
    //
    // The invariant under test is the one that matters to a running
    // `/ec-execute`: whatever happens to one Browser tab, no other pane moves.
    // PTY isolation itself is structural rather than asserted here — see
    // `no_code_in_this_module_can_reach_a_terminal_session_or_a_process`.

    /// Everything the frontend would redraw for one tab, as one string. The
    /// view is the whole of what a pane publishes, so comparing its serialised
    /// form compares every field — including ones added later, which a
    /// hand-written field-by-field comparison would silently stop covering.
    fn fingerprint(reg: &BrowserRegistry, tab_id: &str) -> String {
        let view = with_pane(reg, tab_id, |_| Ok(())).expect("pane must still be there");
        serde_json::to_string(&view).expect("a view always serialises")
    }

    /// Three tabs, two of them with real state to lose, and every failure a
    /// navigation on this build can produce aimed at the third.
    #[test]
    fn an_address_this_build_cannot_reach_leaves_every_other_pane_byte_identical() {
        let reg = registry();

        // Two panes carrying the state a crash or a stray resize would damage:
        // an address, a history to go back through, geometry and visibility.
        open_in(&reg, "tab-live".into(), "proj-a".into(), None).unwrap();
        navigate_in(&reg, "tab-live", "localhost:1420").unwrap();
        // Bare, the way it is typed at a dev server route. This spelling was
        // refused while `explicit_scheme` required the whole remainder after
        // the colon to be digits; it is accepted now, and
        // `a_host_and_port_may_carry_a_path_query_or_fragment` is where that
        // belongs — here it is just the second address in a history.
        navigate_in(&reg, "tab-live", "localhost:1420/settings").unwrap();
        open_in(
            &reg,
            "tab-other".into(),
            "proj-b".into(),
            Some("https://example.com/a".into()),
        )
        .unwrap();
        with_pane(&reg, "tab-live", |p| {
            p.bounds = Some(bounds(900.0, 600.0));
            p.visible = true;
            Ok(())
        })
        .unwrap();
        with_pane(&reg, "tab-other", |p| {
            p.bounds = Some(bounds(420.0, 320.0));
            p.visible = true;
            Ok(())
        })
        .unwrap();

        // The tab the user points at a dev server that is not up.
        open_in(&reg, "tab-dead".into(), "proj-a".into(), None).unwrap();

        let live_before = fingerprint(&reg, "tab-live");
        let other_before = fingerprint(&reg, "tab-other");
        let dead_before = fingerprint(&reg, "tab-dead");
        assert_eq!(reg.0.lock().unwrap().len(), 3);

        // Every way a navigation can fail here, in one tab.
        for refused in [
            "javascript:alert(1)",             // refused scheme
            "file:///etc/passwd",              // refused scheme
            "http://user:pass@localhost:1420", // credentials in the address
            "http://localhost:1420/a b",       // a split address
            "",                                // nothing typed
        ] {
            assert!(
                navigate_in(&reg, "tab-dead", refused).is_err(),
                "{refused} must be refused"
            );
        }
        // And a navigation aimed at a tab that is not open, which is the only
        // other failure the registry can produce.
        assert!(navigate_in(&reg, "tab-never-opened", "localhost:1420").is_err());

        // The refused tab is where it was: still blank, still generation 0.
        assert_eq!(fingerprint(&reg, "tab-dead"), dead_before);
        // Neither other pane moved a byte. This is the invariant: a failure
        // against one key in `BrowserRegistry` is confined to that key.
        assert_eq!(fingerprint(&reg, "tab-live"), live_before);
        assert_eq!(fingerprint(&reg, "tab-other"), other_before);
        // And no tab appeared or vanished.
        assert_eq!(reg.0.lock().unwrap().len(), 3);

        // The case that looks like the failure and is not one: a well-formed
        // loopback address with nothing listening on it. Accepted, recorded,
        // labelled local — because this module never asked the port anything.
        let dead = navigate_in(&reg, "tab-dead", "localhost:1").unwrap();
        assert_eq!(dead.url.as_deref(), Some("http://localhost:1"));
        assert!(dead.loopback, "a reading of the address, not a probe");
        assert_eq!(fingerprint(&reg, "tab-live"), live_before);
        assert_eq!(fingerprint(&reg, "tab-other"), other_before);

        // destroy-on-close of the tab that never reached anything. It takes its
        // own entry and nothing else: no other pane, and no session of any
        // kind, because this registry holds nothing but these three panes.
        assert!(close_in(&reg, "tab-dead").is_ok());
        assert!(close_in(&reg, "tab-dead").is_err(), "and it is really gone");
        assert_eq!(reg.0.lock().unwrap().len(), 2);
        assert_eq!(fingerprint(&reg, "tab-live"), live_before);
        assert_eq!(fingerprint(&reg, "tab-other"), other_before);
    }

    /// The pane the refusal was aimed at keeps the address it already had. A
    /// failed load that blanked the pane would be the same class of bug as a
    /// resize to 0×0: state destroyed by an event that should only have been
    /// reported.
    #[test]
    fn a_refused_navigation_moves_nothing_in_the_pane_it_was_aimed_at() {
        let reg = registry();
        open_in(&reg, "tab-1".into(), "proj-a".into(), None).unwrap();
        navigate_in(&reg, "tab-1", "localhost:1420").unwrap();
        navigate_in(&reg, "tab-1", "localhost:1420/a").unwrap();
        with_pane(&reg, "tab-1", |p| {
            p.bounds = Some(bounds(900.0, 600.0));
            p.visible = true;
            p.generation = 7;
            Ok(())
        })
        .unwrap();

        let before = fingerprint(&reg, "tab-1");
        // Matched rather than `expect_err`: the success type is a view, and
        // deriving `Debug` on it just to print one in a test would widen a
        // wire type for the test's convenience.
        let refusal = match navigate_in(&reg, "tab-1", "data:text/html,<p>x") {
            Err(refusal) => refusal,
            Ok(_) => panic!("a data: address must be refused"),
        };
        assert!(refusal.contains("not supported"));
        assert_eq!(
            fingerprint(&reg, "tab-1"),
            before,
            "a refusal must not touch the address, the history, the geometry or the generation"
        );

        // Back still goes where it did, which it would not if the refusal had
        // pushed an entry or moved the cursor.
        let back = with_pane(&reg, "tab-1", |p| {
            assert!(p.history.back());
            Ok(())
        })
        .unwrap();
        assert_eq!(back.url.as_deref(), Some("http://localhost:1420"));
        assert!(back.can_go_forward);
    }

    /// Why PTY isolation is argued structurally and not asserted directly, and
    /// the guard that keeps the argument true.
    ///
    /// Asserting that a failed navigation leaves a terminal alone would mean
    /// importing the terminal module into this one, so that a test could hold
    /// its registry (`pty.rs:113`) beside the browser one — creating, for the
    /// sake of a test, exactly the coupling that makes the bug possible. This
    /// module imports nothing from the crate today, so there is no name in
    /// scope here that leads to a terminal session at all: ending one needs
    /// that module's own `kill` (`pty.rs:75`) or a signal, and reaching either
    /// needs a path into a sibling module or into the standard library's
    /// process API. Neither exists here.
    ///
    /// That is a claim about the source, so it is checked against the source.
    /// Each needle is written in pieces so this guard cannot match itself, and
    /// so this file's count of crate-root paths stays at zero.
    #[test]
    fn no_code_in_this_module_can_reach_a_terminal_session_or_a_process() {
        let src = include_str!("browser.rs");
        for needle in [
            concat!("crate", "::"),         // any path to another module's state
            concat!("super", "::pty"),      // the sibling path that skips `crate`
            concat!("std::", "process"),    // spawning or signalling anything
            concat!("Session", "Registry"), // pty.rs:113, the terminal registry
            concat!("Pty", "Session"),      // and the session itself
            concat!(".kill", "("),          // the call that ends one
            concat!("libc", "::"),          // and the way around all of the above
        ] {
            assert!(
                !src.contains(needle),
                "browser.rs must hold no route to a terminal session, but it names `{needle}`"
            );
        }
    }
}
