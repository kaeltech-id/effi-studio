import type { GitMark } from '../lib/types';

/** Weight and fill carry the state, never a new color: the palette has six
 *  entries and the accent is already spoken for by the active project and the
 *  stage badge. A repo reads at text weight, a tracked child at muted weight,
 *  and an untracked folder as an outline. */
const MARK = {
  repo: { glyph: '◆', className: 'text-text', label: 'git repository' },
  inRepo: { glyph: '◇', className: 'text-muted', label: 'inside a git repository' },
  plain: { glyph: '·', className: 'text-border', label: 'not a git repository' },
} as const;

export function GitMarkGlyph({ mark }: { mark: GitMark }) {
  const m = MARK[mark];
  return (
    <span
      title={m.label}
      aria-label={m.label}
      className={`w-3 shrink-0 text-center font-mono text-xs ${m.className}`}
    >
      {m.glyph}
    </span>
  );
}
