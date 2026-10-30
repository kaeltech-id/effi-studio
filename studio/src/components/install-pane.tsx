import { useEffect, useRef, useState } from 'react';
import { onPtyExit } from '../lib/tauri-api';
import { TerminalPane } from './terminal-pane';

interface InstallPaneProps {
  /** The reserved PTY id install_efficlaude writes to. Null until the backend
   *  answers, which is what keeps Install from being pressed before the pane
   *  below can subscribe to it. */
  installSessionId: string | null;
  onInstall: () => void;
  onRecheck: () => void;
}

/** The installer surface, lifted out of the old doctor screen unchanged. It is
 *  one optional action inside Settings now rather than the only way past a
 *  gate: nothing here decides whether the rest of the app may render. */
export function InstallPane({ installSessionId, onInstall, onRecheck }: InstallPaneProps) {
  const [installing, setInstalling] = useState(false);

  // Held in refs so the effect below can depend on `installing` alone: the
  // parent passes inline arrows, and taking them as dependencies would tear
  // down and rebuild the subscription on every render.
  const onInstallRef = useRef(onInstall);
  const onRecheckRef = useRef(onRecheck);
  onInstallRef.current = onInstall;
  onRecheckRef.current = onRecheck;

  useEffect(() => {
    if (!installing || !installSessionId) return;
    // The installer reports its own completion by closing its PTY, so the
    // checks refresh themselves rather than leaving the user on Re-check.
    const unlisten = onPtyExit(installSessionId, () => onRecheckRef.current());
    // Started here and not in the click handler: this effect runs after the
    // pane below has mounted and begun subscribing, which is the ordering
    // recorded at terminal-pane.tsx:59-61. Opening the PTY from the click
    // would race the pane and drop the installer's opening output.
    void unlisten.then(() => onInstallRef.current());
    return () => void unlisten.then((off) => off());
  }, [installing, installSessionId]);

  return (
    <section
      aria-labelledby="install-pane-heading"
      className="flex shrink-0 flex-col gap-3 border-b border-border p-3"
    >
      <h3 id="install-pane-heading" className="text-sm leading-[20px] font-semibold text-text">
        Installer
      </h3>

      <p className="text-xs leading-[18px] text-muted">
        Runs install.sh in a terminal here. Nothing is installed until you start it.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setInstalling(true)}
          disabled={!installSessionId || installing}
          className="rounded-lg border px-3 py-1.5 text-sm leading-[21px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-border disabled:bg-raised disabled:text-muted border-accent bg-accent text-on-accent hover:bg-accent/90"
        >
          {installing ? 'Installing' : 'Install EffiClaude'}
        </button>

        {/* The reason the control is dead, never a dead control on its own. */}
        {!installSessionId && (
          <span className="text-xs leading-[18px] text-muted">
            waiting for the installer session id
          </span>
        )}
      </div>

      {/* Fixed height so a long install scrolls inside the pane instead of
          pushing the rest of Settings off screen. */}
      {installing && installSessionId && (
        <div className="h-64 overflow-hidden rounded-xl border border-border bg-ground p-1">
          <TerminalPane sessionId={installSessionId} cwd="" agentId={null} />
        </div>
      )}
    </section>
  );
}
