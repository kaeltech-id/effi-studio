## Feature: Studio Project Tree with Git Markers and a Visible Installer

### Impact Analysis
- Files affected: `studio/src-tauri/src/tree.rs` (new), `studio/src-tauri/src/lib.rs`, `studio/src-tauri/src/projects.rs`, `studio/src/lib/types.ts`, `studio/src/lib/tauri-api.ts`, `studio/src/components/git-mark.tsx` (new), `studio/src/components/tree-row.tsx` (new), `studio/src/components/project-sidebar.tsx`, `studio/src/components/terminal-pane.tsx`, `studio/src/components/doctor-screen.tsx`, `studio/src/App.tsx`, `install.sh`
- ⚠️ Breaking change risk:
  - `list_projects` and `add_project` change return type from `Project` to `ProjectView` (adds `gitMark`). Internal IPC only — no external consumer — but `lib.rs:114` wraps `add_project` and must change signature in the same cycle or the crate will not compile.
  - `TerminalPane`'s `program` prop widens from `string` to `string | null`. The existing call site at `App.tsx:124` passes a non-null string and is unaffected.
  - `~/.efficlaude/studio.json` on-disk shape is deliberately NOT changed: `gitMark` lives on the view model only, so a config written by the current build still loads and no stale mark is ever read from disk.

### Reusable Existing Code
- `plan.rs:160-171` (`current_branch`) — the precedent for reading git state from `.git` directly instead of invoking the `git` binary, with the recorded reason (a GUI app has no reliable PATH). `tree.rs` follows it.
- `lib.rs:94-108` (`WatcherRegistry` + `start_watch`) — keyed by project id and already tolerant of an unwatchable folder; a promoted child needs no new mechanism, only a new id.
- `lib.rs:64` (`INSTALL_SESSION = "__install__"`) — the reserved PTY id already exists; it is exposed to the frontend rather than redeclared there.
- `pty.rs:37-56` (`start_reader`) — already emits `pty://output` and `pty://exit` for any id including `__install__`, so the install pane needs no new event.
- `terminal-pane.tsx:38-44` — the subscribe-before-open ordering, and its recorded reason (a late subscription drops the opening banner); the install pane depends on the same ordering.
- `history-panel.tsx:6` (`WINDOW` + `+N older` tail) — the established pattern for capping a long list, reused for the per-level child cap.
- `doctor-screen.tsx:18` — glyph-and-weight carries pass/fail because the palette has no spare color; the git marker follows that rule instead of introducing a hue.
- `stage-rail.tsx:22-31` (`StageRail`) — rendered unchanged on project rows; container rows omit it.
- `projects.rs:43-50` (`project_id`) — path-derived id, so a promoted child keeps its identity across restarts with no uuid dependency.

### Design Direction
- Dials: ENERGY 1 · RHYTHM 1 · MOTION 1 — carried forward verbatim from the previous Studio cycle, not re-chosen. The app is an instrument panel watched for long stretches while the real work runs in the terminal beside it, so it must recede (ENERGY 1). The tree only adds rows to that panel and must read as more of the same repeated shape, which is what makes a deep list scannable (RHYTHM 1). The only motion is a disclosure chevron rotating; a tree that slid, faded, or staggered would teach the eye to ignore the one motion that carries meaning, a checkbox flipping (MOTION 1).
- Palette: ground `#0E1116`, surface `#161A21`, border `#232935`, text `#E6E9EF`, muted `#8A93A5`, accent `#4C9AFF` — reason: the app sits beside a terminal all day so it must survive a dark room, and restricting the accent to the active project and the stage badge keeps a running project locatable without reading. The git marker spends no new hue: `repo` at text weight, `in-repo` at muted weight, `plain` as an unfilled glyph, the same discipline `doctor-screen.tsx:18` already uses.
- Typography: SF Pro (system) for all chrome at a three-step scale; SF Mono for the terminal, task text, counts, and paths — reason: directory names are chrome and belong to the system face, while counts and paths only align when monospaced.
- Identity motif: the fixed four-dot stage rail — brainstorm · feature · execute · review — rendered identically in the sidebar row, the project header, and every history entry. In the tree it appears only on rows that are actual projects, never on container rows, so the rail keeps meaning "this folder runs the workflow".
- Rules: apply ~/.claude/agents/ec-antislop.md in full — hard gates, purpose gates, quality locks

### Grounding
Measured 2026-10-28 — real command output only, never predicted.

Baseline line counts (`wc -l`):
- `studio/src/lib/types.ts` → 48
- `studio/src/lib/tauri-api.ts` → 57
- `studio/src/components/project-sidebar.tsx` → 74
- `studio/src/components/doctor-screen.tsx` → 121
- `studio/src/components/terminal-pane.tsx` → 73
- `studio/src/App.tsx` → 143
- `studio/src-tauri/src/lib.rs` → 194
- `studio/src-tauri/src/projects.rs` → 108
- `studio/src-tauri/src/plan.rs` → 217
- `install.sh` → 274

New files confirmed ABSENT on disk (not assumed):
- `studio/src-tauri/src/tree.rs` → absent
- `studio/src/components/git-mark.tsx` → absent
- `studio/src/components/tree-row.tsx` → absent

Baseline string counts (`grep -c`) — every one of these is 0 today, so each Verify below traces 0 → n:
- `pub enum GitMark` in tree.rs → 0
- `pub fn git_mark` in tree.rs → 0
- `const SKIP_DIRS` in tree.rs → 0
- `pub struct TreeChild` in tree.rs → 0
- `pub async fn list_children` in tree.rs → 0
- `tokio::task::spawn_blocking` in tree.rs → 0   (the bare word `spawn_blocking` also appears in Task 5's doc comment, so the count is anchored on the call)
- `mod tree;` in lib.rs → 0
- `tree::list_children` in lib.rs → 0
- `fn install_session_id` in lib.rs → 0
- `pub struct ProjectView` in projects.rs → 0
- `export type GitMark` in types.ts → 0
- `export interface TreeChild` in types.ts → 0
- `gitMark: GitMark;` in types.ts → 0
- `listChildren:` in tauri-api.ts → 0
- `installSessionId:` in tauri-api.ts → 0
- `export function GitMarkGlyph` in git-mark.tsx → 0
- `export function TreeRow` in tree-row.tsx → 0
- `aria-expanded` in project-sidebar.tsx → 0
- `MAX_CHILDREN` in project-sidebar.tsx → 0
- `program: string | null` in terminal-pane.tsx → 0
- `installSessionId` in doctor-screen.tsx → 0
- `TerminalPane` in doctor-screen.tsx → 0
- `onToggle` in App.tsx → 0
- `onPromote` in App.tsx → 0
- `installSessionId` in App.tsx → 0
- `^fail()` in install.sh → 0
- `fail "` in install.sh → 0
- `^step()` in install.sh → 0
- `step "` in install.sh → 0

Baseline counts that are non-zero and are therefore stated as the number a task must preserve or reach:
- `✗` failure sites in install.sh → 3, at `install.sh:40`, `install.sh:49`, `install.sh:123`
- section banner lines matching `^echo "[A-Z].*\.\.\."$` in install.sh → 10, of which `install.sh:34` is the product banner and the remaining 9 are section headers at lines 68, 87, 95, 104, 121, 128, 173, 227, 261

Baseline build results:
- `cd studio && npm run build` → exit 0 (`tsc` clean; vite built 31 modules in 417ms)
- `cd studio && cargo check --manifest-path src-tauri/Cargo.toml` → exit 0 (`Finished dev profile [unoptimized + debuginfo] in 26.03s`)
- Test suite: none — `studio/package.json` has no `test` script and there are no `*.test.*` / `*.spec.*` files. No test baseline exists to regress.

Verified anchors (one per task that edits an existing file):
- `pub struct Project {` → `studio/src-tauri/src/projects.rs:5`
- `pub async fn add_project` → `studio/src-tauri/src/projects.rs:56`
- `mod doctor;` → `studio/src-tauri/src/lib.rs:1`
- `const INSTALL_SESSION: &str = "__install__";` → `studio/src-tauri/src/lib.rs:64`
- `.invoke_handler(tauri::generate_handler![` → `studio/src-tauri/src/lib.rs:169`
- `async fn add_project(app: tauri::AppHandle)` → `studio/src-tauri/src/lib.rs:114`
- `export interface Project {` → `studio/src/lib/types.ts:3`
- `listProjects: () => invoke<Project[]>('list_projects'),` → `studio/src/lib/tauri-api.ts:21`
- `interface ProjectSidebarProps {` → `studio/src/components/project-sidebar.tsx:4`
- `interface TerminalPaneProps {` → `studio/src/components/terminal-pane.tsx:8`
- `interface DoctorScreenProps {` → `studio/src/components/doctor-screen.tsx:28`
- `const handleAdd = useCallback(async () => {` → `studio/src/App.tsx:55`
- `<ProjectSidebar` → `studio/src/App.tsx:101`
- `<DoctorScreen` → `studio/src/App.tsx:83`
- `echo "✗ Python 3 not found. Please install Python 3.8+ and re-run."` → `install.sh:40`
- `echo "Installing commands..."` → `install.sh:68`
- tree.rs, git-mark.tsx, tree-row.tsx → new file — no anchor


Baselines added during self-review (all 0 today):
- `promote_project` in projects.rs → 0
- `promote_project` in lib.rs → 0
- `promoteProject:` in tauri-api.ts → 0
- `<TreeRow` in project-sidebar.tsx → 0
- `handleToggle` in App.tsx → 0
- `handlePromote` in App.tsx → 0

### Tasks
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

### Per Task Detail

**Task 1 — Create tree.rs with GitMark enum** `S`
- File: `studio/src-tauri/src/tree.rs`
- Reuse: none — the serde camelCase convention is copied from `plan.rs:177-179` and `doctor.rs:57-58`
- Code sample:
  ```rust
  use serde::Serialize;
  use std::path::{Path, PathBuf};

  /// Three states, not a boolean: a folder inside a repository is neither a
  /// repository nor unrelated to one, and collapsing the two would mislabel
  /// every subdirectory of every project.
  #[derive(Serialize, Clone, Copy, PartialEq)]
  #[serde(rename_all = "camelCase")]
  pub enum GitMark {
      /// This directory holds `.git` itself.
      Repo,
      /// An ancestor holds `.git`; this directory is tracked but is not the root.
      InRepo,
      /// Neither this directory nor any ancestor within range holds `.git`.
      Plain,
  }
  ```
- Do not touch: `plan.rs` — its `current_branch` stays where it is; `tree.rs` does not absorb it
- Edge cases: the enum has no fallible state; a path that cannot be read resolves to `Plain` in Task 2 rather than erroring
- Acceptance: a new Rust module exists declaring exactly three git marker states, serialized in the camelCase the frontend already expects everywhere else
- Verify (local): `grep -c "pub enum GitMark" studio/src-tauri/src/tree.rs` → `== 1` (baseline 0)
- Dependencies: none

**Task 2 — Add git_mark resolver to tree.rs** `S`
- File: `studio/src-tauri/src/tree.rs`
- Anchor: `pub enum GitMark` — appended after the enum created in Task 1
- Reuse: `plan.rs:160-171` — the same decision to read `.git` from disk rather than invoke `git`, for the same recorded reason
- Code sample:
  ```rust
  /// `.git` is tested with `exists()`, not `is_dir()`: in a linked worktree or a
  /// submodule it is a FILE containing a gitdir pointer, and treating that as
  /// "not a repository" would mislabel exactly the layouts most likely to appear.
  fn is_repo(dir: &Path) -> bool {
      dir.join(".git").exists()
  }

  /// `stop_at` bounds the walk — the parent of the folder the user added. Walking
  /// to `/` would let an unrelated repository far up the filesystem mark every
  /// folder on the machine as tracked.
  pub fn git_mark(dir: &Path, stop_at: Option<&Path>) -> GitMark {
      if is_repo(dir) {
          return GitMark::Repo;
      }
      let mut cur = dir.parent();
      while let Some(p) = cur {
          if is_repo(p) {
              return GitMark::InRepo;
          }
          if Some(p) == stop_at {
              break;
          }
          cur = p.parent();
      }
      GitMark::Plain
  }
  ```
- Do not touch: `plan.rs:163` — `current_branch` keeps reading `.git/HEAD` itself; this function does not replace it
- Edge cases: an unreadable or deleted directory returns `Plain` because `exists()` is false rather than an error; `stop_at: None` walks to the filesystem root, which is the correct behaviour for a root the user added explicitly
- Acceptance: given any directory, the resolver reports Repo when that directory holds `.git`, InRepo when a bounded ancestor does, and Plain otherwise, including when `.git` is a file rather than a directory
- Verify (local): `grep -c "pub fn git_mark" studio/src-tauri/src/tree.rs` → `== 1` (baseline 0)
- Dependencies: Task 1

**Task 3 — Add SKIP_DIRS and MAX_CHILDREN consts to tree.rs** `S`
- File: `studio/src-tauri/src/tree.rs`
- Anchor: `pub fn git_mark` — the constants go above it, near the top of the module
- Reuse: `history-panel.tsx:6` — the named-cap-plus-tail pattern this constant mirrors on the Rust side
- Code sample:
  ```rust
  /// Build and dependency directories are skipped by name. Expanding a project
  /// root must not offer `node_modules` as something to browse, and a user who
  /// opens one has no workflow to run inside it.
  const SKIP_DIRS: [&str; 6] = ["node_modules", "target", "dist", "build", ".next", "venv"];

  /// One level of a directory is capped and the remainder reported as a count,
  /// the same contract `history-panel.tsx` uses for archived runs. A folder with
  /// thousands of entries must cost a bounded render, not a proportional one.
  const MAX_CHILDREN: usize = 50;
  ```
- Do not touch: the hidden-entry rule is not expressed here — dot-prefixed names are filtered in Task 5, because `.claude` and `.git` are both hidden and both excluded for their own reasons
- Edge cases: a project genuinely named `build` or `dist` is skipped; accepted deliberately, since the user can still add it as a root explicitly through the folder panel
- Acceptance: the skip set and the per-level cap exist as named constants with their reasons stated, so changing either is a one-line edit in one place
- Verify (local): `grep -c "const SKIP_DIRS" studio/src-tauri/src/tree.rs` → `== 1` (baseline 0)
- Dependencies: Task 1

**Task 4 — Add TreeChild and TreeLevel structs to tree.rs** `S`
- File: `studio/src-tauri/src/tree.rs`
- Anchor: `const MAX_CHILDREN` — the structs go after the constants
- Reuse: `plan.rs:177-179` — the camelCase-on-the-wire convention and its recorded reason (a silent mismatch surfaces as `undefined` in a panel rather than a type error)
- Code sample:
  ```rust
  /// One directory entry as the sidebar renders it. `has_children` is a cheap
  /// probe, not a listing: the chevron must be hidden on a leaf, and finding
  /// that out must not cost a full recursive read.
  #[derive(Serialize, Clone)]
  #[serde(rename_all = "camelCase")]
  pub struct TreeChild {
      pub name: String,
      pub path: String,
      pub git_mark: GitMark,
      pub has_children: bool,
  }

  /// The children of one level plus how many the cap held back, so the sidebar
  /// can render a truthful "+N more" instead of silently losing rows.
  #[derive(Serialize, Clone)]
  #[serde(rename_all = "camelCase")]
  pub struct TreeLevel {
      pub children: Vec<TreeChild>,
      pub hidden: usize,
  }
  ```
- Do not touch: `projects.rs` `Project` — a tree child is not a project until it is promoted, and conflating the two would persist browsing state
- Edge cases: a child with no readable subdirectories reports `has_children: false` and renders without a chevron; an unreadable child still appears, marked `Plain`, rather than vanishing
- Acceptance: the wire types for one expanded level exist, carrying each child's name, absolute path, git marker and whether it can be expanded further, plus a count of rows the cap withheld
- Verify (local): `grep -c "pub struct TreeChild" studio/src-tauri/src/tree.rs` → `== 1` AND `grep -c "pub struct TreeLevel" studio/src-tauri/src/tree.rs` → `== 1` (both baseline 0)
- Dependencies: Task 1, Task 3

**Task 5 — Add list_children command to tree.rs** `M`
- File: `studio/src-tauri/src/tree.rs`
- Anchor: `pub struct TreeLevel` — the command goes after the structs
- Reuse: `doctor.rs:68-69` and `plan.rs:190-192` — both are infallible-by-design commands that return a value in every case; this one follows suit, because a folder that cannot be read is a UI state, not an error dialog
- Code sample:
  ```rust
  /// `spawn_blocking`, not a bare async fn: `read_dir` is blocking, and running it
  /// on a tokio worker would stall every other command while a slow or networked
  /// directory is enumerated.
  #[tauri::command]
  pub async fn list_children(path: String, stop_at: Option<String>) -> TreeLevel {
      tokio::task::spawn_blocking(move || {
          let root = PathBuf::from(&path);
          let stop = stop_at.map(PathBuf::from);
          let Ok(entries) = std::fs::read_dir(&root) else {
              return TreeLevel { children: Vec::new(), hidden: 0 };
          };

          let mut dirs: Vec<PathBuf> = entries
              .filter_map(Result::ok)
              .map(|e| e.path())
              .filter(|p| p.is_dir())
              .filter(|p| {
                  let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
                      return false;
                  };
                  // Hidden entries and build directories are both excluded, for
                  // different reasons: `.git` and `.claude` are machinery, and
                  // SKIP_DIRS holds nothing the workflow ever runs in.
                  !name.starts_with('.') && !SKIP_DIRS.contains(&name)
              })
              .collect();
          dirs.sort();

          let hidden = dirs.len().saturating_sub(MAX_CHILDREN);
          let children = dirs
              .into_iter()
              .take(MAX_CHILDREN)
              .map(|p| TreeChild {
                  name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                  path: p.to_string_lossy().into_owned(),
                  git_mark: git_mark(&p, stop.as_deref()),
                  has_children: has_listable_child(&p),
              })
              .collect();
          TreeLevel { children, hidden }
      })
      .await
      .unwrap_or(TreeLevel { children: Vec::new(), hidden: 0 })
  }

  /// Stops at the first qualifying entry — the chevron needs a yes or no, never
  /// a count, so this must not become a second full listing.
  fn has_listable_child(dir: &Path) -> bool {
      std::fs::read_dir(dir)
          .map(|mut it| {
              it.any(|e| {
                  e.ok()
                      .filter(|e| e.path().is_dir())
                      .and_then(|e| e.file_name().to_str().map(|n| {
                          !n.starts_with('.') && !SKIP_DIRS.contains(&n)
                      }))
                      .unwrap_or(false)
              })
          })
          .unwrap_or(false)
  }
  ```
- Do not touch: `watcher.rs` — expanding a level attaches no watcher, which is what keeps watcher count tied to selection rather than to browsing
- Edge cases: unreadable directory returns an empty level rather than erroring; a macOS permission denial behaves identically; a level with exactly `MAX_CHILDREN` entries reports `hidden: 0`; symlinked directories are followed by `is_dir()`, matching what the Finder panel granted
- Acceptance: expanding any directory yields its immediate subdirectories in sorted order with hidden and build directories excluded, each carrying its git marker and whether it can expand further, with any overflow reported as a count — and the call never blocks the async runtime
- Verify (local): `grep -c "pub async fn list_children" studio/src-tauri/src/tree.rs` → `== 1` AND `grep -c "tokio::task::spawn_blocking" studio/src-tauri/src/tree.rs` → `== 1` (both baseline 0; anchored on the call rather than the bare word, because this task's own doc comment contains "spawn_blocking" and a bare-substring count could only reach 1 by deleting that comment)
- Dependencies: Task 2, Task 3, Task 4

**Task 6 — Register tree module and list_children in lib.rs** `S`
- File: `studio/src-tauri/src/lib.rs`
- Anchor: `mod doctor;` at `lib.rs:1` for the module declaration, and `.invoke_handler(tauri::generate_handler![` at `lib.rs:169` for the command
- Reuse: the existing handler list at `lib.rs:169-183` — appended to, not restructured
- Code sample:
  ```rust
  // line 1 region, keeping the existing alphabetical order:
  mod doctor;
  mod plan;
  mod projects;
  mod pty;
  mod shell_env;
  mod tree;
  mod watcher;

  // inside generate_handler![ … ], appended after projects::set_claude_override:
              projects::set_claude_override,
              tree::list_children
  ```
- Do not touch: the order of the existing handler entries, and the `.plugin()` / `.setup()` / `.on_window_event()` chains — this task adds two lines and changes nothing else
- Edge cases: none — a missing registration is a compile-time failure at the handler macro, not a runtime one
- Acceptance: the tree module is part of the crate and `list_children` is callable from the frontend
- Verify (local): `grep -c "mod tree;" studio/src-tauri/src/lib.rs` → `== 1` AND `grep -c "tree::list_children" studio/src-tauri/src/lib.rs` → `== 1` (both baseline 0)
- Dependencies: Task 5

**Task 7 — Add install_session_id command to lib.rs** `S`
- File: `studio/src-tauri/src/lib.rs`
- Anchor: `const INSTALL_SESSION: &str = "__install__";` at `lib.rs:64`
- Reuse: `lib.rs:64` — the constant stays the single definition of the reserved id; this task exposes it rather than duplicating the literal in TypeScript
- Code sample:
  ```rust
  /// Exposed rather than hardcoded in the frontend: the install pane must
  /// subscribe to this id BEFORE install_efficlaude opens the session, for the
  /// reason recorded at terminal-pane.tsx:42 — a late subscription drops the
  /// opening output. Two copies of the literal would eventually disagree.
  #[tauri::command]
  fn install_session_id() -> &'static str {
      INSTALL_SESSION
  }
  ```
  and in the handler list, appended after `tree::list_children`:
  ```rust
              tree::list_children,
              install_session_id
  ```
- Do not touch: `install_efficlaude` at `lib.rs:68-90` — its body, its idempotence check at `lib.rs:82-84`, and its resource resolution stay exactly as they are
- Edge cases: none — the command is a constant read with no failure path
- Acceptance: the frontend can obtain the reserved install PTY id from the backend instead of restating the string literal
- Verify (local): `grep -c "fn install_session_id" studio/src-tauri/src/lib.rs` → `== 1` (baseline 0)
- Dependencies: Task 6

**Task 8 — Add ProjectView and stored_projects to projects.rs** `M`
- File: `studio/src-tauri/src/projects.rs`
- Anchor: `pub struct Project {` at `projects.rs:5`
- Reuse: `tree::git_mark` from Task 2; `projects.rs:43-50` (`project_id`) stays untouched
- Code sample:
  ```rust
  use crate::tree::{git_mark, GitMark};

  /// A separate view model on purpose. `Project` is the PERSISTED shape in
  /// studio.json and must not grow a derived field: a git marker written to disk
  /// would be read back stale after the user initialises or deletes a repo
  /// outside the app. ProjectView is recomputed on every read instead.
  #[derive(Serialize, Clone)]
  #[serde(rename_all = "camelCase")]
  pub struct ProjectView {
      pub id: String,
      pub name: String,
      pub path: String,
      pub git_mark: GitMark,
  }

  impl From<&Project> for ProjectView {
      fn from(p: &Project) -> Self {
          let path = PathBuf::from(&p.path);
          ProjectView {
              id: p.id.clone(),
              name: p.name.clone(),
              path: p.path.clone(),
              // No stop_at for a root the user added explicitly: if it sits inside
              // a larger repository, saying so is correct.
              git_mark: git_mark(&path, None),
          }
      }
  }

  #[tauri::command]
  pub fn list_projects() -> Vec<ProjectView> {
      load().projects.iter().map(ProjectView::from).collect()
  }

  /// lib.rs starts a watcher per configured project and needs the stored rows,
  /// not the view model.
  pub fn stored_projects() -> Vec<Project> {
      load().projects
  }
  ```
  `add_project` keeps its body and changes only its return type to `Result<Option<ProjectView>, String>`, mapping both the duplicate early return and the newly pushed row through `ProjectView::from`.
- Do not touch: `StudioConfig` at `projects.rs:11-17`, `load`/`save` at `projects.rs:27-41`, `config_path` and its comment at `projects.rs:19-23`, `project_id` at `projects.rs:45-50`, and the duplicate-add early return logic at `projects.rs:71-73` — behaviour unchanged. `claude_override` and `set_claude_override` at `projects.rs:95-108` are untouched.
- ⚠️ Breaking change: `list_projects` and `add_project` change their IPC return type. `lib.rs:164` currently calls `projects::list_projects()` for watcher startup and will no longer type-check — Task 10 switches that call site to `stored_projects()`, so the crate is expected to be uncompilable between this task and Task 10.
- Edge cases: a project whose folder was deleted on disk still returns a row, marked `Plain`, so the user can see and remove it rather than having it silently disappear
- Acceptance: both project commands hand the frontend a git marker computed at the moment of the call, while `~/.efficlaude/studio.json` keeps exactly the fields it has today
- Verify (local): `grep -c "pub struct ProjectView" studio/src-tauri/src/projects.rs` → `== 1` AND `grep -c "pub fn stored_projects" studio/src-tauri/src/projects.rs` → `== 1` (both baseline 0)
- Dependencies: Task 2

**Task 9 — Add promote_project to projects.rs** `S`
- File: `studio/src-tauri/src/projects.rs`
- Anchor: `pub async fn add_project` at `projects.rs:56`
- Reuse: `add_project` at `projects.rs:56-78` — this is the same function with the dialog removed; `project_id` at `projects.rs:45-50` gives the promoted folder the same stable path-derived id it would get through the panel
- Code sample:
  ```rust
  /// add_project without the panel. The macOS file-access grant was already
  /// given when the ancestor was picked, so a second dialog would ask for
  /// nothing new — and asking again for a folder the user just clicked in the
  /// tree would read as a bug.
  pub fn promote_project(path: String) -> Result<ProjectView, String> {
      let abs = PathBuf::from(&path);
      let name = abs
          .file_name()
          .map(|s| s.to_string_lossy().into_owned())
          .unwrap_or_else(|| path.clone());
      let id = project_id(&path);

      let mut cfg = load();
      // Promoting an already-configured folder returns the existing row, the
      // same contract add_project has at projects.rs:71.
      if let Some(existing) = cfg.projects.iter().find(|p| p.id == id) {
          return Ok(ProjectView::from(existing));
      }
      let proj = Project { id, name, path };
      cfg.projects.push(proj.clone());
      save(&cfg)?;
      Ok(ProjectView::from(&proj))
  }
  ```
- Do not touch: `add_project` at `projects.rs:56-78` — it keeps the dialog and stays the entry point for the Add Folder button; this is a sibling, not a refactor of it
- Edge cases: promoting a path that is already a project is a no-op returning the existing row; a path whose folder has since been deleted is still stored, and `read_project_state` already returns a safe value for it (`plan.rs:190-192`); `save` failure propagates as `Err` so the frontend does not show a project that was not persisted
- Acceptance: a folder the user activated in the tree becomes a stored project with a stable id and no second dialog, and promoting it twice stores it once
- Verify (local): `grep -c "pub fn promote_project" studio/src-tauri/src/projects.rs` → `== 1` (baseline 0)
- Dependencies: Task 8

**Task 10 — Update lib.rs wrappers for the view model and promotion** `M`
- File: `studio/src-tauri/src/lib.rs`
- Anchor: `async fn add_project(app: tauri::AppHandle)` at `lib.rs:114`
- Reuse: the wrapper pattern and its recorded reason at `lib.rs:110-112` — wrapping is what keeps the watcher set exactly equal to the configured set; `start_watch` at `lib.rs:99-108` is reused unchanged by the new wrapper
- Code sample:
  ```rust
  #[tauri::command]
  async fn add_project(app: tauri::AppHandle) -> Result<Option<projects::ProjectView>, String> {
      let added = projects::add_project(app.clone()).await?;
      if let Some(p) = &added {
          start_watch(&app, &p.id, &p.path);
      }
      Ok(added)
  }

  /// Wrapped for the same reason add_project is: a promoted folder must start
  /// being watched, and that is lib.rs's concern rather than projects.rs's.
  #[tauri::command]
  fn promote_project(app: tauri::AppHandle, path: String) -> Result<projects::ProjectView, String> {
      let added = projects::promote_project(path)?;
      start_watch(&app, &added.id, &added.path);
      Ok(added)
  }
  ```
  the setup closure at `lib.rs:164` reads stored rows:
  ```rust
              for p in projects::stored_projects() {
                  start_watch(&handle, &p.id, &p.path);
              }
  ```
  and `promote_project` is appended to the handler list after `install_session_id`.
- Do not touch: `start_watch` at `lib.rs:99-108`, `remove_project` at `lib.rs:122-132`, `kill_all_sessions` at `lib.rs:139-148`, and the `RunEvent` handling at `lib.rs:186-193` — all unchanged
- Edge cases: promoting a folder that is already watched inserts over the same key in `WatcherRegistry`, dropping the old watcher as the comment at `lib.rs:127` describes — correct, not a leak; a promoted folder that cannot be watched is tolerated by `start_watch`'s early return at `lib.rs:100-102`
- Acceptance: the crate compiles with the view model threaded through both wrappers, promotion starts exactly one watcher, and startup still watches every configured project
- Verify (local): `grep -c "projects::stored_projects()" studio/src-tauri/src/lib.rs` → `== 1` AND `grep -c "projects::promote_project" studio/src-tauri/src/lib.rs` → `== 1` (both baseline 0)
- Verify (global): `cd studio && cargo check --manifest-path src-tauri/Cargo.toml` → exit 0. This is the Rust module boundary — Tasks 1-10 are the whole backend change, and the baseline recorded this exact command at exit 0 before any edit.
- Dependencies: Task 9

**Task 11 — Add GitMark, TreeChild, TreeLevel and Project.gitMark to types.ts** `S`
- File: `studio/src/lib/types.ts`
- Anchor: `export interface Project {` at `types.ts:3`
- Reuse: the file's existing convention of plain exported interfaces with no runtime code, and the `STAGES` precedent at `types.ts:36` for a value mirroring the Rust side
- Code sample:
  ```ts
  /** Mirrors the Rust GitMark in tree.rs. Three states, not a boolean: a folder
   *  inside a repository is neither a repository nor unrelated to one. */
  export type GitMark = 'repo' | 'inRepo' | 'plain';

  export interface Project {
    id: string;
    name: string;
    path: string;
    gitMark: GitMark;
  }

  /** One directory as the sidebar renders it. `hasChildren` decides whether a
   *  chevron is drawn at all, so a leaf never offers an empty expansion. */
  export interface TreeChild {
    name: string;
    path: string;
    gitMark: GitMark;
    hasChildren: boolean;
  }

  export interface TreeLevel {
    children: TreeChild[];
    hidden: number;
  }
  ```
- Do not touch: `Stage`, `Task`, `HistoryEntry`, `ProjectState`, `STAGES`, `Doctor`, `doctorBlocking` — all unchanged. `doctorBlocking` at `types.ts:46-48` keeps treating the worker as optional.
- Edge cases: `'inRepo'` must match the camelCase serde rename from Task 1 exactly; a mismatch would render the fallback state rather than raise a type error, which is why the union is written as string literals
- Acceptance: the TypeScript side declares the same three marker states and the same per-level payload the Rust commands emit, and every project now carries a marker
- Verify (local): `grep -c "export type GitMark" studio/src/lib/types.ts` → `== 1` AND `grep -c "export interface TreeChild" studio/src/lib/types.ts` → `== 1` AND `grep -c "gitMark: GitMark;" studio/src/lib/types.ts` → `== 2` (one on `Project`, one on `TreeChild`; baseline 0 for all three, and no later task touches this file)
- Dependencies: Task 1

**Task 12 — Add listChildren, installSessionId and promoteProject wrappers to tauri-api.ts** `S`
- File: `studio/src/lib/tauri-api.ts`
- Anchor: `listProjects: () => invoke<Project[]>('list_projects'),` at `tauri-api.ts:21`
- Reuse: the `api` object pattern and its recorded reason at `tauri-api.ts:5-9` — one wrapper per command is what keeps a renamed argument a type error instead of a silent undefined
- Code sample:
  ```ts
  import type { Doctor, Project, ProjectState, TreeLevel } from './types';

  // … inside the api object, beside the other project commands:
    listChildren: (path: string, stopAt: string | null = null) =>
      invoke<TreeLevel>('list_children', { path, stopAt }),

    promoteProject: (path: string) => invoke<Project>('promote_project', { path }),

    installSessionId: () => invoke<string>('install_session_id'),
  ```
- Do not touch: `onPtyOutput` at `tauri-api.ts:35-43`, `onPtyExit` at `tauri-api.ts:45-49`, `onProjectState` at `tauri-api.ts:51-57` — the install pane reuses `onPtyExit` exactly as it is, with no new event
- Edge cases: `stopAt` defaults to `null` so a root expansion walks unbounded, matching the `None` default on the Rust side; argument names stay camelCase because Tauri converts them to snake_case itself
- Acceptance: components can list a directory level, promote a folder, and obtain the reserved install session id through the same typed boundary as every other command, with no direct `invoke` call outside this file
- Verify (local): `grep -c "listChildren:" studio/src/lib/tauri-api.ts` → `== 1` AND `grep -c "promoteProject:" studio/src/lib/tauri-api.ts` → `== 1` AND `grep -c "installSessionId:" studio/src/lib/tauri-api.ts` → `== 1` (all baseline 0, and no later task touches this file)
- Dependencies: Task 11

**Task 13 — Create git-mark.tsx with GitMarkGlyph** `S`
- File: `studio/src/components/git-mark.tsx`
- Reuse: `doctor-screen.tsx:18` — glyph and weight carry state because the palette has no spare color; this component applies the same rule rather than adding a hue
- Code sample:
  ```tsx
  import type { GitMark } from '../lib/types';

  /** Weight and fill carry the state, never a new color: the palette has six
   *  entries and the accent is already spoken for by the active project and the
   *  stage badge. A repo reads at text weight, a tracked child at muted weight,
   *  and an untracked folder as an outline. */
  const MARK = {
    repo: { glyph: '◆', className: 'text-text', label: 'git repository' },
    inRepo: { glyph: '◇', className: 'text-muted', label: 'inside a git repository' },
    plain: { glyph: '·', className: 'text-border', label: 'not a git repository' },
  } as const;

  export function GitMarkGlyph({ mark }: { mark: GitMark }) {
    const m = MARK[mark];
    return (
      <span
        title={m.label}
        aria-label={m.label}
        className={`w-3 shrink-0 text-center font-mono text-xs ${m.className}`}
      >
        {m.glyph}
      </span>
    );
  }
  ```
- Do not touch: `styles.css` — no token is added; the three states reuse `text`, `muted` and `border`
- Edge cases: a fixed `w-3` keeps every row's label starting at the same x regardless of which glyph is drawn, the same alignment reasoning as the `0/0` count at `project-sidebar.tsx:46-49`; `title` and `aria-label` carry the state for a reader, since a glyph alone does not
- Acceptance: the three git states are visually distinguishable at a glance using only existing palette entries, are labelled for assistive technology, and occupy identical width so rows stay aligned
- Verify (local): `grep -c "export function GitMarkGlyph" studio/src/components/git-mark.tsx` → `== 1` (baseline 0)
- Dependencies: Task 11

**Task 14 — Create tree-row.tsx with TreeRow** `M`
- File: `studio/src/components/tree-row.tsx`
- Reuse: `project-sidebar.tsx:34-59` — the split hit-target row (one button to act, one to remove) is the layout this generalises; `StageRail` from `stage-rail.tsx:22`; `GitMarkGlyph` from Task 13
- Code sample:
  ```tsx
  import type { GitMark, ProjectState } from '../lib/types';
  import { GitMarkGlyph } from './git-mark';
  import { StageRail } from './stage-rail';

  interface TreeRowProps {
    name: string;
    path: string;
    gitMark: GitMark;
    depth: number;
    /** undefined = a leaf, so no chevron is drawn and nothing is expandable. */
    expanded?: boolean;
    active?: boolean;
    /** Present only on rows that are real projects; container rows get no rail. */
    state?: ProjectState | null;
    onToggle?: () => void;
    onActivate: () => void;
    onRemove?: () => void;
  }

  export function TreeRow({
    name, path, gitMark, depth, expanded, active, state,
    onToggle, onActivate, onRemove,
  }: TreeRowProps) {
    return (
      <li className="group flex items-center">
        {/* Indent is padding on the row, not a nested list: a flat list keeps
            every row the same height and keeps keyboard order linear. */}
        <div className="flex min-w-0 flex-1 items-center" style={{ paddingLeft: `${depth * 12}px` }}>
          {expanded === undefined ? (
            <span className="w-5 shrink-0" />
          ) : (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
              className="w-5 shrink-0 font-mono text-xs text-muted"
            >
              {/* The one rotation in the app. MOTION 1 allows a chevron and
                  nothing else. */}
              {expanded ? '▾' : '▸'}
            </button>
          )}
          <button
            type="button"
            onClick={onActivate}
            title={path}
            className={`flex min-w-0 flex-1 items-center gap-2 border-l-2 px-2 py-1.5 text-left ${
              active ? 'border-accent bg-ground' : 'border-transparent'
            }`}
          >
            <GitMarkGlyph mark={gitMark} />
            {/* Truncate, never wrap: every row stays one line tall. */}
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            {state && <StageRail stage={state.stage} />}
            {state && (
              <span className="font-mono text-xs text-muted">
                {state.done}/{state.total}
              </span>
            )}
          </button>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title={`Remove ${name}`}
            aria-label={`Remove ${name}`}
            className="px-2 font-mono text-muted opacity-0 group-hover:opacity-100"
          >
            ✕
          </button>
        )}
      </li>
    );
  }
  ```
- Do not touch: `stage-rail.tsx` — `StageRail` is consumed unchanged, including its default `sm` size
- Edge cases: a leaf renders a fixed-width spacer so its label aligns with expandable siblings; a container row passes no `state` and therefore shows no rail and no counts, keeping the rail's meaning intact; `onRemove` is omitted on child rows, so only roots can be removed
- Acceptance: one row component renders at any depth with chevron and label as separate hit targets, always shows a git marker, and shows the stage rail and task counts only when the row is an actual project
- Verify (local): `grep -c "export function TreeRow" studio/src/components/tree-row.tsx` → `== 1` AND `grep -c "aria-expanded" studio/src/components/tree-row.tsx` → `== 1` (both baseline 0 — new file)
- Dependencies: Task 13

**Task 15 — Rewrite project-sidebar.tsx as the disclosure tree** `L`
- File: `studio/src/components/project-sidebar.tsx`
- Anchor: `interface ProjectSidebarProps {` at `project-sidebar.tsx:4`
- Reuse: `TreeRow` from Task 14; `history-panel.tsx:6` for the capped-list-with-tail pattern; the existing empty-state copy at `project-sidebar.tsx:24-27` and its recorded reason (the first thing a new user sees should say what to do)
- Code sample:
  ```tsx
  import type { Project, ProjectState, TreeLevel } from '../lib/types';
  import { TreeRow } from './tree-row';

  /** Mirrors MAX_CHILDREN in tree.rs. The cap is enforced there; this is only
   *  how the withheld count is phrased. */
  const MAX_CHILDREN = 50;

  interface ProjectSidebarProps {
    projects: Project[];
    activeId: string | null;
    states: Record<string, ProjectState>;
    /** Expanded absolute paths. Session state only — never persisted, so
        browsing can never disagree with studio.json. */
    expanded: Set<string>;
    /** Keyed by absolute path; absent means "not loaded yet". */
    levels: Record<string, TreeLevel>;
    onSelect: (id: string) => void;
    onToggle: (path: string) => void;
    onPromote: (path: string) => void;
    onAdd: () => void;
    onRemove: (id: string) => void;
  }
  ```
  The body renders each configured project as a root `<TreeRow>` at depth 0 (with `state`, `active`, `onRemove`), then recurses through `levels[path]` for every expanded path, rendering each child at `depth + 1`. A child that is already a configured project renders with that project's `state` and selects on activate; a child that is not renders without a rail and calls `onPromote` on activate. A level with `hidden > 0` ends in a non-interactive tail row reading `+{hidden} more`. A path that is expanded but absent from `levels` renders a single muted `loading…` row at the child depth. A short labelled header bar sits above the list, and `Add Folder…` stays the bottom-anchored action it is today.
- Do not touch: the `Add Folder…` button's position and behaviour at `project-sidebar.tsx:65-71` — it stays the bottom-anchored full-width action; only its styling is brought in line
- Edge cases: an empty project list keeps the existing instructional copy; an expanded directory with no qualifying children renders an explicit muted `empty` row rather than collapsing silently, so the chevron's promise is kept; `hidden > 0` is phrased as a count, never as a silent truncation; recursion depth is unbounded but every level is lazy, so depth costs only what the user opened
- Acceptance: the sidebar shows configured projects as roots, reveals a folder's immediate subdirectories when its chevron is used, marks every row's git status, offers a stage rail only on real projects, states how many rows a cap withheld, and still offers Add Folder at the bottom
- Verify (local): `grep -c "<TreeRow" studio/src/components/project-sidebar.tsx` → `>= 1` AND `grep -c "^const MAX_CHILDREN" studio/src/components/project-sidebar.tsx` → `== 1` (anchored on the declaration: this task's own comment and the tail row's tooltip both name MAX_CHILDREN, so a bare-substring count could only reach 1 by deleting one of them) (both baseline 0; the row count is `>=` because roots and children are rendered from the same component in a number of call sites the implementation chooses)
- Dependencies: Task 14

**Task 16 — Add expansion state and handleToggle to App.tsx** `M`
- File: `studio/src/App.tsx`
- Anchor: `const handleAdd = useCallback(async () => {` at `App.tsx:55`
- Reuse: the keyed-by-id `states` map at `App.tsx:19` and its recorded reason (a slow callback must never write one project's state into another's panel) — `levels` is keyed by absolute path for the same reason
- Code sample:
  ```tsx
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Record<string, TreeLevel>>({});

  const handleToggle = useCallback(async (path: string) => {
    let open = false;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        open = true;
      }
      return next;
    });
    // Load once per path and keep it: collapsing and re-expanding must not
    // re-read the disk, and nothing is read for a path never opened. A failed
    // listing caches an empty level so the row settles on "empty" instead of
    // retrying on every render.
    if (!open || levels[path]) return;
    const level = await api.listChildren(path).catch(() => ({ children: [], hidden: 0 }));
    setLevels((prev) => ({ ...prev, [path]: level }));
  }, [levels]);
  ```
  `handleAdd` at `App.tsx:55-62` additionally drops the cached level for the added path's parent, so a folder added while its parent is expanded appears without a collapse/reopen cycle.
- Do not touch: `states` at `App.tsx:19`, the `onProjectState` subscription at `App.tsx:48-53`, and `loadProjects` at `App.tsx:33-41` — the watcher path is unchanged, and expanding a path starts no watcher
- Edge cases: toggling twice quickly ends in a consistent set because the update is functional; `levels` is never persisted, so a restart starts fully collapsed; a listing rejection is caught and cached rather than surfaced as an unhandled rejection
- Acceptance: expanding a row reads its children exactly once and keeps them for the session, collapsing re-renders with no disk read, and no directory is read before the user opens it
- Verify (local): `grep -c "handleToggle" studio/src/App.tsx` → `>= 1` AND `grep -c "setLevels" studio/src/App.tsx` → `>= 1` (both baseline 0; `>=` because each name appears at its definition and at every wiring site the implementation needs)
- Dependencies: Task 12, Task 15

**Task 17 — Add handlePromote to App.tsx and wire the sidebar** `M`
- File: `studio/src/App.tsx`
- Anchor: `<ProjectSidebar` at `App.tsx:101`
- Reuse: `handleAdd` at `App.tsx:55-62` — promotion is the same post-add sequence (append, select, read state) with the folder panel replaced by a known path; `api.promoteProject` from Task 12
- Code sample:
  ```tsx
  /** A child the user activated. It becomes a real project — persisted, watched,
   *  with its own terminal — because a workspace deliberately promoted should
   *  still be there after a relaunch. */
  const handlePromote = useCallback(async (path: string) => {
    // A rejected promotion means the folder was not persisted, so nothing is
    // added to the list — surfacing a project that does not exist on the Rust
    // side would leave a row that cannot be removed.
    const added = await api.promoteProject(path).catch(() => null);
    if (!added) return;
    setProjects((prev) => (prev.some((p) => p.id === added.id) ? prev : [...prev, added]));
    setActiveId(added.id);
    const state = await api.readState(added.path);
    setStates((prev) => ({ ...prev, [added.id]: state }));
  }, []);
  ```
  and the sidebar receives the new props:
  ```tsx
        <ProjectSidebar
          projects={projects}
          activeId={activeId}
          states={states}
          expanded={expanded}
          levels={levels}
          onSelect={setActiveId}
          onToggle={(p) => void handleToggle(p)}
          onPromote={(p) => void handlePromote(p)}
          onAdd={handleAdd}
          onRemove={(id) => void handleRemove(id)}
        />
  ```
- Do not touch: `handleRemove` at `App.tsx:64-74` — removing a promoted child uses the identical path, including the `ptyClose` tolerance at `App.tsx:66`; the always-mounted pane loop at `App.tsx:122-126` and its recorded reason (unmounting would kill a running `/ec-execute`) picks up the new project automatically
- Edge cases: promoting an already-configured path returns the existing row instead of duplicating it, matching `projects.rs:71-73`; a promoted child stays a child row of its parent and gains a rail rather than moving in the tree; a rejected promotion leaves the UI untouched
- Acceptance: activating a child folder makes it a watched project with its own terminal and stage rail, it survives a restart, and a second promotion of the same folder adds nothing
- Verify (local): `grep -c "handlePromote" studio/src/App.tsx` → `>= 1` AND `grep -c "onPromote=" studio/src/App.tsx` → `== 1` (both baseline 0)
- Verify (global): `cd studio && npm run build` → exit 0. This is the tree module boundary — Tasks 11-17 are the whole tree change, and the baseline recorded this exact command at exit 0 before any edit.
- Dependencies: Task 16

**Task 18 — Allow attach-only mode in terminal-pane.tsx** `S`
- File: `studio/src/components/terminal-pane.tsx`
- Anchor: `interface TerminalPaneProps {` at `terminal-pane.tsx:8`
- Reuse: the entire existing effect — subscriptions, `ResizeObserver`, byte-level write, and the subscribe-before-open ordering at `terminal-pane.tsx:44` all stay as they are
- Code sample:
  ```tsx
  interface TerminalPaneProps {
    projectId: string;
    cwd: string;
    /** null = attach only: subscribe to an already-running session and never
     *  open one. The installer's PTY is opened by install_efficlaude, so a pane
     *  that called ptyOpen would spawn a second, empty shell beside it. */
    program: string | null;
  }
  ```
  and the open step becomes conditional while the subscribe step does not:
  ```tsx
      void subscribed
        .then(() => (program ? api.ptyOpen(projectId, cwd, program) : undefined))
        .then(() => api.ptyResize(projectId, term.rows, term.cols))
        .catch((err) => term.write(`\r\n\x1b[31m${String(err)}\x1b[0m\r\n`));
  ```
- Do not touch: the `onData` write at `terminal-pane.tsx:46-48` — the install script may prompt, so the pane stays writable; the `ResizeObserver` zero-size guard at `terminal-pane.tsx:52-53` and its reason
- Edge cases: `ptyResize` against a session that does not exist yet rejects and is swallowed by the existing `.catch`, which writes the message into the terminal instead of throwing — identical to how a failed open is already handled; `program` stays in the effect's dependency array at `terminal-pane.tsx:70` so switching modes re-initialises cleanly
- Acceptance: a pane given a null program renders a terminal attached to an existing session's output without spawning a process, and a pane given a program behaves exactly as it does today
- Verify (local): `grep -c "program: string | null" studio/src/components/terminal-pane.tsx` → `== 1` (baseline 0)
- Dependencies: none

**Task 19 — Render the install pane in doctor-screen.tsx** `M`
- File: `studio/src/components/doctor-screen.tsx`
- Anchor: `interface DoctorScreenProps {` at `doctor-screen.tsx:28`
- Reuse: `TerminalPane` in attach-only mode from Task 18; `onPtyExit` from `tauri-api.ts:45` unchanged; the `Check` sub-component at `doctor-screen.tsx:13-26` unchanged
- Code sample:
  ```tsx
  const [installing, setInstalling] = useState(false);

  // Subscribed when the pane mounts, before onInstall opens the session, for
  // the reason recorded at terminal-pane.tsx:42.
  useEffect(() => {
    if (!installing || !installSessionId) return;
    const unlisten = onPtyExit(installSessionId, () => onRecheck());
    return () => void unlisten.then((off) => off());
  }, [installing, installSessionId, onRecheck]);
  ```
  the Install button sets `installing` and calls `onInstall`, and is disabled until `installSessionId` is non-null; while `installing`, the pane renders below the checks:
  ```tsx
  {installing && installSessionId && (
    <div className="mt-4 h-64 border border-border">
      <TerminalPane projectId={installSessionId} cwd="" program={null} />
    </div>
  )}
  ```
- Do not touch: the `doctorBlocking` usage at `doctor-screen.tsx:44`, the claude-path override form at `doctor-screen.tsx:57-76` and its recorded reason, and the three `Check` rows — the worker row stays optional
- Edge cases: clicking Install twice is already idempotent on the backend (`lib.rs:82-84`), and `installing` is a boolean so the pane mounts once; an install that fails still emits `pty://exit`, so the re-check runs and the screen reports the still-failing rows rather than hanging; the pane has a fixed height so a long install scrolls inside it instead of pushing the buttons off screen
- Acceptance: pressing Install EffiClaude shows the installer's own output as it runs, in the same screen, and the checks refresh by themselves the moment the installer finishes — no dead button and no manual Re-check required
- Verify (local): `grep -c "TerminalPane" studio/src/components/doctor-screen.tsx` → `== 2` (the import and the one render site) AND `grep -c "installSessionId" studio/src/components/doctor-screen.tsx` → `>= 2` (both baseline 0; the id count is `>=` because it appears in the props interface, the destructure, the effect guard and dependency list, and the pane — a number the implementation decides)
- Dependencies: Task 18

**Task 20 — Pass installSessionId into DoctorScreen from App.tsx** `S`
- File: `studio/src/App.tsx`
- Anchor: `<DoctorScreen` at `App.tsx:83`
- Reuse: the existing `check` callback at `App.tsx:21-27`, passed through as `onRecheck` unchanged; the id is fetched once in an effect, mirroring how `check` and `loadProjects` each run once at `App.tsx:29-31` and `App.tsx:43-45`
- Code sample:
  ```tsx
  const [installId, setInstallId] = useState<string | null>(null);

  // A failed fetch leaves it null, which disables the Install button rather
  // than letting a click open a session no pane is subscribed to.
  useEffect(() => {
    void api.installSessionId().then(setInstallId).catch(() => {});
  }, []);
  ```
  and at the call site:
  ```tsx
          <DoctorScreen
            doctor={doctor}
            installSessionId={installId}
            onInstall={() => void api.installEfficlaude()}
            …
  ```
- Do not touch: the gate condition at `App.tsx:80` — `(doctorBlocking(doctor) && !dismissedDoctor) || !program` keeps deciding when the doctor screen shows; this task adds one prop and one effect
- Edge cases: the id arrives asynchronously, so Install stays disabled until it does — otherwise a click would open a session no pane is subscribed to, which is exactly today's bug; a failed fetch leaves Re-check and the claude-path override fully usable
- Acceptance: the doctor screen receives the backend's reserved install session id, and Install cannot be pressed before the pane is able to subscribe to it
- Verify (local): `grep -c "installSessionId" studio/src/App.tsx` → `>= 2` (the api call and the prop; baseline 0)
- Verify (global): `cd studio && npm run build` → exit 0. This is the App wiring boundary and the last frontend task; the baseline recorded this exact command at exit 0 before any edit.
- Dependencies: Task 19

**Task 21 — Add a fail helper to install.sh and route the three failure sites through it** `S`
- File: `install.sh`
- Anchor: `echo "✗ Python 3 not found. Please install Python 3.8+ and re-run."` at `install.sh:40`
- Reuse: the existing `✗` glyph vocabulary — the helper formalises it rather than replacing it, so output stays recognisable
- Code sample:
  ```bash
  # A failure prints what went wrong AND what to do about it, on two lines.
  # A symptom alone leaves the user re-reading the script to find the remedy.
  fail() {
    echo "  ✗ $1"
    echo "    → $2"
    exit 1
  }
  ```
  The three sites keep their existing symptom text as the first argument:
  ```bash
  fail "Python 3 not found" "Install Python 3.8 or newer, then re-run this installer"
  fail "Python 3.8+ required (found $PYTHON_VERSION)" "Upgrade Python to 3.8 or newer, then re-run this installer"
  fail "Failed to install Python dependencies" "Check pip3 and $SERVER_DIR/requirements.txt, then re-run this installer"
  ```
- Do not touch: `set -e` at line 3, the variable block at lines 5-18, `fetch_file` at lines 24-31, and every step's success behaviour — this task changes failure OUTPUT and the exit path only, never what the installer does when it works. The `ℹ` advisory lines for Node.js and etok stay advisory and are not routed through `fail`.
- Edge cases: the pip site at `install.sh:123` sits inside a `|| { …; exit 1; }` compound, so the helper replaces the echo there and the `exit 1` is dropped, since `fail` exits itself; `set -e` is unaffected because `fail` always terminates
- Acceptance: each of the three fatal conditions prints the symptom and a concrete remedy and exits non-zero, with no fatal path left printing a bare symptom
- Verify (local): `grep -c '^fail()' install.sh` → `== 1` AND `grep -c 'fail "' install.sh` → `== 3` (both baseline 0; the 3 matches the three `✗` sites recorded in Grounding at lines 40, 49 and 123) AND `bash -n install.sh` → exit 0
- Dependencies: none

**Task 22 — Add a step helper to install.sh and route the nine section headers through it** `S`
- File: `install.sh`
- Anchor: `echo "Installing commands..."` at `install.sh:68`
- Reuse: the `# ──` comment rules already dividing the script into sections — the helper makes the printed output match the structure the comments already describe
- Code sample:
  ```bash
  # Sections are printed, not just commented: the installer's output is read in
  # Studio's install pane, where a flat wall of ✓ lines gives nothing to scan.
  step() {
    echo ""
    echo "$1"
  }
  ```
  The nine section headers at lines 68, 87, 95, 104, 121, 128, 173, 227 and 261 each collapse from a bare `echo ""` plus an `echo "Title..."` into one call, dropping the ellipsis:
  ```bash
  step "Installing commands"
  ```
- Do not touch: the product banner at `install.sh:34` (`echo "Installing EffiClaude..."`) and the local-install note at line 36 — the banner is not a section and keeps its own shape. The closing `Done!` block at lines 266-274 keeps its literal text, since it is the summary rather than a section.
- Edge cases: each of the nine sites is currently preceded by a bare `echo ""`; that blank line moves into the helper, so the blank must be removed at the call site or the output gains a double gap
- Acceptance: the installer prints nine clearly separated section headers as it works, so its output is scannable in the Studio install pane rather than one continuous list
- Verify (local): `grep -c '^step()' install.sh` → `== 1` AND `grep -c 'step "' install.sh` → `== 9` (both baseline 0; the 9 matches the nine section header lines recorded in Grounding) AND `bash -n install.sh` → exit 0
- Dependencies: Task 21
