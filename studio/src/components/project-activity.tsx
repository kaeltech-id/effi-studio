import { useState } from 'react';
import { Segmented } from './segmented';
import { TaskPanel } from './task-panel';
import { HistoryPanel } from './history-panel';
import type { DiffStat, ProjectState } from '../lib/types';

type ActivityTab = 'tasks' | 'history';

/** Module scope, so the option list is one array for the lifetime of the
 *  module rather than a new one on every render of every column. */
const TABS: { id: ActivityTab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'history', label: 'History' },
];

/** How many runs the `Recent history` preview shows. The Contract draws two
 *  entries; `View all` exists only when there is a third to go and see. */
const PREVIEW = 2;

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

/** A second copy of the pill `history-panel.tsx:7` draws, because that one is
 *  local to its module and this task may not edit that file to export it. If a
 *  third caller ever needs it, lift ONE of them into a shared component rather
 *  than adding a third. */
function BranchPill({ branch }: { branch: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs leading-[18px] text-muted">
      <svg
        aria-hidden="true"
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
      <span className="sr-only">Branch: </span>
      <span className="max-w-24 truncate">{branch}</span>
    </span>
  );
}

/** The Contract's bottom card. `DiffStat` is shaped `{available, filesChanged,
 *  insertions, deletions, error}` precisely so that four different facts stay
 *  four different renders:
 *
 *    error        -> git could not be read. A disabled card NAMING the reason.
 *                    Never `0 files changed`: a failure that prints zeros is
 *                    indistinguishable from a clean tree, which is the exact
 *                    lie the struct was shaped to prevent.
 *    !available   -> there is no repository here. An empty state, not an error.
 *    0 files      -> a clean tree. Said in words, because "0" beside a +/- pair
 *                    reads as a measurement that failed.
 *    n files      -> a dirty tree. The count and the real +/- totals.
 *
 *  `diff === null` is the fifth: nothing has been read yet (no project, or the
 *  read has not returned). It says so plainly -- no spinner, and no zeros
 *  standing in for a number nobody has. */
function GitCard({ branch, diff }: { branch: string | null; diff: DiffStat | null }) {
  const failed = diff?.error != null;
  return (
    <section
      aria-labelledby="project-git-heading"
      className="shrink-0 rounded-xl border border-border bg-surface p-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="project-git-heading" className="truncate text-sm leading-[20px] font-semibold text-text">
          Project &amp; Git
        </h3>
        {/* The Contract pairs the pill with a chevron. The chevron is a branch
            switcher and no switcher is wired here, so it is not drawn: a
            control that opens nothing is worse than no control. */}
        {branch && <BranchPill branch={branch} />}
      </div>
      <div className="mt-3 flex items-start gap-2.5">
        <FileIcon className="mt-px size-[18px] shrink-0 text-muted" />
        {diff === null ? (
          <p className="min-w-0 flex-1 text-xs leading-[18px] text-muted">No git status yet</p>
        ) : failed ? (
          <p className="min-w-0 flex-1 text-xs leading-[18px] text-muted">
            <span className="block font-medium text-text">Git could not be read</span>
            <span className="block break-words text-text">{diff.error}</span>
          </p>
        ) : !diff.available ? (
          <p className="min-w-0 flex-1 text-xs leading-[18px] text-muted">No git repository here</p>
        ) : diff.filesChanged === 0 ? (
          <p className="min-w-0 flex-1 text-xs leading-[18px] text-muted">No uncommitted changes</p>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-xs leading-[18px] text-text">
              {diff.filesChanged} {diff.filesChanged === 1 ? 'file' : 'files'} changed
            </p>
            {/* Colour is never the only carrier: each number is read out with
                the word it stands for. */}
            <span className="shrink-0 font-mono text-xs leading-[18px] text-success">
              +{diff.insertions}
              <span className="sr-only"> insertions</span>
            </span>
            <span className="shrink-0 font-mono text-xs leading-[18px] text-error">
              −{diff.deletions}
              <span className="sr-only"> deletions</span>
            </span>
          </>
        )}
      </div>
    </section>
  );
}

export interface ProjectActivityProps {
  state: ProjectState | null;
  diff: DiffStat | null;
  /** Passed through to `TaskPanel`, which is the only thing that uses it:
   *  whether an empty checklist may name a `/ec-*` command. */
  claudeContext: boolean;
}

/** The Contract's right column. It owns the column -- heading, subtitle, the
 *  Tasks/History switch, the plan card's chrome, the `Recent history` section
 *  and the git card -- and composes the two panels that already exist rather
 *  than restating a line of either. `TaskPanel` keeps the feature title, the
 *  source label, the guarded percent, the bar and the task rows;
 *  `HistoryPanel` keeps the medallion timeline and its window. */
export function ProjectActivity({ state, diff, claudeContext }: ProjectActivityProps) {
  const [tab, setTab] = useState<ActivityTab>('tasks');

  const history = state?.history ?? [];
  // The mockup's ratio badge is sample data; this is the same badge taken from
  // the plan the CLI actually wrote. `total === 0` is not "0 of 0" -- a plan
  // with nothing to count, so there is no ratio to state and none is drawn.
  // Same rule as the percent inside TaskPanel, which divides exactly once.
  const ratio = state && state.total > 0 ? `${state.done} of ${state.total}` : null;

  return (
    // tabIndex: this column is its own scroll region (the document itself
    // cannot move -- see the app-shell lock in styles.css) and its last
    // content, the git card, holds no focusable control. WebKit does not make
    // a scroller keyboard-focusable on its own, so without this stop a
    // keyboard user cannot reach the bottom of the column at all.
    //
    // The column's accessible name is the heading it already shows, not a
    // second copy of the same words in an aria-label that can drift from it.
    <aside
      aria-labelledby="project-activity-heading"
      tabIndex={0}
      className="flex w-[400px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-ground p-4 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset focus-visible:outline-none"
    >
      <header className="shrink-0">
        <h2
          id="project-activity-heading"
          className="text-xl leading-[28px] font-semibold text-text"
        >
          Project activity
        </h2>
        <p className="text-[13px] leading-[20px] text-muted">Everything moving forward.</p>
      </header>

      <div className="shrink-0">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Activity view" />
      </div>

      {/* No `aria-controls` on the tabs: `Segmented` owns no ids and this task
          may not edit it. The panel still declares what it is, and it is
          reachable through the column's own focus stop above. */}
      <div role="tabpanel" aria-label={tab === 'tasks' ? 'Tasks' : 'History'} className="shrink-0">
        {tab === 'tasks' ? (
          <section
            aria-label="Plan"
            className="overflow-hidden rounded-xl border border-border bg-surface"
          >
            {/* The card's chrome, which is this file's half of the plan card:
                the document icon and the ratio badge. TaskPanel draws the
                title, the source line, the bar and the rows directly beneath,
                so nothing here repeats them. The Contract's ellipsis is not
                drawn -- it has no menu behind it, and a dead control is a
                promise the app cannot keep. */}
            <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
              <FileIcon className="size-[18px] shrink-0 text-muted" />
              {ratio && (
                // Decorative, for the same reason the progress bar inside
                // TaskPanel is: the counts under the bar already say
                // "{done} complete · {remaining} remaining" in words, and a
                // screen reader does not need the same ratio twice.
                <span
                  aria-hidden="true"
                  className="shrink-0 rounded-full border border-border bg-raised px-2 py-0.5 text-[11px] leading-[16px] font-medium text-muted"
                >
                  {ratio}
                </span>
              )}
            </div>
            <TaskPanel state={state} claudeContext={claudeContext} />
          </section>
        ) : (
          <section
            aria-label="History"
            className="overflow-hidden rounded-xl border border-border bg-surface"
          >
            <HistoryPanel history={history} />
          </section>
        )}
      </div>

      {/* Only beside the plan. On the History tab the full timeline is already
          on screen above, and a second copy of the newest two entries would be
          the same runs twice. */}
      {tab === 'tasks' && (
        <section aria-labelledby="recent-history-heading" className="shrink-0">
          <div className="flex items-baseline justify-between gap-2 pb-1">
            <h3
              id="recent-history-heading"
              className="text-base leading-[24px] font-semibold text-text"
            >
              Recent history
            </h3>
            {/* Rendered only when there is more than the preview shows, so the
                link always has somewhere to go. */}
            {history.length > PREVIEW && (
              <button
                type="button"
                onClick={() => setTab('history')}
                className="flex shrink-0 items-center gap-1 rounded text-xs leading-[18px] font-medium text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none"
              >
                View all
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                >
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <HistoryPanel history={history.slice(0, PREVIEW)} />
          </div>
        </section>
      )}

      <GitCard branch={state?.branch ?? null} diff={diff} />
    </aside>
  );
}
