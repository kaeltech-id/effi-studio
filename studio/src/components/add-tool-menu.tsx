import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Agent } from '../lib/agents';
import type { TabType } from '../lib/tabs';
import type { ComponentId, ComponentReport } from '../lib/types';

/**
 * The menu behind the `+` at the end of the tab strip.
 *
 * ONE MODEL, AND IT IS NOT THE ONBOARDING ONE. Everything here is an
 * open-a-tab action: pressing a row either puts a surface in the workbench or
 * sends the user to the setup that would make that possible. Onboarding's
 * ticks are a different model over the same component ids — a selection of
 * what to install or link — and the two are deliberately not wired together.
 * Nothing in this file reads, writes or imports a `Selection`, a `SetupItem`,
 * a `SetupPlan` or a `SetupOp`; there is no checkbox and no `selected` flag,
 * and nothing here installs anything. A row that needs setup hands a
 * `SetupTarget` to the host and stops. That is what keeps "I ticked Browser
 * during setup" from reading as "a browser tab is open", and keeps a click in
 * this menu from ever starting an install.
 */

/** Outline marks at the spec's stroke weight, inline so `currentColor` keeps
 *  each one on the token its container already set. */
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
      // Decorative: every mark here sits beside the text that names it.
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const PLUS = 'M12 5v14 M5 12h14';
const BOX = 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z M4 7.5l8 4.5 8-4.5 M12 12v9';
const TERMINAL = 'M7 9l3 3-3 3 M13.5 15H17';
const GLOBE =
  'M12 3a9 9 0 110 18 9 9 0 010-18z M3.4 9.5h17.2 M3.4 14.5h17.2 M12 3c2.3 2.4 3.5 5.6 3.5 9s-1.2 6.6-3.5 9c-2.3-2.4-3.5-5.6-3.5-9s1.2-6.6 3.5-9z';
const PHONE =
  'M8.5 3h7a1.5 1.5 0 011.5 1.5v15a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 017 19.5v-15A1.5 1.5 0 018.5 3z M10.5 18h3';
const ROBOT =
  'M6 11.5a6 6 0 0112 0V18H6v-6.5z M8.6 5.6L7.2 3.6 M15.4 5.6L16.8 3.6 M9.8 9.2h.01 M14.2 9.2h.01';
const GEAR =
  'M12 9.2a2.8 2.8 0 110 5.6 2.8 2.8 0 010-5.6 M19.3 14.4a1.5 1.5 0 00.3 1.7l.1.1a1.9 1.9 0 11-2.7 2.7l-.1-.1a1.5 1.5 0 00-2.6 1.1v.2a1.9 1.9 0 11-3.8 0v-.1a1.5 1.5 0 00-2.6-1.1l-.1.1a1.9 1.9 0 11-2.7-2.7l.1-.1a1.5 1.5 0 00-1.1-2.6h-.2a1.9 1.9 0 110-3.8h.1a1.5 1.5 0 001.1-2.6l-.1-.1a1.9 1.9 0 112.7-2.7l.1.1a1.5 1.5 0 002.6-1.1V3.4a1.9 1.9 0 113.8 0v.1a1.5 1.5 0 002.6 1.1l.1-.1a1.9 1.9 0 112.7 2.7l-.1.1a1.5 1.5 0 001.1 2.6h.2a1.9 1.9 0 110 3.8h-.1a1.5 1.5 0 00-1.4.9z';
const CHEVRON = 'M9 6l6 6-6 6';

/** The three states a row can be in, and the whole of the rule the menu is
 *  built on: `available` opens a tab, `missing` opens the setup that would make
 *  opening possible, and `unsupported` explains itself and offers nothing. */
export type AddToolItemState = 'available' | 'missing' | 'unsupported';

/** The four tab kinds that are not an agent session. Derived from `TabType`
 *  rather than re-listed, so a new surface in tabs.ts is a type error here
 *  instead of a row nobody added. */
export type WorkspaceToolKind = Exclude<TabType, 'agent'>;

/** What the host is asked to open when a row cannot open a tab yet. It carries
 *  the probe's own words, so the screen that opens can say which repair this
 *  is — a missing SDK and a missing AVD are not one errand. This is a request
 *  to SHOW setup, never an instruction to perform it. */
export type SetupTarget =
  | { kind: 'agent'; agentId: string; name: string; reason: string }
  | { kind: 'component'; component: ComponentId; name: string; reason: string };

interface ItemBase {
  key: string;
  name: string;
  icon: string;
}

/** A resolved row. The `unsupported` variant has no `activate` field at all:
 *  there is no handler in existence to attach to it, so no amount of later
 *  editing can give an impossible row a working button. */
type MenuItem =
  | (ItemBase & { state: 'available'; statusLabel: string; activate: () => void })
  | (ItemBase & { state: 'missing'; statusLabel: string; note: string; activate: () => void })
  | (ItemBase & { state: 'unsupported'; reason: string });

function reportFor(reports: ComponentReport[], id: ComponentId): ComponentReport | undefined {
  return reports.find((r) => r.id === id);
}

/** The reason text, in the probe's own words wherever it has any. doctor.rs
 *  puts the failure in `error` and the thing it found in `detail`, so an Xcode
 *  that exists and still cannot run a simulator reads as both. */
function reasonFrom(report: ComponentReport | undefined, fallback: string): string {
  if (!report) return fallback;
  if (report.error && report.detail) return `${report.error} (${report.detail})`;
  return report.error ?? report.detail ?? fallback;
}

/** Whether a tab of this kind can be OPENED right now. It reads a diagnostic
 *  and nothing else — never a stored choice, never a ticked box.
 *
 *  `ready` is the only status that opens a tab, because it is the only one
 *  where a relevant diagnostic actually passed. `unavailable` is the machine
 *  saying the tool cannot exist here, which is not a thing setup can fix.
 *  Everything in between — `detected`, `needsAttention`, and the setup-flow
 *  statuses — routes to setup rather than to a tab: found on disk is not
 *  runnable, having the SDK is not having a device, and a tab that fails on
 *  open is exactly the button that pretends to work. */
function openability(report: ComponentReport | undefined): AddToolItemState {
  if (!report) return 'missing';
  switch (report.status) {
    case 'ready':
      return 'available';
    case 'unavailable':
      return 'unsupported';
    default:
      return 'missing';
  }
}

/** The registry id a provider is listed under, mapped to the id its diagnostic
 *  is filed under. A user-defined CLI has no diagnostic and gets none. */
function componentForAgent(agentId: string): ComponentId | null {
  if (agentId === 'claude-code') return 'claude';
  if (agentId === 'codex') return 'codex';
  return null;
}

export interface AddToolMenuProps {
  /** Every configured provider, unresolvable ones included. A provider whose
   *  executable was not found stays in this list and stays in the menu — it is
   *  a row that needs setup, not a row to delete. */
  agents: Agent[];
  /** The latest diagnostics. Read-only here. */
  reports: ComponentReport[];
  /** Open a session tab for this provider id (agents.rs's id, not a path). */
  onOpenAgentTab: (agentId: string) => void;
  /** Open a tab of one of the non-agent kinds. */
  onOpenToolTab: (kind: WorkspaceToolKind) => void;
  /** Show the setup for something that cannot open yet. The host performs it;
   *  this menu only asks for it to be shown. */
  onOpenSetup: (target: SetupTarget) => void;
  /** Point the app at a CLI it does not know about. */
  onConfigureCli: () => void;
  onManageTools: () => void;
  className?: string;
}

/** A row the user can press. `available` is mint on the right because the tool
 *  is healthy; `missing` is accent because setup is the primary action being
 *  offered. The two tokens never swap. */
function ActionRow({ item }: { item: Exclude<MenuItem, { state: 'unsupported' }> }) {
  const ready = item.state === 'available';
  return (
    <li>
      <button
        type="button"
        data-add-tool-item=""
        onClick={item.activate}
        className="flex w-full items-start gap-3 px-4 py-2 text-left transition-colors duration-150 hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text">
          <Icon path={item.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="block truncate text-sm leading-[21px] text-text">{item.name}</span>
          {!ready && 'note' in item && (
            <span className="block pt-1 text-xs leading-[18px] text-muted">{item.note}</span>
          )}
        </span>
        <span
          className={`flex shrink-0 items-center gap-1 pt-0.5 text-xs leading-[18px] ${
            ready ? 'text-success' : 'text-accent'
          }`}
        >
          {item.statusLabel}
          {!ready && (
            <span aria-hidden="true">
              <Icon path={CHEVRON} size={14} />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** A row that cannot do anything, rendered with nothing to press.
 *
 *  There is no `<button>` here and no click handler anywhere on it: the row is
 *  not a disabled control that could be re-enabled by deleting an attribute,
 *  it is static text. Nothing is dimmed to say so — `text-muted` on this
 *  surface stays well above 4.5:1, and the dashed frame plus `cursor-not-allowed`
 *  carry the "inert" meaning that low contrast would otherwise have to. */
function UnsupportedRow({ item }: { item: Extract<MenuItem, { state: 'unsupported' }> }) {
  return (
    <li className="flex cursor-not-allowed items-start gap-3 px-4 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-muted text-muted">
        <Icon path={item.icon} size={16} />
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block truncate text-sm leading-[21px] text-muted">{item.name}</span>
        <span className="block pt-1 text-xs leading-[18px] text-muted">{item.reason}</span>
      </span>
      <span className="shrink-0 pt-0.5 text-xs leading-[18px] text-muted">Unavailable</span>
    </li>
  );
}

function SectionLabel({ id, children }: { id: string; children: string }) {
  return (
    <h3
      id={id}
      className="px-4 pt-3 pb-1 text-xs leading-[18px] font-semibold tracking-[0.08em] text-muted uppercase"
    >
      {children}
    </h3>
  );
}

export function AddToolMenu({
  agents,
  reports,
  onOpenAgentTab,
  onOpenToolTab,
  onOpenSetup,
  onConfigureCli,
  onManageTools,
  className = '',
}: AddToolMenuProps) {
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();
  const agentsLabelId = useId();
  const toolsLabelId = useId();

  /** Escape closes and gives the trigger its focus back. Every other way out
   *  leaves focus where the user put it: after opening a tab, focus belongs to
   *  the tab, not to the `+`. */
  const closeToTrigger = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const runAndClose = useCallback((action: () => void) => {
    setOpen(false);
    action();
  }, []);

  // Entrance only, and it never dims anything at rest: the popover arrives over
  // 150ms and sits at full opacity, with the whole move skipped under
  // prefers-reduced-motion.
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Open on the first row, so the keyboard lands somewhere useful.
  useEffect(() => {
    if (!open) return;
    const first = popoverRef.current?.querySelector<HTMLButtonElement>('[data-add-tool-item]');
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeToTrigger();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const popover = popoverRef.current;
      if (!popover || !popover.contains(document.activeElement)) return;
      const items = Array.from(
        popover.querySelectorAll<HTMLButtonElement>('[data-add-tool-item]'),
      );
      if (items.length === 0) return;
      event.preventDefault();
      const here = items.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = (here + step + items.length) % items.length;
      items[next]?.focus();
    };

    // Pointer, not click: closing on the press means the menu is gone before a
    // click can land on whatever was underneath it.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, closeToTrigger]);

  // --- Agent sessions ------------------------------------------------------
  //
  // Every configured provider appears, in registry order. `needsAttention`
  // means the resolver could not find the executable, which is a row that
  // names the path it tried and offers setup — never a row that disappears.
  // A provider is only impossible when its own diagnostic says `unavailable`,
  // which outranks the resolver: a provider that cannot run on this machine is
  // not one waiting to be installed.
  const agentItems: MenuItem[] = agents.map((agent) => {
    const component = componentForAgent(agent.id);
    const report = component ? reportFor(reports, component) : undefined;

    if (report?.status === 'unavailable') {
      return {
        key: agent.id,
        name: agent.name,
        icon: BOX,
        state: 'unsupported',
        reason: reasonFrom(report, `${agent.name} cannot run on this computer.`),
      };
    }

    if (agent.status === 'ready') {
      return {
        key: agent.id,
        name: agent.name,
        icon: BOX,
        state: 'available',
        statusLabel: 'Available',
        activate: () => runAndClose(() => onOpenAgentTab(agent.id)),
      };
    }

    const reason = agent.detail ?? `${agent.name} was not found on this computer.`;
    return {
      key: agent.id,
      name: agent.name,
      icon: BOX,
      state: 'missing',
      statusLabel: 'Set up',
      note: reason,
      activate: () =>
        runAndClose(() =>
          onOpenSetup({ kind: 'agent', agentId: agent.id, name: agent.name, reason }),
        ),
    };
  });

  /** Pointing the app at a CLI it has never heard of. Its setup is the only
   *  thing it can do, so it is a `missing` row and says `Configure`. */
  const otherCli: MenuItem = {
    key: 'other-cli',
    name: 'Other CLI',
    icon: TERMINAL,
    state: 'missing',
    statusLabel: 'Configure',
    note: 'Point Effi at a command-line agent it does not know yet.',
    activate: () => runAndClose(onConfigureCli),
  };

  // --- The non-agent surfaces ----------------------------------------------

  function toolItem(
    component: ComponentId,
    kind: WorkspaceToolKind,
    name: string,
    icon: string,
    readyLabel: string,
    fallbackReason: string,
  ): MenuItem {
    const report = reportFor(reports, component);
    const state = openability(report);

    if (state === 'unsupported') {
      return { key: kind, name, icon, state, reason: reasonFrom(report, fallbackReason) };
    }
    if (state === 'available') {
      return {
        key: kind,
        name,
        icon,
        state,
        statusLabel: readyLabel,
        activate: () => runAndClose(() => onOpenToolTab(kind)),
      };
    }
    const reason = reasonFrom(report, fallbackReason);
    return {
      key: kind,
      name,
      icon,
      state,
      statusLabel: 'Set up',
      note: reason,
      activate: () => runAndClose(() => onOpenSetup({ kind: 'component', component, name, reason })),
    };
  }

  const toolItems: MenuItem[] = [
    // The shell has no ComponentId and no probe because there is nothing to
    // probe: it is a facility of the app, present on every machine that can
    // run the app at all. It is listed as included rather than as something
    // that was checked and passed.
    {
      key: 'shell',
      name: 'Terminal',
      icon: TERMINAL,
      state: 'available',
      statusLabel: 'Included',
      activate: () => runAndClose(() => onOpenToolTab('shell')),
    },
    toolItem(
      'browser',
      'browser',
      'Browser',
      GLOBE,
      'Enabled',
      'No webview engine is known for this platform.',
    ),
    toolItem(
      'ios',
      'ios',
      'iOS Simulator',
      PHONE,
      'Available',
      'iOS simulators exist only on macOS.',
    ),
    toolItem(
      'android',
      'android',
      'Android Emulator',
      ROBOT,
      'Available',
      'The Android SDK was not found on this computer.',
    ),
  ];

  function renderItem(item: MenuItem) {
    return item.state === 'unsupported' ? (
      <UnsupportedRow key={item.key} item={item} />
    ) : (
      <ActionRow key={item.key} item={item} />
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Add a tool"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none ${
          open
            ? 'border-accent bg-accent-tint text-accent'
            : 'border-border bg-raised text-muted hover:bg-hover hover:text-text'
        }`}
      >
        <Icon path={PLUS} size={16} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          aria-labelledby={headingId}
          className={`absolute top-full right-0 z-30 mt-2 max-h-[min(70vh,480px)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[10px] border border-border bg-surface shadow-lg transition-[opacity,transform] duration-150 motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
            entered ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
          }`}
        >
          <h2
            id={headingId}
            className="px-4 pt-4 pb-1 text-sm leading-[20px] font-semibold text-text"
          >
            Add a tool
          </h2>

          <SectionLabel id={agentsLabelId}>Agent sessions</SectionLabel>
          <ul aria-labelledby={agentsLabelId}>
            {agentItems.map(renderItem)}
            {renderItem(otherCli)}
          </ul>

          <SectionLabel id={toolsLabelId}>Workspace tools</SectionLabel>
          <ul aria-labelledby={toolsLabelId} className="pb-2">
            {toolItems.map(renderItem)}
          </ul>

          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => runAndClose(onManageTools)}
              data-add-tool-item=""
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted">
                <Icon path={GEAR} size={18} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm leading-[21px] text-text">
                Manage tools in Settings
              </span>
              <span className="shrink-0 text-muted" aria-hidden="true">
                <Icon path={CHEVRON} size={14} />
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
