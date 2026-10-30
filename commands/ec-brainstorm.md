Explore solution approaches before committing to a feature plan. Read .claude/project-config.json and CLAUDE.md first.

## Step 0 — Load Context
Read `.claude/context/stack.md`, `.claude/context/structure.md`, `.claude/context/conventions.md`, and `.claude/context/notes.md` — load each only if it exists (all optional).

Check worker status: `curl -s http://localhost:37777/health`
- If running: show "(worker online ✓ — memory active)" then load relevant memory:
  `curl -s "http://localhost:37777/memory/search?q={problem_keywords}&project={project_name}&limit=5"`
- If offline: show "(worker OFFLINE ⚠️ — memory unavailable)" and continue without memory

**Setup check (optional):** Check whether any of `.claude/context/stack.md`, `.claude/context/structure.md`, `.claude/context/conventions.md`, or `.claude/context/notes.md` exist and are non-empty.
- If any present: use them for context and proceed normally.
- If none present: show "(no setup found — working from a live scan; run /ec-setup anytime to add project context)", do a quick live scan of the repo for stack/structure, and proceed. Do NOT stop.

Use memory to surface: past decisions, similar problems solved before, patterns already in use. Do not dump raw memory — silently inform your suggestions.

**Branch detection:** Run:
```bash
BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
[ -z "$BRANCH" ] && BRANCH="default"
DECISION_FILE=".claude/decisions/${BRANCH}.md"
```
Note: "(branch: {BRANCH} → decision: {DECISION_FILE})"

**No-Code Rule:** This command MUST NOT create, edit, or write any project files.
Allowed writes: `.claude/decisions/` and `.claude/brainstorms/` only.
If you find yourself about to write code or modify project files — stop. That belongs in `/ec-execute`.

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

**Design Analysis (if UI/frontend problem)**
Detect UI/frontend context from: problem keywords ("component", "screen", "page", "design", "layout", "frontend", "UX", "user interface") OR target files (.tsx, .vue, .swift, .dart, .kt in Compose context).
If detected, silently run additional analysis:
- Visual hierarchy: is information architecture clear? Does the layout guide attention correctly?
- Interaction patterns: are standard UX conventions followed? (navigation, forms, feedback)
- Component composition: reusable vs one-off? Does it fit the existing component system?
- Responsive behavior: mobile-first? Key breakpoints accounted for?
- Accessibility: WCAG AA minimum — contrast ratio, keyboard navigation, screen reader support
- Performance budget: LCP < 2.5s, CLS < 0.1, INP < 200ms
Weave findings into the recommendation description — do not add as a separate section in the output.
**Carry forward:** if UI/frontend context was detected, also record the design reference the user supplied (Figma URL, screenshot path, or text description) and draft a Design Contract from it using the field list in the decision template in Step 5. If no reference was supplied, do NOT write a Design Contract — draft a `## Design Direction` section instead using the field list in the decision template in Step 5, inferring the three dials from the problem description. A decision file carries a Design Contract or a Design Direction, never both.

**Record the evidence:** while analysing, collect the concrete `file:line` citations that support the diagnosis — never a claim without a locator. Carry them into the decision file's `## Evidence` section. Carry the per-approach scores into the `## Options Explored` table, and the constraints, non-goals, verification strategy, and unresolved questions into their matching sections. Fill every section without asking the user — this must work identically on the `auto` path, which skips Step 4.

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

### Recommendation Constraints (non-negotiable)
- NEVER recommend batching, phasing, or splitting implementation into multiple /ec-execute cycles
- The recommendation describes ONE complete approach, implemented in ONE /ec-plan + /ec-execute cycle
- If scope seems large: that is fine — /ec-plan handles any number of tasks in a flat list
- "Start with X, then do Y later" is not a recommendation — it is two recommendations. Pick one complete solution.

After presenting:
"Setuju lanjut dengan ini? (y / auto / n — atau describe apa yang kurang):"
- If y: proceed to Step 4 (normal sharpening flow)
- If auto: skip Step 4 sharpening — go straight to Step 5 "now" save, then trigger the auto-flow chain (see Step 7). Auto-flow runs /ec-plan → /ec-refine → /ec-execute → /ec-review with no further confirmation, stopping before git. Auto-flow survives context exhaustion: the `Stop`-hook driver resumes the chain from on-disk state, so it runs to completion regardless of how many context windows it takes.
- If n or feedback: adjust the recommendation based on feedback, re-present, ask again. Do not revert to showing multiple options.

**Auto-Flow sentinel format** (first written by the auto path in Step 7): file `.claude/.autoflow`, one `key=value` per line, eight fields in this order:

| Field | Written by | Meaning |
|---|---|---|
| `branch` | command | Branch the chain belongs to |
| `created` | command | Unix epoch the chain started |
| `stage` | command | `plan` \| `refine` \| `execute` \| `review` — stage last handed off |
| `stages_done` | command | Comma-separated completed stages; empty at start |
| `iterations` | driver only | Driver bookkeeping; starts `0`, hard cap 40 |
| `driver_stage` | driver only | Last stage observed by the driver |
| `driver_progress` | driver only | Last `- [x]` count observed by the driver |
| `no_progress` | driver only | Consecutive turns with no new completed work; chain abandoned at 3 |

- Commands write `branch`, `created`, `stage`, `stages_done` only. Never write `iterations`, `driver_stage`, `driver_progress`, or `no_progress` — those belong to the driver alone.
- Progress signal: a turn counts as productive if `stage` advanced OR the plan's `- [x]` count rose. `/ec-execute` emits that signal per completed task; `/ec-plan` and `/ec-review` may legitimately produce none for a turn, which is why the driver tolerates 3 consecutive no-progress turns rather than giving up after one.
- Routing authority is the on-disk state files (plan file, `- [ ]` counts, decision file, review-done sentinel), never the `stage=` field. `stage=` is a trail for humans and logs, not a decision input.
- The `Stop` hook `hooks/session_stop.py` drives the chain: it reads the sentinel at the end of every turn and blocks with the next command until the chain finishes. Auto-flow therefore survives context exhaustion and compaction.
- Consumed and removed by /ec-review. Treated as stale (ignored + deleted) by any command if older than 2 hours or if its branch ≠ current branch.

## Step 4 — Sharpen the Recommendation
Present the deepening in **sections of 200-300 words each**. After each section, ask: "Bagian ini sudah oke? (y/lanjut/revisi)" — wait for confirmation before continuing to the next.

**Section order:**

1. **Scope & Boundaries** — What's in and explicitly out of scope. Define "done" in one sentence.

2. **Key Assumptions** — The 1–2 things that must be true for this approach to work. Flag if any are unverified.

3. **Dependencies & Impact** — What other parts of the system need to change. Any required migrations, config changes, or breaking changes.

4. **Implementation Order** — High-level sequence: what gets built first, what unlocks what. No task breakdown yet (that's /ec-plan's job).

Only present sections that add value — skip any section where the answer is obvious or already covered in Step 3.

## Step 5 — Save

Ask: "Lanjut ke /ec-plan sekarang atau simpan untuk nanti? (now/save):"

**If "now":**
**Lock check:** Before writing the decision file, check for a concurrent brainstorm session:
```bash
LOCK_CHECK=$(python3 ~/.efficlaude/server/file_lock.py status "{DECISION_FILE}" 2>/dev/null \
  || echo '{"status":"free"}')
LOCK_STATUS=$(echo "$LOCK_CHECK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','free'))" 2>/dev/null)
```
- If LOCK_STATUS is `"locked"`:
  - Extract holder: `echo "$LOCK_CHECK" | python3 -c "import sys,json; h=json.load(sys.stdin).get('holder',{}); print(f\"session {h.get('session_id','?')} (PID {h.get('pid','?')})\")"`
  - Show: "⚠️ {DECISION_FILE} is locked by another session: {holder_info}"
  - Ask: "Overwrite or save to brainstorms/ instead? (overwrite/save):"
    - If `save`: redirect — treat as the "save" path below, save to `.claude/brainstorms/` instead
    - If `overwrite`: proceed normally to write DECISION_FILE

Run `mkdir -p .claude/decisions` then save to `{DECISION_FILE}`. Replace `{YYYY-MM-DD}` with today's date (use `currentDate` context variable if available, otherwise `date +%Y-%m-%d`):

```markdown
# Decision: {problem_title}

## Problem
{problem statement in one paragraph}

## Evidence
- `{file}:{line}` — {what it shows}
- `{file}:{line}` — {what it shows}

## Options Explored

| # | Option | Effort | Reversibility | Risk | Fit | Result |
|---|--------|--------|---------------|------|-----|--------|
| 1 | {name} | {1-5} | {1-5} | {1-5} | {1-5} | Not chosen |
| 2 | {name} | {1-5} | {1-5} | {1-5} | {1-5} | Not chosen |
| 3 | {name} | {1-5} | {1-5} | {1-5} | {1-5} | **CHOSEN** |

Scale 1–5; for Effort and Risk, higher is better (5 = low effort / low risk).

- **Option 1 — {name}**: {one-line summary} → not chosen because: {reason}
- **Option 2 — {name}**: {one-line summary} → not chosen because: {reason}
- **Option 3 — {name}**: {one-line summary} → CHOSEN

## Chosen Approach
{2-3 paragraph description of the chosen approach}

## Design Contract
_Include this section only when the problem has UI/frontend scope._
- Source: {figma url | screenshot absolute path | text description}  ·  Viewport: {e.g. 1440x900 desktop, 390x844 mobile, or "unspecified"}
- Layout: {structure and section order top-to-bottom, alignment, grid/flex behaviour}
- Spacing: {observed padding / margin / gap values}
- Typography: {per text element — size, weight, line-height, color}
- Color: {background, surface, border, text, accent — hex where determinable}
- Elements: {exhaustive ordered list of every visible element — containers, text, icons, dividers, badges, inputs, buttons}
- Copy: {exact literal text strings visible in the reference}
- States: {default / hover / focus / disabled / loading / empty / error — record each as shown, or "not shown"}
- Deviations allowed: {responsive adaptation or token substitution notes, or "none"}

## Design Direction
_Include this section only when the problem has UI/frontend scope AND no visual reference was supplied. Mutually exclusive with ## Design Contract._
- Dials: ENERGY {1-3} · RHYTHM {1-3} · MOTION {1-3} — {one-line reason for each}
- Palette: {2-3 core colors + 1 accent, hex} — {reason}
- Typography: {headline face, body face, scale} — {reason}
- Identity motif: {the repeated gesture or pattern specific to this product}
- Rules: apply ~/.claude/agents/ec-antislop.md in full — hard gates, purpose gates, quality locks

## Proof Mode
_Who proves this cycle works. Omit the section and `/ec-plan` reads it as `handoff`._
- `handoff` (default) — the cycle makes the change; you run, launch and verify it afterwards
- `in-cycle` — the cycle also builds, launches and proves it, because the artifact or the running system IS the deliverable

Mode: {handoff | in-cycle}

## Key Assumptions
- {assumption 1}
- {assumption 2}

## Constraints
_Hard limits the implementation must respect — stack, compatibility, deadline, data, API contract._
- {constraint}

## Non-Goals
_Things deliberately not attempted in this cycle, so /ec-plan does not plan them._
- {non-goal}

## Risks & Mitigations
- {risk} → {mitigation}

## Verification Strategy
_How to prove the change works — the exact command, test, or observable signal per claim._
- {claim} → {command / test / observable signal}

## Open Questions
_Each unresolved item paired with the assumption taken so planning proceeds unblocked; `- none` if all resolved._
- {question} → assuming: {assumption taken}

## Out of Scope
- {what was explicitly not addressed}

_Created: {YYYY-MM-DD}_
```

**Template edge cases:**
- No repo evidence gathered → write the Evidence section as the single line `- none — reasoning is from the problem statement alone`.
- Fewer than three options considered → render only the rows that exist, in both the table and the bullets below it.
- No unresolved items → write Open Questions as the single line `- none`.
- Decision files written before these sections existed remain valid input to `/ec-plan` — never rewrite them.

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
Next: run `/ec-plan` — it will load this decision automatically.
If the decision file contains a `## Design Contract` section, state: "(design contract captured — /ec-plan will plan UI tasks against it)".

**If "save":**
Run `/ec-plan` when ready — it will show a numbered list of saved brainstorms to pick from.

## Step 7 — Auto-Flow Chain (only if user chose `auto` in Step 3)
After the decision file is saved (Step 5 "now" path), run the full chain automatically:
1. Write the sentinel:
   ```bash
   mkdir -p .claude
   printf 'branch=%s\ncreated=%s\nstage=plan\nstages_done=\niterations=0\n' \
     "$BRANCH" "$(date +%s)" > .claude/.autoflow
   ```
2. Invoke `/ec-plan` via the Skill tool and let it run to completion (it auto-loads {DECISION_FILE}, auto-confirms because AUTO=yes).
3. Then invoke `/ec-execute` via the Skill tool and let it run all tasks (auto-confirms because AUTO=yes).
4. Then invoke `/ec-review` via the Skill tool (auto-runs, archives the plan, deletes the sentinel, stops before git).
5. Surface a final summary and suggest `/ec-git`. Never run git.

**Verification of mechanism:** If the Skill tool cannot be invoked from within a running command, FALL BACK to executing each command's steps inline in this same session, in the same order, honoring AUTO=yes at every gate. The end state must be identical (plan built, executed, reviewed, sentinel removed, stopped before git).

**Failure handling:** If /ec-execute or /ec-review aborts (it will delete the sentinel itself), stop the chain and report where it stopped. Do not continue to the next stage.
