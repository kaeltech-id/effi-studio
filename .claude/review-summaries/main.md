# Review Summary — Flow Bar
_Date: 2026-10-29_

## Feature
Flow Bar — stage-aware action row above the terminal

## Tasks completed
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

## Files modified
- studio/src-tauri/src/plan.rs — `review_done` on `ProjectState`
- studio/src-tauri/src/projects.rs — `flow_collapsed` on `PanelState`
- studio/src/lib/types.ts — `reviewDone`, `flowCollapsed`
- studio/src/lib/flow.ts — new: `FLOW_STEPS`, `nextStep`
- studio/src/components/flow-bar.tsx — new: the row itself
- studio/src/lib/use-shortcuts.ts — xterm sink exemption, `onToggleFlow`, Cmd+K
- studio/src/components/terminal-pane.tsx — focus nonce
- studio/src/App.tsx — dispatch handler, FlowBar placement, shortcut wiring
- tests/test_command_docs.py — flow bar command drift test
- studio/src-tauri/src/lib.rs — blast radius only; registers the commands and reads no struct field

## Issues fixed during review
- `studio/src/components/flow-bar.tsx` — the step row would have overflowed. At the default 1180px window the main pane is about 602px, while the six command names alone need about 588px, so the 224px argument field pushed the last button out of reach. The row now wraps and the field moved to the hint row, where it shares space with a truncating hint.
- `studio/src/components/flow-bar.tsx` — the hint repeated the `/ec-brainstorm` literal, so a rename could make the copy describe something other than what a click sends. It now calls `textFor(FLOW_STEPS[0])`, the same function that builds the dispatch.
- `studio/src/lib/use-shortcuts.ts` — the `j` branch lost its terminal position when `k` was appended and regained the `return` every other branch has.

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ |
| Tests | 2 added (152 passed, up from a 150 baseline) |

## Verified, not assumed
- xterm's `evaluateKeyboardEvent` leaves `cancel:false` and `key:undefined` for a Cmd-only letter or digit, and `cancel` is the only path that calls `stopPropagation`. The event therefore reaches the window listener. Established by reading the bundled library source; no key has been physically pressed in the running app.

## Still unverified
- No click has been made in the running app, so `pty_write` delivering a slash command to a live Claude Code REPL rests on the fact that `term.onData` uses the identical call (`terminal-pane.tsx:49-51`).
