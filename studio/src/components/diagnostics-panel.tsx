import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/tauri-api';
import type {
  ComponentId,
  ComponentReport,
  ComponentStatus,
  Diagnostics,
} from '../lib/types';
import { PanelSection } from './panel-section';

/** Display names only. Typed against `ComponentId` so a new id added to the
 *  wire contract is a compile error here rather than a row labelled with its
 *  raw enum name. */
const LABEL: Record<ComponentId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  commands: 'EffiClaude commands',
  agents: 'EffiClaude agents',
  worker: 'Memory worker',
  browser: 'Browser engine',
  ios: 'iOS simulators',
  android: 'Android tools',
  memory: 'Memory store',
};

/** Each of these is written once because it is used twice — as the visible
 *  label and inside the longer accessible name that says what the control
 *  really does. Two literals would be two chances for the button and its
 *  description to drift apart. */
const RECHECK = 'Check again';
const SET_PATH = 'Set executable path';

/** Every status carries a glyph AND a word: colour is the third channel, never
 *  the only one. `detected` and `ready` stay apart on purpose — `detected` is
 *  "found on disk" and nothing more, so sage, which this app spends on health,
 *  is reserved for `ready`, the stronger claim that a relevant diagnostic
 *  actually passed. Copper is not used here at all: it means selection and
 *  primary action, and a probe result is neither.
 *
 *  `notSelected`, `queued` and `installing` belong to the setup flow and no
 *  probe constructs them today. They are rendered the same way as the rest
 *  rather than special-cased, so the day one arrives it simply shows up. */
const STATUS: Record<ComponentStatus, { glyph: string; label: string; tone: string }> = {
  notSelected: { glyph: '○', label: 'Not selected', tone: 'text-muted' },
  detected: { glyph: '◆', label: 'Detected', tone: 'text-text' },
  queued: { glyph: '◷', label: 'Queued', tone: 'text-muted' },
  installing: { glyph: '◐', label: 'Installing', tone: 'text-text' },
  ready: { glyph: '✓', label: 'Ready', tone: 'text-success' },
  needsAttention: { glyph: '!', label: 'Needs attention', tone: 'text-warning' },
  unavailable: { glyph: '⊘', label: 'Unavailable', tone: 'text-muted' },
};

/** The components that can actually be pointed at a different executable, each
 *  mapped to the call that stores it. Only Claude has one:
 *  `set_claude_override` (tauri-api.ts:29) is Claude-specific and nothing
 *  equivalent exists for the other eight. A map rather than a list of ids so
 *  the row that shows the field and the call that writes it are the same fact —
 *  a field on a row with no override channel would take a path and quietly drop
 *  it, which is worse than no field. */
const OVERRIDABLE: Partial<Record<ComponentId, (path: string) => Promise<void>>> = {
  claude: (path) => api.setClaudeOverride(path),
};

/** `unavailable` means this machine cannot have the thing — not a Mac, no
 *  webview engine for the platform. Nothing a button here does can change that,
 *  so such a row gets a reason and no controls. `ready` has nothing to repair
 *  either; the panel-wide re-check still covers it. */
function isActionable(status: ComponentStatus): boolean {
  return status !== 'unavailable' && status !== 'ready';
}

const BTN =
  'rounded-lg border border-border bg-raised px-2 py-1 text-xs leading-[18px] text-text transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none disabled:cursor-default disabled:bg-raised disabled:text-muted';

/** Copper, because confirming a path the user typed is this row's primary
 *  action. Dimming is a token swap, never an opacity wash. */
const BTN_PRIMARY =
  'rounded-lg border border-copper bg-copper px-2 py-1 text-xs leading-[18px] text-on-copper transition-colors duration-150 hover:bg-copper/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none';

interface ComponentRowProps {
  report: ComponentReport;
  /** Set aside with "Set up later". Local to this row: dismissing one says
   *  nothing about the other eight and changes nothing on disk. */
  dismissed: boolean;
  busy: boolean;
  /** The last message from an action on THIS row, never another's. */
  note: string | null;
  onRecheck: () => void;
  onSetPath: (path: string) => void;
  onDismiss: () => void;
  onRestore: () => void;
}

function ComponentRow({
  report,
  dismissed,
  busy,
  note,
  onRecheck,
  onSetPath,
  onDismiss,
  onRestore,
}: ComponentRowProps) {
  // The draft lives in the row, so two rows could never share one buffer and
  // an abandoned edit dies with the row rather than lingering in the panel.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // TASK 114. The editor's trigger, and a flag saying this dismissal owes it
  // its focus back. The trigger is unmounted while the editor is open
  // (`!editing` below), so focus cannot be restored in the handler that closes
  // it — the button does not exist yet at that moment. The effect runs after
  // the re-render that brings it back, which is the first instant it can be
  // focused. Without this, closing the editor leaves focus on a removed node
  // and the browser drops it to <body>, stranding a keyboard user above the
  // whole rail.
  const setPathRef = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef(false);
  /** Exactly what the field held when it opened, so "has the user typed
   *  anything?" is answered against the real starting value rather than
   *  against `report.detail`, which a probe landing mid-edit can change. */
  const openedWith = useRef('');

  useEffect(() => {
    if (editing || !returnFocus.current) return;
    returnFocus.current = false;
    setPathRef.current?.focus();
  }, [editing]);

  const closeEditor = () => {
    returnFocus.current = true;
    setEditing(false);
  };

  const status = STATUS[report.status];
  const isReason = report.status === 'unavailable';
  const actionable = isActionable(report.status);
  const fieldId = `diag-path-${report.id}`;
  const hintId = `diag-path-hint-${report.id}`;

  if (dismissed) {
    return (
      <li className="border-b border-border px-3 py-2 last:border-b-0">
        <div className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-sm leading-[21px] text-muted">
            {LABEL[report.id]}
          </span>
          <span className="flex shrink-0 items-baseline gap-1.5 text-muted">
            <span aria-hidden="true" className="font-mono text-xs leading-[18px]">
              ○
            </span>
            <span className="text-xs leading-[18px]">Set up later</span>
          </span>
          <button
            type="button"
            onClick={onRestore}
            aria-label={`Bring ${LABEL[report.id]} back into the list`}
            className={`shrink-0 ${BTN}`}
          >
            Undo
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="border-b border-border px-3 py-3 last:border-b-0">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm leading-[21px] text-text">
          {LABEL[report.id]}
        </span>
        <span className={`flex shrink-0 items-baseline gap-1.5 ${status.tone}`}>
          <span aria-hidden="true" className="font-mono text-xs leading-[18px]">
            {status.glyph}
          </span>
          <span className="text-xs leading-[18px]">{status.label}</span>
        </span>
      </div>

      {/* What the probe found and nothing else: an executable, a directory, an
          endpoint, a version. `Detected` is the weakest reading of that — the
          thing is on this machine — and the helper text below stays inside it.
          The detail is printed verbatim rather than under a "Found at" prefix
          because not every probe resolves a path: check_codex reports a version
          string (doctor.rs:308-321), and a path-shaped caption over a version
          would be a caption that lies. */}
      {report.detail && (
        <p className="pt-1 text-xs leading-[18px] text-muted">
          {report.status === 'detected' && <span>Found: </span>}
          <span className="font-mono break-words">{report.detail}</span>
        </p>
      )}

      {report.error &&
        (isReason ? (
          /* A reason, not a failure: there is no retry that could change it, so
             it is written as prose and no control is offered beside it. */
          <p className="pt-1 text-xs leading-[18px] text-muted">{report.error}</p>
        ) : (
          /* The probe's own words, verbatim, so the message names the path it
             actually tried. */
          <p className="mt-2 flex gap-2 rounded-lg border border-warning px-2 py-1.5 text-xs leading-[18px] text-warning">
            <span aria-hidden="true" className="font-mono">
              !
            </span>
            <span className="min-w-0 font-mono break-words whitespace-pre-wrap">
              {report.error}
            </span>
          </p>
        ))}

      {actionable && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onRecheck}
            disabled={busy}
            aria-busy={busy}
            // The honest name. There is no per-component probe on the Rust side
            // — run_diagnostics is the only diagnostics command (doctor.rs:676)
            // — so this re-runs all nine and the whole panel refreshes with the
            // answer. The button says "again", not "only this one".
            aria-label={`${RECHECK}: re-runs all nine checks and refreshes every row`}
            className={BTN}
          >
            {busy ? 'Checking…' : RECHECK}
          </button>

          {OVERRIDABLE[report.id] && !editing && (
            <button
              ref={setPathRef}
              type="button"
              onClick={() => {
                openedWith.current = report.detail ?? '';
                setDraft(openedWith.current);
                setEditing(true);
              }}
              className={BTN}
            >
              {SET_PATH}
            </button>
          )}

          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Set ${LABEL[report.id]} up later and hide this row`}
            className={BTN}
          >
            Set up later
          </button>
        </div>
      )}

      {editing && (
        <form
          className="pt-2"
          // TASK 114, and the limit on it. Escape dismisses this editor only
          // while it still holds what it opened with; the moment the user has
          // typed a path, Escape does nothing and `Cancel` is the one way to
          // throw the draft away. A path typed by hand is work, and a key
          // pressed next to Tab must not be able to lose it.
          //
          // Scoped to the form rather than to `document`: tab-strip.tsx owns a
          // document-level Escape while one of its panels is open
          // (tab-strip.tsx:179-181), and two global handlers for one key is how
          // an Escape ends up closing the wrong surface. `stopPropagation`
          // keeps this press from also reaching that one.
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || draft !== openedWith.current) return;
            e.stopPropagation();
            closeEditor();
          }}
          onSubmit={(e) => {
            e.preventDefault();
            // Passed through exactly as typed. It crosses to Rust as one
            // argument and is never split, quoted or handed to a shell, which
            // is what makes "/Users/you/Developer Tools/claude" work unaltered.
            // `trim` only decides whether anything was typed at all.
            if (!draft.trim()) return;
            onSetPath(draft);
            // Same focus return as the two dismissals: the submit button is
            // about to be unmounted with the form, and its focus has to land
            // somewhere deliberate.
            closeEditor();
          }}
        >
          <label htmlFor={fieldId} className="block text-sm leading-[21px] text-text">
            Full path to the {LABEL[report.id]} executable
          </label>
          <p id={hintId} className="pt-1 text-xs leading-[18px] text-muted">
            Typed literally, spaces and all — this is a path, not a command line.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <input
              id={fieldId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-describedby={hintId}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              placeholder="/Users/you/Developer Tools/claude"
              className="min-w-0 flex-1 rounded-lg border border-border bg-ground px-2 py-1 font-mono text-xs leading-[18px] text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper"
            />
            <button type="submit" disabled={busy} className={BTN_PRIMARY}>
              Save
            </button>
            <button type="button" onClick={closeEditor} className={BTN}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {note && <p className="pt-2 text-xs leading-[18px] text-muted">{note}</p>}
    </li>
  );
}

interface DiagnosticsPanelProps {
  /** Null while the startup probe is still out. Not an error state — the shell
   *  was already up before this was asked for. */
  diagnostics: Diagnostics | null;
  onRecheck: () => void;
}

/** One row per component, and deliberately no total. There is no aggregate
 *  verdict to show because there is no longer one to compute: a missing Codex
 *  says nothing about Xcode, and nothing here may stand in front of the app.
 *
 *  Every repair a row offers is scoped to that row: a path for the one
 *  component that has an override channel, a re-run whose answer this row is
 *  waiting on, and a dismissal that touches no other component's state. */
export function DiagnosticsPanel({ diagnostics, onRecheck }: DiagnosticsPanelProps) {
  // Local, not part of PanelState: the rail's persisted preferences mirror a
  // Rust struct, and this section is not one of them.
  const [collapsed, setCollapsed] = useState(false);
  // The report a row's own action produced, which is newer than the prop until
  // the app's own re-check lands.
  const [fresh, setFresh] = useState<Diagnostics | null>(null);
  const [seen, setSeen] = useState(diagnostics);
  const [dismissed, setDismissed] = useState(() => new Set<ComponentId>());
  const [busyId, setBusyId] = useState<ComponentId | null>(null);
  const [note, setNote] = useState<{ id: ComponentId; message: string } | null>(null);

  // A new report from the owner supersedes anything a row fetched. Adjusted
  // during render rather than in an effect so no frame ever paints the stale
  // local copy over the fresher prop.
  if (seen !== diagnostics) {
    setSeen(diagnostics);
    setFresh(null);
  }

  const components = (fresh ?? diagnostics)?.components ?? [];

  /** `override` is awaited inside the try so a failed override read lands in
   *  the same place as a failed probe: a line on the row that asked, and no
   *  other row disturbed. */
  async function run(id: ComponentId, override: () => Promise<string | null>) {
    setBusyId(id);
    setNote(null);
    try {
      setFresh(await api.runDiagnostics(await override()));
    } catch {
      setNote({ id, message: 'The checks could not be run just now.' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PanelSection
      title="Diagnostics"
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
      detail={diagnostics ? String(components.length) : undefined}
    >
      <div className="h-full overflow-y-auto">
        {diagnostics === null ? (
          <p className="px-3 py-3 text-xs leading-[18px] text-muted">Running checks…</p>
        ) : components.length === 0 ? (
          <p className="px-3 py-3 text-xs leading-[18px] text-muted">
            No components were reported.
          </p>
        ) : (
          <ul className="border-b border-border">
            {components.map((report) => (
              <ComponentRow
                key={report.id}
                report={report}
                dismissed={dismissed.has(report.id)}
                busy={busyId === report.id}
                note={note?.id === report.id ? note.message : null}
                onRecheck={() =>
                  void run(report.id, () => api.claudeOverride().catch(() => null))
                }
                onSetPath={(path) => {
                  const save = OVERRIDABLE[report.id];
                  // Unreachable from the UI — the field is only rendered for a
                  // row that has a setter — and kept so this can never become
                  // one component's path written into another's override.
                  if (!save) return;
                  void run(report.id, async () => {
                    // Stored first, then probed with the same string, so the
                    // row reports on exactly the path that was saved.
                    await save(path);
                    return path;
                  });
                }}
                onDismiss={() =>
                  setDismissed((d) => {
                    const next = new Set(d);
                    next.add(report.id);
                    return next;
                  })
                }
                onRestore={() =>
                  setDismissed((d) => {
                    const next = new Set(d);
                    next.delete(report.id);
                    return next;
                  })
                }
              />
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 p-3">
          <button
            type="button"
            onClick={onRecheck}
            className="self-start rounded-lg border border-border bg-raised px-3 py-2 text-sm leading-[21px] text-text transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none"
          >
            Re-check everything
          </button>
          <p className="text-xs leading-[18px] text-muted">
            {`The nine checks run as one pass, so a row's ${RECHECK} does the same work as this button and refreshes every row — it is here so a component can be repaired without leaving it.`}
          </p>
        </div>
      </div>
    </PanelSection>
  );
}
