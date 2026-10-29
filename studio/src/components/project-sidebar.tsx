import type { ReactNode } from 'react';
import type { Project, ProjectState, TreeLevel } from '../lib/types';
import { TreeRow } from './tree-row';

/** Mirrors MAX_CHILDREN in tree.rs. The cap is enforced there; this is only
 *  how the withheld count is explained. */
const MAX_CHILDREN = 50;

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
  onAdd: () => void;
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

export function ProjectSidebar({
  projects,
  activeId,
  states,
  expanded,
  levels,
  onSelect,
  onToggle,
  onPromote,
  onAdd,
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

  return (
    <nav className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-sm">Projects</span>
        <span className="font-mono text-xs text-muted">{projects.length}</span>
      </header>

      {projects.length === 0 ? (
        // The first thing a new user sees, so it says what to do rather than nothing.
        <p className="flex-1 p-4 text-sm text-muted">
          No projects yet. Add a folder to watch its EffiClaude workflow.
        </p>
      ) : (
        <ul role="tree" aria-label="Projects" className="flex-1 overflow-y-auto">
          {projects.flatMap((p) => [
            <TreeRow
              key={p.id}
              name={p.name}
              path={p.path}
              gitMark={p.gitMark}
              depth={0}
              expanded={expanded.has(p.path)}
              active={p.id === activeId}
              state={states[p.id] ?? null}
              onToggle={() => onToggle(p.path)}
              onActivate={() => onSelect(p.id)}
              onRemove={() => onRemove(p.id)}
              activity={activity.has(p.id)}
            />,
            ...renderChildren(p.path, 1),
          ])}
        </ul>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="shrink-0 border-t border-border p-3 text-left text-sm text-muted"
      >
        Add Folder…
      </button>
    </nav>
  );
}
