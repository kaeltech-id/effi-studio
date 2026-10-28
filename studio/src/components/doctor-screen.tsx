import { useState } from 'react';
import { type Doctor, doctorBlocking } from '../lib/types';

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
  onInstall: () => void;
  onRecheck: () => void;
  onContinue: () => void;
  onOverride: (path: string) => void;
}

export function DoctorScreen({
  doctor,
  onInstall,
  onRecheck,
  onContinue,
  onOverride,
}: DoctorScreenProps) {
  const [path, setPath] = useState('');
  const blocking = doctorBlocking(doctor);

  return (
    <section className="m-auto w-full max-w-md p-6">
      <h1 className="pb-4 text-sm">EffiClaude Studio</h1>

      <Check
        ok={!!doctor.claude}
        label="claude CLI"
        detail={doctor.claude ?? 'not found — enter its path below'}
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
        detail={doctor.workerOk ? 'online' : 'offline — memory unavailable'}
      />

      <div className="flex gap-2 pt-4">
        {blocking && (
          <button
            type="button"
            onClick={onInstall}
            className="border border-border px-3 py-1.5 text-sm"
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
    </section>
  );
}
