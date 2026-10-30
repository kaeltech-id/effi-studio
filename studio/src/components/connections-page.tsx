import { useState } from 'react';
import type { Connection, ConnectionStatus, Consumer } from '../lib/types';

// ---------------------------------------------------------------------------
// The Connections surface.
//
// connections.rs:1-33 states the two rules this screen renders, and neither is
// re-decided here:
//
// 1. A connection has no status. It has one status PER CONSUMER, each produced
//    by that consumer's own adapter. `Connection.consumers` is a
//    `Record<Consumer, ConnectionStatus>` with all three keys always present,
//    so this file never collapses them into one word — not in the detail
//    matrix, and not in the compact marks on a list row either.
// 2. A catalogue entry is not a capability. `planned` connectors render as
//    static rows with NO control on them: not a disabled button that an
//    attribute could re-enable, no row click, no chevron promising a
//    destination.
//
// `connected` means A CHECK PASSED. The backend keeps that honest structurally
// (`last_check` and `checking` are `#[serde(skip)]`, so health never survives a
// restart to be read back as a claim), and this file keeps it honest by never
// deriving a status: every status word on screen comes from a cell the backend
// sent.
//
// NO CREDENTIAL IS RENDERED HERE, including in the error region and including
// in the change preview. The form collects the two keychain COORDINATES —
// service and account — because `CredentialRef` has nowhere to put a value
// (connections.rs:285-302); the secret itself goes to the keychain and never
// through this component's state, its props or its DOM.
//
// 3. TASK 104 — NOTHING REACHES ANOTHER TOOL'S CONFIG UNSEEN. The explicit
//    Connect is gated behind a review that names the destination, the scope and
//    the change, and is applied by a button the user presses. Every line of the
//    review body is a pair from `connection_preview` (lib.rs:447-454, which is
//    `safe_summary` and nothing else), rendered verbatim. None of it is
//    composed here, for the reason types.ts:145-149 already records for
//    `SetupItem.effects`: a review screen that describes something other than
//    what executes is worse than none. Cancel calls nothing.
//
// 4. TASK 105 — DISCONNECT AND REVOKE ARE TWO ACTS. They do not share a button,
//    a label, a place on the page or a confirmation. Disconnect unbinds the
//    tools and leaves the token in the keychain (connections.rs:896-903).
//    Revoke deletes the token itself, is not scoped to one project, and says so
//    before it runs (lib.rs:649-666).
//
// Connections is skippable. Nothing on this page is an onboarding prerequisite
// and nothing here gates another surface.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Props
//
// This page performs no I/O. The Tauri commands behind Connections are a
// sibling task and `src/lib/tauri-api.ts` has no wrappers for them yet, so
// rather than invent wrapper names this component takes its data and its
// callbacks as props. The parent maps them to the commands when those land.
// ---------------------------------------------------------------------------

type ConnectorId = Connection['connector'];
type ScopeValue = Connection['scope'];

/** Where a secret lives, never what it is. Mirrors `CredentialRef`
 *  (connections.rs:296-302), including its lack of a third field. */
export interface CredentialCoordinates {
  service: string;
  account: string;
  kind: 'apiToken';
}

/** The parts of a stored `ConnectionRecord` this screen displays. Every field
 *  is something the user typed and is shown back to them; none is a secret. */
export interface ConnectionDetail {
  label: string;
  /** A site URL or MCP server address, as the user typed it. */
  endpoint: string | null;
  /** Free text, because this binary has verified no transport and an enum here
   *  would read as a support claim (connections.rs:535-544). */
  transport: string | null;
  credential: CredentialCoordinates | null;
  /** The explicit Connect was pressed. Not a health claim. */
  connectRequested: boolean;
}

/** What the configure form may send. Mirrors `ConfigureRequest`
 *  (connections.rs:647-660) — and like it, has no field for a secret value. */
export interface ConfigureDraft {
  connector: ConnectorId;
  label: string;
  endpoint: string | null;
  transport: string | null;
  credential: CredentialCoordinates | null;
  scope: ScopeValue;
}

/** One label/value pair exactly as `connection_preview` produced it
 *  (lib.rs:447-454 → `connections::safe_summary`, connections.rs:1142-1176).
 *
 *  Read-only on purpose: these two strings are rendered character for
 *  character and are never reformatted, truncated or re-worded on the way to
 *  the screen. The pair is safe by construction rather than by redaction —
 *  the only credential fact `safe_summary` can reach is the `(account,
 *  service)` coordinate pair, because `CredentialRef` has no third field. */
export type PreviewLine = readonly [label: string, value: string];

export interface ConnectionsPageProps {
  /** The project a non-global connection binds to. */
  projectId: string;
  /** Its display name, for the breadcrumb and the scope wording. */
  projectName: string;
  /** Catalogue rows plus configured connections, in backend order
   *  (`connections()` at connections.rs:1056). */
  connections: Connection[];
  /** Keyed by `Connection.id`. A catalogue row has no detail yet. */
  details: Record<string, ConnectionDetail | undefined>;
  /** TASK 104. Keyed by `Connection.id`: what `connection_preview` answered for
   *  that row. `undefined` means not fetched yet, and Apply stays off the
   *  screen until the pairs are actually in hand — an Apply offered over a
   *  preview that has not arrived is an Apply over nothing.
   *
   *  Optional alongside `onRequestPreview`, and the two travel together: see
   *  the note on that prop for what the page does when neither is wired. */
  previews?: Record<string, readonly PreviewLine[] | undefined>;
  onConfigure: (draft: ConfigureDraft) => void;
  onScopeChange: (connectionId: string, scope: ScopeValue) => void;
  /** TASK 104. Ask the host for `connection_preview({ id })`. A read: it must
   *  change nothing, which is what lets Cancel be free.
   *
   *  OPTIONAL, AND THE FAILURE IS IN THE SAFE DIRECTION. `src/lib/tauri-api.ts`
   *  has no wrapper for `connection_preview` yet and is another task's file, so
   *  a host may mount this page without it. When it is absent the page cannot
   *  show what would be written — so it does not write: the Connect action is
   *  WITHHELD and the reason is stated, rather than Connect quietly proceeding
   *  unpreviewed. Wiring this prop is what turns the action back on. */
  onRequestPreview?: (connectionId: string) => void;
  onConnect: (connectionId: string) => void;
  onCheck: (connectionId: string, consumer: Consumer) => void;
  /** TASK 105, the binding half. `disconnect_connection` (lib.rs:583-586):
   *  drops the bindings, KEEPS the credential. */
  onDisconnect: (connectionId: string) => void;
  /** TASK 105, the global half. `revoke_connection_credential`
   *  (lib.rs:656-666): deletes the keychain item, keeps the connection. Not
   *  scoped to one project.
   *
   *  Optional for the same reason as `onRequestPreview`, and withheld the same
   *  way: with no handler there is no Revoke control at all. A disabled button
   *  would be a promise an attribute could cash, which is the rule this page
   *  already keeps for planned connectors. */
  onRevokeCredential?: (connectionId: string) => void;
  /** Verbatim backend failure text. Cannot contain a credential: no function
   *  upstream of it holds one. */
  error?: string | null;
  /** Verbatim text from a refused or failed `connection_preview`. Shown inside
   *  the review panel rather than at the top, so a preview that could not be
   *  read never reads as a failure of the thing being previewed. */
  previewError?: string | null;
  /** Verbatim text from a refused or failed revoke, shown beside the revoke
   *  control and nowhere else.
   *
   *  Rendered as the backend wrote it and with no sentence added. lib.rs
   *  deletes the keychain item BEFORE anything reaches studio.json and aborts
   *  if the delete is not confirmed (lib.rs:598-616), so a revoke that fails
   *  genuinely changed nothing — and `forget_credential` already says exactly
   *  that, in those words. A UI that wrapped it in "something went wrong" would
   *  turn a safe, repeatable no-op into an unknown. */
  revokeError?: string | null;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Iteration order for the matrix, matching `CONSUMERS` (connections.rs:151). */
const CONSUMERS: readonly Consumer[] = ['effi', 'claude', 'codex'];

const CONSUMER_NAMES: Record<Consumer, string> = {
  effi: 'Effi Studio',
  claude: 'Claude Code',
  codex: 'Codex',
};

/** For the compact marks on a list row, where the full name will not fit. */
const CONSUMER_SHORT: Record<Consumer, string> = {
  effi: 'Effi',
  claude: 'Claude',
  codex: 'Codex',
};

/** Every status carries a glyph AND a word, so colour is never the signal.
 *
 *  `tone` is a token class. Accent is the primary action and appears on no
 *  status; mint means healthy and appears on exactly one. `unsupportedByAgent`
 *  is muted, NOT the error token — nothing failed. */
interface StatusFace {
  glyph: string;
  word: string;
  tone: string;
}

const STATUS_FACE: Record<ConnectionStatus, StatusFace> = {
  notConfigured: { glyph: '○', word: 'Not configured', tone: 'text-muted' },
  configured: { glyph: '◐', word: 'Configured', tone: 'text-text' },
  checking: { glyph: '◌', word: 'Checking…', tone: 'text-muted' },
  connected: { glyph: '✓', word: 'Connected', tone: 'text-success' },
  needsAuthentication: { glyph: '!', word: 'Needs authentication', tone: 'text-warning' },
  failed: { glyph: '✕', word: 'Check failed', tone: 'text-error' },
  disabled: { glyph: '–', word: 'Off', tone: 'text-muted' },
  // "nothing has failed, there is simply nothing to ask yet"
  // (connections.rs:868-880), worded the same way and offered no retry.
  unsupportedByAgent: { glyph: '—', word: 'Not supported yet', tone: 'text-muted' },
};

/** The one place a status gets a sentence. `unsupportedByAgent` and `disabled`
 *  are not errors and are not written as ones. */
const STATUS_NOTE: Record<ConnectionStatus, string> = {
  notConfigured: 'No credential has been recorded for this connection yet.',
  configured: 'The form is filled. Nothing has been asked of this consumer yet.',
  checking: 'A check is in flight for this consumer.',
  connected: 'This consumer’s own check passed.',
  needsAuthentication: 'This consumer reached the server and was not accepted.',
  failed: 'This consumer’s check did not pass.',
  disabled: 'Turned off for this consumer. A choice, not an error.',
  unsupportedByAgent:
    'No adapter for this consumer exists in this build — nothing has failed, there is simply nothing to ask yet.',
};

const CONNECTOR_NAMES: Record<ConnectorId, string> = {
  jira: 'Jira',
  customMcp: 'Custom MCP',
  github: 'GitHub',
  figma: 'Figma',
};

/** What the configure form asks this connector for. Mirrors `CATALOGUE`
 *  (connections.rs:356-389): empty means "nothing to ask for yet", never
 *  "no auth". */
const CONNECTOR_FORM: Record<
  ConnectorId,
  { needsEndpoint: boolean; credentialKindLabel: string | null; endpointLabel: string; placeholder: string }
> = {
  jira: {
    needsEndpoint: true,
    credentialKindLabel: 'API token',
    endpointLabel: 'Workspace URL',
    placeholder: 'https://your-team.atlassian.net',
  },
  customMcp: {
    needsEndpoint: true,
    credentialKindLabel: 'API token',
    endpointLabel: 'Server address',
    placeholder: 'the address your server listens on',
  },
  github: { needsEndpoint: false, credentialKindLabel: null, endpointLabel: '', placeholder: '' },
  figma: { needsEndpoint: false, credentialKindLabel: null, endpointLabel: '', placeholder: '' },
};

// ---------------------------------------------------------------------------
// Marks. Outline strokes at the house weight, inline so `currentColor` keeps
// each one on the token its container already set.
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
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const STACKED_DIAMONDS = 'M12 3l4.5 4.5L12 12 7.5 7.5 12 3z M12 12l4.5 4.5L12 21l-4.5-4.5L12 12z';
const FORK =
  'M7 4.5a2 2 0 110 4 2 2 0 010-4z M17 4.5a2 2 0 110 4 2 2 0 010-4z M12 15.5a2 2 0 110 4 2 2 0 010-4z M7 8.5v2a2 2 0 002 2h6a2 2 0 002-2v-2 M12 12.5v3';
const PANELS = 'M5 4.5h6v5H5z M13 4.5h6v5h-6z M5 11.5h6v5H5z M13 11.5h6v5h-6z M9 18.5h6';
const LAYERS = 'M12 4l8 4-8 4-8-4 8-4z M4 12l8 4 8-4 M4 16l8 4 8-4';
const CHEVRON_RIGHT = 'M9 6l6 6-6 6';
const CHEVRON_DOWN = 'M6 9l6 6 6-6';
const ARROW_RIGHT = 'M5 12h13 M13 7l5 5-5 5';
const INFO = 'M12 3a9 9 0 110 18 9 9 0 010-18z M12 11v5 M12 8h.01';
const ALERT = 'M12 4.5L20.5 19h-17L12 4.5z M12 10v4 M12 16.5h.01';

const CONNECTOR_MARKS: Record<ConnectorId, string> = {
  jira: STACKED_DIAMONDS,
  customMcp: LAYERS,
  github: FORK,
  figma: PANELS,
};

// ---------------------------------------------------------------------------
// Shared classes
// ---------------------------------------------------------------------------

/* An outline rather than a ring, matching the house pattern: `outline-none` is
   deliberately absent, because in Tailwind v4 it sets `outline-style: none` and
   would cancel the very ring these three utilities draw. */
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
/* The same ring on the error token, for the one control that must not wear
   accent. `outline-none` is absent here for the same reason it is absent
   above. */
const FOCUS_ERROR =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error';
const MOTION = 'transition-colors duration-150 motion-reduce:transition-none';

const PRIMARY_BUTTON = `flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm leading-[20px] font-semibold text-on-accent hover:bg-accent/90 ${MOTION} ${FOCUS}`;
const SECONDARY_BUTTON = `rounded-lg border border-border px-4 py-2.5 text-sm leading-[20px] text-muted hover:bg-hover hover:text-text ${MOTION} ${FOCUS}`;
const SMALL_BUTTON = `rounded-lg border border-border px-3 py-1.5 text-xs leading-[18px] text-muted hover:bg-hover hover:text-text ${MOTION} ${FOCUS}`;
const FIELD = `w-full rounded-lg border border-border bg-ground px-3 py-2 text-sm leading-[21px] text-text placeholder:text-muted ${MOTION} ${FOCUS}`;
const FIELD_LABEL = 'block pb-2 text-sm leading-[20px] font-semibold text-text';
const META = 'text-xs leading-[18px] text-muted';

/* TASK 105. Revoke is the only destructive act on this page, and it is
   deliberately NOT accent: accent is the primary affordance, the thing the eye
   is meant to land on, and deleting a token out of the keychain is not it. The
   resting control is an ordinary secondary button; only the confirmation — the
   moment the consequence is stated — carries the error token. */
const DESTRUCTIVE_BUTTON = `rounded-lg border border-error px-4 py-2.5 text-sm leading-[20px] font-semibold text-error hover:bg-error hover:text-ground ${MOTION} ${FOCUS_ERROR}`;

// ---------------------------------------------------------------------------
// The flow: configure → inspect scope → explicit connect → check
//
// Four named places, derived from what the backend stored and nothing else. A
// filled field is never `connect`, and `connect` is never `connected`: the
// furthest this component can move a row is to ask for a check.
// ---------------------------------------------------------------------------

type Phase = 'configure' | 'inspectScope' | 'connect' | 'checking';

function phaseOf(row: Connection, detail: ConnectionDetail | undefined, scopeReviewed: boolean): Phase {
  const wantsCredential = CONNECTOR_FORM[row.connector].credentialKindLabel !== null;
  if (wantsCredential && !detail?.credential) return 'configure';
  if (!detail) return 'configure';
  if (!scopeReviewed) return 'inspectScope';
  if (!detail.connectRequested) return 'connect';
  return 'checking';
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: ConnectionStatus }) {
  const face = STATUS_FACE[status];
  return (
    <span className={`inline-flex items-center gap-2 text-sm leading-[21px] ${face.tone}`}>
      <span aria-hidden="true" className="font-mono text-xs leading-[18px]">
        {face.glyph}
      </span>
      {face.word}
    </span>
  );
}

/** The three facts, compactly, on a list row.
 *
 *  Three marks rather than one word, because there is no one word: a row whose
 *  Effi cell passed and whose Codex cell was never asked has two different
 *  answers, and "Connected" over both of them is the conflation the backend's
 *  whole shape exists to prevent. Each mark names its consumer in text, and the
 *  screen reader gets the pair spelled out. */
function ConsumerMarks({ consumers }: { consumers: Record<Consumer, ConnectionStatus> }) {
  return (
    <span className="flex flex-wrap items-center gap-3">
      {CONSUMERS.map((consumer) => {
        const face = STATUS_FACE[consumers[consumer]];
        return (
          <span key={consumer} className={`inline-flex items-center gap-1 ${META} ${face.tone}`}>
            <span aria-hidden="true" className="font-mono">
              {face.glyph}
            </span>
            <span aria-hidden="true">{CONSUMER_SHORT[consumer]}</span>
            <span className="sr-only">
              {CONSUMER_NAMES[consumer]}: {face.word}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function ConnectorTile({ connector, planned }: { connector: ConnectorId; planned: boolean }) {
  // Dashed and muted for a planned connector — the same inert framing the tool
  // menu uses, carrying the meaning that dimming would otherwise have to.
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
        planned ? 'border-dashed border-muted text-muted' : 'border-border bg-raised text-text'
      }`}
    >
      <Icon path={CONNECTOR_MARKS[connector]} size={18} />
    </span>
  );
}

function scopeWord(scope: ScopeValue, projectName: string): string {
  if (scope.global) return 'Every project';
  if (scope.projectIds.length === 0) return 'No projects yet';
  if (scope.projectIds.length === 1) return projectName;
  return `${scope.projectIds.length} projects`;
}

interface RowProps {
  row: Connection;
  detail: ConnectionDetail | undefined;
  projectName: string;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** A configurable connector. The whole row is one native button. */
function ConnectorRow({ row, detail, projectName, selected, onSelect }: RowProps) {
  const name = CONNECTOR_NAMES[row.connector];
  const where = detail?.credential?.account ?? detail?.endpoint ?? 'No server yet';
  const transport = detail?.transport ?? 'Transport not specified';

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(row.id)}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left ${MOTION} ${FOCUS} ${
          selected
            ? 'border-accent bg-accent-tint'
            : 'border-border bg-raised hover:border-muted hover:bg-hover'
        }`}
      >
        <ConnectorTile connector={row.connector} planned={false} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm leading-[21px] font-semibold text-text">
            {detail?.label ?? name}
          </span>
          <span className={`truncate ${META}`}>
            {where} · {transport}
          </span>
          <span className={`truncate ${META}`}>Scope: {scopeWord(row.scope, projectName)}</span>
          <ConsumerMarks consumers={row.consumers} />
        </span>
        <span aria-hidden="true" className="shrink-0 pt-1 text-muted">
          <Icon path={CHEVRON_RIGHT} size={16} />
        </span>
      </button>
    </li>
  );
}

/** A planned connector: a catalogue entry, and nothing else.
 *
 *  TASK 103. There is no `<button>` in this subtree, no click handler, no
 *  chevron and no disabled control — a disabled button is a promise an
 *  attribute could cash, and `configure()` refuses these connectors outright
 *  (connections.rs:675-683), so there is nothing behind one. Nothing is dimmed
 *  to say it is inert: `text-muted` on `bg-raised` stays well above 4.5:1, and
 *  the dashed frame plus `cursor-not-allowed` carry the meaning instead. */
function PlannedRow({ row }: { row: Connection }) {
  const name = CONNECTOR_NAMES[row.connector];
  return (
    <li className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-dashed border-border bg-surface p-4">
      <ConnectorTile connector={row.connector} planned />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm leading-[21px] text-muted">{name}</span>
        <span className={META}>No adapter exists in this build, so there is nothing to configure.</span>
      </span>
      <span
        className={`shrink-0 rounded-lg border border-dashed border-muted px-2 py-1 ${META}`}
      >
        Planned
      </span>
    </li>
  );
}

/** TASK 102 — the consumer matrix.
 *
 *  A real `<table>`: `<th scope="col">` over each column and `<th scope="row">`
 *  on each consumer, so a screen reader reads a cell against its row and its
 *  column rather than as a loose word. No `aria-live` — nothing here announces
 *  itself.
 *
 *  Each cell is that adapter's own answer. `Connected to Effi` and
 *  `Available to Codex` are two rows, never one verdict, and no cell is
 *  computed from a neighbour.
 *
 *  HONEST EMPTINESS. `installed_adapters()` is empty in this build, so today
 *  every cell reads `unsupportedByAgent`. A grid of three identical dashes
 *  reads as broken, so when — and only when — no consumer has an adapter, the
 *  per-row sentences collapse into one statement under the table and the Action
 *  column is not drawn at all. An empty column of dashes would imply actions
 *  were withheld; no column says there is nothing to do. The table itself stays
 *  because the three consumers are still three separate facts, and this is what
 *  all three honestly say. */
function ConsumerMatrix({
  connectionId,
  consumers,
  onCheck,
}: {
  connectionId: string;
  consumers: Record<Consumer, ConnectionStatus>;
  onCheck: (connectionId: string, consumer: Consumer) => void;
}) {
  const statuses = CONSUMERS.map((consumer) => consumers[consumer]);
  const nothingToAsk = statuses.every((status) => status === 'unsupportedByAgent');
  // A consumer with no adapter is offered no retry, because there is nothing to
  // retry (connections.rs:770-782 refuses `begin_check` for one).
  const actionable = (status: ConnectionStatus) =>
    status !== 'unsupportedByAgent' && status !== 'notConfigured' && status !== 'checking';
  const anyActionable = statuses.some(actionable);

  return (
    <div className="rounded-xl border border-border bg-raised">
      <table className="w-full border-collapse text-left">
        <caption className="px-4 pt-4 pb-3 text-left">
          <span className="block text-sm leading-[20px] font-semibold text-text">Available to</span>
          <span className={`block pt-1 ${META}`}>
            One status per tool, each from that tool’s own check. Connected to Effi Studio says
            nothing about Codex.
          </span>
        </caption>
        <thead>
          <tr className="border-t border-border">
            <th scope="col" className={`px-4 py-2 font-normal ${META}`}>
              Tool
            </th>
            <th scope="col" className={`px-4 py-2 font-normal ${META}`}>
              Status
            </th>
            {anyActionable && (
              <th scope="col" className={`px-4 py-2 text-right font-normal ${META}`}>
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {CONSUMERS.map((consumer) => {
            const status = consumers[consumer];
            return (
              <tr key={consumer} className="border-t border-border align-middle">
                <th
                  scope="row"
                  className="px-4 py-3 text-sm leading-[21px] font-normal text-text"
                >
                  {CONSUMER_NAMES[consumer]}
                </th>
                <td className="px-4 py-3">
                  <StatusPill status={status} />
                  {!nothingToAsk && (
                    <span className={`block pt-1 ${META}`}>{STATUS_NOTE[status]}</span>
                  )}
                </td>
                {anyActionable && (
                  <td className="px-4 py-3 text-right">
                    {actionable(status) ? (
                      <button
                        type="button"
                        onClick={() => onCheck(connectionId, consumer)}
                        className={SMALL_BUTTON}
                      >
                        Check {CONSUMER_SHORT[consumer]}
                      </button>
                    ) : (
                      <span className={META}>No action</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {nothingToAsk && (
        <p
          className={`m-4 border-l-2 border-dashed border-border py-1 pl-3 ${META}`}
        >
          No connection adapter has shipped yet, so none of the three has been asked anything.
          Nothing has failed — there is simply nothing to ask yet.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TASK 104 — the change preview
//
// "Binding Claude Code or Codex means writing their configuration files", and
// DESIGN-SPEC.md:129 (quoted at connections.rs:55-63) says that needs a change
// preview, a stated scope and an explicit Apply. This is that gate, and it sits
// in front of the explicit Connect — the step that authorises this connection
// to be used by a tool. It does not add a fifth phase: step 4 of
// `configure → inspectScope → connect → check` now has a review inside it.
//
// WHAT IS SHOWN, AND WHO WROTE IT:
//   * the DESTINATION, one row per consumer, decided by the status the backend
//     sent for that consumer and nothing else;
//   * the SCOPE, from `row.scope`, which is the backend's own record;
//   * the CHANGE, named exactly: `request_connect` sets one field
//     (connections.rs:759-766) and edits none of the values below it;
//   * the RECORD, as `connection_preview` printed it — every pair verbatim.
//
// WHAT IS NOT SHOWN: a secret, in the body or in the error. `safe_summary`
// cannot produce one and the error path holds none.
//
// Apply is a button the user presses. It is not pre-pressed, it is not reached
// by hovering, and it does not appear at all until the pairs have arrived.
// Cancel closes the panel and calls nothing — the only thing it can undo is
// having looked.
// ---------------------------------------------------------------------------

/** Where this change lands, for one consumer.
 *
 *  Read off the status the backend sent, never assumed. An adapter is the only
 *  thing that could write another program's file, and `unsupportedByAgent`
 *  means there is no adapter (connections.rs:1016-1018) — so for that consumer
 *  the honest destination is "no file", which is what this build says for
 *  Claude Code and Codex because `installed_adapters()` is empty.
 *
 *  THE FILE PATH IS NOT INVENTED HERE, and must never be. When an adapter
 *  ships, the file and key it writes belong in `safe_summary` so they arrive as
 *  preview pairs like every other line, produced by the code that does the
 *  writing. A path typed into this component would be precisely the review
 *  screen that describes something other than what executes. */
function destinationOf(consumer: Consumer, status: ConnectionStatus): string {
  if (status === 'unsupportedByAgent') {
    return `No file. No ${CONSUMER_NAMES[consumer]} adapter exists in this build, so none of its configuration is opened, read or written.`;
  }
  if (consumer === 'effi') {
    return 'Effi’s own connection record. Nothing outside this app is touched.';
  }
  return `${CONSUMER_NAMES[consumer]}’s own configuration, written by its adapter — every key it touches is listed below, as that adapter reports it.`;
}

function ChangePreview({
  row,
  projectName,
  lines,
  error,
  onCancel,
  onApply,
}: {
  row: Connection;
  projectName: string;
  lines: readonly PreviewLine[] | undefined;
  error: string | null;
  onCancel: () => void;
  onApply: () => void;
}) {
  const headingId = `connection-${row.id}-review-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-xl border border-accent bg-accent-tint ${MOTION}`}
    >
      <div className="border-b border-border p-4">
        <h3 id={headingId} className="text-sm leading-[20px] font-semibold text-text">
          Review this change
        </h3>
        <p className={`pt-1 ${META}`}>
          Nothing has been written yet. Effi shows you the destination, the scope and the change
          first, and writes only when you press Apply.
        </p>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div>
          <p className="text-sm leading-[20px] font-semibold text-text">Destination</p>
          <ul className="flex flex-col gap-2 pt-2">
            {CONSUMERS.map((consumer) => (
              <li key={consumer} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                <span className="shrink-0 text-sm leading-[21px] text-text sm:w-32">
                  {CONSUMER_NAMES[consumer]}
                </span>
                <span className={`min-w-0 flex-1 ${META}`}>
                  {destinationOf(consumer, row.consumers[consumer])}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm leading-[20px] font-semibold text-text">Scope</p>
          <p className={`pt-2 ${META}`}>
            {scopeWord(row.scope, projectName)}. Applying does not widen it — changing the scope
            is the separate step above.
          </p>
        </div>

        <div>
          <p className="text-sm leading-[20px] font-semibold text-text">What changes</p>
          {/* The real diff, and it is a short one. `request_connect` sets
              `connect_requested` and touches nothing else
              (connections.rs:759-766), so every recorded value below is a
              context line rather than an edit — which is why each is marked
              unchanged instead of being left ambiguous. */}
          <p className="flex items-start gap-2 pt-2 text-sm leading-[21px] text-text">
            <span aria-hidden="true" className="shrink-0 font-mono text-xs leading-[18px]">
              +
            </span>
            Effi records that you pressed Connect. That is the whole edit: no recorded value
            below is rewritten, and nothing reports as connected until a check passes.
          </p>
        </div>

        <div>
          <p className="text-sm leading-[20px] font-semibold text-text">The record, as stored</p>
          <p className={`pt-1 pb-2 ${META}`}>
            Printed by the code that keeps it. The credential appears as its keychain
            coordinates — there is no line here a secret could occupy.
          </p>
          {error ? (
            // Verbatim, and it cannot carry a credential: nothing that produces
            // it holds one. Apply is withheld — without the preview there is
            // nothing to have reviewed.
            <p className="flex items-start gap-2 rounded-lg border border-border bg-raised p-3 text-sm leading-[21px] text-error">
              <span aria-hidden="true" className="shrink-0 pt-0.5">
                <Icon path={ALERT} size={16} />
              </span>
              {error}
            </p>
          ) : lines ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th scope="col" className={`py-2 pr-4 font-normal ${META}`}>
                    Key
                  </th>
                  <th scope="col" className={`py-2 pr-4 font-normal ${META}`}>
                    Value now
                  </th>
                  <th scope="col" className={`py-2 text-right font-normal ${META}`}>
                    After Apply
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map(([label, value]) => (
                  <tr key={label} className="border-t border-border align-top">
                    <th
                      scope="row"
                      className="py-2 pr-4 text-sm leading-[21px] font-normal text-muted"
                    >
                      {label}
                    </th>
                    <td className="py-2 pr-4 text-sm leading-[21px] break-words text-text">
                      {value}
                    </td>
                    <td className={`py-2 text-right whitespace-nowrap ${META}`}>
                      <span aria-hidden="true" className="pr-1 font-mono">
                        =
                      </span>
                      unchanged
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={`flex items-center gap-2 ${META}`}>
              <span aria-hidden="true" className="font-mono">
                ◌
              </span>
              Reading the stored record…
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className={`mr-auto ${META}`}>Cancel writes nothing and changes nothing.</p>
          <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          {/* Only once the pairs are actually here. An Apply drawn over a
              preview that never arrived is an Apply over nothing. */}
          {lines && !error && (
            <button type="button" onClick={onApply} className={PRIMARY_BUTTON}>
              Apply
              <span aria-hidden="true">
                <Icon path={ARROW_RIGHT} size={16} />
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TASK 105 — the credential, and the one action that deletes it
//
// Two acts, two consequences, and they are kept apart on the page as firmly as
// they are kept apart in connections.rs:
//
//   DISCONNECT (connections.rs:896-903) unbinds the consumers and drops the
//   explicit Connect. The credential reference stays, the keychain item stays,
//   and every other project using it is untouched. It lives in the footer,
//   beside the state it ends.
//
//   REVOKE (lib.rs:656-666) deletes the secret out of the OS keychain. It is
//   not scoped to a project — the keychain item is one item — so every project
//   using that credential is affected. It lives here, in its own section, with
//   its own label and its own confirmation, because a destructive act that
//   shares a row with a reversible one gets pressed by accident.
// ---------------------------------------------------------------------------

function CredentialSection({
  credential,
  projectName,
  confirming,
  onAskRevoke,
  onDismissRevoke,
  onRevoke,
  revokeError,
}: {
  credential: CredentialCoordinates;
  projectName: string;
  confirming: boolean;
  onAskRevoke: () => void;
  onDismissRevoke: () => void;
  onRevoke: () => void;
  revokeError: string | null;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${MOTION} ${
        confirming ? 'border-error bg-raised' : 'border-border bg-raised'
      }`}
    >
      <p className="text-sm leading-[20px] font-semibold text-text">Credential</p>
      {/* Coordinates, as everywhere else on this page. */}
      <p className={`pt-1 ${META}`}>
        Filed in your keychain as {credential.account} under {credential.service}. Effi stores the
        address, never the token.
      </p>

      {confirming ? (
        <div className="pt-4">
          <p className="flex items-start gap-2 text-sm leading-[21px] font-semibold text-error">
            <span aria-hidden="true" className="shrink-0 pt-0.5">
              <Icon path={ALERT} size={16} />
            </span>
            Delete this token from your keychain?
          </p>
          <p className="pt-2 text-sm leading-[21px] text-text">
            Revoking deletes the keychain item itself. It is not scoped to {projectName}: every
            project that uses this credential loses it at the same moment, and each of them stops
            working until a new token is stored.
          </p>
          <p className={`pt-2 ${META}`}>
            If you only want this connection to stop being used, Disconnect is the other action —
            it unbinds the tools and leaves the token exactly where it is.
          </p>
          {revokeError && (
            // The backend's own words, unedited. It already states whether
            // anything changed, and in the failing case it states that nothing
            // did (lib.rs:630-647) — a sentence added here could only make that
            // less true.
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm leading-[21px] text-error">
              <span aria-hidden="true" className="shrink-0 pt-0.5">
                <Icon path={ALERT} size={16} />
              </span>
              {revokeError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
            <button type="button" onClick={onDismissRevoke} className={SECONDARY_BUTTON}>
              Keep the credential
            </button>
            <button type="button" onClick={onRevoke} className={DESTRUCTIVE_BUTTON}>
              Revoke credential
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
          <p className={`mr-auto ${META}`}>
            Revoke deletes the token. Disconnect only unbinds the tools.
          </p>
          <button type="button" onClick={onAskRevoke} className={SECONDARY_BUTTON}>
            Revoke credential…
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The detail panel
// ---------------------------------------------------------------------------

interface DraftFields {
  label: string;
  endpoint: string;
  transport: string;
  service: string;
  account: string;
}

function blankDraft(row: Connection, detail: ConnectionDetail | undefined): DraftFields {
  return {
    label: detail?.label ?? CONNECTOR_NAMES[row.connector],
    endpoint: detail?.endpoint ?? '',
    transport: detail?.transport ?? '',
    service: detail?.credential?.service ?? '',
    account: detail?.credential?.account ?? '',
  };
}

export function ConnectionsPage({
  projectId,
  projectName,
  connections,
  details,
  previews = {},
  onConfigure,
  onScopeChange,
  onRequestPreview,
  onConnect,
  onCheck,
  onDisconnect,
  onRevokeCredential,
  error = null,
  previewError = null,
  revokeError = null,
}: ConnectionsPageProps) {
  const configurable = connections.filter((row) => !row.planned);
  const planned = connections.filter((row) => row.planned);

  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
  const [authOpen, setAuthOpen] = useState(false);
  // The "inspect scope" step, held per connection: the Connect action does not
  // appear until the scope has actually been looked at, which is what keeps
  // step 3 a step rather than a line of text beside the title.
  const [scopeReviewed, setScopeReviewed] = useState<Record<string, boolean>>({});

  const selected =
    configurable.find((row) => row.id === requestedId) ?? configurable[0] ?? null;
  const customMcp = configurable.find((row) => row.connector === 'customMcp') ?? null;

  return (
    /* `min-h-0 flex-1`, never `h-full`: this page is the SECOND child of its
       column (App.tsx:2146) -- ConnectionsExit above it is `h-10 shrink-0` --
       so asking for 100% of a column that already spent 40px made the column's
       content one exit bar taller than the window. With nothing clipping
       between here and <html>, that was a 40px page scroll onto bare ground. */
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-ground text-text">
      <header className="shrink-0 px-8 pt-6">
        <nav aria-label="Breadcrumb" className={META}>
          <span>{projectName}</span>
          <span aria-hidden="true" className="px-2">
            /
          </span>
          <span className="text-text">Connections</span>
        </nav>
        <h1 className="pt-4 text-[28px] leading-[36px] font-semibold tracking-tight text-text">
          Connect your workflow
        </h1>
        <p className="pt-2 text-sm leading-[21px] text-muted">
          Add the context your tools need. Every connection is optional — you can skip this page
          and come back, and nothing else in Effi waits on it.
        </p>
      </header>

      {error && (
        // Backend text, verbatim. It cannot carry a credential: nothing that
        // produces it holds one (connections.rs:35-49).
        <div className="mx-8 mt-6 flex items-start gap-3 rounded-xl border border-border bg-raised p-4">
          <span aria-hidden="true" className="shrink-0 pt-0.5 text-error">
            <Icon path={ALERT} size={16} />
          </span>
          <p className="text-sm leading-[21px] text-error">{error}</p>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 px-8 py-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <section aria-labelledby="connections-list-heading" className="min-w-0">
          <h2
            id="connections-list-heading"
            className={`pb-3 tracking-wide uppercase ${META}`}
          >
            Project connections
          </h2>
          <ul className="flex flex-col gap-3">
            {configurable.map((row) => (
              <ConnectorRow
                key={row.id}
                row={row}
                detail={details[row.id]}
                projectName={projectName}
                selected={selected?.id === row.id}
                onSelect={(id) => {
                  setRequestedId(id);
                  setAuthOpen(false);
                }}
              />
            ))}
            {planned.map((row) => (
              <PlannedRow key={row.id} row={row} />
            ))}
          </ul>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          {selected ? (
            <DetailPanel
              key={selected.id}
              row={selected}
              detail={details[selected.id]}
              draft={drafts[selected.id] ?? blankDraft(selected, details[selected.id])}
              onDraftChange={(next) =>
                setDrafts((current) => ({ ...current, [selected.id]: next }))
              }
              onDraftReset={() =>
                setDrafts((current) => {
                  const next = { ...current };
                  delete next[selected.id];
                  return next;
                })
              }
              projectId={projectId}
              projectName={projectName}
              authOpen={authOpen}
              onAuthToggle={() => setAuthOpen((open) => !open)}
              scopeReviewed={scopeReviewed[selected.id] ?? false}
              onScopeReviewed={() =>
                setScopeReviewed((current) => ({ ...current, [selected.id]: true }))
              }
              preview={previews[selected.id]}
              previewError={previewError}
              revokeError={revokeError}
              onConfigure={onConfigure}
              onScopeChange={onScopeChange}
              onRequestPreview={onRequestPreview}
              onConnect={onConnect}
              onCheck={onCheck}
              onDisconnect={onDisconnect}
              onRevokeCredential={onRevokeCredential}
            />
          ) : (
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm leading-[21px] text-muted">
                No connector in this build can be configured yet. The entries on the left are a
                catalogue, not a capability.
              </p>
            </div>
          )}

          {/* The mockup's second way in to the same row. A real action, because
              Custom MCP is not planned: it selects the connector and the flow
              starts at step 1 like any other. */}
          {customMcp && (
            <div className="flex items-start gap-4 rounded-xl border border-border bg-surface p-4">
              <ConnectorTile connector="customMcp" planned={false} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-[21px] font-semibold text-text">
                  Use a custom MCP server
                </p>
                <p className={`pt-1 ${META}`}>
                  Configure a server, review its scope, then enable supported consumers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRequestedId(customMcp.id);
                  setAuthOpen(false);
                }}
                className={SECONDARY_BUTTON}
              >
                Add server
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DetailPanelProps {
  row: Connection;
  detail: ConnectionDetail | undefined;
  draft: DraftFields;
  onDraftChange: (next: DraftFields) => void;
  onDraftReset: () => void;
  projectId: string;
  projectName: string;
  authOpen: boolean;
  onAuthToggle: () => void;
  scopeReviewed: boolean;
  onScopeReviewed: () => void;
  preview: readonly PreviewLine[] | undefined;
  previewError: string | null;
  revokeError: string | null;
  onConfigure: (draft: ConfigureDraft) => void;
  onScopeChange: (connectionId: string, scope: ScopeValue) => void;
  onRequestPreview: ((connectionId: string) => void) | undefined;
  onConnect: (connectionId: string) => void;
  onCheck: (connectionId: string, consumer: Consumer) => void;
  onDisconnect: (connectionId: string) => void;
  onRevokeCredential: ((connectionId: string) => void) | undefined;
}

function DetailPanel({
  row,
  detail,
  draft,
  onDraftChange,
  onDraftReset,
  projectId,
  projectName,
  authOpen,
  onAuthToggle,
  scopeReviewed,
  onScopeReviewed,
  preview,
  previewError,
  revokeError,
  onConfigure,
  onScopeChange,
  onRequestPreview,
  onConnect,
  onCheck,
  onDisconnect,
  onRevokeCredential,
}: DetailPanelProps) {
  const name = CONNECTOR_NAMES[row.connector];
  const form = CONNECTOR_FORM[row.connector];
  const phase = phaseOf(row, detail, scopeReviewed);
  const fieldId = (field: string) => `connection-${row.id}-${field}`;

  // Both are local and both are mounted per connection (`key={selected.id}` at
  // the call site), so neither survives a change of row: an open review belongs
  // to the row it was opened on, and a half-answered revoke confirmation must
  // never be inherited by a different credential.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  const openReview = () => {
    if (!onRequestPreview) return;
    setReviewOpen(true);
    // A read. It is what makes Cancel free: nothing has been written by the
    // time the panel is on screen.
    onRequestPreview(row.id);
  };

  const submitConfigure = () => {
    onConfigure({
      connector: row.connector,
      label: draft.label.trim(),
      endpoint: draft.endpoint.trim() === '' ? null : draft.endpoint.trim(),
      transport: draft.transport.trim() === '' ? null : draft.transport.trim(),
      credential:
        form.credentialKindLabel && draft.service.trim() !== '' && draft.account.trim() !== ''
          ? { service: draft.service.trim(), account: draft.account.trim(), kind: 'apiToken' }
          : null,
      scope: row.scope,
    });
  };

  return (
    <section
      aria-labelledby={fieldId('heading')}
      className="rounded-xl border border-border bg-surface"
    >
      <div className="flex items-start gap-4 border-b border-border p-6">
        <ConnectorTile connector={row.connector} planned={false} />
        <div className="min-w-0 flex-1">
          <h2 id={fieldId('heading')} className="text-xl leading-[28px] font-semibold text-text">
            Connect {name}
          </h2>
          <p className={`pt-1 ${META}`}>Scope: {scopeWord(row.scope, projectName)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-6">
        <div>
          <label htmlFor={fieldId('label')} className={FIELD_LABEL}>
            Name
          </label>
          <input
            id={fieldId('label')}
            type="text"
            value={draft.label}
            onChange={(event) => onDraftChange({ ...draft, label: event.target.value })}
            placeholder={name}
            className={FIELD}
          />
        </div>

        {form.needsEndpoint && (
          <div>
            <label htmlFor={fieldId('endpoint')} className={FIELD_LABEL}>
              {form.endpointLabel}
            </label>
            <input
              id={fieldId('endpoint')}
              type="text"
              value={draft.endpoint}
              onChange={(event) => onDraftChange({ ...draft, endpoint: event.target.value })}
              placeholder={form.placeholder}
              className={FIELD}
            />
          </div>
        )}

        <div>
          <label htmlFor={fieldId('transport')} className={FIELD_LABEL}>
            Transport
          </label>
          <input
            id={fieldId('transport')}
            type="text"
            value={draft.transport}
            onChange={(event) => onDraftChange({ ...draft, transport: event.target.value })}
            placeholder="however your server is reached"
            aria-describedby={fieldId('transport-help')}
            className={FIELD}
          />
          <p id={fieldId('transport-help')} className={`pt-2 ${META}`}>
            Stored and shown back as you write it. Effi does not claim to speak any particular
            transport, so it offers no list to choose from.
          </p>
        </div>

        {/* Authentication, as a disclosure rather than a promise. No sign-in
            method is offered that this build has not implemented. */}
        <div className="rounded-xl border border-border bg-raised">
          <button
            type="button"
            onClick={onAuthToggle}
            aria-expanded={authOpen}
            aria-controls={fieldId('auth')}
            className={`flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left hover:bg-hover ${MOTION} ${FOCUS}`}
          >
            <span aria-hidden="true" className="shrink-0 text-muted">
              <Icon path={authOpen ? CHEVRON_DOWN : CHEVRON_RIGHT} size={16} />
            </span>
            <span className="flex-1 text-sm leading-[20px] font-semibold text-text">
              Authentication
            </span>
            <span className={META}>
              {form.credentialKindLabel ?? 'Nothing to supply yet'}
            </span>
          </button>
          {authOpen && (
            <div id={fieldId('auth')} className="border-t border-border p-4">
              {form.credentialKindLabel ? (
                <>
                  {/* Two coordinates, no value. `CredentialRef` has no third
                      field, so there is nowhere on this page — or on the wire,
                      or in studio.json, or in a screenshot — for a secret to
                      land. The keychain holds it; Effi holds its address. */}
                  <p className={`pb-4 ${META}`}>
                    Effi records only where the credential lives — the keychain service and the
                    account it is filed under. Nothing secret is typed here and nothing secret is
                    ever shown here.
                  </p>
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={fieldId('service')} className={FIELD_LABEL}>
                        Keychain service
                      </label>
                      <input
                        id={fieldId('service')}
                        type="text"
                        value={draft.service}
                        onChange={(event) =>
                          onDraftChange({ ...draft, service: event.target.value })
                        }
                        placeholder="efficlaude.jira"
                        className={FIELD}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <label htmlFor={fieldId('account')} className={FIELD_LABEL}>
                        Account
                      </label>
                      <input
                        id={fieldId('account')}
                        type="text"
                        value={draft.account}
                        onChange={(event) =>
                          onDraftChange({ ...draft, account: event.target.value })
                        }
                        placeholder="you@your-team.example"
                        className={FIELD}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className={META}>
                  This connector asks for nothing yet. That is not the same as needing no sign-in.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Step 3. Scope is inspected before Connect, not alongside it: a scope
            that arrived with the credential would never be looked at. */}
        <fieldset
          className={`rounded-xl border p-4 ${MOTION} ${
            phase === 'inspectScope' ? 'border-accent bg-accent-tint' : 'border-border bg-raised'
          }`}
        >
          <legend className="px-2 text-sm leading-[20px] font-semibold text-text">Scope</legend>
          <p className={`pb-3 ${META}`}>
            Which projects this connection reaches. Check it before connecting — widening it later
            is a separate, explicit act.
          </p>
          <div className="flex flex-col gap-3">
            <label
              htmlFor={fieldId('scope-project')}
              className="flex items-center gap-3 text-sm leading-[21px] text-text"
            >
              {/* accent-accent is not a typo: the first token is Tailwind's accent-color
                  utility, the second is our accent colour. It paints the native radio
                  dot. Set per control rather than on an ancestor: accent-color does
                  inherit, but which controls carry the brand accent is a per-control
                  choice, not a property of this subtree. */}
              <input
                id={fieldId('scope-project')}
                type="radio"
                name={fieldId('scope')}
                checked={!row.scope.global}
                onChange={() => {
                  onScopeChange(row.id, { global: false, projectIds: [projectId] });
                  onScopeReviewed();
                  // The preview on screen described the scope that was stored a
                  // moment ago. Leaving it up would be a review of the wrong
                  // thing, so it closes and has to be asked for again.
                  setReviewOpen(false);
                }}
                className={`h-4 w-4 shrink-0 accent-accent ${FOCUS}`}
              />
              This project only — {projectName}
            </label>
            <label
              htmlFor={fieldId('scope-global')}
              className="flex items-center gap-3 text-sm leading-[21px] text-text"
            >
              {/* accent-accent is not a typo: the first token is Tailwind's accent-color
                  utility, the second is our accent colour. It paints the native radio
                  dot. Set per control rather than on an ancestor: accent-color does
                  inherit, but which controls carry the brand accent is a per-control
                  choice, not a property of this subtree. */}
              <input
                id={fieldId('scope-global')}
                type="radio"
                name={fieldId('scope')}
                checked={row.scope.global}
                onChange={() => {
                  onScopeChange(row.id, { global: true, projectIds: row.scope.projectIds });
                  onScopeReviewed();
                  setReviewOpen(false);
                }}
                className={`h-4 w-4 shrink-0 accent-accent ${FOCUS}`}
              />
              Every project
            </label>
          </div>
        </fieldset>

        <ConsumerMatrix connectionId={row.id} consumers={row.consumers} onCheck={onCheck} />

        <p className="flex items-start gap-2 text-sm leading-[21px] text-muted">
          <span aria-hidden="true" className="shrink-0 pt-0.5">
            <Icon path={INFO} size={16} />
          </span>
          Connecting an account does not automatically configure every agent. Each tool is bound on
          its own, and each reports for itself.
        </p>

        {/* TASK 105. Its own section, its own heading, its own confirmation —
            as far from the Disconnect in the footer as the panel allows. Drawn
            only where there is a credential to revoke, because a control that
            could only refuse is not an offer. */}
        {detail?.credential && onRevokeCredential && (
          <CredentialSection
            credential={detail.credential}
            projectName={projectName}
            confirming={confirmingRevoke}
            onAskRevoke={() => setConfirmingRevoke(true)}
            onDismissRevoke={() => setConfirmingRevoke(false)}
            onRevoke={() => onRevokeCredential(row.id)}
            revokeError={revokeError}
          />
        )}

        {/* TASK 104. The gate in front of the explicit Connect. */}
        {phase === 'connect' && reviewOpen && (
          <ChangePreview
            row={row}
            projectName={projectName}
            lines={preview}
            error={previewError}
            onCancel={() => setReviewOpen(false)}
            onApply={() => {
              setReviewOpen(false);
              onConnect(row.id);
            }}
          />
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {phase === 'checking' ? (
            <>
              <p className={`mr-auto ${META}`}>
                Connect was pressed. Nothing reports as connected until a check passes. Disconnect
                unbinds the tools and leaves the credential in your keychain.
              </p>
              <button type="button" onClick={() => onDisconnect(row.id)} className={SECONDARY_BUTTON}>
                Disconnect
              </button>
            </>
          ) : phase === 'connect' && reviewOpen ? (
            // The review above owns Cancel and Apply. A second Cancel down here
            // would be two buttons with one word and two different meanings.
            <p className={`mr-auto ${META}`}>
              The change is laid out above. Nothing is written until you press Apply.
            </p>
          ) : (
            <>
              <button type="button" onClick={onDraftReset} className={SECONDARY_BUTTON}>
                Cancel
              </button>
              {phase === 'configure' && (
                <button type="button" onClick={submitConfigure} className={PRIMARY_BUTTON}>
                  Configure {name}
                  <span aria-hidden="true">
                    <Icon path={ARROW_RIGHT} size={16} />
                  </span>
                </button>
              )}
              {phase === 'inspectScope' && (
                <button type="button" onClick={onScopeReviewed} className={PRIMARY_BUTTON}>
                  Scope looks right
                  <span aria-hidden="true">
                    <Icon path={ARROW_RIGHT} size={16} />
                  </span>
                </button>
              )}
              {phase === 'connect' &&
                (onRequestPreview ? (
                  <button type="button" onClick={openReview} className={PRIMARY_BUTTON}>
                    Review and connect {name}
                    <span aria-hidden="true">
                      <Icon path={ARROW_RIGHT} size={16} />
                    </span>
                  </button>
                ) : (
                  // No preview source wired, so there is nothing to review —
                  // and the answer to that is to withhold the write, not to
                  // perform it unseen. Said in words rather than drawn as a
                  // disabled button: the repair is wiring a prop, which is not
                  // something the user can press.
                  <p className={`mr-auto max-w-[44ch] ${META}`}>
                    Connect is withheld: Effi cannot yet show you what it would write for this
                    connection, and it does not write what it has not shown.
                  </p>
                ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
