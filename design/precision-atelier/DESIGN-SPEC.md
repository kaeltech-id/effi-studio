# Design specification — Precision Atelier

## 1. Tujuan dan diagnosis

EffiClaude membantu developer menjalani workflow Claude Code dengan konteks yang bertahan, plan, implementasi, review, dan Git. Studio harus menjawab empat pertanyaan dalam beberapa detik: proyek apa yang aktif, tahap apa yang disarankan, berapa task plan yang selesai, dan di mana saya berinteraksi dengan CLI.

Temuan dari sumber aplikasi saat ini:
- Hampir semua teks 12–14px dan aksen sangat terbatas; judul, status, dan aksi sulit dibedakan.
- Enam command mentah serta kolom brainstorm tampil bersamaan; hubungan input dengan satu command kurang jelas.
- Properties, Tasks, History menumpuk di kanan dengan prioritas mirip, padahal tasks paling relevan saat bekerja.
- Onboarding berupa daftar pemeriksaan kecil, belum mempunyai cerita alur, penjelasan dampak instalasi, atau pemulihan yang terarah.
- Empty state task masih menyebut `/ec-feature`, sementara workflow yang tersedia memakai `/ec-plan`.
- Status stage tidak membuktikan bahwa CLI sedang menjalankan command. Checkbox plan tidak mengandung data status running.

## 2. Prinsip pengalaman

1. Terminal adalah alat kerja utama. Tidak diubah menjadi replika aplikasi chat.
2. Satu tindakan utama yang relevan. Tahapan lain tetap mudah ditemukan tanpa bersaing secara visual.
3. Warna menyampaikan arti, selalu didampingi teks atau bentuk.
4. Detail teknis tersedia pada tempatnya, tidak memenuhi layar awal.
5. Progres yang terlihat harus berasal dari data nyata. Tidak ada progress instalasi palsu, estimasi durasi rekaan, atau spinner task berdasarkan urutan checklist.
6. Perpindahan proyek, resize, dan collapse panel tidak boleh memutus sesi.

## 3. Identitas

Nama resmi **EffiClaude**; nama aplikasi **EffiClaude Studio**. Kapitalisasi ini konsisten di titlebar, installer, wordmark, dan label bundle.

Simbol arah terpilih pada `brand/01-brand-identity.png`: bentuk geometris angular yang menggabungkan bingkai C terbuka dengan garis-garis E, serta terminal square kecil di kanan. Makna: konteks yang membingkai pekerjaan, langkah yang teratur, dan terminal. Hindari simbol sunburst milik Claude atau kesan produk resmi Anthropic.

`brand/02-logomark.png` adalah referensi terisolasi. Untuk produksi buat master vektor dari bentuk tersebut, koreksi alignment/ketebalan optis. Jangan memasukkan seluruh identity board ke header atau memotong screenshot sebagai ikon final.

Clear space minimal setengah tinggi simbol. Wordmark sans medium, tracking normal sedikit rapat. Di header kecil cukup simbol 20px + nama 14px; sublabel STUDIO hanya bila ada ruang. Minimum simbol UI 16px, lockup lengkap 120px. Pada 16px detail square boleh disederhanakan jika tidak terbaca. Uji monokrom, dark, light, dan @2x. App icon berupa squircle graphite dengan simbol copper di tengah, margin aman 20%; efek material hanya halus pada ikon aplikasi, bukan logo master.

## 4. Token visual

| Token | Nilai | Peran |
|---|---|---|
| Ground | `#101112` | Background workspace |
| Surface | `#17191B` | Sidebar, panel onboarding |
| Raised | `#1D2023` | Popover, selected neutral surface |
| Hover | `#25292D` | Hover nonaktif |
| Border | `#30353B` | Pembagi halus |
| Text | `#F3EFE9` | Judul dan label utama |
| Secondary | `#A4ABB2` | Informasi pendukung |
| Copper | `#E5A17C` | Primary CTA, focus, selection |
| On copper | `#211710` | Teks tombol copper |
| Copper tint | `#30241E` | Latar selection |
| Success | `#9CC5AF` | Selesai/terdeteksi |
| Warning | `#E6C182` | Perlu perhatian |
| Error | `#EDA6A6` | Gagal/blocking |
| Terminal text | `#E2E5E8` | Output terminal |

Gunakan system sans (`-apple-system`, SF Pro Text, system-ui) dan system monospace (SF Mono, Menlo). Title installer 30/36 semibold; headline panel editorial 38/44; judul proyek 20/28 semibold; section 14/20 semibold; body 14/21; meta 12/18; terminal 13/19–14/21. Jangan menjadikan semua teks monospace. Metadata penting jangan diredupkan dengan opacity rendah.

Spacing unit 4px: 4/8/12/16/24/32/40. Border 1px. Radius control 8px, group panel 12px, popover 10px. Shadow hanya untuk overlay, lembut dan pendek. Icon outline 16–18px, stroke konsisten 1.5–1.75px; jangan campur emoji dengan outline icon. Tombol 34–36px tinggi, onboarding CTA 42px, target icon button minimal 32px. Keyboard focus ring 2px copper + gap 2px. Verifikasi kontras teks normal minimal 4.5:1; status tetap punya label/icon.

## 5. Studio: struktur utama

Target mockup 1440×900. Default aplikasi saat ini **1180×760 juga harus nyaman**. Native titlebar dipertahankan pada implementasi awal; strip chrome pada gambar adalah komposisi visual, bukan instruksi membuat traffic lights HTML kedua.

- Sidebar 220px pada 1440, 208px pada 1180. Header Projects + jumlah + tombol add. Proyek aktif memiliki latar copper tint dan rule 2px; label nama 14px, sublabel `6 of 10 tasks` atau stage. Indikator background update berarti data berubah, bukan aktivitas running. Tree folder memakai indent 12–16px; disclosure dan select terpisah. Menu proyek memuat Remove from Studio, tidak Delete folder.
- Main fleksibel; padding header 20–24px. Nama proyek utama, path secondary terpotong tengah dengan full path dapat diakses; branch button ringkas. Hindari menduplikasi daftar branch pada layar utama.
- Workflow strip: Brainstorm → Plan → Refine → Execute → Review → Git. Label manusiawi dengan command literal tersedia pada tooltip/detail; recommended ditandai teks dan copper outline. Jangan tandai semua tahap sebelumnya selesai dari stage saja.
- Action strip setinggi sekitar 76px: judul sesuai rekomendasi, satu kalimat efek, tombol `Run /ec-execute` sesuai command. Copy: `Sends /ec-execute to the active terminal.` Berikan catatan yang dapat ditemukan: command dikirim ke sesi saat ini; bila CLI sedang meminta jawaban, command akan menjadi input pada prompt itu. Jangan klaim mendeteksi readiness.
- Brainstorm: buka disclosure kontekstual di dekat tahap Brainstorm. Field label `What would you like to explore?`, teks optional, preview command yang akan dikirim. Isi tidak menempel pada CTA tahap lain. Git tetap mengirim `/ec-git` bare agar konfirmasi CLI berjalan.
- Terminal mengambil seluruh sisa main. Header tipis `Terminal` dan `CLI session`. Padding host sekitar 12px, background tetap ground. Output asli xterm, bukan screenshot atau HTML chat. Setelah command dikirim fokus kembali ke terminal; toast opsional singkat `Command sent`, jangan `Execution started`.
- Inspector kanan 300px pada 1440, 280px pada 1180. Tasks dan History memakai tab; Tasks default. Project & Git disclosure di bawah. Kedua area tetap dapat dijangkau dengan keyboard dan scroll independen. Jangan memaksakan tiga panel panjang terbuka bersamaan.
- Tasks: featureTitle, jumlah done/total, progress bar hanya bila total > 0. Task selesai menggunakan check + warna sage; pending hollow circle + teks biasa, bukan checkbox interaktif. Tidak ada running/failed state tanpa field. Teks task verbatim termasuk tag, wrap; tidak dibuang karena terlalu panjang. Plan mentah tetap menjadi fallback jika parsing tidak menghasilkan task.
- History: judul/title atau slug fallback, branch, tanggal dan waktu dari data. Pertahankan batas 50 dan penjelasan jumlah yang disembunyikan. Tidak perlu tombol replay/view detail yang belum didukung.
- Project & Git: branch aktif, branch switcher dan create-branch field dalam popover/disclosure, peringatan task belum selesai, detached HEAD, jumlah branch tersembunyi, dan error Git verbatim. Jangan menambah commit/push otomatis.
- Status bar 26px opsional: jumlah proyek, `Workflow: Execute`, `Tasks read from plan`. Tidak menampilkan token, biaya, last sync timestamp, server health live, atau model tanpa sumber data.

## 6. Ukuran kecil dan keyboard

| Lebar | Perilaku |
|---|---|
| ≥1360px | Sidebar 220 + inspector 300, terminal minimal 650px |
| 1100–1359px | Sidebar 208 + inspector 280, main ≥580px pada default 1180 |
| 900–1099px | Inspector tertutup default menjadi drawer kanan melalui tombol Tasks; sidebar 192px |
| <900px | Sidebar drawer, inspector drawer, satu overlay aktif; workflow horizontal scroll atau menu overflow berlabel |

Pada tinggi pendek, header tidak bertambah besar; terminal dan panel scroll sendiri. Workflow tidak membungkus menjadi banyak baris. Boleh membungkus copy action strip secara terbatas, tidak memotong CTA.

Pertahankan shortcut: Cmd+1…9 pilih proyek terdaftar, Cmd+B sidebar, Cmd+J inspector, Cmd+K workflow strip. **Cmd+K bukan command palette**. Tooltip tombol mencantumkan shortcut. Escape menutup popover/drawer dan mengembalikan fokus. Jangan intercept karakter terminal biasa. Tab order mengikuti sidebar → project header → workflow → terminal → inspector.

## 7. Installer dan first run

Ada dua pengalaman terpisah: DMG drag-and-drop, lalu setup environment di dalam aplikasi.

### DMG
Jendela sekitar 720×460. Background graphite, wordmark kiri atas, heading `Make room for better flow.`; tengah ikon EffiClaude Studio → folder Applications. Instruksi `Drag EffiClaude Studio to Applications`. File app dan alias Applications adalah elemen Finder asli, bukan tombol pada gambar background. Safe area untuk koordinat ikon, label Finder tetap terbaca. Catatan pendek `Then open it from Applications.`. Jangan menyatakan aplikasi notarized/signed resmi atau menjanjikan bypass Gatekeeper. Peringatan macOS mengikuti kondisi distribusi sebenarnya. Mockup merupakan arahan packaging, bukan DMG yang sudah dibuat.

### First-run setup
Panel editorial kiri 34%, form kanan 66%; pada lebar <980px sembunyikan editorial panel dan pertahankan brand kecil. Max working width 560px. Tahap editorial: Check environment → Install toolkit → Open workspace. Heading dan manfaat singkat, jangan fitur marketing panjang.

| Kondisi | Isi dan tindakan |
|---|---|
| Checking | `Checking your environment…`, skeleton pada row, jangan tampil gagal selama request belum selesai |
| Claude tidak ditemukan | Required + penjelasan toolkit tidak memasang Claude Code; input path + `Use path`; install toolkit tetap boleh, tetapi Open Studio belum tersedia |
| Commands kurang | Required + `found of expected`; Install EffiClaude utama |
| Ready to install | Claude terdeteksi; commands kurang; optional jelas berbeda; CTA install + Check again |
| Installing | Indeterminate indicator + `Installer session open`; terminal log asli terlihat dan interaktif, tidak collapsed default; CTA install disabled; `Check again` manual tetap tersedia |
| Required checks pass | `You're ready to build.`; Open Studio utama; optional unavailable tetap warning nonblocking |
| Required checks fail setelah recheck | `Setup needs attention`; tampilkan pemeriksaan yang belum lulus, log tetap ada, Check again dan path input bila relevan |
| Request install ditolak/error | `Couldn't start the installer`; error asli terbaca; recheck, jangan looping install otomatis |

Panel empat pemeriksaan mengikuti `Doctor`: Claude Code, commands, specialist agents, memory worker. Angka expected dari backend, bukan literal 8/32; angka di gambar hanya contoh snapshot repo. Worker offline berarti `Memory unavailable`, bukan semua Studio tidak berfungsi.

Disclosure `What will be installed?`: commands, agents, `~/.efficlaude`, Python dependencies, worker, dan perubahan settings/hooks Claude. Ini bukan sekadar menyalin aplikasi ke Applications. Jangan menjanjikan tidak ada file yang diubah atau seluruh proses offline.

**Batas lifecycle penting:** `install_efficlaude` menjalankan bash script di shell PTY. Kembalinya invoke berarti sesi berhasil dibuka, bukan script sukses. Event PTY exit tidak mengandung exit code dan shell bisa tetap hidup setelah script selesai. Maka hasil setup ditentukan oleh **runDoctor/check ulang**, bukan toast sukses dari invoke atau asumsi exit. Manual Check again selalu ada; auto recheck jika ada sinyal valid, jangan menutup terminal instalasi otomatis. Retry harus memperhitungkan sesi install yang masih terdaftar; jangan membuat tombol retry yang sebenarnya no-op. Tidak perlu backend redesign untuk desain awal: tampilkan instruksi pemulihan jujur berdasarkan kemampuan saat ini.

## 8. Empty, error, dan detail

- Nol proyek: mark kecil, `Your next project starts here.`, body `Add a project folder to open Claude Code and follow its workflow.`, primary `Add project folder`. Tidak ada task dummy.
- Ada proyek tetapi tidak dipilih: `Choose a project`, secondary pilih sidebar; jangan terminal palsu.
- Tidak ada plan: `No plan yet`, `Create a plan with /ec-plan.`, shortcut kirim command bila sesi ada.
- Tidak ada history: `Your completed work will appear here.`; jangan seolah data gagal dimuat.
- Plan ada tetapi task gagal diparse: tampilkan raw markdown dan label `Plan preview`.
- Project/branch/task panjang: wrap task, truncate label navigation, full value pada tooltip/accessibility; branch tidak menimpa tombol.
- Session ended: output tetap terlihat, pesan `Session ended`; jangan menyiratkan masih berjalan. Aksi restart hanya jika dibuat dengan lifecycle yang valid.
- Remove project memakai kata `Remove from Studio`; folder tetap ada. Boleh undo hanya jika benar-benar diimplementasikan.
- Jangan menampilkan progress `0/0` sebagai error atau 100%. Label `No tasks yet`.

## 9. Gerak dan kualitas

Hover/focus 120–160ms; drawer/popover maksimal 160ms dengan reduced motion. Tidak ada pulse permanen, shimmer berulang, animasi per-token, atau smooth-scroll yang merebut posisi baca task. Loading indikator hanya selama request/sesi yang diketahui, bukan task dugaan.

Review pada 1440×900, 1180×760, 980×700 dan 800×650. Uji keyboard-only, zoom teks, output terminal panjang/ANSI/UTF-8, nama branch panjang, 0/1/50 proyek, 0/1/100 task, long markdown fallback, optional worker offline, semua required gagal, install log panjang. Desain dianggap selesai bila hierarki jelas, terminal tetap leluasa, semua kontrol dapat dijangkau, dan perilaku lama tetap bekerja.
