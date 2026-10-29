# Decision: Effi Studio v2 — implement the approved Build experience

## Problem
`design/effi-studio-v2/` is a complete, approved design handoff (5 documents, 2 brand boards, 9 mockups) that evolves EffiClaude Studio into **Effi Studio** — one application carrying two experiences, **Build** (available now) and **Verify** (Coming soon only). The shipped Studio cannot express that product: it hard-gates the entire shell behind a global Claude doctor check, runs one terminal per project with no tab or session identity, dispatches `/ec-*` to a single untargeted PTY, and sits on a monolithic `install.sh` that installs commands + agents + worker + Python deps + hooks + optimizer as one block. There is no experience model, no provider adapter, no browser, no device tooling, and no Connections surface. The package must become planned, executed work against the real seams in the repository — not a restyle, and not a UI shell over absent backends.

## Evidence
- `studio/src/App.tsx:307` — `if ((doctorBlocking(doctor) && !dismissedDoctor) || !program)` gates the whole shell; a machine without Claude never reaches a workspace.
- `studio/src/lib/types.ts:95` — `doctorBlocking` returns true when `!d.claude` or `commandsFound < commandsExpected`, so Claude plus 8 commands is a hard precondition for the app.
- `studio/src/App.tsx:33` — a single `program: string | null` holds one executable for the whole app; there is nowhere to put a second provider.
- `studio/src-tauri/src/pty.rs:84` — `SessionRegistry(Mutex<HashMap<String, PtySession>>)` is the only session store, keyed per project; two agents in one project cannot coexist.
- `studio/src/components/flow-bar.tsx:9` — `onDispatch` is documented as "null disables every step: there is no session to type into" — one target, no provider awareness.
- `studio/src/components/flow-bar.tsx:52` — `onClick={() => onDispatch?.(textFor(s))}` sends `/ec-*` to whatever that single handler points at, with no check that the target is a Claude session.
- `studio/src/lib/flow.ts:30` — `nextStep(state)` derives the stage from the plan file; this is the plan source to keep and label, not to replace with running telemetry.
- `studio/src-tauri/src/doctor.rs:11` — the 8-command list is copied from `install.sh:14` and treated as completeness; diagnostics are global, not per component.
- `install.sh:90`, `install.sh:143`, `install.sh:149` — commands, Python dependencies, and `~/.claude/settings.json` hook registration run unconditionally in one sequence; there is no component selection to honour.
- `design/effi-studio-v2/BUILD-CHANGES.md` §2 — already maps every required change to its source file, so the implementation reads from the package rather than re-deriving the map.
- `design/effi-studio-v2/CLAUDE-IMPLEMENTATION-PROMPT.md` §13 — carries 12 mandatory verification items that become this cycle's Verification Strategy.

## Options Explored

| # | Option | Effort | Reversibility | Risk | Fit | Result |
|---|--------|--------|---------------|------|-----|--------|
| 1 | Paste `CLAUDE-IMPLEMENTATION-PROMPT.md` straight to Claude | 4 | 2 | 2 | 1 | Not chosen |
| 2 | Inline the whole spec into the decision file | 2 | 3 | 2 | 2 | Not chosen |
| 3 | Audit the design package first, implement later | 5 | 5 | 4 | 2 | Not chosen |
| 4 | Decision file as a pointer-style Design Contract, one flat Build cycle | 2 | 3 | 4 | 5 | **CHOSEN** |

Scale 1–5; for Effort and Risk, higher is better (5 = low effort / low risk).

- **Option 1 — Raw prompt handoff**: run the package's own implementation prompt as a standalone session → not chosen because: it bypasses `/ec-refine` and `/ec-review`, leaves no decision file or memory trail, and the prompt's own 12 mandatory checks then have nothing that executes them.
- **Option 2 — Inline the spec**: copy DESIGN-SPEC and BUILD-CHANGES into the decision file → not chosen because: ~50KB duplicated, and the copy drifts from the package that `/ec-plan` and `/ec-execute` can simply read.
- **Option 3 — Audit first**: review the package for internal contradictions before any code → not chosen because: the user confirmed full implementation, the package already states visuals and names are approved, and contradictions surface more cheaply against real code in `/ec-refine`.
- **Option 4 — Pointer contract, one cycle**: CHOSEN

## Chosen Approach
Treat `design/effi-studio-v2/` as the single source of visual and behavioural truth and plan the complete Build scope as one flat `/ec-plan` → `/ec-execute` cycle. The Design Contract below **points at** the package — `DESIGN-SPEC.md` §3 for tokens and type scale, the 9 mockup PNGs for composition, `BUILD-CHANGES.md` §2 for the file-level source map — rather than restating it, so every task reads the authoritative document instead of a lossy paraphrase. `design/precision-atelier/` is archive only and must not be read as current direction.

The work follows the package's own ordering as a dependency chain inside one flat task list, not as separate cycles: design tokens, master SVG logo and icon pipeline, and display rebrand; removal of the global Claude gate in favour of per-component diagnostics; the experience model with Build selectable and Verify a disabled Coming-soon landing; a modular setup backend that genuinely installs only what was selected; stable tab ids and unique session ids decoupled from project id, with real Claude / Codex / custom-CLI sessions; the Workbench and inspector with explicit `Source: Claude plan` labelling and provider-targeted dispatch; the optional browser surface and device control tabs; Connections for Jira and custom MCP with per-consumer status; then packaging, migration, keyboard, compact layout, and regression QA.

Capability honesty is a first-class requirement, not a finishing touch. The spec forbids a working-looking control over an absent backend in more than twenty places, so every optional surface ships either a verified native integration or a labelled fallback — `Opens in a separate window` for a simulator that cannot be embedded, `Planned` for GitHub and Figma where no adapter exists. The final report separates **implemented**, **verified**, **unavailable in this environment**, and **deferred**, and never claims an embedded simulator when what exists is a controller plus an external window.

## Design Contract
- Source: `design/effi-studio-v2/` — `DESIGN-SPEC.md` (product + visual rules), `BUILD-CHANGES.md` (source map), `CLAUDE-IMPLEMENTATION-PROMPT.md` (implementation rules), `brand/01-effi-identity.png`, `brand/02-logomark.png`, and `mockups/01-choose-experiences.png` … `mockups/09-codex-and-add-tool.png`  ·  Viewport: target 1440×900; must stay comfortable at the actual default 1180×760; QA also at 980×700 and 800×650
- Layout: native titlebar with no duplicate HTML traffic lights. Experience selector above the sidebar → Projects registry → Workbench (tab strip 38–40px, one scrolling row, never a wrapped stack) → Inspector (Tasks/History + Project & Git). Panels 220/300 at ≥1360px, 208/280 at 1100–1359, inspector becomes a drawer at 900–1099 with sidebar 192, both become drawers below 900 with a single active overlay. Installer editorial column hides at compact width. Terminal keeps the dominant share of the main area.
- Spacing: 4 / 8 / 12 / 16 / 24 / 32 / 40 grid; radius 8px controls, 12px groups, 10px popovers; borders 1px.
- Typography: system sans (SF Pro / system-ui) + system mono (SF Mono / Menlo). Body 14/21, meta 12/18, section 14/20 semibold, project title 20/28, setup title 28–30/36, editorial 38/44, terminal 13–14px with comfortable line-height.
- Color: ground `#101112`, surface `#17191B`, raised `#1D2023`, hover `#25292D`, border `#30353B`; text `#F3EFE9`, secondary `#A4ABB2`, terminal foreground `#E2E5E8`; copper `#E5A17C`, on-copper `#211710`, tint `#30241E`; success `#9CC5AF`, warning `#E6C182`, error `#EDA6A6`. Copper means selection and primary action; sage means healthy — never interchangeable. Normal-text contrast ≥4.5:1. No purple, neon, large gradients, or generic dashboard chrome.
- Elements: per mockup, in order — experience selector rows (Build Available, Verify Coming soon disabled); project sidebar with git markers, Add project, Remove from Studio; project header with name / path / branch; tab strip with per-tab icon, title, provider or tool label, reachable menu and close, plus a `+` opening Add a tool split into Agent sessions / Workspace tools; tab bodies for agent session, shell terminal, browser (back / forward / reload / address field / page title / open externally), iOS Simulator and Android Emulator control surfaces; workflow row naming `/ec-brainstorm` … `/ec-git` literally with a brainstorm-only argument field; inspector Tasks/History tabs and Project & Git disclosure; Connections list with connector, scope, server, and per-consumer status; Settings with Experiences / Agents / Tools / Connections / Appearance / Diagnostics; onboarding screens for Choose experiences, Choose tools, Review setup, and setup states; Verify Coming-soon landing with three planned teasers. Logo: angular E in an open bracket, two interior bars, square at right; UI mark 16–24px, lockup ≥96–120px, clear space half the symbol height, one squircle app icon for both experiences.
- Copy: `Your tools. Your flow.` · `How will you use Effi?` · `Choose what you need. Add more later.` · `Not available to install yet.` · `Continue with Build` · `Set up later` · `Open Studio` · `Open Build` · `Review setup` · `Make this workspace yours.` · `Set up Build` · `Your next project starts here.` · `Verify, coming soon.` · `A focused space for testing, evidence, and release confidence.` · teasers `Explore flows` / `Capture evidence` / `Track quality` · `Back to Build` / `Back to Studio` / `Manage experiences` · `Workflow shortcuts are not configured for this agent.` · `CLI session` · `Sends /ec-execute to Claude Code` · `Source: Claude plan` · `Opens in a separate window` · `Open Simulator` / `Open Emulator` · `Stop device` · `Close session` · `Set executable path` / `Check again` / `Retry this component` · `No tasks yet` · selection summary of the form `2 existing agents linked · Browser enabled · No device downloads`
- States: component readiness — not selected / detected / queued / installing or setup session open / ready / needs attention / unavailable. Connection — not configured / configured / checking / connected / needs authentication / failed / disabled / unsupported by this agent. Device — not enabled / dependency missing / device or runtime missing / available. Browser — loading / error / unreachable / certificate / download / popup. Plus hover, focus with a visible ring, disabled, selection, long task wrap, branch and path truncation with the full value reachable, detached HEAD, unfinished-task warning, partial install, raw-plan fallback, and empty states for no experience / no project / no agent / no plan / no history. Every status colour also carries a label or icon. Indeterminate progress where no real signal exists — no invented percentages or timers. Motion 120–160ms, honouring reduced motion.
- Deviations allowed: the mockups are AI concepts — their project data, terminal output, diagnostic results, numbers, and raster material gradients are examples, not production content. Solid token values beat the raster. Do not draw a second set of traffic lights, do not show an unread dot on the active project, do not treat a checked box as healthy or `Detected` as authenticated, and do not crop a brand board into the production logo. Responsive adaptation per the breakpoints above is expected.

## Key Assumptions
- The 9 mockups plus the `DESIGN-SPEC.md` §3 token table are sufficient visual authority for the whole cycle — `CLAUDE-IMPLEMENTATION-PROMPT.md` §2 states names and visuals are approved, so execute must not stop to ask for styling decisions already covered.
- `/ec-execute`'s resumable on-disk state carries a plan of this size across context windows, so one flat task list is viable without splitting the cycle.
- Unverified: whether the installed Tauri version exposes a native browsing surface that satisfies §9 and whether any real integration can embed a simulator viewport. Both are resolved by checking official documentation at implementation time, and both have a defined labelled fallback, so neither blocks planning.

## Constraints
- macOS, single binary, existing stack: Tauri + Rust backend, React + TypeScript + Vite frontend, xterm.js terminal. No new OS targets.
- Display rebrand only. `~/.efficlaude`, `.claude`, `/ec-*` commands, sentinels, registry keys, preference keys, and the bundle identifier must not be mass-renamed without a migration that preserves existing users; a new app identifier can move state and permissions, so it is reviewed before any change.
- Existing project registry, project order, panel preferences, Claude override path, history, and watch subscriptions must stay readable. A single legacy terminal backfills to one Claude tab — never two PTYs from one source.
- Tasks and history stay read-only from the plan source. The empty fallback names `/ec-plan`, not `/ec-feature`. Existing git confirmations, unavailable / detached / error / hidden counts stay.
- Keyboard contract preserved: Cmd+1…9 projects, Cmd+B sidebar, Cmd+J inspector, Cmd+K workflow. Cmd+K must not become a new command palette. Terminal keystrokes are never intercepted and terminal bytes are never announced via aria-live.
- Remote browser content gets no privileged app IPC, project files, credentials, or PTY access, and CSP or capabilities are not loosened app-wide to make a preview work.
- Secrets use the appropriate OS mechanism — never the project repo, screenshots, fixtures, logs, or a plain config preview.
- No autonomous git operations. No real SDK downloads, toolkit installs, licence acceptance, provider-config mutation, or Jira writes — including for screenshots.
- New Tauri, browser, device, MCP, or provider APIs are verified against official documentation for the version in use; CLI flags, MCP schemas, auth methods, transports, and embed capabilities are never invented.
- `design/precision-atelier/` is archive. Its implementation prompt must not be run alongside v2.

## Non-Goals
- Any Verify functionality beyond the informational Coming-soon landing: no QA runner, test reports, evidence storage, Verify dependencies, Install / Activate / Start testing CTA, waitlist, email capture, release date, or paid lock.
- GitHub and Figma connectors — catalogue entries labelled `Planned` only, with no working Configure button.
- Claiming an embedded simulator viewport when the delivered capability is an in-tab controller plus a labelled external window.
- Browser DOM inspector, screenshot automation, recording, test steps, or agent browser control — these would build Verify through the back door.
- A plugin marketplace or general adapter framework. Only enough seam for Claude, Codex, custom CLI, browser, device control, Jira, and custom MCP.
- Broad refactoring of the worker or domain logic beyond what modular setup and the adapters require.
- Renaming `/ec-*` to invented `/effi-*` equivalents.
- Removing the legacy install-all path. It stays available as a clearly named, clearly scoped option for existing users — just not as the default.

## Risks & Mitigations
- A control that looks functional over an absent backend (browser, device, MCP) → every optional surface ships a verified native integration or a labelled fallback; the final report separates implemented / verified / unavailable in this environment / deferred.
- Rebrand destroys existing users' registry, preferences, overrides, plans, or history → display-only rebrand is a Constraint and a Non-Goal; migration is required before any path, key, or identifier moves.
- Optional checkboxes that still call install-all → the modular setup task must split link-existing / enable-bundled / setup-external / install-selected in the backend, with Codex-only and Browser-only asserted to write no Claude hooks and install no Python worker.
- React keys or PTY reuse derived from active index or provider selection, interleaving two agents' IO → tab id and session id are stable and independent of project id; one PTY is never reused for two agents.
- Terminal regressions during the Workbench rewrite → preserve subscribe-before-open, UTF-8/ANSI byte handling, the hidden-size guard, FitAddon, and focus return; a hidden pane must not fit to 0×0 or reopen a process.
- Treating invoke resolution or PTY exit as install success → readiness comes from a relevant diagnostic; manual recheck always exists; retry only where the lifecycle genuinely supports it.
- Stage mistaken for running telemetry → stage stays a workflow recommendation read from the plan source, labelled `Source: Claude plan`, with read-only checklists and no spinner on pending items.
- Session loss on navigation → switching project, tab, Settings, Connections, or the Verify preview must not unmount a live session; removing a project closes only that project's tabs and deletes no folder.

## Verification Strategy
- App opens with no Claude, Codex, toolkit, or SDK present → launch with the override cleared; the shell renders a workspace and setup is skippable, with no `doctorBlocking` early return.
- Codex-only is not blocked by the Claude doctor and receives no Claude commands → configure Codex alone; the workflow row hides `/ec-*` and shows `Workflow shortcuts are not configured for this agent.`
- Rebrand preserves existing state → before/after comparison of project registry, order, panel prefs, Claude override path, plan, and history.
- Two agent sessions in one project do not swap IO → open Claude and Codex in the same project, send distinct input to each, confirm separate session ids and no interleaving; background sessions stay alive.
- Workflow dispatch never reaches the wrong PTY → with a browser or Codex tab active, the workflow CTA resolves an explicit Claude target or offers `Open Claude Code`; no bytes are written to the active non-Claude session.
- Closing one tab closes only that tab → open four tabs, close one; focus and resize do not reopen a PTY.
- Verify stays inert → the Verify checkbox is not selectable, Verify appears in no install plan, and preview-then-back leaves Build sessions running.
- Modular setup installs only the selection → run a Browser-only and a Codex-only setup; assert no write to `~/.claude/settings.json`, no Python dependency install, no worker files; optional failure yields partial success with a working core, and recheck plus retry behave correctly.
- Browser failure modes → unreachable localhost keeps the URL editable with Retry and Open externally, kills no terminal, starts no server; remote content is confirmed to have no privileged IPC, file, credential, or PTY access.
- Device honesty → missing prerequisites show concrete setup steps; the external-window fallback is labelled; Stop acts only on a device the app owns; a simulator the user opened outside the app is never stopped or claimed.
- MCP scoping → configure one consumer and assert the others do not report Connected; an invalid config does not damage existing provider config.
- Layout, keyboard, and fallbacks → screenshots at 1440×900, 1180×760, 980×700, 800×650 compared against the mockups for hierarchy, spacing, terminal room, labels, availability, and copper restraint; terminal keystrokes reach xterm; long labels and the raw-plan fallback render correctly.
- Build checks → `npm run build` in `studio/`; cargo checks for the Rust and Tauri config changes; integration and regression tests for changed lifecycle behaviour, not markup snapshots.

## Open Questions
- Does the installed Tauri version expose a native browsing surface meeting §9 without loosening app-wide CSP or capabilities? → assuming: it does not until verified against official docs at implementation time; the browser tab then ships as a real surface if confirmed, otherwise as a controller with `Open externally`, reported as unavailable in this environment.
- Can a native iOS Simulator or Android Emulator viewport be embedded in the webview? → assuming: no. The delivered capability is an in-tab control surface plus a labelled external window; live embedding only if a real integration is verified.
- Is Jira reached through its native API or a validated MCP adapter? → assuming: read-only native API context first, with the actual path confirmed against current official documentation; no claim that every Jira connector is MCP.
- Does the bundle identifier change as part of the rebrand? → assuming: no. It stays until a migration preserving state location and permissions is designed, since an identifier change moves both.
- Should `design/` be tracked in git? → assuming: it is left untracked by this cycle; adding it is a `/ec-git` decision for the user, and this command performs no git operation.

## Out of Scope
- Auditing the design package itself for internal contradictions as a deliverable — the user chose full implementation; contradictions surface against real code during `/ec-refine`.
- Any change to `design/precision-atelier/`, which stays an untouched visual archive.
- Non-macOS platforms, and the Verify product itself.
- Regenerating or editing the mockup images; `IMAGE-PROMPTS.md` is archive.

_Created: 2026-10-29_
