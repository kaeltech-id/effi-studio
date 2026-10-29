import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { api, onPtyExit, onPtyOutput } from '../lib/tauri-api';
import { token } from '../lib/tokens';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  projectId: string;
  cwd: string;
  /** null = attach only: subscribe to an already-running session and never
   *  open one. The installer's PTY is opened by install_efficlaude, so a pane
   *  that called ptyOpen would spawn a second, empty shell beside it. */
  program: string | null;
  /** Bumped by the app after a flow-bar dispatch, which moved DOM focus to a
   *  button. Zero is the initial value and never steals focus. */
  focusNonce?: number;
}

export function TerminalPane({ projectId, cwd, program, focusNonce }: TerminalPaneProps) {
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
        foreground: token('--color-text'),
        cursor: token('--color-accent'),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;

    // Bytes, not a string: xterm decodes UTF-8 across chunk boundaries itself.
    const unlistenOutput = onPtyOutput(projectId, (bytes) => term.write(bytes));
    const unlistenExit = onPtyExit(projectId, () =>
      term.write('\r\n\x1b[90m[session ended]\x1b[0m\r\n'),
    );
    // listen() resolves asynchronously, so opening the PTY before both
    // subscriptions are live can drop claude's opening banner.
    const subscribed = Promise.all([unlistenOutput, unlistenExit]);

    term.onData((data) => {
      void api.ptyWrite(projectId, data).catch(() => {});
    });

    const observer = new ResizeObserver(() => {
      // A hidden pane measures 0x0. Fitting to that would collapse the terminal
      // and resize the PTY behind a still-running session.
      if (!host.clientHeight || !host.clientWidth) return;
      fit.fit();
      void api.ptyResize(projectId, term.rows, term.cols).catch(() => {});
    });
    observer.observe(host);

    void subscribed
      .then(() => (program ? api.ptyOpen(projectId, cwd, program) : undefined))
      .then(() => api.ptyResize(projectId, term.rows, term.cols))
      .catch((err) => term.write(`\r\n\x1b[31m${String(err)}\x1b[0m\r\n`));

    return () => {
      observer.disconnect();
      void unlistenOutput.then((off) => off());
      void unlistenExit.then((off) => off());
      termRef.current = null;
      term.dispose();
    };
  }, [projectId, cwd, program]);

  // Kept out of the effect above: adding the nonce to its dependencies would
  // tear down and re-open the PTY on every dispatch.
  useEffect(() => {
    if (focusNonce) termRef.current?.focus();
  }, [focusNonce]);

  return <div ref={hostRef} className="h-full w-full" />;
}
