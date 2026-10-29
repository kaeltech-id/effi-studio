# Prompt siap pakai untuk Claude

> **ARSIP — SUDAH DIGANTIKAN.** Gunakan `design/effi-studio-v2/CLAUDE-IMPLEMENTATION-PROMPT.md` untuk arahan aktif Effi Studio. Prompt di bawah hanya riwayat desain EffiClaude.

Salin mulai dari garis berikut ke Claude yang membuka repository EffiClaude. Jika model mendukung lampiran gambar, lampirkan gambar yang disebutkan; jika tidak, minta model membuka file lokalnya. Jangan mengandalkan model membaca nama file tanpa melihat isinya.

---

Saya ingin kamu mengimplementasikan redesign menyeluruh untuk **EffiClaude Studio**, mencakup identitas logo, pengalaman installer/first run, dan workspace desktop. Fungsionalitas aplikasi sekarang sudah baik; prioritaskan kualitas visual dan UX, dengan mempertahankan integrasi dan perilaku yang ada.

Kamu bekerja di root repository EffiClaude. Paket desain sudah dibuat di:

`design/precision-atelier/`

## A. Buka gambar dan dokumen dahulu

Wajib baca:
1. `design/precision-atelier/README.md`
2. `design/precision-atelier/DESIGN-SPEC.md`

Wajib **buka dan lihat** gambar berikut, bukan sekadar membaca nama filenya:
1. `design/precision-atelier/brand/01-brand-identity.png` — identitas utama, geometri simbol, wordmark, konsep ikon aplikasi.
2. `design/precision-atelier/brand/02-logomark.png` — simbol mandiri pada latar ivory untuk referensi bentuk.
3. `design/precision-atelier/mockups/01-studio-workspace.png` — acuan komposisi utama Studio, hierarki, panel, terminal, action strip.
4. `design/precision-atelier/mockups/02-installer-ready.png` — first-run siap instalasi, layout editorial + environment checklist.
5. `design/precision-atelier/mockups/03-installer-states.png` — installing, required checks pass, dan needs attention.
6. `design/precision-atelier/mockups/04-dmg-install.png` — konsep packaging DMG drag ke Applications.

Gambar adalah mockup konseptual AI. Spesifikasi tertulis menentukan perilaku final dan sumber data. Jika ada typo, angka contoh, perbedaan proporsi, gradient/noise halus, atau elemen tanpa dukungan API pada gambar, koreksi saat implementasi. Jangan memasukkan screenshot utuh sebagai UI. Jangan menambah fitur dummy agar terlihat sama.

Identitas simbol mengikuti `01-brand-identity.png` dan `02-logomark.png`. Logo kecil pada UI adalah penerapan simbol yang sama, bukan alternatif logo baru.

## B. Hasil yang saya inginkan

Alat developer native yang terasa sangat matang: **Precision Atelier**. Graphite hangat, copper lembut, off-white, sage untuk selesai. Tipografi jelas, kepadatan informasi nyaman, ruang terminal luas, microinteraction tenang, detail presisi.

Saya memberi kebebasan mengganti desain lama. Komentar atau dokumen desain sebelumnya tentang lima warna, aksen hanya untuk stage, layout lama, dan larangan visual lama bukan patokan baru. Terapkan arah di paket ini. Namun aturan perilaku, keamanan lifecycle, dan integritas data tetap berlaku.

Jangan berhenti di mengganti warna/background/radius. Reorganisasi hierarki dan interaksi: installer terasa membimbing, nama proyek dan branch mudah dibaca, rekomendasi tahap jelas, tasks mendapat prioritas, properties tidak memenuhi layar, dan empty/error states terlihat dirancang.

## C. Audit repo sebelum mengubah

Baca instruksi repository yang berlaku, lalu minimal:
- `studio/src/App.tsx`
- `studio/src/styles.css`, `studio/src/lib/tokens.ts`
- `studio/src/lib/types.ts`, `flow.ts`, `tauri-api.ts`, `use-shortcuts.ts`
- semua komponen di `studio/src/components/`
- `studio/src-tauri/src/doctor.rs`, `lib.rs`, `pty.rs`, `plan.rs`, `projects.rs`, `tree.rs`, `git.rs`
- `studio/src-tauri/tauri.conf.json`
- `studio/icons-src/mkicon.py`
- `install.sh`, root `CLAUDE.md`, dan scripts yang tersedia di `studio/package.json`.

Jangan mengoperasikan Git secara autonom sesuai aturan repository. Jangan menjalankan installer sungguhan atau memodifikasi environment pengguna sekadar untuk menguji tampilan. Jangan mengubah worker, commands, agent, plan parser, install script, atau perilaku Git sebagai bagian redesign kecuali ada kebutuhan nyata yang dijelaskan secara terpisah.

## D. Design system yang harus diwujudkan

Warna:
- ground `#101112`; surface `#17191B`; raised `#1D2023`; hover `#25292D`; border `#30353B`.
- text `#F3EFE9`; secondary `#A4ABB2`; terminal text `#E2E5E8`.
- copper `#E5A17C`; on-copper `#211710`; selected tint `#30241E`.
- success `#9CC5AF`; warning `#E6C182`; error `#EDA6A6`.

Susun semantic tokens, konsisten di CSS dan xterm. Hindari hardcode warna tersebar dan render literal string warna di setiap komponen.

Font system sans + system monospace. Body 14px, meta 12px, section 14px semibold, title proyek 20px, title installer 30px, editorial installer sekitar 38px. Terminal 13–14px. Spacing grid 4px. Controls radius 8px, group 12px, border 1px. Primary CTA copper dengan teks gelap. Icon outline konsisten, bukan campuran emoji. Hover jelas, focus ring 2px dan dapat terlihat pada semua surface. Pastikan kontras normal ≥4.5:1. Tidak perlu font eksternal.

No purple/blue default SaaS styling, neon, efek glass besar, gradient dekoratif, huge dashboard cards, metrics palsu, avatar agent palsu, atau background ilustrasi yang mengambil ruang kerja. Tampilan harus menarik melalui komposisi, ritme, dan material subtle.

Gerak 120–160ms; hormati reduced motion. Jangan membuat task atau status stage berdenyut seolah running.

## E. Logo dan asset produksi

Bangun master SVG dari referensi simbol: bingkai C angular terbuka, dua bar interior E, small square pada sisi kanan. Bentuk flat, copper solid, alignment presisi. Boleh koreksi optis agar tajam pada 16/20/24/32px. Jangan memakai gambar identity board sebagai asset UI dan jangan membuat simbol mirip sunburst Claude.

Buat varian simbol copper, light monochrome, dark monochrome, lockup EffiClaude, dan lockup EffiClaude Studio. Clear space setengah tinggi simbol. App icon squircle graphite, copper mark tengah, safe margin sekitar 20%; material sangat halus. Hasilkan ukuran ikon Tauri/macOS yang diperlukan melalui alur yang sesuai repo dan update referensi packaging. Simpan sumber editable, jangan hanya bitmap besar. Uji retina dan ukuran kecil.

## F. Implementasikan workspace

Gunakan mockup workspace sebagai target kualitas. Struktur:
1. Native titlebar; tidak ada traffic lights HTML ganda. Identitas kecil di sidebar/header bila perlu.
2. Sidebar proyek: 220px pada layar besar, 208px pada default 1180. Selected row copper tint + rule, nama jelas, progress/stage secondary, unread marker hanya berdasarkan perubahan state. Tree folders tetap bekerja; jangan menambah file explorer karena backend hanya menyediakan folder. Add project mudah ditemukan. Remove berarti keluarkan dari Studio, bukan hapus folder.
3. Project header: judul, path, branch selector ringkas. Kelola branch di popover atau Project & Git disclosure, bukan daftar besar di header.
4. Workflow strip: Brainstorm, Plan, Refine, Execute, Review, Git. Command literal dapat ditemukan lewat tooltip/detail. Highlight **recommended action** sesuai `nextStep`, bukan current running stage.
5. Action strip: satu judul yang relevan, deskripsi singkat, primary `Run /ec-…`. Saat next adalah Execute: `Continue implementation` + `Sends /ec-execute to the active terminal.` Klik menjalankan mekanisme dispatch lama. Brainstorm argument pindah ke disclosure kontekstual; hanya memengaruhi command brainstorm. Git dikirim bare.
6. Terminal asli xterm mengambil ruang dominan dan sisa tinggi. Header terminal sederhana, host punya breathing room. Jangan mengganti dengan chat UI, membuat composer kedua, atau menampilkan output dummy di produksi.
7. Inspector 300px pada layar besar, 280px pada default: Tasks dan History memakai tab. Tasks default; Project & Git disclosure dapat dibuka di bawah. Pertahankan pemetaan preferences yang ada atau migrasikan kompatibel; preference gagal dibaca tidak boleh memblokir app.
8. Tasks: featureTitle, done/total, progress matematis dari task plan; tidak ada persentase untuk total nol. Row read-only check/hollow circle. Teks lengkap termasuk tag, wrap dengan baik. Jangan menyebut pending task pertama sebagai running. Raw plan fallback tetap tersedia.
9. History: title/slug, branch, tanggal/waktu dari payload; batas dan hidden count tetap jujur. Jangan membuat tombol nonfungsional.
10. Git: available/detached/error/hidden semuanya tetap tertangani. Pertahankan warning unfinished tasks dan backend error verbatim. Tidak ada auto commit/push, changed-files counter, atau base-branch status tanpa data.

Status bar bila digunakan hanya menampilkan data yang benar tersedia. Jangan tampilkan biaya, token, live model, latency, live memory health, atau timestamp sync tanpa sumber.

## G. Installer/first-run dan packaging

Ada **DMG** dan **setup toolkit di dalam Studio**. Jangan menggabungkan maknanya.

DMG: terapkan art direction dari gambar ke background packaging, kira-kira 720×460. Layout logo + heading di atas; ikon aplikasi dan alias Applications native di tengah; instruksi di bawah. Arahkan koordinat ikon Finder agar tidak menutupi copy, label tetap terbaca. Jangan menanam ikon app/folder dua kali pada background. Jangan mengubah kebijakan signing/notarization atau memberi klaim yang belum benar. Jika toolchain tidak bisa membuild DMG di environment ini, tetap buat aset sumber dan konfigurasi yang dapat direview, laporkan batas verifikasinya.

First-run: editorial kiri 34%, working panel kanan 66%. Heading `Set up your studio`, helper jelas. Empat pemeriksaan sesuai Doctor: Claude Code, EffiClaude commands, specialist agents optional, worker optional. Jumlah expected dari backend. Required berbeda dengan optional lewat label dan warna.

- checking: skeleton + status checking.
- missing CLI: error required, input path editable dengan `Use path`. Jangan klaim toolkit menginstall Claude Code.
- missing commands: Install EffiClaude utama, Check again secondary.
- installation session: output terminal asli terlihat dan interaktif; install disabled setelah session dibuka; **manual Check again selalu tersedia**. Jangan hilangkan prompt terminal yang mungkin menunggu input.
- success: hanya setelah required Doctor checks lulus. `You're ready to build.` + Open Studio. Optional worker/agents tidak memblokir.
- unresolved: `Setup needs attention`, row masalah dan recovery relevan; log tetap bisa dibaca.
- invoke error: tampilkan error start asli. Hindari retry yang menjadi no-op karena reserved session masih ada.

Sediakan disclosure “What will be installed?” yang menyebut commands, agents, ~/.efficlaude, Python dependencies, settings/hooks dan worker. Jangan menjanjikan tidak ada file diubah atau proses selalu offline.

Penting: baca lifecycle install aktual, jangan percaya komentar saja. Script dijalankan di shell PTY; invoke resolve tidak membuktikan selesai. PTY exit tidak membawa exit code dan shell bisa tetap hidup setelah script selesai. Gunakan runDoctor/check ulang sebagai otoritas kesiapan. Jangan bikin persentase instalasi dari timer atau parsing log rapuh. Untuk implementasi awal, desain honest indeterminate/session-open dengan recheck manual lebih tepat. Jika backend enhancement betul-betul diperlukan, jelaskan dulu perubahan minimal dan risikonya; jangan diam-diam mengubah installer demi menyamai ilustrasi.

Setelah ready, arahkan ke empty workspace dengan CTA Add project folder. Jangan membuka native folder picker tanpa interaksi pengguna. Rerun System check boleh diakses, tampil sebagai overlay yang tidak meng-unmount workspace/terminal.

## H. State yang harus dirancang tuntas

- No projects: `Your next project starts here.` + satu Add project folder.
- No selection: Choose a project.
- No plan: `No plan yet` + petunjuk `/ec-plan`; hapus copy `/ec-feature` yang usang.
- No history: copy netral tentang completed work.
- Raw plan fallback: label Plan preview, konten asli scrollable.
- Long task/branch/path: wrap atau truncate yang disengaja + full value dapat diakses.
- Session ended: output tetap terbaca; jangan tampilkan status masih berjalan.
- Detached HEAD, no Git repo, API rejection, folder load error, empty folder, hidden folder count.
- Required checks fail vs optional unavailable dibedakan.
- Empty data, loading, error, disabled, hover, focus, active, selected: semuanya punya desain konsisten.

## I. Responsiveness dan aksesibilitas

Target 1440×900 dan default aktual 1180×760. Pada 1180, main sekitar 690px sebelum internal spacing dan tetap nyaman. 900–1099: inspector drawer. <900: sidebar drawer dan inspector drawer, satu overlay aktif, terminal fleksibel. Workflow satu baris scroll/overflow terarah, bukan wrap menjadi tumpukan command. Pada tinggi pendek scroll panel independen dan primary action tidak keluar layar.

Pertahankan Cmd+1…9 proyek, Cmd+B sidebar, Cmd+J inspector, **Cmd+K workflow**. Jangan pakai Cmd+K untuk palette baru. Tooltip shortcut. Keyboard navigation lengkap, Escape menutup overlay, fokus kembali ke trigger, dialog/drawer mengelola focus trap bila modal. Native buttons, label input, aria-selected/expanded, status teks, tabs keyboard accessible. Jangan merebut karakter input xterm atau berulang mengumumkan setiap byte terminal lewat aria-live.

## J. Batas fungsional yang wajib dijaga

- Semua terminal proyek tetap mounted saat pindah proyek atau collapse panel. Jangan mengganti key karena theme/layout/tab. Jangan reopen PTY saat klik command/focus berubah.
- Subscribe output/exit sebelum membuka sesi. Installer attach-only memakai reserved session id dari backend.
- UTF-8 byte decoding xterm dan ANSI tetap bekerja. Resize hanya bila host punya dimensi; hidden pane tidak di-fit ke 0×0.
- state tetap keyed by project id. Watcher proyek background tetap berjalan. Promosi folder dan persistence tetap konsisten.
- nextStep/stage dari existing routing; jangan menduplikasi logika Rust menjadi state workflow baru di UI.
- Stage bukan running telemetry. Checklist bool bukan task scheduler. Perubahan unread bukan running activity.
- Command dispatch berupa input ke CLI aktif; fokus balik ke terminal. Jangan mengirim command otomatis saat pindah tahap/proyek.
- Tasks read-only; Studio tidak menulis plan untuk mencentang task.
- Git tetap melalui aksi pengguna dan konfirmasi yang berlaku; jangan bypass /ec-git dengan auto operations.
- Existing preference failure dan cancellation folder picker tetap graceful.

## K. Cara kerja dan verifikasi

Kerjakan sampai hasil bisa dipakai, bukan hanya proposal. Mulai dari tokens/assets, susun shell/layout, lalu workspace/inspector/flow, installer, empty/error, dan packaging. Jaga scope frontend/visual; jangan melakukan refactor backend luas.

Jalankan check yang relevan pada repo, minimal `npm run build` di `studio`. Jika mengubah asset/config native, validasi konfigurasi dan build yang tersedia. Jangan install dependency besar atau toolkit produksi tanpa kebutuhan.

Lakukan visual QA dengan render/screenshots hasil implementasi pada 1440×900, 1180×760, 980×700, dan 800×650. Bandingkan dengan mockup: hierarki, proportions, whitespace, clipping, keterbacaan terminal, copper emphasis, alignment, semua state. Gunakan fixture lokal hanya untuk preview/test, jangan kirim data contoh ke production UI atau membuat proses shell sungguhan. Jika browser preview tidak mendukung Tauri, bedakan verification visual fixture dari verifikasi integrasi native.

Meaningful regression checks: pindah proyek ketika terminal tetap hidup, command dispatch fokus kembali tanpa reopen sesi, installer subscribe-before-start dan recheck optional/required, raw-plan fallback, branch error, shortcut dari fokus terminal. Jangan menambah snapshot/unit test yang hanya mengulang markup/style.

Pada akhir laporkan perubahan, file penting, screenshot hasil implementasi, check yang dijalankan, dan batas yang belum diverifikasi. Jangan menyebut mockup sebagai aplikasi yang sudah selesai sebelum implementasi dan QA benar-benar dilakukan.

## L. Acceptance criteria

Hasil diterima bila:
1. Identitas logo konsisten pada Studio, onboarding, app icon, dan DMG.
2. Tampilan nyata mendekati kualitas dan hierarki mockup, bukan sekadar warna yang sama.
3. Pengguna baru memahami required/optional dan cara melanjutkan/recover tanpa membaca terminal panjang terlebih dahulu.
4. Pengguna aktif langsung melihat proyek, next recommended command, terminal, dan progres plan.
5. Default 1180×760 tidak cramped, terpotong, atau membuat terminal kehilangan ruang.
6. Task/health/progress tidak mengarang status; semua aksi terlihat benar-benar bekerja.
7. Lifecycle terminal, routing workflow, persistence, watcher, Git, dan fallback tetap terjaga.
8. Tidak ada placeholder branding Vite/React/Tauri yang muncul pada pengalaman produk.
9. Semua layar memiliki keyboard focus yang jelas, loading/error/empty yang selesai dirancang, dan copy konsisten berbahasa Inggris.
10. Build relevan lulus, visual QA dilaporkan dengan bukti, dan keterbatasan runtime dinyatakan apa adanya.

Lanjutkan implementasi secara mandiri berdasarkan spesifikasi ini. Tanyakan hanya jika ada keputusan yang benar-benar memblokir, bukan untuk setiap pilihan styling yang sudah tercakup.
