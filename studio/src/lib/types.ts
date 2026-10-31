export type Stage = 'Idle' | 'Brainstorm' | 'Plan' | 'Refine' | 'Execute' | 'Review';

/** Mirrors the Rust GitMark in tree.rs. Three states, not a boolean: a folder
 *  inside a repository is neither a repository nor unrelated to one. */
export type GitMark = 'repo' | 'inRepo' | 'plain';

export interface Project {
  id: string;
  name: string;
  path: string;
  gitMark: GitMark;
}

/** One directory as the sidebar renders it. `hasChildren` decides whether a
 *  chevron is drawn at all, so a leaf never offers an empty expansion. */
export interface TreeChild {
  name: string;
  path: string;
  gitMark: GitMark;
  hasChildren: boolean;
}

export interface TreeLevel {
  children: TreeChild[];
  hidden: number;
}

export interface Task {
  done: boolean;
  text: string;
}

export interface HistoryEntry {
  file: string;
  branch: string;
  date: string;
  time: string;
  slug: string;
  title: string | null;
}

export interface ProjectState {
  branch: string;
  stage: Stage;
  tasks: Task[];
  done: number;
  total: number;
  featureTitle: string | null;
  rawPlan: string | null;
  history: HistoryEntry[];
  hasDecision: boolean;
  /** True once `.claude/.review-done-{branch}` exists. `stage` reads `Review`
   *  either side of that line, so this is what tells the flow bar to name git
   *  instead of offering review again. */
  reviewDone: boolean;
}

/** The five dots of the stage rail, in workflow order. `Idle` is not one of them. */
export const STAGES: Stage[] = ['Brainstorm', 'Plan', 'Refine', 'Execute', 'Review'];

export interface BranchInfo {
  name: string;
  current: boolean;
}

/** Mirrors `DiffStat` in git.rs, in its camelCase serialisation. `available`
 *  and `error` are carried alongside the counts because a clean tree and an
 *  unreadable git are different facts: zeros alone would render "0 files
 *  changed" for a missing git binary. */
export interface DiffStat {
  available: boolean;
  filesChanged: number;
  insertions: number;
  deletions: number;
  error: string | null;
}

/** `detached` is explicit rather than inferred from a null branch: the Rust
 *  side distinguishes a detached HEAD from a folder it could not read. */
export interface GitInfo {
  available: boolean;
  branch: string | null;
  detached: boolean;
  branches: BranchInfo[];
  hidden: number;
  error: string | null;
}

export type ExperienceId = 'build' | 'verify';

/** Availability comes from release configuration, never from a UI checkbox:
 *  a user cannot select their way into an unreleased experience. */
export type Availability = 'available' | 'comingSoon';

export interface Experience {
  id: ExperienceId;
  availability: Availability;
  /** Whether the user has turned it on. Always false while comingSoon. */
  enabled: boolean;
  /** Shown beside a disabled control; null when available. */
  reason: string | null;
}

export interface PanelState {
  propertiesCollapsed: boolean;
  tasksCollapsed: boolean;
  historyCollapsed: boolean;
  sidebarCollapsed: boolean;
  flowCollapsed: boolean;
}

/** Every separately installable or detectable piece gets its own id, so each
 *  one can be reported on alone. There is deliberately no id standing for the
 *  machine as a whole. */
export type ComponentId =
  | 'claude' | 'codex' | 'commands' | 'agents' | 'worker'
  | 'browser' | 'ios' | 'android' | 'memory';

/** `detected` means found on disk. It does NOT mean authenticated, and no
 *  check in this app can observe a provider login — so no status here may be
 *  read as one. `ready` is the stronger claim that a relevant diagnostic
 *  actually passed, which is why it stays separate from `detected`. */
export type ComponentStatus =
  | 'notSelected' | 'detected' | 'queued' | 'installing'
  | 'ready' | 'needsAttention' | 'unavailable';

export interface ComponentReport {
  id: ComponentId;
  status: ComponentStatus;
  /** Resolved executable or path, when the check found one. */
  detail: string | null;
  /** Verbatim failure text. Never a credential. */
  error: string | null;
  /** False means missing it blocks nothing: the UI then warns instead of
   *  gating. Nothing in the shipped product sets this for an optional tool. */
  required: boolean;
}

/** A flat list with no summary verdict, by design: the shell has to open with
 *  none of these present, so there is nothing here to collapse the reports
 *  into a single pass/fail. */
export interface Diagnostics {
  components: ComponentReport[];
}

/** The four genuinely different operations. Linking an executable the user
 *  already has, switching on something already shipped, guiding setup of a
 *  dependency this app does not own, and installing a component are not the
 *  same act — a checkbox wired to the wrong one is how "optional" setup ends
 *  up running the old install-all. */
export type SetupOp = 'linkExisting' | 'enableBundled' | 'setupExternal' | 'installSelected';

export interface SetupItem {
  id: ComponentId;
  selected: boolean;
  op: SetupOp;
  /** The files, config keys and commands this item will touch, as the Review
   *  screen reads them out before anything runs. Produced by the backend that
   *  will do the acting, never composed in the UI: a review screen that
   *  describes something other than what executes is worse than none. */
  effects: string[];
}

/** Per-item decisions only, with no aggregate verdict: each operation is
 *  dispatched on its own, so there is nothing here to total into one install. */
export interface SetupPlan {
  items: SetupItem[];
}

/** What the user ticked, one field per ComponentId and nothing else. Mirrors
 *  `Selection` at setup.rs:33-45 — its whole job is that an id with no field
 *  here cannot be put in a plan by any value a caller sends.
 *
 *  Every field is required even though the Rust side defaults an omitted one to
 *  false: on the wire a missing key selects LESS, but in the UI a forgotten key
 *  is a bug, and spelling all nine out is what makes it a type error. */
export interface Selection {
  claude: boolean;
  codex: boolean;
  commands: boolean;
  agents: boolean;
  worker: boolean;
  browser: boolean;
  ios: boolean;
  android: boolean;
  memory: boolean;
}

/** Whether a (re)run may start right now, and what stands in the way when it
 *  may not. Mirrors `RetryState` at lib.rs:167-173. Read before offering
 *  "Retry", so the control appears only where pressing it would do something.
 *  `reason` is null exactly when `canRetry` is true. */
export interface RetryState {
  canRetry: boolean;
  reason: string | null;
}

/** What a run produced. Mirrors `SetupOutcome` at setup.rs:738-753.
 *
 *  The four fields stay separate on purpose: `installerStarted` is a fact about
 *  a spawn, `readiness` is what the diagnostics then said, and collapsing them
 *  into one "ok" is the conflation that made a started process look like a
 *  finished install. */
export interface SetupOutcome {
  /** The plan that actually executed — built in Rust, never sent from here. */
  plan: SetupPlan;
  /** An installer session was spawned. Started, nothing more: not finished,
   *  not successful, not ready. */
  installerStarted: boolean;
  /** Per item, in plan order. */
  readiness: ComponentReport[];
  retry: RetryState;
}

/** What the bare, un-narrowed install.sh run covers, stated for the user who is
 *  choosing it. Mirrors `LegacyInstall` at setup.rs:508-519. */
export interface LegacyInstall {
  /** The install.sh section names a bare invocation runs. */
  components: string[];
  /** What those sections touch, including the three no component can ask for —
   *  the reason this operation needs spelling out at all. */
  effects: string[];
  /** True only once an installer session has been started for it. Started, not
   *  finished and not ready: readiness is `setupReadiness`'s answer. */
  started: boolean;
}

/** `unsupportedByAgent` is not a kind of `failed`: a consumer with no adapter
 *  never attempted anything, so nothing about it broke. `disabled` is likewise
 *  a choice, not an error. */
export type ConnectionStatus =
  | 'notConfigured' | 'configured' | 'checking' | 'connected'
  | 'needsAuthentication' | 'failed' | 'disabled' | 'unsupportedByAgent';

export type Consumer = 'effi' | 'claude' | 'codex';

export interface Connection {
  id: string;
  connector: 'jira' | 'customMcp' | 'github' | 'figma';
  /** Planned connectors have no adapter and offer no Configure action. */
  planned: boolean;
  scope: { global: boolean; projectIds: string[] };
  /** Per consumer, from that adapter's own check. Connected to Effi says
   *  nothing about Codex. A record rather than one `connected` flag because a
   *  single boolean would make that difference unrepresentable, which is the
   *  confusion this whole shape exists to prevent. */
  consumers: Record<Consumer, ConnectionStatus>;
}

/** Mirrors `CredentialRef` (connections.rs:296-302), including its lack of a
 *  third field: there is nowhere here to put a secret, so no wrapper, state or
 *  log on this path can carry one. `kind` is the single-variant `CredentialKind`
 *  (connections.rs:279-283), camelCased by serde as `apiToken`. */
export interface CredentialRef {
  service: string;
  account: string;
  kind: 'apiToken';
}

/** What `configure_connection` takes. Mirrors `ConfigureRequest`
 *  (connections.rs:647-660) field for field — and `ConfigureDraft` in
 *  connections-page.tsx is structurally this, which is why the page's draft is
 *  handed straight to the wrapper instead of being remapped.
 *
 *  Every `Option<T>` there carries `#[serde(default)]`, so `null` is accepted
 *  for the four optional fields. */
export interface ConfigureRequest {
  connector: Connection['connector'];
  label: string;
  endpoint: string | null;
  transport: string | null;
  credential: CredentialRef | null;
  scope: Connection['scope'];
}

/** Mirrors `ConfiguredConnection` (lib.rs:416-421). The id comes back beside
 *  the refreshed matrix because connect, check and bind are all keyed on it,
 *  and configuring twice answers with the SAME id rather than a second row
 *  (connections.rs:699-716). */
export interface ConfiguredConnection {
  id: string;
  connections: Connection[];
}

/* ------------------------------------------------------------------------- *
 * The Browser tab.
 *
 * `embeddedSurface` is false on this build and every one of these shapes says
 * so rather than leaving it to be assumed: browser.rs:1-51 establishes against
 * the vendored crate source that Tauri 2.12.5 gates `Window::add_child` behind
 * `unstable` and exposes no history navigation on `Webview` at all. There is no
 * viewport behind these types, and nothing here describes one.
 * ------------------------------------------------------------------------- */

/** Mirrors `PaneBounds` (browser.rs:378-384). Crosses in both directions: the
 *  frontend measures the pane and sends it, and reads back whatever survived
 *  the drawable-geometry guard (browser.rs:387-400). */
export interface PaneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Mirrors `BrowserCapability` (browser.rs:110-123). Read before the tab draws
 *  its main area, so a build that cannot embed shows the controller and the
 *  external handoff instead of an empty box that reads as a failed load.
 *
 *  `reason` is null exactly when `embeddedSurface` is true. The three string
 *  fields are the backend's own wording and are shown verbatim — a second
 *  paraphrase of the same limitation in the UI is how two explanations drift. */
export interface BrowserCapability {
  embeddedSurface: boolean;
  tauriVersion: string;
  reason: string | null;
  fallback: string;
  deniedToRemoteContent: string[];
  cspRequirement: string;
}

/** Mirrors `BrowserView` (browser.rs:511-534) — every field, so no caller has
 *  to merge two partial pictures. Every browser command but `browser_close` and
 *  `browser_open_externally` answers with one of these. */
export interface BrowserView {
  tabId: string;
  projectId: string;
  /** `null` on a pane opened but never navigated — a blank tab is a real
   *  state, not an error (browser.rs:516-518). */
  url: string | null;
  /** One step through the addresses THIS TAB HAS HELD, never a document's
   *  session history: there is no document on this path and no API to ask one
   *  (browser.rs:402-416). */
  canGoBack: boolean;
  canGoForward: boolean;
  /** A reading of `url`, never a probe (browser.rs:263-268). */
  loopback: boolean;
  visible: boolean;
  bounds: PaneBounds | null;
  /** Hex of this project's 16-byte store id, published so the isolation is
   *  observable rather than merely asserted. */
  storageScope: string;
  /** Repeated on every view and never cached at mount: a stale capability is
   *  how a tab ends up drawing a surface this build cannot host. */
  embeddedSurface: boolean;
  generation: number;
}

/** The subset of `BrowserView` the Browser pane actually draws from.
 *
 *  Declared separately and structurally — a `BrowserView` is assignable to it —
 *  so the pane states in its own type exactly which fields it reads, and adding
 *  a field to the wire shape does not widen what the pane is allowed to touch.
 *  It lived in browser-pane.tsx until the wrappers below landed; the pane now
 *  imports it from here and no call site in it changed. */
export interface BrowserPaneView {
  tabId: string;
  /** `null` on a tab that is open but has never been navigated: a blank tab is
   *  a real state, not an error (`browser.rs:516-518`). */
  url: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  /** A reading of `url`, never a probe (`browser.rs:263-268`). */
  loopback: boolean;
  /** `false` on this build. Published per view, not cached at mount, exactly so
   *  the pane cannot keep drawing a surface the backend stopped offering. */
  embeddedSurface: boolean;
}

/**
 * What the current address is doing, as reported by whoever owns the tab.
 *
 * The Browser pane never invents one of these. It cannot: with no surface there
 * is no request to observe, so a `certificate` or `download` state can only
 * come from a caller that genuinely saw one — a later build with an embedded
 * surface, or an explicit probe someone writes. Keeping the discriminant in the
 * props is what makes "this pane never guesses" checkable rather than promised.
 *
 * On this build the host only ever reports `idle` and `loading`: there is
 * nothing in the tree that can observe a certificate, a download or a popup, so
 * the other four variants have no producer yet and are reachable only by a
 * caller that adds one.
 */
export type BrowserPageState =
  /** Nothing in flight and nothing wrong. The pane shows the address itself. */
  | { kind: 'idle' }
  /** A load is under way with no measurable progress — which is every load
   *  this app can see. Rendered indeterminate, never as a percentage. */
  | { kind: 'loading' }
  /** Nothing answered. Distinct from `certificate`, which is something
   *  answering with an identity that could not be checked. */
  | { kind: 'unreachable'; detail?: string | null }
  /** Something answered; its certificate did not verify. Never shares copy with
   *  `unreachable`, and offers no bypass — there is no "continue anyway" here,
   *  by design and not by omission. */
  | { kind: 'certificate'; detail?: string | null }
  /** The address resolved to a file rather than a page. Nothing is downloaded
   *  by the pane. */
  | { kind: 'download'; filename: string }
  /** A second window was requested. Nothing was opened; the address is offered
   *  to the user, who decides. */
  | { kind: 'popup'; url: string }
  /** Any other reported failure, in the reporter's own words. */
  | { kind: 'error'; message: string };

// --- Devices (devices.rs) ---------------------------------------------------
//
// The eleven wire types the device tab speaks, moved here from
// device-pane.tsx for the reason `BrowserPaneView` above moved: the pane
// declared them while no IPC layer existed, and the wrappers that now carry
// them live in `tauri-api.ts`, which is in `lib/` and must not import from
// `components/`. They are the SAME declarations, confirmed field for field
// against the Rust structs' `#[serde(rename_all = "camelCase")]` shapes, and
// device-pane.tsx imports them back and re-exports them — no call site in it
// changed, and there is no second, drifting copy anywhere.
//
// Nothing here is read-write. Discovery is read-only on the Rust side
// (devices.rs:675-676) and a device starts only because `launch_device` was
// called from a press.

/** `DevicePlatform` (devices.rs:67-72). `Deserialize` on the Rust side too,
 *  because launch and stop take it back from here. */
export type DevicePlatform = 'ios' | 'android';

/** `FactState` (devices.rs:80-86). Three answers, not two: "we looked and it
 *  is not there" and "we never looked" lead to different screens, and the
 *  second one carries no repair — see `DeviceFact.fix`. */
export type FactState = 'present' | 'absent' | 'unknown';

/** `DeviceFact` (devices.rs:92-104). One fact, with its own evidence and its
 *  own repair. The repair belongs to the fact, because the fix for a missing
 *  device is not the fix for missing tools.
 *
 *  `fix` is null on every `unknown` fact, deliberately and permanently
 *  (devices.rs:144-151). The pane shows no next step for one. */
export interface DeviceFact {
  state: FactState;
  evidence: string | null;
  problem: string | null;
  fix: string | null;
}

/** `DeviceReadiness` (devices.rs:167-174) — the same four words the tool
 *  chooser uses. Derived from the facts and never a substitute for them. */
export type DeviceReadiness =
  | 'notEnabled'
  | 'dependencyMissing'
  | 'runtimeOrDeviceMissing'
  | 'available';

/** `DeviceEntry` (devices.rs:184-192). `id` is a UDID on iOS and the AVD name
 *  on Android — whatever a launch has to pass back to address this exact
 *  device. `runState` is the tool's own vocabulary and is `null` on Android,
 *  where `-list-avds` says nothing about what is live (devices.rs:936-943).
 *
 *  Being listed here is not being owned by this app. */
export interface DeviceEntry {
  id: string;
  name: string;
  runState: string | null;
}

/** `DeviceReport` (devices.rs:194-215). Four independent facts plus the
 *  readiness derived from them. */
export interface DeviceReport {
  platform: DevicePlatform;
  platformSupported: boolean;
  tools: DeviceFact;
  runtime: DeviceFact;
  devices: DeviceFact;
  readiness: DeviceReadiness;
  /** Empty whenever `devices` is not `present`, including when it is
   *  `unknown`: a list filled in from a failed probe would be a guess. */
  found: DeviceEntry[];
  /** `false` on this build. */
  embeddedPreview: boolean;
}

/** `DeviceDiscovery` (devices.rs:216-220) — what `discover_devices` answers
 *  with. Both platforms, always, in a fixed order, because a probe that failed
 *  is one platform's bad news and never the other's. */
export interface DeviceDiscovery {
  platforms: DeviceReport[];
}

/** `OwnedDevice` (devices.rs:777-796) — the wire half of a claim. Everything
 *  needed to decide whether to offer Stop, and nothing that could stop
 *  something else. */
export interface OwnedDevice {
  platform: DevicePlatform;
  deviceId: string;
  deviceName: string;
  /** The tab that asked. Stop from another tab is refused. */
  tabId: string;
  startedAtUnixMs: number;
  /** `false` is still owned: a boot that was issued but did not confirm must
   *  stay stoppable (devices.rs:1035-1046). */
  startConfirmed: boolean;
  note: string | null;
  /** How Stop will act on this exact claim, in words shown before the user
   *  commits. */
  stopAction: string;
}

/** `LaunchStatus` (devices.rs:865-885). Seven words rather than a boolean and
 *  a sentence, because the next step differs for every one of them. */
export type LaunchStatus =
  | 'launched'
  | 'alreadyOwnedHere'
  | 'ownedByAnotherTab'
  | 'runningOutsideApp'
  | 'notADiscoveredDevice'
  | 'prerequisitesMissing'
  | 'couldNotStart';

/** `LaunchOutcome` (devices.rs:887-903). */
export interface LaunchOutcome {
  status: LaunchStatus;
  readiness: DeviceReadiness;
  /** The claim when one exists, including a pre-existing claim this tab may not
   *  use. `null` for every refusal. */
  owned: OwnedDevice | null;
  problem: string | null;
  /** The blocking fact's own repair — and `null` when that fact is `unknown`,
   *  because the backend publishes none and the pane does not invent one. */
  fix: string | null;
  embeddedPreview: boolean;
  /** `EXTERNAL_WINDOW_NOTE` (devices.rs:729), carried on every outcome and
   *  shown verbatim. */
  windowNote: string;
}

/** `StopStatus` (devices.rs:1226-1239). `notOwnedByApp` is the refusal the
 *  spec asks for by name: this app never started that device, however plainly
 *  the tool reports it as running. */
export type StopStatus = 'stopped' | 'notOwnedByApp' | 'ownedByAnotherTab' | 'didNotConfirm';

/** `StopOutcome` (devices.rs:1241-1250). `owned` is `null` once the claim is
 *  gone, and the unchanged claim when a failed stop kept it. */
export interface StopOutcome {
  status: StopStatus;
  owned: OwnedDevice | null;
  problem: string | null;
  fix: string | null;
}
