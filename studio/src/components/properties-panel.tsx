import { useState } from 'react';
import type { GitInfo } from '../lib/types';

interface PropertiesPanelProps {
  gitInfo: GitInfo | null;
  /** Unfinished task count on the active project. Switching branches changes
   *  which plan file is active, so the user is told rather than stopped. */
  incompleteTasks: number;
  busy: boolean;
  /** git's own stderr from the last refused action, shown verbatim. */
  error: string | null;
  onCheckout: (branch: string) => void;
  onCreateBranch: (name: string) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="w-16 shrink-0 text-xs text-muted">{label}</span>
      <span className="min-w-0 flex-1 font-mono text-xs">{children}</span>
    </div>
  );
}

export function PropertiesPanel({
  gitInfo,
  incompleteTasks,
  busy,
  error,
  onCheckout,
  onCreateBranch,
}: PropertiesPanelProps) {
  const [newBranch, setNewBranch] = useState('');

  if (!gitInfo) {
    return <p className="p-4 text-sm text-muted">No project selected</p>;
  }

  if (!gitInfo.available) {
    // Not a work tree, or no git binary. Stated, with no actions offered.
    return (
      <p className="p-4 font-mono text-xs text-muted">{gitInfo.error ?? 'No git repository here'}</p>
    );
  }

  const name = newBranch.trim();

  return (
    <div className="h-full overflow-y-auto p-2">
      <Row label="branch">
        {gitInfo.detached ? (
          <span className="text-muted">detached HEAD</span>
        ) : (
          gitInfo.branch
        )}
      </Row>

      {incompleteTasks > 0 && (
        <p className="py-1 text-xs text-muted">
          {incompleteTasks} unfinished task{incompleteTasks === 1 ? '' : 's'} on this branch. Its
          plan is branch scoped, so switching changes which plan is active.
        </p>
      )}

      {gitInfo.branches.length > 0 && (
        <ul className="pt-2">
          {gitInfo.branches.map((b) => (
            <li key={b.name}>
              <button
                type="button"
                disabled={busy || b.current}
                onClick={() => onCheckout(b.name)}
                title={b.current ? 'Current branch' : `Checkout ${b.name}`}
                className={`w-full truncate px-2 py-1 text-left font-mono text-xs ${
                  b.current ? 'text-text' : 'text-muted'
                }`}
              >
                {b.current ? '◆' : '◇'} {b.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {gitInfo.hidden > 0 && (
        <p className="px-2 py-1 font-mono text-xs text-muted">+{gitInfo.hidden} more</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name) return;
          onCreateBranch(name);
          setNewBranch('');
        }}
        className="flex gap-2 pt-3"
      >
        <input
          value={newBranch}
          onChange={(e) => setNewBranch(e.target.value)}
          placeholder="new-branch"
          aria-label="new branch name"
          disabled={busy}
          className="min-w-0 flex-1 border border-border bg-ground px-2 py-1 font-mono text-xs"
        />
        <button
          type="submit"
          disabled={busy || !name}
          className="border border-border px-2 py-1 text-xs text-muted"
        >
          Create
        </button>
      </form>

      {error && (
        /* git's message verbatim, kept until the next action so it stays
           readable while the tree is fixed in another editor. */
        <pre className="mt-3 border border-border p-2 font-mono text-xs whitespace-pre-wrap text-muted">
          {error}
        </pre>
      )}
    </div>
  );
}
