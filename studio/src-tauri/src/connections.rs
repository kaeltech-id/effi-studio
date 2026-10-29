use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// What this module is, and the two rules its shape exists to encode
//
// DESIGN-SPEC.md:119-131 ("Connections dan MCP"). Two sentences there decide
// every type below.
//
// 1. "`Connected to Effi` tidak sama dengan `Available to Codex`." A connection
//    does not have A status. It has one status PER CONSUMER, each one produced
//    by that consumer's own adapter asking its own question. A single
//    `connected: bool` would make the difference unrepresentable, so there is
//    no boolean anywhere in this file that means connected — the wire carries
//    `PerConsumer<ConnectionStatus>`, and `consumer_status` below is the only
//    function that may produce a cell of it.
//
// 2. "GitHub/Figma ... merupakan Planned bila belum ada adapter nyata; jangan
//    membuat tombol Configure yang tidak bekerja." A catalogue entry is not a
//    capability. `planned` means no implementation exists, and `configure`
//    refuses a planned connector outright, so there is no path by which a
//    Configure button for one could do anything.
//
// `connected` means A CHECK PASSED. It never means a field was filled: a record
// with a credential reference and an explicit Connect behind it reports
// `configured` until an adapter reports a pass, and the pass is not written to
// disk (see `ConnectionRecord::last_check`), so it cannot be read back next
// launch as a claim about a server nobody has spoken to this session.
//
// Nothing here performs I/O. There is no `std::fs`, no `std::process` and no
// network client in this file: the adapters that do the asking arrive through
// the `ConsumerAdapter` trait, and this module's whole job is to decide what
// their answers are allowed to mean. That is still true now that a real adapter
// has shipped — `jira::JiraReader` lives in jira.rs and is named here in one
// line of `installed_adapters`, which is a type reference and not a request.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Secrets
//
// No token, password or key may reach this module, and the way that is enforced
// is that there is nowhere to put one. `CredentialRef` names a secret; it has no
// field that could hold its value, so no caller can pass one, no `save` can
// write one to studio.json, no `safe_summary` can print one into a config
// preview or a screenshot, and no fixture in the tests below can contain one.
// `a_token_in_a_hand_edited_config_never_survives` proves the drop.
//
// That store has landed, in keychain.rs: `SecretStore` is keyed on exactly the
// `(service, account)` pair held here and offers put / contains / forget /
// with_secret — nothing that enumerates values, and still nothing that RETURNS
// one. `with_secret` arrived with the first adapter, which is the caller that
// comment said a read was waiting for; it lends the value to a closure and
// drops it, so the invariant it was deferred to protect is unchanged. This
// module still hands over a `CredentialRef` and nothing else, and performs no
// I/O itself; jira.rs is where a reference and a value meet, and lib.rs is
// where the commands live.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Two things this module deliberately cannot do
//
// WRITING ANOTHER AGENT'S CONFIG. Binding a connection to Claude Code or Codex
// ultimately means editing a file this app does not own, which DESIGN-SPEC.md:129
// says needs a change preview, a stated scope and an explicit Apply. That is a
// separate task. Until it lands, no adapter is registered for those two
// consumers — `installed_adapters` returns the Effi adapter only — so their
// cells read `unsupportedByAgent`, which is the honest answer and is not a
// failure.
//
// JIRA MUTATION. DESIGN-SPEC.md:131 scopes the first phase to read-only issue
// browsing: no issue creation, no commenting, no status transitions. `JiraAccess`
// has one variant for the same reason `CredentialKind` has one — a request this
// module has no word for cannot be made. The adapter in jira.rs holds that line
// the same way: the single Jira path it can name is a `match` on `JiraAccess`,
// so a write would have to begin by adding a variant here.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PERSISTENCE — one line is owed by another task, and it is not this one.
//
// `projects::load()`/`save()` is the only persistence mechanism in this app; a
// second config file is not an option. `ConnectionState` below is therefore
// shaped to be embedded in `StudioConfig` exactly as `tabs::WorkbenchTabs` and
// `agents::ProviderState` already are:
//
//     /// Connections and their per-consumer bindings. Credential REFERENCES
//     /// only — projects.rs never sees a secret (connections.rs:40-52).
//     #[serde(default)]
//     pub connections: crate::connections::ConnectionState,
//
// and the two accessors that go with it:
//
//     pub fn persisted_state() -> ConnectionState { crate::projects::load().connections }
//     pub fn persist(state: ConnectionState) -> Result<(), String> {
//         let mut cfg = crate::projects::load();
//         cfg.connections = state;
//         crate::projects::save(&cfg)
//     }
//
// The `#[serde(default)]` is not optional: `load()` turns one deserialisation
// failure into `StudioConfig::default()`, i.e. into an empty project list, so a
// field without it would cost every existing user every project they had added
// (projects.rs:60-66, and the test at projects.rs:214). `ConnectionState` derives
// `Default` and carries `#[serde(default)]` on its own field so that both halves
// of that contract are already satisfied when the field is added.
//
// It is NOT added here on purpose: editing projects.rs from this task is what
// produced a compile cycle twice already in this run. Everything below operates
// on a `&ConnectionState` / `&mut ConnectionState` the caller owns, which is also
// what makes the whole module testable without touching the user's real file.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Wire contract — mirrors src/lib/types.ts:150-171 exactly.
//
// `rename_all = "camelCase"` on an enum renames its VARIANTS, so
// `NotConfigured` serialises as `notConfigured` and `UnsupportedByAgent` as
// `unsupportedByAgent`. `every_status_name_matches_the_wire_contract` and
// `connector_names_match_the_wire_contract` assert the serialised bytes rather
// than trusting that, which is also why `Github` is spelled with a lowercase `h`
// — `GitHub` would camelCase to `gitHub` and the frontend union says `github`.
// ---------------------------------------------------------------------------

/// `unsupportedByAgent` is not a kind of `failed`: a consumer with no adapter
/// never attempted anything, so nothing about it broke, and the repair is
/// shipping code rather than anything the user can do. `disabled` is likewise a
/// choice and not an error.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionStatus {
    NotConfigured,
    Configured,
    Checking,
    Connected,
    NeedsAuthentication,
    Failed,
    Disabled,
    UnsupportedByAgent,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Connector {
    Jira,
    CustomMcp,
    Github,
    Figma,
}

/// Who might use a connection. `Effi` is this application itself; the other two
/// are separate programs with their own config and their own idea of what they
/// can reach, which is the whole reason this is three values and not a flag.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Consumer {
    Effi,
    Claude,
    Codex,
}

/// Iteration order for the matrix, and the only list of consumers in the file.
pub const CONSUMERS: [Consumer; 3] = [Consumer::Effi, Consumer::Claude, Consumer::Codex];

impl Consumer {
    /// The provider in the agent registry this consumer speaks for, or `None`
    /// for Effi, which is this binary. Reusing `agents`' ids rather than
    /// restating the strings is what keeps "bind to Codex" and "launch Codex"
    /// talking about the same program — and it is also where the cost shows:
    /// a consumer with a provider id is one whose config this app would have to
    /// write, which is the reviewed-Apply task, not this one.
    pub fn provider_id(self) -> Option<&'static str> {
        match self {
            Consumer::Effi => None,
            Consumer::Claude => Some(crate::agents::CLAUDE_CODE_ID),
            Consumer::Codex => Some(crate::agents::CODEX_ID),
        }
    }
}

/// One value per consumer, with no way to express fewer than three. This is the
/// type that makes rule 1 structural: `Record<Consumer, ConnectionStatus>` on
/// the wire, and in Rust a struct rather than a `HashMap` so that a cell cannot
/// simply be absent — a missing key would be read by the UI as "no answer", and
/// every consumer always has an answer, even if it is `unsupportedByAgent`.
///
/// Generic because the same three-slot shape carries three different things —
/// the statuses on the wire, the user's bindings, and the last check — and one
/// `get`/`set` pair for all of them is one place for the consumer-to-field
/// mapping to be right.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PerConsumer<T> {
    pub effi: T,
    pub claude: T,
    pub codex: T,
}

impl<T> PerConsumer<T> {
    pub fn get(&self, consumer: Consumer) -> &T {
        match consumer {
            Consumer::Effi => &self.effi,
            Consumer::Claude => &self.claude,
            Consumer::Codex => &self.codex,
        }
    }

    /// Writes exactly one slot. There is no setter that takes a value without
    /// naming a consumer, so no call site can write one answer into three.
    pub fn set(&mut self, consumer: Consumer, value: T) {
        match consumer {
            Consumer::Effi => self.effi = value,
            Consumer::Claude => self.claude = value,
            Consumer::Codex => self.codex = value,
        }
    }

    /// Builds a matrix by asking the same question once per consumer. Each
    /// slot is computed from its own consumer and nothing else — the closure
    /// receives the consumer, never the other slots' answers.
    pub fn build(mut f: impl FnMut(Consumer) -> T) -> Self {
        PerConsumer {
            effi: f(Consumer::Effi),
            claude: f(Consumer::Claude),
            codex: f(Consumer::Codex),
        }
    }
}

/// A global account connection, a set of project bindings, or both.
///
/// `global` means the connection is available to every project. `project_ids`
/// are the explicit bindings that apply when it is not. `applies_to` is the one
/// place the two are combined, so no caller has to decide what the pair means.
///
/// Both the stored shape and the wire shape: every field is something the user
/// chose, so unlike `ProjectView` (projects.rs:12-15) there is nothing here to
/// recompute on read.
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ConnectionScope {
    pub global: bool,
    pub project_ids: Vec<String>,
}

impl ConnectionScope {
    pub fn applies_to(&self, project_id: &str) -> bool {
        self.global || self.project_ids.iter().any(|p| p == project_id)
    }

    /// Idempotent, so a double-click on Bind does not list a project twice —
    /// "retry tidak menggandakan konfigurasi" (DESIGN-SPEC.md:147) applies to
    /// bindings as much as to the connection itself.
    pub fn bind_project(&mut self, project_id: &str) {
        if !self.project_ids.iter().any(|p| p == project_id) {
            self.project_ids.push(project_id.to_string());
        }
    }

    pub fn unbind_project(&mut self, project_id: &str) {
        self.project_ids.retain(|p| p != project_id);
    }
}

/// Exactly the five fields of `Connection` in src/lib/types.ts:160-171, and
/// deliberately no more. The endpoint, the transport label and the credential
/// reference belong to the detail view, which is `ConnectionDetail` below —
/// a separate shape because this one is sent for every row of the surface,
/// including the catalogue rows that have no stored record behind them at all.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub connector: Connector,
    pub planned: bool,
    pub scope: ConnectionScope,
    pub consumers: PerConsumer<ConnectionStatus>,
}

// ---------------------------------------------------------------------------
// Credentials — a reference, never a value
// ---------------------------------------------------------------------------

/// The only kind of secret this module can name. One variant, for the reason
/// `ExperienceState` has one field (experiences.rs:25-28): with no `OAuth`
/// variant to deserialise into, no stored connection can claim an OAuth flow and
/// no configure form can offer one. DESIGN-SPEC.md:127 is explicit — "jangan
/// menjanjikan OAuth bila aplikasi/provider belum disiapkan" — and no OAuth app
/// registration exists for this product, so adding the variant is a task that
/// starts by verifying one does.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum CredentialKind {
    ApiToken,
}

/// Where the secret lives, not what it is.
///
/// `service` and `account` are the keychain coordinates and nothing else: this
/// struct has no third field, so `serde_json::to_string` of a whole
/// `ConnectionState` cannot emit a secret, which is what makes studio.json,
/// logs, a raw config preview and a screenshot safe by construction rather than
/// by remembering to redact.
///
/// `account` is a stable identifier the user already knows — an Atlassian
/// account email, an MCP server label — because it is shown in the UI as "which
/// credential is this". Never a secret, and never derived from one.
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CredentialRef {
    pub service: String,
    pub account: String,
    pub kind: CredentialKind,
}

impl CredentialRef {
    pub fn new(
        service: impl Into<String>,
        account: impl Into<String>,
        kind: CredentialKind,
    ) -> Self {
        CredentialRef {
            service: service.into(),
            account: account.into(),
            kind,
        }
    }
}

/// What a Jira adapter is allowed to do in this phase, with one variant so that
/// nothing else can be asked for. Read-only issue context only: no issue
/// creation, no commenting, no status transitions (DESIGN-SPEC.md:131).
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum JiraAccess {
    ReadOnly,
}

/// Stated as a constant rather than left to each adapter to decide, so the
/// permission is one fact in one place.
pub const JIRA_ACCESS: JiraAccess = JiraAccess::ReadOnly;

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

pub struct ConnectorInfo {
    pub connector: Connector,
    pub name: &'static str,
    /// No implementation exists. A planned connector offers no Configure action
    /// and `configure` refuses it, so the catalogue row is a row and not a
    /// half-working feature.
    pub planned: bool,
    /// Which credential kinds this connector's form may ask for. Empty is a
    /// legitimate answer and means "nothing to ask for yet", not "no auth".
    pub credentials: &'static [CredentialKind],
    /// Whether the connector needs a reachable endpoint from the user. The
    /// concrete MCP transport set is UNVERIFIED in this tree (see
    /// `ConnectionRecord::transport`), so this says only that a value is wanted,
    /// never what protocol it speaks.
    pub needs_endpoint: bool,
}

/// DESIGN-SPEC.md:125 — "Scope adapter awal adalah Jira dan custom MCP",
/// GitHub and Figma are Planned. Declared, never derived from an id: a
/// connector is configurable because the code to configure it exists, and the
/// name `github` says nothing about that.
pub const CATALOGUE: [ConnectorInfo; 4] = [
    ConnectorInfo {
        connector: Connector::Jira,
        name: "Jira",
        planned: false,
        // An Atlassian API token, held by the keychain. DESIGN-SPEC.md:123 is
        // explicit that a Jira connector may be a native API client OR an MCP
        // adapter and that not every Jira connector is MCP, so nothing here
        // commits to which — that is the adapter's business.
        credentials: &[CredentialKind::ApiToken],
        needs_endpoint: true,
    },
    ConnectorInfo {
        connector: Connector::CustomMcp,
        name: "Custom MCP",
        planned: false,
        credentials: &[CredentialKind::ApiToken],
        needs_endpoint: true,
    },
    ConnectorInfo {
        connector: Connector::Github,
        name: "GitHub",
        planned: true,
        credentials: &[],
        needs_endpoint: false,
    },
    ConnectorInfo {
        connector: Connector::Figma,
        name: "Figma",
        planned: true,
        credentials: &[],
        needs_endpoint: false,
    },
];

pub fn info(connector: Connector) -> &'static ConnectorInfo {
    CATALOGUE
        .iter()
        .find(|c| c.connector == connector)
        .expect("CATALOGUE covers every Connector variant")
}

/// The catalogue row's own id, used when a connector has no configured
/// connection yet. A word, where a configured connection's id is sixteen hex
/// characters, so the two can never collide.
pub fn connector_id(connector: Connector) -> &'static str {
    match connector {
        Connector::Jira => "jira",
        Connector::CustomMcp => "customMcp",
        Connector::Github => "github",
        Connector::Figma => "figma",
    }
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/// What one adapter reported. Separate from `ConnectionStatus` because an
/// adapter answers a question about itself and does not get to name a UI state:
/// there is no `Connected` here to return and no `Disabled` either, so an
/// adapter cannot report a status the user chose or one that belongs to a
/// different consumer.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CheckOutcome {
    Passed,
    NeedsAuthentication,
    Failed,
}

/// An outcome plus the words to show for it.
///
/// `detail` is for the user and must never contain a credential — this module
/// cannot supply one (it holds no secret), and an adapter that puts a token in
/// an error string is the bug DESIGN-SPEC.md:147 names: "error relevan tanpa
/// credential".
#[derive(Clone, Debug)]
pub struct CheckReport {
    pub outcome: CheckOutcome,
    pub detail: Option<String>,
}

impl CheckReport {
    pub fn passed() -> Self {
        CheckReport {
            outcome: CheckOutcome::Passed,
            detail: None,
        }
    }
}

/// One adapter answers for one consumer against one connector, and the pair is
/// part of its identity: an adapter that could answer for "a connection" would
/// be exactly the single-status conflation this module exists to prevent.
///
/// `check` is read-only by contract. It resolves the credential behind
/// `conn.credential` through the keychain, asks whether that consumer can reach
/// the thing, and reports. It may not create, modify or transition anything at
/// the far end, and it may not write another program's config file — that path
/// needs a reviewed preview and an explicit Apply and is a separate task.
pub trait ConsumerAdapter {
    fn consumer(&self) -> Consumer;
    fn connector(&self) -> Connector;
    fn check(&self, conn: &ConnectionRecord) -> CheckReport;
}

/// Exactly the adapters that have code behind them, and nothing else. One entry
/// in this build.
///
/// JIRA FOR EFFI exists: `jira::JiraReader` resolves the stored credential
/// through the keychain and makes one documented read-only Atlassian request.
/// Registering it is what moves that one cell off `unsupportedByAgent`, and it
/// is registered because it works — the list is the claim, so it must never
/// contain anything whose absence of implementation is the real answer.
///
/// EVERYTHING ELSE IS STILL ABSENT, and each for its own stated reason:
///   * Jira for Claude or Codex, and Custom MCP for them, mean writing another
///     program's config file. DESIGN-SPEC.md:129 requires a change preview, a
///     stated scope and an explicit Apply for that, and none of it is built, so
///     those cells read `unsupportedByAgent`;
///   * Custom MCP for Effi means this binary speaking an MCP transport, and it
///     speaks none. `ConnectionRecord::transport` records that the transport
///     set is UNVERIFIED here; mcp.rs can describe, validate and locate a
///     server, which is a real part of the job and is not the same as talking
///     to one. A cell claiming otherwise would be the Configure-button-that-
///     does-nothing of rule 2;
///   * GitHub and Figma are `planned`, and
///     `a_planned_connector_has_no_registered_adapter` below asserts that this
///     list and that flag can never disagree.
///
/// A consumer with no adapter has not FAILED at anything, and the user is shown
/// no retry for it, because there is nothing to retry.
pub fn installed_adapters() -> Vec<Box<dyn ConsumerAdapter>> {
    vec![Box::new(crate::jira::JiraReader::new())]
}

/// An adapter exists for a (connector, consumer) pair exactly when one is
/// registered. Deliberately not a declared table beside the catalogue: two
/// sources for "can this work" is how a cell ends up claiming support for code
/// that was never written.
pub fn has_adapter(
    adapters: &[&dyn ConsumerAdapter],
    connector: Connector,
    consumer: Consumer,
) -> bool {
    adapters
        .iter()
        .any(|a| a.connector() == connector && a.consumer() == consumer)
}

pub fn adapter_for<'a>(
    adapters: &'a [&'a dyn ConsumerAdapter],
    connector: Connector,
    consumer: Consumer,
) -> Option<&'a dyn ConsumerAdapter> {
    adapters
        .iter()
        .copied()
        .find(|a| a.connector() == connector && a.consumer() == consumer)
}

// ---------------------------------------------------------------------------
// Stored state
// ---------------------------------------------------------------------------

/// The result of one check, kept in memory for the session.
#[derive(Clone, Debug)]
pub struct CheckRecord {
    pub outcome: CheckOutcome,
    pub detail: Option<String>,
    /// Seconds since the epoch, so "checked 2 minutes ago" is sayable without
    /// adding a date dependency to the crate.
    pub at_unix: u64,
}

/// One connection as it is stored.
///
/// camelCase while the parent `StudioConfig` is snake_case — the deliberate
/// split `PanelState` records at projects.rs:54-58, for the same reason: this
/// shape is read by the frontend's detail view, where the wire convention is
/// camelCase, while renaming the parent would stop it reading an older
/// studio.json.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRecord {
    pub id: String,
    pub connector: Connector,
    /// What the user called it. Shown everywhere the connection is named, and
    /// part of its id seed, so two Jira sites are two connections.
    pub label: String,
    pub scope: ConnectionScope,
    /// A site URL or MCP server address, as the user typed it. Not a secret:
    /// a URL is shown in the UI, and anything secret about reaching the server
    /// is behind `credential`.
    #[serde(default)]
    pub endpoint: Option<String>,
    /// A free-text label for the server transport, displayed because
    /// DESIGN-SPEC.md:121 asks the UI to show one — and a string rather than an
    /// enum on purpose. The same line says "Jangan hardcode dukungan
    /// transport/auth yang belum diverifikasi implementer", and the concrete MCP
    /// transport set is UNVERIFIED here: nothing in this tree speaks any of
    /// them, and I did not check the current MCP specification. An enum would
    /// read as this binary declaring which transports it supports. It does not
    /// support any; it stores what the user wrote and shows it back.
    #[serde(default)]
    pub transport: Option<String>,
    /// How a custom MCP server is started or reached: a program and its
    /// arguments, or a URL. `None` for every other connector, and refused by
    /// `configure` on one (mcp.rs holds the shape and the rules).
    ///
    /// Structured fields rather than a command line, which is the whole point:
    /// there is no variant of `McpLaunch` that holds a string to execute, so
    /// "configure an MCP server" cannot become "store a shell command and run
    /// it later". `#[serde(default)]` so a studio.json written before this
    /// field existed still loads.
    #[serde(default)]
    pub mcp_launch: Option<crate::mcp::McpLaunch>,
    /// A reference, never a value. `None` is `notConfigured`.
    #[serde(default)]
    pub credential: Option<CredentialRef>,
    /// Which consumers the user has turned on. Default off for all three: a
    /// credential the user entered for Effi must not become reachable by Codex
    /// because a default said so. DESIGN-SPEC.md:127 — "Jangan menyalin
    /// credential dari satu provider config ke provider lain tanpa explicit
    /// action."
    #[serde(default)]
    pub bindings: PerConsumer<bool>,
    /// The explicit Connect. Separate from `credential` because filling in a
    /// form is not connecting, and separate from `last_check` because asking is
    /// not succeeding. Nothing reports `connected` without all three.
    #[serde(default)]
    pub connect_requested: bool,
    /// In flight, per consumer. Never persisted: a `checking` read back from
    /// disk would be a claim about a request that died with the last process.
    #[serde(skip)]
    pub checking: PerConsumer<bool>,
    /// The last thing each adapter said, this session only.
    ///
    /// `#[serde(skip)]` is the enforcement of "connected means a check passed".
    /// Health is derived from a live conversation with another system, and a
    /// derived fact written to disk is read back stale — the reason `ProjectView`
    /// and `ExperienceView` are recomputed too (projects.rs:12-15). A pass
    /// stored last week would otherwise have a connection reporting `connected`
    /// at launch before anything had been asked. After a restart a configured
    /// connection reports `configured` until a check runs, which is the honest
    /// answer.
    #[serde(skip)]
    pub last_check: PerConsumer<Option<CheckRecord>>,
}

/// The embeddable field. Derives `Default` and defaults its own field so that
/// `#[serde(default)]` on the `StudioConfig` side is all that is needed.
#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct ConnectionState {
    pub items: Vec<ConnectionRecord>,
}

impl ConnectionState {
    pub fn find(&self, id: &str) -> Option<&ConnectionRecord> {
        self.items.iter().find(|r| r.id == id)
    }

    fn find_mut(&mut self, id: &str) -> Option<&mut ConnectionRecord> {
        self.items.iter_mut().find(|r| r.id == id)
    }

    fn require_mut(&mut self, id: &str) -> Result<&mut ConnectionRecord, String> {
        self.find_mut(id)
            .ok_or_else(|| format!("no connection with id {id}"))
    }

    /// Every connection that applies to a project, for the project's own
    /// Connections view.
    pub fn for_project(&self, project_id: &str) -> Vec<&ConnectionRecord> {
        self.items
            .iter()
            .filter(|r| r.scope.applies_to(project_id))
            .collect()
    }
}

/// Stable across restarts without a uuid dependency, derived the way
/// `project_id` is (projects.rs:112-118) — and from the connector and label
/// only. The credential is never part of the seed: an id that changed when a
/// token was rotated would silently orphan every project binding pointing at
/// it.
fn connection_id(connector: Connector, label: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    connector_id(connector).hash(&mut h);
    label.trim().hash(&mut h);
    format!("{:016x}", h.finish())
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// The flow: choose connector -> configure -> inspect scope -> explicit connect
//           -> check -> bind consumers
//
// One function per step, each refusing what the step before it has not done, so
// the order is enforced by the API rather than by the screen that happens to
// call it.
// ---------------------------------------------------------------------------

/// Step 2. What the configure form may send — and what it cannot: there is no
/// field here for a secret value, only for the reference to one, so the form
/// collects the token, hands it to the keychain, and sends the coordinates.
///
/// Structured fields rather than one blob, and DESIGN-SPEC.md:123 asks for
/// exactly that for custom MCP — "input terstruktur, bukan menjalankan
/// arbitrary shell saat form dibuka". Nothing in this request can be executed:
/// every field is stored and displayed, none is ever passed to a shell.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureRequest {
    pub connector: Connector,
    pub label: String,
    #[serde(default)]
    pub endpoint: Option<String>,
    #[serde(default)]
    pub transport: Option<String>,
    /// The custom MCP server's structured launch, validated by `mcp::validate`
    /// inside `configure` — so an invalid one is unstorable rather than merely
    /// undisplayed, and a connector that is not Custom MCP cannot carry one at
    /// all.
    #[serde(default)]
    pub mcp_launch: Option<crate::mcp::McpLaunch>,
    #[serde(default)]
    pub credential: Option<CredentialRef>,
    #[serde(default)]
    pub scope: ConnectionScope,
}

/// Step 2. Records a connection, or updates the one that already answers to the
/// same connector and label.
///
/// Returns the id. Configuring twice returns the same id and mutates one row —
/// "retry tidak menggandakan konfigurasi" (DESIGN-SPEC.md:147), the contract
/// `add_project` already keeps for folders (projects.rs:138-141).
///
/// A planned connector is refused here, which is rule 2 made structural: the UI
/// draws no Configure action for GitHub or Figma, and if it drew one anyway
/// there is still nothing behind it.
///
/// Note what this does NOT do: it does not set `connect_requested`, it does not
/// bind a consumer, and it records no health. A filled form is `configured`.
pub fn configure(state: &mut ConnectionState, req: ConfigureRequest) -> Result<String, String> {
    let entry = info(req.connector);
    if entry.planned {
        return Err(format!(
            "{} is a planned connector: no adapter for it exists in this build, so there is \
             nothing to configure yet.",
            entry.name
        ));
    }
    let label = req.label.trim();
    if label.is_empty() {
        return Err("give the connection a name".into());
    }
    // The MCP launch is validated HERE rather than at the form, so an invalid
    // one cannot be stored by any caller — and a launch on the wrong connector
    // is refused outright rather than kept as a field nothing reads.
    match (&req.mcp_launch, req.connector) {
        (Some(launch), Connector::CustomMcp) => {
            crate::mcp::validate(launch)?;
            // One destination, not two. The launch IS where a Custom MCP
            // server lives; `endpoint` is where a connector reached by address
            // lives (Jira). A record carrying both would have no single answer
            // to "where does this go", and `has_remote_party` below — which
            // decides whether a credential is demanded — would be guessing.
            if req
                .endpoint
                .as_deref()
                .is_some_and(|e| !e.trim().is_empty())
            {
                return Err(
                    "this connection has both a server address and a program to run. Keep one: \
                     an MCP server is either something this app starts or something it connects \
                     to, and storing both leaves it ambiguous which one is used."
                        .into(),
                );
            }
        }
        (Some(_), _) => {
            return Err(format!(
                "{} is not started by this app, so it has no program or server URL to configure",
                entry.name
            ));
        }
        (None, _) => {}
    }
    if let Some(cred) = &req.credential {
        if !entry.credentials.contains(&cred.kind) {
            return Err(format!(
                "{} does not take that kind of credential",
                entry.name
            ));
        }
        if cred.service.trim().is_empty() || cred.account.trim().is_empty() {
            return Err("the credential reference needs both a service and an account".into());
        }
    }

    let id = connection_id(req.connector, label);
    if let Some(existing) = state.find_mut(&id) {
        existing.label = label.to_string();
        existing.endpoint = req.endpoint;
        existing.transport = req.transport;
        existing.scope = req.scope;
        // A changed credential reference or a changed launch invalidates every
        // consumer's health and the explicit Connect with it: the thing that
        // was checked is not the thing that is stored now. The launch counts
        // for exactly the same reason the credential does — a pass earned
        // against one program says nothing about another.
        if existing.credential != req.credential || existing.mcp_launch != req.mcp_launch {
            existing.credential = req.credential;
            existing.mcp_launch = req.mcp_launch;
            existing.connect_requested = false;
            existing.checking = PerConsumer::default();
            existing.last_check = PerConsumer::default();
        }
        return Ok(id);
    }

    state.items.push(ConnectionRecord {
        id: id.clone(),
        connector: req.connector,
        label: label.to_string(),
        scope: req.scope,
        endpoint: req.endpoint,
        transport: req.transport,
        mcp_launch: req.mcp_launch,
        credential: req.credential,
        bindings: PerConsumer::default(),
        connect_requested: false,
        checking: PerConsumer::default(),
        last_check: PerConsumer::default(),
    });
    Ok(id)
}

/// Step 3. The scope the user inspects and edits before connecting. A separate
/// call from `configure` because DESIGN-SPEC.md:127 puts "inspect
/// permissions/scope" between filling the form and connecting: a scope that
/// arrived with the credential would never be looked at.
pub fn set_scope(
    state: &mut ConnectionState,
    id: &str,
    scope: ConnectionScope,
) -> Result<(), String> {
    let rec = state.require_mut(id)?;
    rec.scope = scope;
    rec.scope.project_ids.dedup();
    Ok(())
}

/// Step 4. The explicit Connect.
///
/// Sets an intent and nothing more: it records no status, contacts nothing, and
/// leaves every consumer cell `configured` at best. Connecting without a
/// credential reference is refused rather than queued, so the error names the
/// missing step instead of surfacing later as an unexplained failure.
///
/// `needs_endpoint` is enforced here rather than in `configure`, because a
/// half-filled form is a legitimate thing to save and an unreachable Connect is
/// not. A connector that needs an address is satisfied by an MCP launch too: a
/// stdio server is a local program and has no address at all, which is why the
/// test is "is there somewhere to go" rather than "is the endpoint field set".
///
/// The credential gate is conditioned on there BEING someone to authenticate to
/// — see `has_remote_party`. Demanding a token for a pipe to a local process is
/// refusing for a reason that does not apply, and a refusal the user cannot
/// satisfy is the same dead end as a Configure button that does nothing.
pub fn request_connect(state: &mut ConnectionState, id: &str) -> Result<(), String> {
    let rec = state.require_mut(id)?;
    let entry = info(rec.connector);
    // The destination is asked for FIRST, and the order is not arbitrary. A
    // record with nothing filled in fails both gates, and "there is nowhere to
    // connect to" is the more useful of the two sentences — it is also the
    // question `has_remote_party` needs answered before it means anything,
    // since whether there is someone to authenticate to depends on where this
    // goes.
    let has_destination = rec
        .endpoint
        .as_deref()
        .is_some_and(|e| !e.trim().is_empty())
        || rec.mcp_launch.is_some();
    if entry.needs_endpoint && !has_destination {
        return Err(format!(
            "`{}` has nowhere to connect to yet — give {} a server address, or a program to run.",
            rec.label, entry.name
        ));
    }
    if rec.credential.is_none() && !entry.credentials.is_empty() && has_remote_party(rec) {
        return Err("configure a credential before connecting".into());
    }
    rec.connect_requested = true;
    Ok(())
}

/// Is there a far end for a credential to be presented to?
///
/// `false` for exactly one thing: a Custom MCP server launched as a local
/// program. That server is a process on this machine spoken to over a pipe, so
/// there is no remote party a token could be sent to and nothing a credential
/// would authenticate against. `true` for everything else — a Jira site, a
/// remote MCP URL, a connection with only an address — because all of them are
/// a conversation with someone else.
///
/// WHY THIS IS NARROW ON PURPOSE. It is the one exemption from the credential
/// gate in `request_connect`, so its reach is what decides whether that gate
/// still means anything. Three separate facts keep it from spreading:
///
///   * it is granted only by `McpLaunch::Stdio`, which `configure` accepts only
///     for `Connector::CustomMcp` and only after `mcp::validate` — a launch on
///     any other connector is refused outright, so a Jira connection can never
///     reach this branch no matter what is written into studio.json;
///   * `McpLaunch::Remote` does NOT get it. A server reached over https has a
///     far end, and that is the case where a token actually matters;
///   * a record may not hold both a launch and an endpoint (`configure`
///     refuses the pair), so "local program" is never also "remote address".
///
/// It exempts the credential gate and nothing else: the destination gate below
/// it still applies, `connected` still means a check passed, and no consumer
/// becomes bindable that was not bindable before.
fn has_remote_party(rec: &ConnectionRecord) -> bool {
    !matches!(rec.mcp_launch, Some(crate::mcp::McpLaunch::Stdio { .. }))
}

/// Step 5a. Marks one consumer's check as in flight.
///
/// Refuses a consumer with no adapter: there is no request to start, and
/// `checking` is a claim that one is running. Already-checking is a no-op
/// success rather than an error — a second click must not start a second
/// request, and must not report a problem either.
pub fn begin_check(
    state: &mut ConnectionState,
    id: &str,
    consumer: Consumer,
    adapters: &[&dyn ConsumerAdapter],
) -> Result<(), String> {
    let rec = state.require_mut(id)?;
    if !has_adapter(adapters, rec.connector, consumer) {
        return Err(unsupported_message(rec.connector, consumer));
    }
    rec.checking.set(consumer, true);
    Ok(())
}

/// Step 5b. Records what ONE adapter said about ONE consumer.
///
/// The signature is the second half of rule 1. A report cannot be filed without
/// naming the consumer it is about, `PerConsumer::set` writes exactly that slot,
/// and no branch here reads or touches another consumer's cell — so an adapter
/// reporting a pass for Effi cannot move Codex, and a caller holding one report
/// has no way to apply it to three.
///
/// Refusing a consumer with no adapter is what stops a `Passed` being fabricated
/// for one: with no adapter there is no one who could have produced the report,
/// and `consumer_status` would ignore it anyway.
pub fn record_check(
    state: &mut ConnectionState,
    id: &str,
    consumer: Consumer,
    report: CheckReport,
    adapters: &[&dyn ConsumerAdapter],
) -> Result<(), String> {
    let rec = state.require_mut(id)?;
    if !has_adapter(adapters, rec.connector, consumer) {
        return Err(unsupported_message(rec.connector, consumer));
    }
    rec.checking.set(consumer, false);
    rec.last_check.set(
        consumer,
        Some(CheckRecord {
            outcome: report.outcome,
            detail: report.detail,
            at_unix: now_unix(),
        }),
    );
    Ok(())
}

/// Step 5, run through the registered adapter for one consumer. The single place
/// an adapter is invoked, so the read-only contract and the one-slot write are
/// not restated per call site.
pub fn run_check(
    state: &mut ConnectionState,
    id: &str,
    consumer: Consumer,
    adapters: &[&dyn ConsumerAdapter],
) -> Result<CheckOutcome, String> {
    let rec = state
        .find(id)
        .ok_or_else(|| format!("no connection with id {id}"))?
        .clone();
    let adapter = adapter_for(adapters, rec.connector, consumer)
        .ok_or_else(|| unsupported_message(rec.connector, consumer))?;
    begin_check(state, id, consumer, adapters)?;
    let report = adapter.check(&rec);
    let outcome = report.outcome;
    record_check(state, id, consumer, report, adapters)?;
    Ok(outcome)
}

/// Step 6. Binds or unbinds one consumer.
///
/// Enabling a consumer with no adapter is refused rather than stored: a binding
/// that cannot work is the Configure-button-that-does-nothing of rule 2 wearing
/// a checkbox. Unbinding is always allowed — a user must be able to turn
/// something off even if the code that served it has since gone away.
pub fn set_binding(
    state: &mut ConnectionState,
    id: &str,
    consumer: Consumer,
    enabled: bool,
    adapters: &[&dyn ConsumerAdapter],
) -> Result<(), String> {
    let rec = state.require_mut(id)?;
    if enabled && !has_adapter(adapters, rec.connector, consumer) {
        return Err(unsupported_message(rec.connector, consumer));
    }
    rec.bindings.set(consumer, enabled);
    if !enabled {
        // A consumer that is off holds no live finding. Dropping its check here
        // means re-enabling it starts from `configured` and has to ask again,
        // rather than showing a stale green from before it was turned off.
        rec.checking.set(consumer, false);
        rec.last_check.set(consumer, None);
    }
    Ok(())
}

fn unsupported_message(connector: Connector, consumer: Consumer) -> String {
    let name = info(connector).name;
    match consumer.provider_id() {
        Some(provider) => format!(
            "no {name} adapter exists for {provider} in this build — nothing has failed, there \
             is simply nothing to ask yet"
        ),
        None => format!(
            "no {name} adapter exists for this app in this build — nothing has failed, there is \
             simply nothing to ask yet"
        ),
    }
}

// ---------------------------------------------------------------------------
// Disconnect, revoke, remove — three different acts
// ---------------------------------------------------------------------------

/// Drops the bindings and the explicit Connect, and KEEPS the credential
/// reference and the scope.
///
/// DESIGN-SPEC.md:129 — "Disconnect binding berbeda dengan revoke credential
/// global". This is the binding half: the connection stays configured and
/// reconnectable without the user finding their token again.
pub fn disconnect(state: &mut ConnectionState, id: &str) -> Result<(), String> {
    let rec = state.require_mut(id)?;
    rec.connect_requested = false;
    rec.bindings = PerConsumer::default();
    rec.checking = PerConsumer::default();
    rec.last_check = PerConsumer::default();
    Ok(())
}

/// Drops the credential reference and returns it, so the caller can ask the
/// keychain to delete the secret it names.
///
/// The global half of the same distinction, and it returns rather than deletes
/// for one reason: this module owns no secret store, and the one act it must not
/// do is pretend to have removed something it cannot reach. A caller that
/// ignores the returned reference has leaked a keychain item, which is why the
/// return type is not `()`.
#[must_use = "the returned reference names a keychain item that is now orphaned — hand it to the \
              secret store to delete"]
pub fn revoke_credential(
    state: &mut ConnectionState,
    id: &str,
) -> Result<Option<CredentialRef>, String> {
    let rec = state.require_mut(id)?;
    let cred = rec.credential.take();
    rec.connect_requested = false;
    rec.checking = PerConsumer::default();
    rec.last_check = PerConsumer::default();
    Ok(cred)
}

/// Deletes a connection, but not quietly if other projects are using it.
///
/// DESIGN-SPEC.md:129 — "Tidak boleh menghapus koneksi yang dipakai proyek lain
/// diam-diam". `acknowledged` is the project ids the caller has shown the user;
/// anything bound and not acknowledged blocks the removal and is named in the
/// error, so the second attempt is an informed one. A global connection must be
/// acknowledged by `GLOBAL_ACKNOWLEDGEMENT`, because "every project" is the
/// widest blast radius there is and has no project id to list.
///
/// Returns the removed record so its credential reference can be handed to the
/// secret store. Removal is not revocation: the caller decides, having been
/// told.
pub const GLOBAL_ACKNOWLEDGEMENT: &str = "*";

pub fn remove(
    state: &mut ConnectionState,
    id: &str,
    acknowledged: &[String],
) -> Result<ConnectionRecord, String> {
    let rec = state
        .find(id)
        .ok_or_else(|| format!("no connection with id {id}"))?;

    if rec.scope.global && !acknowledged.iter().any(|a| a == GLOBAL_ACKNOWLEDGEMENT) {
        return Err(format!(
            "`{}` is available to every project. Removing it affects all of them — confirm that \
             before it goes.",
            rec.label
        ));
    }
    let unacknowledged: Vec<String> = rec
        .scope
        .project_ids
        .iter()
        .filter(|p| !acknowledged.iter().any(|a| a == *p))
        .cloned()
        .collect();
    if !unacknowledged.is_empty() {
        return Err(format!(
            "`{}` is still bound to {} other project(s): {}. Removing it would take the \
             connection away from them too.",
            rec.label,
            unacknowledged.len(),
            unacknowledged.join(", ")
        ));
    }

    let index = state
        .items
        .iter()
        .position(|r| r.id == id)
        .expect("found above");
    Ok(state.items.remove(index))
}

// ---------------------------------------------------------------------------
// Reading: the one place a consumer cell is produced
// ---------------------------------------------------------------------------

/// The status of ONE consumer on ONE connection.
///
/// Every input is either a fact about the connection as a whole (is there a
/// credential, was Connect pressed) or a fact about THIS consumer (is there an
/// adapter for it, is it bound, is its check in flight, what did its adapter
/// say). Not one branch reads another consumer's binding or another consumer's
/// check, so no cell can be moved by a neighbour's answer. The precedence, and
/// why:
///
/// 1. `unsupportedByAgent` — no adapter. The strongest fact, and the only one
///    the user cannot change: it outranks everything because a bound,
///    credentialled, checked connection still cannot be reached by a consumer
///    no code speaks for. Not `failed`: nothing was attempted.
/// 2. `notConfigured` — no credential reference, where one is needed. True of
///    every consumer at once, because it is a fact about the connection, and it
///    comes before `disabled` so that a fresh row reads as step 1 of the flow
///    rather than as a choice the user has not made yet. "Where one is needed"
///    is `has_remote_party`, the SAME predicate `request_connect` gates on, and
///    using one predicate in both places is the point: a local MCP server that
///    Connect accepts without a token must not then sit on `notConfigured`
///    forever, which would be a row the user can start and can never finish.
/// 3. `disabled` — the consumer is not bound. A choice, not an error, and
///    bindings default to off, so this is where a configured connection sits
///    until step 6.
/// 4. `checking` — a request is in flight for this consumer.
/// 5. `configured` — Connect has not been pressed, or has been and no adapter
///    has answered yet. This is the state that keeps `connected` honest: a
///    filled form and a pressed button get you here and no further.
/// 6. the adapter's own answer — `connected` only for a pass.
pub fn consumer_status(
    rec: &ConnectionRecord,
    consumer: Consumer,
    adapters: &[&dyn ConsumerAdapter],
) -> ConnectionStatus {
    if !has_adapter(adapters, rec.connector, consumer) {
        return ConnectionStatus::UnsupportedByAgent;
    }
    if rec.credential.is_none()
        && !info(rec.connector).credentials.is_empty()
        && has_remote_party(rec)
    {
        return ConnectionStatus::NotConfigured;
    }
    if !rec.bindings.get(consumer) {
        return ConnectionStatus::Disabled;
    }
    if *rec.checking.get(consumer) {
        return ConnectionStatus::Checking;
    }
    if !rec.connect_requested {
        return ConnectionStatus::Configured;
    }
    match rec.last_check.get(consumer) {
        None => ConnectionStatus::Configured,
        Some(check) => match check.outcome {
            CheckOutcome::Passed => ConnectionStatus::Connected,
            CheckOutcome::NeedsAuthentication => ConnectionStatus::NeedsAuthentication,
            CheckOutcome::Failed => ConnectionStatus::Failed,
        },
    }
}

/// The wire shape for one configured connection.
pub fn view(rec: &ConnectionRecord, adapters: &[&dyn ConsumerAdapter]) -> Connection {
    Connection {
        id: rec.id.clone(),
        connector: rec.connector,
        planned: info(rec.connector).planned,
        scope: rec.scope.clone(),
        consumers: PerConsumer::build(|consumer| consumer_status(rec, consumer, adapters)),
    }
}

/// What the detail panel shows about ONE configured connection — and the five
/// fields of `ConnectionDetail` in connections-page.tsx:58-69, in that order,
/// with nothing added.
///
/// `credential` is the COORDINATES and is a whole `CredentialRef`, so this type
/// inherits the property that matters: there is no field anywhere in it that
/// could hold a secret, which is what makes it safe to send to a renderer, to
/// log, and to screenshot. A `value` here would defeat every other guard in this
/// file at once.
///
/// Serialize only, and no `Deserialize`: this is an answer, never an input. The
/// input shape is `ConfigureRequest`, which is a different type on purpose —
/// one of these round-tripped back in would let the frontend decide what is
/// stored, including whether `connect_requested` is set, and that is the
/// explicit Connect of step 4 rather than a form field.
///
/// Status is absent on purpose. A connection does not have A status
/// (rule 1 at the top of this file); `Connection::consumers` carries the three
/// cells, and a single word here would be the conflation this module exists to
/// prevent. `connect_requested` is NOT a health claim — it is the record of a
/// button the user pressed, which is why `phaseOf` in the page reads it to pick
/// the next step and never to say `connected`.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDetail {
    pub label: String,
    pub endpoint: Option<String>,
    pub transport: Option<String>,
    pub credential: Option<CredentialRef>,
    pub connect_requested: bool,
}

/// The detail for one stored connection.
///
/// A catalogue row has no record, so it has no detail — the caller answers
/// `null` for it (`details: Record<string, ConnectionDetail | undefined>` at
/// connections-page.tsx:90), which is a truthful "nothing has been configured
/// here" rather than an empty form pretending to be stored state.
///
/// Every field is copied straight off the record and nothing is derived, so
/// unlike `consumer_status` there is no rule in here to get wrong.
pub fn detail(rec: &ConnectionRecord) -> ConnectionDetail {
    ConnectionDetail {
        label: rec.label.clone(),
        endpoint: rec.endpoint.clone(),
        transport: rec.transport.clone(),
        credential: rec.credential.clone(),
        connect_requested: rec.connect_requested,
    }
}

/// Every row the Connections surface shows: a catalogue row for each connector
/// with nothing configured, then the configured connections.
///
/// A catalogue row is a row and not a capability. Its consumers read
/// `notConfigured` where an adapter exists and `unsupportedByAgent` where none
/// does — which, with `installed_adapters` empty, is every cell of GitHub and
/// Figma today and is the correct answer for them permanently until something
/// is written.
pub fn connections(state: &ConnectionState, adapters: &[&dyn ConsumerAdapter]) -> Vec<Connection> {
    let mut rows = Vec::new();
    for entry in CATALOGUE.iter() {
        if state.items.iter().any(|r| r.connector == entry.connector) {
            continue;
        }
        rows.push(Connection {
            id: connector_id(entry.connector).to_string(),
            connector: entry.connector,
            planned: entry.planned,
            scope: ConnectionScope::default(),
            consumers: PerConsumer::build(|consumer| {
                if has_adapter(adapters, entry.connector, consumer) {
                    ConnectionStatus::NotConfigured
                } else {
                    ConnectionStatus::UnsupportedByAgent
                }
            }),
        });
    }
    rows.extend(state.items.iter().map(|rec| view(rec, adapters)));
    rows
}

/// The connection as a preview may print it: label/value pairs, with the
/// credential represented by its coordinates alone.
///
/// Safe because there is nothing to redact — `CredentialRef` has no value field,
/// so no secret can reach a screenshot, a log, a raw config preview or the repo
/// through this function or any other. The redaction is in the type, not in this
/// code remembering to do it.
pub fn safe_summary(rec: &ConnectionRecord) -> Vec<(&'static str, String)> {
    let mut lines = vec![
        ("Connector", info(rec.connector).name.to_string()),
        ("Name", rec.label.clone()),
    ];
    if let Some(endpoint) = &rec.endpoint {
        lines.push(("Server", endpoint.clone()));
    }
    lines.push((
        "Transport",
        rec.transport
            .clone()
            // Honest rather than a protocol name this binary has not verified
            // it speaks.
            .unwrap_or_else(|| "not specified".to_string()),
    ));
    lines.push((
        "Credential",
        match &rec.credential {
            Some(cred) => format!("{} ({})", cred.account, cred.service),
            None => "none configured".to_string(),
        },
    ));
    lines.push((
        "Scope",
        if rec.scope.global {
            "every project".to_string()
        } else if rec.scope.project_ids.is_empty() {
            "no projects yet".to_string()
        } else {
            format!("{} project(s)", rec.scope.project_ids.len())
        },
    ));
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keychain::fake::MemoryStore;
    use crate::keychain::{Removal, SecretStore};

    /// An adapter that reports whatever the test told it to, for the one
    /// (connector, consumer) pair it was built for. Nothing in this file ships
    /// a real one, so every behaviour below is proved against the trait rather
    /// than against today's empty registry.
    struct Fake {
        connector: Connector,
        consumer: Consumer,
        outcome: CheckOutcome,
    }

    impl Fake {
        fn new(connector: Connector, consumer: Consumer, outcome: CheckOutcome) -> Self {
            Fake {
                connector,
                consumer,
                outcome,
            }
        }
    }

    impl ConsumerAdapter for Fake {
        fn consumer(&self) -> Consumer {
            self.consumer
        }
        fn connector(&self) -> Connector {
            self.connector
        }
        fn check(&self, _conn: &ConnectionRecord) -> CheckReport {
            CheckReport {
                outcome: self.outcome,
                detail: None,
            }
        }
    }

    fn jira_request() -> ConfigureRequest {
        ConfigureRequest {
            connector: Connector::Jira,
            label: "Acme Jira".into(),
            endpoint: Some("https://acme.atlassian.net".into()),
            transport: None,
            mcp_launch: None,
            credential: Some(CredentialRef::new(
                "efficlaude.jira",
                "me@acme.test",
                CredentialKind::ApiToken,
            )),
            scope: ConnectionScope {
                global: false,
                project_ids: vec!["p1".into()],
            },
        }
    }

    fn json(value: &impl Serialize) -> String {
        serde_json::to_string(value).unwrap()
    }

    /// The wire contract is a union of eight literals in
    /// src/lib/types.ts:150-153, and `rename_all` on an enum renames variants
    /// rather than fields — asserted here rather than assumed. A drift in any
    /// one of these is a cell the frontend cannot render.
    #[test]
    fn every_status_name_matches_the_wire_contract() {
        assert_eq!(json(&ConnectionStatus::NotConfigured), "\"notConfigured\"");
        assert_eq!(json(&ConnectionStatus::Configured), "\"configured\"");
        assert_eq!(json(&ConnectionStatus::Checking), "\"checking\"");
        assert_eq!(json(&ConnectionStatus::Connected), "\"connected\"");
        assert_eq!(
            json(&ConnectionStatus::NeedsAuthentication),
            "\"needsAuthentication\""
        );
        assert_eq!(json(&ConnectionStatus::Failed), "\"failed\"");
        assert_eq!(json(&ConnectionStatus::Disabled), "\"disabled\"");
        assert_eq!(
            json(&ConnectionStatus::UnsupportedByAgent),
            "\"unsupportedByAgent\""
        );
    }

    /// `Github` is spelled with a lowercase `h` for this line: `GitHub` would
    /// camelCase to `gitHub`, which is not in the frontend union.
    #[test]
    fn connector_and_consumer_names_match_the_wire_contract() {
        assert_eq!(json(&Connector::Jira), "\"jira\"");
        assert_eq!(json(&Connector::CustomMcp), "\"customMcp\"");
        assert_eq!(json(&Connector::Github), "\"github\"");
        assert_eq!(json(&Connector::Figma), "\"figma\"");
        assert_eq!(json(&Consumer::Effi), "\"effi\"");
        assert_eq!(json(&Consumer::Claude), "\"claude\"");
        assert_eq!(json(&Consumer::Codex), "\"codex\"");
        // Every connector id used as a catalogue row id is the same literal the
        // enum serialises to, so a row id is always a valid connector name.
        for entry in CATALOGUE.iter() {
            assert_eq!(
                json(&entry.connector),
                format!("\"{}\"", connector_id(entry.connector))
            );
        }
    }

    /// `Record<Consumer, ConnectionStatus>` requires all three keys, and a
    /// struct is what makes fewer than three unrepresentable. A boolean here —
    /// the shape this whole module exists to avoid — would serialise as one
    /// value and could not express the next test at all.
    #[test]
    fn the_consumer_matrix_is_three_named_statuses_not_a_flag() {
        let matrix: PerConsumer<ConnectionStatus> = PerConsumer {
            effi: ConnectionStatus::Connected,
            claude: ConnectionStatus::UnsupportedByAgent,
            codex: ConnectionStatus::Disabled,
        };
        assert_eq!(
            json(&matrix),
            "{\"effi\":\"connected\",\"claude\":\"unsupportedByAgent\",\"codex\":\"disabled\"}"
        );
    }

    /// Rule 1, as the design states it: "`Connected to Effi` tidak sama dengan
    /// `Available to Codex`". Two adapters, one pass recorded for Effi, and
    /// Codex must be untouched by it.
    #[test]
    fn one_connected_consumer_does_not_connect_another() {
        let effi = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let codex = Fake::new(Connector::Jira, Consumer::Codex, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi, &codex];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();
        request_connect(&mut state, &id).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &adapters).unwrap();
        set_binding(&mut state, &id, Consumer::Codex, true, &adapters).unwrap();

        // Only Effi is checked.
        assert_eq!(
            run_check(&mut state, &id, Consumer::Effi, &adapters).unwrap(),
            CheckOutcome::Passed
        );

        let row = view(state.find(&id).unwrap(), &adapters);
        assert_eq!(row.consumers.effi, ConnectionStatus::Connected);
        assert_eq!(
            row.consumers.codex,
            ConnectionStatus::Configured,
            "Codex was never asked, so a pass for Effi must not answer for it"
        );
        // And Claude, with no adapter at all, is in a third state again.
        assert_eq!(row.consumers.claude, ConnectionStatus::UnsupportedByAgent);
    }

    /// The mirror of the above: one consumer's failure is not the connection's.
    #[test]
    fn one_failed_consumer_leaves_the_others_where_they_were() {
        let effi = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let codex = Fake::new(Connector::Jira, Consumer::Codex, CheckOutcome::Failed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi, &codex];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();
        request_connect(&mut state, &id).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &adapters).unwrap();
        set_binding(&mut state, &id, Consumer::Codex, true, &adapters).unwrap();
        run_check(&mut state, &id, Consumer::Effi, &adapters).unwrap();
        run_check(&mut state, &id, Consumer::Codex, &adapters).unwrap();

        let row = view(state.find(&id).unwrap(), &adapters);
        assert_eq!(row.consumers.effi, ConnectionStatus::Connected);
        assert_eq!(row.consumers.codex, ConnectionStatus::Failed);
    }

    /// `needsAuthentication` is its own answer and not a flavour of `failed`:
    /// the repair is a credential, not a retry.
    #[test]
    fn a_rejected_credential_asks_for_authentication_rather_than_reporting_failure() {
        let effi = Fake::new(
            Connector::Jira,
            Consumer::Effi,
            CheckOutcome::NeedsAuthentication,
        );
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();
        request_connect(&mut state, &id).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &adapters).unwrap();
        run_check(&mut state, &id, Consumer::Effi, &adapters).unwrap();

        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::NeedsAuthentication
        );
    }

    /// A consumer with no adapter has not failed at anything, and the message
    /// the user would see says so rather than offering a retry.
    #[test]
    fn a_consumer_with_no_adapter_is_unsupported_and_has_not_failed() {
        let effi = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();

        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Codex, &adapters),
            ConnectionStatus::UnsupportedByAgent
        );
        // It cannot be bound, cannot be checked, and cannot have a pass filed
        // for it, so there is no route to a fabricated `connected`.
        let bind = set_binding(&mut state, &id, Consumer::Codex, true, &adapters);
        assert!(bind.is_err());
        assert!(begin_check(&mut state, &id, Consumer::Codex, &adapters).is_err());
        let forged = record_check(
            &mut state,
            &id,
            Consumer::Codex,
            CheckReport::passed(),
            &adapters,
        );
        assert!(forged.is_err(), "no adapter, so no one could have reported");
        let message = bind.unwrap_err();
        assert!(message.contains("nothing has failed"), "{message}");
        assert!(message.contains(crate::agents::CODEX_ID), "{message}");
    }

    /// Rule 2. GitHub and Figma are catalogue entries, and the catalogue cannot
    /// be turned into a connection.
    #[test]
    fn a_planned_connector_cannot_be_configured() {
        let mut state = ConnectionState::default();
        for connector in [Connector::Github, Connector::Figma] {
            let err = configure(
                &mut state,
                ConfigureRequest {
                    connector,
                    label: "mine".into(),
                    endpoint: None,
                    transport: None,
                    mcp_launch: None,
                    credential: None,
                    scope: ConnectionScope::default(),
                },
            )
            .unwrap_err();
            assert!(err.contains("planned connector"), "{err}");
        }
        assert!(
            state.items.is_empty(),
            "a planned connector must leave nothing behind"
        );
    }

    /// The catalogue's own claim and the adapter registry must agree: a
    /// connector declared planned may not have an adapter registered for it,
    /// or `planned` would be a lie the UI acts on.
    #[test]
    fn a_planned_connector_has_no_registered_adapter() {
        let installed = installed_adapters();
        let refs: Vec<&dyn ConsumerAdapter> = installed.iter().map(|a| a.as_ref()).collect();
        for entry in CATALOGUE.iter().filter(|e| e.planned) {
            for consumer in CONSUMERS {
                assert!(
                    !has_adapter(&refs, entry.connector, consumer),
                    "{} is declared planned but has an adapter",
                    entry.name
                );
            }
        }
    }

    /// Every row of the Connections surface as this build actually ships it,
    /// cell by cell and written out rather than derived — so a new adapter
    /// cannot quietly light up a cell without this expectation being edited by
    /// hand and read by a reviewer.
    ///
    /// ONE cell has code behind it: Jira for Effi, which `installed_adapters`
    /// registers and which therefore reads `notConfigured` — "there is an
    /// adapter, and you have configured nothing for it yet". Every other cell
    /// in the catalogue reads `unsupportedByAgent`, which is not a failure: no
    /// code speaks for that pair, so nothing was attempted and no retry is
    /// offered. The list of reasons is on `installed_adapters`.
    #[test]
    fn the_shipped_catalogue_claims_nothing_it_cannot_do() {
        use ConnectionStatus::{NotConfigured, UnsupportedByAgent};
        let installed = installed_adapters();
        let refs: Vec<&dyn ConsumerAdapter> = installed.iter().map(|a| a.as_ref()).collect();
        let rows = connections(&ConnectionState::default(), &refs);

        assert_eq!(rows.len(), CATALOGUE.len());
        assert_eq!(
            rows.iter().filter(|r| r.planned).count(),
            2,
            "GitHub and Figma, and only those"
        );

        let expected = [
            (
                "jira",
                NotConfigured,
                UnsupportedByAgent,
                UnsupportedByAgent,
            ),
            (
                "customMcp",
                UnsupportedByAgent,
                UnsupportedByAgent,
                UnsupportedByAgent,
            ),
            (
                "github",
                UnsupportedByAgent,
                UnsupportedByAgent,
                UnsupportedByAgent,
            ),
            (
                "figma",
                UnsupportedByAgent,
                UnsupportedByAgent,
                UnsupportedByAgent,
            ),
        ];
        for (id, effi, claude, codex) in expected {
            let row = rows
                .iter()
                .find(|r| r.id == id)
                .unwrap_or_else(|| panic!("no {id} row"));
            assert_eq!(row.consumers.effi, effi, "{id}/effi");
            assert_eq!(row.consumers.claude, claude, "{id}/claude");
            assert_eq!(row.consumers.codex, codex, "{id}/codex");
        }

        // And the general rule the table above is one instance of: a cell may
        // be anything other than `unsupportedByAgent` only where an adapter is
        // actually registered for that pair.
        for row in &rows {
            for consumer in CONSUMERS {
                let claimed = *row.consumers.get(consumer) != UnsupportedByAgent;
                assert_eq!(
                    claimed,
                    has_adapter(&refs, row.connector, consumer),
                    "{} must claim {consumer:?} only if an adapter exists for it",
                    row.id
                );
            }
        }
    }

    /// The one registered adapter, pinned: exactly one pair has code behind it,
    /// and it is the read-only Jira reader answering for this app.
    ///
    /// Written as an exhaustive sweep of every (connector, consumer) pair so
    /// that registering a second adapter fails here first. `installed_adapters`
    /// is the single claim about what works (connections.rs), and this is the
    /// test that makes the claim cost something.
    #[test]
    fn exactly_one_consumer_pair_has_an_adapter_in_this_build() {
        let installed = installed_adapters();
        assert_eq!(installed.len(), 1);
        let refs: Vec<&dyn ConsumerAdapter> = installed.iter().map(|a| a.as_ref()).collect();

        for entry in CATALOGUE.iter() {
            for consumer in CONSUMERS {
                let expected = entry.connector == Connector::Jira && consumer == Consumer::Effi;
                assert_eq!(
                    has_adapter(&refs, entry.connector, consumer),
                    expected,
                    "{} / {consumer:?}",
                    entry.name
                );
            }
        }
    }

    /// The point of the whole flow: `connected` is a check that passed, never a
    /// field that was filled or a button that was pressed.
    #[test]
    fn filling_the_form_and_pressing_connect_does_not_make_it_connected() {
        let effi = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &adapters).unwrap();
        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Configured,
            "a stored credential reference is configured, not connected"
        );

        request_connect(&mut state, &id).unwrap();
        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Configured,
            "the explicit Connect is an intent, not a result"
        );

        begin_check(&mut state, &id, Consumer::Effi, &adapters).unwrap();
        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Checking
        );

        record_check(
            &mut state,
            &id,
            Consumer::Effi,
            CheckReport::passed(),
            &adapters,
        )
        .unwrap();
        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Connected
        );
    }

    /// Without a credential reference there is nothing to connect with, and the
    /// error names that step instead of letting it surface later as a failure.
    #[test]
    fn connecting_before_configuring_is_refused() {
        let mut state = ConnectionState::default();
        let mut req = jira_request();
        req.credential = None;
        let id = configure(&mut state, req).unwrap();
        assert!(request_connect(&mut state, &id).is_err());
        let installed: Vec<&dyn ConsumerAdapter> = vec![];
        // With no adapter the cell is unsupported; the notConfigured state is
        // what a consumer that HAS an adapter sees.
        let effi = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let with_effi: Vec<&dyn ConsumerAdapter> = vec![&effi];
        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &installed),
            ConnectionStatus::UnsupportedByAgent
        );
        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &with_effi),
            ConnectionStatus::NotConfigured
        );
    }

    /// "retry tidak menggandakan konfigurasi" (DESIGN-SPEC.md:147). Configuring
    /// the same connector and label twice updates one row, the way adding the
    /// same folder twice returns the existing project (projects.rs:138-141).
    #[test]
    fn configuring_twice_updates_one_row_rather_than_adding_a_second() {
        let mut state = ConnectionState::default();
        let first = configure(&mut state, jira_request()).unwrap();
        let mut again = jira_request();
        again.endpoint = Some("https://acme.atlassian.net/".into());
        let second = configure(&mut state, again).unwrap();

        assert_eq!(first, second);
        assert_eq!(state.items.len(), 1);
        assert_eq!(
            state.find(&first).unwrap().endpoint.as_deref(),
            Some("https://acme.atlassian.net/")
        );
    }

    /// A rotated credential invalidates what was checked: the old pass was about
    /// a secret that is no longer the one stored.
    #[test]
    fn changing_the_credential_reference_drops_the_pass_it_earned() {
        let effi = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();
        request_connect(&mut state, &id).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &adapters).unwrap();
        run_check(&mut state, &id, Consumer::Effi, &adapters).unwrap();
        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Connected
        );

        let mut rotated = jira_request();
        rotated.credential = Some(CredentialRef::new(
            "efficlaude.jira",
            "someone.else@acme.test",
            CredentialKind::ApiToken,
        ));
        configure(&mut state, rotated).unwrap();

        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Configured,
            "a new credential has not been checked"
        );
    }

    /// Health is derived from a live conversation, so it is not written to disk:
    /// a pass read back next launch would be a claim about a server nobody has
    /// spoken to. After a round trip the connection is `configured` again.
    #[test]
    fn a_pass_is_not_persisted_and_cannot_be_read_back_as_connected() {
        let effi = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();
        request_connect(&mut state, &id).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &adapters).unwrap();
        run_check(&mut state, &id, Consumer::Effi, &adapters).unwrap();

        let on_disk = serde_json::to_string(&state).unwrap();
        assert!(
            !on_disk.contains("connected") && !on_disk.contains("lastCheck"),
            "no health may reach studio.json: {on_disk}"
        );

        let reloaded: ConnectionState = serde_json::from_str(&on_disk).unwrap();
        assert_eq!(
            consumer_status(reloaded.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Configured
        );
        // The binding and the explicit Connect DO survive — they are choices,
        // not observations.
        assert!(*reloaded.find(&id).unwrap().bindings.get(Consumer::Effi));
        assert!(reloaded.find(&id).unwrap().connect_requested);
    }

    /// A secret has nowhere to live here, so one hand-written into studio.json
    /// is dropped on the next save rather than quietly preserved. Proving the
    /// drop rather than the refusal is deliberate: serde ignores unknown fields,
    /// which means an existing file with a stray token still loads — and loses
    /// the token.
    #[test]
    fn a_token_in_a_hand_edited_config_never_survives() {
        let hand_edited = r#"{
            "items": [{
                "id": "abc123",
                "connector": "jira",
                "label": "Acme Jira",
                "scope": { "global": false, "projectIds": ["p1"] },
                "endpoint": "https://acme.atlassian.net",
                "credential": {
                    "service": "efficlaude.jira",
                    "account": "me@acme.test",
                    "kind": "apiToken",
                    "token": "hunter2-should-not-be-here"
                },
                "token": "also-should-not-be-here"
            }]
        }"#;

        let state: ConnectionState =
            serde_json::from_str(hand_edited).expect("an existing file must still load");
        assert_eq!(state.items.len(), 1);

        let rewritten = serde_json::to_string(&state).unwrap();
        assert!(
            !rewritten.contains("hunter2") && !rewritten.contains("should-not-be-here"),
            "a secret must not survive a round trip: {rewritten}"
        );
        // And nothing a preview prints can carry one either.
        let printed = safe_summary(state.find("abc123").unwrap())
            .iter()
            .map(|(k, v)| format!("{k}: {v}"))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!printed.contains("hunter2"), "{printed}");
        assert!(printed.contains("me@acme.test"), "the reference is shown");
    }

    /// The `StudioConfig` field this module is shaped for defaults cleanly, which
    /// is what keeps an existing ~/.efficlaude/studio.json deserialising once the
    /// field is added. Without it, `load()` degrades to `Default` and the user
    /// loses every project (projects.rs:60-66).
    #[test]
    fn the_embeddable_field_defaults_for_a_config_that_predates_it() {
        let absent: ConnectionState = serde_json::from_str("{}").unwrap();
        assert!(absent.items.is_empty());
        assert!(ConnectionState::default().items.is_empty());
        // The shape as it would sit inside StudioConfig, with the key missing.
        #[derive(Deserialize)]
        struct Parent {
            #[serde(default)]
            connections: ConnectionState,
        }
        let parent: Parent = serde_json::from_str(r#"{"projects":[]}"#).unwrap();
        assert!(parent.connections.items.is_empty());
    }

    /// Scope is a global account flag plus project bindings, and `applies_to` is
    /// the only place the pair is interpreted.
    #[test]
    fn scope_reaches_only_bound_projects_unless_it_is_global() {
        let mut scope = ConnectionScope::default();
        assert!(!scope.applies_to("p1"));

        scope.bind_project("p1");
        scope.bind_project("p1");
        assert_eq!(scope.project_ids.len(), 1, "binding twice binds once");
        assert!(scope.applies_to("p1"));
        assert!(!scope.applies_to("p2"));

        scope.global = true;
        assert!(
            scope.applies_to("p2"),
            "global reaches a project it never named"
        );

        scope.global = false;
        scope.unbind_project("p1");
        assert!(!scope.applies_to("p1"));
    }

    #[test]
    fn a_project_sees_the_connections_bound_to_it() {
        let mut state = ConnectionState::default();
        configure(&mut state, jira_request()).unwrap();
        configure(
            &mut state,
            ConfigureRequest {
                connector: Connector::CustomMcp,
                label: "Team server".into(),
                endpoint: Some("https://mcp.acme.test".into()),
                transport: Some("as configured by the user".into()),
                mcp_launch: None,
                credential: None,
                scope: ConnectionScope {
                    global: true,
                    project_ids: vec![],
                },
            },
        )
        .unwrap();

        assert_eq!(
            state.for_project("p1").len(),
            2,
            "the bound one and the global one"
        );
        assert_eq!(state.for_project("p9").len(), 1, "only the global one");
    }

    /// "Disconnect binding berbeda dengan revoke credential global"
    /// (DESIGN-SPEC.md:129). Disconnect keeps the credential reference so the
    /// user need not find their token again; revoke hands it back so the secret
    /// store can delete the item this module cannot reach.
    #[test]
    fn disconnecting_a_binding_is_not_revoking_the_credential() {
        let effi = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();
        request_connect(&mut state, &id).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &adapters).unwrap();
        run_check(&mut state, &id, Consumer::Effi, &adapters).unwrap();

        disconnect(&mut state, &id).unwrap();
        let rec = state.find(&id).unwrap();
        assert!(rec.credential.is_some(), "the credential reference stays");
        assert!(!rec.connect_requested);
        assert_eq!(
            consumer_status(rec, Consumer::Effi, &adapters),
            ConnectionStatus::Disabled,
            "unbound is a choice, not an error"
        );
        assert!(rec.scope.applies_to("p1"), "the scope is untouched");

        let revoked = revoke_credential(&mut state, &id).unwrap();
        assert_eq!(
            revoked.as_ref().map(|c| c.account.as_str()),
            Some("me@acme.test"),
            "revoke returns the reference so the keychain item can be deleted"
        );
        assert!(state.find(&id).unwrap().credential.is_none());
    }

    /// Turning a consumer off drops its finding, so turning it back on asks
    /// again rather than showing a green from before.
    #[test]
    fn unbinding_a_consumer_drops_its_stale_finding() {
        let effi = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();
        request_connect(&mut state, &id).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &adapters).unwrap();
        run_check(&mut state, &id, Consumer::Effi, &adapters).unwrap();

        set_binding(&mut state, &id, Consumer::Effi, false, &adapters).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &adapters).unwrap();
        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Configured
        );
    }

    /// "Tidak boleh menghapus koneksi yang dipakai proyek lain diam-diam"
    /// (DESIGN-SPEC.md:129). The first attempt names the projects; the second,
    /// having acknowledged them, goes through.
    #[test]
    fn removing_a_connection_other_projects_use_needs_acknowledgement() {
        let mut state = ConnectionState::default();
        let mut req = jira_request();
        req.scope = ConnectionScope {
            global: false,
            project_ids: vec!["p1".into(), "p2".into()],
        };
        let id = configure(&mut state, req).unwrap();

        let err = remove(&mut state, &id, &["p1".to_string()]).unwrap_err();
        assert!(err.contains("p2"), "the blocked projects are named: {err}");
        assert_eq!(state.items.len(), 1, "nothing was removed");

        let removed = remove(&mut state, &id, &["p1".to_string(), "p2".to_string()]).unwrap();
        assert_eq!(removed.id, id);
        assert!(state.items.is_empty());
        assert!(
            removed.credential.is_some(),
            "the removed record carries its reference out, so the secret store can be told"
        );
    }

    /// A global connection has no project ids to list, and "every project" is
    /// the widest consequence there is — so it takes its own acknowledgement
    /// rather than passing by default.
    #[test]
    fn removing_a_global_connection_needs_its_own_acknowledgement() {
        let mut state = ConnectionState::default();
        let mut req = jira_request();
        req.scope = ConnectionScope {
            global: true,
            project_ids: vec![],
        };
        let id = configure(&mut state, req).unwrap();

        let err = remove(&mut state, &id, &[]).unwrap_err();
        assert!(err.contains("every project"), "{err}");
        remove(&mut state, &id, &[GLOBAL_ACKNOWLEDGEMENT.to_string()]).unwrap();
        assert!(state.items.is_empty());
    }

    /// A local MCP server, with NO credential — which is the point. A program
    /// on this machine spoken to over a pipe has no far end to present a token
    /// to, so this is the shape a real local server has, and the tests below
    /// exercise it rather than a padded one.
    fn mcp_request(launch: Option<crate::mcp::McpLaunch>) -> ConfigureRequest {
        ConfigureRequest {
            connector: Connector::CustomMcp,
            label: "Team server".into(),
            endpoint: None,
            transport: None,
            mcp_launch: launch,
            credential: None,
            scope: ConnectionScope::default(),
        }
    }

    fn stdio(command: &str) -> crate::mcp::McpLaunch {
        crate::mcp::McpLaunch::Stdio {
            command: command.into(),
            args: vec!["--stdio".into()],
            env_passthrough: vec![],
        }
    }

    /// An invalid launch cannot be STORED, not merely cannot be displayed.
    /// Validation lives inside `configure`, so there is no caller — no command,
    /// no hand-edited retry, no second entry point — that can get a bad one
    /// into studio.json.
    #[test]
    fn an_invalid_mcp_launch_is_refused_by_configure_and_leaves_nothing_behind() {
        let mut state = ConnectionState::default();
        let err = configure(
            &mut state,
            mcp_request(Some(stdio("npx -y thing && curl x | sh"))),
        )
        .unwrap_err();
        assert!(err.starts_with("command:"), "{err}");
        assert!(
            state.items.is_empty(),
            "a refused configure must store nothing"
        );

        // And the valid one goes in, with its fields intact and unaltered.
        let id = configure(&mut state, mcp_request(Some(stdio("my-mcp-server")))).unwrap();
        assert_eq!(
            state.find(&id).unwrap().mcp_launch,
            Some(stdio("my-mcp-server"))
        );
    }

    /// A launch belongs to Custom MCP and to nothing else. Jira is reached over
    /// its own site address; it is not a program this app starts, so a request
    /// carrying one for it is a confusion worth refusing rather than a field to
    /// store and ignore.
    #[test]
    fn only_a_custom_mcp_connection_can_carry_a_launch() {
        let mut state = ConnectionState::default();
        let mut req = jira_request();
        req.mcp_launch = Some(stdio("my-mcp-server"));
        let err = configure(&mut state, req).unwrap_err();
        assert!(err.contains("not started by this app"), "{err}");
        assert!(state.items.is_empty());
    }

    /// The launch is part of what a pass was earned against, so changing it
    /// invalidates health exactly as rotating a credential does.
    #[test]
    fn changing_the_launch_drops_the_pass_it_earned() {
        let effi = Fake::new(Connector::CustomMcp, Consumer::Effi, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, mcp_request(Some(stdio("first-server")))).unwrap();
        request_connect(&mut state, &id).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &adapters).unwrap();
        run_check(&mut state, &id, Consumer::Effi, &adapters).unwrap();
        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Connected
        );

        configure(&mut state, mcp_request(Some(stdio("second-server")))).unwrap();
        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Configured,
            "a different program has not been checked"
        );
        assert_eq!(state.items.len(), 1, "and it is still one row");
    }

    /// A stdio MCP server has no address at all, so `needs_endpoint` is
    /// satisfied by the launch. A connection with neither is refused by name
    /// rather than reaching a check with nowhere to go.
    #[test]
    fn connect_needs_somewhere_to_go_and_a_local_program_counts() {
        let mut state = ConnectionState::default();

        // Saving a half-filled form is fine; connecting it is not.
        let bare = configure(&mut state, mcp_request(None)).unwrap();
        let err = request_connect(&mut state, &bare).unwrap_err();
        assert!(err.contains("nowhere to connect to"), "{err}");
        assert!(!state.find(&bare).unwrap().connect_requested);

        // A local program is a destination, even with no endpoint.
        configure(&mut state, mcp_request(Some(stdio("my-mcp-server")))).unwrap();
        request_connect(&mut state, &bare).unwrap();
        assert!(state.find(&bare).unwrap().connect_requested);

        // So is a URL, through the endpoint field — with a credential, because
        // that one has a far end. See the test below.
        let mut req = mcp_request(None);
        req.label = "Remote server".into();
        req.endpoint = Some("https://mcp.acme.test".into());
        req.credential = Some(CredentialRef::new(
            "efficlaude.mcp",
            "remote-server",
            CredentialKind::ApiToken,
        ));
        let remote = configure(&mut state, req).unwrap();
        request_connect(&mut state, &remote).unwrap();
        assert!(state.find(&remote).unwrap().connect_requested);
    }

    /// The credential gate, and the exactly-one exemption from it.
    ///
    /// A local program has no far end, so demanding a token for it would be a
    /// refusal the user cannot satisfy. Everything with a far end still
    /// demands one — and the two that matter most are checked here: a REMOTE
    /// MCP server (the case the exemption must not cover) and Jira.
    #[test]
    fn only_a_local_program_is_exempt_from_needing_a_credential() {
        let mut state = ConnectionState::default();

        // Local program, no credential: allowed to connect.
        let local = configure(&mut state, mcp_request(Some(stdio("my-mcp-server")))).unwrap();
        assert!(!has_remote_party(state.find(&local).unwrap()));
        request_connect(&mut state, &local).unwrap();

        // Remote MCP server over https, no credential: still refused. This is
        // the hole the exemption must not open.
        let mut req = mcp_request(Some(crate::mcp::McpLaunch::Remote {
            url: "https://mcp.acme.test/sse".into(),
            transport: None,
        }));
        req.label = "Remote server".into();
        let remote = configure(&mut state, req).unwrap();
        assert!(has_remote_party(state.find(&remote).unwrap()));
        let err = request_connect(&mut state, &remote).unwrap_err();
        assert!(err.contains("configure a credential"), "{err}");
        assert!(!state.find(&remote).unwrap().connect_requested);

        // And Jira, which can never carry a launch at all, is untouched by the
        // exemption: no credential, no connect.
        let mut jira = jira_request();
        jira.credential = None;
        let jira_id = configure(&mut state, jira).unwrap();
        assert!(has_remote_party(state.find(&jira_id).unwrap()));
        assert!(request_connect(&mut state, &jira_id).is_err());
    }

    /// A connection is reached one way, not two. Storing both a program and an
    /// address would leave no single answer to "where does this go" — and
    /// `has_remote_party`, which decides whether a credential is demanded,
    /// would be guessing.
    #[test]
    fn a_launch_and_an_address_cannot_both_be_stored() {
        let mut state = ConnectionState::default();
        let mut req = mcp_request(Some(stdio("my-mcp-server")));
        req.endpoint = Some("https://mcp.acme.test".into());
        let err = configure(&mut state, req).unwrap_err();
        assert!(err.contains("Keep one"), "{err}");
        assert!(state.items.is_empty(), "nothing ambiguous may be stored");

        // Either alone is fine.
        configure(&mut state, mcp_request(Some(stdio("my-mcp-server")))).unwrap();
        let mut address_only = mcp_request(None);
        address_only.label = "Remote server".into();
        address_only.endpoint = Some("https://mcp.acme.test".into());
        configure(&mut state, address_only).unwrap();
        assert_eq!(state.items.len(), 2);
    }

    /// The launch survives the config file, and carries nothing secret through
    /// it: `envPassthrough` is names, so there is no key in the stored shape a
    /// token could occupy.
    #[test]
    fn a_stored_launch_round_trips_and_cannot_carry_a_value() {
        let mut state = ConnectionState::default();
        let id = configure(
            &mut state,
            mcp_request(Some(crate::mcp::McpLaunch::Stdio {
                command: "my-mcp-server".into(),
                args: vec!["--port".into(), "7".into()],
                env_passthrough: vec!["MY_MCP_TOKEN".into()],
            })),
        )
        .unwrap();

        let on_disk = serde_json::to_string(&state).unwrap();
        assert!(on_disk.contains("\"mcpLaunch\""), "{on_disk}");
        assert!(on_disk.contains("\"envPassthrough\":[\"MY_MCP_TOKEN\"]"));
        let reloaded: ConnectionState = serde_json::from_str(&on_disk).unwrap();
        assert_eq!(
            reloaded.find(&id).unwrap().mcp_launch,
            state.find(&id).unwrap().mcp_launch
        );

        // The name is stored; no value accompanies it, because the shape has
        // no place for one.
        let hand_edited = r#"{
            "items": [{
                "id": "abc123",
                "connector": "customMcp",
                "label": "Team server",
                "scope": { "global": false, "projectIds": [] },
                "mcpLaunch": {
                    "kind": "stdio",
                    "command": "my-mcp-server",
                    "envPassthrough": ["MY_MCP_TOKEN"],
                    "env": { "MY_MCP_TOKEN": "hunter2-should-not-be-here" }
                }
            }]
        }"#;
        let smuggled: ConnectionState = serde_json::from_str(hand_edited).unwrap();
        let rewritten = serde_json::to_string(&smuggled).unwrap();
        assert!(
            !rewritten.contains("hunter2"),
            "an env VALUE hand-written into the config must not survive: {rewritten}"
        );
    }

    /// A studio.json written before the launch field existed still loads, with
    /// the launch absent rather than the whole connection list lost — the
    /// contract `the_embeddable_field_defaults_for_a_config_that_predates_it`
    /// keeps for the parent field, kept for this one too.
    #[test]
    fn a_config_written_before_the_launch_field_still_loads() {
        let older = r#"{
            "items": [{
                "id": "abc123",
                "connector": "customMcp",
                "label": "Team server",
                "scope": { "global": true, "projectIds": [] },
                "endpoint": "https://mcp.acme.test"
            }]
        }"#;
        let state: ConnectionState = serde_json::from_str(older).expect("an older file must load");
        assert_eq!(state.items.len(), 1);
        assert_eq!(state.find("abc123").unwrap().mcp_launch, None);
    }

    /// One variant each, which is the enforcement: a stored connection has no
    /// word for an OAuth flow this product has not registered for, and no
    /// adapter has a word for a Jira write.
    #[test]
    fn the_credential_and_jira_vocabularies_admit_nothing_unverified() {
        assert_eq!(json(&CredentialKind::ApiToken), "\"apiToken\"");
        assert_eq!(json(&JIRA_ACCESS), "\"readOnly\"");
        assert!(serde_json::from_str::<CredentialKind>("\"oauth\"").is_err());
        assert!(serde_json::from_str::<JiraAccess>("\"readWrite\"").is_err());
        // Jira takes a token; a planned connector is offered nothing to fill in.
        assert_eq!(
            info(Connector::Jira).credentials,
            &[CredentialKind::ApiToken]
        );
        assert!(info(Connector::Github).credentials.is_empty());
        assert!(info(Connector::Figma).credentials.is_empty());
    }

    /// `PerConsumer::set` writes one slot. Asserted directly, because it is the
    /// mechanism every one-consumer-does-not-imply-another test above rests on.
    #[test]
    fn writing_one_consumer_slot_leaves_the_other_two_alone() {
        for target in CONSUMERS {
            let mut flags: PerConsumer<bool> = PerConsumer::default();
            flags.set(target, true);
            for consumer in CONSUMERS {
                assert_eq!(
                    *flags.get(consumer),
                    consumer == target,
                    "setting {target:?} must not move {consumer:?}"
                );
            }
        }
    }

    /// Claude and Codex answer to providers in the agent registry, which is why
    /// binding them means writing a config this app does not own — the reviewed
    /// preview and explicit Apply of DESIGN-SPEC.md:129, and not this task.
    /// Effi is this binary and has no provider id.
    #[test]
    fn the_two_external_consumers_name_real_providers_and_effi_names_none() {
        assert_eq!(Consumer::Effi.provider_id(), None);
        assert_eq!(
            Consumer::Claude.provider_id(),
            Some(crate::agents::CLAUDE_CODE_ID)
        );
        assert_eq!(Consumer::Codex.provider_id(), Some(crate::agents::CODEX_ID));
    }

    /// The detail panel's wire shape, asserted as bytes against the five fields
    /// of `ConnectionDetail` in connections-page.tsx:58-69. A drift in any key
    /// is a panel that renders blank, and `rename_all` is assumed by nobody
    /// here: `connectRequested` is checked, not trusted.
    #[test]
    fn the_detail_shape_matches_the_wire_contract_and_carries_only_coordinates() {
        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();
        request_connect(&mut state, &id).unwrap();

        let got = json(&detail(state.find(&id).unwrap()));
        assert_eq!(
            got,
            "{\"label\":\"Acme Jira\",\
             \"endpoint\":\"https://acme.atlassian.net\",\
             \"transport\":null,\
             \"credential\":{\"service\":\"efficlaude.jira\",\"account\":\"me@acme.test\",\
             \"kind\":\"apiToken\"},\
             \"connectRequested\":true}"
        );
        // The credential is three coordinates and there is no fourth key in
        // which a value could ride along.
        assert_eq!(got.matches("\"kind\"").count(), 1);
        assert!(!got.contains("token\":") || got.contains("apiToken"));
    }

    /// A connection with no credential and no server reports exactly that, so
    /// the panel's `detail?.credential` test (connections-page.tsx:260) reads a
    /// null rather than an empty object that looks configured.
    #[test]
    fn a_connection_with_nothing_filled_in_details_as_nulls() {
        let mut state = ConnectionState::default();
        let id = configure(
            &mut state,
            ConfigureRequest {
                connector: Connector::CustomMcp,
                label: "Team server".into(),
                endpoint: None,
                transport: None,
                mcp_launch: None,
                credential: None,
                scope: ConnectionScope::default(),
            },
        )
        .unwrap();
        assert_eq!(
            json(&detail(state.find(&id).unwrap())),
            "{\"label\":\"Team server\",\"endpoint\":null,\"transport\":null,\
             \"credential\":null,\"connectRequested\":false}"
        );
    }

    /// The detail view is the shape most likely to be handed to a renderer, a
    /// log or a screenshot, so the drop test is repeated through it: a token
    /// hand-written into studio.json cannot come back out of `detail` either.
    #[test]
    fn a_hand_edited_token_cannot_escape_through_the_detail_view() {
        let hand_edited = r#"{
            "items": [{
                "id": "abc123",
                "connector": "jira",
                "label": "Acme Jira",
                "scope": { "global": false, "projectIds": [] },
                "credential": {
                    "service": "efficlaude.jira",
                    "account": "me@acme.test",
                    "kind": "apiToken",
                    "token": "hunter2-should-not-be-here"
                }
            }]
        }"#;
        let state: ConnectionState = serde_json::from_str(hand_edited).unwrap();
        let printed = json(&detail(state.find("abc123").unwrap()));
        assert!(!printed.contains("hunter2"), "{printed}");
        assert!(printed.contains("me@acme.test"), "the reference is shown");
    }

    // -----------------------------------------------------------------------
    // TASK 106 — two claims, each driven through the real flow
    //
    // CLAIM 1. One consumer's config does not connect the others, and one
    // CONNECTION's config does not connect the others either. `PerConsumer`
    // makes three cells always exist; these tests make "untouched" an
    // assertion rather than an inference.
    //
    // WHAT IS ALREADY PROVED ABOVE, AND WHAT IS NOT.
    // `exactly_one_consumer_pair_has_an_adapter_in_this_build` sweeps all
    // twelve (connector, consumer) pairs against the shipped registry, and
    // `the_shipped_catalogue_claims_nothing_it_cannot_do` pins every catalogue
    // cell. Both are statements about the REGISTRY: which pairs have code. They
    // say nothing about what happens to one cell when a neighbour is driven
    // through configure -> scope -> connect -> check, because neither runs a
    // check at all. `one_connected_consumer_does_not_connect_another` does run
    // one, and it is the test closest to these — but the two cells it then
    // inspects land on `configured` and `unsupportedByAgent`, which are also
    // exactly the values they would hold if the production code had written
    // nothing for them, or had wiped them. It cannot tell untouched from reset.
    // That is the trap these tests are built to avoid: every cell that must not
    // move is given a DIFFERENT, non-default finding first, so a leak reads as
    // `connected` and a wipe reads as `configured`, and both differ from the
    // right answer.
    //
    // CLAIM 2. An invalid config damages nothing. Every refusal is compared on
    // the WHOLE state rather than on fields chosen by hand, the technique
    // `an_address_this_build_cannot_reach_leaves_every_other_pane_byte_identical`
    // uses in browser.rs, so a field added to `ConnectionRecord` later stays
    // covered without anyone remembering to extend an assertion.
    //
    // NO NETWORK. Nothing below constructs a shipped adapter. `Fake` and
    // `Witness` answer in memory, and the one real secret store is
    // `keychain::fake::MemoryStore`. `jira::tests::Recorder` and the
    // fake-backed `JiraReader::with` would be the natural seam for an
    // end-to-end Jira check from here and NEITHER IS REACHABLE: `mod tests` in
    // jira.rs is a private module and `with` is a private `#[cfg(test)]`
    // associated function, so neither can be named outside that file without
    // editing it. jira.rs owns those assertions instead, over its own seam
    // (`the_adapter_reports_a_pass_a_rejection_and_an_unreachable_site_
    // differently`), and this file stays the module that decides what an
    // answer MEANS.
    // -----------------------------------------------------------------------

    /// An adapter that answers for one pair and writes down every record it was
    /// asked about.
    ///
    /// `Fake` above cannot distinguish an adapter that was never consulted from
    /// one that was consulted and whose answer was discarded: both leave the
    /// same state behind. A `run_check` that walked the whole registry instead
    /// of one entry would therefore go unnoticed. This one records the call, so
    /// "Codex's adapter was not even spoken to" is checkable.
    ///
    /// `detail` carries the consumer's name, which makes a leaked report
    /// visible in the finding itself and not only in the status word.
    struct Witness {
        connector: Connector,
        consumer: Consumer,
        outcome: CheckOutcome,
        asked: std::cell::RefCell<Vec<String>>,
    }

    impl Witness {
        fn new(connector: Connector, consumer: Consumer, outcome: CheckOutcome) -> Self {
            Witness {
                connector,
                consumer,
                outcome,
                asked: std::cell::RefCell::new(Vec::new()),
            }
        }

        /// The ids of the records this adapter was handed, in order.
        fn asked_about(&self) -> Vec<String> {
            self.asked.borrow().clone()
        }
    }

    impl ConsumerAdapter for Witness {
        fn consumer(&self) -> Consumer {
            self.consumer
        }
        fn connector(&self) -> Connector {
            self.connector
        }
        fn check(&self, conn: &ConnectionRecord) -> CheckReport {
            self.asked.borrow_mut().push(conn.id.clone());
            CheckReport {
                outcome: self.outcome,
                detail: Some(format!("{:?} answered", self.consumer)),
            }
        }
    }

    /// Exactly what would reach ~/.efficlaude/studio.json, as one string.
    fn persisted(state: &ConnectionState) -> String {
        serde_json::to_string(state).expect("the stored state always serialises")
    }

    /// The same, plus the two `#[serde(skip)]` health fields the config file
    /// cannot show by design.
    ///
    /// Both strings are needed and neither subsumes the other: `persisted` is
    /// the file, and a refusal that quietly cleared a live pass or left a
    /// `checking` flag stuck on would leave the file byte-identical while
    /// damaging the session. `Debug` reaches `checking` and `last_check`
    /// because the derive does not honour `serde(skip)`.
    fn everything(state: &ConnectionState) -> String {
        format!("{state:?}")
    }

    /// Every per-consumer field one record has, for ONE consumer: the binding,
    /// the in-flight flag, and the finding down to its detail text and
    /// timestamp.
    ///
    /// Three fields because `PerConsumer` appears on `ConnectionRecord` exactly
    /// three times (`bindings`, `checking`, `last_check`); a fourth would have
    /// to be added here, and `writing_one_consumer_slot_leaves_the_other_two_
    /// alone` is what guarantees the `get` used here reads the slot it names.
    fn per_consumer(rec: &ConnectionRecord, consumer: Consumer) -> String {
        let finding = rec
            .last_check
            .get(consumer)
            .as_ref()
            .map(|c| (c.outcome, c.detail.clone(), c.at_unix));
        format!(
            "bound={:?} checking={:?} finding={finding:?}",
            rec.bindings.get(consumer),
            rec.checking.get(consumer),
        )
    }

    /// Not a credential to anything. The same placeholder jira.rs stocks its
    /// fake store with.
    const PLACEHOLDER: &str = "placeholder-not-a-real-token";

    /// The coordinates `jira_request` carries, so a test can ask the store
    /// whether the secret behind that connection is still there.
    fn jira_credential() -> CredentialRef {
        CredentialRef::new("efficlaude.jira", "me@acme.test", CredentialKind::ApiToken)
    }

    /// The world a refusal must not damage, built by DRIVING THE FLOW —
    /// configure, scope, connect, check — rather than by assembling the end
    /// state a test then asserts.
    ///
    /// Four connections, chosen so that every refusal path has something real
    /// to aim at: a Jira site with a credential and a live pass; a global stdio
    /// MCP server with a live pass and no credential; a half-filled row, which
    /// is the only shape `request_connect` can refuse for having nowhere to go;
    /// and a remote MCP server with no credential, which is the only shape it
    /// can refuse for having no credential. The store holds the one secret the
    /// one credential reference names.
    fn populated(adapters: &[&dyn ConsumerAdapter]) -> (ConnectionState, MemoryStore) {
        let mut state = ConnectionState::default();

        let jira = configure(&mut state, jira_request()).unwrap();
        request_connect(&mut state, &jira).unwrap();
        set_binding(&mut state, &jira, Consumer::Effi, true, adapters).unwrap();
        run_check(&mut state, &jira, Consumer::Effi, adapters).unwrap();

        let mcp = configure(&mut state, mcp_request(Some(stdio("my-mcp-server")))).unwrap();
        set_scope(
            &mut state,
            &mcp,
            ConnectionScope {
                global: true,
                project_ids: vec![],
            },
        )
        .unwrap();
        request_connect(&mut state, &mcp).unwrap();
        set_binding(&mut state, &mcp, Consumer::Effi, true, adapters).unwrap();
        run_check(&mut state, &mcp, Consumer::Effi, adapters).unwrap();

        let mut bare = mcp_request(None);
        bare.label = "Half-filled server".into();
        configure(&mut state, bare).unwrap();

        let mut remote = mcp_request(Some(crate::mcp::McpLaunch::Remote {
            url: "https://mcp.acme.test/sse".into(),
            transport: None,
        }));
        remote.label = "Remote server".into();
        configure(&mut state, remote).unwrap();

        let store = MemoryStore::new();
        store.put(&jira_credential(), PLACEHOLDER).unwrap();

        (state, store)
    }

    /// CLAIM 1. The whole flow run for ONE consumer leaves the other two cells
    /// exactly as it found them — not at a plausible value, exactly as it found
    /// them.
    ///
    /// All three consumers have an adapter here, so `unsupportedByAgent` is not
    /// quietly standing in for "nothing happened", and all three are bound and
    /// already carry a different finding before Effi is checked: Claude on
    /// `needsAuthentication`, Codex on `failed`. A pass that leaked into a
    /// neighbour would read `connected`; a slot that was wiped would read
    /// `configured`. The comparison is the whole per-consumer slice, detail
    /// text and timestamp included, so a report copied across with a different
    /// outcome would still be caught.
    ///
    /// And the recording adapter closes the last gap: Effi's check must not so
    /// much as ASK the other two adapters. State alone cannot show that.
    #[test]
    fn connecting_one_consumer_leaves_the_other_twos_findings_exactly_as_they_were() {
        let effi = Witness::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let claude = Witness::new(
            Connector::Jira,
            Consumer::Claude,
            CheckOutcome::NeedsAuthentication,
        );
        let codex = Witness::new(Connector::Jira, Consumer::Codex, CheckOutcome::Failed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&effi, &claude, &codex];

        let mut state = ConnectionState::default();
        let id = configure(&mut state, jira_request()).unwrap();
        set_scope(
            &mut state,
            &id,
            ConnectionScope {
                global: false,
                project_ids: vec!["p1".into()],
            },
        )
        .unwrap();
        request_connect(&mut state, &id).unwrap();
        for consumer in CONSUMERS {
            set_binding(&mut state, &id, consumer, true, &adapters).unwrap();
        }

        // The two neighbours answer first, so each holds a finding that is
        // neither the default nor the one Effi is about to earn.
        assert_eq!(
            run_check(&mut state, &id, Consumer::Claude, &adapters).unwrap(),
            CheckOutcome::NeedsAuthentication
        );
        assert_eq!(
            run_check(&mut state, &id, Consumer::Codex, &adapters).unwrap(),
            CheckOutcome::Failed
        );

        let rec = state.find(&id).unwrap();
        let claude_before = per_consumer(rec, Consumer::Claude);
        let codex_before = per_consumer(rec, Consumer::Codex);
        let claude_calls = claude.asked_about();
        let codex_calls = codex.asked_about();

        // Effi is driven to a pass.
        assert_eq!(
            run_check(&mut state, &id, Consumer::Effi, &adapters).unwrap(),
            CheckOutcome::Passed
        );

        let rec = state.find(&id).unwrap();
        assert_eq!(
            consumer_status(rec, Consumer::Effi, &adapters),
            ConnectionStatus::Connected
        );
        assert_eq!(
            per_consumer(rec, Consumer::Claude),
            claude_before,
            "Effi's pass moved Claude's binding, flag or finding"
        );
        assert_eq!(
            per_consumer(rec, Consumer::Codex),
            codex_before,
            "Effi's pass moved Codex's binding, flag or finding"
        );
        assert_eq!(
            consumer_status(rec, Consumer::Claude, &adapters),
            ConnectionStatus::NeedsAuthentication,
            "Claude still needs its own credential, whatever Effi managed"
        );
        assert_eq!(
            consumer_status(rec, Consumer::Codex, &adapters),
            ConnectionStatus::Failed,
            "Codex still failed, whatever Effi managed"
        );
        assert_eq!(
            claude.asked_about(),
            claude_calls,
            "checking Effi must not consult Claude's adapter"
        );
        assert_eq!(
            codex.asked_about(),
            codex_calls,
            "checking Effi must not consult Codex's adapter"
        );
        assert_eq!(
            effi.asked_about(),
            vec![id.clone()],
            "one check is one request, about one record"
        );

        // The wire row carries three different words, which is the sentence
        // DESIGN-SPEC.md:119 is making.
        assert_eq!(
            json(&view(rec, &adapters).consumers),
            "{\"effi\":\"connected\",\"claude\":\"needsAuthentication\",\"codex\":\"failed\"}"
        );
    }

    /// CLAIM 1 on the axis no test above reaches: one CONNECTION's config does
    /// not connect another.
    ///
    /// Three stored connections, two of them carrying findings that must
    /// survive — a Jira site that failed and a local MCP server that passed —
    /// and the whole flow then driven on the third. The two bystanders are
    /// compared as whole records, so a `configure` that matched the wrong row,
    /// a `record_check` that wrote by connector instead of by id, or a scope
    /// that leaked would all show up here without anyone having guessed which
    /// field to assert on.
    #[test]
    fn connecting_one_connection_leaves_every_other_connection_byte_identical() {
        let jira_fails = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Failed);
        let mcp_passes = Fake::new(Connector::CustomMcp, Consumer::Effi, CheckOutcome::Passed);
        let jira_passes = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        // The registry is a per-call argument, so the two slices are one
        // adapter whose answer changed between checks — a site that was down
        // and came back.
        let while_down: Vec<&dyn ConsumerAdapter> = vec![&jira_fails, &mcp_passes];
        let while_up: Vec<&dyn ConsumerAdapter> = vec![&jira_passes, &mcp_passes];

        let mut state = ConnectionState::default();

        // Bystander one: a second Jira site, its own label, its own credential,
        // its own project, and a failure of its own.
        let mut other = jira_request();
        other.label = "Other Jira".into();
        other.endpoint = Some("https://other.atlassian.net".into());
        other.credential = Some(CredentialRef::new(
            "efficlaude.jira",
            "someone.else@acme.test",
            CredentialKind::ApiToken,
        ));
        other.scope = ConnectionScope {
            global: false,
            project_ids: vec!["p2".into()],
        };
        let other_id = configure(&mut state, other).unwrap();
        request_connect(&mut state, &other_id).unwrap();
        set_binding(&mut state, &other_id, Consumer::Effi, true, &while_down).unwrap();
        run_check(&mut state, &other_id, Consumer::Effi, &while_down).unwrap();

        // Bystander two: a local MCP server with a pass.
        let mcp_id = configure(&mut state, mcp_request(Some(stdio("my-mcp-server")))).unwrap();
        request_connect(&mut state, &mcp_id).unwrap();
        set_binding(&mut state, &mcp_id, Consumer::Effi, true, &while_down).unwrap();
        run_check(&mut state, &mcp_id, Consumer::Effi, &while_down).unwrap();

        let other_before = format!("{:?}", state.find(&other_id).unwrap());
        let mcp_before = format!("{:?}", state.find(&mcp_id).unwrap());

        // The connection under test, configured and connected from scratch.
        let id = configure(&mut state, jira_request()).unwrap();
        assert_ne!(id, other_id, "two Jira sites are two connections");
        request_connect(&mut state, &id).unwrap();
        set_binding(&mut state, &id, Consumer::Effi, true, &while_up).unwrap();
        run_check(&mut state, &id, Consumer::Effi, &while_up).unwrap();

        assert_eq!(
            consumer_status(state.find(&id).unwrap(), Consumer::Effi, &while_up),
            ConnectionStatus::Connected
        );
        assert_eq!(
            format!("{:?}", state.find(&other_id).unwrap()),
            other_before,
            "connecting one Jira site moved the other one"
        );
        assert_eq!(
            format!("{:?}", state.find(&mcp_id).unwrap()),
            mcp_before,
            "connecting a Jira site moved the MCP server"
        );
        assert_eq!(
            consumer_status(state.find(&other_id).unwrap(), Consumer::Effi, &while_up),
            ConnectionStatus::Failed,
            "the other site is still failing, even against a passing adapter"
        );
        assert_eq!(
            state.items.len(),
            3,
            "and it is three rows, not one updated"
        );
        // The scopes stayed apart too: a pass is not a binding.
        assert_eq!(state.for_project("p2").len(), 1, "the other site only");
    }

    /// CLAIM 2, through `configure`: every way the form can be refused, aimed
    /// at connections that ARE ALREADY STORED, with the whole state compared
    /// before and after.
    ///
    /// Aiming each refusal at an existing (connector, label) pair is what makes
    /// this cost something. `configure` updates the matching row in place, and
    /// a changed credential or launch clears that row's explicit Connect and
    /// every consumer's health. A refusal evaluated after that update rather
    /// than before it would therefore rewrite a working connection's endpoint,
    /// transport and scope and throw away its pass — and a test aimed at a
    /// fresh label would never notice, because there would be no row to damage.
    ///
    /// The store is checked alongside, because the thing a user cannot get back
    /// is the token: a refusal may not cost a secret either.
    #[test]
    fn every_configure_refusal_leaves_the_whole_stored_state_byte_identical() {
        let jira_adapter = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let mcp_adapter = Fake::new(Connector::CustomMcp, Consumer::Effi, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&jira_adapter, &mcp_adapter];
        let (mut state, store) = populated(&adapters);

        let before_json = persisted(&state);
        let before_all = everything(&state);
        let secrets_before = store.len();
        assert_eq!(secrets_before, 1);
        assert!(
            before_json.contains("Acme Jira"),
            "the fixture really is there"
        );

        let mut refusals: Vec<(&str, ConfigureRequest)> = Vec::new();

        // A planned connector, which has no implementation to configure.
        for connector in [Connector::Github, Connector::Figma] {
            let mut req = jira_request();
            req.connector = connector;
            refusals.push(("planned connector", req));
        }

        // A name that is only whitespace.
        let mut unnamed = jira_request();
        unnamed.label = "   ".into();
        refusals.push(("give the connection a name", unnamed));

        // An invalid stdio launch, under the label of the WORKING MCP server.
        refusals.push((
            "command:",
            mcp_request(Some(stdio("npx -y thing && curl x | sh"))),
        ));

        // A remote launch whose address names no scheme, same label again.
        let mut bad_url = mcp_request(Some(crate::mcp::McpLaunch::Remote {
            url: "mcp.acme.test".into(),
            transport: None,
        }));
        bad_url.label = "Team server".into();
        refusals.push(("url:", bad_url));

        // A launch on Jira, under the label of the WORKING Jira connection.
        let mut launch_on_jira = jira_request();
        launch_on_jira.mcp_launch = Some(stdio("my-mcp-server"));
        refusals.push(("not started by this app", launch_on_jira));

        // Both a program and an address, under the working MCP server's label.
        let mut ambiguous = mcp_request(Some(stdio("my-mcp-server")));
        ambiguous.endpoint = Some("https://mcp.acme.test".into());
        refusals.push(("Keep one", ambiguous));

        // A credential reference missing half its coordinates, and the other
        // half missing, both under the working Jira connection's label.
        let mut no_service = jira_request();
        no_service.credential = Some(CredentialRef::new(
            "  ",
            "me@acme.test",
            CredentialKind::ApiToken,
        ));
        refusals.push(("needs both a service and an account", no_service));
        let mut no_account = jira_request();
        no_account.credential = Some(CredentialRef::new(
            "efficlaude.jira",
            "",
            CredentialKind::ApiToken,
        ));
        refusals.push(("needs both a service and an account", no_account));

        assert_eq!(refusals.len(), 9, "every configure refusal, counted");
        for (why, req) in refusals {
            let err = configure(&mut state, req).unwrap_err();
            assert!(err.contains(why), "expected `{why}`, got: {err}");
            assert_eq!(
                persisted(&state),
                before_json,
                "`{why}` was refused and still changed the config file"
            );
            assert_eq!(
                everything(&state),
                before_all,
                "`{why}` was refused and still changed state the config file cannot show"
            );
            assert_eq!(store.len(), secrets_before, "`{why}` cost a secret");
            assert!(
                store.contains(&jira_credential()).unwrap(),
                "`{why}` cost the stored token"
            );
        }

        // And the sharpest consequence of the ordering, said out loud: the two
        // passes those connections earned are still theirs.
        let jira = connection_id(Connector::Jira, "Acme Jira");
        let mcp = connection_id(Connector::CustomMcp, "Team server");
        assert_eq!(
            consumer_status(state.find(&jira).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Connected
        );
        assert_eq!(
            consumer_status(state.find(&mcp).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Connected
        );
        assert_eq!(state.items.len(), 4, "no refusal added or dropped a row");
    }

    /// CLAIM 2, through every OTHER refusal in this module: the scope step, the
    /// explicit Connect, the two check steps, the binding step, and all three
    /// of disconnect / revoke / remove — including the unknown-id refusal each
    /// of them makes through `require_mut`.
    ///
    /// `remove` is the one whose ordering is documented: its "other projects
    /// use this" check runs before it touches `state.items`, precisely so a
    /// refused removal cannot cost a user their token. This asserts that the
    /// same property holds for all of them, on the whole state rather than on
    /// fields picked by hand — and `revoke_credential` is in the list for the
    /// obvious reason that it is the one function here whose whole job is to
    /// take a credential reference away.
    #[test]
    fn every_other_refusal_path_leaves_the_whole_stored_state_byte_identical() {
        let jira_adapter = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let mcp_adapter = Fake::new(Connector::CustomMcp, Consumer::Effi, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&jira_adapter, &mcp_adapter];
        let (mut state, store) = populated(&adapters);

        let before_json = persisted(&state);
        let before_all = everything(&state);
        let secrets_before = store.len();

        let jira = connection_id(Connector::Jira, "Acme Jira");
        let mcp = connection_id(Connector::CustomMcp, "Team server");
        let bare = connection_id(Connector::CustomMcp, "Half-filled server");
        let remote = connection_id(Connector::CustomMcp, "Remote server");
        const MISSING: &str = "0000000000000000";
        assert!(state.find(MISSING).is_none());

        let unchanged = |state: &ConnectionState, why: &str| {
            assert_eq!(
                persisted(state),
                before_json,
                "`{why}` was refused and still changed the config file"
            );
            assert_eq!(
                everything(state),
                before_all,
                "`{why}` was refused and still changed state the config file cannot show"
            );
            assert_eq!(store.len(), secrets_before, "`{why}` cost a secret");
            assert!(
                store.contains(&jira_credential()).unwrap(),
                "`{why}` cost the stored token"
            );
        };

        // Step 3, on an id that is not there.
        let wide = ConnectionScope {
            global: true,
            project_ids: vec!["p9".into()],
        };
        assert!(set_scope(&mut state, MISSING, wide).is_err());
        unchanged(&state, "set_scope on an unknown id");

        // Step 4, three ways.
        assert!(request_connect(&mut state, MISSING).is_err());
        unchanged(&state, "request_connect on an unknown id");
        let nowhere = request_connect(&mut state, &bare).unwrap_err();
        assert!(nowhere.contains("nowhere to connect to"), "{nowhere}");
        unchanged(&state, "request_connect with nowhere to go");
        let untrusted = request_connect(&mut state, &remote).unwrap_err();
        assert!(untrusted.contains("configure a credential"), "{untrusted}");
        unchanged(
            &state,
            "request_connect on a remote server with no credential",
        );

        // Step 5, for a consumer no code speaks for, and for a missing row.
        for consumer in [Consumer::Claude, Consumer::Codex] {
            assert!(begin_check(&mut state, &jira, consumer, &adapters).is_err());
            unchanged(&state, "begin_check with no adapter");
            assert!(
                record_check(
                    &mut state,
                    &jira,
                    consumer,
                    CheckReport::passed(),
                    &adapters
                )
                .is_err()
            );
            unchanged(&state, "record_check with no adapter");
            assert!(run_check(&mut state, &jira, consumer, &adapters).is_err());
            unchanged(&state, "run_check with no adapter");
            assert!(set_binding(&mut state, &jira, consumer, true, &adapters).is_err());
            unchanged(&state, "set_binding with no adapter");
        }
        assert!(begin_check(&mut state, MISSING, Consumer::Effi, &adapters).is_err());
        unchanged(&state, "begin_check on an unknown id");
        assert!(
            record_check(
                &mut state,
                MISSING,
                Consumer::Effi,
                CheckReport::passed(),
                &adapters
            )
            .is_err()
        );
        unchanged(&state, "record_check on an unknown id");
        assert!(run_check(&mut state, MISSING, Consumer::Effi, &adapters).is_err());
        unchanged(&state, "run_check on an unknown id");
        assert!(set_binding(&mut state, MISSING, Consumer::Effi, true, &adapters).is_err());
        unchanged(&state, "set_binding on an unknown id");

        // Teardown, on an id that is not there.
        assert!(disconnect(&mut state, MISSING).is_err());
        unchanged(&state, "disconnect on an unknown id");
        assert!(revoke_credential(&mut state, MISSING).is_err());
        unchanged(&state, "revoke_credential on an unknown id");
        assert!(remove(&mut state, MISSING, &[]).is_err());
        unchanged(&state, "remove on an unknown id");

        // And the two removals that are refused for being too consequential.
        let bound = remove(&mut state, &jira, &[]).unwrap_err();
        assert!(
            bound.contains("p1"),
            "the blocked project is named: {bound}"
        );
        unchanged(&state, "remove without acknowledging the bound project");
        let everywhere = remove(&mut state, &mcp, &["p1".to_string()]).unwrap_err();
        assert!(everywhere.contains("every project"), "{everywhere}");
        unchanged(
            &state,
            "remove a global connection without acknowledging it",
        );

        // Nothing in that list was a no-op by accident: the acknowledged
        // removal does go through, so the refusals above were refusals and not
        // a call that could never have done anything.
        let removed = remove(&mut state, &jira, &["p1".to_string()]).unwrap();
        assert_eq!(removed.id, jira);
        assert_eq!(state.items.len(), 3);
        assert_ne!(persisted(&state), before_json);
    }

    /// CLAIM 2, the half this module cannot assert on its own state: a refused
    /// removal must not cost a credential.
    ///
    /// `remove` evaluates its refusals before it touches `state.items` and
    /// hands the record out only on success, which is the whole reason the
    /// ordering is worth a comment in the production code. The caller's half of
    /// that contract is modelled here rather than described: a successful
    /// removal takes the returned `CredentialRef` to the secret store and
    /// deletes the item, because `#[must_use]` says it must. If a refused
    /// removal had taken the record out anyway, the caller would have had the
    /// reference, deleted the user's token, and left no connection pointing at
    /// it — so this test asserts both that the row is still there and that the
    /// secret behind it still is.
    #[test]
    fn a_refused_removal_costs_neither_the_connection_nor_the_credential() {
        let jira_adapter = Fake::new(Connector::Jira, Consumer::Effi, CheckOutcome::Passed);
        let mcp_adapter = Fake::new(Connector::CustomMcp, Consumer::Effi, CheckOutcome::Passed);
        let adapters: Vec<&dyn ConsumerAdapter> = vec![&jira_adapter, &mcp_adapter];
        let (mut state, store) = populated(&adapters);
        let jira = connection_id(Connector::Jira, "Acme Jira");

        let refused = remove(&mut state, &jira, &[]).unwrap_err();
        assert!(refused.contains("p1"), "{refused}");

        // Nothing came out, so the caller had no reference to hand over.
        let rec = state
            .find(&jira)
            .expect("a refused removal keeps the connection");
        assert_eq!(
            rec.credential.as_ref(),
            Some(&jira_credential()),
            "and keeps its credential reference"
        );
        assert!(
            store.contains(&jira_credential()).unwrap(),
            "and the token it names is still in the store"
        );
        assert_eq!(
            consumer_status(rec, Consumer::Effi, &adapters),
            ConnectionStatus::Connected,
            "a refused removal does not cost the pass either"
        );

        // The informed second attempt, and the delete it authorises. This is
        // the step that makes the refusal above matter.
        let removed = remove(&mut state, &jira, &["p1".to_string()]).unwrap();
        let orphaned = removed
            .credential
            .expect("the reference leaves with the record");
        assert_eq!(store.forget(&orphaned), Removal::Deleted);
        assert!(!store.contains(&jira_credential()).unwrap());
        assert_eq!(store.len(), 0);

        // The global MCP server is untouched by any of it — removing one
        // connection is not removing a neighbour.
        let mcp = connection_id(Connector::CustomMcp, "Team server");
        assert_eq!(
            consumer_status(state.find(&mcp).unwrap(), Consumer::Effi, &adapters),
            ConnectionStatus::Connected
        );
    }
}
