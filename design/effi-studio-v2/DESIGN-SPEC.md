# Effi Studio · Product & design specification

## 1. Identitas dan tujuan

**Effi** berasal dari efficiency. **Effi Studio** adalah workspace untuk mengembangkan dan memverifikasi software, dengan project context, agent, terminal, browser, device tools, serta koneksi kerja pada satu tempat. Produk tidak bergantung pada satu provider AI.

**Build** melayani pembuatan, menjalankan, dan meninjau software. **Verify** akan melayani QA, exploratory testing, test management, evidence, dan reproduksi bug. Saat ini Verify hanya landing Coming soon; daftar tersebut adalah arah produk, bukan fitur yang harus diimplementasikan sekarang. Menjalankan test dari terminal Build tetap normal; itu tidak mengaktifkan produk Verify.

Satu aplikasi, bukan dua binary. Dua pengalaman berbagi project registry dan tool installation. Nanti pengguna dapat memilih Build saja, Verify saja, atau keduanya; tidak perlu menginstal tool yang sama dua kali.

## 2. Status rilis dan selection

| Area | Rencana implementasi sekarang | Perilaku |
|---|---|---|
| Effi Studio shell | Aktif | Project registry, navigasi, Settings |
| Build | Tersedia | Bisa dipilih saat onboarding atau ditambahkan kemudian |
| Verify | Coming soon | Bisa melihat preview informatif; tidak bisa dipilih/install/menjalankan QA |
| Claude Code & Codex | Target Build | CLI sessions nyata melalui adapter, dipilih per tab |
| Other CLI | Opsional | Path/program dan argumen eksplisit; tanpa klaim workflow otomatis |
| Terminal | Fasilitas dasar | Shell lokal, tidak butuh Claude untuk membuka aplikasi |
| Browser | Opsional | Preview web dalam tab bila diaktifkan, tidak meluncur otomatis |
| iOS / Android | Opsional | Setup/launch/control; live embedded view hanya jika integration nyata mendukung |
| Memory/workflow toolkit | Opsional | Tidak memblokir app/provider lain |
| Jira/MCP Connections | Opsional | Setup dan health aktual per consumer; tidak otomatis terhubung |

Current onboarding menampilkan dua card dengan independent checkbox: Build tersedia; Verify disabled dengan badge Coming soon dan teks alasan. Tidak ada checkbox “Both” yang masih bisa ditekan saat Verify belum rilis. Setelah rilis, kedua checkbox aktif dan summary menghitung pilihan sebenarnya.

Build boleh dipilih sebagai rekomendasi awal, tetapi tidak ada download, pencarian credential, atau penulisan konfigurasi sebelum tindakan pengguna. `Set up later` masuk shell netral; Build dapat diaktifkan dari experience selector. Pada future Verify-only, core browser/device tools juga bisa dipakai tanpa memasang Build. Ini aturan arsitektur, bukan layar QA aktif untuk sekarang.

## 3. Brand & visual system

Gaya **Precision Atelier** dipertahankan: graphite hangat, copper yang tenang, teks off-white, struktur editorial, kepadatan nyaman, terminal luas, detail presisi. Hindari dashboard generik, neon, gradient besar, atau banyak card dekoratif.

Nama UI: Effi, Effi Studio, Build, Verify. EffiDev/EffiTest/EffiClaude bukan nama produk baru. Nama provider tetap tampil sebagai identitas provider. Nama teknis legacy seperti `.efficlaude` dan `/ec-plan` boleh tetap ada untuk kompatibilitas; jangan mengganti dengan `/effi-plan` rekaan.

Simbol: E geometris dalam frame angular terbuka, dua bar interior, square kecil di kanan. Makna efficiency + workspace. Clear space setengah tinggi simbol; UI mark 16–24px; lockup minimal sekitar 96–120px. Wordmark Effi sans medium/semibold; STUDIO kecil hanya jika cukup ruang. Build/Verify adalah teks pengalaman, bukan dua logo yang tidak berhubungan. App icon satu squircle graphite dengan simbol copper; tidak ada app icon kedua untuk Verify.

| Token | Nilai |
|---|---|
| Ground / surface / raised / hover | `#101112` / `#17191B` / `#1D2023` / `#25292D` |
| Border | `#30353B` |
| Text / secondary | `#F3EFE9` / `#A4ABB2` |
| Copper / on-copper / tint | `#E5A17C` / `#211710` / `#30241E` |
| Success / warning / error | `#9CC5AF` / `#E6C182` / `#EDA6A6` |
| Terminal foreground | `#E2E5E8` |

System sans (SF Pro/system-ui) dan system mono (SF Mono/Menlo). Body 14/21; meta 12/18; section 14/20 semibold; project title 20/28; setup title 28–30/36; editorial 38/44. Terminal 13–14px dengan line-height nyaman. Spacing 4/8/12/16/24/32/40; radius control 8px, group 12px, popover 10px; border 1px. Native icons outline 16–18px dengan stroke konsisten. Status warna selalu punya label/icon. Checkbox selected memakai copper; healthy memakai sage; dua arti jangan disamakan. Kontras normal minimal 4.5:1.

## 4. Information architecture

- Experience selector di atas sidebar: Build; Verify Coming soon dapat dibuka sebagai landing informatif.
- Projects: registry bersama, project aktif, folder navigation, Add project, Remove from Studio.
- Workbench: tab agent/terminal/browser/device pada proyek yang dipilih.
- Inspector: Tasks/History dan Project & Git; contextual source jelas.
- Connections: halaman/overlay koneksi project, dengan global account scope bila implementasi mendukung.
- Settings: Experiences, Agents, Tools, Connections, Appearance, Diagnostics. Connections sidebar membuka tujuan yang sama, bukan konfigurasi duplikat.

Experience tidak sama dengan provider. Provider tidak sama dengan tab. Tool availability tidak sama dengan installed/enabled/connected/authenticated. Label dan icon harus membedakan semuanya.

## 5. Onboarding modular

### Langkah 0 — DMG
Drag Effi Studio ke Applications. Packaging hanya memasang binary app. Jangan menjalankan shell toolkit atau mengunduh SDK dari proses drag. Native app/folder alias ditempatkan di safe area background; jangan menggambar ikon duplikat pada background. Tidak ada klaim notarization yang belum benar.

### Langkah 1 — Choose experiences
Left editorial `Your tools. Your flow.`. Right `How will you use Effi?`, helper `Choose what you need. Add more later.`. Build: Available; Verify: Coming soon, readable disabled control dan `Not available to install yet.`. CTA `Continue with Build` bila Build dipilih; `Set up later` sebagai secondary. Jika Build tidak dipilih, CTA `Open Studio` untuk shell netral. Verify tidak memicu download, antrean install, waitlist, atau email capture.

### Langkah 2 — Choose tools
Ringkas, gunakan installed tools bila ditemukan. Kelompok Agents, Tools, Connections (skip). Multi-select agent: Claude Code, Codex, Other CLI. Tidak ada default provider yang wajib bagi semua orang. Detection lokal bukan auto-login, bukan pengiriman request ke provider.

Terminal adalah included core, bukan checkbox download palsu. Browser opsional; iOS/Android default off. Device rows membedakan belum enabled, dependency missing, device/runtime missing, dan available. Project memory dan Claude workflow toolkit default off kecuali existing user sudah memilikinya.

Selection summary harus menghitung apa yang baru dipasang vs tool yang sudah ada: `2 existing agents linked · Browser enabled · No device downloads`. Jika memang ada instalasi, CTA `Review setup`; layar review menyebut komponen, tujuan file/config, dependency, dan command/source yang akan dijalankan bila relevan. Jangan mengarang ukuran download/durasi. Bila hanya link/enable, CTA `Open Build`.

Missing provider tidak menghalangi agent lain atau terminal. Berikan `Set executable path`, `Check again`, `Set up later`; CLI login dilakukan pada sesi provider yang sesuai. Aksi download/install besar eksplisit dan per komponen, bukan memilih sebuah card lalu langsung memasang Xcode/Android SDK.

### Langkah 3 — Setup & readiness
Status per komponen: not selected, detected, queued, installing/setup session open, ready, needs attention, unavailable. Status dipakai sesuai sumber data; jangan menganggap semua bisa diketahui dari API sekarang.

Instalasi parsial: komponen yang berhasil tetap dipakai. `Open Build` tetap tersedia jika core siap; warning optional belum siap dapat diselesaikan nanti. CTA `Retry this component` hanya jika lifecycle benar-benar mendukung retry. Log install tetap terlihat dan interaktif jika PTY mungkin menunggu input.

Invoker resolve bukan install success. PTY exit bukan exit code script. Lifecycle legacy script di shell dapat tetap hidup setelah script selesai. Keberhasilan komponen dibuktikan diagnostic/check yang relevan. Recheck manual selalu ada. Indeterminate status bila tidak ada progress real; tidak ada persen timer rekaan.

## 6. Build workbench

Target besar 1440×900; default aktual 1180×760 harus tetap nyaman. Sidebar 220/208px, inspector 300/280px, main fleksibel. Chrome native; jangan buat traffic lights HTML kedua.

Project header menunjukkan nama/path/branch. Tab strip setinggi 38–40px, horizontal scroll/overflow yang dapat diakses. Tiap tab punya icon, judul, provider/tool bila relevan, menu/close yang dapat dijangkau keyboard. Plus membuka Add a tool. Tab order persisted sebagai metadata, bukan mengklaim proses tetap hidup setelah app quit.

Tipe tab: Agent session (Claude Code/Codex/Other CLI), Shell terminal, Browser, iOS Simulator, Android Emulator. Bisa lebih dari satu tab tipe yang sama. Tab identity stabil, terpisah dari project id, dan session id unik. Tidak ada reuse satu PTY untuk dua agent. Pindah provider = membuka sesi berbeda, bukan mengganti executable proses yang ada.

Close tab yang benar-benar masih punya sesi perlu tindakan yang jelas `Close session`; jangan menampilkan status running bila tidak bisa diobservasi. Browser close tidak mematikan shell; device close-tab dan stop-device adalah aksi berbeda. Pindah proyek, mode preview, Settings, atau Connections tidak boleh meng-unmount sesi yang masih hidup.

### Provider-aware workflow
Claude dengan toolkit yang benar-benar terdeteksi menampilkan Brainstorm → Plan → Refine → Execute → Review → Git dan CTA literal `/ec-*` sesuai routing lama. Helper menamai target `Sends /ec-execute to Claude Code`. Jangan dispatch ke tab aktif jika tab itu browser/Codex/shell. Saat target tersembunyi, CTA eksplisit `Open Claude Code`; dispatch hanya setelah target yang benar tersedia dan tindakan pengguna.

Codex/Other CLI tanpa workflow adapter menampilkan terminal asli, label `CLI session`, dan helper ringkas `Workflow shortcuts are not configured for this agent.`. Tidak perlu banner besar yang mengurangi terminal. Tidak ada `/ec-*` palsu. Generic user prompt tetap bisa diketik di terminal. Adapter baru boleh ditambahkan nanti dengan kontrak yang diuji.

Plan source project boleh tetap terlihat pada inspector saat tab provider lain aktif, tetapi selalu berlabel `Source: Claude plan`; tidak diklaim sebagai progres provider aktif. Source selection bila lebih dari satu harus eksplisit. Stage adalah rekomendasi workflow, bukan agent-running telemetry. Checklist read-only; pending tidak diberi spinner. Raw markdown fallback, original tags, done/total, history window/hidden counts tetap ada.

Brainstorm field hanya muncul dalam context tahap tersebut; jangan memengaruhi command lain. Git tetap bare `/ec-git`, konfirmasi lama tidak dilewati. Branch management di Project & Git, error asli, detached HEAD dan warning unfinished tasks tetap jelas.

## 7. Add a tool dan optional tools

Menu Add a tool dipisah Agent sessions / Workspace tools. Item available membuat tab lewat tindakan pengguna; item missing membuka setup terkait; item belum didukung menampilkan Unavailable dengan alasan, bukan tombol yang berpura-pura bekerja. Checkboxes onboarding berbeda dari tabs yang sedang terbuka.

### Browser
Tab native embedded browsing surface dengan back/forward, reload, address field, judul halaman, open externally. URL localhost dapat diisi manual; jangan mengklaim dev server ditemukan otomatis. Loading/error/unreachable/certificate/download/popup states perlu jelas. Browser tidak otomatis menghidupkan server. External remote content tidak mendapat akses privileged IPC app, file project, credentials agent, atau shell. Browser storage scope dan user navigation harus dirancang sebelum implementasi.

Screenshot UI preview memakai data aplikasi contoh, bukan fitur Effi commerce. Tidak perlu DOM inspector, screenshot automation, recording, test steps, atau agent browser control sekarang; jangan membuat suite Verify lewat pintu belakang.

### iOS Simulator dan Android Emulator
Default tidak dipasang, tidak diboot, dan tidak mengunduh runtime. Device tab memiliki device selector, prerequisite/readiness, setup instructions, explicit Launch/Open, Stop device yang terpisah, status dari proses/tool aktual. iOS hanya platform yang mendukung dan punya prerequisites; Android juga butuh tools serta device/runtime. Jangan menganggap hanya ada SDK berarti emulator ready.

**Target UX:** live viewport di tab jika backend integration benar-benar tersedia. Native simulator tidak boleh diasumsikan dapat di-embed ke webview. Jika belum didukung, tab menjadi control surface dengan teks `Opens in a separate window` dan aksi `Open Simulator` / `Open Emulator`. Ini fallback fungsional yang jujur; bukan alasan menampilkan gambar device statis sebagai live preview. Tetap sediakan Open in separate window saat embedded preview didukung.

Setiap device/run dikaitkan ke proyek/tab, tetapi simulator yang sudah dibuka pengguna di luar app tidak dianggap dimiliki app. Stop hanya device/proses yang benar dan eksplisit. Tidak ada reboot/wipe/reset/destructive action tersembunyi.

## 8. Connections dan MCP

Connections adalah pusat setup; Jira/GitHub/Figma dan custom MCP adalah opsi, bukan syarat onboarding. Connection scope bisa global account + project binding; UI menampilkan target proyek, credential/account, server transport, dan consumer yang diaktifkan. Jangan hardcode dukungan transport/auth yang belum diverifikasi implementer.

Jira sebagai connector dapat memakai API native atau MCP adapter yang benar-benar tersedia; jangan menyebut semua Jira connector pasti MCP. Custom MCP meminta konfigurasi yang diperlukan dengan label aman dan input terstruktur, bukan menjalankan arbitrary shell saat form dibuka.

Scope adapter awal adalah Jira dan custom MCP. GitHub/Figma pada katalog desain merupakan Planned bila belum ada adapter nyata; jangan membuat tombol Configure yang tidak bekerja. Integrasi lain dapat ditambahkan tanpa mengubah arsitektur Connections.

Alur: pilih connector → configure/authenticate → inspect permissions/scope → explicit connect → check connection → pilih consumer/project binding. Credential tidak muncul di screenshot, logs, raw config preview, atau repo. OAuth/token form mengikuti capability connector aktual; jangan menjanjikan OAuth bila aplikasi/provider belum disiapkan.

Status berbeda: not configured / configured / checking / connected / needs authentication / failed / disabled / unsupported by this agent. `Connected to Effi` tidak sama dengan `Available to Codex`. Matrix consumer: Effi, Claude Code, Codex sesuai hasil adapter. Jangan menyalin credential dari satu provider config ke provider lain tanpa explicit action.

Write to provider config harus punya preview perubahan, scope, dan explicit Apply; preserve user config/secret store. Disconnect binding berbeda dengan revoke credential global; label konsekuensi jelas. Tidak boleh menghapus koneksi yang dipakai proyek lain diam-diam. Jira issue browsing/read-only context dapat menjadi fase awal; tidak ada auto-create ticket/comment/update status tanpa aksi pengguna.

## 9. Verify Coming soon

Experience menu membuka landing dengan judul `Verify, coming soon.` dan paragraf pendek `A focused space for testing, evidence, and release confidence.`. Tiga feature teasers berlabel planned: Explore flows, Capture evidence, Track quality. Ini konten informasi, tanpa test runner, report palsu, CTA Install, Activate, Start testing, waitlist, email collection, atau tanggal rilis rekaan.

Primary `Back to Build` bila Build aktif; `Back to Studio` jika tidak. Secondary `Manage experiences`. Project context dan sesi Build tetap hidup. Settings Experiences juga menampilkan Verify Coming soon dengan disabled checkbox. Tidak ada verify dependency/dead download, migration QA data, atau backend stub aktif.

## 10. Empty, error, compact, dan keyboard

- Shell tanpa pengalaman: `Make this workspace yours.` + `Set up Build`; Verify Coming soon nonblocking.
- Build tanpa proyek: `Your next project starts here.` + Add project folder.
- Belum ada agent: terminal tetap bisa dipakai; Add an agent opsional.
- Missing executable: tampilkan path, Set path/Recheck, jangan crash semua project.
- Tab browser unreachable: URL tetap editable, Retry, Open externally. Jangan menghapus tab/session lain.
- Device setup missing: prerequisites dan tindakan setup, tidak ada loading selamanya.
- Connection failed: error relevan tanpa credential, scope jelas, retry tidak menggandakan konfigurasi.
- No plan/no history dan raw-plan fallback dirancang, bukan data contoh.
- 0 task: `No tasks yet`, tidak ada 0/0 atau 100%.
- Folder load error dibedakan dari folder empty; long task wrap, branch/path truncate dengan full value accessible.

1360px+: 220/300 panels; 1100–1359: 208/280; 900–1099: inspector drawer, sidebar 192; <900: sidebar drawer dan inspector drawer, satu modal overlay aktif, main fleksibel. Installer editorial disembunyikan di compact width. Workflow/tabs overflow satu baris, bukan tumpukan.

Pertahankan Cmd+1…9 untuk proyek terdaftar, Cmd+B sidebar, Cmd+J inspector, Cmd+K workflow; jangan diam-diam mengganti shortcut menjadi command palette. Tab navigation dan close punya kontrol keyboard yang jelas; Escape menutup popover/drawer dengan focus return. Jangan merebut karakter terminal biasa. Icons label/tooltip, native button semantics, tabs aria-selected, keyboard arrow navigation, visible focus ring. Jangan live-announce setiap byte terminal.

Motion 120–160ms, reduced motion. Tidak ada indikator task-running palsu atau autoscroll yang merebut posisi baca. Resize webview dan terminal konsisten; hidden terminal tidak fit ke 0×0.

## 11. Keberhasilan desain

Pengguna memahami bahwa ini satu aplikasi dengan dua pengalaman, Verify belum rilis, setiap extra tool opsional, setiap tab punya tujuan dan lifecycle, serta status selalu berbasis data. Build tanpa Claude/SDK/MCP tetap dapat dibuka. Penambahan agent/browser/devices/Connections tidak merusak workflow Claude lama. Semua layar tetap memiliki karakter visual yang sama dengan desain yang sudah disetujui.
