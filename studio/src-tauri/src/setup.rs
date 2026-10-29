use crate::doctor::{self, ComponentId, ComponentReport, ComponentStatus};
use crate::projects;
use crate::pty;
use crate::shell_env;
use serde::{Deserialize, Serialize};
use std::thread;

// ---------------------------------------------------------------------------
// What is being decided here
//
// install.sh was one run that installed the /ec-* commands, 32 agents, the
// Python worker, the hooks, a ~/.claude/settings.json registration, pip
// dependencies, the token optimizer and a launchd daemon. A screen of optional
// checkboxes in front of that script would be a lie, so the script now takes
// --only= and guards every step with want_component (install.sh:80-88).
//
// This module decides what to ask for. Its one invariant is that an unselected
// component cannot appear in a plan, and the shape of `Selection` is what
// enforces it: one bool per ComponentId and nothing else. An id that is not an
// installable component — an experience this release has not shipped, say — has
// no field here, so there is no value a caller could send that would put it in a
// plan. That is the same enforcement-by-signature `set_experiences` relies on
// (experiences.rs:71-73).
// ---------------------------------------------------------------------------

/// What the user ticked. One field per `ComponentId` (types.ts:103), named so
/// the wire form is the id itself.
///
/// `default` on every field makes an omitted field false, so a caller that sends
/// a partial object selects LESS rather than more — the only safe direction for
/// a type whose whole job is to keep work from happening unasked. All-false is a
/// legitimate answer and produces an empty plan.
#[derive(Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Selection {
    pub claude: bool,
    pub codex: bool,
    pub commands: bool,
    pub agents: bool,
    pub worker: bool,
    pub browser: bool,
    pub ios: bool,
    pub android: bool,
    pub memory: bool,
}

/// Mirrors `SetupOp` at studio/src/lib/types.ts:139, camelCase because this
/// crosses to the frontend (the reason is recorded at projects.rs:54-58).
///
/// Four acts that are genuinely different: pointing at an executable the user
/// already has, switching on something this app already ships, guiding setup of
/// a dependency this app does not own, and installing a component. Conflating
/// any two of them is how install-all comes back — an `enableBundled` that
/// quietly ran the installer, or an `installSelected` for a CLI nothing here
/// installs, would both be the old behaviour under a new label.
#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SetupOp {
    LinkExisting,
    EnableBundled,
    SetupExternal,
    InstallSelected,
}

/// Mirrors `SetupItem` at types.ts:141.
///
/// Serialize and deliberately not Deserialize. In TypeScript `effects` is just
/// `string[]`, so that contract would happily accept an array composed in the
/// UI; with no Deserialize there is no inbound SetupItem at all, and the only
/// `effects` that exists is the one produced beside the code that acts.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SetupItem {
    pub id: ComponentId,
    /// Redundant by construction, and kept because the wire contract has it
    /// (types.ts:143): it is set from the same bool that admitted the item, so
    /// no item can reach the UI claiming not to be selected.
    pub selected: bool,
    pub op: SetupOp,
    /// What this item will touch, in the words of the module that will touch it.
    pub effects: Vec<String>,
}

/// Mirrors `SetupPlan` at types.ts:154: per-item decisions with no aggregate
/// verdict, because each op is dispatched on its own and there is nothing here
/// to total into one install.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SetupPlan {
    pub items: Vec<SetupItem>,
}

/// The order rows appear in, fixed rather than taken from the order a caller
/// filled the selection in, so the Review screen draws the same components in
/// the same places every time — the reason run_diagnostics fixes its order too
/// (doctor.rs:673-674).
const PLAN_ORDER: [ComponentId; 9] = [
    ComponentId::Claude,
    ComponentId::Codex,
    ComponentId::Commands,
    ComponentId::Agents,
    ComponentId::Worker,
    ComponentId::Memory,
    ComponentId::Browser,
    ComponentId::Ios,
    ComponentId::Android,
];

/// Every name this module can pass to --only, in the order install.sh runs them
/// (install.sh:69). Ordering and deduplicating through this list is what makes
/// two items that need the same section produce one name, and makes the flag
/// list read the same way whatever order the user ticked boxes in.
const EMITTED_COMPONENTS: [&str; 4] = ["commands", "agents", "worker", "pydeps"];

/// Installer sections this module never asks for, named here so their absence is
/// on the record rather than an oversight: `hooks` rewrites
/// ~/.claude/settings.json, `optimizer` appends a source line to ~/.zshrc and
/// ~/.bashrc, and `daemon` registers a launchd agent or systemd unit. No
/// ComponentId names any of them, so no checkbox can ask for them — and those
/// three are most of what made the old run feel like it took the machine over.
const NEVER_SELECTED: [&str; 3] = ["hooks", "optimizer", "daemon"];

/// install.sh steps that sit OUTSIDE every want_component guard, so any
/// invocation performs them. Appended to each `InstallSelected` item because an
/// item of that op is what causes an invocation: run on its own it really does
/// cause these writes, and a Review screen that left them out would be
/// describing a different script than the one that runs.
const INVOCATION_EFFECTS: [&str; 2] = [
    "creates ~/.claude/commands, ~/.claude/agents and ~/.efficlaude/{hooks,server,bin,shell,chroma} if they are missing (install.sh:176)",
    "deletes the retired command files listed at install.sh:192-193 from ~/.claude/commands — that step is outside every --only guard",
];

/// One item per SELECTED component, each carrying the op that will run and the
/// effects that op will have. Never a default-everything plan: an all-false
/// selection returns an empty `items`, which is a complete answer.
pub fn build_plan(selection: Selection) -> SetupPlan {
    SetupPlan {
        items: PLAN_ORDER
            .iter()
            .copied()
            .filter(|id| is_selected(selection, *id))
            .map(item)
            .collect(),
    }
}

/// An exhaustive match rather than a lookup, so adding a `ComponentId` upstream
/// fails to compile here instead of silently never being selectable.
fn is_selected(selection: Selection, id: ComponentId) -> bool {
    match id {
        ComponentId::Claude => selection.claude,
        ComponentId::Codex => selection.codex,
        ComponentId::Commands => selection.commands,
        ComponentId::Agents => selection.agents,
        ComponentId::Worker => selection.worker,
        ComponentId::Browser => selection.browser,
        ComponentId::Ios => selection.ios,
        ComponentId::Android => selection.android,
        ComponentId::Memory => selection.memory,
    }
}

fn item(id: ComponentId) -> SetupItem {
    // One probe per item, feeding both the op and the effects. Probing twice
    // could pick an op for a state the effects then describe differently, which
    // is the review-screen-disagrees-with-reality failure in miniature.
    let probe = probe_for(id);
    let op = op_for(id, probe.as_ref());
    SetupItem {
        id,
        selected: true,
        op,
        effects: effects_for(id, op, probe.as_ref()),
    }
}

/// Probed here: claude and codex, whose op turns on whether the executable is
/// already present, and browser, whose check is a `cfg!` read and costs nothing.
///
/// Not probed here: ios and android. Their checks shell out to xcode-select,
/// xcrun and the emulator, each under its own one-second budget (doctor.rs:72),
/// and a plan preview is not worth seconds of waiting for a detail the
/// diagnostics rows already show. commands, agents, worker and memory are not
/// probed either, because a probe could not change their plan: a copy already on
/// disk is still installed by re-running its section — that is how an upgrade
/// reaches a machine — so the op is `InstallSelected` either way.
fn probe_for(id: ComponentId) -> Option<ComponentReport> {
    match id {
        // Through the stored override, so a hand-entered path is the one that
        // gets linked rather than whatever PATH happens to resolve to.
        ComponentId::Claude => Some(doctor::check_claude(
            projects::load().claude_override.as_deref(),
        )),
        ComponentId::Codex => Some(doctor::check_codex()),
        ComponentId::Browser => Some(doctor::check_browser()),
        _ => None,
    }
}

/// `Detected` or `Ready`, and nothing weaker. `Detected` is as strong as a
/// provider check ever gets — no check in this app can observe a login
/// (doctor.rs:282-284) — so demanding `Ready` here would classify every
/// installed CLI as absent and send the user off to reinstall it.
fn found(report: &ComponentReport) -> bool {
    matches!(
        report.status,
        ComponentStatus::Detected | ComponentStatus::Ready
    )
}

fn op_for(id: ComponentId, probe: Option<&ComponentReport>) -> SetupOp {
    match id {
        // install.sh installs neither CLI: `claude` is not a component name at
        // all and would be rejected at install.sh:116, and `codex` is listed as
        // external with nothing to install (install.sh:74). So "install it" is
        // not an op this module can honestly offer for them. Present means there
        // is something to point at; absent means the user installs it outside
        // Studio, which is exactly what setupExternal says.
        ComponentId::Claude | ComponentId::Codex => {
            if probe.is_some_and(found) {
                SetupOp::LinkExisting
            } else {
                SetupOp::SetupExternal
            }
        }
        ComponentId::Commands | ComponentId::Agents | ComponentId::Worker | ComponentId::Memory => {
            SetupOp::InstallSelected
        }
        // The browsing surface renders in the webview already drawing this
        // window, so there is nothing to fetch and nothing for the user to go
        // and do — the one case where enableBundled is the true description.
        ComponentId::Browser => SetupOp::EnableBundled,
        // Xcode and the Android SDK are Apple's and Google's to install. Nothing
        // in this repo ships them and nothing in install.sh touches them.
        ComponentId::Ios | ComponentId::Android => SetupOp::SetupExternal,
    }
}

/// The install.sh component names a selected component needs, from the list at
/// install.sh:69. Empty means nothing in that script installs this component,
/// which is why linking, enabling and external setup reach it as an empty slice
/// rather than as a name the script accepts and does no work for.
///
/// `worker` and `pydeps` are one pair here, never one without the other.
/// --only has no dependency resolution — it is a literal filter — so
/// `--only=pydeps` alone runs `pip3 install -r "$SERVER_DIR/requirements.txt"`
/// (install.sh:242) against a requirements.txt only the worker section fetches
/// (install.sh:214-217), and fails on a clean machine. The pairing lives in this
/// table rather than in a fix-up pass because there is no `pydeps` ComponentId
/// to select on its own: the two names describe one component, and `effects`
/// below is where the user is told that pip will run.
///
/// `Memory` resolves to the same pair, because the memory engine has no
/// installer section of its own: memory.py, embedder.py and graph.py are part of
/// the worker's file set (install.sh:16), so installing the engine means
/// installing those files. Its item says so rather than hiding it.
fn installer_flags(id: ComponentId) -> &'static [&'static str] {
    match id {
        ComponentId::Commands => &["commands"],
        ComponentId::Agents => &["agents"],
        ComponentId::Worker | ComponentId::Memory => &["worker", "pydeps"],
        ComponentId::Claude
        | ComponentId::Codex
        | ComponentId::Browser
        | ComponentId::Ios
        | ComponentId::Android => &[],
    }
}

/// The --only list for a whole plan: ordered and deduplicated through
/// EMITTED_COMPONENTS, and empty when no item needs the installer at all.
fn only_flags(plan: &SetupPlan) -> Vec<&'static str> {
    let flags: Vec<&'static str> = EMITTED_COMPONENTS
        .iter()
        .copied()
        .filter(|name| {
            plan.items
                .iter()
                .any(|item| installer_flags(item.id).contains(name))
        })
        .collect();
    // The invariant as an executable statement: no plan may reach the installer
    // asking for a section no checkbox can select.
    debug_assert!(
        flags.iter().all(|flag| !NEVER_SELECTED.contains(flag)),
        "a plan asked for an installer section no component can select"
    );
    flags
}

// ---------------------------------------------------------------------------
// Effects
//
// Produced here, in the module that will run the operation, and never accepted
// from the frontend. The Review screen reads these lines out before anything
// runs, so a line that describes something other than what executes is worse
// than no Review screen at all. The last line of every InstallSelected item is
// derived from the same `installer_flags` table `only_flags` dispatches on,
// which is what keeps the description and the invocation from drifting.
// ---------------------------------------------------------------------------

fn effects_for(id: ComponentId, op: SetupOp, probe: Option<&ComponentReport>) -> Vec<String> {
    let mut lines = match id {
        ComponentId::Claude => claude_effects(op, probe),
        ComponentId::Codex => codex_effects(op, probe),
        ComponentId::Commands => owned([
            "writes the 8 /ec-* command files into ~/.claude/commands (install.sh:179-187)",
            "writes the release number to ~/.efficlaude/VERSION",
        ]),
        ComponentId::Agents => owned([
            "writes the 32 ec-* agent files into ~/.claude/agents (install.sh:203-209)",
        ]),
        ComponentId::Worker => owned([
            "writes the 12 Python service files into ~/.efficlaude/server and makes start.sh, stop.sh and watchdog.sh executable (install.sh:212-219)",
            "runs pip3 install -r ~/.efficlaude/server/requirements.txt (install.sh:242) — paired with the file install because --only is a literal filter and requirements.txt arrives with those files",
            "stops and restarts the worker through ~/.efficlaude/server/stop.sh and start.sh (install.sh:385-390)",
        ]),
        ComponentId::Memory => owned([
            "installs the engine as part of the worker's file set — memory.py, embedder.py and graph.py (install.sh:16) — because install.sh has no section of its own for it",
            "runs pip3 install -r ~/.efficlaude/server/requirements.txt for the embedder and the vector store (install.sh:242)",
            "creates the ~/.efficlaude/chroma directory; efficlaude.db is written by the Python side on first index, never from here",
            "restarts the worker, since the running process is what holds the engine (install.sh:385-390)",
        ]),
        ComponentId::Browser => vec![
            format!(
                "writes nothing: the browsing surface is the webview already running this window — {}",
                found_or_reason(probe)
            ),
            "runs no installer step: install.sh:74 lists browser as external and installs nothing for it".to_string(),
        ],
        ComponentId::Ios => owned([
            "writes nothing: Xcode, its iOS runtimes and its simulator devices are Apple's to install, and install.sh has no section for any of them",
            "install Xcode, download a runtime in Xcode > Settings > Components, then create a device in Window > Devices and Simulators",
        ]),
        ComponentId::Android => owned([
            "writes nothing: the Android SDK, its emulator package and its AVDs are installed through Android Studio, and install.sh has no section for any of them",
            "install Android Studio, add the emulator package in SDK Manager, create an AVD in Device Manager, then export ANDROID_HOME",
        ]),
    };

    if op == SetupOp::InstallSelected {
        lines.push(format!(
            "passes {} to install.sh --only, and nothing else",
            installer_flags(id).join(" and ")
        ));
        lines.extend(INVOCATION_EFFECTS.iter().map(|e| e.to_string()));
    }
    lines
}

fn claude_effects(op: SetupOp, probe: Option<&ComponentReport>) -> Vec<String> {
    const NO_SECTION: &str = "runs no installer step: install.sh has no claude component, and naming one is rejected at install.sh:116";

    match op {
        SetupOp::LinkExisting => vec![
            format!(
                "records {} as claudeOverride in ~/.efficlaude/studio.json, re-resolved at the moment it runs",
                found_detail(probe)
            ),
            NO_SECTION.to_string(),
        ],
        // Any other op for claude would be a claim this module cannot honour, so
        // the absent case is the only other branch there is.
        _ => vec![
            format!("writes nothing: {}", failure_reason(probe)),
            "install Claude Code yourself, then select this again so Studio can record its path"
                .to_string(),
            NO_SECTION.to_string(),
        ],
    }
}

fn codex_effects(op: SetupOp, probe: Option<&ComponentReport>) -> Vec<String> {
    const NO_SECTION: &str =
        "runs no installer step: install.sh:74 lists codex as external and installs nothing for it";

    match op {
        SetupOp::LinkExisting => vec![
            format!(
                "writes nothing: codex is already on PATH ({}) and Studio keeps no stored path for it yet — agents.rs:146 is where one will live",
                found_detail(probe)
            ),
            NO_SECTION.to_string(),
        ],
        _ => vec![
            format!("writes nothing: {}", failure_reason(probe)),
            "install codex yourself — it ships through npm and Homebrew, which both put it on PATH (agents.rs:16-19)".to_string(),
            NO_SECTION.to_string(),
        ],
    }
}

/// The probe's own detail, so the Review screen names the path that was actually
/// resolved instead of a sentence about paths in general.
fn found_detail(probe: Option<&ComponentReport>) -> String {
    probe
        .and_then(|r| r.detail.clone())
        .unwrap_or_else(|| "the resolved executable".to_string())
}

/// The probe's own failure text, for the reason doctor keeps it verbatim
/// (doctor.rs:154-156): "not found" cannot be acted on, while the path that was
/// tried can.
fn failure_reason(probe: Option<&ComponentReport>) -> String {
    probe
        .and_then(|r| r.error.clone())
        .unwrap_or_else(|| "nothing was found to point at".to_string())
}

/// Detail when the check found something, its error when it did not — the
/// browser check reports one or the other and never both.
fn found_or_reason(probe: Option<&ComponentReport>) -> String {
    match probe {
        Some(r) if found(r) => found_detail(probe),
        _ => failure_reason(probe),
    }
}

fn owned<const N: usize>(lines: [&str; N]) -> Vec<String> {
    lines.iter().map(|l| l.to_string()).collect()
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/// Runs exactly the items in `plan` and nothing else.
///
/// The plan arrives by reference from Rust and is never deserialised from the
/// frontend — `SetupPlan` and `SetupItem` derive Serialize only — so there is no
/// path by which a UI-composed effects list could be handed to this function to
/// act on.
///
/// `Ok(true)` means an installer session was STARTED, the same contract
/// start_installer has: its output and its prompts belong in the terminal the
/// user is already looking at, so the script runs in the PTY rather than being
/// captured here. Started is not finished and is certainly not ready — a bool
/// about a spawn, which is why readiness is asked of the diagnostics instead
/// (`readiness` below). `Ok(false)` means no installer was needed at all.
pub fn run_plan(
    app: &tauri::AppHandle,
    reg: &pty::SessionRegistry,
    plan: &SetupPlan,
) -> Result<bool, String> {
    // Linking first, because it is the only step that can fail synchronously and
    // failing it after the installer has started would leave the user watching a
    // run whose plan no longer holds.
    for item in &plan.items {
        if item.op == SetupOp::LinkExisting && item.id == ComponentId::Claude {
            link_claude()?;
        }
    }

    let flags = only_flags(plan);
    // An empty flag list is a complete answer, not a fallback. A bare invocation
    // selects EVERY component (install.sh:63-65), so running the script "anyway"
    // here is precisely the install-all this module exists to prevent — and an
    // empty plan must reach the installer not at all.
    if flags.is_empty() {
        return Ok(false);
    }

    // Started through the one shared entry point (lib.rs start_installer), which
    // owns the resource resolution, the single-quoting of a bundled path that
    // contains a space, and the session guard. A second copy of any of those
    // here is a defect that only shows up in a shipped .app.
    //
    // `Some` always, and the list is never empty by the check above: `None`
    // there would be the bare invocation that installs every component.
    crate::start_installer(app, reg, Some(&flags.join(",")))?;
    Ok(true)
}

// ---------------------------------------------------------------------------
// The full install, as one named operation
//
// A bare `install.sh` with no --only installs EVERYTHING (install.sh:63-65),
// including the three sections no checkbox can select. That behaviour is kept —
// an existing user's one-click full install must not break — but it is reachable
// only through `install_all_legacy`, which names itself and states its scope
// before it runs. It is not a fallback, not a default and not what any
// selection can turn into: `build_plan` cannot produce it (every plan either
// names its sections or reaches the installer not at all, enforced by the empty
// flag list returning above) and `start_installer` receives `None` from here
// and from nowhere else.
// ---------------------------------------------------------------------------

/// Every section a bare invocation runs, in install.sh's own order
/// (install.sh:69). Four of them — commands, agents, worker and pydeps — are the
/// EMITTED_COMPONENTS a selection can also ask for; hooks, optimizer and daemon
/// are the NEVER_SELECTED three, and they are the whole difference between this
/// operation and the widest plan the checkboxes can produce.
const LEGACY_SCOPE: [&str; 7] = [
    "commands",
    "agents",
    "worker",
    "hooks",
    "pydeps",
    "optimizer",
    "daemon",
];

/// What the bare run covers, stated for the user who is choosing it.
///
/// Serialize only, like everything else here: there is no inbound form of this,
/// so the scope a screen reads out is always the scope this module will pass to
/// the installer.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyInstall {
    /// The install.sh section names a bare invocation runs.
    pub components: Vec<String>,
    /// What those sections touch, including the three a selection cannot ask
    /// for — the reason this operation needs spelling out at all.
    pub effects: Vec<String>,
    /// True only once an installer session has been started for it. Started,
    /// not finished and not ready: readiness is `setup_readiness`'s answer.
    pub started: bool,
}

/// Written out here rather than assembled from `effects_for`, which would be the
/// tempting reuse and would also be wrong: every `InstallSelected` item ends
/// with the line "passes … to install.sh --only, and nothing else", and this
/// operation passes no --only at all. A description that names a flag the run
/// does not use is the review-screen-disagrees-with-reality failure, so these
/// lines are the bare run's own.
fn legacy_scope() -> LegacyInstall {
    let mut effects = vec![format!(
        "runs install.sh with NO --only flag, which install.sh:63-65 reads as every section it has: {}",
        LEGACY_SCOPE.join(", ")
    )];
    effects.extend(owned([
        // The four a selection can also ask for.
        "writes the 8 /ec-* command files into ~/.claude/commands and the release number to ~/.efficlaude/VERSION (install.sh:179-187)",
        "writes the 32 ec-* agent files into ~/.claude/agents (install.sh:203-209)",
        "writes the 12 Python service files into ~/.efficlaude/server, makes start.sh, stop.sh and watchdog.sh executable (install.sh:212-219), and stops and restarts the worker (install.sh:385-390)",
        "runs pip3 install -r ~/.efficlaude/server/requirements.txt (install.sh:240-245)",
        // The three no component names, which is the whole difference between
        // this operation and the widest plan the checkboxes can produce.
        "writes the 4 hook files into ~/.efficlaude/hooks and copies commit-msg into the current repository's .git/hooks (install.sh:221-237) — no component selects this",
        "rewrites the hooks block of ~/.claude/settings.json (install.sh:247-291) — no component selects this",
        "installs the token optimizer and appends a source line to ~/.zshrc and ~/.bashrc (install.sh:293-347) — no component selects this",
        "registers a background daemon: a launchd agent on macOS, a systemd --user unit on Linux (install.sh:349-382) — no component selects this",
    ]));
    // True of any invocation, bare or narrowed.
    effects.extend(INVOCATION_EFFECTS.iter().map(|e| e.to_string()));
    LegacyInstall {
        components: LEGACY_SCOPE.iter().map(|c| c.to_string()).collect(),
        effects,
        started: false,
    }
}

/// The scope with nothing executed, for the Settings row to read out first.
/// Pure, for the same reason `setup_plan` is: a preview with side effects would
/// make opening the screen the install.
#[tauri::command]
pub fn install_all_legacy_scope() -> LegacyInstall {
    legacy_scope()
}

/// The ONE operation that performs a bare invocation, and the only caller that
/// passes `None` to `start_installer`. Returns the scope it started, so the
/// caller is told what it set running rather than just that something ran.
pub fn run_install_all_legacy(
    app: &tauri::AppHandle,
    reg: &pty::SessionRegistry,
) -> Result<LegacyInstall, String> {
    crate::start_installer(app, reg, None)?;
    Ok(LegacyInstall {
        started: true,
        ..legacy_scope()
    })
}

#[tauri::command]
pub fn install_all_legacy(
    app: tauri::AppHandle,
    reg: tauri::State<pty::SessionRegistry>,
) -> Result<LegacyInstall, String> {
    run_install_all_legacy(&app, &reg)
}

// ---------------------------------------------------------------------------
// Readiness
//
// One rule: a component's status is whatever its own diagnostic says, re-run
// after the operation. Nothing here is derived from the fact that an operation
// was dispatched. A resolved `invoke` means a message was delivered and
// answered; a spawned session means a process started; EOF on the master means
// the slave side has no writer left. A legacy shell script's children can
// outlive the script, so even the last of those cannot say the files are on
// disk — while `check_commands` counting 8 of 8 files can.
// ---------------------------------------------------------------------------

/// This component's own diagnostic, re-run now. An exhaustive match rather than
/// a lookup, so a new `ComponentId` upstream fails to compile here instead of
/// silently having no way to be reported ready.
fn recheck(id: ComponentId) -> ComponentReport {
    match id {
        // Through the stored override, so the path that was just linked is the
        // one that gets checked.
        ComponentId::Claude => doctor::check_claude(projects::load().claude_override.as_deref()),
        ComponentId::Codex => doctor::check_codex(),
        ComponentId::Commands => doctor::check_commands(),
        ComponentId::Agents => doctor::check_agents(),
        ComponentId::Worker => doctor::check_worker(),
        ComponentId::Browser => doctor::check_browser(),
        ComponentId::Ios => doctor::check_ios(),
        ComponentId::Android => doctor::check_android(),
        ComponentId::Memory => doctor::check_memory(),
    }
}

/// The one status this module writes itself, and the only honest answer for a
/// component whose installer has been started and not yet finished. No check in
/// doctor.rs returns it (doctor.rs:129-134) because no probe can observe it; the
/// setup flow can, because the setup flow is what started the script.
///
/// Built as a literal rather than through doctor's constructors, which are
/// private to that module on purpose: nothing outside it may mint a `Ready`.
fn installing(id: ComponentId) -> ComponentReport {
    ComponentReport {
        id,
        status: ComponentStatus::Installing,
        detail: Some(
            "install.sh has been started for this component — ask setup_readiness once that terminal is finished, and this component's own check will answer".to_string(),
        ),
        error: None,
        // Nothing here is required, for the reason recorded at doctor.rs:169-174.
        required: false,
    }
}

fn panicked(id: ComponentId) -> ComponentReport {
    ComponentReport {
        id,
        status: ComponentStatus::NeedsAttention,
        detail: None,
        error: Some("the check for this component panicked".to_string()),
        required: false,
    }
}

/// One report per plan item, in plan order.
///
/// `installer_started` is the one thing that changes the shape of the answer,
/// and it withholds a verdict rather than supplying one: an item whose installer
/// is still running is reported `Installing`, never `Ready`. Probing mid-run
/// would read a half-written tree and call a partial install a result, which is
/// the same mistake as trusting the spawn — just with a filesystem read dressed
/// up as evidence.
///
/// Every other item's operation finished before `run_plan` returned, so its
/// check runs now and its status is that check's result. One thread per check,
/// for the reason run_diagnostics gives (doctor.rs:669-674): the probes share
/// nothing, and in sequence the caller would wait for the sum of their timeouts
/// instead of the longest.
fn readiness(plan: &SetupPlan, installer_started: bool) -> Vec<ComponentReport> {
    let jobs: Vec<(ComponentId, Option<thread::JoinHandle<ComponentReport>>)> = plan
        .items
        .iter()
        .map(|item| {
            let id = item.id;
            if installer_started && item.op == SetupOp::InstallSelected {
                (id, None)
            } else {
                (id, Some(thread::spawn(move || recheck(id))))
            }
        })
        .collect();

    jobs.into_iter()
        .map(|(id, handle)| match handle {
            None => installing(id),
            // A panicking probe is still only one component's bad news
            // (doctor.rs:698-700).
            Some(handle) => handle.join().unwrap_or_else(|_| panicked(id)),
        })
        .collect()
}

/// Readiness on demand, which is how a component installed by a script gets its
/// real status: the caller asks again once the install terminal is done. The PTY
/// exit event is a cue to ask this, never an answer in itself.
///
/// The registry is read, not to learn anything about success, but to find out
/// whether the installer is STILL RUNNING — in which case the install items are
/// reported `installing` and nothing is probed. Probing during a re-install can
/// read state the run has not replaced yet (a complete old command set, a worker
/// still answering on the old code) and that would be a `Ready` about the
/// previous install wearing this one's badge.
///
/// Takes a `Selection` rather than an id because `Selection` is the only
/// deserialisable shape in this module, so a caller cannot ask about anything
/// that is not an installable component — the same enforcement-by-signature the
/// plan builder relies on.
#[tauri::command]
pub fn setup_readiness(
    reg: tauri::State<pty::SessionRegistry>,
    selection: Selection,
) -> Result<Vec<ComponentReport>, String> {
    let installing = {
        let mut map = reg.0.lock().map_err(|e| e.to_string())?;
        crate::install_session_alive(&mut map)
    };
    Ok(readiness(&build_plan(selection), installing))
}

/// Re-resolves rather than trusting the path the plan was built with: a plan sat
/// on a Review screen can be minutes old, and the one thing worse than failing
/// to link is pinning claudeOverride to an executable that has since moved.
/// Persisted through projects.rs so there is one claudeOverride and one writer
/// of it (projects.rs:195-199).
fn link_claude() -> Result<(), String> {
    let mut cfg = projects::load();
    let path = shell_env::resolve_claude(cfg.claude_override.as_deref())?;
    cfg.claude_override = Some(path.to_string_lossy().into_owned());
    projects::save(&cfg)
}

/// The plan the Review screen reads out, with nothing executed and nothing
/// written. Separate from the run on purpose: a preview that had side effects
/// would make the Review screen itself the install.
#[tauri::command]
pub fn setup_plan(selection: Selection) -> SetupPlan {
    build_plan(selection)
}

/// What a run produced: the plan that executed, whether an installer session was
/// started by it, one readiness report per item, and whether another attempt may
/// be made right now.
///
/// The four are deliberately separate fields. `installerStarted` is a fact about
/// a spawn, `readiness` is what the diagnostics say, and collapsing them into
/// one "ok" is the conflation that made a started process look like a finished
/// install. Serialize only, for the reason on `SetupItem`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupOutcome {
    pub plan: SetupPlan,
    /// An installer session was spawned. Started, nothing more: not finished,
    /// not successful, not ready.
    pub installer_started: bool,
    /// Per item, in plan order. The RESULT of each component's own diagnostic,
    /// except for an item whose installer is still running, which reports
    /// `installing` because no diagnostic can honestly answer yet.
    pub readiness: Vec<ComponentReport>,
    /// Whether this run can be attempted again as things stand, and why not
    /// when it cannot — read by the UI so "Retry this component" appears only
    /// where pressing it would actually do something.
    pub retry: crate::RetryState,
}

/// Builds the plan HERE and runs that, rather than accepting a plan from the
/// frontend, and hands back what it ran together with what the diagnostics then
/// made of it. The UI therefore learns exactly what executed, while having no
/// way to describe it.
///
/// An error is returned rather than swallowed: a run that could not start — the
/// previous installer still alive at its prompt, most of all — must not reach
/// the caller as a success with an empty readiness list.
#[tauri::command]
pub fn run_setup(
    app: tauri::AppHandle,
    reg: tauri::State<pty::SessionRegistry>,
    selection: Selection,
) -> Result<SetupOutcome, String> {
    let plan = build_plan(selection);
    let installer_started = run_plan(&app, &reg, &plan)?;
    let readiness = readiness(&plan, installer_started);
    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    let retry = crate::retry_state(&mut map);
    drop(map);
    Ok(SetupOutcome {
        plan,
        installer_started,
        readiness,
        retry,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const EVERYTHING: Selection = Selection {
        claude: true,
        codex: true,
        commands: true,
        agents: true,
        worker: true,
        browser: true,
        ios: true,
        android: true,
        memory: true,
    };

    #[test]
    fn an_empty_selection_plans_nothing() {
        let plan = build_plan(Selection::default());
        assert!(plan.items.is_empty());
        assert!(only_flags(&plan).is_empty());
    }

    #[test]
    fn one_component_touches_only_that_component() {
        let plan = build_plan(Selection {
            commands: true,
            ..Selection::default()
        });
        assert_eq!(plan.items.len(), 1);
        assert!(plan.items[0].id == ComponentId::Commands);
        assert!(plan.items[0].op == SetupOp::InstallSelected);
        assert_eq!(only_flags(&plan), vec!["commands"]);
    }

    #[test]
    fn python_dependencies_never_run_without_the_files_they_need() {
        for selection in [
            Selection {
                worker: true,
                ..Selection::default()
            },
            Selection {
                memory: true,
                ..Selection::default()
            },
        ] {
            assert_eq!(
                only_flags(&build_plan(selection)),
                vec!["worker", "pydeps"],
                "pydeps must never be asked for without the worker files"
            );
        }
    }

    #[test]
    fn components_the_installer_does_not_own_never_reach_it() {
        let plan = build_plan(Selection {
            claude: true,
            codex: true,
            browser: true,
            ios: true,
            android: true,
            ..Selection::default()
        });
        assert_eq!(plan.items.len(), 5);
        assert!(only_flags(&plan).is_empty());
        assert!(plan.items.iter().all(|i| i.op != SetupOp::InstallSelected));
    }

    #[test]
    fn every_item_is_selected_and_describes_itself() {
        let plan = build_plan(EVERYTHING);
        assert_eq!(plan.items.len(), PLAN_ORDER.len());
        assert!(plan.items.iter().all(|i| i.selected));
        assert!(plan.items.iter().all(|i| !i.effects.is_empty()));
        // The sections no checkbox can select stay out of the flag list even when
        // every checkbox is ticked.
        let flags = only_flags(&plan);
        assert!(flags.iter().all(|f| !NEVER_SELECTED.contains(f)));
        assert_eq!(flags, vec!["commands", "agents", "worker", "pydeps"]);
    }

    /// The full install is one named operation and it is WIDER than any plan.
    /// If a selection could ever produce this scope, "install everything" would
    /// be back as a checkbox combination rather than a decision.
    #[test]
    fn the_legacy_scope_is_wider_than_any_selection_can_ask_for() {
        let scope = legacy_scope();
        assert_eq!(scope.components, LEGACY_SCOPE);
        // Nothing has run merely because the scope was read.
        assert!(!scope.started);
        // Every section a checkbox can select is covered by the bare run...
        for name in EMITTED_COMPONENTS {
            assert!(
                scope.components.iter().any(|c| c == name),
                "{name} is selectable but not covered by the bare run"
            );
        }
        // ...and so are the three it cannot, which is the difference.
        for name in NEVER_SELECTED {
            assert!(
                scope.components.iter().any(|c| c == name),
                "{name} must be part of the legacy scope and only of it"
            );
        }
        assert!(scope.components.len() > EMITTED_COMPONENTS.len());
    }

    /// The scope has to be readable before it runs, and it has to mention the
    /// three sections that make the old run feel like it took the machine over.
    #[test]
    fn the_legacy_install_spells_out_the_sections_no_checkbox_can_select() {
        let effects = legacy_scope().effects;
        for needle in [
            "~/.claude/settings.json",
            "~/.zshrc",
            "launchd",
            "NO --only",
        ] {
            assert!(
                effects.iter().any(|e| e.contains(needle)),
                "the legacy scope never mentions {needle}"
            );
        }
        // It must not claim a flag it does not pass.
        assert!(
            !effects.iter().any(|e| e.contains("--only=")),
            "the bare run passes no --only and must not say it does"
        );
    }

    /// No component maps to a section outside the selectable four, so no plan
    /// can widen into the legacy scope — checked over every id rather than over
    /// a few selections, and without probing anything.
    #[test]
    fn no_component_can_ask_for_a_section_outside_the_selectable_four() {
        for id in PLAN_ORDER {
            for flag in installer_flags(id) {
                assert!(
                    EMITTED_COMPONENTS.contains(flag),
                    "a component asked for {flag}, which is not an emitted section"
                );
                assert!(
                    !NEVER_SELECTED.contains(flag),
                    "a component asked for {flag}, which no checkbox may select"
                );
            }
        }
    }

    /// Readiness is the diagnostic's answer, not the operation's. Browser is the
    /// honest case to assert on: its check is a `cfg!` read, so the two calls
    /// cannot disagree for reasons outside this module.
    #[test]
    fn readiness_is_whatever_the_components_own_check_says() {
        let plan = build_plan(Selection {
            browser: true,
            ..Selection::default()
        });
        let reports = readiness(&plan, false);
        assert_eq!(reports.len(), 1);
        assert!(reports[0].id == ComponentId::Browser);
        assert!(reports[0].status == doctor::check_browser().status);
    }

    /// Reported per item and in plan order, so a caller cannot read one
    /// component's status off another's row.
    #[test]
    fn readiness_reports_every_item_in_plan_order() {
        let plan = build_plan(Selection {
            commands: true,
            agents: true,
            browser: true,
            ..Selection::default()
        });
        let reports = readiness(&plan, true);
        assert_eq!(reports.len(), plan.items.len());
        assert!(
            reports
                .iter()
                .zip(plan.items.iter())
                .all(|(report, item)| report.id == item.id)
        );
    }

    /// The core of it: a started installer never yields `Ready`. A spawn, a
    /// resolved invoke and an EOF are all "something began or ended", and a
    /// legacy script's children can outlive the script, so only the diagnostic
    /// run afterwards may say ready.
    #[test]
    fn a_started_installer_never_reports_ready() {
        let plan = build_plan(Selection {
            commands: true,
            agents: true,
            worker: true,
            memory: true,
            ..Selection::default()
        });
        let reports = readiness(&plan, true);
        assert_eq!(reports.len(), 4);
        for report in &reports {
            assert!(
                report.status == ComponentStatus::Installing,
                "an item whose installer merely started was given a verdict"
            );
            assert!(report.status != ComponentStatus::Ready);
            // And it says what to do to find out, since nothing here knows yet.
            assert!(report.detail.as_deref().unwrap_or("").contains("check"));
        }
    }

    /// Without a running installer the same items are probed for real, so the
    /// `installing` placeholder cannot leak into a plain readiness query — that
    /// would be a status nothing ever clears.
    #[test]
    fn readiness_without_a_running_installer_is_always_probed() {
        let plan = build_plan(Selection {
            commands: true,
            agents: true,
            ..Selection::default()
        });
        for report in readiness(&plan, false) {
            assert!(report.status != ComponentStatus::Installing);
            assert!(report.status != ComponentStatus::Queued);
        }
    }

    /// Task 124. Three claims, one per selection shape. The first two overlap
    /// `one_component_touches_only_that_component`, which checks the general
    /// rule; these name the two selections a regression would most plausibly
    /// reach, so the failure says which one broke.
    ///
    /// The third claim is the one nothing else covers: no selection can yield a
    /// Verify item. That holds at the type level -- `ComponentId` has no Verify
    /// variant and `Selection` has no Verify field -- and asserting it here
    /// means a later build that adds one has to come past this test.
    #[test]
    fn browser_only_plan_has_no_hooks_item() {
        let browser_only = Selection {
            browser: true,
            ..Selection::default()
        };
        let plan = build_plan(browser_only);

        // Browser is a tool this installer does not own, so the plan must not
        // reach for the three sections no checkbox can select.
        for item in &plan.items {
            for flag in installer_flags(item.id) {
                assert!(
                    !NEVER_SELECTED.contains(flag),
                    "a Browser-only selection asked for {flag}, which no component may request"
                );
            }
            for effect in &item.effects {
                let lowered = effect.to_ascii_lowercase();
                assert!(
                    !lowered.contains("settings.json"),
                    "a Browser-only selection would write Claude hooks: {effect}"
                );
            }
        }

        // Codex is likewise not something this installer provides, so it can
        // never drag the Python worker in with it.
        let codex_only = Selection {
            codex: true,
            ..Selection::default()
        };
        for item in &build_plan(codex_only).items {
            let flags = installer_flags(item.id);
            assert!(
                !flags.contains(&"worker") && !flags.contains(&"pydeps"),
                "a Codex-only selection asked for {flags:?}"
            );
        }

        // Nothing any selection can express names Verify. Verify is an
        // EXPERIENCE whose availability comes from release configuration, and
        // it is deliberately absent from the component vocabulary, so a user
        // cannot select their way into installing an unreleased experience.
        let everything = Selection {
            claude: true,
            codex: true,
            commands: true,
            agents: true,
            worker: true,
            browser: true,
            ios: true,
            android: true,
            memory: true,
        };
        for item in &build_plan(everything).items {
            // `ComponentId` has no Debug impl, so the item is described by what
            // it would DO -- its installer flags and its effects -- which is
            // the stronger reading anyway.
            let described = format!(
                "{} {}",
                installer_flags(item.id).join(" "),
                item.effects.join(" ")
            )
            .to_ascii_lowercase();
            assert!(
                !described.contains("verify"),
                "a selection produced a Verify item: {described}"
            );
        }

        // And the empty case stays empty rather than defaulting to everything,
        // restated here because it is the specific regression Task 124 names.
        assert!(build_plan(Selection::default()).items.is_empty());
    }

    #[test]
    fn the_plan_keeps_its_declared_order() {
        let plan = build_plan(EVERYTHING);
        assert!(
            plan.items
                .iter()
                .zip(PLAN_ORDER.iter())
                .all(|(item, id)| item.id == *id)
        );
    }
}
