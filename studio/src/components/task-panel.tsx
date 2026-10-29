import { useEffect, useRef } from 'react';
import type { ProjectState } from '../lib/types';

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-muted">{children}</p>;
}

/** Display only. The CLI is the sole writer of the checklist, so nothing here
 *  is interactive — a clickable checkbox would imply otherwise. */
export function TaskPanel({ state }: { state: ProjectState | null }) {
  const firstPending = useRef<HTMLLIElement | null>(null);

  // Only on arrival or on real progress. Running this on every render would
  // fight a deliberate scroll upward to re-read an earlier task, and
  // `block: 'nearest'` keeps an already-visible task from jumping. No
  // `behavior: 'smooth'` — MOTION 1 forbids the animation.
  useEffect(() => {
    firstPending.current?.scrollIntoView({ block: 'nearest' });
  }, [state?.featureTitle, state?.done]);

  if (!state) return <Empty>No project selected</Empty>;

  if (state.tasks.length === 0) {
    // The raw-markdown fallback is the recorded mitigation for parser drift.
    // It is not dead code and must not be removed as such.
    return state.rawPlan ? (
      <pre className="h-full overflow-auto p-4 font-mono text-xs whitespace-pre-wrap text-muted">
        {state.rawPlan}
      </pre>
    ) : (
      <Empty>No plan yet — run /ec-feature</Empty>
    );
  }

  const pendingIndex = state.tasks.findIndex((t) => !t.done);

  return (
    <ol className="h-full overflow-y-auto p-2">
      {state.tasks.map((t, i) => (
        <li
          key={i}
          ref={i === pendingIndex ? firstPending : null}
          className="flex gap-2 px-2 py-1 font-mono text-xs"
        >
          <span className={t.done ? 'text-accent' : 'text-muted'}>{t.done ? '✓' : '○'}</span>
          {/* Verbatim, tags and all — [M], [agent: …] and [design: …] are information. */}
          <span className={t.done ? 'text-muted line-through' : 'text-text'}>{t.text}</span>
        </li>
      ))}
    </ol>
  );
}
