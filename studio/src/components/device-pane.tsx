import { useId, useRef, useState, type ReactNode } from 'react';
import type {
  DeviceEntry,
  DeviceFact,
  DevicePlatform,
  DeviceReadiness,
  DeviceReport,
  FactState,
  LaunchOutcome,
  LaunchStatus,
  OwnedDevice,
  StopOutcome,
  StopStatus,
} from '../lib/types';

/**
 * The device tab — iOS Simulator and Android Emulator (mockups
 * `04-browser-devices.png`, `02-build-setup.png`).
 *
 * # This pane is a control surface, not a preview
 *
 * `devices.rs:58` publishes `EMBEDDED_PREVIEW_SUPPORTED = false` as a fact
 * rather than leaving it to be assumed: a native simulator cannot be drawn into
 * the webview that renders this app. So there is no viewport here, and this
 * file draws none — no device frame, no stand-in image, no empty rectangle
 * dressed as a screen. `BUILD-CHANGES.md` §6 names that shortcut for this exact
 * tab and refuses it, and the reason is not tidiness: a drawing of a phone
 * promises a mirror of the running device, and the first time a user taps it
 * and nothing happens they have learned the app lies about what it can see.
 *
 * What the tab shows instead is what it genuinely has: which device, what the
 * machine is actually ready for, and the controls that act. The mockup's device
 * artwork is a concept drawing of the product, not evidence that a preview
 * exists behind it.
 *
 * # Nothing starts by itself
 *
 * There is deliberately no `useEffect` in this file. A device boots because the
 * user pressed Launch and for no other reason — not on mount, not on open, not
 * on a tab switch, and not as a side effect of picking a name out of the
 * selector. Discovery itself is read-only on the Rust side
 * (`devices.rs:29-32`), so opening this tab to look cannot start a download
 * either.
 *
 * # Close tab and Stop device are two different acts
 *
 * They are drawn as two controls with two consequences, and both consequences
 * are written on the screen rather than left to be discovered:
 *
 * - **Close tab** gives up the ownership record and stops nothing. The device
 *   keeps running. `release_device_ownership` (`devices.rs:1431-1437`) takes no
 *   action parameter at all — there is no variant of it that kills anything.
 * - **Stop device** shuts the device down, and only ever acts on a claim this
 *   tab holds (`devices.rs:1255-1325`).
 *
 * A simulator the user started themselves is listed here and usable, and is
 * never owned: `simctl` reports it exactly like one this app booted, so
 * running-ness is deliberately not the authority — the ownership record is.
 * Stop is therefore shown disabled with the backend's own `notOwnedByApp`
 * reasoning beside it, rather than offered and then refused.
 *
 * # Data and operations arrive as props
 *
 * This pane invents no wrapper name and imports no IPC: the caller passes the
 * report, the ownership records and the operations, which are
 * `discover_devices`, `launch_device`, `stop_device`, `owned_devices` and
 * `release_device_ownership` on the Rust side. `App.tsx`'s `DeviceTabPane` is
 * the host that calls them, and it is the only place in the frontend that
 * does.
 */

// ---------------------------------------------------------------------------
// The contract with the backend
//
// The eleven wire types this pane speaks now live in `lib/types.ts`, beside
// every other shape the Rust side sends, and are imported above. They were
// declared here while no IPC layer existed; the layer exists now, and
// `tauri-api.ts` is in `lib/` and must not import from `components/` to reach
// them. The declarations moved unchanged — confirmed field for field against
// `devices.rs`'s `#[serde(rename_all = "camelCase")]` structs — and no call
// site in this file changed, which is exactly what happened to
// `BrowserPaneView` when the browser wrappers landed (types.ts:339-343).
//
// They are re-exported here so this pane's documented contract stays readable
// from the pane, and so the IPC owner adopting them has one name per shape
// rather than two drifting copies.
// ---------------------------------------------------------------------------

export type {
  DeviceEntry,
  DeviceFact,
  DevicePlatform,
  DeviceReadiness,
  DeviceReport,
  FactState,
  LaunchOutcome,
  LaunchStatus,
  OwnedDevice,
  StopOutcome,
  StopStatus,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DevicePaneProps {
  /** This tab's id, which is what ownership is keyed to. Stop works here only
   *  for claims carrying this id. */
  tabId: string;
  /** One platform's report, from `discover_devices`. */
  report: DeviceReport;
  /** Everything this app currently claims, from `owned_devices`. Passed whole
   *  rather than pre-filtered so the pane can tell "owned by another tab" from
   *  "owned by nobody" — two refusals with two different answers. */
  owned: OwnedDevice[];
  /** Controlled selection. Omit it and the pane keeps its own; a selection is
   *  never a launch either way. */
  selectedDeviceId?: string | null;
  onSelectDevice?: (deviceId: string | null) => void;
  /** `launch_device`. Explicit, and the only thing in this file that starts a
   *  device. */
  onLaunch: (deviceId: string) => Promise<LaunchOutcome> | LaunchOutcome;
  /** `stop_device`. Offered only for a device this tab owns. */
  onStop: (deviceId: string) => Promise<StopOutcome> | StopOutcome;
  /** `release_device_ownership` for this tab, then close the tab. It takes no
   *  action parameter because there is no device action in it: the records go,
   *  the devices stay up. */
  onCloseTab: () => Promise<unknown> | unknown;
  /** `discover_devices` again. Read-only; nothing is installed by looking. */
  onCheckAgain?: () => Promise<unknown> | unknown;
  /** The backend's own `window_note`, shown verbatim rather than re-worded. */
  windowNote?: string;
  /** Where the tool is switched on, named for the `notEnabled` state whose next
   *  step is a choice rather than a repair. */
  setupLocation?: string;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** The two consequences, written once each so the buttons, the helper text and
 *  the refusals cannot drift into describing different behaviour. */
const STOP_CONSEQUENCE = 'Stop device shuts the device down.';
const CLOSE_CONSEQUENCE =
  'Close tab gives up Effi’s record of the device and stops nothing — it keeps running.';

/** The `notOwnedByApp` sentence, in the shape the backend words it
 *  (`devices.rs:1269-1278`). Shown beside a disabled Stop, never after one. */
const NOT_OWNED_BY_APP =
  'Effi did not start this device, so it will not stop it. Stop it where it was started.';

const PLATFORM: Record<
  DevicePlatform,
  {
    name: string;
    /** What the vendor toolchain is called, for the dependency state. */
    tools: string;
    /** What a runtime is called here — an iOS runtime is not a system image. */
    runtime: string;
    /** What a device is called here. */
    device: string;
    devicePlural: string;
    icon: string;
  }
> = {
  ios: {
    name: 'iOS Simulator',
    tools: 'Xcode',
    runtime: 'iOS runtime',
    device: 'simulator',
    devicePlural: 'simulators',
    icon: 'M8.5 3h7a1.5 1.5 0 011.5 1.5v15a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 017 19.5v-15A1.5 1.5 0 018.5 3z M10.5 18h3',
  },
  android: {
    name: 'Android Emulator',
    tools: 'the Android SDK and its emulator package',
    runtime: 'system image',
    device: 'virtual device',
    devicePlural: 'virtual devices',
    icon: 'M6 11.5a6 6 0 0112 0V18H6v-6.5z M8.6 5.6L7.2 3.6 M15.4 5.6L16.8 3.6 M9.8 9.2h.01 M14.2 9.2h.01',
  },
};

// ---------------------------------------------------------------------------
// Marks
//
// Every state below carries a glyph AND a word. Colour alone names nothing.
// ---------------------------------------------------------------------------

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
      // Decorative: each mark sits beside the word that names it.
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const CHECK_CIRCLE = 'M12 4a8 8 0 110 16 8 8 0 010-16 M8.6 12.1l2.4 2.4 4.4-4.6';
const ALERT = 'M12 4.5L20.5 19h-17L12 4.5z M12 10v4 M12 16.5h.01';
const QUESTION = 'M12 4a8 8 0 110 16 8 8 0 010-16 M9.8 9.6a2.3 2.3 0 114 1.6c-.9.8-1.8 1.2-1.8 2.4 M12 16.8h.01';
const SWITCH_OFF = 'M8 8h8a4 4 0 010 8H8a4 4 0 010-8z M8.5 12h.01';
const DOWNLOAD = 'M12 4v10 M8 10.5l4 4 4-4 M5 19h14';
const PLUS_BOX = 'M5 5.5h14v13H5z M12 9v6 M9 12h6';
const PLAY = 'M9 6.5l8 5.5-8 5.5V6.5z';
const SQUARE = 'M7.5 7.5h9v9h-9z';
const EXTERNAL = 'M14 5h5v5 M19 5l-7.5 7.5 M18 13.5V19H5V6h5.5';
const CLOSE_TAB = 'M4.5 5.5h15v13h-15z M4.5 9.5h15 M13.5 13l3.5 3.5 M17 13l-3.5 3.5';
const SPINNER = 'M12 4.5a7.5 7.5 0 017.5 7.5';
const LOCK = 'M7.5 11V8.5a4.5 4.5 0 019 0V11 M5.5 11h13v8.5h-13z';
const INFO = 'M12 3a9 9 0 110 18 9 9 0 010-18z M12 11v5 M12 8h.01';

// ---------------------------------------------------------------------------
// Shared classes
// ---------------------------------------------------------------------------

/** The house disabled standard: a dashed frame and `cursor-not-allowed`, with
 *  the text moved to the muted token. Never a half-opacity dim — that measured
 *  2:1 on these surfaces and failed; muted on surface measures 7.05:1. */
const DISABLED =
  'disabled:cursor-not-allowed disabled:border-dashed disabled:border-border disabled:bg-surface disabled:text-muted';

/** A visible ring that is actually drawn. The outline-none utility is
 *  deliberately absent from this list: paired with `outline-2` under Tailwind
 *  v4 it emits `outline-style: none` and cancels the ring it looks like it is
 *  setting. */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper';

const MOTION = 'transition-colors duration-150 motion-reduce:transition-none';

const BODY = 'text-sm leading-[21px]';
const META = 'text-xs leading-[18px]';

const PRIMARY = `flex h-9 shrink-0 items-center gap-2 rounded-lg border border-copper bg-copper px-4 ${BODY} font-semibold text-on-copper hover:bg-copper/90 ${MOTION} ${FOCUS} ${DISABLED}`;
const SECONDARY = `flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-raised px-4 ${BODY} text-text hover:bg-hover ${MOTION} ${FOCUS} ${DISABLED}`;

// ---------------------------------------------------------------------------
// The four readiness states
//
// Four states, four treatments. A single "not ready" would throw away exactly
// what the backend went to the trouble of separating: `notEnabled` is a choice
// and not a failure, a missing dependency and a missing runtime are different
// facts with different repairs, and `available` is the only one where Launch
// does anything.
// ---------------------------------------------------------------------------

interface Treatment {
  /** The state, in a word, beside its glyph. */
  word: string;
  icon: ReactNode;
  /** Text token. Sage is healthy, warm amber is attention; copper stays the
   *  primary action and is never used to say "fine". */
  tone: string;
  /** The panel frame. `notEnabled` is dashed and borrows no error colour. */
  frame: string;
  headline: string;
  body: string;
  /** The next step for THIS state. `null` where none can be stated honestly. */
  step: string | null;
}

function treat(report: DeviceReport, setupLocation: string): Treatment {
  const p = PLATFORM[report.platform];

  switch (report.readiness) {
    // A choice, not a failure. Nothing is broken, nothing is missing, and
    // nothing here is styled as an error — a dashed neutral frame and the
    // muted token, which is the same treatment the rest of the app gives a
    // control that is simply switched off.
    case 'notEnabled':
      return report.platformSupported
        ? {
            word: 'Not enabled',
            icon: <Icon path={SWITCH_OFF} />,
            tone: 'text-muted',
            frame: 'border-dashed border-border bg-surface',
            headline: `${p.name} is not switched on`,
            body: `Nothing failed and nothing is missing — this tool is off because it has not been turned on. Effi downloads nothing for it until you ask.`,
            step: `Turn ${p.name} on in ${setupLocation}, then check again.`,
          }
        : {
            // Still not an error: the machine is what it is.
            word: 'Not available here',
            icon: <Icon path={SWITCH_OFF} />,
            tone: 'text-muted',
            frame: 'border-dashed border-border bg-surface',
            headline: `${p.name} does not run on this machine`,
            body:
              report.tools.problem ??
              `This platform’s devices cannot run here, so there is nothing to enable.`,
            // No step. There is no install that makes this platform appear,
            // and offering one would be a repair for a problem nobody has.
            step: null,
          };

    // The vendor toolchain. Its own fact, its own words, its own repair —
    // which is never the runtime's repair, because they are hours apart in
    // cost and in kind.
    case 'dependencyMissing':
      return {
        word: 'Dependency missing',
        icon: <Icon path={DOWNLOAD} />,
        tone: 'text-warning',
        frame: 'border-border bg-surface',
        headline: `${p.tools} is not ready on this machine`,
        body:
          report.tools.problem ??
          `${p.name} needs ${p.tools}, which Effi neither owns nor installs.`,
        step: report.tools.state === 'unknown' ? null : report.tools.fix,
      };

    // A different fact entirely: the toolchain IS installed, and what is
    // missing is something to run, or something to run it on. Separate copy
    // from the state above on purpose — the two share no sentence.
    case 'runtimeOrDeviceMissing': {
      const runtimeMissing = report.runtime.state !== 'present';
      const missing = runtimeMissing ? report.runtime : report.devices;
      return {
        word: 'Runtime or device missing',
        icon: <Icon path={PLUS_BOX} />,
        tone: 'text-warning',
        frame: 'border-border bg-surface',
        headline: runtimeMissing
          ? `${p.tools} is installed; a ${p.runtime} is not`
          : `${p.tools} and a ${p.runtime} are installed; no ${p.device} exists`,
        body:
          missing.problem ??
          (missing.state === 'unknown'
            ? 'This could not be determined, so nothing is claimed about it.'
            : `A ${p.runtime} and a ${p.device} are two separate things to add.`),
        // An `unknown` fact publishes no repair, and none is invented here.
        step: missing.state === 'unknown' ? null : missing.fix,
      };
    }

    case 'available':
      return {
        word: 'Available',
        icon: <Icon path={CHECK_CIRCLE} />,
        tone: 'text-success',
        frame: 'border-border bg-surface',
        headline: `Ready to launch`,
        body: `${report.found.length} ${report.found.length === 1 ? p.device : p.devicePlural} found. Pick one and press Launch — nothing starts before you do.`,
        step: null,
      };
  }
}

// ---------------------------------------------------------------------------
// Ownership, which is a record and never an appearance
// ---------------------------------------------------------------------------

type Ownership =
  | { kind: 'none' }
  /** This tab launched it. The only case where Stop acts. */
  | { kind: 'ownedHere'; record: OwnedDevice }
  /** Another tab launched it. Stop lives there, and this says where. */
  | { kind: 'ownedByAnotherTab'; record: OwnedDevice }
  /** Up already, and this app never started it. Listed, usable, never owned. */
  | { kind: 'runningOutsideApp' }
  /** Nothing is running and nothing is claimed. */
  | { kind: 'idle' };

/** `looks_already_running` (`devices.rs:944-946`), mirrored exactly: `Booted`
 *  and the transient `Booting` both mean a device already coming up. Android
 *  reports no run state at all, so this is only ever true for iOS — and it
 *  decides nothing about ownership on its own. */
function looksRunning(runState: string | null): boolean {
  return runState !== null && runState.trim().toLowerCase().startsWith('boot');
}

function ownershipOf(
  entry: DeviceEntry | null,
  platform: DevicePlatform,
  tabId: string,
  owned: OwnedDevice[],
): Ownership {
  if (!entry) return { kind: 'none' };
  const record = owned.find((o) => o.platform === platform && o.deviceId === entry.id);
  // The record is settled BEFORE running-ness, because a device this app
  // booted also reads as Booted. The other order calls our own claim a
  // stranger's device and takes Stop away from the tab that started it.
  if (record) {
    return record.tabId === tabId
      ? { kind: 'ownedHere', record }
      : { kind: 'ownedByAnotherTab', record };
  }
  if (looksRunning(entry.runState)) return { kind: 'runningOutsideApp' };
  return { kind: 'idle' };
}

// ---------------------------------------------------------------------------
// Outcome copy
// ---------------------------------------------------------------------------

const LAUNCH_HEADLINE: Record<LaunchStatus, string> = {
  launched: 'Launched',
  alreadyOwnedHere: 'Already launched from this tab',
  ownedByAnotherTab: 'Owned by another tab',
  runningOutsideApp: 'Running outside Effi',
  notADiscoveredDevice: 'That device was not found on this machine',
  prerequisitesMissing: 'Not ready to launch',
  couldNotStart: 'Could not start',
};

const STOP_HEADLINE: Record<StopStatus, string> = {
  stopped: 'Stopped',
  notOwnedByApp: 'Not Effi’s to stop',
  ownedByAnotherTab: 'Stop belongs to another tab',
  didNotConfirm: 'The stop did not confirm',
};

/** Which statuses are good news, for tone only. The word beside the glyph is
 *  what carries the meaning. */
const LAUNCH_SETTLED: LaunchStatus[] = ['launched', 'alreadyOwnedHere'];

// ---------------------------------------------------------------------------
// Pane
// ---------------------------------------------------------------------------

export function DevicePane({
  tabId,
  report,
  owned,
  selectedDeviceId,
  onSelectDevice,
  onLaunch,
  onStop,
  onCloseTab,
  onCheckAgain,
  windowNote = 'Opens in a separate window',
  setupLocation = 'Settings → Tools',
}: DevicePaneProps) {
  const headingId = useId();
  const selectId = useId();

  const p = PLATFORM[report.platform];

  /** Uncontrolled selection, used only when the caller does not control one.
   *  It starts empty: a device picked by default is a device a careless Enter
   *  could launch, and the mockup's own line is "Choose a device when you're
   *  ready." */
  const [ownSelection, setOwnSelection] = useState<string | null>(null);
  const selectedId = selectedDeviceId !== undefined ? selectedDeviceId : ownSelection;
  const selected = report.found.find((e) => e.id === selectedId) ?? null;

  const [busy, setBusy] = useState<'launch' | 'stop' | 'close' | 'check' | null>(null);
  const [launched, setLaunched] = useState<LaunchOutcome | null>(null);
  const [stopped, setStopped] = useState<StopOutcome | null>(null);
  /** A command that rejected rather than answering. Shown in its own words. */
  const [refusal, setRefusal] = useState<string | null>(null);

  // Adjusted during render rather than in an effect: an outcome belongs to the
  // device it was about, and an effect would paint one frame of the previous
  // device's result under the new device's name.
  const lastSelection = useRef(selectedId);
  if (lastSelection.current !== selectedId) {
    lastSelection.current = selectedId;
    setLaunched(null);
    setStopped(null);
    setRefusal(null);
  }

  const choose = (id: string | null) => {
    if (onSelectDevice) onSelectDevice(id);
    else setOwnSelection(id);
  };

  const run = async <T,>(
    op: 'launch' | 'stop' | 'close' | 'check',
    call: () => Promise<T> | T,
    keep: (value: T) => void,
  ) => {
    setBusy(op);
    setRefusal(null);
    try {
      keep(await call());
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const t = treat(report, setupLocation);
  const ownership = ownershipOf(selected, report.platform, tabId, owned);
  const ready = report.readiness === 'available';

  /** Launch is actionable in exactly one readiness state, for one device, that
   *  no one is already holding. The refusals the backend would return for the
   *  other cases are shown as disabled reasons instead: a control that is
   *  offered and then rejected teaches the user to distrust every control. */
  const launchBlocked: string | null = !ready
    ? `Launch becomes available once this platform reports “Available”.`
    : !selected
      ? 'Choose a device first.'
      : ownership.kind === 'ownedHere'
        ? `${selected.name} is already running from this tab.`
        : ownership.kind === 'ownedByAnotherTab'
          ? `${selected.name} was launched by ${ownership.record.tabId} and is owned there.`
          : ownership.kind === 'runningOutsideApp'
            ? `${selected.name} is already running and Effi did not start it.`
            : null;

  /** Stop acts on a claim or on nothing. Each refusal names itself rather than
   *  sharing one "unavailable". */
  const stopBlocked: string | null = !selected
    ? 'Choose a device first.'
    : ownership.kind === 'ownedHere'
      ? null
      : ownership.kind === 'ownedByAnotherTab'
        ? `${selected.name} is owned by ${ownership.record.tabId}, which is where it can be stopped.`
        : ownership.kind === 'runningOutsideApp'
          ? NOT_OWNED_BY_APP
          : `Effi is not running ${selected.name}, so there is nothing here to stop.`;

  return (
    <section aria-labelledby={headingId} className="flex h-full w-full flex-col bg-ground">
      {/* -- header: the platform, its state in a word, and where a device
             actually appears. The window note is here, above everything, so it
             is read before Launch is pressed rather than after. ----------- */}
      <header className="shrink-0 border-b border-border bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-muted">
            <Icon path={p.icon} size={20} />
          </span>
          <h2 id={headingId} className="text-base leading-6 font-semibold text-text">
            {p.name}
          </h2>
          <span
            className={`flex items-center gap-2 rounded-lg border border-border px-2 py-1 ${META} ${t.tone}`}
          >
            {t.icon}
            {t.word}
          </span>
        </div>
        <p className={`flex items-center gap-2 pt-2 ${META} text-muted`}>
          <span className="text-muted">
            <Icon path={EXTERNAL} size={14} />
          </span>
          {report.embeddedPreview
            ? 'Controls stay in this tab. This pane draws no viewport — it is a control surface.'
            : `Controls stay in this tab. ${windowNote} — nothing is drawn inside it.`}
        </p>
      </header>

      {/* An indeterminate indicator. A boot has no measurable progress, so no
          percentage and no bar that fills itself are shown. Under reduced
          motion it stops animating and stays visible, which still reads as
          work in progress. */}
      <div className="h-0.5 shrink-0 bg-border">
        {busy !== null && (
          <div className="h-full w-full animate-pulse bg-copper motion-reduce:animate-none" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {/* -- the readiness report ------------------------------------ */}
          <div className={`flex flex-col gap-3 rounded-xl border p-4 ${t.frame}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 shrink-0 ${t.tone}`}>{t.icon}</span>
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className={`${BODY} font-semibold text-text`}>{t.headline}</h3>
                <p className={`${BODY} text-muted`}>{t.body}</p>
              </div>
            </div>
            {t.step && (
              <p className={`border-t border-border pt-3 ${BODY} text-text`}>
                <span className="font-semibold">Next: </span>
                {t.step}
              </p>
            )}
            {!t.step && report.readiness !== 'available' && (
              // An `unknown` fact publishes no repair (`devices.rs:144-151`),
              // so none is printed. Saying so out loud is the honest
              // alternative to filling the gap with a plausible guess.
              <p className={`border-t border-border pt-3 ${META} text-muted`}>
                No next step is offered here: nothing was established, and a repair for a question
                that was not asked would be a guess.
              </p>
            )}
          </div>

          {/* -- the facts, each with its own evidence and its own repair -- */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <h3 className={`${META} tracking-[0.12em] text-muted uppercase`}>What was checked</h3>
            <ul className="flex flex-col gap-3">
              <li className="flex items-start gap-3">
                <span className={report.platformSupported ? 'text-success' : 'text-muted'}>
                  <Icon path={report.platformSupported ? CHECK_CIRCLE : SWITCH_OFF} size={16} />
                </span>
                <div className="flex min-w-0 flex-col">
                  <p className={`${BODY} text-text`}>
                    Platform support —{' '}
                    {report.platformSupported ? 'runs on this machine' : 'not available here'}
                  </p>
                </div>
              </li>
              <FactRow label="Tools" fact={report.tools} />
              <FactRow label={`Runtime (${p.runtime})`} fact={report.runtime} />
              <FactRow label={`Device (${p.device})`} fact={report.devices} />
            </ul>
          </div>

          {/* -- the control surface ------------------------------------- */}
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-col gap-2">
              <label htmlFor={selectId} className={`${BODY} font-semibold text-text`}>
                Device
              </label>
              <select
                id={selectId}
                value={selectedId ?? ''}
                disabled={report.found.length === 0 || busy !== null}
                onChange={(e) => choose(e.target.value === '' ? null : e.target.value)}
                className={`h-9 w-full rounded-lg border border-border bg-raised px-3 ${BODY} text-text ${FOCUS} ${MOTION} disabled:cursor-not-allowed disabled:border-dashed disabled:bg-surface disabled:text-muted`}
              >
                <option value="">
                  {report.found.length === 0
                    ? `No ${p.devicePlural} to choose from`
                    : 'Choose a device'}
                </option>
                {report.found.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.runState ? ` — ${entry.runState}` : ''}
                  </option>
                ))}
              </select>
              {selected && (
                <p className={`${META} font-mono break-all text-muted`}>{selected.id}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={PRIMARY}
                disabled={launchBlocked !== null || busy !== null}
                title={launchBlocked ?? undefined}
                onClick={() => {
                  if (!selected) return;
                  void run('launch', () => onLaunch(selected.id), setLaunched);
                }}
              >
                <Icon path={busy === 'launch' ? SPINNER : PLAY} size={16} />
                {busy === 'launch' ? 'Launching' : 'Launch'}
              </button>

              {onCheckAgain && (
                <button
                  type="button"
                  className={SECONDARY}
                  disabled={busy !== null}
                  onClick={() => {
                    void run('check', () => onCheckAgain(), () => {});
                  }}
                >
                  <Icon path={busy === 'check' ? SPINNER : INFO} size={16} />
                  Check again
                </button>
              )}
            </div>

            {/* The external-window label, stated before Launch is pressed and
                in the backend's own words — so nobody waits for a device to
                appear inside this tab. */}
            <p className={`flex items-start gap-2 ${META} text-muted`}>
              <span className="mt-0.5 shrink-0">
                <Icon path={EXTERNAL} size={14} />
              </span>
              <span>
                {windowNote}. Launch starts the device and nothing else: no runtime is downloaded,
                no licence is accepted, and no device is created or erased.
              </span>
            </p>

            {launchBlocked && (
              <p className={`flex items-start gap-2 ${META} text-muted`}>
                <span className="mt-0.5 shrink-0">
                  <Icon path={LOCK} size={14} />
                </span>
                <span>{launchBlocked}</span>
              </p>
            )}
          </div>

          {/* -- two actions, two consequences ---------------------------
              Deliberately not merged, and deliberately not implied by one
              another: closing this tab does not stop a device, and stopping a
              device does not close this tab. */}
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
            <h3 className={`${META} tracking-[0.12em] text-muted uppercase`}>
              Leaving, and shutting down
            </h3>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={SECONDARY}
                  disabled={stopBlocked !== null || busy !== null}
                  title={stopBlocked ?? undefined}
                  onClick={() => {
                    if (!selected) return;
                    void run('stop', () => onStop(selected.id), setStopped);
                  }}
                >
                  <span className={stopBlocked === null ? 'text-warning' : undefined}>
                    <Icon path={busy === 'stop' ? SPINNER : SQUARE} size={16} />
                  </span>
                  {busy === 'stop' ? 'Stopping' : 'Stop device'}
                </button>
                <p className={`${META} min-w-0 flex-1 text-muted`}>
                  {STOP_CONSEQUENCE}{' '}
                  {ownership.kind === 'ownedHere'
                    ? `Here that means: ${ownership.record.stopAction}. This tab is empty afterwards; it does not close.`
                    : 'It works only on a device this tab launched.'}
                </p>
              </div>
              {stopBlocked && (
                <p className={`flex items-start gap-2 ${META} text-muted`}>
                  <span className="mt-0.5 shrink-0">
                    <Icon path={LOCK} size={14} />
                  </span>
                  <span>{stopBlocked}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <button
                type="button"
                className={SECONDARY}
                disabled={busy !== null}
                onClick={() => {
                  void run('close', () => onCloseTab(), () => {});
                }}
              >
                <Icon path={busy === 'close' ? SPINNER : CLOSE_TAB} size={16} />
                Close tab
              </button>
              <p className={`${META} min-w-0 flex-1 text-muted`}>
                {CLOSE_CONSEQUENCE}{' '}
                {ownership.kind === 'ownedHere'
                  ? `${ownership.record.deviceName} stays up, and Effi stops treating it as its own — it then shows as running outside Effi, and Stop is refused for it.`
                  : 'Nothing is shut down by closing this tab.'}
              </p>
            </div>
          </div>

          {/* -- what the last action actually did ------------------------ */}
          {refusal && (
            <Outcome
              tone="text-error"
              icon={<Icon path={ALERT} />}
              headline="The command came back with a refusal"
              body={refusal}
            />
          )}

          {launched && (
            <Outcome
              tone={LAUNCH_SETTLED.includes(launched.status) ? 'text-success' : 'text-warning'}
              icon={
                <Icon path={LAUNCH_SETTLED.includes(launched.status) ? CHECK_CIRCLE : ALERT} />
              }
              headline={LAUNCH_HEADLINE[launched.status]}
              body={
                launched.problem ??
                (launched.status === 'launched'
                  ? `${launched.owned?.deviceName ?? 'The device'} was started by this tab. ${launched.windowNote}.`
                  : `${launched.owned?.deviceName ?? 'This device'} is already claimed by this tab.`)
              }
              // The blocking fact's own repair, and nothing when it has none.
              step={launched.fix}
              note={
                launched.owned && !launched.owned.startConfirmed
                  ? `The start was issued but did not confirm: ${launched.owned.note ?? 'no detail was reported'}. It is still owned by this tab, so Stop device still applies to it.`
                  : (launched.owned?.note ?? null)
              }
            />
          )}

          {stopped && (
            <Outcome
              tone={stopped.status === 'stopped' ? 'text-success' : 'text-warning'}
              icon={<Icon path={stopped.status === 'stopped' ? CHECK_CIRCLE : ALERT} />}
              headline={STOP_HEADLINE[stopped.status]}
              body={
                stopped.problem ??
                (stopped.status === 'stopped'
                  ? 'The device was shut down. Its data, apps and settings are untouched.'
                  : NOT_OWNED_BY_APP)
              }
              step={stopped.fix}
              note={stopped.owned?.note ?? null}
            />
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** One fact. `unknown` says it could not be determined and offers no next step,
 *  because the backend publishes none — see `DeviceFact.fix`. */
function FactRow({ label, fact }: { label: string; fact: DeviceFact }) {
  const tone =
    fact.state === 'present' ? 'text-success' : fact.state === 'absent' ? 'text-warning' : 'text-muted';
  const word =
    fact.state === 'present' ? 'found' : fact.state === 'absent' ? 'missing' : 'could not be determined';
  const mark = fact.state === 'present' ? CHECK_CIRCLE : fact.state === 'absent' ? ALERT : QUESTION;

  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 shrink-0 ${tone}`}>
        <Icon path={mark} size={16} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className={`${BODY} text-text`}>
          {label} — {word}
        </p>
        {fact.evidence && (
          <p className={`${META} font-mono break-all text-muted`}>{fact.evidence}</p>
        )}
        {fact.problem && <p className={`${META} text-muted`}>{fact.problem}</p>}
        {/* No fix is printed for an `unknown` fact, and the guard is on the
            state rather than on the value: a future producer that filled one in
            would be publishing a repair for something nobody established. */}
        {fact.state !== 'unknown' && fact.fix && (
          <p className={`${META} text-text`}>
            <span className="font-semibold">Fix: </span>
            {fact.fix}
          </p>
        )}
        {fact.state === 'unknown' && (
          <p className={`${META} text-muted`}>No fix is offered for a check that did not answer.</p>
        )}
      </div>
    </li>
  );
}

/** `headline` is the state named in words, which sits beside the glyph: colour
 *  never carries a state on its own here. */
function Outcome({
  tone,
  icon,
  headline,
  body,
  step = null,
  note = null,
}: {
  tone: string;
  icon: ReactNode;
  headline: string;
  body: string;
  step?: string | null;
  note?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 ${tone}`}>{icon}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className={`${BODY} font-semibold text-text`}>{headline}</p>
          <p className={`${BODY} text-muted`}>{body}</p>
        </div>
      </div>
      {step && (
        <p className={`${META} text-text`}>
          <span className="font-semibold">Next: </span>
          {step}
        </p>
      )}
      {note && <p className={`${META} text-muted`}>{note}</p>}
    </div>
  );
}
