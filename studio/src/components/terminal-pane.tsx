import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { api, onPtyExit, onPtyOutput } from '../lib/tauri-api';
import { token } from '../lib/tokens';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  projectId: string;
  cwd: string;
  program: string;
}

export function TerminalPane({ projectId, cwd, program }: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);

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
      .then(() => api.ptyOpen(projectId, cwd, program))
      .then(() => api.ptyResize(projectId, term.rows, term.cols))
      .catch((err) => term.write(`\r\n\x1b[31m${String(err)}\x1b[0m\r\n`));

    return () => {
      observer.disconnect();
      void unlistenOutput.then((off) => off());
      void unlistenExit.then((off) => off());
      term.dispose();
    };
  }, [projectId, cwd, program]);

  return <div ref={hostRef} className="h-full w-full" />;
}
