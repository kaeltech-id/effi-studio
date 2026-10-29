import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChooseExperiences,
  NeutralShell,
  type ExperienceIntent,
} from './components/choose-experiences';
import {
  ChooseTools,
  draftSetupPlan,
  initialSelection,
  type ToolSelection,
} from './components/choose-tools';
import { BrowserPane } from './components/browser-pane';
import {
  ConnectionsPage,
  type ConfigureDraft,
  type ConnectionDetail,
  type PreviewLine,
} from './components/connections-page';
import { DevicePane } from './components/device-pane';
import { ExperienceSelector } from './components/experience-selector';
import { InstallPane } from './components/install-pane';
import { ProjectSidebar } from './components/project-sidebar';
import { SettingsPage } from './components/settings-page';
import { ReviewSetup, SetupStates, toWireSelection } from './components/setup-states';
import { VerifyLanding } from './components/verify-landing';
import { FlowBar, type FlowAway, type FlowTarget } from './components/flow-bar';
import { Inspector, Workbench } from './components/workbench';
import { type WorkspaceToolKind } from './components/add-tool-menu';
import { api, onProjectState } from './lib/tauri-api';
import { type Agent } from './lib/agents';
import { type Tab, type TabType } from './lib/tabs';
import { nextStep } from './lib/flow';
import { useShortcuts } from './lib/use-shortcuts';
import {
  type BrowserCapability,
  type BrowserPageState,
  type BrowserView,
  type ComponentReport,
  type Connection,
  type Consumer,
  type DevicePlatform,
  type DeviceReport,
  type Diagnostics,
  type Experience,
  type ExperienceId,
  type LaunchOutcome,
  type OwnedDevice,
  type Project,
  type GitInfo,
  type PanelState,
  type ProjectState,
  type SetupPlan,
  type StopOutcome,
  type TreeLevel,
} from './lib/types';

/** Only the three fields a sidebar row renders. A `.claude/` write that
 *  changes none of them must not light up a marker. */
function seenKey(s: ProjectState | undefined): string {
  return s ? `${s.stage}:${s.done}:${s.total}` : '';
}

/** One frozen empty list, so a render before the probe answers does not hand
 *  the onboarding screens a new array — and a new tool plan — every pass. */
const NO_REPORTS: ComponentReport[] = [];

/** One frozen empty list for a project whose tabs have not been read yet, so
 *  a render before the read lands does not hand the workbench a fresh array —
 *  and a fresh set of pane wrappers — on every pass. */
const NO_TABS: Tab[] = [];

/** The two kinds that run a process, and therefore the only two a session is
 *  reserved for. A browser, simulator or emulator tab owns no PTY, which is
 *  exactly why closing one never reaches pty_close. */
function needsSession(tab: Tab): boolean {
  if (tab.type === 'shell') return true;
  return tab.type === 'agent' && tab.providerId !== null;
}

/** The platform a device tab addresses, or null for a tab that is not one.
 *
 *  Read off `tab.type`, which is fixed when the tab is opened
 *  (tabs.rs:157-180), and never guessed from a title: a shell tab called
 *  "android" is a shell. The null arm is what keeps the device render prop
 *  from handing a non-device tab a platform it does not have. */
function devicePlatformOf(tab: Tab): DevicePlatform | null {
  if (tab.type === 'ios') return 'ios';
  if (tab.type === 'android') return 'android';
  return null;
}

/** Whether this tab can be holding a device claim — the only question the
 *  close and remove paths below need to ask. */
function isDeviceTab(tab: Tab): boolean {
  return devicePlatformOf(tab) !== null;
}

/** One frozen empty list for a project with no connections read yet, so a
 *  render before `list_connections` answers does not hand the Connections
 *  surface a new array every pass. */
const NO_CONNECTIONS: Connection[] = [];

/** One frozen empty list, so a render before `owned_devices` answers does not
 *  hand every device pane a new array — and a new ownership reading — on every
 *  pass. Empty is also the honest resting state: this app claims nothing until
 *  it has launched something. */
const NO_OWNED_DEVICES: OwnedDevice[] = [];

/** One frozen empty map, for the same reason, and for one more: `details` is
 *  what this build genuinely does NOT have a backend source for (see
 *  `connectionDetails` below), so the empty case is the common case and must
 *  not be a fresh object literal in the render. */
const NO_DETAILS: Record<string, ConnectionDetail | undefined> = {};

/** One frozen empty map for the held previews, for the same identity reason as
 *  `NO_DETAILS`, and because empty is the honest resting state: a preview is
 *  something the user asked for, so nothing is in here until they do. */
const NO_PREVIEWS: Record<string, readonly PreviewLine[] | undefined> = {};

/** The way out of the Connections surface.
 *
 *  It exists because Connections hides the workspace, and the workbench header
 *  that carries the Settings button goes with it — so without this the surface
 *  the Settings drawer sends the user to has no door. Rendered by App rather
 *  than added to connections-page.tsx: the page owns no navigation, and the
 *  host is the only thing that knows what is behind it.
 *
 *  Not styled as the primary action. Copper is selection and the primary act,
 *  and the primary act on this surface is on the page. */
function ConnectionsExit({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-surface px-4">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-border px-2 py-1 text-xs leading-[18px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none"
      >
        ← Back to the workspace
      </button>
    </div>
  );
}

/**
 * The host for ONE browser tab: the per-tab state behind `browser-pane.tsx`,
 * and the only place the eleven `browser_*` wrappers are called.
 *
 * # There is no viewport here, and this component does not draw one
 *
 * `browser.rs:1-51` establishes — against the vendored source of the pinned
 * crate and the published docs for that exact version — that this build cannot
 * host an embedded browsing surface: `Window::add_child` is gated behind
 * `unstable`, and even with the feature on, Tauri 2.12.5 exposes no history
 * navigation on `Webview` at all. So this is an address controller plus the
 * `Open externally` handoff, and nothing below frames a remote page, draws
 * chrome around an empty box, or claims a surface exists.
 *
 * # Mounted once per browser tab and never swapped out
 *
 * It is rendered from `Workbench`'s `tabs.map`, under the tab's own id, and
 * hidden by a class when the tab is not in front — the same invariant every
 * other pane keeps. Nothing here unmounts on a selection change, so the tab's
 * address, its typed draft and its registry entry all survive one.
 *
 * # Nothing is probed, started or guessed
 *
 * `loopback` is a reading of the string the user typed (`browser.rs:263-268`),
 * never a request; no dev server is looked for or launched. `page` is only ever
 * `idle` or a verbatim refusal from the one call this component makes on its
 * own initiative — the open. Every other `BrowserPageState` variant needs a
 * caller that genuinely observed a certificate, a download or a popup, and
 * there is nothing in this build that can.
 */
function BrowserTabPane({
  tabId,
  projectId,
  active,
  capability,
}: {
  tabId: string;
  projectId: string;
  /** Whether this tab is the one in front. Reported to the backend through
   *  `browser_set_visibility` so the registry's own `visible` flag is a fact
   *  about the screen rather than an assumption. */
  active: boolean;
  /** Read once for the whole app, never per tab — but it is `browser_view`'s
   *  per-view `embeddedSurface` the pane actually renders from, so a capability
   *  cached here cannot keep a surface on screen after the backend stops
   *  offering one. Null while the read is in flight or after it rejected. */
  capability: BrowserCapability | null;
}) {
  const [view, setView] = useState<BrowserView | null>(null);
  /** False until `browser_open` has answered. The visibility and bounds
   *  effects below wait on it rather than on `view`, which is what keeps them
   *  from re-firing on the view each of them sets. */
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<BrowserPageState>({ kind: 'idle' });
  /** React 19 StrictMode double-invokes effects. `browser_open` is itself
   *  idempotent — a second open on one id answers with the tab already there
   *  (browser.rs:594-597) — but the second invoke would still race its own
   *  answer, so the open is claimed here exactly the way App claims a pty
   *  reservation with `opening`. A ref, not state: the guard has to survive the
   *  re-run without being a render input. */
  const opened = useRef(false);
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    // `browser_view` FIRST, `browser_open` only if there is nothing to read.
    // That is what the view command is for (browser.rs:712-718): a pane that
    // re-mounts redraws from the registry entry already there instead of
    // asking for a second one. `browser_open` is idempotent too, so either
    // order is safe — this one is the one that cannot create.
    //
    // The open is BLANK: no url argument. Opening a tab must not navigate
    // anywhere the user did not ask for, and a blank tab is a real state
    // rather than an error (browser.rs:516-518).
    void api
      .browserView(tabId)
      .catch(() => api.browserOpen(tabId, projectId))
      .then((v) => {
        setView(v);
        setReady(true);
      })
      // The one failure this component genuinely observed, in the backend's own
      // words. Not swallowed: a pane with no view and no explanation reads as a
      // surface that failed to load, which is the single thing this file must
      // never look like.
      .catch((e: unknown) => setPage({ kind: 'error', message: String(e) }));
  }, [tabId, projectId]);

  useEffect(() => {
    if (!ready) return;
    void api
      .browserSetVisibility(tabId, active)
      .then(setView)
      .catch(() => {});
  }, [tabId, active, ready]);

  // The pane measures itself and reports it. Bookkeeping on this build — there
  // is no surface to position — but it is a real measurement of a real element,
  // and the backend drops one that is not drawable and keeps the last good
  // geometry (browser.rs:387-400), so a hidden pane's 0x0 is an ordinary event
  // rather than a value that poisons the registry.
  useEffect(() => {
    if (!ready) return;
    const el = host.current;
    if (!el) return;
    let frame = 0;
    const report = () => {
      const r = el.getBoundingClientRect();
      void api
        .browserSetBounds(tabId, {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        })
        .then(setView)
        .catch(() => {});
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(report);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [tabId, ready]);

  /** Every op answers with a fresh view, and a rejection is RE-THROWN: the pane
   *  catches it and shows the backend's sentence verbatim beside the control
   *  that was pressed (browser-pane.tsx `run`). Swallowing it here is how a
   *  refused scheme becomes a control that silently does nothing. */
  const run = async (call: () => Promise<BrowserView>) => {
    setView(await call());
  };

  if (view === null) {
    return (
      <section
        ref={host}
        className="flex h-full w-full flex-col items-center justify-center gap-2 px-8 text-center"
      >
        <h2 className="text-sm leading-[20px] font-semibold text-text">Browser</h2>
        <p className="max-w-[420px] text-xs leading-[18px] text-muted">
          {page.kind === 'error' ? page.message : 'Opening this tab’s address controller…'}
        </p>
      </section>
    );
  }

  return (
    <div ref={host} className="h-full w-full">
      <BrowserPane
        view={view}
        page={page}
        fallbackLabel={capability?.fallback ?? 'Opens in a separate window'}
        surfaceReason={capability?.reason ?? null}
        onNavigate={(url) => run(() => api.browserNavigate(tabId, url))}
        onBack={() => run(() => api.browserBack(tabId))}
        onForward={() => run(() => api.browserForward(tabId))}
        onReload={() => run(() => api.browserReload(tabId))}
        onOpenExternally={() => api.browserOpenExternally(tabId)}
      />
    </div>
  );
}

/**
 * The host for ONE device tab: `device-pane.tsx` plus the per-tab bookkeeping
 * that does not belong in it, and the only place the five `devices.rs`
 * commands are called from.
 *
 * # Nothing here starts a device
 *
 * There is no `useEffect` in this component and none in the pane below it, and
 * that is the mechanism rather than a promise: there is no code path from
 * mounting this, from opening a device tab, or from bringing one forward to
 * `launch_device`. The only caller is the pane's Launch button, through
 * `onLaunch`. Discovery and the ownership read are the host's, they are
 * read-only on the Rust side (devices.rs:675-676, 1425-1431), and neither can
 * install a runtime or accept a licence — there is no command in this binary
 * that could.
 *
 * # There is no viewport here, and this component does not draw one
 *
 * `EMBEDDED_PREVIEW_SUPPORTED` is false (devices.rs:58): a native simulator or
 * emulator belongs to CoreSimulator or to its own process and cannot be drawn
 * into the webview this app renders in. So the pane is a control surface and a
 * launched device opens in its own window, in the backend's own words — see
 * `windowNote` below, which is passed through verbatim and never re-phrased.
 *
 * # Mounted once per device tab and never swapped out
 *
 * It is rendered from `Workbench`'s `tabs.map`, under the tab's own id, and
 * hidden by a class when the tab is not in front — the same invariant every
 * other pane keeps. Nothing here unmounts on a selection change, so a launch
 * outcome, the chosen device and the claim behind them all survive one.
 */
function DeviceTabPane({
  tabId,
  platform,
  report,
  problem,
  owned,
  onLaunch,
  onStop,
  onCloseTab,
  onCheckAgain,
}: {
  tabId: string;
  /** Taken from `tab.type` by `devicePlatformOf`, so this tab can only ever
   *  address the platform it was opened for. */
  platform: DevicePlatform;
  /** This platform's report from `discover_devices`, or null while the read is
   *  in flight or after it rejected. */
  report: DeviceReport | null;
  /** The discovery refusal, verbatim, or null. Shown instead of a permanent
   *  "checking…" — a probe that failed and said nothing reads as a surface that
   *  hung. */
  problem: string | null;
  /** Every claim this app holds, passed WHOLE rather than pre-filtered: the
   *  pane has to tell "owned by another tab" from "owned by nobody", which are
   *  two refusals with two different answers. */
  owned: OwnedDevice[];
  onLaunch: (tabId: string, platform: DevicePlatform, deviceId: string) => Promise<LaunchOutcome>;
  onStop: (tabId: string, platform: DevicePlatform, deviceId: string) => Promise<StopOutcome>;
  /** Releases this tab's claim and closes the tab. It stops nothing. */
  onCloseTab: () => Promise<void>;
  onCheckAgain: () => Promise<void>;
}) {
  /** The backend's own `window_note`, kept once a launch has answered with one
   *  and handed straight back. Null until then, which leaves the pane's own
   *  default standing — the same literal as `EXTERNAL_WINDOW_NOTE`
   *  (devices.rs:729) — rather than this host composing a sentence about what
   *  a launch will look like. Nothing here re-words it either way. */
  const [windowNote, setWindowNote] = useState<string | null>(null);

  if (report === null) {
    return (
      <section className="flex h-full w-full flex-col items-center justify-center gap-2 px-8 text-center">
        <h2 className="text-sm leading-[20px] font-semibold text-text">
          {platform === 'ios' ? 'iOS Simulator' : 'Android Emulator'}
        </h2>
        <p className="max-w-[420px] text-xs leading-[18px] text-muted">
          {problem ??
            'Checking what this machine already has. Looking installs nothing and starts nothing.'}
        </p>
      </section>
    );
  }

  return (
    <DevicePane
      tabId={tabId}
      report={report}
      owned={owned}
      windowNote={windowNote ?? undefined}
      // `setupLocation` is deliberately NOT passed. The pane uses it in one
      // place — the `notEnabled` state's next step, for a platform that IS
      // supported — and this backend returns `notEnabled` only when
      // `platform_supported` is false (devices.rs:231-233), which takes the
      // other arm. There is no screen in this build that switches iOS or
      // Android on, so naming one here would be a repair for a state the user
      // cannot be in.
      onLaunch={async (deviceId) => {
        const outcome = await onLaunch(tabId, platform, deviceId);
        setWindowNote(outcome.windowNote);
        return outcome;
      }}
      onStop={(deviceId) => onStop(tabId, platform, deviceId)}
      onCloseTab={onCloseTab}
      onCheckAgain={onCheckAgain}
    />
  );
}

export default function App() {
  // The startup probe's result. Read by the Diagnostics section of Settings
  // and by nothing else: no branch in this component depends on it, so the
  // shell renders identically whether it is null, full or stale. The probe runs
  // at startup so that section opens with data already in hand.
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  // What the backend says has shipped and what the user has turned on, or null
  // while the read is in flight or after it rejected. The selector owns its own
  // copy (experience-selector.tsx:146-157) because availability is a release
  // fact; this copy exists only to answer "which surface do we show", so a
  // stale or absent answer must not be able to withhold the workspace.
  const [experiences, setExperiences] = useState<Experience[] | null>(null);
  // Which of the three surfaces is open. Navigation only — never enablement:
  // 'verify' is reachable while Verify is off, which is the one thing an
  // unreleased experience can do. This value HIDES the workspace, it never
  // replaces it (see the render below).
  const [view, setView] = useState<'build' | 'verify' | 'shell'>('build');
  // Which onboarding step is open, or null for none. A surface beside the
  // other three rather than a stage the workspace passes through: like 'verify'
  // and 'shell' below, this HIDES the workspace and never replaces it.
  // 'review' and 'setup' are the two steps a plan that installs something adds
  // after 'tools'; a plan that installs nothing goes straight to null.
  const [onboarding, setOnboarding] = useState<'experiences' | 'tools' | 'review' | 'setup' | null>(
    null,
  );
  // The queued tool intent of onboarding step two, or null while the user has
  // touched nothing — null falls back to what the probe found, so a diagnostic
  // that lands after the screen is up still pre-fills it. Nothing is acted on
  // until the step's own button is pressed.
  const [toolSelection, setToolSelection] = useState<ToolSelection | null>(null);
  // The workbench's tab metadata, keyed by project id and holding exactly what
  // tabs.rs answered. Keyed per project, never flattened: a slow read for one
  // project must not be able to write over another's arrangement, and removing
  // a project has to be able to name that project's tabs and only those.
  const [tabsByProject, setTabsByProject] = useState<Record<string, Tab[]>>({});
  // Which tab is in front, per project. Selection only: every other tab's pane
  // stays mounted behind it (see the render below).
  const [activeTabs, setActiveTabs] = useState<Record<string, string | null>>({});
  // Session id per TAB id — the one-session-per-project bridge this replaces
  // was keyed by project, which is why it could only ever hold one. The id is
  // RESERVED here and the process is started by the pane that holds it, so the
  // pane's subscriptions are live before anything can write to the session.
  // Only ever added to for a given tab, so no pane is remounted by a selection
  // change.
  const [sessions, setSessions] = useState<Record<string, string>>({});
  /** Reservations in flight, keyed by tab id, so a re-render between the
   *  request and its answer cannot hand one TAB two sessions — and so the pane
   *  that starts the process is only ever mounted once per tab. A ref rather
   *  than state: StrictMode runs the effect below twice, and the guard has to
   *  survive that without being a render input. Without it every tab would
   *  spawn two processes in development. */
  const opening = useRef<Set<string>>(new Set());
  /** Projects whose tab list has been requested. Same StrictMode guard, for a
   *  read rather than a reservation: the second invoke must not re-ask and
   *  race its own answer. */
  const tabsRequested = useRef<Set<string>>(new Set());
  // The installer panes are the only readers, and they only need an id to
  // subscribe with — nothing here gates on having one.
  const [installId, setInstallId] = useState<string | null>(null);
  // Why the last Settings install attempt did not start, or null. The backend
  // refuses a run whose installer is still alive and says so in a sentence
  // (lib.rs:149); swallowing that rejection is how a refused retry became a
  // dead button that reported nothing.
  const [installError, setInstallError] = useState<string | null>(null);
  // Settings is a surface the user opens, never one they are sent to. Local
  // state, not PanelState: that struct mirrors a persisted Rust type.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // --- TASK 110. The two width-driven drawers ------------------------------
  //
  // ONE field holding at most one name, rather than two booleans. That is the
  // whole mechanism behind "only one overlay may be open at a time below
  // 900px": opening the inspector writes 'inspector' over 'sidebar', so there
  // is no reachable state in which both are up, and no effect has to notice a
  // second one and close the first.
  //
  // Deliberately NOT in `PanelState`. That struct is persisted to studio.json
  // (`sidebarCollapsed`, `propertiesCollapsed`), and a drawer is a presentation
  // of the CURRENT WINDOW WIDTH rather than a preference the user chose —
  // writing one into studio.json would mean dragging a window edge silently
  // rewrites their settings. Nothing in this file derives a panel preference
  // from a width, and there is no resize listener here at all: every band below
  // is a CSS `min-[…]` variant, so the layout changes without this component
  // re-rendering and without anything being stored.
  //
  // The collapse preference still decides whether the sidebar EXISTS (the
  // `!panels.sidebarCollapsed` guard in the render is untouched); this decides
  // only where the existing column is drawn.
  const [overlay, setOverlay] = useState<'sidebar' | 'inspector' | null>(null);
  // --- Connections ---------------------------------------------------------
  //
  // TASK 109. ONE Connections surface, mounted beside the workspace. Both
  // entry points flip this one flag: the Settings drawer's Connections section
  // below, and the sidebar's Connections entry — which is a row in
  // experience-selector.tsx and will call exactly this setter rather than
  // mounting a second copy of the page. A duplicate would be two drafts, two
  // error strings and two readings of the same matrix.
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  // The matrix as `list_connections` answered it: catalogue rows and configured
  // rows folded into one list, in backend order. Never patched row by row —
  // every mutating command answers with the whole refreshed list for exactly
  // that reason (lib.rs:383-391).
  const [connections, setConnections] = useState<Connection[]>(NO_CONNECTIONS);
  // THE KNOWN GAP, and it is not papered over anywhere below.
  //
  // `Connection` on the wire carries five fields — id, connector, planned,
  // scope, consumers (connections.rs:255-266) — and deliberately no more. The
  // label, the endpoint, the transport and the credential COORDINATES live on
  // `ConnectionRecord` (connections.rs:521-576), and NO registered command
  // returns one: lib.rs:611-617 registers seven connections commands and a
  // detail read is not among them.
  //
  // So this map is a session echo and says so: the only entries in it are what
  // the user themselves typed into the configure form in THIS session, keyed by
  // the id `configure_connection` answered with, plus `connectRequested` set
  // from a `connect_connection` that actually succeeded. Nothing here is
  // derived, defaulted or inferred from an id.
  //
  // What that means on screen, plainly: after a relaunch a connection that IS
  // stored on disk comes back from `list_connections` with its scope and its
  // consumer cells and nothing else, so the page shows it at the Configure step
  // again. That is the honest rendering of what this build can read. When the
  // detail command lands, this state is replaced by its answer and no call site
  // in connections-page.tsx changes.
  const [connectionDetails, setConnectionDetails] =
    useState<Record<string, ConnectionDetail | undefined>>(NO_DETAILS);
  // Verbatim backend refusal text. Cannot contain a credential: no function
  // upstream of it holds one — `CredentialRef` has nowhere to put a value.
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  // TASK 104. What `connection_preview` answered, keyed by connection id, and
  // ONLY for rows the user actually asked about: an absent entry is "not
  // fetched", which is what keeps Apply off the screen until the pairs are in
  // hand. The entry is dropped again by every command that rewrites the record
  // it described (see `forgetPreview`), so a stale preview can never be served
  // back as a description of what Connect would write now.
  const [connectionPreviews, setConnectionPreviews] =
    useState<Record<string, readonly PreviewLine[] | undefined>>(NO_PREVIEWS);
  // The preview's own refusal and the revoke's own refusal, kept apart from
  // `connectionsError` because the page renders each beside the control that
  // produced it. Both are rendered VERBATIM and nothing in this file adds a
  // sentence to either — see the two handlers below for why that matters for
  // the revoke in particular.
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  // Read once, for the Browser panes' `fallback` and `reason` strings. A failed
  // read leaves it null and each pane falls back to its own default copy; it
  // never withholds the pane, because the per-view `embeddedSurface` the pane
  // actually renders from comes from `browser_open`/`browser_view`.
  const [browserCapability, setBrowserCapability] = useState<BrowserCapability | null>(null);
  // --- Devices -------------------------------------------------------------
  //
  // Both platforms' reports as `discover_devices` answered, or null until it
  // has. Read once for the whole app rather than per tab: the facts are about
  // the MACHINE, not about a tab, and two device tabs asking the same question
  // twice would pay for the same probes twice.
  const [deviceReports, setDeviceReports] = useState<DeviceReport[] | null>(null);
  // The discovery refusal, verbatim. Kept rather than swallowed: unlike every
  // other read in this file, a failed device probe leaves a surface with
  // nothing to draw, and a pane that says nothing about why reads as one that
  // hung.
  const [deviceProblem, setDeviceProblem] = useState<string | null>(null);
  // What this app CLAIMS — never what is merely running. A simulator the user
  // started themselves is listed by discovery and is absent from here, which
  // is exactly how the pane knows Stop is not ours to offer for it. Nothing
  // below synthesises an entry from running-ness.
  const [ownedDevices, setOwnedDevices] = useState<OwnedDevice[]>(NO_OWNED_DEVICES);
  const [focusNonce, setFocusNonce] = useState(0);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [gitBusy, setGitBusy] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [panels, setPanelsState] = useState<PanelState>({
    propertiesCollapsed: false,
    tasksCollapsed: false,
    historyCollapsed: false,
    sidebarCollapsed: false,
    flowCollapsed: false,
  });
  // The provider registry, read for one question only: what the provider
  // behind a surface DECLARES it can do (agents.rs:128-132). A failed read
  // leaves the list empty, which withholds the workflow row rather than
  // guessing a capability from an id or a name — the same degrade-silently
  // contract as the diagnostics probe above.
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Keyed by project id: a slow watcher callback must never write one project's
  // state into another's panel.
  const [states, setStates] = useState<Record<string, ProjectState>>({});
  // Expanded absolute paths, and the children loaded for them. Session only:
  // never persisted, so browsing can never disagree with studio.json.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Record<string, TreeLevel>>({});

  /** Diagnostics inform the UI; they never gate it. A rejected probe is
   *  swallowed so the shell stays rendered — the same degrade-silently contract
   *  as the panel read below.
   *
   *  Nothing is derived here about WHICH agent a session runs. It used to be:
   *  a single hardcoded provider id, switched on by the claude row's resolved
   *  path, because no command exposed the registry to the frontend. `agents`
   *  is registered now (lib.rs:398), the registry answers with every provider
   *  and its resolution, and each tab carries the provider it was opened with
   *  — so the probe is back to informing Settings and nothing else. */
  const check = useCallback(async () => {
    const override = await api.claudeOverride().catch(() => null);
    const report = await api.runDiagnostics(override).catch(() => null);
    if (!report) return;
    setDiagnostics(report);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    void api
      .agents()
      .then(setAgents)
      .catch(() => {});
  }, []);

  // A failed read leaves every section open, matching the Rust default, so the
  // rail never blocks on a preference.
  useEffect(() => {
    void api
      .panels()
      .then(setPanelsState)
      .catch(() => {});
  }, []);

  // Same degrade-silently contract as the panel read above: a rejected call
  // leaves the state null, and null resolves to the Build surface below rather
  // than to a screen the user has to click through.
  useEffect(() => {
    void api
      .experiences()
      .then((list) => {
        setExperiences(list);
        // THE first-run condition, and the only thing that enters onboarding:
        // the backend answered, and Build has never been turned on
        // (ExperienceState::build_enabled defaults to false, experiences.rs).
        // It runs once, on mount, so `Set up later` is honoured for the rest of
        // the session, and a rejected read never opens it at all.
        if (!list.some((e) => e.id === 'build' && e.enabled)) setOnboarding('experiences');
      })
      .catch(() => {});
  }, []);

  const togglePanel = useCallback((key: keyof PanelState) => {
    setPanelsState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Persisted on change rather than on unmount: the app is usually quit,
      // so an unmount handler would often never run.
      void api.setPanels(next).catch(() => {});
      return next;
    });
  }, []);

  // A failed fetch leaves it null, which disables Install rather than letting a
  // click open a session no pane is subscribed to.
  useEffect(() => {
    void api
      .installSessionId()
      .then(setInstallId)
      .catch(() => {});
  }, []);

  // Same degrade-silently contract: a rejected read leaves the capability null
  // and every Browser pane still opens.
  useEffect(() => {
    void api
      .browserCapability()
      .then(setBrowserCapability)
      .catch(() => {});
  }, []);

  /** The two device reads, together, because they answer two halves of one
   *  screen: what exists on this machine, and what this app is holding.
   *
   *  Both are read-only. `discover_devices` runs four probes per platform with
   *  their own budget and installs nothing (devices.rs:675-676); `owned_devices`
   *  returns the in-memory claim list and touches no tool. Running either one
   *  cannot start, create, erase or download a device — and it is the same
   *  function behind the pane's `Check again`, so that button is a re-read and
   *  never a repair.
   *
   *  The ownership list is read SEPARATELY and never derived from the
   *  discovery: `runState` says a simulator is Booted whether this app booted
   *  it or the user did, so folding the two would hand Stop over devices that
   *  were never ours. */
  const refreshDevices = useCallback(async () => {
    try {
      const discovery = await api.discoverDevices();
      setDeviceReports(discovery.platforms);
      setDeviceProblem(null);
    } catch (e: unknown) {
      setDeviceProblem(String(e));
    }
    await api
      .ownedDevices()
      .then(setOwnedDevices)
      .catch(() => {});
  }, []);

  // Read at startup, like the diagnostics probe and the connections matrix
  // above, so a device tab opens with the facts already in hand instead of
  // showing a user four questions being asked. It gates nothing: a failed or
  // slow read withholds the device pane's report and no other surface.
  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  // The connections matrix, read once at startup so the surface opens with the
  // catalogue already in hand. A failed read leaves the list empty, which shows
  // the page's own empty state rather than a matrix invented here.
  useEffect(() => {
    void api
      .listConnections()
      .then(setConnections)
      .catch(() => {});
  }, []);

  const loadProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    setActiveId((current) => current ?? list[0]?.id ?? null);
    const entries = await Promise.all(
      list.map(async (p) => [p.id, await api.readState(p.path)] as const),
    );
    setStates(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // One subscription for every project, so background projects stay current.
  useEffect(() => {
    const unlisten = onProjectState((id, state) => setStates((prev) => ({ ...prev, [id]: state })));
    return () => void unlisten.then((off) => off());
  }, []);

  // This project's own tabs, read once per project. A failed read leaves the
  // project without a list, which renders the workbench's empty state rather
  // than an arrangement invented here.
  useEffect(() => {
    for (const p of projects) {
      if (tabsRequested.current.has(p.id)) continue;
      tabsRequested.current.add(p.id);
      void api
        .tabs(p.id)
        .then((list) => {
          // Never over a list this component already holds: a tab opened
          // while the read was in flight is a tab the read predates, and
          // replacing the list would take it back off screen.
          setTabsByProject((prev) => (prev[p.id] ? prev : { ...prev, [p.id]: list }));
          // Only when nothing is selected yet: a later read must never pull
          // the user off the tab they are looking at.
          setActiveTabs((prev) => (prev[p.id] ? prev : { ...prev, [p.id]: list[0]?.id ?? null }));
        })
        .catch(() => {});
    }
  }, [projects]);

  // One session id per TAB that runs a process, reserved once and never
  // re-reserved: the id pty_reserve returns is what the pane subscribes,
  // starts, writes and resizes with. Reserving spawns nothing — that is the
  // point. The pane renders with the id, both of its listeners register, and
  // only then does it call ptyStart, so the agent's first byte cannot precede
  // the subscription that carries it. A tab whose reservation failed keeps its
  // place in `opening`, so the failure is reported once by the absent pane
  // rather than retried on every render.
  useEffect(() => {
    for (const list of Object.values(tabsByProject)) {
      for (const tab of list) {
        if (!needsSession(tab)) continue;
        if (sessions[tab.id] || opening.current.has(tab.id)) continue;
        opening.current.add(tab.id);
        void api
          .ptyReserve()
          .then((id) => setSessions((prev) => (prev[tab.id] ? prev : { ...prev, [tab.id]: id })))
          .catch(() => {});
      }
    }
  }, [tabsByProject, sessions]);

  const handleAdd = useCallback(async () => {
    const added = await api.addProject();
    if (!added) return; // cancelling the panel is not an error
    setProjects((prev) => (prev.some((p) => p.id === added.id) ? prev : [...prev, added]));
    setActiveId(added.id);
    const state = await api.readState(added.path);
    setStates((prev) => ({ ...prev, [added.id]: state }));
    // The parent's cached level predates this folder, so drop it rather than
    // make the user collapse and reopen to see what they just added.
    const parent = added.path.slice(0, added.path.lastIndexOf('/'));
    setLevels((prev) => {
      if (!(parent in prev)) return prev;
      const next = { ...prev };
      delete next[parent];
      return next;
    });
  }, []);

  const handleToggle = useCallback(
    async (path: string) => {
      const open = !expanded.has(path);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      // Load once per path and keep it: collapsing and re-expanding must not
      // re-read the disk, and nothing is read for a path never opened. A failed
      // listing caches an empty level so the row settles on "empty" rather than
      // retrying on every render.
      if (!open || levels[path]) return;
      const level = await api.listChildren(path).catch(() => ({ children: [], hidden: 0 }));
      setLevels((prev) => ({ ...prev, [path]: level }));
    },
    [expanded, levels],
  );

  /** A child the user activated. It becomes a real project — persisted, watched,
   *  with its own terminal — because a workspace deliberately promoted should
   *  still be there after a relaunch. */
  const handlePromote = useCallback(async (path: string) => {
    // A rejected promotion means the folder was not persisted, so nothing is
    // added: a row the Rust side does not know about could never be removed.
    const added = await api.promoteProject(path).catch(() => null);
    if (!added) return;
    setProjects((prev) => (prev.some((p) => p.id === added.id) ? prev : [...prev, added]));
    setActiveId(added.id);
    const state = await api.readState(added.path);
    setStates((prev) => ({ ...prev, [added.id]: state }));
  }, []);

  /** TASK 64. Removing a project closes THAT project's tabs and their
   *  sessions, and nothing else.
   *
   *  The guarantee is in where the ids come from, not in a filter applied
   *  afterwards. `tabsByProject[id]` is the removed project's own list — the
   *  map is keyed by project id and tabs.rs only ever puts a tab in the list
   *  of the project it belongs to (tabs.rs:133-138) — and every session id is
   *  read out of `sessions[tab.id]`, which is keyed by TAB. So the only ids
   *  this loop can reach are the removed project's; there is no "the current
   *  session" anywhere in it, and no call that takes a project and closes
   *  whatever it finds.
   *
   *  The folder itself is never touched: `projects::remove_project` edits
   *  studio.json and nothing else.
   *
   *  A project with no open tab is still removable — the loop simply has
   *  nothing to iterate — and so is one whose session was reserved but never
   *  started: pty_close answers `no session: {id}` for it and the rejection is
   *  swallowed. */
  const handleRemove = useCallback(
    async (id: string) => {
      await api.removeProject(id);
      const own = tabsByProject[id] ?? NO_TABS;
      for (const tab of own) {
        // The process first, then the metadata. They are two calls because
        // they are two different things (tabs.rs:182-193), and a tab that owns
        // no process never reaches the first of them.
        const session = sessions[tab.id];
        if (session) await api.ptyClose(session).catch(() => {});
        // A browser tab owns a registry entry instead, and only this project's
        // tabs are in `own` — so this reaches no other project's panes.
        if (tab.type === 'browser') await api.browserClose(tab.id).catch(() => {});
        // A device tab holds a CLAIM instead, and this gives up the claim
        // without stopping anything: removing a folder from the sidebar is not
        // a reason to shut down a simulator the user is using. Never
        // `stop_device` — see handleCloseTab. `own` is this project's own tab
        // list and the claims are keyed by tab id, so this releases these tabs'
        // records and no other project's.
        if (isDeviceTab(tab)) await api.releaseDeviceOwnership(tab.id).catch(() => {});
        await api.closeTab(tab.id).catch(() => {});
        // Cleared too, or re-adding the folder — which hashes back to the same
        // project id — could never reserve a session for these tabs again.
        opening.current.delete(tab.id);
      }
      // One re-read for the whole loop rather than one per tab, and only when
      // the project actually held a device tab.
      if (own.some(isDeviceTab)) {
        await api
          .ownedDevices()
          .then(setOwnedDevices)
          .catch(() => {});
      }
      tabsRequested.current.delete(id);
      setSessions((prev) => {
        const next = { ...prev };
        for (const tab of own) delete next[tab.id];
        return next;
      });
      setTabsByProject((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setActiveTabs((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setStates((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setActiveId((current) => (current === id ? null : current));
    },
    [tabsByProject, sessions],
  );

  // --- Tabs ----------------------------------------------------------------

  /** Opens a tab and brings it forward. Called from a click and never from an
   *  effect, so there is no StrictMode double-invoke to guard: the reservation
   *  that follows is the part that runs in an effect, and `opening` guards
   *  that. */
  const handleOpenTab = useCallback(
    async (projectId: string, kind: TabType, title: string | null, providerId: string | null) => {
      const tab = await api.openTab(projectId, kind, title, providerId).catch(() => null);
      if (!tab) return;
      setTabsByProject((prev) => ({
        ...prev,
        [projectId]: [...(prev[projectId] ?? []), tab],
      }));
      setActiveTabs((prev) => ({ ...prev, [projectId]: tab.id }));
    },
    [],
  );

  // --- Devices: the two acting commands ------------------------------------
  //
  // Both are called from a press in `device-pane.tsx` and from nowhere else.
  // No effect in this file reaches either of them, so no mount, no open and no
  // tab switch can start or stop a device.

  /** Launch. The ONLY path in this app that starts a device.
   *
   *  The claim is re-read from `owned_devices` afterwards instead of being
   *  patched out of the outcome: the ownership record is what decides whether
   *  Stop is offered, and a copy assembled here could disagree with it. A
   *  rejection is re-thrown — the pane catches it and shows the backend's own
   *  sentence beside the button that was pressed. */
  const handleLaunchDevice = useCallback(
    async (tabId: string, platform: DevicePlatform, deviceId: string) => {
      const outcome = await api.launchDevice(tabId, platform, deviceId);
      await api
        .ownedDevices()
        .then(setOwnedDevices)
        .catch(() => {});
      return outcome;
    },
    [],
  );

  /** Stop, which is a different act from closing the tab and never reached by
   *  one. It acts on a claim this tab holds or on nothing: the backend refuses
   *  `notOwnedByApp` for a device this app did not start, however plainly the
   *  tool reports it as running, and the pane shows Stop disabled with that
   *  reasoning rather than offering it and being refused. */
  const handleStopDevice = useCallback(
    async (tabId: string, platform: DevicePlatform, deviceId: string) => {
      const outcome = await api.stopDevice(tabId, platform, deviceId);
      await api
        .ownedDevices()
        .then(setOwnedDevices)
        .catch(() => {});
      return outcome;
    },
    [],
  );

  const handleSelectTab = useCallback((projectId: string, tabId: string) => {
    setActiveTabs((prev) => ({ ...prev, [projectId]: tabId }));
  }, []);

  /** Drops a closed tab from this component's three maps and hands the
   *  selection to its neighbour. Nothing here closes a process — both callers
   *  below have already done whatever closing their case called for. */
  const forgetTab = useCallback(
    (projectId: string, tabId: string) => {
      opening.current.delete(tabId);
      setSessions((prev) => {
        const next = { ...prev };
        delete next[tabId];
        return next;
      });
      setTabsByProject((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? NO_TABS).filter((t) => t.id !== tabId),
      }));
      setActiveTabs((prev) => {
        if (prev[projectId] !== tabId) return prev;
        const list = tabsByProject[projectId] ?? NO_TABS;
        const i = list.findIndex((t) => t.id === tabId);
        const neighbour = list[i + 1] ?? list[i - 1] ?? null;
        return { ...prev, [projectId]: neighbour?.id ?? null };
      });
    },
    [tabsByProject],
  );

  /** A tab with no live process. Metadata only: close_tab and nothing else —
   *  except for a browser tab, which owns a registry entry rather than a
   *  process. `browser_close` removes that entry and signals nothing, because
   *  nothing behind it owns a process; leaving it would leak one entry per
   *  closed tab for the life of the app. It cannot disturb any other tab: the
   *  registry is keyed by tab id (browser.rs:725-733).
   *
   *  A DEVICE tab owns a claim rather than a process or a registry entry, and
   *  closing it calls `release_device_ownership` — never `stop_device`.
   *  Releasing gives up Effi's record and deliberately kills nothing: the
   *  simulator or emulator keeps running, and a user who wants it up must not
   *  lose it because they tidied away a tab. `release_device_ownership` takes
   *  no action parameter at all (devices.rs:1438-1444), so there is no variant
   *  of this call that could take a device down. The claim is keyed by tab id,
   *  so this reaches no other tab's device. */
  const handleCloseTab = useCallback(
    async (projectId: string, tab: Tab) => {
      if (tab.type === 'browser') await api.browserClose(tab.id).catch(() => {});
      if (isDeviceTab(tab)) {
        await api.releaseDeviceOwnership(tab.id).catch(() => {});
        await api
          .ownedDevices()
          .then(setOwnedDevices)
          .catch(() => {});
      }
      await api.closeTab(tab.id).catch(() => {});
      forgetTab(projectId, tab.id);
    },
    [forgetTab],
  );

  /** A tab holding one, and only after the strip's own confirmation. The
   *  session id is the one the strip read off THAT tab, so this ends that one
   *  process: every other session in every other tab is untouched. */
  const handleCloseSession = useCallback(
    async (projectId: string, tab: Tab, sessionId: string) => {
      await api.ptyClose(sessionId).catch(() => {});
      await api.closeTab(tab.id).catch(() => {});
      forgetTab(projectId, tab.id);
    },
    [forgetTab],
  );

  /** The backend answers with this project's tabs in their new order, so the
   *  arrangement on screen is the one that was persisted. */
  const handleReorderTabs = useCallback(async (projectId: string, ids: string[]) => {
    const next = await api.reorderTabs(projectId, ids).catch(() => null);
    if (!next) return;
    setTabsByProject((prev) => ({ ...prev, [projectId]: next }));
  }, []);

  // --- Connections handlers ------------------------------------------------
  //
  // Every one of these is the same two steps: call the command, replace the
  // whole matrix with what it answered. No status, no cell and no health is
  // derived here — with `installed_adapters()` empty every consumer cell comes
  // back `unsupportedByAgent`, and that word is the backend's, not this file's.
  // A rejection is SURFACED verbatim rather than swallowed: a refused Connect
  // that reported nothing would read as a dead button.
  //
  // No credential value passes through any of them. `ConfigureDraft.credential`
  // is a keychain reference with exactly two coordinates and no third field, so
  // there is nothing secret in this component's props, state, logs or DOM.

  /** TASK 104. Drops ONE row's held preview.
   *
   *  Called by every handler below that rewrites the stored record — configure,
   *  scope, disconnect, revoke — because a preview is a reading of that record
   *  and a reading of the old one is not a description of what Connect would
   *  write now. `check_connection` is deliberately NOT one of them: health is
   *  `#[serde(skip)]` on the Rust side (connections.rs), so a check changes
   *  nothing a preview prints.
   *
   *  Dropping rather than refreshing is the safe direction: with no entry the
   *  page withholds Apply and asks for a preview again, which is one press.
   *  Refreshing here would put a second read on a path the user did not ask to
   *  re-read. */
  const forgetPreview = useCallback((id: string) => {
    setConnectionPreviews((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /** TASK 104. The preview read, and the prop whose absence was switching
   *  Connect off entirely: with no handler the page states that it cannot show
   *  what it would write and therefore will not write, rather than falling
   *  through to an unpreviewed Connect. This is what turns the action back on.
   *
   *  It is a READ — `connection_preview` persists nothing (lib.rs:447-454) — so
   *  pressing it commits the user to nothing and Cancel costs nothing.
   *
   *  The pairs come from `connections::safe_summary` and carry credential
   *  COORDINATES only, because `CredentialRef` has no field for a value. So
   *  nothing is filtered here: there is nothing to filter. */
  const handleRequestPreview = useCallback(
    async (id: string) => {
      setPreviewError(null);
      try {
        const lines = await api.connectionPreview(id);
        setConnectionPreviews((prev) => ({ ...prev, [id]: lines }));
      } catch (e: unknown) {
        // The refusal in the backend's own words, and the row's old pairs go
        // with it: pairs left on screen beside "this could not be read" would
        // be the one thing a change preview must never be — a description of
        // something other than what would happen.
        forgetPreview(id);
        setPreviewError(String(e));
      }
    },
    [forgetPreview],
  );

  /** TASK 105, the global half: deletes the credential reference AND the secret
   *  it named. The connection stays, and comes back reporting `notConfigured`
   *  — which is what it then is. With no handler there is no Revoke control at
   *  all, rather than a disabled one.
   *
   *  THE REFUSAL IS RE-THROWN VERBATIM AND NOTHING IS ADDED TO IT. lib.rs
   *  deletes the keychain item before anything reaches studio.json and aborts
   *  if the delete was not confirmed (lib.rs:598-666), so a failed revoke
   *  genuinely changed nothing — and `forget_credential` already says exactly
   *  that, naming the coordinates so the user can find the item themselves.
   *  Wrapping that in a sentence of this file's own would turn a safe,
   *  repeatable no-op into an unknown. No retry is attempted here either.
   *
   *  The session echo's credential is cleared on success, because the record on
   *  disk no longer has one and an echo that disagreed with the row it
   *  describes is the one thing that map must not be. */
  const handleRevokeCredential = useCallback(
    async (id: string) => {
      setRevokeError(null);
      try {
        setConnections(await api.revokeConnectionCredential(id));
        forgetPreview(id);
        setConnectionDetails((prev) => {
          const before = prev[id];
          return before
            ? { ...prev, [id]: { ...before, credential: null, connectRequested: false } }
            : prev;
        });
      } catch (e: unknown) {
        setRevokeError(String(e));
      }
    },
    [forgetPreview],
  );

  const handleConfigureConnection = useCallback(
    async (draft: ConfigureDraft) => {
      setConnectionsError(null);
      try {
        const answer = await api.configureConnection(draft);
        setConnections(answer.connections);
        // TASK 104. The record this row's preview described has just been
        // rewritten, so the preview is dropped rather than carried over: it
        // would otherwise describe the label, endpoint or coordinates the user
        // just replaced.
        forgetPreview(answer.id);
        // The session echo described at `connectionDetails`. Every field here is
        // what the user just typed, under the id the backend just answered with.
        //
        // `connectRequested` mirrors connections.rs:706-714 rather than being
        // carried over blindly: a CHANGED credential reference invalidates the
        // explicit Connect on the Rust side, because the thing that was connected
        // is not the thing that is stored now. Keeping a stale `true` here would
        // make this echo disagree with the row it describes.
        setConnectionDetails((prev) => {
          const before = prev[answer.id];
          const sameCredential =
            JSON.stringify(before?.credential ?? null) === JSON.stringify(draft.credential);
          return {
            ...prev,
            [answer.id]: {
              label: draft.label,
              endpoint: draft.endpoint,
              transport: draft.transport,
              credential: draft.credential,
              connectRequested: sameCredential ? (before?.connectRequested ?? false) : false,
            },
          };
        });
      } catch (e: unknown) {
        setConnectionsError(String(e));
      }
    },
    [forgetPreview],
  );

  /** The scope step, and the one place this build's missing detail read is
   *  load-bearing rather than cosmetic.
   *
   *  `connections::set_scope` exists (connections.rs:738-746) but is NOT
   *  registered as a command (lib.rs:611-617), so the only registered path that
   *  writes a scope is `configure_connection` — which takes the connector AND
   *  the label, because the id is derived from both (connections.rs:615-621).
   *  The label is the field no registered command returns.
   *
   *  So: with the session echo in hand this re-configures the same row, which
   *  is idempotent and answers with the same id. Without it, the request is
   *  REFUSED and named. It is not silently dropped, and no label is guessed
   *  from the connector — a guessed label hashes to a different id and would
   *  quietly create a second connection. */
  const handleConnectionScope = useCallback(
    async (id: string, scope: Connection['scope']) => {
      setConnectionsError(null);
      const row = connections.find((c) => c.id === id) ?? null;
      const detail = connectionDetails[id];
      if (!row || !detail) {
        setConnectionsError(
          'Changing the scope needs this connection\u2019s name, and no command in this build ' +
            'returns it \u2014 list_connections answers with the id, connector, scope and the ' +
            'per-consumer cells only. Scope can be changed for a connection configured in this ' +
            'session; for one stored earlier, re-run Configure with the same name first.',
        );
        return;
      }
      try {
        const answer = await api.configureConnection({
          connector: row.connector,
          label: detail.label,
          endpoint: detail.endpoint,
          transport: detail.transport,
          credential: detail.credential,
          scope,
        });
        setConnections(answer.connections);
        // TASK 104. The scope is one of the lines a preview prints, so a held
        // one is now a reading of the scope the user just left. Dropped rather
        // than refreshed — the page already closes an open review when the
        // scope changes, and this makes sure the record behind it cannot serve
        // the stale pairs back on the next press.
        forgetPreview(id);
      } catch (e: unknown) {
        setConnectionsError(String(e));
      }
    },
    [connections, connectionDetails, forgetPreview],
  );

  /** Records an intent and contacts nothing — the honesty of that is
   *  connections.rs's, and nothing here adds a claim to it. Refused without a
   *  credential reference, and the refusal names the missing step. */
  const handleConnectConnection = useCallback(async (id: string) => {
    setConnectionsError(null);
    try {
      setConnections(await api.connectConnection(id));
      setConnectionDetails((prev) => {
        const before = prev[id];
        return before ? { ...prev, [id]: { ...before, connectRequested: true } } : prev;
      });
    } catch (e: unknown) {
      setConnectionsError(String(e));
    }
  }, []);

  /** One consumer's check, through that consumer's own adapter. Every call is
   *  refused by name in this build, which is the honest answer rather than a
   *  failure: `installed_adapters()` is empty, so no adapter was asked and
   *  nothing broke. */
  const handleCheckConnection = useCallback(async (id: string, consumer: Consumer) => {
    setConnectionsError(null);
    try {
      setConnections(await api.checkConnection(id, consumer));
    } catch (e: unknown) {
      setConnectionsError(String(e));
    }
  }, []);

  /** Drops the bindings and the explicit Connect; KEEPS the credential
   *  reference and the scope (connections.rs:886-898). Disconnecting is not
   *  revoking, and the echo is corrected to match what the backend just did. */
  const handleDisconnectConnection = useCallback(
    async (id: string) => {
      setConnectionsError(null);
      try {
        setConnections(await api.disconnectConnection(id));
        // TASK 104. The bindings and the explicit Connect are two of the lines
        // a preview prints, and both just changed.
        forgetPreview(id);
        setConnectionDetails((prev) => {
          const before = prev[id];
          return before ? { ...prev, [id]: { ...before, connectRequested: false } } : prev;
        });
      } catch (e: unknown) {
        setConnectionsError(String(e));
      }
    },
    [forgetPreview],
  );

  // The active project is marked seen as its state arrives, so it can never
  // carry a marker. Every other project's record is left alone until selected.
  useEffect(() => {
    if (!activeId) return;
    setSeen((prev) => {
      const key = seenKey(states[activeId]);
      return prev[activeId] === key ? prev : { ...prev, [activeId]: key };
    });
  }, [activeId, states]);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveId(id);
      setSeen((prev) => ({ ...prev, [id]: seenKey(states[id]) }));
      // TASK 110. Picking a project in the projects DRAWER is a navigation act,
      // and the drawer is over the workbench it just selected. A no-op at every
      // width where the column is in the flow, and from Cmd+1…9 with no drawer
      // open. It writes no preference: `sidebarCollapsed` is untouched here.
      setOverlay(null);
    },
    [states],
  );

  /** Types the command into the session it was ADDRESSED to. The id arrives
   *  from the flow bar's named target, so nothing here resolves "whatever is
   *  current" and a command cannot land in a surface the user was not told
   *  about. `\r` is exactly what xterm's onData sends for Return
   *  (terminal-pane.tsx:63-65), so this is indistinguishable from the user
   *  typing it. No readiness check: the app cannot observe whether the REPL is
   *  at a prompt, and faking that signal would be worse than the honest
   *  behaviour. A rejected write is swallowed because the terminal itself is
   *  the error surface. */
  const handleDispatch = useCallback((sessionId: string, text: string) => {
    void api.ptyWrite(sessionId, `${text}\r`).catch(() => {});
    setFocusNonce((n) => n + 1);
  }, []);

  /** Brings the tab holding a session forward, and sends nothing. The workbench
   *  keeps every tab's pane mounted, so this is a selection change: the surface
   *  the user is about to click in is the one in front of them. A session this
   *  project does not hold is a no-op rather than a silent switch of project. */
  const handleFocusSession = useCallback(
    (projectId: string, sessionId: string) => {
      const tab = (tabsByProject[projectId] ?? NO_TABS).find((t) => sessions[t.id] === sessionId);
      if (!tab) return;
      setActiveTabs((prev) => ({ ...prev, [projectId]: tab.id }));
      setFocusNonce((n) => n + 1);
    },
    [tabsByProject, sessions],
  );

  const activity = useMemo(
    () =>
      new Set(
        projects
          .filter((p) => p.id !== activeId && seenKey(states[p.id]) !== (seen[p.id] ?? ''))
          .map((p) => p.id),
      ),
    [projects, states, seen, activeId],
  );

  // Derived above the early returns: the git effect below depends on it, and a
  // hook cannot sit after a conditional return.
  const active = projects.find((p) => p.id === activeId) ?? null;
  const activeState = activeId ? (states[activeId] ?? null) : null;

  // git_info never rejects by design, so a failure arrives inside the payload.
  useEffect(() => {
    if (!active) {
      setGitInfo(null);
      return;
    }
    void api
      .gitInfo(active.path)
      .then(setGitInfo)
      .catch(() => setGitInfo(null));
  }, [active]);

  const handleCheckout = useCallback(
    async (branch: string) => {
      if (!active) return;
      setGitBusy(true);
      setGitError(null);
      try {
        setGitInfo(await api.gitCheckout(active.path, branch));
        // The watcher only watches .claude/, so a branch change produces no
        // event. The plan is branch scoped, so stage and tasks are refreshed
        // here rather than waited for.
        const state = await api.readState(active.path);
        setStates((prev) => ({ ...prev, [active.id]: state }));
      } catch (e) {
        // git's own stderr, shown verbatim. No retry, no force.
        setGitError(String(e));
      } finally {
        setGitBusy(false);
      }
    },
    [active],
  );

  const handleCreateBranch = useCallback(
    async (name: string) => {
      if (!active) return;
      setGitBusy(true);
      setGitError(null);
      try {
        setGitInfo(await api.gitCreateBranch(active.path, name));
        const state = await api.readState(active.path);
        setStates((prev) => ({ ...prev, [active.id]: state }));
      } catch (e) {
        setGitError(String(e));
      } finally {
        setGitBusy(false);
      }
    },
    [active],
  );

  /** A row in the selector was activated. Navigation and nothing else: no
   *  session is closed, no reservation is dropped, and `sessions` is not
   *  touched — switching to Verify is a change of what is on top, not of what
   *  is running. */
  const handleOpenExperience = useCallback((id: ExperienceId) => {
    setView(id === 'verify' ? 'verify' : 'build');
    // Connections hides the workspace, so a row in the selector has to be a
    // real exit from it rather than a change that lands behind it.
    setConnectionsOpen(false);
    // TASK 110. In a drawer band the row that was just pressed is sitting over
    // the surface it asked for, so the drawer goes. A no-op in the two flow
    // bands, and it writes no preference either way.
    setOverlay(null);
  }, []);

  /** The selector has already written Build's flag; this only re-reads so this
   *  component's copy agrees with the backend, which stays the authority. */
  const handleEnabledChange = useCallback((enabled: boolean) => {
    void api
      .experiences()
      .then(setExperiences)
      .catch(() => {});
    // Turning Build on lands the user in the workspace instead of leaving them
    // on the surface they just enabled their way out of.
    if (enabled) setView('build');
  }, []);

  /** The Settings screen's experience switch. The selector above writes Build's
   *  flag itself and then reports; this screen is props-only and performs no
   *  I/O at all, so the write lives here.
   *
   *  `set_experiences` takes Build's flag and nothing else (experiences.rs), so
   *  there is no id to send and no way this call could write Verify's value.
   *  Guarded anyway, for the reason experience-selector.tsx guards it: a row
   *  added later must not quietly start writing Build's. No optimistic flip —
   *  the re-read inside `handleEnabledChange` is the authority either way,
   *  including when the write failed. */
  const handleToggleExperience = useCallback(
    (id: ExperienceId, next: boolean) => {
      if (id !== 'build') return;
      void api
        .setExperiences(next)
        .then(() => handleEnabledChange(next))
        .catch(() =>
          api
            .experiences()
            .then(setExperiences)
            .catch(() => {}),
        );
    },
    [handleEnabledChange],
  );

  /** `Set up Build` on the neutral shell. The optimistic flip is so the
   *  workspace appears on the click rather than a round trip later; the re-read
   *  is the authority either way, including when the write failed. */
  const handleSetUpBuild = useCallback(() => {
    setExperiences(
      (prev) => prev?.map((e) => (e.id === 'build' ? { ...e, enabled: true } : e)) ?? prev,
    );
    setView('build');
    setConnectionsOpen(false);
    void api
      .setExperiences(true)
      .catch(() => {})
      .then(() => api.experiences())
      .then(setExperiences)
      .catch(() => {});
  }, []);

  /** Onboarding step one answered. Build selected moves to step two; anything
   *  else leaves onboarding for the neutral shell, which is a real destination
   *  and not a dead end. Nothing is installed or written on either path. */
  const handleChooseExperiences = useCallback((intent: ExperienceIntent) => {
    if (intent.build) {
      setOnboarding('tools');
      return;
    }
    setOnboarding(null);
    setView('shell');
  }, []);

  /** `Set up later`. Closes onboarding for this session without enabling
   *  anything, which is why the entry condition above only ever runs on mount. */
  const handleSkipOnboarding = useCallback(() => {
    setOnboarding(null);
    setView('shell');
  }, []);

  /** Onboarding step two's primary action. NOTHING in the plan runs here.
   *
   *  `needsReview` is the plan's own answer to whether anything is being
   *  installed, so the route is taken from the plan rather than re-derived from
   *  the ticks. A plan that installs something opens the Review surface; a plan
   *  that installs nothing opens the workspace, which is why reaching Build
   *  still installs nothing.
   *
   *  The draft plan itself is deliberately NOT carried forward. `draftSetupPlan`
   *  fills `effects` with nothing on purpose, and the Review screen asks
   *  `api.setupPlan(selection)` for the real one — a review that described
   *  something other than what executes is the single failure that screen
   *  exists to prevent. */
  const handleChooseTools = useCallback(
    (_plan: SetupPlan, needsReview: boolean) => {
      if (needsReview) {
        setOnboarding('review');
        return;
      }
      setOnboarding(null);
      handleSetUpBuild();
    },
    [handleSetUpBuild],
  );

  /** Leaving the setup surface for the workspace. Build is enabled and the
   *  startup probe is re-run, so Settings opens with what setup just changed
   *  rather than with what the probe found before it. Nothing is closed: the
   *  installer's PTY is never touched from here, and TerminalPane does not
   *  close a session on unmount (terminal-pane.tsx:105-112), so a run still in
   *  flight keeps running. */
  const handleOpenBuildFromSetup = useCallback(() => {
    setOnboarding(null);
    handleSetUpBuild();
    void check();
  }, [handleSetUpBuild, check]);

  /** null is "not answered": the read is in flight, or it rejected. Both resolve
   *  to TRUE here, so the Build surface is what an unanswered or failed
   *  experiences() shows. The neutral shell is only ever reached from an answer
   *  that actually said nothing is enabled. */
  const buildEnabled =
    experiences === null || experiences.some((e) => e.id === 'build' && e.enabled);
  // Onboarding outranks the other surfaces while it is open, so a first run
  // cannot show step one and the neutral shell at the same time.
  const onboardingView = onboarding !== null;
  const verifyView = !onboardingView && view === 'verify';
  // The shell is both a destination ('shell', from Verify's "Manage
  // experiences") and the fallback for a user who has enabled nothing. Verify
  // wins when it is the open page, so its landing stays reachable from the
  // shell's own "Learn more".
  const shellView = !onboardingView && !verifyView && (view === 'shell' || !buildEnabled);
  // TASK 109. Connections is a surface the user opens, like Settings, and it
  // loses to onboarding for the same reason Verify does: a first run must not
  // show step one and the connections matrix at once. It is NOT gated on an
  // experience and gates nothing itself — Connections is skippable, and nothing
  // on it is an onboarding prerequisite.
  const connectionsView = !onboardingView && connectionsOpen;
  // One flag, read once in the render: whichever alternate surface is open, the
  // workspace is hidden rather than removed.
  const workspaceHidden = onboardingView || verifyView || shellView || connectionsView;

  // What onboarding step two is driven by. Both are pure derivations of state
  // this component already holds: no probe is run for them, and the plan is a
  // draft until the setup IPC owns it.
  //
  // `selection` is memoised rather than recomputed inline because `initialSelection`
  // builds a fresh object: an unmemoised identity would change on every render,
  // and the Review and setup surfaces below take it as an effect dependency —
  // a new object each pass would re-ask the backend for the plan forever.
  const reports = diagnostics?.components ?? NO_REPORTS;
  const selection = useMemo(
    () => toolSelection ?? initialSelection(reports),
    [toolSelection, reports],
  );
  const setupPlan = useMemo(() => draftSetupPlan(selection, reports), [selection, reports]);
  // The same intent in the one shape setup.rs will accept. The backend takes a
  // Selection and never a plan, so this is all that crosses: the plan the
  // Review screen reads and the plan run_setup executes are both built in Rust
  // from this value, which is what keeps them the same plan.
  const wireSelection = useMemo(() => toWireSelection(selection), [selection]);

  // Indexes the CONFIGURED project list, not the visible tree rows: expanding a
  // folder changes which rows are visible, and a shortcut whose target moves is
  // worse than no shortcut. Out-of-range indices are ignored.
  useShortcuts({
    onProjectIndex: useCallback(
      (index: number) => {
        const p = projects[index - 1];
        if (p) handleSelect(p.id);
      },
      [projects, handleSelect],
    ),
    onToggleSidebar: useCallback(() => togglePanel('sidebarCollapsed'), [togglePanel]),
    onToggleFlow: useCallback(() => togglePanel('flowCollapsed'), [togglePanel]),
    // TASK 113's other half. `use-shortcuts.ts` has bound Cmd+Shift+[ and
    // Cmd+Shift+] since the chords landed, but `onStepTab` is OPTIONAL there
    // (use-shortcuts.ts:22) — so without this line the two chords compiled,
    // preventDefault'd and then reached `stepTabRef.current?.()`, which was
    // undefined. The keys did nothing.
    //
    // It SELECTS, which is the one place in the hook a key does: a shortcut
    // aimed at a tab is a request to work in it. `handleSelectTab` is the same
    // setter the strip's own click uses, so this changes which pane is in front
    // and nothing else — every other tab's pane stays mounted behind it, and no
    // session is started, closed or re-reserved by stepping past one.
    //
    // Read off `tabsByProject`, NOT `liveTabs`: `liveTabs` is declared below
    // this hook call, and only the ids matter here — the session a tab carries
    // is irrelevant to which one is in front.
    onStepTab: useCallback(
      (delta: -1 | 1) => {
        if (activeId === null) return;
        const list = tabsByProject[activeId] ?? NO_TABS;
        if (list.length === 0) return;
        const here = list.findIndex((t) => t.id === (activeTabs[activeId] ?? null));
        const next =
          here < 0
            ? delta === 1
              ? 0
              : list.length - 1
            : (here + delta + list.length) % list.length;
        handleSelectTab(activeId, list[next].id);
      },
      [activeId, tabsByProject, activeTabs, handleSelectTab],
    ),
    onToggleRail: useCallback(() => {
      // TASKS 74 + 75. The rail is now two tabs and ONE disclosure, so this key
      // toggles that disclosure and nothing else. `tasksCollapsed` and
      // `historyCollapsed` are left exactly as they are on disk: a tab is not a
      // collapsed section, and writing a collapse state for a surface that can
      // no longer be collapsed would record something the UI never means. The
      // two fields stay in PanelState because the Rust side mirrors the shape.
      const next = {
        ...panels,
        propertiesCollapsed: !panels.propertiesCollapsed,
      };
      setPanelsState(next);
      void api.setPanels(next).catch(() => {});
    }, [panels]),
  });

  // Every open tab carrying the session the host reserved for it. tabs.rs
  // always answers `sessionId: null` (tabs.rs:53-61) because tab metadata and
  // processes have separate lifetimes; this is where the two are put back
  // together, and it is the shape the strip reads to decide whether closing a
  // tab needs a confirmation. Memoised so a render that changed neither map
  // hands the workbench the same arrays it had.
  const liveTabs = useMemo(() => {
    const out: Record<string, Tab[]> = {};
    for (const [projectId, list] of Object.entries(tabsByProject)) {
      out[projectId] = list.map((t) => ({
        ...t,
        sessionId: sessions[t.id] ?? null,
      }));
    }
    return out;
  }, [tabsByProject, sessions]);

  // --- What the flow bar is allowed to reach -------------------------------
  //
  // The provider behind a tab is found by the tab's own providerId and then
  // ASKED: the capability is the declared `workflowAdapter` field, never an id
  // match and never a name match, so a user-defined CLI named like a built-in
  // switches nothing on. The toolkit is a second, independent fact —
  // `check_commands` counting the eight /ec-* files (doctor.rs:325-354) — and
  // the adapter needs both, so a Claude install whose commands diagnostics did
  // not actually find offers no shortcuts either.
  const toolkitReady = diagnostics?.components.find((c) => c.id === 'commands')?.status === 'ready';
  /** The first provider that declares the adapter AND resolved to a binary.
   *  Used only to NAME the thing that is missing and to open a session for it;
   *  it never stands in for a tab that is actually running one. */
  const workflowProvider =
    agents.find((a) => a.capabilities.workflowAdapter && a.status === 'ready') ?? null;

  /** A tab a flow command may really be typed into: an agent tab, whose
   *  provider declares the adapter, with a live session behind it. */
  const flowCapable = (tab: Tab): boolean =>
    tab.type === 'agent' &&
    tab.providerId !== null &&
    tab.sessionId !== null &&
    (agents.find((a) => a.id === tab.providerId)?.capabilities.workflowAdapter ?? false);

  const providerNameOf = (tab: Tab): string =>
    agents.find((a) => a.id === tab.providerId)?.name ?? tab.providerId ?? 'this agent';

  /** Exactly one of the two fields is non-null, per project. `elsewhere` is
   *  reachable now that a project holds several tabs: a capable session can
   *  genuinely be sitting behind the browser tab the user is looking at, and
   *  saying so is better than offering six buttons that would land somewhere
   *  else. */
  function flowFor(
    tabs: Tab[],
    activeTabId: string | null,
  ): { target: FlowTarget | null; away: FlowAway | null } {
    const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
    if (toolkitReady && activeTab && flowCapable(activeTab) && activeTab.sessionId) {
      return {
        target: {
          sessionId: activeTab.sessionId,
          providerName: providerNameOf(activeTab),
        },
        away: null,
      };
    }
    const other = tabs.find((t) => flowCapable(t));
    if (toolkitReady && other && other.sessionId) {
      return {
        target: null,
        away: {
          reason: 'elsewhere',
          sessionId: other.sessionId,
          providerName: providerNameOf(other),
        },
      };
    }
    if (!workflowProvider) return { target: null, away: { reason: 'noAdapter' } };
    if (!toolkitReady) {
      return {
        target: null,
        away: { reason: 'noToolkit', providerName: workflowProvider.name },
      };
    }
    return {
      target: null,
      away: { reason: 'noSession', providerName: workflowProvider.name },
    };
  }

  /** Whether the inspector's `/ec-*` hint would be typable where the user is
   *  looking. Asked of the active tab's provider by its declared
   *  `workflowAdapter` capability — never by an id or a name match, the same
   *  rule flowCapable follows. An agent tab without the adapter (a Codex tab)
   *  gets the neutral copy; a terminal tab or no tab at all is not another
   *  provider's context, so the toolkit hint stands. */
  const inspectorTab = activeId
    ? ((liveTabs[activeId] ?? NO_TABS).find((t) => t.id === (activeTabs[activeId] ?? null)) ?? null)
    : null;
  const inspectorClaudeContext =
    inspectorTab === null ||
    inspectorTab.type !== 'agent' ||
    (agents.find((a) => a.id === inspectorTab.providerId)?.capabilities.workflowAdapter ?? false);

  /* --- TASK 110. The four bands, as three CSS breakpoints -----------------
   *
   *  >= 1360px   sidebar 220, inspector 300
   *  1100-1359   sidebar 208, inspector 280
   *   900-1099   sidebar 192, inspector is a DRAWER
   *   < 900      both are drawers, and at most one of them is open
   *
   *  `<main>` is `min-w-0 flex-1` in every one of them and both columns are
   *  `shrink-0`, so the terminal — the dominant surface — absorbs every pixel
   *  the window gains and is the thing that gets wider as a column leaves the
   *  flow. At the narrowest band both columns are out of the flow entirely, so
   *  the terminal has the whole width.
   *
   *  THE DRAWER IS A POSITIONING CHANGE, NOT AN UNMOUNT. The same element is
   *  `fixed inset-y-0` in its drawer band and `static` above it, and a closed
   *  drawer is `hidden` — display:none, which keeps the node, its React state
   *  and everything mounted under it. These two strings are the only thing that
   *  moves. Nothing here is a ternary over a different subtree, so a project
   *  whose /ec-execute is running in a hidden pane cannot be reached by a
   *  window resize: the pane slot inside `<main>` is not touched by any of it.
   *
   *  `onboardingView` wins outright, which is why the whole thing is one string
   *  per column rather than a `hidden` appended to a class list: a trailing
   *  `hidden` beside `min-[900px]:flex` would still resolve to flex above 900.
   */
  const sidebarBand = onboardingView
    ? 'hidden'
    : overlay === 'sidebar'
      ? 'flex'
      : 'hidden min-[900px]:flex';
  const inspectorBand = onboardingView
    ? 'hidden'
    : overlay === 'inspector'
      ? 'flex'
      : 'hidden min-[1100px]:flex';

  // Nothing above returns early, so this is the only thing App can render: the
  // workspace is up before the startup probe answers and stays up whatever it
  // answers. A missing provider is a property of one pane, never a reason to
  // withhold the shell.
  return (
    <div className="flex h-screen bg-ground text-text">
      {!panels.sidebarCollapsed && (
        <div
          id="project-drawer"
          /* 220 / 208 / 192, then a 260px overlay below 900px. `w-64` (256)
             used to stand here and matched no band at all. */
          className={`fixed inset-y-0 left-0 z-40 w-[260px] max-w-[85vw] shrink-0 flex-col overflow-hidden bg-surface min-[900px]:static min-[900px]:w-[192px] min-[1100px]:w-[208px] min-[1360px]:w-[220px] ${sidebarBand}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOverlay(null);
          }}
        >
          {/* The drawer's own close affordance, and ONLY in the band where this
              column is a drawer: above 900px it is part of the layout and there
              is nothing to close. */}
          <div className="flex h-10 shrink-0 items-center justify-end border-b border-border bg-surface px-2 min-[900px]:hidden">
            <button
              type="button"
              onClick={() => setOverlay(null)}
              aria-label="Close the projects drawer"
              className="shrink-0 rounded-lg border border-border px-2 py-1 font-mono text-xs leading-[18px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none"
            >
              ✕
            </button>
          </div>

          {/* Above the project list and OUTSIDE <main>: the selector is how all
              three surfaces are reached, so it must never sit inside a subtree
              that two of them hide.
              TASK 109: `active` is null while Connections is the open page, so
              the Connections row below it owns `aria-current` instead of Build
              keeping it — Build's workspace is behind Connections, not in
              front of the user. */}
          <ExperienceSelector
            active={connectionsView ? null : verifyView ? 'verify' : shellView ? null : 'build'}
            onOpen={handleOpenExperience}
            onEnabledChange={handleEnabledChange}
            connectionsActive={connectionsView}
            // THE SAME SETTER the Settings drawer's Connections section calls.
            // One surface, two doors: no second ConnectionsPage, no second
            // draft and no second reading of the matrix. The overlay is closed
            // with it, because in a drawer band this column is sitting over the
            // surface the press just asked for.
            onOpenConnections={() => {
              setConnectionsOpen(true);
              setOverlay(null);
            }}
          />
          {/* A row wrapper, so the nav's own `flex-1 overflow-y-auto` project
              list still has a bounded height now that it shares the column. */}
          <div className="flex min-h-0 flex-1">
            <ProjectSidebar
              projects={projects}
              activeId={activeId}
              states={states}
              expanded={expanded}
              levels={levels}
              activity={activity}
              onSelect={handleSelect}
              onToggle={(p) => void handleToggle(p)}
              onPromote={(p) => void handlePromote(p)}
              onAdd={handleAdd}
              onRemove={(id) => void handleRemove(id)}
            />
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {/* The Build workspace. A SIBLING of the two surfaces below, hidden by a
            class and never removed from the tree: the alternate views are added
            beside it, so opening one changes nothing about what is mounted
            inside it. A ternary here — workspace or landing — would unmount
            every pane below and kill every session in them. */}
        <div className={`flex min-h-0 flex-1 flex-col ${workspaceHidden ? 'hidden' : ''}`}>
          {/* One workbench per project, every one of them mounted, the inactive
              ones hidden by a class. Every pane stays mounted and is hidden when
              inactive — unmounting would kill a running /ec-execute in that
              project, and switching project is the most ordinary thing a user
              does. The key is the project id, so a project added or removed
              never re-keys another project's subtree.

              The header, the tab strip and the flow bar are inside each
              workbench rather than shared above them, because all three say
              something about ONE project: its name, its tabs, and the session a
              command would be typed into. */}
          {projects.map((p) => {
            const tabs = liveTabs[p.id] ?? NO_TABS;
            const activeTabId = activeTabs[p.id] ?? null;
            const state = states[p.id] ?? null;
            const flow = flowFor(tabs, activeTabId);
            return (
              <div
                key={p.id}
                className={`flex min-h-0 flex-1 flex-col ${p.id === activeId ? '' : 'hidden'}`}
              >
                <Workbench
                  project={p}
                  state={state}
                  tabs={tabs}
                  activeTabId={activeTabId}
                  agents={agents}
                  reports={reports}
                  focusNonce={p.id === activeId ? focusNonce : 0}
                  settingsOpen={settingsOpen}
                  onToggleSettings={() => setSettingsOpen((open) => !open)}
                  onSelectTab={(tabId) => handleSelectTab(p.id, tabId)}
                  onCloseTab={(tab) => void handleCloseTab(p.id, tab)}
                  onCloseSession={(tab, sessionId) => void handleCloseSession(p.id, tab, sessionId)}
                  onReorder={(ids) => void handleReorderTabs(p.id, ids)}
                  onOpenAgentTab={(providerId) =>
                    void handleOpenTab(
                      p.id,
                      'agent',
                      agents.find((a) => a.id === providerId)?.name ?? null,
                      providerId,
                    )
                  }
                  onOpenToolTab={(kind: WorkspaceToolKind) =>
                    void handleOpenTab(p.id, kind, null, null)
                  }
                  // All three open Settings, which is where installing,
                  // linking and managing a provider actually live. The menu
                  // asks for setup to be SHOWN and never performs any of it.
                  onOpenSetup={() => setSettingsOpen(true)}
                  onConfigureCli={() => setSettingsOpen(true)}
                  onManageTools={() => setSettingsOpen(true)}
                  // One host per browser tab, mounted inside the workbench's
                  // own `tabs.map` and hidden by a class when the tab is not in
                  // front — so a tab's address and typed draft survive a
                  // selection change, exactly as a terminal's session does.
                  // `active` is reported to `browser_set_visibility`, so the
                  // registry's `visible` is a fact about the screen.
                  browserPane={(tab) => (
                    <BrowserTabPane
                      tabId={tab.id}
                      projectId={p.id}
                      active={tab.id === activeTabId}
                      capability={browserCapability}
                    />
                  )}
                  // One host per device tab, mounted inside the workbench's own
                  // `tabs.map` and hidden by a class when the tab is not in
                  // front — so a launch outcome and the device a user picked
                  // survive a selection change, exactly as a terminal's session
                  // does. Nothing is launched by mounting it: see
                  // DeviceTabPane.
                  //
                  // `report` is this platform's half of the one machine-wide
                  // discovery, found by platform and never by index: the
                  // backend fixes the order, but matching on the order would be
                  // reading a promise instead of a field.
                  devicePane={(tab) => {
                    const platform = devicePlatformOf(tab);
                    if (platform === null) return null;
                    return (
                      <DeviceTabPane
                        tabId={tab.id}
                        platform={platform}
                        report={deviceReports?.find((r) => r.platform === platform) ?? null}
                        problem={deviceProblem}
                        owned={ownedDevices}
                        onLaunch={handleLaunchDevice}
                        onStop={handleStopDevice}
                        // Releases this tab's claim, then closes the tab. The
                        // device stays up.
                        onCloseTab={() => handleCloseTab(p.id, tab)}
                        onCheckAgain={refreshDevices}
                      />
                    );
                  }}
                  flow={
                    <FlowBar
                      next={nextStep(state)}
                      collapsed={panels.flowCollapsed}
                      onToggle={() => togglePanel('flowCollapsed')}
                      target={flow.target}
                      away={flow.away}
                      onDispatch={handleDispatch}
                      onFocus={(sessionId) => handleFocusSession(p.id, sessionId)}
                      onOpen={() => {
                        if (!workflowProvider) return;
                        void handleOpenTab(
                          p.id,
                          'agent',
                          workflowProvider.name,
                          workflowProvider.id,
                        );
                      }}
                    />
                  }
                />
              </div>
            );
          })}

          {/* No folder configured yet. A workbench of its own rather than a
              second copy of the header markup, so Settings stays reachable
              with nothing added — and so there is exactly one project header
              in this tree. No flow bar: with no project there is no session a
              command could be addressed to, and a bar explaining that would be
              explaining the wrong absence. */}
          {projects.length === 0 && (
            <div className="flex min-h-0 flex-1 flex-col">
              <Workbench
                project={null}
                state={null}
                tabs={NO_TABS}
                activeTabId={null}
                agents={agents}
                reports={reports}
                focusNonce={0}
                settingsOpen={settingsOpen}
                onToggleSettings={() => setSettingsOpen((open) => !open)}
                onSelectTab={() => {}}
                onCloseTab={() => {}}
                onCloseSession={() => {}}
                onReorder={() => {}}
                onOpenAgentTab={() => {}}
                onOpenToolTab={() => {}}
                onOpenSetup={() => setSettingsOpen(true)}
                onConfigureCli={() => setSettingsOpen(true)}
                onManageTools={() => setSettingsOpen(true)}
              />
            </div>
          )}
        </div>

        {/* Informational, stateless, and mounted BESIDE the workspace rather
            than in place of it. Opening it mid-/ec-execute leaves every pty and
            every pane exactly where they were. */}
        {verifyView && (
          <div className="min-h-0 flex-1">
            <VerifyLanding
              buildEnabled={buildEnabled}
              // Back to Build; when Build is off, `shellView` below catches it
              // and the neutral shell is what 'build' resolves to.
              onBack={() => setView('build')}
              onManageExperiences={() => setView('shell')}
            />
          </div>
        )}

        {/* The surface for a user who has enabled nothing. Also a sibling, for
            the same reason: a project whose session is running keeps running
            behind it. */}
        {shellView && (
          <div className="min-h-0 flex-1">
            <NeutralShell onSetUpBuild={handleSetUpBuild} onOpenVerify={() => setView('verify')} />
          </div>
        )}

        {/* Onboarding, step one then step two. Additive siblings in exactly the
            pattern above: the workspace keeps its place in the tree and is
            hidden by a class, so entering onboarding is a React update and not
            an unmount. A ternary here would take every pane with it. */}
        {onboarding === 'experiences' && (
          <div className="min-h-0 flex-1">
            <ChooseExperiences
              onContinue={handleChooseExperiences}
              onSetUpLater={handleSkipOnboarding}
            />
          </div>
        )}

        {onboarding === 'tools' && (
          <div className="min-h-0 flex-1">
            <ChooseTools
              reports={reports}
              selection={selection}
              plan={setupPlan}
              onSelectionChange={setToolSelection}
              onBack={() => setOnboarding('experiences')}
              onContinue={handleChooseTools}
            />
          </div>
        )}

        {/* Review, then the setup session. Two more additive siblings, added
            beside the workspace in exactly the pattern above and never in place
            of it — the panes behind them keep their sessions, which is the
            whole reason none of these is a ternary.

            Neither is handed `setupPlan`: the Review screen asks the backend
            for the plan and the setup screen asks the backend to run it, both
            from `wireSelection`, so what is read out and what executes are the
            same plan built by the same Rust function. */}
        {onboarding === 'review' && (
          <div className="min-h-0 flex-1">
            <ReviewSetup
              selection={wireSelection}
              onBack={() => setOnboarding('tools')}
              onConfirm={() => setOnboarding('setup')}
            />
          </div>
        )}

        {onboarding === 'setup' && (
          <div className="min-h-0 flex-1">
            <SetupStates
              selection={wireSelection}
              installSessionId={installId}
              onBack={() => setOnboarding('review')}
              onOpenBuild={handleOpenBuildFromSetup}
            />
          </div>
        )}

        {/* TASK 109. THE Connections surface — one of it, an additive sibling
            of the workspace in exactly the pattern above, suppressed with a
            class rather than a ternary. Two reasons it is hidden and not
            unmounted: the panes behind it keep their sessions, which is why
            none of these is a ternary; and the page holds the configure draft
            and the reviewed-scope step in its own state, so opening Settings
            or glancing at a terminal must not throw away a half-filled form.

            It is mounted whenever a project is active — the page performs no
            I/O of its own (every command above leaves through a prop), so a
            mounted-but-hidden copy costs a render and nothing else.

            BOTH entry points reach THIS element. The Settings drawer's
            Connections section below sets `connectionsOpen`, and the sidebar's
            Connections entry — a row in experience-selector.tsx, beside Build
            and Verify — calls the same setter. Neither renders a page of its
            own: a second ConnectionsPage would be a second draft, a second
            error string and a second reading of the same matrix. */}
        {active !== null && (
          <div className={`flex min-h-0 flex-1 flex-col ${connectionsView ? '' : 'hidden'}`}>
            <ConnectionsExit onClose={() => setConnectionsOpen(false)} />
            <ConnectionsPage
              projectId={active.id}
              projectName={active.name}
              connections={connections}
              details={connectionDetails}
              error={connectionsError}
              // TASKS 104 + 105. The five props the page declares OPTIONAL and
              // degrades safely without — and the degradation is why they are
              // passed here rather than left out: with no `onRequestPreview`
              // the page withholds Connect entirely and says it will not write
              // what it cannot show, so the flow stopped dead at the review
              // step; with no `onRevokeCredential` there is no Revoke control
              // at all. Only the host can turn either back on.
              previews={connectionPreviews}
              onRequestPreview={(id) => void handleRequestPreview(id)}
              onRevokeCredential={(id) => void handleRevokeCredential(id)}
              // Both verbatim, each beside the control that produced it. No
              // sentence of this file's is added to either.
              previewError={previewError}
              revokeError={revokeError}
              onConfigure={(draft) => void handleConfigureConnection(draft)}
              onScopeChange={(id, scope) => void handleConnectionScope(id, scope)}
              onConnect={(id) => void handleConnectConnection(id)}
              onCheck={(id, consumer) => void handleCheckConnection(id, consumer)}
              onDisconnect={(id) => void handleDisconnectConnection(id)}
            />
          </div>
        )}

        {/* The same surface asked for with no folder configured. Said plainly
            rather than shown as an empty matrix: a non-global connection binds
            to a project, so there is nothing for the scope step to name yet. */}
        {active === null && (
          <div className={`flex min-h-0 flex-1 flex-col ${connectionsView ? '' : 'hidden'}`}>
            <ConnectionsExit onClose={() => setConnectionsOpen(false)} />
            <div className="px-8 py-8">
              <h2 className="text-base leading-6 font-semibold text-text">Connections</h2>
              <p className="mt-2 max-w-[520px] text-sm leading-[21px] text-muted">
                Add a folder first. A connection is either available to every project or bound to
                named ones, so there is nothing for the scope step to bind to yet.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* A column beside the workspace, not over it and not instead of it: the
          terminal panes above stay mounted while this is open, so visiting
          Diagnostics cannot interrupt a running /ec-execute. */}
      {settingsOpen && (
        <aside
          id="settings-drawer"
          aria-label="Settings"
          className="flex w-96 shrink-0 flex-col border-l border-border bg-surface"
        >
          {/* The frame supplies the CLOSE affordance and NOTHING ELSE.
              settings-page.tsx renders its own `<h2>Settings</h2>`, and a
              second heading over it would name one region twice — so the
              drawer's own title went with the wiring below. */}
          <header className="flex h-10 shrink-0 items-center justify-end border-b border-border px-3">
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close settings"
              className="shrink-0 rounded-lg border border-border px-2 py-1 font-mono text-xs leading-[18px] text-muted transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none"
            >
              ✕
            </button>
          </header>

          <InstallPane
            installSessionId={installId}
            // The rejection is SURFACED, not swallowed: install_efficlaude is
            // refused while a previous installer is still alive — possibly
            // sitting at a prompt — and a user shown nothing would read that
            // refusal as a button that does not work.
            onInstall={() => {
              setInstallError(null);
              void api.installEfficlaude().catch((e: unknown) => setInstallError(String(e)));
            }}
            onRecheck={() => void check()}
          />

          {installError !== null && (
            <p
              role="alert"
              className="shrink-0 border-b border-border px-3 py-3 text-xs leading-[18px] text-error"
            >
              {installError}
            </p>
          )}

          {/* settings-page.tsx, WIRED. It was the last unbuilt-into surface in
              this tree — zero import sites — and it is props-only: it performs
              no I/O at all, so every fact below is state this component already
              holds and every action is a callback it already owns. The one
              exception is the `DiagnosticsPanel` it reuses internally, which
              owns the diagnostics commands here exactly as it does in the rail.

              It replaces the hand-rolled Connections section and the second,
              bare DiagnosticsPanel that used to sit here: the page carries a
              Connections section and a Diagnostics section of its own, and two
              doors to one surface inside ONE drawer is noise rather than a
              second entry point. The real second door is the sidebar row.

              It needs a definite height — its root is `h-full min-h-0
              flex-col` — which is what this `min-h-0 flex-1` slot in the w-96
              column gives it. The installer above stays `shrink-0`, so the
              page scrolls inside what is left rather than pushing it off. */}
          <div className="min-h-0 flex-1">
            <SettingsPage
              experiences={experiences}
              onToggleExperience={handleToggleExperience}
              reports={reports}
              // `onSetUpAgent`, `onAddOtherCli` and `onSetUpTool` are
              // deliberately NOT passed. They are optional on purpose and
              // omitting one makes the control ABSENT rather than inert — and
              // this build has no honest destination for any of the three: no
              // screen in it installs Claude Code or Codex, points Effi at
              // another CLI, or switches a device platform on. A "Set up"
              // button that opened nothing would be worse than no button.
              connections={connections}
              // The same two statements the old section ran, reaching the same
              // single ConnectionsPage mounted above.
              onOpenConnections={() => {
                setConnectionsOpen(true);
                setSettingsOpen(false);
              }}
              diagnostics={diagnostics}
              onRecheckDiagnostics={() => void check()}
            />
          </div>
        </aside>
      )}

      {/* TASKS 74 + 75. The inspector: Tasks and History as two tabs, with
          Project & Git as a disclosure under them. Hidden by class during
          onboarding, never removed, for the same reason the workspace is — the
          selected tab and the disclosure keep their state and nothing below
          them is remounted when the user lands in the workspace.

          It stays a SIBLING of <main> rather than moving inside a Workbench:
          there is one of it, bound to the ACTIVE project's plan and the git
          read taken for that project's path, and a copy per project would show
          every hidden project the active one's branches. */}
      <Inspector
        // `workspaceHidden`, not `onboardingView`: the inspector shows the
        // ACTIVE PROJECT's plan and git read, so it belongs to the workspace
        // and must leave with it. Gating on onboarding alone left the task
        // checklist and the branch list sitting beside three full-page
        // surfaces that had hidden the workspace itself — Verify, the neutral
        // shell, and Connections (seen at 1440x900 against
        // mockups/05-connections, where "Connect your workflow" rendered with
        // the workbench's Tasks 2/4 and Project & Git still in the rail).
        hidden={workspaceHidden}
        // TASK 110. The whole band is `band`, a class string: the column is
        // `static` from 1100px up and a `fixed` drawer below it, and a closed
        // drawer is `hidden` — display:none, so the Tasks/History selection,
        // both panels' scroll positions and the Project & Git disclosure all
        // survive a resize. Nothing about it is an unmount.
        band={inspectorBand}
        onCloseDrawer={() => setOverlay(null)}
        state={activeState}
        claudeContext={inspectorClaudeContext}
        gitInfo={gitInfo}
        gitBusy={gitBusy}
        gitError={gitError}
        gitCollapsed={panels.propertiesCollapsed}
        onToggleGit={() => togglePanel('propertiesCollapsed')}
        onCheckout={(b) => void handleCheckout(b)}
        onCreateBranch={(n) => void handleCreateBranch(n)}
      />

      {/* TASK 110. The two scrims, one per drawer, each gated on the band in
          which its column is a drawer — `min-[900px]:hidden` for the sidebar
          and `min-[1100px]:hidden` for the inspector — so neither can appear
          over a column that is part of the layout. Dimmed with the ground
          token at 80%, never with an opacity wash over the content behind it.
          aria-hidden and not a focus stop: the drawer's own ✕, Escape inside
          it, and the opposite door are the real ways out, and this is the
          click-outside convenience. */}
      <div
        aria-hidden="true"
        onClick={() => setOverlay(null)}
        className={`fixed inset-0 z-30 bg-ground/80 min-[900px]:hidden ${
          overlay === 'sidebar' && !onboardingView ? '' : 'hidden'
        }`}
      />
      <div
        aria-hidden="true"
        onClick={() => setOverlay(null)}
        className={`fixed inset-0 z-30 bg-ground/80 min-[1100px]:hidden ${
          overlay === 'inspector' && !onboardingView ? '' : 'hidden'
        }`}
      />

      {/* TASK 110. The doors. Each one is the ONLY way to reach its column in
          the band where that column has left the flow, so each is shown
          exactly there and nowhere else: above its breakpoint the column is on
          screen and a button offering to open it would open nothing.

          Both call the same single-valued setter, which is where "only one
          overlay at a time" actually lives: pressing Inspector while the
          projects drawer is up writes 'inspector' over 'sidebar' in one
          update, so the first closes as the second opens. They sit at z-50,
          above the scrim, so the second door is reachable while the first
          drawer is open — and each hides itself while its own drawer is up,
          where the drawer's own ✕ is the affordance instead.

          The projects door follows the PERSISTED collapse preference rather
          than overriding it: a user who collapsed the sidebar asked not to
          have it, at any width, and Cmd+B is still what brings it back. This
          button never writes that preference. */}
      {!panels.sidebarCollapsed && (
        <button
          type="button"
          onClick={() => setOverlay('sidebar')}
          aria-expanded={overlay === 'sidebar'}
          aria-controls="project-drawer"
          className={`fixed bottom-4 left-4 z-50 rounded-lg border border-border bg-surface px-2 py-1 text-xs leading-[18px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none ${
            overlay === 'sidebar' || onboardingView ? 'hidden' : 'block min-[900px]:hidden'
          }`}
        >
          Projects
        </button>
      )}
      <button
        type="button"
        onClick={() => setOverlay('inspector')}
        aria-expanded={overlay === 'inspector'}
        aria-controls="project-inspector"
        className={`fixed right-4 bottom-4 z-50 rounded-lg border border-border bg-surface px-2 py-1 text-xs leading-[18px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none ${
          overlay === 'inspector' || onboardingView ? 'hidden' : 'block min-[1100px]:hidden'
        }`}
      >
        Inspector
      </button>
    </div>
  );
}
