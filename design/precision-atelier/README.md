# EffiClaude — Precision Atelier

> **ARSIP DESAIN AWAL.** Paket aktif kini [Effi Studio v2](../effi-studio-v2/README.md), dengan Build, Verify Coming soon, multi-agent, optional tools, dan Connections. Gunakan prompt v2 untuk implementasi; jangan menjalankan prompt lama bersamaan.

Paket desain baru untuk logo, installer macOS, dan EffiClaude Studio. Tidak ada kode aplikasi yang diubah. Semua screenshot di paket ini adalah **konsep desain**, bukan screenshot aplikasi yang sudah diimplementasikan.

## Mulai dari sini

1. Buka gambar pada `brand/` dan `mockups/` untuk menilai arah visual.
2. Baca `DESIGN-SPEC.md` untuk aturan visual, alur, dan kondisi UI.
3. Berikan seluruh isi `CLAUDE-IMPLEMENTATION-PROMPT.md` kepada Claude di root repository ini. Prompt menyebutkan file gambar yang perlu dibuka.
4. `IMAGE-PROMPTS.md` berisi prompt gambar asli untuk reproduksi/eksplorasi.

## Arah desain

**Precision Atelier**: alat kerja developer dengan karakter editorial, graphite hangat, aksen tembaga, informasi terstruktur, dan terminal yang lapang. Desain harus terasa teliti dan khas, tanpa mengorbankan keterbacaan saat dipakai berjam-jam.

Fokus UX: pengguna langsung paham proyek aktif, tahap berikutnya, progres plan, dan lokasi output. Installer menjelaskan apa yang perlu diperbaiki dan menyediakan tindakan pemulihan yang relevan.

## Cara membaca mockup

- Mockup gambar menentukan komposisi, suasana, dan hierarki. Ukuran, perilaku, copy final, dan batas data mengikuti spesifikasi tertulis.
- Data proyek, nama task, dan branch pada gambar adalah data contoh.
- Logo raster adalah arah identitas. Claude perlu membuat master vektor yang rapi berdasarkan bentuk yang dipilih; jangan mengekstrak gambar penuh menjadi logo produksi.
- Jika gambar menampilkan detail yang tidak didukung API, ikuti kontrak data tertulis. Jangan menambah telemetry, progress persentase instalasi, status agent running, atau indikator terminal siap berdasarkan asumsi.
- Baris terminal pada mockup hanya ilustrasi output. Khusus `$ efficlaude install` pada board kondisi installer bukan command CLI produk yang tersedia; implementasi tetap memanggil API `installEfficlaude()` yang ada.
- Gambar AI memiliki sedikit variasi warna/material. Produksi memakai token solid di spesifikasi; logo pada latar ivory adalah referensi bentuk, bukan warna alternatif yang mengganti copper utama.
- Font menggunakan system sans dan system mono. Tidak perlu mengunduh font atau membeli aset.

## Manifest visual

| File | Kegunaan |
|---|---|
| `brand/01-brand-identity.png` | Wordmark, simbol, arah app icon, dan penerapan identitas |
| `brand/02-logomark.png` | Konsep simbol mandiri pada latar ivory |
| `mockups/01-studio-workspace.png` | Layar kerja utama; acuan utama komposisi Studio |
| `mockups/02-installer-ready.png` | First-run setup sebelum instalasi |
| `mockups/03-installer-states.png` | Instalasi berlangsung, berhasil, dan kondisi perlu perbaikan |
| `mockups/04-dmg-install.png` | Konsep jendela disk image macOS, drag ke Applications |

## Asal keputusan

Audit berdasarkan sumber lokal: `studio/src/App.tsx`, komponen, `lib/types.ts`, `lib/flow.ts`, `lib/use-shortcuts.ts`, `src-tauri/src/doctor.rs`, konfigurasi Tauri, dan `install.sh`. Belum dilakukan audit usability dengan pengguna atau pengujian aplikasi hidup. Temuan adalah penilaian desain dari struktur dan copy saat ini.
