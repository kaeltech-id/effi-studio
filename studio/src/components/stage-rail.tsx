import { STAGES, type Stage } from '../lib/types';

const SIZE = { sm: 'h-1.5 w-1.5', md: 'h-2 w-2' } as const;

/** Completed dots filled muted, the current one ringed in accent, future dots
 *  at border weight. Idle gives idx -1, so nothing is ringed and all five read
 *  unfilled — the right look for a project that has never run the workflow. */
function dotClass(i: number, current: number, size: keyof typeof SIZE): string {
  const base = `${SIZE[size]} rounded-full shrink-0`;
  if (i === current) return `${base} bg-accent ring-2 ring-accent/30`;
  if (current > -1 && i < current) return `${base} bg-muted`;
  return `${base} border border-border`;
}

interface StageRailProps {
  stage: Stage;
  size?: keyof typeof SIZE;
}

/** One component, three placements — sidebar row, project header, history entry.
 *  The order is fixed by the workflow in CLAUDE.md and never varies. */
export function StageRail({ stage, size = 'sm' }: StageRailProps) {
  const current = STAGES.indexOf(stage);
  return (
    // The dots carry the stage visually, so the label carries it for a reader.
    <div className="flex items-center gap-1" aria-label={`stage: ${stage}`}>
      {STAGES.map((s, i) => (
        <span key={s} title={s} className={dotClass(i, current, size)} />
      ))}
    </div>
  );
}
