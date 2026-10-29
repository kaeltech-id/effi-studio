use crate::shell_env::login_shell_path;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub const CLAUDE_CODE_ID: &str = "claude-code";
pub const CODEX_ID: &str = "codex";

/// The local shell — a FACILITY, not a provider.
///
/// DESIGN-SPEC.md §2 lists the terminal as "Fasilitas dasar · Shell lokal,
/// tidak butuh Claude untuk membuka aplikasi", and §10 as "Belum ada agent:
/// terminal tetap bisa dipakai". So a shell tab has to open and run on a
/// machine with no AI CLI installed at all, which means `pty_start` needs a
/// program for it.
///
/// Deliberately NOT a `BUILT_INS` row, and this is the whole decision: that
/// array feeds `registry`, `registry` feeds the `agents` command, and the
/// `agents` command is what AddToolMenu offers under "Agents", what Settings
/// lists as a provider the user can repoint, and what App.tsx:779 searches for
/// a workflow adapter. A terminal added there would be offered as an AI
/// provider in every one of those places — it would be addable as an agent
/// tab, it would want a path override it has no use for, and `agents()` would
/// report a count that includes something that is not one. Resolution for it
/// is a separate path in `pty_start` instead (lib.rs), which is one `if` at the
/// single call site that needs it and nothing anywhere else.
///
/// Double-underscored for the reason lib.rs's INSTALL_SESSION is: the only ids
/// a user can introduce are `cli-<16 hex>` from `custom_id` below, so this can
/// collide with nothing.
pub const SHELL_ID: &str = "__shell__";

/// Claude Code's $HOME-relative install locations, and deliberately a copy of
/// the list shell_env keeps private to resolve_claude rather than a share of
/// it: that resolver still serves the single-program path the app was built on,
/// and widening its constant would tie the two together just as this registry
/// starts to replace it. Both retire when the last caller asks the registry.
const CLAUDE_FALLBACKS: [&str; 3] = [".local/bin/claude", ".claude/local/claude", "bin/claude"];

/// Empty on purpose rather than unfinished: codex ships through npm and
/// Homebrew, which both put it on PATH, so there is no per-user install
/// location to guess at and a guess here would only produce a wrong path.
const CODEX_FALLBACKS: [&str; 0] = [];

/// The generalised form of shell_env::resolve_claude's order — an explicit
/// override, then the login shell's PATH, then $HOME-relative fallbacks — with
/// the program name and the fallback list as parameters. Every provider
/// resolves through this one function: a provider that brought discovery rules
/// of its own would be a second place to fix the next PATH surprise.
pub fn resolve(
    program: &str,
    override_path: Option<&str>,
    fallbacks: &[&str],
) -> Result<PathBuf, String> {
    if let Some(p) = override_path.filter(|p| !p.is_empty()) {
        let candidate = PathBuf::from(p);
        return if candidate.is_file() {
            Ok(candidate)
        } else {
            Err(format!("override not found: {p}"))
        };
    }

    for dir in login_shell_path().split(':').filter(|d| !d.is_empty()) {
        let candidate = PathBuf::from(dir).join(program);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    let home = std::env::var("HOME").unwrap_or_default();
    for fallback in fallbacks {
        let candidate = PathBuf::from(&home).join(fallback);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err(format!("{program} not found — set its path in Settings"))
}

/// What a caller may ask about a provider. An adapter asks `Agent::can`, never
/// matches on an id: a user-defined CLI has an id no code in this binary has
/// ever seen, so an id match can only ever answer for the two built-ins.
#[derive(Clone, Copy, PartialEq)]
pub enum Capability {
    WorkflowAdapter,
    ResumeSession,
    SlashCommands,
}

/// Declared, never derived. A provider gets a capability when the code that
/// implements it exists — the display name and the id say nothing about what a
/// binary supports, and `codex-ish` in a user's name must not switch on a flow.
#[derive(Serialize, Deserialize, Clone, Copy, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Capabilities {
    pub workflow_adapter: bool,
    pub resume_session: bool,
    pub slash_commands: bool,
}

impl Capabilities {
    pub fn has(&self, cap: Capability) -> bool {
        match cap {
            Capability::WorkflowAdapter => self.workflow_adapter,
            Capability::ResumeSession => self.resume_session,
            Capability::SlashCommands => self.slash_commands,
        }
    }
}

/// Where a definition comes from, and therefore what the user may edit: a
/// built-in owns its name, args and capabilities and accepts only a path
/// override, while a user-defined CLI is editable in full because nothing in
/// the binary knows anything about it.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ConfigScope {
    BuiltIn,
    User,
}

#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AgentStatus {
    Ready,
    NeedsAttention,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub name: String,
    /// The resolved absolute path, or None when discovery failed. None is a
    /// reportable state, not a reason to drop the row: a provider the user has
    /// not installed yet must still be listed, nameable and fixable.
    pub program: Option<String>,
    /// argv after the program, never one joined command line. A provider
    /// installed at `/Users/me/My Tools/codex` has to launch, and anything that
    /// re-split a joined string on spaces would try to exec `/Users/me/My`.
    pub args: Vec<String>,
    pub capabilities: Capabilities,
    pub scope: ConfigScope,
    pub status: AgentStatus,
    /// Why the status is needsAttention, in the resolver's own words, so the UI
    /// can say which path was tried instead of "not found".
    pub detail: Option<String>,
}

impl Agent {
    pub fn can(&self, cap: Capability) -> bool {
        self.capabilities.has(cap)
    }
}

/// The persisted half of the registry. Built-in definitions are not stored:
/// writing a name or a capability to disk would let an old studio.json outrank
/// the running code about what a provider can do, the reason ProjectView and
/// ExperienceView are recomputed too (projects.rs:12-15).
///
/// camelCase while the parent StudioConfig is snake_case — the deliberate
/// split PanelState carries, for the reason recorded at projects.rs:54-58.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ProviderState {
    /// Path overrides keyed by agent id. A built-in therefore takes a path from
    /// the user without being able to take anything else.
    pub overrides: HashMap<String, String>,
    pub custom: Vec<CustomCli>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CustomCli {
    pub id: String,
    pub name: String,
    /// A path, held as one — never a command line. PathBuf rather than String
    /// so there is no type in this path that invites being split on spaces:
    /// `/Users/me/My Tools/codex` is one program, and the argv that follows it
    /// lives in `args` below. A bare `aider` is still allowed and is resolved
    /// on PATH exactly as a built-in's program name is.
    pub program: PathBuf,
    /// argv after the program, each element already separated by whoever added
    /// the CLI. Stored apart from `program` so nothing ever has to guess where
    /// one ends and the other begins.
    #[serde(default)]
    pub args: Vec<String>,
    /// Declared when the CLI is added, defaulting to none. An unknown binary
    /// has earned nothing, so the flow bar offers it no stage until someone
    /// says it adapts.
    #[serde(default)]
    pub capabilities: Capabilities,
}

struct BuiltIn {
    id: &'static str,
    name: &'static str,
    program: &'static str,
    args: &'static [&'static str],
    fallbacks: &'static [&'static str],
    capabilities: Capabilities,
}

const BUILT_INS: [BuiltIn; 2] = [
    BuiltIn {
        id: CLAUDE_CODE_ID,
        name: "Claude Code",
        program: "claude",
        // Bare, because the five-stage flow is driven by /ec-* commands typed
        // into the TUI; a launch flag here would apply to every session.
        args: &[],
        fallbacks: &CLAUDE_FALLBACKS,
        capabilities: Capabilities {
            workflow_adapter: true,
            resume_session: true,
            slash_commands: true,
        },
    },
    BuiltIn {
        id: CODEX_ID,
        name: "Codex",
        program: "codex",
        args: &[],
        fallbacks: &CODEX_FALLBACKS,
        // Built in as a provider, declaring nothing yet: no adapter in this
        // tree drives the flow through codex, and a capability is declared when
        // its adapter lands, never in advance of one. Spelled out rather than
        // Capabilities::default(), which is not callable in a const.
        capabilities: Capabilities {
            workflow_adapter: false,
            resume_session: false,
            slash_commands: false,
        },
    },
];

/// Every configured provider, built-in first, with the unresolvable ones kept
/// in place and flagged. A missing binary is one row that needs attention — it
/// must not shorten the list, and it must not stop the user opening a session
/// with a provider that is installed.
pub fn registry(state: &ProviderState) -> Vec<Agent> {
    BUILT_INS
        .iter()
        .map(|b| built_in_agent(b, state.overrides.get(b.id).map(String::as_str)))
        .chain(state.custom.iter().map(custom_agent))
        .collect()
}

fn built_in_agent(b: &BuiltIn, override_path: Option<&str>) -> Agent {
    let resolved = resolve(b.program, override_path, b.fallbacks);
    Agent {
        id: b.id.to_string(),
        name: b.name.to_string(),
        args: b.args.iter().map(|a| a.to_string()).collect(),
        capabilities: b.capabilities,
        scope: ConfigScope::BuiltIn,
        ..from_resolution(resolved)
    }
}

fn custom_agent(cli: &CustomCli) -> Agent {
    let resolved = resolve_custom(&cli.program);
    Agent {
        id: cli.id.clone(),
        name: cli.name.clone(),
        args: cli.args.clone(),
        capabilities: cli.capabilities,
        scope: ConfigScope::User,
        ..from_resolution(resolved)
    }
}

/// The user's login shell, resolved the way shell_env.rs:10 asks for it:
/// `$SHELL`, falling back to `/bin/zsh`.
///
/// Each candidate is checked for being a file rather than taken on trust,
/// because the value goes straight to `CommandBuilder` next: a `$SHELL` left
/// pointing at a shell that has since been uninstalled would otherwise fail
/// inside `pty::spawn`, after the tab has opened, where the only thing left to
/// show the user is a dead black rectangle. Checked here, it is a sentence.
///
/// Not routed through `resolve` above: that resolver searches the login
/// shell's PATH for a program NAME, and asking the login shell where the login
/// shell is would be circular — `$SHELL` is already an absolute path.
fn resolve_shell() -> Result<PathBuf, String> {
    const DEFAULT_SHELL: &str = "/bin/zsh";
    let from_env = std::env::var("SHELL").unwrap_or_default();
    for candidate in [from_env.as_str(), DEFAULT_SHELL] {
        if candidate.is_empty() {
            continue;
        }
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Ok(path);
        }
    }
    Err(format!(
        "no shell found — $SHELL is {from_env:?} and {DEFAULT_SHELL} is not a file"
    ))
}

/// The terminal's launch definition. Returned as an `Agent` only because that
/// is the shape `pty_start` already launches — a program, an argv, and the
/// resolver's own words when the lookup failed — and NOT because a terminal is
/// one: nothing adds this to `registry`, so no caller that asks for the
/// providers can receive it (see SHELL_ID).
///
/// No args. A login shell under a PTY is interactive by virtue of the PTY, and
/// a flag added here would apply to every terminal the user ever opens.
///
/// Declares NO capability, which is what keeps it out of the flow: the flow bar
/// asks `Agent::can` (agents.rs Capability) and gets false for every stage,
/// without anything having to match on this id.
///
/// Resolved per call rather than cached, for the reason recorded on `agents`
/// below: a user who changes their login shell gets the new one on the next
/// terminal, not on the next relaunch.
pub fn shell_agent() -> Agent {
    Agent {
        id: SHELL_ID.to_string(),
        name: "Terminal".to_string(),
        args: Vec::new(),
        capabilities: Capabilities::default(),
        scope: ConfigScope::BuiltIn,
        ..from_resolution(resolve_shell())
    }
}

/// One lookup for every user-defined CLI, so the add-time check and the
/// open-time resolution can never disagree about what a stored program means.
/// A value holding a separator is the path it is; a bare name is looked up on
/// the login shell's PATH exactly as a built-in's program name is.
fn resolve_custom(program: &Path) -> Result<PathBuf, String> {
    let program = program.to_string_lossy();
    let override_path = program.contains('/').then_some(program.as_ref());
    resolve(&program, override_path, &[])
}

/// The gate on a user-typed program field: the CLI is stored only once its
/// program has been found as an existing file, which is what keeps an open from
/// being the first place a typo is reported.
///
/// Whitespace is NOT a signal on its own, and the order here is the whole
/// point. `/Users/me/My Tools/codex` is looked up first and launches, because
/// the field holds one program however many spaces it contains. Only once the
/// lookup has failed is whitespace reported as the likely cause — and even then
/// the value is quoted back whole, with no claim about where the program ends.
/// Naming a head would be the split-on-space guess this exists to avoid: the
/// first space in that path falls inside it, so guessing would send the user
/// off to fix `/Users/me/My`.
pub fn validate_program(program: &str) -> Result<PathBuf, String> {
    let program = program.trim();
    if program.is_empty() {
        return Err("no program given — enter the path to a CLI, or its name if it is on PATH".into());
    }
    let resolved = resolve_custom(Path::new(program));
    if resolved.is_err() && program.split_whitespace().count() > 1 {
        return Err(format!(
            "`{program}` is not an executable file. This field takes one program, not a \
             command line: if it ends in arguments, leave only the program here and add \
             each argument separately. A path that merely contains spaces is fine."
        ));
    }
    resolved
}

/// The registry as it stands on disk: the persisted half, plus the single
/// `claude_override` studio.json has carried since before this registry
/// existed. Folded in here rather than at the call site so there is one answer
/// to what a provider's path is, and only when the override map has nothing of
/// its own to say — the map is the newer, per-provider record and outranks the
/// legacy field it will eventually replace.
pub fn persisted_state() -> ProviderState {
    let cfg = crate::projects::load();
    let mut state = cfg.providers;
    if let Some(path) = cfg.claude_override {
        state
            .overrides
            .entry(CLAUDE_CODE_ID.to_string())
            .or_insert(path);
    }
    state
}

/// Every provider as the UI should see it, resolved against what is actually
/// installed right now. Rows are recomputed per call, never cached: a binary
/// the user installs while the app is open must stop needing attention without
/// a relaunch.
#[tauri::command]
pub fn agents() -> Vec<Agent> {
    registry(&persisted_state())
}

/// Adds — or re-adds — a user-defined CLI, after its program has been found.
/// The id is derived from the program, so a second add of the same program is
/// the same CLI: the stored row is replaced rather than duplicated, which is
/// what lets this one call also serve editing a CLI's name, args or
/// capabilities. `args` arrive as argv and are stored as argv; nothing on this
/// path ever parses a command string.
#[tauri::command]
pub fn add_custom_cli(
    name: String,
    program: String,
    args: Vec<String>,
    capabilities: Option<Capabilities>,
) -> Result<Agent, String> {
    validate_program(&program)?;
    // The user's own spelling is stored, not the resolved path: a bare `aider`
    // must stay a name so a reinstall elsewhere on PATH is still found, and an
    // absolute path must stay exactly the file the user pointed at.
    let program = PathBuf::from(program.trim());
    let name = name.trim();
    let cli = CustomCli {
        id: custom_id(&program.to_string_lossy()),
        // Falls back to the file name rather than refusing: a CLI the user
        // never named is still better listed than rejected.
        name: if name.is_empty() {
            program
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| program.to_string_lossy().into_owned())
        } else {
            name.to_string()
        },
        program,
        args,
        capabilities: capabilities.unwrap_or_default(),
    };

    let mut cfg = crate::projects::load();
    cfg.providers.custom.retain(|c| c.id != cli.id);
    cfg.providers.custom.push(cli.clone());
    crate::projects::save(&cfg)?;
    Ok(custom_agent(&cli))
}

/// User-defined CLIs only. A built-in cannot be removed — the running code
/// defines it, so a row taken off disk would simply come back on the next read.
#[tauri::command]
pub fn remove_custom_cli(id: String) -> Result<(), String> {
    let mut cfg = crate::projects::load();
    // retain() makes an unknown id a no-op success, the contract
    // remove_project already has (projects.rs:174-175).
    cfg.providers.custom.retain(|c| c.id != id);
    crate::projects::save(&cfg)
}

/// Only the resolution-dependent fields; the caller fills the rest. Splitting
/// it this way is what keeps one definition of what a failed lookup means.
fn from_resolution(resolved: Result<PathBuf, String>) -> Agent {
    let (program, status, detail) = match resolved {
        Ok(path) => (
            Some(path.to_string_lossy().into_owned()),
            AgentStatus::Ready,
            None,
        ),
        Err(e) => (None, AgentStatus::NeedsAttention, Some(e)),
    };
    Agent {
        id: String::new(),
        name: String::new(),
        program,
        args: Vec::new(),
        capabilities: Capabilities::default(),
        scope: ConfigScope::User,
        status,
        detail,
    }
}

/// Derived from the program the way project_id is (projects.rs:97-99), so a
/// re-added CLI keeps its id across restarts without a uuid dependency.
pub fn custom_id(program: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    program.hash(&mut h);
    format!("cli-{:016x}", h.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real file at a path with a space, since is_file() is what the
    /// validation turns on. Kept under the OS temp dir and removed by the test.
    struct SpacedCli {
        root: PathBuf,
    }

    impl SpacedCli {
        fn new(tag: &str) -> Self {
            let root = std::env::temp_dir().join(format!("efficlaude-agents-{tag}"));
            let dir = root.join("My Tools");
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("codex"), b"#!/bin/sh\n").unwrap();
            SpacedCli { root }
        }

        fn program(&self) -> PathBuf {
            self.root.join("My Tools/codex")
        }
    }

    impl Drop for SpacedCli {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    /// The acceptance case: spaces in a program path are not a command line.
    #[test]
    fn a_program_path_with_spaces_validates() {
        let cli = SpacedCli::new("spaces");
        let typed = cli.program().to_string_lossy().into_owned();
        assert_eq!(validate_program(&typed).unwrap(), cli.program());
    }

    /// A whole command line must be refused with the problem named — never
    /// split on spaces into a guess at which half is the program.
    #[test]
    fn a_command_line_is_refused_by_name() {
        let cli = SpacedCli::new("cmdline");
        let typed = format!("{} --model gpt 5 exec", cli.program().to_string_lossy());
        let err = validate_program(&typed).expect_err("a command line is not a program");
        // The problem is named, and the value quoted back whole...
        assert!(err.contains("not a command line"), "{err}");
        assert!(err.contains(&typed), "{err}");
        // ...with no guess at which words are the program. The first space in
        // this value falls inside the path, so any head would be wrong.
        assert!(!err.contains("if you meant"), "{err}");
    }

    #[test]
    fn an_empty_program_is_refused() {
        assert!(validate_program("   ").is_err());
    }

    /// Program and argv are stored apart and stay apart, including an argument
    /// that itself contains a space.
    #[test]
    fn program_and_args_persist_separately() {
        let cli = SpacedCli::new("persist");
        let stored = CustomCli {
            id: custom_id(&cli.program().to_string_lossy()),
            name: "Codex".into(),
            program: cli.program(),
            args: vec!["--model".into(), "gpt 5".into(), "exec".into()],
            capabilities: Capabilities::default(),
        };

        let json = serde_json::to_string(&stored).unwrap();
        let back: CustomCli = serde_json::from_str(&json).unwrap();
        assert_eq!(back.program, cli.program());
        assert_eq!(back.args.len(), 3, "argv must not be re-split or joined");
        assert_eq!(back.args[1], "gpt 5");

        // And it is launchable: the registry resolves it to the file itself.
        let state = ProviderState {
            custom: vec![back],
            ..ProviderState::default()
        };
        let agent = registry(&state)
            .into_iter()
            .find(|a| a.scope == ConfigScope::User)
            .expect("a custom CLI must be listed");
        assert_eq!(agent.program.as_deref(), Some(cli.program().to_string_lossy().as_ref()));
        assert!(agent.status == AgentStatus::Ready);
        assert_eq!(agent.args, ["--model", "gpt 5", "exec"]);
    }

    /// DESIGN-SPEC.md §10: "Belum ada agent: terminal tetap bisa dipakai". The
    /// terminal has to have a program to launch with NOTHING configured — no
    /// override, no custom CLI, and whether or not either built-in is
    /// installed.
    #[test]
    fn the_terminal_resolves_with_no_provider_configured_at_all() {
        let agent = shell_agent();
        let program = agent
            .program
            .as_deref()
            .unwrap_or_else(|| panic!("the terminal must resolve: {:?}", agent.detail));
        assert!(
            Path::new(program).is_file(),
            "a program that is not a file would fail inside pty::spawn instead: {program}"
        );
        assert!(agent.status == AgentStatus::Ready);
        assert!(agent.detail.is_none());
        // No args: the PTY is what makes it interactive, not a flag.
        assert!(agent.args.is_empty());
    }

    /// The other half of the decision recorded on SHELL_ID: the terminal is a
    /// facility, so nothing that asks for the PROVIDERS may be handed it. This
    /// is the test that fails if the shell is ever moved into BUILT_INS, where
    /// it would be offered as an agent in AddToolMenu and in Settings.
    #[test]
    fn the_terminal_is_not_a_provider_in_the_registry() {
        let rows = registry(&ProviderState::default());
        assert!(
            !rows.iter().any(|a| a.id == SHELL_ID),
            "the terminal must not be listed among the providers"
        );
        assert!(
            !rows.iter().any(|a| a.name == "Terminal"),
            "nor under its display name"
        );
    }

    /// It declares nothing, so the flow bar offers it no stage — and that falls
    /// out of `can`, with nothing matching on its id.
    #[test]
    fn the_terminal_declares_no_workflow_capability() {
        let shell = shell_agent();
        for cap in [
            Capability::WorkflowAdapter,
            Capability::ResumeSession,
            Capability::SlashCommands,
        ] {
            assert!(!shell.can(cap), "a terminal adapts no workflow stage");
        }
    }

    /// A custom CLI that is not installed is still listed, flagged rather than
    /// dropped, and says which path was tried.
    #[test]
    fn a_missing_custom_cli_is_listed_and_flagged() {
        let state = ProviderState {
            custom: vec![CustomCli {
                id: "cli-x".into(),
                name: "Gone".into(),
                program: PathBuf::from("/nonexistent/dir/gone"),
                args: Vec::new(),
                capabilities: Capabilities::default(),
            }],
            ..ProviderState::default()
        };
        let agent = registry(&state)
            .into_iter()
            .find(|a| a.id == "cli-x")
            .expect("an unresolvable CLI must still be listed");
        assert!(agent.program.is_none());
        assert!(agent.status == AgentStatus::NeedsAttention);
        assert!(agent.detail.unwrap().contains("/nonexistent/dir/gone"));
    }
}
