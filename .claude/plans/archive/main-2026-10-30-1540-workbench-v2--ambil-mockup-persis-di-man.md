## Feature: Workbench v2 — ambil mockup persis di mana produk bisa jujur
Proof mode: handoff

### Impact Analysis
- Files affected: `studio/src/components/workspace-rail.tsx` (new), `studio/src/components/segmented.tsx` (new), `studio/src/components/project-activity.tsx` (new), `studio/src/components/composer.tsx` (new), `studio/src/components/project-sidebar.tsx`, `studio/src/components/task-panel.tsx`, `studio/src/components/history-panel.tsx`, `studio/src/components/flow-bar.tsx`, `studio/src/components/workbench.tsx`, `studio/src/App.tsx`, `studio/src/lib/types.ts`, `studio/src/lib/tauri-api.ts`, `studio/src-tauri/src/git.rs`, `studio/src-tauri/src/lib.rs`
- ⚠️ Breaking change risk: `studio/src/App.tsx` hosts `ProjectSidebar` and `FlowBar`; changing either component's props changes a call site in a 1900-line file. Nothing outside `studio/` is touched.

### Reusable Existing Code
- `studio/src/components/tree-row.tsx:25` — `TreeRow` renders a folder/file row with git mark; the Contract's folder tree reuses it rather than reimplementing indentation
- `studio/src/components/tab-strip.tsx` — the Contract's tab strip already exists; only its container chrome changes
- `studio/src/components/brand-mark.tsx:12` — `BrandMark({ size })` is the ribbon-E; the rail's brand row uses it
- `studio/src/components/experience-selector.tsx:11-12` — already holds the exact Contract copy `Build / Code with your agents.` and `Verify / Test and capture evidence.`; the rail's nav cards read from this map instead of restating strings
- `studio/src/lib/tauri-api.ts:87` — `ptyWrite(sessionId, data)` already wraps `pty_write`; the composer calls it and adds no new IPC
- `studio/src-tauri/src/git.rs:38` — `run(root, args)` is the one git helper (resolved binary, explicit `-C`, never a shell); `git_diff_stat` uses it
- `studio/src-tauri/src/git.rs:56-57` — `#[tauri::command] pub fn git_info(path: String) -> GitInfo` is the shape `git_diff_stat` copies, including the `error: Option<String>` field rendered as a disabled state
- `studio/src/components/task-panel.tsx:10-30` — the anti-fabrication precedent: a value is shown only when real. Every new card follows it.

### Design Contract
- Source: `/Users/admin/Developer/Projects/effi-studio/design/rebrand/mockups/01-build-workbench-v2.png`  ·  Viewport: 1586x992 desktop, jendela macOS dengan traffic lights di kiri atas
- Layout: tiga kolom tetap. Kiri ±300px, tengah ±880px melar, kanan ±400px. Latar jendela `--color-ground`; tiap kolom dipisah border tipis `--color-border`. Kiri dan kanan menggulir mandiri; tengah menumpuk breadcrumb, tab strip, strip alur, badan percakapan yang melar, lalu composer yang menempel di bawah.
- Spacing: padding kolom 16–20px; gap antar kartu 12–16px; padding dalam kartu 14–16px; radius kartu 10–12px, radius pill 999px, radius chip 8px; gap baris daftar 10–12px; indentasi tree 16px per tingkat dengan garis panduan vertikal 1px.
- Typography: judul rail kanan `Project activity` ±20px/600; subtitle `Everything moving forward.` ±13px/400 `--color-muted`; judul percakapan `A better home for your projects` ±22px/600; stempel waktu ±12px `--color-muted`; nama proyek di kartu ±14px/600 dengan subtitle ±12px `--color-muted`; label nav ±14px/600 dengan subtitle ±12px `--color-muted`; label `WORKSPACE` ±11px/600 uppercase dengan letter-spacing; teks task ±13px/500 dengan subtitle ±12px `--color-muted`; badge dan pill ±11–12px.
- Color: ground `#080F24`; surface kartu `#0C142E`; kartu terangkat `#121C3C`; hover `#1A254C`; border `#2A3663`; teks `#F5F8FF`; muted `#9FB0D4`; aksen cyan `#76CFFF` untuk progress bar, medali riwayat, dan tombol kirim; biru `#4263EB` untuk baris terpilih, bubble pengguna, dan segmented control aktif; ungu `#8B5CF6` untuk border tab aktif; hijau `--color-success` untuk centang dan angka tambah; merah `--color-error` untuk angka kurang.
- Elements: **Kiri** — traffic lights; mark ribbon-E + wordmark `Effi Studio`; kartu nav `Build` terpilih berlatar biru tipis dengan ikon `</>` dan chevron kanan, `Verify` dengan ikon kaca pembesar, `Connections` dengan ikon rantai, masing-masing bersubtitle; divider; baris `WORKSPACE` dengan tombol plus bundar di kanan; field pencarian dengan ikon kaca pembesar dan placeholder; kartu proyek terpilih `orbit-web` dengan kotak inisial biru `O`, subtitle, branch pill, dan tombol elipsis; folder tree — `src` terbuka dengan chevron bawah lalu anak `components`, `pages`, `styles`, kemudian `public` dan file `package.json`; kartu proyek `atlas-api` tertutup dengan kotak inisial ungu `A` dan chevron bawah; tombol outline `Add project` berikon plus; baris `Settings` berikon gerigi; baris profil dengan avatar inisial dan chevron. **Tengah** — breadcrumb `Workspace / orbit-web`; branch pill dengan ikon git, nama branch, chevron; tombol elipsis; tab `Claude Code` aktif berborder ungu dengan ikon dan tombol tutup, tab `Codex`, tab `Browser`, tombol plus; strip alur berisi empat langkah bertanda centang, nomor aktif, dan nomor menunggu, dihubungkan garis tipis; judul percakapan dan stempel waktu; badan percakapan; composer berborder biru dengan placeholder, ikon penjepit kertas, chip konteks berikon dan tombol silang, dan tombol kirim bundar cyan berpanah atas; teks bantuan `Enter to send · Shift + Enter for a new line`. **Kanan** — judul dan subtitle; segmented control `Tasks`/`History`; kartu rencana dengan ikon dokumen, judul, badge rasio, subtitle sumber, tombol elipsis, progress bar, dan label persen; empat baris task dengan ikon lingkaran bercentang, bertitik, atau kosong, judul, subtitle, serta badge `Up next` pada baris aktif yang berlatar biru tipis dan berborder; judul `Recent history` dengan tautan `View all`; dua entri timeline bermedali centang cyan terhubung garis vertikal, masing-masing berjudul, berbranch pill, bertombol elipsis, berstempel waktu, dan berkartu catatan; kartu `Project & Git` dengan branch pill dan baris jumlah berkas berubah beserta angka tambah dan kurang.
- Copy: `Effi Studio`; `Build` / `Code with your agents.`; `Verify` / `Test and capture evidence.`; `Connections` / `One surface, two doors.`; `WORKSPACE`; `Find a project…`; `Add project`; `Settings`; `Workspace /`; `Project activity`; `Everything moving forward.`; `Tasks`; `History`; `Recent history`; `View all`; `Up next`; `Project & Git`; `What would you like to build next?`; `Enter to send · Shift + Enter for a new line`. Nama proyek, nama pengguna, judul task, dan seluruh angka pada mockup adalah data contoh dan WAJIB diganti nilai nyata dari aplikasi.
- States: default dan selected tampak pada kartu nav, kartu proyek, tab, segmented control, dan baris task; `Up next` tampak sebagai badge; hover tidak tampak dan memakai `--color-hover`; focus tidak tampak dan memakai ring aksen agar navigasi papan ketik tetap terlihat; disabled tidak tampak; loading tidak tampak dan TIDAK boleh digambar sebagai spinner palsu sesuai larangan di prompt mockup; empty tidak tampak dan wajib dibuat untuk daftar proyek kosong, task kosong, riwayat kosong, serta git tidak tersedia; error tidak tampak dan wajib dibuat untuk kegagalan baca git dan kegagalan baca rencana.
- Deviations allowed: strip alur memakai enam tahap `Stage` yang asli (`Brainstorm`, `Plan`, `Refine`, `Execute`, `Review`, plus `Idle`) alih-alih empat label mockup, karena empat label itu akan salah menamai rantai `/ec-*` milik pengguna sendiri; badan percakapan tetap `TerminalPane` dan tidak digambar sebagai bubble, avatar, kartu tool-call, maupun kartu diff, karena tidak ada sumber data terstruktur; pemilih model `Claude Sonnet` dihilangkan karena aplikasi tidak mengetahui model agent; seluruh angka dan nama memakai data nyata; lebar kolom boleh menyesuaikan jendela sempit selama urutan elemen dipertahankan.

### Grounding
Measured 2026-10-30 — real command output only. Proof mode `handoff`, so only anchors, new-file absence, and the per-string baselines a `Verify (local)` actually needs are recorded.
- `wc -l`: `workbench.tsx` 724 · `project-sidebar.tsx` 154 · `task-panel.tsx` 153 · `history-panel.tsx` 38 · `flow-bar.tsx` 207 · `tab-strip.tsx` 592 · `tree-row.tsx` 110 · `brand-mark.tsx` 25 · `types.ts` 532 · `tokens.ts` 23 · `git.rs` 124 · `lib.rs` 1235 · `styles.css` 94
- New files confirmed absent (`test -f; echo $?` → `1`): `studio/src/components/composer.tsx`, `studio/src/components/project-activity.tsx`, `studio/src/components/workspace-rail.tsx`, `studio/src/components/segmented.tsx`
- Baseline string counts:
  - `grep -rEc '#[0-9a-fA-F]{6}' studio/src/components/` → no file above `0` (token discipline holds today and must keep holding)
  - `grep -rc 'Find a project' studio/src` → `0` files
  - `grep -rc 'Project activity' studio/src` → `0` files
  - `grep -rc 'git_diff_stat' studio/src-tauri/src` → `0` files
  - `grep -c 'Brainstorm' studio/src/components/flow-bar.tsx` → `0`
  - `grep -rc 'pty_write' studio/src` → `1` file (`lib/tauri-api.ts:87`), so a component calling `ptyWrite` is new
- Baseline test result: `python3 -m pytest -q` → `265 passed, 1 warning`; `cd studio && npm run build` → exits 0, no `error` lines
- Verified anchors:
  - `export function ProjectSidebar({` → `studio/src/components/project-sidebar.tsx:46`
  - `Add Folder…` → `studio/src/components/project-sidebar.tsx:150`
  - `export function TaskPanel({` → `studio/src/components/task-panel.tsx:40`
  - `Source: Claude plan` → `studio/src/components/task-panel.tsx:26`
  - `export function HistoryPanel({ history }: { history: HistoryEntry[] }) {` → `studio/src/components/history-panel.tsx:8`
  - `export function FlowBar({` → `studio/src/components/flow-bar.tsx:63`
  - `const INSPECTOR_TABS` → `studio/src/components/workbench.tsx:464`
  - `aria-label="Project inspector"` → `studio/src/components/workbench.tsx:594`
  - `<TaskPanel state={state} claudeContext={claudeContext} />` → `studio/src/components/workbench.tsx:648`
  - `<HistoryPanel history={state?.history ?? []} />` → `studio/src/components/workbench.tsx:664`
  - `export type ThemeToken` → `studio/src/lib/tokens.ts:6`
  - `pub struct GitInfo {` → `studio/src-tauri/src/git.rs:24`
  - `fn run(root: &Path, args: &[&str]) -> Result<String, String> {` → `studio/src-tauri/src/git.rs:38`
  - `.invoke_handler(tauri::generate_handler![` → `studio/src-tauri/src/lib.rs:833`
  - `export interface GitInfo {` → `studio/src/lib/types.ts:68`
  - `ptyWrite: (sessionId: string, data: string)` → `studio/src/lib/tauri-api.ts:87`
  - `import { ProjectSidebar } from './components/project-sidebar';` → `studio/src/App.tsx:23`
  - `build: { name: 'Build', blurb: 'Code with your agents.' },` → `studio/src/components/experience-selector.tsx:11`
  - new files — no anchor

### Tasks
- [x] Task 1: Add git_diff_stat to the Rust git module [M] [design: design/rebrand/mockups/01-build-workbench-v2.png#ProjectAndGit] — real "N files changed, +X −Y"
- [x] Task 2: Register git_diff_stat in the handler list [S] — without this the command is unreachable
- [x] Task 3: Mirror DiffStat in the frontend types and api wrapper [S] — typed access, no `any`
- [x] Task 4: Build the Segmented control [S] [agent: ec-react] [design: design/rebrand/mockups/01-build-workbench-v2.png#Segmented] — Tasks/History switch
- [x] Task 5: Build the WorkspaceRail left column [L] [agent: ec-react] [design: design/rebrand/mockups/01-build-workbench-v2.png#LeftRail] — brand, nav cards, WORKSPACE, search, project cards, tree, footer
- [x] Task 6: Rewrite ProjectSidebar as the rail's project list [M] [agent: ec-react] [design: design/rebrand/mockups/01-build-workbench-v2.png#ProjectCards] — initial squares, subtitle, branch pill, tree
- [x] Task 7: Build the ProjectActivity right column [L] [agent: ec-react] [design: design/rebrand/mockups/01-build-workbench-v2.png#RightRail] — heading, segmented, plan card, history timeline, git card
- [x] Task 8: Restyle TaskPanel rows to the Contract [M] [agent: ec-react] [design: design/rebrand/mockups/01-build-workbench-v2.png#TaskRows] — three states, Up next badge
- [x] Task 9: Restyle HistoryPanel as a medallion timeline [M] [agent: ec-react] [design: design/rebrand/mockups/01-build-workbench-v2.png#HistoryTimeline] — cyan medallions, connecting line, note cards
- [x] Task 10: Build the Composer wired to ptyWrite [M] [agent: ec-react] [design: design/rebrand/mockups/01-build-workbench-v2.png#Composer] — real send, Enter/Shift+Enter, context chips
- [x] Task 11: Name the real six stages in FlowBar [M] [agent: ec-react] [design: design/rebrand/mockups/01-build-workbench-v2.png#FlowStrip] — declared deviation from the mockup's four
- [x] Task 12: Assemble the three columns in Workbench [L] [agent: ec-react] [design: design/rebrand/mockups/01-build-workbench-v2.png#Layout] — breadcrumb, chrome, terminal-as-card, rails
- [x] Task 13: Wire the new rail into App.tsx [M] [agent: ec-react] — replace the old sidebar call site
- [x] Task 14: Add the workbench-v2 guard tests [M] [agent: ec-python] — lock the Contract copy, the deviations, and token discipline

### Regression introduced by following the mockup
**Branch checkout and create-branch are no longer reachable in the UI.** The right
column used to mount `PanelSection` + `PropertiesPanel`, which carried the branch list,
its checkout buttons and the create-branch field. The Contract's right column ends with
the `Project & Git` card and draws no switcher, so following it removed that surface.
Verified: `PropertiesPanel` is now referenced nowhere outside its own file (the only
other hit is a comment at `workbench.tsx:677`), and `App.tsx:2448-2449` still passes
`onCheckout` / `onCreateBranch` into props that are declared optional and never read.
The Rust commands (`git_checkout`, `git_create_branch`) and the `tauri-api.ts` wrappers
are all intact — only the UI is gone. This is a product decision for the user, not a
defect to patch silently: either the mockup's right column gains a switcher, or the
feature moves elsewhere, or it is dropped deliberately.

### Execution incidents
- Wave 3's two units (Tasks 7 and 13) were both killed mid-run by an API outage
  (`ENOTFOUND`), after writing their files but before reporting. Both outputs were
  verified by the orchestrator instead: `tsc --noEmit` clean, braces balanced, every
  Contract string present. No work was lost and neither file was left half-written.
- `Project & Git` is written in JSX as `Project &amp; Git`. Task 14's guard must match
  the entity form, or it will assert the card is missing when it is present.

### Contract defects found during execution
Recorded so `/ec-review` reads these as attributed, not as undeclared deviations.
- The Design Contract specifies a note card under each history entry. `HistoryEntry`
  (`studio/src/lib/types.ts:33-40`) is `{file, branch, date, time, slug, title|null}` —
  there is no note field and never was. The mockup's note text is sample data, so Task 9
  correctly did not render it. The Contract was wrong, not the implementation.
- The Contract specifies a per-entry ellipsis menu on history rows. No handler exists on
  this component's props, and a dead control is forbidden by the plan's own Constraints,
  so Task 9 omitted it.
- Task 9's code sample used `last:hidden` on the connecting line. The line span is the
  FIRST child of its `li`, so that selector could never match and the line would have
  drawn past the final entry. Implemented as `group-last:hidden` instead.
- The plan told Task 5 to import experience copy from `experience-selector.tsx`. That
  file declares it as a module-private `const COPY` with no export, and the file was on
  Task 5's do-not-touch list, so the import was impossible as instructed. A local const
  keyed by the shared `ExperienceId` was used instead, with a comment naming the drift
  risk. The reuse instruction was wrong, not the implementation.
- Task 4's active segment carries no blue edge stroke. `tests/test_studio_guards.py:666`
  bans `#4263EB` (3.82:1 on navy) and `#8B5CF6` (4.49:1) in any border, ring, text or
  icon-stroke role. Used as a fill with text on top, which the guard permits.
- Task 4 added roving `tabIndex` plus Arrow/Home/End beyond the sample, which is the
  expected keyboard contract for `role="tab"`.

### Handoff
_Proof mode is `handoff`, so the cycle writes the UI and you judge it. These are the steps it deliberately does not run._
- The rails and chrome actually look like the mockup → `cd studio && npm run tauri dev`, open a project, compare side by side with `design/rebrand/mockups/01-build-workbench-v2.png`
- The composer really reaches the agent → open a Claude Code tab, type in the composer, press Enter, confirm the text appears in the terminal session
- `git_diff_stat` reports real numbers → edit a file in the open project, confirm the Project & Git card's count and +/− match `git diff --numstat`
- Nothing is cramped at small window sizes → resize to 980x700 and 800x650, confirm the three columns still read correctly
- Keyboard navigation reaches every new control → Tab through the rail, the segmented control, and the composer; confirm a visible focus ring on each
- The new guards actually pass, and nothing regressed → `python3 -m pytest -q` (baseline before this cycle: `265 passed`)
- The frontend still type-checks and builds → `cd studio && npm run build`
- The Rust side still compiles with the new command → `cd studio/src-tauri && cargo check`

### Per Task Detail

**Task 1 — Add git_diff_stat to the Rust git module** `M`
- File: `studio/src-tauri/src/git.rs`
- Anchor: `#[tauri::command]` immediately preceding `pub fn git_checkout` at line 112
- Code sample: add a struct and a command above that anchor, using the existing `run` helper at line 38
  ```rust
  #[derive(serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  pub struct DiffStat {
      pub available: bool,
      pub files_changed: usize,
      pub insertions: usize,
      pub deletions: usize,
      /// Why the stat could not be read. Rendered as a disabled card, never as
      /// zeros — "0 files changed" and "git unavailable" are different facts.
      pub error: Option<String>,
  }

  #[tauri::command]
  pub fn git_diff_stat(path: String) -> DiffStat {
      let root = Path::new(&path);
      let empty = |error: Option<String>| DiffStat {
          available: error.is_none(),
          files_changed: 0,
          insertions: 0,
          deletions: 0,
          error,
      };
      let out = match run(root, &["diff", "--numstat", "HEAD"]) {
          Ok(out) => out,
          Err(e) => return empty(Some(e)),
      };
      let mut stat = empty(None);
      for line in out.lines().filter(|l| !l.trim().is_empty()) {
          let mut cols = line.split('\t');
          let added = cols.next().unwrap_or("-");
          let removed = cols.next().unwrap_or("-");
          stat.files_changed += 1;
          // A binary file reports "-" for both columns; count the file, not a
          // line total that does not exist.
          stat.insertions += added.parse::<usize>().unwrap_or(0);
          stat.deletions += removed.parse::<usize>().unwrap_or(0);
      }
      stat
  }
  ```
- Do not touch: `GitInfo` at line 24, `run` at line 38, `git_info`, `git_checkout`, `git_create_branch`. Keep using `run` — never a shell, never an unresolved `git`.
- Verify (local): `grep -c 'pub fn git_diff_stat' studio/src-tauri/src/git.rs` → `== 1` (baseline: `0` across `studio/src-tauri/src`)
- Dependencies: none

**Task 2 — Register git_diff_stat in the handler list** `S`
- File: `studio/src-tauri/src/lib.rs`
- Anchor: `.invoke_handler(tauri::generate_handler![` → line 833
- Code sample: add the entry beside the other git commands in that list, matching their `git::` path style
  ```rust
              git::git_diff_stat,
  ```
- Do not touch: every other entry in the list; the surrounding builder chain
- Verify (local): `grep -c 'git_diff_stat' studio/src-tauri/src/lib.rs` → `== 1` (baseline: `0`)
- Dependencies: Task 1 (the command must exist to be registered)

**Task 3 — Mirror DiffStat in the frontend types and api wrapper** `S`
- File: `studio/src/lib/types.ts`
- Anchor: `export interface GitInfo {` → line 68
- Code sample: add directly above the anchor, mirroring the Rust struct field for field in its camelCase serialisation
  ```ts
  export interface DiffStat {
    available: boolean;
    filesChanged: number;
    insertions: number;
    deletions: number;
    error: string | null;
  }
  ```
- Do not touch: `GitInfo`, `ProjectState` at line 42, and every other interface in the file
- Verify (local): `grep -c 'export interface DiffStat' studio/src/lib/types.ts` → `== 1` (baseline: `0`)
- Dependencies: Task 1 (the shape mirrors the Rust struct)

**Task 4 — Build the Segmented control** `S`
- File: `studio/src/components/segmented.tsx` (create)
- Code sample: a two-option control matching the Contract — active option on `--color-brand-blue`, inactive muted, pill radius, full width
  ```tsx
  export function Segmented<T extends string>({
    options, value, onChange, label,
  }: {
    options: { id: T; label: string }[];
    value: T;
    onChange: (id: T) => void;
    label: string;
  }) {
    return (
      <div role="tablist" aria-label={label} className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {options.map((o) => (
          <button
            key={o.id}
            role="tab"
            aria-selected={value === o.id}
            onClick={() => onChange(o.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              value === o.id ? 'bg-brand-blue text-text' : 'text-muted hover:bg-hover'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  ```
- Do not touch: no existing file; introduce no raw hex — every colour is a token utility
- Verify (local): `grep -c 'role="tablist"' studio/src/components/segmented.tsx` → `== 1` (baseline: file absent)
- Dependencies: none

**Task 5 — Build the WorkspaceRail left column** `L`
- File: `studio/src/components/workspace-rail.tsx` (create)
- Code sample: the Contract's left column top-to-bottom. Nav copy is read from the existing experience map, never restated.
  ```tsx
  import { BrandMark } from './brand-mark';
  import { EXPERIENCES } from './experience-selector';

  export function WorkspaceRail({
    experience, onExperience, search, onSearch, onAddProject, onSettings, user, children,
  }: WorkspaceRailProps) {
    return (
      <aside aria-label="Workspace" className="flex w-[300px] shrink-0 flex-col border-r border-border bg-ground">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <BrandMark size={28} />
          <span className="text-lg font-semibold text-text">Effi Studio</span>
        </div>
        <nav aria-label="Experiences" className="flex flex-col gap-1 px-3">
          {/* one card per experience: icon, name, blurb, chevron when selected */}
        </nav>
        <div className="mt-4 flex items-center justify-between border-t border-border px-4 pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">WORKSPACE</span>
          <button aria-label="Add a project" onClick={onAddProject} className="rounded-full p-1 text-muted hover:bg-hover hover:text-text">{/* plus */}</button>
        </div>
        <div className="px-3 pt-3">
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Find a project"
            placeholder="Find a project…"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 pl-9 text-sm text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
        <div className="flex flex-col gap-1 border-t border-border p-3">
          <button onClick={onAddProject} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-text hover:bg-hover">{/* plus */}Add project</button>
          <button onClick={onSettings} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-text hover:bg-hover">{/* gear */}Settings</button>
          {user && (<div className="flex items-center gap-2 rounded-lg px-3 py-2.5">{/* avatar + name */}</div>)}
        </div>
      </aside>
    );
  }
  ```
  The user row renders only when the app actually knows a user; the Contract's `Jamie Smith` is sample data.
- Do not touch: `brand-mark.tsx`, `experience-selector.tsx` — both are imported, not edited. No raw hex anywhere; every colour is a token utility.
- Verify (local): `grep -c -F 'Find a project…' studio/src/components/workspace-rail.tsx` → `== 1` and `grep -c -F 'WORKSPACE' studio/src/components/workspace-rail.tsx` → `== 1` (baselines: `Find a project` appears in `0` files today; file absent)
- Dependencies: none

**Task 6 — Rewrite ProjectSidebar as the rail's project list** `M`
- File: `studio/src/components/project-sidebar.tsx`
- Anchor: `export function ProjectSidebar({` → line 46
- Code sample: each project becomes a card — a rounded-square initial tile, name, subtitle, branch pill, ellipsis — and the selected project expands into the existing `TreeRow` tree
  ```tsx
  <div className="rounded-xl border border-border bg-surface p-2.5">
    <button className="flex w-full items-center gap-2.5 text-left" onClick={() => onSelect(p.path)}>
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-blue text-sm font-semibold text-text">
        {p.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text">{p.name}</span>
        {subtitle && <span className="block truncate text-xs text-muted">{subtitle}</span>}
      </span>
      {branch && <BranchPill branch={branch} />}
    </button>
    {selected && <div className="mt-2 border-l border-border pl-2">{/* TreeRow rows */}</div>}
  </div>
  ```
  `subtitle` and `branch` render only when the backend supplies them — the Contract's `Website · main` and `Backend service` are sample data.
- Do not touch: `tree-row.tsx` — reused verbatim, never rewritten; `grep -c 'TreeRow' studio/src/components/project-sidebar.tsx` must stay at least `1` (it is `3` today). The `Add Folder…` control at line 150 moves to the rail's footer as `Add project`, so this file must not keep a second copy of it.
- Verify (local): `grep -c -F 'Add Folder…' studio/src/components/project-sidebar.tsx` → `== 0` (baseline: `1`, at line 150)
- Dependencies: Task 5 (the rail owns the footer this control moves into)

**Task 7 — Build the ProjectActivity right column** `L`
- File: `studio/src/components/project-activity.tsx` (create)
- Code sample: the Contract's right column — heading, subtitle, segmented control, then either the plan card plus history, or history alone
  ```tsx
  export function ProjectActivity({ state, diff, claudeContext }: ProjectActivityProps) {
    const [tab, setTab] = useState<'tasks' | 'history'>('tasks');
    return (
      <aside aria-label="Project activity" className="flex w-[400px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-ground p-4">
        <header>
          <h2 className="text-xl font-semibold text-text">Project activity</h2>
          <p className="text-[13px] text-muted">Everything moving forward.</p>
        </header>
        <Segmented label="Project activity view" value={tab} onChange={setTab}
          options={[{ id: 'tasks', label: 'Tasks' }, { id: 'history', label: 'History' }]} />
        {tab === 'tasks'
          ? <TaskPanel state={state} claudeContext={claudeContext} />
          : <HistoryPanel history={state?.history ?? []} />}
        <section>
          <div className="flex items-baseline justify-between">
            <h3 className="text-base font-semibold text-text">Recent history</h3>
            <button onClick={() => setTab('history')} className="text-xs text-accent hover:underline">View all</button>
          </div>
          <HistoryPanel history={(state?.history ?? []).slice(0, 2)} />
        </section>
        <GitCard branch={state?.branch ?? null} diff={diff} />
      </aside>
    );
  }
  ```
  `GitCard` shows the count and +/− only when `diff.available`; on `diff.error` it renders a disabled card naming the reason, never zeros.
- Do not touch: `task-panel.tsx` and `history-panel.tsx` internals — both are composed here, and their own Contract restyling is Tasks 8 and 9
- Verify (local): `grep -c -F 'Project activity' studio/src/components/project-activity.tsx` → `== 1` and `grep -c -F 'Everything moving forward.' studio/src/components/project-activity.tsx` → `== 1` (baseline: `Project activity` appears in `0` files)
- Dependencies: Task 3 (the `DiffStat` type), Task 4 (the Segmented control)

**Task 8 — Restyle TaskPanel rows to the Contract** `M`
- File: `studio/src/components/task-panel.tsx`
- Anchor: `export function TaskPanel({` → line 40
- Code sample: three visually distinct states and the `Up next` badge, replacing the monospace strikethrough rows
  ```tsx
  const state = task.done ? 'done' : isNext ? 'next' : 'todo';
  <li className={`flex gap-2.5 rounded-lg p-2.5 ${state === 'next' ? 'border border-brand-blue bg-accent-tint' : ''}`}>
    <span aria-hidden className="mt-0.5 shrink-0">{/* filled check | ring dot | empty ring */}</span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2">
        <span className={`text-[13px] font-medium ${state === 'done' ? 'text-muted' : 'text-text'}`}>{task.title}</span>
        {state === 'next' && <span className="rounded bg-brand-blue px-1.5 py-0.5 text-[11px] text-text">Up next</span>}
      </span>
      {task.subtitle && <span className="block text-xs text-muted">{task.subtitle}</span>}
    </span>
  </li>
  ```
  A progress bar renders above the list only when `total > 0`, using the existing guarded ratio — the panel still computes no percentage of its own.
- Do not touch: the `SourceLabel` rationale at lines 10-30 and the `percent` null-guard it documents; the rule that nothing here is interactive, because the CLI is the sole writer of the checklist
- Verify (local): `grep -c -F 'Up next' studio/src/components/task-panel.tsx` → `== 1` (baseline: `0`)
- Dependencies: none

**Task 9 — Restyle HistoryPanel as a medallion timeline** `M`
- File: `studio/src/components/history-panel.tsx`
- Anchor: `export function HistoryPanel({ history }: { history: HistoryEntry[] }) {` → line 8
- Code sample: cyan check medallions joined by a thin vertical line, each entry carrying a title, branch pill, timestamp, and a note card
  ```tsx
  <li className="relative flex gap-3 pb-4 last:pb-0">
    <span aria-hidden className="absolute left-3 top-7 bottom-0 w-px bg-border last:hidden" />
    <span aria-hidden className="z-10 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-on-accent">{/* check */}</span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2">
        <span className="truncate text-sm font-medium text-text">{entry.title}</span>
        {entry.branch && <BranchPill branch={entry.branch} />}
      </span>
      <span className="block text-xs text-muted">{entry.when}</span>
      {entry.note && <span className="mt-1.5 block rounded-lg border border-border bg-surface p-2.5 text-xs text-muted">{entry.note}</span>}
    </span>
  </li>
  ```
  Every field renders only when present on `HistoryEntry`; nothing is invented to fill the card.
- Do not touch: the `WINDOW` slice and the `+N older` affordance — both stay, so a long history is still truthfully summarised
- Verify (local): `grep -c 'rounded-full bg-accent' studio/src/components/history-panel.tsx` → `>= 1` (baseline: `0`)
- Dependencies: none

**Task 10 — Build the Composer wired to ptyWrite** `M`
- File: `studio/src/components/composer.tsx` (create)
- Code sample: the Contract's composer, sending for real through the existing api wrapper
  ```tsx
  import { api } from '../lib/tauri-api';

  export function Composer({ sessionId, chips, onRemoveChip }: ComposerProps) {
    const [text, setText] = useState('');
    const canSend = sessionId !== null && text.trim().length > 0;
    async function send() {
      if (!canSend) return;
      await api.ptyWrite(sessionId!, text + '\r');
      setText('');
    }
    return (
      <div className="rounded-xl border border-brand-blue bg-surface p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          aria-label="Message the agent"
          placeholder="What would you like to build next?"
          rows={2}
          className="w-full resize-none bg-transparent text-sm text-text placeholder:text-muted focus-visible:outline-none"
        />
        <div className="flex items-center gap-2">
          <button aria-label="Attach a file" className="text-muted hover:text-text">{/* paperclip */}</button>
          {chips.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-text">
              {c.label}
              <button aria-label={`Remove ${c.label} from context`} onClick={() => onRemoveChip(c.id)}>{/* x */}</button>
            </span>
          ))}
          <button aria-label="Send to the agent" disabled={!canSend} onClick={() => void send()}
            className="ml-auto grid size-9 place-items-center rounded-full bg-accent text-on-accent disabled:opacity-40">{/* arrow up */}</button>
        </div>
        <p className="mt-1.5 text-right text-[11px] text-muted">Enter to send · Shift + Enter for a new line</p>
      </div>
    );
  }
  ```
  With no session the send button is disabled rather than failing silently. The mockup's `Claude Sonnet` selector is omitted — the app does not know the agent's model.
- Do not touch: `lib/tauri-api.ts` — `ptyWrite` is called, not changed; `terminal-pane.tsx` and the PTY lifecycle it owns
- Verify (local): `grep -c 'ptyWrite' studio/src/components/composer.tsx` → `== 1` and `grep -c -F 'Enter to send · Shift + Enter for a new line' studio/src/components/composer.tsx` → `== 1` (baseline: `pty_write` appears in exactly `1` file, `lib/tauri-api.ts`; this file is absent)
- Dependencies: none

**Task 11 — Name the real six stages in FlowBar** `M`
- File: `studio/src/components/flow-bar.tsx`
- Anchor: `export function FlowBar({` → line 63
- Code sample: the strip renders the real `Stage` values with the Contract's check / current-number / pending-number treatment
  ```tsx
  const STAGES = [
    { id: 'brainstorm', label: 'Brainstorm', blurb: 'Explore the approach' },
    { id: 'plan', label: 'Plan', blurb: 'Break it into tasks' },
    { id: 'refine', label: 'Refine', blurb: 'Audit before any code' },
    { id: 'execute', label: 'Execute', blurb: 'Make the changes' },
    { id: 'review', label: 'Review', blurb: 'Verify and refine' },
  ] as const;
  ```
  Declared deviation from the Design Contract: the mockup draws four generic steps (`Explore`, `Plan`, `Build`, `Review`); the real `Stage` enum at `studio/src-tauri/src/plan.rs:35-42` has six values, and using the mockup's four would mislabel the user's own `/ec-*` chain. The Contract records this deviation explicitly.
- Do not touch: the existing `away` / `onFocus` / `onOpen` affordance at lines 111-113, which is how the bar offers to open a session
- Verify (local): `grep -c 'Brainstorm' studio/src/components/flow-bar.tsx` → `== 1` (baseline: `0`)
- Dependencies: none

**Task 12 — Assemble the three columns in Workbench** `L`
- File: `studio/src/components/workbench.tsx`
- Anchor: `<TaskPanel state={state} claudeContext={claudeContext} />` → line 648
- Code sample: the inspector aside is replaced by `ProjectActivity`; the centre gains the breadcrumb row and the composer, and the terminal becomes a card
  ```tsx
  <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">Workspace</span>
      <span className="text-sm text-muted">/</span>
      <span className="text-sm font-medium text-text">{project.name}</span>
      <div className="ml-auto flex items-center gap-2">{/* branch pill, ellipsis */}</div>
    </div>
    {/* existing TabStrip */}
    <FlowBar … />
    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface">
      {/* existing TabPane / TerminalPane — unchanged */}
    </div>
    <Composer sessionId={activeSessionId} chips={chips} onRemoveChip={removeChip} />
  </div>
  <ProjectActivity state={state} diff={diff} claudeContext={claudeContext} />
  ```
- Do not touch: `TabPane`, `ShellPane`, the PTY wiring, and the `[&_[aria-label='Add_a_tool']]:hidden` rule at line 238 — the terminal's behaviour is reused unchanged and only its container is restyled
- Verify (local): `grep -c 'ProjectActivity' studio/src/components/workbench.tsx` → `>= 1` and `grep -c -F 'Workspace' studio/src/components/workbench.tsx` → `>= 1` (baseline: `Project activity` appears in `0` files)
- Dependencies: Task 7 (ProjectActivity), Task 10 (Composer), Task 11 (FlowBar stages)

**Task 13 — Wire the new rail into App.tsx** `M`
- File: `studio/src/App.tsx`
- Anchor: `import { ProjectSidebar } from './components/project-sidebar';` → line 23
- Code sample: `WorkspaceRail` wraps the project list, so the rail owns brand, nav, search and footer while `ProjectSidebar` stays the list
  ```tsx
  import { WorkspaceRail } from './components/workspace-rail';
  …
  <WorkspaceRail
    experience={experience} onExperience={setExperience}
    search={projectSearch} onSearch={setProjectSearch}
    onAddProject={addProject} onSettings={openSettings} user={user}
  >
    <ProjectSidebar … />
  </WorkspaceRail>
  ```
  The search value filters the list passed to `ProjectSidebar`; an empty result renders the rail's empty state rather than a blank column.
- Do not touch: routing between Build / Verify / Connections, the onboarding flow, and the Settings page — this task changes only how the left column is composed
- Verify (local): `grep -c 'WorkspaceRail' studio/src/App.tsx` → `>= 1` (baseline: `0`)
- Dependencies: Task 5 (the rail), Task 6 (the project list it wraps)

**Task 14 — Add the workbench-v2 guard tests** `M`
- File: `tests/test_workbench_v2.py` (create)
- Code sample: lock the Contract's literal copy, the two declared deviations, and the token discipline that makes the palette match
  ```python
  import os
  import re

  SRC = os.path.join(os.path.dirname(__file__), '..', 'studio', 'src')


  def _read(*parts):
      with open(os.path.join(SRC, *parts), encoding='utf-8', errors='replace') as fh:
          return fh.read()


  class TestContractCopy:
      """The mockup's strings are the spec. A reworded placeholder is the
      cheapest way for this UI to drift away from the design it was built to."""

      def test_rail_copy(self):
          rail = _read('components', 'workspace-rail.tsx')
          assert 'Find a project…' in rail
          assert 'WORKSPACE' in rail
          assert 'Add project' in rail

      def test_activity_copy(self):
          panel = _read('components', 'project-activity.tsx')
          assert 'Project activity' in panel
          assert 'Everything moving forward.' in panel
          assert 'Recent history' in panel

      def test_composer_copy(self):
          composer = _read('components', 'composer.tsx')
          assert 'What would you like to build next?' in composer
          assert 'Enter to send · Shift + Enter for a new line' in composer


  class TestDeclaredDeviations:
      """Two places where the build deliberately departs from the mockup. Both
      are recorded in the decision's Design Contract; a silent reversal to the
      mockup's wording would mislabel the user's own /ec-* chain."""

      def test_flow_bar_names_the_real_stages(self):
          flow = _read('components', 'flow-bar.tsx')
          assert 'Brainstorm' in flow and 'Refine' in flow
          assert 'Explore' not in flow

      def test_no_model_selector(self):
          assert 'Claude Sonnet' not in _read('components', 'composer.tsx')


  class TestNoFabricatedData:
      """task-panel.tsx:10-30 set the precedent: show a value only when it is
      real. These guards keep the mockup's sample data out of the product."""

      SAMPLES = ['Jamie Smith', 'orbit-web', 'atlas-api', 'Website · main', 'Backend service']

      def test_mockup_sample_data_is_not_hardcoded(self):
          for name in ('workspace-rail.tsx', 'project-activity.tsx', 'composer.tsx',
                       'project-sidebar.tsx'):
              body = _read('components', name)
              for sample in self.SAMPLES:
                  assert sample not in body, f'{name} hardcodes {sample!r}'

      def test_composer_sends_through_the_real_api(self):
          assert 'ptyWrite' in _read('components', 'composer.tsx')


  class TestTokenDiscipline:
      """The palette already matches the mockup because every colour is a token.
      One raw hex is how that stops being true."""

      def test_no_raw_hex_in_components(self):
          root = os.path.join(SRC, 'components')
          offenders = []
          for name in sorted(os.listdir(root)):
              if not name.endswith('.tsx'):
                  continue
              with open(os.path.join(root, name), encoding='utf-8', errors='replace') as fh:
                  if re.search(r'#[0-9a-fA-F]{6}\b', fh.read()):
                      offenders.append(name)
          assert not offenders, f'raw hex colours in: {offenders}'
  ```
- Do not touch: every existing test file; `pytest.ini`
- Verify (local): `python3 -I -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" tests/test_workbench_v2.py && grep -c 'class Test' tests/test_workbench_v2.py` → `== 4` (baseline: file absent). Running the suite is a Handoff step on this proof mode, not a verify.
- Dependencies: Task 5, Task 6, Task 7, Task 10, Task 11 (every file these guards read must exist first)
