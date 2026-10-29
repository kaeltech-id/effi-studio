## Feature: Effi Studio v2 — Build experience

### Impact Analysis
- Files affected (existing, modified): `studio/src/styles.css`, `studio/src/App.tsx`, `studio/src/lib/types.ts`, `studio/src/lib/tauri-api.ts`, `studio/src/lib/flow.ts`, `studio/src/lib/use-shortcuts.ts`, `studio/src/components/terminal-pane.tsx`, `studio/src/components/doctor-screen.tsx`, `studio/src/components/flow-bar.tsx`, `studio/src/components/project-sidebar.tsx`, `studio/src/components/task-panel.tsx`, `studio/src/components/history-panel.tsx`, `studio/src/components/properties-panel.tsx`, `studio/index.html`, `studio/README.md`, `studio/src-tauri/src/lib.rs`, `studio/src-tauri/src/pty.rs`, `studio/src-tauri/src/doctor.rs`, `studio/src-tauri/src/projects.rs`, `studio/src-tauri/tauri.conf.json`, `studio/icons-src/mkicon.py`, `install.sh`, `tests/test_command_docs.py`
- Files affected (new): `studio/src/lib/experiences.ts`, `studio/src/lib/tabs.ts`, `studio/src/lib/agents.ts`, 14 new components under `studio/src/components/`, `studio/src-tauri/src/{experiences,setup,tabs,agents,browser,devices,connections,migrate}.rs`, 3 SVG assets, 3 new test files
- ⚠️ Breaking change risk:
  - `Doctor` / `doctorBlocking` are removed from the public frontend type surface — every importer must move to the new `Diagnostics` shape (Tasks 26–30).
  - `SessionRegistry` is re-keyed from project id to session id, and `pty_open` stops taking a bare `program` — any caller passing a project id as the session key breaks (Tasks 51–52).
  - `install.sh` gains component flags; invoked with no flags it must keep behaving exactly as today or existing users lose their install path (Tasks 38–39).
  - `studio.json` gains `experiences`, `tabs`, `agents`, `connections`. Every new field carries `#[serde(default)]` so an older file still loads; a missing default would wipe a user's project list on first launch.
- ⚠️ Granularity deviation, stated openly rather than faked: `/ec-plan`'s "2–5 minutes per task" rule is not satisfiable for a scope this size — honouring it literally would produce roughly a thousand tasks. This plan uses 130 tasks on the command's own S/M/L scale (S <1hr · M 1–3hr · L >3hr), which means the average task is hours, not minutes. `/ec-refine` should treat this as the first thing to audit: either accept the S/M/L granularity for this cycle, or the scope has to be cut by the user (not by the planner).
- Verify is deliberately inert throughout. No task implements a test runner, evidence store, Verify dependency, install path, or release date.
- Two dependency edges point forward in the numbering, and both are genuine rather than fabricated: Task 15 needs Task 16's `ExperienceState` type, and Task 27 needs Task 30 to stop calling `doctorBlocking` before the function can be deleted. `/ec-execute` orders by the `Dependencies:` field rather than by task number, so both resolve correctly; the numbering is not the execution order. Every other dependency points backward.

### Reusable Existing Code
- `studio/src/lib/tokens.ts:6` `token(name)` — reads a `@theme` custom property at runtime; reuse unchanged for the retuned xterm theme instead of hardcoding hex.
- `studio/src/components/panel-section.tsx` — collapsible section with a title and detail slot; reuse for inspector sections and Settings groups rather than writing a second collapsible.
- `studio/src/components/stage-rail.tsx` — five-dot stage indicator; reuse as-is, it already reads stage as a recommendation.
- `studio/src-tauri/src/shell_env.rs:8` `login_shell_path()` — probes the login shell for PATH; reuse for every provider CLI discovery, not just Claude.
- `studio/src-tauri/src/shell_env.rs:40` `resolve_claude(override)` — the override-then-PATH-then-fallbacks resolution order; generalise this function rather than writing a parallel resolver per provider.
- `studio/src-tauri/src/projects.rs:81` `load()` / `:88` `save()` — the degrade-to-default studio.json reader and pretty writer; every new persisted field goes through these two, not a second config file.
- `studio/src-tauri/src/projects.rs:99` `project_id(abs)` — the 16-hex path digest; reuse its shape for stable tab ids so no uuid dependency is added.
- `studio/src-tauri/src/pty.rs:11` `spawn(cwd, program, path)` and `:37` `start_reader` — the PTY primitives; keep both and change only the registry key and the command construction.
- `studio/src/lib/tauri-api.ts:58` `onPtyOutput(id, cb)` — already filters events by id so two sessions cannot interleave; reuse the filter, widen the id to a session id.
- `studio/src/components/terminal-pane.tsx:54` the subscribe-before-open `Promise.all` and `:63` the `0x0` guard — both are load-bearing and must survive the session re-key verbatim.
- `studio/src/lib/flow.ts:13` `FLOW_STEPS` and `:30` `nextStep` — the Claude workflow mapping; reuse for the Claude adapter and do not generalise it into a provider-agnostic heuristic.
- `studio/src-tauri/src/doctor.rs:16` `worker_ok()` — the hand-rolled loopback probe; reuse as the worker component's check.
- `studio/icons-src/mkicon.py` — the existing icon export pipeline; drive it from the new SVG instead of writing a second exporter.

### Design Contract
- Source: `design/effi-studio-v2/` — `DESIGN-SPEC.md` (product + visual rules), `BUILD-CHANGES.md` (source map), `CLAUDE-IMPLEMENTATION-PROMPT.md` (implementation rules), `brand/01-effi-identity.png`, `brand/02-logomark.png`, and `mockups/01-choose-experiences.png` … `mockups/09-codex-and-add-tool.png`  ·  Viewport: target 1440×900; must stay comfortable at the actual default 1180×760; QA also at 980×700 and 800×650
- Layout: native titlebar with no duplicate HTML traffic lights. Experience selector above the sidebar → Projects registry → Workbench (tab strip 38–40px, one scrolling row, never a wrapped stack) → Inspector (Tasks/History + Project & Git). Panels 220/300 at ≥1360px, 208/280 at 1100–1359, inspector becomes a drawer at 900–1099 with sidebar 192, both become drawers below 900 with a single active overlay. Installer editorial column hides at compact width. Terminal keeps the dominant share of the main area.
- Spacing: 4 / 8 / 12 / 16 / 24 / 32 / 40 grid; radius 8px controls, 12px groups, 10px popovers; borders 1px.
- Typography: system sans (SF Pro / system-ui) + system mono (SF Mono / Menlo). Body 14/21, meta 12/18, section 14/20 semibold, project title 20/28, setup title 28–30/36, editorial 38/44, terminal 13–14px with comfortable line-height.
- Color: ground `#101112`, surface `#17191B`, raised `#1D2023`, hover `#25292D`, border `#30353B`; text `#F3EFE9`, secondary `#A4ABB2`, terminal foreground `#E2E5E8`; copper `#E5A17C`, on-copper `#211710`, tint `#30241E`; success `#9CC5AF`, warning `#E6C182`, error `#EDA6A6`. Copper means selection and primary action; sage means healthy — never interchangeable. Normal-text contrast ≥4.5:1. No purple, neon, large gradients, or generic dashboard chrome.
- Elements: per mockup, in order — experience selector rows (Build Available, Verify Coming soon disabled); project sidebar with git markers, Add project, Remove from Studio; project header with name / path / branch; tab strip with per-tab icon, title, provider or tool label, reachable menu and close, plus a `+` opening Add a tool split into Agent sessions / Workspace tools; tab bodies for agent session, shell terminal, browser (back / forward / reload / address field / page title / open externally), iOS Simulator and Android Emulator control surfaces; workflow row naming `/ec-brainstorm` … `/ec-git` literally with a brainstorm-only argument field; inspector Tasks/History tabs and Project & Git disclosure; Connections list with connector, scope, server, and per-consumer status; Settings with Experiences / Agents / Tools / Connections / Appearance / Diagnostics; onboarding screens for Choose experiences, Choose tools, Review setup, and setup states; Verify Coming-soon landing with three planned teasers. Logo: angular E in an open bracket, two interior bars, square at right; UI mark 16–24px, lockup ≥96–120px, clear space half the symbol height, one squircle app icon for both experiences.
- Copy: `Your tools. Your flow.` · `How will you use Effi?` · `Choose what you need. Add more later.` · `Not available to install yet.` · `Continue with Build` · `Set up later` · `Open Studio` · `Open Build` · `Review setup` · `Make this workspace yours.` · `Set up Build` · `Your next project starts here.` · `Verify, coming soon.` · `A focused space for testing, evidence, and release confidence.` · teasers `Explore flows` / `Capture evidence` / `Track quality` · `Back to Build` / `Back to Studio` / `Manage experiences` · `Workflow shortcuts are not configured for this agent.` · `CLI session` · `Sends /ec-execute to Claude Code` · `Source: Claude plan` · `Opens in a separate window` · `Open Simulator` / `Open Emulator` · `Stop device` · `Close session` · `Set executable path` / `Check again` / `Retry this component` · `No tasks yet` · selection summary of the form `2 existing agents linked · Browser enabled · No device downloads`
- States: component readiness — not selected / detected / queued / installing or setup session open / ready / needs attention / unavailable. Connection — not configured / configured / checking / connected / needs authentication / failed / disabled / unsupported by this agent. Device — not enabled / dependency missing / device or runtime missing / available. Browser — loading / error / unreachable / certificate / download / popup. Plus hover, focus with a visible ring, disabled, selection, long task wrap, branch and path truncation with the full value reachable, detached HEAD, unfinished-task warning, partial install, raw-plan fallback, and empty states for no experience / no project / no agent / no plan / no history. Every status colour also carries a label or icon. Indeterminate progress where no real signal exists — no invented percentages or timers. Motion 120–160ms, honouring reduced motion.
- Deviations allowed: the mockups are AI concepts — their project data, terminal output, diagnostic results, numbers, and raster material gradients are examples, not production content. Solid token values beat the raster. Do not draw a second set of traffic lights, do not show an unread dot on the active project, do not treat a checked box as healthy or `Detected` as authenticated, and do not crop a brand board into the production logo. Responsive adaptation per the breakpoints above is expected.

### Grounding
Measured 2026-10-29 — real command output only.

Baseline line counts (`wc -l`):
- `studio/src/App.tsx` → 414
- `studio/src/styles.css` → 28
- `studio/src/lib/types.ts` → 97
- `studio/src/lib/tauri-api.ts` → 80
- `studio/src/lib/flow.ts` → 35
- `studio/src/lib/tokens.ts` → 8
- `studio/src/lib/use-shortcuts.ts` → 77
- `studio/src/components/terminal-pane.tsx` → 90
- `studio/src/components/doctor-screen.tsx` → 166
- `studio/src/components/flow-bar.tsx` → 89
- `studio/src/components/project-sidebar.tsx` → 150
- `studio/src/components/task-panel.tsx` → 52
- `studio/src/components/history-panel.tsx` → 38
- `studio/src/components/properties-panel.tsx` → 124
- `studio/src/components/panel-section.tsx` → 34
- `studio/src/components/stage-rail.tsx` → 32
- `studio/index.html` → 14
- `studio/src-tauri/src/lib.rs` → 228
- `studio/src-tauri/src/pty.rs` → 84
- `studio/src-tauri/src/doctor.rs` → 133
- `studio/src-tauri/src/projects.rs` → 204
- `studio/src-tauri/src/plan.rs` → 234
- `studio/src-tauri/src/shell_env.rs` → 87
- `studio/src-tauri/tauri.conf.json` → 44
- `install.sh` → 293
- `tests/test_command_docs.py` → 512

Baseline string counts:
- `grep -c -F '--color-' studio/src/styles.css` → 8
- `grep -c -F '#E5A17C' studio/src/styles.css` → 0
- `grep -c -F 'doctorBlocking' studio/src/App.tsx` → 2
- `grep -c -F 'doctorBlocking' studio/src/lib/types.ts` → 1
- `grep -c -F 'EffiClaude Studio' studio/src-tauri/tauri.conf.json` → 2
- `grep -c -F 'Effi Studio' studio/src-tauri/tauri.conf.json` → 0
- `grep -c -F 'EffiClaude' studio/index.html` → 0
- `grep -c -F 'projectId' studio/src/components/terminal-pane.tsx` → 9
- `grep -c -F 'sessionId' studio/src/components/terminal-pane.tsx` → 0
- `grep -c -F 'invoke<' studio/src/lib/tauri-api.ts` → 21
- `grep -c -F 'tauri::command' studio/src-tauri/src/lib.rs` → 10
- `grep -c -F 'xterm-helper-textarea' studio/src/lib/use-shortcuts.ts` → **2** (the comment at line 46 and the code at line 49 — an earlier draft of this plan assumed 1, which is the measurement error this baseline exists to prevent)
- `grep -c -F 'e.metaKey' studio/src/lib/use-shortcuts.ts` → 1
- `grep -c -F 'onTabNext' studio/src/lib/use-shortcuts.ts` → 0
- `grep -c -iF 'pending' studio/src/components/task-panel.tsx` → 4 (so a bare `pending` threshold is unusable here)
- `grep -c -F 'aria-hidden' studio/src/components/task-panel.tsx` → 0
- `grep -c -F 'No tasks yet' studio/src/components/task-panel.tsx` → 0
- `grep -c -F '/ec-feature' studio/src/components/task-panel.tsx` → 1 (at `task-panel.tsx:31`, `No plan yet — run /ec-feature`)
- `grep -c -F "next?.command === '/ec-brainstorm'" studio/src/components/flow-bar.tsx` → 0
- `grep -c -F 'onDispatch?.(textFor(s))' studio/src/components/flow-bar.tsx` → 1
- `grep -c -F '[sessionId, cwd, agentId]' studio/src/components/terminal-pane.tsx` → 0
- `grep -c -F 'sessionId' studio/src/components/terminal-pane.tsx` → 0
- `grep -c -F 'want_component' install.sh` → 0
- `grep -c -F -- '--only' install.sh` → 0
- `grep -c -F 'bundle identifier' studio/README.md` → 0
- `grep -c -F 'Effi Studio' studio/README.md` → 0
- `grep -c -F 'def test_no_invented' tests/test_command_docs.py` → 0
- `grep -rciE 'keychain|keyring' studio/src-tauri/src/` → 0 files match
- `grep -rc -F 'aria-live' studio/src/components/` → 0 files match
- `grep -c -F 'detached' studio/src/components/properties-panel.tsx` → 2
- `grep -c -F "'hidden'" studio/src/App.tsx` → 1 (at `App.tsx:362`)
- `grep -c -F '/ec-' studio/src/lib/flow.ts` → 6
- `grep -c -F 'if (!host.clientHeight || !host.clientWidth) return;' studio/src/components/terminal-pane.tsx` → 1
- `grep -c -F 'id.kaeltech.efficlaude.studio' studio/src-tauri/tauri.conf.json` → 1
- `grep -rc -F 'effi-plan' studio/src install.sh commands/` → 0 files match
- `grep -rciE 'password|token' studio/src-tauri/src/projects.rs` → 0
- `bash -n install.sh` → exit 0
- `tests/test_studio_a11y.py` → absent
- `wc -l studio/icons-src/mkicon.py` → 56
- `wc -l studio/README.md` → 7
- `grep -c -F '0x4C,0x9A,0xFF' studio/icons-src/mkicon.py` → 1 (the old blue accent the script draws today)
- `grep -c -F '0xE5,0xA1,0x7C' studio/icons-src/mkicon.py` → 0
- `grep -c -F 'Tauri + React + Typescript' studio/README.md` → 1 (line 1 — the README is still the untouched Vite scaffold)
- `grep -c -F 'Effi Studio' studio/README.md` → 0

**Anchor discipline, corrected.** Of 130 tasks, 44 carry an `Anchor:` and every one is an exact string measured above as present on disk today. The other 86 carry no `Anchor:` line, which is correct in two cases: the task creates its file, or the task extends a file an *earlier task in this plan* creates — there placement comes from the recorded `Dependencies:`, and inventing an anchor for a string that does not yet exist is what makes a plan unexecutable. The 13 anchors newly measured in this revision:
- `@theme {` → `studio/src/styles.css:8` (Tasks 2, 117)
- `GROUND, MUTED, ACCENT = (0x0E,0x11,0x16), (0x8A,0x93,0xA5), (0x4C,0x9A,0xFF)` → `studio/icons-src/mkicon.py:4` (Task 7)
- `# Tauri + React + Typescript` → `studio/README.md:1` (Task 12)
- `export const STAGES: Stage[] = ['Brainstorm', 'Plan', 'Refine', 'Execute', 'Review'];` → `studio/src/lib/types.ts:59` (Task 36)
- `export function FlowBar({ next, collapsed, onToggle, onDispatch }: FlowBarProps) {` → `studio/src/components/flow-bar.tsx:14` (Tasks 70, 71)
- `<Empty>No plan yet — run /ec-feature</Empty>` → `studio/src/components/task-panel.tsx:31` (Task 76)
- `"csp": null` → `studio/src-tauri/tauri.conf.json:21` (Task 81)
- `export interface GitInfo {` → `studio/src/lib/types.ts:68` (Task 96)
- `export default function App() {` → `studio/src/App.tsx:30` (Task 109)
- `COMMANDS_DIR = os.path.join(os.path.dirname(__file__), '..', 'commands')` → `tests/test_command_docs.py:5` (Tasks 122, 126)

**Preservation invariants are not evidence.** The baselines immediately above — the xterm exemption, the absent spinner, the unrenamed bundle identifier, the absent `/effi-*` names, the clean `projects.rs`, the `0×0` guard, `bash -n`, the 6 `/ec-` strings in `flow.ts` — all already hold today. A `Verify (local)` asserting them cannot fail, so none of them is used as one. Each appears instead under its task's `Do not touch:` and `Acceptance:`, where it is a constraint, and each affected task carries a `Verify (local)` anchored on its own new output. This was the single defect class `/ec-refine` found in the previous draft of this plan.

Baseline test and build results:
- `python3 -m pytest -q` (repo root) → `152 passed, 1 warning in 4.70s`
- `npm run build` (in `studio/`) → `✓ built in 471ms`, exit 0 (emits a pre-existing >500 kB chunk-size warning — not a failure, and not introduced by this plan)
- `cargo check --quiet` (in `studio/src-tauri/`) → exit 0, no output. `target/` is warm at 5.9G, so a re-check is seconds, not a cold build.

Verified anchors:
- `--color-ground: #0E1116;` → `studio/src/styles.css:9`
- `export interface PanelState {` → `studio/src/lib/types.ts:77`
- `export interface Doctor {` → `studio/src/lib/types.ts:85`
- `export function doctorBlocking` → `studio/src/lib/types.ts:95`
- `const [program, setProgram] = useState<string | null>(null);` → `studio/src/App.tsx:33`
- `void api.ptyWrite(activeId, \`${text}\r\`).catch(() => {});` → `studio/src/App.tsx:204`
- `if ((doctorBlocking(doctor) && !dismissedDoctor) || !program) {` → `studio/src/App.tsx:307`
- `{projects.map((p) => (` → `studio/src/App.tsx:361`
- `ptyOpen: (id: string, cwd: string, program: string) =>` → `studio/src/lib/tauri-api.ts:49`
- `export const FLOW_STEPS: FlowStep[] = [` → `studio/src/lib/flow.ts:13`
- `cursor: token('--color-accent'),` → `studio/src/components/terminal-pane.tsx:38`
- `onDispatch: ((text: string) => void) | null;` → `studio/src/components/flow-bar.tsx:9`
- `pub fn spawn(cwd: &str, program: &str, path: &str)` → `studio/src-tauri/src/pty.rs:11`
- `pub struct SessionRegistry(pub Mutex<HashMap<String, PtySession>>);` → `studio/src-tauri/src/pty.rs:84`
- `pub fn run_doctor(override_path: Option<String>) -> Doctor {` → `studio/src-tauri/src/doctor.rs:110`
- `pub struct StudioConfig {` → `studio/src-tauri/src/projects.rs:40`
- `mod doctor;` → `studio/src-tauri/src/lib.rs:1`
- `.invoke_handler(tauri::generate_handler![` → `studio/src-tauri/src/lib.rs:195`
- `"productName": "EffiClaude Studio",` → `studio/src-tauri/tauri.conf.json:3`
- `"title": "EffiClaude Studio",` → `studio/src-tauri/tauri.conf.json:15`
- `<title>Tauri + React + Typescript</title>` → `studio/index.html:7`
- `step "Installing commands"` → `install.sh:90`

Confirmed absent (new files — no anchor):
`studio/src/lib/{experiences,tabs,agents}.ts`; `studio/src/components/{experience-selector,verify-landing,choose-experiences,choose-tools,setup-states,workbench,tab-strip,add-tool-menu,browser-pane,device-pane,connections-page,diagnostics-panel,settings-page,agent-session-pane,brand-mark}.tsx`; `studio/src-tauri/src/{experiences,setup,tabs,agents,browser,devices,connections,migrate}.rs`; `studio/src/assets/{effi-mark,effi-logo}.svg`; `studio/icons-src/effi-icon.svg`; `tests/test_studio_a11y.py`; `studio/VERIFICATION.md`; and the directory `studio/.screenshots/`.

Existing on disk and NOT to be treated as new: `studio/icons-src/icon-1024.png`, `studio/icons-src/mkicon.py`, all 17 files under `studio/src-tauri/icons/`.

### Tasks
- [ ] Task 1: Replace the palette in styles.css with Precision Atelier tokens [S] [agent: ec-tailwind] [design: design/effi-studio-v2#tokens] — swap the six blue/slate tokens for the nine graphite/copper ones
- [ ] Task 2: Add status and terminal tokens to styles.css [S] [agent: ec-tailwind] [design: design/effi-studio-v2#tokens] — success, warning, error, on-copper, tint, terminal foreground
- [ ] Task 3: Point the xterm theme at the new tokens [S] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — ground background, terminal foreground, copper cursor
- [ ] Task 4: Draw the Effi mark as a master SVG [M] [design: design/effi-studio-v2#01-effi-identity] — angular E in an open bracket, two interior bars, square at right
- [ ] Task 5: Draw the Effi + STUDIO lockup SVG [S] [design: design/effi-studio-v2#01-effi-identity] — wordmark beside the mark with correct clear space
- [ ] Task 6: Draw the squircle app-icon source SVG [S] [design: design/effi-studio-v2#01-effi-identity] — one graphite squircle with the copper mark
- [ ] Task 7: Redraw mkicon.py's geometry and palette, then fan the icon set out [S] [agent: ec-python] [design: design/effi-studio-v2#01-effi-identity] — the script draws procedurally and takes no SVG
- [ ] Task 8: Rename the product in tauri.conf.json [S] — productName becomes Effi Studio
- [ ] Task 9: Retitle the app window [S] — window title becomes Effi Studio
- [ ] Task 10: Replace the Vite placeholder title and favicon [S] [agent: ec-react] — index.html loses "Tauri + React + Typescript" and /vite.svg
- [ ] Task 11: Add the BrandMark component [S] [agent: ec-react] [design: design/effi-studio-v2#01-effi-identity] — inline SVG at 16–24px honouring currentColor
- [ ] Task 12: Replace the Vite scaffold README [S] — Effi Studio, with the legacy names noted as internal only
- [ ] Task 13: Assert no Vite/React/Tauri placeholder branding ships [S] — grep the built bundle and the product surface
- [ ] Task 14: Add Experience types to types.ts [S] [agent: ec-typescript] — ExperienceId, Availability, ExperienceState
- [ ] Task 15: Add experiences to StudioConfig with a serde default [S] — an older studio.json must still load
- [ ] Task 16: Create experiences.rs with availability as the single source [M] — Build available, Verify comingSoon, read from config not UI
- [ ] Task 17: Register the experience commands in lib.rs [S] — experiences, set_experiences
- [ ] Task 18: Add experience wrappers to tauri-api.ts [S] [agent: ec-typescript] — typed invoke per command
- [ ] Task 19: Build the ExperienceSelector for the sidebar top [M] [agent: ec-react] [design: design/effi-studio-v2#01-choose-experiences] — Build row, Verify row with Coming soon
- [ ] Task 20: Build the Verify Coming-soon landing [M] [agent: ec-react] [design: design/effi-studio-v2#06-verify-coming-soon] — title, paragraph, three planned teasers, Back and Manage experiences
- [ ] Task 21: Build the Choose-experiences onboarding screen [M] [agent: ec-react] [design: design/effi-studio-v2#01-choose-experiences] — editorial left, two independent checkboxes right, Verify disabled
- [ ] Task 22: Build the neutral shell empty state [S] [agent: ec-react] [design: design/effi-studio-v2#01-choose-experiences] — Make this workspace yours. with Set up Build
- [ ] Task 23: Route experience state in App.tsx [M] [agent: ec-react] — selector drives shell, Build, or Verify landing without unmounting sessions
- [ ] Task 24: Assert Verify is never selectable and never enters an install plan [S] — the disabled control and the empty install plan
- [ ] Task 25: Module boundary — build and cargo check after the experience model [S] — both must stay at their baseline
- [ ] Task 26: Replace Doctor with a per-component Diagnostics shape [M] [agent: ec-typescript] — one record per component, no global verdict
- [ ] Task 27: Delete doctorBlocking [S] [agent: ec-typescript] — the global gate predicate goes away entirely
- [ ] Task 28: Split doctor.rs into per-component checks [L] — claude, codex, commands, agents, worker, browser, ios, android as separate probes
- [ ] Task 29: Report each component's state instead of one verdict [M] — ComponentState per component, never Err
- [ ] Task 30: Delete the global gate from App.tsx [M] [agent: ec-react] — the shell renders regardless of what is missing
- [ ] Task 31: Replace DoctorScreen with a non-blocking DiagnosticsPanel [L] [agent: ec-react] [design: design/effi-studio-v2#08-setup-states] — a Settings surface, not a gate
- [ ] Task 32: Add Set executable path, Check again and Set up later actions [M] [agent: ec-react] [design: design/effi-studio-v2#02-build-setup] — per component, never app-wide
- [ ] Task 33: Keep Detected distinct from authenticated in the copy [S] [agent: ec-react] [design: design/effi-studio-v2#02-build-setup] — found on disk is not logged in
- [ ] Task 34: Assert the shell opens with no Claude present [S] — override cleared, no early return
- [ ] Task 35: Module boundary — build and cargo check after the gate removal [S] — both must stay at their baseline
- [ ] Task 36: Define component selection and readiness types [M] [agent: ec-typescript] — selection, availability, diagnostic result, last error
- [ ] Task 37: Create setup.rs with a four-operation plan model [L] — link existing, enable bundled, setup external, install selected
- [ ] Task 38: Add component flags to install.sh [L] — each of the nine steps becomes individually selectable
- [ ] Task 39: Keep legacy install-all as a named, scoped option [M] — no flags means today's behaviour, unchanged
- [ ] Task 40: Build the Choose-tools screen [L] [agent: ec-react] [design: design/effi-studio-v2#02-build-setup] — Agents, Tools, Connections groups with real defaults
- [ ] Task 41: Build the selection summary [M] [agent: ec-react] [design: design/effi-studio-v2#02-build-setup] — distinguishes linked, enabled and newly installed
- [ ] Task 42: Build the Review-setup screen [M] [agent: ec-react] [design: design/effi-studio-v2#02-build-setup] — names every file, config, dependency and command
- [ ] Task 43: Build the setup-states screen with partial failure [L] [agent: ec-react] [design: design/effi-studio-v2#08-setup-states] — per-component status, Open Build still reachable
- [ ] Task 44: Derive readiness from diagnostics, not invoke resolution [M] — a resolved invoke and a PTY exit prove nothing
- [ ] Task 45: Make Retry safe against a reserved session [M] — retry only where the lifecycle supports it
- [ ] Task 46: Assert a Browser-only setup writes no Claude hooks [S] — settings.json untouched
- [ ] Task 47: Assert a Codex-only setup installs no Python worker [S] — no pip install, no server files
- [ ] Task 48: Module boundary — build, cargo check and pytest after modular setup [S] — all three at baseline
- [ ] Task 49: Define Tab and session identity types [M] [agent: ec-typescript] — tab id, project id, type, provider id, session id, tool state
- [ ] Task 50: Add tabs.rs with a registry keyed by tab id [L] — metadata persisted, process never claimed to survive
- [ ] Task 51: Re-key SessionRegistry on session id [L] — one project can hold several sessions
- [ ] Task 52: Give pty_open an explicit agent definition [L] — path plus argv, replacing the single program string
- [ ] Task 53: Add agents.rs with a provider registry [L] — stable id, display name, executable, args, capabilities
- [ ] Task 54: Resolve custom CLI path and args without shell joining [M] — a path containing a space must work
- [ ] Task 55: Persist tab metadata without claiming process survival [M] — restoring a tab does not restore its process
- [ ] Task 56: Add tab and session wrappers to tauri-api.ts [M] [agent: ec-typescript] — typed invoke per new command
- [ ] Task 57: Filter PTY events by session id [M] [agent: ec-typescript] — widen the existing id filter
- [ ] Task 58: Re-key TerminalPane on session id [M] [agent: ec-react] — keep subscribe-before-open and the 0×0 guard verbatim
- [ ] Task 59: Build the TabStrip [L] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — 38–40px, icon, title, provider label, menu, close, plus button
- [ ] Task 60: Build the Add-a-tool menu [L] [agent: ec-react] [design: design/effi-studio-v2#09-codex-and-add-tool] — Agent sessions and Workspace tools, with Unavailable reasons
- [ ] Task 61: Build AgentSessionPane with a CLI session label [M] [agent: ec-react] [design: design/effi-studio-v2#09-codex-and-add-tool] — real terminal, honest label
- [ ] Task 62: Add an explicit Close session action [M] [agent: ec-react] — no inferred running state
- [ ] Task 63: Keep live sessions mounted across navigation [M] [agent: ec-react] — project, tab, Settings, Connections and Verify changes never unmount
- [ ] Task 64: Close only the removed project's sessions [M] [agent: ec-react] — and never delete the folder
- [ ] Task 65: Assert two agents in one project do not interleave [M] — distinct session ids, separate output
- [ ] Task 66: Module boundary — build and cargo check after sessions [S] — both at baseline
- [ ] Task 67: Build the Workbench shell [L] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — tab strip plus body, replacing the single terminal main
- [ ] Task 68: Build the project header [S] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — name, path, branch with truncation
- [ ] Task 69: Make flow dispatch name an explicit target session [L] [agent: ec-react] — the helper states where the command goes
- [ ] Task 70: Hide workflow shortcuts for providers with no adapter [M] [agent: ec-react] [design: design/effi-studio-v2#09-codex-and-add-tool] — Codex shows the helper line, not fake parity
- [ ] Task 71: Add the Open Claude Code CTA when the target is hidden [M] [agent: ec-react] — navigation before dispatch, on a click
- [ ] Task 72: Label the plan source in the inspector [M] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — Source: Claude plan, visible under any provider
- [ ] Task 73: Give the task status glyph an accessible label [S] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — status never carried by colour alone, still no spinner
- [ ] Task 74: Build the inspector Tasks and History tabs [M] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — aria-selected, keeping raw-plan fallback and hidden counts
- [ ] Task 75: Keep Project & Git as a disclosure with real errors [M] [agent: ec-react] — detached HEAD, unavailable, unfinished warning
- [ ] Task 76: Keep the no-task empty state free of 0/0 and 100% [S] [agent: ec-react] — No tasks yet
- [ ] Task 77: Render the brainstorm argument field only in brainstorm context [S] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — the field appears in that stage and no other
- [ ] Task 78: Assert workflow dispatch never reaches a non-Claude session [M] — browser and Codex tabs receive no bytes
- [ ] Task 79: Module boundary — build after the workbench [S] — at baseline
- [ ] Task 80: Add browser.rs with a real browsing surface [L] — verified against the installed Tauri version, or reported unavailable
- [ ] Task 81: Keep remote content away from privileged IPC [L] [agent: ec-security] — no app IPC, project files, credentials or PTY, and no app-wide CSP loosening
- [ ] Task 82: Build BrowserPane with the address bar and controls [L] [agent: ec-react] [design: design/effi-studio-v2#04-browser-devices] — back, forward, reload, URL, page title
- [ ] Task 83: Handle loading, error, unreachable and certificate states [M] [agent: ec-react] [design: design/effi-studio-v2#04-browser-devices] — each with its own copy and recovery
- [ ] Task 84: Add Open externally without starting a server [S] [agent: ec-react] — the opener plugin, no autodetect claim
- [ ] Task 85: Define webview lifecycle, bounds and storage scope [M] — resize without 0×0, isolated storage
- [ ] Task 86: Assert an unreachable localhost kills no terminal [M] — the other tabs survive
- [ ] Task 87: Report the browser integration limit honestly [S] — whatever could not be verified is stated as such
- [ ] Task 88: Add devices.rs with prerequisite discovery [L] — platform support, tools, runtime and device as separate facts
- [ ] Task 89: Add device launch and stop with explicit ownership [L] — a user-opened simulator is never owned
- [ ] Task 90: Build DevicePane as a control surface [L] [agent: ec-react] [design: design/effi-studio-v2#04-browser-devices] — selector, readiness, explicit Launch
- [ ] Task 91: Label the external-window fallback [M] [agent: ec-react] [design: design/effi-studio-v2#04-browser-devices] — Opens in a separate window, no static screenshot
- [ ] Task 92: Distinguish the four device row states [M] [agent: ec-react] [design: design/effi-studio-v2#02-build-setup] — not enabled, dependency missing, runtime missing, available
- [ ] Task 93: Separate close-tab from stop-device [S] [agent: ec-react] — two actions, two consequences
- [ ] Task 94: Assert opening a device tab boots and downloads nothing [M] — no runtime fetch, no boot
- [ ] Task 95: Module boundary — build and cargo check after browser and devices [S] — both at baseline
- [ ] Task 96: Define connection types with per-consumer status [M] [agent: ec-typescript] — eight states, consumer matrix
- [ ] Task 97: Add connections.rs with scope and bindings [L] — global account plus project binding
- [ ] Task 98: Store secrets in the OS keychain [L] [agent: ec-security] — never project metadata, logs, fixtures or previews
- [ ] Task 99: Add the custom MCP config form backend [L] — structured input, no shell on form open
- [ ] Task 100: Add the Jira connector on a verified path [L] — read-only context first, documented auth only
- [ ] Task 101: Build ConnectionsPage [L] [agent: ec-react] [design: design/effi-studio-v2#05-connections] — connector, scope, server, status
- [ ] Task 102: Build the consumer availability matrix [M] [agent: ec-react] [design: design/effi-studio-v2#05-connections] — Effi, Claude Code, Codex from adapter results
- [ ] Task 103: Mark GitHub and Figma as Planned [S] [agent: ec-react] [design: design/effi-studio-v2#05-connections] — catalogue entries with no Configure button
- [ ] Task 104: Preview every provider-config write before Apply [M] [agent: ec-react] [design: design/effi-studio-v2#05-connections] — destination, scope, diff, explicit Apply
- [ ] Task 105: Separate disconnect-binding from revoke-credential [M] [agent: ec-react] — consequences labelled, other projects untouched
- [ ] Task 106: Assert one consumer's config does not connect the others [M] — and an invalid config damages nothing
- [ ] Task 107: Module boundary — build and cargo check after Connections [S] — both at baseline
- [ ] Task 108: Build the Settings page with six sections [L] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — Experiences, Agents, Tools, Connections, Appearance, Diagnostics
- [ ] Task 109: Point the Connections sidebar entry at the same destination [S] [agent: ec-react] — one surface, not a duplicate
- [ ] Task 110: Add the responsive breakpoint behaviour [L] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — four bands, one active overlay below 900
- [ ] Task 111: Hide the installer editorial column at compact width [S] [agent: ec-react] [design: design/effi-studio-v2#02-build-setup] — the controls stay reachable
- [ ] Task 112: Make the tab strip overflow in one row [M] [agent: ec-react] [design: design/effi-studio-v2#03-build-workbench] — scroll, never a wrapped stack
- [ ] Task 113: Keep Cmd+1…9, B, J, K and add tab keyboard navigation [M] [agent: ec-react] — Cmd+K stays the workflow toggle
- [ ] Task 114: Add Escape close with focus return [M] [agent: ec-react] — popovers and drawers return focus to their trigger
- [ ] Task 115: Add aria-selected tabs, labels and a visible focus ring [M] [agent: ec-react] — native button semantics, arrow navigation
- [ ] Task 116: Add a repo guard for terminal input and live-region discipline [S] [agent: ec-python] — turns two already-true invariants into a test that can fail
- [ ] Task 117: Add 120–160ms motion honouring reduced motion [S] [agent: ec-tailwind] — no fake task pulse, no aggressive autoscroll
- [ ] Task 118: Assert compact layout and keyboard at the four target sizes [M] — 1440×900, 1180×760, 980×700, 800×650
- [ ] Task 119: Add migrate.rs that reads an older studio.json unchanged [L] — every new field defaulted, nothing dropped
- [ ] Task 120: Backfill one legacy terminal to one Claude tab [M] — never two PTYs from one source
- [ ] Task 121: Keep the bundle identifier until a migration exists [S] — state location and permissions stay put
- [ ] Task 122: Add a repo guard against invented command names [S] [agent: ec-python] — the suite now fails on an /effi-* name instead of shipping it
- [ ] Task 123: Add an integration test for session isolation [M] [agent: ec-unit-test] — two sessions, no crossed output
- [ ] Task 124: Add an integration test for the modular install plan [M] [agent: ec-unit-test] — selection in, matching plan out
- [ ] Task 125: Add a regression test for preserved registry and prefs [M] [agent: ec-unit-test] — an old studio.json survives a load and save
- [ ] Task 126: Assert install.sh and the commands directory still agree [M] [agent: ec-python] — component flags make drift possible, so the suite checks parity
- [ ] Task 127: Capture screenshots at the four target sizes [M] — real app, sample data only
- [ ] Task 128: Compare each screenshot against its mockup [M] [design: design/effi-studio-v2#03-build-workbench] — hierarchy, spacing, terminal room, labels, copper restraint
- [ ] Task 129: Write the implemented, verified, unavailable and deferred report [M] — no feature claimed from a menu alone
- [ ] Task 130: Final global gate — build, cargo check and pytest [S] — all three at baseline or better

### Per Task Detail

**Task 1 — Replace the palette in styles.css with Precision Atelier tokens** `S`
- File: `studio/src/styles.css`
- Anchor: `--color-ground: #0E1116;` → `studio/src/styles.css:9`
- Reuse: the existing `@theme` block and the `html, body, #root` rule — only the values change, not the mechanism
- Code sample:
  ```css
  @theme {
    --color-ground: #101112;
    --color-surface: #17191B;
    --color-raised: #1D2023;
    --color-hover: #25292D;
    --color-border: #30353B;
    --color-text: #F3EFE9;
    --color-muted: #A4ABB2;
    --color-copper: #E5A17C;
  }
  ```
- Do not touch: the `html, body, #root` rule, the `@import "tailwindcss"` line, and the dark-only decision — there is still no light theme and no `prefers-color-scheme` branch
- Edge cases: `--color-accent` is referenced by `terminal-pane.tsx:38` and `stage-rail.tsx`; removing the name without Task 3 would silently yield an empty token, so keep `--color-accent` as an alias of copper until Task 3 lands
- Acceptance: the chrome renders in warm graphite with copper as the only accent, and no slate or blue value remains in the theme block
- Verify (local): `grep -c -F '#E5A17C' studio/src/styles.css` → `== 1` (baseline 0) and `grep -c -F '#0E1116' studio/src/styles.css` → `== 0`
- Dependencies: none

**Task 2 — Add status and terminal tokens to styles.css** `S`
- File: `studio/src/styles.css`
- Anchor: `@theme {` → `studio/src/styles.css:8`
- Reuse: the same `@theme` block
- Code sample:
  ```css
    --color-on-copper: #211710;
    --color-copper-tint: #30241E;
    --color-success: #9CC5AF;
    --color-warning: #E6C182;
    --color-error:   #EDA6A6;
    --color-terminal: #E2E5E8;
  ```
- Do not touch: the eight tokens Task 1 wrote
- Edge cases: copper and sage must stay separate names so a selected checkbox can never be styled as healthy; do not alias them
- Acceptance: every colour the Design Contract names exists as a token, and no component needs a literal hex
- Verify (local): `grep -c -F '#9CC5AF' studio/src/styles.css` → `== 1` and `grep -c -F '#E2E5E8' studio/src/styles.css` → `== 1`
- Dependencies: Task 1

**Task 3 — Point the xterm theme at the new tokens** `S`
- File: `studio/src/components/terminal-pane.tsx`
- Anchor: `cursor: token('--color-accent'),` → `studio/src/components/terminal-pane.tsx:38`
- Reuse: `token()` from `studio/src/lib/tokens.ts:6` unchanged — no hex literal enters this file
- Code sample:
  ```tsx
  theme: {
    background: token('--color-ground'),
    foreground: token('--color-terminal'),
    cursor: token('--color-copper'),
  },
  ```
- Do not touch: `fontSize: 13`, `allowProposedApi`, and the `fontFamily: token('--font-mono')` line
- Edge cases: `token()` returns `''` for an undefined property and xterm then falls back to its own default, so this must land in the same cycle as Task 2 or the terminal silently loses its foreground colour
- Acceptance: the terminal draws on the graphite ground with an off-white foreground and a copper cursor, still reading every value from the stylesheet
- Verify (local): `grep -c -F "token('--color-terminal')" studio/src/components/terminal-pane.tsx` → `== 1` and `grep -c -F "--color-accent" studio/src/components/terminal-pane.tsx` → `== 0`
- Dependencies: Task 2

**Task 4 — Draw the Effi mark as a master SVG** `M`
- File: `studio/src/assets/effi-mark.svg` (new file — confirmed absent)
- Reuse: none — `brand/02-logomark.png` is a raster reference, not a croppable source
- Code sample: a single `<svg viewBox="0 0 24 24" fill="none">` built from `<path>` geometry only — the angular E inside an open bracket, two interior bars, a small square at the right. Strokes use `currentColor`, never a literal hex, so the mark inherits copper or text colour from its context. No `<image>`, no embedded raster, no filters.
- Do not touch: `design/effi-studio-v2/brand/` — the boards are read, never cropped or re-exported
- Edge cases: must stay legible at 16px and in pure monochrome; verify both before accepting. The open bracket must not close at small sizes.
- Acceptance: a clean vector mark that reads as an E in an open frame at 16px, 24px and 120px, in copper and in monochrome
- Verify (local): `test -f studio/src/assets/effi-mark.svg && grep -c -F 'currentColor' studio/src/assets/effi-mark.svg` → `>= 1`, and `grep -c -F '<image' studio/src/assets/effi-mark.svg` → `== 0`
- Dependencies: none

**Task 5 — Draw the Effi + STUDIO lockup SVG** `S`
- File: `studio/src/assets/effi-logo.svg` (new file — confirmed absent)
- Reuse: the path geometry from Task 4, inlined rather than referenced, so the lockup is a standalone file
- Code sample: `<svg viewBox="0 0 160 40">` with the mark at the left, the `Effi` wordmark in a sans medium/semibold weight beside it, and `STUDIO` set small beneath or after the wordmark. Clear space on every side equals half the symbol height. Text is converted to paths so the file does not depend on a font being installed.
- Do not touch: the mark proportions from Task 4 — the lockup scales it, it does not redraw it
- Edge cases: below roughly 96px wide the `STUDIO` line stops being legible, so the component that uses this must drop to the bare mark instead of scaling the lockup down
- Acceptance: a lockup usable at 96–120px and above, with Build and Verify expressed as text elsewhere rather than as a second logo
- Verify (local): `test -f studio/src/assets/effi-logo.svg && grep -c -iF 'studio' studio/src/assets/effi-logo.svg` → `>= 1`
- Dependencies: Task 4

**Task 6 — Draw the squircle app-icon source SVG** `S`
- File: `studio/icons-src/effi-icon.svg` (new file — confirmed absent)
- Reuse: the mark geometry from Task 4
- Code sample: `<svg viewBox="0 0 1024 1024">` — one macOS-proportioned squircle filled `#17191B` on a `#101112` field, with the mark centred in `#E5A17C` at roughly 52% of the canvas. Literal hex is correct here: an icon is exported outside the stylesheet and cannot read a CSS token.
- Do not touch: `studio/icons-src/icon-1024.png` — it stays as the previous icon until Task 7 replaces its exports
- Edge cases: exactly one icon for both experiences; there is no second Verify icon. The squircle must not be a plain rounded rectangle.
- Acceptance: a 1024px source that exports cleanly to every size the bundle needs
- Verify (local): `test -f studio/icons-src/effi-icon.svg && grep -c -F '#E5A17C' studio/icons-src/effi-icon.svg` → `>= 1`
- Dependencies: Task 4

**Task 7 — Redraw mkicon.py's geometry and palette, then fan the icon set out** `S`
- File: `studio/icons-src/mkicon.py`
- Anchor: `GROUND, MUTED, ACCENT = (0x0E,0x11,0x16), (0x8A,0x93,0xA5), (0x4C,0x9A,0xFF)` → `studio/icons-src/mkicon.py:4`
- Reuse: `mkicon.py`'s existing PNG writer — the hand-rolled `chunk()`/IHDR/IDAT encoder at lines 48-55, its `in_round_rect` squircle at line 9, and its supersampling loop at lines 31-44. All of that is sound and stays.
- Code sample: **the script takes no SVG and never did.** It procedurally draws the *old* mark — four dots, three filled `MUTED`, one ringed `ACCENT` — and writes only `icon-1024.png`. So this task replaces its palette and its `sample()` geometry to draw the Effi mark instead, then fans the result out:
  ```python
  # the Precision Atelier values, replacing the blue-on-slate originals
  GROUND, SURFACE, COPPER = (0x10,0x11,0x12), (0x17,0x19,0x1B), (0xE5,0xA1,0x7C)
  ```
  `sample()` loses the four-dot loop and instead returns `COPPER` inside the angular E, its two interior bars and the right-hand square — the same geometry as `effi-icon.svg`, expressed as the inequalities this script already works in. Then:
  ```
  cd studio/icons-src && python3 mkicon.py          # writes icon-1024.png
  cd studio && npm run tauri -- icon icons-src/icon-1024.png
  ```
  The second command is what produces the 17 files under `src-tauri/icons/`; `mkicon.py` alone only ever produced the 1024px source.
- Do not touch: the PNG encoder, the squircle helper, the supersampling factor `SS = 3`, and the file names under `studio/src-tauri/icons/` — `tauri.conf.json:29-35` references five of them by name
- Edge cases: the ring geometry at line 26 (`outer, inner`) disappears with the dots and must not be left dead. `effi-icon.svg` from Task 6 stays the design master, and this script must draw the same mark — a divergence between them is a defect.
- Acceptance: `icon-1024.png` shows the copper Effi mark on a graphite squircle, every icon under `src-tauri/icons/` is regenerated from it, and the five names `tauri.conf.json` lists still exist
- Verify (local): `grep -c -F '0xE5,0xA1,0x7C' studio/icons-src/mkicon.py` → `== 1` (baseline 0) and `grep -c -F '0x4C,0x9A,0xFF' studio/icons-src/mkicon.py` → `== 0` (baseline 1)
- Dependencies: Task 6

**Task 8 — Rename the product in tauri.conf.json** `S`
- File: `studio/src-tauri/tauri.conf.json`
- Anchor: `"productName": "EffiClaude Studio",` → `studio/src-tauri/tauri.conf.json:3`
- Reuse: none
- Code sample: `"productName": "Effi Studio",`
- Do not touch: `"identifier": "id.kaeltech.efficlaude.studio"` — changing it moves the app's state location and permission grants, which Task 121 holds until a migration exists
- Edge cases: `productName` determines the bundled `.app` name, so `lib.rs:99`'s comment about the space in `/Applications/EffiClaude Studio.app/...` now refers to `Effi Studio.app`; the quoting at `lib.rs:103` already handles any space, so no code change is required — only the comment's example path is stale
- ⚠️ Breaking change: the installed app bundle is renamed, so a user's Dock and Spotlight entries point at the old path until they relaunch from `/Applications`
- Acceptance: the DMG and the `.app` are named Effi Studio while the bundle identifier is unchanged
- Verify (local): `grep -c -F '"productName": "Effi Studio"' studio/src-tauri/tauri.conf.json` → `== 1` and `grep -c -F 'id.kaeltech.efficlaude.studio' studio/src-tauri/tauri.conf.json` → `== 1`
- Dependencies: none

**Task 9 — Retitle the app window** `S`
- File: `studio/src-tauri/tauri.conf.json`
- Anchor: `"title": "EffiClaude Studio",` → `studio/src-tauri/tauri.conf.json:15`
- Reuse: none
- Code sample: `"title": "Effi Studio",`
- Do not touch: `"width": 1180` and `"height": 760` — the Design Contract treats that default as a size to stay comfortable at, not one to change
- Edge cases: with Task 8 also writing `Effi Studio` into this file, a bare `grep -c 'Effi Studio'` becomes 2; the verify below anchors on the full `"title"` line instead
- Acceptance: the native titlebar reads Effi Studio, with no second HTML titlebar drawn anywhere
- Verify (local): `grep -c -F '"title": "Effi Studio"' studio/src-tauri/tauri.conf.json` → `== 1` and `grep -c -F 'EffiClaude Studio' studio/src-tauri/tauri.conf.json` → `== 0` (baseline 2)
- Dependencies: Task 8

**Task 10 — Replace the Vite placeholder title and favicon** `S`
- File: `studio/index.html`
- Anchor: `<title>Tauri + React + Typescript</title>` → `studio/index.html:7`
- Reuse: `studio/src/assets/effi-mark.svg` from Task 4 as the favicon source
- Code sample:
  ```html
  <link rel="icon" type="image/svg+xml" href="/src/assets/effi-mark.svg" />
  <title>Effi Studio</title>
  ```
- Do not touch: the `#root` div and the `/src/main.tsx` module script
- Edge cases: `public/vite.svg` may still exist on disk; leaving the file is harmless, referencing it is not
- Acceptance: no Vite, React or Tauri placeholder branding appears anywhere in the product surface
- Verify (local): `grep -c -F 'Tauri + React' studio/index.html` → `== 0` and `grep -c -F 'vite.svg' studio/index.html` → `== 0`
- Dependencies: Task 4

**Task 11 — Add the BrandMark component** `S`
- File: `studio/src/components/brand-mark.tsx` (new file — confirmed absent)
- Reuse: the SVG from Task 4, inlined so the mark can inherit `currentColor`
- Code sample:
  ```tsx
  interface BrandMarkProps {
    /** 16–24 in UI chrome; the lockup is a separate asset. */
    size?: number;
  }

  /** Inlined rather than an <img>: an <img> cannot inherit currentColor, and the
   *  mark has to read as copper in one place and as text colour in another. */
  export function BrandMark({ size = 20 }: BrandMarkProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* paths copied from assets/effi-mark.svg */}
      </svg>
    );
  }
  ```
- Do not touch: `studio/src/assets/effi-mark.svg` — it stays the master, and this component is its inlined copy
- Edge cases: `aria-hidden` is correct wherever the mark sits beside the product name; a mark used alone as a button needs its own label on the button
- Acceptance: the mark renders at 16–24px in the chrome, inheriting its colour from context
- Verify (local): `test -f studio/src/components/brand-mark.tsx && grep -c -F 'currentColor' studio/src/components/brand-mark.tsx` → `>= 1`
- Dependencies: Task 4

**Task 12 — Replace the Vite scaffold README** `S`
- File: `studio/README.md`
- Anchor: `# Tauri + React + Typescript` → `studio/README.md:1`
- Reuse: the `## Recommended IDE Setup` section at `studio/README.md:5-7` — its VS Code, Tauri and rust-analyzer links are genuinely useful and are kept verbatim
- Code sample: the file is still the untouched Vite scaffold README — `# Tauri + React + Typescript` on line 1, "This template should help get you started" on line 3. That is the same placeholder branding Task 10 strips from `index.html`, so this is a rewrite rather than a rename:
  ```markdown
  # Effi Studio

  A workspace for building and verifying software — project context, agent
  sessions, terminal, browser and device tools in one application.

  Legacy names kept for compatibility: `~/.efficlaude`, `.claude` and the
  `/ec-*` commands are internal implementation detail, not product names, and
  are deliberately unrenamed so existing installs keep working.

  ## Recommended IDE Setup
  ```
- Do not touch: the `## Recommended IDE Setup` heading and its link list — Tasks 87, 121 and 129 all append sections to this file and depend on it existing
- Edge cases: the scaffold's "template" sentence must go, not just the title; leaving it is how a shipped README still reads as boilerplate
- Acceptance: the README describes Effi Studio, carries no Vite or template scaffold text, and records why the legacy paths remain
- Verify (local): `grep -c -F 'Effi Studio' studio/README.md` → `>= 1` (baseline 0) and `grep -c -F 'Tauri + React + Typescript' studio/README.md` → `== 0` (baseline 1)
- Dependencies: none

**Task 13 — Assert no Vite/React/Tauri placeholder branding ships** `S`
- File: none — this is a check over the built output
- Reuse: the existing `npm run build` script
- Code sample: `cd studio && npm run build && grep -rlF 'Tauri + React' dist/ | wc -l`
- Do not touch: `dist/` contents — it is generated
- Edge cases: `@tauri-apps/api` legitimately appears in the bundle as a dependency name; the check targets the placeholder title string, not the word Tauri
- Acceptance: the shipped bundle carries no scaffold branding in any user-visible string
- Verify (local): `cd studio && grep -rlF 'Tauri + React' dist/ | wc -l` → `== 0`
- Verify (global): `cd studio && npm run build` → exit 0 (baseline: `✓ built in 471ms`)
- Dependencies: Task 10

**Task 14 — Add Experience types to types.ts** `S`
- File: `studio/src/lib/types.ts`
- Anchor: `export interface PanelState {` → `studio/src/lib/types.ts:77`
- Reuse: the file's existing convention of a union of string literals plus a documented interface, as `Stage` and `GitMark` already do
- Code sample:
  ```ts
  export type ExperienceId = 'build' | 'verify';

  /** Availability comes from release configuration, never from a UI checkbox:
   *  a user cannot select their way into an unreleased experience. */
  export type Availability = 'available' | 'comingSoon';

  export interface Experience {
    id: ExperienceId;
    availability: Availability;
    /** Whether the user has turned it on. Always false while comingSoon. */
    enabled: boolean;
    /** Shown beside a disabled control; null when available. */
    reason: string | null;
  }
  ```
- Do not touch: `Doctor`, `doctorBlocking`, `PanelState` — Tasks 26 and 27 own those
- Edge cases: `enabled` and `availability` are deliberately separate so the future both-experiences case needs no new shape
- Acceptance: the frontend can express Build-available-and-enabled and Verify-comingSoon-and-disabled without a boolean that conflates them
- Verify (local): `grep -c -F "export type Availability" studio/src/lib/types.ts` → `== 1`
- Dependencies: none

**Task 15 — Add experiences to StudioConfig with a serde default** `S`
- File: `studio/src-tauri/src/projects.rs`
- Anchor: `pub struct StudioConfig {` → `studio/src-tauri/src/projects.rs:40`
- Reuse: the `#[serde(default)]` pattern already used on `projects`, `claude_override` and `panels`
- Code sample:
  ```rust
      #[serde(default)]
      pub experiences: ExperienceState,
  ```
  with `ExperienceState` declared in `experiences.rs` (Task 16) deriving `Serialize, Deserialize, Clone, Default` and `#[serde(rename_all = "camelCase", default)]`, matching the comment at `projects.rs:55-58` about the wire convention.
- Do not touch: the field order of `projects`, `claude_override` and `panels`, and the `load()` degrade-to-default behaviour at `projects.rs:81`
- Edge cases: without `#[serde(default)]` an existing `~/.efficlaude/studio.json` fails to deserialize and `load()` silently returns `StudioConfig::default()` — which wipes the user's visible project list. This default is the whole reason the field is safe to add.
- ⚠️ Breaking change: a corrupt or hand-edited studio.json still degrades to empty, exactly as before; this task must not change that behaviour while adding the field
- Acceptance: a studio.json written by the current build loads with its projects intact and an empty experience state
- Verify (local): `grep -c -F 'pub experiences: ExperienceState' studio/src-tauri/src/projects.rs` → `== 1`
- Dependencies: Task 16

**Task 16 — Create experiences.rs with availability as the single source** `M`
- File: `studio/src-tauri/src/experiences.rs` (new file — confirmed absent)
- Reuse: `projects::load()` and `projects::save()` for persistence — no second config file
- Code sample:
  ```rust
  /// Availability is compiled in, not configurable from the UI: Verify is not a
  /// feature flag a user can flip, it is an unreleased experience.
  const VERIFY_REASON: &str = "Not available to install yet.";

  #[derive(Serialize, Deserialize, Clone, Default)]
  #[serde(rename_all = "camelCase", default)]
  pub struct ExperienceState {
      pub build_enabled: bool,
  }

  #[tauri::command]
  pub fn experiences() -> Vec<ExperienceView> { /* build: available; verify: comingSoon */ }

  /// Only Build can be enabled. A request to enable Verify is rejected rather
  /// than stored, so no persisted state can ever claim Verify is on.
  #[tauri::command]
  pub fn set_experiences(build_enabled: bool) -> Result<(), String> { /* load, mutate, save */ }
  ```
- Do not touch: `projects::StudioConfig`'s other fields, and `config_path()` — this module persists through `projects`
- Edge cases: `set_experiences` takes only Build on purpose; there is no parameter through which Verify could be turned on. The copy `Not available to install yet.` is the Design Contract's literal string.
- Acceptance: the backend reports Build as available and Verify as coming soon, and cannot be made to store Verify as enabled
- Verify (local): `test -f studio/src-tauri/src/experiences.rs && grep -c -F 'Not available to install yet.' studio/src-tauri/src/experiences.rs` → `== 1`
- Dependencies: none

**Task 17 — Register the experience commands in lib.rs** `S`
- File: `studio/src-tauri/src/lib.rs`
- Anchor: `.invoke_handler(tauri::generate_handler![` → `studio/src-tauri/src/lib.rs:195`
- Reuse: the existing `generate_handler!` list and the `mod` block at `lib.rs:1-8`
- Code sample: add `mod experiences;` to the module block in alphabetical position, then `experiences::experiences,` and `experiences::set_experiences,` to the handler list
- Do not touch: the 22 existing handler entries, `kill_all_sessions`, and both exit hooks at `lib.rs:181-185` and `lib.rs:220-227`
- Edge cases: many later tasks also add handlers to this list, so an exact count here would be invalidated by Task 56 and others; the verify anchors on the two new names instead
- Acceptance: both commands are callable from the frontend
- Verify (local): `grep -c -F 'experiences::set_experiences' studio/src-tauri/src/lib.rs` → `== 1`
- Dependencies: Task 16

**Task 18 — Add experience wrappers to tauri-api.ts** `S`
- File: `studio/src/lib/tauri-api.ts`
- Anchor: `panels: () => invoke<PanelState>('panels'),` → the `panels` pair in `studio/src/lib/tauri-api.ts` (line 46)
- Reuse: the one-wrapper-per-command convention documented at `tauri-api.ts:12-16`
- Code sample:
  ```ts
    experiences: () => invoke<Experience[]>('experiences'),
    setExperiences: (buildEnabled: boolean) =>
      invoke<void>('set_experiences', { buildEnabled }),
  ```
- Do not touch: the existing 21 wrappers and the three event helpers at `tauri-api.ts:58-80`
- Edge cases: Tauri converts `buildEnabled` to `build_enabled` for the Rust parameter; passing `build_enabled` from TS would arrive as `undefined`
- Acceptance: components call `api.experiences()` and never `invoke` directly
- Verify (local): `grep -c -F "invoke<void>('set_experiences'" studio/src/lib/tauri-api.ts` → `== 1`
- Dependencies: Task 14, Task 17

**Task 19 — Build the ExperienceSelector for the sidebar top** `M`
- File: `studio/src/components/experience-selector.tsx` (new file — confirmed absent)
- Reuse: `BrandMark` from Task 11; the sidebar's existing row styling in `studio/src/components/project-sidebar.tsx`
- Code sample: two rows above the project list — Build with an `Available` meta label, Verify with a `Coming soon` badge and a `disabled` attribute. Verify stays activatable as navigation to its landing while remaining non-selectable as an experience; those are two different affordances and the markup must separate them.
- Do not touch: `project-sidebar.tsx` — the selector mounts above it in `App.tsx`, it does not nest inside it
- Edge cases: the disabled Verify control must still meet 4.5:1 contrast; a greyed-out label at 2:1 is the usual failure. The badge carries a text label, not colour alone.
- Acceptance: the selector shows Build as available and Verify as coming soon, and Verify cannot be enabled from here
- Verify (local): `grep -c -F 'Coming soon' studio/src/components/experience-selector.tsx` → `>= 1` and `grep -c -F 'disabled' studio/src/components/experience-selector.tsx` → `>= 1`
- Dependencies: Task 11, Task 18

**Task 20 — Build the Verify Coming-soon landing** `M`
- File: `studio/src/components/verify-landing.tsx` (new file — confirmed absent)
- Reuse: the editorial type scale from the Design Contract; no new layout primitive
- Code sample: `Verify, coming soon.` as the heading, `A focused space for testing, evidence, and release confidence.` beneath it, then three teaser blocks labelled `Explore flows`, `Capture evidence` and `Track quality`, each marked planned. Primary action `Back to Build` when Build is enabled, otherwise `Back to Studio`; secondary `Manage experiences`.
- Do not touch: any session state — rendering this page must not unmount a terminal (Task 63 asserts it)
- Edge cases: no Install, Activate, Start testing, waitlist, email field, release date, or price anywhere on this page. The teasers are text, not disabled buttons that look clickable.
- Acceptance: a purely informational page that changes no project state and ends no session
- Verify (local): `grep -c -F 'Verify, coming soon.' studio/src/components/verify-landing.tsx` → `== 1`, `grep -c -F 'Track quality' studio/src/components/verify-landing.tsx` → `== 1`, and `grep -ciE 'waitlist|start testing|activate' studio/src/components/verify-landing.tsx` → `== 0`
- Dependencies: none

**Task 21 — Build the Choose-experiences onboarding screen** `M`
- File: `studio/src/components/choose-experiences.tsx` (new file — confirmed absent)
- Reuse: the Design Contract copy verbatim; `BrandMark` from Task 11
- Code sample: a two-column layout — left editorial `Your tools. Your flow.`, right `How will you use Effi?` with helper `Choose what you need. Add more later.` and two independent checkboxes. Build is selectable; Verify is a readable disabled control with `Not available to install yet.`. Primary CTA is `Continue with Build` when Build is checked and `Open Studio` when it is not; secondary is always `Set up later`.
- Do not touch: nothing is downloaded, no credential is searched for, and no config is written before the user acts
- Edge cases: there is no `Both` checkbox while Verify is unreleased. Unchecking Build must change the CTA rather than disable it — `Open Studio` is a real destination.
- Acceptance: the user can continue with Build, open a neutral Studio, or defer, and cannot select Verify
- Verify (local): `grep -c -F 'Choose what you need. Add more later.' studio/src/components/choose-experiences.tsx` → `== 1` and `grep -c -F 'Continue with Build' studio/src/components/choose-experiences.tsx` → `== 1`
- Dependencies: Task 11, Task 18

**Task 22 — Build the neutral shell empty state** `S`
- File: `studio/src/components/choose-experiences.tsx`
- Reuse: the same file — the neutral shell is a second small export, not a new module
- Code sample: export a `NeutralShell` that renders `Make this workspace yours.` with a `Set up Build` action, and leaves the Verify Coming-soon entry visible but non-blocking
- Do not touch: the Choose-experiences layout above it
- Edge cases: this is what `Set up later` leads to, so it must be reachable with no provider configured at all
- Acceptance: a user who defers setup lands somewhere usable rather than on a gate
- Verify (local): `grep -c -F 'Make this workspace yours.' studio/src/components/choose-experiences.tsx` → `== 1`
- Dependencies: Task 21

**Task 23 — Route experience state in App.tsx** `M`
- File: `studio/src/App.tsx`
- Anchor: `const [program, setProgram] = useState<string | null>(null);` → `studio/src/App.tsx:33`
- Reuse: the existing `useState` + `useEffect` load pattern used for `panels` at `App.tsx:71-73`
- Code sample:
  ```tsx
  const [experiences, setExperiences] = useState<Experience[] | null>(null);
  const [view, setView] = useState<'build' | 'verify' | 'shell'>('build');

  useEffect(() => {
    void api.experiences().then(setExperiences).catch(() => {});
  }, []);
  ```
  Render the Verify landing when `view === 'verify'`, the neutral shell when no experience is enabled, and the Build surface otherwise.
- Do not touch: the `projects.map` pane loop at `App.tsx:361` — switching view must hide panes, never unmount them, for exactly the reason recorded in the comment at `App.tsx:359-360`
- Edge cases: a failed `experiences()` call leaves the state null; default to the Build surface rather than to a blocking screen, matching how a failed `panels()` read already degrades
- Acceptance: the three views are reachable from the selector and no view change ends a session
- Verify (local): `grep -c -F "useState<'build' | 'verify' | 'shell'>" studio/src/App.tsx` → `== 1`
- Dependencies: Task 19, Task 20, Task 22
- Verify (global): `cd studio && npm run build` → exit 0

**Task 24 — Assert Verify is never selectable** `S`
- File: none — a check over the written code
- Reuse: the disabled control from Task 21 and the rejection in `set_experiences` from Task 16
- Code sample:
  ```
  grep -n "verify" studio/src/components/choose-experiences.tsx   # must show disabled only
  grep -n "build_enabled" studio/src-tauri/src/experiences.rs     # the only enable parameter
  ```
- Do not touch: the Verify landing — it is navigation, not selection
- Edge cases: Verify legitimately appears as a navigable view in `App.tsx`; the assertion targets selection, not navigation. The install-plan half of this invariant is asserted by Task 124, which is where `setup.rs` exists.
- Acceptance: no code path can enable Verify
- Verify (local): `grep -c -F 'build_enabled' studio/src-tauri/src/experiences.rs` → `>= 1` and `grep -c -F 'verify_enabled' studio/src-tauri/src/experiences.rs` → `== 0`
- Dependencies: Task 16, Task 21

**Task 25 — Module boundary: build and cargo check after the experience model** `S`
- File: none
- Reuse: both existing check commands
- Code sample: `cd studio && npm run build` then `cd studio/src-tauri && cargo check --quiet`
- Acceptance: the experience model compiles on both sides with nothing regressed
- Verify (local): none — this task's whole deliverable IS the global invariant below, so a local check would be the same command run twice. Permitted by the plan's "a task whose only honest proof is a compile may carry a global verify" rule.
- Verify (global): `cd studio && npm run build` → exit 0 (baseline `✓ built in 471ms`); `cd studio/src-tauri && cargo check --quiet` → exit 0 (baseline exit 0, no output)
- Dependencies: Task 17, Task 23

**Task 26 — Replace Doctor with a per-component Diagnostics shape** `M`
- File: `studio/src/lib/types.ts`
- Anchor: `export interface Doctor {` → `studio/src/lib/types.ts:85`
- Reuse: the documented-union style of `Stage` and `GitMark`
- Code sample:
  ```ts
  export type ComponentId =
    | 'claude' | 'codex' | 'commands' | 'agents' | 'worker'
    | 'browser' | 'ios' | 'android' | 'memory';

  /** `detected` means found on disk. It does NOT mean authenticated, and no
   *  check in this app can observe a provider login. */
  export type ComponentStatus =
    | 'notSelected' | 'detected' | 'queued' | 'installing'
    | 'ready' | 'needsAttention' | 'unavailable';

  export interface ComponentReport {
    id: ComponentId;
    status: ComponentStatus;
    /** Resolved executable or path, when the check found one. */
    detail: string | null;
    /** Verbatim failure text. Never a credential. */
    error: string | null;
    /** False means missing it blocks nothing. */
    required: boolean;
  }

  export interface Diagnostics {
    components: ComponentReport[];
  }
  ```
- Do not touch: `PanelState`, `ProjectState`, `GitInfo`
- Edge cases: `required` exists so the UI can style a missing optional component as a warning and never as a gate; nothing in the shipped product sets it true for an optional tool
- ⚠️ Breaking change: `Doctor` leaves the exported surface; `App.tsx` and `doctor-screen.tsx` both import it and must move in Tasks 30 and 31
- Acceptance: the frontend can describe each component's state independently, with no field that collapses them into one verdict
- Verify (local): `grep -c -F 'export interface ComponentReport' studio/src/lib/types.ts` → `== 1`
- Dependencies: none

**Task 27 — Delete doctorBlocking** `S`
- File: `studio/src/lib/types.ts`
- Anchor: `export function doctorBlocking` → `studio/src/lib/types.ts:95`
- Reuse: none — this is a deletion
- Code sample: remove the function and its doc comment entirely. Nothing replaces it: there is no global verdict in the new model, which is the point.
- Do not touch: the new `Diagnostics` types from Task 26
- Edge cases: `App.tsx` references it twice (baseline `grep -c` → 2), so this task and Task 30 must land together or the build breaks
- ⚠️ Breaking change: any future code wanting a single "is the app ready" boolean has nothing to call, deliberately
- Acceptance: no global readiness predicate exists anywhere in the codebase
- Verify (local): `grep -rc -F 'doctorBlocking' studio/src/ | grep -v ':0' | wc -l` → `== 0` (baselines: `types.ts` 1, `App.tsx` 2)
- Dependencies: Task 26, Task 30

**Task 28 — Split doctor.rs into per-component checks** `L`
- File: `studio/src-tauri/src/doctor.rs`
- Anchor: `pub fn run_doctor(override_path: Option<String>) -> Doctor {` → `studio/src-tauri/src/doctor.rs:110`
- Reuse: `worker_ok()` at `doctor.rs:16` unchanged as the worker probe; `shell_env::resolve_claude` at `shell_env.rs:40` generalised rather than duplicated; the `COMMANDS` and `AGENTS` lists at `doctor.rs:11` and `:26` as the commands and agents probes
- Code sample: one function per component, each returning a `ComponentReport` and each independent — `check_claude`, `check_codex`, `check_commands`, `check_agents`, `check_worker`, `check_browser`, `check_ios`, `check_android`, `check_memory`. `run_diagnostics` collects them. Every one returns a report; none returns `Err`, preserving the contract documented at `doctor.rs:50-51`.
- Do not touch: the `PROBE_TIMEOUT` of one second and the comment explaining it — a dead port must still not stall a screen
- Edge cases: `check_ios` must distinguish unsupported platform, missing Xcode, and missing runtime or device — "Xcode is installed" does not mean a simulator is ready. `check_android` must likewise separate SDK presence from an available AVD.
- Acceptance: each component reports its own status, and a failure in one cannot change another's
- Verify (local): `grep -c -F 'fn check_' studio/src-tauri/src/doctor.rs` → `>= 8`
- Dependencies: Task 26

**Task 29 — Report each component's state instead of one verdict** `M`
- File: `studio/src-tauri/src/doctor.rs`
- Anchor: `pub struct Doctor {` within `studio/src-tauri/src/doctor.rs` (line 97)
- Reuse: the `#[serde(rename_all = "camelCase")]` convention already on `Doctor`
- Code sample: replace the `Doctor` struct with `ComponentReport` and `Diagnostics` mirroring Task 26's TypeScript exactly, and rename the command `run_doctor` → `run_diagnostics`, keeping `override_path` as a per-component override input
- Do not touch: `worker_ok()`'s body
- Edge cases: `lib.rs:205` registers `doctor::run_doctor`; renaming the command without updating that line fails to compile, which is the desired loud failure rather than a silent dead command
- ⚠️ Breaking change: the `run_doctor` command name disappears from the IPC surface; `tauri-api.ts:21` must move in the same cycle
- Acceptance: the command returns one report per component and never an error
- Verify (local): `grep -c -F 'pub fn run_diagnostics' studio/src-tauri/src/doctor.rs` → `== 1` and `grep -c -F 'pub struct Doctor' studio/src-tauri/src/doctor.rs` → `== 0`
- Dependencies: Task 28

**Task 30 — Delete the global gate from App.tsx** `M`
- File: `studio/src/App.tsx`
- Anchor: `if ((doctorBlocking(doctor) && !dismissedDoctor) || !program) {` → `studio/src/App.tsx:307`
- Reuse: nothing — the whole conditional block at `App.tsx:307-322` is removed
- Code sample: delete the conditional return and the `dismissedDoctor` state at `App.tsx:32`. Replace `doctor` with `diagnostics` loaded exactly as before, but used only to populate the Diagnostics panel. The `if (!doctor)` loading return at `App.tsx:303-305` also goes: the shell must render before diagnostics arrive, not after.
- Do not touch: the `check()` callback's resolution of an override at `App.tsx:57-63` — per-component overrides still need it
- Edge cases: `program` at `App.tsx:33` currently also gates the render; Task 52 replaces it with a per-session agent definition, so this task must leave the terminal rendering path working with a null program in the interim, which `terminal-pane.tsx:11-14` already supports as attach-only
- ⚠️ Breaking change: the app no longer stops on a missing Claude — which is the entire objective, and the acceptance case `CLAUDE-IMPLEMENTATION-PROMPT.md` §13 item 1 requires
- Acceptance: with no Claude on the machine and no override set, the app renders a usable workspace
- Verify (local): `grep -c -F 'doctorBlocking' studio/src/App.tsx` → `== 0` (baseline 2) and `grep -c -F 'dismissedDoctor' studio/src/App.tsx` → `== 0`
- Dependencies: Task 26, Task 29

**Task 31 — Replace DoctorScreen with a non-blocking DiagnosticsPanel** `L`
- File: `studio/src/components/diagnostics-panel.tsx` (new file — confirmed absent)
- Reuse: `PanelSection` from `studio/src/components/panel-section.tsx` for grouping; the install-pane subscription pattern at `doctor-screen.tsx:57-60`, which holds callbacks in refs for the reason recorded there
- Code sample: one row per `ComponentReport` — label, status with both an icon and a text label, detail, and verbatim error. Rows are independent; nothing aggregates them into a verdict. It renders inside Settings → Diagnostics, never as a full-screen interstitial.
- Do not touch: `studio/src/components/doctor-screen.tsx` yet — it still owns the installer PTY pane, which Task 43 moves; deleting it now would lose the subscribe-before-open sequencing
- Edge cases: an unavailable component shows a reason, not a retry button that cannot work. Status colour always has a label beside it.
- Acceptance: diagnostics are a surface the user visits, not a screen the app traps them on
- Verify (local): `test -f studio/src/components/diagnostics-panel.tsx && grep -c -F 'ComponentReport' studio/src/components/diagnostics-panel.tsx` → `>= 1`
- Dependencies: Task 26, Task 30

**Task 32 — Add Set executable path, Check again and Set up later actions** `M`
- File: `studio/src/components/diagnostics-panel.tsx`
- Reuse: the override text field and its handler from `doctor-screen.tsx` — the existing `onOverride` flow already resolves a path and re-checks
- Code sample: per row, a `Set executable path` field, a `Check again` button that re-runs only that component's probe, and `Set up later` which dismisses the row without changing any other component
- Do not touch: the app-wide re-check — it stays available, but it is no longer the only way to recover
- Edge cases: a path containing a space must work; the field takes a literal path, never a shell string
- Acceptance: a missing component can be fixed from its own row without touching any other
- Verify (local): `grep -c -F 'Set executable path' studio/src/components/diagnostics-panel.tsx` → `== 1` and `grep -c -F 'Check again' studio/src/components/diagnostics-panel.tsx` → `== 1`
- Dependencies: Task 31

**Task 33 — Keep Detected distinct from authenticated in the copy** `S`
- File: `studio/src/components/diagnostics-panel.tsx`
- Reuse: the `ComponentStatus` union from Task 26
- Code sample: map `detected` to the label `Detected` with helper text naming only what was found — the resolved executable path. No row claims a login state, because no check in this app can observe one.
- Do not touch: the `ready` label, which means a relevant diagnostic passed
- Edge cases: `detected` and `ready` must not share a colour; detected is neutral, ready is sage
- Acceptance: no part of the UI implies a provider is signed in
- Verify (local): `grep -ciE 'logged in|signed in|authenticated' studio/src/components/diagnostics-panel.tsx` → `== 0`
- Dependencies: Task 31

**Task 34 — Assert the shell opens with no Claude present** `S`
- File: none — a behavioural check
- Reuse: `api.setClaudeOverride(null)` to clear any override before the check
- Code sample: clear the override, confirm `resolve_claude` fails, launch the app, and confirm a workspace renders
- Do not touch: the user's real Claude installation — clear the override only, never move a binary
- Edge cases: Claude may still be on `PATH` on this machine; the honest version of this check points the override at a non-existent path and confirms no gate appears, and the report states that a truly Claude-free machine was not available
- Acceptance: a machine with no Claude reaches a usable workspace
- Verify (local): `grep -c -F 'doctorBlocking' studio/src/App.tsx` → `== 0`
- Dependencies: Task 30

**Task 35 — Module boundary: build and cargo check after the gate removal** `S`
- File: none
- Reuse: both check commands
- Code sample: `cd studio && npm run build` then `cd studio/src-tauri && cargo check --quiet`
- Acceptance: both sides compile with the gate gone and `Doctor` removed
- Verify (local): none — this task's whole deliverable IS the global invariant below, so a local check would be the same command run twice. Permitted by the plan's "a task whose only honest proof is a compile may carry a global verify" rule.
- Verify (global): `cd studio && npm run build` → exit 0; `cd studio/src-tauri && cargo check --quiet` → exit 0
- Dependencies: Task 27, Task 29, Task 31

**Task 36 — Define component selection and readiness types** `M`
- File: `studio/src/lib/types.ts`
- Anchor: `export const STAGES: Stage[] = ['Brainstorm', 'Plan', 'Refine', 'Execute', 'Review'];` → `studio/src/lib/types.ts:59`
- Reuse: `ComponentId` and `ComponentStatus` from Task 26 — selection references them rather than redeclaring
- Code sample:
  ```ts
  /** The four genuinely different operations. A UI checkbox that maps to the
   *  wrong one is how "optional" setup ends up running install-all. */
  export type SetupOp = 'linkExisting' | 'enableBundled' | 'setupExternal' | 'installSelected';

  export interface SetupItem {
    id: ComponentId;
    selected: boolean;
    op: SetupOp;
    /** Files, config keys and commands this item will touch. Shown on review. */
    effects: string[];
  }

  export interface SetupPlan {
    items: SetupItem[];
  }
  ```
- Do not touch: the diagnostics types above
- Edge cases: `effects` is what the Review screen renders, so it must be produced by the backend that will act, never written by the UI
- Acceptance: a selection can be expressed as four distinct operations with declared effects
- Verify (local): `grep -c -F "export type SetupOp" studio/src/lib/types.ts` → `== 1`
- Dependencies: Task 26

**Task 37 — Create setup.rs with a four-operation plan model** `L`
- File: `studio/src-tauri/src/setup.rs` (new file — confirmed absent)
- Reuse: `doctor::check_*` from Task 28 to decide whether a component needs linking or installing; `shell_env::login_shell_path()` for discovery
- Code sample: `build_plan(selection) -> SetupPlan` emitting one item per selected component with its operation and its effects, and `run_plan(plan)` executing only those items. An unselected component cannot appear in the plan — that invariant is the whole module.
- Do not touch: `install.sh` from here; this module invokes it with explicit flags (Task 38) rather than reimplementing it
- Edge cases: the plan must never contain `verify` (Task 24 asserts this). Effects are declared before execution so Review can show them.
- Acceptance: a selection of one component produces a plan touching only that component
- Verify (local): `test -f studio/src-tauri/src/setup.rs && grep -c -F 'fn build_plan' studio/src-tauri/src/setup.rs` → `== 1`
- Dependencies: Task 28, Task 36

**Task 38 — Add component flags to install.sh** `L`
- File: `install.sh`
- Anchor: `step "Installing commands"` → `install.sh:90`
- Reuse: the existing nine `step` sections and the `step()` helper at `install.sh:54`; the timeout-and-retry curl wrapper already in place
- Code sample: parse `--only=commands,agents,worker,hooks,pydeps,optimizer,daemon` into a set, and guard each of the nine sections with a membership test. With no `--only` the set is every component, so today's behaviour is bit-for-bit unchanged.
- Do not touch: the ordering of the nine steps, the Python version check, and the `LEGACY_COMMANDS` cleanup at `install.sh:101` — removing a retired command is correct under any selection. `bash -n install.sh` already passes (baseline exit 0) and must keep passing, which is a constraint rather than this task's evidence.
- Edge cases: `--only=browser` selects nothing this script installs and must exit 0 having done nothing, not fall through to install-all. An unknown component name must fail loudly rather than be ignored.
- ⚠️ Breaking change: the script grows a flag surface; invoked bare it must stay identical, because that is how every existing user and the current `install_efficlaude` command call it
- Acceptance: `--only=commands` installs commands and nothing else, a bare invocation still installs everything, and the script still parses
- Verify (local): `grep -c -F 'want_component' install.sh` → `>= 9` (baseline 0 — one guard per step) and `grep -c -F -- '--only' install.sh` → `>= 1` (baseline 0)
- Dependencies: none

**Task 39 — Keep legacy install-all as a named, scoped option** `M`
- File: `studio/src-tauri/src/setup.rs`
- Reuse: the existing `install_efficlaude` command at `lib.rs:80`, including its resource resolution and the single-quoting at `lib.rs:103` that makes a path with a space work
- Code sample: expose the bare install as one explicitly named operation — `install_all_legacy` — reachable from Settings with its scope spelled out, and never the default for a fresh setup
- Do not touch: the quoting at `lib.rs:103` and the comment explaining why it exists; a bundled path still contains a space
- Edge cases: the installer session uses the reserved `__install__` id at `lib.rs:66`; a second concurrent install must be refused rather than silently reuse that session (Task 45)
- Acceptance: existing users keep a one-click full install, and new users are not given it by default
- Verify (local): `grep -c -F 'install_all_legacy' studio/src-tauri/src/setup.rs` → `>= 1`
- Dependencies: Task 37, Task 38

**Task 40 — Build the Choose-tools screen** `L`
- File: `studio/src/components/choose-tools.tsx` (new file — confirmed absent)
- Reuse: `ComponentReport` from Task 26 to pre-fill detected tools; `PanelSection` for the three groups
- Code sample: groups Agents (Claude Code, Codex, Other CLI — multi-select, no mandatory default), Tools (Terminal shown as included core and not a checkbox, Browser optional, iOS and Android default off), and Connections (skippable). Device rows render the four distinct states from Task 92.
- Do not touch: nothing downloads on selection; picking a card queues an operation and nothing more
- Edge cases: Terminal must not appear as a download checkbox — it is a core facility. Project memory and the Claude workflow toolkit default off unless a diagnostic already found them.
- Acceptance: a user can select any subset, including none, and nothing has been installed yet
- Verify (local): `grep -c -F 'Other CLI' studio/src/components/choose-tools.tsx` → `== 1` and `grep -ciE 'install all|recommended for everyone' studio/src/components/choose-tools.tsx` → `== 0`
- Dependencies: Task 26, Task 36

**Task 41 — Build the selection summary** `M`
- File: `studio/src/components/choose-tools.tsx`
- Reuse: `SetupPlan` from Task 36 — the summary renders the plan, it does not recount the checkboxes
- Code sample: a single line composed from the plan's operations, of the Design Contract's form `2 existing agents linked · Browser enabled · No device downloads`. The CTA reads `Review setup` when any item installs, and `Open Build` when every item is a link or an enable.
- Do not touch: download sizes and durations — none are invented; a number appears only when it is measured
- Edge cases: a selection that installs nothing must not show a Review step at all
- Acceptance: the summary distinguishes linked, enabled and newly installed, and the CTA follows from it
- Verify (local): `grep -c -F 'Review setup' studio/src/components/choose-tools.tsx` → `== 1` and `grep -c -F 'Open Build' studio/src/components/choose-tools.tsx` → `== 1`
- Dependencies: Task 36, Task 40

**Task 42 — Build the Review-setup screen** `M`
- File: `studio/src/components/setup-states.tsx` (new file — confirmed absent)
- Reuse: `SetupItem.effects` from Task 36 — the screen renders declared effects, never a guess
- Code sample: one block per installing item listing the files and config it writes, its dependencies, and the command or source it runs. An explicit confirm starts execution.
- Do not touch: effects text — it comes from the backend that will act, so the screen cannot promise something different from what runs
- Edge cases: no fabricated size or ETA. An item with no measurable duration shows no progress estimate.
- Acceptance: the user sees exactly what will change before anything does
- Verify (local): `test -f studio/src/components/setup-states.tsx && grep -c -F 'effects' studio/src/components/setup-states.tsx` → `>= 1`
- Dependencies: Task 36, Task 41

**Task 43 — Build the setup-states screen with partial failure** `L`
- File: `studio/src/components/setup-states.tsx`
- Reuse: the installer PTY pane from `doctor-screen.tsx`, moved here with its subscribe-before-open sequencing intact — the reason is recorded at `terminal-pane.tsx:52-53` and `lib.rs:68-71`
- Code sample: per-component status rows plus the live install log, which stays interactive because the PTY may be waiting on input. `Open Build` remains available whenever the core is ready; an unfinished optional component becomes a warning to resolve later. `Retry this component` appears only where the lifecycle genuinely supports retry.
- Do not touch: the reserved `__install__` session id at `lib.rs:66` and the subscribe-before-open order
- Edge cases: progress is indeterminate when there is no real signal — no percentage and no timer. An optional failure is a partial success, never a global red gate.
- Acceptance: a failed optional component leaves Build openable and says what to do next
- Verify (local): `grep -c -F 'Retry this component' studio/src/components/setup-states.tsx` → `== 1` and `grep -c -F 'Open Build' studio/src/components/setup-states.tsx` → `>= 1`
- Dependencies: Task 42
- Verify (global): `cd studio && npm run build` → exit 0

**Task 44 — Derive readiness from diagnostics, not invoke resolution** `M`
- File: `studio/src-tauri/src/setup.rs`
- Reuse: `doctor::check_*` from Task 28 as the only readiness authority
- Code sample: after an item's command completes, re-run that component's check and set its status from the result. A resolved `invoke`, a spawned session, and a PTY EOF all mean only that something started or ended — none of them is success.
- Do not touch: the PTY exit event at `pty.rs:43`; it stays an exit signal and does not become a success signal
- Edge cases: a legacy shell script's children can outlive the script, so EOF on the master does not mean the work finished; only the diagnostic decides
- Acceptance: a component reads ready only when its own check passes
- Verify (local): `grep -c -F 'check_' studio/src-tauri/src/setup.rs` → `>= 1`
- Dependencies: Task 28, Task 37

**Task 45 — Make Retry safe against a reserved session** `M`
- File: `studio/src-tauri/src/setup.rs`
- Reuse: the `map.contains_key(INSTALL_SESSION)` early return at `lib.rs:93-95`
- Code sample: before a retry, confirm the previous session is gone or can be cleaned up; if it cannot, report that rather than return `Ok(())` and leave a dead button. The current early return makes a second install silently succeed while doing nothing — that is exactly the no-op retry to eliminate.
- Do not touch: `kill_all_sessions` at `lib.rs:165` and both exit hooks
- Edge cases: an installer waiting on stdin is still alive and must not be killed from under the user without an explicit action
- Acceptance: Retry either genuinely retries or explains why it cannot
- Verify (local): `grep -c -F 'INSTALL_SESSION' studio/src-tauri/src/setup.rs` → `>= 1`
- Dependencies: Task 39, Task 44

**Task 46 — Assert a Browser-only setup writes no Claude hooks** `S`
- File: none — a behavioural check
- Reuse: the plan from Task 37
- Code sample: build a plan for Browser only, snapshot `~/.claude/settings.json`, run it, and compare
- Do not touch: the user's real `~/.claude/settings.json` — snapshot and compare, and restore if the check itself writes
- Edge cases: the file may not exist; absence before and after is a pass
- Acceptance: selecting Browser alone leaves Claude configuration untouched
- Verify (local): `grep -c -iE 'settings\.json' studio/src-tauri/src/setup.rs` → `>= 1` showing the write is gated by component selection
- Dependencies: Task 37, Task 38

**Task 47 — Assert a Codex-only setup installs no Python worker** `S`
- File: none — a behavioural check
- Reuse: the plan from Task 37
- Code sample: build a plan for Codex only and confirm it contains no `worker` or `pydeps` item, and that `install.sh` is invoked with an `--only` set excluding both
- Do not touch: an existing worker installation
- Edge cases: an existing worker found by diagnostics is linked, not reinstalled — linking is not installing
- Acceptance: a Codex-only user gets no Flask, no ChromaDB and no worker files
- Verify (local): `grep -c -F 'pydeps' install.sh` → `>= 1` confirming the step is individually selectable
- Dependencies: Task 37, Task 38

**Task 48 — Module boundary: build, cargo check and pytest after modular setup** `S`
- File: none
- Reuse: all three check commands
- Code sample: `cd studio && npm run build`; `cd studio/src-tauri && cargo check --quiet`; `python3 -m pytest -q`
- Acceptance: the modular setup compiles and the Python suite is unaffected
- Verify (local): none — this task's whole deliverable IS the global invariant below, so a local check would be the same command run twice. Permitted by the plan's "a task whose only honest proof is a compile may carry a global verify" rule.
- Verify (global): `cd studio && npm run build` → exit 0; `cd studio/src-tauri && cargo check --quiet` → exit 0; `python3 -m pytest -q` → `152 passed` or more
- Dependencies: Task 43, Task 45

**Task 49 — Define Tab and session identity types** `M`
- File: `studio/src/lib/tabs.ts` (new file — confirmed absent)
- Reuse: nothing — a new module, kept out of `types.ts` because it is a domain of its own
- Code sample:
  ```ts
  export type TabType = 'agent' | 'shell' | 'browser' | 'ios' | 'android';

  export interface Tab {
    /** Stable across restarts and independent of projectId: one project holds
     *  many tabs, and two tabs of the same type must be distinguishable. */
    id: string;
    projectId: string;
    type: TabType;
    title: string;
    /** Only for 'agent'. Identifies the provider, not the process. */
    providerId: string | null;
    /** The live process, if one exists. Null after a restart: metadata is
     *  restored, a process is not. */
    sessionId: string | null;
  }
  ```
- Do not touch: `studio/src/lib/types.ts` — tab identity does not belong beside `ProjectState`
- Edge cases: `sessionId` is nullable precisely so a restored tab cannot claim a live process
- Acceptance: tab identity, project identity and session identity are three separate values
- Verify (local): `test -f studio/src/lib/tabs.ts && grep -c -F 'sessionId: string | null' studio/src/lib/tabs.ts` → `== 1`
- Dependencies: none

**Task 50 — Add tabs.rs with a registry keyed by tab id** `L`
- File: `studio/src-tauri/src/tabs.rs` (new file — confirmed absent)
- Reuse: `projects::load()` / `save()` for persistence; the digest shape of `projects::project_id` at `projects.rs:99` for stable tab ids
- Code sample: a `Vec<Tab>` persisted in `StudioConfig` under `#[serde(default)]`, with commands to list, open, close and reorder. Order is metadata. Nothing here asserts a process is alive.
- Do not touch: `SessionRegistry` — tab metadata and live sessions are separate lifetimes, exactly as watchers and sessions already are per the comment at `lib.rs:109-110`
- Edge cases: a persisted tab whose project was removed must be dropped on load rather than rendered against a missing path
- Acceptance: tabs persist across a relaunch as metadata, with no claim about their processes
- Verify (local): `test -f studio/src-tauri/src/tabs.rs && grep -c -F 'pub struct Tab' studio/src-tauri/src/tabs.rs` → `== 1`
- Dependencies: Task 49

**Task 51 — Re-key SessionRegistry on session id** `L`
- File: `studio/src-tauri/src/pty.rs`
- Anchor: `pub struct SessionRegistry(pub Mutex<HashMap<String, PtySession>>);` → `studio/src-tauri/src/pty.rs:84`
- Reuse: the whole `PtySession` implementation, `start_reader`, and the lock discipline documented at `pty.rs:81-83`
- Code sample: the map key becomes a session id generated per open rather than a project id supplied by the caller. The doc comment changes from "One PTY per project" to one PTY per session, with several sessions per project.
- Do not touch: `start_reader`'s base64 encoding and the comment at `pty.rs:47-49` explaining why it is not a lossy `String`
- Edge cases: `kill_all_sessions` at `lib.rs:165` iterates values and is unaffected. `pty_close` at `lib.rs:53` takes an id and must now receive a session id — every caller changes in Task 56.
- ⚠️ Breaking change: any caller passing a project id as the key now gets `no session: <id>`; the loud failure is preferable to one project's keystrokes reaching another's shell
- Acceptance: one project can hold several simultaneous sessions with no shared key
- Verify (local): `grep -c -F 'One PTY per session' studio/src-tauri/src/pty.rs` → `>= 1` and `grep -c -F 'One PTY per project' studio/src-tauri/src/pty.rs` → `== 0`
- Dependencies: Task 50

**Task 52 — Give pty_open an explicit agent definition** `L`
- File: `studio/src-tauri/src/lib.rs`
- Anchor: `fn pty_open(` → `studio/src-tauri/src/lib.rs:23`
- Reuse: `pty::spawn` at `pty.rs:11`, widened from `program: &str` to a program plus an argv slice
- Code sample: `pty_open(app, reg, session_id, cwd, agent_id)` resolves the agent through `agents.rs` (Task 53) and builds the command from a path plus explicit arguments. `CommandBuilder::new(program)` with `cmd.args(...)` — never a joined shell string.
- Do not touch: the `cmd.env("TERM", "xterm-256color")` line and the `drop(pair.slave)` with its comment at `pty.rs:22-23`
- Edge cases: a program path containing a space must work, which is exactly why argv stays a list. The existing `contains_key` early return must now key on session id.
- ⚠️ Breaking change: `pty_open`'s signature changes; `terminal-pane.tsx:70` and `tauri-api.ts:49` both move in Tasks 56 and 58
- Acceptance: a session is opened from an agent definition, and a path with a space launches correctly
- Verify (local): `grep -c -F 'cmd.args' studio/src-tauri/src/pty.rs` → `>= 1`
- Dependencies: Task 51, Task 53

**Task 53 — Add agents.rs with a provider registry** `L`
- File: `studio/src-tauri/src/agents.rs` (new file — confirmed absent)
- Reuse: `shell_env::resolve_claude` at `shell_env.rs:40` generalised into a `resolve(program, override, fallbacks)` used by every provider; `login_shell_path()` for discovery
- Code sample: an `Agent` carrying a stable id, display name, executable path, explicit args, declared capabilities, and config scope. Claude Code and Codex are built in; Other CLI is user-defined with a path and args. Capabilities are declared, never inferred from the name.
- Do not touch: `FALLBACKS` at `shell_env.rs:34` — those are Claude's specific fallbacks and stay Claude's
- Edge cases: an agent whose executable is missing is still a valid definition with a `needsAttention` status; it must not be dropped from the registry
- Acceptance: three provider kinds are describable, and a workflow adapter can ask about capability rather than guess from an id
- Verify (local): `test -f studio/src-tauri/src/agents.rs && grep -c -F 'pub struct Agent' studio/src-tauri/src/agents.rs` → `== 1`
- Dependencies: none

**Task 54 — Resolve custom CLI path and args without shell joining** `M`
- File: `studio/src-tauri/src/agents.rs`
- Reuse: the argv list from Task 52
- Code sample: store `program: PathBuf` and `args: Vec<String>` separately and validate that the program is an existing file before an open is attempted. There is no parsing of a combined command string anywhere in this path.
- Do not touch: the installer's deliberate shell invocation at `lib.rs:104`, which is a bash script run on purpose and already correctly quoted
- Edge cases: `/Users/me/My Tools/codex` must launch. A user who types a whole command line into the path field gets a validation error naming the problem, not a split-on-space guess.
- Acceptance: a custom CLI at a path containing spaces launches, and no command string is ever shell-split
- Verify (local): `grep -c -F 'args: Vec<String>' studio/src-tauri/src/agents.rs` → `>= 1`
- Dependencies: Task 53

**Task 55 — Persist tab metadata without claiming process survival** `M`
- File: `studio/src-tauri/src/tabs.rs`
- Reuse: `projects::save()`
- Code sample: persist `id`, `projectId`, `type`, `title` and `providerId`, and never `sessionId`. On load every restored tab has `sessionId: None`, so the UI shows a tab the user can reopen rather than one pretending to hold a process.
- Do not touch: `kill_all_sessions` — processes are still killed on quit, which is precisely why a session id must not be persisted
- Edge cases: restoring a tab must not replay the last command sent to it
- Acceptance: tab order and identity survive a relaunch; no process is claimed to
- Verify (local): `grep -c -F 'skip_serializing' studio/src-tauri/src/tabs.rs` → `>= 1`
- Dependencies: Task 50

**Task 56 — Add tab and session wrappers to tauri-api.ts** `M`
- File: `studio/src/lib/tauri-api.ts`
- Anchor: `ptyOpen: (id: string, cwd: string, program: string) =>` → `studio/src/lib/tauri-api.ts:49`
- Reuse: the one-wrapper-per-command convention; the existing event helpers
- Code sample:
  ```ts
    ptyOpen: (sessionId: string, cwd: string, agentId: string) =>
      invoke<void>('pty_open', { sessionId, cwd, agentId }),
    ptyWrite: (sessionId: string, data: string) => invoke<void>('pty_write', { sessionId, data }),
    listTabs: () => invoke<Tab[]>('list_tabs'),
    openTab: (projectId: string, type: TabType, providerId: string | null) =>
      invoke<Tab>('open_tab', { projectId, type, providerId }),
    closeTab: (tabId: string) => invoke<void>('close_tab', { tabId }),
  ```
- Do not touch: the git, panels, projects and tree wrappers
- Edge cases: renaming the first parameter from `id` to `sessionId` changes the IPC argument name, so the Rust parameter must match or it arrives undefined — this is the type error the module comment at `tauri-api.ts:12-16` exists to produce
- ⚠️ Breaking change: every `ptyOpen` / `ptyWrite` / `ptyClose` caller changes; `App.tsx:204` and `terminal-pane.tsx:57,70` are the live ones
- Acceptance: tabs and sessions are reachable through typed wrappers only
- Verify (local): `grep -c -F "invoke<void>('pty_open', { sessionId, cwd, agentId })" studio/src/lib/tauri-api.ts` → `== 1`
- Dependencies: Task 49, Task 52

**Task 57 — Filter PTY events by session id** `M`
- File: `studio/src/lib/tauri-api.ts`
- Anchor: `export function onPtyOutput(id: string, cb: (bytes: Uint8Array) => void)` → `studio/src/lib/tauri-api.ts:58`
- Reuse: the existing id filter and the base64 decode loop — the mechanism is already correct, only the id's meaning widens
- Code sample: rename the parameter to `sessionId` and keep the `if (event.payload[0] !== sessionId) return;` guard verbatim. Do the same in `onPtyExit`.
- Do not touch: the byte-by-byte `atob` decode at `tauri-api.ts:61-64` — it pairs with the base64 encoding in `pty.rs` and must not become a `TextDecoder`
- Edge cases: the comment at `tauri-api.ts:57` says two open projects must not interleave; it now reads two open sessions, which is the stronger requirement
- Acceptance: two sessions in one project receive only their own bytes
- Verify (local): `grep -c -F 'sessionId' studio/src/lib/tauri-api.ts` → `>= 4`
- Dependencies: Task 56

**Task 58 — Re-key TerminalPane on session id** `M`
- File: `studio/src/components/terminal-pane.tsx`
- Anchor: `export function TerminalPane({ projectId, cwd, program, focusNonce }: TerminalPaneProps) {` → `studio/src/components/terminal-pane.tsx:20`
- Reuse: everything in the effect — the subscribe-before-open `Promise.all` at line 54, the `0x0` guard at line 63, the `ResizeObserver`, the `FitAddon`, and the separate focus effect at line 85 with its comment about not re-opening the PTY
- Code sample: replace `projectId` with `sessionId` and `program` with `agentId`, keeping the attach-only null case documented at lines 11-14 — the installer's PTY is still opened elsewhere, so a pane that called `ptyOpen` would spawn a second empty shell
- Do not touch: the dependency array `[projectId, cwd, program]` becomes `[sessionId, cwd, agentId]` and nothing more; adding `focusNonce` to it would tear down and reopen the PTY on every dispatch, which the comment at lines 83-84 exists to prevent. The hidden-pane `0×0` guard must survive verbatim (baseline `== 1`) — a hidden tab measures zero and fitting to that resizes the PTY behind a live session — but since it already holds, it is a constraint here and not this task's evidence.
- Edge cases: two panes in one project must subscribe to different session ids; a shared id is how output interleaves
- Acceptance: a pane attaches to a session id, two panes in one project stay independent, the `0×0` guard is still present, and there is no regression in byte, resize or focus handling
- Verify (local): `grep -c -F 'sessionId' studio/src/components/terminal-pane.tsx` → `>= 6` (baseline 0) and `grep -c -F '[sessionId, cwd, agentId]' studio/src/components/terminal-pane.tsx` → `== 1` (baseline 0)
- Dependencies: Task 57

**Task 59 — Build the TabStrip** `L`
- File: `studio/src/components/tab-strip.tsx` (new file — confirmed absent)
- Reuse: `Tab` and `TabType` from Task 49
- Code sample: a 38–40px row of tabs, each with an icon, a title, a provider or tool label where relevant, a keyboard-reachable menu and a close control, plus a trailing `+` that opens Add a tool. The row scrolls horizontally and never wraps.
- Do not touch: tab React keys must come from `tab.id`, never from the active index or the provider selection — an index key remounts panes and kills sessions
- Edge cases: many tabs must overflow in one scrolling row with the overflow reachable by keyboard. A tab whose session is live needs an explicit `Close session`, not a silent kill.
- Acceptance: tabs are addressable, closable and navigable by keyboard, in a single row at every target width
- Verify (local): `test -f studio/src/components/tab-strip.tsx && grep -c -F 'key={tab.id}' studio/src/components/tab-strip.tsx` → `== 1`
- Dependencies: Task 49

**Task 60 — Build the Add-a-tool menu** `L`
- File: `studio/src/components/add-tool-menu.tsx` (new file — confirmed absent)
- Reuse: `ComponentReport` from Task 26 to decide each item's state; `Agent` list from Task 53
- Code sample: two groups — Agent sessions and Workspace tools. An available item opens a tab on click; a missing item opens its setup; an unsupported item shows `Unavailable` with a reason and no action.
- Do not touch: the onboarding checkboxes — a checkbox is a setup selection and a menu item is an open-a-tab action; they are different models and must not share state
- Edge cases: an item that cannot work shows a reason, never a button that pretends to
- Acceptance: every menu item either does what it says or explains why it cannot
- Verify (local): `grep -c -F 'Unavailable' studio/src/components/add-tool-menu.tsx` → `>= 1` and `grep -c -F 'Workspace tools' studio/src/components/add-tool-menu.tsx` → `== 1`
- Dependencies: Task 26, Task 53

**Task 61 — Build AgentSessionPane with a CLI session label** `M`
- File: `studio/src/components/agent-session-pane.tsx` (new file — confirmed absent)
- Reuse: `TerminalPane` from Task 58 unchanged — this wraps it, it does not reimplement a terminal
- Code sample: the terminal plus a compact header naming the provider. A provider with no workflow adapter is labelled `CLI session` with the helper `Workflow shortcuts are not configured for this agent.` — one line, not a banner that eats terminal room.
- Do not touch: the terminal's own sizing; the pane adds a header and must not shrink the terminal below the Design Contract's generous allowance
- Edge cases: a generic prompt is still typable in a Codex session; nothing about the missing adapter restricts normal terminal use
- Acceptance: a Codex session is fully usable and makes no claim to Claude's workflow
- Verify (local): `grep -c -F 'Workflow shortcuts are not configured for this agent.' studio/src/components/agent-session-pane.tsx` → `== 1`
- Dependencies: Task 58

**Task 62 — Add an explicit Close session action** `M`
- File: `studio/src/components/tab-strip.tsx`
- Reuse: `api.closeTab` and `api.ptyClose` from Task 56
- Code sample: closing a tab with a live session requires a distinct `Close session` confirmation; closing a tab with no session just closes it. Running state is never inferred from terminal output.
- Do not touch: the browser case — closing a browser tab must not kill any shell
- Edge cases: the app cannot observe whether a REPL is at a prompt, so no readiness or busy indicator may be shown; the honest signal is only whether a session exists
- Acceptance: a live session is never closed without an explicit action, and no fake running state is displayed
- Verify (local): `grep -c -F 'Close session' studio/src/components/tab-strip.tsx` → `== 1`
- Dependencies: Task 59

**Task 63 — Keep live sessions mounted across navigation** `M`
- File: `studio/src/App.tsx`
- Anchor: `{projects.map((p) => (` → `studio/src/App.tsx:361`
- Reuse: the existing hide-not-unmount pattern and its comment at `App.tsx:359-360`, widened from projects to tabs
- Code sample: render every open tab's pane and hide the inactive ones with a class, exactly as projects are handled today. Settings, Connections and the Verify landing render as overlays or sibling views, never by replacing the pane container.
- Do not touch: the comment explaining that unmounting would kill a running `/ec-execute` — it is the reason this pattern exists and now applies to tabs. `App.tsx` already contains one `'hidden'` (baseline 1, at `App.tsx:362`), so counting that string proves nothing; the evidence is the tab-level loop this task adds in `workbench.tsx`.
- Edge cases: a hidden pane measures `0x0`, which the guard in `terminal-pane.tsx` already handles; opening Settings must not trigger a resize to zero
- Acceptance: switching project, tab, Settings, Connections or Verify leaves every live session running
- Verify (local): `grep -c -F 'hidden' studio/src/components/workbench.tsx` → `>= 1` (baseline 0 — file absent) and `grep -c -F 'key={tab.id}' studio/src/components/workbench.tsx` → `>= 1` (baseline 0)
- Dependencies: Task 58, Task 59, Task 67

**Task 64 — Close only the removed project's sessions** `M`
- File: `studio/src/App.tsx`
- Anchor: `const handleRemove = useCallback(async (id: string) => {` → `studio/src/App.tsx:165`
- Reuse: the existing removal sequence, which already tolerates a missing session via `.catch(() => {})` at `App.tsx:167`
- Code sample: look up that project's tabs, close each one's session by session id, then remove the project. The folder is never deleted.
- Do not touch: `projects::remove_project`, which only edits studio.json and does not touch the filesystem
- Edge cases: a project with no open tab must still be removable; the catch at line 167 already covers the no-session case
- Acceptance: removing a project closes only its own sessions and leaves the folder on disk
- Verify (local): `grep -c -F 'closeTab' studio/src/App.tsx` → `>= 1`
- Dependencies: Task 59, Task 63

**Task 65 — Assert two agents in one project do not interleave** `M`
- File: none — a behavioural check, formalised as a test in Task 123
- Reuse: the session id filter from Task 57
- Code sample: open a Claude tab and a Codex tab in one project, write a distinct marker into each, and confirm each marker appears only in its own terminal
- Do not touch: nothing — this is observation
- Edge cases: both sessions must remain alive while the other is focused; a background session that dies on blur is the failure this catches
- Acceptance: two sessions in one project have distinct ids and no crossed output
- Verify (local): `grep -c -F 'event.payload[0] !== sessionId' studio/src/lib/tauri-api.ts` → `== 1`
- Dependencies: Task 57, Task 59

**Task 66 — Module boundary: build and cargo check after sessions** `S`
- File: none
- Reuse: both check commands
- Code sample: `cd studio && npm run build`; `cd studio/src-tauri && cargo check --quiet`
- Acceptance: the session re-key compiles on both sides
- Verify (local): none — this task's whole deliverable IS the global invariant below, so a local check would be the same command run twice. Permitted by the plan's "a task whose only honest proof is a compile may carry a global verify" rule.
- Verify (global): `cd studio && npm run build` → exit 0; `cd studio/src-tauri && cargo check --quiet` → exit 0
- Dependencies: Task 62, Task 64

**Task 67 — Build the Workbench shell** `L`
- File: `studio/src/components/workbench.tsx` (new file — confirmed absent)
- Reuse: `TabStrip` from Task 59; the pane-hiding pattern from Task 63
- Code sample: the tab strip above a body that renders the active tab's pane by type — agent session, shell terminal, browser, iOS, Android. Replaces the single-terminal `main` currently inlined at `App.tsx:342-375`.
- Do not touch: the terminal's share of the layout — the Design Contract requires a generous terminal, and the tab strip plus header must not erode it
- Edge cases: with no tabs open the body shows an empty state offering Add a tool, not a blank region
- Acceptance: the main area is a tabbed workbench and the terminal still dominates it
- Verify (local): `test -f studio/src/components/workbench.tsx && grep -c -F 'TabStrip' studio/src/components/workbench.tsx` → `>= 1`
- Dependencies: Task 59, Task 63

**Task 68 — Build the project header** `S`
- File: `studio/src/components/workbench.tsx`
- Reuse: the existing header markup at `App.tsx:343-349`, including `StageRail`
- Code sample: project name, path and branch, with the path and branch truncated and their full values reachable via `title`
- Do not touch: `StageRail` — it stays a workflow recommendation and gains no running semantics
- Edge cases: a long path must truncate rather than push the stage rail out of view
- Acceptance: name, path and branch are all visible or reachable at every target width
- Verify (local): `grep -c -F 'StageRail' studio/src/components/workbench.tsx` → `>= 1`
- Dependencies: Task 67

**Task 69 — Make flow dispatch name an explicit target session** `L`
- File: `studio/src/components/flow-bar.tsx`
- Anchor: `onDispatch: ((text: string) => void) | null;` → `studio/src/components/flow-bar.tsx:9`
- Reuse: `FLOW_STEPS` and `nextStep` from `flow.ts` unchanged — the Claude mapping is correct and stays Claude's
- Code sample: the prop becomes `target: { sessionId: string; providerName: string } | null` plus `onDispatch(sessionId, text)`. The helper line reads `Sends /ec-execute to Claude Code`, naming the destination. With no eligible target, the buttons do not dispatch.
- Do not touch: `textFor` at `flow-bar.tsx:19-20` and the invariant it carries — the helper line and the dispatch are built by the same function so the line cannot describe something other than what is sent
- Edge cases: the active tab being a browser, Codex or shell must not make it the dispatch target; resolution goes to the Claude session explicitly, or nowhere
- ⚠️ Breaking change: `App.tsx:355` passes `onDispatch={activeId ? handleDispatch : null}` keyed on the active project; that wiring is replaced by explicit target resolution
- Acceptance: every workflow click states its destination and reaches only a Claude session
- Verify (local): `grep -c -F 'to Claude Code' studio/src/components/flow-bar.tsx` → `>= 1`
- Dependencies: Task 59, Task 61

**Task 70 — Hide workflow shortcuts for providers with no adapter** `M`
- File: `studio/src/components/flow-bar.tsx`
- Anchor: `export function FlowBar({ next, collapsed, onToggle, onDispatch }: FlowBarProps) {` → `studio/src/components/flow-bar.tsx:14`
- Reuse: the `Agent` capability declaration from Task 53
- Code sample: when the active tab's provider declares no workflow capability, render the single helper line from Task 61 instead of the six command buttons. No renamed buttons, no greyed-out `/ec-*` that implies future parity.
- Do not touch: `studio/src/lib/flow.ts` at all — its six `/ec-*` strings (baseline 6) are Claude's real commands and are never paraphrased or invented for another provider. That count already holds, so it is a constraint rather than this task's evidence; the change lives entirely in `flow-bar.tsx`.
- Edge cases: Claude with a toolkit that diagnostics did not actually find also gets no shortcuts; the adapter requires a real toolkit, not a provider name match
- Acceptance: only a genuinely Claude-plus-toolkit target shows the six commands; every other provider shows the one helper line instead
- Verify (local): `grep -c -F 'Workflow shortcuts are not configured for this agent.' studio/src/components/flow-bar.tsx` → `== 1` (baseline 0) and `grep -c -F '/ec-' studio/src/lib/flow.ts` → `== 6` as an unchanged-constraint check
- Dependencies: Task 53, Task 69

**Task 71 — Add the Open Claude Code CTA when the target is hidden** `M`
- File: `studio/src/components/flow-bar.tsx`
- Anchor: `export function FlowBar({ next, collapsed, onToggle, onDispatch }: FlowBarProps) {` → `studio/src/components/flow-bar.tsx:14`
- Reuse: `api.openTab` from Task 56
- Code sample: when a Claude session exists but its tab is not active, show `Open Claude Code`, which focuses that tab. Dispatch happens only after the correct target is present and the user clicks again. Nothing auto-creates a session and nothing auto-sends on a stage or project change.
- Do not touch: the stage derivation — a stage change is not a trigger to send anything
- Edge cases: with no Claude session at all, the CTA offers to open one and still does not dispatch
- Acceptance: reaching the right target always takes a deliberate click
- Verify (local): `grep -c -F 'Open Claude Code' studio/src/components/flow-bar.tsx` → `== 1`
- Dependencies: Task 69, Task 70

**Task 72 — Label the plan source in the inspector** `M`
- File: `studio/src/components/task-panel.tsx`
- Anchor: `export function TaskPanel` in `studio/src/components/task-panel.tsx`
- Reuse: `ProjectState` and the existing task rendering — the data is already right, only its attribution is missing
- Code sample: a `Source: Claude plan` label above the checklist whenever the state came from a `.claude` plan. It stays visible while a Codex tab is active, because the plan is the project's, but it never reads as that provider's progress.
- Do not touch: `done`, `total` and the raw-plan fallback
- Edge cases: if more than one plan source ever exists, the choice is explicit rather than first-wins
- Acceptance: the inspector always says where its tasks came from
- Verify (local): `grep -c -F 'Source: Claude plan' studio/src/components/task-panel.tsx` → `== 1`
- Dependencies: Task 67

**Task 73 — Give the task status glyph an accessible label** `S`
- File: `studio/src/components/task-panel.tsx`
- Anchor: `<span className={t.done ? 'text-accent' : 'text-muted'}>{t.done ? '✓' : '○'}</span>` → `studio/src/components/task-panel.tsx:45`
- Reuse: the existing hollow-circle rendering, which is already correct — `○` for pending and `✓` for done are in place, and this task does not change the glyphs
- Code sample:
  ```tsx
  <span
    aria-hidden="true"
    className={t.done ? 'text-accent' : 'text-muted'}
  >{t.done ? '✓' : '○'}</span>
  <span className="sr-only">{t.done ? 'done' : 'pending'}</span>
  ```
  The Design Contract requires every status to carry a label or icon rather than colour alone; the glyph is decorative and the label is the information.
- Do not touch: the glyphs themselves, the read-only nature (nothing in the UI writes to the plan file), and the absence of any spinner or pulse. `grep -ciE 'animate-spin|animate-pulse'` is already 0 and must stay 0 — a constraint, not this task's evidence, since a check that already passes cannot fail.
- Edge cases: a long task text wraps rather than truncating to ambiguity; the `sr-only` label must not be announced on every watcher update
- Acceptance: a screen reader distinguishes done from pending without relying on colour, and the checklist still shows state rather than activity
- Verify (local): `grep -c -F 'aria-hidden' studio/src/components/task-panel.tsx` → `== 1` (baseline 0) and `grep -ciE 'animate-spin|animate-pulse' studio/src/components/task-panel.tsx` → `== 0` as an unchanged-constraint check
- Dependencies: Task 72

**Task 74 — Build the inspector Tasks and History tabs** `M`
- File: `studio/src/components/workbench.tsx`
- Reuse: `TaskPanel`, `HistoryPanel` and `PanelSection` unchanged
- Code sample: a two-tab inspector with `aria-selected` and arrow-key navigation, preserving the history title, slug, time, branch and hidden-count rendering already in `history-panel.tsx`
- Do not touch: the hidden-count display — it is real information about what is not shown
- Edge cases: an empty history shows its own copy, distinct from a project with no plan
- Acceptance: Tasks and History are keyboard-navigable tabs with no information lost from the current panels
- Verify (local): `grep -c -F 'aria-selected' studio/src/components/workbench.tsx` → `>= 1`
- Dependencies: Task 67, Task 72

**Task 75 — Keep Project & Git as a disclosure with real errors** `M`
- File: `studio/src/components/properties-panel.tsx`
- Anchor: `export function PropertiesPanel` in `studio/src/components/properties-panel.tsx`
- Reuse: the whole existing panel — `GitInfo` already distinguishes detached, unavailable and error, and `App.tsx:248` already shows git's own stderr verbatim
- Code sample: present it as a disclosure within the inspector, keeping branch list, detached HEAD, unavailable state, verbatim error and the unfinished-task warning
- Do not touch: the no-retry, no-force behaviour recorded at `App.tsx:247`, and the two `detached` references already in this file (baseline 2) — they must survive, but since they already exist, counting them is a constraint rather than this task's evidence
- Edge cases: a detached HEAD is explicit rather than inferred from a null branch, which `GitInfo` already encodes
- Acceptance: every git state the current panel surfaces is still surfaced, now inside the inspector's disclosure rather than a top-level rail section
- Verify (local): `grep -c -F 'PropertiesPanel' studio/src/components/workbench.tsx` → `>= 1` (baseline 0 — file absent) and `grep -c -F 'detached' studio/src/components/properties-panel.tsx` → `== 2` as an unchanged-constraint check
- Dependencies: Task 74

**Task 76 — Keep the no-task empty state free of 0/0 and 100%** `S`
- File: `studio/src/components/task-panel.tsx`
- Anchor: `<Empty>No plan yet — run /ec-feature</Empty>` → `studio/src/components/task-panel.tsx:31`
- Reuse: the existing empty handling
- Code sample: with no tasks, render `No tasks yet`. No `0/0`, no percentage, and the `/ec-plan` hint only in a Claude context — other providers get neutral copy.
- Do not touch: the `/ec-plan` name; the empty fallback names `/ec-plan`, never `/ec-feature`
- Edge cases: `total === 0` must not produce a division
- Acceptance: an empty plan reads as empty, not as complete
- Verify (local): `grep -c -F 'No tasks yet' studio/src/components/task-panel.tsx` → `== 1` and `grep -c -F '/ec-feature' studio/src/components/task-panel.tsx` → `== 0`
- Dependencies: Task 73

**Task 77 — Render the brainstorm argument field only in brainstorm context** `S`
- File: `studio/src/components/flow-bar.tsx`
- Anchor: `{!collapsed && (` → `studio/src/components/flow-bar.tsx:64`
- Reuse: the existing `textFor` logic at `flow-bar.tsx:19-20`, which already appends the argument only for `/ec-brainstorm` and must keep doing so
- Code sample: the field is currently rendered whenever the bar is expanded, for every stage. The Design Contract requires it only in the brainstorm stage's context, so gate it:
  ```tsx
  {!collapsed && next?.command === '/ec-brainstorm' && (
    /* the helper line and the argument input */
  )}
  ```
  When the next step is not brainstorm, the helper line still renders but the input does not.
- Do not touch: `textFor` and the invariant that the helper line and the dispatch are built by the same function; the bare `/ec-git` dispatch, which is sent bare on purpose so its own confirmations still run; and the existing `s.command === '/ec-brainstorm' && arg.trim()` condition (baseline 1), which must survive the Task 69 refactor but already holds and so is not this task's evidence
- Edge cases: an argument typed while brainstorm was the next step must not survive into a later stage and be sent to a different command; clear it when the gate closes
- Acceptance: the argument input appears only when brainstorm is the next step, and the argument can reach no command but `/ec-brainstorm`
- Verify (local): `grep -c -F "next?.command === '/ec-brainstorm'" studio/src/components/flow-bar.tsx` → `== 1` (baseline 0) and `grep -c -F "s.command === '/ec-brainstorm' && arg.trim()" studio/src/components/flow-bar.tsx` → `== 1` as an unchanged-constraint check
- Dependencies: Task 69

**Task 78 — Assert workflow dispatch never reaches a non-Claude session** `M`
- File: none — a behavioural check, formalised in Task 123
- Reuse: the explicit target from Task 69
- Code sample: with a browser tab and a Codex tab active in turn, click each workflow button and confirm no bytes reach either session
- Do not touch: nothing — observation only
- Edge cases: the Claude session may be hidden; the CTA must appear rather than a silent no-op
- Acceptance: no workflow command can reach a browser, Codex or plain shell session
- Verify (local): `grep -c -F 'onDispatch?.(textFor(s))' studio/src/components/flow-bar.tsx` → `== 0` confirming the untargeted dispatch is gone
- Dependencies: Task 69, Task 70, Task 71

**Task 79 — Module boundary: build after the workbench** `S`
- File: none
- Reuse: the build script
- Code sample: `cd studio && npm run build`
- Acceptance: the workbench and inspector compile
- Verify (local): none — this task's whole deliverable IS the global invariant below, so a local check would be the same command run twice. Permitted by the plan's "a task whose only honest proof is a compile may carry a global verify" rule.
- Verify (global): `cd studio && npm run build` → exit 0
- Dependencies: Task 75, Task 77

**Task 80 — Add browser.rs with a real browsing surface** `L`
- File: `studio/src-tauri/src/browser.rs` (new file — confirmed absent)
- Reuse: `tauri_plugin_opener`, already initialised at `lib.rs:179`, for the external-open path
- Code sample: first verify against the official documentation for the installed Tauri 2 version whether a child webview can be embedded with controllable bounds. If it can, implement create, navigate, back, forward, reload and destroy. If it cannot, implement the controller path only and record the limit for Task 87. Do not guess at an API.
- Do not touch: the app's existing window configuration; a browser surface must not change the main window's security posture
- Edge cases: an arbitrary site cannot be assumed to allow framing, so an iframe is not an acceptable implementation
- Acceptance: either a verified native browsing surface exists, or the limitation is implemented as a labelled fallback and reported
- Verify (local): `test -f studio/src-tauri/src/browser.rs && grep -c -F 'fn ' studio/src-tauri/src/browser.rs` → `>= 3`
- Dependencies: none

**Task 81 — Keep remote content away from privileged IPC** `L`
- File: `studio/src-tauri/tauri.conf.json` (plus a new capability file under `studio/src-tauri/capabilities/`, and `studio/src-tauri/src/browser.rs`)
- Anchor: `"csp": null` → `studio/src-tauri/tauri.conf.json:21`
- Reuse: Tauri's capability scoping rather than a hand-rolled allowlist
- Code sample: give the browsing surface its own capability set with no command permissions — no project file access, no credential access, no PTY commands. Replace the blanket `"csp": null` with a policy scoped to the app window, and do not widen anything app-wide to make a preview work.
- Do not touch: the main window's existing command permissions, which the app legitimately needs
- Edge cases: tightening the CSP can break the dev server's HMR; scope the policy so development still works without loosening the shipped build
- ⚠️ Breaking change: a stricter CSP may block an inline style or script the current build relies on; `npm run build` plus a manual launch is the gate before accepting it
- Acceptance: remote content has no route to app IPC, project files, credentials or a shell
- Verify (local): `grep -c -F '"csp": null' studio/src-tauri/tauri.conf.json` → `== 0`
- Dependencies: Task 80

**Task 82 — Build BrowserPane with the address bar and controls** `L`
- File: `studio/src/components/browser-pane.tsx` (new file — confirmed absent)
- Reuse: the browser commands from Task 80
- Code sample: back, forward, reload, an editable address field, the page title, and `Open externally`. A localhost URL is typed by the user; nothing claims to have detected a dev server.
- Do not touch: any auto-navigation on open — a browser tab opens empty and waits
- Edge cases: the address field must stay editable in every error state, so a wrong URL is recoverable without closing the tab
- Acceptance: a browser tab navigates on user action and never on its own
- Verify (local): `test -f studio/src/components/browser-pane.tsx && grep -ciE 'autodetect|detected dev server' studio/src/components/browser-pane.tsx` → `== 0`
- Dependencies: Task 80

**Task 83 — Handle loading, error, unreachable and certificate states** `M`
- File: `studio/src/components/browser-pane.tsx`
- Reuse: the status-with-label convention from the Design Contract
- Code sample: a distinct state and copy for loading, error, unreachable, certificate problem, download and popup, each with its own recovery — Retry, Open externally, or an explanation
- Do not touch: the other tabs — a browser error must stay inside its own pane
- Edge cases: a certificate problem is not the same as unreachable and must not share copy; neither offers a bypass
- Acceptance: every browser failure mode has copy and a route out
- Verify (local): `grep -ciE 'unreachable' studio/src/components/browser-pane.tsx` → `>= 1`
- Dependencies: Task 82

**Task 84 — Add Open externally without starting a server** `S`
- File: `studio/src/components/browser-pane.tsx`
- Reuse: `tauri_plugin_opener`, already a dependency
- Code sample: `Open externally` hands the current URL to the system browser. It never starts a dev server and never retries on a schedule.
- Do not touch: the user's default browser choice
- Edge cases: an empty or invalid URL disables the action rather than opening a blank window
- Acceptance: the user can always escape to a real browser
- Verify (local): `grep -c -F 'Open externally' studio/src/components/browser-pane.tsx` → `== 1`
- Dependencies: Task 82

**Task 85 — Define webview lifecycle, bounds and storage scope** `M`
- File: `studio/src-tauri/src/browser.rs`
- Reuse: the `0x0` guard reasoning from `terminal-pane.tsx:60-66` — a hidden surface must not be resized to nothing
- Code sample: create on tab open, resize with the pane, hide without destroying, and destroy on tab close. Storage is scoped to the browsing surface and shared with neither the app nor another project.
- Do not touch: the terminal's resize path
- Edge cases: a hidden browser tab must not be resized to `0x0`; a navigation in one tab must not affect another's history
- Acceptance: browser lifecycle is explicit and its storage is isolated
- Verify (local): `grep -ciE 'bounds|resize' studio/src-tauri/src/browser.rs` → `>= 1`
- Dependencies: Task 80

**Task 86 — Assert an unreachable localhost kills no terminal** `M`
- File: none — a behavioural check
- Reuse: the error states from Task 83
- Code sample: open a browser tab on a dead localhost port with a live terminal beside it, and confirm the terminal keeps running and the URL stays editable
- Do not touch: the dead port — no server is started to make the check pass
- Edge cases: Retry must not spawn anything
- Acceptance: a browser failure is contained to its own tab
- Verify (local): `grep -c -F 'Retry' studio/src/components/browser-pane.tsx` → `>= 1`
- Dependencies: Task 83

**Task 87 — Report the browser integration limit honestly** `S`
- File: `studio/README.md`
- Reuse: the finding from Task 80
- Code sample: one short section stating exactly what the browser tab is in this build — a verified embedded surface, or a controller with an external-window fallback — and what could not be verified in this environment
- Do not touch: any claim about capability that was not tested
- Acceptance: the documentation matches what was built, with no overstatement
- Verify (local): `grep -ciE 'browser' studio/README.md` → `>= 1`
- Dependencies: Task 80, Task 82

**Task 88 — Add devices.rs with prerequisite discovery** `L`
- File: `studio/src-tauri/src/devices.rs` (new file — confirmed absent)
- Reuse: `shell_env::login_shell_path()` for tool discovery; the per-component report shape from Task 26
- Code sample: four independent facts per platform — platform supported, tools present, runtime present, device present — reported separately. `xcrun simctl list` and the Android SDK equivalents are read; nothing is inferred from the presence of an SDK alone.
- Do not touch: anything that downloads a runtime or accepts a licence
- Edge cases: iOS is macOS-only; on an unsupported platform the report says unsupported rather than missing. An Android SDK with no AVD is tools-present and device-missing.
- Acceptance: device readiness is four facts, not one boolean
- Verify (local): `test -f studio/src-tauri/src/devices.rs && grep -ciE 'runtime' studio/src-tauri/src/devices.rs` → `>= 1`
- Dependencies: Task 26

**Task 89 — Add device launch and stop with explicit ownership** `L`
- File: `studio/src-tauri/src/devices.rs`
- Reuse: the launch-handle idea from the decision's device config contract
- Code sample: `launch` records an ownership handle tying the device to the tab that started it; `stop` acts only on an owned handle. A simulator the user started outside the app is listed but never owned, so `stop` refuses it.
- Do not touch: any wipe, reset, erase or reinstall path — none is implemented
- Edge cases: the app quitting must not stop a device the user wants to keep running; ownership ends without a kill
- Acceptance: the app stops only devices it started, and offers no destructive action
- Verify (local): `grep -ciE 'owned|ownership' studio/src-tauri/src/devices.rs` → `>= 1` and `grep -ciE 'wipe|erase|reset' studio/src-tauri/src/devices.rs` → `== 0`
- Dependencies: Task 88

**Task 90 — Build DevicePane as a control surface** `L`
- File: `studio/src/components/device-pane.tsx` (new file — confirmed absent)
- Reuse: the four-fact report from Task 88
- Code sample: a device selector, a readiness block naming any missing prerequisite with concrete setup steps, and explicit `Launch` / `Open Simulator` / `Open Emulator` and `Stop device` actions. Status comes from the actual process or tool.
- Do not touch: nothing boots or downloads because a tab was opened
- Edge cases: a missing prerequisite shows the setup step, never an indefinite loading state
- Acceptance: a device tab is an honest control surface with real status
- Verify (local): `test -f studio/src/components/device-pane.tsx && grep -c -F 'Stop device' studio/src/components/device-pane.tsx` → `== 1`
- Dependencies: Task 88, Task 89

**Task 91 — Label the external-window fallback** `M`
- File: `studio/src/components/device-pane.tsx`
- Reuse: the finding from Task 89 about whether embedding is possible at all
- Code sample: when no verified embedding exists, the pane shows `Opens in a separate window` beside `Open Simulator` or `Open Emulator`. No phone-shaped frame, no static screenshot, nothing that reads as a live viewport.
- Do not touch: the mockup's device imagery — it is a design concept, not a capability claim
- Edge cases: if embedding is later verified, `Open in separate window` must remain available alongside it
- Acceptance: the UI never implies an embedded device it does not have
- Verify (local): `grep -c -F 'Opens in a separate window' studio/src/components/device-pane.tsx` → `== 1`
- Dependencies: Task 90

**Task 92 — Distinguish the four device row states** `M`
- File: `studio/src/components/choose-tools.tsx`
- Reuse: the four facts from Task 88
- Code sample: each device row renders exactly one of not enabled, dependency missing, device or runtime missing, or available — each with its own copy and action
- Do not touch: the default-off state for iOS and Android
- Edge cases: `available` must require a real device or runtime, not just the tools
- Acceptance: the four states are visually and textually distinct
- Verify (local): `grep -ciE 'dependency missing' studio/src/components/choose-tools.tsx` → `>= 1`
- Dependencies: Task 40, Task 88

**Task 93 — Separate close-tab from stop-device** `S`
- File: `studio/src/components/device-pane.tsx`
- Reuse: the tab close path from Task 62
- Code sample: closing the tab leaves a running device running; `Stop device` stops it. The two actions are separate controls with separate copy.
- Do not touch: the browser equivalent, where closing a tab also must not kill a shell
- Edge cases: closing a tab whose device is owned and running must say what happens to the device
- Acceptance: two actions, two clearly stated consequences
- Verify (local): `grep -c -F 'Stop device' studio/src/components/device-pane.tsx` → `== 1`
- Dependencies: Task 90

**Task 94 — Assert opening a device tab boots and downloads nothing** `M`
- File: none — a behavioural check
- Reuse: the launch path from Task 89
- Code sample: open an iOS and an Android tab and confirm no simulator boots, no runtime is fetched, and no licence prompt appears
- Do not touch: any installed SDK
- Edge cases: discovery legitimately runs a read-only list command; that is not a boot
- Acceptance: a device tab is inert until the user launches something
- Verify (local): `grep -ciE 'boot' studio/src-tauri/src/devices.rs` → `>= 1` with every occurrence inside an explicit launch path
- Dependencies: Task 89, Task 90

**Task 95 — Module boundary: build and cargo check after browser and devices** `S`
- File: none
- Reuse: both check commands
- Code sample: `cd studio && npm run build`; `cd studio/src-tauri && cargo check --quiet`
- Acceptance: both optional surfaces compile
- Verify (local): none — this task's whole deliverable IS the global invariant below, so a local check would be the same command run twice. Permitted by the plan's "a task whose only honest proof is a compile may carry a global verify" rule.
- Verify (global): `cd studio && npm run build` → exit 0; `cd studio/src-tauri && cargo check --quiet` → exit 0
- Dependencies: Task 86, Task 93

**Task 96 — Define connection types with per-consumer status** `M`
- File: `studio/src/lib/types.ts`
- Anchor: `export interface GitInfo {` → `studio/src/lib/types.ts:68`
- Reuse: the documented-union style used throughout the file
- Code sample:
  ```ts
  export type ConnectionStatus =
    | 'notConfigured' | 'configured' | 'checking' | 'connected'
    | 'needsAuthentication' | 'failed' | 'disabled' | 'unsupportedByAgent';

  export type Consumer = 'effi' | 'claude' | 'codex';

  export interface Connection {
    id: string;
    connector: 'jira' | 'customMcp' | 'github' | 'figma';
    /** Planned connectors have no adapter and offer no Configure action. */
    planned: boolean;
    scope: { global: boolean; projectIds: string[] };
    /** Per consumer, from that adapter's own check. Connected to Effi says
     *  nothing about Codex. */
    consumers: Record<Consumer, ConnectionStatus>;
  }
  ```
- Do not touch: the setup and diagnostics types above
- Edge cases: `consumers` is a record rather than a boolean so one connected consumer can never imply another
- Acceptance: connection state is per consumer and per project, with eight distinct statuses
- Verify (local): `grep -c -F "'unsupportedByAgent'" studio/src/lib/types.ts` → `== 1`
- Dependencies: Task 36

**Task 97 — Add connections.rs with scope and bindings** `L`
- File: `studio/src-tauri/src/connections.rs` (new file — confirmed absent)
- Reuse: `projects::load()` / `save()` for non-secret config, under `#[serde(default)]`
- Code sample: a connector type, its scope (global account plus project bindings), a reference to its credential rather than the credential itself, its enabled consumers, and its last validated health. The flow is choose connector → configure → inspect scope → explicit connect → check → bind consumers.
- Do not touch: credentials — only a reference is stored here, with the secret in the keychain per Task 98
- Edge cases: a connection used by another project must never be silently deleted
- Acceptance: connections persist with scope and bindings and no secret in plain config
- Verify (local): `test -f studio/src-tauri/src/connections.rs && grep -ciE 'token|secret' studio/src-tauri/src/connections.rs` → every occurrence is a reference or a keychain call, never a stored value
- Dependencies: Task 96

**Task 98 — Store secrets in the OS keychain** `L`
- File: `studio/src-tauri/src/connections.rs`
- Reuse: the macOS keychain via a maintained crate whose current API is checked before use
- Code sample: store, read and delete a secret by a stable account key. No secret reaches `studio.json`, a log, a fixture, a screenshot, a raw config preview, or the repository.
- Do not touch: `projects::save()`'s pretty-printed JSON — it must never receive a secret to print. `projects.rs` currently contains no `password` or `token` string (baseline 0) and must stay that way, but since that already holds it is a constraint rather than this task's evidence.
- Edge cases: a keychain denial is a reportable error with recovery, not a silent fallback to plaintext
- ⚠️ Breaking change: a new dependency is added; its version must be pinned and its API verified against current documentation
- Acceptance: a credential round-trips through the OS keychain, and no credential is recoverable from any file this app writes
- Verify (local): `grep -rciE 'keychain|keyring' studio/src-tauri/src/connections.rs` → `>= 1` (baseline: 0 files matched anywhere under `src-tauri/src/`) and `grep -rciE 'password|token' studio/src-tauri/src/projects.rs` → `== 0` as an unchanged-constraint check
- Dependencies: Task 97

**Task 99 — Add the custom MCP config form backend** `L`
- File: `studio/src-tauri/src/connections.rs`
- Reuse: the structured-input principle from the Design Contract
- Code sample: a schema for the fields a custom MCP server actually needs, validated on submit. Opening the form runs nothing. Transport and auth options come from current official MCP documentation, checked at implementation time, never guessed.
- Do not touch: arbitrary shell execution — a form field is data, not a command
- Edge cases: an invalid config must be rejected without damaging an existing valid one
- Acceptance: a custom MCP server can be configured from structured input with nothing executed on form open
- Verify (local): `grep -ciE 'transport' studio/src-tauri/src/connections.rs` → `>= 1`
- Dependencies: Task 97

**Task 100 — Add the Jira connector on a verified path** `L`
- File: `studio/src-tauri/src/connections.rs`
- Reuse: the connection flow from Task 97
- Code sample: decide from current official documentation whether this build reaches Jira through its REST API or a validated MCP adapter, implement exactly that one, and scope it read-only to start. Authentication uses only a method the implementation actually supports — no OAuth promise without an OAuth client.
- Do not touch: any write path — no ticket creation, comment, or status change
- Edge cases: the chosen path must be named in the UI; the code must not imply every Jira connector is MCP
- Acceptance: Jira read-only context works over one documented path, with no write capability
- Verify (local): `grep -ciE 'create_issue|add_comment|transition' studio/src-tauri/src/connections.rs` → `== 0`
- Dependencies: Task 97, Task 98

**Task 101 — Build ConnectionsPage** `L`
- File: `studio/src/components/connections-page.tsx` (new file — confirmed absent)
- Reuse: `Connection` from Task 96; `PanelSection` for grouping
- Code sample: a list of connectors showing target project, account or server, transport, and status. Each row leads through configure → inspect scope → explicit connect → check.
- Do not touch: onboarding — Connections is skippable and is never a setup prerequisite
- Edge cases: credentials appear nowhere on this page, including in an error message
- Acceptance: a user can configure and check a connection with its scope visible throughout
- Verify (local): `test -f studio/src/components/connections-page.tsx && grep -c -F 'ConnectionStatus' studio/src/components/connections-page.tsx` → `>= 1`
- Dependencies: Task 96, Task 97

**Task 102 — Build the consumer availability matrix** `M`
- File: `studio/src/components/connections-page.tsx`
- Reuse: the `consumers` record from Task 96
- Code sample: a small matrix of Effi, Claude Code and Codex against the eight statuses, each cell from that adapter's own check. `Connected to Effi` and `Available to Codex` are rendered as separate facts.
- Do not touch: the status union — no cell may show a status outside it
- Edge cases: a consumer with no adapter shows `unsupportedByAgent`, which is distinct from `failed`
- Acceptance: the matrix makes per-consumer availability unmistakable
- Verify (local): `grep -c -F 'Codex' studio/src/components/connections-page.tsx` → `>= 1`
- Dependencies: Task 101

**Task 103 — Mark GitHub and Figma as Planned** `S`
- File: `studio/src/components/connections-page.tsx`
- Reuse: the `planned` flag from Task 96
- Code sample: GitHub and Figma render as catalogue entries labelled `Planned` with no Configure action, because no adapter exists
- Do not touch: the Jira and custom MCP rows, which are real
- Edge cases: a mockup card is not an adapter; the label follows the code, not the image
- Acceptance: no connector offers an action it cannot perform
- Verify (local): `grep -c -F 'Planned' studio/src/components/connections-page.tsx` → `>= 1`
- Dependencies: Task 101

**Task 104 — Preview every provider-config write before Apply** `M`
- File: `studio/src/components/connections-page.tsx`
- Reuse: the effects-preview pattern from Task 42
- Code sample: applying a connection to an agent shows the destination file, the scope, and the exact change, behind an explicit Apply. Existing user config and any secret store are preserved; nothing is copied from one provider's config to another without a separate action.
- Do not touch: a provider's unrelated configuration keys
- Edge cases: a provider whose config schema was not verified must not be written at all
- Acceptance: no provider config changes without a shown diff and an explicit Apply
- Verify (local): `grep -c -F 'Apply' studio/src/components/connections-page.tsx` → `>= 1`
- Dependencies: Task 102

**Task 105 — Separate disconnect-binding from revoke-credential** `M`
- File: `studio/src/components/connections-page.tsx`
- Reuse: the scope model from Task 97
- Code sample: two distinct actions with distinct copy — disconnecting this project's binding, and revoking the global credential. Each names its consequence, and neither silently affects another project.
- Do not touch: a connection another project uses
- Edge cases: revoking a credential two projects share must say so before it proceeds
- Acceptance: the two destructive scopes are never conflated
- Verify (local): `grep -ciE 'revoke' studio/src/components/connections-page.tsx` → `>= 1`
- Dependencies: Task 101

**Task 106 — Assert one consumer's config does not connect the others** `M`
- File: none — a behavioural check
- Reuse: the matrix from Task 102
- Code sample: configure a custom MCP for Effi only and confirm Claude Code and Codex still read not configured; then submit an invalid config and confirm the valid one is unchanged
- Do not touch: a real credential — use a throwaway for the check
- Edge cases: an invalid submission must leave the stored config byte-identical
- Acceptance: consumer status is independent and an invalid config is non-destructive
- Verify (local): `grep -c -F 'consumers' studio/src/lib/types.ts` → `>= 1`
- Dependencies: Task 102, Task 104

**Task 107 — Module boundary: build and cargo check after Connections** `S`
- File: none
- Reuse: both check commands
- Code sample: `cd studio && npm run build`; `cd studio/src-tauri && cargo check --quiet`
- Acceptance: Connections compiles on both sides
- Verify (local): none — this task's whole deliverable IS the global invariant below, so a local check would be the same command run twice. Permitted by the plan's "a task whose only honest proof is a compile may carry a global verify" rule.
- Verify (global): `cd studio && npm run build` → exit 0; `cd studio/src-tauri && cargo check --quiet` → exit 0
- Dependencies: Task 105, Task 106

**Task 108 — Build the Settings page with six sections** `L`
- File: `studio/src/components/settings-page.tsx` (new file — confirmed absent)
- Reuse: `PanelSection`; `DiagnosticsPanel` from Task 31; `ConnectionsPage` from Task 101
- Code sample: Experiences (with Verify shown Coming soon and its checkbox disabled), Agents, Tools, Connections, Appearance and Diagnostics — each a section, not a separate window
- Do not touch: live sessions — opening Settings must not unmount a pane, which Task 63 guarantees
- Edge cases: the Experiences section must use the same availability model as onboarding, not a second copy
- Acceptance: all six sections exist and Verify is disabled in both places for the same reason
- Verify (local): `test -f studio/src/components/settings-page.tsx && grep -c -F 'Diagnostics' studio/src/components/settings-page.tsx` → `>= 1`
- Dependencies: Task 31, Task 101

**Task 109 — Point the Connections sidebar entry at the same destination** `S`
- File: `studio/src/App.tsx`
- Anchor: `export default function App() {` → `studio/src/App.tsx:30`
- Reuse: `ConnectionsPage` from Task 101 — one component, two entry points
- Code sample: the sidebar's Connections entry and Settings → Connections render the same component with the same state. No duplicate configuration surface.
- Do not touch: the Settings sections around it
- Edge cases: both entries must reflect the same unsaved state
- Acceptance: there is exactly one Connections surface
- Verify (local): `grep -c -F 'ConnectionsPage' studio/src/App.tsx` → `>= 1`
- Dependencies: Task 101, Task 108

**Task 110 — Add the responsive breakpoint behaviour** `L`
- File: `studio/src/App.tsx`
- Anchor: `<aside className="flex w-80 shrink-0 flex-col border-l border-border">` → `studio/src/App.tsx:377`
- Reuse: the existing collapse mechanism in `PanelState`, which already persists sidebar and section state
- Code sample: 220/300 panels at ≥1360px; 208/280 at 1100–1359; inspector as a drawer with a 192px sidebar at 900–1099; both as drawers below 900 with only one overlay active at a time. The main area stays flexible throughout.
- Do not touch: the persisted collapse preferences — a width-driven drawer must not overwrite what the user chose
- Edge cases: only one overlay may be open below 900px; opening a second must close the first
- Acceptance: all four bands are reachable and the terminal stays usable at each
- Verify (local): `grep -ciE 'min-\[900px\]|900px' studio/src/App.tsx` → `>= 1`
- Dependencies: Task 67

**Task 111 — Hide the installer editorial column at compact width** `S`
- File: `studio/src/components/choose-experiences.tsx`
- Reuse: the same breakpoints as Task 110
- Code sample: hide the editorial column below the compact threshold and give the controls the full width
- Do not touch: the controls themselves — they stay reachable at every width
- Edge cases: hiding the column must not reflow the CTAs off-screen
- Acceptance: at 800×650 the setup controls are fully reachable
- Verify (local): `grep -ciE 'hidden' studio/src/components/choose-experiences.tsx` → `>= 1`
- Dependencies: Task 21, Task 110

**Task 112 — Make the tab strip overflow in one row** `M`
- File: `studio/src/components/tab-strip.tsx`
- Reuse: the horizontal scroll approach, not the wrapping approach
- Code sample: `overflow-x-auto` with `flex-nowrap`, keeping the row at 38–40px regardless of tab count, and the overflow reachable by keyboard
- Do not touch: the flow bar's deliberate wrap at `flow-bar.tsx:24-26`, which exists because six command names need more than one row at 1180px — that is a different row with a different, documented decision
- Edge cases: twelve tabs must not become a two-line stack; the active tab must scroll into view when selected by keyboard
- Acceptance: the tab strip stays one row at every target width
- Verify (local): `grep -c -F 'flex-nowrap' studio/src/components/tab-strip.tsx` → `>= 1`
- Dependencies: Task 59

**Task 113 — Keep Cmd+1…9, B, J, K and add tab keyboard navigation** `M`
- File: `studio/src/lib/use-shortcuts.ts`
- Anchor: `if (e.key === 'k' || e.key === 'K') {` → `studio/src/lib/use-shortcuts.ts:68`
- Reuse: the whole existing listener, including the ref pattern explained at lines 25-29 and the xterm-sink exemption at lines 45-51
- Code sample: keep all four existing bindings with identical meaning — Cmd+K stays the workflow toggle and does not become a command palette — and extend the `Shortcuts` interface with `onTabNext`, `onTabPrev` and `onTabClose`, dispatched from the same single window listener
- Do not touch: the `xterm-helper-textarea` exemption (baseline **2** occurrences — the comment at line 46 and the code at line 49); removing it makes every binding dead whenever the terminal has focus, which is its normal state. The `e.metaKey` requirement (baseline 1) also stays, since it is what lets a focused terminal and this listener coexist. Both already hold, so neither is this task's evidence — and the earlier draft's `== 1` threshold on the exemption was simply wrong.
- Edge cases: Cmd+1…9 still indexes the configured project list, not the visible tree rows, for the reason at `App.tsx:274-276`. A new tab binding must not collide with Cmd+1…9, B, J or K.
- Acceptance: no existing shortcut changes meaning, tabs are navigable and closable from the keyboard, and typing in a focused terminal is unaffected
- Verify (local): `grep -c -F 'onTabNext' studio/src/lib/use-shortcuts.ts` → `>= 1` (baseline 0) and `grep -c -F 'xterm-helper-textarea' studio/src/lib/use-shortcuts.ts` → `== 2` as an unchanged-constraint check
- Dependencies: Task 59

**Task 114 — Add Escape close with focus return** `M`
- File: `studio/src/components/add-tool-menu.tsx`
- Reuse: one shared hook for Escape plus focus return, used by every popover and drawer rather than per-component handling
- Code sample: Escape closes the topmost overlay and returns focus to the element that opened it
- Do not touch: terminal key handling — Escape inside a focused terminal belongs to the PTY
- Edge cases: with a drawer and a popover both open, Escape closes only the topmost
- Acceptance: every overlay closes with Escape and returns focus
- Verify (local): `grep -c -F "'Escape'" studio/src/components/add-tool-menu.tsx` → `>= 1`
- Dependencies: Task 60

**Task 115 — Add aria-selected tabs, labels and a visible focus ring** `M`
- File: `studio/src/components/tab-strip.tsx`
- Reuse: native `<button>` semantics rather than clickable divs
- Code sample: `role="tab"` with `aria-selected`, a label or tooltip on every icon-only control, arrow-key navigation along the strip, and a visible focus ring on every focusable element. Icon targets are at least 32px.
- Do not touch: terminal output — nothing is announced via `aria-live`, byte by byte or otherwise
- Edge cases: a close control inside a tab needs its own accessible name distinct from the tab's
- Acceptance: the strip is fully keyboard and screen-reader navigable with no live-region spam
- Verify (local): `grep -c -F 'aria-selected' studio/src/components/tab-strip.tsx` → `>= 1` and `grep -c -F 'aria-live' studio/src/components/tab-strip.tsx` → `== 0`
- Dependencies: Task 59

**Task 116 — Add a repo guard for terminal input and live-region discipline** `S`
- File: `tests/test_studio_a11y.py` (new file — confirmed absent)
- Reuse: `tests/conftest.py` and the assertion style already used across the seven test modules
- Code sample: the two invariants in this area already hold today, so asserting them by hand proves nothing — this task turns them into a test that fails if a later cycle breaks them:
  ```python
  def test_no_aria_live_regions():
      """Terminal bytes must never be announced. A regression here makes the
      app unusable with a screen reader rather than merely noisy."""
      hits = [p for p in COMPONENTS.glob("*.tsx") if "aria-live" in p.read_text()]
      assert hits == [], f"aria-live added in {hits}"

  def test_shortcuts_still_require_meta():
      src = (SRC / "lib" / "use-shortcuts.ts").read_text()
      assert "e.metaKey" in src
      assert "xterm-helper-textarea" in src
  ```
- Do not touch: the `onData` → `ptyWrite` path at `terminal-pane.tsx:56`, and the Cmd-only requirement in `use-shortcuts.ts` — this task asserts them, it does not change them
- Edge cases: the test must pass with no Studio build present, since it reads source rather than running the app; a newly added overlay must not capture keys while the terminal has focus
- Acceptance: typing in the terminal reaches the PTY unchanged, nothing announces terminal bytes, and a future regression in either is caught by the suite rather than by a user
- Verify (local): `test -f tests/test_studio_a11y.py && python3 -m pytest -q tests/test_studio_a11y.py` → exit 0 (baseline: file absent)
- Dependencies: Task 113, Task 115

**Task 117 — Add 120–160ms motion honouring reduced motion** `S`
- File: `studio/src/styles.css`
- Anchor: `@theme {` → `studio/src/styles.css:8`
- Reuse: the stylesheet as the single place transitions are defined
- Code sample: a duration token in the 120–160ms range, applied to drawers and popovers, wrapped in `@media (prefers-reduced-motion: reduce)` to disable transitions
- Do not touch: anything that would introduce a task-running pulse or an autoscroll that takes the user's reading position
- Edge cases: no animation may imply activity that is not observable
- Acceptance: motion is brief, purposeful, and disabled on request
- Verify (local): `grep -c -F 'prefers-reduced-motion' studio/src/styles.css` → `== 1`
- Dependencies: Task 2

**Task 118 — Assert compact layout and keyboard at the four target sizes** `M`
- File: none — a behavioural check
- Reuse: the breakpoints from Task 110
- Code sample: resize to 1440×900, 1180×760, 980×700 and 800×650 and confirm at each that controls are reachable, the terminal is generous, the tab strip stays one row, and every shortcut works
- Do not touch: the persisted panel preferences
- Edge cases: at 800×650 only one overlay may be open at a time
- Acceptance: all four sizes are usable with no clipped or unreachable control
- Verify (local): `grep -ciE '980|800' studio/src/App.tsx` → `>= 1`
- Dependencies: Task 110, Task 112, Task 113

**Task 119 — Add migrate.rs that reads an older studio.json unchanged** `L`
- File: `studio/src-tauri/src/migrate.rs` (new file — confirmed absent)
- Reuse: `projects::load()`'s degrade-to-default behaviour at `projects.rs:81` and every `#[serde(default)]` added by Tasks 15, 50 and 97
- Code sample: load a studio.json containing only `projects`, `claude_override` and `panels`, confirm every new field defaults, and save it back without dropping anything. Unknown fields from a newer build are preserved rather than discarded.
- Do not touch: `config_path()` — the file stays at `~/.efficlaude/studio.json`, because moving it is what loses a user's projects
- Edge cases: project order and the Claude override path must survive a load-and-save round trip byte-for-byte in their values
- ⚠️ Breaking change: this is the task that prevents one; without it the new fields silently reset an existing user's configuration
- Acceptance: an existing user upgrades with projects, order, preferences, override and history intact
- Verify (local): `test -f studio/src-tauri/src/migrate.rs && grep -c -F 'studio.json' studio/src-tauri/src/migrate.rs` → `>= 1`
- Dependencies: Task 15, Task 50, Task 97

**Task 120 — Backfill one legacy terminal to one Claude tab** `M`
- File: `studio/src-tauri/src/migrate.rs`
- Reuse: the tab model from Task 50
- Code sample: for each project in an older config with no tabs, create exactly one Claude agent tab with no session id. One tab, never two, and no PTY is spawned by the migration.
- Do not touch: the session registry — migration writes metadata only
- Edge cases: running the migration twice must not produce a second tab; it is idempotent on the presence of any tab for that project
- Acceptance: an upgrading user sees their familiar single terminal as one tab, with nothing started until they act
- Verify (local): `grep -ciE 'idempotent|already' studio/src-tauri/src/migrate.rs` → `>= 1`
- Dependencies: Task 50, Task 119

**Task 121 — Keep the bundle identifier until a migration exists** `S`
- File: `studio/src-tauri/tauri.conf.json`
- Anchor: `"identifier": "id.kaeltech.efficlaude.studio"` → `studio/src-tauri/tauri.conf.json:5`
- Reuse: nothing — this task is a deliberate non-change, recorded so it is not quietly done later
- Code sample: leave the identifier exactly as it is, and write the reason down in `studio/README.md` so it is a recorded decision rather than an oversight a later cycle "fixes":
  ```markdown
  ### Why the bundle identifier is still `id.kaeltech.efficlaude.studio`

  The display name is now Effi Studio, but the bundle identifier is unchanged.
  Changing it moves the app's state location and its macOS permission grants,
  so it needs a migration of its own before it can move.
  ```
- Do not touch: the identifier string itself. Its presence (baseline 1) already holds and is a constraint, not this task's evidence — the deliverable here is the written reason.
- Edge cases: `productName` changing while the identifier stays is correct and intended — the display name and the state key are different things
- Acceptance: the identifier is unchanged and a reader can find out why without reading this plan
- Verify (local): `grep -c -F 'bundle identifier' studio/README.md` → `>= 1` (baseline 0) and `grep -c -F 'id.kaeltech.efficlaude.studio' studio/src-tauri/tauri.conf.json` → `== 1` as an unchanged-constraint check
- Dependencies: Task 8, Task 12

**Task 122 — Add a repo guard against invented command names** `S`
- File: `tests/test_command_docs.py`
- Anchor: `COMMANDS_DIR = os.path.join(os.path.dirname(__file__), '..', 'commands')` → `tests/test_command_docs.py:5`
- Reuse: the existing fixtures and the 94 assertions already in this module
- Code sample: the invariant already holds (baseline: 0 files match `effi-plan`), so asserting it by hand proves nothing — this task makes the suite enforce it:
  ```python
  def test_no_invented_effi_commands():
      """The rebrand renames the display surface, not the commands. An
      /effi-* name would break every existing user's muscle memory and
      every doc that names /ec-*."""
      bad = re.compile(r"/effi-[a-z]+")
      for p in (REPO / "commands").glob("*.md"):
          assert not bad.search(p.read_text()), f"invented command in {p.name}"
  ```
- Do not touch: `~/.efficlaude`, `.claude`, the `/ec-*` command names, the sentinel files, and the registry keys — this task asserts they are unrenamed, it does not change them. The 94 existing assertions stay.
- Edge cases: the legacy names legitimately appear in real log output and in internal paths; the guard targets invented `/effi-*` command names only, not the `.efficlaude` directory
- Acceptance: a future cycle that invents an `/effi-*` command name fails the suite instead of shipping
- Verify (local): `grep -c -F 'def test_no_invented' tests/test_command_docs.py` → `== 1` (baseline 0) and `python3 -m pytest -q tests/test_command_docs.py` → exit 0 with more than 94 tests collected (baseline `94 passed`)
- Dependencies: none

**Task 123 — Add an integration test for session isolation** `M`
- File: `studio/src-tauri/src/tabs.rs`
- Reuse: Rust's built-in `#[cfg(test)]` module convention
- Code sample: a test that opens two sessions for one project id, asserts the session ids differ, writes a distinct marker to each, and asserts each registry entry received only its own
- Do not touch: the production code paths — the test exercises them, it does not add hooks for itself
- Edge cases: the test must not spawn a real provider CLI; use `/bin/cat` or an equivalent as the program
- Acceptance: a regression that crosses two sessions' IO fails this test
- Verify (local): `cd studio/src-tauri && cargo test --quiet tabs` → exit 0
- Dependencies: Task 51, Task 65

**Task 124 — Add an integration test for the modular install plan** `M`
- File: `studio/src-tauri/src/setup.rs`
- Reuse: the same `#[cfg(test)]` convention
- Code sample: assert that a Browser-only selection produces a plan with no hooks item, that a Codex-only selection produces no worker or pydeps item, and that no selection ever yields a Verify item
- Do not touch: the real filesystem — the test asserts the plan, it does not run it
- Edge cases: an empty selection must produce an empty plan, not a default-everything plan
- Acceptance: a regression that reintroduces install-all behind a checkbox fails this test
- Verify (local): `cd studio/src-tauri && cargo test --quiet setup` → exit 0
- Dependencies: Task 37, Task 46, Task 47

**Task 125 — Add a regression test for preserved registry and prefs** `M`
- File: `studio/src-tauri/src/migrate.rs`
- Reuse: the same `#[cfg(test)]` convention
- Code sample: embed a studio.json in the old three-field shape, load it, save it, reload it, and assert the project list, its order, the panel preferences and the Claude override are all unchanged
- Do not touch: the user's real `~/.efficlaude/studio.json` — the test uses a temporary path
- Edge cases: a config with a project whose folder no longer exists must still round-trip
- Acceptance: a regression that resets an upgrading user's configuration fails this test
- Verify (local): `cd studio/src-tauri && cargo test --quiet migrate` → exit 0
- Dependencies: Task 119

**Task 126 — Assert install.sh and the commands directory still agree** `M`
- File: `tests/test_command_docs.py`
- Anchor: `COMMANDS_DIR = os.path.join(os.path.dirname(__file__), '..', 'commands')` → `tests/test_command_docs.py:5`
- Reuse: the existing fixtures and `tests/conftest.py`; the `COMMANDS` array at `install.sh:14` as the source of truth, exactly as `doctor.rs:11` already treats it
- Code sample: Task 38 makes each installer step individually selectable, which is precisely the change that could let the installed set drift from the documented set:
  ```python
  def test_install_sh_commands_match_commands_dir():
      """doctor.rs:11 copies this list from install.sh:14 on purpose — a list
      that drifts calls a complete install incomplete. Component flags make
      drift newly possible, so it is asserted here."""
      declared = parse_bash_array(INSTALL_SH, "COMMANDS")
      documented = {p.stem for p in (REPO / "commands").glob("ec-*.md")}
      assert set(declared) == documented
  ```
- Do not touch: the 94 assertions already in this module, and the `/effi-*` guard Task 122 adds beside it
- Edge cases: the suite must keep passing with no Studio build present — it reads documents and the shell script, never the app. A command legitimately retired must be removed from both sides, and the test is what forces that.
- Acceptance: adding a command to `install.sh` without documenting it, or vice versa, fails the suite
- Verify (local): `grep -c -F 'def test_install_sh_commands_match_commands_dir' tests/test_command_docs.py` → `== 1` (baseline 0)
- Verify (global): `python3 -m pytest -q` → exit 0 with more than 152 tests (baseline `152 passed`)
- Dependencies: Task 38

**Task 127 — Capture screenshots at the four target sizes** `M`
- File: `studio/.screenshots/` (new directory — confirmed absent), plus a `.screenshots/` line in `studio/.gitignore`
- Reuse: the running app; the existing `studio/.gitignore`
- Code sample: launch the app and capture eight surfaces — experience selector, Choose tools, setup states, workbench, browser tab, device tab, Connections, Verify landing — at each of 1440×900, 1180×760, 980×700 and 800×650, named `{surface}@{width}x{height}.png`. The directory is gitignored: screenshots are verification evidence, not repository content.
- Do not touch: real credentials, real Jira data, and any large SDK download — sample data only, and no production installer run for the sake of a screenshot
- Edge cases: a screenshot must never contain a token or an account identifier. A surface that could not be reached in this environment is recorded as missing in Task 129 rather than faked.
- Acceptance: every reachable target surface is captured at all four sizes with sample data, and nothing captured is committed
- Verify (local): `find studio/.screenshots -name '*.png' 2>/dev/null | wc -l` → `>= 8` (baseline: directory absent; `find` rather than a glob, because a non-matching glob is an error under zsh, which is this machine's shell) and `grep -c -F '.screenshots' studio/.gitignore` → `>= 1` (baseline 0)
- Dependencies: Task 110, Task 118

**Task 128 — Compare each screenshot against its mockup** `M`
- File: `studio/VERIFICATION.md` (new file — confirmed absent)
- Reuse: the nine mockups under `design/effi-studio-v2/mockups/`; the captures from Task 127
- Code sample: one section per mockup, each naming its mockup path and comparing hierarchy, spacing, terminal room, labels, availability treatment and copper restraint, with every deliberate deviation and its reason:
  ```markdown
  ## mockups/03-build-workbench.png
  - Hierarchy: matches — tab strip above body, inspector right.
  - Spacing: tab strip 40px vs mockup ~38px — within the contract's 38–40 range.
  - Deviation: mockup shows a device viewport in-tab; shipped build is a
    controller plus external window (see Task 91). Deliberate, per the contract.
  ```
- Do not touch: the mockups, and `design/effi-studio-v2/` generally — it is read-only input
- Edge cases: the mockups' sample data, terminal output, diagnostic results and raster material gradients are concepts; a difference there is not a defect and the comparison must say so explicitly rather than listing it as a gap
- Acceptance: every one of the nine mockups has a written comparison, and each deviation is justified rather than omitted
- Verify (local): `test -f studio/VERIFICATION.md && grep -c -F 'mockups/' studio/VERIFICATION.md` → `>= 9` (baseline: file absent)
- Dependencies: Task 127

**Task 129 — Write the implemented, verified, unavailable and deferred report** `M`
- File: `studio/README.md`
- Reuse: the findings from Tasks 80, 87, 89, 91, 94, 100 and 128
- Code sample: four explicit lists — implemented, verified, unavailable in this environment, deferred. No feature is listed as implemented because a menu, form or mockup exists. If the device path is a controller plus an external window, it says exactly that and does not say embedded simulator.
- Do not touch: any claim not backed by a check that actually ran
- Edge cases: a feature that is implemented but unverifiable here belongs in two lists, and saying so is the point
- Acceptance: a reader can tell exactly what works, what was proven, what could not be tested, and what was left
- Verify (local): `grep -ciE 'unavailable in this environment' studio/README.md` → `>= 1`
- Dependencies: Task 87, Task 128

**Task 130 — Final global gate: build, cargo check and pytest** `S`
- File: none
- Reuse: all three baselines
- Code sample: `cd studio && npm run build`; `cd studio/src-tauri && cargo check --quiet && cargo test --quiet`; `python3 -m pytest -q`
- Acceptance: every check is at or above its recorded baseline, with no new failure
- Verify (local): none — this task's whole deliverable IS the global invariant below, so a local check would be the same command run twice. Permitted by the plan's "a task whose only honest proof is a compile may carry a global verify" rule.
- Verify (global): `cd studio && npm run build` → exit 0; `cd studio/src-tauri && cargo check --quiet` → exit 0; `cd studio/src-tauri && cargo test --quiet` → exit 0; `python3 -m pytest -q` → `152 passed` or more
- Dependencies: Task 123, Task 124, Task 125, Task 126, Task 129
