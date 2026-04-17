# Decision: README Rewrite

## Problem
README saat ini terlalu teknis dan terasa seperti dokumentasi internal, bukan landing page. Tidak ada hook visual di atas, benefits tidak eksplisit, dan pembaca baru harus scroll jauh sebelum paham nilai EffiClaude.

## Options Explored
- **Option 1 — Problem-first (Story-driven)**: Buka dengan pain point developer, benefits muncul lewat narasi → tidak dipilih karena berisiko terasa marketing-heavy untuk developer audience
- **Option 2 — Visual-first (Show don't tell)**: Hero section kuat, before/after, badges, flow diagram besar → DIPILIH sebagai bagian atas
- **Option 3 — Workflow-centered**: Demo nyata end-to-end, setiap command punya contoh + "what you get" → DIPILIH sebagai bagian bawah

## Chosen Approach
Hybrid Option 2 + Option 3.

**Bagian atas (Option 2):** Hero section yang menarik — badges (Python version, license, Claude Code), tagline yang kuat, before/after perbandingan singkat, dan flow diagram ASCII yang besar dan jelas. Tujuannya: orang yang scroll 5 detik langsung paham value.

**Bagian bawah (Option 3):** Demo workflow nyata dari `/setup` sampai `/git` — setiap command punya mini contoh konkret + 1 baris "what you get". Benefits muncul dari contoh, bukan bullet list terpisah.

## Key Assumptions
- Target audiens: developer yang sudah pakai Claude Code dan mau workflow yang lebih terstruktur
- README dibaca di GitHub — ASCII art dan markdown tables adalah primary UI
- Tidak perlu screenshots (CLI tool, tidak ada UI visual)

## Risks & Mitigations
- README terlalu panjang → batasi setiap command section maksimal 20 baris
- Before/after terasa dibuat-buat → gunakan contoh realistis dari use case nyata

## Out of Scope
- GIF/video demo
- GitHub Pages / dedicated landing page
- Multilingual version
