import { useEffect, useRef } from 'react';

export interface Shortcuts {
  /** 1-based index as typed, so Cmd+1 arrives as 1. Indexes PROJECTS — the
   *  configured list, not the tab run. Unchanged by Task 113: the nine digits
   *  mean what they have always meant here. */
  onProjectIndex: (index: number) => void;
  onToggleSidebar: () => void;
  onToggleRail: () => void;
  onToggleFlow: () => void;
  /** -1 for the tab before the active one, +1 for the one after, wrapping at
   *  both ends — the caller decides what "the tabs" are, because only it knows
   *  which project is open.
   *
   *  Optional, and absent it the two bracket chords do nothing rather than
   *  falling through to another binding. This is the ONE place in the hook
   *  where a key SELECTS a tab, and that is deliberate: a shortcut aimed at a
   *  tab is a request to work in it. The strip's own arrows and Home/End are a
   *  different act — they move focus and leave selection alone
   *  (tab-strip.tsx:373-393) — which is why tab stepping is bound to the
   *  brackets and never to an arrow. */
  onStepTab?: (delta: -1 | 1) => void;
}

/** One window-level listener for every shortcut.
 *
 *  Every binding requires the Cmd key, for two reasons. The terminal forwards
 *  keystrokes to the PTY through xterm's onData (terminal-pane.tsx), and xterm
 *  does not forward Cmd-modified keys by default, so a focused terminal and
 *  this listener can coexist. And the text fields added in earlier cycles — the
 *  branch name, the claude binary path — never use Cmd, so requiring it plus
 *  bailing on an editable target is enough to keep typing unaffected.
 *
 *  THE WHOLE TABLE, and it is nine digits and five chords:
 *
 *    Cmd+1 … Cmd+9     select the 1st … 9th configured project
 *    Cmd+B            show or hide the left sidebar
 *    Cmd+J            show or hide the rail's properties disclosure
 *    Cmd+K            show or hide the flow bar
 *    Cmd+Shift+[      select the previous tab
 *    Cmd+Shift+]      select the next tab
 *
 *  Cmd+K is the flow-bar toggle and nothing else. It opens no search surface
 *  and no list of commands; `onToggleFlow` is the only thing it can reach, and
 *  it is the only binding that reaches it.
 *
 *  Shift is what keeps the new pair clear of the old ones: a chord carrying
 *  Shift can only ever be tab navigation, and the digits and letters are
 *  matched only without it. That also closes an accident — `e.key === 'B'`
 *  used to make Cmd+Shift+B toggle the sidebar, so a shifted letter had two
 *  meanings. The upper-case branches stay, because Caps Lock reports 'B' with
 *  `shiftKey` false and a user in Caps Lock still gets every binding. */
export function useShortcuts({
  onProjectIndex,
  onToggleSidebar,
  onToggleRail,
  onToggleFlow,
  onStepTab,
}: Shortcuts) {
  // Held in refs so the effect can run once with an empty dependency list.
  // The callers close over `states`, which the watcher updates for every
  // project, so taking them as dependencies would remove and re-add the
  // window listener on every state event. Same reason the install pane holds
  // its callbacks in refs at install-pane.tsx:22-26.
  const indexRef = useRef(onProjectIndex);
  const sidebarRef = useRef(onToggleSidebar);
  const railRef = useRef(onToggleRail);
  const flowRef = useRef(onToggleFlow);
  const stepTabRef = useRef(onStepTab);
  indexRef.current = onProjectIndex;
  sidebarRef.current = onToggleSidebar;
  railRef.current = onToggleRail;
  flowRef.current = onToggleFlow;
  stepTabRef.current = onStepTab;

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

      // Cmd+Shift+[ and Cmd+Shift+]: the previous and next tab. Matched on
      // `code` first so the physical bracket keys work on a layout that puts
      // another character there, then on `key` for the layouts where the
      // bracket is reached some other way — and on both the shifted and
      // unshifted glyph, because the shifted one is what the event carries on
      // a US layout. Every shifted chord returns here whether or not it was
      // one of these two, which is what keeps Shift out of the bindings below.
      if (e.shiftKey) {
        const back = e.code === 'BracketLeft' || e.key === '[' || e.key === '{';
        const forward = e.code === 'BracketRight' || e.key === ']' || e.key === '}';
        if (!back && !forward) return;
        e.preventDefault();
        stepTabRef.current?.(back ? -1 : 1);
        return;
      }

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
