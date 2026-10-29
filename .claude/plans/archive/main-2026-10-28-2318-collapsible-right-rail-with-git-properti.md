## Feature: Collapsible Right Rail with Git Properties

### Impact Analysis
- Files affected: `studio/src-tauri/src/shell_env.rs`, `studio/src-tauri/src/git.rs` (new), `studio/src-tauri/src/projects.rs`, `studio/src-tauri/src/lib.rs`, `studio/src/lib/types.ts`, `studio/src/lib/tauri-api.ts`, `studio/src/components/panel-section.tsx` (new), `studio/src/components/properties-panel.tsx` (new), `studio/src/App.tsx`
- ⚠️ Breaking change risk:
  - `StudioConfig` gains a `panels` field. Backward compatible because every existing field already carries `#[serde(default)]` (`projects.rs:40-45`), so a `studio.json` written by the current build loads with all sections open.
  - `task-panel.tsx` and `history-panel.tsx` are NOT modified — `PanelSection` wraps them, so their own scroll containers keep working. Listed here because a reader would expect them to change and they deliberately do not.

### Reusable Existing Code
- `studio/src-tauri/src/shell_env.rs:8-13` (`login_shell_path`) — the cached `OnceLock` login-shell PATH probe; this is how a Finder-launched GUI process reaches the user's tools, and it is why resolving a git binary is possible at all
- `studio/src-tauri/src/shell_env.rs:36-62` (`resolve_claude`) — the exact shape `resolve_git` copies: walk the login PATH, then fall back to known absolute locations, then return a stated error
- `studio/src/components/tree-row.tsx:38-52` — the `▸`/`▾` chevron with `aria-expanded` and a separate hit target; `PanelSection` reuses that gesture so "this opens" reads identically in the sidebar and the rail
- `studio/src/components/history-panel.tsx:6` (`WINDOW` + `+N older`) and `project-sidebar.tsx` (`MAX_CHILDREN`) — the named-cap-with-stated-count pattern, reused for the branch list
- `studio/src-tauri/src/doctor.rs:66-67` and `plan.rs:188-190` — commands that return a report in every case rather than `Err`; `git_info` follows them, while the two write commands deliberately do not
- `studio/src-tauri/src/projects.rs:27-41` (`load`/`save`) and `:40-45` (`StudioConfig`) — the established config read/write, extended with one optional field rather than a second persistence mechanism
- `studio/src-tauri/src/plan.rs:188` (`read_project_state`) — called by the frontend after a successful checkout to refresh stage and tasks, since the watcher cannot see `.git/HEAD`
- `studio/src/components/git-mark.tsx:7-11` — glyph-and-weight carries state with no new hue; the branch list follows it

### Design Direction
- Dials: ENERGY 1 · RHYTHM 1 · MOTION 1 — carried forward verbatim from the previous Studio cycles, not re-chosen. The app is an instrument panel watched for long stretches while the real work happens in the terminal beside it, so it recedes (ENERGY 1). Three stacked sections with identical headers are the same shape repeated, which is what keeps a tall rail scannable (RHYTHM 1). The only motion is a chevron, the same single gesture the sidebar already allows; a panel that slid or eased open would add a second kind of movement competing with the one signal that matters, a checkbox flipping (MOTION 1).
- Palette: ground `#0E1116`, surface `#161A21`, border `#232935`, text `#E6E9EF`, muted `#8A93A5`, accent `#4C9AFF` — reason: unchanged, and the accent stays reserved for the active project and the stage badge. Git state spends no new hue: the current branch reads at text weight, other branches at muted weight, and an error block is set apart by a border and monospace rather than by red, the same discipline `doctor-screen.tsx:18` and `git-mark.tsx` already follow.
- Typography: SF Pro (system) for section headers and labels; SF Mono for branch names, git's error text, and counts — reason: a branch name is an identifier and git's stderr is terminal output; both only read correctly monospaced, and the error must be copy-pasteable into a terminal without reformatting.
- Identity motif: the fixed five-dot stage rail — brainstorm · plan · refine · execute · review — rendered identically in the sidebar row, the project header, and every history entry. The `▸`/`▾` chevron is the app's second repeated gesture, and this cycle extends it from tree rows to panel headers.
- Rules: apply ~/.claude/agents/ec-antislop.md in full — hard gates, purpose gates, quality locks

### Grounding
Measured 2026-10-28 — real command output only, never predicted.

Baseline line counts (`wc -l`):
- `studio/src/App.tsx` → 208
- `studio/src/components/task-panel.tsx` → 35 · `history-panel.tsx` → 38 · `tree-row.tsx` → 86
- `studio/src/lib/types.ts` → 69 · `studio/src/lib/tauri-api.ts` → 64
- `studio/src-tauri/src/lib.rs` → 216 · `projects.rs` → 166 · `shell_env.rs` → 62 · `plan.rs` → 226

New files confirmed ABSENT on disk:
- `studio/src-tauri/src/git.rs` → absent
- `studio/src/components/panel-section.tsx` → absent
- `studio/src/components/properties-panel.tsx` → absent

Baseline string counts (`grep -c`) — every one is 0 today, so each Verify below traces 0 → n:
- `pub fn resolve_git` in shell_env.rs → 0
- `mod git;` in lib.rs → 0 · `git::` in lib.rs → 0
- `pub struct PanelState` in projects.rs → 0 · `pub fn set_panels` in projects.rs → 0
- `export interface GitInfo` in types.ts → 0 · `export interface PanelState` in types.ts → 0
- `gitInfo:` / `gitCheckout:` / `gitCreateBranch:` / `setPanels:` in tauri-api.ts → 0 each
- `<PanelSection` in App.tsx → 0 · `PropertiesPanel` in App.tsx → 0

Baseline test and build results:
- `python3 -m pytest tests/ server/tests/ -q` → **282 passed**, 1 warning, 3.91s
- `cd studio && npm run build` → exit 0
- `cd studio && cargo check --manifest-path src-tauri/Cargo.toml` → exit 0

Environment facts measured on this machine (they decide the implementation):
- `git` resolves to a **shell function**, the etok wrapper `install.sh` appends to `.zshrc`, which pipes `status|log|diff|branch|stash` through `$ETOK`. The real binary behind it reports `git version 2.54.0 (Apple Git-157)`.
- `.git/packed-refs` exists while `.git/refs/heads/` holds only `main`, so a loose-ref listing would silently omit packed branches.

Verified anchors:
- `const FALLBACKS: [&str; 3] = [".local/bin/claude", ".claude/local/claude", "bin/claude"];` → `shell_env.rs:34`
- `pub fn resolve_claude(override_path: Option<&str>) -> Result<PathBuf, String> {` → `shell_env.rs:36`
- `pub struct StudioConfig {` → `projects.rs:40`
- `pub claude_override: Option<String>,` → `projects.rs:44`
- `pub fn claude_override() -> Option<String> {` → `projects.rs:154`
- `mod doctor;` → `lib.rs:1`
- `.invoke_handler(tauri::generate_handler![` → `lib.rs:188`
- `            promote_project` → `lib.rs:204` (current last handler entry)
- `export interface ProjectState {` → `types.ts:42`
- `export interface Doctor {` → `types.ts:57`
- `  readState: (path: string) => invoke<ProjectState>('read_project_state', { path }),` → `tauri-api.ts:31`
- `      <aside className="flex w-80 shrink-0 flex-col border-l border-border">` → `App.tsx:198`
- `          <TaskPanel state={activeState} />` → `App.tsx:200`
- git.rs, panel-section.tsx, properties-panel.tsx → new file — no anchor

### Tasks
- [x] Task 1: Add resolve_git to shell_env.rs [S] — resolve the git binary from the login PATH with absolute fallbacks
- [x] Task 2: Create git.rs with GitInfo, BranchInfo and MAX_BRANCHES [S] — the wire types and the branch-list cap
- [x] Task 3: Add git_info command to git.rs [M] — current branch, detached detection, and the local branch list via the binary
- [x] Task 4: Add git_checkout command to git.rs [M] — checkout an existing branch, surfacing git's stderr verbatim on refusal
- [x] Task 5: Add git_create_branch command to git.rs [S] — create and switch to a new branch from the current one
- [x] Task 6: Add PanelState and its commands to projects.rs [M] — collapse preference persisted in studio.json, additive and optional
- [x] Task 7: Register the git module and the five new commands in lib.rs [S] — wire everything into the Tauri handler
- [x] Task 8: Add GitInfo, BranchInfo and PanelState to types.ts [S] [agent: ec-typescript] — the TS mirror of the Rust wire types
- [x] Task 9: Add the five command wrappers to tauri-api.ts [S] [agent: ec-typescript] — the typed boundary for git and panel state
- [x] Task 10: Create panel-section.tsx with PanelSection [M] [agent: ec-react] [design: direction#PanelSection] — the collapsible section frame reusing the tree chevron
- [x] Task 11: Create properties-panel.tsx with PropertiesPanel [L] [agent: ec-react] [design: direction#PropertiesPanel] — branch display, capped branch list, checkout, create, verbatim error block
- [x] Task 12: Rewrite the App.tsx right rail as three collapsible sections [M] [agent: ec-react] [design: direction#RightRail] — Properties, Tasks, History with persisted collapse state
- [x] Task 13: Wire git properties and its handlers in App.tsx [M] [agent: ec-react] [design: direction#RightRail] — load git info, checkout, create branch, refresh state after a switch

### Per Task Detail

**Task 1 — Add resolve_git to shell_env.rs** `S`
- File: `studio/src-tauri/src/shell_env.rs`
- Anchor: `const FALLBACKS: [&str; 3] = [".local/bin/claude", ".claude/local/claude", "bin/claude"];` at `shell_env.rs:34`
- Reuse: `resolve_claude` at `shell_env.rs:36-62` — the same PATH walk and fallback shape; `login_shell_path()` at `:8` unchanged
- Code sample:
  ```rust
  /// Absolute fallbacks, not $HOME-relative like FALLBACKS: git is a system or
  /// package-manager binary, never a per-user install.
  const GIT_FALLBACKS: [&str; 3] = ["/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"];

  /// The BINARY, resolved to an absolute path on purpose. On this machine `git`
  /// is a shell function — the etok wrapper install.sh appends to .zshrc — which
  /// pipes `branch` and other subcommands through $ETOK. Running git through a
  /// login shell would therefore return an optimised summary instead of a real
  /// branch list, so every caller must exec this path directly.
  pub fn resolve_git() -> Result<PathBuf, String> {
      for dir in login_shell_path().split(':').filter(|d| !d.is_empty()) {
          let candidate = PathBuf::from(dir).join("git");
          if candidate.is_file() {
              return Ok(candidate);
          }
      }
      for fallback in GIT_FALLBACKS {
          let candidate = PathBuf::from(fallback);
          if candidate.is_file() {
              return Ok(candidate);
          }
      }
      Err("git binary not found on PATH".into())
  }
  ```
- Do not touch: `login_shell_path`, `probe`, `FALLBACKS`, and `resolve_claude` — all unchanged. In particular `probe`'s last-non-empty-line parsing and its recorded reason stay as they are.
- Edge cases: a PATH entry that does not exist is skipped by `is_file()`; a git shim on PATH that is itself a wrapper script still resolves, which is acceptable because it is a real executable rather than a shell function; failure returns a stated error that the Properties panel renders as a disabled state
- Acceptance: the app can obtain an absolute path to a real git executable without going through the user's shell
- Verify (local): `grep -c 'pub fn resolve_git' studio/src-tauri/src/shell_env.rs` → `== 1` (baseline 0)
- Dependencies: none

**Task 2 — Create git.rs with GitInfo, BranchInfo and MAX_BRANCHES** `S`
- File: `studio/src-tauri/src/git.rs`
- Reuse: `plan.rs:177-179` — the camelCase-on-the-wire convention and its recorded reason (a silent mismatch surfaces as `undefined` in a panel rather than a type error); `history-panel.tsx:6` for the cap-with-stated-count shape
- Code sample:
  ```rust
  use crate::shell_env;
  use serde::Serialize;
  use std::path::Path;
  use std::process::Command;

  /// Capped and the remainder reported as a count, the same contract
  /// history-panel.tsx uses for archived runs. A repository with hundreds of
  /// branches must cost a bounded render.
  const MAX_BRANCHES: usize = 50;

  #[derive(Serialize, Clone)]
  #[serde(rename_all = "camelCase")]
  pub struct BranchInfo {
      pub name: String,
      pub current: bool,
  }

  /// `detached` is carried explicitly rather than inferred from an empty branch
  /// name: plan.rs:169-171 falls back to the literal string "default" when
  /// `.git/HEAD` holds no ref, which would otherwise read as a branch actually
  /// named "default".
  #[derive(Serialize, Clone)]
  #[serde(rename_all = "camelCase")]
  pub struct GitInfo {
      pub available: bool,
      pub branch: Option<String>,
      pub detached: bool,
      pub branches: Vec<BranchInfo>,
      pub hidden: usize,
      /// Why git state could not be read — a missing binary, or a path that is
      /// not a work tree. Rendered as a disabled state, never as a crash.
      pub error: Option<String>,
  }
  ```
- Do not touch: `plan.rs` — `current_branch` keeps reading `.git/HEAD` directly because the watcher calls it per debounced event and must not acquire a subprocess dependency
- Edge cases: a path that is not a git work tree yields `available: false` with a stated error rather than an empty success; `hidden` is 0 when the branch count is at or under the cap
- Acceptance: the wire types for git state exist, carrying the branch, an explicit detached flag, a capped branch list, a withheld count, and a reason when state could not be read
- Verify (local): `grep -c 'pub struct GitInfo' studio/src-tauri/src/git.rs` → `== 1` AND `grep -c 'const MAX_BRANCHES' studio/src-tauri/src/git.rs` → `== 1` (both baseline 0 — new file)
- Dependencies: none

**Task 3 — Add git_info command to git.rs** `M`
- File: `studio/src-tauri/src/git.rs`
- Anchor: `pub struct GitInfo` — the command goes after the structs
- Reuse: `shell_env::resolve_git` from Task 1; `doctor.rs:66-67` — the infallible-report convention, since a folder with no git is a UI state rather than an error dialog
- Code sample:
  ```rust
  /// One helper for every git call: the resolved BINARY with an explicit `-C`,
  /// never a shell. A login shell would hit the etok function wrapper and pipe
  /// `branch` output through the token optimiser.
  fn run(root: &Path, args: &[&str]) -> Result<String, String> {
      let git = shell_env::resolve_git()?;
      let out = Command::new(git)
          .arg("-C")
          .arg(root)
          .args(args)
          .output()
          .map_err(|e| e.to_string())?;
      if out.status.success() {
          Ok(String::from_utf8_lossy(&out.stdout).into_owned())
      } else {
          // stderr verbatim: git already writes the right message, and the user
          // fixes it themselves. Never reworded, never truncated.
          Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
      }
  }

  /// Never `Err` — a folder without git is a report, not a failure.
  #[tauri::command]
  pub fn git_info(path: String) -> GitInfo {
      let root = Path::new(&path);
      let empty = |error: String| GitInfo {
          available: false, branch: None, detached: false,
          branches: Vec::new(), hidden: 0, error: Some(error),
      };

      // --quiet exits non-zero outside a work tree, which is the cheapest probe.
      if let Err(e) = run(root, &["rev-parse", "--is-inside-work-tree"]) {
          return empty(e);
      }

      // symbolic-ref fails on a detached HEAD, which is exactly how it is detected.
      let head = run(root, &["symbolic-ref", "--short", "HEAD"]);
      let (branch, detached) = match &head {
          Ok(name) => (Some(name.trim().to_string()), false),
          Err(_) => (None, true),
      };

      // `branch --format` covers loose AND packed refs; reading .git/refs/heads/
      // would silently omit every packed branch, and .git/packed-refs exists here.
      let listed = run(root, &["branch", "--format=%(refname:short)"]).unwrap_or_default();
      let all: Vec<&str> = listed.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
      let hidden = all.len().saturating_sub(MAX_BRANCHES);
      let branches = all
          .into_iter()
          .take(MAX_BRANCHES)
          .map(|name| BranchInfo {
              current: Some(name) == branch.as_deref(),
              name: name.to_string(),
          })
          .collect();

      GitInfo { available: true, branch, detached, branches, hidden, error: None }
  }
  ```
- Do not touch: `watcher.rs` — reading git state is user-initiated and attaches no watcher; `plan.rs`'s hot path is likewise untouched
- Edge cases: a brand-new repository with no commits has no branches and `symbolic-ref` succeeds, so it reports its branch with an empty list; a detached HEAD reports `detached: true` and `branch: None`; a missing binary surfaces `resolve_git`'s error through the same `error` field
- Acceptance: asking for a folder's git state returns its current branch or an explicit detached flag, every local branch including packed ones, and a withheld count when the cap applies — without ever invoking a shell
- Verify (local): `grep -c 'pub fn git_info' studio/src-tauri/src/git.rs` → `== 1` (baseline 0) AND `grep -c 'ilc' studio/src-tauri/src/git.rs` → `== 0` (proves no login-shell invocation, which is the whole point of Task 1)
- Dependencies: Task 1, Task 2

**Task 4 — Add git_checkout command to git.rs** `M`
- File: `studio/src-tauri/src/git.rs`
- Anchor: `pub fn git_info` — the write commands go after the read
- Reuse: the `run` helper from Task 3, including its verbatim-stderr behaviour, which is the entire error story for this command
- Code sample:
  ```rust
  /// Returns `Err` with git's own stderr on refusal — most often uncommitted
  /// changes that would be overwritten. Deliberately NO --force and NO
  /// --autostash: the user fixes the tree themselves, which is what they asked
  /// for and what keeps /ec-git the only thing that writes history.
  #[tauri::command]
  pub fn git_checkout(path: String, branch: String) -> Result<GitInfo, String> {
      run(Path::new(&path), &["checkout", &branch])?;
      Ok(git_info(path))
  }
  ```
- Do not touch: nothing may add `--force`, `-f`, `--autostash`, `stash`, `commit`, `push`, `pull`, `merge` or `reset` to this module — the Constraints forbid every one of them
- ⚠️ Breaking change: this is the first code in the app that mutates the working tree. It runs only from an explicit click, performs exactly one git subcommand, and returns git's refusal unchanged rather than retrying with force.
- Edge cases: a dirty tree is refused by git and its message is surfaced as-is; a branch name that does not exist is likewise refused by git rather than pre-validated, so the message the user sees is git's own; on success the fresh `GitInfo` is returned so the panel does not wait for a watcher event that will never arrive, since `watcher.rs:25-35` watches only `.claude/`
- Acceptance: clicking a branch switches to it when the tree is clean, and when it is not, git's exact refusal appears in the panel and the branch is unchanged
- Verify (local): `grep -c 'pub fn git_checkout' studio/src-tauri/src/git.rs` → `== 1` (baseline 0) AND `grep -vE '^\s*//' studio/src-tauri/src/git.rs | grep -cE '\-\-force|\-\-autostash|"stash"|"commit"|"push"|"reset"'` → `== 0` (comment lines excluded on purpose: this task's own doc comment names the flags it refuses, so a file-wide count could only reach 0 by deleting that comment — the check is on executable code)
- Dependencies: Task 3

**Task 5 — Add git_create_branch command to git.rs** `S`
- File: `studio/src-tauri/src/git.rs`
- Anchor: `pub fn git_checkout` — appended after it
- Reuse: the `run` helper and its verbatim-stderr behaviour
- Code sample:
  ```rust
  /// `checkout -b`, which creates from the current HEAD and switches in one
  /// step — the same thing the user's `gcb` alias does. A duplicate name is
  /// refused by git, so no name validation happens here.
  #[tauri::command]
  pub fn git_create_branch(path: String, name: String) -> Result<GitInfo, String> {
      run(Path::new(&path), &["checkout", "-b", &name])?;
      Ok(git_info(path))
  }
  ```
- Do not touch: the same forbidden-subcommand list as Task 4; no branch deletion or rename is added
- Edge cases: an existing branch name is refused by git and the message surfaced; an empty or whitespace-only name is rejected in the UI before the call, since git's message for it is unhelpful; a dirty tree can still block `checkout -b`, and that refusal surfaces identically
- Acceptance: entering a new branch name creates it from the current branch and switches to it, and a name git rejects produces git's own message with no branch created
- Verify (local): `grep -c 'pub fn git_create_branch' studio/src-tauri/src/git.rs` → `== 1` (baseline 0)
- Dependencies: Task 3

**Task 6 — Add PanelState and its commands to projects.rs** `M`
- File: `studio/src-tauri/src/projects.rs`
- Anchor: `pub claude_override: Option<String>,` at `projects.rs:44`
- Reuse: `load`/`save` at `projects.rs:27-41` unchanged; `claude_override`/`set_claude_override` at `:154` as the precedent for a persisted preference pair
- Code sample:
  ```rust
  /// Which rail sections are collapsed. Persisted, unlike the sidebar's
  /// expansion state: that is a transient view of the filesystem, while a
  /// collapsed panel is a preference the user expects to survive a relaunch.
  /// Default is all sections open, so an older studio.json needs no migration.
  #[derive(Serialize, Deserialize, Clone, Default)]
  #[serde(rename_all = "camelCase", default)]
  pub struct PanelState {
      pub properties_collapsed: bool,
      pub tasks_collapsed: bool,
      pub history_collapsed: bool,
  }
  ```
  `StudioConfig` gains `#[serde(default)] pub panels: PanelState,` and a command pair mirroring the override pair:
  ```rust
  #[tauri::command]
  pub fn panels() -> PanelState {
      load().panels
  }

  #[tauri::command]
  pub fn set_panels(panels: PanelState) -> Result<(), String> {
      let mut cfg = load();
      cfg.panels = panels;
      save(&cfg)
  }
  ```
- Do not touch: `Project`, `ProjectView`, `stored_projects`, `promote_project`, `add_project`, `remove_project`, `list_projects`, `config_path` and its comment, `project_id`, and the two `claude_override` commands — all unchanged
- ⚠️ Breaking change: `studio.json` gains a key. Reading an older file is safe because the field is `#[serde(default)]` and the struct derives `Default`; the key appears on the next save.
- Edge cases: a hand-corrupted `studio.json` already degrades to an empty config via `load`'s `unwrap_or_default` at `projects.rs:27-32`, which now also yields all sections open; three independent booleans rather than one enum, because all three can be collapsed at once
- Acceptance: collapse state is written to `studio.json` and read back on launch, and a config written before this change still loads with every section open
- Verify (local): `grep -c 'pub struct PanelState' studio/src-tauri/src/projects.rs` → `== 1` AND `grep -c 'pub fn set_panels' studio/src-tauri/src/projects.rs` → `== 1` (both baseline 0)
- Dependencies: none

**Task 7 — Register the git module and the five new commands in lib.rs** `S`
- File: `studio/src-tauri/src/lib.rs`
- Anchor: `mod doctor;` at `lib.rs:1` for the module list, and `            promote_project` at `lib.rs:204` as the current last handler entry
- Reuse: the existing handler list, appended to rather than restructured
- Code sample:
  ```rust
  // line 1 region, keeping alphabetical order:
  mod doctor;
  mod git;
  mod plan;
  ...

  // appended after the current last entry:
              promote_project,
              git::git_info,
              git::git_checkout,
              git::git_create_branch,
              projects::panels,
              projects::set_panels
  ```
- Do not touch: the order of existing handler entries, the `.plugin()` / `.setup()` / `.on_window_event()` / `.run()` chains, `install_session_id`, `start_watch`, `kill_all_sessions`, and every pty command
- Edge cases: none — a missing registration fails at the handler macro, which the global verify below catches
- Acceptance: all five new commands are callable from the frontend and the crate compiles
- Verify (local): `grep -c 'mod git;' studio/src-tauri/src/lib.rs` → `== 1` AND `grep -c 'git::git_checkout' studio/src-tauri/src/lib.rs` → `== 1` AND `grep -c 'projects::set_panels' studio/src-tauri/src/lib.rs` → `== 1` (all baseline 0)
- Verify (global): `cd studio && cargo check --manifest-path src-tauri/Cargo.toml` → exit 0. Rust module boundary — Tasks 1-7 are the whole backend change, and the baseline recorded this command at exit 0.
- Dependencies: Task 5, Task 6

**Task 8 — Add GitInfo, BranchInfo and PanelState to types.ts** `S` [agent: ec-typescript]
- File: `studio/src/lib/types.ts`
- Anchor: `export interface Doctor {` at `types.ts:57`
- Reuse: the file's convention of plain exported interfaces with no runtime code
- Code sample:
  ```ts
  export interface BranchInfo {
    name: string;
    current: boolean;
  }

  /** `detached` is explicit rather than inferred from a null branch: the Rust
   *  side distinguishes a detached HEAD from a folder it could not read. */
  export interface GitInfo {
    available: boolean;
    branch: string | null;
    detached: boolean;
    branches: BranchInfo[];
    hidden: number;
    error: string | null;
  }

  export interface PanelState {
    propertiesCollapsed: boolean;
    tasksCollapsed: boolean;
    historyCollapsed: boolean;
  }
  ```
- Do not touch: `Stage`, `STAGES`, `GitMark`, `Project`, `TreeChild`, `TreeLevel`, `Task`, `HistoryEntry`, `ProjectState`, `Doctor`, `doctorBlocking` — all unchanged
- Edge cases: field names must match the Rust camelCase serde renames exactly, or they arrive `undefined` and render as `NaN`; `branch` is nullable precisely because a detached HEAD has none
- Acceptance: the frontend declares the same git and panel payloads the Rust commands emit
- Verify (local): `grep -c 'export interface GitInfo' studio/src/lib/types.ts` → `== 1` AND `grep -c 'export interface PanelState' studio/src/lib/types.ts` → `== 1` (both baseline 0; no later task touches this file)
- Dependencies: Task 2, Task 6

**Task 9 — Add the five command wrappers to tauri-api.ts** `S` [agent: ec-typescript]
- File: `studio/src/lib/tauri-api.ts`
- Anchor: `  readState: (path: string) => invoke<ProjectState>('read_project_state', { path }),` at `tauri-api.ts:31`
- Reuse: the `api` object pattern and its recorded reason at `tauri-api.ts:5-9` — one wrapper per command keeps a renamed argument a type error instead of a silent undefined
- Code sample:
  ```ts
  import type { Doctor, GitInfo, PanelState, Project, ProjectState, TreeLevel } from './types';

  // … beside the other project commands:
    gitInfo: (path: string) => invoke<GitInfo>('git_info', { path }),
    gitCheckout: (path: string, branch: string) =>
      invoke<GitInfo>('git_checkout', { path, branch }),
    gitCreateBranch: (path: string, name: string) =>
      invoke<GitInfo>('git_create_branch', { path, name }),

    panels: () => invoke<PanelState>('panels'),
    setPanels: (panels: PanelState) => invoke<void>('set_panels', { panels }),
  ```
- Do not touch: `onPtyOutput`, `onPtyExit`, `onProjectState` — unchanged
- Edge cases: `gitCheckout` and `gitCreateBranch` reject with git's stderr string, so callers must catch and display rather than swallow; `gitInfo` never rejects by design and carries its failure in the payload's `error` field
- Acceptance: components reach git state and panel preferences through the same typed boundary as every other command, with no `invoke` call outside this file
- Verify (local): `grep -c 'gitInfo:' studio/src/lib/tauri-api.ts` → `== 1` AND `grep -c 'gitCheckout:' studio/src/lib/tauri-api.ts` → `== 1` AND `grep -c 'gitCreateBranch:' studio/src/lib/tauri-api.ts` → `== 1` AND `grep -c 'setPanels:' studio/src/lib/tauri-api.ts` → `== 1` (all baseline 0)
- Dependencies: Task 8

**Task 10 — Create panel-section.tsx with PanelSection** `M` [agent: ec-react] [design: direction#PanelSection]
- File: `studio/src/components/panel-section.tsx`
- Reuse: `tree-row.tsx:38-52` — the chevron, its `aria-expanded`, and its `aria-label`; this component copies that gesture rather than inventing a second disclosure control
- Code sample:
  ```tsx
  import type { ReactNode } from 'react';

  interface PanelSectionProps {
    title: string;
    collapsed: boolean;
    onToggle: () => void;
    /** Shown beside the title at muted weight — a count or a branch name. */
    detail?: string;
    children: ReactNode;
  }

  /** The rail's repeated shape. Collapsed, a section is its header and nothing
   *  else, so the open sections take the freed space; the whole header is the
   *  hit target because there is no second action competing for it. */
  export function PanelSection({ title, collapsed, onToggle, detail, children }: PanelSectionProps) {
    return (
      <section className={`flex min-h-0 flex-col border-b border-border ${collapsed ? 'shrink-0' : 'flex-1'}`}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex h-8 shrink-0 items-center gap-2 px-2 text-left"
        >
          {/* The one rotation in the app. MOTION 1 allows a chevron, nothing else. */}
          <span className="w-4 shrink-0 font-mono text-xs text-muted">{collapsed ? '▸' : '▾'}</span>
          <span className="flex-1 truncate text-sm">{title}</span>
          {detail && <span className="font-mono text-xs text-muted">{detail}</span>}
        </button>
        {!collapsed && <div className="min-h-0 flex-1 overflow-hidden">{children}</div>}
      </section>
    );
  }
  ```
- Do not touch: `task-panel.tsx` and `history-panel.tsx` — they already own their scroll containers and are wrapped, not modified
- Edge cases: a collapsed section is `shrink-0` at header height while an open one is `flex-1`, which is what makes collapsing give space back rather than leave a gap; children are unmounted when collapsed, which is safe because both panels are pure display with no running process, unlike the terminal panes at `App.tsx:139-141`; the `detail` slot is optional so a section with nothing to summarise shows only its title
- Acceptance: a section shows a title with a chevron, collapses to header height on click, returns its space to the open sections, and reports its state to assistive technology
- Verify (local): `grep -c 'export function PanelSection' studio/src/components/panel-section.tsx` → `== 1` AND `grep -c 'aria-expanded' studio/src/components/panel-section.tsx` → `== 1` (both baseline 0 — new file)
- Dependencies: none

**Task 11 — Create properties-panel.tsx with PropertiesPanel** `L` [agent: ec-react] [design: direction#PropertiesPanel]
- File: `studio/src/components/properties-panel.tsx`
- Reuse: `git-mark.tsx:7-11` — glyph and weight carry state with no new hue, which is why the current branch is marked by weight rather than color; `doctor-screen.tsx:70` for the bordered monospace input shape; `history-panel.tsx:31-35` for the `+N` tail
- Code sample:
  ```tsx
  interface PropertiesPanelProps {
    gitInfo: GitInfo | null;
    /** Non-null when the active project has unfinished tasks — switching
     *  branches changes which plan file is active, so the user is told. */
    incompleteTasks: number;
    busy: boolean;
    error: string | null;
    onCheckout: (branch: string) => void;
    onCreateBranch: (name: string) => void;
  }
  ```
  The body renders, in order: the current branch in monospace (or `detached HEAD` when `detached`), the warning line when `incompleteTasks > 0`, the branch list with the current one at text weight and the rest at muted weight and each a button, a `+{hidden} more` tail when `hidden > 0`, a new-branch input with a Create button disabled on an empty trimmed value, and — when `error` is non-null — a bordered monospace block containing git's message verbatim. When `gitInfo` is null it renders `No project selected`; when `available` is false it renders the payload's `error` and no actions.
- Do not touch: `git-mark.tsx` and `tree-row.tsx` — consumed or imitated, never edited
- Edge cases: `busy` disables every action so a second click cannot race an in-flight checkout; the error block persists until the next action rather than auto-clearing, because the user needs to read it while fixing the tree in another editor; an empty branch list renders nothing rather than an empty container; no em dash appears in any copy, which is an anti-slop hard gate
- Acceptance: the panel states which branch the active folder is on, lists the local branches with the current one distinguishable without color, offers checkout and create as explicit single actions, and shows git's refusal verbatim without clearing it
- Verify (local): `grep -c 'export function PropertiesPanel' studio/src/components/properties-panel.tsx` → `== 1` (baseline 0 — new file) AND `grep -c 'detached' studio/src/components/properties-panel.tsx` → `>= 1` (baseline 0; proves the detached-HEAD state is actually rendered rather than collapsed into a null branch). The no-em-dash-in-UI-copy hard gate is left to `/ec-review`'s anti-slop gate, because grep cannot separate a JSX string from a house-style code comment and this codebase uses em dashes in comments throughout.
- Dependencies: Task 8, Task 10

**Task 12 — Rewrite the App.tsx right rail as three collapsible sections** `M` [agent: ec-react] [design: direction#RightRail]
- File: `studio/src/App.tsx`
- Anchor: `      <aside className="flex w-80 shrink-0 flex-col border-l border-border">` at `App.tsx:198`
- Reuse: `PanelSection` from Task 10; `TaskPanel` and `HistoryPanel` consumed unchanged; `api.panels` / `api.setPanels` from Task 9
- Code sample:
  ```tsx
  const [panels, setPanelsState] = useState<PanelState>({
    propertiesCollapsed: false, tasksCollapsed: false, historyCollapsed: false,
  });

  // A failed read leaves every section open, which is the same as the Rust
  // default, so the UI never blocks on the preference.
  useEffect(() => {
    void api.panels().then(setPanelsState).catch(() => {});
  }, []);

  const togglePanel = useCallback((key: keyof PanelState) => {
    setPanelsState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Persisted on change, not on unmount: the app is usually quit rather
      // than closed cleanly, so an unmount handler would often not run.
      void api.setPanels(next).catch(() => {});
      return next;
    });
  }, []);
  ```
  The aside becomes three `<PanelSection>` elements — Properties, Tasks, History — each wired to its own collapse flag, with Tasks carrying `detail={activeState ? `${activeState.done}/${activeState.total}` : undefined}` and History `detail` as its entry count. Properties renders `<PropertiesPanel>` with `gitInfo={null}` and no-op handlers at this task; Task 13 supplies the real data.
- Do not touch: the sidebar, the always-mounted terminal pane loop at `App.tsx:139-141` and its recorded reason (unmounting would kill a running `/ec-execute`), the doctor gate, and the project header
- Edge cases: a failed `api.panels()` read leaves all sections open rather than blocking render; `setPanels` failure is swallowed because losing a collapse preference must never interrupt the user; all three collapsed is legal and leaves three headers stacked
- Acceptance: each rail section collapses and expands independently, the open sections absorb the freed space, and the state is still in effect after quitting and reopening the app
- Verify (local): `grep -c '<PanelSection' studio/src/App.tsx` → `>= 3` (baseline 0; `>=` because the three sections plus any future one are all written by this task) AND `grep -c 'api.setPanels' studio/src/App.tsx` → `>= 1`
- Dependencies: Task 9, Task 10, Task 11

**Task 13 — Wire git properties and its handlers in App.tsx** `M` [agent: ec-react] [design: direction#RightRail]
- File: `studio/src/App.tsx`
- Anchor: `<PropertiesPanel` — written by Task 12, now given real data
- Reuse: `handlePromote` at the existing App.tsx location as the shape for a command plus a state refresh; `api.readState` from `tauri-api.ts:31`
- Code sample:
  ```tsx
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [gitBusy, setGitBusy] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);

  // Re-read whenever the active project changes. gitInfo never rejects by
  // design, so a failure arrives inside the payload rather than as a throw.
  useEffect(() => {
    if (!active) { setGitInfo(null); return; }
    void api.gitInfo(active.path).then(setGitInfo).catch(() => setGitInfo(null));
  }, [active]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!active) return;
    setGitBusy(true);
    setGitError(null);
    try {
      setGitInfo(await api.gitCheckout(active.path, branch));
      // The watcher only watches .claude/ (watcher.rs:25-35), so a branch
      // change produces no event. The plan is branch-scoped, so stage and
      // tasks are refreshed here rather than waited for.
      const state = await api.readState(active.path);
      setStates((prev) => ({ ...prev, [active.id]: state }));
    } catch (e) {
      // git's own stderr, shown verbatim. No retry, no force.
      setGitError(String(e));
    } finally {
      setGitBusy(false);
    }
  }, [active]);
  ```
  `handleCreateBranch` is the same shape calling `api.gitCreateBranch`, and both are passed into `PropertiesPanel` along with `gitBusy`, `gitError`, and the active project's incomplete-task count.
- Do not touch: `handleToggle`, `handlePromote`, `handleAdd`, `handleRemove`, the `onProjectState` subscription, and the terminal pane loop — all unchanged
- Edge cases: no active project clears `gitInfo` so the panel reports nothing selected rather than stale state; `gitBusy` is cleared in `finally` so a rejected checkout does not leave the panel locked; the error is cleared when a new action starts, not on a timer, so it stays readable while the user fixes the tree elsewhere; a rejected `readState` would be an unhandled rejection, so the refresh is inside the same `try`
- Acceptance: selecting a project shows its branch, clicking another branch switches to it and the header, stage rail and task list follow immediately, and a refused switch shows git's exact message while leaving the branch alone
- Verify (local): `grep -c 'handleCheckout' studio/src/App.tsx` → `>= 1` (baseline 0) AND `grep -c 'api.gitInfo' studio/src/App.tsx` → `>= 1` (baseline 0)
- Verify (global): `cd studio && npm run build` → exit 0. Frontend module boundary and the last task; the baseline recorded this command at exit 0.
- Dependencies: Task 12
