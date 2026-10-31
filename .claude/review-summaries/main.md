# Review Summary — Workbench v2
_Date: 2026-10-30_

## Feature
Workbench v2 — ambil mockup persis di mana produk bisa jujur (proof mode: handoff)

## Tasks completed
All 14 `- [x]`, 4 waves. See `.claude/plans/archive/`.

## Files modified
New: `workspace-rail.tsx`, `segmented.tsx`, `project-activity.tsx`, `composer.tsx`,
`tests/test_workbench_v2.py`, Rust `git_diff_stat`.
Rewritten: `project-sidebar.tsx`, `task-panel.tsx`, `history-panel.tsx`, `flow-bar.tsx`,
`workbench.tsx`, left column of `App.tsx`, `types.ts`, `tauri-api.ts`, `git.rs`, `lib.rs`,
`tab-strip.tsx`, `tauri.conf.json`.
Out of plan scope, during execution: `tests/test_studio_guards.py` (PTY-writer allowlist).
Blast radius: no dependents.

## Answering the actual question
"Bisa dibuat sama persis?" — **Structurally yes; literally no, and the gaps are named.**
All three columns match the Contract's order exactly and all 19 Contract copy strings are
verbatim. The palette already matched before this cycle. What cannot match:

- **The centre body stays a terminal.** The mockup draws a chat transcript; the app runs
  CLI agents in a PTY with no structured message stream, so bubbles, avatars, tool-call
  cards and diff cards would be invented content. Declared.
- **Three mockup elements have no data source at all** and were refused rather than faked:
  the history note card (`HistoryEntry` has no note field), the task subtitle (`Task` is
  `{done, text}`), and the per-row ellipsis menus (no handlers).
- **The flow strip names the real six-value `Stage` enum**, not the mockup's four generic
  labels, which would have mislabelled the user's own `/ec-*` chain.
- **Brand blue and violet cannot carry borders, text, rings or strokes** — 3.82:1 and
  4.49:1 on navy, banned by `test_studio_guards.py:634`. Selected states use
  `border-accent bg-accent-tint` instead of the mockup's blue edge.

## Issues fixed during review
Three reviewers: visual fidelity vs the mockup, React quality/type safety, accessibility.

**Two WCAG AA failures, both blocking, both fixed**
- `project-sidebar.tsx:180` (SC 2.4.7) — the project menu's only item **removes a project**,
  focus is moved onto it programmatically when the menu opens, and the sole focus indicator
  was `bg-raised` → `bg-hover` at **1.12:1**: invisible. A keyboard user's focus landed on a
  destructive control with no visible indication. Now uses the file's own `FOCUS` ring.
- `project-activity.tsx:90` (SC 1.4.3) — `opacity-60` on the failed Git card composited the
  **error reason** to **3.79:1** at 12px. The one line saying *why* git failed was the one
  that faded below the floor. Opacity dropped (→ 8.34:1), reason promoted to `text-text`,
  and the `aria-disabled` it hung on removed (not a supported state on `role="region"`).
- `composer.tsx:125` (SC 2.4.7, contested) — the only control sharing a keyboard surface
  with a live terminal had no focus ring, while the constant sat ten lines above it. Fixed.

**Two real React bugs, both fixed**
- A module `WeakMap` bridged the project path to `Inspector`, keyed on the `ProjectState`
  object — which `App.tsx:771` **replaces on every `.claude/` write**. During `/ec-execute`
  the Git card therefore blanked to "No git status yet" and spawned an extra
  `git diff --numstat` subprocess on every plan-file write. The code's own comment claimed
  the bridge *prevented* that frame; it was the only thing producing it. Replaced with a
  `projectPath` prop from `App.tsx:1397`, which already held the value. −75 lines.
- `useGitDiffStat` retained the **previous project's** numbers under the **new project's**
  branch pill for the length of a git subprocess. The stat is now keyed to its own path.

**Visual fidelity, fixed**
- `tauri.conf.json` default window 1180×760 → **1500×950**. At 1180 the centre column was
  480px against the Contract's 886px, so every flow-strip label truncated on first run —
  the mockup was unreachable at launch.
- `tab-strip.tsx:281` — dropped `bg-surface` + `border-b` so the tabs float, which the plan
  itself specified ("only its container chrome changes") and execution had not done.

**Under-build of the plan's own task, fixed**
- Task 3 asked for "the frontend types **and api wrapper**"; only the type landed, so
  `workbench.tsx` called `invoke()` directly against the rule `tauri-api.ts:33-37` states.
  `api.gitDiffStat` added; the direct `invoke` import removed.
- `project-sidebar.tsx` `as Node` cast replaced with `instanceof` narrowing; `Segmented`'s
  option/props types exported so a caller cannot silently widen `T` to `string`.

## Known gaps, deliberately NOT fixed
- **Branch checkout and create-branch are gone from the UI.** The Contract's right column
  ends with the `Project & Git` card and draws no switcher, so following it removed the
  surface that mounted `PropertiesPanel`. Rust commands and api wrappers are intact. This is
  a product decision and should land as its own change with that stated, not as cleanup.
  `properties-panel.tsx` is orphaned and the seven git props stay accepted-and-unread until
  then — they are what keep the feature's wiring visible.
- **The Rust in this cycle has never been compiled.** `git.rs` and `lib.rs` changed;
  `cargo check` measures 35.97s and the allowed-check rule makes it a Handoff step.
- Four different "selected" expressions across the columns, four copies of the branch pill,
  `role="tree"` without a tree keyboard model, the flow bar's undeclared command row, and the
  tab `+` pinned to the column edge — all recorded, none urgent.

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ 14/14, evidence audit 14/14 |
| Visual fidelity | ✓ after fixes — structure exact, named deviations only |
| Code quality / type safety | ✓ after fixes |
| Accessibility | ✓ after fixes (2 AA failures found and closed) |
| Tests | 8 guards added · suite 265 → 273 passed, 0 failed |
| Type-check | ✓ `tsc --noEmit` clean |
| Rust compile | **deferred to Handoff by proof mode** |
