# Review Summary — Pipeline Jujur — honest write, honest rank, lean artifacts
_Date: 2026-10-28_

## Feature
Pipeline Jujur — honest write, honest rank, lean artifacts

## Tasks completed
- [x] Task 1: Add schema v2 migration for content_hash and seen_count [S] [agent: ec-python] — extend `_MIGRATIONS` with additive ALTER TABLE statements and bump `SCHEMA_VERSION`
- [x] Task 2: Add content_hash index and helper [S] [agent: ec-python] — index on `(project, content_hash)` plus a `_content_hash()` function
- [x] Task 3: Dedup writes in save_observation [M] [agent: ec-python] — on hash collision bump `seen_count` and refresh `created_at` instead of inserting
- [x] Task 4: Add _has_signal predicate to post_tool_use [M] [agent: ec-python] — decide whether a tool call carries evidence worth storing
- [x] Task 5: Wire the signal gate into post_tool_use main [S] [agent: ec-python] — reject unsignalled observations before spawning the observe subprocess
- [x] Task 6: Add _record_reject counter [S] [agent: ec-python] — count rejections by reason to a JSON file so the reject rate is observable
- [x] Task 7: Add /memory/stats endpoint [S] [agent: ec-python] — expose type composition and reject counts over HTTP
- [x] Task 8: Add purge_noise maintenance script [M] [agent: ec-python] — delete unsignalled historical `tool_use` rows from SQLite, FTS and Chroma together
- [x] Task 9: Run the memory write-path module gate [S] [agent: ec-unit-test] — global invariant checkpoint for Tasks 1-8
- [x] Task 10: Rank FTS results by BM25 [S] [agent: ec-python] — replace `ORDER BY o.created_at DESC` with `ORDER BY rank`
- [x] Task 11: Return honest FTS distances [M] [agent: ec-python] — map `bm25()` into [0,1] and drop the hardcoded `0.5`
- [x] Task 12: Tag every result with its retrieval source [S] [agent: ec-python] — add `source` of `fts` or `vector` on both paths
- [x] Task 13: Fuse the two retrieval paths with RRF [M] [agent: ec-python] — replace the 1.2 threshold cliff with reciprocal rank fusion
- [x] Task 14: Add capability-gated multilingual ONNX embedder [L] [agent: ec-python] — new `server/embedder.py` using the present `onnxruntime`, with fallback
- [x] Task 15: Wire the embedder into _get_collection [M] [agent: ec-python] — pass `embedding_function` and bump `CHROMA_SCHEMA_VERSION` to force a rebuild
- [x] Task 16: Add the relative relevance floor to prompt_submit [M] [agent: ec-python] — inject nothing unless a result beats the median by a margin
- [x] Task 17: Gate docs injection behind a quality bar [M] [agent: ec-python] — require a minimum chunk count and relevance before any library is injected
- [x] Task 18: Run the memory read-path module gate [S] [agent: ec-unit-test] — global invariant checkpoint for Tasks 10-17
- [x] Task 19: Make Rollback exception-only in the plan template [S] — write it only when it differs from the mechanical default
- [x] Task 20: Make Breaking change exception-only in the plan template [S] — omit the line entirely when there is no breaking change
- [x] Task 21: Make Anchor exception-only in the plan template [S] — omit it for new files instead of writing "new file"
- [x] Task 22: Split Verify into local evidence and global invariants [M] — define both kinds and where each runs
- [x] Task 23: Require honest Dependencies in ec-feature [M] — real edges, allowed to be empty, never a synthetic chain
- [x] Task 24: Update the ec-feature self-review checklist [S] — add checks for the exception-only fields, the verify split and honest dependencies
- [x] Task 25: Switch ec-execute to ranged plan reads [M] — read header plus checklist, then one line range per task
- [x] Task 26: Consume Dependencies and fuse co-located tasks in ec-execute [L] — build the graph, merge consecutive same-file tasks into one unit
- [x] Task 27: Stop passing memory snippets into every subagent [S] — remove the line that multiplies injection by the task count
- [x] Task 28: Run global invariants at module boundaries in ec-execute [M] — move compile and suite runs out of per-task verification
- [x] Task 29: Enforce exception-only fields in the ec-review drift check [M] — fail a plan that carries mechanical Rollback or Breaking change lines
- [x] Task 30: Add the definitive compile gate and evidence audit to ec-review [M] — run global invariants once and audit `- [x]` claims against recorded evidence
- [x] Task 31: Add a scope boundary check to ec-review [S] — assert the working tree touches only files listed in the plan
- [x] Task 32: Fix git status staged/unstaged classification [M] — track the section header instead of the identical text prefix
- [x] Task 33: Support --oneline in the git log filter [M] — recognise the short format instead of collapsing it to an empty table
- [x] Task 34: Apply the lossy-safety rule to the git filters [S] — return the input unchanged when no structure is recognised
- [x] Task 35: Keep the artefact path in the cargo build filter [M] — retain the line after `Finished ... at:` and dedup repeats
- [x] Task 36: Remove the helper dependency from the shell wrappers [M] — inline the availability test so the wrappers work in any shell
- [x] Task 37: Add Rust tests for the git and cargo filters [L] — cover both bugs, the oneline format and the lossy-safety rule
- [x] Task 38: Run the etok module gate [S] — global invariant checkpoint for Tasks 32-37
- [x] Task 39: Remove legacy non-prefixed commands in install.sh [M] — delete the duplicate command family on install
- [x] Task 40: Add Python tests for the hook changes [L] [agent: ec-unit-test] — cover the signal gate, reject counter, relevance floor and docs gate
- [x] Task 41: Add Python tests for the memory changes [L] [agent: ec-unit-test] — cover dedup, BM25 ranking, honest distance, source tagging and RRF
- [x] Task 42: Add command-doc tests for the template changes [M] [agent: ec-unit-test] — assert the exception-only rules, verify split and ranged reads are documented
- [x] Task 43: Sync installed copies and run the final gate [M] — copy changed commands, hooks and server files into place, then run every global invariant

## Files modified
- `server/memory.py` — schema v2 (`content_hash`, `seen_count`), `_content_hash`, dedup in `save_observation`, `_bm25_to_distance`, `ORDER BY rank`, `source` tags, `_rrf` fusion, `stats()`, embedder wiring, mode-scoped Chroma marker
- `server/embedder.py` — **new**, capability-gated multilingual ONNX embedding function, torch-free
- `server/purge_noise.py` — **new**, `--dry-run`/`--yes` guarded historical corpus purge
- `server/worker.py` — `/memory/stats` endpoint
- `hooks/post_tool_use.py` — `_has_signal` write gate, `_record_reject` counter, `EFFICLAUDE_DEBUG` payload diagnostic
- `hooks/prompt_submit.py` — `_relevance_floor`, `_docs_gate`
- `commands/ec-feature.md` — exception-only fields, `Verify (local)`/`(global)` split, honest-dependencies rule, count-stability rule, checklist 15 → 20
- `commands/ec-execute.md` — ranged plan reads, co-location fusion, snippet forwarding removed, module-boundary gates
- `commands/ec-review.md` — plan lint, definitive global gate, evidence audit, scope boundary
- `token-optimizer/src/filters/git.rs` — section-based staged/unstaged, `--oneline` support, lossy-safety guard, 17 tests
- `token-optimizer/src/filters/cargo.rs` — artefact path retention, pair dedup, 10 tests
- `shell/effi-shell.sh` — inlined availability test, helper removed
- `install.sh` — `LEGACY_COMMANDS` removal, `embedder.py`/`purge_noise.py` added to `SERVER_FILES`
- `tests/test_hooks.py` (+16) · `tests/test_memory.py` (+12) · `tests/test_command_docs.py` (+10)

Blast radius: 4 dependents detected, all already within scope. Scope boundary clean — 16/16 declared paths changed; only `README.md` appeared out of scope and its mtime (14:46) predates this cycle's start (15:23), so it is pre-existing uncommitted work.

## Issues fixed during review
All three were defects in the review machinery this cycle itself introduced:

1. **`commands/ec-review.md`** — the new plan-lint bullet checking a task's `File:` "new file" claim against disk is unevaluable after execution: a new file exists precisely because its task created it. It fired on Tasks 8 and 14 as false positives and would fire on every correctly-executed new-file task forever. Removed, and delegated to `/ec-feature`'s Grounding Pass where the claim is actually checkable.
2. **`commands/ec-feature.md`** — added a **count-stability rule**. An exact `grep -c "{string}" {file}` → `== n` is inherently unstable once a later task in the same plan touches that file, which co-location fusion makes the norm. Prescribes `>= n` or anchoring to a construct unique to the task. Found because the evidence audit flagged Tasks 1 and 32, whose counts had risen legitimately (`content_hash` 2 → 6 via Tasks 2/3; `Changes to be committed` 1 → 5 via Task 37's fixtures).
3. **`commands/ec-review.md`** — added fabrication-vs-plan-ordering discrimination to the evidence audit: a fabrication shows a count *below* expectation, a plan-ordering defect shows it *above* with every extra hit attributable by line number to a later task. Attribute before judging.

Plan lint also confirmed two genuine fabricated `Task N-1` dependency chains in this plan's own tail (24..31 and 33..39), already recorded in the plan as planning defects.

Exception-only fields are working: `Rollback` 3/43, `⚠️ Breaking change` 9/43, `Anchor` 37/43 — against the 41/41 "none" the source analysis measured on the previous plan.

## Review result
| Check | Status |
|-------|--------|
| Spec compliance | ✓ |
| Code quality | ✓ |
| Type safety | ✓ (no implicit Any; files match their own annotation level) |
| Performance | ✓ |
| Security | ✓ (no secrets, no eval/exec/os.system/shell=True, no bare except) |
| Accessibility | n/a — no UI scope |
| Visual fidelity / Anti-slop | n/a — plan carries neither Design Contract nor Design Direction |
| API correctness | ✓ |
| GIT RULES drift | ✓ in sync |
| Definitive global gate | ✓ Rust build exit 0 · 195 Python passed · 27 Rust passed · 0 failed |
| Tests | added — 38 new (16 hooks, 12 memory, 10 command-docs) plus 27 Rust |

## Open items deliberately not fixed
Each is outside this cycle's declared scope and needs its own task:

- **Worker silently unavailable ~240 s on first start after upgrade.** `_reconcile_chromadb()` runs synchronously in `MemoryEngine.__init__`, which `server/worker.py` executes at import — before Flask binds, so `/health` returns nothing and any client concludes the worker is dead. Measured: ~12 min CPU at 387%, 17,458 vectors rebuilt. The wipe itself was beneficial (293 MB → 65 MB against a 26.8 MB floor), clearing bloat the v2 consolidation never removed.
- **`${PIPESTATUS[0]}` is bash-only** in all six `shell/effi-shell.sh` wrappers, while `install.sh` sources them into `.zshrc` too — so under zsh a failing `cargo build` piped through etok can report success, corrupting an exit code a caller may branch on.
- **`~/.claude/commands/ec-design.md`** is stale unmanaged drift (dated Apr 20 vs Sep 15 for every managed command) and still shadows the design path folded into `/ec-brainstorm`. `commands/ec-design.md` does not exist in the repo, so it cannot simply be added to `COMMANDS` — that would abort the installer under `set -e`.
- **`MIN_DOCS_CHUNKS` is unimplementable** until `Docs.search` exposes a per-library chunk count; the `/docs/search` payload carries only `library`, `heading`, `content`, `distance`.
- **`source` under-reports the FTS path** because `_rrf` keeps the first-seen object and the vector path is iterated first; `fused_score` is the honest cross-path discriminator today.
- **The docs path has a quality gate but no relevance floor** — chunks at distance 1.5–1.7 still inject if heading and length pass. `_relevance_floor` would apply unchanged.
