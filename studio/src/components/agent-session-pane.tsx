import { TerminalPane } from './terminal-pane';

/** Mirrors the Rust `Capabilities` struct (agents.rs), field for field and in
 *  its camelCase serialisation, so an agent row from the backend satisfies this
 *  prop unchanged once the frontend wrapper for the `agents` command lands.
 *
 *  Declared, never derived: the only thing that may switch a workflow surface
 *  on is the provider saying it has an adapter. Neither the id nor the display
 *  name is evidence — a user-defined CLI can be called anything, and this file
 *  deliberately contains no provider id to compare against. */
export interface AgentCapabilities {
  workflowAdapter: boolean;
  resumeSession: boolean;
  slashCommands: boolean;
}

interface AgentSessionPaneProps {
  /** Forwarded verbatim to TerminalPane, which owns the whole PTY lifecycle:
   *  the subscribe-before-start ordering, the 0x0 guard, the fit and the
   *  StrictMode disposal. Nothing in this wrapper touches any of it. */
  sessionId: string;
  cwd: string;
  agentId: string | null;
  focusNonce?: number;
  /** The provider's display name, as the registry gives it. Used to name the
   *  session, never to decide what it can do. */
  agentName: string;
  capabilities: AgentCapabilities;
}

/** The provider's own words for what this surface is, used in both branches:
 *  a session exists and runs a CLI. It is the only state this app can honestly
 *  report — nothing here can observe whether a REPL is at its prompt, so there
 *  is no readiness dot, no busy spinner and no progress of any kind. */
const SESSION_LABEL = 'CLI session';

/** A terminal session with a compact header naming its provider.
 *
 *  The header is the whole of this component's job. A provider that declares a
 *  workflow adapter is named outright, because the five-stage flow really does
 *  reach it; a provider that declares none is labelled a CLI session and gets
 *  one muted line saying so. One line, not a banner: the terminal is the point
 *  of the pane, and a block of explanation would be paid for out of its rows.
 *
 *  Missing the adapter restricts nothing else. The terminal below is the same
 *  component in both branches, fully interactive, with no overlay, no disabled
 *  input and no intercepted keys — a generic prompt is typed into an
 *  adapterless session exactly as it is into any other. */
export function AgentSessionPane({
  sessionId,
  cwd,
  agentId,
  focusNonce,
  agentName,
  capabilities,
}: AgentSessionPaneProps) {
  const hasWorkflowAdapter = capabilities.workflowAdapter;
  const headingId = `agent-session-heading-${sessionId}`;

  return (
    // min-h-0 on the column and flex-1 on the terminal's box is what keeps the
    // header from eating the terminal: the header is the only shrink-0 row, so
    // it takes its own height once and the terminal takes every remaining
    // pixel of the pane rather than a fixed share of it. The terminal's own
    // ResizeObserver then refits to that height, so the PTY learns its real
    // size without this file measuring anything.
    <section
      aria-labelledby={headingId}
      className="flex h-full w-full min-w-0 min-h-0 flex-col"
    >
      <header className="shrink-0 border-b border-border bg-surface">
        <div className="flex h-9 items-center gap-2 px-3">
          <PromptIcon />

          <h2
            id={headingId}
            className="min-w-0 truncate text-sm leading-[20px] font-semibold text-text"
          >
            {agentName}
          </h2>

          {hasWorkflowAdapter ? (
            // Named provider on the left, the session kind as right-hand meta.
            <span className="ml-auto shrink-0 text-xs leading-[18px] text-muted">
              {SESSION_LABEL}
            </span>
          ) : (
            // No adapter: the session kind IS the label, so it sits with the
            // name rather than away at the edge, and the name claims nothing
            // beyond identifying which binary is running.
            <span className="min-w-0 truncate text-xs leading-[18px] text-muted">
              <span aria-hidden="true">· </span>
              {SESSION_LABEL}
            </span>
          )}
        </div>

        {!hasWorkflowAdapter && (
          <p className="flex items-center gap-2 px-3 pb-2 text-xs leading-[18px] text-muted">
            <InfoIcon />
            <span className="min-w-0">
              Workflow shortcuts are not configured for this agent.
            </span>
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1">
        <TerminalPane
          sessionId={sessionId}
          cwd={cwd}
          agentId={agentId}
          focusNonce={focusNonce}
        />
      </div>
    </section>
  );
}

/** currentColor throughout, so both glyphs take the token colour of the text
 *  beside them and no colour is chosen here. */
function PromptIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5 6.5 8 4 11" />
      <path d="M8.5 11.25H12" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.5V11" />
      <path d="M8 5h.01" />
    </svg>
  );
}
