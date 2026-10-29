# Prompt implementasi Effi Studio v2 untuk Claude

Salin mulai dari garis berikut ke Claude di root repository. Prompt ini menggantikan handoff EffiClaude lama.

---

Implementasikan evolusi **EffiClaude Studio → Effi Studio** berdasarkan paket desain yang sudah saya setujui. Ini satu aplikasi untuk developer dan nantinya QA, dengan pengalaman **Build** dan **Verify**. Sekarang kerjakan Build dan fondasi universal; Verify hanya Coming soon.

Ini implementasi produk, bukan hanya rename atau mengganti warna. Pertahankan fungsi Claude lama sambil menambahkan modular setup, multi-agent, workbench tabs, optional tools, dan Connections secara nyata.

## 1. Wajib baca dokumen dan buka mockup

Paket aktif `design/effi-studio-v2/`. Baca sepenuhnya:
- `design/effi-studio-v2/README.md`
- `design/effi-studio-v2/DESIGN-SPEC.md`
- `design/effi-studio-v2/BUILD-CHANGES.md`

**Buka dan lihat gambar berikut; jangan hanya membaca nama filenya.**

| File | Acuan |
|---|---|
| `design/effi-studio-v2/brand/01-effi-identity.png` | Logo, satu app icon, Build/Verify family |
| `design/effi-studio-v2/mockups/01-choose-experiences.png` | Selection pengalaman, Verify disabled Coming soon |
| `design/effi-studio-v2/mockups/02-build-setup.png` | Agents/tools opsional dan existing installations |
| `design/effi-studio-v2/mockups/03-build-workbench.png` | Workspace utama dan tab per provider/tool |
| `design/effi-studio-v2/mockups/04-browser-devices.png` | Browser tab dan setup device dengan external-window fallback |
| `design/effi-studio-v2/mockups/05-connections.png` | Jira/custom MCP, project scope, consumer availability |
| `design/effi-studio-v2/mockups/06-verify-coming-soon.png` | Landing Verify dalam app yang sama |
| `design/effi-studio-v2/mockups/07-dmg-install.png` | DMG Effi Studio |
| `design/effi-studio-v2/mockups/08-setup-states.png` | Component setup, ready, optional partial failure |
| `design/effi-studio-v2/mockups/09-codex-and-add-tool.png` | Codex tanpa Claude shortcuts dan menu Add a tool |

Lihat juga gambar tambahan jika ada di manifest README. Mockup adalah konsep AI, bukan bukti kemampuan backend. Teks, angka, output terminal, hasil diagnostic pada gambar adalah contoh. Perilaku, kontrak data, warna solid dan copy final mengikuti spec. Jangan memasukkan screenshot sebagai UI atau membuat status/tombol dummy.

`design/precision-atelier/` adalah arsip. Jangan menjalankan prompt lama bersamaan; arah baru mengikuti v2.

## 2. Keputusan produk final

- Brand **Effi**, aplikasi **Effi Studio**, satu binary macOS untuk sekarang. Jangan memperluas OS sebagai requirement tambahan.
- Build dan Verify adalah pengalaman dalam app yang sama; bukan provider AI atau app terpisah.
- Architecture nanti mendukung Build saja, Verify saja, keduanya. Sekarang Build available, Verify Coming soon dan tidak bisa dipilih/install.
- Semua experience/tool tambahan modular. `Set up later` membuka shell Studio; Terminal fasilitas dasar, bukan external download.
- Tidak ada global Claude gate. Codex-only, terminal-only, tanpa SDK mobile/MCP tetap bisa membuka app.
- Claude Code, Codex dan CLI lain memakai sesi/tab terpisah. Tidak menganggap semua provider punya kemampuan workflow identik.
- Browser, iOS Simulator, Android Emulator, memory, workflow toolkit, Connections optional dan tidak dipasang otomatis.
- Satu koneksi app tidak otomatis mengonfigurasi semua agent.

Nama dan visual sudah disetujui. Jangan berhenti meminta keputusan styling yang sudah tercakup. Tanyakan hanya bila ada keputusan yang benar-benar memblokir.

## 3. Audit sumber dan perubahan nyata

Baca instruksi repo dan pemetaan source di BUILD-CHANGES. Minimal App.tsx, CSS/tokens, types, flow, tauri-api, shortcuts, seluruh components, Rust PTY/doctor/project/watcher/plan/git/tree, Tauri config/capabilities, icons source, install.sh.

Temukan dan ubah seam: doctor gate global, program tunggal, PTY keyed by project, dispatch ke project, installer monolitik, Claude-specific plan source. Jangan menyembunyikan batas tersebut dengan tampilan baru.

Ikuti aturan Git repository. Jangan mengoperasikan Git autonom tanpa izin yang berlaku. Jangan menjalankan installer produksi, download SDK besar, mengubah provider config sungguhan atau memakai credentials pengguna hanya untuk screenshot.

Untuk API baru Tauri/browser/device/MCP/provider, verifikasi dokumentasi resmi sesuai versi saat implementasi. Jangan mengarang CLI flags, MCP schema/auth/transport, atau kemampuan embed simulator. Jangan refactor worker/domain logic luas di luar kebutuhan modular setup/adapter.

## 4. Visual dan brand

Pertahankan **Precision Atelier** persis karakternya: graphite hangat, copper, off-white, sage, editorial hierarchy, terminal luas, detail teliti.

Tokens: ground `#101112`, surface `#17191B`, raised `#1D2023`, hover `#25292D`, border `#30353B`; text `#F3EFE9`, secondary `#A4ABB2`, terminal `#E2E5E8`; copper `#E5A17C`, on-copper `#211710`, tint `#30241E`; success `#9CC5AF`, warning `#E6C182`, error `#EDA6A6`.

System sans + system mono; body14/meta12/section14 semibold/project20/setup28–30/editorial38px. Spacing grid4; control radius8/group12; border1; outline icons konsisten. Primary copper teks gelap. Selection copper berbeda dari success sage. Kontras ≥4.5:1 dan focus ring jelas. No purple/neon/gradient besar/generic dashboard/telemetry palsu.

Buat master SVG berdasarkan brand board: E angular dalam open bracket, dua interior bars, square kanan. Wordmark Effi. Satu icon untuk kedua pengalaman; exports Tauri/macOS via pipeline repo. Uji ukuran kecil/monochrome/@2x. Jangan crop brand board menjadi logo produksi.

Rebrand display/app/icon/DMG, tetapi jangan mass-rename `~/.efficlaude`, `.claude`, `/ec-*`, sentinel, registry, preferences atau bundle id tanpa migration. Existing users tidak kehilangan projects/order/prefs/overrides/history. Technical legacy names boleh tetap internal. Jangan menjanjikan proses survive quit; tab metadata restore berbeda dari process restore.

## 5. Experience shell dan Verify

Experience selector di sidebar, project registry bersama, Settings → Experiences memakai model availability yang sama dengan onboarding.

Build checkbox tersedia; Verify disabled dengan Coming soon dan alasan. Tidak ada Install both yang mengaktifkan Verify sekarang. Ketika Verify tersedia nanti, kedua checkbox independen dan komponen bersama tidak diinstall dua kali.

Set up later membuka shell netral `Make this workspace yours.` + Set up Build/Add project. Tidak memaksa provider. Verify membuka landing informatif `Verify, coming soon.` dengan planned teasers Explore flows/Capture evidence/Track quality, Back to Build atau Back to Studio, Manage experiences.

Tidak membuat QA runner, test reports/evidence storage aktif, Verify dependencies, Install/Activate/Start testing, waitlist/email collection, tanggal rilis, atau paid lock. Membuka preview Verify tidak mengubah project atau mematikan sesi Build.

## 6. Modular onboarding dan diagnostics

Choose experiences → Choose tools → Review/setup bila perlu → Open workspace. Agents dapat link executable existing Claude/Codex/custom CLI atau path pengguna. Detected hanya berarti ditemukan; tidak berarti sudah login. Provider authentication mengikuti flow provider yang valid di CLI, bukan password form buatan.

Terminal included; Browser enabled opsional; iOS/Android default off; memory dan Claude workflow toolkit optional. Pilih card tidak langsung download. Summary membedakan link existing, enable bundled, dan install baru. Review menunjukkan tujuan file/config/dependency dan perubahan yang akan dijalankan. Angka hanya jika terukur.

**Jangan membuat checkbox optional yang tetap memanggil install-all.** Existing install.sh memasang commands, agents, worker, Python deps, hooks/settings, optimizer. Modular plan/backend harus benar-benar hanya memasang pilihan. Codex-only/Browser-only tidak boleh menulis Claude hooks atau memasang worker Python.

Missing optional tidak mengunci app. Komponen ready tetap dapat dipakai ketika tool lain gagal. Check again manual, log interaktif, errors dan recovery relevan. Invoke resolve bukan sukses script; PTY exit tanpa exit code belum cukup. Baca lifecycle shell aktual dan tentukan readiness dari diagnostic. Retry harus benar-benar bekerja, bukan no-op karena reserved session lama.

Tidak auto-install provider CLI/Xcode/SDK/runtime, menerima lisensi atau uninstall external tools. Link existing dan guidance boleh menjadi jalur setup yang benar. Disable/unlink tidak menghapus installation atau credentials yang dipakai proyek lain.

## 7. Workbench multi-agent dan multi-tab

Main area menjadi Workbench. Tipe tab: agent session, shell terminal, browser, iOS Simulator, Android Emulator. Plus Add a tool memisahkan Agent sessions dan Workspace tools. Available membuat tab; missing membuka setup; unsupported menampilkan alasan. Boleh beberapa tab provider/tipe yang sama.

Tambahkan stable tab id dan unique session id, terpisah dari project id. Satu project dapat memiliki Claude dan Codex bersamaan. Output/input tidak interleave. Close satu tab tidak menutup seluruh project. Switch project/tab/Settings/Connections/Verify tidak meng-unmount sesi hidup.

Jangan membuat React key dari active index/provider selection, atau reuse satu PTY untuk dua agent. Pertahankan subscribe-before-open, byte UTF-8/ANSI, hidden size guard, FitAddon dan focus return. Resize pane hidden tidak menghasilkan 0×0 atau reopen proses. Custom CLI memakai path+args eksplisit dan validasi; path spasi bekerja, bukan shell string raw gabungan.

Provider ada di identitas tab, bukan global dropdown yang seolah dapat mengganti executable proses hidup. Close-session action jelas, tanpa infer running/ready dari output prompt. Restore metadata tidak mengirim ulang command lama. Removing project hanya menutup sesi milik project itu dan tidak menghapus folder.

## 8. Workflow per provider dan plan inspector

`/ec-brainstorm`, `/ec-plan`, `/ec-refine`, `/ec-execute`, `/ec-review`, `/ec-git` tetap milik existing Claude workflow dengan toolkit yang valid. Gunakan existing routing/source logic; stage bukan running telemetry.

Dispatch wajib punya target session/provider/adapter eksplisit. Helper menamai target: `Sends /ec-execute to Claude Code`. Bila tab Browser/Codex/shell aktif, jangan mengirim command ke sana. Navigasi/target action harus jelas dan perlu klik pengguna; jangan auto-create Claude session atau auto-send karena stage/proyek berubah. Git bare command dan konfirmasi existing tidak dilewati.

Codex/custom CLI adalah sesi nyata yang bisa dipakai normal. Tanpa adapter, tidak ada `/ec-*` parity palsu: sembunyikan shortcuts yang tidak relevan dan beri helper `Workflow shortcuts are not configured for this agent.`. Jangan mengganti nama pada button saja. Adapter baru nanti perlu kontrak capability dan pengujian terpisah.

Tasks/history berbasis project source, dengan label `Source: Claude plan` bila membaca existing `.claude` plan. Boleh terlihat saat tab Codex aktif, tetapi bukan klaim progres Codex. Multiple sources perlu pilihan eksplisit. Sidebar progress/stage juga punya sumber yang dapat ditemukan. Active project tidak mempunyai unread dot; background unread hanya data berubah, bukan running.

Task checklist read-only; done/total dari plan, pending hollow circle tanpa spinner. Raw markdown fallback, tags verbatim, feature title, history title/slug/time/branch dan hidden-count dipertahankan. Empty plan `/ec-plan` hanya untuk Claude context; provider lain copy netral. No 0/0 atau 100% bila tidak ada task. Brainstorm argument hanya memengaruhi brainstorm.

Inspector Tasks/History tabs dan Project & Git disclosure, source jelas, branches error/detached/unavailable/unfinished warning tetap ditangani. Jangan menambah changed-files/token/cost/model/latency/live health tanpa sumber data.

## 9. Browser optional

Implementasikan browsing surface nyata di tab dengan URL input, back/forward/reload, loading/error/unreachable, Open externally. Gunakan API/integration native yang valid pada stack, bukan iframe arbitrary website yang banyak diblokir.

URL localhost boleh manual; jangan mengaku autodetect server atau menyalakan dev server tanpa tindakan. Browser sample form di gambar adalah contoh aplikasi lokal, bukan feature profile/account Effi. Jangan membuat screenshot/recording/test automation sebagai implementasi Verify sekarang.

Remote content tidak boleh mendapat privileged app IPC, project files, credentials, atau PTY APIs. Jangan melonggarkan seluruh CSP/capabilities demi preview. Tentukan webview lifecycle, bounds/resizing, storage scope, popup/navigation/permissions. Error browser tidak merusak tab lain. Laporkan bila integrasi runtime tidak bisa diverifikasi di environment.

## 10. Device tools optional

Device tab menyediakan prerequisite/readiness, device/runtime selector, explicit Launch/Open, status aktual, dan kontrol yang memang didukung. Tidak boot/download karena tab dibuka. iOS prerequisite/platform dicek; Android tools saja belum berarti runtime/device siap.

Target UX mendukung live viewport in-tab **jika integration nyata tersedia**. Native simulator tidak otomatis bisa diembed dalam webview. Fallback minimum yang valid: controller dalam tab + native window terpisah, label `Opens in a separate window`. Jangan menampilkan phone screenshot statis lalu menyebut live embedded simulator. Laporkan capability yang benar-benar dibuat.

Tab close dan Stop device adalah aksi berbeda. Jangan stop device eksternal milik pengguna diam-diam. Tidak ada wipe/reset/reinstall tersembunyi. Set up button membuka langkah konkret/guidance, bukan no-op placeholder. Missing prerequisites/runtime/unsupported platform/error launch semuanya punya copy dan recovery.

## 11. Connections: Jira dan custom MCP

Connections bisa dilewati. Project scope, account/server, consumer bindings, health dari data nyata. Minimum fokus Jira + custom MCP. GitHub/Figma boleh katalog future dengan label Planned/Coming soon bila adapter belum ada, jangan Configure/Connected palsu hanya karena gambar menampilkan kartu.

Jira bisa melalui API connector atau MCP adapter tervalidasi; tentukan jalur aktual, jangan menyebut semua integrasi pasti MCP. Authentication mengikuti metode yang benar-benar didukung, tanpa janji OAuth bila client belum disiapkan. Custom MCP config mengikuti schema/transport/capability aktual, bukan tebak-tebakan. Form opened tidak menjalankan server command.

Bedakan not configured/configured/checking/connected/needs authentication/failed/disabled/unsupported. Connected to Effi tidak berarti Ready for every agent. Matrix Effi/Claude/Codex berdasarkan adapter dan check. Jangan menyalin credentials ke semua agent config secara otomatis.

Secret disimpan dengan mekanisme OS yang sesuai; tidak ke project repo, screenshot/fixture/log/plain config preview. Provider config change punya review destination/scope/perubahan dan explicit Apply. Preserve user config. Disconnect project binding tidak otomatis revoke credential global proyek lain. Awali Jira read-only context bila sesuai; tidak post ticket/comment/update status otomatis.

## 12. Compact layout, keyboard, state

QA pada 1440×900, default 1180×760, 980×700, 800×650. Sidebar 220/208, inspector300/280 sesuai ukuran; <1100 inspector drawer; <900 sidebar drawer juga, satu overlay aktif. Main/terminal tetap lapang. Setup editorial hide pada compact width. Workflow/tab strip overflow satu baris, bukan wrap menjadi tumpukan.

Native titlebar tanpa traffic lights HTML duplikat. Tabs keyboard accessible, aria-selected/expanded, labeled input, icons tooltip, Escape close/focus return, focus ring terlihat, target icon ≥32px. Preserve Cmd+1…9 proyek, Cmd+B sidebar, Cmd+J inspector, Cmd+K workflow. Cmd+K bukan palette baru. Jangan intercept input xterm/announce tiap byte lewat aria-live.

Tuntaskan no-experience/no-project/no-selection/no-agent/no-plan/no-history/raw-plan, loading/error/disabled/hover/focus/selection, long task/branch/path, partial install/missing CLI/runtime, unreachable browser, failed connection, detached HEAD. Status warna selalu teks/icon. Motion 120–160ms dan reduced motion. Tidak autoscroll agresif atau fake task pulse.

## 13. Urutan kerja dan verifikasi

Ikuti BUILD-CHANGES: tokens/rebrand/shell → diagnostics/setup → session/tab/provider → workbench/inspector → browser/device → Connections → packaging/migration/QA. Kerjakan sampai konkret, bukan berhenti pada proposal. Beri progress jika ada constraint integrasi.

Jalankan check relevan, minimal `npm run build` di studio. Rust/config berubah memerlukan cargo/native checks yang sesuai repo. Meaningful integration/regression untuk lifecycle/perilaku yang berubah; jangan menambah tes yang hanya mengulang style/markup.

Wajib periksa:
1. App tanpa Claude/Codex/toolkit/SDK bisa dibuka, setup bisa dilewati.
2. Codex-only tidak terhalang Claude doctor dan tidak menerima Claude commands.
3. Rebrand tidak kehilangan existing registry/prefs/config/plan/history.
4. Dua sesi agent pada satu proyek tidak bertukar input/output; background sessions tetap hidup.
5. Browser/Codex aktif saat workflow action tidak menerima command wrong PTY.
6. Close satu tab tidak close tab lain; focus/resize tidak reopen PTY.
7. Verify tidak selectable dan tidak masuk install plan; preview/back mempertahankan sesi Build.
8. Optional setup fail tidak memblokir core; actual install plan sesuai selection; recheck/retry benar.
9. Browser unreachable dan remote content isolation ditangani.
10. Device missing prerequisites/external fallback/ownership launch-stop jujur.
11. MCP satu consumer tidak membuat consumer lain Connected; config invalid tidak merusak config existing.
12. Compact layout, keyboard dari terminal, long labels dan raw-plan fallback tetap benar.

Fixture hanya untuk preview/tests, bukan production UI. Jangan menjalankan real SDK download/toolkit install/Jira mutation demi screenshot. Bedakan browser visual fixture dari native runtime integration. Ambil screenshots ukuran target dan bandingkan mockup: hierarchy, spacing, terminal room, labels, availability dan copper restraint.

## 14. Acceptance dan laporan akhir

Hasil harus universal pada core, Build berjalan dengan provider CLI yang didukung, tabs nyata, setup benar-benar modular, browser/device capability jujur, Connections scoped, Verify tetap Coming soon. Tidak ada placeholder branding Vite/React/Tauri di pengalaman produk.

Laporan akhir pisahkan **implemented**, **verified**, **unavailable in this environment**, **deferred**. Sertakan file penting, screenshot implementasi, checks dan batas material. Jangan menyatakan fitur selesai hanya karena menu/form/mockup ada. Jangan menyebut simulator embedded bila yang dibuat controller+external window.

Lanjutkan secara mandiri berdasarkan keputusan ini. Jika ada keputusan yang benar-benar memblokir dan belum dijawab spec/source, jelaskan constraint spesifik, sambil melanjutkan pekerjaan independen.
