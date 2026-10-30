import { useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { deviceReadiness } from './choose-tools';
import type { DeviceReadiness } from './choose-tools';
import { DiagnosticsPanel } from './diagnostics-panel';
import type {
  ComponentId,
  ComponentReport,
  ComponentStatus,
  Connection,
  Diagnostics,
  Experience,
  ExperienceId,
} from '../lib/types';

// ---------------------------------------------------------------------------
// The Settings surface: Experiences, Agents, Tools, Connections, Appearance,
// Diagnostics. DESIGN-SPEC.md:56 names exactly these six and adds the rule
// this file is built around — "Connections sidebar membuka tujuan yang sama,
// bukan konfigurasi duplikat": the sidebar entry and this section reach ONE
// surface, so the Connections section below is a door and not a page.
//
// There is no Settings mockup in design/effi-studio-v2/mockups/ (nine images,
// none of this screen), so the layout is the house language already shipped in
// choose-tools.tsx and diagnostics-panel.tsx rather than a new one.
//
// STRUCTURE: a scrolled column of six real <section>s, each labelled by its own
// heading, with a row of jump links above them — NOT a tablist. Three reasons:
//
//   1. Nothing may be hidden. A tab shows one section and hides five, and the
//      moment five are hidden the cheap thing to do is fetch the hidden one
//      when its tab is pressed. The rule here is the opposite: opening Settings
//      starts nothing. A column with everything mounted has nowhere to put a
//      lazy probe.
//   2. `Diagnostics` is "a flat list with no summary verdict" (types.ts:127)
//      precisely because the shell has to open with none of the nine reports
//      present. A tab strip would be a place to paint one badge for all of
//      them, which is the aggregate that does not exist.
//   3. choose-tools.tsx already chose this for the same groups — "Jump links,
//      not tabs: nothing below is hidden" — and the two screens are one
//      product.
//
// NOTHING RUNS ON OPEN. This component performs no I/O at all: every fact is a
// prop and every action is a callback the host owns. The one probe reachable
// from here is the Diagnostics panel's own button, which runs when it is
// pressed and never at mount.
//
// NO CREDENTIAL IS RENDERED, including inside an error. The only verbatim text
// shown is a `ComponentReport.detail` (a resolved path or a version string) and
// a `ComponentReport.error` (a probe's own failure sentence) — neither carries
// a secret, because nothing upstream of a diagnostic holds one.
//
// NO GATE. The global Claude requirement was deleted from this app on purpose.
// Every row here reports and offers; not one of them withholds another surface.
// ---------------------------------------------------------------------------

type SectionId =
  | 'experiences'
  | 'agents'
  | 'tools'
  | 'connections'
  | 'appearance'
  | 'diagnostics';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'experiences', label: 'Experiences' },
  { id: 'agents', label: 'Agents' },
  { id: 'tools', label: 'Tools' },
  { id: 'connections', label: 'Connections' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

const headingId = (id: SectionId) => `settings-${id}-heading`;

/** Every status carries a glyph AND a word; the token is the third channel and
 *  never the only one. The words are diagnostics-panel.tsx's words on purpose —
 *  its STATUS table is module-private, so Settings cannot import it, and a
 *  second table that said "Found" where the rail says "Detected" would be two
 *  names for one wire value.
 *
 *  `detected` is NOT mint. It means the executable is on disk and nothing more.
 *  Mint is spent on `ready`, the stronger claim that a check actually passed.
 *  Accent appears on no status at all: it means selection and primary action,
 *  and a probe result is neither. */
interface Face {
  glyph: string;
  word: string;
  tone: string;
}

const STATUS_FACE: Record<ComponentStatus, Face> = {
  notSelected: { glyph: '○', word: 'Not selected', tone: 'text-muted' },
  detected: { glyph: '◆', word: 'Detected', tone: 'text-text' },
  queued: { glyph: '◷', word: 'Queued', tone: 'text-muted' },
  installing: { glyph: '◐', word: 'Installing', tone: 'text-text' },
  ready: { glyph: '✓', word: 'Ready', tone: 'text-success' },
  needsAttention: { glyph: '!', word: 'Needs attention', tone: 'text-warning' },
  unavailable: { glyph: '⊘', word: 'Unavailable', tone: 'text-muted' },
};

/** No report for this id yet. Distinct from every status above: the probe has
 *  not spoken, which is not the same as having found nothing. This is the
 *  normal first-run value — the shell opens before the checks land. */
const UNREPORTED: Face = { glyph: '–', word: 'Not reported yet', tone: 'text-muted' };

function faceFor(report: ComponentReport | undefined): Face {
  return report ? STATUS_FACE[report.status] : UNREPORTED;
}

function reportFor(reports: ComponentReport[], id: ComponentId): ComponentReport | undefined {
  return reports.find((r) => r.id === id);
}

/** Nothing a control here could do changes an `unavailable` verdict — the
 *  machine cannot host the thing — and a `ready` row has nothing to repair, so
 *  neither is offered an action. Same reading as diagnostics-panel.tsx's
 *  `isActionable`, which this deliberately agrees with. */
function canAct(report: ComponentReport | undefined): boolean {
  return report?.status !== 'unavailable' && report?.status !== 'ready';
}

const AGENT_NAME: Record<'claude' | 'codex', string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

const TOOL_NAME: Record<'browser' | 'ios' | 'android' | 'memory', string> = {
  browser: 'Browser',
  ios: 'iOS simulator',
  android: 'Android emulator',
  memory: 'Project memory',
};

/** Second lines for the two device rows, used only when the backend sent no
 *  sentence of its own. `deviceReadiness` is imported from choose-tools.tsx
 *  rather than re-derived: it is the one place that reads doctor.rs's wording
 *  apart, and a missing runtime must not start reading as a missing Xcode in a
 *  second copy of that regex. */
const DEVICE_FALLBACK: Record<DeviceReadiness, string> = {
  notEnabled: 'Optional. Nothing is downloaded until you ask for it.',
  dependencyMissing: 'The dependency this needs was not found on this machine.',
  runtimeOrDeviceMissing: 'The dependency is installed; no device has been created yet.',
  available: 'A device is ready to use.',
};

const BTN =
  'shrink-0 rounded-lg border border-border bg-raised px-2 py-1 text-xs leading-[18px] text-text transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none';

/** Accent, because opening the one Connections surface is this section's
 *  primary action. Dimming anywhere in this file is a token swap, never an
 *  opacity wash: muted on raised clears 4.5:1, an opacity pass measures near
 *  2:1. */
const BTN_PRIMARY =
  'shrink-0 rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs leading-[18px] text-on-accent transition-colors duration-150 hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none';

function StatusFace({ face }: { face: Face }) {
  return (
    <span className={`flex shrink-0 items-baseline gap-1.5 ${face.tone}`}>
      <span aria-hidden="true" className="font-mono text-xs leading-[18px]">
        {face.glyph}
      </span>
      <span className="text-xs leading-[18px]">{face.word}</span>
    </span>
  );
}

interface ReportRowProps {
  title: string;
  /** What this row is, or the verbatim reason a check failed. */
  note: string;
  report: ComponentReport | undefined;
  actionLabel?: string;
  /** Said in full to a screen reader, because "Set up" alone does not say
   *  which of seven rows it belongs to. */
  actionName?: string;
  onAction?: () => void;
}

/** One reported component. Used by Agents and by Tools, because they differ in
 *  what they mean and not in what they draw: a found executable and a found
 *  simulator are the same kind of sentence. */
function ReportRow({ title, note, report, actionLabel, actionName, onAction }: ReportRowProps) {
  const face = faceFor(report);
  const offerAction = actionLabel !== undefined && onAction !== undefined && canAct(report);

  return (
    <li className="border-b border-border px-3 py-3 last:border-b-0">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm leading-[20px] font-semibold text-text">
          {title}
        </span>
        <StatusFace face={face} />
      </div>

      <p className="pt-1 text-xs leading-[18px] text-muted">{note}</p>

      {/* What the probe resolved, verbatim and unprefixed: check_codex reports
          a version where the others report a path (doctor.rs:308-321), so a
          "Found at" caption over it would be a caption that lies. */}
      {report?.detail && (
        <p className="pt-1 font-mono text-xs leading-[18px] break-words text-muted">
          {report.detail}
        </p>
      )}

      {/* The probe's own sentence, which names the exact path it tried. A
          reason gets prose and no control, because no button could change it. */}
      {report?.error &&
        (report.status === 'unavailable' ? (
          <p className="pt-1 text-xs leading-[18px] text-muted">{report.error}</p>
        ) : (
          <p className="mt-2 flex gap-2 rounded-lg border border-warning px-2 py-1.5 text-xs leading-[18px] text-warning">
            <span aria-hidden="true" className="font-mono">
              !
            </span>
            <span className="min-w-0 font-mono break-words whitespace-pre-wrap">
              {report.error}
            </span>
          </p>
        ))}

      {offerAction && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button type="button" onClick={onAction} aria-label={actionName} className={BTN}>
            {actionLabel}
          </button>
        </div>
      )}
    </li>
  );
}

interface SectionProps {
  id: SectionId;
  title: string;
  /** One line under the heading saying what this section may honestly claim. */
  blurb: string;
  innerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

function SettingsSection({ id, title, blurb, innerRef, children }: SectionProps) {
  return (
    <section
      ref={innerRef}
      aria-labelledby={headingId(id)}
      className="border-b border-border px-4 py-6 last:border-b-0"
    >
      <h3 id={headingId(id)} className="text-sm leading-[20px] font-semibold text-text">
        {title}
      </h3>
      <p className="max-w-[560px] pt-1 text-xs leading-[18px] text-muted">{blurb}</p>
      <div className="pt-4">{children}</div>
    </section>
  );
}

/** Availability as a word, never as a colour: the mint/muted split is a second
 *  channel on top of the label, exactly as experience-selector.tsx draws it. */
function AvailabilityBadge({ available }: { available: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-lg border px-1.5 text-xs leading-[18px] ${
        available ? 'border-success/40 text-success' : 'border-border text-muted'
      }`}
    >
      {available ? 'Available' : 'Coming soon'}
    </span>
  );
}

const EXPERIENCE_NAME: Record<ExperienceId, string> = {
  build: 'Build',
  verify: 'Verify',
};

interface ExperienceRowProps {
  experience: Experience;
  onToggle: (id: ExperienceId, next: boolean) => void;
}

/** One experience, with the ONE control that can turn it on.
 *
 *  `Availability` comes from release configuration (types.ts:79-81), so a
 *  `comingSoon` row renders its checkbox `disabled` and states the backend's
 *  own `reason` beside it. The control is inert because the experience has not
 *  shipped — not because a preference is off — and nothing in this file can
 *  change that: there is no code path here that writes `availability`.
 *
 *  Nothing in the inert rendering is dimmed. The usual grey-out lands near
 *  2:1; a dashed `border-muted` edge on `bg-raised` measures around 7:1, so the
 *  unavailable control stays as readable as the live one. */
function ExperienceRow({ experience, onToggle }: ExperienceRowProps) {
  const name = EXPERIENCE_NAME[experience.id];
  const selectable = experience.availability === 'available';
  const fieldId = `settings-experience-${experience.id}`;
  const reasonId = `${fieldId}-reason`;
  // `enabled` is documented as always false while comingSoon (types.ts:86-87).
  // Read through the availability fact rather than trusted alone, so a payload
  // that ever disagreed would show an unticked inert box instead of claiming an
  // unreleased experience is switched on.
  const checked = selectable && experience.enabled;

  return (
    <li className="border-b border-border px-3 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <input
            id={fieldId}
            type="checkbox"
            checked={checked}
            disabled={!selectable}
            aria-describedby={experience.reason ? reasonId : undefined}
            onChange={(e) => onToggle(experience.id, e.target.checked)}
            className="peer h-5 w-5 appearance-none rounded-lg border border-border bg-raised transition-colors duration-150 checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-dashed disabled:border-muted motion-reduce:transition-none"
          />
          {/* Drawn at every state so the box never changes size when it is
              ticked; only the token moves. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute font-mono text-xs leading-none text-transparent peer-checked:text-on-accent"
          >
            ✓
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <label
            htmlFor={fieldId}
            className="flex flex-wrap items-center gap-2 text-sm leading-[20px] font-semibold text-text"
          >
            {name}
            <AvailabilityBadge available={selectable} />
          </label>

          {/* The release fact in the backend's own words. Outside the label, so
              it describes the control instead of becoming its name. */}
          {experience.reason && (
            <p id={reasonId} className="pt-1 text-xs leading-[18px] text-muted">
              {experience.reason}
            </p>
          )}
        </span>
      </div>
    </li>
  );
}

export interface SettingsPageProps {
  /** Release configuration's answer, in backend order. `null` while the read is
   *  still out — a normal opening state, not an error. */
  experiences: Experience[] | null;
  /** Build's flag is the only one any backend call accepts, so the row for an
   *  unreleased experience is `disabled` and this never fires for it. The id is
   *  passed anyway: the host owns the mapping and should not have to infer
   *  which row spoke. */
  onToggleExperience: (id: ExperienceId, next: boolean) => void;

  /** What the startup probe found, read by BOTH Agents and Tools. Empty is the
   *  normal first-run value: every row still renders, nothing is withheld. */
  reports: ComponentReport[];
  /** Guide the user through setting up an agent this app does not own. Omit it
   *  and the control is absent rather than inert. */
  onSetUpAgent?: (id: 'claude' | 'codex') => void;
  /** Point Effi at some other CLI. It has no `ComponentId` because it names
   *  nothing this app can detect, install or run. */
  onAddOtherCli?: () => void;
  /** Set up one optional tool. Nothing is gated on the result. */
  onSetUpTool?: (id: 'browser' | 'ios' | 'android' | 'memory') => void;

  /** Catalogue rows plus configured connections, exactly as the host read them.
   *  Used for a count and for nothing else: no status word is derived here. */
  connections: Connection[];
  /** Opens THE Connections surface — the same destination as the sidebar
   *  entry, never a second page. */
  onOpenConnections: () => void;

  /** `null` until the probe lands. The panel below says so itself. */
  diagnostics: Diagnostics | null;
  /** The only probe this screen can start, and only on a press. */
  onRecheckDiagnostics: () => void;
}

/**
 * Settings. Props in, callbacks out.
 *
 * The host owns every command: a sibling task owns `src/lib/tauri-api.ts` and
 * `App.tsx` this wave, so this file invents no wrapper name and calls nothing.
 * The one exception is the reused `DiagnosticsPanel`, which already owns the
 * diagnostics commands in the rail and keeps owning them here — reusing it is
 * the point, and re-implementing it to strip its I/O would be the second
 * version this screen exists to avoid.
 *
 * It renders its own "Settings" title. A host that frames it (a drawer, say)
 * should supply the close affordance and not a second heading.
 */
export function SettingsPage({
  experiences,
  onToggleExperience,
  reports,
  onSetUpAgent,
  onAddOtherCli,
  onSetUpTool,
  connections,
  onOpenConnections,
  diagnostics,
  onRecheckDiagnostics,
}: SettingsPageProps) {
  const [current, setCurrent] = useState<SectionId>('experiences');
  const refs: Record<SectionId, RefObject<HTMLElement | null>> = {
    experiences: useRef<HTMLElement | null>(null),
    agents: useRef<HTMLElement | null>(null),
    tools: useRef<HTMLElement | null>(null),
    connections: useRef<HTMLElement | null>(null),
    appearance: useRef<HTMLElement | null>(null),
    diagnostics: useRef<HTMLElement | null>(null),
  };

  /** A jump the user asked for, so it may animate — it takes no reading
   *  position away from anyone. The preference still has to be consulted in the
   *  call itself: `scroll-behavior` passed to scrollIntoView is not reachable
   *  from a stylesheet, so the CSS net cannot cover this one. */
  const jump = (id: SectionId) => {
    setCurrent(id);
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    refs[id].current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const claude = reportFor(reports, 'claude');
  const codex = reportFor(reports, 'codex');

  /** Read off the reports rather than asserted. `required: false` means a
   *  missing piece blocks nothing, and nothing in the shipped product sets it
   *  for an optional tool (types.ts:121-124) — so this is what the data says,
   *  and either answer leaves this screen gating nothing. */
  const declaredRequired = reports.filter((r) => r.required).map((r) => r.id);

  /** Honest arithmetic over cells the backend sent, not a verdict composed
   *  here: a row counts as adapterless only when all three of its consumer
   *  cells read `unsupportedByAgent`, which is every row in this build because
   *  `installed_adapters()` comes back empty. */
  const adapterless = connections.filter((c) =>
    Object.values(c.consumers).every((status) => status === 'unsupportedByAgent'),
  ).length;

  const toolRow = (id: 'browser' | 'memory', note: string) => (
    <ReportRow
      title={TOOL_NAME[id]}
      note={reportFor(reports, id)?.error ?? note}
      report={reportFor(reports, id)}
      actionLabel={onSetUpTool ? 'Set up' : undefined}
      actionName={onSetUpTool ? `Set up ${TOOL_NAME[id]}` : undefined}
      onAction={onSetUpTool ? () => onSetUpTool(id) : undefined}
    />
  );

  const deviceRow = (id: 'ios' | 'android') => {
    const report = reportFor(reports, id);
    return (
      <ReportRow
        title={TOOL_NAME[id]}
        // The backend's sentence first, because it names the exact repair.
        note={report?.error ?? DEVICE_FALLBACK[deviceReadiness(report)]}
        report={report}
        actionLabel={onSetUpTool ? 'Set up' : undefined}
        actionName={onSetUpTool ? `Set up ${TOOL_NAME[id]}` : undefined}
        onAction={onSetUpTool ? () => onSetUpTool(id) : undefined}
      />
    );
  };

  return (
    <section
      aria-labelledby="settings-page-heading"
      className="flex h-full min-h-0 flex-col bg-surface"
    >
      <div className="shrink-0 border-b border-border px-4 py-4">
        <h2 id="settings-page-heading" className="text-sm leading-[20px] font-semibold text-text">
          Settings
        </h2>
        <p className="max-w-[560px] pt-1 text-xs leading-[18px] text-muted">
          Opening this screen reads what is already known. Nothing here starts a check, an
          installer, a device or a shell until you press something.
        </p>

        {/* Jump links, not tabs: every section below stays mounted and visible,
            so a user who never presses one of these misses nothing. */}
        <nav aria-label="Settings sections" className="flex flex-wrap gap-2 pt-4">
          {SECTIONS.map((s) => {
            const active = s.id === current;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(s.id)}
                aria-current={active ? 'true' : undefined}
                className={`rounded-lg border px-2 py-1 text-xs leading-[18px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${
                  active
                    ? 'border-accent bg-accent-tint text-text'
                    : 'border-border text-muted hover:bg-hover hover:text-text'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ---------------------------------------------------------------- */}
        <SettingsSection
          id="experiences"
          title="Experiences"
          blurb="Which experiences have shipped is a release fact. This screen can turn a released one on; it cannot release one."
          innerRef={refs.experiences}
        >
          {experiences === null ? (
            <p className="text-xs leading-[18px] text-muted">
              The release configuration has not been read yet.
            </p>
          ) : (
            <fieldset className="min-w-0 border-0 p-0">
              <legend className="pb-2 text-xs leading-[18px] text-muted">
                Turn an experience on
              </legend>
              <ul className="overflow-hidden rounded-xl border border-border bg-raised">
                {experiences.map((experience) => (
                  <ExperienceRow
                    key={experience.id}
                    experience={experience}
                    onToggle={onToggleExperience}
                  />
                ))}
              </ul>
            </fieldset>
          )}
          <p className="max-w-[560px] pt-3 text-xs leading-[18px] text-muted">
            A checkbox never decides availability. An experience marked “Coming soon” has an inert
            control and states why beside it, so there is no tick that could select you into
            something unreleased.
          </p>
        </SettingsSection>

        {/* ---------------------------------------------------------------- */}
        <SettingsSection
          id="agents"
          title="Agents"
          blurb="Claude Code, Codex and any other CLI are agent sessions. Nothing here is tied to one vendor and none of these rows gates the app."
          innerRef={refs.agents}
        >
          <ul className="overflow-hidden rounded-xl border border-border bg-raised">
            <ReportRow
              title={AGENT_NAME.claude}
              note={claude?.error ?? 'Runs as an agent session. Effi uses your local installation.'}
              report={claude}
              actionLabel={onSetUpAgent ? 'Set up' : undefined}
              actionName={onSetUpAgent ? `Set up ${AGENT_NAME.claude}` : undefined}
              onAction={onSetUpAgent ? () => onSetUpAgent('claude') : undefined}
            />
            <ReportRow
              title={AGENT_NAME.codex}
              note={codex?.error ?? 'Runs as an agent session. Effi uses your local installation.'}
              report={codex}
              actionLabel={onSetUpAgent ? 'Set up' : undefined}
              actionName={onSetUpAgent ? `Set up ${AGENT_NAME.codex}` : undefined}
              onAction={onSetUpAgent ? () => onSetUpAgent('codex') : undefined}
            />
            {/* No ComponentId, so no report and no status: this app cannot
                detect, install or run a CLI it has not been pointed at. The row
                says that rather than showing a probe result it does not have. */}
            <li className="border-b border-border px-3 py-3 last:border-b-0">
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate text-sm leading-[20px] font-semibold text-text">
                  Another CLI
                </span>
                <StatusFace face={{ glyph: '○', word: 'Not configured', tone: 'text-muted' }} />
              </div>
              <p className="pt-1 text-xs leading-[18px] text-muted">
                Any other command-line agent runs here as a session too. Nothing checks for one
                until you name it.
              </p>
              {onAddOtherCli && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onAddOtherCli}
                    aria-label="Point Effi at another CLI"
                    className={BTN}
                  >
                    Point Effi at a CLI
                  </button>
                </div>
              )}
            </li>
          </ul>
          <p className="max-w-[560px] pt-3 text-xs leading-[18px] text-muted">
            “Detected” means the program was found on this machine, and that is the whole claim. No
            check in this app can observe a provider sign-in, so no status here is one. “Ready” is
            separate and stronger: a diagnostic for that component actually passed.
          </p>
          <p className="max-w-[560px] pt-2 text-xs leading-[18px] text-muted">
            Choosing none of them is a supported setup.
          </p>
        </SettingsSection>

        {/* ---------------------------------------------------------------- */}
        <SettingsSection
          id="tools"
          title="Tools"
          blurb="Every tool here is optional. A missing one is reported and nothing more — it holds back no other surface."
          innerRef={refs.tools}
        >
          <ul className="overflow-hidden rounded-xl border border-border bg-raised">
            {toolRow('browser', 'Preview and inspect pages beside the terminal.')}
            {deviceRow('ios')}
            {deviceRow('android')}
            {toolRow('memory', 'Keep this project’s notes and decisions on disk.')}
          </ul>
          <p className="max-w-[560px] pt-3 text-xs leading-[18px] text-muted">
            {declaredRequired.length === 0
              ? 'None of these reported itself as required, so a warning is the strongest thing a missing tool produces.'
              : `${declaredRequired.length} of these reported itself as required. This screen still blocks nothing: a warning is as far as it goes.`}
          </p>
          <p className="max-w-[560px] pt-2 text-xs leading-[18px] text-muted">
            Setting up a device tool is a download you ask for. Pressing “Set up” hands you to that
            flow; it fetches nothing from here.
          </p>
        </SettingsSection>

        {/* ---------------------------------------------------------------- */}
        <SettingsSection
          id="connections"
          title="Connections"
          blurb="One surface, two doors. This section and the sidebar entry open the same page, which is why neither of them is a configuration form."
          innerRef={refs.connections}
        >
          <p className="max-w-[560px] text-xs leading-[18px] text-muted">
            {connections.length === 0
              ? 'The connector catalogue has not been read yet, so there is nothing to count here.'
              : `${adapterless} of ${connections.length} rows report every consumer as not supported by this agent. No adapter is installed for Effi Studio, Claude Code or Codex in this build, so there is no check for one of them to pass.`}
          </p>
          <p className="max-w-[560px] pt-2 text-xs leading-[18px] text-muted">
            A connection has one status per consumer, each from that consumer’s own adapter — so the
            words live on the page that renders the backend’s cells, not in a summary here.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-4">
            <button
              type="button"
              onClick={onOpenConnections}
              className={BTN_PRIMARY}
            >
              Open Connections
            </button>
          </div>
          <p className="max-w-[560px] pt-2 text-xs leading-[18px] text-muted">
            Connections are optional. Nothing on that page is a prerequisite for anything in this
            one.
          </p>
        </SettingsSection>

        {/* ---------------------------------------------------------------- */}
        <SettingsSection
          id="appearance"
          title="Appearance"
          blurb="There is nothing to choose here, and saying so is the only honest content this section has."
          innerRef={refs.appearance}
        >
          <p className="max-w-[560px] text-xs leading-[18px] text-muted">
            The stylesheet defines one palette and no alternative to it: it is dark by design and
            carries no prefers-color-scheme branch, so a control offering a second appearance would
            have nothing to resolve to. A setting that changes nothing is worse than an absent one,
            so this section reports the palette instead of pretending to set it.
          </p>

          {/* A legend, not a control: nothing below is in the tab order and
              nothing here writes anything. Each swatch is read by its word. */}
          <dl className="mt-4 overflow-hidden rounded-xl border border-border bg-raised">
            <div className="flex items-start gap-3 border-b border-border px-3 py-3">
              <span
                aria-hidden="true"
                className="mt-1 h-3 w-3 shrink-0 rounded-lg border border-border bg-accent"
              />
              <dt className="shrink-0 text-xs leading-[18px] text-text">Cyan</dt>
              <dd className="min-w-0 flex-1 text-xs leading-[18px] text-muted">
                Selection, and the primary action.
              </dd>
            </div>
            <div className="flex items-start gap-3 px-3 py-3">
              <span
                aria-hidden="true"
                className="mt-1 h-3 w-3 shrink-0 rounded-lg border border-border bg-success"
              />
              <dt className="shrink-0 text-xs leading-[18px] text-text">Mint</dt>
              <dd className="min-w-0 flex-1 text-xs leading-[18px] text-muted">
                A check passed. Never used for a selection, and the two are never swapped.
              </dd>
            </div>
          </dl>

          <p className="max-w-[560px] pt-3 text-xs leading-[18px] text-muted">
            Colour is never a signal on its own: every status in this app carries a glyph and a
            word, and normal text holds at least 4.5:1 against the surface behind it.
          </p>
          <p className="max-w-[560px] pt-2 text-xs leading-[18px] text-muted">
            Motion is a single 150ms for everything that moves. Reduced motion is the one appearance
            preference this app reads, and it comes from your operating system — which is why there
            is no duplicate of that choice here.
          </p>
        </SettingsSection>

        {/* ---------------------------------------------------------------- */}
        <SettingsSection
          id="diagnostics"
          title="Diagnostics"
          blurb="Nine independent checks, each reported on its own. There is no total: a missing Codex says nothing about Xcode."
          innerRef={refs.diagnostics}
        >
          {/* The rail's panel, reused unchanged. It owns the diagnostics
              commands and runs them when its buttons are pressed — never at
              mount, so arriving here starts nothing. */}
          <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-border bg-raised">
            <DiagnosticsPanel diagnostics={diagnostics} onRecheck={onRecheckDiagnostics} />
          </div>
          <p className="max-w-[560px] pt-3 text-xs leading-[18px] text-muted">
            The rows in Agents and Tools above show this same pass. Re-running it from here
            refreshes them too, because there is one probe and not seven.
          </p>
        </SettingsSection>
      </div>
    </section>
  );
}
