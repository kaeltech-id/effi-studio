import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Tab, TabType } from '../lib/tabs';

/** Outline marks at the spec's stroke weight, inline so `currentColor` keeps
 *  each one on the token its container already set. Same helper shape as
 *  choose-tools.tsx and choose-experiences.tsx — one product, one mark style. */
function Icon({ path, size = 16 }: { path: string; size?: number }) {
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
      // Decorative in every use below: each mark sits beside text, or inside a
      // control that carries its own accessible name.
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const BOX = 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z M4 7.5l8 4.5 8-4.5 M12 12v9';
const TERMINAL = 'M7 9l3 3-3 3 M13.5 15H17';
const GLOBE =
  'M12 4a8 8 0 110 16 8 8 0 010-16 M4 12h16 M12 4c2 2.4 3 5 3 8s-1 5.6-3 8 M12 4c-2 2.4-3 5-3 8s1 5.6 3 8';
const PHONE =
  'M8.5 3h7a1.5 1.5 0 011.5 1.5v15a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 017 19.5v-15A1.5 1.5 0 018.5 3z M10.5 18h3';
const ROBOT =
  'M6 11.5a6 6 0 0112 0V18H6v-6.5z M8.6 5.6L7.2 3.6 M15.4 5.6L16.8 3.6 M9.8 9.2h.01 M14.2 9.2h.01';
const PLUS = 'M12 5v14 M5 12h14';
const CROSS = 'M6 6l12 12 M18 6L6 18';
const DOTS = 'M6 12h.01 M12 12h.01 M18 12h.01';

/** One mark per kind, keyed by the kind itself so a new `TabType` is a
 *  compile error here rather than a blank square at run time. */
const KIND_ICON: Record<TabType, string> = {
  agent: BOX,
  shell: TERMINAL,
  browser: GLOBE,
  ios: PHONE,
  android: ROBOT,
};

/** What the tool is, in the words the setup screens already use
 *  (choose-tools.tsx:62-63). Shown beside the title only when it adds
 *  something the title does not already say. */
const KIND_LABEL: Record<TabType, string> = {
  agent: 'Agent',
  shell: 'Terminal',
  browser: 'Browser',
  ios: 'iOS simulator',
  android: 'Android emulator',
};

/** Width reserved when a panel is anchored under a tab, so a tab near the right
 *  edge opens its panel inside the strip instead of off the window. */
const PANEL_WIDTH = 248;

export interface TabStripProps {
  /** This project's tabs, in the order the user arranged them. Rendered in
   *  exactly this order; the strip never sorts. */
  tabs: Tab[];
  activeTabId: string | null;
  /** Selection only. Mounting whatever the tab hosts is the caller's job. */
  onSelect: (tabId: string) => void;
  /** A tab with no live process. Metadata only — the caller should reach
   *  `api.closeTab` and nothing else. A browser tab always arrives here. */
  onCloseTab: (tab: Tab) => void;
  /** A tab holding a live process, and only after the explicit confirmation
   *  below. The session id is handed over separately so the caller closes THIS
   *  process and never "the current one": ending the session and closing the
   *  tab are two calls (`api.ptyClose` then `api.closeTab`), in that order. */
  onCloseSession: (tab: Tab, sessionId: string) => void;
  /** Opens the Add-a-tool menu. Owned by the caller: this file neither imports
   *  nor renders that menu. */
  onAddTool: () => void;
  /** The provider's display name from the agent registry. Without it an agent
   *  tab shows its raw providerId rather than inventing a prettier one. */
  providerName?: (providerId: string) => string;
  /** The full id order after a move, ready for `api.reorderTabs`. Omit it and
   *  the move items are left out of the menu rather than shown inert. */
  onReorder?: (ids: string[]) => void;
}

/**
 * The workbench's one row of tabs.
 *
 * Three decisions carry this file.
 *
 * 1. ONE ROW, ALWAYS. The tab list is `flex-nowrap` inside an `overflow-x-auto`
 *    box, so twelve tabs at an 800px window become a horizontally scrollable
 *    run, never a second line that would push the terminal down and change the
 *    height of everything below it. The flow bar above deliberately wraps
 *    (flow-bar.tsx:24-26) because six fixed command names must all stay
 *    reachable; tabs are unbounded in number and scroll instead. The `+` sits
 *    outside the scrolling box, so it stays on screen at any tab count.
 *
 * 2. NOTHING IS INFERRED ABOUT A PROCESS. A tab shows what it is and what
 *    provider it answers to. It shows no readiness mark and no activity of any
 *    kind: this app cannot observe whether a REPL sits at its prompt, so any
 *    such mark would be decoration pretending to be telemetry. The single
 *    honest fact is whether `sessionId` is null, and that fact is spent on one
 *    thing only — whether closing needs a confirmation.
 *
 * 3. OPENING AND KILLING ARE THE CALLER'S. Every mutation leaves through a
 *    prop. No effect here starts a process, so the StrictMode double-invoke
 *    that `App.tsx` guards with an `opening` ref and `terminal-pane.tsx` with a
 *    `disposed` flag has nothing to double here. The two effects below only
 *    move focus and scroll.
 */
export function TabStrip({
  tabs,
  activeTabId,
  onSelect,
  onCloseTab,
  onCloseSession,
  onAddTool,
  providerName,
  onReorder,
}: TabStripProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  /** Where focus belongs when a panel is dismissed with Escape. */
  const returnTo = useRef<string | null>(null);

  // Ids, not tab objects: a tab removed while its panel is open resolves to
  // undefined on the next render and the panel closes with it, instead of the
  // panel outliving its subject and acting on a stale copy.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [anchorLeft, setAnchorLeft] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const confirming = tabs.find((t) => t.id === confirmFor) ?? null;
  const menuTab = tabs.find((t) => t.id === menuFor) ?? null;
  const panelOpen = confirming !== null || menuTab !== null;

  // Roving tabindex: one stop for the whole strip. It follows focus, and falls
  // back to the active tab so Tab always re-enters where the user left off.
  const rovingId =
    (focusedId !== null && tabs.some((t) => t.id === focusedId) ? focusedId : null) ??
    activeTabId ??
    (tabs.length > 0 ? tabs[0].id : null);

  // Keeps a tab selected from elsewhere — a keyboard shortcut, a freshly
  // opened tool — inside the scrolling run. It scrolls and nothing else.
  useEffect(() => {
    if (activeTabId === null) return;
    tabRefs.current.get(activeTabId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  // Dismissal for both panels. Registered only while one is open, so the strip
  // adds no document listeners in its resting state.
  useEffect(() => {
    if (!panelOpen) return;

    const dismiss = (restoreFocus: boolean) => {
      setMenuFor(null);
      setConfirmFor(null);
      if (!restoreFocus) return;
      const id = returnTo.current;
      if (id !== null) tabRefs.current.get(id)?.focus();
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      // The trigger is exempt: its own click would otherwise re-open what this
      // handler just closed.
      if (target?.closest('[data-tab-panel]') || target?.closest('[data-panel-trigger]')) return;
      dismiss(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [panelOpen]);

  // Focus into whichever panel opened. Both branches only move focus, so the
  // StrictMode second pass repeats a focus() that is already where it belongs.
  useEffect(() => {
    if (confirmFor !== null) {
      confirmRef.current?.focus();
      return;
    }
    if (menuFor !== null) {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [confirmFor, menuFor]);

  const anchorUnder = (tabId: string) => {
    const el = tabRefs.current.get(tabId);
    const root = rootRef.current;
    if (!el || !root) return;
    const offset = el.getBoundingClientRect().left - root.getBoundingClientRect().left;
    setAnchorLeft(Math.max(0, Math.min(offset, root.clientWidth - PANEL_WIDTH)));
  };

  const focusTab = (id: string) => {
    setFocusedId(id);
    tabRefs.current.get(id)?.focus();
  };

  const step = (from: string, to: number | 'first' | 'last') => {
    const i = tabs.findIndex((t) => t.id === from);
    if (i < 0 || tabs.length === 0) return;
    const next =
      to === 'first'
        ? 0
        : to === 'last'
          ? tabs.length - 1
          : (i + to + tabs.length) % tabs.length;
    focusTab(tabs[next].id);
  };

  /**
   * The whole of Task 62's routing, and the only place it is decided.
   *
   * A tab with no session is metadata, and closing it is one metadata call. A
   * tab holding a session is a process, and no click closes it: the
   * confirmation below is the explicit act, and it is the only path to
   * `onCloseSession`.
   *
   * This is what keeps a browser tab from killing a shell. A browser owns no
   * PTY, so its `sessionId` is null and it leaves through `onCloseTab` — the
   * caller reaches `api.closeTab` and never `api.ptyClose`. The two calls are
   * separate on the Rust side as well (tabs.rs: close_tab never touches the
   * session registry), and they stay separate here.
   */
  const requestClose = (tab: Tab) => {
    setMenuFor(null);
    returnTo.current = tab.id;
    if (tab.sessionId === null) {
      onCloseTab(tab);
      return;
    }
    anchorUnder(tab.id);
    setConfirmFor(tab.id);
  };

  const move = (tab: Tab, delta: number) => {
    const i = tabs.findIndex((t) => t.id === tab.id);
    const j = i + delta;
    if (!onReorder || i < 0 || j < 0 || j >= tabs.length) return;
    const ids = tabs.map((t) => t.id);
    const [moved] = ids.splice(i, 1);
    ids.splice(j, 0, moved);
    setMenuFor(null);
    onReorder(ids);
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const here = items.findIndex((el) => el === document.activeElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    items[(Math.max(here, 0) + delta + items.length) % items.length].focus();
  };

  return (
    // relative, and not a scroll container itself: the panels below hang from
    // this box, so they are never clipped by the tab run's own overflow.
    <div
      ref={rootRef}
      className="relative shrink-0 border-b border-border bg-surface"
    >
      <div className="flex h-10 items-center gap-1 px-2">
        {/* min-w-0 lets this box shrink below its content, which is what turns
            overflow into a scroll instead of a shove; without flex-1 it still
            hugs the tabs while they fit, so the + stays beside the last tab at
            small counts and pinned to the right edge once they do not. */}
        {/* The scrollbar is suppressed in both engines, not styled: an overlay
            scrollbar in WKWebView fades in ON TOP of the tabs it describes, and
            a classic one would add its own height to this 40px row — which is
            the same terminal-resizing defect as wrapping, arriving by a
            different route. Nothing replaces it: a fade gradient at the edge
            would imply more tabs whether or not any exist, and the two honest
            affordances are already here — the run scrolls under wheel and
            trackpad, and every focus move below scrolls its tab into view. */}
        <div
          role="tablist"
          aria-label="Workspace tabs"
          aria-orientation="horizontal"
          className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => {
            // Keyed on the tab's own id, never its position: an index key would
            // re-key every later tab when one closes, remounting panes and
            // taking their sessions with them.
            const active = tab.id === activeTabId;
            const meta =
              tab.type === 'agent'
                ? tab.providerId === null
                  ? null
                  : (providerName?.(tab.providerId) ?? tab.providerId)
                : KIND_LABEL[tab.type];
            // Dropped when the title already says it: "iOS · iOS simulator"
            // spends a second label on a word the user can already read.
            const named = tab.title.trim().toLowerCase();
            const subtitle =
              meta !== null &&
              named.length > 0 &&
              !meta.toLowerCase().includes(named) &&
              !named.includes(meta.toLowerCase())
                ? meta
                : null;

            return (
              <div
                key={tab.id}
                // Presentational wrapper: a tablist owns tabs, so the frame
                // around the three controls must claim no role of its own.
                role="none"
                // A floor and a ceiling, both on the frame. The floor is the
                // chrome a tab cannot do without — 12 pad, a 16 mark, an 8 gap
                // and two 32 controls — plus the title's own 56px floor, so
                // "Codex" never collapses to an unreadable sliver. The
                // ceiling stops one long title from eating the run; past it the
                // title truncates and the two controls, being shrink-0, keep
                // their full 32px. shrink-0 is what makes this a scroll: tabs
                // hold their width and the box below them overflows.
                className={`flex h-9 min-w-[160px] max-w-[260px] shrink-0 items-center rounded-lg border pr-1 transition-colors duration-150 motion-reduce:transition-none ${
                  active
                    ? 'border-copper bg-copper-tint'
                    : 'border-border bg-raised hover:bg-hover'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  // No aria-controls: this component does not own, name or
                  // render the panel a tab reveals. A reference to an id that
                  // may not exist is worse than its absence.
                  aria-selected={active}
                  tabIndex={tab.id === rovingId ? 0 : -1}
                  ref={(el) => {
                    if (el) tabRefs.current.set(tab.id, el);
                    else tabRefs.current.delete(tab.id);
                  }}
                  // Every route into this tab lands here — Tab into the roving
                  // stop, the arrows and Home/End below, a restored focus after
                  // Escape — so the scroll correction is written once. No
                  // `behavior`, which leaves it at the instant default: the
                  // motion contract allows no smooth scrolling, and `nearest`
                  // on both axes moves the run by the minimum, so a tab already
                  // in view is not moved at all and the vertical position of
                  // the strip is never touched.
                  onFocus={(event) => {
                    setFocusedId(tab.id);
                    event.currentTarget.scrollIntoView({
                      block: 'nearest',
                      inline: 'nearest',
                    });
                  }}
                  onClick={() => onSelect(tab.id)}
                  onKeyDown={(event) => {
                    // Focus moves on the arrows; selection waits for Enter or
                    // Space. Arrowing across twelve tabs should not mount
                    // twelve surfaces on the way past.
                    if (event.key === 'ArrowRight') {
                      event.preventDefault();
                      step(tab.id, 1);
                    } else if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      step(tab.id, -1);
                    } else if (event.key === 'Home') {
                      event.preventDefault();
                      step(tab.id, 'first');
                    } else if (event.key === 'End') {
                      event.preventDefault();
                      step(tab.id, 'last');
                    } else if (event.key === 'Delete' || event.key === 'Backspace') {
                      event.preventDefault();
                      requestClose(tab);
                    }
                  }}
                  className={`flex h-full min-w-0 items-center gap-2 rounded-l-lg pl-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper ${
                    active ? 'text-text' : 'text-muted'
                  }`}
                >
                  <span className={active ? 'shrink-0 text-copper' : 'shrink-0'}>
                    <Icon path={KIND_ICON[tab.type]} />
                  </span>
                  {/* The title has a floor of its own, so the frame's ceiling
                      above can never squeeze it to an ellipsis and nothing
                      else: it truncates down to about eight characters and
                      stops there. */}
                  <span
                    className={`max-w-[180px] min-w-[56px] truncate text-sm leading-[20px] ${
                      active ? 'font-semibold' : ''
                    }`}
                  >
                    {tab.title}
                  </span>
                  {subtitle !== null && (
                    // Shrinks, where the title's floor does not: the provider
                    // name is the second thing a user needs off this tab, so it
                    // gives up its width first and truncates rather than
                    // crowding out the name the user actually typed.
                    <span className="min-w-0 truncate text-xs leading-[18px] text-muted">
                      {subtitle}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  data-panel-trigger
                  aria-haspopup="menu"
                  aria-expanded={menuFor === tab.id}
                  aria-label={`Options for ${tab.title}`}
                  onClick={() => {
                    returnTo.current = tab.id;
                    if (menuFor === tab.id) {
                      setMenuFor(null);
                      return;
                    }
                    setConfirmFor(null);
                    anchorUnder(tab.id);
                    setMenuFor(tab.id);
                  }}
                  className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper motion-reduce:transition-none"
                >
                  <Icon path={DOTS} />
                </button>

                <button
                  type="button"
                  // Its own name, distinct from the tab's: a screen reader that
                  // lands here must hear what the control does, not repeat the
                  // tab it sits in.
                  aria-label={`Close ${tab.title}`}
                  onClick={() => requestClose(tab)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper motion-reduce:transition-none"
                >
                  <Icon path={CROSS} size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {tabs.length === 0 && (
          <p className="min-w-0 truncate px-1 text-xs leading-[18px] text-muted">
            No tabs open
          </p>
        )}

        {/* Outside the scrolling run on purpose: at twelve tabs the run is
            scrolled, and the way to open a thirteenth must not be scrolled
            off with it. */}
        <button
          type="button"
          onClick={onAddTool}
          aria-label="Add a tool"
          className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none"
        >
          <Icon path={PLUS} />
        </button>
      </div>

      {menuTab !== null && (
        <div
          ref={menuRef}
          data-tab-panel
          role="menu"
          aria-label={`Options for ${menuTab.title}`}
          onKeyDown={onMenuKeyDown}
          style={{ left: anchorLeft, width: PANEL_WIDTH }}
          className="absolute top-full z-20 mt-1 rounded-lg border border-border bg-raised p-1 shadow-lg"
        >
          {onReorder !== undefined && (
            <>
              <MenuItem
                label="Move left"
                disabled={tabs[0]?.id === menuTab.id}
                onClick={() => move(menuTab, -1)}
              />
              <MenuItem
                label="Move right"
                disabled={tabs[tabs.length - 1]?.id === menuTab.id}
                onClick={() => move(menuTab, 1)}
              />
              <div role="separator" className="my-1 h-px bg-border" />
            </>
          )}
          <MenuItem label="Close tab" onClick={() => requestClose(menuTab)} />
        </div>
      )}

      {confirming !== null && (
        <div
          data-tab-panel
          role="dialog"
          aria-modal="true"
          aria-labelledby="tab-strip-close-heading"
          aria-describedby="tab-strip-close-detail"
          style={{ left: anchorLeft, width: PANEL_WIDTH }}
          className="absolute top-full z-20 mt-1 rounded-lg border border-border bg-raised p-3 shadow-lg"
        >
          <h2
            id="tab-strip-close-heading"
            className="text-sm leading-[20px] font-semibold text-text"
          >
            {confirming.title} has a live session
          </h2>
          {/* States the consequence and its limit. No countdown, no progress,
              nothing claiming to know what the process is doing. */}
          <p id="tab-strip-close-detail" className="mt-2 text-xs leading-[18px] text-muted">
            Ending it stops that one process and closes this tab. No other tab
            and no other session is touched.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmFor(null);
                tabRefs.current.get(confirming.id)?.focus();
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs leading-[18px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none"
            >
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={() => {
                const { sessionId } = confirming;
                // Re-read rather than trusted from when the panel opened: the
                // session may have exited in between, and a null here means
                // there is no longer a process to end.
                if (sessionId === null) {
                  setConfirmFor(null);
                  onCloseTab(confirming);
                  return;
                }
                setConfirmFor(null);
                onCloseSession(confirming, sessionId);
              }}
              className="rounded-lg border border-copper bg-copper px-3 py-1.5 text-xs leading-[18px] font-semibold text-on-copper transition-colors duration-150 hover:bg-copper/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper motion-reduce:transition-none"
            >
              Close session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A menu row. Disabled is a token change, never a transparency: dimmed text
 *  on the same surface keeps its contrast where `opacity` would not. */
function MenuItem({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-full items-center rounded-lg px-2 text-left text-xs leading-[18px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper motion-reduce:transition-none ${
        disabled ? 'cursor-default text-muted' : 'text-text hover:bg-hover'
      }`}
    >
      {label}
    </button>
  );
}
