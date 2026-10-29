import { useState } from 'react';
import { FLOW_STEPS, type FlowStep } from '../lib/flow';

interface FlowBarProps {
  next: FlowStep | null;
  collapsed: boolean;
  onToggle: () => void;
  /** null disables every step: there is no session to type into. */
  onDispatch: ((text: string) => void) | null;
}

/** Names the six commands literally and types one into the live session on
 *  click. It owns no workflow state and answers no question a command asks. */
export function FlowBar({ next, collapsed, onToggle, onDispatch }: FlowBarProps) {
  const [arg, setArg] = useState('');

  // Only brainstorm takes free-form arguments. Every other step is sent bare,
  // and git is sent bare on purpose so its own confirmations still run.
  const textFor = (s: FlowStep) =>
    s.command === '/ec-brainstorm' && arg.trim() ? `${s.command} ${arg.trim()}` : s.command;

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
        ) : (
          <>
            {/* The next step carries the accent, exactly as the stage rail
                spends it on the current stage. */}
            {FLOW_STEPS.map((s) => (
              <button
                key={s.command}
                type="button"
                disabled={!onDispatch}
                title={s.hint}
                onClick={() => onDispatch?.(textFor(s))}
                className={`shrink-0 px-2 py-1 font-mono text-xs ${
                  s.command === next?.command ? 'text-accent' : 'text-muted'
                }`}
              >
                {s.command}
              </button>
            ))}
          </>
        )}
      </div>

      {!collapsed && (
        <div className="flex items-center gap-2 px-2 pb-2">
          <p className="min-w-0 flex-1 truncate text-xs text-muted">
            {/* Built by the same function that builds the dispatch, so the line
                cannot describe something other than what a click sends. The
                field sits beside six buttons but feeds only one, so the
                coupling has to be visible. */}
            {arg.trim()
              ? `brainstorm will send: ${textFor(FLOW_STEPS[0])}`
              : next
                ? next.hint
                : 'Select a project to run a step'}
          </p>
          <input
            value={arg}
            onChange={(e) => setArg(e.target.value)}
            placeholder="what to brainstorm (optional)"
            aria-label="brainstorm argument"
            disabled={!onDispatch}
            className="w-56 shrink-0 border border-border bg-ground px-2 py-1 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}
