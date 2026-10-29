import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { BrowserPageState, BrowserPaneView } from '../lib/types';

/**
 * The Browser tab (DESIGN-SPEC.md:107-108, mockup `04-browser-devices.png`).
 *
 * # What this pane is, and what it refuses to pretend to be
 *
 * `browser.rs:1-51` establishes — against the vendored crate source and the
 * published docs for the pinned Tauri — that this build cannot host an embedded
 * browsing surface: child webviews are gated behind a feature the app does not
 * enable, and even with it enabled the version in use exposes no history
 * navigation at all. So there is no viewport here, and this file draws none:
 *
 * - no framed remote page. An arbitrary site cannot be assumed to permit being
 *   framed (`X-Frame-Options`, CSP `frame-ancestors`), and a preview that fails
 *   silently on half the web is worse than no preview — `BUILD-CHANGES.md` §6.
 * - no browser chrome drawn around an empty box, and no placeholder screenshot.
 *   The same §6 names that shortcut for the device tab and refuses it there too.
 *
 * What the main area shows instead is the address, what is actually known about
 * it, and the one control that genuinely puts the page in front of the user:
 * **Open externally**. The mockup's main area shows a sample app only to say
 * what the user is working on — that app is the user's project, not an Effi
 * feature, and this build hands it to the system browser rather than drawing it.
 *
 * # Back and forward are not page history
 *
 * `browser.rs:402-416` is explicit that its history is "the list of addresses
 * this tab has held", deliberately NOT a claim about a document's session
 * history — there is no document, and no API to ask one. A control labelled
 * `Back` reads as "the page I was on"; these move through **addresses entered
 * in this tab**. So they are labelled `Previous address` / `Next address`, the
 * meta line under the toolbar says so in words, and nothing here calls either
 * of them history.
 *
 * # Nothing is auto-started and nothing is probed
 *
 * A localhost address is one the user typed. `browser.rs:263-268` records that
 * its `is_loopback` is a reading of that string and never a probe; this pane
 * inherits the same rule. No dev server is looked for, launched, or claimed.
 */

// ---------------------------------------------------------------------------
// The contract with the backend
// ---------------------------------------------------------------------------

/**
 * `BrowserPaneView` and `BrowserPageState` used to be declared here, with a
 * note that they would move to `lib/types.ts` once the typed wrappers for
 * `browser_open`, `browser_navigate` and the rest existed. They do now
 * (`tauri-api.ts`), so both types live beside the rest of the wire contract and
 * are re-exported from here: `BrowserPaneView` is the subset of Rust's
 * `BrowserView` (`browser.rs:511-534`) this pane draws from, and
 * `BrowserPageState` is still a discriminant the pane never invents — with no
 * surface there is no request to observe, so a `certificate` or `download`
 * state can only come from a caller that genuinely saw one.
 *
 * Not one call site below changed.
 */
export type { BrowserPaneView, BrowserPageState } from '../lib/types';

/** Which command is in flight, and which one a refusal came back from. */
type Op = 'navigate' | 'back' | 'forward' | 'reload' | 'open';

export interface BrowserPaneProps {
  view: BrowserPaneView;
  /** Defaults to `idle`. See `BrowserPageState`. */
  page?: BrowserPageState;
  /** The page's own title, when a caller has one to give. There is no document
   *  on this path, so this pane shows the address instead of fabricating a
   *  title from the host name — a hostname presented as a title is a small lie
   *  that makes the pane look like it loaded something. */
  title?: string | null;
  /** `EXTERNAL_FALLBACK` from `browser_capability` (`browser.rs:77`). Passed in
   *  so the sentence the user reads is the backend's, not a second wording of
   *  the same limitation. */
  fallbackLabel?: string;
  /** `capability.reason` (`browser.rs:72`). Shown verbatim, under a disclosure,
   *  for the reader who wants to know why — never paraphrased. */
  surfaceReason?: string | null;

  /** `browser_navigate`. Rejects with the backend's refusal for a scheme this
   *  tab may not hold; that string is shown as-is. */
  onNavigate: (url: string) => Promise<unknown> | unknown;
  /** `browser_back` — one step back through the addresses this tab has held. */
  onBack: () => Promise<unknown> | unknown;
  /** `browser_forward`. */
  onForward: () => Promise<unknown> | unknown;
  /** `browser_reload` — bumps the generation token (`browser.rs:665-677`). */
  onReload: () => Promise<unknown> | unknown;
  /** `browser_open_externally`. Hands the tab's current address to the system
   *  browser, re-validated at the point of use (`browser.rs:743-765`). It
   *  starts nothing and retries nothing. */
  onOpenExternally: () => Promise<unknown> | unknown;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** The one sentence that says what back and forward really move through. One
 *  const because the labels, the tooltips and this line must not drift apart. */
const HISTORY_NOTE =
  'Previous and next step through addresses entered in this tab — not through a page’s history.';

const BACK_LABEL = 'Previous address';
const FORWARD_LABEL = 'Next address';

/** Used in two states and kept identical in both, so "open it yourself" never
 *  reads as two different offers. */
const OPEN_EXTERNALLY = 'Open externally';

// ---------------------------------------------------------------------------
// Pane
// ---------------------------------------------------------------------------

export function BrowserPane({
  view,
  page = { kind: 'idle' },
  title = null,
  fallbackLabel = 'Opens in a separate window',
  surfaceReason = null,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onOpenExternally,
}: BrowserPaneProps) {
  const addressId = useId();
  const reasonId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  /** What is in the field, which is NOT what the tab holds until it is
   *  submitted. Kept editable in every state below — a wrong address has to be
   *  fixable without closing the tab, which is the whole reason the toolbar
   *  renders above the state area rather than inside it. */
  const [draft, setDraft] = useState(view.url ?? '');
  const [busy, setBusy] = useState<Op | null>(null);
  /** The last command refusal, in the backend's words. Separate from `page`
   *  because this one is about an operation the user just asked for, while
   *  `page` is about the address itself. */
  const [refusal, setRefusal] = useState<{ op: Op; message: string } | null>(null);

  // Adjusting state during render rather than in an effect: the committed
  // address changing (a back, a forward, a navigate) must put that address in
  // the field, and doing it in an effect would render one frame showing the
  // previous tab's address in the editable field.
  const lastUrl = useRef(view.url);
  if (lastUrl.current !== view.url) {
    lastUrl.current = view.url;
    setDraft(view.url ?? '');
    setRefusal(null);
  }

  const run = async (op: Op, call: () => Promise<unknown> | unknown) => {
    setBusy(op);
    setRefusal(null);
    try {
      await call();
    } catch (err) {
      // Tauri rejects commands with the error string itself, so this is the
      // backend's own sentence — `normalize_url`'s scheme refusal names the
      // scheme, and repeating it verbatim is what stops the UI from flattening
      // six different reasons into "invalid URL".
      setRefusal({ op, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    void run('navigate', () => onNavigate(draft));
  };

  const goTo = (url: string) => {
    setDraft(url);
    void run('navigate', () => onNavigate(url));
  };

  /** Disabled with no address, and while a command is in flight. There is no
   *  third case: an address that failed validation never became the tab's
   *  address, so `view.url` is either absent or already a validated one
   *  (`browser.rs:618-629`), and the open re-validates it again anyway. */
  const canOpen = view.url !== null && busy === null;
  /** The field holds something other than the tab's address. Said out loud,
   *  because `Open externally` opens the committed address and a user looking
   *  at a half-typed one would otherwise be surprised by where they land. */
  const dirty = draft.trim() !== (view.url ?? '').trim();

  const state = resolve(busy, refusal, page, view);

  return (
    <div className="flex h-full w-full flex-col bg-ground">
      {/* -- the controls, rendered in every state ------------------------ */}
      <form
        onSubmit={submit}
        className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2"
      >
        <IconButton
          label={BACK_LABEL}
          onClick={() => void run('back', onBack)}
          disabled={!view.canGoBack || busy !== null}
        >
          <ArrowLeft />
        </IconButton>
        <IconButton
          label={FORWARD_LABEL}
          onClick={() => void run('forward', onForward)}
          disabled={!view.canGoForward || busy !== null}
        >
          <ArrowRight />
        </IconButton>
        <IconButton
          label="Reload"
          onClick={() => void run('reload', onReload)}
          disabled={view.url === null || busy !== null}
        >
          <Reload />
        </IconButton>

        <label htmlFor={addressId} className="sr-only">
          Address
        </label>
        <input
          id={addressId}
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Escape puts the committed address back, so a half-typed address
            // can be abandoned without the user having to remember what the
            // tab is actually holding.
            if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(view.url ?? '');
            }
          }}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="localhost:3000 — or any http:// or https:// address"
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-ground px-3 font-mono text-sm leading-[21px] text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper"
        />

        <button
          type="button"
          onClick={() => void run('open', onOpenExternally)}
          disabled={!canOpen}
          title={view.url ? `${OPEN_EXTERNALLY}: ${view.url}` : undefined}
          className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-border bg-raised px-3 text-sm leading-[21px] text-text transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none disabled:cursor-default disabled:bg-surface disabled:text-muted"
        >
          <External />
          {OPEN_EXTERNALLY}
        </button>
      </form>

      {/* The indeterminate indicator. No percentage and no simulated fill:
          nothing here can measure a load, so the honest shape is a bar that
          says "working" and nothing more. Under reduced motion it stops
          animating and stays visible, which still reads as in progress. */}
      <div className="h-0.5 shrink-0 bg-border">
        {state.kind === 'working' && (
          <div className="h-full w-full animate-pulse bg-copper motion-reduce:animate-none" />
        )}
      </div>

      <p className="shrink-0 border-b border-border bg-surface px-3 pb-2 text-xs leading-[18px] text-muted">
        {dirty && draft.trim()
          ? `Press Enter to go to the address you typed. ${HISTORY_NOTE}`
          : HISTORY_NOTE}
      </p>

      {/* -- the main area ------------------------------------------------
          Not a viewport, and not dressed as one. See the file header. */}
      <div className="min-h-0 flex-1 overflow-auto px-6 py-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 shrink-0 ${state.tone}`}>{state.icon}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-base leading-6 font-semibold text-text">{state.heading}</h2>
            </div>
          </div>

          {view.url && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
              <p className="font-mono text-sm leading-[21px] break-all text-text">{view.url}</p>
              {view.loopback && (
                <p className="text-xs leading-[18px] text-muted">
                  This address points at this machine. Read from what you typed — nothing was
                  contacted to work that out, and Effi does not start a server for it.
                </p>
              )}
            </div>
          )}

          <p className="text-sm leading-[21px] text-muted">{state.body}</p>

          {state.actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {state.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={
                    action.primary
                      ? 'rounded-lg bg-copper px-4 py-2 text-sm leading-[21px] font-semibold text-on-copper transition-colors duration-150 hover:bg-copper/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none disabled:cursor-default disabled:bg-raised disabled:text-muted'
                      : 'rounded-lg border border-border bg-raised px-4 py-2 text-sm leading-[21px] text-text transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none disabled:cursor-default disabled:bg-surface disabled:text-muted'
                  }
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* The limitation, in the backend's own words, folded away rather
              than repeated in every state's body text. */}
          {!view.embeddedSurface && surfaceReason && (
            <details className="rounded-xl border border-border bg-surface">
              <summary className="cursor-default rounded-xl px-4 py-3 text-sm leading-[21px] text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper">
                Why the page is not drawn here
              </summary>
              <p
                id={reasonId}
                className="border-t border-border px-4 py-3 text-xs leading-[18px] text-muted"
              >
                {surfaceReason}
              </p>
            </details>
          )}

          {!view.embeddedSurface && (
            <p className="text-xs leading-[18px] text-muted">{fallbackLabel}.</p>
          )}
        </div>
      </div>
    </div>
  );

  /**
   * One place where every state decides its own heading, body, tone and
   * recovery — so no two of them can quietly end up sharing copy. In
   * particular `unreachable` and `certificate` are built from separate
   * branches, because they are separate facts: nothing answered, versus
   * something answered that could not be identified.
   */
  function resolve(
    inFlight: Op | null,
    refused: { op: Op; message: string } | null,
    reported: BrowserPageState,
    current: BrowserPaneView,
  ): Resolved {
    const openAction = {
      label: OPEN_EXTERNALLY,
      primary: true,
      disabled: !canOpen,
      onClick: () => void run('open', onOpenExternally),
    };
    const retryAction = {
      label: 'Retry',
      primary: false,
      disabled: current.url === null || inFlight !== null,
      onClick: () => void run('reload', onReload),
    };

    if (inFlight) {
      return {
        kind: 'working',
        tone: 'text-copper',
        icon: <Spinner />,
        heading: WORKING_HEADING[inFlight],
        body: 'Working. There is no progress to report — this step either completes or comes back with a reason.',
        actions: [],
      };
    }

    if (refused) {
      return {
        kind: 'refused',
        tone: 'text-error',
        icon: <Alert />,
        heading: REFUSAL_HEADING[refused.op],
        body: `${refused.message} The address field above is still editable — correct it and press Enter.`,
        actions:
          refused.op === 'open'
            ? [openAction]
            : refused.op === 'reload'
              ? [retryAction]
              : [],
      };
    }

    switch (reported.kind) {
      case 'loading':
        return {
          kind: 'working',
          tone: 'text-copper',
          icon: <Spinner />,
          heading: 'Loading',
          body: 'Loading. No progress is measurable here, so none is shown.',
          actions: [],
        };

      case 'unreachable':
        return {
          kind: 'unreachable',
          tone: 'text-error',
          icon: <Alert />,
          heading: 'Unreachable',
          body:
            (reported.detail ? `${reported.detail} ` : '') +
            'Nothing answered at this address. The server may not be running, or the port may be a different one. Nothing here starts a server, so check it yourself, then retry — or correct the address above.',
          actions: [retryAction, { ...openAction, primary: false }],
        };

      case 'certificate':
        return {
          kind: 'certificate',
          tone: 'text-error',
          icon: <Shield />,
          heading: 'Certificate could not be verified',
          body:
            (reported.detail ? `${reported.detail} ` : '') +
            'Something did answer at this address — the problem is its identity, not its availability. Effi offers no way past this: there is no exception to accept and nothing to continue through. Fix the certificate on the server, or open the address in your default browser, which shows its own warning and keeps the decision with you.',
          actions: [openAction],
        };

      case 'download':
        return {
          kind: 'download',
          tone: 'text-warning',
          icon: <Download />,
          heading: 'That address is a file, not a page',
          body: `The address returned ${reported.filename} to download. Nothing was saved — Effi does not download files for you. Your default browser handles it if you want it, or edit the address above to point at a page.`,
          actions: [openAction],
        };

      case 'popup':
        return {
          kind: 'popup',
          tone: 'text-warning',
          icon: <Windows />,
          heading: 'A second window was requested',
          body: `The page asked to open ${reported.url}. Nothing was opened for it. Go there in this tab if you meant to, or ignore it and carry on.`,
          actions: [
            {
              label: 'Go to that address',
              primary: true,
              disabled: inFlight !== null,
              onClick: () => goTo(reported.url),
            },
          ],
        };

      case 'error':
        return {
          kind: 'refused',
          tone: 'text-error',
          icon: <Alert />,
          heading: 'That address did not load',
          body: `${reported.message} Correct the address above and press Enter, or retry.`,
          actions: [retryAction, { ...openAction, primary: false }],
        };

      case 'idle':
        if (current.url === null) {
          return {
            kind: 'blank',
            tone: 'text-muted',
            icon: <Globe />,
            heading: 'No address yet',
            body: 'Type an address above and press Enter — a local one such as localhost:3000, or any http:// or https:// page. This tab holds the address; nothing here looks for a running dev server and nothing starts one.',
            actions: [],
          };
        }
        return {
          kind: 'held',
          tone: 'text-muted',
          icon: <Globe />,
          // The page's own title when a caller has one, and the address itself
          // when none exists — never a hostname dressed up as a title.
          heading: title ?? 'This tab is on this address',
          body: current.embeddedSurface
            ? 'This address is ready to open.'
            : 'The page itself is not drawn in this tab on this build. Open it externally to actually see it — that hands this exact address to your default browser and nothing else.',
          actions: [openAction],
        };
    }
  }
}

/** What a state looks like once every branch above has decided. */
interface Resolved {
  kind: 'working' | 'refused' | 'blank' | 'held' | 'unreachable' | 'certificate' | 'download' | 'popup';
  tone: string;
  icon: ReactNode;
  heading: string;
  body: string;
  actions: { label: string; primary: boolean; disabled?: boolean; onClick: () => void }[];
}

/** Named per operation, so "working" never has to be read as "loading a page"
 *  when what is happening is a step through this tab's own addresses. */
const WORKING_HEADING: Record<Op, string> = {
  navigate: 'Going to that address',
  back: 'Stepping to the previous address',
  forward: 'Stepping to the next address',
  reload: 'Reloading',
  open: 'Handing the address to your browser',
};

/** One heading per refused operation. A single "Something went wrong" would
 *  make a rejected scheme and an empty address list look like the same event. */
const REFUSAL_HEADING: Record<Op, string> = {
  navigate: 'That address was not accepted',
  back: 'No earlier address in this tab',
  forward: 'No later address in this tab',
  reload: 'Nothing to reload',
  open: 'Could not open your default browser',
};

// ---------------------------------------------------------------------------
// Controls and glyphs
// ---------------------------------------------------------------------------

/** A square control whose only content is a glyph, so its name has to be
 *  carried by the label — stated once here rather than per call site. */
function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-raised text-text transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none disabled:cursor-default disabled:bg-surface disabled:text-muted"
    >
      {children}
    </button>
  );
}

/** Every glyph takes its color from the text color of its container, so a state
 *  tone is set in exactly one place. */
function glyph(path: ReactNode) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

const ArrowLeft = () => glyph(<path d="M10 3 5 8l5 5" />);
const ArrowRight = () => glyph(<path d="M6 3l5 5-5 5" />);
const Reload = () =>
  glyph(
    <>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.8-4.1" />
      <path d="M13.5 2v3.2h-3.2" />
    </>,
  );
const External = () =>
  glyph(
    <>
      <path d="M9 2.5h4.5V7" />
      <path d="M13.5 2.5 7.5 8.5" />
      <path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </>,
  );
const Globe = () =>
  glyph(
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M2.4 8h11.2M8 2.25c1.6 1.7 2.4 3.6 2.4 5.75S9.6 12.05 8 13.75C6.4 12.05 5.6 10.15 5.6 8s.8-4.05 2.4-5.75Z" />
    </>,
  );
const Alert = () =>
  glyph(
    <>
      <path d="M8 2.75 14 13H2L8 2.75Z" />
      <path d="M8 6.5v3" />
      <path d="M8 11.4h.01" />
    </>,
  );
const Shield = () =>
  glyph(
    <>
      <path d="M8 2 13 4v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4l5-2Z" />
      <path d="M6.2 7.8l3.6 3.6M9.8 7.8l-3.6 3.6" />
    </>,
  );
const Download = () =>
  glyph(
    <>
      <path d="M8 2.5v7" />
      <path d="M5 7l3 3 3-3" />
      <path d="M2.75 12.5h10.5" />
    </>,
  );
const Windows = () =>
  glyph(
    <>
      <rect x="2.25" y="2.25" width="8" height="8" rx="1.25" />
      <path d="M5.75 13.75h7a1 1 0 0 0 1-1v-7" />
    </>,
  );
/** Indeterminate by construction: a shape that turns, with no arc that could be
 *  read as a share of something completed. */
const Spinner = () =>
  glyph(
    <g className="origin-center animate-spin motion-reduce:animate-none">
      <circle cx="8" cy="8" r="5.75" className="text-border" />
      <path d="M13.75 8A5.75 5.75 0 0 0 8 2.25" />
    </g>,
  );
