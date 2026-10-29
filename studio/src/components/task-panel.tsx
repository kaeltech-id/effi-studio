import { useEffect, useRef } from 'react';
import type { ProjectState } from '../lib/types';

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm leading-[20px] text-muted">{children}</p>;
}

/** Whose plan this is, stated on the panel itself. The inspector keeps showing
 *  the PROJECT's plan while a tab for another provider is active — that is
 *  correct, the plan belongs to the project — so the label is what stops it
 *  reading as the active provider's progress (DESIGN-SPEC.md §6).
 *
 *  It is unconditional because there is exactly one source today:
 *  `read_project_state` reads `.claude/plans/{branch}.md` and nothing else
 *  (src-tauri/src/plan.rs:210), so every task and every raw fallback below came
 *  from a `.claude` plan file. If a second plan source is ever added, the choice
 *  between them must become an explicit, user-visible selection — NOT
 *  first-wins in the reader and NOT guessed from this label. Not built here.
 *
 *  `percent` rides along the same line only because the mockup puts it there.
 *  It is null wherever there is no ratio to state, and this component never
 *  computes one: see the single guarded division below. */
function SourceLabel({ percent }: { percent: number | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <p className="min-w-0 flex-1 text-xs leading-[18px] text-muted">Source: Claude plan</p>
      {percent !== null && (
        <span className="shrink-0 font-mono text-xs leading-[18px] text-muted">{percent}%</span>
      )}
    </div>
  );
}

/** Display only. The CLI is the sole writer of the checklist, so nothing here
 *  is interactive — a clickable checkbox would imply otherwise.
 *
 *  `claudeContext` is passed in rather than detected here: this component has no
 *  business asking which provider a tab runs, and the only thing it changes is
 *  whether the empty state may name a `/ec-*` command. */
export function TaskPanel({
  state,
  claudeContext,
}: {
  state: ProjectState | null;
  claudeContext: boolean;
}) {
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
      <div className="flex h-full flex-col">
        {/* The same label as the checklist carries, for the same reason: this
            text is a plan file's contents and has to say so. The fallback
            carries the misattribution risk the checklist does — more of it,
            since unparsed markdown looks even less like a project artefact. */}
        <div className="shrink-0 border-b border-border px-3 py-2">
          <SourceLabel percent={null} />
        </div>
        <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs whitespace-pre-wrap text-muted">
          {state.rawPlan}
        </pre>
      </div>
    ) : (
      // Nothing was read, so there is no source to label — and no ratio to
      // state: with no tasks there is no count of a count and no percentage,
      // because there is nothing to divide. The hint names a command only
      // where one exists to type.
      <Empty>No tasks yet{claudeContext ? ' — run /ec-plan' : ''}</Empty>
    );
  }

  // THE only division in this file, and it is reached on one condition. A plan
  // the reader returned with `total === 0` has no ratio, so `percent` stays
  // null and the bar below is not rendered at all rather than rendered empty.
  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : null;
  const remaining = Math.max(0, state.total - state.done);

  const pendingIndex = state.tasks.findIndex((t) => !t.done);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2">
        {state.featureTitle !== null && (
          <h2
            title={state.featureTitle}
            className="truncate pb-1 text-sm leading-[20px] font-semibold text-text"
          >
            {state.featureTitle}
          </h2>
        )}
        <SourceLabel percent={percent} />
        {percent !== null && (
          <>
            {/* Sage, because a finished task is healthy and not a selection.
                Decorative: the counts below say the same thing in words, so
                the bar is hidden from the accessibility tree rather than
                repeated into it. The width transition is a layout change at
                the contract's 150ms, not a loop — there is no spinner here
                because nothing on this panel is running. */}
            <div
              aria-hidden="true"
              className="mt-2 h-1.5 overflow-hidden rounded-lg border border-border bg-raised"
            >
              <div
                className="h-full rounded-lg bg-success transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="pt-2 text-xs leading-[18px] text-muted">
              {state.done} complete · {remaining} remaining
            </p>
          </>
        )}
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto p-2">
        {state.tasks.map((t, i) => (
          <li
            key={i}
            ref={i === pendingIndex ? firstPending : null}
            className="flex gap-2 px-2 py-1 font-mono text-xs"
          >
            {/* State, never activity: a hollow circle is "not done yet", which is
                why there is no spinner. The glyph is decorative and the status is
                carried in text beside it — colour alone is not a status. */}
            <span
              aria-hidden="true"
              className={`shrink-0 ${t.done ? 'text-success' : 'text-muted'}`}
            >
              {t.done ? '✓' : '○'}
            </span>
            <span className="sr-only">{t.done ? 'done' : 'pending'}</span>
            {/* Verbatim, tags and all — [M], [agent: …] and [design: …] are information. */}
            <span className={`min-w-0 break-words ${t.done ? 'text-muted line-through' : 'text-text'}`}>
              {t.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
