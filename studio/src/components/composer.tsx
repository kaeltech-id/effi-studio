import { useId, useState } from 'react';
import { api } from '../lib/tauri-api';

/**
 * The composer from the Contract mockup (01-build-workbench-v2.png), wired to
 * the terminal the agent is already running in.
 *
 * It sends for real. The agent runs interactively under a PTY, so writing the
 * typed line plus a carriage return into that PTY is exactly what a keystroke
 * in the terminal pane would do -- no new IPC, no parallel transport, no
 * pretend. The one wrapper it calls is lib/tauri-api.ts:87, which this file
 * reads and never changes.
 *
 * What it refuses to draw is as deliberate as what it draws:
 *   - the mockup's model selector is omitted, because the app does not know
 *     which model is behind the agent, and a model name it cannot verify is
 *     a lie rendered in 13px;
 *   - the paperclip renders only when `onAttach` is supplied, because a
 *     control that does nothing when clicked is worse than an absent one.
 */

/** One piece of context riding along with the message. `kind` only picks the
 *  glyph; the label is the caller's own string and is never reworded here. */
export interface ContextChip {
  id: string;
  label: string;
  kind?: 'folder' | 'file';
}

export interface ComposerProps {
  /** The live PTY session, or `null` when no agent is running. `null` is a
   *  disabled send button, never a send that quietly goes nowhere. */
  sessionId: string | null;
  chips: ContextChip[];
  onRemoveChip: (id: string) => void;
  /** Optional on purpose: without it the paperclip is not rendered at all. */
  onAttach?: () => void;
}

const PAPERCLIP =
  'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84' +
  'l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48';
const FOLDER = 'M3 7a2 2 0 0 1 2-2h3.9l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z';
const FILE = 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5';
const CLOSE = 'M6 6l12 12M18 6L6 18';
const ARROW_UP = 'M12 19V5m-7 7 7-7 7 7';

function Icon({ path, size }: { path: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const FOCUS =
  'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-surface focus-visible:outline-none';

export function Composer({ sessionId, chips, onRemoveChip, onAttach }: ComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const helpId = useId();
  const errorId = useId();

  // Derived, not stored: a second useState for "can I send" is a second
  // source of truth that drifts the moment the session ends mid-keystroke.
  const canSend = sessionId !== null && text.trim().length > 0 && !sending;

  /**
   * The honest part. The input is cleared only after the write has actually
   * resolved, so a rejected send leaves the user's words exactly where they
   * typed them and says so out loud -- the recovery is pressing Enter again on
   * text that was never thrown away. The rejection is caught here rather than
   * escaping as an unhandled promise, which would take the whole workbench
   * down through the nearest error boundary over one failed line.
   */
  async function send() {
    if (sessionId === null || text.trim().length === 0 || sending) return;
    setSending(true);
    setFailure(null);
    try {
      await api.ptyWrite(sessionId, `${text}\r`);
      setText('');
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    // The Contract's blue hairline, drawn as a 1px fill behind the surface
    // rather than as a border utility: brand blue measures 3.82:1 on navy and
    // tests/test_studio_guards.py bans it from every stroke-like role. A
    // background layer is the same pixels with none of the accessibility debt.
    <div className="rounded-xl bg-brand-blue p-px">
      <div className="rounded-[11px] bg-surface px-3.5 py-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // isComposing: mid-IME, Enter commits the candidate word and must
            // not also fire the message.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          aria-label="Message the agent"
          aria-describedby={failure ? `${helpId} ${errorId}` : helpId}
          placeholder="What would you like to build next?"
          className={`block w-full resize-none bg-transparent text-[15px] leading-[22px] text-text placeholder:text-muted ${FOCUS}`}
        />

        {failure !== null && (
          <p
            id={errorId}
            role="alert"
            className="mt-2 rounded-lg border border-error px-2.5 py-1.5 text-[12px] leading-[18px] text-error"
          >
            Not sent — your message is still here. {failure}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {onAttach !== undefined && (
            <button
              type="button"
              onClick={onAttach}
              aria-label="Attach a file"
              className={`grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-text motion-reduce:transition-none ${FOCUS}`}
            >
              <Icon path={PAPERCLIP} size={18} />
            </button>
          )}

          {chips.map((chip) => (
            <span
              key={chip.id}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[12px] leading-[18px] text-text"
            >
              <span className="text-muted">
                <Icon path={chip.kind === 'file' ? FILE : FOLDER} size={14} />
              </span>
              {chip.label}
              <button
                type="button"
                onClick={() => onRemoveChip(chip.id)}
                aria-label={`Remove ${chip.label} from context`}
                className={`grid size-4 place-items-center rounded text-muted transition-colors duration-150 hover:text-text motion-reduce:transition-none ${FOCUS}`}
              >
                <Icon path={CLOSE} size={12} />
              </button>
            </span>
          ))}

          <p id={helpId} className="ml-auto text-right text-[11px] leading-[16px] text-muted">
            Enter to send · Shift + Enter for a new line
          </p>

          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            aria-label="Send to the agent"
            className={`grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40 motion-reduce:transition-none ${FOCUS}`}
          >
            <Icon path={ARROW_UP} size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
