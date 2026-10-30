import type { ReactNode } from 'react';

interface PanelSectionProps {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  /** Shown beside the title at muted weight — a count or a branch name. */
  detail?: string;
  children: ReactNode;
}

/** The rail's repeated shape. Collapsed, a section is its header and nothing
 *  else, so the open sections take the freed space; the whole header is the hit
 *  target because there is no second action competing for it. */
export function PanelSection({ title, collapsed, onToggle, detail, children }: PanelSectionProps) {
  return (
    <section
      className={`flex min-h-0 flex-col border-b border-border ${collapsed ? 'shrink-0' : 'flex-1'}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        // Inset ring, like every other full-width control in the rail: an
        // outward offset on a header that spans its section would be drawn
        // half outside the section's own border.
        className="flex h-8 shrink-0 items-center gap-2 px-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        {/* The one rotation in the app. MOTION 1 allows a chevron, nothing else.
            Hidden from assistive tech: `aria-expanded` above already says open
            or closed, and the glyph would otherwise be announced by its
            Unicode name before the title the user is looking for. */}
        <span aria-hidden="true" className="w-4 shrink-0 font-mono text-xs text-muted">
          {collapsed ? '▸' : '▾'}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
        {detail && <span className="font-mono text-xs text-muted">{detail}</span>}
      </button>
      {!collapsed && <div className="min-h-0 flex-1 overflow-hidden">{children}</div>}
    </section>
  );
}
