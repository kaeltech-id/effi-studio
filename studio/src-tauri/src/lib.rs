mod agents;
mod browser;
mod connections;
mod devices;
mod doctor;
mod experiences;
mod git;
mod jira;
mod keychain;
mod mcp;
// Registered in the same edit that created the file: four complete, tested
// modules in this crate sat outside the module tree for hours, and 37 tests
// that had never been compiled came with them.
//
// `pub` where every sibling is private, and the reason is the migration's own
// shape rather than a convention being broken for its own sake. Every entry
// point in it takes the config PATH as a parameter, because projects.rs owns
// where studio.json lives (`config_path`, projects.rs:97-99) and a second copy
// of that path is precisely the accident Task 119 exists to prevent — two
// spellings that drift are how an upgrade reads an empty config and the user
// loses every project they added. `config_path` is private and off limits to
// this change, so nothing in this file can call the migration without writing
// that path out a second time, and nothing does. Publishing the module is what
// keeps that an API with no caller yet rather than dead code: when
// `config_path` becomes reachable, `migrate::migrate_file` is the one call to
// add, beside `tabs::prune_tabs()` in `setup` below.
pub mod migrate;
mod plan;
mod projects;
mod pty;
mod setup;
mod shell_env;
mod tabs;
mod tree;
mod watcher;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
// The trait, so `MacKeychain`'s three methods are callable here. The store is
// reached through it rather than through inherent methods so that the functions
// below can be handed an in-memory fake in the tests.
use keychain::SecretStore;
use tauri::path::BaseDirectory;
use tauri::Manager;

#[tauri::command]
fn resolve_claude(override_path: Option<String>) -> Result<String, String> {
    shell_env::resolve_claude(override_path.as_deref())
        .map(|p| p.to_string_lossy().into_owned())
}

/// Generated here rather than accepted from the caller, which is what lets one
/// project hold several terminals: a caller that named the session after its
/// project could only ever own one, and two tabs arriving with the same key
/// would put one tab's keystrokes into the other tab's process.
static NEXT_SESSION: AtomicU64 = AtomicU64::new(1);

/// The provider set comes off disk now that StudioConfig carries it, which is
/// what makes a user-defined CLI openable rather than merely listable: this
/// helper previously rebuilt an empty registry plus the one `claude_override`,
/// so pty_start below could never see a custom provider at all.
///
/// Read per open rather than cached, so a CLI added in Settings is launchable
/// without a relaunch. The legacy `claude_override` is still honoured, and the
/// fold-in lives in agents::persisted_state so that one function is the only
/// answer to what a provider's path is. Resolving through the registry rather
/// than trusting a program the frontend sends is what keeps a provider's own
/// argv attached to its path — the two cannot disagree if they arrive together.
fn provider_state() -> agents::ProviderState {
    agents::persisted_state()
}

/// Hands out the next session's id without spawning anything, so a pane can be
/// subscribed to that id BEFORE any process exists to write to it. Opening and
/// starting are two commands for exactly the reason recorded at
/// terminal-pane.tsx:61-62: listen() resolves asynchronously, and a single
/// mint-and-spawn command forced the caller to spawn first and subscribe after,
/// which dropped the session's opening output. This is the project-pane
/// equivalent of INSTALL_SESSION below — an id known in advance.
///
/// Registers no process and inserts NO map entry. A reserved placeholder would
/// have to be some value in a `HashMap<String, PtySession>`, so it would mean
/// inventing an empty PtySession variant that pty_write, pty_resize, pty_close
/// and kill_all_sessions would then each have to recognise and skip; an id that
/// is simply not in the map already behaves correctly everywhere — those four
/// answer `no session: {id}` for it, which is the truth until pty_start runs.
#[tauri::command]
fn pty_reserve() -> String {
    format!("sess-{}", NEXT_SESSION.fetch_add(1, Ordering::Relaxed))
}

/// Spawns the agent under an id the caller already holds from pty_reserve.
/// Every later call about this terminal is keyed on that id rather than on the
/// project.
///
/// Two resolution paths, because the terminal is not a provider. A shell tab
/// asks for `agents::SHELL_ID` and is answered by `agents::shell_agent()`,
/// which resolves `$SHELL`; everything else is looked up in the provider
/// registry. The shell is kept OUT of that registry on purpose and the reason
/// is recorded on SHELL_ID — it would otherwise be offered as an AI provider
/// everywhere the `agents` command is read. The cost of keeping it out is this
/// one `if`, at the single call site that launches anything.
///
/// Which is what makes DESIGN-SPEC.md §2's "Terminal · fasilitas dasar" true
/// of the code: a user with no Claude, no Codex and no custom CLI still gets a
/// working terminal, because nothing on this path consults the registry at all.
#[tauri::command]
fn pty_start(
    app: tauri::AppHandle,
    reg: tauri::State<pty::SessionRegistry>,
    id: String,
    cwd: String,
    agent: String,
) -> Result<(), String> {
    let definition = if agent == agents::SHELL_ID {
        agents::shell_agent()
    } else {
        agents::registry(&provider_state())
            .into_iter()
            .find(|a| a.id == agent)
            .ok_or_else(|| format!("no agent: {agent}"))?
    };
    let (program, args, detail) = (definition.program, definition.args, definition.detail);
    // The resolver's own words name the path it tried, so they are reported as
    // they are instead of being flattened into a second "not found".
    let program = program.ok_or_else(|| detail.unwrap_or_else(|| format!("{agent} not found")))?;

    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    // A second start on one id is a no-op, not a second process: StrictMode
    // mounts a pane twice, and the id it was given is the same both times.
    if map.contains_key(&id) {
        return Ok(());
    }
    let session = pty::spawn(&cwd, &program, &args, shell_env::login_shell_path())?;
    pty::start_reader(app, id.clone(), session.reader()?);
    map.insert(id, session);
    Ok(())
}

#[tauri::command]
fn pty_write(reg: tauri::State<pty::SessionRegistry>, id: String, data: String) -> Result<(), String> {
    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    map.get_mut(&id).ok_or_else(|| format!("no session: {id}"))?.write(&data)
}

#[tauri::command]
fn pty_resize(reg: tauri::State<pty::SessionRegistry>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    let map = reg.0.lock().map_err(|e| e.to_string())?;
    map.get(&id).ok_or_else(|| format!("no session: {id}"))?.resize(rows, cols)
}

#[tauri::command]
fn pty_close(reg: tauri::State<pty::SessionRegistry>, id: String) -> Result<(), String> {
    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    match map.remove(&id) {
        Some(mut session) => {
            session.kill();
            Ok(())
        }
        None => Err(format!("no session: {id}")),
    }
}

/// Reserved id for the installer session. Project ids are path-derived 16-hex
/// digests, so this cannot collide with one.
const INSTALL_SESSION: &str = "__install__";

/// Exposed rather than hardcoded in the frontend: the install pane must
/// subscribe to this id BEFORE install_efficlaude opens the session, for the
/// reason recorded at terminal-pane.tsx:52-54 — a late subscription drops the
/// opening output. Two copies of the literal would eventually disagree.
#[tauri::command]
fn install_session_id() -> &'static str {
    INSTALL_SESSION
}

/// Single-quoted because the resolved path contains a space in every bundled
/// build (/Applications/EffiClaude Studio.app/Contents/Resources/install.sh):
/// written bare, bash splits it at the space and the installer never runs. Dev
/// paths have no space, which is why this only ever failed in the shipped .app.
/// One copy of it, used by every caller that writes an install command line, so
/// a second entry point cannot reintroduce the bare form.
fn shell_quoted(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', r"'\''"))
}

/// Why a new installer run cannot start, in the words the user is shown. One
/// const because the guard that refuses and the query the UI asks before
/// offering a retry button must not be able to disagree about the condition.
const INSTALLER_BUSY: &str = "an installer is still running in this window's install terminal — it may be sitting at a prompt waiting for an answer. Answer it, or close that terminal, and then start this again.";

/// Is the reserved installer slot occupied by a process that is still alive?
///
/// The map alone cannot answer that: an entry outlives the process, which is
/// precisely the dead-button bug — `map.contains_key` was read as "busy" long
/// after the run had finished, so every later attempt was refused in silence.
/// The entry is therefore only half the question and the process is the other
/// half.
pub(crate) fn install_session_alive(map: &mut HashMap<String, pty::PtySession>) -> bool {
    map.get_mut(INSTALL_SESSION)
        .is_some_and(|session| !session.has_exited())
}

/// Whether a (re)run may start right now, and what stands in the way when it
/// may not.
///
/// Serialize only and no Deserialize: this is an answer, never an input.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryState {
    pub can_retry: bool,
    /// `None` exactly when `can_retry` is true.
    pub reason: Option<String>,
}

/// Read by the UI before it offers "Retry this component", so the button exists
/// only where the lifecycle genuinely supports pressing it. Asking does not
/// clean anything up — a query that reclaimed the slot would make merely
/// rendering the screen the act that discarded a run.
pub(crate) fn retry_state(map: &mut HashMap<String, pty::PtySession>) -> RetryState {
    if install_session_alive(map) {
        RetryState {
            can_retry: false,
            reason: Some(INSTALLER_BUSY.to_string()),
        }
    } else {
        RetryState {
            can_retry: true,
            reason: None,
        }
    }
}

#[tauri::command]
fn install_retry_state(reg: tauri::State<pty::SessionRegistry>) -> Result<RetryState, String> {
    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    Ok(retry_state(&mut map))
}

/// Takes the installer slot for a new run, or explains why it cannot be taken.
///
/// This is the retry. The old guard returned `Ok(())` when the key was present,
/// so pressing Install a second time reported success and did nothing at all;
/// the two outcomes it conflated are separated here. A slot whose process has
/// terminated is reclaimed and the run proceeds. A slot whose process is still
/// alive is REPORTED as an error, never as success: an installer parked on a
/// `read` is alive and waiting for the user, and killing it from under them to
/// make room for a second one is not something a retry may decide on its own —
/// closing that terminal is an action the user takes (pty_close).
fn claim_install_session(map: &mut HashMap<String, pty::PtySession>) -> Result<(), String> {
    if install_session_alive(map) {
        return Err(INSTALLER_BUSY.to_string());
    }
    // Either nothing was here or what was here has terminated. `has_exited`
    // reaped it, so the entry is dropped rather than killed: there is no live
    // process left to signal, and signalling a pid that has been reaped is how
    // a recycled pid gets killed instead.
    drop(map.remove(INSTALL_SESSION));
    Ok(())
}

/// Starts install.sh in the reserved installer session. Running it in the PTY
/// puts its output and its prompts in the terminal the user is already looking
/// at, which is also why `Ok` here means STARTED and never means finished or
/// ready.
///
/// `only` is the --only list to narrow the run to. `None` is a BARE invocation,
/// which install.sh reads as EVERY component (install.sh:63-65) — so `None` is
/// reachable from exactly one named operation, setup::install_all_legacy, and
/// from nothing that builds a selection.
///
/// One function because the resource resolution and the quoting below are the
/// two things that have each broken only in the shipped .app; a second copy of
/// either is a defect that cannot be found in dev.
pub(crate) fn start_installer(
    app: &tauri::AppHandle,
    reg: &pty::SessionRegistry,
    only: Option<&str>,
) -> Result<(), String> {
    // The resource path differs between dev and a bundled .app, so this must be
    // resolved — a hardcoded relative path fails only in the shipped build.
    let script = app
        .path()
        .resolve("install.sh", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());

    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    claim_install_session(&mut map)?;

    let mut session = pty::spawn(&home, "/bin/bash", &[], shell_env::login_shell_path())?;
    pty::start_reader(app.clone(), INSTALL_SESSION.to_string(), session.reader()?);
    // Built from `only` rather than concatenated by the caller: an empty string
    // written as `--only=` names no component and install.sh exits having done
    // nothing (install.sh:133-146), while a MISSING flag installs everything.
    // The two must not be one keystroke apart at a call site.
    let scope = match only {
        Some(list) => format!(" --only={list}"),
        None => String::new(),
    };
    session.write(&format!("bash {}{scope}\r", shell_quoted(&script)))?;
    map.insert(INSTALL_SESSION.to_string(), session);
    Ok(())
}

/// Kept because the shipped frontend calls it under this name (tauri-api.ts:25,
/// App.tsx:486) and because an existing user's one-click full install must keep
/// working. It is a thin alias for the one named bare-invocation operation
/// rather than a second path to it: `install_all_legacy` owns the scope it
/// covers and is the only place that passes `None` to start_installer.
#[tauri::command]
fn install_efficlaude(
    app: tauri::AppHandle,
    reg: tauri::State<pty::SessionRegistry>,
) -> Result<(), String> {
    setup::run_install_all_legacy(&app, &reg).map(|_| ())
}

/// Watchers and PTY sessions have independent lifetimes — closing a terminal
/// must not stop watching the project, and vice versa.
#[derive(Default)]
struct WatcherRegistry(Mutex<HashMap<String, watcher::SharedWatcher>>);

/// A folder that has been deleted on disk fails to watch; that must never stop
/// the other projects from being watched.
fn start_watch(app: &tauri::AppHandle, id: &str, path: &str) {
    let Ok(w) = watcher::watch(app.clone(), id.to_string(), PathBuf::from(path)) else {
        return;
    };
    if let Some(reg) = app.try_state::<WatcherRegistry>() {
        if let Ok(mut map) = reg.0.lock() {
            map.insert(id.to_string(), w);
        }
    }
}

// add_project and remove_project are wrapped here rather than registered from
// projects.rs: the watcher set is lib.rs's concern, and wrapping is what keeps
// it exactly equal to the configured set.
#[tauri::command]
async fn add_project(app: tauri::AppHandle) -> Result<Option<projects::ProjectView>, String> {
    let added = projects::add_project(app.clone()).await?;
    if let Some(p) = &added {
        start_watch(&app, &p.id, &p.path);
    }
    Ok(added)
}

/// Wrapped for the same reason add_project is: a promoted folder must start
/// being watched, and that is lib.rs's concern rather than projects.rs's.
#[tauri::command]
fn promote_project(app: tauri::AppHandle, path: String) -> Result<projects::ProjectView, String> {
    let added = projects::promote_project(path)?;
    start_watch(&app, &added.id, &added.path);
    Ok(added)
}

#[tauri::command]
fn remove_project(app: tauri::AppHandle, id: String) -> Result<(), String> {
    projects::remove_project(id.clone())?;
    if let Some(reg) = app.try_state::<WatcherRegistry>() {
        if let Ok(mut map) = reg.0.lock() {
            // Taken out of the map, not left in it: the drop is what stops the thread.
            drop(map.remove(&id));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Connections
//
// connections.rs defines no #[tauri::command] on purpose, and its header
// (connections.rs:68-99) records why: a command that could not persist would be
// half an operation, so the commands belong wherever the StudioConfig field
// lands. It landed in this task, so they are here.
//
// The two accessors that header specifies are the two functions below. They are
// the only place `cfg.connections` is read or written, which is what keeps
// projects.rs's load()/save() the single persistence mechanism in this app.
// ---------------------------------------------------------------------------

fn connections_persisted_state() -> connections::ConnectionState {
    projects::load().connections
}

fn persist_connections(state: connections::ConnectionState) -> Result<(), String> {
    let mut cfg = projects::load();
    cfg.connections = state;
    projects::save(&cfg)
}

/// `installed_adapters` returns owned boxes and every function in connections.rs
/// takes `&[&dyn ConsumerAdapter]`, so the boxes must outlive the borrow. Built
/// in one helper rather than per command so that `installed_adapters` stays the
/// only answer to which (connector, consumer) pairs have code behind them
/// (connections.rs:471-477) — a second list is how a cell ends up claiming
/// support that was never written.
fn adapter_refs(
    owned: &[Box<dyn connections::ConsumerAdapter>],
) -> Vec<&dyn connections::ConsumerAdapter> {
    owned.iter().map(|a| a.as_ref()).collect()
}

/// Read the state, hand a `&mut` to the plain function in connections.rs that
/// owns the rule, write it back, answer with the whole refreshed matrix.
///
/// Every mutating command below is exactly these four steps, which is the point:
/// no rule is restated here. `Vec<Connection>` rather than the single row that
/// changed, because `connections::connections` folds the catalogue rows and the
/// configured rows into one list, and a caller patching one row would have to
/// re-derive that fold in the frontend.
///
/// The view is computed BEFORE the write so the answer describes the state that
/// was actually persisted, and so a failed save returns the error rather than a
/// matrix the disk does not agree with.
fn with_connections<T>(
    op: impl FnOnce(
        &mut connections::ConnectionState,
        &[&dyn connections::ConsumerAdapter],
    ) -> Result<T, String>,
) -> Result<Vec<connections::Connection>, String> {
    let mut state = connections_persisted_state();
    let owned = connections::installed_adapters();
    let adapters = adapter_refs(&owned);
    op(&mut state, &adapters)?;
    let view = connections::connections(&state, &adapters);
    persist_connections(state)?;
    Ok(view)
}

#[tauri::command]
fn list_connections() -> Vec<connections::Connection> {
    let state = connections_persisted_state();
    let owned = connections::installed_adapters();
    connections::connections(&state, &adapter_refs(&owned))
}

/// The detail panel's five fields for one row (connections-page.tsx:58-69).
///
/// `Option` rather than `Result`: a catalogue row is a legitimate id with no
/// stored record behind it, and `null` is the honest answer for it — an error
/// would make merely selecting the GitHub row look like a fault. The panel keys
/// its lookup the same way (`ConnectionDetail | undefined`).
///
/// Carries COORDINATES and never a value, which is `ConnectionDetail`'s doing
/// rather than this function's: it has no field a secret could sit in.
#[tauri::command]
fn connection_detail(id: String) -> Option<connections::ConnectionDetail> {
    connections_persisted_state()
        .find(&id)
        .map(connections::detail)
}

/// The connection as a preview may print it — label/value pairs for a change
/// preview, a support paste or a screenshot.
///
/// Safe because `connections::safe_summary` has nothing to redact: the only
/// credential fact it can reach is the pair of coordinates, so there is no
/// branch of it that could print a secret even if one existed to print
/// (connections.rs:1080-1086). Wired to a command rather than left unused so
/// that the surface the invariant names — "not in a config preview" — is one a
/// reviewer can actually call and read.
#[tauri::command]
fn connection_preview(id: String) -> Result<Vec<(&'static str, String)>, String> {
    let state = connections_persisted_state();
    let rec = state
        .find(&id)
        .ok_or_else(|| format!("no connection with id {id}"))?;
    Ok(connections::safe_summary(rec))
}

/// The id is returned alongside the refreshed list because the next step of the
/// flow (connect, then check, then bind) is keyed on it, and configuring twice
/// returns the same id rather than a second row (connections.rs:660-666).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfiguredConnection {
    pub id: String,
    pub connections: Vec<connections::Connection>,
}

#[tauri::command]
fn configure_connection(
    request: connections::ConfigureRequest,
) -> Result<ConfiguredConnection, String> {
    let mut state = connections_persisted_state();
    let id = connections::configure(&mut state, request)?;
    let owned = connections::installed_adapters();
    let view = connections::connections(&state, &adapter_refs(&owned));
    persist_connections(state)?;
    Ok(ConfiguredConnection {
        id,
        connections: view,
    })
}

// ---------------------------------------------------------------------------
// The secret itself — the one command in this binary that touches a value
//
// Everything above and below handles a `CredentialRef`: service, account, kind.
// This is where the token the user typed goes, and it goes to the OS keychain
// and nowhere else (keychain.rs:1-37 states the invariant and how the shape of
// each type enforces it).
//
// Note what this command does NOT do:
//   * it does not return the connection matrix, because storing a secret
//     changes no cell. `consumer_status` derives every status from the stored
//     REFERENCE, the bindings and the last check (connections.rs:1007) — never
//     from whether the keychain holds anything — so a matrix returned here
//     would be identical to the one the caller already has, and returning one
//     would suggest the status moved;
//   * it does not set `connect_requested`, bind a consumer or record health. A
//     stored token is still `configured`;
//   * it does not write to studio.json at all. The reference was persisted by
//     `configure_connection`; this adds nothing to the file, which is the whole
//     point.
// ---------------------------------------------------------------------------

/// Stores the secret for an already-configured connection in the OS keychain.
///
/// `secret` is a parameter and never a field: nothing in this crate has a struct
/// with somewhere to put it, so there is no shape for serde to write out and no
/// value to find in studio.json, in a log or in a preview. It lives for the
/// length of this call.
///
/// Refuses when the connection has no credential reference, because the
/// coordinates are what the item is stored under — there is no "store it
/// somewhere and sort the name out later". The form collects service and account
/// first (connections.rs:639-646), and `configure` has already rejected an empty
/// one, so this refusal is the second fence rather than the only one.
#[tauri::command]
fn store_connection_secret(id: String, secret: String) -> Result<(), String> {
    let state = connections_persisted_state();
    let rec = state
        .find(&id)
        .ok_or_else(|| format!("no connection with id {id}"))?;
    let cred = rec.credential.as_ref().ok_or_else(|| {
        format!(
            "`{}` has no credential coordinates yet — give it a service and an account before \
             storing a secret for it",
            rec.label
        )
    })?;
    keychain::MacKeychain.put(cred, &secret)
}

// ---------------------------------------------------------------------------
// The custom MCP form
//
// Three commands, and the split between them is the rule DESIGN-SPEC.md:123
// states: "input terstruktur, bukan menjalankan arbitrary shell saat form
// dibuka".
//
//   * `mcp_form_fields` is what the form opens with. It is a pure read of two
//     constants in mcp.rs — no process, no shell, no probe, no filesystem, no
//     network — so opening the form has no side effect at all;
//   * `validate_mcp_launch` is the same pure check `configure_connection`
//     performs, exposed so the form can refuse a field while the user is still
//     looking at it. Still nothing runs;
//   * `resolve_mcp_program` is the ONLY one that touches anything, and it looks
//     rather than runs: it reports where a program is, never what happens when
//     it is started. It is reachable only from an explicit action on a
//     filled-in form.
//
// The launch itself is stored by `configure_connection` above, which validates
// it inside `connections::configure` — so the form cannot be bypassed by
// calling the configure command directly.
// ---------------------------------------------------------------------------

/// The form-open call. Pure; see the note above.
#[tauri::command]
fn mcp_form_fields() -> mcp::FormSpec {
    mcp::fields()
}

/// Structural validation, with a refusal that names the field. Corrects
/// nothing: mcp.rs records why a stored server address is never silently
/// edited.
#[tauri::command]
fn validate_mcp_launch(launch: mcp::McpLaunch) -> Result<(), String> {
    mcp::validate(&launch)
}

/// Where the program would be found, WITHOUT starting it. The one command on
/// this path that reads anything, and it reads the filesystem only.
#[tauri::command]
fn resolve_mcp_program(launch: mcp::McpLaunch) -> Result<String, String> {
    mcp::resolve_program(&launch)
}

/// The stored launch for one connection, as a shape of its own.
///
/// Deliberately NOT a sixth field on `ConnectionDetail`: that type mirrors the
/// five fields of `ConnectionDetail` in connections-page.tsx:58-69 exactly, and
/// its serialised bytes are asserted in two tests. Widening a wire contract the
/// frontend already reads, to carry something only the MCP form wants, would
/// make every other consumer of the detail panel pay for it. `None` for a
/// catalogue row, for a connection that is not Custom MCP, and for one whose
/// launch has not been filled in — three different truths that all mean "there
/// is nothing to show here", which is what the form needs to know.
#[tauri::command]
fn mcp_launch_detail(id: String) -> Option<mcp::McpLaunch> {
    connections_persisted_state()
        .find(&id)
        .and_then(|rec| rec.mcp_launch.clone())
}

/// Step 3 of the flow: the scope the user inspects and edits before connecting
/// (connections.rs:734-737). A separate command for the same reason it is a
/// separate function — a scope that arrived with the credential would never be
/// looked at.
#[tauri::command]
fn set_connection_scope(
    id: String,
    scope: connections::ConnectionScope,
) -> Result<Vec<connections::Connection>, String> {
    with_connections(|state, _| connections::set_scope(state, &id, scope))
}

/// The explicit Connect. Records an intent and contacts nothing — the honesty
/// of that is connections.rs's, and this wrapper must not add a claim to it.
#[tauri::command]
fn connect_connection(id: String) -> Result<Vec<connections::Connection>, String> {
    with_connections(|state, _| connections::request_connect(state, &id))
}

/// One consumer's check, through that consumer's own adapter. With
/// `installed_adapters` empty in this build every call is refused by name, which
/// is the honest answer rather than a failure.
///
/// The outcome is dropped on purpose: `CheckOutcome` is not a wire type
/// (connections.rs:419-427) and the result of the check is already in the
/// returned matrix as that one consumer's cell.
#[tauri::command]
fn check_connection(
    id: String,
    consumer: connections::Consumer,
) -> Result<Vec<connections::Connection>, String> {
    with_connections(|state, adapters| {
        connections::run_check(state, &id, consumer, adapters).map(|_| ())
    })
}

#[tauri::command]
fn set_connection_binding(
    id: String,
    consumer: connections::Consumer,
    enabled: bool,
) -> Result<Vec<connections::Connection>, String> {
    with_connections(|state, adapters| {
        connections::set_binding(state, &id, consumer, enabled, adapters)
    })
}

/// Drops the bindings and keeps the credential reference — the binding half of
/// the distinction connections.rs:885-891 draws. The global half is
/// `revoke_connection_credential` below, which deletes the keychain item; this
/// one deliberately leaves the secret where it is, so reconnecting does not send
/// the user to find their token again.
#[tauri::command]
fn disconnect_connection(id: String) -> Result<Vec<connections::Connection>, String> {
    with_connections(|state, _| connections::disconnect(state, &id))
}

// ---------------------------------------------------------------------------
// Forgetting a secret — the loose end this task closes
//
// `connections::revoke_credential` and `connections::remove` both hand back a
// `CredentialRef` naming a keychain item that nothing points at any more.
// `revoke_credential` carries `#[must_use]` with the reason written on it, and
// `remove_connection` used to discard the record it returned with a comment
// saying this build had no secret store. It has one now, so neither reference is
// dropped on the floor.
//
// ORDER. Both commands delete the keychain item BEFORE anything is written to
// studio.json, and abort the whole operation if the delete could not be
// confirmed. The two orderings fail differently and only one of them fails
// safely:
//
//   * persist first, delete second — a failed delete leaves a secret in the
//     user's keychain that no connection names and nothing will ever offer to
//     remove. That is the orphan this task exists to prevent, and it is silent;
//   * delete first, persist second — a failed delete changes nothing at all,
//     and the user is told precisely what stopped it. A failed PERSIST (a disk
//     error) leaves a stored reference whose secret is gone, which reads as
//     `configured`, fails a check with a clear authentication error, and is
//     repaired by storing the secret again.
//
// The second is strictly recoverable and the first is not, so the delete goes
// first. Note that `connections::remove` is still what decides whether the
// removal is allowed — its "other projects use this" refusal (DESIGN-SPEC.md:129)
// runs on a local copy of the state before the keychain is touched, so a refused
// removal cannot destroy a secret.
// ---------------------------------------------------------------------------

/// Deletes the keychain item a dropped reference named, or says why it could
/// not.
///
/// `None` is success and not a no-op worth mentioning: a connection may have
/// been configured with coordinates whose secret was never stored, and so may
/// one whose secret was already revoked. `Absent` is success for the same
/// reason — the question is "is a secret left behind", and "there is nothing
/// there" answers it.
///
/// Takes the store as a `&dyn` so the two commands below are tested against an
/// in-memory fake. No test in this crate opens the user's login keychain.
fn forget_credential(
    store: &dyn keychain::SecretStore,
    credential: Option<&connections::CredentialRef>,
) -> Result<(), String> {
    let Some(cred) = credential else {
        return Ok(());
    };
    match store.forget(cred) {
        keychain::Removal::Deleted | keychain::Removal::Absent => Ok(()),
        // Named, not swallowed, and the message carries the coordinates so the
        // user can find the item in Keychain Access themselves. It cannot carry
        // the value — nothing upstream of this holds one.
        keychain::Removal::Failed(why) => Err(format!(
            "{why}. Nothing has been changed: the connection is still configured, so this can be \
             tried again."
        )),
    }
}

/// The global half of "disconnect binding berbeda dengan revoke credential
/// global" (DESIGN-SPEC.md:129): drops the credential reference AND deletes the
/// secret it named.
///
/// The connection stays, with its scope and its label, reporting
/// `notConfigured` — which is what it is. Nothing is written to disk unless the
/// keychain item is confirmed gone.
#[tauri::command]
fn revoke_connection_credential(id: String) -> Result<Vec<connections::Connection>, String> {
    let mut state = connections_persisted_state();
    let orphan = connections::revoke_credential(&mut state, &id)?;
    forget_credential(&keychain::MacKeychain, orphan.as_ref())?;
    let owned = connections::installed_adapters();
    let adapters = adapter_refs(&owned);
    let view = connections::connections(&state, &adapters);
    persist_connections(state)?;
    Ok(view)
}

/// `acknowledged` is the project ids the UI has shown the user, plus
/// `connections::GLOBAL_ACKNOWLEDGEMENT` for a connection available to every
/// project. Anything bound and unacknowledged is refused and named, so the
/// second attempt is an informed one.
///
/// The removed record is no longer discarded. It carries a `CredentialRef`
/// naming a keychain item that nothing points at once the row is gone, and that
/// item is deleted here before the shortened list is written — the ordering, and
/// why it is that way round, is above `forget_credential`.
///
/// Removal is not revocation, which connections.rs says in as many words: the
/// difference is that revoking keeps the connection and removing does not. Both
/// end with the secret gone, because in both cases nothing is left to use it.
#[tauri::command]
fn remove_connection(
    id: String,
    acknowledged: Vec<String>,
) -> Result<Vec<connections::Connection>, String> {
    let mut state = connections_persisted_state();
    // Runs first and on a local copy: a removal refused for being bound to
    // other projects must not have deleted a secret on its way to the refusal.
    let removed = connections::remove(&mut state, &id, &acknowledged)?;
    forget_credential(&keychain::MacKeychain, removed.credential.as_ref())?;
    let owned = connections::installed_adapters();
    let adapters = adapter_refs(&owned);
    let view = connections::connections(&state, &adapters);
    persist_connections(state)?;
    Ok(view)
}

/// A claude left running after the app goes away burns CPU with no UI attached
/// and accumulates one per launch. Both hooks are needed: Cmd+Q never destroys
/// a window, and closing the last window does not by itself emit Exit — wiring
/// only one of them leaks a process on the other path. kill() waits, which is
/// what keeps the killed children from becoming zombies.
fn kill_all_sessions(app: &tauri::AppHandle) {
    if let Some(reg) = app.try_state::<pty::SessionRegistry>() {
        if let Ok(mut map) = reg.0.lock() {
            for session in map.values_mut() {
                session.kill();
            }
            map.clear();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                kill_all_sessions(window.app_handle());
            }
        })
        .setup(|app| {
            app.manage(pty::SessionRegistry::default());
            app.manage(WatcherRegistry::default());
            // Runtime-only, and deliberately not persisted: a Browser pane's
            // address state is session state, and browser.rs:741 records what
            // restoring it from disk would mean — a stored string becoming an
            // argument to the OS url handler. Nothing in StudioConfig for this.
            app.manage(browser::BrowserRegistry::default());
            // Which simulators and emulators THIS app started, and from which
            // tab. Runtime-only and deliberately not persisted: a claim is a
            // statement about a process that is running now, and one read back
            // from disk would offer Stop for a device that died with the last
            // launch. Quitting drops every claim with this map and kills
            // nothing, which is the same thing `release_device_ownership`
            // does on purpose (devices.rs:1424-1430) — a simulator the user
            // wants to keep running must survive quitting Effi, so no exit
            // path here calls `stop_device`.
            app.manage(devices::DeviceOwnership::default());
            let handle = app.handle().clone();
            for p in projects::stored_projects() {
                start_watch(&handle, &p.id, &p.path);
            }
            // Tabs of projects that were removed are already dropped on every
            // read; this is what also takes them off disk, so a stale row
            // cannot survive relaunch after relaunch. A failure here is
            // ignored on purpose: housekeeping must not stop the app starting.
            let _ = tabs::prune_tabs();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            resolve_claude,
            pty_reserve,
            pty_start,
            pty_write,
            pty_resize,
            pty_close,
            add_project,
            remove_project,
            projects::list_projects,
            plan::read_project_state,
            doctor::run_diagnostics,
            install_efficlaude,
            projects::claude_override,
            projects::set_claude_override,
            tree::list_children,
            install_session_id,
            promote_project,
            git::git_info,
            git::git_checkout,
            git::git_create_branch,
            git::git_diff_stat,
            projects::panels,
            projects::set_panels,
            experiences::experiences,
            experiences::set_experiences,
            tabs::tabs,
            tabs::open_tab,
            tabs::close_tab,
            tabs::reorder_tabs,
            agents::agents,
            agents::add_custom_cli,
            agents::remove_custom_cli,
            // Discovery only: platform support, tools, runtime and device are
            // four facts gathered and published separately, and nothing in
            // that module launches, boots or downloads anything.
            devices::discover_devices,
            // Launch, stop, and the ownership record that makes Stop offerable
            // for exactly the devices this app started. `release_device_ownership`
            // gives up a claim WITHOUT stopping anything — it takes no action
            // parameter at all, so there is no path through it that could — and
            // it is what a closing tab and the way out of the app call.
            devices::launch_device,
            devices::stop_device,
            devices::owned_devices,
            devices::release_device_ownership,
            // The selective flow: a pure preview, the run that executes exactly
            // that preview, and the diagnostics that decide readiness after it.
            setup::setup_plan,
            setup::run_setup,
            setup::setup_readiness,
            // The full install, named and scoped. Its scope command writes
            // nothing, so Settings can read the scope out before anything runs.
            setup::install_all_legacy_scope,
            setup::install_all_legacy,
            install_retry_state,
            // The Browser tab. `browser_capability` is read first and answers
            // whether this build can host an embedded surface at all — it
            // cannot (browser.rs:5-54), so the rest of these drive the address
            // state and the open-externally handoff.
            browser::browser_capability,
            browser::browser_open,
            browser::browser_navigate,
            browser::browser_back,
            browser::browser_forward,
            browser::browser_reload,
            browser::browser_set_bounds,
            browser::browser_set_visibility,
            browser::browser_view,
            browser::browser_close,
            browser::browser_open_externally,
            // Connections. Defined above rather than in connections.rs, which
            // holds the rules and no command: the reasoning is at the top of
            // the Connections section.
            list_connections,
            connection_detail,
            connection_preview,
            configure_connection,
            // The only command in this binary that takes a secret. It stores it
            // in the OS keychain and returns nothing, because a stored secret
            // moves no status cell.
            store_connection_secret,
            // The custom MCP form. `mcp_form_fields` is the form-open call and
            // runs nothing; `resolve_mcp_program` looks a program up without
            // starting it. The reasoning is above `mcp_form_fields`.
            mcp_form_fields,
            validate_mcp_launch,
            resolve_mcp_program,
            mcp_launch_detail,
            set_connection_scope,
            connect_connection,
            check_connection,
            set_connection_binding,
            disconnect_connection,
            // Revoke and remove both delete the keychain item the dropped
            // reference named, before anything reaches studio.json.
            revoke_connection_credential,
            remove_connection
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                kill_all_sessions(app);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A session whose process is parked on stdin — what an installer prompting
    /// for an answer looks like from the outside, and the case a retry must not
    /// bulldoze. `cat` is used rather than install.sh because install.sh writes
    /// to ~/.claude and ~/.efficlaude, and no test may touch the user's real
    /// installation to find out what a guard does.
    fn parked_session() -> pty::PtySession {
        pty::spawn("/", "/bin/cat", &[], "/usr/bin:/bin").expect("a pty for the test")
    }

    /// The retry proper: nothing in the slot, so the run goes ahead. This is the
    /// path the old guard could never reach once a key had been inserted.
    #[test]
    fn an_empty_slot_lets_a_run_start() {
        let mut map = HashMap::new();
        assert!(claim_install_session(&mut map).is_ok());
        assert!(retry_state(&mut map).can_retry);
        assert!(retry_state(&mut map).reason.is_none());
    }

    /// A finished run is cleaned up and the slot is handed over — a genuine
    /// retry rather than the silent `Ok(())` that made the button dead.
    #[test]
    fn a_finished_run_is_cleaned_up_and_the_next_one_starts() {
        let mut map = HashMap::new();
        let mut session = parked_session();
        session.kill();
        map.insert(INSTALL_SESSION.to_string(), session);

        assert!(retry_state(&mut map).can_retry, "a dead session blocks nothing");
        assert!(claim_install_session(&mut map).is_ok());
        assert!(
            !map.contains_key(INSTALL_SESSION),
            "the finished session must be out of the map, or the next claim sees it again"
        );
    }

    /// The edge case: still alive, possibly waiting for the user at a prompt.
    /// The attempt is REPORTED, never answered with `Ok(())`, and the live
    /// session is left exactly as it was — killing it from under the user is an
    /// action the user takes (pty_close), not one a retry decides.
    #[test]
    fn a_live_run_is_reported_and_left_alone() {
        let mut map = HashMap::new();
        map.insert(INSTALL_SESSION.to_string(), parked_session());

        let refusal = claim_install_session(&mut map).expect_err("a live run must not report success");
        assert_eq!(refusal, INSTALLER_BUSY);

        let state = retry_state(&mut map);
        assert!(!state.can_retry, "retry must not be offered while a run is live");
        assert_eq!(state.reason.as_deref(), Some(INSTALLER_BUSY));

        assert!(
            map.contains_key(INSTALL_SESSION),
            "the refusal must not have discarded the running session"
        );
        assert!(install_session_alive(&mut map), "nor killed it");

        // The explicit action, as pty_close performs it: the user closes the
        // terminal, and only then does the slot free up.
        map.remove(INSTALL_SESSION).expect("the session").kill();
        assert!(claim_install_session(&mut map).is_ok());
    }

    /// `can_retry` is the one thing the UI reads before offering the button, so
    /// it must never disagree with what a claim would actually do.
    #[test]
    fn the_offered_retry_and_the_performed_retry_agree() {
        for mut map in [HashMap::new(), {
            let mut m = HashMap::new();
            m.insert(INSTALL_SESSION.to_string(), parked_session());
            m
        }] {
            let offered = retry_state(&mut map).can_retry;
            assert_eq!(offered, claim_install_session(&mut map).is_ok());
            if let Some(mut session) = map.remove(INSTALL_SESSION) {
                session.kill();
            }
        }
    }

    /// The quoting that only ever failed in the shipped .app, kept in one place
    /// now that two call sites write an install command line.
    #[test]
    fn a_bundled_path_with_a_space_survives_being_written_to_a_shell() {
        let quoted = shell_quoted(Path::new(
            "/Applications/EffiClaude Studio.app/Contents/Resources/install.sh",
        ));
        assert_eq!(
            quoted,
            "'/Applications/EffiClaude Studio.app/Contents/Resources/install.sh'"
        );
        // Every space in the path sits inside the quotes, which is what makes
        // the written line one word to bash instead of two.
        assert!(quoted.starts_with('\'') && quoted.ends_with('\''));
        assert!(!quoted[1..quoted.len() - 1].contains('\''));
        // And a quote in the path is escaped rather than ending the quoting.
        assert_eq!(shell_quoted(Path::new("/tmp/it's here")), r"'/tmp/it'\''s here'");
    }

    // -----------------------------------------------------------------------
    // Forgetting a secret
    //
    // Against the in-memory fake, never the user's login keychain and never
    // /usr/bin/security. The commands themselves cannot be tested end to end
    // because they read and write ~/.efficlaude/studio.json through
    // projects::load()/save(), and no test may touch a user's real config — so
    // the part that decides whether a secret is left behind is the part that is
    // factored out and tested here, and the commands are four lines of wiring
    // around it.
    // -----------------------------------------------------------------------

    use crate::connections::{CredentialKind, CredentialRef};
    use crate::keychain::fake::MemoryStore;

    /// Not a credential to anything.
    const PLACEHOLDER: &str = "placeholder-not-a-real-token";

    fn reference() -> CredentialRef {
        CredentialRef::new("efficlaude.jira", "me@acme.test", CredentialKind::ApiToken)
    }

    /// The loose end, closed: a reference handed over by `remove` or
    /// `revoke_credential` names an item that is actually deleted.
    #[test]
    fn a_dropped_reference_takes_its_keychain_item_with_it() {
        let store = MemoryStore::new();
        let cred = reference();
        store.put(&cred, PLACEHOLDER).unwrap();

        forget_credential(&store, Some(&cred)).unwrap();
        assert!(
            !store.contains(&cred).unwrap(),
            "the orphaned item must be gone, not merely unreferenced"
        );
        assert_eq!(store.len(), 0);
    }

    /// A connection configured with coordinates whose secret was never stored,
    /// and one with no coordinates at all. Neither is an error: the question
    /// `forget_credential` answers is whether a secret is left behind, and in
    /// both cases none is.
    #[test]
    fn forgetting_something_that_was_never_stored_is_not_a_failure() {
        let store = MemoryStore::new();
        assert!(forget_credential(&store, None).is_ok());
        assert!(forget_credential(&store, Some(&reference())).is_ok());
    }

    /// The branch that matters most. If the keychain will not give the item up,
    /// the operation is REPORTED rather than completed: completing it would
    /// write a studio.json with no reference to a secret that is still sitting
    /// in the user's keychain, which is precisely the orphan this task exists
    /// to prevent, and it would be silent.
    #[test]
    fn a_refused_delete_stops_the_operation_and_says_why() {
        let store = MemoryStore::refusing();
        let cred = reference();
        let err = forget_credential(&store, Some(&cred)).expect_err("a refusal must not pass");

        assert!(err.contains("me@acme.test"), "the account is named: {err}");
        assert!(err.contains("efficlaude.jira"), "the service is named: {err}");
        assert!(
            err.contains("Nothing has been changed"),
            "the user is told the state is unchanged: {err}"
        );
        assert!(
            !err.contains(PLACEHOLDER),
            "an error may not carry a credential: {err}"
        );
    }

    /// Removal is refused before the keychain is touched, so the "other
    /// projects use this" guard (DESIGN-SPEC.md:129) can never cost a user
    /// their token. This is the ordering inside `remove_connection`, exercised
    /// on a local state so no config file is involved.
    #[test]
    fn a_removal_refused_for_other_projects_destroys_no_secret() {
        let store = MemoryStore::new();
        let cred = reference();
        store.put(&cred, PLACEHOLDER).unwrap();

        let mut state = connections::ConnectionState::default();
        let id = connections::configure(
            &mut state,
            connections::ConfigureRequest {
                connector: connections::Connector::Jira,
                label: "Acme Jira".into(),
                endpoint: None,
                transport: None,
                mcp_launch: None,
                credential: Some(cred.clone()),
                scope: connections::ConnectionScope {
                    global: false,
                    project_ids: vec!["p1".into(), "p2".into()],
                },
            },
        )
        .unwrap();

        // The same order the command uses: refuse first, forget second.
        let refused = connections::remove(&mut state, &id, &["p1".to_string()]);
        assert!(refused.is_err(), "p2 was not acknowledged");
        assert_eq!(state.items.len(), 1, "nothing was removed");
        assert!(
            store.contains(&cred).unwrap(),
            "a refused removal must leave the secret alone"
        );

        // Acknowledged, and now the item goes with the row.
        let removed = connections::remove(&mut state, &id, &["p1".to_string(), "p2".to_string()])
            .expect("acknowledged");
        forget_credential(&store, removed.credential.as_ref()).unwrap();
        assert!(state.items.is_empty());
        assert!(!store.contains(&cred).unwrap());
    }

    /// Revoke is the other caller, and the reference it hands over is the one
    /// the record held. Disconnect is NOT a caller — it keeps the credential,
    /// which is the distinction DESIGN-SPEC.md:129 draws — so the secret
    /// survives a disconnect and only a revoke takes it.
    #[test]
    fn disconnecting_keeps_the_secret_and_revoking_takes_it() {
        let store = MemoryStore::new();
        let cred = reference();
        store.put(&cred, PLACEHOLDER).unwrap();

        let mut state = connections::ConnectionState::default();
        let id = connections::configure(
            &mut state,
            connections::ConfigureRequest {
                connector: connections::Connector::Jira,
                label: "Acme Jira".into(),
                endpoint: None,
                transport: None,
                mcp_launch: None,
                credential: Some(cred.clone()),
                scope: connections::ConnectionScope::default(),
            },
        )
        .unwrap();

        connections::disconnect(&mut state, &id).unwrap();
        assert!(
            store.contains(&cred).unwrap(),
            "a disconnect must not send the user looking for their token again"
        );

        let orphan = connections::revoke_credential(&mut state, &id).unwrap();
        forget_credential(&store, orphan.as_ref()).unwrap();
        assert!(!store.contains(&cred).unwrap());
        assert!(
            state.find(&id).is_some(),
            "revoking keeps the connection; removing is the other act"
        );
    }

    /// The detail command's shape, through the same function the command calls.
    /// Coordinates and nothing else: no value field exists to leak, which is
    /// `CredentialRef`'s doing and is asserted here at the boundary the
    /// frontend actually reads.
    #[test]
    fn the_detail_the_ui_reads_carries_coordinates_and_no_value() {
        let mut state = connections::ConnectionState::default();
        let id = connections::configure(
            &mut state,
            connections::ConfigureRequest {
                connector: connections::Connector::Jira,
                label: "Acme Jira".into(),
                endpoint: Some("https://acme.atlassian.net".into()),
                transport: Some("as the user typed it".into()),
                mcp_launch: None,
                credential: Some(reference()),
                scope: connections::ConnectionScope::default(),
            },
        )
        .unwrap();

        let detail = connections::detail(state.find(&id).unwrap());
        let json = serde_json::to_string(&detail).unwrap();
        assert!(json.contains("\"connectRequested\":false"));
        assert!(json.contains("\"account\":\"me@acme.test\""));
        assert!(!json.contains(PLACEHOLDER));
        // And a preview of the same record prints no value either.
        let printed = connections::safe_summary(state.find(&id).unwrap());
        assert!(printed.iter().all(|(_, v)| !v.contains(PLACEHOLDER)));
        assert!(printed.iter().any(|(k, _)| *k == "Credential"));
    }
}
