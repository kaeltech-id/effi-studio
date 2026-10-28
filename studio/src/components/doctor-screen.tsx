import { useEffect, useRef, useState } from 'react';
import { onPtyExit } from '../lib/tauri-api';
import { type Doctor, doctorBlocking } from '../lib/types';
import { TerminalPane } from './terminal-pane';

interface CheckProps {
  ok: boolean;
  label: string;
  detail: string;
  /** The worker row is advisory, and must not look like the two that block. */
  optional?: boolean;
  children?: React.ReactNode;
}

function Check({ ok, label, detail, optional = false, children }: CheckProps) {
  return (
    <div className="border-b border-border py-3">
      <div className="flex items-baseline gap-2">
        {/* Glyph and weight carry pass/fail: the palette has no sixth color to spend. */}
        <span className={`font-mono ${ok ? 'text-text' : 'text-muted'}`}>{ok ? '✓' : '✗'}</span>
        <span className={`text-sm ${optional ? 'text-muted' : 'text-text'}`}>{label}</span>
        {optional && <span className="text-xs text-muted">optional</span>}
      </div>
      <p className="pl-6 font-mono text-xs text-muted">{detail}</p>
      {children && <div className="pl-6 pt-2">{children}</div>}
    </div>
  );
}

interface DoctorScreenProps {
  doctor: Doctor;
  /** The reserved PTY id install_efficlaude writes to. Null until the backend
   *  answers, which is what keeps Install from being pressed before the pane
   *  below can subscribe to it. */
  installSessionId: string | null;
  onInstall: () => void;
  onRecheck: () => void;
  onContinue: () => void;
  onOverride: (path: string) => void;
}

export function DoctorScreen({
  doctor,
  installSessionId,
  onInstall,
  onRecheck,
  onContinue,
  onOverride,
}: DoctorScreenProps) {
  const [path, setPath] = useState('');
  const [installing, setInstalling] = useState(false);
  const blocking = doctorBlocking(doctor);

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
    // recorded at terminal-pane.tsx:42. Opening the PTY from the click would
    // race the pane and drop the installer's opening output.
    void unlisten.then(() => onInstallRef.current());
    return () => void unlisten.then((off) => off());
  }, [installing, installSessionId]);

  return (
    <section className="m-auto w-full max-w-md p-6">
      <h1 className="pb-4 text-sm">EffiClaude Studio</h1>

      <Check
        ok={!!doctor.claude}
        label="claude CLI"
        detail={doctor.claude ?? 'not found. Enter its path below'}
      >
        {/* A Homebrew or nvm install can defeat even the login-shell probe,
            so the path stays enterable by hand. */}
        {!doctor.claude && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (path.trim()) onOverride(path.trim());
            }}
            className="flex gap-2"
          >
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/usr/local/bin/claude"
              aria-label="path to the claude binary"
              className="min-w-0 flex-1 border border-border bg-ground px-2 py-1 font-mono text-xs"
            />
            <button type="submit" className="border border-border px-2 py-1 text-xs text-muted">
              Use
            </button>
          </form>
        )}
      </Check>

      <Check
        ok={doctor.commandsFound >= doctor.commandsExpected}
        label="EffiClaude commands"
        detail={`${doctor.commandsFound}/${doctor.commandsExpected} in ~/.claude/commands`}
      />

      <Check
        ok={doctor.workerOk}
        label="worker"
        optional
        detail={doctor.workerOk ? 'online' : 'offline, memory unavailable'}
      />

      <div className="flex gap-2 pt-4">
        {blocking && (
          <button
            type="button"
            onClick={() => setInstalling(true)}
            disabled={!installSessionId}
            className="border border-border px-3 py-1.5 text-sm disabled:text-muted"
          >
            Install EffiClaude
          </button>
        )}
        <button
          type="button"
          onClick={onRecheck}
          className="border border-border px-3 py-1.5 text-sm text-muted"
        >
          Re-check
        </button>
        {!blocking && (
          <button
            type="button"
            onClick={onContinue}
            className="border border-border px-3 py-1.5 text-sm"
          >
            Continue
          </button>
        )}
      </div>

      {/* Fixed height so a long install scrolls inside the pane instead of
          pushing the buttons off screen. */}
      {installing && installSessionId && (
        <div className="mt-4 h-64 border border-border">
          <TerminalPane projectId={installSessionId} cwd="" program={null} />
        </div>
      )}
    </section>
  );
}
