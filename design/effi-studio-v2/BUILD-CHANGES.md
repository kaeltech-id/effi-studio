# Perubahan Build dari EffiClaude saat ini

Dokumen ini memetakan kebutuhan produk ke repository yang diaudit. Ini handoff implementasi, bukan klaim pekerjaan sudah diimplementasikan. Tidak ada kode app diubah pada tahap desain.

## 1. Perubahan utama

| Saat ini | Target Effi Studio | Implikasi implementasi |
|---|---|---|
| Branding EffiClaude Studio | Effi Studio, Build/Verify di satu app | Display name, icon, onboarding, packaging; migration identity diperiksa |
| Claude dianggap prasyarat global | Core app terbuka tanpa provider tertentu | Pisahkan readiness core, experience, provider, tool |
| Doctor global memblokir bila Claude/commands kurang | Diagnostics per komponen | Missing optional tidak memblokir Build lain |
| Installer monolitik install.sh | Setup/link/enable komponen pilihan | Tidak cukup membuat checkbox yang masih memanggil install-all |
| Satu terminal per project id | Banyak tab/session per project | Registry tab metadata + session id unik, backward mapping |
| Program Claude tunggal dari doctor | Agent registry/provider adapter | Path/capability config per provider, sesi terpisah |
| FlowBar menulis ke project PTY | Dispatch ke sesi dan provider eksplisit | Jangan kirim `/ec-*` ke Codex/browser/shell |
| Task dari `.claude` | Tetap valid sebagai source berlabel | Tidak boleh dianggap progress semua agent |
| Terminal menjadi seluruh main | Workbench dengan agent/terminal/browser/device tabs | Layout/lifecycle dan IPC baru, bukan sekadar CSS |
| Tidak ada browser native/MCP UI/device adapter | Surface opsional dengan backend nyata | Capability check, diagnostics, error, scope |
| Tidak ada Verify | Landing Coming soon | Tidak membuat fitur QA runner/install |

## 2. Bagian sumber yang harus dibaca

- `studio/src/App.tsx`: program tunggal, doctor gate, panels, per-project state, project lifecycle, handler dispatch.
- `studio/src/lib/types.ts`: Doctor, ProjectState, Task, PanelState; field yang tersedia saat ini.
- `studio/src/lib/flow.ts`: mapping nextStep; jangan menggantinya menjadi current-running heuristic.
- `studio/src/lib/tauri-api.ts`: invoke boundary dan subscription PTY/project state.
- `studio/src/components/terminal-pane.tsx`: subscribe-before-open, hidden dimensions, UTF-8, focus nonce.
- `doctor-screen.tsx`, `flow-bar.tsx`, `project-sidebar.tsx`, `tree-row.tsx`, `task-panel.tsx`, `history-panel.tsx`, `properties-panel.tsx`.
- `studio/src/lib/use-shortcuts.ts`: existing Cmd shortcuts, exemption textarea xterm.
- `studio/src-tauri/src/lib.rs`, `pty.rs`, `doctor.rs`, `projects.rs`, `watcher.rs`, `plan.rs`, `git.rs`, `tree.rs`.
- `studio/src-tauri/tauri.conf.json`, capabilities, icons source, `install.sh`.

## 3. Data dan lifecycle yang perlu ditambahkan

Definisikan kontrak terlebih dahulu, nama field final mengikuti style repo:

- Experience preference: Build enabled/disabled; Verify availability comingSoon. Future enable kedua pengalaman tidak menuntut dua install core. Availability dari rilis/config, bukan arbitrary UI checkbox.
- Component selection/readiness: provider, tool, dependency, enable state, availability, diagnostic result, last error. “Detected executable” berbeda dari auth; jangan meminta status login dari API yang tidak mengembalikannya.
- Agent definition: stable id, display name, executable path, explicit args, supported capabilities, session launcher, config scope. Custom CLI bukan shell string gabungan yang rawan parsing; path dengan spasi wajib berfungsi.
- Tab metadata: stable tab id, project id, type, title, optional provider id, session id, tool state. Project selection tidak sama dengan active tab selection. Multiple sessions same provider dapat dibedakan.
- Workflow adapter: eligible provider, required toolkit, command mapping, plan source, explicit target session. Claude adapter pertama memakai existing `/ec-*` dan existing plan watcher; Codex base support adalah CLI nyata tanpa pretend parity.
- Connection config: connector type, scope, server config/credential reference, consumers/bindings, validated health. Jangan menaruh token dalam plain project metadata.
- Device config: prerequisite/tool discovery, device/runtime identity, launch handle, external/embedded capability, ownership. “Tab opened” bukan “device booted”.

Ini outline data produk, bukan kewajiban membuat framework/plugin marketplace besar. Implementasikan seam yang cukup untuk Claude, Codex, custom CLI, browser, device control, dan Jira/custom MCP secara bertahap.

## 4. Kompatibilitas wajib

Ganti display branding sekarang; jangan mass-rename folder `.efficlaude`, `.claude`, commands `/ec-*`, sentinel, registry, bundle identifier, dan key penyimpanan tanpa migration yang mempertahankan existing users. App identifier baru dapat mengubah lokasi state/izin; review sebelum diubah. Old paths boleh tetap menjadi internal implementation detail dan tampil dalam log asli.

Existing project registry, order, panel prefs, Claude override path, history dan watch subscriptions harus tetap terbaca. Backfill satu legacy terminal menjadi satu tab Claude bila diperlukan; jangan membuat dua PTY dari source yang sama saat migration. Session process tidak dapat dianggap survive app quit; restore tab metadata tidak berarti restore proses yang lama.

Task/history tetap read-only dari plan source. Empty fallback menyebut `/ec-plan`, bukan `/ec-feature`. Jangan menulis plan agar terlihat selesai. Git confirmations, unavailable/detached/error/hidden counts tidak dihilangkan.

Jangan meng-upgrade toolkit user secara diam-diam saat app relaunch. Opening Settings/Connections/Verify preview tidak membunuh terminal. Removing project menutup hanya tab/session project tersebut dan tidak menghapus folder.

## 5. Modular setup yang benar

Existing `install.sh` memasang commands, agents, worker/files, hooks/settings, Python dependencies, dan optimizer. UI optional tidak sah jika backend tetap menjalankan semua itu untuk pilihan Browser saja atau Codex saja.

Target implementasi harus memisahkan operasi link existing / enable bundled capability / setup external dependency / install selected toolkit components. Perlihatkan dampak sebelum menjalankan perubahan. Legacy install-all tetap boleh tersedia sebagai opsi yang diberi nama dan scope jelas untuk pengguna lama, bukan default seluruh app.

Provider CLI tidak harus di-download oleh Effi. UI boleh link executable existing dan menyediakan setup guidance. Xcode/SDK/runtime besar tidak diunduh atau terms diterima secara otomatis. Disable/unlink tool tidak otomatis meng-uninstall aplikasi eksternal atau menghapus credential yang dipakai proyek lain.

Installer shell legacy punya session id khusus dan invoke sukses berarti session start saja. Jangan menyalin asumsi event exit == script success. Untuk retry perlu benar-benar memastikan sesi lama bisa digunakan/dibersihkan secara aman. Komponen yang tidak dipilih tidak boleh masuk install plan. Optional failure membuat partial success, bukan global red gate.

## 6. Browser, device, dan Connections bukan styling-only

Browser butuh browsing surface native/integration nyata, isolation dari privileged app IPC, lifecycle/tab resizing, storage scope, navigation dan errors. Jangan menganggap arbitrary site dapat di-iframe; jangan melonggarkan keamanan seluruh app untuk membuat preview jalan. Verifikasi API resmi sesuai versi stack saat implementasi.

Device native butuh discovery dan launch adapter. In-tab live preview adalah capability tambahan, bukan properti otomatis dari simulator. Minimum fallback yang valid adalah device control dalam tab + jendela native eksternal yang dilabeli. Jika environment tidak mendukung live embedding, laporkan batas itu; jangan buat placeholder screenshot interaktif palsu.

Jira connector vs custom MCP harus jelas. Tentukan transport/auth/read scopes berdasarkan dokumentasi resmi yang aktual ketika implementasi. Jangan mengarang config schema Claude/Codex atau menyimpulkan semua provider membaca satu file MCP. Aksi “Apply to agent” harus menampilkan destination/scope/perubahan dan mempertahankan config user. Connected berarti check berhasil, bukan field sudah terisi. Tidak ada posting Jira/update issue otomatis.

## 7. Urutan implementasi yang disarankan

1. Tokens, logo/icon master, display rebrand, shell experience model dan Verify Coming soon.
2. Hilangkan global Claude gate; modular setup dan diagnostics selection tanpa merusak legacy.
3. Per-project multi-tab/session identity; Claude/Codex/custom CLI nyata; provider-aware command dispatch.
4. Workbench, inspector/source label, empty/error/compact states.
5. Browser optional browsing surface dan device setup/control, external fallback jelas.
6. Connections: custom MCP config/bindings dan Jira adapter/setup yang tervalidasi, tidak fake connected.
7. Packaging, migration, keyboard, regression/integration dan visual QA.

Urutan ini bukan alasan mengklaim seluruh produk selesai setelah langkah 1. Laporan final harus memisahkan implemented, verified, unavailable in environment, dan deferred. Verify tetap sengaja Coming soon di setiap fase.

## 8. Acceptance cases utama

- Fresh install tanpa Claude, Codex, Xcode, Android, MCP: app shell dapat dibuka; setup bisa dilewati; optional tools tidak diunduh.
- Build + Codex saja: bisa membuka sesi Codex/terminal tanpa Claude toolkit gate, tanpa tombol `/ec-*` salah target.
- Existing Claude projects: state/history/preferences tetap ada; workflow lama bekerja.
- Dua sesi agent pada proyek yang sama: output dan command tidak tertukar; switch tab/project tidak merestart proses.
- Browser aktif saat pengguna menekan workflow CTA: pilih/navigasi target Claude eksplisit; tidak menulis ke tab/sesi lain.
- Verify preview lalu Back: provider sessions tidak mati; Verify tidak muncul dalam install plan.
- Optional Android setup gagal: Build tetap bisa dibuka, error dan recovery jelas.
- Browser localhost mati: Retry/Open externally, tidak mematikan terminal atau menjalankan server tanpa aksi.
- MCP dikonfigurasi untuk satu consumer: consumer lain tidak otomatis Connected.
- Upgrade branding tidak menghilangkan registry, config, history, atau credential.
- 1440×900, 1180×760, 980×700, 800×650: controls terjangkau, terminal leluasa, tab/workflow overflow rapi.
