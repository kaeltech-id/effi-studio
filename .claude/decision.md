# Decision: Quick Wins Bundle — 4 Issues

## Problem
Empat kekurangan EffiClaude yang perlu diperbaiki: (1) blast radius BFS hanya 2 level — bisa miss collateral impact di monorepo, (2) tidak ada schema migration SQLite — data conflict kalau schema berubah di update, (3) install.sh message tidak akurat, (4) session_stop.py timeout terlalu pendek untuk ChromaDB di mesin lambat.

## Options Explored
- **Blast radius — Option 1 — Configurable depth**: field `blast_radius_depth` di project-config.json → CHOSEN
- **Blast radius — Option 2 — Increase default to 3**: hardcode depth=3 → tidak dipilih karena bisa bloat scope di codebase besar
- **Blast radius — Option 3 — Adaptive depth**: auto-tune berdasarkan graph size → tidak dipilih karena over-engineering untuk sekarang
- **SQLite — Option A — Version table + migration scripts**: `schema_version` tabel + migration dict → CHOSEN
- **SQLite — Option B — Drop-recreate**: backup + fresh DB saat mismatch → tidak dipilih karena data loss tidak acceptable

## Chosen Approach

**Fix 1 — Blast radius configurable depth:**
Tambah field `"blast_radius_depth": 2` ke template `.claude/project-config.json` di `commands/setup.md`. Di `commands/review.md`, baca nilai ini dari project-config.json saat query blast radius. Default tetap 2.

**Fix 2 — SQLite schema migration:**
Tambah konstanta `SCHEMA_VERSION = 1` di `server/memory.py`. Tambah tabel `schema_version (version INTEGER)` yang di-create saat init. Saat `MemoryEngine.__init__()`, cek versi DB vs `SCHEMA_VERSION` — kalau lebih rendah, jalankan migration SQL dari dict `_MIGRATIONS`. Versi awal = 1 (tidak ada migration untuk existing schema, hanya establish baseline).

**Fix 3 — install.sh message:**
Ganti `echo "✓ flask, chromadb, requests, tree-sitter installed"` dengan `echo "✓ Python dependencies installed"`.

**Fix 4 — session_stop timeout:**
Naikkan `timeout=3` menjadi `timeout=10` di `hooks/session_stop.py` untuk summarize call.

## Key Assumptions
- User yang sudah punya DB lama (versi 0/unversioned) akan treated sebagai versi 0, dan migration ke versi 1 adalah no-op (hanya set version)
- `blast_radius_depth` di project-config.json bersifat optional — kalau tidak ada, default ke 2
- ChromaDB summarize bisa selesai dalam 10 detik di mesin paling lambat

## Risks & Mitigations
- Migration bisa fail kalau DB corrupt → wrap dalam try/except, log error, continue tanpa crash
- project-config.json lama tidak punya field `blast_radius_depth` → read dengan `.get("blast_radius_depth", 2)` fallback

## Out of Scope
- Memory UI untuk inspect/delete entries
- Docs engine support untuk custom libraries
