## Feature: Orientation and Navigation

### Impact Analysis
- Files affected: `studio/src-tauri/src/projects.rs`, `studio/src/lib/types.ts`, `studio/src/lib/use-shortcuts.ts` (new), `studio/src/components/tree-row.tsx`, `studio/src/components/project-sidebar.tsx`, `studio/src/components/task-panel.tsx`, `studio/src/App.tsx`
- ⚠️ Breaking change risk:
  - `PanelState` gains a fourth field. Backward compatible because the struct carries `#[serde(default)]` at container level (`projects.rs:59`) and derives `Default`, so a `studio.json` written last cycle loads with the sidebar open.
  - `TreeRowProps` gains an optional prop. Every existing call site is in `project-sidebar.tsx`, which this plan also edits, so no caller is left behind.
  - `terminal-pane.tsx` is NOT modified. Listed because the keyboard work could plausibly touch it and deliberately does not — the PTY input path stays untouched.

### Reusable Existing Code
- `studio/src/App.tsx:62` (`togglePanel`) — already flips one `PanelState` key and persists via `api.setPanels`; the sidebar flag joins it rather than getting a second mechanism
- `studio/src/App.tsx:94` (`onProjectState`) — already delivers state for every project, which is the entire data source for the activity marker; no new command, no polling
- `studio/src-tauri/src/watcher.rs:61` — the watcher only emits when a serialised fingerprint changed, so the frontend consumes a pre-filtered signal
- `studio/src/components/git-mark.tsx` — glyph presence carrying state with no new hue and no motion; the activity marker copies that discipline exactly
- `studio/src/components/tree-row.tsx:62` — `GitMarkGlyph` sits in a fixed-width slot before the label; the activity glyph takes the same shape so six rows keep their labels aligned
- `studio/src/components/panel-section.tsx` — the `▸`/`▾` chevron and `aria-expanded`, already the app's disclosure gesture
- `studio/src-tauri/src/projects.rs:59-65` (`PanelState`) and its `panels`/`set_panels` pair — extended with one field, not restructured

### Design Direction
- Dials: ENERGY 1 · RHYTHM 1 · MOTION 1 — carried forward verbatim from every previous Studio cycle, not re-chosen. The app is an instrument panel watched for long stretches while the real work happens in the terminal beside it, so it recedes (ENERGY 1). The activity marker is one glyph in a fixed-width slot on a row shape that is otherwise unchanged, which is what keeps six rows scannable (RHYTHM 1). MOTION 1 is the binding constraint here and rules out the obvious temptation: no pulse, no fade, no blink on the marker, and the task auto-scroll jumps rather than animates. A pulsing dot would be the second moving thing in the app and would compete with the one signal that matters, a checkbox flipping.
- Palette: ground `#0E1116`, surface `#161A21`, border `#232935`, text `#E6E9EF`, muted `#8A93A5`, accent `#4C9AFF` — reason: unchanged, and the accent stays reserved for the active project and the stage badge. The activity marker spends no hue: it is a `•` at text weight, and its absence is the other state, exactly how `git-mark.tsx` distinguishes three git states without color.
- Typography: SF Pro (system) for chrome and row labels; SF Mono for counts, branch names and the marker glyph — reason: the marker sits in the same fixed-width monospace column discipline as the git glyph so six rows keep their labels aligned.
- Identity motif: the fixed five-dot stage rail — brainstorm · plan · refine · execute · review — rendered identically in the sidebar row, the project header and every history entry. The `▸`/`▾` chevron is the second repeated gesture.
- Rules: apply ~/.claude/agents/ec-antislop.md in full — hard gates, purpose gates, quality locks

### Grounding
Measured 2026-10-28 — real command output only, never predicted.

Baseline line counts (`wc -l`):
- `studio/src/App.tsx` → 314
- `studio/src/components/project-sidebar.tsx` → 145
- `studio/src/components/tree-row.tsx` → 86
- `studio/src/components/task-panel.tsx` → 35
- `studio/src/lib/types.ts` → 91
- `studio/src-tauri/src/projects.rs` → 198

New file confirmed ABSENT on disk:
- `studio/src/lib/use-shortcuts.ts` → absent

Baseline string counts (`grep -c`) — every one is 0 today, so each Verify below traces 0 → n:
- `sidebar_collapsed` in projects.rs → 0
- `sidebarCollapsed` in types.ts → 0 · in App.tsx → 0
- `useShortcuts` in App.tsx → 0
- `metaKey` in App.tsx → 0
- `activity` in tree-row.tsx → 0 · in project-sidebar.tsx → 0
- `seen` in App.tsx → 0
- `scrollIntoView` in task-panel.tsx → 0
- `animate-|transition|duration-` in tree-row.tsx → 0 (measured: the row has no motion class today, so Task 4's MOTION 1 check is a real assertion rather than a tautology)
- `behavior: 'smooth'` in task-panel.tsx → 0
- `seenKey` in App.tsx → 0

Import state measured, because two tasks need one added:
- `studio/src/App.tsx:1` → `import { useCallback, useEffect, useState } from 'react';` — **no `useMemo`**, which Task 8 requires
- `studio/src/components/task-panel.tsx:1` → `import type { ProjectState } from '../lib/types';` — **no React import at all**, which Task 6 must add

Baseline test and build results:
- `python3 -m pytest tests/ server/tests/ -q` → **282 passed**, 1 warning, 3.78s
- `cd studio && npm run build` → exit 0
- `cd studio && npx tsc --noEmit` → exit 0
- `cd studio && cargo check --manifest-path src-tauri/Cargo.toml` → exit 0

Environment fact relevant to the keyboard work:
- `grep -rn 'onKeyDown|onKeyUp|keydown|metaKey|ctrlKey|accelerator|GlobalShortcut' studio/src studio/src-tauri/src` → **no matches**. There is no existing keyboard handling to conflict with, and no existing pattern to copy.
- `~/.efficlaude/studio.json` holds 6 projects, so `Cmd+7` through `Cmd+9` are out of range today and must be no-ops rather than errors.

Verified anchors:
- `pub struct PanelState {` → `projects.rs:61`
- `    pub history_collapsed: bool,` → `projects.rs:64`
- `export interface PanelState {` → `types.ts:73`
- `  const [panels, setPanelsState] = useState<PanelState>({` → `App.tsx:29`
- `  const togglePanel = useCallback((key: keyof PanelState) => {` → `App.tsx:62`
- `    const unlisten = onProjectState((id, state) =>` → `App.tsx:94`
- `      <ProjectSidebar` → `App.tsx:241`
- `        onSelect={setActiveId}` → `App.tsx:247`
- `interface TreeRowProps {` → `tree-row.tsx:5`
- `          <GitMarkGlyph mark={gitMark} />` → `tree-row.tsx:62`
- `interface ProjectSidebarProps {` → `project-sidebar.tsx:9`
- `export function TaskPanel({ state }: { state: ProjectState | null }) {` → `task-panel.tsx:9`
- `    <ol className="h-full overflow-y-auto p-2">` → `task-panel.tsx:25`
- `studio/src/lib/use-shortcuts.ts` → new file — no anchor

### Tasks
- [x] Task 1: Add sidebar_collapsed to PanelState in projects.rs [S] — a fourth collapse flag, additive and optional
- [x] Task 2: Add sidebarCollapsed to PanelState in types.ts [S] [agent: ec-typescript] — the TS mirror of the new field
- [x] Task 3: Create use-shortcuts.ts with the useShortcuts hook [M] [agent: ec-typescript] — one window keydown listener, metaKey required, input-safe
- [x] Task 4: Add the activity glyph slot to tree-row.tsx [M] [agent: ec-react] [design: direction#TreeRow] — one dot before the stage rail, no hue and no motion
- [x] Task 5: Thread the activity set through project-sidebar.tsx [M] [agent: ec-react] [design: direction#ProjectSidebar] — pass per-project activity down to root rows
- [x] Task 6: Scroll the first unfinished task into view in task-panel.tsx [M] [agent: ec-react] [design: direction#TaskPanel] — orient on arrival without fighting a manual scroll
- [x] Task 7: Add the sidebar collapse flag and its toggle to App.tsx [M] [agent: ec-react] [design: direction#RightRail] — conditional sidebar render driven by the persisted flag
- [x] Task 8: Track seen state and derive the activity set in App.tsx [L] [agent: ec-react] — per-project fingerprint of stage, done and total, cleared on selection
- [x] Task 9: Wire useShortcuts into App.tsx [M] [agent: ec-react] — Cmd+1 to Cmd+9 project switch, Cmd+B sidebar, Cmd+J rail

### Per Task Detail

**Task 1 — Add sidebar_collapsed to PanelState in projects.rs** `S`
- File: `studio/src-tauri/src/projects.rs`
- Anchor: `    pub history_collapsed: bool,` at `projects.rs:64`
- Reuse: the `PanelState` struct and its container-level `#[serde(default)]` at `projects.rs:59`, which is what makes a fourth field backward compatible without a migration
- Code sample:
  ```rust
  pub struct PanelState {
      pub properties_collapsed: bool,
      pub tasks_collapsed: bool,
      pub history_collapsed: bool,
      /// The left sidebar, not a rail section. It lives here so there is one
      /// persistence mechanism for every collapsible surface rather than two.
      pub sidebar_collapsed: bool,
  }
  ```
- Do not touch: the `panels`/`set_panels` command pair, `StudioConfig`, `load`/`save`, `Project`, `ProjectView`, `promote_project`, and the recorded rationale comment about camelCase on this struct — all unchanged
- ⚠️ Breaking change: `studio.json` gains a key inside `panels`. Reading a file written last cycle is safe because the container `default` fills the missing field with `false`, so the sidebar starts open.
- Edge cases: a `studio.json` whose `panels` object exists but lacks the new key loads with the sidebar open; a hand-corrupted file already degrades to an empty config through `load`'s `unwrap_or_default`
- Acceptance: the sidebar's collapse state can be stored and read back from `studio.json`, and a config written before this change still loads
- Verify (local): `grep -c 'sidebar_collapsed' studio/src-tauri/src/projects.rs` → `== 1` (baseline 0)
- Verify (global): `cd studio && cargo check --manifest-path src-tauri/Cargo.toml` → exit 0. This is the only Rust task in the plan, so it is the Rust module boundary; the baseline recorded this command at exit 0.
- Dependencies: none

**Task 2 — Add sidebarCollapsed to PanelState in types.ts** `S` [agent: ec-typescript]
- File: `studio/src/lib/types.ts`
- Anchor: `export interface PanelState {` at `types.ts:73`
- Reuse: the existing interface; the field name must match the Rust camelCase serde rename
- Code sample:
  ```ts
  export interface PanelState {
    propertiesCollapsed: boolean;
    tasksCollapsed: boolean;
    historyCollapsed: boolean;
    sidebarCollapsed: boolean;
  }
  ```
- Do not touch: `GitInfo`, `BranchInfo`, `Stage`, `STAGES`, `GitMark`, `Project`, `TreeChild`, `TreeLevel`, `Task`, `HistoryEntry`, `ProjectState`, `Doctor`, `doctorBlocking` — all unchanged
- Edge cases: the name must be `sidebarCollapsed` exactly, or the value arrives `undefined` and the sidebar renders as collapsed on a falsy read
- Acceptance: the frontend's panel type carries all four collapse flags that the backend persists
- Verify (local): `grep -c 'sidebarCollapsed' studio/src/lib/types.ts` → `== 1` (baseline 0; no later task touches this file)
- Dependencies: Task 1

**Task 3 — Create use-shortcuts.ts with the useShortcuts hook** `M` [agent: ec-typescript]
- File: `studio/src/lib/use-shortcuts.ts`
- Reuse: none — the Grounding Pass confirmed there is no existing keyboard handling anywhere, so there is no pattern to copy and nothing to conflict with
- Code sample:
  ```ts
  import { useEffect } from 'react';

  export interface Shortcuts {
    /** 1-based index as typed, so Cmd+1 arrives as 1. */
    onProjectIndex: (index: number) => void;
    onToggleSidebar: () => void;
    onToggleRail: () => void;
  }

  /** One window-level listener for every shortcut.
   *
   *  Every binding requires the Cmd key, for two reasons. The terminal forwards
   *  keystrokes to the PTY through xterm's onData (terminal-pane.tsx), and xterm
   *  does not forward Cmd-modified keys by default, so a focused terminal and
   *  this listener can coexist. And the text fields added in earlier cycles —
   *  the branch name, the claude binary path — never use Cmd, so requiring it
   *  plus bailing on an editable target is enough to keep typing unaffected.
   */
  export function useShortcuts({ onProjectIndex, onToggleSidebar, onToggleRail }: Shortcuts) {
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (!e.metaKey || e.altKey || e.ctrlKey) return;

        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

        if (e.key >= '1' && e.key <= '9') {
          e.preventDefault();
          onProjectIndex(Number(e.key));
          return;
        }
        if (e.key === 'b' || e.key === 'B') {
          e.preventDefault();
          onToggleSidebar();
          return;
        }
        if (e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          onToggleRail();
        }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [onProjectIndex, onToggleSidebar, onToggleRail]);
  }
  ```
- Do not touch: `studio/src/components/terminal-pane.tsx` — the PTY input path, its `onData` handler, and its subscribe-before-open ordering all stay exactly as they are. The whole point of requiring Cmd is to avoid needing a change there.
- Edge cases: `altKey` and `ctrlKey` are excluded so `Cmd+Ctrl+1` and `Cmd+Alt+1` do not trigger a switch; the uppercase letter is matched because Cmd+Shift+B reports `B`; `isContentEditable` is checked alongside the tag names because a focused xterm helper textarea reports as `TEXTAREA` and is already covered, while a future rich field would not be; `preventDefault` is called only on a key the hook actually handles, so unrelated Cmd combinations reach the browser
- Acceptance: a Cmd-modified digit or letter invokes the matching callback once, typing in any text field invokes nothing, and the listener is removed when the component unmounts
- Verify (local): `test -f studio/src/lib/use-shortcuts.ts` → exit 0 AND `grep -c 'export function useShortcuts' studio/src/lib/use-shortcuts.ts` → `== 1` AND `grep -c 'metaKey' studio/src/lib/use-shortcuts.ts` → `>= 1` AND `grep -c "tag === 'INPUT'" studio/src/lib/use-shortcuts.ts` → `== 1` (all baseline 0 — new file)
- Dependencies: none

**Task 4 — Add the activity glyph slot to tree-row.tsx** `M` [agent: ec-react] [design: direction#TreeRow]
- File: `studio/src/components/tree-row.tsx`
- Anchor: `          <GitMarkGlyph mark={gitMark} />` at `tree-row.tsx:62`
- Reuse: `git-mark.tsx` — the glyph-in-a-fixed-width-slot shape, including the `w-3 shrink-0 text-center font-mono text-xs` class set, so labels stay aligned whether or not a marker is present
- Code sample:
  ```tsx
  interface TreeRowProps {
    // … existing props unchanged …
    /** Progress arrived while this row was not the active project. One glyph,
     *  no hue and no motion: MOTION 1 forbids a pulsing or fading marker, so
     *  presence against absence is the whole signal. */
    activity?: boolean;
  }
  ```
  and in the row, immediately after the git glyph:
  ```tsx
  <GitMarkGlyph mark={gitMark} />
  <span
    title={activity ? 'Progress since you last looked' : undefined}
    aria-label={activity ? 'has unseen progress' : undefined}
    className="w-2 shrink-0 text-center font-mono text-xs text-text"
  >
    {activity ? '•' : ''}
  </span>
  ```
- Do not touch: the chevron and its `aria-expanded`, the `onActivate` and `onRemove` hit targets, the `StageRail` and count rendering, and the indent-by-padding approach with its recorded reason — all unchanged
- Edge cases: the slot keeps its width whether or not the glyph is drawn, so a row gaining or losing a marker does not shift its label; `title` and `aria-label` are set only when the marker is present, so an empty slot announces nothing; the prop is optional so child rows that never carry activity need not pass it
- Acceptance: a row can show a single dot before its stage rail indicating unseen progress, every row's label stays at the same x whether or not that dot is drawn, and the marker is announced to assistive technology only when it is actually there
- Verify (local): `grep -c 'activity' studio/src/components/tree-row.tsx` → `>= 3` (the prop declaration, the destructure and the render; baseline 0) AND `grep -cE 'animate-|transition|duration-' studio/src/components/tree-row.tsx` → `== 0` (MOTION 1: the marker must not move)
- Dependencies: none

**Task 5 — Thread the activity set through project-sidebar.tsx** `M` [agent: ec-react] [design: direction#ProjectSidebar]
- File: `studio/src/components/project-sidebar.tsx`
- Anchor: `interface ProjectSidebarProps {` at `project-sidebar.tsx:9`
- Reuse: the existing `states` prop shape — a plain record keyed by project id — which `activity` mirrors as a `Set` of ids
- Code sample:
  ```tsx
  interface ProjectSidebarProps {
    // … existing props unchanged …
    /** Project ids whose state moved while they were not active. A Set rather
     *  than a per-row flag so the sidebar stays a pure render of App's state. */
    activity: Set<string>;
  }
  ```
  and on the root `<TreeRow>` only:
  ```tsx
  activity={activity.has(p.id)}
  ```
- Do not touch: `renderChildren` and the child `<TreeRow>` at `project-sidebar.tsx:74` — a child row is a folder being browsed, not a workspace being watched, so it carries no marker; also leave `Note`, `MAX_CHILDREN`, the header, the empty state, and `Add Folder…` unchanged
- Edge cases: a project id absent from the set renders no marker, which is the common case; the set is read-only here, since clearing it belongs to the selection handler in App
- Acceptance: each configured project row shows a marker exactly when App says that project has unseen progress, and expanded child folders never show one
- Verify (local): `grep -c 'activity' studio/src/components/project-sidebar.tsx` → `>= 2` (the prop declaration and the root-row pass-through; baseline 0) AND `grep -c 'activity={activity.has' studio/src/components/project-sidebar.tsx` → `== 1` (exactly one call site, proving child rows were not given one)
- Dependencies: Task 4

**Task 6 — Scroll the first unfinished task into view in task-panel.tsx** `M` [agent: ec-react] [design: direction#TaskPanel]
- File: `studio/src/components/task-panel.tsx`
- Anchor: `    <ol className="h-full overflow-y-auto p-2">` at `task-panel.tsx:25`
- Reuse: the component's existing display-only stance and its raw-markdown fallback, both unchanged; the `state.done` field as the only trigger, since it is already the number the sidebar and header show
- Code sample: the file has NO React import today (its only import is the `ProjectState` type), so one must be added first:
  ```tsx
  import { useEffect, useRef } from 'react';
  ```
  ```tsx
  const firstPending = useRef<HTMLLIElement | null>(null);

  // Only on arrival or on real progress. Running this on every render would
  // fight a deliberate scroll upward to re-read an earlier task, and `block:
  // 'nearest'` keeps an already-visible task from jumping.
  useEffect(() => {
    firstPending.current?.scrollIntoView({ block: 'nearest' });
  }, [state?.featureTitle, state?.done]);
  ```
  with the ref attached to the first task whose `done` is false:
  ```tsx
  const pendingIndex = state.tasks.findIndex((t) => !t.done);
  // …
  <li ref={i === pendingIndex ? firstPending : null} … >
  ```
- Do not touch: the display-only rule and its recorded reason (a clickable checkbox would imply the panel writes the plan), the raw-markdown fallback and its note that it is not dead code, and the verbatim rendering of `[M]` / `[agent: …]` / `[design: …]` tags
- Edge cases: a plan with every task done has `pendingIndex === -1` so no ref is attached and the effect is a no-op; `featureTitle` is in the dependency list so switching to a different project's plan re-scrolls even when both plans happen to have the same `done` count; `scrollIntoView` with `block: 'nearest'` does nothing when the target is already visible, which is what keeps it from jumping on every completed task; no `behavior: 'smooth'` because MOTION 1 forbids the animation
- Acceptance: opening a partly completed plan shows the first unfinished task without the user scrolling, the view follows execution as tasks complete, and a deliberate scroll upward is not undone by an unrelated re-render
- Verify (local): `grep -c 'scrollIntoView' studio/src/components/task-panel.tsx` → `== 1` (baseline 0) AND `grep -vE '^\s*(//|\*|/\*)' studio/src/components/task-panel.tsx | grep -c "behavior: 'smooth'"` → `== 0` (comment lines excluded: this task's own comment names the option it refuses, so a file-wide count could only reach 0 by deleting that comment — MOTION 1 is asserted against executable code)
- Dependencies: none

**Task 7 — Add the sidebar collapse flag and its toggle to App.tsx** `M` [agent: ec-react] [design: direction#RightRail]
- File: `studio/src/App.tsx`
- Anchor: `  const [panels, setPanelsState] = useState<PanelState>({` at `App.tsx:29`
- Reuse: `togglePanel` at `App.tsx:62`, which already flips one `PanelState` key and persists through `api.setPanels`; the sidebar flag needs no new handler
- Code sample: the initial state gains the fourth key —
  ```tsx
  const [panels, setPanelsState] = useState<PanelState>({
    propertiesCollapsed: false,
    tasksCollapsed: false,
    historyCollapsed: false,
    sidebarCollapsed: false,
  });
  ```
  and the sidebar is rendered conditionally:
  ```tsx
  {!panels.sidebarCollapsed && (
    <ProjectSidebar … />
  )}
  ```
- Do not touch: the three existing rail `<PanelSection>` elements, the always-mounted terminal pane loop and its recorded reason (unmounting would kill a running execute), the doctor gate, and the git handlers from last cycle
- Edge cases: collapsing the sidebar unmounts it, which is safe because it holds no running process and its expansion state lives in App rather than in the component; the terminal panes are untouched by the collapse because they sit in `<main>`, so a collapse does not restart anything
- Acceptance: the sidebar can be hidden and shown, the state survives a relaunch through `studio.json`, and hiding it does not disturb any running terminal
- Verify (local): `grep -c 'sidebarCollapsed' studio/src/App.tsx` → `>= 2` (the initial state and the conditional render; baseline 0)
- Dependencies: Task 2

**Task 8 — Track seen state and derive the activity set in App.tsx** `L` [agent: ec-react]
- File: `studio/src/App.tsx`
- Anchor: `    const unlisten = onProjectState((id, state) =>` at `App.tsx:94`
- Reuse: the `onProjectState` subscription at `App.tsx:94`, which already receives state for every project; `watcher.rs:61`, which already suppresses emissions that change nothing
- Code sample: `App.tsx:1` imports `useCallback, useEffect, useState` and does NOT import `useMemo`, which the activity derivation needs, so the import widens first:
  ```tsx
  import { useCallback, useEffect, useMemo, useState } from 'react';
  ```
  ```tsx
  /** Only the three fields a sidebar row renders. A `.claude/` write that
   *  changes none of them must not light up a marker. */
  function seenKey(s: ProjectState | undefined): string {
    return s ? `${s.stage}:${s.done}:${s.total}` : '';
  }
  ```
  ```tsx
  const [seen, setSeen] = useState<Record<string, string>>({});

  // The active project is marked seen as its state arrives, so it can never
  // carry a marker. Every other project's record is left alone until selected.
  useEffect(() => {
    if (!activeId) return;
    setSeen((prev) => {
      const key = seenKey(states[activeId]);
      return prev[activeId] === key ? prev : { ...prev, [activeId]: key };
    });
  }, [activeId, states]);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setSeen((prev) => ({ ...prev, [id]: seenKey(states[id]) }));
  }, [states]);

  const activity = useMemo(
    () =>
      new Set(
        projects
          .filter((p) => p.id !== activeId && seenKey(states[p.id]) !== (seen[p.id] ?? ''))
          .map((p) => p.id),
      ),
    [projects, states, seen, activeId],
  );
  ```
  `onSelect={setActiveId}` at `App.tsx:247` becomes `onSelect={handleSelect}`, and `activity` is passed to the sidebar.
- Do not touch: the `onProjectState` subscription body itself — it keeps writing into `states` exactly as it does; `handleToggle`, `handlePromote`, `handleAdd`, `handleRemove`, and the git handlers are unchanged
- Edge cases: a project with no state yet has `seenKey` of `''` and an absent record, which compare equal, so a freshly added project shows no marker; the active project is excluded by the filter AND kept current by the effect, so the two mechanisms agree rather than race; `seen` is in-memory only, so every project starts unmarked after a relaunch, which is correct because the user has not looked at anything yet in that session
- Acceptance: a project whose stage or task counts move while it is not active shows a marker, selecting it clears the marker, the active project never shows one, and a write that changes none of those three fields produces no marker
- Verify (local): `grep -c 'seenKey' studio/src/App.tsx` → `>= 3` (the helper plus its uses; baseline 0 for `seen`) AND `grep -c 'onSelect={handleSelect}' studio/src/App.tsx` → `== 1` (proves the raw `setActiveId` pass-through was replaced, so selection can clear the marker)
- Dependencies: Task 5, Task 7

**Task 9 — Wire useShortcuts into App.tsx** `M` [agent: ec-react]
- File: `studio/src/App.tsx`
- Anchor: `      <ProjectSidebar` at `App.tsx:241`
- Reuse: `useShortcuts` from Task 3; `handleSelect` from Task 8 so a keyboard switch clears the marker exactly as a click does; `togglePanel` at `App.tsx:62` for both panel bindings
- Code sample:
  ```tsx
  // Indexes the CONFIGURED project list, not the visible tree rows: expanding a
  // folder changes which rows are visible, and a shortcut whose target moves is
  // worse than no shortcut. Out-of-range indices are ignored — six projects are
  // configured today, so Cmd+7 through Cmd+9 do nothing.
  useShortcuts({
    onProjectIndex: useCallback(
      (index: number) => {
        const p = projects[index - 1];
        if (p) handleSelect(p.id);
      },
      [projects, handleSelect],
    ),
    onToggleSidebar: useCallback(() => togglePanel('sidebarCollapsed'), [togglePanel]),
    onToggleRail: useCallback(() => {
      // One key for the whole rail: collapse all three when any is open,
      // otherwise reopen all three. A per-section key would need three more.
      const anyOpen =
        !panels.propertiesCollapsed || !panels.tasksCollapsed || !panels.historyCollapsed;
      const next = {
        ...panels,
        propertiesCollapsed: anyOpen,
        tasksCollapsed: anyOpen,
        historyCollapsed: anyOpen,
      };
      setPanelsState(next);
      void api.setPanels(next).catch(() => {});
    }, [panels]),
  });
  ```
- Do not touch: `terminal-pane.tsx` and the PTY path; the doctor gate; the `<PanelSection>` headers, which keep their own click toggles so the mouse path is unchanged
- Edge cases: `Cmd+7` through `Cmd+9` are no-ops today because only six projects are configured, and the guard is `if (p)` rather than a length check so the behaviour holds as projects are added or removed; `onToggleRail` persists through the same `api.setPanels` call `togglePanel` uses, with the same swallowed failure, because losing a collapse preference must not interrupt the user; the hook is called unconditionally before the doctor-screen early returns, as hooks must be
- Acceptance: pressing Cmd and a digit switches to that project and clears its marker, Cmd+B hides and shows the sidebar, Cmd+J collapses and reopens the whole rail, and typing in any text field does none of these
- Verify (local): `grep -c 'useShortcuts' studio/src/App.tsx` → `>= 2` (the import and the call; baseline 0) AND `grep -c "togglePanel('sidebarCollapsed')" studio/src/App.tsx` → `== 1`
- Verify (global): `cd studio && npm run build` → exit 0 AND `cd studio && npx tsc --noEmit` → exit 0. Frontend module boundary and the last task; the baseline recorded both at exit 0.
- Dependencies: Task 3, Task 8
