## Feature: Flow Bar — stage-aware action row above the terminal

### Impact Analysis
- Files affected: `studio/src-tauri/src/plan.rs`, `studio/src-tauri/src/projects.rs`, `studio/src/lib/types.ts`, `studio/src/lib/flow.ts` (new), `studio/src/components/flow-bar.tsx` (new), `studio/src/lib/use-shortcuts.ts`, `studio/src/components/terminal-pane.tsx`, `studio/src/App.tsx`, `tests/test_command_docs.py`
- ⚠️ Breaking change risk: none

### Reusable Existing Code
- `PanelSection` at `studio/src/components/panel-section.tsx` — its chevron glyph pair (`▸`/`▾`), `aria-expanded`, and `w-4 shrink-0 font-mono text-xs text-muted` spacing are copied rather than re-invented, so the flow bar's toggle reads as the same control as the rail's.
- `PropertiesPanel` at `studio/src/components/properties-panel.tsx` — its input and button classes (`border border-border bg-ground px-2 py-1 font-mono text-xs`) are the established form idiom; the flow bar's argument field reuses them verbatim.
- `api.ptyWrite` at `studio/src/lib/tauri-api.ts:51` — already wired; dispatch needs no new Tauri command.
- `derive_stage` at `studio/src-tauri/src/plan.rs:77` — the stage is already computed with the driver's precedence; the UI consumes it and never re-derives.
- `STAGES` / `Stage` at `studio/src/lib/types.ts:1,55` — the flow table keys off the existing union rather than a parallel list of strings.
- `_repo()` at `tests/test_command_docs.py:446` — the new drift test reuses it instead of recomputing a repo root.

### Design Direction
- Dials: ENERGY 1 · RHYTHM 1 · MOTION 1 — ENERGY 1 because the centre of gravity is a terminal and a loud strip would compete with it; RHYTHM 1 because the six steps are one fixed-order sequence that must read as a single even row; MOTION 1 because the house rule forbids animation and a row that re-renders on every watcher event would flicker.
- Palette: no new colors — `--color-ground`, `--color-text`, `--color-muted`, `--color-border`, with `--color-accent` only on the recommended next step. `styles.css:3-7` reserves the accent for "the active project and the stage badge"; the next step is that same stage signal, and `stage-rail.tsx:10` already spends accent on the current stage, so this is the existing use rather than a new one.
- Typography: `--font-mono` at `text-xs` for the command names, because they are literal strings the user will also type; the default UI face for the hint line.
- Identity motif: the literal command string as the label. The row teaches the product's vocabulary by never paraphrasing it.
- Rules: apply ~/.claude/agents/ec-antislop.md in full — hard gates, purpose gates, quality locks

### Grounding
Measured 2026-10-29 — real command output only.
- Baseline string counts:
  - `grep -c "pub review_done: bool," studio/src-tauri/src/plan.rs` → 0
  - `grep -c "review_done," studio/src-tauri/src/plan.rs` → 0
  - `grep -c "pub flow_collapsed: bool," studio/src-tauri/src/projects.rs` → 0
  - `grep -c "reviewDone: boolean;" studio/src/lib/types.ts` → 0
  - `grep -c "flowCollapsed: boolean;" studio/src/lib/types.ts` → 0
  - `grep -c "command: '/ec-" studio/src/lib/flow.ts` → 0 (file absent)
  - `grep -c "export function nextStep" studio/src/lib/flow.ts` → 0 (file absent)
  - `grep -c "FLOW_STEPS.map" studio/src/components/flow-bar.tsx` → 0 (file absent)
  - `grep -cF "'/ec-brainstorm'" studio/src/components/flow-bar.tsx` → 0 (file absent)
  - `grep -c "aria-expanded" studio/src/components/flow-bar.tsx` → 0 (file absent)
  - `grep -cF "classList.contains('xterm-helper-textarea')" studio/src/lib/use-shortcuts.ts` → 0
  - `grep -cF "e.key === 'k'" studio/src/lib/use-shortcuts.ts` → 0
  - `grep -cF "termRef.current?.focus()" studio/src/components/terminal-pane.tsx` → 0
  - `grep -c "term.focus" studio/src/components/terminal-pane.tsx` → 0
  - `grep -cF "api.ptyWrite(activeId" studio/src/App.tsx` → 0
  - `grep -c "<FlowBar" studio/src/App.tsx` → 0
  - `grep -cF "onToggleFlow:" studio/src/App.tsx` → 0
  - `grep -c "onToggleRail" studio/src/lib/use-shortcuts.ts` → 4
  - `grep -c "togglePanel" studio/src/App.tsx` → 5
- Baseline line counts: `plan.rs` 226 · `projects.rs` 201 · `types.ts` 92 · `use-shortcuts.ts` 58 · `terminal-pane.tsx` 76 · `App.tsx` 382 · `test_command_docs.py` 489
- Baseline test result: `python3 -m pytest -q` → 150 passed, 1 warning
- Verified anchors:
  - Task 1: `pub has_decision: bool,` → studio/src-tauri/src/plan.rs:195
  - Task 2: `has_decision,` → studio/src-tauri/src/plan.rs:224
  - Task 3: `pub sidebar_collapsed: bool,` → studio/src-tauri/src/projects.rs:67
  - Task 4: `hasDecision: boolean;` → studio/src/lib/types.ts:51
  - Task 5: `sidebarCollapsed: boolean;` → studio/src/lib/types.ts:77
  - Task 6: new file — no anchor
  - Task 7: new file — no anchor (created by Task 6)
  - Task 8: new file — no anchor
  - Task 9: new file — no anchor (created by Task 8)
  - Task 10: new file — no anchor (created by Task 8)
  - Task 11: `if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;` → studio/src/lib/use-shortcuts.ts:37
  - Task 12: `onToggleRail: () => void;` → studio/src/lib/use-shortcuts.ts:7
  - Task 13: `term.dispose();` → studio/src/components/terminal-pane.tsx:71
  - Task 14: `sidebarCollapsed: false,` → studio/src/App.tsx:41
  - Task 15: `<TerminalPane projectId={p.id} cwd={p.path} program={program} />` → studio/src/App.tsx:336
  - Task 16: `onToggleRail: useCallback(() => {` → studio/src/App.tsx:267
  - Task 17: `class TestRetiredCommandsFullyRemoved:` → tests/test_command_docs.py:450
- Confirmed absent (new files): `studio/src/lib/flow.ts`, `studio/src/components/flow-bar.tsx`

### Tasks
- [x] Task 1: Add review_done to ProjectState [S] — declare the field that separates a finished review from a pending one
- [x] Task 2: Populate review_done in read_project_state [S] — probe the review sentinel once and return it
- [x] Task 3: Add flow_collapsed to PanelState [S] — persist the flow bar's collapsed state like every other region
- [x] Task 4: Add reviewDone to the TS ProjectState [S] [agent: ec-typescript] — mirror the new Rust field on the wire
- [x] Task 5: Add flowCollapsed to the TS PanelState [S] [agent: ec-typescript] — mirror the new panel field
- [x] Task 6: Create the FLOW_STEPS table [S] [agent: ec-typescript] [design: direction#FlowBar] — six steps, each a literal command and a one-line hint
- [x] Task 7: Add nextStep to flow.ts [S] [agent: ec-typescript] — map a ProjectState to the step it is waiting on
- [x] Task 8: Create FlowBar with the step row [M] [agent: ec-react] [design: direction#FlowBar] — six command buttons with the next one marked
- [x] Task 9: Add the brainstorm argument field to FlowBar [S] [agent: ec-react] [design: direction#FlowBar] — one optional free-text input appended to /ec-brainstorm
- [x] Task 10: Add the collapse toggle to FlowBar [S] [agent: ec-react] [design: direction#FlowBar] — chevron plus a collapsed one-line summary
- [x] Task 11: Exempt xterm's helper textarea from the shortcut guard [S] [agent: ec-react] — revive every Cmd binding while the terminal holds focus
- [x] Task 12: Add onToggleFlow and the Cmd+K binding [S] [agent: ec-react] — a keyboard path for the new region
- [x] Task 13: Refocus the terminal on a focus nonce [S] [agent: ec-react] — return focus after a dispatch so typing continues
- [x] Task 14: Add the dispatch handler to App [M] [agent: ec-react] — write the command text into the active PTY and bump the nonce
- [x] Task 15: Render FlowBar above the terminal [S] [agent: ec-react] [design: direction#FlowBar] — place the row between header and panes
- [x] Task 16: Wire onToggleFlow into useShortcuts [S] [agent: ec-react] — toggle and persist flowCollapsed from the keyboard
- [x] Task 17: Add the flow bar command drift test [S] [agent: ec-unit-test] — fail if the bar names a command that does not exist

### Per Task Detail

**Task 1 — Add review_done to ProjectState** `S`
- File: studio/src-tauri/src/plan.rs
- Anchor: `pub has_decision: bool,` (line 195)
- Reuse: the existing `#[serde(rename_all = "camelCase")]` on the struct, so the field crosses as `reviewDone` with no extra attribute
- Code sample:
  ```rust
      pub has_decision: bool,
      /// `derive_stage` returns `Stage::Review` both for a plan awaiting review
      /// and for one whose review is finished (plan.rs:78 vs :94). Only this
      /// field separates them, and the UI needs the difference to name git as
      /// the next step rather than offering review a second time.
      pub review_done: bool,
  ```
- Do not touch: the `Stage` enum, `derive_stage`, `stage_from_sentinel` — the stage's meaning is unchanged and the driver mirrors it
- Edge cases: a folder that is not an EffiClaude project returns `false`, like every other field, because `read_project_state` never errors
- Acceptance: `ProjectState` carries a `review_done` boolean and the file still has exactly one struct definition
- Verify (local): `grep -cF "pub review_done: bool," studio/src-tauri/src/plan.rs` → `== 1` (baseline 0)
- Dependencies: none

**Task 2 — Populate review_done in read_project_state** `S`
- File: studio/src-tauri/src/plan.rs
- Anchor: `has_decision,` (line 224)
- Reuse: the same `format!(".claude/.review-done-{branch}")` path expression already used by `derive_stage` at line 78
- Code sample:
  ```rust
      let review_done = root.join(format!(".claude/.review-done-{branch}")).exists();

      let stage = stage_from_sentinel(&root, &branch)
          .unwrap_or_else(|| derive_stage(&root, &branch, plan.as_deref(), has_decision));

      ProjectState {
          // …
          has_decision,
          review_done,
      }
  ```
- Do not touch: the order of `stage_from_sentinel` and `derive_stage` — sentinel precedence is deliberate
- Edge cases: an unreadable project root makes `exists()` false, which is the correct "not reviewed" answer rather than an error
- Acceptance: reading a project whose `.claude/.review-done-{branch}` exists yields `review_done: true`, and the field is set in exactly one place
- Verify (local): `grep -cF "review_done," studio/src-tauri/src/plan.rs` → `== 1` (baseline 0; Task 1's line is `pub review_done: bool,` and does not contain this string)
- Dependencies: Task 1

**Task 3 — Add flow_collapsed to PanelState** `S`
- File: studio/src-tauri/src/projects.rs
- Anchor: `pub sidebar_collapsed: bool,` (line 67)
- Reuse: the struct's existing `#[serde(rename_all = "camelCase", default)]` plus `Default` derive, which is exactly why a new field needs no studio.json migration
- Code sample:
  ```rust
      pub sidebar_collapsed: bool,
      /// The flow bar above the terminal. Default open, like every other
      /// region: the row exists to be read before it is dismissed.
      pub flow_collapsed: bool,
  ```
- Do not touch: the `StudioConfig` parent's snake_case naming — the comment at lines 54-58 records why the two differ
- Edge cases: a studio.json written by an earlier build omits the key and `serde(default)` fills `false`
- Acceptance: a studio.json with no `flowCollapsed` key still loads, and `panels()` returns the field
- Verify (local): `grep -cF "pub flow_collapsed: bool," studio/src-tauri/src/projects.rs` → `== 1` (baseline 0)
- Verify (global): `cd studio/src-tauri && cargo build 2>&1 | tail -3` → finishes with no error and no new warning
- Dependencies: none

**Task 4 — Add reviewDone to the TS ProjectState** `S`
- File: studio/src/lib/types.ts
- Anchor: `hasDecision: boolean;` (line 51)
- Reuse: none
- Code sample:
  ```ts
    hasDecision: boolean;
    /** True once `.claude/.review-done-{branch}` exists. `stage` reads `Review`
     *  either side of that line, so this is what tells the flow bar to name git
     *  instead of offering review again. */
    reviewDone: boolean;
  ```
- Do not touch: the `Stage` union and `STAGES` — git is not a stage and must not be added to either
- Edge cases: n/a — a required boolean, never optional, so a missing Rust field becomes a type error rather than `undefined`
- Acceptance: `ProjectState` in TS has the same field set as the Rust struct
- Verify (local): `grep -c "reviewDone: boolean;" studio/src/lib/types.ts` → `== 1` (baseline 0)
- Dependencies: none

**Task 5 — Add flowCollapsed to the TS PanelState** `S`
- File: studio/src/lib/types.ts
- Anchor: `sidebarCollapsed: boolean;` (line 77)
- Reuse: none
- Code sample:
  ```ts
    sidebarCollapsed: boolean;
    flowCollapsed: boolean;
  ```
- Do not touch: `ProjectState` — Task 4 owns it
- Edge cases: n/a
- Acceptance: `PanelState` has five booleans and matches the Rust struct field for field
- Verify (local): `grep -c "flowCollapsed: boolean;" studio/src/lib/types.ts` → `== 1` (baseline 0)
- Dependencies: none

**Task 6 — Create the FLOW_STEPS table** `S`
- File: studio/src/lib/flow.ts
- Reuse: the `Stage` union from `./types`, so a renamed stage is a type error here
- Code sample:
  ```ts
  import type { ProjectState, Stage } from './types';

  export interface FlowStep {
    /** The literal text typed into the session, and the button's own label.
     *  Never paraphrased: the row exists to teach this string. */
    command: string;
    /** The stage this step serves. `null` for git, which is not a stage. */
    stage: Stage | null;
    hint: string;
  }

  /** Fixed order, from the workflow in CLAUDE.md. */
  export const FLOW_STEPS: FlowStep[] = [
    { command: '/ec-brainstorm', stage: 'Brainstorm', hint: 'Explore approaches and save one decision' },
    { command: '/ec-plan', stage: 'Plan', hint: 'Turn the decision into a flat task list' },
    { command: '/ec-refine', stage: 'Refine', hint: 'Dry run every verify before any code exists' },
    { command: '/ec-execute', stage: 'Execute', hint: 'Run the tasks one at a time' },
    { command: '/ec-review', stage: 'Review', hint: 'Check the result against the plan' },
    { command: '/ec-git', stage: null, hint: 'Commit and push, with its own confirmations' },
  ];
  ```
- Do not touch: `types.ts` — the `Stage` union is imported, never redefined
- Edge cases: n/a — a constant table with no runtime input
- Acceptance: the six workflow commands are listed in workflow order, each with a hint containing no em dash and no buzzword
- Verify (local): `grep -c "command: '/ec-" studio/src/lib/flow.ts` → `== 6` (baseline 0, file absent). Anchored on the table literal, which Task 7 is forbidden from adding
- Dependencies: none

**Task 7 — Add nextStep to flow.ts** `S`
- File: studio/src/lib/flow.ts
- Reuse: `FLOW_STEPS` from Task 6 and `ProjectState` already imported there
- Code sample:
  ```ts
  /** The step a project is waiting on. `derive_stage` in plan.rs returns the
   *  stage the project has NOT done yet, so for every stage but Idle the stage
   *  is itself the next action. Pure: the one routing authority is the Rust
   *  side, and re-deriving it from disk here could disagree with the driver. */
  export function nextStep(state: ProjectState | null): FlowStep | null {
    if (!state) return null;
    if (state.reviewDone) return FLOW_STEPS[FLOW_STEPS.length - 1];
    if (state.stage === 'Idle') return FLOW_STEPS[0];
    return FLOW_STEPS.find((s) => s.stage === state.stage) ?? null;
  }
  ```
- Do not touch: `FLOW_STEPS` itself, and do not add any further `command: '/ec-` literal to this file — Task 6's count depends on the table being the only source of them
- Edge cases: no project selected returns `null`; an unknown stage returns `null` rather than guessing a step
- Acceptance: a state with `reviewDone` true resolves to the git step; an `Idle` state resolves to the brainstorm step; every other stage resolves to its own step
- Verify (local): `grep -c "export function nextStep" studio/src/lib/flow.ts` → `== 1` (baseline 0)
- Dependencies: Task 6

**Task 8 — Create FlowBar with the step row** `M`
- File: studio/src/components/flow-bar.tsx
- Reuse: `PanelSection`'s chevron glyphs and `font-mono text-xs text-muted` spacing (`panel-section.tsx:27`); `stage-rail.tsx:10`'s accent-for-current convention
- Code sample:
  ```tsx
  import { useState } from 'react';
  import { FLOW_STEPS, type FlowStep } from '../lib/flow';

  interface FlowBarProps {
    next: FlowStep | null;
    collapsed: boolean;
    onToggle: () => void;
    /** null disables every step: there is no session to type into. */
    onDispatch: ((text: string) => void) | null;
  }

  /** Names the six commands literally and types one into the live session on
   *  click. It owns no workflow state and answers no question a command asks. */
  export function FlowBar({ next, collapsed, onToggle, onDispatch }: FlowBarProps) {
    return (
      <div className="shrink-0 border-b border-border">
        <div className="flex h-9 items-center gap-1 px-2">
          {/* step buttons; the next one carries the accent, as the stage rail does */}
          {FLOW_STEPS.map((s) => (
            <button
              key={s.command}
              type="button"
              disabled={!onDispatch}
              title={s.hint}
              onClick={() => onDispatch?.(s.command)}
              className={`shrink-0 px-2 py-1 font-mono text-xs ${
                s.command === next?.command ? 'text-accent' : 'text-muted'
              }`}
            >
              {s.command}
            </button>
          ))}
        </div>
        <p className="truncate px-2 pb-2 text-xs text-muted">
          {next ? next.hint : 'Select a project to run a step'}
        </p>
      </div>
    );
  }
  ```
- Do not touch: `stage-rail.tsx` — the header's five dots stay exactly as they are; this row is not a second rail. `App.tsx` does not pass these props yet, which is why the type-check runs at Task 16 rather than here
- Edge cases: `onDispatch` null disables every button and the hint line reads the no-project copy; `next` null leaves no step accented
- Acceptance: the component renders six buttons labelled with the literal commands, the next step is the only one at accent, and no class string contains `animate-`, `transition-` or `duration-`
- Verify (local): `grep -c "FLOW_STEPS.map" studio/src/components/flow-bar.tsx` → `== 1` (baseline 0, file absent)
- Dependencies: Task 6, Task 7

**Task 9 — Add the brainstorm argument field to FlowBar** `S`
- File: studio/src/components/flow-bar.tsx
- Reuse: the input classes from `properties-panel.tsx:103` verbatim
- Code sample:
  ```tsx
    const [arg, setArg] = useState('');
    // Only brainstorm takes free-form arguments. Every other step is sent bare,
    // and git is sent bare on purpose so its own confirmations still run.
    const textFor = (s: FlowStep) =>
      s.command === '/ec-brainstorm' && arg.trim() ? `${s.command} ${arg.trim()}` : s.command;
  ```
  with the row's trailing field:
  ```tsx
    <input
      value={arg}
      onChange={(e) => setArg(e.target.value)}
      placeholder="what to brainstorm (optional)"
      aria-label="brainstorm argument"
      disabled={!onDispatch}
      className="ml-auto w-56 shrink-0 border border-border bg-ground px-2 py-1 font-mono text-xs"
    />
  ```
  and `onClick={() => onDispatch?.(textFor(s))}`
- Do not touch: the git step's dispatch path — it must never receive arguments
- Edge cases: an empty or whitespace-only argument sends the bare command; the field is disabled with no session
- Acceptance: clicking brainstorm with text in the field sends `/ec-brainstorm {text}`, and clicking any other step sends only its command
- Verify (local): `grep -cF "'/ec-brainstorm'" studio/src/components/flow-bar.tsx` → `== 1` (baseline 0, file absent; the commands themselves live in flow.ts, so this is the single conditional)
- Dependencies: Task 8

**Task 10 — Add the collapse toggle to FlowBar** `S`
- File: studio/src/components/flow-bar.tsx
- Reuse: `panel-section.tsx:23-27` — the same `aria-expanded`, the same `▸`/`▾` pair, the same `w-4` slot
- Code sample:
  ```tsx
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label="flow bar"
      className="w-4 shrink-0 font-mono text-xs text-muted"
    >
      {collapsed ? '▸' : '▾'}
    </button>
  ```
  with the step row, the hint line and the input rendered only when `!collapsed`, and collapsed showing one line:
  ```tsx
    {collapsed && (
      <span className="font-mono text-xs text-muted">
        {next ? `next ${next.command}` : 'flow'}
      </span>
    )}
  ```
- Do not touch: the dispatch logic from Task 9 — collapsing hides the controls and changes nothing about what a click sends
- Edge cases: collapsed with no project shows `flow` rather than an empty row
- Acceptance: collapsed, the bar is a single line naming the next command; expanded, it shows the six steps, the hint and the input
- Verify (local): `grep -c "aria-expanded" studio/src/components/flow-bar.tsx` → `== 1` (baseline 0, file absent)
- Dependencies: Task 8

**Task 11 — Exempt xterm's helper textarea from the shortcut guard** `S`
- File: studio/src/lib/use-shortcuts.ts
- Anchor: `if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;` (line 37)
- Reuse: the existing `target` and `tag` locals
- Code sample:
  ```ts
      // xterm's input sink is a <textarea> of class xterm-helper-textarea, so
      // the blanket TEXTAREA bail made every binding dead whenever the terminal
      // held focus, which is its normal state. xterm does not forward
      // Cmd-modified keys to the PTY, so exempting it cannot swallow input.
      const xtermSink = target?.classList.contains('xterm-helper-textarea') ?? false;
      if (!xtermSink && (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable)) return;
  ```
- Do not touch: the `metaKey` requirement and the `altKey`/`ctrlKey` exclusions at line 33 — they are what make the exemption safe
- Edge cases: `target` null, or an element with no `classList`, falls back to `false` and the original guard applies
- Acceptance: a Cmd binding fires while the terminal has focus, and typing into the branch-name or claude-path field is still unaffected
- Verify (local): `grep -cF "classList.contains('xterm-helper-textarea')" studio/src/lib/use-shortcuts.ts` → `== 1` (baseline 0; the explanatory comment names the class without this call form, so it is not matched)
- Dependencies: none

**Task 12 — Add onToggleFlow and the Cmd+K binding** `S`
- File: studio/src/lib/use-shortcuts.ts
- Anchor: `onToggleRail: () => void;` (line 7)
- Reuse: the ref pattern already in the file at lines 24-29, for the reason recorded there
- Code sample:
  ```ts
    onToggleRail: () => void;
    onToggleFlow: () => void;
  ```
  plus `const flowRef = useRef(onToggleFlow); flowRef.current = onToggleFlow;` and, after the `j` branch:
  ```ts
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        flowRef.current();
      }
  ```
- Do not touch: the existing `1..9`, `b` and `j` branches
- Edge cases: `preventDefault` stops the browser default for Cmd+K; the ref keeps the window listener attached exactly once
- Acceptance: `Cmd+K` invokes the flow callback, and the effect still has an empty dependency list
- Verify (local): `grep -cF "e.key === 'k'" studio/src/lib/use-shortcuts.ts` → `== 1` (baseline 0)
- Dependencies: none

**Task 13 — Refocus the terminal on a focus nonce** `S`
- File: studio/src/components/terminal-pane.tsx
- Anchor: `term.dispose();` (line 71)
- Reuse: the existing `useRef` import and the effect's existing cleanup block
- Code sample:
  ```tsx
    /** The live Terminal, so a dispatch can hand focus back without the pane
     *  re-opening the PTY. Cleared on dispose so a stale handle is never used. */
    const termRef = useRef<Terminal | null>(null);
  ```
  with `termRef.current = term;` after `fit.fit();`, `termRef.current = null;` beside `term.dispose();`, and a second effect:
  ```tsx
    // A changing nonce means the user just dispatched from the flow bar, which
    // moved DOM focus to a button. Zero is the initial value and must not steal
    // focus on mount.
    useEffect(() => {
      if (focusNonce) termRef.current?.focus();
    }, [focusNonce]);
  ```
- Do not touch: the main effect's dependency array `[projectId, cwd, program]` — adding the nonce would tear down and re-open the PTY on every dispatch
- Edge cases: a pane whose terminal has been disposed holds `null` and the optional call is a no-op; `focusNonce` omitted defaults to 0 and nothing focuses
- Acceptance: incrementing `focusNonce` focuses that pane's terminal without reopening its session
- Verify (local): `grep -cF "termRef.current?.focus()" studio/src/components/terminal-pane.tsx` → `== 1` (baseline 0)
- Dependencies: none

**Task 14 — Add the dispatch handler to App** `M`
- File: studio/src/App.tsx
- Anchor: `sidebarCollapsed: false,` (line 41)
- Reuse: `api.ptyWrite` (`tauri-api.ts:51`) and the existing `togglePanel` for persistence
- Code sample:
  ```tsx
    const [focusNonce, setFocusNonce] = useState(0);
  ```
  with `flowCollapsed: false,` added to the `panels` initial state, and:
  ```tsx
    /** Types the command into the active session. `\r` is exactly what xterm's
     *  onData sends for Return (terminal-pane.tsx:49-51), so this is
     *  indistinguishable from the user typing it. No readiness check: the app
     *  cannot observe whether the REPL is at a prompt, and faking that signal
     *  would be worse than the honest behaviour. */
    const handleDispatch = useCallback(
      (text: string) => {
        if (!activeId) return;
        void api.ptyWrite(activeId, `${text}\r`).catch(() => {});
        setFocusNonce((n) => n + 1);
      },
      [activeId],
    );
  ```
- Do not touch: `handleCheckout`, `handleCreateBranch`, and every git path — this handler types text and never runs git
- Edge cases: no active project returns early; a rejected write is swallowed, because the terminal shows the real outcome
- Acceptance: calling the handler writes the text plus a carriage return to the active project's PTY and increments the nonce
- Verify (local): `grep -cF "api.ptyWrite(activeId" studio/src/App.tsx` → `== 1` (baseline 0)
- Dependencies: Task 5, Task 13
- API error handling: `api.ptyWrite` is a Tauri invoke, not a network call; its rejection is swallowed deliberately because the terminal itself is the error surface, matching the `ptyWrite` call at `terminal-pane.tsx:50`

**Task 15 — Render FlowBar above the terminal** `S`
- File: studio/src/App.tsx
- Anchor: `<TerminalPane projectId={p.id} cwd={p.path} program={program} />` (line 336)
- Reuse: `nextStep` from `../lib/flow`, and the `activeState` already derived at line 204
- Code sample:
  ```tsx
        <FlowBar
          next={nextStep(activeState)}
          collapsed={panels.flowCollapsed}
          onToggle={() => togglePanel('flowCollapsed')}
          onDispatch={activeId ? handleDispatch : null}
        />
  ```
  placed directly after the `</header>`, with `focusNonce={p.id === activeId ? focusNonce : 0}` added to the existing `TerminalPane`
- Do not touch: the `projects.map` wrapper and its `hidden` class — unmounting a pane would kill a running `/ec-execute`
- Edge cases: no project selected renders the bar with every step disabled; only the active pane receives a live nonce
- Acceptance: the row sits between the project header and the terminal, and the terminal keeps its full remaining height
- Verify (local): `grep -c "<FlowBar" studio/src/App.tsx` → `== 1` (baseline 0)
- Dependencies: Task 8, Task 9, Task 10, Task 14

**Task 16 — Wire onToggleFlow into useShortcuts** `S`
- File: studio/src/App.tsx
- Anchor: `onToggleRail: useCallback(() => {` (line 267)
- Reuse: the existing `togglePanel`, which already persists through `api.setPanels`
- Code sample:
  ```tsx
      onToggleFlow: useCallback(() => togglePanel('flowCollapsed'), [togglePanel]),
  ```
- Do not touch: `onToggleRail`'s all-three-sections behaviour — the flow bar is its own region and is not part of the rail
- Edge cases: a failed persist leaves the UI toggled, matching `togglePanel`'s existing behaviour
- Acceptance: `Cmd+K` collapses and expands the flow bar and the choice survives a relaunch
- Verify (local): `grep -cF "onToggleFlow:" studio/src/App.tsx` → `== 1` (baseline 0)
- Verify (global): `cd studio && npx tsc --noEmit && npm run build 2>&1 | tail -3` → both exit 0
- Dependencies: Task 12, Task 15

**Task 17 — Add the flow bar command drift test** `S`
- File: tests/test_command_docs.py
- Anchor: `class TestRetiredCommandsFullyRemoved:` (line 450)
- Reuse: `_repo()` at line 446 and the module's existing `os`/`re` imports
- Code sample:
  ```python
  class TestStudioFlowBarCommands:
      """The flow bar types these strings into a live session. A command renamed
      in commands/ and not here would type one that does not exist."""

      CHAIN = ['/ec-brainstorm', '/ec-plan', '/ec-refine',
               '/ec-execute', '/ec-review', '/ec-git']

      def _named(self):
          with open(_repo('studio', 'src', 'lib', 'flow.ts')) as f:
              return re.findall(r"command: '(/ec-[a-z-]+)'", f.read())

      def test_every_named_command_exists(self):
          named = self._named()
          assert named, 'no FLOW_STEPS command literals found in flow.ts'
          for cmd in named:
              path = _repo('commands', cmd.lstrip('/') + '.md')
              assert os.path.isfile(path), f'{cmd} is named by the flow bar but {path} is absent'

      def test_chain_is_complete_and_in_order(self):
          assert self._named() == self.CHAIN
  ```
- Do not touch: `RETIRED_COMMANDS`, `SWEEP_DIRS` and `SWEEP_FILES` — the retired-command sweep covers `commands/` and `hooks/`, not `studio/`, and widening it is a separate decision
- Edge cases: a missing `flow.ts` raises `FileNotFoundError`, which is the correct loud failure; an empty match list fails with a named assertion
- Acceptance: both tests pass against the real `flow.ts`, and renaming a command in `flow.ts` alone makes one of them fail
- Verify (local): `python3 -m pytest tests/test_command_docs.py -q -k StudioFlowBarCommands` → `2 passed`
- Dependencies: Task 6
