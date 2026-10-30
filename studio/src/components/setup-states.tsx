import { useCallback, useEffect, useMemo, useState } from 'react';
import { InstallPane } from './install-pane';
import { api } from '../lib/tauri-api';
import type { ToolSelection } from './choose-tools';
import type {
  ComponentId,
  ComponentReport,
  ComponentStatus,
  RetryState,
  Selection,
  SetupItem,
  SetupOp,
  SetupPlan,
} from '../lib/types';

/** Outline marks at the spec's stroke weight, inline so `currentColor` keeps
 *  each one on the token its container already set. Same helper shape as
 *  choose-tools.tsx and choose-experiences.tsx — the screens are one product. */
function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative: every mark here sits beside the word that names it, which
      // is the rule for the seven statuses below — a glyph AND a word, never a
      // colour on its own.
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const TERMINAL = 'M7 9l3 3-3 3 M13.5 15H17';
const BOX = 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z M4 7.5l8 4.5 8-4.5 M12 12v9';
const USERS =
  'M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19 M10 5.5a3 3 0 110 6 3 3 0 010-6 M19 19v-1.5a3.5 3.5 0 00-2.6-3.4 M15.6 5.8a3 3 0 010 5.4';
const WINDOW = 'M4 5.5h16v13H4z M4 9.5h16 M7 7.5h.01';
const PHONE = 'M8.5 3h7a1.5 1.5 0 011.5 1.5v15a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 017 19.5v-15A1.5 1.5 0 018.5 3z M10.5 18h3';
const ROBOT = 'M6 11.5a6 6 0 0112 0V18H6v-6.5z M8.6 5.6L7.2 3.6 M15.4 5.6L16.8 3.6 M9.8 9.2h.01 M14.2 9.2h.01';
const DATABASE =
  'M12 4c3.9 0 7 1.1 7 2.5S15.9 9 12 9 5 7.9 5 6.5 8.1 4 12 4z M5 6.5v11C5 18.9 8.1 20 12 20s7-1.1 7-2.5v-11 M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5';
const COG =
  'M12 9a3 3 0 110 6 3 3 0 010-6 M19.4 13.5l1.6 1-1.5 2.6-1.8-.6a7 7 0 01-1.8 1l-.4 1.9h-3l-.4-1.9a7 7 0 01-1.8-1l-1.8.6L7 14.5l1.6-1a7 7 0 010-2l-1.6-1 1.5-2.6 1.8.6a7 7 0 011.8-1L12.5 4h3l.4 1.9a7 7 0 011.8 1l1.8-.6 1.5 2.6-1.6 1a7 7 0 010 2z';

const CHECK = 'M5 12.5l4.5 4.5L19 7';
const CHECK_CIRCLE = 'M12 4a8 8 0 110 16 8 8 0 010-16 M8.6 12.1l2.4 2.4 4.4-4.6';
const ALERT = 'M12 4.5L20.5 19h-17L12 4.5z M12 10v4 M12 16.5h.01';
const X_CIRCLE = 'M12 4a8 8 0 110 16 8 8 0 010-16 M9.5 9.5l5 5 M14.5 9.5l-5 5';
const CIRCLE = 'M12 4a8 8 0 110 16 8 8 0 010-16';
const CLOCK = 'M12 4a8 8 0 110 16 8 8 0 010-16 M12 7.5V12l3 1.8';
const DOWNLOAD = 'M12 4v10 M8 10.5l4 4 4-4 M5 19h14';
const INFO = 'M12 3a9 9 0 110 18 9 9 0 010-18z M12 11v5 M12 8h.01';
const PEN = 'M4.5 19.5l4.2-1 9-9a2 2 0 00-2.8-2.8l-9 9-1.4 3.8z M14.5 6.5l3 3';
const PLAY = 'M9 6.5l8 5.5-8 5.5V6.5z';
const HAND = 'M8 13V6.5a1.5 1.5 0 013 0V12 M11 11.5V5.5a1.5 1.5 0 013 0V12 M14 11.5v-4a1.5 1.5 0 013 0V15a5 5 0 01-5 5h-1a5 5 0 01-5-5v-2l-1.5-2a1.5 1.5 0 012.4-1.8L8 13';

/** Display names for the ids a plan is made of.
 *
 *  Repeated from choose-tools.tsx:55-65 rather than imported, because that file
 *  is outside this task's two files and does not export the table. The two
 *  copies must stay identical: a component the Review screen calls one thing
 *  and the tool list calls another is the same drift the single table there was
 *  written to prevent. */
const COMPONENT_NAMES: Record<ComponentId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  commands: 'Workflow commands',
  agents: 'Workflow agents',
  worker: 'Memory worker',
  browser: 'Browser',
  ios: 'iOS simulator',
  android: 'Android emulator',
  memory: 'Project memory',
};

const COMPONENT_ICONS: Record<ComponentId, string> = {
  claude: TERMINAL,
  codex: BOX,
  commands: TERMINAL,
  agents: USERS,
  worker: COG,
  browser: WINDOW,
  ios: PHONE,
  android: ROBOT,
  memory: DATABASE,
};

/** What each op will do, in the words of the act rather than of the checkbox.
 *  The four are genuinely different (setup.rs:50-55): pointing at an executable
 *  the user already has, switching on something already shipped, guiding setup
 *  of a dependency this app does not own, and installing a component. */
const OP_LABELS: Record<SetupOp, string> = {
  linkExisting: 'Link the copy already on this machine',
  enableBundled: 'Switch on what already ships with Effi',
  setupExternal: 'You set this one up yourself',
  installSelected: 'Install through install.sh',
};

/** The seven `ComponentStatus` values, each with its own glyph AND its own
 *  word, so none of them is told by colour alone.
 *
 *  `detected` and `ready` are deliberately not the same mark: detected means
 *  found on disk and is never a sign-in (types.ts:99-103), while ready is the
 *  stronger claim that a diagnostic passed. `installing` is the status the
 *  setup flow writes itself for a component whose installer is still running
 *  (setup.rs:619-626) — it sits on the plain text token rather than on a health
 *  token, because an in-flight install is neither healthy nor a problem. */
const STATUS_PRESENTATION: Record<
  ComponentStatus,
  { icon: string; word: string; className: string }
> = {
  notSelected: { icon: CIRCLE, word: 'Not selected', className: 'text-muted' },
  detected: { icon: CHECK, word: 'Detected', className: 'text-success' },
  queued: { icon: CLOCK, word: 'Queued', className: 'text-muted' },
  installing: { icon: DOWNLOAD, word: 'Installing', className: 'text-text' },
  ready: { icon: CHECK_CIRCLE, word: 'Ready', className: 'text-success' },
  needsAttention: { icon: ALERT, word: 'Needs attention', className: 'text-warning' },
  unavailable: { icon: X_CIRCLE, word: 'Unavailable', className: 'text-error' },
};

const NOTHING_SELECTED: Selection = {
  claude: false,
  codex: false,
  commands: false,
  agents: false,
  worker: false,
  browser: false,
  ios: false,
  android: false,
  memory: false,
};

/** The onboarding intent in the one shape the backend will accept. `Selection`
 *  is the only deserialisable type in setup.rs (setup.rs:33-45) and it has one
 *  field per ComponentId and nothing else, which is what stops a caller putting
 *  anything else in a plan. `otherCli` has no field here because it names no
 *  component this app can detect, install or run. */
export function toWireSelection(selection: ToolSelection): Selection {
  const has = (id: ComponentId) => selection.components.includes(id);
  return {
    claude: has('claude'),
    codex: has('codex'),
    commands: has('commands'),
    agents: has('agents'),
    worker: has('worker'),
    browser: has('browser'),
    ios: has('ios'),
    android: has('android'),
    memory: has('memory'),
  };
}

/** One component on its own, for the per-component retry.
 *
 *  Built from the all-false value rather than from the current selection, so a
 *  retry can only ever narrow: pressing it re-runs that component's section and
 *  cannot pull a neighbour's work in with it. `NOTHING_SELECTED` states
 *  "everything else false" once instead of nine times, which is also what makes
 *  a field added to `Selection` upstream start out unselected here rather than
 *  silently true — the same direction setup.rs:38-40 defaults an omitted field
 *  in. */
function onlyComponent(id: ComponentId): Selection {
  const selection: Selection = { ...NOTHING_SELECTED };
  selection[id] = true;
  return selection;
}

// ---------------------------------------------------------------------------
// Effects
//
// Every line rendered below is a string the backend produced beside the code
// that will act on it (setup.rs:283-348). Nothing here rewrites one, shortens
// one or drops one: the grouping that follows only SORTS the lines, and the
// catch-all bucket is what guarantees a line that matches no rule is still
// shown rather than swallowed.
//
// There are no sizes and no durations anywhere on these screens, because
// install.sh measures none. A number appears only where something measured it.
// ---------------------------------------------------------------------------

type EffectGroup = 'writes' | 'runs' | 'yourself' | 'other';

const GROUP_ORDER: EffectGroup[] = ['writes', 'runs', 'yourself', 'other'];

const GROUP_LABELS: Record<EffectGroup, string> = {
  writes: 'Files and config it writes',
  runs: 'Dependencies and the commands it runs',
  yourself: 'What you do yourself',
  other: 'Also',
};

const GROUP_ICONS: Record<EffectGroup, string> = {
  writes: PEN,
  runs: PLAY,
  yourself: HAND,
  other: INFO,
};

/** Sorts one effect line into a heading. Reads the opening verb only, which is
 *  the one part of these sentences the Rust side writes to a fixed shape, and
 *  anything it cannot place falls to `other` so it is still read out. */
function groupOf(line: string): EffectGroup {
  if (/^(writes|creates|records|deletes|installs)\b/i.test(line)) return 'writes';
  if (/^(runs|passes|restarts|stops)\b/i.test(line)) return 'runs';
  if (/^(install|download|add|export|create|point)\b/i.test(line)) return 'yourself';
  return 'other';
}

/** The lines every `installSelected` item carries, lifted out so install.sh's
 *  two unguarded steps are stated once instead of repeated under each
 *  component. Exact-string equality across the items, never a guess at what a
 *  line means — a line that is not on all of them stays in its own block.
 *
 *  With fewer than two install items there is nothing to deduplicate, so
 *  nothing is lifted and the lines stay where they are: visible either way,
 *  which is the only property that matters. */
function sharedInvocationEffects(items: SetupItem[]): string[] {
  const installs = items.filter((i) => i.op === 'installSelected');
  if (installs.length < 2) return [];
  const [first, ...rest] = installs;
  return first.effects.filter((line) => rest.every((item) => item.effects.includes(line)));
}

function EffectList({ lines }: { lines: string[] }) {
  const groups = GROUP_ORDER.map((group) => ({
    group,
    lines: lines.filter((line) => groupOf(line) === group),
  })).filter((g) => g.lines.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ group, lines: groupLines }) => (
        <div key={group}>
          <h4 className="flex items-center gap-2 text-xs leading-[18px] font-semibold tracking-[0.12em] text-muted uppercase">
            <Icon path={GROUP_ICONS[group]} size={14} />
            {GROUP_LABELS[group]}
          </h4>
          <ul className="flex flex-col gap-2 pt-2">
            {groupLines.map((line) => (
              <li key={line} className="flex items-start gap-3 text-sm leading-[21px] text-text">
                <span className="pt-2 text-muted" aria-hidden="true">
                  <span className="block h-1 w-1 rounded-full bg-muted" />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The shared frame both screens render inside. One centred column, matching
 *  the card in 08-setup-states.png; the native titlebar carries the window
 *  controls, so there are no HTML traffic lights here. */
function Surface({
  labelledBy,
  eyebrow,
  title,
  lede,
  children,
  footer,
}: {
  labelledBy: string;
  eyebrow: string;
  title: string;
  lede: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <section aria-labelledby={labelledBy} className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-10 py-10">
        <p className="text-xs leading-[18px] font-semibold tracking-[0.12em] text-muted uppercase">
          {eyebrow}
        </p>
        <h1
          id={labelledBy}
          className="pt-4 text-[30px] leading-[36px] font-semibold tracking-tight text-text"
        >
          {title}
        </h1>
        <p className="pt-2 text-sm leading-[21px] text-muted">{lede}</p>

        <div className="pt-8">{children}</div>

        <div className="mt-8 border-t border-border pt-6">{footer}</div>
      </div>
    </section>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm leading-[20px] font-semibold text-on-accent transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-border px-4 py-2.5 text-sm leading-[20px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** A failure, in the backend's own sentence. Never a retry prompt on its own:
 *  the reason is what tells the user whether retrying is even the right move. */
function ErrorNote({ title, body }: { title: string; body: string }) {
  return (
    <div role="alert" className="rounded-xl border border-error bg-surface px-4 py-3">
      <p className="flex items-center gap-2 text-sm leading-[21px] font-semibold text-error">
        <Icon path={ALERT} size={16} />
        {title}
      </p>
      <p className="pt-2 text-sm leading-[21px] text-text">{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task 42 — Review setup
// ---------------------------------------------------------------------------

export interface ReviewSetupProps {
  /** The ticked components, in the only shape the backend accepts. The plan is
   *  NOT a prop: this screen asks `setupPlan` for it, so what it reads out is
   *  what `run_setup` will build from the same selection. */
  selection: Selection;
  onBack: () => void;
  /** The explicit confirm. Commits the plan and opens the setup screen, which
   *  is where the run starts — see the note on `SetupStates`. */
  onConfirm: () => void;
}

/** What setup will do, before any of it is done.
 *
 *  Every line on this screen comes from `api.setupPlan(selection)` — the
 *  backend's `build_plan`, which is the same function `run_setup` calls
 *  (setup.rs:752) — and never from `draftSetupPlan` in choose-tools.tsx, whose
 *  `effects` arrays are deliberately empty. A review screen that described
 *  something other than what executes would be worse than no review screen, and
 *  that is why `SetupItem` derives Serialize only in Rust: there is no inbound
 *  form of it, so no UI-composed `effects` array can cross the boundary.
 *
 *  `setup_plan` is pure — it builds the plan and writes nothing (setup.rs:747)
 *  — so opening this screen is not the install. */
export function ReviewSetup({ selection, onBack, onConfirm }: ReviewSetupProps) {
  const [plan, setPlan] = useState<SetupPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPlan(null);
    setError(null);
    void api
      .setupPlan(selection)
      .then((next) => {
        if (alive) setPlan(next);
      })
      .catch((e: unknown) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [selection]);

  const items = useMemo(() => plan?.items ?? [], [plan]);
  const shared = useMemo(() => sharedInvocationEffects(items), [items]);

  return (
    <Surface
      labelledBy="review-setup-heading"
      eyebrow="Review · nothing has run yet"
      title="Review what setup will do"
      lede="Read from the plan the backend built for this selection. Nothing is written, fetched or run until you confirm."
      footer={
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-[21px] text-text">
              Setup runs on the next screen, in a terminal you can type into.
            </p>
            <p className="pt-1 text-xs leading-[18px] text-muted">
              You can change any of this in Settings, at any time.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <SecondaryButton onClick={onBack}>Back</SecondaryButton>
            <PrimaryButton onClick={onConfirm} disabled={plan === null || items.length === 0}>
              Confirm and open setup
              <span aria-hidden="true">→</span>
            </PrimaryButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error !== null && (
          <ErrorNote title="The plan could not be read" body={error} />
        )}

        {/* No spinner and no bar: the read either answers or it does not, and
            there is no progress signal to draw. */}
        {plan === null && error === null && (
          <p className="text-sm leading-[21px] text-muted">Reading the plan…</p>
        )}

        {plan !== null && items.length === 0 && (
          <p className="rounded-xl border border-border bg-surface px-4 py-6 text-sm leading-[21px] text-text">
            Nothing is selected, so there is nothing to run. Go back and choose a tool, or open
            Build as it is.
          </p>
        )}

        {items.map((item) => {
          const own = item.effects.filter((line) => !shared.includes(line));
          return (
            <article
              key={item.id}
              className="rounded-xl border border-border bg-surface"
              aria-labelledby={`review-${item.id}`}
            >
              <header className="flex items-center gap-4 border-b border-border px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-raised text-text">
                  <Icon path={COMPONENT_ICONS[item.id]} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    id={`review-${item.id}`}
                    className="block truncate text-sm leading-[20px] font-semibold text-text"
                  >
                    {COMPONENT_NAMES[item.id]}
                  </span>
                  <span className="block pt-1 text-xs leading-[18px] text-muted">
                    {OP_LABELS[item.op]}
                  </span>
                </span>
              </header>
              <div className="px-4 py-4">
                <EffectList lines={own} />
              </div>
            </article>
          );
        })}

        {shared.length > 0 && (
          <article
            className="rounded-xl border border-warning bg-surface"
            aria-labelledby="review-invocation"
          >
            <header className="flex items-center gap-4 border-b border-border px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-raised text-warning">
                <Icon path={ALERT} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  id="review-invocation"
                  className="block text-sm leading-[20px] font-semibold text-text"
                >
                  Runs on any install.sh invocation
                </span>
                <span className="block pt-1 text-xs leading-[18px] text-muted">
                  These steps sit outside every --only guard, so they happen whatever is selected.
                  Listed once here instead of repeated under each component.
                </span>
              </span>
            </header>
            <div className="px-4 py-4">
              <EffectList lines={shared} />
            </div>
          </article>
        )}
      </div>
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Task 43 — Setup states
// ---------------------------------------------------------------------------

export interface SetupStatesProps {
  /** The same selection the Review screen read its plan from. `run_setup`
   *  rebuilds the plan in Rust from it: the frontend never sends a plan. */
  selection: Selection;
  /** The reserved `__install__` session id, or null until the backend answers.
   *  Handed straight to InstallPane, which will not offer its start control
   *  without one. */
  installSessionId: string | null;
  onBack: () => void;
  onOpenBuild: () => void;
}

/** Per-component status plus the live, typeable install log.
 *
 *  Three rules shape this screen:
 *
 *  1. A spawn is not a success. `run_setup` answers with four separate fields —
 *     `plan`, `installerStarted`, `readiness` and `retry` (setup.rs:727-740) —
 *     precisely so "a process started" cannot be read as "it worked".
 *     `installerStarted` is stated on its own line below; every row's word comes
 *     from `readiness`, which is each component's own diagnostic re-run
 *     (setup::recheck → doctor::check_*). An item whose installer is still
 *     running reports `installing`, never a probe result.
 *  2. Partial failure is normal. Nothing in the shipped product sets
 *     `required` (doctor.rs:169-174), so an unfinished component becomes a
 *     warning to resolve later and never a gate: Open Build stays available.
 *  3. Progress is indeterminate. install.sh measures no size and no duration,
 *     so there is no percentage, no bar, no timer and no pulse — the log is the
 *     progress, and it is interactive because the installer may be waiting on
 *     an answer.
 *
 *  The run itself is started by InstallPane's own control, reused unchanged:
 *  that component owns the subscribe-before-open ordering, mounting the
 *  TerminalPane on the reserved id with `agentId={null}` (attach only) and
 *  dispatching from inside the resolved subscription, so the installer's
 *  opening output cannot precede the listener that carries it. */
export function SetupStates({
  selection,
  installSessionId,
  onBack,
  onOpenBuild,
}: SetupStatesProps) {
  const [plan, setPlan] = useState<SetupPlan | null>(null);
  const [rows, setRows] = useState<ComponentReport[]>([]);
  const [installerStarted, setInstallerStarted] = useState(false);
  const [retry, setRetry] = useState<RetryState | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** True once InstallPane has mounted its terminal and handed us the start —
   *  which is the same instant its subscription resolved. The per-component
   *  retry is withheld until then, because a second run dispatched with no pane
   *  attached would open a PTY nothing is listening to. */
  const [logOpen, setLogOpen] = useState(false);

  // The rows before anything runs. `setup_readiness` re-runs each component's
  // own check and writes nothing, so asking on mount is a read, not an act.
  useEffect(() => {
    let alive = true;
    void api
      .setupPlan(selection)
      .then((next) => {
        if (alive) setPlan(next);
      })
      .catch(() => {});
    void api
      .setupReadiness(selection)
      .then((next) => {
        if (alive) setRows(next);
      })
      .catch(() => {});
    void api
      .installRetryState()
      .then((next) => {
        if (alive) setRetry(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selection]);

  const applyOutcome = useCallback(
    (readiness: ComponentReport[], next: RetryState, started: boolean) => {
      setRows((prev) => {
        if (prev.length === 0) return readiness;
        const merged = prev.map((row) => readiness.find((r) => r.id === row.id) ?? row);
        const added = readiness.filter((r) => !prev.some((row) => row.id === r.id));
        return [...merged, ...added];
      });
      setRetry(next);
      // Latched: a later single-component run that needed no installer must not
      // erase the fact that one was started for this setup.
      if (started) setInstallerStarted(true);
    },
    [],
  );

  /** Handed to InstallPane as its `onInstall`, so it is dispatched from inside
   *  the resolved subscription rather than from the click. It runs the SAME
   *  selection the Review screen read out — `run_setup` builds the plan in Rust
   *  from it — and never `install_efficlaude`, which is the bare invocation
   *  that installs every section (setup.rs:544-552). */
  const startRun = useCallback(() => {
    setLogOpen(true);
    setBusy(true);
    setRunError(null);
    void api
      .runSetup(selection)
      .then((outcome) => {
        setPlan(outcome.plan);
        applyOutcome(outcome.readiness, outcome.retry, outcome.installerStarted);
      })
      // Surfaced, never swallowed: a refused run — the previous installer still
      // alive at its prompt, most of all — must not look like a silent no-op.
      .catch((e: unknown) => setRunError(String(e)))
      .finally(() => setBusy(false));
  }, [selection, applyOutcome]);

  const recheck = useCallback(() => {
    void api
      .setupReadiness(selection)
      .then(setRows)
      .catch((e: unknown) => setRunError(String(e)));
    void api.installRetryState().then(setRetry).catch(() => {});
  }, [selection]);

  const retryOne = useCallback(
    (id: ComponentId) => {
      setBusy(true);
      setRunError(null);
      void api
        .runSetup(onlyComponent(id))
        .then((outcome) => applyOutcome(outcome.readiness, outcome.retry, outcome.installerStarted))
        .catch((e: unknown) => setRunError(String(e)))
        .finally(() => setBusy(false));
    },
    [applyOutcome],
  );

  const opFor = (id: ComponentId): SetupOp | null =>
    plan?.items.find((i) => i.id === id)?.op ?? null;

  // Written from the data rather than hardcoded, and with nothing in the
  // shipped product setting `required`, it is true: an optional component that
  // did not finish is a warning beside Open Build, not a red gate in front of
  // it.
  const coreReady = rows.every(
    (r) => !r.required || r.status === 'ready' || r.status === 'detected',
  );
  const unready = rows.filter(
    (r) => r.status === 'needsAttention' || r.status === 'unavailable',
  );

  return (
    <Surface
      labelledBy="setup-states-heading"
      eyebrow="Setup session"
      title="Setting up the tools you chose."
      lede="Only the components you selected are included. Each row below says what that component's own check found."
      footer={
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-[21px] text-text">
              You can finish any of this later, in Settings.
            </p>
            <p className="pt-1 text-xs leading-[18px] text-muted">
              Opening Build does not stop the installer — nothing here closes that terminal.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <SecondaryButton onClick={onBack}>Back</SecondaryButton>
            <SecondaryButton onClick={recheck}>Check again</SecondaryButton>
            <PrimaryButton onClick={onOpenBuild} disabled={!coreReady}>
              Open Build
              <span aria-hidden="true">→</span>
            </PrimaryButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* The spawn, stated as a spawn. Separate from every row's word, which
            is what a diagnostic said. */}
        {installerStarted && (
          <p className="flex items-start gap-3 text-xs leading-[18px] text-muted">
            <span className="shrink-0 pt-0.5">
              <Icon path={INFO} size={14} />
            </span>
            The installer has been started. Started is not finished and is not ready: each row
            below carries its own check's answer, and a component whose installer is still
            running reads Installing until you check again.
          </p>
        )}

        {runError !== null && (
          <ErrorNote title="That run could not start" body={runError} />
        )}

        <ul className="overflow-hidden rounded-xl border border-border">
          {rows.length === 0 && (
            <li className="bg-surface px-4 py-6 text-sm leading-[21px] text-muted">
              Nothing to set up for this selection.
            </li>
          )}
          {rows.map((row) => {
            const mark = STATUS_PRESENTATION[row.status];
            const op = opFor(row.id);
            // Only an installer-backed item can be re-run, only while the
            // lifecycle actually allows it, and only once the log pane is
            // attached to the session a new run would write to.
            const canRetryRow =
              logOpen &&
              op === 'installSelected' &&
              row.status !== 'ready' &&
              retry?.canRetry === true;
            return (
              <li
                key={row.id}
                className="flex items-start gap-4 border-b border-border bg-surface px-4 py-3 last:border-b-0"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-raised text-text">
                  <Icon path={COMPONENT_ICONS[row.id]} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm leading-[20px] font-semibold text-text">
                    {COMPONENT_NAMES[row.id]}
                  </span>
                  {op !== null && (
                    <span className="block pt-1 text-xs leading-[18px] text-muted">
                      {OP_LABELS[op]}
                    </span>
                  )}
                  {/* The check's own sentence, verbatim: it names the exact
                      repair, and rewriting it is how a missing runtime starts
                      reading as a missing dependency. */}
                  {row.error !== null && (
                    <span className="block pt-1 text-xs leading-[18px] text-warning">
                      {row.error}
                    </span>
                  )}
                  {row.error === null && row.status === 'installing' && row.detail !== null && (
                    <span className="block pt-1 text-xs leading-[18px] text-muted">
                      {row.detail}
                    </span>
                  )}
                  {canRetryRow && (
                    <button
                      type="button"
                      onClick={() => retryOne(row.id)}
                      disabled={busy}
                      className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs leading-[18px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none disabled:cursor-not-allowed"
                    >
                      Retry this component
                    </button>
                  )}
                </span>
                <span
                  className={`flex shrink-0 items-center gap-2 text-xs leading-[18px] ${mark.className}`}
                >
                  <Icon path={mark.icon} size={16} />
                  {mark.word}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Why the retry control is absent, rather than an absent control. The
            backend's own sentence: claim_install_session refuses a live session
            and leaves it untouched, because an installer parked at a prompt is
            alive and must not be killed from under the user. */}
        {retry !== null && !retry.canRetry && retry.reason !== null && (
          <p className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-xs leading-[18px] text-muted">
            <span className="shrink-0 pt-0.5">
              <Icon path={INFO} size={14} />
            </span>
            {retry.reason}
          </p>
        )}

        {unready.length > 0 && (
          <section
            aria-labelledby="setup-warnings"
            className="rounded-xl border border-warning bg-surface px-4 py-4"
          >
            <h2
              id="setup-warnings"
              className="flex items-center gap-2 text-sm leading-[20px] font-semibold text-text"
            >
              <span className="text-warning">
                <Icon path={ALERT} size={16} />
              </span>
              Finish these later
            </h2>
            <ul className="flex flex-col gap-2 pt-3">
              {unready.map((row) => (
                <li key={row.id} className="text-sm leading-[21px] text-text">
                  <span className="font-semibold">{COMPONENT_NAMES[row.id]}</span>
                  {row.error !== null && (
                    <span className="text-muted"> — {row.error}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="pt-3 text-xs leading-[18px] text-muted">
              None of these is required, so Build opens without them.
            </p>
          </section>
        )}

        <section aria-labelledby="setup-log-heading" className="flex flex-col">
          <h2
            id="setup-log-heading"
            className="text-xs leading-[18px] font-semibold tracking-[0.12em] text-muted uppercase"
          >
            Setup log
          </h2>
          <p className="pt-2 text-xs leading-[18px] text-muted">
            The log stays interactive: the installer may stop and wait for an answer, so type into
            it the way you would any terminal.
          </p>
          <div className="pt-3">
            {/* Reused as it is. Its control is what opens the terminal and then
                dispatches, in that order; `onInstall` is ours, so what runs is
                the selection's plan rather than the bare install-everything. */}
            <InstallPane
              installSessionId={installSessionId}
              onInstall={startRun}
              onRecheck={recheck}
            />
          </div>
        </section>
      </div>
    </Surface>
  );
}
