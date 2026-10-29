use crate::shell_env;
use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

/// The 8 commands install.sh:14 installs, and the directory it installs them
/// into (install.sh:8). Both are copied from there rather than invented here —
/// a list that drifts would call a complete install incomplete.
const COMMANDS: [&str; 8] = [
    "ec-setup",
    "ec-brainstorm",
    "ec-plan",
    "ec-refine",
    "ec-execute",
    "ec-review",
    "ec-git",
    "ec-selfhealing",
];

/// The 32 agents install.sh:15 installs, copied from there for the same reason.
/// Checked but never blocking: a missing agent degrades /ec-execute to a
/// warning, it does not stop work, so this must not gate the shell.
const AGENTS: [&str; 32] = [
    "ec-react",
    "ec-vue",
    "ec-nextjs",
    "ec-typescript",
    "ec-tailwind",
    "ec-react-native",
    "ec-flutter",
    "ec-ios",
    "ec-android",
    "ec-mobile-perf",
    "ec-python",
    "ec-nodejs",
    "ec-golang",
    "ec-java",
    "ec-php",
    "ec-sql",
    "ec-nosql",
    "ec-migration",
    "ec-unit-test",
    "ec-e2e",
    "ec-api-test",
    "ec-docker",
    "ec-cicd",
    "ec-cloud",
    "ec-security",
    "ec-performance",
    "ec-refactor",
    "ec-reviewer",
    "ec-api-design",
    "ec-architect",
    "ec-llm",
    "ec-antislop",
];

fn commands_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".claude/commands")
}

fn agents_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".claude/agents")
}

/// A short timeout on purpose: a dead port must not stall the first screen.
///
/// `pub(crate)` for the reason `probe_command` below is: keychain.rs runs
/// /usr/bin/security with a prepared stdin, which this module's helper
/// deliberately does not offer (it nulls stdin), and that one budget is the
/// thing both must share. A second timeout constant would be a second answer to
/// "how long may a tool hold this app", and the two would drift.
pub(crate) const PROBE_TIMEOUT: Duration = Duration::from_secs(1);

/// Hand-rolled GET rather than an HTTP crate — one request against one known
/// loopback endpoint does not justify a dependency.
fn worker_ok() -> bool {
    let Ok(addr) = "127.0.0.1:37777".parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, PROBE_TIMEOUT) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(PROBE_TIMEOUT));
    let _ = stream.set_write_timeout(Some(PROBE_TIMEOUT));
    if stream
        .write_all(b"GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut body = String::new();
    // read_to_string on a Connection: close response ends at EOF.
    if stream.read_to_string(&mut body).is_err() {
        return false;
    }
    body.contains("\"status\": \"ok\"") || body.contains("\"status\":\"ok\"")
}

// ---------------------------------------------------------------------------
// Per-component diagnostics
//
// One report per component and deliberately no verdict over them. The shell has
// to open with no Claude, no Codex and no SDK present, so there is nothing here
// for a caller to collapse into a single pass/fail — a global verdict could only
// ever be read that way. Each check owns its own probe and its own failure text,
// which is what makes a broken Xcode selection unable to say anything about
// whether the memory worker is up.
// ---------------------------------------------------------------------------

/// Mirrors `ComponentId` at studio/src/lib/types.ts:103. Every separately
/// installable or detectable piece has an id, and nothing here stands for the
/// machine as a whole.
#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ComponentId {
    Claude,
    Codex,
    Commands,
    Agents,
    Worker,
    Browser,
    Ios,
    Android,
    Memory,
}

/// Mirrors `ComponentStatus` at studio/src/lib/types.ts:111. `Detected` means
/// found on disk and nothing more: no check in this app can observe a provider
/// login, so no status here may be read as one. `Ready` is the stronger claim
/// that a relevant diagnostic actually passed, which is why the two stay apart.
/// `NotSelected`, `Queued` and `Installing` belong to the setup flow rather than
/// to a probe, so no check in this file returns them — they are here because the
/// wire contract is one enum shared with that flow.
#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ComponentStatus {
    NotSelected,
    Detected,
    Queued,
    Installing,
    Ready,
    NeedsAttention,
    Unavailable,
}

/// camelCase because this crosses to the
/// frontend, where the wire convention is camelCase (recorded at
/// projects.rs:54-58).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentReport {
    pub id: ComponentId,
    pub status: ComponentStatus,
    /// The resolved executable, directory or endpoint the check found.
    pub detail: Option<String>,
    /// Verbatim failure text, in the probe's own words so the UI can say which
    /// path was tried instead of "not found". Never a credential — no check
    /// here reads one.
    pub error: Option<String>,
    /// Always false here, for the reason recorded on NOTHING_IS_REQUIRED.
    pub required: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub components: Vec<ComponentReport>,
}

/// Nothing this file reports on is required. The product must open with no
/// Claude, no Codex and no SDK installed, so a check that set this to true would
/// be the global gate returning under another name. The field exists because the
/// wire contract has it (types.ts:124) and because a component that genuinely
/// could not be worked around would need it.
const NOTHING_IS_REQUIRED: bool = false;

impl ComponentReport {
    fn new(
        id: ComponentId,
        status: ComponentStatus,
        detail: Option<String>,
        error: Option<String>,
    ) -> Self {
        ComponentReport {
            id,
            status,
            detail,
            error,
            required: NOTHING_IS_REQUIRED,
        }
    }

    fn ready(id: ComponentId, detail: impl Into<String>) -> Self {
        Self::new(id, ComponentStatus::Ready, Some(detail.into()), None)
    }

    fn detected(id: ComponentId, detail: impl Into<String>) -> Self {
        Self::new(id, ComponentStatus::Detected, Some(detail.into()), None)
    }

    fn attention(id: ComponentId, error: impl Into<String>) -> Self {
        Self::new(
            id,
            ComponentStatus::NeedsAttention,
            None,
            Some(error.into()),
        )
    }

    /// For the failures that have something to show as well as something to
    /// fix: an Xcode that is installed and still cannot run a simulator is only
    /// actionable if the report names the Xcode it found.
    fn attention_with(
        id: ComponentId,
        detail: impl Into<String>,
        error: impl Into<String>,
    ) -> Self {
        Self::new(
            id,
            ComponentStatus::NeedsAttention,
            Some(detail.into()),
            Some(error.into()),
        )
    }

    fn unavailable(id: ComponentId, error: impl Into<String>) -> Self {
        Self::new(id, ComponentStatus::Unavailable, None, Some(error.into()))
    }
}

/// What a probed command did. Separating "did not start" from "ran and
/// complained" is the point: a CLI that exists but rejects a flag we guessed at
/// is still installed, and reporting it as missing would send the user to
/// reinstall something they already have.
///
/// `pub(crate)` because devices.rs probes through this same helper rather than
/// keeping a second copy of it: two copies would be two places to fix the next
/// PATH or timeout surprise. The fields are `pub` for the same reason — a
/// caller in another module has to be able to read what the probe found.
pub(crate) struct Probe {
    pub ok: bool,
    pub stdout: String,
}

/// Runs a probe command under the same one-second budget as the loopback GET,
/// for the reason recorded on PROBE_TIMEOUT: `xcrun` against a broken Xcode
/// selection can sit for a long time, and no diagnostic may hold the first
/// screen. std::process has no timed wait, so the child runs on a worker thread
/// and the answer arrives over a channel; on timeout the caller is answered and
/// the thread is left to finish. One parked thread is a far cheaper failure than
/// a window that never paints, and the send into a dropped receiver is simply
/// discarded.
///
/// `Err` means the command could not be run at all — not found, not executable,
/// or out of time. `Ok` means the binary ran, whatever it thought of its
/// arguments.
pub(crate) fn probe_command(program: &str, args: &[&str]) -> Result<Probe, String> {
    let (tx, rx) = mpsc::channel();
    let owned_program = program.to_string();
    let owned_args: Vec<String> = args.iter().map(|a| (*a).to_string()).collect();

    thread::spawn(move || {
        let result = Command::new(&owned_program)
            .args(&owned_args)
            // A GUI process launched from Finder inherits no shell PATH
            // (shell_env.rs:6-8), so without this every machine would report
            // its tools as missing.
            .env("PATH", shell_env::login_shell_path())
            // Null stdin so a probe that decides to prompt fails instead of
            // waiting, and null stderr so a chatty tool cannot fill a pipe.
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(PROBE_TIMEOUT) {
        Ok(Ok(out)) => Ok(Probe {
            ok: out.status.success(),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        }),
        Ok(Err(e)) => Err(format!("could not run {program}: {e}")),
        Err(_) => Err(format!("{program} did not answer within {PROBE_TIMEOUT:?}")),
    }
}

/// Resolves the login shell's PATH BEFORE any probe's budget starts, and the
/// reason PROBE_TIMEOUT above can stay at one second.
///
/// `probe_command` reads `login_shell_path()` from inside the child-spawning
/// thread, which is after `recv_timeout` has already begun counting. The cost
/// is a whole `zsh -ilc`, and because `run_diagnostics` releases its nine
/// checks at once they ALL block on the same `OnceLock::get_or_init` — so
/// every one of the nine pays it, not just the first. Measured on this
/// machine: 546–824 ms of each check's 1000 ms gone before its command was
/// spawned, which turned a working Xcode into `xcrun did not answer within 1s`
/// and reported it as needsAttention on first paint. The command itself
/// answers in about 0.13 s.
///
/// So the budget is not widened — a dead port must still not stall the first
/// screen — the cost is moved out of it. The `OnceLock` in shell_env makes
/// every later call free, which is what lets this be a plain call at the top
/// of an entry point rather than a parameter threaded through every check.
///
/// devices.rs:348-350 carries a private twin of this for its own two entry
/// points; that one can collapse onto this call the next time either file is
/// opened.
pub(crate) fn warm_login_shell_path() {
    let _ = shell_env::login_shell_path();
}

/// Capped at `Detected` on purpose. Finding the binary says nothing about
/// whether the user is signed in, and this app has no way to observe that, so a
/// `Ready` here would be a claim about a login nobody checked.
///
/// Resolution goes through `shell_env::resolve_claude` for now. The generalised
/// form is `agents::resolve` in agents.rs — override, then login-shell PATH,
/// then $HOME-relative fallbacks, with the program name as a parameter — and it
/// is the consolidation target for this call the moment agents.rs joins the
/// module tree.
pub fn check_claude(override_path: Option<&str>) -> ComponentReport {
    match shell_env::resolve_claude(override_path) {
        Ok(path) => ComponentReport::detected(ComponentId::Claude, path.to_string_lossy()),
        Err(e) => ComponentReport::attention(ComponentId::Claude, e),
    }
}

/// Probed by running it rather than by resolving a path: `shell_env` only
/// resolves `claude`, `agents::resolve` is the generalised resolver and is not
/// callable until agents.rs joins the module tree, and a third discovery order
/// in this file would be one more place to fix the next PATH surprise. Running
/// the binary proves the same thing a resolver would and reports the version
/// while it is there.
///
/// `Detected`, never `Ready`, for the reason on `check_claude`. A non-zero exit
/// is still a detection: `--version` is a guess about this CLI's flags, and
/// guessing wrong must not be reported as a missing install.
pub fn check_codex() -> ComponentReport {
    match probe_command("codex", &["--version"]) {
        Ok(p) => {
            let version = p
                .stdout
                .lines()
                .map(str::trim)
                .find(|l| !l.is_empty())
                .filter(|_| p.ok);
            ComponentReport::detected(ComponentId::Codex, version.unwrap_or("found on PATH"))
        }
        Err(e) => ComponentReport::attention(ComponentId::Codex, e),
    }
}

/// `Ready` only on a complete set: a partial install is what makes /ec-execute
/// fail halfway through a flow, which is worse than an absent one.
pub fn check_commands() -> ComponentReport {
    let dir = commands_dir();
    let found = COMMANDS
        .iter()
        .filter(|c| dir.join(format!("{c}.md")).is_file())
        .count();
    let detail = format!("{found} of {} in {}", COMMANDS.len(), dir.display());

    if found == COMMANDS.len() {
        ComponentReport::ready(ComponentId::Commands, detail)
    } else if found == 0 {
        // Nothing installed and a half-written tree are different repairs — a
        // first run against a re-run — so they do not share a sentence.
        ComponentReport::attention_with(
            ComponentId::Commands,
            detail,
            format!("no /ec-* commands found in {}", dir.display()),
        )
    } else {
        ComponentReport::attention_with(
            ComponentId::Commands,
            detail,
            format!(
                "{} of {} commands missing — re-run the installer",
                COMMANDS.len() - found,
                COMMANDS.len()
            ),
        )
    }
}

/// Reported exactly like the commands but never required, for the reason
/// recorded at doctor.rs:22-24: a missing agent degrades /ec-execute to a
/// warning, it does not stop work.
pub fn check_agents() -> ComponentReport {
    let dir = agents_dir();
    let found = AGENTS
        .iter()
        .filter(|a| dir.join(format!("{a}.md")).is_file())
        .count();
    let detail = format!("{found} of {} in {}", AGENTS.len(), dir.display());

    if found == AGENTS.len() {
        ComponentReport::ready(ComponentId::Agents, detail)
    } else if found == 0 {
        ComponentReport::attention_with(
            ComponentId::Agents,
            detail,
            format!("no ec-* agents found in {}", dir.display()),
        )
    } else {
        ComponentReport::attention_with(
            ComponentId::Agents,
            detail,
            format!(
                "{} of {} agents missing — the matching specialist will not be available",
                AGENTS.len() - found,
                AGENTS.len()
            ),
        )
    }
}

/// `worker_ok()` unchanged as the probe: a hand-rolled loopback GET on a
/// deliberate one-second budget.
pub fn check_worker() -> ComponentReport {
    // The endpoint is spelled out again rather than read out of worker_ok, whose
    // body is fixed: a user told only "not responding" has nothing to go and
    // check. The two are changed together or not at all.
    const ENDPOINT: &str = "127.0.0.1:37777";

    if worker_ok() {
        ComponentReport::ready(ComponentId::Worker, format!("healthy on {ENDPOINT}"))
    } else {
        ComponentReport::attention(
            ComponentId::Worker,
            format!("no healthy response from {ENDPOINT} — start the memory worker"),
        )
    }
}

/// The browsing surface renders in the same webview that is already drawing this
/// diagnostic, so the honest probe is the app's own existence. Nothing is
/// installed for a browser tab — install.sh:74 lists it as external and installs
/// nothing — and a presence check for an engine that is demonstrably running
/// would be theatre. What is worth reporting is which engine, because its quirks
/// become the user's.
pub fn check_browser() -> ComponentReport {
    let engine = if cfg!(target_os = "macos") {
        Some("WebKit (WKWebView)")
    } else if cfg!(target_os = "windows") {
        Some("WebView2")
    } else if cfg!(target_os = "linux") {
        Some("WebKitGTK")
    } else {
        None
    };

    match engine {
        Some(e) => ComponentReport::ready(ComponentId::Browser, e),
        None => ComponentReport::unavailable(
            ComponentId::Browser,
            "no webview engine is known for this platform",
        ),
    }
}

/// `simctl list runtimes available` prints one line per runtime, named by
/// platform. Counted from the text form rather than the JSON one because a count
/// is all a report needs, and this keeps the probe to one cheap exec.
fn count_ios_runtimes(listing: &str) -> usize {
    listing
        .lines()
        .filter(|l| l.trim_start().starts_with("iOS "))
        .count()
}

/// `simctl list devices available` groups devices under `-- <platform> --`
/// headers and lists watchOS and tvOS devices in the same output, so the section
/// header has to be tracked: a paired Apple Watch is not an iPhone simulator and
/// must not make iOS report ready.
fn count_ios_devices(listing: &str) -> usize {
    let mut in_ios = false;
    let mut devices = 0;

    for line in listing.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("--") {
            in_ios = trimmed.contains("iOS");
            continue;
        }
        // A device line carries its power state in parentheses; a header, a
        // blank line and the `== Devices ==` banner do not.
        if in_ios && (trimmed.contains("(Shutdown)") || trimmed.contains("(Booted)")) {
            devices += 1;
        }
    }
    devices
}

/// Three separate failures, because they are three separate repairs: this is not
/// a Mac, Xcode is not installed, or Xcode is installed and still cannot run
/// anything. "Xcode is installed" is not "a simulator is ready" — a fresh Xcode
/// has no runtime downloaded and no device created — and collapsing those into
/// one message sends the user to reinstall a working Xcode.
pub fn check_ios() -> ComponentReport {
    if !cfg!(target_os = "macos") {
        return ComponentReport::unavailable(
            ComponentId::Ios,
            "iOS simulators exist only on macOS",
        );
    }

    let developer_dir = match probe_command("xcode-select", &["-p"]) {
        Ok(p) if p.ok => p.stdout.trim().to_string(),
        Ok(_) => {
            return ComponentReport::attention(
                ComponentId::Ios,
                "no developer directory selected — install Xcode, then run xcode-select --switch",
            );
        }
        Err(e) => return ComponentReport::attention(ComponentId::Ios, e),
    };

    // The Command Line Tools satisfy xcode-select and ship no simulators at all,
    // so this is still the missing-Xcode failure rather than the missing-runtime
    // one, and the fix is an App Store install rather than a download inside
    // Xcode.
    if developer_dir.contains("CommandLineTools") {
        return ComponentReport::attention_with(
            ComponentId::Ios,
            developer_dir,
            "only the Command Line Tools are installed; iOS simulators need full Xcode",
        );
    }

    let runtimes = match probe_command("xcrun", &["simctl", "list", "runtimes", "available"]) {
        Ok(p) if p.ok => count_ios_runtimes(&p.stdout),
        Ok(_) => {
            return ComponentReport::attention_with(
                ComponentId::Ios,
                developer_dir,
                "Xcode is installed but simctl would not list its runtimes",
            );
        }
        Err(e) => return ComponentReport::attention_with(ComponentId::Ios, developer_dir, e),
    };
    if runtimes == 0 {
        return ComponentReport::attention_with(
            ComponentId::Ios,
            developer_dir,
            "Xcode is installed but no iOS runtime is — download one in Xcode > Settings > Components",
        );
    }

    let devices = match probe_command("xcrun", &["simctl", "list", "devices", "available"]) {
        Ok(p) if p.ok => count_ios_devices(&p.stdout),
        Ok(_) => {
            return ComponentReport::attention_with(
                ComponentId::Ios,
                developer_dir,
                "an iOS runtime is installed but simctl would not list its devices",
            );
        }
        Err(e) => return ComponentReport::attention_with(ComponentId::Ios, developer_dir, e),
    };
    if devices == 0 {
        return ComponentReport::attention_with(
            ComponentId::Ios,
            developer_dir,
            "an iOS runtime is installed but no simulator device exists — create one in Xcode > Window > Devices and Simulators",
        );
    }

    ComponentReport::ready(
        ComponentId::Ios,
        format!("{developer_dir} · {runtimes} iOS runtime(s) · {devices} simulator(s)"),
    )
}

/// ANDROID_HOME first, then the deprecated ANDROID_SDK_ROOT that older installs
/// still export, then the per-platform default Android Studio writes. Each
/// candidate is checked for existing rather than for being set: a stale
/// ANDROID_HOME left behind in a shell profile must not be reported as an SDK.
///
/// The default path carries the weight here, because a GUI process inherits no
/// shell exports at all — `login_shell_path` recovers PATH and nothing else.
fn android_sdk_dir() -> Option<PathBuf> {
    let from_env = ["ANDROID_HOME", "ANDROID_SDK_ROOT"]
        .into_iter()
        .filter_map(|k| std::env::var(k).ok())
        .filter(|v| !v.is_empty())
        .map(PathBuf::from);

    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let default = if cfg!(target_os = "macos") {
        home.join("Library/Android/sdk")
    } else if cfg!(target_os = "windows") {
        PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("Android/Sdk")
    } else {
        home.join("Android/Sdk")
    };

    from_env
        .chain(std::iter::once(default))
        .find(|p| p.is_dir())
}

/// SDK presence and an available AVD are reported apart, because having the SDK
/// is not having a device. An SDK whose emulator package was never downloaded
/// and an SDK with no AVD created are two different repairs, and neither of them
/// is "install the SDK".
pub fn check_android() -> ComponentReport {
    let Some(sdk) = android_sdk_dir() else {
        return ComponentReport::attention(
            ComponentId::Android,
            "Android SDK not found — set ANDROID_HOME or install it through Android Studio",
        );
    };
    let sdk_detail = sdk.display().to_string();

    // The emulator ships as its own SDK package, so it is probed at its path
    // inside the SDK rather than on PATH: a user with the SDK but without that
    // package has to be told which piece is missing, and on most machines the
    // emulator is never added to PATH either way.
    let emulator = sdk.join("emulator").join(if cfg!(target_os = "windows") {
        "emulator.exe"
    } else {
        "emulator"
    });
    if !emulator.is_file() {
        return ComponentReport::attention_with(
            ComponentId::Android,
            sdk_detail,
            "the SDK is installed but its emulator package is not — add it in the SDK Manager",
        );
    }

    let avds = match probe_command(&emulator.to_string_lossy(), &["-list-avds"]) {
        Ok(p) if p.ok => p
            .stdout
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            // The emulator prefixes its own log lines with a level and a pipe
            // ("INFO    | ..."); those are not AVD names and must not be counted
            // as devices.
            .filter(|l| !l.contains('|'))
            .count(),
        Ok(_) => {
            return ComponentReport::attention_with(
                ComponentId::Android,
                sdk_detail,
                "the emulator is installed but would not list AVDs",
            );
        }
        Err(e) => return ComponentReport::attention_with(ComponentId::Android, sdk_detail, e),
    };
    if avds == 0 {
        return ComponentReport::attention_with(
            ComponentId::Android,
            sdk_detail,
            "the SDK and emulator are installed but no AVD is created — create one in Device Manager",
        );
    }

    ComponentReport::ready(ComponentId::Android, format!("{sdk_detail} · {avds} AVD(s)"))
}

/// The memory engine's own diagnostic is its files and its store on disk, and
/// deliberately not whether the worker answers: the worker has its own report,
/// and a component whose status moved because another one failed would be
/// exactly the collapsed verdict this split exists to remove.
///
/// Installed-but-empty is `Detected` rather than `Ready` — the engine is on disk
/// and nothing has been indexed yet, which is a true first-run state and not a
/// fault to fix.
pub fn check_memory() -> ComponentReport {
    let root = PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".efficlaude");
    // memory.py is the engine itself (install.sh:16); chroma/ and efficlaude.db
    // are the store it writes (install.sh:176). Those files belong to the Python
    // side and are only ever read here.
    let engine = root.join("server/memory.py");
    if !engine.is_file() {
        return ComponentReport::attention(
            ComponentId::Memory,
            format!("memory engine not installed — {} is missing", engine.display()),
        );
    }

    let indexed = root.join("chroma").is_dir() && root.join("efficlaude.db").is_file();
    if indexed {
        ComponentReport::ready(ComponentId::Memory, format!("store at {}", root.display()))
    } else {
        ComponentReport::detected(
            ComponentId::Memory,
            format!("installed at {}, no store written yet", root.display()),
        )
    }
}

/// Collects the nine reports. Never `Err` — a failed probe is a report, not an
/// error — and that matters all the more here, because a single `Err` return
/// would take the other eight reports down with the one that failed.
///
/// Run concurrently, which is not an optimisation but the independence made
/// literal: the checks share nothing, so running them in sequence would make the
/// first screen wait for the sum of every probe's timeout instead of the longest
/// one. Reports come back in the order the checks are listed, so the UI renders
/// the same rows in the same places every time regardless of who finished first.
#[tauri::command]
pub fn run_diagnostics(override_path: Option<String>) -> Diagnostics {
    let claude_override = override_path;

    // Before the jobs below, never inside one: every probe's budget starts the
    // moment its thread is spawned, so this is the only place the shell probe
    // can be paid for without a component paying for it. See
    // `warm_login_shell_path`.
    warm_login_shell_path();

    let jobs: Vec<(ComponentId, thread::JoinHandle<ComponentReport>)> = vec![
        (
            ComponentId::Claude,
            thread::spawn(move || check_claude(claude_override.as_deref())),
        ),
        (ComponentId::Codex, thread::spawn(check_codex)),
        (ComponentId::Commands, thread::spawn(check_commands)),
        (ComponentId::Agents, thread::spawn(check_agents)),
        (ComponentId::Worker, thread::spawn(check_worker)),
        (ComponentId::Browser, thread::spawn(check_browser)),
        (ComponentId::Ios, thread::spawn(check_ios)),
        (ComponentId::Android, thread::spawn(check_android)),
        (ComponentId::Memory, thread::spawn(check_memory)),
    ];

    Diagnostics {
        components: jobs
            .into_iter()
            .map(|(id, handle)| {
                // A panicking probe is still only one component's bad news.
                // Unwrapping here would let it take the whole report down, which
                // is the single-verdict failure mode wearing a different hat.
                handle.join().unwrap_or_else(|_| {
                    ComponentReport::attention(id, "the check for this component panicked")
                })
            })
            .collect(),
    }
}
