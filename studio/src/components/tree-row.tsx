import type { GitMark, ProjectState } from '../lib/types';
import { GitMarkGlyph } from './git-mark';
import { StageRail } from './stage-rail';

interface TreeRowProps {
  name: string;
  path: string;
  gitMark: GitMark;
  depth: number;
  /** undefined = a leaf, so no chevron is drawn and nothing is expandable. */
  expanded?: boolean;
  active?: boolean;
  /** Present only on rows that are real projects; container rows get no rail. */
  state?: ProjectState | null;
  onToggle?: () => void;
  onActivate: () => void;
  onRemove?: () => void;
  /** Progress arrived while this row was not the active project. One glyph, no
   *  hue and no motion: MOTION 1 forbids a pulsing or fading marker, so
   *  presence against absence is the whole signal. */
  activity?: boolean;
}

/** Rendered flat rather than as nested lists, so depth travels on aria-level:
 *  without it a screen reader hears a row of siblings, not a tree. */
export function TreeRow({
  name,
  path,
  gitMark,
  depth,
  expanded,
  active,
  state,
  onToggle,
  onActivate,
  onRemove,
  activity,
}: TreeRowProps) {
  return (
    <li role="treeitem" aria-level={depth + 1} className="group flex items-center">
      {/* Indent is padding on the row, not a nested list: a flat list keeps
          every row the same height and keeps keyboard order linear. */}
      <div className="flex min-w-0 flex-1 items-center" style={{ paddingLeft: `${depth * 12}px` }}>
        {expanded === undefined ? (
          <span className="w-5 shrink-0" />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
            className="w-5 shrink-0 font-mono text-xs text-muted"
          >
            {/* The one rotation in the app. MOTION 1 allows a chevron and
                nothing else. */}
            {expanded ? '▾' : '▸'}
          </button>
        )}
        <button
          type="button"
          onClick={onActivate}
          title={path}
          className={`flex min-w-0 flex-1 items-center gap-2 border-l-2 px-2 py-1.5 text-left ${
            active ? 'border-accent bg-ground' : 'border-transparent'
          }`}
        >
          <GitMarkGlyph mark={gitMark} />
          <span
            title={activity ? 'Progress since you last looked' : undefined}
            aria-label={activity ? 'has unseen progress' : undefined}
            className="w-2 shrink-0 text-center font-mono text-xs text-text"
          >
            {activity ? '•' : ''}
          </span>
          {/* Truncate, never wrap: every row stays one line tall. */}
          <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
          {state && <StageRail stage={state.stage} />}
          {state && (
            <span className="font-mono text-xs text-muted">
              {state.done}/{state.total}
            </span>
          )}
        </button>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={`Remove ${name}`}
          aria-label={`Remove ${name}`}
          className="px-2 font-mono text-muted opacity-0 group-hover:opacity-100"
        >
          ✕
        </button>
      )}
    </li>
  );
}
