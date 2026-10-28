# Analisis Plafon EffiClaude — Token, Akurasi, Memory, Speed, Review

_Semua angka di dokumen ini diukur langsung di mesin ini pada 2026-10-28. Tidak ada estimasi tanpa label._

## 0. Metodologi

| Sumber | Cara ukur |
|---|---|
| Korpus memory | `sqlite3 ~/.efficlaude/efficlaude.db` — agregasi langsung |
| Relevansi retrieval | 4 query nyata ke `/memory/search`, baca `distance` + jalur yang dipakai |
| Injeksi prompt | `hooks/prompt_submit.py` dijalankan dengan prompt realistis, hitung char |
| Biaya token | `wc -c` ÷ 4 (aproksimasi standar; akurat ±10% untuk teks Latin) |
| Biaya verify | `/usr/bin/time -p` pada `cargo build` dan `npx tsc --noEmit` |
| Perilaku eksekusi | Observasi langsung — sesi ini mengeksekusi 41 task plan Studio dari awal sampai habis |

---

## 1. Vonis per dimensi

| Dimensi | Vonis | Angka kunci |
|---|---|---|
| **Persistensi memory** | Struktur benar, isi rusak | SQLite source of truth ✓, per-project ✓, pruning ✓ — tapi **84% korpus adalah noise** |
| **Akurasi prompt** | **Bernilai negatif** | Injeksi 308 token/prompt, relevansi terukur ~0. Lebih baik tidak menyuntik apa pun |
| **Hemat token** | Boros di tempat yang tak terlihat | ~18.3k token/cycle untuk definisi command; plan 18.1k/baca; **41 subagent × konteks segar** |
| **Speed (wall-clock)** | Tertahan oleh desain, bukan bahasa | 29/41 verify adalah compile; **paralelisme mustahil karena dependensi dipalsukan** |
| **Performance (runtime)** | Berlebihan untuk bebannya | Daemon 221 MB RSS + 282 MB disk untuk melayani 17k baris teks |
| **Review** | Terlalu lambat dan terlalu akhir | Semua gate global menumpuk di sini padahal sebagian bisa jalan paralel sejak awal |
| **Hasil akhir** | Baik — tapi karena *plan*-nya bagus | Grounding + Anchor + Edge cases memang bekerja. Itu aset terbesar sistem ini |

**Kesimpulan satu kalimat:** yang membuat hasil EffiClaude bagus adalah **kualitas artefak plan**-nya, bukan memory engine-nya. Memory engine saat ini justru mengurangi akurasi.

---

## 2. Defect register

### D1 — Korpus memory 84% noise `KRITIS`
```
tool_use      14.598  (84%)   1.9 MB
decision/review/plan/execution  2.749 (16%)
```
Termasuk rekaman `curl .../memory/observe` — memory mencatat dirinya sendiri sedang mencatat.
**Dampak:** setiap jalur retrieval menarik dari kolam yang 84% sampah.
**Perbaikan:** filter tipe di `hooks/post_tool_use.py` sebelum `observe`. Simpan `tool_use` hanya bila ada sinyal (file berubah di luar `.claude/`, exit code ≠ 0, atau perintah > N detik).

### D2 — Fallback FTS mengurutkan berdasarkan waktu, bukan relevansi `KRITIS`
`server/memory.py:257` → `ORDER BY o.created_at DESC`
FTS5 sudah menghitung BM25 dan menyediakan `rank`, tapi tidak dipakai.
**Dampak:** pemenang adalah "paling baru yang kebetulan mengandung kata itu". Inilah sebabnya yang tersuntik ke prompt adalah lima perintah shell terakhir.
**Perbaikan:** `ORDER BY rank` (satu baris). Perbaikan akurasi-per-karakter tertinggi di seluruh repo.

### D3 — Distance palsu `KRITIS`
`server/memory.py:265` → `"distance": 0.5` hardcoded untuk semua hasil FTS.
**Dampak:** tidak ada komponen di hilir yang bisa membedakan hasil bagus dari sampah. Threshold apa pun di atasnya jadi tidak bermakna.
**Perbaikan:** petakan BM25 → [0,1] dan kembalikan jarak sungguhan, atau beri field `source: "fts"|"vector"` agar pemanggil bisa memutuskan.

### D4 — Model embedding salah bahasa `KRITIS`
`all-MiniLM-L6-v2` (default Chroma, `memory.py:186` tanpa `embedding_function`) adalah model **English-only**. Korpus kamu: Bahasa Indonesia + kode + perintah shell.

| Query | Distance terbaik | Jalur |
|---|---|---|
| `auto-flow sentinel stop hook driver` | 1.192 | Chroma (nyaris fallback) |
| `bagaimana cara kerja memory engine` | 1.188 | Chroma |
| `scroll bug transfer list` | — | fallback FTS |
| `token optimizer etok` | — | fallback FTS |

Ambang fallback 1.2 (`memory.py:29`). **Semua query mendarat di 1.19–1.25** — persis di bibir ambang, sehingga sistem bolak-balik antara dua jalur lemah.
**Perbaikan:** ganti ke multilingual (`paraphrase-multilingual-MiniLM-L12-v2` 384-dim, atau `bge-m3` bila mau kualitas puncak).

### D5 — Docs injection = boilerplate Flask `TINGGI`
Indeks docs: flask 7 chunk (1 KB) berisi **"Donate"**, **"Contributing"**, dan satu baris link Jinja. Library lain 1 chunk masing-masing.
**Dampak:** section Donate-nya Flask masuk ke *setiap* prompt.
**Perbaikan:** matikan injeksi docs sampai indeksnya nyata; atau syaratkan minimal N chunk + ambang relevansi sebelum sebuah library layak disuntik.

### D6 — Tidak ada lantai relevansi pada injeksi `TINGGI`
`prompt_submit.py` menyuntik top-5 tanpa peduli skor.
**Dampak:** 308 token/prompt terbuang saat tidak ada yang relevan. Di sesi 100 prompt ≈ **30.000 token/hari**.
**Perbaikan:** bila tidak ada yang lolos ambang → suntik **nol item**. Diam lebih baik daripada salah.

### D7 — `Dependencies:` dipalsukan lalu dibuang `KRITIS untuk speed`
- Plan menulis 41 baris `Dependencies:`, **40 di antaranya "Task N-1"** → rantai lurus, bukan graf.
- `ec-execute` tidak pernah membacanya (hanya ada di checklist preflight, `ec-execute.md:92`).

Padahal struktur nyata plan Studio punya minimal 3 rantai independen setelah gate Task 14:
```
Task 15→16→17  (projects.rs)   ─┐
Task 18→19→20→21→22 (plan.rs)  ─┼─ saling independen
Task 26→27→28→29→30 (komponen) ─┘
```
**Dampak:** paralelisme mustahil. Bukan karena sulit — karena datanya salah lalu diabaikan.
**Perbaikan:** `ec-feature` wajib menulis dependensi **sebenarnya** (dan boleh kosong); `ec-execute` membangun DAG dan menjalankan level-nya secara paralel.

### D8 — 29/41 verify adalah compile, bukan bukti task `KRITIS untuk speed`
```
21 ×  cd studio/src-tauri && cargo build
 8 ×  cd studio && npx tsc --noEmit
```
Biaya terukur: `cargo build` setelah satu file disentuh = **4,04 s** (no-op 0,73 s), `tsc --noEmit` = **1,01 s**.
→ 21×4,04 + 8×1,01 = **93 detik kompilasi murni** per plan, bila tiap task menjalankannya.
**Lebih penting:** "proyek masih bisa dikompilasi" **tidak membuktikan apa pun** tentang task itu. Itu invarian global, bukan bukti lokal.

### D9 — `Rollback:` dan `Breaking change:` adalah token mati `SEDANG`
| Field | Isi | Biaya |
|---|---|---|
| `Breaking change:` | **41/41 berbunyi "none"** | 317 token |
| `Rollback:` | **38/41** adalah `git checkout -- {file}` / `rm {file}` — mekanis dari `File:` | 606 token |
**Perbaikan:** jadikan *exception-only*. Tulis hanya bila ≠ default. Hemat ~900 token/plan, nol informasi hilang.

### D10 — `etok`: mesin bagus, filter bermasalah, integrasi mati `TINGGI`

_Revisi 2026-10-28: pengukuran pertama (“hemat 0,03%”) **salah** — etok dipanggil tanpa argumen sehingga jatuh ke filter `generic`. Nama perintah diambil dari argv (`main.rs:7`), jadi invokasi yang benar adalah `cmd | etok git status`._

**Performa — sehat, bukan bottleneck:**

| Ukuran | Hasil |
|---|---|
| Throughput | 11 MB dalam **0,04 s** (~275 MB/s) |
| Startup input kecil | **< 10 ms** (di bawah resolusi timer, 5× berturut) |

**Penghematan nyata (invokasi benar):**

| Input | Asli | Sesudah | Hemat |
|---|---|---|---|
| `cargo build` | 939 | 198 | **79%** |
| `git status` | 645 | 315 | **52%** |
| `git diff` | 818 | 801 | 3% |
| `git log --oneline` | 3.367 | **8** | rusak — lihat D10-B |

Pada 6 file log build nyata sesi ini: **4.810 → 1.296 char (74%, ~878 token)** — dan itu sudah di-`tail` manual lebih dulu; pada log utuh penghematannya jauh lebih besar.

**D10-A — `git status` melabeli unstaged sebagai staged** `BAHAYA`
`token-optimizer/src/filters/git.rs`, dalam `status()`:
```rust
if trimmed.starts_with("new file:") || trimmed.starts_with("modified:") || ... {
    staged.push(...)
} else if trimmed.starts_with("modified:") || trimmed.starts_with("deleted:") {
    unstaged.push(...)        // ← cabang mati: tidak pernah tercapai
}
```
Bukti di repo ini: `git status --short` → ` M README.md` (**belum** di-stage), etok melaporkan **“Staged (3)”**. Vektor `unstaged` tidak pernah terisi.
**Risiko:** agent yang hendak commit percaya file sudah di-stage padahal belum — premis salah untuk `/ec-git`.

**D10-B — `git log` memusnahkan isinya** `BAHAYA`
`git.rs:70` `log()` hanya mengenali format verbose (baris diawali `commit <sha>`). Dengan `--oneline` tidak ada baris yang cocok → seluruh output menumpuk di satu blok → `format_commit` gagal → keluar **8 byte**: `? | |` (header tabel kosong). 40 commit lenyap.
**Efek bersih negatif:** agent tidak mendapat informasinya, lalu menjalankan ulang `git log` dengan cara lain — token terbayar dua kali.

**D10-C — integrasi tidak pernah aktif untuk agent** `TINGGI`
`shell/effi-shell.sh` mendefinisikan wrapper `git()` yang bocor ke shell non-interaktif tanpa membawa helper `_etok_available` → error `git:2: command not found: _etok_available` pada **setiap** pemanggilan git oleh agent sesi ini. Artinya penghematan 74% di atas **belum pernah benar-benar didapat**.

**D10-D — filter `cargo` membuang baris yang justru dicari** `SEDANG`
Output memuat `Finished 1 bundle at:` **dua kali tanpa baris path di bawahnya** — path artefak dihapus, padahal itu satu-satunya hal yang dibutuhkan dari sebuah build. Dedup juga tidak menangkap duplikatnya.

**Perbaikan (bukan hapus — mesinnya layak dipertahankan):**
1. Hapus cabang mati di `status()`; bedakan staged vs unstaged dari kolom status git yang benar, bukan dari prefiks teks yang sama.
2. `log()` mengenali `--oneline` (deteksi: 7–40 hex diikuti spasi). 
3. Pertahankan baris path setelah `Finished ... at:` di filter cargo.
4. Perbaiki wrapper shell agar helper ikut ter-ekspor, atau panggil etok langsung dari hook alih-alih lewat wrapper shell.

**Aturan umum untuk semua filter:** _bila hasil kompresi kehilangan struktur yang dikenali, kembalikan input apa adanya._ Kompresi lossy pada output yang akan dibaca agent harganya jauh lebih mahal daripada token yang dihemat — D10-B adalah contoh persisnya.

### D11 — Dua keluarga command terinstal berdampingan `SEDANG`
`~/.claude/commands/` berisi `execute.md` **dan** `ec-execute.md`, `review.md` **dan** `ec-review.md`, dst. Yang non-prefix mendeskripsikan "parallel subagents", yang ber-prefix "sequential".
**Dampak:** ambigu saat dipanggil, dan `install.sh` hanya mengelola 11 yang ber-prefix — sisanya drift.

### D12 — Noise dikalikan 41 `TINGGI`
`ec-execute.md:55` → "Pass relevant snippets into each subagent's context."
Snippet yang sama (yang D1–D6 buktikan bernilai ~0) ikut ke **setiap** subagent.
**Dampak:** 308 token noise × 41 subagent ≈ **12.600 token terbuang per plan**, sebelum kerja apa pun dimulai.

### D13 — Satu subagent per task mengabaikan ko-lokasi `TINGGI`
Task 15, 16, 17 semuanya menulis `studio/src-tauri/src/projects.rs`. Model subagent-per-task akan:
membuka file 3×, menurunkan konvensi 3×, build 3× (12,1 s), dan membayar konteks segar 3×.
Sesi ini menulis ketiganya sebagai **satu file, satu build** — dan hasilnya lolos semua verify.
**Perbaikan:** fusi task berurutan yang berbagi `File:` menjadi satu unit eksekusi.

### D14 — Plan dibaca utuh saat hanya butuh satu task `SEDANG`
Plan = **18.120 token**. `ec-execute` Step 1 menyuruh `Read: {PLAN_FILE}` utuh, lalu menandai `- [x]` per task.
Sesi ini membaca per-rentang (`sed -n '473,565p'`) — biaya ~600 token per task alih-alih 18.120.
**Perbaikan:** baca header + checklist dulu (±1.200 token), lalu rentang baris per task saat dibutuhkan.

---

## 3. Ekonomi token — dari mana biayanya

### Anatomi plan 18.120 token (41 task)

| Field | Token | Nilai | Putusan |
|---|---|---|---|
| Blok `code sample` | 4.319 | Sedang — sering ditulis ulang lebih baik saat eksekusi | Pangkas jadi **kontrak/signature**, bukan body penuh |
| `Edge cases:` | 2.497 | **Tertinggi** — ini yang membuat implementasi benar | **Pertahankan utuh** |
| `Verify:` | 1.359 | Rendah (29/41 duplikat) | Dedup → ~300 |
| `Acceptance:` | 1.222 | Tinggi | Pertahankan |
| `Do not touch:` | 968 | Tinggi — pagar nyata | Pertahankan |
| `Reuse:` | 712 | Tinggi — sumber konsistensi | Pertahankan |
| `Anchor:` | 617 | Sedang (17/41 "new file") | Exception-only |
| `Rollback:` | 606 | **Nol** (38/41 mekanis) | **Hapus** |
| `File:` | 587 | Esensial | Pertahankan |
| `Breaking change:` | 317 | **Nol** (41/41 "none") | **Hapus** |
| `Dependencies:` | 242 | **Negatif sekarang** (palsu + diabaikan) | **Perbaiki & pakai** |

Potensi pangkas tanpa kehilangan informasi: **~6.000 token/plan (33%)**.

### Biaya per cycle penuh

| Pos | Sekarang | Sesudah perbaikan |
|---|---|---|
| Definisi command (5 tahap) | 18.300 | ~12.000 (pangkas boilerplate, lazy-load section) |
| Plan dibaca | 18.120 × n baca | 1.200 + ~600/task |
| Noise injeksi ke subagent | ~12.600 | ~0 |
| Subagent (41 × konteks segar) | **dominan** | ~25 unit setelah fusi |
| **Indikasi total** | — | **turun 40–60%** |

---

## 4. Kecepatan: cara mempercepat M dan L

Pertanyaan intinya: *apa yang tidak perlu dikerjakan saat execute, tapi bisa ditutup saat review?*

### 4.1 Pisahkan dua jenis verify

| Jenis | Definisi | Contoh | Kapan dijalankan |
|---|---|---|---|
| **Bukti lokal** | Membuktikan task *ini* melakukan yang diklaim | `grep -c 'RecursiveMode' src/watcher.rs` → ≥1 · `test -f` · anchor ditemukan | **Per task**. Murah (ms) |
| **Invarian global** | Properti seluruh repo | `cargo build` · `tsc --noEmit` · `pytest` · "tidak ada hex di luar token file" · jumlah heading README | **Batas modul + review**. Mahal (detik) |

Hari ini keduanya dicampur, dan yang mahal menang 29 : 12. Memindahkan invarian global ke batas modul + review memangkas **93 detik kompilasi → ~12 detik** (3 batas modul × 4 s) tanpa kehilangan satu pun jaminan — karena kegagalan kompilasi tetap tertangkap, hanya lebih lambat terdeteksi dan lebih murah diperiksa.

**Syarat agar aman:** bukti lokal harus benar-benar lokal dan spesifik. Verify seperti `cargo build` justru *menyembunyikan* kesalahan task (proyek tetap kompilasi walau task salah) — jadi pemindahan ini bukan hanya lebih cepat, tapi **lebih akurat**.

### 4.2 Fusi task ko-lokasi
Aturan: task berurutan dengan `File:` sama → satu unit eksekusi, satu verify.
Pada plan Studio: 41 task → **~25 unit**. Hemat 16 spawn subagent + 16 build.

### 4.3 Eksekusi DAG paralel
Dengan `Dependencies:` yang jujur, plan Studio jadi:
```
level 0: Task 1-13 (rantai setup, sekuensial)
level 1: GATE 14 (manusia)
level 2: [15-17 projects.rs] ∥ [18-22 plan.rs] ∥ [26-30 komponen]   ← 3 jalur paralel
level 3: 23-24 (watcher, butuh 22) ∥ 31-32 (doctor)
level 4: 33-38 (integrasi + build)
```
Blok terbesar (level 2, 13 task) wall-clock-nya turun **≈3×**.

### 4.4 Pekerjaan panjang di latar belakang
`cargo build --release` dua target = **menit**. Sesi ini terpaksa menghentikan dan mengulang build dua kali karena sumber diubah saat build berjalan.
**Aturan:** job > 30 detik dijalankan di latar belakang pada **snapshot sumber yang dibekukan**, dan di-join hanya sebelum task yang membutuhkan artefaknya. Task artefak (seperti 38) selalu ditempatkan paling akhir.

### 4.5 Tugas yang butuh manusia ditempatkan sebagai gate dini
Task 14 (GATE) sudah diletakkan benar: sebelum 27 task berikutnya ditulis. Pola ini harus eksplisit dalam template: **asumsi yang bisa membatalkan rencana diuji sebelum biaya besar dikeluarkan.** Ini satu-satunya hal yang sudah optimal di plan sekarang.

### 4.6 Ringkasan dampak kecepatan

| Perubahan | Hemat | Risiko |
|---|---|---|
| Verify global → batas modul/review | 93 s → 12 s kompilasi | Rendah; deteksi sedikit lebih lambat |
| Fusi ko-lokasi | −16 spawn, −16 build | Rendah |
| DAG paralel | blok terbesar ≈3× lebih cepat | Sedang — butuh dependensi jujur |
| Build panjang di latar | hilangkan stall menit-an | Rendah bila sumber dibekukan |
| Baca plan per-rentang | −17.500 token/baca | Nol |

---

## 5. Review: apa yang harus pindah ke sini

Review hari ini menanggung Stage 1 (spec compliance), 1.5 (template drift), 2 (9 kategori kualitas), lalu testing. Yang **harus ditambahkan** karena dipindah dari execute:

1. **Gate kompilasi definitif** — `cargo build --release`, `tsc --noEmit`, `pytest`. Sekali, bukan 29 kali.
2. **Invarian gaya repo-wide** — mis. "tidak ada hex di luar file token" (verify Task 26) jauh lebih tepat sebagai grep sekali di review daripada beban per-task.
3. **Audit bukti** — bandingkan klaim `- [x]` dengan bukti lokal yang tercatat. Ini menutup kelas bug yang sudah pernah terjadi (subagent mengarang baris agar lolos ambang — tercatat di decision "Grounded Artifacts").
4. **Verifikasi batas scope** — `git status` harus hanya menunjukkan file yang terdaftar di `File:` seluruh plan. Sesi ini melakukannya manual dan menemukan hasilnya bersih; seharusnya otomatis.

Yang **harus dikeluarkan** dari review: tidak ada. Review bukan bottleneck; dia justru terlalu sedikit dibebani hal yang murah dilakukan sekali.

---

## 6. Rust — manfaat jujur, sampai 0,x%

| Aspek | Sekarang | Rust | Delta | Terasa saat vibe coding? |
|---|---|---|---|---|
| RSS daemon | 221 MB (16 jam uptime) | ~25 MB | **−89%** | Tidak langsung |
| Disk state | 282 MB chroma + 32 MB db | ~27 MB vektor BLOB + 32 MB | **−90%** | Tidak |
| Dependency user | Python 3.8+, pip, chromadb, onnxruntime, numpy | 1 binary | **−100%** | Saat install saja |
| Hook `post_tool_use` | 60–80 ms | ~5 ms | **−93%** (~40 ms/call) | ~20 detik/hari pada 500 call |
| Search 17k vektor | 90 ms (Chroma) | ~3 ms (brute force 384-dim) | **−96%** | Ya, kecil |
| Startup worker | detik (import chromadb) | ~10 ms | −99% | Hanya saat boot |
| `file_lock.py` per operasi | subprocess Python ~30 ms | in-process ~1 ms | −97% | Nyaris tidak |
| Parsing JSON hook | ~2 ms | ~0,1 ms | −95% | Tidak |
| `tree-sitter` indexing | binding Python | native | ~2–5× | Hanya saat `/graph/index` |
| `etok` | **sudah Rust** | — | **0,03%** | Tidak |
| **Akurasi retrieval** | — | — | **0%** | **Tidak — ini bukan masalah bahasa** |
| **Biaya token** | — | — | **0%** | **Tidak** |
| **Kualitas hasil** | — | — | **0%** | **Tidak** |

**Biaya Rust yang jujur:** matriks build 4 target; model ONNX ~80 MB diunduh saat pertama pakai; iterasi lebih lambat (recompile vs edit `.py`); kontribusi pihak ketiga lebih sulit; `sqlite-vec` masih pre-1.0 sehingga **sebaiknya tidak dipakai** — brute force cukup sampai ~100k vektor.

**Putusan:** Rust adalah keputusan **footprint & distribusi**, bukan kualitas. Lakukan setelah Tier 1–3, saat server-nya sudah tinggal SQLite + cosine (jauh lebih kecil untuk ditulis ulang).

---

## 7. Peningkatan yang belum ada sama sekali

Di luar perbaikan defect — hal yang bisa **ditambahkan**:

1. **Dedup observation.** Banyak entri nyaris identik (`Ran command: curl ...`). Hash konten + simpan sekali dengan `seen_count`. Perkiraan: korpus turun lagi signifikan setelah D1.
2. **Recency decay pada skor, bukan sebagai urutan.** Gabungkan relevansi × kesegaran, bukan memilih salah satu seperti sekarang.
3. **Hasil negatif ikut disimpan.** Yang paling mahal diulang adalah jalan buntu. Hari ini hanya keputusan sukses yang tersimpan; "X tidak berhasil karena Y" nilainya lebih tinggi per token.
4. **Kontrak verify yang dapat dieksekusi.** `Verify:` sebagai perintah terstruktur (`{cmd, expect, scope: local|global}`) sehingga bisa dijalankan otomatis dan dinilai, bukan diinterpretasi.
5. **Anggaran token eksplisit per tahap.** Setiap command mendeklarasikan plafonnya; injeksi dipotong sesuai sisa anggaran, bukan konstanta tetap.
6. **Cache pengetahuan lintas task dalam satu plan.** Konvensi yang ditemukan di task 7 harus tersedia gratis di task 23. Hari ini tiap subagent menemukannya ulang.
7. **`/ec-feature` menulis estimasi wall-clock per task**, bukan hanya S/M/L — agar penjadwalan DAG bisa menaruh job panjang lebih awal di latar belakang.
8. **Lint template plan.** 41/41 "Breaking change: none" seharusnya terdeteksi sebagai template drift oleh linter plan, bukan lolos ke eksekusi.

---

## 8. Urutan pengerjaan

| Tier | Isi | Biaya | Dampak |
|---|---|---|---|
| **1 — jam** | D1 filter tool_use · D2 `ORDER BY rank` · D3 distance jujur · D6 lantai relevansi · D5 matikan docs | ~5 baris kode efektif | Akurasi retrieval naik dari ~0; hemat ~30k token/hari |
| **2 — hari** | D9 pangkas field mati · D14 baca per-rentang · D8 pemisahan verify lokal/global · D13 fusi ko-lokasi | Ubah template `ec-feature` + loop `ec-execute` | −33% token plan; −80 detik kompilasi/plan |
| **3 — hari** | D7 dependensi jujur + eksekutor DAG · §4.4 job latar belakang | Perubahan terbesar di `ec-execute` | Blok terbesar ≈3× lebih cepat |
| **4 — minggu** | D4 model multilingual · §7 enhancement | Sentuh embedder + schema | Retrieval benar-benar berguna |
| **5 — minggu** | Rust single binary (tanpa Chroma, tanpa sqlite-vec) | Rewrite ~1.600 baris | −89% RAM, −90% disk, −100% dependency Python |
| **Kapan saja** | D10 perbaiki 2 bug etok (`status`, `log`) + wrapper shell · D11 bersihkan command ganda | Jam | Buka penghematan 74% pada output build yang selama ini tidak pernah aktif |

**Catatan penting:** Tier 5 (Rust) tidak memperbaiki satu pun angka di Tier 1–4. Mengerjakannya lebih dulu berarti menulis ulang 1.600 baris untuk mempertahankan perilaku yang salah dalam bahasa yang lebih cepat.

---

_Dibuat: 2026-10-28 — semua angka terukur, tidak ada yang diperkirakan tanpa label._
