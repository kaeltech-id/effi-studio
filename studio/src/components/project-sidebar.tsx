import type { Project, ProjectState } from '../lib/types';
import { StageRail } from './stage-rail';

interface ProjectSidebarProps {
  projects: Project[];
  activeId: string | null;
  states: Record<string, ProjectState>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export function ProjectSidebar({
  projects,
  activeId,
  states,
  onSelect,
  onAdd,
  onRemove,
}: ProjectSidebarProps) {
  return (
    <nav className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      {projects.length === 0 ? (
        // The first thing a new user sees, so it says what to do rather than nothing.
        <p className="flex-1 p-4 text-sm text-muted">
          No projects yet. Add a folder to watch its EffiClaude workflow.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {projects.map((p) => {
            const state = states[p.id];
            const active = p.id === activeId;
            return (
              <li key={p.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  title={p.path}
                  className={`flex min-w-0 flex-1 items-center gap-2 border-l-2 px-3 py-2 text-left ${
                    active ? 'border-accent bg-ground' : 'border-transparent'
                  }`}
                >
                  {/* Truncate, never wrap: every row stays one line tall. */}
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <StageRail stage={state?.stage ?? 'Idle'} />
                  {/* 0/0 renders rather than hides, so the column stays aligned. */}
                  <span className="font-mono text-xs text-muted">
                    {state?.done ?? 0}/{state?.total ?? 0}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  title={`Remove ${p.name}`}
                  aria-label={`Remove ${p.name}`}
                  className="px-2 text-muted opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="border-t border-border p-3 text-left text-sm text-muted"
      >
        Add Folder…
      </button>
    </nav>
  );
}
