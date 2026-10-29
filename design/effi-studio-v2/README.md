# Effi Studio · Precision Atelier v2

**Paket aktif yang menggantikan handoff EffiClaude sebelumnya.** Brand: **Effi**. Aplikasi: **Effi Studio**. Pengalaman dalam satu aplikasi: **Build** dan **Verify**. Build tersedia untuk dikembangkan sekarang; Verify hanya **Coming soon**, tanpa instalasi atau fitur QA aktif.

Pekerjaan pada paket ini hanya desain, gambar mockup, dan prompt implementasi. Kode aplikasi tidak diubah. Gambar dibuat dengan built-in imagegen; seluruh layar adalah konsep desain, bukan bukti fitur sudah berjalan.

## Cara memakai

1. Lihat gambar di tabel berikut.
2. Baca `DESIGN-SPEC.md` untuk aturan produk dan UX.
3. `BUILD-CHANGES.md` menjelaskan perubahan nyata dari repository saat ini, kebutuhan backend, dan batas kompatibilitas.
4. Salin seluruh `CLAUDE-IMPLEMENTATION-PROMPT.md` ke Claude yang membuka repository. Prompt sudah menyebutkan semua lokasi mockup dan memisahkan Build aktif dari Verify Coming soon.
5. `IMAGE-PROMPTS.md` menyimpan prompt generasi gambar.

## Mockup final

| File | Acuan |
|---|---|
| `brand/01-effi-identity.png` | Logo Effi, lockup Studio, app icon, keluarga Build/Verify |
| `mockups/01-choose-experiences.png` | Pilih pengalaman; Build tersedia, Verify belum dapat dipasang |
| `mockups/02-build-setup.png` | Pilih agent dan tools opsional; existing CLI dapat dipakai |
| `mockups/03-build-workbench.png` | Workspace Build dengan tab per agent/tool dan workflow yang jelas targetnya |
| `mockups/04-browser-devices.png` | Browser dalam workbench dan device setup opsional |
| `mockups/05-connections.png` | Connections: Jira dan custom MCP, scope serta status yang jelas |
| `mockups/06-verify-coming-soon.png` | Landing Verify Coming soon dalam aplikasi yang sama |
| `mockups/07-dmg-install.png` | Instalasi aplikasi Effi Studio melalui DMG |
| `mockups/08-setup-states.png` | Instalasi komponen terpilih, partial failure, dan siap membuka Build |
| `mockups/09-codex-and-add-tool.png` | Sesi Codex tanpa command Claude dan menu Add a tool |

## Keputusan penting

- Satu app, satu project registry. Build/Verify adalah pengalaman yang dapat diaktifkan secara independen setelah keduanya tersedia. Saat ini Verify tidak ikut selection summary, download queue, atau tombol Install.
- `Set up later` boleh membuka shell Studio. Build, agent, integrasi, dan tool yang belum diaktifkan dapat ditambahkan kemudian. Terminal adalah fasilitas dasar app, bukan dependency eksternal yang harus diunduh.
- Browser, iOS Simulator, Android Emulator, memory, workflow toolkit, dan Connections bersifat opsional. Tidak ada install-all tersembunyi.
- Claude Code, Codex, dan CLI lain adalah sesi/tab terpisah. Mengubah tab tidak mengganti provider proses yang sudah hidup.
- `/ec-*` adalah command workflow lama untuk Claude yang sudah ada di repository. Tetap kompatibel; jangan mengirimkannya ke Codex/terminal/browser secara otomatis.
- Device tab adalah tempat kontrol dan, bila didukung, tampilan device. Jangan menyatakan simulator sudah embedded hanya dengan menampilkan gambar ponsel. External window fallback harus ditandai jelas.
- Koneksi tingkat app tidak otomatis berarti semua agent dapat memakai MCP tersebut. Tampilkan status dan cakupan per consumer.

## Membaca gambar dengan benar

Gambar menetapkan komposisi, hierarki, karakter material, dan arah visual. Perilaku final, angka dinamis, status, warna solid, dan batas fitur mengikuti dokumen tertulis. Data proyek dan output terminal adalah contoh. Jangan menyalinnya ke UI produksi.

Simbol tetap memakai E angular dalam frame terbuka dari arah sebelumnya; kini maknanya **efficiency + workspace**, tanpa keterikatan ke Claude. Master logo produksi harus dibuat sebagai vektor yang rapi oleh implementer. Copper flat mengikuti token, bukan variasi material halus pada raster AI.

Beberapa elemen pada mockup hanya acuan presentasi: traffic lights jangan dibuat ganda dengan native titlebar; checked berarti dipilih, bukan otomatis sehat; “Detected” hanya CLI ditemukan, bukan sudah login; progress task milik sumber plan, bukan telemetry semua agent. Jangan memperlihatkan unread dot pada proyek aktif meskipun gambar AI menambahkannya.

Dokumen sumber lama di `../precision-atelier/` disimpan sebagai arsip visual. Untuk handoff baru gunakan paket ini; jangan menjalankan dua prompt implementasi bersamaan.
