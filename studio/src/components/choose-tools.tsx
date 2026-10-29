import { useRef, useState } from 'react';
import { BrandMark } from './brand-mark';
import type { ComponentId, ComponentReport, SetupItem, SetupOp, SetupPlan } from '../lib/types';

/** Outline marks at the spec's stroke weight, inline so `currentColor` keeps
 *  each one on the token its container already set. Same helper shape as
 *  choose-experiences.tsx — the two screens are one product. */
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
      // Decorative: every mark here sits beside the text that names it.
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
const LINK =
  'M10.2 13.8a4 4 0 005.6 0l2.6-2.6a4 4 0 00-5.6-5.6l-1.3 1.3 M13.8 10.2a4 4 0 00-5.6 0l-2.6 2.6a4 4 0 005.6 5.6l1.3-1.3';
const INFO = 'M12 3a9 9 0 110 18 9 9 0 010-18z M12 11v5 M12 8h.01';
const CHEVRON = 'M9 6l6 6-6 6';
const CHECK = 'M5 12.5l4.5 4.5L19 7';
const CHECK_CIRCLE = 'M12 4a8 8 0 110 16 8 8 0 010-16 M8.6 12.1l2.4 2.4 4.4-4.6';
const ALERT = 'M12 4.5L20.5 19h-17L12 4.5z M12 10v4 M12 16.5h.01';
const CIRCLE = 'M12 4a8 8 0 110 16 8 8 0 010-16';

/** The whole breakpoint policy, on one line, exactly as step one states it
 *  (choose-experiences.tsx:32) — the two onboarding screens must drop their
 *  column at the same width or the chrome appears to jump between steps.
 *
 *  It is a class and not a condition on purpose. `hidden` is display:none, so
 *  below the breakpoint the column is laid out away and taken out of the tab
 *  order, while everything in the controls column stays mounted: dragging the
 *  window across this width unticks nothing, collapses no disclosure and
 *  rewrites no summary, which an unmount keyed on a matchMedia read would.
 *
 *  Dropping it costs no control. The column holds the wordmark, the headline,
 *  the three-step position and one footnote — prose and ornament, with no
 *  button, no input and no error anywhere in it. Everything the user has to be
 *  able to reach lives in the controls column: every checkbox row, the three
 *  jump links, the toolkit disclosure and its two rows, the verbatim
 *  diagnostic sentence a failed device check puts in its row, the empty
 *  Connections state, and the summary with Back and the primary action. */
const EDITORIAL_COLUMN_VISIBILITY = 'hidden lg:flex';

/** Position in the flow, not progress through it — these are three named
 *  places, so nothing here animates or fills. */
const STEPS = ['Choose experiences', 'Choose tools', 'Open workspace'] as const;

/** Display names for the ids the plan is made of. One table, so the rows and
 *  the summary can never call the same component two different things. */
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

/** What a diagnostic can actually tell us: the executable or directory is on
 *  disk. It is NOT a sign-in — no check in this app can observe one — so every
 *  label derived from this says "found", never "connected". */
function foundOnDisk(reports: ComponentReport[], id: ComponentId): boolean {
  const report = reports.find((r) => r.id === id);
  return report ? report.status === 'detected' || report.status === 'ready' : false;
}

function reportFor(reports: ComponentReport[], id: ComponentId): ComponentReport | undefined {
  return reports.find((r) => r.id === id);
}

/** The user's queued intent. `otherCli` has no ComponentId because it names no
 *  component this app can detect, install or run — it is a note to the caller
 *  that a provider will be pointed at by hand later, which is why it never
 *  becomes a SetupItem and never reaches the summary. */
export interface ToolSelection {
  components: ComponentId[];
  otherCli: boolean;
}

/** What the screen opens with. Agents are pre-filled only where a diagnostic
 *  already found one, so nobody gets a mandatory default provider. Devices,
 *  project memory and the Claude workflow toolkit all start OFF unless a
 *  diagnostic found them — they are downloads, and a download is never the
 *  default. Browser is the single exception: it ships inside the app, so
 *  starting it on enables something already present rather than fetching it. */
export function initialSelection(reports: ComponentReport[]): ToolSelection {
  const components: ComponentId[] = [];
  for (const id of ['claude', 'codex'] as const) {
    if (foundOnDisk(reports, id)) components.push(id);
  }
  components.push('browser');
  for (const id of ['memory', 'commands', 'agents'] as const) {
    if (foundOnDisk(reports, id)) components.push(id);
  }
  // ios and android are deliberately absent whatever the probe says: a usable
  // simulator is still a device tool the user has to ask for.
  return { components, otherCli: false };
}

/** The four states a device row can be in, which is what doctor.rs's check_ios
 *  and check_android can actually distinguish: Xcode present is not a runtime,
 *  and a runtime is not a device. Collapsing them to on/off would print "not
 *  set up" over a machine whose only missing piece is one AVD. */
export type DeviceReadiness =
  | 'notEnabled'
  | 'dependencyMissing'
  | 'runtimeOrDeviceMissing'
  | 'available';

/** doctor.rs words the two repairs apart, and that wording is the only signal
 *  the wire carries: a dependency failure says the dependency is missing
 *  ("not found", "install Xcode", "need full Xcode"), while a runtime or
 *  device failure opens by saying the dependency IS installed. Anything it
 *  cannot place is reported as the dependency being missing, which is the
 *  reading that sends the user to the earlier, cheaper fix. */
export function deviceReadiness(report: ComponentReport | undefined): DeviceReadiness {
  if (!report) return 'notEnabled';
  if (report.status === 'ready') return 'available';
  if (report.status !== 'needsAttention' && report.status !== 'unavailable') return 'notEnabled';
  const error = report.error ?? '';
  if (/not found|install Xcode|xcode-select|needs? full Xcode/i.test(error)) {
    return 'dependencyMissing';
  }
  if (/\b(is|are) installed\b/i.test(error)) return 'runtimeOrDeviceMissing';
  return 'dependencyMissing';
}

/** Which of the four operations each selected id implies. A draft, and named
 *  one: the backend that will do the acting owns the real mapping and the
 *  `effects` list that goes with it, so this fills `effects` with nothing
 *  rather than guessing at files it does not write. It lives here so the
 *  screen can be driven and tested without the IPC layer, and it is
 *  deliberately NOT what the summary reads — the summary reads the plan. */
export function draftSetupPlan(selection: ToolSelection, reports: ComponentReport[]): SetupPlan {
  const op = (id: ComponentId): SetupOp => {
    switch (id) {
      case 'claude':
      case 'codex':
        // On disk: link it. Absent: Effi does not install other people's
        // agents, so this is a setup the user performs outside the app.
        return foundOnDisk(reports, id) ? 'linkExisting' : 'setupExternal';
      case 'browser':
        return 'enableBundled';
      case 'ios':
      case 'android':
        // Xcode and the Android SDK belong to Apple and Google. A ready device
        // is switched on; anything short of ready is setup we can only guide.
        return deviceReadiness(reportFor(reports, id)) === 'available'
          ? 'enableBundled'
          : 'setupExternal';
      default:
        // The pieces install.sh really does place on disk.
        return foundOnDisk(reports, id) ? 'enableBundled' : 'installSelected';
    }
  };

  return {
    items: selection.components.map<SetupItem>((id) => ({
      id,
      selected: true,
      op: op(id),
      effects: [],
    })),
  };
}

function listNames(items: SetupItem[]): string {
  const names = items.map((i) => COMPONENT_NAMES[i.id]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** One line describing what will actually run, read off the plan rather than
 *  off the checkboxes: the ops are what separates linking an executable the
 *  user already has from downloading one, and a count of ticked boxes cannot
 *  tell those apart. No sizes and no durations appear here, because nothing
 *  measures them — install.sh reports neither. */
export function summarizePlan(plan: SetupPlan): { line: string; needsReview: boolean } {
  const selected = plan.items.filter((i) => i.selected);
  const linked = selected.filter((i) => i.op === 'linkExisting');
  const enabled = selected.filter((i) => i.op === 'enableBundled');
  const external = selected.filter((i) => i.op === 'setupExternal');
  const installs = selected.filter((i) => i.op === 'installSelected');

  const parts: string[] = [];
  parts.push(
    linked.length === 0
      ? 'No existing agents linked'
      : `${linked.length} existing agent${linked.length === 1 ? '' : 's'} linked`,
  );
  parts.push(enabled.length === 0 ? 'Nothing extra enabled' : `${listNames(enabled)} enabled`);
  if (external.length > 0) parts.push(`${listNames(external)} to set up yourself`);
  // Naming the installs is the only honest alternative to a size: the names
  // are measured, a megabyte figure would not be.
  parts.push(installs.length === 0 ? 'No device downloads' : `${listNames(installs)} to install`);

  return { line: parts.join(' · '), needsReview: installs.length > 0 };
}

type StatusTone = 'healthy' | 'attention' | 'neutral';

interface RowStatus {
  label: string;
  tone: StatusTone;
}

function StatusChip({ label, tone }: RowStatus) {
  // Sage is health, copper is selection, and the two never swap: a chip that
  // went copper when a box was ticked would claim the machine was ready.
  const marks: Record<StatusTone, { icon: string; className: string }> = {
    healthy: { icon: CHECK_CIRCLE, className: 'text-success' },
    attention: { icon: ALERT, className: 'text-warning' },
    neutral: { icon: CIRCLE, className: 'text-muted' },
  };
  const mark = marks[tone];
  return (
    <span className={`flex shrink-0 items-center gap-2 text-xs leading-[18px] ${mark.className}`}>
      <Icon path={mark.icon} size={16} />
      {label}
    </span>
  );
}

interface ToolRowProps {
  controlId: string;
  title: string;
  /** Second line: what the row does, or the verbatim reason a check failed. */
  note: string;
  icon: string;
  status: RowStatus;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

function ToolRow({
  controlId,
  title,
  note,
  icon,
  status,
  checked,
  disabled = false,
  onChange,
}: ToolRowProps) {
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-description`;

  // Disabled dims by token, never by opacity: muted clears 4.5:1 on every
  // surface used here, and an opacity pass would drag it to about 2:1.
  const frame = disabled
    ? 'bg-surface'
    : checked
      ? 'bg-copper-tint'
      : 'bg-surface hover:bg-hover';

  return (
    <label
      htmlFor={controlId}
      className={`flex items-center gap-4 border-b border-border px-4 py-3 transition-colors duration-150 last:border-b-0 motion-reduce:transition-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-copper has-[:focus-visible]:ring-inset ${frame} ${
        disabled ? 'cursor-default' : 'cursor-pointer'
      }`}
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          id={controlId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-5 w-5 appearance-none rounded-lg border border-border bg-raised transition-colors duration-150 checked:border-copper checked:bg-copper focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none disabled:cursor-default motion-reduce:transition-none"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-on-copper opacity-0 transition-opacity duration-150 peer-checked:opacity-100 motion-reduce:transition-none">
          <Icon path={CHECK} size={14} />
        </span>
      </span>

      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-raised ${
          disabled ? 'text-muted' : 'text-text'
        }`}
      >
        <Icon path={icon} size={18} />
      </span>

      <span className="min-w-0 flex-1">
        <span id={labelId} className="block truncate text-sm leading-[20px] font-semibold text-text">
          {title}
        </span>
        <span id={descriptionId} className="block pt-1 text-xs leading-[18px] text-muted">
          {note}
        </span>
      </span>

      <StatusChip label={status.label} tone={status.tone} />
    </label>
  );
}

/** Terminal. Not a checkbox and not a download: it is a facility of the app,
 *  present whatever is chosen here, so there is nothing to tick and nothing to
 *  fetch. Rendered as a plain row with no control in the tab order, because an
 *  always-checked box the user cannot move is a lie about agency. */
function IncludedRow() {
  return (
    <div className="flex items-center gap-4 border-b border-border bg-raised px-4 py-3 last:border-b-0">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted">
        <Icon path={CHECK} size={14} />
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text">
        <Icon path={TERMINAL} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm leading-[20px] font-semibold text-text">
          Terminal
        </span>
        <span className="block pt-1 text-xs leading-[18px] text-muted">
          Part of the app. Nothing to choose and nothing to download.
        </span>
      </span>
      <StatusChip label="Included" tone="healthy" />
    </div>
  );
}

function SectionHeading({ id, title, badge }: { id: string; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 pb-3">
      <h2 id={id} className="text-xs leading-[18px] font-semibold tracking-[0.12em] text-muted uppercase">
        {title}
      </h2>
      {badge && (
        <span className="rounded-lg border border-border px-2 py-0.5 text-xs leading-[18px] text-muted">
          {badge}
        </span>
      )}
    </div>
  );
}

type SectionId = 'agents' | 'tools' | 'connections';

const SECTIONS: { id: SectionId; label: string; icon: string; badge?: string }[] = [
  { id: 'agents', label: 'Agents', icon: USERS },
  { id: 'tools', label: 'Tools', icon: BOX },
  { id: 'connections', label: 'Connections', icon: LINK, badge: 'Optional' },
];

export interface ChooseToolsProps {
  /** What the startup probe found on disk. Empty is a normal first-run value:
   *  every row renders, nothing is pre-filled, and no control is withheld. */
  reports: ComponentReport[];
  /** Controlled, unlike step one's single boolean: the plan below has to be
   *  derived from the same selection the rows draw, and a second copy living
   *  in here is how the summary and the checkboxes drift apart. */
  selection: ToolSelection;
  /** What will actually run. The owner computes it — today from
   *  `draftSetupPlan`, shortly from the backend that performs the ops. */
  plan: SetupPlan;
  onSelectionChange: (next: ToolSelection) => void;
  onBack: () => void;
  /** Pressing the primary action. `needsReview` is the plan's own answer to
   *  whether anything is being installed, so the caller routes on the plan
   *  rather than re-deriving it from the ticks. */
  onContinue: (plan: SetupPlan, needsReview: boolean) => void;
}

/** Step two of onboarding. Props in, callbacks out: selecting a card queues an
 *  intent and that is all it does — no credential is looked for, no config is
 *  written, nothing is downloaded, and no probe is run. Every side effect
 *  belongs to the caller and only after a button. */
export function ChooseTools({
  reports,
  selection,
  plan,
  onSelectionChange,
  onBack,
  onContinue,
}: ChooseToolsProps) {
  const [currentSection, setCurrentSection] = useState<SectionId>('agents');
  const sectionRefs = {
    agents: useRef<HTMLElement | null>(null),
    tools: useRef<HTMLElement | null>(null),
    connections: useRef<HTMLElement | null>(null),
  };

  const has = (id: ComponentId) => selection.components.includes(id);
  const toggle = (id: ComponentId, next: boolean) => {
    const without = selection.components.filter((c) => c !== id);
    onSelectionChange({ ...selection, components: next ? [...without, id] : without });
  };

  const jump = (id: SectionId) => {
    setCurrentSection(id);
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sectionRefs[id].current?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const agentStatus = (id: ComponentId): RowStatus =>
    foundOnDisk(reports, id)
      ? { label: 'Detected', tone: 'healthy' }
      : { label: 'Not on this machine', tone: 'neutral' };

  const optionalStatus = (id: ComponentId): RowStatus =>
    foundOnDisk(reports, id)
      ? { label: 'Detected', tone: 'healthy' }
      : { label: 'Optional', tone: 'neutral' };

  const deviceLabels: Record<
    DeviceReadiness,
    { ios: string; android: string; tone: StatusTone }
  > = {
    notEnabled: { ios: 'Not set up', android: 'Not set up', tone: 'neutral' },
    dependencyMissing: { ios: 'Requires Xcode', android: 'Requires Android SDK', tone: 'attention' },
    runtimeOrDeviceMissing: {
      ios: 'No simulator yet',
      android: 'No emulator device yet',
      tone: 'attention',
    },
    available: { ios: 'Simulator ready', android: 'Emulator ready', tone: 'healthy' },
  };

  const deviceRow = (id: 'ios' | 'android') => {
    const report = reportFor(reports, id);
    const readiness = deviceReadiness(report);
    const labels = deviceLabels[readiness];
    const fallback =
      readiness === 'available'
        ? 'A device is ready. Switch it on to use it in Build.'
        : 'Optional. Selecting it queues the setup, it downloads nothing.';
    return {
      status: { label: labels[id], tone: labels.tone },
      // The backend's own sentence, verbatim: it names the exact repair, and
      // rewriting it here is how a missing runtime starts reading as a missing
      // Xcode.
      note: report?.error ?? fallback,
      disabled: report?.status === 'unavailable',
    };
  };

  const ios = deviceRow('ios');
  const android = deviceRow('android');
  // Open by default while either toolkit piece is selected, so a diagnostic
  // that lands after this screen is up can never leave a ticked row folded
  // away. `null` is "the user has not said": once they have, their answer
  // wins, which is why this is an override and not a seeded boolean.
  const [toolkitOverride, setToolkitOverride] = useState<boolean | null>(null);
  const toolkitExpanded = toolkitOverride ?? (has('commands') || has('agents'));

  const summary = summarizePlan(plan);
  // Each label is written once, in one place: the CTA is a property of the
  // plan, so there is no second site that could disagree about whether a
  // Review step exists. A plan that installs nothing never names one.
  const ctaLabel = summary.needsReview ? 'Review setup' : 'Open Build';

  return (
    <section aria-labelledby="choose-tools-heading" className="h-full overflow-y-auto">
      {/* Native titlebar carries the window controls; no HTML traffic lights. */}
      {/* `min-h-full`: the section is `h-full`, but this grid sized to its
          content, so the editorial column's `border-r` stopped partway down
          the window and left a divider hanging in open space. Measured at
          1440x900 against mockups/01-choose-experiences, where the divider
          runs the full height. */}
      <div className="mx-auto grid min-h-full w-full max-w-6xl grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <aside
          className={`${EDITORIAL_COLUMN_VISIBILITY} flex-col gap-10 border-r border-border px-10 py-10`}
        >
          <div className="flex items-center gap-3">
            <span className="text-copper">
              <BrandMark size={24} />
            </span>
            <span className="text-[20px] leading-[28px] font-semibold text-text">Effi</span>
            <span className="text-xs leading-[18px] tracking-[0.18em] text-muted uppercase">
              Studio
            </span>
          </div>

          <div>
            <h2 className="text-[38px] leading-[44px] font-semibold tracking-tight text-text">
              Start lean. Add as you go.
            </h2>
            <p className="pt-4 text-[20px] leading-[28px] text-muted">
              Set up your workspace now, and change it whenever you like.
            </p>
          </div>

          <ol className="flex flex-col gap-4">
            {STEPS.map((step, i) => {
              const done = i === 0;
              const current = i === 1;
              return (
                <li key={step} className="flex items-center gap-4">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      done
                        ? 'border-success text-success'
                        : current
                          ? 'border-copper text-copper'
                          : 'border-border text-muted'
                    }`}
                    aria-hidden="true"
                  >
                    {done && <Icon path={CHECK} size={12} />}
                    {current && <span className="h-2 w-2 rounded-full bg-copper" />}
                  </span>
                  <span className="font-mono text-xs leading-[18px] text-muted">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={`text-sm leading-[21px] ${current ? 'text-text' : 'text-muted'}`}
                  >
                    {step}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="mt-auto border-t border-border pt-6 text-xs leading-[18px] text-muted">
            Build selected · Verify coming soon
          </p>
        </aside>

        <div className="px-10 py-10">
          <h1
            id="choose-tools-heading"
            className="text-[30px] leading-[36px] font-semibold tracking-tight text-text"
          >
            Set up your Build workspace
          </h1>
          <p className="pt-2 text-sm leading-[21px] text-muted">
            Use the tools you already have, or add them when you need them.
          </p>

          {/* Jump links, not tabs: nothing below is hidden, so a user who never
              presses one still sees every group. */}
          <nav aria-label="Setup groups" className="flex flex-wrap gap-2 border-b border-border pt-8">
            {SECTIONS.map((s) => {
              const active = s.id === currentSection;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm leading-[20px] transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none ${
                    active
                      ? 'border-copper text-text'
                      : 'border-transparent text-muted hover:text-text'
                  }`}
                >
                  <Icon path={s.icon} size={16} />
                  {s.label}
                  {s.badge && (
                    <span className="rounded-lg border border-border px-2 py-0.5 text-xs leading-[18px] text-muted">
                      {s.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <section ref={sectionRefs.agents} aria-labelledby="setup-agents" className="pt-8">
            <SectionHeading id="setup-agents" title="Agents" />
            <div className="overflow-hidden rounded-xl border border-border">
              <ToolRow
                controlId="tool-claude"
                title="Claude Code"
                note="Use your local installation."
                icon={TERMINAL}
                status={agentStatus('claude')}
                checked={has('claude')}
                onChange={(next) => toggle('claude', next)}
              />
              <ToolRow
                controlId="tool-codex"
                title="Codex"
                note="Use your local installation."
                icon={BOX}
                status={agentStatus('codex')}
                checked={has('codex')}
                onChange={(next) => toggle('codex', next)}
              />
              <ToolRow
                controlId="tool-other-cli"
                title="Other CLI"
                note="Point Effi at another agent later, in Settings."
                icon={USERS}
                status={{ label: 'Configure later', tone: 'neutral' }}
                checked={selection.otherCli}
                onChange={(next) => onSelectionChange({ ...selection, otherCli: next })}
              />
            </div>
            <p className="flex items-start gap-3 pt-3 text-xs leading-[18px] text-muted">
              <span className="shrink-0 pt-0.5">
                <Icon path={INFO} size={14} />
              </span>
              Detected means the program was found on this machine. Effi cannot see whether you are
              signed in to it, and choosing none is a supported setup.
            </p>
          </section>

          <section ref={sectionRefs.tools} aria-labelledby="setup-tools" className="pt-8">
            <SectionHeading id="setup-tools" title="Tools" />
            <div className="overflow-hidden rounded-xl border border-border">
              <IncludedRow />
              <ToolRow
                controlId="tool-browser"
                title="Browser"
                note="Preview and inspect pages beside the terminal."
                icon={WINDOW}
                status={optionalStatus('browser')}
                checked={has('browser')}
                onChange={(next) => toggle('browser', next)}
              />
              <ToolRow
                controlId="tool-ios"
                title="iOS simulator"
                note={ios.note}
                icon={PHONE}
                status={ios.status}
                checked={has('ios')}
                disabled={ios.disabled}
                onChange={(next) => toggle('ios', next)}
              />
              <ToolRow
                controlId="tool-android"
                title="Android emulator"
                note={android.note}
                icon={ROBOT}
                status={android.status}
                checked={has('android')}
                disabled={android.disabled}
                onChange={(next) => toggle('android', next)}
              />
              <ToolRow
                controlId="tool-memory"
                title="Project memory"
                note="Indexes this project so commands can recall earlier work."
                icon={DATABASE}
                status={optionalStatus('memory')}
                checked={has('memory')}
                onChange={(next) => toggle('memory', next)}
              />
            </div>
            <p className="flex items-start gap-3 pt-3 text-xs leading-[18px] text-muted">
              <span className="shrink-0 pt-0.5">
                <Icon path={INFO} size={14} />
              </span>
              Device tools are optional. Selecting one queues it; nothing is downloaded until you
              say so on the next screen.
            </p>

            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setToolkitOverride(!toolkitExpanded)}
                aria-expanded={toolkitExpanded}
                aria-controls="toolkit-rows"
                className="flex w-full items-center gap-3 bg-surface px-4 py-3 text-left transition-colors duration-150 hover:bg-hover focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none"
              >
                <span
                  className={`text-muted transition-transform duration-150 motion-reduce:transition-none ${
                    toolkitExpanded ? 'rotate-90' : ''
                  }`}
                  aria-hidden="true"
                >
                  <Icon path={CHEVRON} size={16} />
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-raised text-text">
                  <Icon path={BOX} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-[20px] font-semibold text-text">
                    Claude workflow toolkit (optional)
                  </span>
                  <span className="block pt-1 text-xs leading-[18px] text-muted">
                    The /ec- commands and their agents. Off unless already on disk.
                  </span>
                </span>
              </button>

              {toolkitExpanded && (
                <div id="toolkit-rows" className="border-t border-border">
                  <ToolRow
                    controlId="tool-commands"
                    title="Workflow commands"
                    note="The brainstorm, plan, refine, execute, review and git commands."
                    icon={TERMINAL}
                    status={optionalStatus('commands')}
                    checked={has('commands')}
                    onChange={(next) => toggle('commands', next)}
                  />
                  <ToolRow
                    controlId="tool-agents"
                    title="Workflow agents"
                    note="The per-stack agents those commands hand work to."
                    icon={USERS}
                    status={optionalStatus('agents')}
                    checked={has('agents')}
                    onChange={(next) => toggle('agents', next)}
                  />
                </div>
              )}
            </div>
          </section>

          <section ref={sectionRefs.connections} aria-labelledby="setup-connections" className="pt-8">
            <SectionHeading id="setup-connections" title="Connections" badge="Optional" />
            {/* The empty state, and an honest one: Build needs no connection,
                so there is nothing here to list and nothing to skip past. */}
            <div className="rounded-xl border border-border bg-surface px-4 py-6">
              <p className="text-sm leading-[21px] text-text">Nothing to connect for Build.</p>
              <p className="pt-2 text-xs leading-[18px] text-muted">
                Connections are added from Settings when a project needs one. This step can be
                left as it is.
              </p>
            </div>
          </section>

          <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              {/* Composed from the plan, never from the ticks: these words say
                  what will run. */}
              <p aria-live="polite" className="text-sm leading-[21px] text-text">
                {summary.line}
              </p>
              <p className="pt-1 text-xs leading-[18px] text-muted">
                You can change this in Settings, at any time.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="rounded-lg border border-border px-4 py-2.5 text-sm leading-[20px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => onContinue(plan, summary.needsReview)}
                className="flex items-center gap-2 rounded-lg bg-copper px-4 py-2.5 text-sm leading-[20px] font-semibold text-on-copper transition-colors duration-150 hover:bg-copper/90 focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none"
              >
                {ctaLabel}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
