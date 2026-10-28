# Decision: Pipeline Jujur — honest write, honest rank, lean artifacts

## Problem
EffiClaude's memory engine is structurally correct but semantically bankrupt, and its plan/execute artifacts bill for tokens nobody reads. Measured on this machine 2026-10-28: 84% of the 17.3k-row observation corpus is unfiltered `tool_use` noise (including recordings of `curl /memory/observe` itself); the FTS fallback orders by `created_at` instead of BM25 `rank`, so the "most relevant" memory is really "the most recent shell command containing that word"; every FTS result carries a hardcoded `distance: 0.5`, so no downstream component can tell a good hit from garbage; the embedder is English-only `all-MiniLM-L6-v2` against a Bahasa-Indonesia-plus-code corpus, putting all four benchmark queries at distance 1.19–1.25 against a 1.2 fallback threshold; and injection is unconditional, spending 308 tokens/prompt (~30k/day at 100 prompts) plus the same noise re-passed into all 41 subagents (~12.6k/plan). Separately, a 41-task plan costs 18,120 tokens and is re-read whole per task, 41/41 `Breaking change:` lines read "none", 38/41 `Rollback:` lines are mechanical, 29/41 `Verify:` steps are whole-project compiles that prove nothing about the task they gate (93 s of pure compilation per plan), and a measured 74% build-log compression in `etok` has never once been active because the shell wrapper leaks a helper into non-interactive shells. The net effect: the system's good output comes from plan *quality* (`Edge cases`, `Acceptance`, `Do not touch`, `Reuse`), while the memory engine actively subtracts accuracy.

## Evidence
- `server/memory.py:257` — `ORDER BY o.created_at DESC` in the FTS path; FTS5 `rank` (BM25) is computed and discarded, so retrieval is recency-ordered, not relevance-ordered
- `server/memory.py:265` — `"distance": 0.5` hardcoded for every FTS result; any downstream threshold is meaningless
- `server/memory.py:186` — `get_or_create_collection(SHARED_MEM_COLLECTION)` with no `embedding_function`, so Chroma defaults to English-only `all-MiniLM-L6-v2`
- `server/memory.py:29` — `_CHROMA_FALLBACK_THRESHOLD = 1.2`, while all four measured benchmark queries land at 1.19–1.25, making the system oscillate between two weak paths
- `hooks/post_tool_use.py:57` — `post_observation(project, content, obs_type="tool_use")` is unconditional; no signal gate and no content hash, which is the direct cause of the 84% noise share
- `hooks/prompt_submit.py:203` — `mem_lines` is built from every returned item with no distance filter; injection default is "inject" rather than "inject only if it clears a bar"
- `hooks/prompt_submit.py:207` — docs injected unconditionally; the Flask index is 7 chunks of "Donate"/"Contributing"/a Jinja link, so boilerplate rides along on every prompt
- `commands/ec-execute.md:55` — "Pass relevant snippets into each subagent's context." multiplies the ~0-value injection by the task count
- `commands/ec-execute.md:92` — `Dependencies:` appears only in the pre-flight checklist; the execution loop never reads it, so 41 written dependency lines are fabricated then discarded
- `token-optimizer/src/filters/git.rs:27-30` — `else if trimmed.starts_with("modified:")` is unreachable (the same prefixes are consumed by the `if` on line 27), so `unstaged` is never populated and unstaged files are reported as "Staged"
- `token-optimizer/src/filters/git.rs:75` — `log()` only recognises lines beginning `commit `, so `--oneline` input collapses to an 8-byte empty table header and 40 commits vanish
- `shell/effi-shell.sh:6,11,13` — `_etok_available` is a plain function while the `git()` wrapper leaks into non-interactive shells, yielding `command not found: _etok_available` on every agent git call; the measured 74% saving has therefore never been realised
- `~/.claude/commands/` — `brainstorm.md`, `execute.md`, `feature.md`, `git.md`, `review.md`, `setup.md` installed alongside their `ec-` prefixed twins, describing contradictory execution models ("parallel subagents" vs "sequential") while `install.sh` manages only the prefixed set
- Live demonstration during this brainstorm: `/memory/search` for this very problem returned 5 rows, all of type `tool_use`, all with `distance: 0.5`, none relevant — D1, D2 and D3 reproducing in a single response

## Options Explored

| # | Option | Effort | Reversibility | Risk | Fit | Result |
|---|--------|--------|---------------|------|-----|--------|
| 1 | Rust single binary first (Tier 5) | 1 | 2 | 2 | 3 | Not chosen |
| 2 | Tier 1 only — minimal surgical fix | 5 | 5 | 5 | 5 | Not chosen |
| 3 | Everything at once — Tier 1-5 incl. parallel DAG + Rust | 1 | 2 | 1 | 2 | Not chosen |
| 4 | Pipeline Jujur — honest write, honest rank, lean artifacts | 3 | 4 | 4 | 5 | **CHOSEN** |

Scale 1–5; for Effort and Risk, higher is better (5 = low effort / low risk).

- **Option 1 — Rust single binary first**: rewrite the ~1,600-line Python server as one Rust binary for −89% RSS and −90% disk → not chosen because the analysis measures Rust at 0% on retrieval accuracy, 0% on token cost and 0% on output quality; it would rewrite 1,600 lines to preserve `ORDER BY created_at` in a faster language.
- **Option 2 — Tier 1 only**: five effective lines — observe filter, `ORDER BY rank`, honest distance, relevance floor, docs off → not chosen because it makes scores *honest* without making retrieval *useful*: with the English-only embedder left in place and all benchmark queries at 1.19–1.25, the outcome moves from "confidently wrong" to "honestly empty", and it touches none of the 18.1k plan bloat or the 93 s compile cost. **Note:** this option has the highest composite score (20 vs 16) and is retained here as the honest record of that; it was rejected on the pre-mortem gate, per the documented tie-break order (highest composite **AND** survives pre-mortem), because its own failure mode is "ships, metrics look better, user still pays 18.3k/cycle and 93 s/plan".
- **Option 3 — Everything at once**: Tier 1 through 5 in a single sweep → not chosen because it combines three independently risky migrations — parallel subagents writing concurrently into one repo, an embedder/schema migration, and a full-language rewrite — into one unverifiable change, with no measurement point between them to attribute a regression.
- **Option 4 — Pipeline Jujur**: fix one complete chain — what gets written, how it is ranked, whether it earns injection, and how fat the re-read artefacts are → CHOSEN

## Chosen Approach
Repair a single end-to-end chain rather than a tier of a roadmap: write-time honesty, read-time ranking, injection earning its place, and artefacts that only carry fields someone reads. On the write side, `hooks/post_tool_use.py` gains a signal predicate plus a content hash before `observe` — a `tool_use` row is stored only when it carries evidence (a file changed outside `.claude/`, a non-zero exit code, or a runtime over a threshold N), and near-identical rows collapse to one with a `seen_count`. Rejected observations are *counted*, not silently dropped, so the reject rate is an observable number rather than an article of faith. The existing noise corpus is then purged.

On the read side the ordering comes first because it is nearly free and currently inverted: the FTS path moves to `ORDER BY rank`, and BM25 is mapped into a real `[0,1]` distance with a `source: "fts"|"vector"` field so callers can finally distinguish paths. The embedder swaps to a multilingual 384-dim model (`paraphrase-multilingual-MiniLM-L12-v2`), which is cheap precisely because of the ordering: the D1 purge drops the corpus from ~17.3k to ~2.7k rows, so the re-embed that would have been the expensive part of this change rides along for almost nothing. Dimensionality stays at 384, so the collection shape holds and the migration is a `CHROMA_SCHEMA_VERSION` bump plus rebuild rather than an in-place conversion. Injection's default then inverts: `hooks/prompt_submit.py` injects **nothing** unless a result clears a *relative* floor (beat the corpus median by a configurable margin, not a hardcoded 1.2), which keeps the floor meaningful across any future model swap, and docs injection stays off until an index clears a minimum-chunk and relevance bar — no more Flask "Donate" on every prompt. This also closes D12 at the source: once nothing worthless is retrieved, `ec-execute.md:55` has nothing worthless to multiply by the task count.

On the artefact side, `ec-feature` writes `Rollback:`, `Breaking change:` and `Anchor:` exception-only — present only when they differ from the mechanical default — and the existing `ec-review` Stage 1.5 template-drift check is extended to enforce that, rather than building a new linter. `Verify:` splits into two kinds: *local evidence* that fails if this task is wrong (a specific `grep -c`, a `test -f`, an anchor match — milliseconds), and *global invariants* (`cargo build`, `tsc --noEmit`, `pytest`) which move to module boundaries and a definitive gate in `ec-review`. This is both faster and more accurate, because a whole-project compile passing tells you nothing about the task that triggered it. `Dependencies:` becomes honest — real edges, allowed to be empty — and is genuinely *consumed*: `ec-execute` builds the graph and uses it to fuse consecutive tasks sharing a `File:` into one execution unit (41 tasks → ~25 units on the reference plan) and to order them, reading the plan by line range after a header-plus-checklist read instead of ingesting 18,120 tokens per task. A parallel scheduler later becomes a scheduler swap on data that is already correct and already read, not a rewrite. Finally the three items that are hours of work each and gate a measured saving: the two `etok` filter bugs, the shell wrapper leak that has kept the 74% build-log compression permanently dormant, and the duplicate command families.

One invariant unifies the whole change — **silence beats a wrong answer** — generalised from the analysis's own rule for `etok`: if a lossy transform loses recognised structure, return the input unchanged; if retrieval has nothing above the bar, return nothing. It applies identically to filters, to injection, and to plan fields.

## Key Assumptions
- A multilingual 384-dim model over a de-noised ~2.7k-row corpus clears a real relevance bar. This is the one unmeasured claim in the decision; everything else has a number in the source analysis. If it fails, the relative floor makes the failure safe (zero injection rather than garbage) and `bge-m3` is the fallback.
- The plan's value sits in `Edge cases` (2,497 tok), `Acceptance` (1,222), `Do not touch` (968) and `Reuse` (712) — all retained — and not in the fields being trimmed. This was measured field-by-field, not assumed.
- Local evidence can be made specific enough to fail when a task is wrong. Where it cannot, that task keeps a global verify rather than a weak local one.

## Constraints
- Zero external services, fully local — no new network dependency at runtime (`.claude/context/stack.md`)
- Python 3.8+ compatibility across server and hooks
- Hooks must never crash Claude Code: silent fail on non-critical paths (`.claude/context/conventions.md`)
- Embedding dimensionality stays 384 so the Chroma collection shape holds; migrate by `CHROMA_SCHEMA_VERSION` bump + rebuild, never in-place vector conversion
- `etok` lives in `token-optimizer/` as a separate Rust crate with its own build
- Installed copies under `~/.claude/` and `~/.efficlaude/` must stay in sync via `install.sh`
- NEVER perform any git operation autonomously — git only via explicit `/ec-git` (CLAUDE.md GIT RULES)

## Non-Goals
- Parallel subagent spawning / DAG scheduler execution (D7 second half) — honest dependencies are written and consumed for fusion and ordering this cycle, but concurrent writes into one repo is a separate throughput problem with its own risk profile
- Rust rewrite of the server (Tier 5) — a footprint and distribution decision, measured at 0% on accuracy, token cost and quality
- `sqlite-vec` adoption — still pre-1.0; brute force suffices to ~100k vectors
- Replacing ChromaDB with SQLite + cosine
- Background scheduling of long-running jobs on frozen source snapshots (§4.4)
- Negative-result storage, cross-task knowledge cache, and explicit per-stage token budgets (§7.3, §7.6, §7.5)

## Risks & Mitigations
- Multilingual model still scores poorly on a mixed Indonesian/code/shell corpus → acceptance is measured against the same four benchmark queries, and the relative floor means a bad model injects zero items rather than noise; `bge-m3` is the documented fallback
- Signal predicate too aggressive, discarding `tool_use` rows that mattered → the gate is a signal predicate, not a type ban; rejected rows increment an observable counter so the reject rate can be read and tuned via env var
- Moving global verifies to module boundaries lets a compile break hide across several tasks → module-boundary gates are mandatory rather than optional, local evidence must be task-specific, and `ec-review` gains a definitive compile gate plus an audit comparing `- [x]` claims against recorded local evidence
- A hook bug affects every prompt in every session → hooks already follow the silent-fail-on-non-critical-paths convention; the injection change is a default inversion (fail closed to zero injection), which is the safe direction
- Corpus purge is not reversible → the corpus is 84% noise and fully regenerable from future sessions; the prior branch decision is preserved at `.claude/decisions/main.md.bak` and the completed 41/41 Studio plan is archived at `.claude/plans/archive/main-2026-10-28-1521-efficlaude-studio-macos-desktop-app.md`
- Lossy filter fixes could themselves lose data → encode the general rule as a test: any filter given unrecognised structure must return its input unchanged

## Verification Strategy
- Corpus noise removed → `sqlite3 ~/.efficlaude/efficlaude.db "SELECT type, COUNT(*) FROM observations GROUP BY type ORDER BY 2 DESC"` → `tool_use` share below 25% (from 84%)
- Dedup active → a repeated identical command observed twice yields one row with `seen_count` = 2, not two rows
- Reject rate observable → after a session, the rejected-observation counter is readable and non-zero
- FTS ranks by relevance → `grep -n "ORDER BY rank" server/memory.py` returns a hit and `grep -n "ORDER BY o.created_at DESC" server/memory.py` returns none in the FTS search path
- Distance is honest → `/memory/search` response contains no result with a hardcoded `0.5`, and every item carries `source` of `fts` or `vector`
- Multilingual retrieval works → the four benchmark queries (`auto-flow sentinel stop hook driver`, `bagaimana cara kerja memory engine`, `scroll bug transfer list`, `token optimizer etok`) each return a best distance below the new real floor, improving on the measured 1.19–1.25
- Injection default inverted → running `hooks/prompt_submit.py` with a nonsense prompt emits no `Relevant project memory` block at all
- Docs injection gated → running `hooks/prompt_submit.py` with a realistic prompt emits no `flask › Contributing`, `flask › Donate`, or Jinja-link chunk
- Plan field bloat gone → a newly generated plan contains zero `Breaking change: none` lines and zero `Rollback: git checkout --`/`rm` lines mechanically derivable from `File:`
- Template drift enforced → `ec-review` Stage 1.5 fails a plan deliberately seeded with a mechanical `Rollback:` line
- Verify split in effect → per-task `Verify:` steps contain no `cargo build`/`tsc --noEmit`/`pytest`; those appear only at module boundaries and in `ec-review`
- Dependencies consumed → `commands/ec-execute.md` contains a step reading `Dependencies:` outside the pre-flight checklist, and a plan with an empty dependency line executes without error
- Co-location fusion → on the archived 41-task reference plan, the fusion rule yields ~25 execution units and no two units share a `File:`
- Range reads → `ec-execute` reads header + checklist then a line range per task; no step instructs reading the whole plan file
- `etok git status` correctness → in a repo with unstaged modifications, `git status | etok git status` reports `Unstaged (n)` with n ≥ 1 and does not label those files `Staged`
- `etok git log` correctness → `git log --oneline -40 | etok git log` output exceeds 8 bytes and preserves all 40 commits
- `etok cargo` path retention → filter output retains the path line following `Finished ... at:`
- Lossy-safety rule → a unit test feeds each filter unrecognised structure and asserts the input is returned unchanged
- Shell wrapper fixed → `zsh -c 'source shell/effi-shell.sh; git status'` produces no `command not found: _etok_available`
- Command families deduplicated → `ls ~/.claude/commands/` lists only `ec-` prefixed files, and `install.sh` manages every file it installs
- No regression → `python3 -m pytest tests/ -q` passes with zero failures

## Open Questions
- Does `paraphrase-multilingual-MiniLM-L12-v2` clear a real relevance bar on this mixed-language corpus? → assuming: yes at 384 dim; if the benchmark queries do not improve, the relative floor makes the failure safe and `bge-m3` is the fallback
- What runtime threshold N marks a `tool_use` row as carrying signal? → assuming: N = 5 s, exposed as an env var, with the reject-rate counter making it tunable from evidence rather than guesswork
- Should the relevance floor be median-relative or top-gap-relative? → assuming: median-relative with a configurable margin and an env override, chosen because it degrades to "inject nothing" rather than "inject the best of a bad set"
- Does fusing co-located tasks ever merge across a human GATE task? → assuming: no — gates are fusion barriers by rule, since the reference plan's GATE at task 14 exists precisely to stop work before cost is spent

## Out of Scope
- The pre-existing freshness bug at `hooks/session_stop.py:212`, where `.claude/.review-done-{branch}` is treated as an unconditional chain-complete signal with no staleness check. It was hit live while starting this chain (a 13:51 marker would have killed the auto-flow on turn one) and worked around by clearing the marker; fixing the hook itself belongs to its own cycle.
- Measuring the end-to-end token reduction claim of 40–60% per cycle; this cycle instruments the individual numbers above, not an aggregate benchmark harness.
- Any change to the four plan fields identified as the system's actual source of quality (`Edge cases`, `Acceptance`, `Do not touch`, `Reuse`) — deliberately untouched.

_Created: 2026-10-28_
