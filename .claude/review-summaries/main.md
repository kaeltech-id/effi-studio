# Review Summary — Studio Project Tree with Git Markers and a Visible Installer
_Date: 2026-10-28_

## Feature
Studio Project Tree with Git Markers and a Visible Installer

## Tasks completed
- [x] Task 1: Create tree.rs with GitMark enum [S] — new Rust module declaring the tri-state git marker, serialized camelCase for the frontend
- [x] Task 2: Add git_mark resolver to tree.rs [S] — resolve repo / in-repo / plain by testing `.git` as file or directory with a bounded ancestor walk
- [x] Task 3: Add SKIP_DIRS and MAX_CHILDREN consts to tree.rs [S] — the skip set and per-level cap as named constants with their reasons
- [x] Task 4: Add TreeChild and TreeLevel structs to tree.rs [S] — the per-level payload the frontend renders
- [x] Task 5: Add list_children command to tree.rs [M] — async, directories only, off the async worker via spawn_blocking, capped
- [x] Task 6: Register tree module and list_children in lib.rs [S] — wire the new module and command into the Tauri handler
- [x] Task 7: Add install_session_id command to lib.rs [S] — expose the reserved PTY id so the frontend subscribes before install opens the session
- [x] Task 8: Add ProjectView and stored_projects to projects.rs [M] — view model carrying gitMark, leaving the persisted shape untouched
- [x] Task 9: Add promote_project to projects.rs [S] — add a known path as a project without a second folder dialog
- [x] Task 10: Update lib.rs wrappers for the view model and promotion [M] — match the new return types, wrap promote_project, switch watcher startup to stored rows
- [x] Task 11: Add GitMark, TreeChild, TreeLevel and Project.gitMark to types.ts [S] [agent: ec-typescript] — the TS mirror of the Rust wire types
- [x] Task 12: Add listChildren, installSessionId and promoteProject wrappers to tauri-api.ts [S] [agent: ec-typescript] — the typed boundary for the three new commands
- [x] Task 13: Create git-mark.tsx with GitMarkGlyph [S] [agent: ec-react] [design: direction#GitMarker] — tri-state marker in glyph and weight only, no new hue
- [x] Task 14: Create tree-row.tsx with TreeRow [M] [agent: ec-react] [design: direction#ProjectTree] — one row: indent, chevron, folder glyph, label, marker, rail on projects only
- [x] Task 15: Rewrite project-sidebar.tsx as the disclosure tree [L] [agent: ec-react] [design: direction#ProjectTree] — roots, expansion, lazy children, +N more tail, header, empty state
- [x] Task 16: Add expansion state and handleToggle to App.tsx [M] [agent: ec-react] — in-memory expanded set and child cache, lazily filled on expand
- [x] Task 17: Add handlePromote to App.tsx and wire the sidebar [M] [agent: ec-react] — promote a child to a real project with its own terminal and watcher
- [x] Task 18: Allow attach-only mode in terminal-pane.tsx [S] [agent: ec-react] — a null program subscribes without opening a session
- [x] Task 19: Render the install pane in doctor-screen.tsx [M] [agent: ec-react] [design: direction#InstallPane] — stream install.sh output and re-check automatically on exit
- [x] Task 20: Pass installSessionId into DoctorScreen from App.tsx [S] [agent: ec-react] — fetch the reserved id and hand it to the doctor screen
- [x] Task 21: Add a fail helper to install.sh and route the three failure sites through it [S] — every failure line states the remedy, not only the symptom
- [x] Task 22: Add a step helper to install.sh and route the nine section headers through it [S] — section output reads as sections rather than loose echoes

## Files modified
- `studio/src-tauri/src/tree.rs` (new) — GitMark tri-state, bounded ancestor walk, SKIP_DIRS/MAX_CHILDREN, async list_children
- `studio/src-tauri/src/lib.rs` — mod tree, list_children + install_session_id + promote_project registration, wrapper signatures, stored_projects at startup
- `studio/src-tauri/src/projects.rs` — ProjectView view model, stored_projects, promote_project
- `studio/src/lib/types.ts` — GitMark, TreeChild, TreeLevel, Project.gitMark
- `studio/src/lib/tauri-api.ts` — listChildren, promoteProject, installSessionId
- `studio/src/components/git-mark.tsx` (new) — GitMarkGlyph
- `studio/src/components/tree-row.tsx` (new) — TreeRow
- `studio/src/components/project-sidebar.tsx` — rewritten as the disclosure tree
- `studio/src/components/terminal-pane.tsx` — attach-only mode
- `studio/src/components/doctor-screen.tsx` — install pane, auto-recheck on exit
- `studio/src/App.tsx` — expansion state, lazy child loading, promotion, install id
- `install.sh` — fail() and step() helpers

Blast radius: no dependents found — isolated change.

## Issues fixed during review
- `studio/src/components/doctor-screen.tsx:82,118` — em dashes in rendered UI copy broke an anti-slop hard gate (pre-existing, in an in-scope file) → reworded to "not found. Enter its path below" and "offline, memory unavailable"
- `studio/src/components/tree-row.tsx`, `studio/src/components/project-sidebar.tsx` — the tree renders flat rather than as nested lists, so depth was invisible to assistive technology → added `role="tree"` on the list and `role="treeitem"` + `aria-level` on every row, with non-interactive status rows marked `aria-disabled`

Fixed during execution (recorded here because it was a defect in the plan's own code sample):
- `studio/src/components/doctor-screen.tsx` — the Install click handler called `onInstall()` synchronously, opening the install PTY before React mounted the pane and reintroducing the subscribe-after-open race the design exists to prevent → the install now starts from an effect after the pane mounts, with callbacks held in refs so the subscription is not torn down each render

Plan defects corrected rather than padding code to satisfy them:
- Task 5 `grep -c "spawn_blocking"` and Task 15 `grep -c "MAX_CHILDREN"` both counted the identifier inside the task's own doc comment, so `== 1` was unreachable without deleting a comment. Both re-anchored on the declaration/call, with the reason recorded in the plan.

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ |
| Tests | skipped — no test infrastructure in studio/ |
