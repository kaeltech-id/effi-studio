import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Agent, Capabilities } from './agents';
import type { Tab, TabType } from './tabs';
import type {
  BrowserCapability,
  BrowserView,
  ComponentReport,
  ConfigureRequest,
  ConfiguredConnection,
  Connection,
  Consumer,
  DeviceDiscovery,
  DevicePlatform,
  Diagnostics,
  DiffStat,
  Experience,
  GitInfo,
  LaunchOutcome,
  LegacyInstall,
  OwnedDevice,
  PaneBounds,
  PanelState,
  Project,
  ProjectState,
  RetryState,
  Selection,
  SetupOutcome,
  SetupPlan,
  StopOutcome,
  TreeLevel,
} from './types';

/**
 * The single typed boundary to the Rust side. Components import from here and
 * never call invoke() themselves — one wrapper per command is what keeps a
 * renamed argument a type error instead of a silent undefined.
 */
export const api = {
  resolveClaude: (overridePath: string | null = null) =>
    invoke<string>('resolve_claude', { overridePath }),

  runDiagnostics: (overridePath: string | null = null) =>
    invoke<Diagnostics>('run_diagnostics', { overridePath }),

  installEfficlaude: () => invoke<void>('install_efficlaude'),
  installSessionId: () => invoke<string>('install_session_id'),

  claudeOverride: () => invoke<string | null>('claude_override'),
  setClaudeOverride: (path: string | null) => invoke<void>('set_claude_override', { path }),

  listProjects: () => invoke<Project[]>('list_projects'),

  listChildren: (path: string, stopAt: string | null = null) =>
    invoke<TreeLevel>('list_children', { path, stopAt }),

  promoteProject: (path: string) => invoke<Project>('promote_project', { path }),

  addProject: () => invoke<Project | null>('add_project'),
  removeProject: (id: string) => invoke<void>('remove_project', { id }),
  readState: (path: string) => invoke<ProjectState>('read_project_state', { path }),

  gitInfo: (path: string) => invoke<GitInfo>('git_info', { path }),
  gitDiffStat: (path: string) => invoke<DiffStat>('git_diff_stat', { path }),
  gitCheckout: (path: string, branch: string) => invoke<GitInfo>('git_checkout', { path, branch }),
  gitCreateBranch: (path: string, name: string) =>
    invoke<GitInfo>('git_create_branch', { path, name }),

  panels: () => invoke<PanelState>('panels'),
  setPanels: (panels: PanelState) => invoke<void>('set_panels', { panels }),

  experiences: () => invoke<Experience[]>('experiences'),
  setExperiences: (buildEnabled: boolean) => invoke<void>('set_experiences', { buildEnabled }),

  /** Minted by pty_reserve and returned, not chosen here: every later call about
   *  this terminal is keyed on it, which is what lets one project hold several
   *  sessions. Reserving spawns nothing, so the id can be subscribed to before
   *  ptyStart puts a process behind it — the ordering recorded at
   *  terminal-pane.tsx:61-62. */
  ptyReserve: () => invoke<string>('pty_reserve'),
  /** Starts the agent under an id already reserved. `agentId` is an id from the
   *  agent registry (agents.rs:174-213, `claude-code` / `codex`), never an
   *  executable path — the registry resolves the binary and its argv itself.
   *  The keys are the Rust parameter names (lib.rs pty_start: `id`, `cwd`,
   *  `agent`): a key that does not match arrives as undefined with no type
   *  error, which is what makes this wrapper the only caller of invoke. */
  ptyStart: (sessionId: string, cwd: string, agentId: string) =>
    invoke<void>('pty_start', { id: sessionId, cwd, agent: agentId }),
  ptyWrite: (sessionId: string, data: string) => invoke<void>('pty_write', { id: sessionId, data }),
  ptyResize: (sessionId: string, rows: number, cols: number) =>
    invoke<void>('pty_resize', { id: sessionId, rows, cols }),
  ptyClose: (sessionId: string) => invoke<void>('pty_close', { id: sessionId }),

  // --- Tabs (tabs.rs) ------------------------------------------------------
  //
  // Every key below is the Rust parameter name, camelCased by Tauri's own
  // convention: `project_id` at tabs.rs:133 is `projectId` here, while a
  // single-word parameter like `id` (tabs.rs:187) or `ids` (tabs.rs:199) is
  // already its own camelCase form. A key that does not match arrives as
  // undefined with no type error and no build failure, which is the whole
  // reason these wrappers are the only callers of invoke.

  /** Only this project's tabs. Rows whose project has been removed are dropped
   *  by the Rust side on every read (tabs.rs:122-138), so a tab here always has
   *  a configured project behind it. */
  tabs: (projectId: string) => invoke<Tab[]>('tabs', { projectId }),

  /** Appended to the arrangement the user already made, never inserted.
   *
   *  The argument is `kind`, NOT `type`: the Rust parameter is `kind`
   *  (tabs.rs:157) because `type` is a keyword there, while the `Tab` that
   *  comes back serialises the same value under the key `type`
   *  (tabs.rs:47-48). The asymmetry is real and deliberate — sending `type`
   *  here would leave the backend with `kind: undefined`.
   *
   *  `title` null takes the kind's own label, and `providerId` is dropped by
   *  the backend for every kind but 'agent' (tabs.rs:171-175). */
  openTab: (
    projectId: string,
    kind: TabType,
    title: string | null = null,
    providerId: string | null = null,
  ) => invoke<Tab>('open_tab', { projectId, kind, title, providerId }),

  /** Metadata only. Closing a tab is not killing its process: whoever spawned
   *  one owns ending it (tabs.rs:184-193), so a caller holding a session must
   *  still ptyClose it. An unknown id is a no-op success. */
  closeTab: (id: string) => invoke<void>('close_tab', { id }),

  /** Records what the user dragged, and answers with this project's tabs in
   *  their new order. Ids from another project are ignored, and tabs not named
   *  keep their relative order after the ones that are (tabs.rs:195-218). */
  reorderTabs: (projectId: string, ids: string[]) =>
    invoke<Tab[]>('reorder_tabs', { projectId, ids }),

  // --- Agents (agents.rs) --------------------------------------------------

  /** Every configured provider, recomputed per call against what is installed
   *  right now: a binary installed while the app is open stops needing
   *  attention without a relaunch. An unresolvable provider is kept in the list
   *  and flagged, never dropped (agents.rs:215-225). */
  agents: () => invoke<Agent[]>('agents'),

  /** Adds — or re-adds — a user-defined CLI. The id is derived from the
   *  program, so a second add of the same program replaces the stored row
   *  rather than duplicating it, which is what makes this one call also the
   *  edit path for a CLI's name, args or capabilities.
   *
   *  `program` is one program, never a command line, and `args` is argv that
   *  has already been separated by the caller: nothing on this path parses a
   *  command string. The four keys are the Rust parameter names at
   *  agents.rs:323-327, each a single lowercase word. `capabilities` is
   *  `Option<Capabilities>` there, so null is accepted and means none. */
  addCustomCli: (
    name: string,
    program: string,
    args: string[],
    capabilities: Capabilities | null = null,
  ) => invoke<Agent>('add_custom_cli', { name, program, args, capabilities }),

  /** An unknown id is a no-op success, the contract removeProject already has
   *  (agents.rs:361-368). */
  removeCustomCli: (id: string) => invoke<void>('remove_custom_cli', { id }),

  // --- Selective setup (setup.rs) ------------------------------------------
  //
  // All three take the one key `selection` (setup.rs:726, 767, 701). Their
  // `app: AppHandle` and `reg: State<SessionRegistry>` parameters are injected
  // by Tauri and must NOT be sent from here.

  /** A pure preview: builds the plan and writes nothing. */
  setupPlan: (selection: Selection) => invoke<SetupPlan>('setup_plan', { selection }),

  /** Runs exactly the plan `setupPlan` previews — built again in Rust from the
   *  same selection, because the backend accepts a selection and never a plan.
   *  Rejects rather than reporting an empty success when a run cannot start
   *  (the previous installer still alive at its prompt, most of all). */
  runSetup: (selection: Selection) => invoke<SetupOutcome>('run_setup', { selection }),

  /** One report per planned item, each component's own diagnostic re-run now.
   *  Nothing here is inferred from an operation having been dispatched. */
  setupReadiness: (selection: Selection) =>
    invoke<ComponentReport[]>('setup_readiness', { selection }),

  // --- The full legacy install (setup.rs) ----------------------------------

  /** Reads out what a bare install.sh run would cover. Writes nothing and
   *  starts nothing, so Settings can show the scope before anything runs; the
   *  `started` field is false on this answer (setup.rs:557-560). */
  installAllLegacyScope: () => invoke<LegacyInstall>('install_all_legacy_scope'),

  /** Starts the bare run and answers with the scope it started. Started, not
   *  finished and not ready — `setupReadiness` is what says ready
   *  (setup.rs:576-582). */
  installAllLegacy: () => invoke<LegacyInstall>('install_all_legacy'),

  /** Whether a run may be attempted as things stand, and why not when it may
   *  not (lib.rs:193-197). Asking reclaims nothing: a query that freed the
   *  installer slot would make merely rendering the screen the act that
   *  discarded a run. */
  installRetryState: () => invoke<RetryState>('install_retry_state'),

  // --- The Browser tab (browser.rs) ----------------------------------------
  //
  // Eleven commands, every one of them registered at lib.rs:597-607. Each key
  // below is the Rust parameter name camelCased by Tauri's own convention:
  // `tab_id` is `tabId`, `project_id` is `projectId`, and the single-word
  // `url`, `bounds` and `visible` are already their own camelCase form. The
  // `reg: State<BrowserRegistry>` and `app: AppHandle` parameters are injected
  // by Tauri and must NOT be sent from here.
  //
  // There is NO embedded surface behind any of this. browser.rs:1-51 records
  // why, against the vendored source of the pinned crate: Tauri 2.12.5 gates
  // `Window::add_child` behind `unstable`, and even with that feature on it
  // exposes no history navigation whatsoever. These wrappers drive an address
  // controller and an open-externally handoff, and nothing more.

  /** Read before the Browser tab draws its main area. Answers
   *  `embeddedSurface: false` on this build, with the backend's own `reason`
   *  and `fallback` strings for the UI to show verbatim. */
  browserCapability: () => invoke<BrowserCapability>('browser_capability'),

  /** create-on-open, and idempotent: a second open on one `tabId` answers with
   *  the tab that is already there rather than a new one (browser.rs:594-597),
   *  which is what makes the StrictMode double-invoke harmless here.
   *
   *  `url` is optional because a Browser tab opens blank and waits for an
   *  address — opening one must not navigate anywhere the user did not ask
   *  for. A rejected address leaves no half-created tab behind. */
  browserOpen: (tabId: string, projectId: string, url: string | null = null) =>
    invoke<BrowserView>('browser_open', { tabId, projectId, url }),

  /** The only door an address comes through: `normalize_url`'s scheme
   *  allowlist is enforced here, and its refusal is the sentence the UI shows
   *  (browser.rs:616-629). */
  browserNavigate: (tabId: string, url: string) =>
    invoke<BrowserView>('browser_navigate', { tabId, url }),

  /** One step back through the ADDRESSES this tab has held — deliberately not
   *  a page's session history (browser.rs:402-416). Rejects at the start of
   *  history rather than succeeding silently, so a UI that offered the control
   *  while `canGoBack` was false finds out. */
  browserBack: (tabId: string) => invoke<BrowserView>('browser_back', { tabId }),
  browserForward: (tabId: string) => invoke<BrowserView>('browser_forward', { tabId }),

  /** Bumps the generation token the pane watches. Refused on a blank tab:
   *  answering `Ok` with no address would make the control look like it did
   *  something (browser.rs:661-677). */
  browserReload: (tabId: string) => invoke<BrowserView>('browser_reload', { tabId }),

  /** Geometry the frontend measured. A measurement that is not drawable is
   *  dropped and the last good geometry kept, and the view that comes back says
   *  what was actually kept — a 0x0 from a pane mid-hide is an ordinary event,
   *  not a caller error (browser.rs:679-697). */
  browserSetBounds: (tabId: string, bounds: PaneBounds) =>
    invoke<BrowserView>('browser_set_bounds', { tabId, bounds }),

  /** hide-without-destroying. History, bounds and the storage scope all
   *  survive, which is what makes this different from closing the tab. */
  browserSetVisibility: (tabId: string, visible: boolean) =>
    invoke<BrowserView>('browser_set_visibility', { tabId, visible }),

  /** Read when a Browser pane re-mounts, so it redraws from the pane already
   *  in the registry instead of opening a second one. */
  browserView: (tabId: string) => invoke<BrowserView>('browser_view', { tabId }),

  /** destroy-on-close. Nothing here owns a process, so there is nothing to
   *  signal and closing this tab cannot disturb any other. An unknown id
   *  rejects with `no browser tab: {id}`. */
  browserClose: (tabId: string) => invoke<void>('browser_close', { tabId }),

  /** The handoff, and on this build the only way the user actually sees the
   *  page. The address is re-validated at the point of use before it is handed
   *  to the OS URL handler (browser.rs:743-765). Starts nothing, retries
   *  nothing, and rejects on a tab with no address yet. */
  browserOpenExternally: (tabId: string) => invoke<void>('browser_open_externally', { tabId }),

  // --- The device tabs (devices.rs) -----------------------------------------
  //
  // Five commands, every one of them registered at lib.rs:788-797, with
  // `app.manage(devices::DeviceOwnership::default())` at lib.rs:741 behind
  // them. Each key below is the Rust parameter name camelCased by Tauri's own
  // convention: `tab_id` is `tabId` and `device_id` is `deviceId`. The
  // `ownership: State<DeviceOwnership>` parameter is injected by Tauri and must
  // NOT be sent from here.
  //
  // What is NOT in this list is the point of it. There is no command that
  // creates a device, erases one, downloads a runtime or accepts a licence, so
  // no wrapper here can reach one: discovery reads, launch starts a device the
  // user picked, stop shuts one down, and release gives up a record.

  /** Read-only. Four facts per platform — platform support, tools, runtime,
   *  device — gathered by probes that run with their own budget and never
   *  install anything (devices.rs:675-676). Always answers for BOTH platforms:
   *  a panicking probe is one platform's bad news, not the other's. */
  discoverDevices: () => invoke<DeviceDiscovery>('discover_devices'),

  /** The ONLY wrapper in this file that starts a device, and it is reachable
   *  from exactly one press (device-pane.tsx's Launch). It claims the device
   *  for `tabId`, which is what makes Stop offerable there and nowhere else.
   *
   *  It downloads nothing and creates nothing: a device id discovery did not
   *  list is refused as `notADiscoveredDevice` rather than passed to a tool. */
  launchDevice: (tabId: string, platform: DevicePlatform, deviceId: string) =>
    invoke<LaunchOutcome>('launch_device', { tabId, platform, deviceId }),

  /** Shuts a device down, and only one this app started from THIS tab. A
   *  device the user booted themselves comes back `notOwnedByApp` however
   *  plainly the tool reports it as running (devices.rs:1226-1239).
   *
   *  Never called from a close, a remove or a quit path — see
   *  `releaseDeviceOwnership`. */
  stopDevice: (tabId: string, platform: DevicePlatform, deviceId: string) =>
    invoke<StopOutcome>('stop_device', { tabId, platform, deviceId }),

  /** What this app claims right now, read whole rather than per device so the
   *  pane can tell "owned by another tab" from "owned by nobody". Running-ness
   *  is never the authority: this record is. */
  ownedDevices: () => invoke<OwnedDevice[]>('owned_devices'),

  /** Gives up claims and STOPS NOTHING. This is what a closing tab and a
   *  removed project call, and it is deliberately not `stopDevice`: a
   *  simulator the user wants to keep running must survive closing its tab and
   *  quitting the app.
   *
   *  There is no action parameter to pass, on this side or the Rust one
   *  (devices.rs:1438-1444), precisely so no path through it can take a device
   *  down. `tabId` null releases every claim; it answers with the records that
   *  were released, so a caller can say what it gave up.
   *
   *  Quitting needs no call at all: `DeviceOwnership` is runtime-only
   *  (lib.rs:732-741), so the records go with the process and the devices stay
   *  up. `kill_all_sessions` (lib.rs:703-712) ends PTY sessions and touches no
   *  device. */
  releaseDeviceOwnership: (tabId: string | null = null) =>
    invoke<OwnedDevice[]>('release_device_ownership', { tabId }),

  // --- Connections (lib.rs:348-502) ----------------------------------------
  //
  // Seven commands, registered at lib.rs:611-617. They are defined in lib.rs
  // rather than connections.rs on purpose (lib.rs:348-359): a command that
  // could not persist would be half an operation, so they live where the
  // StudioConfig field does. Their parameter names are all single lowercase
  // words — `request`, `id`, `consumer`, `enabled`, `acknowledged` — so each
  // key below is the Rust name unchanged.
  //
  // Nothing here derives a status. `installed_adapters()` is empty in this
  // build (connections.rs:471-477), so every consumer cell comes back
  // `unsupportedByAgent`, and that is the honest answer rather than a failure.
  // `connected` means a check PASSED: the backend keeps that structural by
  // marking `last_check` and `checking` `#[serde(skip)]`, so health never
  // survives a restart to be read back as a claim.

  /** The catalogue rows and the configured rows folded into one list, in
   *  backend order. A configured row carries only `id`, `connector`,
   *  `planned`, `scope` and `consumers` (connections.rs:258-266): the label,
   *  endpoint, transport and credential coordinates are NOT on this wire. */
  listConnections: () => invoke<Connection[]>('list_connections'),

  /** Records a connection, or updates the one already answering to the same
   *  connector and label — configuring twice returns the SAME id and mutates
   *  one row. Refuses a `planned` connector by name.
   *
   *  `request.credential` is a keychain REFERENCE and never a value: there is
   *  no field on `ConfigureRequest` for a secret, so nothing on this path can
   *  carry one. A filled form is `configured` and nothing more — this sets no
   *  binding, requests no connect and records no health. */
  configureConnection: (request: ConfigureRequest) =>
    invoke<ConfiguredConnection>('configure_connection', { request }),

  /** TASK 104. What Connect WOULD write, as label/value pairs, and nothing
   *  else: `connection_preview` reads the stored record and returns
   *  `connections::safe_summary` of it (lib.rs:447-454). A read — it persists
   *  nothing, which is what lets the review panel's Cancel be free.
   *
   *  The pairs are safe by CONSTRUCTION rather than by redaction: the only
   *  credential fact `safe_summary` can reach is the `(account, service)`
   *  coordinate pair, because `CredentialRef` has no third field to hold a
   *  value. So there is no filtering to do here and none is done.
   *
   *  A rejection is the backend's own sentence and is re-thrown for the host to
   *  render verbatim. */
  connectionPreview: (id: string) => invoke<[string, string][]>('connection_preview', { id }),

  /** The explicit Connect. Records an intent and contacts nothing. Refused
   *  without a credential reference, so the error names the missing step
   *  (connections.rs:749-761). */
  connectConnection: (id: string) => invoke<Connection[]>('connect_connection', { id }),

  /** One consumer's check, through that consumer's own adapter. With
   *  `installed_adapters` empty every call is refused by name. The outcome is
   *  not on the wire — the result is that one consumer's cell in the matrix
   *  that comes back. */
  checkConnection: (id: string, consumer: Consumer) =>
    invoke<Connection[]>('check_connection', { id, consumer }),

  /** Turns one consumer on or off. Per consumer and never for all three: a
   *  credential entered for Effi must not become reachable by Codex because a
   *  default said so. */
  setConnectionBinding: (id: string, consumer: Consumer, enabled: boolean) =>
    invoke<Connection[]>('set_connection_binding', { id, consumer, enabled }),

  /** Drops the bindings and KEEPS the credential reference. Disconnecting is
   *  not revoking (connections.rs:885-891) — the two are separate commands
   *  because they are separate acts, and the revoking one is below. */
  disconnectConnection: (id: string) => invoke<Connection[]>('disconnect_connection', { id }),

  /** TASK 105, the global half of the split DESIGN-SPEC.md:129 draws: drops the
   *  credential REFERENCE and deletes the secret it named from the OS keychain.
   *  Not scoped to a project, which is why it is not reachable from the
   *  disconnect above.
   *
   *  The connection itself stays, with its scope and its label, and comes back
   *  reporting `notConfigured` — which is what it then is.
   *
   *  ORDER, and it is the reason a failure here is safe: lib.rs deletes the
   *  keychain item BEFORE anything is written to studio.json and aborts if the
   *  delete was not confirmed (lib.rs:598-666). So a refused revoke changed
   *  NOTHING, and `forget_credential` already says exactly that in its own
   *  words. The rejection is re-thrown for the host to render verbatim: a
   *  generic "something went wrong" wrapped around that sentence would turn a
   *  safe, repeatable no-op into an unknown. */
  revokeConnectionCredential: (id: string) =>
    invoke<Connection[]>('revoke_connection_credential', { id }),

  /** `acknowledged` is the project ids the UI has actually shown the user,
   *  plus `connections::GLOBAL_ACKNOWLEDGEMENT` for a globally scoped
   *  connection. Anything bound and unacknowledged is refused and named, so a
   *  second attempt is an informed one. Removal is not revocation either. */
  removeConnection: (id: string, acknowledged: string[]) =>
    invoke<Connection[]>('remove_connection', { id, acknowledged }),
};

/** Each listener filters on the id itself: two open sessions must not
 *  interleave — the stronger requirement, since one project can hold several. */
export function onPtyOutput(
  sessionId: string,
  cb: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  return listen<[string, string]>('pty://output', (event) => {
    if (event.payload[0] !== sessionId) return;
    const raw = atob(event.payload[1]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    cb(bytes);
  });
}

export function onPtyExit(sessionId: string, cb: () => void): Promise<UnlistenFn> {
  return listen<string>('pty://exit', (event) => {
    if (event.payload === sessionId) cb();
  });
}

export function onProjectState(cb: (id: string, state: ProjectState) => void): Promise<UnlistenFn> {
  return listen<[string, ProjectState]>('project://state', (event) =>
    cb(event.payload[0], event.payload[1]),
  );
}
