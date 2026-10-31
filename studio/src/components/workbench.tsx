import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AddToolMenu, type SetupTarget, type WorkspaceToolKind } from './add-tool-menu';
import { AgentSessionPane, type AgentCapabilities } from './agent-session-pane';
import { Composer, type ContextChip } from './composer';
import { ProjectActivity } from './project-activity';
import { TabStrip } from './tab-strip';
import { TerminalPane } from './terminal-pane';
import type { Agent } from '../lib/agents';
import type { Tab } from '../lib/tabs';
import type { ComponentReport, DiffStat, GitInfo, Project, ProjectState } from '../lib/types';
import { api } from '../lib/tauri-api';

/**
 * ONE PROJECT'S WORKBENCH: the Contract's CENTRE COLUMN — a breadcrumb, a row
 * of tabs, the workflow strip, a card holding EVERY open tab's pane at once,
 * and the composer anchored under it — plus `Inspector`, the right column the
 * host mounts beside it.
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

/** The composer carries no context chips. The mockup draws two — a folder and
 *  a file count — and both are sample data: this app has no attachment path and
 *  no file picker feeding the agent, and a chip with a ✕ that removes nothing
 *  real is a dead control. One frozen empty array rather than a new `[]` per
 *  render, so the composer is not handed a new prop on every keystroke. */
const NO_CHIPS: ContextChip[] = [];

/** Never called: with no chips there is no ✕ to press. It exists because
 *  `Composer` requires the handler, not because anything can reach it. */
function removeNoChip() {}

function useGitDiffStat(path: string | null): DiffStat | null {
  /** Keyed to the path it describes. Without the key, switching projects left
   *  the PREVIOUS project's numbers on screen under the NEW project's branch
   *  pill for the length of a `git diff --numstat` subprocess — a wrong
   *  reading rendered as a confident one, which is the exact failure the
   *  five-way DiffStat split exists to prevent. */
  const [diff, setDiff] = useState<{ path: string; stat: DiffStat } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const refresh = () => setNonce((n) => n + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  useEffect(() => {
    if (path === null) return;
    let live = true;
    api
      .gitDiffStat(path)
      .then((stat) => {
        if (live) setDiff({ path, stat });
      })
      .catch((err: unknown) => {
        if (!live) return;
        setDiff({
          path,
          stat: {
            available: false,
            filesChanged: 0,
            insertions: 0,
            deletions: 0,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      });
    return () => {
      live = false;
    };
  }, [path, nonce]);

  return diff?.path === path ? diff.stat : null;
}

export interface WorkbenchProps {
  /** Null only in the one case where no folder has been added yet. The column
   *  still renders: the breadcrumb says so in words, and the body offers the
   *  one thing there is to do. */
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
  /** ACCEPTED AND NO LONGER DRAWN. The workbench header used to carry a
   *  Settings toggle; the Contract gives the centre column a breadcrumb, a
   *  branch pill and nothing else, and `Settings` is a row in the left rail
   *  now (workspace-rail.tsx, wired to this same toggle at App.tsx:1964). A
   *  second one here would be the same drawer behind two buttons.
   *
   *  Both stay on the interface so the host's call site keeps compiling
   *  unchanged; nothing in this file reads either. Drop them from App.tsx and
   *  then from here, in that order. */
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
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

  // Truthiness, not just null: `ProjectState.branch` is a plain string, and an
  // empty one is a project git could not name. A pill with nothing in it would
  // be a branch claimed and not said.
  const branch = state?.branch ? state.branch : null;
  /** The session the composer types into: the one in FRONT. Reading "whatever
   *  session is live" would let a line land in a tab the user is not looking
   *  at, which is the same class of mistake the tabs.map below exists to
   *  prevent. A tab with no process answers null and the composer disables
   *  itself rather than sending into nothing. */
  const activeSessionId = tabs.find((tab) => tab.id === activeTabId)?.sessionId ?? null;

  return (
    /* THE CENTRE COLUMN of the Contract, stacked in its order: breadcrumb, tab
       strip, workflow strip, the card holding the body, and the composer
       anchored at the bottom. Everything above the body is shrink-0 and the
       body is min-h-0 flex-1, so the chrome takes its own height ONCE and the
       terminal takes every pixel left over. */
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4">
      {/* The Contract's breadcrumb row. `Workspace /` is fixed copy; the name
          after it is the real project, never the mockup's. The path is the one
          string here routinely longer than the window, so it rides in `title`
          rather than in a second line.

          The mockup's ellipsis is NOT drawn: it has no menu behind it, and the
          rule this file already follows for the strip's second `+` is that a
          control which opens nothing does not get rendered. */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="shrink-0 text-sm leading-[20px] text-muted">Workspace</span>
        <span aria-hidden="true" className="shrink-0 text-sm leading-[20px] text-muted">
          /
        </span>
        <h1
          title={project?.path}
          className="min-w-0 truncate text-sm leading-[20px] font-medium text-text"
        >
          {project?.name ?? 'No project selected'}
        </h1>
        {branch !== null && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <BranchPill branch={branch} />
          </div>
        )}
      </div>

      {/* TASK 67. One row of tabs, then the flow bar, then the body. */}
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

      {/* THE CARD. The Contract's radius, hairline and padding around the body
          — and only around it. What is inside stays the terminal it has always
          been: the mockup draws a chat transcript, and this app runs real CLI
          agents under a PTY with no structured message stream behind them, so
          bubbles, avatars, tool-call cards and diff cards would all be content
          invented here. The deviation is declared in the Design Contract.

          `overflow-hidden` so the panes are clipped to the radius; the inner
          `relative` box is what the absolutely positioned panes measure, which
          keeps the padding real — `inset-0` resolves against the padding box,
          so without it the padding would be drawn and then covered. */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface p-3.5">
        <div className="relative h-full w-full">
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
              <p className="text-sm leading-[20px] text-muted">
                Add a folder to open a tool in it.
              </p>
            ) : (
              <EmptyWorkbench projectName={project.name} onAddTool={openAddTool} />
            ))}
        </div>
      </div>

      {/* The composer, anchored at the foot of the column exactly as the
          Contract draws it. It writes the typed line plus a carriage return
          into the ACTIVE tab's PTY — the same transport a keystroke in the
          pane above uses — and disables itself when that tab has no session.
          Only with a project: with no folder configured there is no tab, no
          session and nothing a message could be addressed to. */}
      {project !== null && (
        <div className="shrink-0">
          <Composer
            sessionId={activeSessionId}
            chips={NO_CHIPS}
            onRemoveChip={removeNoChip}
            // `onAttach` is deliberately omitted, which is what keeps the
            // paperclip off the row: nothing in this app attaches a file to a
            // message.
          />
        </div>
      )}
    </div>
  );
}

/** The Contract's branch pill: git mark, branch name, and no chevron. The
 *  chevron the mockup draws opens a branch switcher, and this column is handed
 *  no checkout handler, so it is not drawn — the same call `project-activity.tsx`
 *  made for the pill on its own git card. The full name rides in `title`,
 *  because a branch name outlives the 24ch the row can spare.
 *
 *  A third local copy of this pill now exists (here, history-panel.tsx:7 and
 *  project-activity.tsx:44). Lifting one of them into a shared component is the
 *  right fix and it needs a file this unit may not write. */
function BranchPill({ branch }: { branch: string }) {
  return (
    <span
      title={branch}
      className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-raised px-2.5 py-1 text-xs leading-[18px] text-muted"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3 shrink-0"
      >
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
      <span className="sr-only">Branch: </span>
      <span className="max-w-[160px] truncate">{branch}</span>
    </span>
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
 * THE RIGHT COLUMN.
 *
 * It is a SIBLING of the workbench, never an ancestor of a pane. Nothing below
 * belongs to a tab, holds a pty or can unmount one: the tab panes live in the
 * `tabs.map` above under their own `tab.id` keys, and the Tasks/History
 * selection is a piece of state inside `ProjectActivity`, a component that does
 * not render them. Looking at the history cannot kill a running /ec-execute.
 *
 * What stood here — a tablist, two mounted panels and a `Project & Git`
 * disclosure — is now `project-activity.tsx` in full: it owns the heading, the
 * segmented control, the plan card's chrome, the `Recent history` preview and
 * the git card, and it composes `TaskPanel` and `HistoryPanel` itself. This
 * file renders neither of those two directly any more; doing so beside
 * `ProjectActivity` would put each of them on screen twice.
 *
 * So what is left here is exactly the part the host still asks for and the
 * column itself does not own: WHERE it sits. From 1100px up the column is part
 * of the layout; below it, it is a drawer over the terminal, opened by the
 * host's own button and closed by the ✕ or Escape.
 * ------------------------------------------------------------------------- */

export interface InspectorProps {
  /** The active project's plan, or null with no project. */
  state: ProjectState | null;
  /** The active project's absolute path, for the one `git_diff_stat` read this
   *  column makes. Passed down rather than looked up: App already holds it
   *  (`const active = projects.find(...)`), and an earlier revision routed it
   *  through a module WeakMap keyed on `state`, which App replaces on every
   *  `.claude/` write — so the card blanked to "No git status yet" and spawned
   *  a second subprocess on every plan-file write. */
  projectPath: string | null;
  /** Whether the active tab's provider could be asked to run a `/ec-*`
   *  command. Resolved by the host from the provider's declared capability and
   *  passed straight through, exactly as TaskPanel documents it. */
  claudeContext: boolean;
  /** ACCEPTED AND NO LONGER READ, all seven of them.
   *
   *  They fed `PropertiesPanel`, the branch list with its checkout and its
   *  create-branch field. The Contract's right column ends with the
   *  `Project & Git` CARD — a branch pill and the working tree's file count
   *  with its +/− — and that card has no switcher behind it, so
   *  `project-activity.tsx` draws no chevron and this column no longer mounts
   *  the panel. Branch switching leaves the product with them; that is a
   *  declared consequence of the Contract, not an oversight here.
   *
   *  They stay on the interface so the host's call site keeps compiling
   *  unchanged. Drop them from App.tsx and then from here, in that order. */
  gitInfo?: GitInfo | null;
  gitBusy?: boolean;
  gitError?: string | null;
  gitCollapsed?: boolean;
  onToggleGit?: () => void;
  onCheckout?: (branch: string) => void;
  onCreateBranch?: (name: string) => void;
  /** Hidden by a class during onboarding — never removed, so the column's own
   *  selection and scroll positions survive the trip. */
  hidden?: boolean;
  /** TASK 110. The column's display and position for the current band, as a
   *  class string the host composes: `static` from 1100px up, a `fixed` drawer
   *  below it, and `hidden` when that drawer is closed.
   *
   *  It is a CLASS and not a mode switch for one reason — `hidden` is
   *  display:none, so the node, the column's Tasks / History selection and its
   *  scroll position all stay mounted through every band. There is no branch
   *  in this file that removes the column, and the host does not persist any
   *  of it: see App.tsx's `overlay`.
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
  projectPath,
  claudeContext,
  hidden = false,
  band = 'flex',
  onCloseDrawer,
}: InspectorProps) {
  /* The one `git_diff_stat` read in the app, taken for the project this column
     is showing and nowhere else — the hidden projects' workbenches start no
     read of their own. A rejection arrives as a DiffStat carrying the reason,
     so the card names the failure instead of printing zeros at it. */
  
  const diff = useGitDiffStat(projectPath);

  return (
    /* TASK 110's bands, kept exactly as the host composes them: `static` from
       1100px up, a `fixed` drawer below it, and `hidden` when that drawer is
       closed. `hidden` is display:none, so the node, the column's Tasks /
       History selection and its scroll position all survive every resize —
       there is no branch here that removes the column.

       A plain div rather than an <aside>: `ProjectActivity` renders the
       complementary landmark itself, named by its own `Project activity`
       heading, and nesting one landmark inside another would announce the
       column twice. Width comes from the column too (400px, the Contract's);
       this wrapper only places it and stays out of its way. */
    <div
      id="project-inspector"
      className={`fixed inset-y-0 right-0 z-40 max-w-[85vw] shrink-0 flex-col overflow-hidden bg-ground min-[1100px]:static min-[1100px]:max-w-none ${
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
        <div className="flex h-10 shrink-0 items-center justify-end border-b border-l border-border px-2 min-[1100px]:hidden">
          <button
            type="button"
            onClick={onCloseDrawer}
            aria-label="Close the inspector drawer"
            className="shrink-0 rounded-lg border border-border px-2 py-1 font-mono text-xs leading-[18px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* A row, so the column stretches to this wrapper's height and scrolls
          inside its own `overflow-y-auto` rather than overflowing it. */}
      <div className="flex min-h-0 flex-1">
        <ProjectActivity state={state} diff={diff} claudeContext={claudeContext} />
      </div>
    </div>
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
        className="rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs leading-[18px] font-semibold text-on-accent transition-colors duration-150 hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        Add a tool
      </button>
    </div>
  );
}
