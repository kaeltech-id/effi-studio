import type { HistoryEntry } from '../lib/types';
import { StageRail } from './stage-rail';

/** The largest workspace on this machine has 320 archived runs; the panel shows
 *  a window of the newest and says how many it is holding back. */
const WINDOW = 50;

export function HistoryPanel({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="p-4 text-sm text-muted">No completed runs yet</p>;
  }

  const shown = history.slice(0, WINDOW);
  return (
    <div className="h-full overflow-y-auto">
      <ul>
        {shown.map((h) => (
          <li key={h.file} className="border-b border-border px-4 py-2">
            <div className="flex items-center gap-2">
              {/* An archived run finished the chain, so the rail reads complete. */}
              <StageRail stage="Review" />
              {/* No "## Feature:" line in the file is why the slug is parsed at all. */}
              <span className="min-w-0 flex-1 truncate text-sm">{h.title ?? h.slug}</span>
            </div>
            <div className="font-mono text-xs text-muted">
              {h.date} {h.time} · {h.branch}
            </div>
          </li>
        ))}
      </ul>
      {history.length > WINDOW && (
        <p className="px-4 py-2 font-mono text-xs text-muted">
          +{history.length - WINDOW} older
        </p>
      )}
    </div>
  );
}
