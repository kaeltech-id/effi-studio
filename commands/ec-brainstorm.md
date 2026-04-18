Explore solution approaches before committing to a feature plan. Read .claude/project-config.json and CLAUDE.md first.

## Step 0 — Load Context
Read `.claude/context/stack.md`, `.claude/context/structure.md`, `.claude/context/conventions.md`.

Check worker status: `curl -s http://localhost:37777/health`
- If running: show "(worker online ✓ — memory active)" then load relevant memory:
  `curl -s "http://localhost:37777/memory/search?q={problem_keywords}&project={project_name}&limit=5"`
- If offline: show "(worker OFFLINE ⚠️ — memory unavailable)" and continue without memory

**Onboarding check:** Verify `.claude/context/stack.md`, `.claude/context/structure.md`, and `.claude/context/conventions.md` all exist and are non-empty.
- If all present: proceed normally
- If any are missing or empty: show "(context incomplete — run /ec-setup first to configure this project)" and stop

Use memory to surface: past decisions, similar problems solved before, patterns already in use. Do not dump raw memory — silently inform your suggestions.

## Step 1 — Understand the Problem
Ask: "Ceritain problemnya — bebas, nggak perlu tau solusinya dulu."

Accept any form: vague idea, user complaint, business requirement, technical pain point.

Follow up with **at most 2 targeted questions** — only if the answer would meaningfully change the recommendation:
- "Siapa yang paling kena dampaknya?"
- "Apa definisi 'berhasil' menurut kamu?"
- "Ada constraint yang harus saya tahu? (waktu, tech stack, kompatibilitas)"

Do NOT ask questions just to seem thorough. If the problem is clear enough to analyze, skip directly to Step 2.

## Step 2 — Silent Deep Analysis
Before responding, silently work through ALL of this internally — never show this process to the user:

**Root cause check (5 Whys):** Ask "why" up to 5 times on the stated problem. Are we solving the right problem?

**JTBD reframe:** What is the user actually trying to accomplish? Strip the solution framing.

**Generate all plausible approaches** (as many as needed, internally).

**SCAMPER pass** — for each candidate approach, run through:
- **Substitute**: Bisa ganti komponen mana yang bikin lebih simple?
- **Combine**: Bisa digabung dengan pattern yang sudah ada di codebase?
- **Adapt**: Ada solusi dari domain lain yang bisa dipinjam?
- **Modify**: Bisa di-scale down/up? Versi minimal yang cukup?
- **Put to other uses**: Bisa leverage tool/system yang sudah ada dengan cara baru?
- **Eliminate**: Apa yang bisa dihapus tanpa mengurangi hasil?
- **Reverse**: Kalau dibalik asumsinya — apakah ada solusi yang lebih baik?

**Six Thinking Hats pass** — evaluasi approach terpilih dari 6 sudut pandang:
- **White Hat** (facts): Data apa yang kita punya? Apa yang masih unknown?
- **Red Hat** (gut): Apakah ini terasa benar secara intuitif?
- **Black Hat** (risks): Apa yang paling mungkin gagal? Apa hidden coupling-nya?
- **Yellow Hat** (benefits): Apa upside terbesar? Kenapa ini worth doing?
- **Green Hat** (creative): Ada angle lain yang belum dipikirkan?
- **Blue Hat** (process): Apakah urutan implementasinya masuk akal?

**Score each approach:**
- Effort (1–5), Reversibility (1–5), Risk (1–5), Fit to existing patterns (1–5)
- Run a pre-mortem: "If we shipped this and it failed, why?"

**Pick the single best approach** — highest composite score AND survives pre-mortem AND passes Black Hat. If two tie, prefer the simpler/more reversible one.

## Step 3 — Present the Recommendation
Present exactly **one recommendation**. No option list. No "you could also...".

Format:
```
## Rekomendasi: {short name}

**Pendekatan:** {2-3 sentence clear description of exactly what to build/do}

**Kenapa ini yang terbaik:**
- {concrete reason — beats alternative A because...}
- {concrete reason — beats alternative B because...}

**Pre-mortem — kalau ini gagal, penyebabnya:**
- {most likely failure mode} → {mitigation already baked in}
- {second failure mode} → {mitigation already baked in}

**Effort:** S / M / L  
**Reversibility:** Easy / Medium / Hard  
**Key assumption:** {the one thing that must be true for this to work}
```

After presenting:
"Setuju lanjut dengan ini? (y/n — atau describe apa yang kurang):"
- If y: proceed to Step 4
- If n or feedback: adjust the recommendation based on feedback, re-present, ask again. Do not revert to showing multiple options.

## Step 4 — Sharpen the Recommendation
Present the deepening in **sections of 200-300 words each**. After each section, ask: "Bagian ini sudah oke? (y/lanjut/revisi)" — wait for confirmation before continuing to the next.

**Section order:**

1. **Scope & Boundaries** — What's in and explicitly out of scope. Define "done" in one sentence.

2. **Key Assumptions** — The 1–2 things that must be true for this approach to work. Flag if any are unverified.

3. **Dependencies & Impact** — What other parts of the system need to change. Any required migrations, config changes, or breaking changes.

4. **Implementation Order** — High-level sequence: what gets built first, what unlocks what. No task breakdown yet (that's /ec-feature's job).

Only present sections that add value — skip any section where the answer is obvious or already covered in Step 3.

## Step 5 — Save

Ask: "Lanjut ke /ec-feature sekarang atau simpan untuk nanti? (now/save):"

**If "now":**
Save to `.claude/decision.md`. Replace `{YYYY-MM-DD}` with today's date (use `currentDate` context variable if available, otherwise `date +%Y-%m-%d`):

```markdown
# Decision: {problem_title}

## Problem
{problem statement in one paragraph}

## Options Explored
- **Option 1 — {name}**: {one-line summary} → not chosen because: {reason}
- **Option 2 — {name}**: {one-line summary} → not chosen because: {reason}
- **Option 3 — {name}**: {one-line summary} → CHOSEN

## Chosen Approach
{2-3 paragraph description of the chosen approach}

## Key Assumptions
- {assumption 1}
- {assumption 2}

## Risks & Mitigations
- {risk} → {mitigation}

## Out of Scope
- {what was explicitly not addressed}

_Created: {YYYY-MM-DD}_
```

**If "save":**
Generate a slug from the problem title: lowercase, spaces→hyphens, max 5 words (e.g. "race-condition-memory-fix").
Save to `.claude/brainstorms/{YYYY-MM-DD}-{slug}.md` using the exact same format as the decision.md template above.
Create `.claude/brainstorms/` directory if it doesn't exist.
Show: "Saved: .claude/brainstorms/{YYYY-MM-DD}-{slug}.md"

**Both paths** — if worker running, save to memory:
```
curl -s -X POST http://localhost:37777/memory/observe \
  -H "Content-Type: application/json" \
  -d '{
    "project": "{project_name}",
    "type": "decision",
    "content": "Brainstorm: {problem_title}. Chose: {chosen_option}. Because: {reason}.",
    "metadata": {"source": "brainstorm"}
  }'
```

## Step 6 — Hand Off
Show summary of the decision.

**If "now":**
Next: run `/ec-feature` — it will load this decision automatically.

**If "save":**
Run `/ec-feature` when ready — it will show a numbered list of saved brainstorms to pick from.
