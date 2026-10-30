import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { api, onPtyExit, onPtyOutput } from '../lib/tauri-api';
import { token } from '../lib/tokens';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  /** The session the pane attaches to: an id reserved by pty_reserve (App) or
   *  the installer's reserved INSTALL_SESSION, in both cases known BEFORE any
   *  process exists behind it. That is what lets the pane subscribe first and
   *  only then start the process, which is the whole point of the split — see
   *  the comment on the Promise.all below. */
  sessionId: string;
  cwd: string;
  /** Which agent to start in this session, or null to attach only. Non-null is
   *  the pane's instruction to call ptyStart itself, from inside the gate below,
   *  so the subscription is always live before the spawn. Null is the
   *  installer's case: install_efficlaude owns that spawn, and a pane that
   *  started an agent there would put a second, empty process beside it.
   *  Declared because a session that changes agent is a different session,
   *  which this pane must re-attach to. */
  agentId: string | null;
  /** Bumped by the app after a flow-bar dispatch, which moved DOM focus to a
   *  button. Zero is the initial value and never steals focus. */
  focusNonce?: number;
}

export function TerminalPane({ sessionId, cwd, agentId, focusNonce }: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** The live Terminal, so a dispatch can hand focus back without the pane
   *  re-opening the PTY. Cleared on dispose so a stale handle is never used. */
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: token('--font-mono'),
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: token('--color-ground'),
        foreground: token('--color-terminal'),
        cursor: token('--color-accent'),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;

    // Bytes, not a string: xterm decodes UTF-8 across chunk boundaries itself.
    const unlistenOutput = onPtyOutput(sessionId, (bytes) => term.write(bytes));
    const unlistenExit = onPtyExit(sessionId, () =>
      term.write('\r\n\x1b[90m[session ended]\x1b[0m\r\n'),
    );
    // listen() resolves asynchronously, so opening the PTY before both
    // subscriptions are live can drop claude's opening banner.
    //
    // Which is why the spawn is behind this promise and not in front of it: the
    // id arrives already reserved (pty_reserve / INSTALL_SESSION), so the only
    // call that puts a process behind it is the ptyStart below, inside .then().
    // Nothing can write to this session before both listeners are registered,
    // because nothing is running on it yet — the invariant is structural here
    // rather than a timing we hope for.
    const subscribed = Promise.all([unlistenOutput, unlistenExit]);
    /** Set by the cleanup below. StrictMode runs this effect twice: without
     *  this, the first run's torn-down subscriptions would still start the
     *  process, and its opening output would race the second run's listen(). */
    let disposed = false;

    term.onData((data) => {
      void api.ptyWrite(sessionId, data).catch(() => {});
    });

    const observer = new ResizeObserver(() => {
      // A hidden pane measures 0x0. Fitting to that would collapse the terminal
      // and resize the PTY behind a still-running session.
      if (!host.clientHeight || !host.clientWidth) return;
      fit.fit();
      void api.ptyResize(sessionId, term.rows, term.cols).catch(() => {});
    });
    observer.observe(host);

    // Gated on the same promise: the start is what spawns the agent, and the
    // first resize is the pane telling a session it has just attached to how
    // big it is — sending either before the subscriptions are live would drop
    // the banner, or the redraw the PTY answers the resize with.
    void subscribed
      .then(() => {
        if (disposed) return;
        // Attach-only when there is no agent: the installer's session is
        // started by install_efficlaude, never from here.
        return agentId ? api.ptyStart(sessionId, cwd, agentId) : undefined;
      })
      .then(() => {
        if (disposed) return;
        return api.ptyResize(sessionId, term.rows, term.cols);
      })
      .catch((err) => term.write(`\r\n\x1b[31m${String(err)}\x1b[0m\r\n`));

    return () => {
      disposed = true;
      observer.disconnect();
      void unlistenOutput.then((off) => off());
      void unlistenExit.then((off) => off());
      termRef.current = null;
      term.dispose();
    };
  }, [sessionId, cwd, agentId]);

  // Kept out of the effect above: adding the nonce to its dependencies would
  // tear down and re-open the PTY on every dispatch.
  useEffect(() => {
    if (focusNonce) termRef.current?.focus();
  }, [focusNonce]);

  return <div ref={hostRef} className="h-full w-full" />;
}
