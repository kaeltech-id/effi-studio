import { useEffect, useRef } from 'react';

export interface Shortcuts {
  /** 1-based index as typed, so Cmd+1 arrives as 1. */
  onProjectIndex: (index: number) => void;
  onToggleSidebar: () => void;
  onToggleRail: () => void;
  onToggleFlow: () => void;
}

/** One window-level listener for every shortcut.
 *
 *  Every binding requires the Cmd key, for two reasons. The terminal forwards
 *  keystrokes to the PTY through xterm's onData (terminal-pane.tsx), and xterm
 *  does not forward Cmd-modified keys by default, so a focused terminal and
 *  this listener can coexist. And the text fields added in earlier cycles — the
 *  branch name, the claude binary path — never use Cmd, so requiring it plus
 *  bailing on an editable target is enough to keep typing unaffected. */
export function useShortcuts({
  onProjectIndex,
  onToggleSidebar,
  onToggleRail,
  onToggleFlow,
}: Shortcuts) {
  // Held in refs so the effect can run once with an empty dependency list.
  // The callers close over `states`, which the watcher updates for every
  // project, so taking them as dependencies would remove and re-add the
  // window listener on every state event. Same reason the install pane holds
  // its callbacks in refs at doctor-screen.tsx:57-60.
  const indexRef = useRef(onProjectIndex);
  const sidebarRef = useRef(onToggleSidebar);
  const railRef = useRef(onToggleRail);
  const flowRef = useRef(onToggleFlow);
  indexRef.current = onProjectIndex;
  sidebarRef.current = onToggleSidebar;
  railRef.current = onToggleRail;
  flowRef.current = onToggleFlow;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // xterm's input sink is a <textarea> of class xterm-helper-textarea, so
      // the blanket TEXTAREA bail made every binding dead whenever the terminal
      // held focus, which is its normal state. xterm does not forward
      // Cmd-modified keys to the PTY, so exempting it cannot swallow input.
      const xtermSink = target?.classList.contains('xterm-helper-textarea') ?? false;
      if (!xtermSink && (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable))
        return;

      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        indexRef.current(Number(e.key));
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        sidebarRef.current();
        return;
      }
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        railRef.current();
        return;
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        flowRef.current();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
