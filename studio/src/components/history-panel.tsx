import type { HistoryEntry } from '../lib/types';

/** The largest workspace on this machine has 320 archived runs; the panel shows
 *  a window of the newest and says how many it is holding back. */
const WINDOW = 50;

function BranchPill({ branch }: { branch: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
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
      <span className="max-w-24 truncate">{branch}</span>
    </span>
  );
}

export function HistoryPanel({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="p-4 text-sm text-muted">No completed runs yet</p>;
  }

  const shown = history.slice(0, WINDOW);
  return (
    <div className="h-full overflow-y-auto">
      <ul className="px-4 py-3">
        {shown.map((h) => (
          <li key={h.file} className="group relative flex gap-3 pb-4 last:pb-0">
            {/* Decorative: the medallion and the line it hangs on say "finished"
                a second time, after the archived run already said it in words. */}
            <span
              aria-hidden
              className="absolute bottom-0 left-3 top-7 w-px bg-border group-last:hidden"
            />
            <span
              aria-hidden
              className="z-10 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-on-accent"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5"
              >
                <path d="M3.5 8.4 6.4 11.3 12.5 4.9" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                {/* No "## Feature:" line in the file is why the slug is parsed at all. */}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                  {h.title ?? h.slug}
                </span>
                {h.branch && <BranchPill branch={h.branch} />}
              </span>
              {(h.date || h.time) && (
                <span className="mt-0.5 block text-xs text-muted">
                  {[h.date, h.time].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {history.length > WINDOW && (
        <p className="px-4 pb-3 font-mono text-xs text-muted">
          +{history.length - WINDOW} older
        </p>
      )}
    </div>
  );
}
