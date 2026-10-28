## Feature: EffiClaude Studio — macOS desktop app (Tauri v2 + portable-pty + xterm.js)

### Impact Analysis
- Files affected:
  - `studio/**` — entire new subtree (Tauri v2 app: Rust backend + React/TS webview). All new files.
  - `studio/.gitignore` — new, nested. Keeps `target/`, `node_modules/`, `dist/` out of git **without touching the root `.gitignore`**.
  - `README.md` — exactly one new `## Studio (macOS app)` section inserted before line 50 (`## The workflow`). The only edit outside `studio/`.
- ⚠️ Breaking change risk: **none.** No file under `commands/`, `server/`, `hooks/`, `agents/`, `install.sh`, `token-optimizer/`, or `tests/` is read, written, or re-ordered by this plan. The Python suite (124 passing) cannot be affected by it; it is re-run at Task 34 purely as proof of non-interference.
- Runtime coupling is one-directional and read-only: the app reads each managed project's `.claude/` and issues `GET 127.0.0.1:37777/health`. It never writes into a managed project and never starts, stops, or restarts the worker.

### Reusable Existing Code
- `install.sh:195` — `RELEASE_URL="https://github.com/$REPO/releases/latest/download/etok-$PLATFORM"`. The `$(uname -s)-$(uname -m)` artifact-naming convention is reused verbatim for the `.dmg` names; do not invent a new scheme.
- `install.sh:174-190` — the `cargo build --release -q` block is the precedent for how a Rust artifact is produced in this repo. Mirror its shape; do not add a second build system.
- `install.sh:8,14` — `COMMANDS_DIR="$HOME/.claude/commands"` and the 11-entry `COMMANDS` array. `doctor.rs` reads these same two facts to decide "EffiClaude installed"; hardcode neither the path nor the list independently of this precedent.
- `server/worker.py:90` — `@app.route('/health')` returns `{"status":"ok",...}`. That exact response shape is the doctor's worker probe; no new endpoint is needed.
- `hooks/session_stop.py:149` — `AUTOFLOW_PATH = os.path.join(".claude", ".autoflow")`, and `:212` — `.claude/.review-done-{branch}`. `plan.rs` parses these same two files so the app's stage display can never disagree with the Stop-hook driver.
- `token-optimizer/Cargo.toml:1-10` — `edition = "2021"`, `[[bin]]` layout. `studio/src-tauri/Cargo.toml` follows the same edition and style.
- `.claude/plans/archive/` — 13 files in this repo named `{branch}-{YYYY-MM-DD}-{HHMM}-{slug}.md`; sibling workspaces on this machine hold up to 320. That filename grammar is the history panel's entire data source; parse it, do not build a separate index.

### Design Direction
- Dials: ENERGY 1 · RHYTHM 1 · MOTION 1 — this is an instrument panel watched for long stretches while real work runs elsewhere; it must recede. Low ENERGY because a terminal's own output is the only thing that should carry color weight. RHYTHM 1 because every project row, task row, and history row is the same shape repeated, and sameness is what makes a 26-item checklist scannable. MOTION 1 because the only motion that means anything here is a checkbox flipping — animating anything else teaches the eye to ignore the one signal that matters.
- Palette: a near-black ground `#0E1116`, a raised surface `#161A21`, a hairline border `#232935`, primary text `#E6E9EF` with muted `#8A93A5`, and exactly one accent `#4C9AFF` reserved for the active project and the stage badge. Reason: the app sits beside a terminal all day, so it must survive dark rooms; restricting the accent to one hue means a running project is locatable without reading.
- Typography: SF Pro (system) for all UI chrome at a three-step scale, and SF Mono for the terminal, task text, and file paths. Reason: task lines contain paths and `[agent: ec-nodejs]` tags that only align if monospaced, and the system face keeps the chrome feeling like macOS rather than like a web page in a frame.
- Identity motif: a fixed four-dot stage rail — brainstorm · feature · execute · review — rendered identically in the sidebar row, the project header, and every history entry, with completed dots filled and the current one ringed. The same gesture in all three places is what makes the workflow legible at a glance; it is the app's one repeated idea.
- Rules: apply ~/.claude/agents/ec-antislop.md in full — hard gates, purpose gates, quality locks

### Grounding
Measured 2026-10-28 in `/Users/admin/Developer/Projects/EffiClaude` — real command output only.

Baseline line counts (`wc -l`):
- `README.md` → 207
- `.gitignore` → 3

Baseline test result:
- `python3 -m pytest -q` → `124 passed, 1 warning in 2.87s`

Verified anchors:
- `## The workflow` → `README.md:50`   (Task 33 inserts the Studio section immediately above this line)
- `## Install` → `README.md:35`
- every other task → **new file — no anchor** (`ls -d studio` → absent; the whole subtree is created by this plan)

Baseline string counts (`grep -c`):
- `grep -c '^## ' README.md` → 8   (Task 39 raises this to exactly 9)
- `ls -d studio 2>/dev/null | wc -l` → 0
- `ls .claude/plans/archive/*.md | wc -l` → 13   (12 pre-existing + the one this run archived)

Toolchain measured on this machine:
- `sw_vers` → macOS 27.2, `uname -m` → arm64
- `rustc --version` → 1.95.0 · `cargo --version` → 1.95.0
- `xcode-select -p` → `/Applications/Xcode.app/Contents/Developer`
- `node -v` → v24.14.0 · `npm -v` → 11.9.0
- `which claude` → `/Users/admin/.local/bin/claude` · `claude --version` → 2.1.312

Dependency versions resolved 2026-10-28 (crates.io sparse index + `npm view`) — pin these, do not guess:
- crates: `tauri` 2.12.5 · `portable-pty` 0.9.0 · `notify` 8.2.1 · `tokio` 1.54.1 · `serde` 1.0.229 · `serde_json` 1.0.154 · `tauri-plugin-dialog` 2.x (let `cargo add` resolve, must stay on the 2.x line)
- npm: `@tauri-apps/cli` 2.12.4 · `@tauri-apps/api` 2.12.4 · `@tauri-apps/plugin-dialog` 2.8.4 · `@xterm/xterm` 6.0.0 · `@xterm/addon-fit` 0.11.0 · `vite` 8.3.5 · `react` 19.3.1 · `tailwindcss` 4.3.3
- `tauri` 3.0.0-alpha.5 exists on crates.io. **Do not use it.** This plan is Tauri 2.x throughout.

### Tasks
- [x] Task 1: Scaffold Tauri v2 React+TS app at studio/ [M] — `npm create tauri-app@latest`, non-interactive, pinned to the 2.x line.
- [x] Task 2: Nested studio/.gitignore [S] — keep target/, node_modules/, dist/ out of git without touching the root .gitignore.
- [x] Task 3: Add Rust dependencies to src-tauri/Cargo.toml [S] — portable-pty, notify, tokio, serde, serde_json, tauri-plugin-dialog at the pinned versions.
- [x] Task 4: shell_env.rs — login-shell PATH probe [M] — `$SHELL -ilc 'echo $PATH'`, cached once; the single highest-risk item in this plan.
- [x] Task 5: shell_env.rs — resolve the claude binary [M] — search the probed PATH, then known fallbacks, then the manual override.
- [x] Task 6: Expose resolve_claude as a Tauri command [S] — make Task 4+5 observable before any UI exists.
- [x] Task 7: pty.rs — PtySession struct and spawn [M] — portable-pty native pty system, cwd = project root, env = probed PATH.
- [x] Task 8: pty.rs — reader thread emitting pty://output [M] — blocking read loop on a thread, bytes to the webview as base64.
- [x] Task 9: pty.rs — write, resize, and kill [M] — keystrokes in, TIOCSWINSZ via PtySize, SIGKILL on close.
- [x] Task 10: pty.rs — SessionRegistry keyed by project id [M] — one PTY per project, concurrent, no shared state between them.
- [x] Task 11: Register the four PTY commands in lib.rs [S] — pty_open, pty_write, pty_resize, pty_close.
- [x] Task 12: Install xterm.js and addon-fit [S] [agent: ec-typescript] — @xterm/xterm 6.0.0 + @xterm/addon-fit 0.11.0.
- [x] Task 13: terminal-pane.tsx — mount xterm and bind the PTY [L] [agent: ec-react] [design: direction#TerminalPane] — output in, keystrokes out, ResizeObserver to pty_resize.
- [x] Task 14: GATE — verify TUI fidelity from a Finder-launched bundle [M] — the key assumption of the whole plan; nothing past here is written until this passes.
- [x] Task 15: projects.rs — studio.json load and save [M] — ~/.efficlaude/studio.json, added folders only, never a scan.
- [x] Task 16: projects.rs — add_project via NSOpenPanel [M] — the native picker is both the UX and the macOS file-access grant.
- [x] Task 17: projects.rs — remove_project and list_projects [S] — round out the config surface.
- [x] Task 18: plan.rs — parse the task checklist [M] — `^- \[([ x])\] (.+)$`, total; never panics, never throws.
- [x] Task 19: plan.rs — parse the .autoflow sentinel into a stage [M] — same file the Stop-hook driver owns; read-only.
- [x] Task 20: plan.rs — derive stage without a sentinel [M] — decision file, plan file, review-done marker, in that order.
- [x] Task 21: plan.rs — parse the archive directory into history [M] — `{branch}-{date}-{time}-{slug}.md` is the whole grammar.
- [x] Task 22: plan.rs — one read_project_state entry point [M] — a single struct the UI renders; one call, one snapshot.
- [x] Task 23: watcher.rs — debounced notify watcher per project [L] — 250ms debounce, diff before emit, no event storm during ec-execute.
- [x] Task 24: Bind watcher lifecycle to add/remove [M] — a watched project set that exactly matches the configured one.
- [x] Task 25: types.ts and tauri-api.ts [M] [agent: ec-typescript] — one typed boundary; no bare invoke() anywhere else.
- [x] Task 26: styles.css — Design Direction tokens [M] [agent: ec-tailwind] [design: direction#Tokens] — the five colors and two faces, as CSS variables.
- [x] Task 27: stage-rail.tsx — the four-dot motif [M] [agent: ec-react] [design: direction#StageRail] — one component, three placements, identical rendering.
- [x] Task 28: project-sidebar.tsx [L] [agent: ec-react] [design: direction#Sidebar] — project list, Add Folder, active selection, per-row stage rail and counter.
- [x] Task 29: task-panel.tsx [L] [agent: ec-react] [design: direction#TaskPanel] — the live checklist; raw markdown when the parse is empty.
- [x] Task 30: history-panel.tsx [M] [agent: ec-react] [design: direction#HistoryPanel] — archived runs, newest first.
- [x] Task 31: doctor.rs — the three first-run probes [M] — claude binary, ec-*.md in ~/.claude/commands, worker /health.
- [x] Task 32: doctor-screen.tsx [L] [agent: ec-react] [design: direction#DoctorScreen] — three checks and a one-click install that streams into the terminal.
- [x] Task 33: Bundle install.sh and wire the install command [M] — the .dmg becomes a front door for EffiClaude, not just a viewer.
- [x] Task 34: app.tsx — three-pane layout and state wiring [L] [agent: ec-react] [design: direction#AppShell] — sidebar, terminal, panels; doctor gates the shell.
- [x] Task 35: PTY cleanup on window close and app exit [M] — no orphaned claude processes, ever.
- [x] Task 36: tauri.conf.json — bundle identity and dmg targets [M] — ad-hoc signing now, Developer ID later as configuration.
- [x] Task 37: App icons [S] [design: direction#AppIcon] — the four-dot motif at icon scale.
- [x] Task 38: Build the .dmg for arm64 and x86_64 [M] — artifact names matching the etok convention.
- [x] Task 39: README — the Studio section [S] — install, Gatekeeper right-click→Open, and the macOS-only scope.
- [x] Task 40: Prove the app writes nothing into a managed project [M] — the constraint that protects every other repo on the machine.
- [x] Task 41: Re-run the Python suite and confirm non-interference [S] — 124 passed, unchanged.

### Per Task Detail

**Task 1 — Scaffold Tauri v2 React+TS app at studio/** `M`
- File: `studio/` (created), `studio/package.json`, `studio/src-tauri/Cargo.toml`, `studio/src-tauri/tauri.conf.json`, `studio/vite.config.ts`, `studio/index.html`, `studio/src/main.tsx`, `studio/src/App.tsx`
- Anchor: new file — no anchor (`ls -d studio` → absent, recorded in Grounding)
- Reuse: none
- Code sample:
  ```bash
  cd /Users/admin/Developer/Projects/EffiClaude
  npm create tauri-app@latest studio -- --template react-ts --manager npm --yes
  cd studio && npm install
  ```
  Then confirm `src-tauri/Cargo.toml` carries `tauri = { version = "2", ... }`. If the scaffold emits a 3.0.0-alpha dependency, pin it down to `2.12.5` by hand — this plan is Tauri 2.x throughout.
- Do not touch: anything outside `studio/`. The scaffolder must not be run from the repo root.
- Edge cases: `npm create` is interactive by default — the `--yes` and explicit `--template` flags are what make it non-interactive; if the directory already exists the command aborts rather than merging, which is the desired behaviour.
- ⚠️ Breaking change: none
- Acceptance: a `studio/` subtree exists containing both a Vite React-TS frontend and a `src-tauri` Rust crate on the Tauri 2.x line.
- Verify: `test -f studio/src-tauri/Cargo.toml && test -f studio/package.json && grep -q '"2' <(grep -A1 '^tauri' studio/src-tauri/Cargo.toml) && echo OK` → prints `OK`
- Rollback: `rm -rf studio`
- Dependencies: none

**Task 2 — Nested studio/.gitignore** `S`
- File: `studio/.gitignore` (create)
- Anchor: new file — no anchor
- Reuse: root `.gitignore` (3 lines, per Grounding) shows this repo's terse style — one path per line, no comments beyond necessity.
- Code sample:
  ```
  node_modules/
  dist/
  src-tauri/target/
  src-tauri/gen/
  .DS_Store
  ```
- Do not touch: the root `.gitignore`. It stays at 3 lines. A nested `.gitignore` is how this plan honours the "no edits outside studio/ except one README section" constraint.
- Edge cases: `src-tauri/target/` reaches multiple GB after a release build — if it is ever committed the repo is effectively ruined, so this task runs before the first `cargo build`.
- ⚠️ Breaking change: none
- Acceptance: build and dependency artifacts under `studio/` are invisible to git while source files remain tracked.
- Verify: `wc -l .gitignore` → `3` (unchanged from the Grounding baseline) and `cd studio && git check-ignore -q src-tauri/target node_modules dist && echo IGNORED` → prints `IGNORED`
- Rollback: `rm studio/.gitignore`
- Dependencies: Task 1

**Task 3 — Add Rust dependencies to src-tauri/Cargo.toml** `S`
- File: `studio/src-tauri/Cargo.toml` (modify)
- Anchor: `[dependencies]` in `studio/src-tauri/Cargo.toml` (written by Task 1)
- Reuse: `token-assistant` precedent — `token-optimizer/Cargo.toml:1-10` uses `edition = "2021"`; keep the scaffold on the same edition.
- Code sample:
  ```bash
  cd studio/src-tauri
  cargo add portable-pty@0.9.0
  cargo add notify@8.2.1
  cargo add tokio@1.54.1 --features rt-multi-thread,macros,sync
  cargo add serde@1.0.229 --features derive
  cargo add serde_json@1.0.154
  cargo add tauri-plugin-dialog
  ```
  `tauri-plugin-dialog` is deliberately unpinned so cargo resolves the 2.x release matching the installed `tauri`; verify afterwards that it did **not** resolve to a 3.0.0-alpha.
- Do not touch: the `tauri` and `tauri-build` versions written by the scaffold, except to pin them down from an alpha.
- Edge cases: `cargo add` with no network fails cleanly and changes nothing; re-running it is idempotent.
- ⚠️ Breaking change: none
- Acceptance: the crate compiles with all six dependencies present and nothing resolved onto a Tauri 3 alpha.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -3` → ends in `Finished`, and `grep -c '3\.0\.0-alpha' Cargo.toml` → `0`
- Rollback: `cd studio/src-tauri && git checkout -- Cargo.toml Cargo.lock`
- Dependencies: Task 1

**Task 4 — shell_env.rs: login-shell PATH probe** `M`
- File: `studio/src-tauri/src/shell_env.rs` (create)
- Anchor: new file — no anchor
- Reuse: none
- Code sample:
  ```rust
  use std::process::Command;
  use std::sync::OnceLock;

  static PROBED_PATH: OnceLock<String> = OnceLock::new();

  pub fn login_shell_path() -> &'static str {
      PROBED_PATH.get_or_init(|| {
          let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
          Command::new(&shell)
              .args(["-ilc", "echo $PATH"])
              .output()
              .ok()
              .filter(|o| o.status.success())
              .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
              .filter(|p| !p.is_empty())
              .unwrap_or_else(|| std::env::var("PATH").unwrap_or_default())
      })
  }
  ```
- Do not touch: the process-wide environment. Probe and cache the string; never call `std::env::set_var`.
- Edge cases: a shell rc that prints banners pollutes stdout — take the **last** non-empty line, not the whole output; a shell that hangs on `-i` must not hang the app, so the probe runs once at startup off the UI thread and falls back to the inherited `PATH`.
- ⚠️ Breaking change: none
- Acceptance: the app can state what the user's real shell `PATH` is, even when launched from Finder with a minimal environment.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`
- Rollback: `rm studio/src-tauri/src/shell_env.rs`
- Dependencies: Task 3

**Task 5 — shell_env.rs: resolve the claude binary** `M`
- File: `studio/src-tauri/src/shell_env.rs` (modify)
- Anchor: `pub fn login_shell_path()` in `studio/src-tauri/src/shell_env.rs` (created by Task 4)
- Reuse: `login_shell_path()` from Task 4 — do not re-probe.
- Code sample:
  ```rust
  use std::path::PathBuf;

  pub fn resolve_claude(override_path: Option<&str>) -> Result<PathBuf, String> {
      if let Some(p) = override_path.filter(|p| !p.is_empty()) {
          let pb = PathBuf::from(p);
          return if pb.is_file() { Ok(pb) } else { Err(format!("override not found: {p}")) };
      }
      for dir in login_shell_path().split(':').filter(|d| !d.is_empty()) {
          let cand = PathBuf::from(dir).join("claude");
          if cand.is_file() { return Ok(cand); }
      }
      let home = std::env::var("HOME").unwrap_or_default();
      for fallback in [".local/bin/claude", ".claude/local/claude"] {
          let cand = PathBuf::from(&home).join(fallback);
          if cand.is_file() { return Ok(cand); }
      }
      Err("claude binary not found — set it manually in Settings".into())
  }
  ```
- Do not touch: `login_shell_path`'s caching behaviour.
- Edge cases: the override pointing at a directory rather than a file (`is_file()` rejects it); a `PATH` entry containing `~` is not expanded by the shell probe output and simply will not match, which the fallbacks cover.
- ⚠️ Breaking change: none
- Acceptance: on this machine the function returns `/Users/admin/.local/bin/claude`, and on a machine without claude it returns the explicit error string rather than a silent empty result.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`
- Rollback: `cd studio/src-tauri && git checkout -- src/shell_env.rs`
- Dependencies: Task 4

**Task 6 — Expose resolve_claude as a Tauri command** `S`
- File: `studio/src-tauri/src/lib.rs` (modify)
- Anchor: `tauri::Builder::default()` in `studio/src-tauri/src/lib.rs` (written by Task 1)
- Reuse: `shell_env::resolve_claude` from Task 5.
- Code sample:
  ```rust
  mod shell_env;

  #[tauri::command]
  fn resolve_claude(override_path: Option<String>) -> Result<String, String> {
      shell_env::resolve_claude(override_path.as_deref())
          .map(|p| p.to_string_lossy().into_owned())
  }
  ```
  Register with `.invoke_handler(tauri::generate_handler![resolve_claude])`.
- Do not touch: the generated `run()` signature.
- Edge cases: `Result<_, String>` is what surfaces the error as a rejected promise in the webview rather than a panic.
- ⚠️ Breaking change: none
- Acceptance: the webview can ask the Rust side where claude is and receive either a path or a readable error — making Tasks 4 and 5 observable before any UI is built.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`, and `grep -c 'generate_handler' src/lib.rs` → `1`
- Rollback: `cd studio/src-tauri && git checkout -- src/lib.rs`
- Dependencies: Task 5

**Task 7 — pty.rs: PtySession struct and spawn** `M`
- File: `studio/src-tauri/src/pty.rs` (create)
- Anchor: new file — no anchor
- Reuse: `shell_env::login_shell_path` and `shell_env::resolve_claude`.
- Code sample:
  ```rust
  use portable_pty::{native_pty_system, CommandBuilder, PtySize, MasterPty, Child};

  pub struct PtySession {
      master: Box<dyn MasterPty + Send>,
      child: Box<dyn Child + Send + Sync>,
      writer: Box<dyn std::io::Write + Send>,
  }

  pub fn spawn(cwd: &str, claude: &str, path: &str) -> Result<PtySession, String> {
      let pair = native_pty_system()
          .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
          .map_err(|e| e.to_string())?;
      let mut cmd = CommandBuilder::new(claude);
      cmd.cwd(cwd);
      cmd.env("PATH", path);
      cmd.env("TERM", "xterm-256color");
      let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
      drop(pair.slave);
      let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
      Ok(PtySession { master: pair.master, child, writer })
  }
  ```
- Do not touch: the inherited process environment; every variable the child needs is set on the `CommandBuilder`.
- Edge cases: the slave must be dropped after spawn or the master never sees EOF when the child exits; `TERM=xterm-256color` is what makes claude emit color at all.
- ⚠️ Breaking change: none
- Acceptance: a `claude` process starts under a real pty with its working directory set to the chosen project.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`
- Rollback: `rm studio/src-tauri/src/pty.rs`
- Dependencies: Task 6

**Task 8 — pty.rs: reader thread emitting pty://output** `M`
- File: `studio/src-tauri/src/pty.rs` (modify)
- Anchor: `pub fn spawn(` in `studio/src-tauri/src/pty.rs` (created by Task 7)
- Reuse: the `PtySession` struct from Task 7.
- Code sample:
  ```rust
  use tauri::{AppHandle, Emitter};

  pub fn start_reader(app: AppHandle, id: String, mut reader: Box<dyn std::io::Read + Send>) {
      std::thread::spawn(move || {
          let mut buf = [0u8; 8192];
          loop {
              match reader.read(&mut buf) {
                  Ok(0) | Err(_) => { let _ = app.emit("pty://exit", &id); break; }
                  Ok(n) => {
                      let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                      let _ = app.emit("pty://output", (&id, chunk));
                  }
              }
          }
      });
  }
  ```
  Give `PtySession` a `pub fn reader(&self) -> Result<Box<dyn Read + Send>, String>` that wraps `self.master.try_clone_reader()`; that is the accessor `pty_open` calls in Task 11.
- Do not touch: the writer half — it stays owned by `PtySession` for Task 9.
- Edge cases: `from_utf8_lossy` can split a multi-byte sequence across two 8KB reads and produce a replacement character; acceptable for a terminal stream and far cheaper than a stateful decoder. `Ok(0)` means the child exited and must emit `pty://exit`, not loop forever.
- ⚠️ Breaking change: none
- Acceptance: everything claude prints arrives in the webview as a stream of `pty://output` events, and the child's exit is announced exactly once.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`, and `grep -c 'pty://output' src/pty.rs` → `1`
- Rollback: `cd studio/src-tauri && git checkout -- src/pty.rs`
- Dependencies: Task 7

**Task 9 — pty.rs: write, resize, and kill** `M`
- File: `studio/src-tauri/src/pty.rs` (modify)
- Anchor: `pub fn start_reader(` in `studio/src-tauri/src/pty.rs` (created by Task 8)
- Reuse: `PtySession.writer` and `PtySession.master` from Task 7.
- Code sample:
  ```rust
  impl PtySession {
      pub fn write(&mut self, data: &str) -> Result<(), String> {
          self.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
          self.writer.flush().map_err(|e| e.to_string())
      }
      pub fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
          self.master
              .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
              .map_err(|e| e.to_string())
      }
      pub fn kill(&mut self) {
          let _ = self.child.kill();
          let _ = self.child.wait();
      }
  }
  ```
- Do not touch: the reader thread — it ends on its own when the master closes.
- Edge cases: `flush` is required or keystrokes sit in the buffer and the TUI appears frozen; `resize` is the `TIOCSWINSZ` path that makes claude reflow, and without the following `wait()` the killed child becomes a zombie.
- ⚠️ Breaking change: none
- Acceptance: keystrokes reach claude, window resizes reflow its TUI, and closing a session leaves no live process.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`, and `grep -c 'fn write\|fn resize\|fn kill' src/pty.rs` → `3`
- Rollback: `cd studio/src-tauri && git checkout -- src/pty.rs`
- Dependencies: Task 8

**Task 10 — pty.rs: SessionRegistry keyed by project id** `M`
- File: `studio/src-tauri/src/pty.rs` (modify)
- Anchor: `impl PtySession {` in `studio/src-tauri/src/pty.rs` (created by Task 9)
- Reuse: `PtySession` from Tasks 7–9.
- Code sample:
  ```rust
  use std::collections::HashMap;
  use std::sync::Mutex;

  #[derive(Default)]
  pub struct SessionRegistry(pub Mutex<HashMap<String, PtySession>>);
  ```
  Registered with `.manage(SessionRegistry::default())`.
- Do not touch: nothing — this type is new.
- Edge cases: opening a session for a project that already has one must return the existing session rather than leaking the old PTY; the lock is held only for the map operation, never across a blocking read.
- ⚠️ Breaking change: none
- Acceptance: several projects hold independent live PTYs at once with no shared buffer or cursor state between them.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`
- Rollback: `cd studio/src-tauri && git checkout -- src/pty.rs`
- Dependencies: Task 9

**Task 11 — Register the four PTY commands in lib.rs** `S`
- File: `studio/src-tauri/src/lib.rs` (modify)
- Anchor: `tauri::generate_handler![resolve_claude]` in `studio/src-tauri/src/lib.rs` (written by Task 6)
- Reuse: `SessionRegistry` from Task 10.
- Code sample:
  ```rust
  mod pty;

  #[tauri::command]
  fn pty_open(app: tauri::AppHandle, reg: tauri::State<pty::SessionRegistry>,
              id: String, cwd: String, claude: String) -> Result<(), String> {
      let mut map = reg.0.lock().map_err(|e| e.to_string())?;
      if map.contains_key(&id) { return Ok(()); }
      let session = pty::spawn(&cwd, &claude, shell_env::login_shell_path())?;
      pty::start_reader(app, id.clone(), session.reader()?);
      map.insert(id, session);
      Ok(())
  }
  ```
  `pty_write(id, data)` locks the map and calls `session.write(&data)`; `pty_resize(id, rows, cols)` calls `session.resize(rows, cols)`; `pty_close(id)` removes the entry from the map and calls `kill()` on the removed value. Each returns `Err(format!("no session: {id}"))` when the id is unknown. All four are appended to `generate_handler!`.
- Do not touch: the existing `resolve_claude` registration — append, do not replace.
- Edge cases: a command naming an unknown id returns `Err` rather than panicking inside the Mutex and poisoning it for every other project.
- ⚠️ Breaking change: none
- Acceptance: the webview has a complete PTY surface — open, write, resize, close.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`, and `grep -c 'pty_open\|pty_write\|pty_resize\|pty_close' src/lib.rs` → `8` (one definition plus one handler registration for each of the four)
- Rollback: `cd studio/src-tauri && git checkout -- src/lib.rs`
- Dependencies: Task 10

**Task 12 — Install xterm.js and addon-fit** `S` `[agent: ec-typescript]`
- File: `studio/package.json` (modify)
- Anchor: `"dependencies"` in `studio/package.json` (written by Task 1)
- Reuse: none
- Code sample:
  ```bash
  cd studio && npm install @xterm/xterm@6.0.0 @xterm/addon-fit@0.11.0
  ```
- Do not touch: the `@tauri-apps/*` versions installed by the scaffold.
- Edge cases: the deprecated `xterm` package still exists on npm — the scoped `@xterm/*` packages are the maintained ones and the only correct choice here.
- ⚠️ Breaking change: none
- Acceptance: both xterm packages are installed at the pinned versions.
- Verify: `cd studio && node -e "const p=require('./package.json');console.log(p.dependencies['@xterm/xterm'],p.dependencies['@xterm/addon-fit'])"` → prints two version strings, neither `undefined`
- Rollback: `cd studio && npm uninstall @xterm/xterm @xterm/addon-fit`
- Dependencies: Task 1

**Task 13 — terminal-pane.tsx: mount xterm and bind the PTY** `L` `[agent: ec-react]` `[design: direction#TerminalPane]`
- File: `studio/src/components/terminal-pane.tsx` (create)
- Anchor: new file — no anchor
- Reuse: the four PTY commands from Task 11; `@xterm/addon-fit` from Task 12.
- Code sample:
  ```tsx
  export function TerminalPane({ projectId, cwd }: { projectId: string; cwd: string }) {
    const hostRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const term = new Terminal({ fontFamily: 'SF Mono, Menlo, monospace', fontSize: 13,
        theme: { background: '#0E1116', foreground: '#E6E9EF' }, convertEol: false });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(hostRef.current!);
      fit.fit();
      const un = listen<[string, string]>('pty://output', (e) => {
        if (e.payload[0] === projectId) term.write(e.payload[1]);
      });
      term.onData((d) => invoke('pty_write', { id: projectId, data: d }));
      const ro = new ResizeObserver(() => {
        fit.fit();
        invoke('pty_resize', { id: projectId, rows: term.rows, cols: term.cols });
      });
      ro.observe(hostRef.current!);
      return () => { ro.disconnect(); un.then((f) => f()); term.dispose(); };
    }, [projectId]);
    return <div ref={hostRef} className="h-full w-full" />;
  }
  ```
- Do not touch: the `pty://output` payload shape agreed in Task 8 — `(id, chunk)`.
- Edge cases: the listener must filter by `projectId` or two open projects interleave output into one pane; `ResizeObserver` fires once on mount, which is what sends the correct initial size; the cleanup must await the `listen` promise or the unlisten leaks across project switches.
- ⚠️ Breaking change: none
- Acceptance: a live, interactive claude terminal is visible in the app window and typing into it reaches the process.
- Verify: `cd studio && npx tsc --noEmit` → exit status 0
- Rollback: `rm studio/src/components/terminal-pane.tsx`
- Dependencies: Task 12

**Task 14 — GATE: verify TUI fidelity from a Finder-launched bundle** `M`
- File: none — verification only
- Anchor: n/a
- Reuse: everything built in Tasks 1–13.
- Code sample:
  ```bash
  cd studio && npm run tauri build -- --debug
  open src-tauri/target/debug/bundle/macos/*.app
  ```
  Then, in the launched window: run `/ec-next`, answer a prompt, resize the window mid-session.
- Do not touch: nothing. **This task writes no code.**
- Edge cases: the bundle must be launched with `open` (or from Finder), never via `npm run tauri dev` from a terminal — a terminal-launched process inherits the shell `PATH` and would hide the exact failure Task 4 exists to prevent.
- ⚠️ Breaking change: none
- Acceptance: the key assumption of this plan holds — `portable-pty` + xterm.js in WKWebView runs claude with full TUI fidelity, and a Finder-launched app finds the claude binary.
- Verify: all four by direct observation — (a) claude's banner renders in color, (b) an interactive prompt accepts `y` and advances, (c) resizing the window reflows the TUI without corruption, (d) the resolved claude path equals `/Users/admin/.local/bin/claude` from Grounding. **If (a)–(c) fail, stop the plan and escalate to the documented Electron fallback; do not proceed to Task 15.**
- Rollback: n/a — nothing is written
- Dependencies: Task 13

**Task 15 — projects.rs: studio.json load and save** `M`
- File: `studio/src-tauri/src/projects.rs` (create)
- Anchor: new file — no anchor
- Reuse: `serde` from Task 3.
- Code sample:
  ```rust
  #[derive(Serialize, Deserialize, Clone)]
  pub struct Project { pub id: String, pub name: String, pub path: String }

  #[derive(Serialize, Deserialize, Default)]
  pub struct StudioConfig {
      #[serde(default)] pub projects: Vec<Project>,
      #[serde(default)] pub claude_override: Option<String>,
  }

  fn config_path() -> PathBuf {
      PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".efficlaude/studio.json")
  }
  ```
  `load()` returns `StudioConfig::default()` on any read or parse failure; `save()` creates `~/.efficlaude/` if absent and writes pretty JSON.
- Do not touch: any other file under `~/.efficlaude/` — in particular never `efficlaude.db`, `worker.pid`, or `chroma/`.
- Edge cases: a hand-corrupted `studio.json` must degrade to an empty project list, never block startup; `#[serde(default)]` on every field keeps older config files readable after the struct grows.
- ⚠️ Breaking change: none
- Acceptance: added folders survive an app restart, and a damaged config costs the list but never the app.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`
- Rollback: `rm studio/src-tauri/src/projects.rs`
- Dependencies: Task 14

**Task 16 — projects.rs: add_project via NSOpenPanel** `M`
- File: `studio/src-tauri/src/projects.rs` (modify), `studio/src-tauri/src/lib.rs` (modify)
- Anchor: `fn config_path()` in `studio/src-tauri/src/projects.rs` (created by Task 15)
- Reuse: `tauri-plugin-dialog` from Task 3; `StudioConfig` from Task 15.
- Code sample:
  ```rust
  use tauri_plugin_dialog::DialogExt;

  #[tauri::command]
  async fn add_project(app: tauri::AppHandle) -> Result<Option<Project>, String> {
      let Some(dir) = app.dialog().file().blocking_pick_folder() else { return Ok(None) };
      let path = dir.into_path().map_err(|e| e.to_string())?;
      let name = path.file_name().map(|s| s.to_string_lossy().into_owned())
          .unwrap_or_else(|| path.to_string_lossy().into_owned());
      let abs = path.to_string_lossy().into_owned();
      let id = {  // stable across restarts, no new dependency
          use std::hash::{Hash, Hasher};
          let mut h = std::collections::hash_map::DefaultHasher::new();
          abs.hash(&mut h);
          format!("{:016x}", h.finish())
      };
      let mut cfg = load();
      if let Some(existing) = cfg.projects.iter().find(|p| p.id == id) {
          return Ok(Some(existing.clone()));
      }
      let proj = Project { id, name, path: abs };
      cfg.projects.push(proj.clone());
      save(&cfg)?;
      Ok(Some(proj))
  }
  ```
  Register the plugin with `.plugin(tauri_plugin_dialog::init())`.
- Do not touch: the selected folder itself. Adding a project reads nothing and writes nothing inside it.
- Edge cases: the user cancelling the panel returns `Ok(None)`, which is not an error; adding the same path twice must return the existing entry instead of creating a duplicate; the id is derived from the absolute path so it stays stable across restarts.
- ⚠️ Breaking change: none
- Acceptance: "Add Folder" opens the real macOS picker, and the chosen folder both appears in the list and carries the macOS file-access grant that picking it confers.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`, and `grep -c 'tauri_plugin_dialog::init' src/lib.rs` → `1`
- Rollback: `cd studio/src-tauri && git checkout -- src/projects.rs src/lib.rs`
- Dependencies: Task 15

**Task 17 — projects.rs: remove_project and list_projects** `S`
- File: `studio/src-tauri/src/projects.rs` (modify), `studio/src-tauri/src/lib.rs` (modify)
- Anchor: `async fn add_project(` in `studio/src-tauri/src/projects.rs` (created by Task 16)
- Reuse: `load()` / `save()` from Task 15.
- Code sample:
  ```rust
  #[tauri::command]
  fn list_projects() -> Vec<Project> { load().projects }

  #[tauri::command]
  fn remove_project(id: String) -> Result<(), String> {
      let mut cfg = load();
      cfg.projects.retain(|p| p.id != id);
      save(&cfg)
  }
  ```
- Do not touch: `add_project`.
- Edge cases: removing an unknown id is a no-op success, not an error — the UI may remove a row twice under a fast double-click.
- ⚠️ Breaking change: none
- Acceptance: projects can be listed and removed; removal deletes nothing on disk outside `studio.json`.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`
- Rollback: `cd studio/src-tauri && git checkout -- src/projects.rs src/lib.rs`
- Dependencies: Task 16

**Task 18 — plan.rs: parse the task checklist** `M`
- File: `studio/src-tauri/src/plan.rs` (create)
- Anchor: new file — no anchor
- Reuse: the checklist grammar confirmed in Grounding at `.claude/plans/main.md:44`.
- Code sample:
  ```rust
  #[derive(Serialize, Clone)]
  pub struct Task { pub done: bool, pub text: String }

  pub fn parse_tasks(md: &str) -> Vec<Task> {
      md.lines().filter_map(|l| {
          let t = l.trim_start();
          let done = t.strip_prefix("- [x] ").map(|r| (true, r))
              .or_else(|| t.strip_prefix("- [ ] ").map(|r| (false, r)));
          done.map(|(done, text)| Task { done, text: text.to_string() })
      }).collect()
  }
  ```
- Do not touch: the plan file. This module is read-only over every path it touches.
- Edge cases: a missing plan file yields an empty vector, never an error; a `- [X]` with a capital X is **not** matched, matching the Stop-hook driver's own strictness so the two can never disagree about progress.
- ⚠️ Breaking change: none
- Acceptance: the checklist in any project's plan file becomes structured data with a correct done/total count.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`. Cross-check against the real file: `grep -c '^- \[' ../../.claude/plans/main.md` → `41` and `grep -c '^- \[x\]' ../../.claude/plans/main.md` → `0` at plan time; the parser must report the same two numbers.
- Rollback: `rm studio/src-tauri/src/plan.rs`
- Dependencies: Task 14

**Task 19 — plan.rs: parse the .autoflow sentinel into a stage** `M`
- File: `studio/src-tauri/src/plan.rs` (modify)
- Anchor: `pub fn parse_tasks(` in `studio/src-tauri/src/plan.rs` (created by Task 18)
- Reuse: the sentinel field grammar owned by `hooks/session_stop.py:149`.
- Code sample:
  ```rust
  pub fn parse_autoflow(txt: &str) -> HashMap<String, String> {
      txt.lines().filter_map(|l| l.split_once('=')
          .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))).collect()
  }
  ```
  Read `stage` and `stages_done`; treat a sentinel older than 7200s, or one whose `branch` differs from the project's current branch, as absent — the same staleness rule the commands use.
- Do not touch: `.claude/.autoflow`. The driver owns it; the app only reads it.
- Edge cases: no sentinel is the normal state, not an error — most projects are not mid-chain; a stale sentinel must be ignored for display but **not deleted**, because deleting it is the driver's job and doing it here would corrupt a running chain.
- ⚠️ Breaking change: none
- Acceptance: a project in a live auto-flow chain shows its current stage, and one that is not shows no stage from this source.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`
- Rollback: `cd studio/src-tauri && git checkout -- src/plan.rs`
- Dependencies: Task 18

**Task 20 — plan.rs: derive stage without a sentinel** `M`
- File: `studio/src-tauri/src/plan.rs` (modify)
- Anchor: `pub fn parse_autoflow(` in `studio/src-tauri/src/plan.rs` (created by Task 19)
- Reuse: `parse_tasks` (Task 18); the review-done marker at `hooks/session_stop.py:212`.
- Code sample:
  ```rust
  pub enum Stage { Idle, Brainstorm, Feature, Execute, Review }

  // precedence, highest first:
  //   .claude/.review-done-{branch} exists      -> Review (complete)
  //   plan file has at least one "- [ ]"        -> Execute
  //   plan file exists and is fully "- [x]"     -> Review (pending)
  //   decision file exists, no plan file        -> Feature
  //   neither exists                            -> Idle
  ```
- Do not touch: any of the files consulted; existence and content checks only.
- Edge cases: a project with no `.claude/` at all is `Idle`, not an error — the sidebar must happily show folders that have never run EffiClaude; the per-branch marker name means a project on two branches shows the right stage for the checked-out one.
- ⚠️ Breaking change: none
- Acceptance: every project shows a defensible stage whether or not it is in an auto-flow chain.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`, and `grep -c 'review-done' src/plan.rs` → `1`
- Rollback: `cd studio/src-tauri && git checkout -- src/plan.rs`
- Dependencies: Task 19

**Task 21 — plan.rs: parse the archive directory into history** `M`
- File: `studio/src-tauri/src/plan.rs` (modify)
- Anchor: `pub enum Stage` in `studio/src-tauri/src/plan.rs` (created by Task 20)
- Reuse: the archive filename grammar measured in Grounding — `{branch}-{YYYY-MM-DD}-{HHMM}-{slug}.md`, 281 live examples in this repo.
- Code sample:
  ```rust
  #[derive(Serialize, Clone)]
  pub struct HistoryEntry {
      pub file: String, pub branch: String, pub date: String,
      pub time: String, pub slug: String, pub title: Option<String>,
  }
  ```
  Split the stem on `-`: field 0 is the branch, 1..4 the date, 4 the time, the remainder the slug. Read the first `## Feature:` line for the title when present. Sort newest first by `date` then `time`.
- Do not touch: the archive files.
- Edge cases: a branch name containing `-` (e.g. `feat-x`) breaks naive splitting — anchor instead on the first field that matches `\d{4}-\d{2}-\d{2}` and treat everything before it as the branch; files that do not match the grammar at all are skipped silently, never surfaced as errors.
- ⚠️ Breaking change: none
- Acceptance: the archived plans in a project list as dated, titled history entries in reverse-chronological order.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`. Cross-check against the Grounding baseline: `ls ../../.claude/plans/archive/*.md | wc -l` → `13`; the parser must return that same count for this project.
- Rollback: `cd studio/src-tauri && git checkout -- src/plan.rs`
- Dependencies: Task 20

**Task 22 — plan.rs: one read_project_state entry point** `M`
- File: `studio/src-tauri/src/plan.rs` (modify), `studio/src-tauri/src/lib.rs` (modify)
- Anchor: `pub struct HistoryEntry` in `studio/src-tauri/src/plan.rs` (created by Task 21)
- Reuse: every parser from Tasks 18–21.
- Code sample:
  ```rust
  #[derive(Serialize, Clone)]
  pub struct ProjectState {
      pub branch: String, pub stage: Stage,
      pub tasks: Vec<Task>, pub done: usize, pub total: usize,
      pub feature_title: Option<String>, pub raw_plan: Option<String>,
      pub history: Vec<HistoryEntry>, pub has_decision: bool,
  }

  #[tauri::command]
  pub fn read_project_state(path: String) -> ProjectState { /* never Err */ }
  ```
  Resolve the branch by reading `.git/HEAD` directly — do not shell out to `git`.
- Do not touch: anything under the project. Open, read, close.
- Edge cases: a non-git folder has no `.git/HEAD`, so the branch is `default`, mirroring the commands' own fallback; `raw_plan` carries the plan text so Task 29 can render markdown when `tasks` is empty. The command returns a value in all cases and never `Err` — a panic here would blank the panel.
- ⚠️ Breaking change: none
- Acceptance: one call returns everything the three panels need for one project.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`, and `grep -c 'read_project_state' src/lib.rs` → `1`
- Rollback: `cd studio/src-tauri && git checkout -- src/plan.rs src/lib.rs`
- Dependencies: Task 21

**Task 23 — watcher.rs: debounced notify watcher per project** `L`
- File: `studio/src-tauri/src/watcher.rs` (create)
- Anchor: new file — no anchor
- Reuse: `notify` 8.2.1 from Task 3; `read_project_state` from Task 22.
- Code sample:
  ```rust
  use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event};

  pub fn watch(app: AppHandle, id: String, root: PathBuf) -> notify::Result<RecommendedWatcher> {
      let claude_dir = root.join(".claude");
      let mut w = notify::recommended_watcher(move |res: notify::Result<Event>| {
          if res.is_ok() { /* push onto a debounce channel */ }
      })?;
      w.watch(&claude_dir, RecursiveMode::Recursive)?;
      Ok(w)
  }
  ```
  A 250ms debounce collapses bursts; re-read the state and emit `project://state` only when it differs from the last snapshot.
- Do not touch: anything outside `{root}/.claude`. Watching the whole project root would pick up `node_modules` and `target` and swamp the app.
- Edge cases: `.claude/` may not exist yet, so watch the project root non-recursively until it appears, then switch; `/ec-execute` rewrites the plan file once per completed task, which is exactly the burst the debounce exists for; the watcher must be dropped when a project is removed or the file handle leaks.
- ⚠️ Breaking change: none
- Acceptance: a checkbox flipping in a plan file reaches the UI within roughly a quarter second, and a long `/ec-execute` run does not flood or stall the app.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`, and `grep -c 'RecursiveMode' src/watcher.rs` → at least `1`
- Rollback: `rm studio/src-tauri/src/watcher.rs`
- Dependencies: Task 22

**Task 24 — Bind watcher lifecycle to add/remove** `M`
- File: `studio/src-tauri/src/lib.rs` (modify)
- Anchor: `tauri_plugin_dialog::init()` in `studio/src-tauri/src/lib.rs` (registered by Task 16)
- Reuse: `watcher::watch` (Task 23); `SessionRegistry` pattern (Task 10).
- Code sample:
  ```rust
  #[derive(Default)]
  struct WatcherRegistry(Mutex<HashMap<String, RecommendedWatcher>>);
  ```
  Start watchers for every configured project in `.setup()`; start one in `add_project`; drop one in `remove_project`.
- Do not touch: the PTY registry — watchers and sessions have independent lifetimes, and closing a terminal must not stop watching the project.
- Edge cases: dropping the `RecommendedWatcher` is what stops the thread, so `remove` must take the value out of the map rather than leaving it; a project whose folder was deleted on disk must not prevent the other watchers from starting.
- ⚠️ Breaking change: none
- Acceptance: the set of watched projects always equals the set of configured projects.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`
- Rollback: `cd studio/src-tauri && git checkout -- src/lib.rs`
- Dependencies: Task 23

**Task 25 — types.ts and tauri-api.ts** `M` `[agent: ec-typescript]`
- File: `studio/src/lib/types.ts` (create), `studio/src/lib/tauri-api.ts` (create)
- Anchor: new files — no anchor
- Reuse: the Rust structs serialized in Tasks 15, 18, 21, 22.
- Code sample:
  ```ts
  export type Stage = 'Idle' | 'Brainstorm' | 'Feature' | 'Execute' | 'Review';
  export interface Task { done: boolean; text: string }
  export interface ProjectState { branch: string; stage: Stage; tasks: Task[];
    done: number; total: number; featureTitle: string | null;
    rawPlan: string | null; history: HistoryEntry[]; hasDecision: boolean }

  export const api = {
    listProjects: () => invoke<Project[]>('list_projects'),
    addProject:   () => invoke<Project | null>('add_project'),
    readState:    (path: string) => invoke<ProjectState>('read_project_state', { path }),
  };
  ```
- Do not touch: nothing — new files.
- Edge cases: serde emits `snake_case` by default while the TS side wants `camelCase`; settle it with `#[serde(rename_all = "camelCase")]` on the Rust structs and keep the TS types camelCase — decide once here and apply consistently, because a silent mismatch surfaces as `undefined` in the UI rather than a type error.
- ⚠️ Breaking change: none
- Acceptance: every Rust command is reachable through exactly one typed wrapper, and no component calls `invoke` directly.
- Verify: `cd studio && npx tsc --noEmit` → exit status 0
- Rollback: `rm studio/src/lib/types.ts studio/src/lib/tauri-api.ts`
- Dependencies: Task 24

**Task 26 — styles.css: Design Direction tokens** `M` `[agent: ec-tailwind]` `[design: direction#Tokens]`
- File: `studio/src/styles.css` (create or modify)
- Anchor: new file — no anchor
- Reuse: the exact five colors and two faces from `### Design Direction` above. Do not introduce a sixth color.
- Code sample:
  ```css
  @import "tailwindcss";
  @theme {
    --color-ground:  #0E1116;
    --color-surface: #161A21;
    --color-border:  #232935;
    --color-text:    #E6E9EF;
    --color-muted:   #8A93A5;
    --color-accent:  #4C9AFF;
    --font-ui:   ui-sans-serif, -apple-system, "SF Pro Text", system-ui, sans-serif;
    --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
  }
  ```
  Tailwind 4.3.3 is CSS-first — there is no `tailwind.config.js` to write.
- Do not touch: the Design Direction block in the plan. These values are copied from it, not re-chosen.
- Edge cases: the accent is reserved for the active project and the stage badge only — applying it to buttons or links dilutes the one signal it carries, which the Design Direction calls out explicitly. The app is dark-only by design; there is no light theme and no `prefers-color-scheme` branch.
- ⚠️ Breaking change: none
- Acceptance: every subsequent component styles itself from these tokens, with no raw hex values anywhere else in the frontend.
- Verify: `cd studio && npm run build 2>&1 | tail -3` → completes without error, and `grep -rc '#[0-9A-Fa-f]\{6\}' src/components/ | grep -v ':0$' | wc -l` → `0` (no hex outside the token file; the xterm theme in Task 13 reads from the tokens)
- Rollback: `cd studio && git checkout -- src/styles.css`
- Dependencies: Task 25

**Task 27 — stage-rail.tsx: the four-dot motif** `M` `[agent: ec-react]` `[design: direction#StageRail]`
- File: `studio/src/components/stage-rail.tsx` (create)
- Anchor: new file — no anchor
- Reuse: the `Stage` type from Task 25; tokens from Task 26.
- Code sample:
  ```tsx
  const ORDER = ['Brainstorm', 'Feature', 'Execute', 'Review'] as const;

  export function StageRail({ stage, size = 'sm' }: { stage: Stage; size?: 'sm' | 'md' }) {
    const idx = ORDER.indexOf(stage as typeof ORDER[number]);
    return (
      <div className="flex items-center gap-1" aria-label={`stage: ${stage}`}>
        {ORDER.map((s, i) => (
          <span key={s} title={s} className={dotClass(i, idx, size)} />
        ))}
      </div>
    );
  }
  ```
  Completed dots filled with `--color-muted`, the current one ringed in `--color-accent`, future dots at border weight.
- Do not touch: the stage order. It is fixed by the workflow in `CLAUDE.md` and must read identically in all three placements.
- Edge cases: `Idle` yields `idx === -1`, so no dot is ringed and all four render unfilled — the correct rendering for a project that has never run the workflow; the `aria-label` carries the stage for screen readers since the dots alone convey it visually.
- ⚠️ Breaking change: none
- Acceptance: one component renders the identical four-dot gesture in the sidebar row, the project header, and every history entry.
- Verify: `cd studio && npx tsc --noEmit` → exit status 0
- Rollback: `rm studio/src/components/stage-rail.tsx`
- Dependencies: Task 26

**Task 28 — project-sidebar.tsx** `L` `[agent: ec-react]` `[design: direction#Sidebar]`
- File: `studio/src/components/project-sidebar.tsx` (create)
- Anchor: new file — no anchor
- Reuse: `api.listProjects` / `api.addProject` (Task 25); `StageRail` (Task 27).
- Code sample:
  ```tsx
  export function ProjectSidebar({ projects, activeId, states, onSelect, onAdd, onRemove }: Props) {
    return (
      <nav className="w-64 shrink-0 border-r border-border bg-surface flex flex-col">
        <ul className="flex-1 overflow-y-auto">{projects.map((p) => (
          <li key={p.id}>
            <button onClick={() => onSelect(p.id)}
              className={p.id === activeId ? 'border-l-2 border-accent' : 'border-l-2 border-transparent'}>
              <span className="font-ui truncate">{p.name}</span>
              <StageRail stage={states[p.id]?.stage ?? 'Idle'} />
              <span className="font-mono text-muted">{states[p.id]?.done ?? 0}/{states[p.id]?.total ?? 0}</span>
            </button>
          </li>))}
        </ul>
        <button onClick={onAdd} className="border-t border-border p-3 font-ui">Add Folder</button>
      </nav>
    );
  }
  ```
- Do not touch: nothing — new file.
- Edge cases: the empty state (no projects added) must show a readable invitation to add a folder rather than a blank panel — this is the very first thing a new user sees; long project names truncate rather than wrap, keeping every row one line tall as RHYTHM 1 requires; `0/0` renders for a project with no plan rather than being hidden, so rows stay aligned.
- ⚠️ Breaking change: none
- Acceptance: all added projects are listed with live stage and progress, the active one is unmistakable, and Add Folder opens the native picker.
- Verify: `cd studio && npx tsc --noEmit` → exit status 0
- Rollback: `rm studio/src/components/project-sidebar.tsx`
- Dependencies: Task 27

**Task 29 — task-panel.tsx** `L` `[agent: ec-react]` `[design: direction#TaskPanel]`
- File: `studio/src/components/task-panel.tsx` (create)
- Anchor: new file — no anchor
- Reuse: `ProjectState.tasks` / `.rawPlan` (Task 22); tokens (Task 26).
- Code sample:
  ```tsx
  export function TaskPanel({ state }: { state: ProjectState | null }) {
    if (!state) return <Empty>No project selected</Empty>;
    if (state.tasks.length === 0)
      return state.rawPlan
        ? <pre className="font-mono text-xs whitespace-pre-wrap">{state.rawPlan}</pre>
        : <Empty>No plan yet — run /ec-feature</Empty>;
    return (<ol>{state.tasks.map((t, i) => (
      <li key={i} className="font-mono text-xs flex gap-2">
        <span className={t.done ? 'text-accent' : 'text-muted'}>{t.done ? '✓' : '○'}</span>
        <span className={t.done ? 'text-muted line-through' : 'text-text'}>{t.text}</span>
      </li>))}</ol>);
  }
  ```
- Do not touch: the task text. Render it verbatim, including `[M]`, `[agent: ...]`, and `[design: ...]` tags — they are information, not noise.
- Edge cases: the raw-markdown fallback is the mitigation for parser drift recorded in the decision file and must never be dropped as "dead code"; a 41-task list needs its own scroll container, not page scroll; checkbox state is **display only** — this panel is not interactive, since the CLI is the sole writer.
- ⚠️ Breaking change: none
- Acceptance: tasks tick off in the panel as `/ec-execute` completes them, with no interaction from the user.
- Verify: `cd studio && npx tsc --noEmit` → exit status 0
- Rollback: `rm studio/src/components/task-panel.tsx`
- Dependencies: Task 28

**Task 30 — history-panel.tsx** `M` `[agent: ec-react]` `[design: direction#HistoryPanel]`
- File: `studio/src/components/history-panel.tsx` (create)
- Anchor: new file — no anchor
- Reuse: `ProjectState.history` (Task 21); `StageRail` (Task 27).
- Code sample:
  ```tsx
  export function HistoryPanel({ history }: { history: HistoryEntry[] }) {
    if (history.length === 0) return <Empty>No completed runs yet</Empty>;
    return (<ul>{history.map((h) => (
      <li key={h.file} className="border-b border-border py-2">
        <div className="font-ui truncate">{h.title ?? h.slug}</div>
        <div className="font-mono text-xs text-muted">{h.date} {h.time} · {h.branch}</div>
      </li>))}</ul>);
  }
  ```
- Do not touch: the archive files — display only, no opening or editing in this cycle.
- Edge cases: 13 entries here but 320 in the largest workspace on this machine, so the list caps at a sensible window rather than rendering every row; an entry whose file has no `## Feature:` line falls back to the slug, which is why the slug is parsed at all.
- ⚠️ Breaking change: none
- Acceptance: finished runs are visible as dated history per project, newest first.
- Verify: `cd studio && npx tsc --noEmit` → exit status 0
- Rollback: `rm studio/src/components/history-panel.tsx`
- Dependencies: Task 29

**Task 31 — doctor.rs: the three first-run probes** `M`
- File: `studio/src-tauri/src/doctor.rs` (create), `studio/src-tauri/src/lib.rs` (modify)
- Anchor: new file — no anchor
- Reuse: `shell_env::resolve_claude` (Task 5); `install.sh:8,14` for the commands path and list; `server/worker.py:90` for the health shape.
- Code sample:
  ```rust
  #[derive(Serialize)]
  pub struct Doctor {
      pub claude: Option<String>,
      pub commands_found: usize,   // ec-*.md in ~/.claude/commands
      pub commands_expected: usize,// 11, per install.sh:14
      pub worker_ok: bool,
  }

  #[tauri::command]
  pub fn run_doctor(override_path: Option<String>) -> Doctor { /* never Err */ }
  ```
  The worker probe is a 1-second-timeout `GET http://127.0.0.1:37777/health` checking for `"status":"ok"`.
- Do not touch: the worker. Probe it; never start, stop, or restart it.
- Edge cases: the worker being offline is a warning, not a blocker — memory is optional and the app must stay fully usable without it; the timeout must be short or a dead port stalls the first screen; a partial commands install (say 7 of 11) must read as "incomplete", not as "installed".
- ⚠️ Breaking change: none
- Acceptance: the app can state precisely which of the three prerequisites are present on this machine.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`, and `grep -c '37777' src/doctor.rs` → `1`
- Rollback: `rm studio/src-tauri/src/doctor.rs && git checkout -- src/lib.rs`
- Dependencies: Task 30

**Task 32 — doctor-screen.tsx** `L` `[agent: ec-react]` `[design: direction#DoctorScreen]`
- File: `studio/src/components/doctor-screen.tsx` (create)
- Anchor: new file — no anchor
- Reuse: `run_doctor` (Task 31); tokens (Task 26).
- Code sample:
  ```tsx
  export function DoctorScreen({ doctor, onInstall, onRecheck, onContinue }: Props) {
    const blocking = !doctor.claude || doctor.commandsFound < doctor.commandsExpected;
    return (
      <section className="m-auto max-w-md font-ui">
        <Check ok={!!doctor.claude} label="claude CLI"
               detail={doctor.claude ?? 'not found — set the path in Settings'} />
        <Check ok={doctor.commandsFound >= doctor.commandsExpected} label="EffiClaude commands"
               detail={`${doctor.commandsFound}/${doctor.commandsExpected} in ~/.claude/commands`} />
        <Check ok={doctor.workerOk} label="worker (optional)"
               detail={doctor.workerOk ? 'online' : 'offline — memory unavailable'} />
        {blocking && <button onClick={onInstall}>Install EffiClaude</button>}
      </section>
    );
  }
  ```
- Do not touch: the shell layout — this screen replaces it while prerequisites are missing.
- Edge cases: the worker row is explicitly non-blocking and must be visually distinct from the two that are; after a successful install the screen re-checks rather than requiring a restart; the claude row must offer the manual path override, since a Homebrew or nvm install can defeat even the login-shell probe.
- ⚠️ Breaking change: none
- Acceptance: someone who installs the `.dmg` on a machine with no EffiClaude is told exactly what is missing and can fix it in one click.
- Verify: `cd studio && npx tsc --noEmit` → exit status 0
- Rollback: `rm studio/src/components/doctor-screen.tsx`
- Dependencies: Task 31

**Task 33 — Bundle install.sh and wire the install command** `M`
- File: `studio/src-tauri/tauri.conf.json` (modify), `studio/src-tauri/src/lib.rs` (modify)
- Anchor: `"bundle"` in `studio/src-tauri/tauri.conf.json` (written by Task 1)
- Reuse: the repo's own `install.sh`; the PTY from Tasks 7–11.
- Code sample:
  ```json
  "bundle": { "resources": { "../../install.sh": "install.sh" } }
  ```
  ```rust
  #[tauri::command]
  fn install_efficlaude(app: tauri::AppHandle, reg: tauri::State<pty::SessionRegistry>) -> Result<(), String> {
      let script = app.path().resolve("install.sh", BaseDirectory::Resource).map_err(|e| e.to_string())?;
      // spawn `bash <script>` into a PTY under the reserved id "__install__"
  }
  ```
- Do not touch: `install.sh` itself. It is bundled byte-for-byte; a copy that drifts from the repo's would install a different EffiClaude than the one it shipped with.
- Edge cases: running the installer in the PTY means its output is visible and its prompts answerable in the terminal the user is already looking at; the reserved `__install__` session id must not collide with a project id, which is why project ids are path-derived; the resource path differs between `dev` and a bundled `.app`, so `resolve` is required and a hardcoded relative path will fail only in the shipped build.
- ⚠️ Breaking change: none
- Acceptance: the `.dmg` installs EffiClaude itself, turning it into a front door rather than only a viewer.
- Verify: `cd studio/src-tauri && cargo build 2>&1 | tail -2` → `Finished`, and `python3 -c "import json;print('install.sh' in json.dumps(json.load(open('tauri.conf.json'))))"` → `True`
- Rollback: `cd studio/src-tauri && git checkout -- tauri.conf.json src/lib.rs`
- Dependencies: Task 32

**Task 34 — app.tsx: three-pane layout and state wiring** `L` `[agent: ec-react]` `[design: direction#AppShell]`
- File: `studio/src/App.tsx` (modify)
- Anchor: `export default function App` in `studio/src/App.tsx` (written by Task 1)
- Reuse: every component from Tasks 13, 27–30, 32; `api` from Task 25.
- Code sample:
  ```tsx
  // doctor gates the shell
  if (doctor && blocking(doctor)) return <DoctorScreen ... />;
  return (
    <div className="h-screen flex bg-ground text-text">
      <ProjectSidebar ... />
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-10 flex items-center gap-3 border-b border-border px-3">
          <span className="font-ui">{active?.name}</span>
          <StageRail stage={state?.stage ?? 'Idle'} size="md" />
        </header>
        <TerminalPane key={active.id} projectId={active.id} cwd={active.path} />
      </main>
      <aside className="w-80 shrink-0 border-l border-border overflow-y-auto">
        <TaskPanel state={state} />
        <HistoryPanel history={state?.history ?? []} />
      </aside>
    </div>
  );
  ```
  Subscribe once to `project://state` and keep a `Record<projectId, ProjectState>` so background projects stay current.
- Do not touch: `TerminalPane`'s internals — switching projects remounts it via `key`, which is what keeps each project's scrollback distinct.
- Edge cases: PTYs must stay alive for background projects, so panes are kept mounted and hidden rather than unmounted on switch — unmounting would kill a running `/ec-execute`; the state map must be keyed by project id or a slow watcher callback can write one project's state into another's panel.
- ⚠️ Breaking change: none
- Acceptance: the app is usable end to end — pick a project, run a command, watch its tasks tick, switch to another project running concurrently.
- Verify: `cd studio && npx tsc --noEmit` → exit status 0, and `npm run build 2>&1 | tail -3` → completes without error
- Rollback: `cd studio && git checkout -- src/App.tsx`
- Dependencies: Task 33

**Task 35 — PTY cleanup on window close and app exit** `M`
- File: `studio/src-tauri/src/lib.rs` (modify)
- Anchor: `.manage(pty::SessionRegistry::default())` in `studio/src-tauri/src/lib.rs` (registered by Task 11)
- Reuse: `PtySession::kill` (Task 9).
- Code sample:
  ```rust
  .on_window_event(|window, event| {
      if let tauri::WindowEvent::Destroyed = event {
          if let Some(reg) = window.app_handle().try_state::<pty::SessionRegistry>() {
              for (_, s) in reg.0.lock().unwrap().iter_mut() { s.kill(); }
          }
      }
  })
  ```
- Do not touch: `studio.json`. Closing the app must not forget the user's projects.
- Edge cases: a `claude` left running after the window closes keeps a CPU-consuming process with no UI attached and would silently accumulate one per launch; `kill()` already calls `wait()` (Task 9), which is what prevents zombies.
- ⚠️ Breaking change: none
- Acceptance: after quitting the app, no `claude` process it started remains alive.
- Verify: launch the app, open two project terminals, quit, then `pgrep -fl claude | grep -v grep | wc -l` → `0`
- Rollback: `cd studio/src-tauri && git checkout -- src/lib.rs`
- Dependencies: Task 34

**Task 36 — tauri.conf.json: bundle identity and dmg targets** `M`
- File: `studio/src-tauri/tauri.conf.json` (modify)
- Anchor: `"bundle"` in `studio/src-tauri/tauri.conf.json` (extended by Task 33)
- Reuse: the `$(uname -s)-$(uname -m)` artifact convention from `install.sh:195`.
- Code sample:
  ```json
  {
    "productName": "EffiClaude Studio",
    "version": "1.25.0",
    "identifier": "id.kaeltech.efficlaude.studio",
    "bundle": {
      "active": true,
      "targets": ["dmg"],
      "macOS": { "minimumSystemVersion": "11.0", "signingIdentity": "-" }
    }
  }
  ```
  `"signingIdentity": "-"` is ad-hoc signing. Replacing it with a Developer ID later is a one-line change, which is the whole point of setting it explicitly now.
- Do not touch: the repo `VERSION` file (1.25.0). The app version is copied from it, not the reverse.
- Edge cases: an identifier ending in `.app` is rejected by macOS; `minimumSystemVersion` below 11.0 cannot support arm64; omitting `signingIdentity` entirely produces an unsigned bundle that Gatekeeper treats worse than an ad-hoc signed one.
- ⚠️ Breaking change: none
- Acceptance: the bundle carries a stable identity and is configured to produce a `.dmg`.
- Verify: `cd studio/src-tauri && python3 -c "import json;c=json.load(open('tauri.conf.json'));print(c['identifier'],c['bundle']['targets'],c['bundle']['macOS']['signingIdentity'])"` → prints `id.kaeltech.efficlaude.studio ['dmg'] -`
- Rollback: `cd studio/src-tauri && git checkout -- tauri.conf.json`
- Dependencies: Task 35

**Task 37 — App icons** `S` `[design: direction#AppIcon]`
- File: `studio/src-tauri/icons/*` (replace)
- Anchor: new files — no anchor (the scaffold's placeholder icons are overwritten)
- Reuse: the four-dot stage rail from the Design Direction — the icon is that motif, not a new mark.
- Code sample:
  ```bash
  cd studio && npx @tauri-apps/cli icon path/to/icon-1024.png
  ```
  Source art: four dots on the `#0E1116` ground, three filled `#8A93A5` and one ringed `#4C9AFF`.
- Do not touch: the generated filenames — `tauri.conf.json` references them by name.
- Edge cases: the source must be 1024×1024 PNG with alpha or the generator produces blurry small sizes; at 16pt the four dots merge, so the icon uses the same motif with larger dots rather than a different mark.
- ⚠️ Breaking change: none
- Acceptance: the app carries its own identity in the Dock and Finder, using the motif the UI repeats.
- Verify: `test -f studio/src-tauri/icons/icon.icns && test -f studio/src-tauri/icons/128x128@2x.png && echo OK` → prints `OK`
- Rollback: `cd studio && git checkout -- src-tauri/icons`
- Dependencies: Task 36

**Task 38 — Build the .dmg for arm64 and x86_64** `M`
- File: none — build output only
- Anchor: n/a
- Reuse: the `cargo build --release` precedent at `install.sh:174-190`.
- Code sample:
  ```bash
  cd studio
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  npm run tauri build -- --target aarch64-apple-darwin
  npm run tauri build -- --target x86_64-apple-darwin
  ```
  Rename the outputs to `EffiClaude-Studio-1.25.0-Darwin-arm64.dmg` and `...-Darwin-x86_64.dmg`, matching `etok-$(uname -s)-$(uname -m)` from `install.sh:195`.
- Do not touch: the GitHub release itself. Building the artifact is in scope; publishing it is a git operation and belongs to `/ec-git`.
- Edge cases: the x86_64 cross-build needs that rustup target installed or it fails late, after the frontend has already been rebuilt; a release build takes several minutes, which is expected, not a hang.
- ⚠️ Breaking change: none
- Acceptance: two installable `.dmg` files exist, one per architecture, named to the repo's existing convention.
- Verify: `ls studio/src-tauri/target/*/release/bundle/dmg/*.dmg | wc -l` → `2`
- Rollback: `rm -rf studio/src-tauri/target/*/release/bundle`
- Dependencies: Task 37

**Task 39 — README: the Studio section** `S`
- File: `README.md` (modify)
- Anchor: `## The workflow` → `README.md:50` (confirmed in Grounding)
- Reuse: the heading voice of the surrounding sections — `## Install` at `:35` is the nearest model.
- Code sample: insert immediately **above** line 50:
  ```markdown
  ## Studio (macOS app)

  A desktop window over the same workflow: add your project folders, get a terminal
  wired to your own `claude` in each one, and watch tasks tick off as `/ec-execute` runs.

  Download the `.dmg` from [Releases](https://github.com/kaeltech-id/EffiClaude/releases),
  drag it to Applications, then **right-click → Open** the first time — the app is
  ad-hoc signed, not notarized, so a plain double-click is refused by Gatekeeper.

  macOS 11+ only. Studio reads your projects' `.claude/` folders and never writes to them.
  ```
- Do not touch: any other line of `README.md`. The file goes from 207 lines to 207 plus this block, and no existing heading moves relative to another.
- Edge cases: the right-click→Open instruction is the single most important line for anyone who is not the author — without it the app looks broken on first launch; the macOS-only scope is stated here because the rest of the README describes a cross-platform tool.
- ⚠️ Breaking change: none
- Acceptance: a reader of the README learns Studio exists, how to install it, and how to get past Gatekeeper.
- Verify: `grep -c '^## ' README.md` → `9` (baseline 8 from Grounding, plus exactly one), and `grep -n '^## Studio (macOS app)' README.md` → a line number less than the new line number of `## The workflow`
- Rollback: `git checkout -- README.md`
- Dependencies: Task 38

**Task 40 — Prove the app writes nothing into a managed project** `M`
- File: none — verification only
- Anchor: n/a
- Reuse: the constraint recorded in `.claude/decisions/main.md` under `## Constraints`.
- Code sample:
  ```bash
  touch /tmp/studio-marker
  # launch the app, add this repo, open a terminal, switch projects, quit — but run no /ec-* command
  find /Users/admin/Developer/Projects/EffiClaude/.claude -newer /tmp/studio-marker
  ```
- Do not touch: nothing is modified by this task.
- Edge cases: the test is only meaningful if no `/ec-*` command is run during it, since those legitimately write; `.claude/plans/.exec-session` is written by `/ec-execute`, not by the app, so its presence in the output would mean a real violation.
- ⚠️ Breaking change: none
- Acceptance: the app is proven to be a reader. This is the constraint that makes it safe to point at any repo on the machine.
- Verify: the `find` command above prints nothing (zero lines)
- Rollback: n/a — nothing is written
- Dependencies: Task 39

**Task 41 — Re-run the Python suite and confirm non-interference** `S`
- File: none — verification only
- Anchor: n/a
- Reuse: the baseline recorded in Grounding.
- Code sample:
  ```bash
  cd /Users/admin/Developer/Projects/EffiClaude && python3 -m pytest -q
  ```
- Do not touch: `tests/`. Not one test is added or changed by this plan — Studio is a separate subtree with no Python surface.
- Edge cases: any change in the count means something outside `studio/` was touched, which would be a violation of this plan's constraints rather than a test problem.
- ⚠️ Breaking change: none
- Acceptance: the existing toolkit is provably unaffected by the whole feature.
- Verify: `python3 -m pytest -q 2>&1 | tail -1` → contains `124 passed` (identical to the Grounding baseline)
- Rollback: n/a — nothing is written
- Dependencies: Task 40
