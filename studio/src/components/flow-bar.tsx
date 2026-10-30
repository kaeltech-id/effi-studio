import { useEffect, useState } from 'react';
import { FLOW_STEPS, type FlowStep } from '../lib/flow';

/** The one session a click may reach. `sessionId` is what a dispatch is
 *  addressed to — never "whatever is current" — and `providerName` is the
 *  registry's own display name for the provider behind it (agents.rs
 *  `Agent::name`). The name is there to be SAID, and decides nothing. */
export interface FlowTarget {
  sessionId: string;
  providerName: string;
}

/** Why there is no target, answered by the host from the DECLARED capability of
 *  the active surface's provider (`Capabilities::workflow_adapter`, read
 *  through `Agent::can`, agents.rs:128-132) and from what diagnostics actually
 *  found on disk. Never from a provider id, never from a display name: a
 *  user-defined CLI called `codex-ish` must not switch a flow on, and the
 *  built-in `codex` declares nothing because no adapter for it exists here. */
export type FlowAway =
  /** The active surface's provider declares no workflow adapter — or there is
   *  no provider behind it at all, as for a shell or a browser tab. */
  | { reason: 'noAdapter' }
  /** The adapter is declared, but `check_commands` (doctor.rs:325-354) did not
   *  report the eight `/ec-*` files ready, so the commands these buttons name
   *  do not exist on this machine. A provider name is not a toolkit. */
  | { reason: 'noToolkit'; providerName: string }
  /** A capable session exists, in a surface that is not the active one. */
  | { reason: 'elsewhere'; sessionId: string; providerName: string }
  /** A capable provider, with its toolkit, and no session open yet. */
  | { reason: 'noSession'; providerName: string };

interface FlowBarProps {
  next: FlowStep | null;
  collapsed: boolean;
  onToggle: () => void;
  /** Non-null only when a click would land in a session that can really run
   *  these commands. Null renders no command buttons at all: there is nothing
   *  to grey out, because a step with no destination is not a step that
   *  exists, and a dimmed `/ec-execute` would promise a parity this tree does
   *  not have. */
  target: FlowTarget | null;
  /** Read only when `target` is null — the host passes null beside a target. */
  away: FlowAway | null;
  /** Addressed, never ambient. The id comes from `target`, so a click cannot
   *  land in a browser tab, a shell, or a provider that declares no adapter:
   *  with no target there is no button to click and no id to send to. */
  onDispatch: (sessionId: string, text: string) => void;
  /** Focuses the surface holding a session. Navigation only — it sends
   *  nothing, so the next click is made with the real target in front of the
   *  user. */
  onFocus: (sessionId: string) => void;
  /** Opens a session for a capable provider, and stops there. */
  onOpen: () => void;
}

/** The same sentence agent-session-pane.tsx shows in its header, for the same
 *  fact, so the two surfaces cannot word it differently. One line, not a
 *  banner: the row below it is the point of the pane. */
const NO_ADAPTER = 'Workflow shortcuts are not configured for this agent.';

/** Names the six commands literally and types one into a NAMED session on
 *  click. It owns no workflow state and answers no question a command asks. */
export function FlowBar({
  next,
  collapsed,
  onToggle,
  target,
  away,
  onDispatch,
  onFocus,
  onOpen,
}: FlowBarProps) {
  const [arg, setArg] = useState('');

  // Only brainstorm takes free-form arguments. Every other step is sent bare,
  // and git is sent bare on purpose so its own confirmations still run.
  const textFor = (s: FlowStep) =>
    s.command === '/ec-brainstorm' && arg.trim() ? `${s.command} ${arg.trim()}` : s.command;

  const showArg = target !== null && next?.command === '/ec-brainstorm';

  // The only effect in this file, and it sends nothing: an argument the user
  // can no longer see must never ride along on a later click, or the line
  // below would describe less than what is dispatched. Nothing here opens a
  // session, focuses a surface or types a command because the stage or the
  // project changed — the stage is a recommendation read from the plan file
  // (flow.ts:30), not a trigger.
  useEffect(() => {
    if (!showArg) setArg('');
  }, [showArg]);

  // Both branches are built by textFor, the same function the click sends, so
  // the line cannot describe something other than what a click sends. The
  // destination is read off the target row, which is why — with Claude Code as
  // the target — this reads `Sends /ec-execute to Claude Code` and the
  // navigation button below reads `Open Claude Code` without either name being
  // written here: whichever provider declares the adapter is named by its own
  // registry row.
  const line = target
    ? next
      ? `Sends ${textFor(next)} to ${target.providerName}`
      : `Sends each command to ${target.providerName}`
    : awayLine(away);

  // Navigation, offered only where it leads somewhere real. Neither branch
  // dispatches: the user arrives at the target and clicks a command there.
  const cta =
    target || !away
      ? null
      : away.reason === 'elsewhere'
        ? { label: `Open ${away.providerName}`, onClick: () => onFocus(away.sessionId) }
        : away.reason === 'noSession'
          ? { label: `Open a ${away.providerName} session`, onClick: onOpen }
          : null;

  return (
    <div className="shrink-0 border-b border-border">
      {/* Wraps instead of clipping: at the default 1180px window the main pane
          is about 602px and the six names alone need most of it, so a fixed
          height would put the last button out of reach. */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label="flow bar"
          className="w-4 shrink-0 font-mono text-xs text-muted"
        >
          {collapsed ? '▸' : '▾'}
        </button>

        {collapsed ? (
          <span className="font-mono text-xs text-muted">
            {next ? `next ${next.command}` : 'flow'}
          </span>
        ) : target ? (
          <>
            {/* The next step carries the accent, exactly as the stage rail
                spends it on the current stage. */}
            {FLOW_STEPS.map((s) => (
              <button
                key={s.command}
                type="button"
                title={s.hint}
                onClick={() => onDispatch(target.sessionId, textFor(s))}
                className={`shrink-0 rounded-lg px-2 py-1 font-mono text-xs transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${
                  s.command === next?.command ? 'text-accent' : 'text-muted'
                }`}
              >
                {s.command}
              </button>
            ))}
          </>
        ) : (
          // No target: one line saying so, and at most one way out of it. The
          // six commands are not rendered in any form here — not renamed, not
          // dimmed, not replaced by near-misses of themselves.
          <>
            <p className="min-w-0 flex-1 truncate text-xs leading-[18px] text-muted">{line}</p>
            {cta && (
              <button
                type="button"
                onClick={cta.onClick}
                className="shrink-0 rounded-lg bg-accent px-2 py-1 text-xs leading-[18px] font-semibold text-on-accent transition-colors duration-150 hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                {cta.label}
              </button>
            )}
          </>
        )}
      </div>

      {!collapsed && target && (
        <div className="flex items-center gap-2 px-2 pb-2">
          <p className="min-w-0 flex-1 truncate text-xs leading-[18px] text-muted">{line}</p>
          {/* Beside six buttons but feeding only one, so it appears only while
              brainstorm is the step being recommended and the line above is
              already reading its text back. */}
          {showArg && (
            <input
              value={arg}
              onChange={(e) => setArg(e.target.value)}
              placeholder="what to brainstorm (optional)"
              aria-label="brainstorm argument"
              className="w-56 shrink-0 rounded-lg border border-border bg-ground px-2 py-1 font-mono text-xs text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          )}
        </div>
      )}
    </div>
  );
}

/** One sentence per reason, each naming the thing that is actually missing. */
function awayLine(away: FlowAway | null): string {
  if (!away) return NO_ADAPTER;
  switch (away.reason) {
    case 'noToolkit':
      return `${away.providerName} is here, but the /ec-* commands are not installed — run the installer in Settings.`;
    case 'elsewhere':
      return `${away.providerName} is running in another surface.`;
    case 'noSession':
      return `No ${away.providerName} session is open yet.`;
    case 'noAdapter':
      return NO_ADAPTER;
  }
}
