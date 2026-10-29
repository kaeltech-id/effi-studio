import { useRef, useState, type ReactNode } from 'react';
import { AddToolMenu, type SetupTarget, type WorkspaceToolKind } from './add-tool-menu';
import { AgentSessionPane, type AgentCapabilities } from './agent-session-pane';
import { HistoryPanel } from './history-panel';
import { PanelSection } from './panel-section';
import { PropertiesPanel } from './properties-panel';
import { StageRail } from './stage-rail';
import { TabStrip } from './tab-strip';
import { TaskPanel } from './task-panel';
import { TerminalPane } from './terminal-pane';
import type { Agent } from '../lib/agents';
import type { Tab } from '../lib/tabs';
import type { ComponentReport, GitInfo, Project, ProjectState } from '../lib/types';

/**
 * ONE PROJECT'S WORKBENCH: a header, a row of tabs, and a body that holds
 * EVERY open tab's pane at once.
 *
 * The body is the whole point of the file, and it is built on one invariant:
 *
 *   Every pane stays mounted and is hidden when inactive. Unmounting would
 *   kill the process behind it, and a /ec-execute running in that tab would
 *   die with it.
 *
 * Which is why the body below is a `.map` over every tab and not a lookup of
 * the active one. There is no `tabs.find(...)` here, no ternary that swaps one
 * pane for another, and no conditional that can put a different subtree in the
 * same slot. Every tab's pane is rendered on every pass; `hidden` — a class,
 * so React keeps the node — decides which one you can see.
 *
 * The keys are `tab.id`, never the position in the array and never the
 * provider. An index key is the specific mistake this file exists to prevent:
 * close the first of three tabs and every later pane would be re-keyed onto a
 * different element, remounting it, re-running TerminalPane's effect and
 * tearing down a session that is still running. `tab.id` is minted by the Rust
 * side (tabs.rs:91-104) and survives both reordering and a restart.
 *
 * App.tsx renders ONE OF THESE PER PROJECT and hides the inactive ones the
 * same way, so switching project is also a class change rather than an
 * unmount. The hidden panes keep measuring 0x0 — TerminalPane's ResizeObserver
 * already refuses to fit at that size (terminal-pane.tsx:85-87), and nothing
 * here resizes a hidden pane or reopens its PTY.
 *
 * Nothing in this file starts, closes or reserves anything. Every mutation
 * leaves through a prop, exactly as TabStrip does it, so the StrictMode
 * double-invoke that App.tsx guards with its `opening` ref has nothing to
 * double here.
 */

/** A provider the registry does not list declares nothing. Capabilities are
 *  declared by the provider, never inferred from an id or a name — the rule
 *  agent-session-pane.tsx:8-13 records — so an unknown one gets the empty set
 *  rather than a guess. */
const NO_CAPABILITIES: AgentCapabilities = {
  workflowAdapter: false,
  resumeSession: false,
  slashCommands: false,
};

export interface WorkbenchProps {
  /** Null only in the one case where no folder has been added yet. The header
   *  still renders — Settings has to stay reachable with nothing configured. */
  project: Project | null;
  state: ProjectState | null;
  /** This project's tabs in the user's own order, each carrying the live
   *  session id the host reserved for it (the Rust side always answers with
   *  null there, tabs.rs:53-61). */
  tabs: Tab[];
  activeTabId: string | null;
  /** The provider registry, for naming a tab's provider and for the menu. */
  agents: Agent[];
  reports: ComponentReport[];
  /** Bumped by the host after a flow-bar dispatch moved focus to a button.
   *  Applied to the active tab only; 0 never steals focus. */
  focusNonce: number;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onSelectTab: (tabId: string) => void;
  /** A tab with no live process: metadata only. */
  onCloseTab: (tab: Tab) => void;
  /** A tab holding one, after TabStrip's own confirmation. */
  onCloseSession: (tab: Tab, sessionId: string) => void;
  onReorder: (ids: string[]) => void;
  onOpenAgentTab: (agentId: string) => void;
  onOpenToolTab: (kind: WorkspaceToolKind) => void;
  onOpenSetup: (target: SetupTarget) => void;
  onConfigureCli: () => void;
  onManageTools: () => void;
  /** The flow bar, composed by the host because it types into this project's
   *  active session. It sits between the strip and the body, as the mockup
   *  has it, and is a sibling of neither pane. */
  flow?: ReactNode;
  /** The surface for a `browser` tab, composed by the host.
   *
   *  A render prop rather than a component imported here, for the reason
   *  `flow` is one: the Browser pane is a CONTROLLER over a per-tab registry
   *  entry in the Rust side (browser.rs), so it owns invokes, and nothing in
   *  this file starts, closes or reserves anything. The host builds it once per
   *  browser tab and this file only places it.
   *
   *  Returning null is honest and supported: it leaves the pane empty rather
   *  than putting a second explanation of the same absence on screen. */
  browserPane?: (tab: Tab) => ReactNode;
  /** The surface for an `ios` or `android` tab, composed by the host, for
   *  exactly the reasons `browserPane` is: the device pane is a CONTROLLER
   *  over the five `devices.rs` commands and the ownership record behind them,
   *  so it owns invokes and nothing in this file launches, stops or releases
   *  anything. The host builds it once per device tab and this file only places
   *  it — under the tab's own `tab.id` key in the `tabs.map` below, hidden by a
   *  class when the tab is not in front, so a selection change cannot unmount
   *  it or take a device's claim with it.
   *
   *  It is NOT a preview. `EMBEDDED_PREVIEW_SUPPORTED` is false
   *  (devices.rs:58): a native simulator cannot be drawn into this webview, so
   *  what the host places here is a control surface plus a device that opens in
   *  its own window.
   *
   *  Returning null is honest and supported, as above. */
  devicePane?: (tab: Tab) => ReactNode;
}

export function Workbench({
  project,
  state,
  tabs,
  activeTabId,
  agents,
  reports,
  focusNonce,
  settingsOpen,
  onToggleSettings,
  onSelectTab,
  onCloseTab,
  onCloseSession,
  onReorder,
  onOpenAgentTab,
  onOpenToolTab,
  onOpenSetup,
  onConfigureCli,
  onManageTools,
  flow,
  browserPane,
  devicePane,
}: WorkbenchProps) {
  /** TabStrip renders a `+` at the end of its row (tab-strip.tsx:433-441) and
   *  AddToolMenu renders a `+` of its own above its popover
   *  (add-tool-menu.tsx:436-452). Both are 32px bordered squares with the same
   *  mark and the same accessible name, and two of them side by side would say
   *  there are two menus.
   *
   *  So exactly one is shown, and it is the menu's own: it owns the popover's
   *  open state, its focus-on-open and its focus-return on Escape, none of
   *  which can be driven from out here. It is positioned over the spot the
   *  strip reserves for its own — `top-1 right-2` is where an h-8 button lands
   *  in an h-10 row with px-2 padding — so the row still reads exactly as the
   *  mockup has it, with the `+` outside the scrolling run and on screen at
   *  any tab count.
   *
   *  The strip's `+` is hidden by the one thing about it this file can name
   *  without reaching into the component: its accessible name. If that label
   *  ever changes the rule stops matching and a second `+` appears — visibly,
   *  not silently — and `onAddTool` below is wired to press the real trigger
   *  so that second button would still open the one menu rather than nothing. */
  const addToolRef = useRef<HTMLDivElement | null>(null);
  const openAddTool = () => {
    // The trigger is the first button in the subtree; the popover's rows come
    // after it, so this is unambiguous whether the menu is open or closed.
    addToolRef.current?.querySelector<HTMLButtonElement>('button')?.click();
  };

  const providerName = (providerId: string) =>
    agents.find((a) => a.id === providerId)?.name ?? providerId;

  const branch = state?.branch ?? null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* TASK 68. The project header: name, path and branch. Path and branch
          are truncated and carry their full value in `title`, because a path
          is the one string here that is routinely longer than the window and
          routinely needed in full. */}
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <h1
              title={project?.name}
              className="min-w-0 truncate text-base leading-[24px] font-semibold text-text"
            >
              {project?.name ?? 'No project selected'}
            </h1>
            {branch !== null && (
              <span
                title={branch}
                className="max-w-[200px] shrink-0 truncate rounded-lg border border-border bg-raised px-2 py-0.5 font-mono text-xs leading-[18px] text-muted"
              >
                {branch}
              </span>
            )}
          </div>
          <p title={project?.path} className="mt-0.5 truncate text-xs leading-[18px] text-muted">
            {project?.path ?? 'No folder is configured yet.'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3 pt-1">
          {/* A recommendation, exactly as it was in the header this replaces:
              the dots say which stage the plan is at, and nothing here claims
              a stage is running. */}
          <StageRail stage={state?.stage ?? 'Idle'} size="md" />
          <span className="font-mono text-xs leading-[18px] text-muted">
            {state ? `${state.done}/${state.total}` : ''}
          </span>
          <button
            type="button"
            onClick={onToggleSettings}
            aria-expanded={settingsOpen}
            aria-controls="settings-drawer"
            className={`shrink-0 rounded-lg border px-2 py-1 text-xs leading-[18px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none ${
              settingsOpen
                ? 'border-copper bg-copper-tint text-text'
                : 'border-border text-muted hover:bg-hover'
            }`}
          >
            Settings
          </button>
        </div>
      </header>

      {/* TASK 67. One row of tabs, then the flow bar, then the body. All three
          above the body are shrink-0 and the body is min-h-0 flex-1, so the
          chrome takes its own height ONCE and the terminal takes every pixel
          that is left — the generous terminal the contract asks for, rather
          than a share that shrinks as the strip fills up. */}
      {project !== null && (
        <div className="relative shrink-0">
          {/* The wrapper carries the rule so it can only ever reach the strip's
              own `+`; the menu's trigger is mounted outside it. */}
          <div className="[&_[aria-label='Add_a_tool']]:hidden">
            <TabStrip
              tabs={tabs}
              activeTabId={activeTabId}
              onSelect={onSelectTab}
              onCloseTab={onCloseTab}
              onCloseSession={onCloseSession}
              onAddTool={openAddTool}
              providerName={providerName}
              onReorder={onReorder}
            />
          </div>
          <div ref={addToolRef} className="absolute top-1 right-2">
            <AddToolMenu
              agents={agents}
              reports={reports}
              onOpenAgentTab={onOpenAgentTab}
              onOpenToolTab={onOpenToolTab}
              onOpenSetup={onOpenSetup}
              onConfigureCli={onConfigureCli}
              onManageTools={onManageTools}
            />
          </div>
        </div>
      )}

      {flow}

      <div className="relative min-h-0 flex-1">
        {/* TASK 63. Every tab, every pass. Keyed on tab.id. */}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${tab.id === activeTabId ? '' : 'hidden'}`}
          >
            <TabPane
              tab={tab}
              agents={agents}
              focusNonce={tab.id === activeTabId ? focusNonce : 0}
              cwd={project?.path ?? ''}
              browserPane={browserPane}
              devicePane={devicePane}
            />
          </div>
        ))}

        {tabs.length === 0 &&
          (project === null ? (
            <p className="p-4 text-sm leading-[20px] text-muted">
              Add a folder to open a tool in it.
            </p>
          ) : (
            <EmptyWorkbench projectName={project.name} onAddTool={openAddTool} />
          ))}
      </div>
    </div>
  );
}

/** The one surface a tab hosts. A plain function component rather than an
 *  inline switch so each branch is a stable element type under the same
 *  `tab.id` key: the agent branch never becomes the shell branch for a given
 *  tab, because `tab.type` is fixed when the tab is opened (tabs.rs:157-180). */
function TabPane({
  tab,
  agents,
  focusNonce,
  cwd,
  browserPane,
  devicePane,
}: {
  tab: Tab;
  agents: Agent[];
  focusNonce: number;
  cwd: string;
  browserPane?: (tab: Tab) => ReactNode;
  devicePane?: (tab: Tab) => ReactNode;
}) {
  switch (tab.type) {
    case 'agent': {
      if (tab.providerId === null) {
        // Nothing to resolve and therefore nothing to start. Said plainly
        // rather than shown as an empty terminal that looks like it is waiting.
        return (
          <p className="p-4 text-sm leading-[20px] text-muted">
            This tab records no provider, so there is nothing to start in it.
          </p>
        );
      }
      if (tab.sessionId === null) {
        // The host reserves ids; until one lands there is no session to attach
        // to. The pane appears when the id does and is never swapped back out.
        return (
          <p className="p-4 text-sm leading-[20px] text-muted">No session for this tab yet.</p>
        );
      }
      const agent = agents.find((a) => a.id === tab.providerId);
      return (
        <AgentSessionPane
          sessionId={tab.sessionId}
          cwd={cwd}
          agentId={tab.providerId}
          focusNonce={focusNonce}
          agentName={agent?.name ?? tab.providerId}
          capabilities={agent?.capabilities ?? NO_CAPABILITIES}
        />
      );
    }

    case 'shell': {
      if (tab.sessionId === null) {
        return (
          <p className="p-4 text-sm leading-[20px] text-muted">No session for this tab yet.</p>
        );
      }
      return <ShellPane sessionId={tab.sessionId} cwd={cwd} focusNonce={focusNonce} />;
    }

    case 'browser':
      // The Browser surface EXISTS now: browser-pane.tsx, driven by the eleven
      // `browser_*` commands, composed by the host and placed here. It is an
      // address controller plus an `Open externally` handoff and NOT a
      // viewport — browser.rs:1-51 establishes against the vendored crate
      // source that this Tauri cannot host an embedded browsing surface — so
      // the `NotBuilt` copy that used to sit here would now be wrong twice
      // over: the surface is built, and what it does is explained by the pane
      // itself in the backend's own words.
      //
      // The two device cases below are now in exactly the same position, for
      // exactly the same reason — see them.
      return <>{browserPane?.(tab) ?? null}</>;

    case 'ios':
    case 'android':
      // The device surface EXISTS now: device-pane.tsx, driven by the five
      // `devices.rs` commands, composed by the host and placed here. So the two
      // `NotBuilt` panels that used to sit here — the ones announcing that no
      // simulator and no emulator surface had been built, and that nothing had
      // been started — went with them, for the reason the browser one did: the
      // surface IS built, and what it does and does not do is explained by the
      // pane itself in the backend's own words rather than by a second sentence
      // here that would drift from it.
      //
      // Retiring that copy claims NOTHING new about a preview. There is still
      // no viewport: `EMBEDDED_PREVIEW_SUPPORTED` is false (devices.rs:58), a
      // launched device opens in its own window, and the pane says so with the
      // backend's `windowNote` before Launch is ever pressed. What changed is
      // that a control surface is here; what did not change is that this app
      // cannot mirror a native device.
      //
      // Both kinds share one branch because they are one surface: the pane
      // takes the platform off its report, and iOS and Android differ in the
      // words the platform table holds, never in the tree. Falling through to a
      // shared branch is not a swap of element type — `tab.type` is fixed when
      // the tab is opened (tabs.rs:157-180), so a given tab's pane is the same
      // component on every pass.
      return <>{devicePane?.(tab) ?? null}</>;
  }
}

/** The terminal's own id in `pty_start`, which is `agents::SHELL_ID` in the
 *  Rust side (agents.rs). It is NOT a provider id and the registry does not
 *  list it: `pty_start` answers it on a resolution path of its own, resolving
 *  the user's `$SHELL` with a /bin/zsh fallback, so a terminal opens on a
 *  machine with no AI CLI installed at all — the basic facility DESIGN-SPEC.md
 *  §2 and §10 ask for. Which is also why it is spelled here rather than looked
 *  up in `agents`: a lookup would find nothing, by design. */
const SHELL_AGENT_ID = '__shell__';

/** A real terminal: the shell itself.
 *
 *  `agentId` is non-null, which is TerminalPane's start mode
 *  (terminal-pane.tsx:28-36) — the pane subscribes to the reserved session
 *  first and only then calls ptyStart, so the shell's first prompt cannot
 *  precede the listener that carries it. No header line: there is nothing left
 *  to warn about, and a black rectangle here is a shell that has not printed
 *  its prompt yet rather than a session nothing will ever write to. A failed
 *  start is written into the terminal itself by TerminalPane's catch, in the
 *  resolver's own words. */
function ShellPane({
  sessionId,
  cwd,
  focusNonce,
}: {
  sessionId: string;
  cwd: string;
  focusNonce: number;
}) {
  return (
    <TerminalPane
      sessionId={sessionId}
      cwd={cwd}
      agentId={SHELL_AGENT_ID}
      focusNonce={focusNonce}
    />
  );
}

/* `NotBuilt` stood here until the device panes landed. It is gone rather than
 * kept for a future tab type: every one of the five `TabType`s now has a real
 * surface behind it, and a spare panel announcing an unbuilt one, with no
 * caller left to render it, is an invitation to explain an absence that
 * something else is already explaining better. */

/* ------------------------------------------------------------------------- *
 * TASKS 74 + 75. The inspector column.
 *
 * It is a SIBLING of the workbench, never an ancestor of a pane. Nothing below
 * belongs to a tab, holds a pty or can unmount one: the tab panes live in the
 * `tabs.map` above, under their own `tab.id` keys, and `selected` here is a
 * piece of state in a component that does not render them. Switching Tasks to
 * History re-renders this column and nothing else — there is no path from this
 * `useState` to the body's subtree, so a /ec-execute cannot be killed by
 * looking at the history.
 *
 * The same discipline applies inside the column anyway: both tab panels are
 * mounted on every pass and the inactive one is hidden by a class, so neither
 * panel loses its scroll position when the other is shown.
 * ------------------------------------------------------------------------- */

type InspectorTabId = 'tasks' | 'history';

/** The two views, in the order the mockup puts them. The loop below names its
 *  item `view` rather than `tab`: a workspace tab in this file is a process
 *  with a pty behind it, and the one key minted from a tab id in this tree
 *  should stay the pane-mounted invariant's and nothing else's. */
const INSPECTOR_TABS: { id: InspectorTabId; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'history', label: 'History' },
];

export interface InspectorProps {
  /** The active project's plan, or null with no project. */
  state: ProjectState | null;
  /** Whether the active tab's provider could be asked to run a `/ec-*`
   *  command. Resolved by the host from the provider's declared capability and
   *  passed straight through, exactly as TaskPanel documents it. */
  claudeContext: boolean;
  gitInfo: GitInfo | null;
  gitBusy: boolean;
  /** git's own stderr from the last refused action. Handed to PropertiesPanel
   *  verbatim: no retry is offered here and nothing is forced. */
  gitError: string | null;
  gitCollapsed: boolean;
  onToggleGit: () => void;
  onCheckout: (branch: string) => void;
  onCreateBranch: (name: string) => void;
  /** Hidden by a class during onboarding — never removed, so the disclosure
   *  and the selected tab survive the trip. */
  hidden?: boolean;
  /** TASK 110. The column's display and position for the current band, as a
   *  class string the host composes: `static` from 1100px up, a `fixed` drawer
   *  below it, and `hidden` when that drawer is closed.
   *
   *  It is a CLASS and not a mode switch for one reason — `hidden` is
   *  display:none, so the node, the selected tab, both panels' scroll
   *  positions and the Project & Git disclosure all stay mounted through every
   *  band. There is no branch in this file that removes the column, and the
   *  host does not persist any of it: see App.tsx's `overlay`.
   *
   *  Defaults to the pre-drawer behaviour, so a host that passes nothing gets
   *  a column that is simply always in the flow. */
  band?: string;
  /** Closes the drawer. Omit it and the drawer's own ✕ is absent rather than
   *  inert — a host that never puts this column in a drawer has nothing for it
   *  to close. */
  onCloseDrawer?: () => void;
}

export function Inspector({
  state,
  claudeContext,
  gitInfo,
  gitBusy,
  gitError,
  gitCollapsed,
  onToggleGit,
  onCheckout,
  onCreateBranch,
  hidden = false,
  band = 'flex',
  onCloseDrawer,
}: InspectorProps) {
  const [selected, setSelected] = useState<InspectorTabId>('tasks');
  const tabRefs = useRef(new Map<InspectorTabId, HTMLButtonElement>());

  /** Automatic activation: the arrows select as they move. Both panels are
   *  already mounted, so arrowing across them reveals one and costs nothing —
   *  unlike the workspace strip above, where a tab stop may be a whole
   *  session and selection therefore waits for Enter. */
  const select = (id: InspectorTabId) => {
    setSelected(id);
    tabRefs.current.get(id)?.focus();
  };

  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = INSPECTOR_TABS.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    select(INSPECTOR_TABS[next].id);
  };

  /** A count beside a tab, or nothing. `0/0` is not a progress reading and a
   *  project with no plan has no ratio, so the Tasks tab carries a figure only
   *  once there is one — no division happens here either way. */
  const detailFor = (id: InspectorTabId): string | null => {
    if (id === 'tasks') {
      return state !== null && state.total > 0 ? `${state.done}/${state.total}` : null;
    }
    const runs = state?.history.length ?? 0;
    return runs > 0 ? String(runs) : null;
  };

  return (
    <aside
      id="project-inspector"
      /* TASK 110. 300px from 1360 up and 280 from 1100 — the two widths the
         mockup measures — then a 300px DRAWER below 1100, where the window is
         too narrow to spend a third of it on a column that is not the
         terminal. The column is shrink-0 in both flow bands so the terminal,
         not the inspector, absorbs every pixel the window gains, and below
         1100 it leaves the flow entirely and the terminal takes its width too.

         `bg-transparent` from 1100 up keeps the in-flow column exactly as it
         was — the ground behind it, with one border-l — while the drawer gets
         an opaque surface, because a drawer sits over the terminal. */
      className={`fixed inset-y-0 right-0 z-40 w-[300px] max-w-[85vw] shrink-0 flex-col border-l border-border bg-surface min-[1100px]:static min-[1100px]:w-[280px] min-[1100px]:bg-transparent min-[1360px]:w-[300px] ${
        hidden ? 'hidden' : band
      }`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCloseDrawer?.();
      }}
    >
      {/* The drawer's own close affordance, and only in the band where this
          column IS a drawer: from 1100px up it is part of the layout and there
          is nothing to close. */}
      {onCloseDrawer && (
        <div className="flex h-10 shrink-0 items-center justify-end border-b border-border px-2 min-[1100px]:hidden">
          <button
            type="button"
            onClick={onCloseDrawer}
            aria-label="Close the inspector drawer"
            className="shrink-0 rounded-lg border border-border px-2 py-1 font-mono text-xs leading-[18px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none"
          >
            ✕
          </button>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Project inspector"
        className="flex shrink-0 border-b border-border px-2"
      >
        {INSPECTOR_TABS.map((view, index) => {
          const active = view.id === selected;
          const detail = detailFor(view.id);
          return (
            <button
              key={view.id}
              type="button"
              role="tab"
              id={`inspector-tab-${view.id}`}
              aria-selected={active}
              aria-controls={`inspector-panel-${view.id}`}
              // Roving tabindex: the tablist is one stop, and Tab re-enters on
              // whichever tab is showing.
              tabIndex={active ? 0 : -1}
              ref={(el) => {
                if (el) tabRefs.current.set(view.id, el);
                else tabRefs.current.delete(view.id);
              }}
              onClick={() => setSelected(view.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={`-mb-px flex h-10 min-w-0 flex-1 items-center justify-center gap-2 border-b-2 px-3 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper motion-reduce:transition-none ${
                active ? 'border-copper text-text' : 'border-transparent text-muted hover:text-text'
              }`}
            >
              <span className={`truncate text-sm leading-[20px] ${active ? 'font-semibold' : ''}`}>
                {view.label}
              </span>
              {detail !== null && (
                <span className="shrink-0 font-mono text-xs leading-[18px] text-muted">
                  {detail}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Both panels, every pass; `hidden` picks the one on screen. */}
      <div className="relative min-h-0 flex-1">
        <div
          id="inspector-panel-tasks"
          role="tabpanel"
          aria-labelledby="inspector-tab-tasks"
          // A focus stop so the checklist can be scrolled from the keyboard.
          // The hidden panel is display:none and so is out of the tab order
          // and out of the accessibility tree with it.
          tabIndex={0}
          className={`absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper ${
            selected === 'tasks' ? '' : 'hidden'
          }`}
        >
          <TaskPanel state={state} claudeContext={claudeContext} />
        </div>
        <div
          id="inspector-panel-history"
          role="tabpanel"
          aria-labelledby="inspector-tab-history"
          tabIndex={0}
          className={`absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper ${
            selected === 'history' ? '' : 'hidden'
          }`}
        >
          {/* Its own copy for its own absence: an empty history says no run has
              been ARCHIVED, which is a different fact from a project with no
              plan, and HistoryPanel keeps saying it in its own words — along
              with each run's title, slug, date, time, branch and the count of
              the older runs the window is holding back. */}
          <HistoryPanel history={state?.history ?? []} />
        </div>
      </div>

      {/* TASK 75. Project & Git, as the one disclosure the mockup draws at the
          foot of the column. It is PanelSection — the rail's own header,
          chevron and aria-expanded — rather than a second collapsible invented
          here. PropertiesPanel is handed through untouched, so every git state
          it already surfaces survives: the branch list, the explicit
          `detached` flag, `available: false`, git's verbatim error, the hidden
          count and the unfinished-task warning. Nothing here retries a refused
          checkout and nothing here forces one. */}
      <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-border">
        <PanelSection
          title="Project & Git"
          collapsed={gitCollapsed}
          onToggle={onToggleGit}
          // The branch, when git names one. A detached HEAD names none, and is
          // left to PropertiesPanel to say in full rather than guessed at from
          // the absence here.
          detail={gitInfo?.branch ?? undefined}
        >
          <PropertiesPanel
            gitInfo={gitInfo}
            incompleteTasks={state ? Math.max(0, state.total - state.done) : 0}
            busy={gitBusy}
            error={gitError}
            onCheckout={onCheckout}
            onCreateBranch={onCreateBranch}
          />
        </PanelSection>
      </div>
    </aside>
  );
}

/** EDGE CASE: a project with no tabs open. The body offers the one thing there
 *  is to do rather than sitting blank. */
function EmptyWorkbench({
  projectName,
  onAddTool,
}: {
  projectName: string;
  onAddTool: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-sm leading-[20px] text-text">No tools are open in {projectName}.</p>
      <p className="max-w-[420px] text-xs leading-[18px] text-muted">
        Agent sessions, a terminal and the other workspace surfaces each open as a tab here.
      </p>
      <button
        type="button"
        onClick={onAddTool}
        className="rounded-lg border border-copper bg-copper px-3 py-1.5 text-xs leading-[18px] font-semibold text-on-copper transition-colors duration-150 hover:bg-copper/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none"
      >
        Add a tool
      </button>
    </div>
  );
}
