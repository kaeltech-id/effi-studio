import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Project, ProjectState, TreeLevel } from '../lib/types';
import { TreeRow } from './tree-row';

/** Mirrors MAX_CHILDREN in tree.rs. The cap is enforced there; this is only
 *  how the withheld count is explained. */
const MAX_CHILDREN = 50;

/** The two shared interaction classes. Written once so a card, a menu row and
 *  an icon button cannot drift apart. */
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const MOTION = 'transition-colors duration-150 motion-reduce:transition-none';

/** The Contract draws one blue tile and one violet tile. Blue and violet are
 *  brand colours and may only ever be a FILL -- styles.css:7-14 and
 *  tests/test_studio_guards.py ban them from text, borders, rings and strokes,
 *  because they measure 3.82:1 and 4.49:1 on navy. Here they carry nothing but
 *  an initial, and the initial is set at 19px/700 so it clears the WCAG
 *  large-text floor on violet, the darker of the two.
 *
 *  Which project gets which is a stable hash of its id, not its position: a
 *  card keeps its colour when the list above it grows. It encodes nothing --
 *  there is no meaning to read off the fill. */
const TILE_FILLS = ['bg-brand-blue', 'bg-brand-violet'] as const;

function tileFill(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_FILLS[hash % TILE_FILLS.length];
}

interface ProjectSidebarProps {
  projects: Project[];
  activeId: string | null;
  states: Record<string, ProjectState>;
  /** Expanded absolute paths. Session state only — never persisted, so
      browsing can never disagree with studio.json. */
  expanded: Set<string>;
  /** Keyed by absolute path; absent means "not loaded yet". */
  levels: Record<string, TreeLevel>;
  onSelect: (id: string) => void;
  onToggle: (path: string) => void;
  onPromote: (path: string) => void;
  /** Accepted and deliberately unused: the workspace rail owns `Add project`
      now, in its footer and next to the WORKSPACE label. A second add control
      inside the list it sits above would be the same action twice. The prop
      stays so callers that still pass it keep type-checking. */
  onAdd?: () => void;
  onRemove: (id: string) => void;
  /** Project ids whose state moved while they were not active. A Set rather
      than a per-row flag so the sidebar stays a pure render of App's state. */
  activity: Set<string>;
}

/** A non-interactive row: loading, empty, or the capped tail. Kept at row
 *  height and indented like a child so an expansion never breaks the rhythm
 *  of the list. */
function Note({ depth, text, title }: { depth: number; text: string; title?: string }) {
  return (
    <li
      role="treeitem"
      aria-level={depth + 1}
      aria-disabled="true"
      title={title}
      className="px-2 py-1.5 font-mono text-xs text-muted"
      style={{ paddingLeft: `${depth * 12 + 28}px` }}
    >
      {text}
    </li>
  );
}

/** The Contract's branch pill: git glyph, branch name, full round. Same shape
 *  as the one in history-panel.tsx, and like that one it renders only when a
 *  branch actually exists — `ProjectState.branch` is `string | null`, and null
 *  draws nothing rather than an empty pill. */
function BranchPill({ branch }: { branch: string }) {
  return (
    <span
      title={branch}
      className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3 shrink-0"
      >
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
      <span className="max-w-16 truncate">{branch}</span>
    </span>
  );
}

/** The Contract's ellipsis. It is a real menu, not an ornament: the app forbids
 *  a dead control, so the one action this card owns — removing the project —
 *  lives behind it. It replaces the hover-only `✕` the old row carried, which
 *  was unreachable without a pointer.
 *
 *  Escape closes and returns focus to the trigger; a press anywhere outside
 *  closes without stealing the click. Both are add-tool-menu.tsx's pattern,
 *  kept identical so the two popovers behave the same way. */
function ProjectMenu({ name, onRemove }: { name: string; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Open on the item, so the keyboard lands inside the menu it just opened.
    menuRef.current?.querySelector<HTMLButtonElement>('[data-project-menu-item]')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    // Pointer, not click: closing on the press means the menu is gone before a
    // click can land on whatever was underneath it.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
        onClick={() => setOpen((was) => !was)}
        className={`grid size-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-text ${MOTION} ${FOCUS}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${name}`}
          className="absolute right-0 top-full z-20 mt-1 min-w-40 overflow-hidden rounded-xl border border-border bg-raised py-1"
        >
          <button
            type="button"
            role="menuitem"
            data-project-menu-item=""
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className={`block w-full px-3 py-2 text-left text-sm text-text hover:bg-hover ${MOTION} focus-visible:bg-hover ${FOCUS}`}
          >
            Remove project
          </button>
        </div>
      )}
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  /** null means the plan was never read for this project; it is not a zero. */
  state: ProjectState | null;
  selected: boolean;
  expanded: boolean;
  activity: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRemove: () => void;
  /** The folder rows, already built by the sidebar. Empty while collapsed. */
  tree: ReactNode[];
}

/** One project: initial tile, name, subtitle, branch pill, ellipsis, and the
 *  chevron that opens its folder tree underneath. */
function ProjectCard({
  project,
  state,
  selected,
  expanded,
  activity,
  onSelect,
  onToggle,
  onRemove,
  tree,
}: ProjectCardProps) {
  const treeId = useId();
  const branch = state?.branch ?? null;

  return (
    <li
      className={`rounded-xl border p-2.5 ${MOTION} ${
        selected ? 'border-accent bg-accent-tint' : 'border-border bg-surface'
      }`}
    >
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? 'true' : undefined}
          title={project.path}
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-0.5 text-left hover:bg-hover ${MOTION} ${FOCUS}`}
        >
          <span
            aria-hidden
            className={`grid size-9 shrink-0 place-items-center rounded-lg text-[19px] font-bold leading-none text-text ${tileFill(
              project.id,
            )}`}
          >
            {project.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-semibold text-text">
                {project.name}
              </span>
              {/* MOTION 1 forbids a pulsing marker, so presence against absence
                  is the whole signal — the same contract TreeRow's dot keeps. */}
              {activity && (
                <span
                  role="img"
                  aria-label="has unseen progress"
                  title="Progress since you last looked"
                  className="size-1.5 shrink-0 rounded-full bg-accent"
                />
              )}
            </span>
            {/* The Contract's subtitle slot. What the mockup puts there is
                sample data, so this carries the two things the app knows:
                where the folder is, and how far its plan has got. The counter
                is dropped, not zeroed, when no plan was read. */}
            <span className="mt-0.5 flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{project.path}</span>
              {state && (
                <span className="shrink-0 font-mono text-xs text-muted">
                  {state.done}/{state.total}
                </span>
              )}
            </span>
          </span>
        </button>

        {branch !== null && <BranchPill branch={branch} />}
        <ProjectMenu name={project.name} onRemove={onRemove} />

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={expanded ? treeId : undefined}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${project.name}`}
          className={`grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-text ${MOTION} ${FOCUS}`}
        >
          {/* The one rotation in the app. MOTION 1 allows a chevron and
              nothing else. */}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`size-4 transition-transform duration-150 motion-reduce:transition-none ${
              expanded ? '' : '-rotate-90'
            }`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {expanded && (
        // The Contract's 1px guide line. One line, at the root of the tree:
        // a per-level guide would have to be drawn inside TreeRow, and TreeRow
        // is reused verbatim here, never rewritten.
        <div className="mt-2 border-l border-border pl-2">
          <ul id={treeId} role="tree" aria-label={`${project.name} folders`}>
            {tree}
          </ul>
        </div>
      )}
    </li>
  );
}

export function ProjectSidebar({
  projects,
  activeId,
  states,
  expanded,
  levels,
  onSelect,
  onToggle,
  onPromote,
  onRemove,
  activity,
}: ProjectSidebarProps) {
  // A child that is already a configured project keeps its identity: it shows
  // that project's rail and selects rather than promoting a second time.
  const byPath = new Map(projects.map((p) => [p.path, p]));

  function renderChildren(path: string, depth: number): ReactNode[] {
    if (!expanded.has(path)) return [];

    const level = levels[path];
    if (!level) return [<Note key={`${path}:loading`} depth={depth} text="loading…" />];
    if (level.children.length === 0) {
      // Said out loud rather than collapsing silently: the chevron promised
      // something was inside, so an empty level has to answer that.
      return [<Note key={`${path}:empty`} depth={depth} text="empty" />];
    }

    const rows: ReactNode[] = [];
    for (const child of level.children) {
      const project = byPath.get(child.path);
      rows.push(
        <TreeRow
          key={child.path}
          name={child.name}
          path={child.path}
          gitMark={child.gitMark}
          depth={depth}
          expanded={child.hasChildren ? expanded.has(child.path) : undefined}
          active={project ? project.id === activeId : false}
          state={project ? (states[project.id] ?? null) : undefined}
          onToggle={() => onToggle(child.path)}
          onActivate={() => (project ? onSelect(project.id) : onPromote(child.path))}
        />,
      );
      rows.push(...renderChildren(child.path, depth + 1));
    }

    if (level.hidden > 0) {
      rows.push(
        <Note
          key={`${path}:hidden`}
          depth={depth}
          text={`+${level.hidden} more`}
          title={`Showing the first ${MAX_CHILDREN} folders`}
        />,
      );
    }
    return rows;
  }

  /* TASK 110. The COLUMN owns the width now — 220/208/192 by band, and a 260px
   * drawer below 900px (App.tsx) — so this nav fills whatever it is given
   * instead of asserting 256px of its own. A `w-64 shrink-0` here would
   * overflow every one of the four bands.
   *
   * It no longer owns a header or a scroller either: the workspace rail puts
   * the WORKSPACE label and the search field above it and scrolls this list in
   * its own region, so a second heading and a second scroll container would
   * both be duplicates. */
  if (projects.length === 0) {
    // The first thing a new user sees, so it says what to do rather than nothing.
    return (
      <p className="px-1 py-2 text-sm text-muted">
        No projects yet. Add a folder to watch its EffiClaude workflow.
      </p>
    );
  }

  return (
    <nav aria-label="Projects" className="flex min-w-0 flex-col">
      <ul className="flex min-w-0 flex-col gap-3">
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            state={states[p.id] ?? null}
            selected={p.id === activeId}
            expanded={expanded.has(p.path)}
            activity={activity.has(p.id)}
            onSelect={() => onSelect(p.id)}
            onToggle={() => onToggle(p.path)}
            onRemove={() => onRemove(p.id)}
            // Depth 0: the project is a card now, not a tree row, so its
            // folders are the roots of their own tree and start at aria-level 1.
            tree={renderChildren(p.path, 0)}
          />
        ))}
      </ul>
    </nav>
  );
}
