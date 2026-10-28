## Feature: Pipeline Jujur — honest write, honest rank, lean artifacts

### Impact Analysis
- Files affected: `server/memory.py`, `server/worker.py`, `server/embedder.py` (new), `server/purge_noise.py` (new), `hooks/post_tool_use.py`, `hooks/prompt_submit.py`, `commands/ec-feature.md`, `commands/ec-execute.md`, `commands/ec-review.md`, `token-optimizer/src/filters/git.rs`, `token-optimizer/src/filters/cargo.rs`, `shell/effi-shell.sh`, `install.sh`, `tests/test_hooks.py`, `tests/test_command_docs.py`, `tests/test_memory.py`
- ⚠️ Breaking change risk:
  - SQLite schema v1 → v2 on `observations` (additive columns only, `_MIGRATIONS` handles it)
  - `CHROMA_SCHEMA_VERSION` 2 → 3 forces a one-time vector-store rebuild; `_migrate_chroma_layout` already implements the wipe-and-rebuild path
  - `/memory/search` response gains a `source` field and returns honest distances — `hooks/prompt_submit.py` is the only in-repo consumer and is updated in the same plan; `commands/*.md` read it only as display text
  - `shell/effi-shell.sh` wrapper semantics change (helper dependency removed); behaviour for users is identical when `etok` is present
  - Legacy non-prefixed commands are deleted from `~/.claude/commands/` by the installer

### Reusable Existing Code
- `_MIGRATIONS` + `_migrate()` at `server/memory.py:26,116` — versioned DDL path already exists; add v2 rather than hand-rolling a migration
- `_migrate_chroma_layout()` at `server/memory.py:42` — existing marker-file wipe/rebuild; bump `CHROMA_SCHEMA_VERSION` to reuse it for the embedder swap
- `_fts_sanitize()` at `server/memory.py:36` — keep as-is; it already guards FTS5 against punctuation
- `_prune_type()` / `TYPE_CAPS` at `server/memory.py:188,17` — capping already exists; the signal gate reduces inflow rather than duplicating pruning
- `_warn()` at `hooks/post_tool_use.py:14` and `hooks/prompt_submit.py:17` — identical silent-fail logger; use it for every new failure path
- `super::generic::process()` at `token-optimizer/src/filters/git.rs:12` — already the "I don't recognise this" fallback; the lossy-safety rule routes through it instead of inventing a new path
- `fetch_file()` at `install.sh:26` — use for any new server file; do not hand-roll a copy
- `ONNXMiniLM_L6_V2` from `chromadb.utils.embedding_functions` — the existing default embedder, confirmed present; it is the fallback when no multilingual model is installed

### Grounding
Measured 2026-10-28 on this machine — real command output only.

- Baseline corpus composition: `sqlite3 ~/.efficlaude/efficlaude.db "SELECT type, COUNT(*) FROM observations GROUP BY type ORDER BY 2 DESC"` →
  `tool_use|14629` `review|723` `feature_plan|694` `execution|676` `decision|658` `setup|17` `reference|9` `project|8` `feedback|7` `general|4` `selfhealing|3` `deployment|2`
  → total 17430, `tool_use` share = 14629/17430 = **83.9%**
- **Measured correction to the premise, found during execution (Task 7).** That 83.9% is a GLOBAL figure spanning **350 distinct projects**, not one project's retrieval pool. `TYPE_CAPS["tool_use"] = 200` (`server/memory.py:19`) is enforced per project by `_prune_type`, so every project is pinned at exactly 200 `tool_use` rows. For `project='EffiClaude'` the real composition is `tool_use 200, feature_plan 45, review 45, execution 44, decision 36, general 2, selfhealing 1, setup 1` — total 374, so **53.5%** noise, not 84%. Since `search()` filters by project, 53.5% is the number that actually degrades retrieval accuracy. The source analysis's claim that "every retrieval path draws from a pool that is 84% garbage" therefore overstates the per-query case, though `tool_use` is still the single largest type in the pool and the write-side gate remains the right fix. The 84% figure is accurate as a STORAGE statement — it is what drives the 293 MB Chroma store across 350 projects, which is what `server/purge_noise.py` (Task 8) addresses.
- Consequence for Task 7, recorded rather than fixed: a project-scoped `/memory/stats` can make the REJECT rate observable but cannot make the corpus skew observable, because per-type pruning has already flattened every project to the 200 cap. Exposing the skew would need an unscoped or global mode (`project=*`, or a separate route). That is outside Task 7's declared boundary and was deliberately not added — it belongs to a later cycle.
- Baseline store size: `du -sh ~/.efficlaude/chroma ~/.efficlaude/efficlaude.db` → `293M` chroma, `32M` sqlite
- Baseline test result: `python3 -m pytest tests/ -q` → **157 passed, 1 warning in 3.01s**
- Baseline retrieval, four benchmark queries via `/memory/search?limit=5` (recorded verbatim):
  - `auto-flow sentinel stop hook driver` → best 0.5398, all `[0.5398, 0.775, 1.1923, 1.2292, 1.2542]`, types `[tool_use, tool_use, decision, review, execution]`, path Chroma
  - `bagaimana cara kerja memory engine` → best 1.1882, all `[1.1882, 1.2107, 1.222, 1.246, 1.2788]`, types `[execution, decision, feature_plan, decision, review]`, path Chroma
  - `scroll bug transfer list` → best 0.5000, all `[0.5, 0.5, 0.5, 0.5, 0.5]`, types `[feature_plan, tool_use, review, execution, feature_plan]`, path **FTS (every distance identical — the D3 placeholder)**
  - `token optimizer etok` → best 1.0608, all `[1.0608, 1.1953, 1.2645, 1.3172, 1.3701]`, types `[tool_use × 5]`, path Chroma
- Dependency probe: `chromadb 1.5.8`, `onnxruntime 1.19.2`, `numpy 2.0.2` present; `sentence_transformers` **MISSING**, `torch` **MISSING**
- FTS5 ranking probe: `SELECT content, rank, bm25(t) FROM t WHERE t MATCH ? ORDER BY rank` → returns `-2.236866351422218` for both `rank` and `bm25(t)`; **`ORDER BY rank` is available and ascending = best-first**
- Baseline line counts: `wc -l` → `hooks/post_tool_use.py` 124 · `hooks/prompt_submit.py` 230 · `server/memory.py` 447 · `server/worker.py` 356 · `commands/ec-feature.md` 407 · `commands/ec-execute.md` 267 · `commands/ec-review.md` 279 · `shell/effi-shell.sh` 92 · `install.sh` 265 · `tests/test_hooks.py` 467 · `tests/test_command_docs.py` 353 · `tests/test_memory.py` 111 · `tests/conftest.py` 15 · `token-optimizer/src/filters/git.rs` 180 · `token-optimizer/src/filters/cargo.rs` 70
- Test harness conventions (measured, not assumed):
  - `tests/conftest.py:5` inserts `../server` on `sys.path`, and defines the `db_path` and `chroma_path` fixtures (`tmp_path`-based) that every memory test already uses — do not re-implement them
  - `tests/test_memory.py` **already exists with 111 lines and 10 tests**; `from memory import MemoryEngine` at line 4 works because of conftest. Task 41 APPENDS to it
  - `tests/test_hooks.py:9` inserts `../hooks` on `sys.path` at module level, then each test does `from <module> import <name>` inside the test body and carries a one-line docstring — match that style
  - Two existing memory tests constrain this plan and must keep passing unchanged: `test_search_empty_collection` (line 24) asserts `search()` returns exactly `[]` on an empty store, which the RRF path in Task 13 must preserve; `test_reconcile_chromadb_fills_missing` (line 41) hand-builds an `observations` table with the v1 column set, so the Task 1 migration must successfully ALTER it rather than assume the engine created it
- Baseline string counts (`grep -c`):
  - `server/memory.py`: `ORDER BY rank` → 0 · `ORDER BY o.created_at DESC` → 1 · `"distance": 0.5` → 1 · `content_hash` → 0 · `seen_count` → 0 · `"source"` → 0 · `embedding_function` → 0
  - `hooks/post_tool_use.py`: `_has_signal` → 0 · `_record_reject` → 0
  - `hooks/prompt_submit.py`: `_relevance_floor` → 0 · `MIN_DOCS_CHUNKS` → 0
  - `commands/ec-feature.md`: `exception-only` → 0
  - `commands/ec-execute.md`: `Pass relevant snippets into each subagent` → 1 · `co-location` → 0
  - `commands/ec-review.md`: `evidence audit` → 0
  - `token-optimizer/src/filters/git.rs`: `unstaged` → 5 · `Changes to be committed` → 0 · `mod tests` → 0
  - `token-optimizer/src/filters/cargo.rs`: `Finished` → 1
  - `shell/effi-shell.sh`: `_etok_available` → 7 (1 definition + 6 call sites at lines 13, 27, 41, 55, 69, 83)
  - `install.sh`: `LEGACY_COMMANDS` → 0
- Live reproduction of D10-C: every `git` invocation from this session's shell emits `git:2: command not found: _etok_available`
- Legacy command families present: `ls ~/.claude/commands/` → `brainstorm.md`, `execute.md`, `feature.md`, `git.md`, `review.md`, `setup.md` alongside 12 `ec-` prefixed files
- Verified anchors:
  - `SCHEMA_VERSION = 1` → `server/memory.py:16`
  - `_MIGRATIONS: dict[int, list[str]] = {` → `server/memory.py:26`
  - `_CHROMA_FALLBACK_THRESHOLD = float(os.getenv('EFFICLAUDE_FTS_THRESHOLD', '1.2'))` → `server/memory.py:29`
  - `CHROMA_SCHEMA_VERSION = 2` → `server/memory.py:31`
  - `CREATE TABLE IF NOT EXISTS observations` → `server/memory.py:87`
  - `return self.chroma_client.get_or_create_collection(SHARED_MEM_COLLECTION)` → `server/memory.py:186`
  - `def _fts_search(self, project: str, query: str, limit: int) -> list:` → `server/memory.py:246`
  - `ORDER BY o.created_at DESC` → `server/memory.py:257`
  - `"distance": 0.5` → `server/memory.py:265`
  - `def save_observation(self, project: str, obs_type: str, content: str, metadata=None) -> None:` → `server/memory.py:273`
  - `def search(self, project: str, query: str, limit: int = 5) -> list:` → `server/memory.py:310`
  - `if all(item['distance'] > _CHROMA_FALLBACK_THRESHOLD for item in items):` → `server/memory.py:329`
  - `@app.route('/memory/search')` → `server/worker.py:144`
  - `TRACKED_TOOLS = {"Write", "Edit", "Bash", "MultiEdit"}` → `hooks/post_tool_use.py:30`
  - `def post_observation(project, content, obs_type="tool_use"):` → `hooks/post_tool_use.py:57`
  - `observation = build_observation(tool_name, data.get("tool_input", {}))` → `hooks/post_tool_use.py:108`
  - `MAX_MEMORY_ITEMS = 5` → `hooks/prompt_submit.py:33`
  - `mem_lines = [f"- [{m['metadata'].get('type', 'obs')}] {m['content']}" for m in memory_items]` → `hooks/prompt_submit.py:203`
  - `doc_lines = [f"- [{d['library']} › {d['heading']}] {d['content'][:120]}" for d in docs_items]` → `hooks/prompt_submit.py:207`
  - `- Anchor: {exact existing string the executor must locate, with line number from Grounding — or "new file"}` → `commands/ec-feature.md:312`
  - `- ⚠️ Breaking change: {description or "none"}` → `commands/ec-feature.md:317`
  - `- Verify: {exact command + expected value, traced to a baseline in ### Grounding}` → `commands/ec-feature.md:319`
  - `- Rollback: {how to undo this task — or "git checkout -- {file}"}` → `commands/ec-feature.md:320`
  - `- Dependencies: {other tasks, or "none"}` → `commands/ec-feature.md:321`
  - `- \`{PLAN_FILE}\` — the plan to execute` → `commands/ec-execute.md:44`
  - `  Pass relevant snippets into each subagent's context.` → `commands/ec-execute.md:55`
  - `Read all tasks from \`{PLAN_FILE}\`. Find all lines matching \`- [ ]\`.` → `commands/ec-execute.md:100`
  - `## Stage 1.5 — Template Drift Check` → `commands/ec-review.md:91`
  - `## Step 2 — Testing` → `commands/ec-review.md:166`
  - `fn status(input: &str) -> String {` → `token-optimizer/src/filters/git.rs:16`
  - `} else if trimmed.starts_with("modified:") || trimmed.starts_with("deleted:") {` → `token-optimizer/src/filters/git.rs:29` (the unreachable branch)
  - `fn log(input: &str) -> String {` → `token-optimizer/src/filters/git.rs:70`
  - `if line.starts_with("commit ") {` → `token-optimizer/src/filters/git.rs:75`
  - `if trimmed.starts_with("error") || trimmed.starts_with("warning") || trimmed.starts_with("Compiling") || trimmed.starts_with("Finished") || trimmed.starts_with("Blocking") {` → `token-optimizer/src/filters/cargo.rs:54`
  - `_etok_available() {` → `shell/effi-shell.sh:6`
  - `COMMANDS=("ec-setup" "ec-feature" "ec-brainstorm" "ec-execute" "ec-review" "ec-git" "ec-export" "ec-import" "ec-mode" "ec-next" "ec-selfhealing")` → `install.sh:14`
  - `for cmd in "${COMMANDS[@]}"; do` → `install.sh:69`
  - `from memory import MemoryEngine` → `tests/test_memory.py:4`
  - `def test_fts_search_survives_punctuation(db_path, chroma_path):` → `tests/test_memory.py:108` (last test — Task 41 appends after it)
  - `sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'hooks'))` → `tests/test_hooks.py:9`
  - `server/embedder.py`, `server/purge_noise.py` → new file — no anchor

**Design scope:** this feature has no UI scope — no `### Design Contract`, no `### Design Direction`, no `[design:]` tags.

**Planning defect found during execution — fabricated dependencies in this plan's own tail.** Tasks 39→40→41→42→43 were written as a straight `Task N-1` chain, which is exactly the anti-pattern Task 23 adds a rule against and Task 29 teaches `/ec-review` to flag. The real edges are: Task 39 (`install.sh` legacy-command removal) depends on nothing — it has no relationship to the etok module gate at Task 38; Task 40 (hook tests) depends only on Tasks 4-6; Task 42 (command-doc tests) depends only on Tasks 19-31; Task 41 (memory tests) genuinely depends on the memory read path (10-13, 15); Task 43 genuinely depends on everything. The three false edges were corrected in place and the tasks executed against their real prerequisites. Recorded here rather than silently rewritten, because this plan is also the first test subject of the rules it introduces — and it failed that test in the same way the source analysis measured the Studio plan failing it (40 of 41 dependency lines reading "Task N-1").

**Planning note on the embedder (D4).** The decision assumed a direct swap to `paraphrase-multilingual-MiniLM-L12-v2`. The dependency probe above shows `sentence_transformers` and `torch` are both absent, so that swap through `SentenceTransformerEmbeddingFunction` would add roughly 2 GB of dependencies — a severe regression on the very footprint the source analysis criticises, and a violation of the decision's own "zero external services" constraint. This plan therefore delivers the decision's *intent* — retrieval that is genuinely useful, not merely honest — by two means that need no new dependency: honest BM25 lexical ranking fused with the vector path by reciprocal rank fusion (replacing the 1.2 cliff that the grounding shows every query sitting on), plus a capability-gated multilingual ONNX embedder that uses the already-present `onnxruntime` and silently falls back to the existing default when no model is installed. The relative relevance floor sits on the fused score, so a weak embedder produces silence rather than noise. Tasks 14, 15 and 16 carry this.

### Tasks
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

### Per Task Detail

**Task 1 — Add schema v2 migration for content_hash and seen_count** `S`
- File: `server/memory.py`
- Anchor: `_MIGRATIONS: dict[int, list[str]] = {` → line 26
- Reuse: the existing `_migrate()` loop at line 116 already applies `_MIGRATIONS[v]` in order and records the version; add data, not machinery
- Code sample:
```python
SCHEMA_VERSION = 2
_MIGRATIONS: dict[int, list[str]] = {
    # 1 = baseline — no DDL changes needed, just establishes the versioning system
    2: [
        "ALTER TABLE observations ADD COLUMN content_hash TEXT",
        "ALTER TABLE observations ADD COLUMN seen_count INTEGER NOT NULL DEFAULT 1",
        "CREATE INDEX IF NOT EXISTS idx_obs_project_hash ON observations(project, content_hash)",
    ],
}
```
- Do not touch: `TYPE_CAPS`, `CHROMA_SCHEMA_VERSION`, `_CHROMA_FALLBACK_THRESHOLD`, and the `CREATE TABLE` in `_init_db` — new installs get the columns from the migration path, so the baseline DDL stays untouched and both paths converge
- Edge cases: migration must be idempotent against a database already at v2 (the `_migrate()` range loop handles this); one failing `ALTER TABLE` must not abort the remaining statements in the list — check whether `_migrate()` wraps each statement individually and make it do so if it does not
- Acceptance: a database opened by the engine reports schema version 2 and `observations` has both new columns
- Verify (local): `grep -c "content_hash" server/memory.py` → `== 2` and `grep -c "seen_count" server/memory.py` → `== 1` (baseline 0 and 0)
- Dependencies: none

**Task 2 — Add content_hash helper** `S`
- File: `server/memory.py`
- Anchor: `def _fts_sanitize(query: str) -> str:` → line 36
- Reuse: module-level helper style already established by `_fts_sanitize`; add `import hashlib` beside the existing imports
- Code sample:
```python
def _content_hash(content: str) -> str:
    """Stable hash for dedup — whitespace-normalised so reruns collapse."""
    return hashlib.sha256(' '.join(content.split()).encode()).hexdigest()[:32]
```
- Do not touch: `_fts_sanitize` — it serves a different purpose and must keep its current behaviour
- Edge cases: content differing only in whitespace or line breaks must hash identically, which is the whole point; empty content must not raise; the 32-character truncation must be documented as collision-tolerant, since a false dedup merely merges two identical-looking observations
- Acceptance: `_content_hash` returns the same 32-character value for inputs differing only in whitespace
- Verify (local): `python3 -c "import sys; sys.path.insert(0,'server'); import memory; a=memory._content_hash('a  b'); b=memory._content_hash('a b'); print(a==b, len(a))"` → prints `True 32`
- Dependencies: Task 1

**Task 3 — Dedup writes in save_observation** `M`
- File: `server/memory.py`
- Anchor: `'INSERT INTO observations (project, type, content, metadata, created_at) VALUES (?,?,?,?,?)'` → line 278
- Reuse: the existing `with _lock:` / `sqlite3.connect` block and the `chroma_ok` rollback below it — extend, do not restructure
- Code sample:
```python
h = _content_hash(content)
existing = conn.execute(
    'SELECT id FROM observations WHERE project=? AND content_hash=?', (project, h)
).fetchone()
if existing:
    conn.execute(
        'UPDATE observations SET seen_count = seen_count + 1, created_at = ? WHERE id = ?',
        (now, existing[0])
    )
    conn.commit()
    return
```
placed before the INSERT; the INSERT then also writes `content_hash`.
- Do not touch: the `chroma_ok` failure path that deletes the row from `observations` and `obs_fts` — a deduped write must return before reaching it, so Chroma is not touched for a duplicate
- Edge cases: a duplicate must not add a second Chroma document or FTS row; rows written before this change have `content_hash` NULL, and SQL equality never matches NULL to NULL, so legacy rows simply never dedup — acceptable, but confirm it does not raise; the early return skips the `_prune_type` cap call at line 306, which is correct only because no row was added — state that in a comment
- Acceptance: observing identical content twice leaves one row with `seen_count` 2, one FTS row and one Chroma document
- Verify (local): `grep -c "seen_count = seen_count + 1" server/memory.py` → `== 1` (baseline 0)
- ⚠️ Breaking change: repeated observations no longer produce separate rows, so `get_recent` returns fewer, denser entries — intended, and `seen_count` preserves the frequency signal
- Dependencies: Task 2

**Task 4 — Add _has_signal predicate to post_tool_use** `M`
- File: `hooks/post_tool_use.py`
- Anchor: `def build_observation(tool_name, tool_input):` → line 43
- Reuse: `_warn()` at line 14 for any failure; the module already imports `os` and `json`
- Code sample:
```python
SIGNAL_MIN_DURATION_MS = int(os.environ.get("EFFICLAUDE_SIGNAL_MS", "5000"))
_NOISE_PREFIXES = ("curl ", "cat ", "ls ", "echo ", "grep ", "sed -n", "wc ", "head ", "tail ")


def _has_signal(tool_name, tool_input, tool_response):
    """True when this tool call carries evidence worth storing."""
    if tool_name in ("Write", "Edit", "MultiEdit"):
        return any(not _is_internal(p) for p in _edited_paths(tool_name, tool_input))
    if tool_name == "Bash":
        if _exit_code(tool_response) != 0:
            return True
        if _duration_ms(tool_response) >= SIGNAL_MIN_DURATION_MS:
            return True
        cmd = str(tool_input.get("command", "")).strip()
        return not cmd.startswith(_NOISE_PREFIXES)
    return False
```
with `_is_internal(p)` true when the path is inside `.claude/` or `~/.efficlaude/`, `_edited_paths` reusing the same key extraction as `build_observation`, and `_exit_code` / `_duration_ms` reading whatever the hook payload provides and defaulting to `0`.
- Do not touch: `build_observation` and `TRACKED_TOOLS` — classification stays where it is; this task only adds the predicate
- Edge cases: `tool_response` may be absent, a string, or a dict — never raise, default to "no signal information"; a read-only probe that exits non-zero still counts as signal, because a failing probe is informative; a `Write` to a path outside the repo must still count; `_edited_paths` must handle `MultiEdit`'s `edits` list shape
- Acceptance: the predicate returns False for a successful fast `curl` against the worker and True for an edit to a file outside `.claude/`
- Verify (local): `python3 -c "import sys; sys.path.insert(0,'hooks'); import post_tool_use as p; print(p._has_signal('Bash', {'command':'curl -s localhost:37777/health'}, {'exit_code':0}), p._has_signal('Write', {'file_path':'server/memory.py'}, {}))"` → prints `False True`
- Dependencies: none

**Task 5 — Wire the signal gate into post_tool_use main** `S`
- File: `hooks/post_tool_use.py`
- Anchor: `observation = build_observation(tool_name, data.get("tool_input", {}))` → line 108
- Reuse: the existing `sys.exit(0)` early-return style used at lines 102, 106 and 110 — the hook must stay silent on every path
- Code sample:
```python
tool_input = data.get("tool_input", {})
if not _has_signal(tool_name, tool_input, data.get("tool_response")):
    _record_reject("no_signal", tool_name)
    sys.exit(0)

observation = build_observation(tool_name, tool_input)
```
- Do not touch: the `--observe` subprocess branch at lines 90-96 — it is the child process and must keep writing unconditionally, or the gate would be applied twice
- Edge cases: the gate must sit after the `TRACKED_TOOLS` check so untracked tools are not counted as rejections; a malformed payload must still exit 0 silently
- Carried forward from Task 4 (measured finding, not speculation): `_duration_ms` accepts the aliases `duration_ms`, `durationMs`, `duration`, `elapsed_ms`, `elapsedMs`, `took_ms`, and treats a bare `duration` as **milliseconds**. The real PostToolUse payload shape is undocumented in this repo. If it emits `duration` in seconds, the duration branch silently never fires — which fails safe (slow commands are missed, noise is never promoted to signal) but makes `SIGNAL_MIN_DURATION_MS` dead. While wiring the gate in, log the observed `tool_response` keys once via `_warn` under `EFFICLAUDE_DEBUG`, so the real shape can be confirmed from evidence rather than assumed
- Acceptance: a successful fast read-only Bash call produces no observe subprocess, while an edit outside `.claude/` still does
- Verify (local): `grep -c "_has_signal" hooks/post_tool_use.py` → `== 2` (baseline 0: one definition from Task 4, one call site here)
- Dependencies: Task 4

**Task 6 — Add _record_reject counter** `S`
- File: `hooks/post_tool_use.py`
- Anchor: `WORKER_URL = f"http://localhost:{os.environ.get('EFFICLAUDE_PORT', '37777')}"` → line 29
- Reuse: `_warn()` for failures; the `Path.home() / ".efficlaude"` location pattern from `_warn` at line 16
- Code sample:
```python
REJECT_FILE = Path.home() / ".efficlaude" / ".observe_rejects.json"


def _record_reject(reason: str, tool_name: str) -> None:
    """Count rejected observations so the reject rate stays observable."""
    try:
        data = json.loads(REJECT_FILE.read_text()) if REJECT_FILE.exists() else {}
        key = f"{reason}:{tool_name}"
        data[key] = data.get(key, 0) + 1
        REJECT_FILE.parent.mkdir(parents=True, exist_ok=True)
        REJECT_FILE.write_text(json.dumps(data))
    except Exception as e:
        _warn("post_tool_use", f"reject counter failed: {e}")
```
- Do not touch: `_warn` itself — reuse it, do not duplicate its log-rotation logic
- Edge cases: a corrupt or unreadable counter file must not crash the hook — fall back to an empty dict; concurrent hook invocations may interleave writes, so a lost increment is acceptable and must never raise; the counter must never be written during tests against the real home directory
- Acceptance: after a rejected observation the file exists and the relevant counter is at least 1
- Verify (local): `grep -c "_record_reject" hooks/post_tool_use.py` → `== 2` (baseline 0: definition plus the Task 5 call site)
- Dependencies: Task 5

**Task 7 — Add /memory/stats endpoint** `S`
- File: `server/worker.py`
- Anchor: `@app.route('/memory/search')` → line 144
- Reuse: the existing route style — `_valid_project`, `_err`, and `jsonify` as used by the neighbouring `/memory/context` handler at line 159
- Code sample:
```python
@app.route('/memory/stats')
def memory_stats() -> Response:
    project = request.args.get('project', '')
    if not _valid_project(project):
        return _err('invalid project')
    return jsonify(engine.stats(project))
```
with a matching `stats()` on `MemoryEngine` returning `{"types": {...}, "total": n, "rejects": {...}}`, reading the reject file written in Task 6.
- Do not touch: existing routes and the rate limiter — add a route, change no handler
- Edge cases: the reject file may not exist yet → return an empty dict, never an error; an unknown project returns zero counts rather than a 404; `stats()` must not load the whole corpus into memory, so use `GROUP BY` in SQL
- Acceptance: `GET /memory/stats?project=EffiClaude` returns type composition and a rejects object
- Verify (local): `grep -c "/memory/stats" server/worker.py` → `== 1` (baseline 0)
- Dependencies: Task 6

**Task 8 — Add purge_noise maintenance script** `M`
- File: `server/purge_noise.py` (new file)
- Reuse: `MemoryEngine`'s existing `_purge_fts_orphans()` at `server/memory.py:216` for the FTS cleanup step, and the Chroma collection handle from `_get_collection`
- Code sample:
```python
"""Delete historical unsignalled tool_use observations from all three stores.

Selects ids where type='tool_use' and the content matches a noise prefix, then
deletes from observations, obs_fts and the Chroma collection together, printing
a before/after count. Refuses to run without --yes; --dry-run writes nothing.
"""
```
- Do not touch: rows of any type other than `tool_use`; the `decision`, `review`, `feature_plan` and `execution` corpora are the system's actual value and must survive untouched
- Edge cases: must be re-runnable; a Chroma delete for an id absent from the vector store must not abort the SQLite delete; `--dry-run` must write nothing; delete from Chroma last, since `_purge_fts_orphans` can repair SQLite/FTS drift but nothing repairs a half-deleted vector store; the script must print the backup command it expects to have been run
- Acceptance **(corrected mid-execution — the original was arithmetically impossible)**: a dry run reports the count it would delete and writes nothing; a real run deletes only noise-shaped `Ran command:` rows, leaves every file-edit `tool_use` row intact, leaves every other type's count unchanged, leaves zero FTS orphans, and drops the Chroma count by exactly the number of rows deleted.
- Verify (local): `python3 server/purge_noise.py --dry-run` → reports a candidate count and states that nothing was written; `python3 server/purge_noise.py` with no flags → refuses with a non-zero exit and prints the backup command
- **Why the original criteria were withdrawn.** They demanded `tool_use` below 25% of the corpus and a dry-run candidate count above 10000. Measured: 14,638 `tool_use` rows, of which **12,146 are `Ran command:` and 2,492 are file edits** (`Wrote file:` / `Edited file:` / `Multi-edited:`), against 2,802 non-`tool_use` rows. Reaching 25% requires `tool_use <= 2802/3 = 934` rows, so it can only be done by deleting the file-edit rows — which this task's own "Do not touch" forbids. Deleting *every* recorded command, the absolute ceiling for any command-prefix rule, still leaves **47.2%**. The honest prefix rule matches ~3,463 rows (80.0%). The task's own prescribed fixture ends at 5/13 = 38.5%, independently proving the threshold was mis-specified rather than the rule too narrow. Both numbers were predicted rather than derived from the composition — the same traceability failure as Task 10's threshold.
- **The real lever, recorded not applied.** `tool_use` is already bounded: `TYPE_CAPS["tool_use"] = 200` (`server/memory.py:19`), enforced per project by `_prune_type`, so the 14,638 rows are ~73 projects sitting at the cap rather than an unbounded pile. The only change that reaches 25% is lowering that cap (a one-line, non-destructive edit that `_prune_type` already enforces). That alters retrieval depth for all 350 projects, is outside this decision's scope, and is the user's call — so it is a recommendation for a later cycle, not part of this one. The purge script reclaims storage; the write-side gate from Tasks 4-6 is what stops regrowth.
- Rollback: restore `~/.efficlaude/efficlaude.db` and `~/.efficlaude/chroma/` from the copy taken before the run
- ⚠️ Breaking change: destructive to the historical corpus. The script must refuse to run without an explicit `--yes` flag, and must print the backup command when invoked without one
- Dependencies: Task 3

**Task 9 — Run the memory write-path module gate** `S`
- File: none — verification only
- Reuse: the existing suite; no new test infrastructure
- Do not touch: any source file; if the gate fails, the fix belongs to the task that introduced the failure, not here
- Edge cases: a failure here means an earlier task is incomplete — report which task and stop rather than patching around it; the engine construction writes to the paths given, so use a scratch directory, never `~/.efficlaude/`
- **Lesson learned running this gate (worth carrying into `ec-execute.md`).** The first run of this gate reported `1 failed, 178 passed` — but the failure was `test_execute_does_not_forward_memory_snippets`, a test belonging to a DIFFERENT module whose agent was concurrently running a deliberate mutation check (it re-inserts the snippet line to prove the test bites, then restores it). File mtimes 16:09:18/16:09:26 against a 16:09:39 clock confirmed the race. A global invariant run while another unit is mid-mutation produces a meaningless verdict — which is an argument FOR the module-boundary design, not against it: **a gate must run when its module is quiescent.** The write-path engine checks in this gate passed cleanly throughout; only the shared suite was contaminated
- Acceptance: the write-path changes leave the suite green and the engine importable against a fresh database
- Verify (global): `python3 -m pytest tests/ -q` → `157 passed` or more, 0 failed (baseline 157 passed), and constructing `MemoryEngine` against a scratch db/chroma path exits 0
- Dependencies: Task 8

**Task 10 — Rank FTS results by BM25** `S`
- File: `server/memory.py`
- Anchor: `ORDER BY o.created_at DESC` → line 257
- Reuse: nothing new — FTS5 already computes `rank`, confirmed available by the grounding probe
- Code sample:
```sql
SELECT o.id, o.type, o.content, o.metadata, o.created_at, f.rank
FROM obs_fts f
JOIN observations o ON f.rowid = o.id
WHERE f.content MATCH ? AND o.project = ?
ORDER BY rank
LIMIT ?
```
- Do not touch: `get_recent()` at line 338, which legitimately orders by `created_at` — only the `_fts_search` ordering changes
- Edge cases: `rank` is only available when the query uses `MATCH`, which this one does; more negative is a better match, so plain ascending order is correct; the result tuple grows by one column, so the row indices in the dict comprehension below must be checked
- Acceptance: an FTS query returns its best lexical match first rather than its most recent match
- Verify (local): `grep -c "ORDER BY rank" server/memory.py` → `== 1` (baseline 0); `grep -c "ORDER BY o.created_at DESC" server/memory.py` → `== 0` (baseline 1); `grep -c "ORDER BY created_at DESC" server/memory.py` → `== 2` (baseline 2 — `get_recent` at line 368 and `_prune_summaries` at line 413, both untouched)
- **Corrected mid-execution.** The original threshold said the aliased form would still count 1 after the edit, attributing the survivor to `get_recent`. That was wrong: `get_recent` uses the UNALIASED `ORDER BY created_at DESC`, so the single aliased occurrence at baseline was `_fts_search`'s own and the specified edit necessarily drives it to 0. The baseline was measured correctly but the post-change prediction was not derived from it — exactly the traceability failure the Step 2.5 rule exists to prevent. The unaliased count is the check that actually proves `get_recent` was left alone
- Dependencies: none

**Task 11 — Return honest FTS distances** `M`
- File: `server/memory.py`
- Anchor: `"distance": 0.5` → line 265
- Reuse: the existing list-comprehension result shape so callers keep working unchanged
- Code sample:
```python
def _bm25_to_distance(rank: float) -> float:
    """FTS5 rank is negative and unbounded; map to [0,1] where lower is better."""
    try:
        score = -float(rank)
    except (TypeError, ValueError):
        return 1.0
    return round(1.0 / (1.0 + score), 4) if score > 0 else 1.0
```
used as `"distance": _bm25_to_distance(r[5])`.
- Do not touch: the Chroma distance values in `search()` — they are already real and must not be rescaled, or the two paths become incomparable in a different way
- Edge cases: `rank` may be `None` if the row is missing from FTS → return 1.0 (worst); a zero or positive rank must not divide by zero; the mapping must be monotonic so ordering by distance matches ordering by rank
- Acceptance: two results with different BM25 ranks get different distances, and the better match gets the lower number
- Verify (local): `grep -c '"distance": 0.5' server/memory.py` → `== 0` (baseline 1) and `python3 -c "import sys; sys.path.insert(0,'server'); import memory; print(memory._bm25_to_distance(-5.0) < memory._bm25_to_distance(-1.0), memory._bm25_to_distance(None))"` → prints `True 1.0`
- Dependencies: Task 10

**Task 12 — Tag every result with its retrieval source** `S`
- File: `server/memory.py`
- Anchor: `{"content": doc, "metadata": meta, "distance": dist}` → line 322 (vector path), plus the FTS result dict at line 262
- Reuse: both result builders already construct a dict — add one key to each
- Code sample:
```python
{"content": doc, "metadata": meta, "distance": dist, "source": "vector"}
```
and `"source": "fts"` in `_fts_search`.
- Do not touch: `get_recent()` and `export()` result shapes — they are not retrieval paths and gain nothing from a source field
- Edge cases: the field must be present on every retrieval result, never conditionally, or consumers cannot rely on it; `hooks/prompt_submit.py` reads keys by name so it is unaffected
- Acceptance: every item returned by `search()` carries a `source` of exactly `fts` or `vector`
- Verify (local): `grep -c '"source"' server/memory.py` → `== 2` (baseline 0)
- **Finding carried forward (Task 12's shape goal met, information goal not).** `_rrf` keys on `item['content']` and `setdefault` keeps the FIRST object seen; the vector path is iterated first, so any document found by both paths survives as the vector object and reports `source: "vector"` even though FTS contributed to its score. Across seven probe queries on two corpora, no fused result ever reported `source: "fts"` — the vector path overfetches `limit * _PROJECT_OVERFETCH` = 25 candidates, which on a small corpus already contains everything FTS can match. `source: "fts"` therefore surfaces only when the store is empty, Chroma errors, the admissibility gate drops the vector ranking, or an FTS hit falls outside the vector top-`limit`. The honest discriminator today is `fused_score`: a value above ~2/(60+limit) means both paths scored the item. Making the tag carry real signal (a `vector+fts` literal, or per-path contributions) is a follow-up task — the edit was deliberately not widened, since this task specifies exactly two literals
- Dependencies: Task 11

**Task 13 — Fuse the two retrieval paths with RRF** `M`
- File: `server/memory.py`
- Anchor: `if all(item['distance'] > _CHROMA_FALLBACK_THRESHOLD for item in items):` → line 329
- Reuse: `_fts_search()` and the existing Chroma query above it — fusion consumes both, it does not replace either
- Code sample:
```python
def _rrf(vector_items: list, fts_items: list, limit: int, k: int = 60) -> list:
    """Reciprocal rank fusion — ordering only, so the two scales never need calibrating."""
    scored: dict = {}
    for items in (vector_items, fts_items):
        for rank, item in enumerate(items, start=1):
            entry = scored.setdefault(item['content'], {"item": item, "score": 0.0})
            entry["score"] += 1.0 / (k + rank)
    ranked = sorted(scored.values(), key=lambda e: -e["score"])
    out = []
    for e in ranked[:limit]:
        item = dict(e["item"])
        item["fused_score"] = round(e["score"], 6)
        out.append(item)
    return out
```
`search()` runs both paths and returns `_rrf(...)`.
- Do not touch: `_CHROMA_FALLBACK_THRESHOLD` must remain defined and honoured as a degenerate-vector-path guard — when the vector store is empty or errors, the FTS-only path must still work exactly as it does today
- Edge cases: either path may return an empty list — handle both empty, one empty, and both populated; content appearing on both paths must merge into one entry with the summed score, never appear twice; the function must not require numpy; ties must resolve deterministically or result order becomes unstable between calls
- Acceptance: a query where the lexical and semantic paths disagree returns a merged ordering rather than one path's results wholesale, and the benchmark queries no longer flip between paths at a threshold
- Verify (local): `python3 -c "import sys; sys.path.insert(0,'server'); import memory; a=[{'content':'x','distance':0.2},{'content':'y','distance':0.3}]; b=[{'content':'y','distance':0.1}]; print([i['content'] for i in memory._rrf(a,b,2)])"` → prints `['y', 'x']` because `y` is ranked by both paths
- ⚠️ Breaking change: `search()` no longer returns results from exactly one path, and every result gains a `fused_score`. `hooks/prompt_submit.py` is the only in-repo consumer and is updated in Task 16
- Dependencies: Task 12

**Task 14 — Add capability-gated multilingual ONNX embedder** `L`
- File: `server/embedder.py` (new file)
- Reuse: `onnxruntime` 1.19.2 and `chromadb`'s embedding-function interface, both confirmed present; `logger.warn` for failures, matching the import at `server/memory.py:11`
- Code sample:
```python
"""Optional multilingual embedder. Falls back to Chroma's default when absent.

The model is NOT bundled: it is loaded from ~/.efficlaude/models/multilingual/
(model.onnx + tokenizer.json) when present. Returns None when unavailable so
callers keep the existing default embedding function.
"""
MODEL_DIR = Path.home() / ".efficlaude" / "models" / "multilingual"


def available() -> bool:
    return (MODEL_DIR / "model.onnx").exists() and (MODEL_DIR / "tokenizer.json").exists()


def get_embedding_function():
    """Return a Chroma-compatible embedding function, or None to use the default."""
```
The implementation tokenises with `tokenizers`, runs an `onnxruntime.InferenceSession`, mean-pools over the attention mask and L2-normalises to a 384-dim vector.
- Do not touch: `server/requirements.txt` must not gain `sentence-transformers` or `torch`. If `tokenizers` is not already available transitively through chromadb, `available()` must return False rather than the module adding a dependency
- Edge cases: model files present but corrupt → `available()` is true but session construction fails, so `get_embedding_function()` must catch and return None; output dimensionality must be asserted to be 384 or the function returns None, because a mismatch would silently corrupt the collection; an empty input list returns an empty list; the module must import cleanly even when `onnxruntime` is missing
- Acceptance: with no model installed, `available()` is False and `get_embedding_function()` returns None without raising; with a valid model installed it returns a callable producing 384-dim unit vectors
- Verify (local): `python3 -c "import sys; sys.path.insert(0,'server'); import embedder; print(embedder.available(), embedder.get_embedding_function())"` → prints `False None` on this machine, where no model is installed
- Rollback: delete `server/embedder.py` and revert Task 15 — the default embedder is restored because the wiring is capability-gated
- Dependencies: none

**Task 15 — Wire the embedder into _get_collection** `M`
- File: `server/memory.py`
- Anchor: `return self.chroma_client.get_or_create_collection(SHARED_MEM_COLLECTION)` → line 186
- Reuse: `_migrate_chroma_layout()` at line 42 — bumping `CHROMA_SCHEMA_VERSION` reuses the existing marker-file wipe, so no new migration code is needed
- Code sample:
```python
CHROMA_SCHEMA_VERSION = 3   # was 2 — forces one rebuild when the embedder changes

def _get_collection(self, project=None):
    kwargs = {}
    if self._embedding_function is not None:
        kwargs["embedding_function"] = self._embedding_function
    return self.chroma_client.get_or_create_collection(SHARED_MEM_COLLECTION, **kwargs)
```
with `self._embedding_function` resolved once in `__init__` via `embedder.get_embedding_function()`, wrapped so an import failure yields None.
- Do not touch: `SHARED_MEM_COLLECTION`'s name — renaming it would orphan the store instead of migrating it
- Edge cases: `get_or_create_collection` raises when an existing collection was created with a different embedding function, which is exactly why `CHROMA_SCHEMA_VERSION` is bumped — confirm the wipe runs before first collection access; when `embedder` is unavailable the call must be byte-for-byte equivalent to today's; `_migrate_chroma_layout` currently only wipes when it finds legacy `mem_`/`docs_` collections, so check it actually triggers on a version bump alone and extend it if not; a 293 MB store rebuild must not run inside a request
- Acceptance: on this machine, where no model is installed, retrieval behaves as before with no rebuild loop; with a model installed the collection is rebuilt once and the marker file prevents a second wipe
- Verify (local): `grep -c "embedding_function" server/memory.py` → `== 5` (baseline 0) and `grep -c "CHROMA_SCHEMA_VERSION = 3" server/memory.py` → `== 1`
- **Threshold corrected mid-execution (the fifth such defect in this plan).** The original said `== 2`, which was unreachable for the edits this very task specifies: the `_get_collection` sample alone contains 2 matching lines, and the task also mandates resolving `self._embedding_function` in `__init__` via `embedder.get_embedding_function()`, so 4 is the floor. Actual is 5: the resolver's `return embedder.get_embedding_function()`, the `__init__` assignment, the `rebuild=` argument, the `is not None` guard, and the `kwargs[...]` assignment. The baseline of 0 was right; the predicted post-change value was again not derived from the specified edits
- **Latent hard crash found and prevented — the most consequential finding of this cycle.** The comment claiming a `CHROMA_SCHEMA_VERSION` bump forces a rebuild was FALSE. `_migrate_chroma_layout` gated its wipe on `if legacy:` — finding `mem_%`/`docs_%` collections — so bumping to 3 merely wrote a new marker and wiped nothing. The consequence is not a silent mismatch but a hard failure: chromadb 1.5.8 raises `ValueError: An embedding function already exists in the collection configuration, and a new one is provided` on every `_get_collection()` call against an existing store once a model is installed. Verified by direct reproduction. Fixed by scoping the marker to the embedder mode (`.layout_v3` without a custom EF, `.layout_v3_ef` with one) and treating the opposite mode's marker as staleness, which closes BOTH directions — installing a model and later removing one, the latter otherwise hitting the symmetric conflict against a persisted custom EF that Chroma cannot reconstruct because this EF is not in its registry. A four-phase simulation with a stub 384-dim EF confirmed: wipe once on install, no second wipe, `_reconcile_chromadb()` repopulating from SQLite, and recovery rather than a raise on removal
- ⚠️ Breaking change: the one-time vector-store rebuild discards existing embeddings. SQLite remains the source of truth and `_reconcile_chromadb()` at line 146 already repopulates from it
- Dependencies: Task 14

**Task 16 — Add the relative relevance floor to prompt_submit** `M`
- File: `hooks/prompt_submit.py`
- Anchor: `mem_lines = [f"- [{m['metadata'].get('type', 'obs')}] {m['content']}" for m in memory_items]` → line 203
- Reuse: `MAX_MEMORY_ITEMS` at line 33 and the existing `if memory_items:` guard — the change is a filter in front of an existing branch
- Code sample:
```python
RELEVANCE_MARGIN = float(os.environ.get("EFFICLAUDE_RELEVANCE_MARGIN", "0.15"))
RELEVANCE_CEILING = float(os.environ.get("EFFICLAUDE_RELEVANCE_CEILING", "0.9"))


def _relevance_floor(items):
    """Keep only items that clearly beat the pack. Silence beats a wrong answer."""
    scored = [i for i in items if isinstance(i.get("distance"), (int, float))]
    if not scored:
        return []
    if len(scored) == 1:
        return [i for i in scored if i["distance"] <= RELEVANCE_CEILING]
    dists = sorted(i["distance"] for i in scored)
    median = dists[len(dists) // 2]
    return [
        i for i in scored
        if i["distance"] <= RELEVANCE_CEILING and i["distance"] <= median - RELEVANCE_MARGIN
    ]
```
applied as `memory_items = _relevance_floor(memory_items)` before line 203.
- Do not touch: the `update_msg`, `staleness_msg` and `mode_indicator` parts — they are not retrieval output and must still render when memory is empty
- Edge cases: a single result is its own median and would always be filtered, so the one-item case is handled against the ceiling alone; all-equal distances (the old FTS placeholder shape) must yield zero items, which is the intended behaviour; a missing or non-numeric `distance` must not raise; when the floor empties the list the `**Relevant project memory:**` header must not be emitted at all
- Acceptance: a prompt with no relevant memory produces no memory block, and a prompt with one clearly-better result still injects it
- Verify (local): `python3 -c "import sys; sys.path.insert(0,'hooks'); import prompt_submit as p; print(len(p._relevance_floor([{'distance':0.5}]*5)), len(p._relevance_floor([{'distance':0.1},{'distance':0.8},{'distance':0.85},{'distance':0.9},{'distance':0.95}])))"` → prints `0 1`
- Dependencies: Task 13

**Task 17 — Gate docs injection behind a quality bar** `M`
- File: `hooks/prompt_submit.py`
- Anchor: `doc_lines = [f"- [{d['library']} › {d['heading']}] {d['content'][:120]}" for d in docs_items]` → line 207
- Reuse: the filter-in-front-of-an-existing-branch shape established by Task 16
- Code sample:
```python
MIN_DOCS_CHUNKS = int(os.environ.get("EFFICLAUDE_MIN_DOCS_CHUNKS", "5"))
_DOCS_STOP_HEADINGS = {"donate", "contributing", "license", "credits", "changelog",
                       "sponsors", "code of conduct"}


def _docs_gate(items):
    """Drop boilerplate headings and chunks too thin to be worth a prompt."""
    return [
        d for d in items
        if d.get("heading", "").strip().lower() not in _DOCS_STOP_HEADINGS
        and len(d.get("content", "").strip()) >= 80
    ]
```
applied as `docs_items = _docs_gate(docs_items)` before line 207.
- Do not touch: `get_docs_context` and the `/docs/search` endpoint — the gate is applied to the response, leaving the docs engine free to index whatever it likes
- Edge cases: the 80-character floor applies to content, not heading, so a short but useful heading survives; a missing `heading` or `content` key must not raise; when the gate empties the list the docs header must not be emitted; `MIN_DOCS_CHUNKS` is declared here but only enforceable if the payload exposes a per-library chunk count — if it does not, enforce it where the library is registered and say so rather than leaving a dead constant
- Acceptance: the Flask `Donate`, `Contributing` and bare-Jinja-link chunks measured in the source analysis are no longer injected, and a substantive docs chunk still is
- Verify (local): `python3 -c "import sys; sys.path.insert(0,'hooks'); import prompt_submit as p; print(len(p._docs_gate([{'heading':'Donate','content':'x'*200},{'heading':'Contributing','content':'y'*200},{'heading':'Blueprints','content':'z'*200}])))"` → prints `1`
- Dependencies: Task 16

**Task 18 — Run the memory read-path module gate** `S`
- File: none — verification only
- Reuse: the existing suite plus the four benchmark queries recorded in `### Grounding`
- Do not touch: any source file
- Edge cases: the worker must be restarted before the benchmark queries are re-run, or they will exercise the old code still resident in memory; the benchmark comparison is observational at this point, since no multilingual model is installed on this machine — record the numbers, do not gate on them
- Acceptance: the suite is green, the worker serves `/memory/search` with honest distances and a `source` field, and the four benchmark queries are re-measured and recorded for comparison against the baseline
- Verify (global): `python3 -m pytest tests/ -q` → `157 passed` or more, 0 failed, and a `/memory/search` response for `token optimizer etok` contains more than one distinct distance value and a `source` field on every item (baseline: 5 items, distances `[1.0608, 1.1953, 1.2645, 1.3172, 1.3701]`, no `source` field)
- Dependencies: Task 17

**Task 19 — Make Rollback exception-only in the plan template** `S`
- File: `commands/ec-feature.md`
- Anchor: `- Rollback: {how to undo this task — or "git checkout -- {file}"}` → line 320
- Reuse: the surrounding Per Task Detail template; change one line and add one rule
- Code sample:
```
- Rollback: {only when undoing this task needs more than reverting the file — omit this line entirely otherwise}
```
plus a rule immediately under the template: `**Exception-only fields.** Rollback, Breaking change and Anchor are written ONLY when their value differs from the mechanical default. A Rollback that is just a file revert or delete is derivable from "File:" — omit it.`
- Do not touch: the `Edge cases:`, `Acceptance:`, `Do not touch:` and `Reuse:` template lines — the source analysis measured these as the plan's actual value
- Edge cases: the rule must make clear that omitting the line is correct rather than an oversight, so the `/ec-review` drift check added in Task 29 does not flag its absence
- Acceptance: the template no longer suggests a default Rollback value, and the exception-only rule is stated once in the command
- Verify (local): `grep -ci "exception-only" commands/ec-feature.md` → `>= 1` (baseline 0)
- Dependencies: none

**Task 20 — Make Breaking change exception-only in the plan template** `S`
- File: `commands/ec-feature.md`
- Anchor: `- ⚠️ Breaking change: {description or "none"}` → line 317
- Reuse: the exception-only rule added in Task 19 — reference it, do not restate it
- Code sample:
```
- ⚠️ Breaking change: {what breaks and for whom — omit this line entirely when nothing breaks}
```
- Do not touch: the `### Impact Analysis` section's `⚠️ Breaking change risk:` line, which is a plan-level summary and legitimately says "none"
- Edge cases: the per-task line and the plan-level line must stay textually distinguishable, or the review check in Task 29 cannot tell them apart
- Acceptance: the template no longer offers `"none"` as a per-task value
- Verify (local): `grep -c 'Breaking change: {description or "none"}' commands/ec-feature.md` → `== 0` (baseline 1)
- Dependencies: Task 19

**Task 21 — Make Anchor exception-only in the plan template** `S`
- File: `commands/ec-feature.md`
- Anchor: `- Anchor: {exact existing string the executor must locate, with line number from Grounding — or "new file"}` → line 312
- Reuse: the exception-only rule from Task 19
- Code sample:
```
- Anchor: {exact existing string the executor must locate, with its line number from Grounding — omit this line entirely when the task creates the file}
```
- Do not touch: the `### Grounding` requirement that new files are recorded there as `new file — no anchor`; the grounding record stays explicit even though the per-task line is omitted
- Edge cases: `commands/ec-execute.md:126` injects the `Anchor:` string into the subagent prompt and already handles a missing line ("if the task has no such line, inject nothing and proceed as normal") — confirm that clause still reads correctly now that absence is the normal case for a new file
- Acceptance: the template omits Anchor for new-file tasks while Grounding still records them
- Verify (local): `grep -c 'or "new file"' commands/ec-feature.md` → `== 0` (baseline 1)
- Dependencies: Task 19

**Task 22 — Split Verify into local evidence and global invariants** `M`
- File: `commands/ec-feature.md`
- Anchor: `- Verify: {exact command + expected value, traced to a baseline in ### Grounding}` → line 319
- Reuse: the existing traceability rule in `## Step 2.5` — the split extends it rather than replacing it
- Code sample:
```
  - Verify (local): {a command that FAILS if this task is wrong — a specific grep -c, test -f, or anchor match. Milliseconds. Traced to a baseline in ### Grounding}
  - Verify (global): {omit on most tasks. Only at a module boundary: the whole-project invariant — build, type-check, or test suite}
```
(The two lines above are the template text to insert, shown indented here only so this plan's own module-boundary detection does not mistake Task 22 for a gate. Insert them at the left margin.)
plus a rule: `**Two kinds of verification.** Local evidence proves THIS task did what it claims. A global invariant (build, type-check, test suite) proves a repo-wide property and must NOT be attached to every task — a passing whole-project compile says nothing about the task that triggered it. Place global invariants at module boundaries and let /ec-review run the definitive gate.`
- Do not touch: the traceability rule itself — numeric thresholds must still trace to a measured baseline
- Edge cases: a task whose only honest proof is a compile (a pure type-signature change, say) must still be allowed a global verify — the rule says "must not be attached to every task", not "never"; module-boundary tasks must be identifiable from the plan text alone so `/ec-execute` can find them
- Acceptance: the template distinguishes the two kinds and states where each belongs
- Verify (local): `grep -c "Verify (local)" commands/ec-feature.md` → `>= 1` and `grep -c "Verify (global)" commands/ec-feature.md` → `>= 1` (baseline 0 and 0)
- Dependencies: Task 21

**Task 23 — Require honest Dependencies in ec-feature** `M`
- File: `commands/ec-feature.md`
- Anchor: `- Dependencies: {other tasks, or "none"}` → line 321
- Reuse: the existing self-review checklist item "Dependencies are correctly ordered" — tighten it rather than adding a parallel rule
- Code sample:
```
- Dependencies: {ONLY the tasks whose output this task genuinely requires — "none" is the common and correct answer. Never write "Task N-1" merely because it precedes this one}
```
plus a rule: `**Honest dependencies.** A dependency means this task cannot start until that task's output exists. A straight 1→2→3→…→N chain is almost always fabricated, and /ec-execute now reads this field to fuse and order work — a false edge costs real time.`
- Do not touch: the flat-format rules — honest dependencies are recorded in a field, never as grouping or phase headers in the task list
- Edge cases: a genuinely sequential plan will legitimately produce a chain, so the rule must forbid fabricating edges rather than forbidding chains; an empty value must be valid and must not trip the self-review checklist
- Acceptance: the template states that "none" is the common answer and explains that the field is now consumed
- Verify (local): `grep -c "Honest dependencies" commands/ec-feature.md` → `== 1` (baseline 0)
- Dependencies: Task 22

**Task 24 — Update the ec-feature self-review checklist** `S`
- File: `commands/ec-feature.md`
- Anchor: `## Step 4 — Self-Review Before Presenting` → line 349
- Reuse: the existing checklist format — add items in the same `- [ ]` style
- Code sample:
```
  - [ ] No task carries a mechanical Rollback, a "none" Breaking change, or a "new file" Anchor — those lines are omitted
  - [ ] Every task has a Verify (local) that fails if the task is wrong
  - [ ] Global invariants appear only at module boundaries, not on every task
  - [ ] Dependencies name only genuine prerequisites — no fabricated Task N-1 chain
```
(The four checklist items above are the template text to insert, shown indented here only so this plan's own `- [ ]` task counter does not read them as pending tasks. Insert them at the left margin.)
- Do not touch: the existing checklist items, including the design-related ones — this feature has no UI scope but the checklist serves every future feature
- Edge cases: the new items must not contradict Task 22's allowance for a task whose only honest proof is a global invariant
- Acceptance: the checklist enforces all four new template rules
- Verify (local): `grep -c "fails if the task is wrong" commands/ec-feature.md` → `== 1` (baseline 0)
- Dependencies: Task 23

**Task 25 — Switch ec-execute to ranged plan reads** `M`
- File: `commands/ec-execute.md`
- Anchor: `- \`{PLAN_FILE}\` — the plan to execute` → line 44
- Reuse: the existing Resume check at line 58, which already counts `- [x]` / `- [ ]` lines and therefore only needs the checklist, not the whole plan
- Code sample:
```
- `{PLAN_FILE}` — read the header sections (`### Impact Analysis` through `### Grounding`) and the `### Tasks` checklist ONLY. Do not read `### Per Task Detail` in full.
  Then, per task, read just that task's block: locate its start with a grep for the task's own `**Task {N} —` heading, take the next such heading as the end (or end-of-file for the last task), and read only that range.
```
- Do not touch: the Resume check's counting logic — it works on the checklist, which is still read in full
- Edge cases: the last task's block ends at end-of-file where there is no following heading — the range must fall back to the end of the file; a plan whose Per Task Detail is out of numeric order must still resolve, so locate by the task's own heading rather than by offset; the header read must include `### Grounding`, because Verify thresholds trace to it
- Acceptance: executing a task reads its own block rather than the entire plan
- Verify (local): `grep -c "Do not read \`### Per Task Detail\` in full" commands/ec-execute.md` → `== 1` (baseline 0)
- Dependencies: Task 24

**Task 26 — Consume Dependencies and fuse co-located tasks in ec-execute** `L`
- File: `commands/ec-execute.md`
- Anchor: `Read all tasks from \`{PLAN_FILE}\`. Find all lines matching \`- [ ]\`.` → line 100
- Reuse: the existing sequential loop and its `- [x]` marking step — fusion changes what one iteration covers, not how completion is recorded
- Code sample:
```
### Execution units
Before the loop, build execution units from the task list:
1. Read each pending task's `File:` and `Dependencies:` lines (ranged read, per Step 1).
2. Fuse CONSECUTIVE pending tasks that share the same `File:` into one unit, stopping a fusion at:
   - a task with a `Dependencies:` edge pointing outside the run of fused tasks
   - a task whose name contains `GATE`
   - a task carrying a `Verify (global)` line
3. Execute units in dependency order. Within a unit: open the file once, apply every task's change, then run each task's `Verify (local)`.
4. Mark `- [x]` for each task in the unit individually, only after its own local verify passes.
```
- Do not touch: the `### Evidence Rule` at line 165 and the threshold-mismatch stop at line 174 — every fused task still proves itself individually, so a unit cannot hide a failed task
- Edge cases: a unit whose middle task fails must leave the earlier tasks marked `[x]` and the rest `[ ]` so resume works; fusion must never cross a GATE task, since gates exist to stop work before cost is spent; a task with no `File:` line cannot be fused; two tasks sharing a file but separated by a task on another file are not consecutive and must not be fused
- Acceptance: a plan with three consecutive tasks on one file executes as a single unit with one file open and three individual local verifies
- Verify (local): `grep -c "Fuse CONSECUTIVE" commands/ec-execute.md` → `== 1` and `grep -ci "co-location\|co-located" commands/ec-execute.md` → `>= 1` (baseline 0)
- ⚠️ Breaking change: `/ec-execute` no longer spawns exactly one subagent per task, so progress appears in bursts. The `- [x]` count still advances per task, which is what the auto-flow driver's progress signal in `hooks/session_stop.py` reads
- Dependencies: Task 25

**Task 27 — Stop passing memory snippets into every subagent** `S`
- File: `commands/ec-execute.md`
- Anchor: `  Pass relevant snippets into each subagent's context.` → line 55
- Reuse: nothing — this is a deletion plus a one-line replacement
- Code sample:
```
  Use these for your own orientation only. Do NOT forward memory or docs snippets into subagent prompts — the relevance floor in hooks/prompt_submit.py already decides what is worth injecting, and re-injecting per task multiplies any residual noise by the task count.
```
Also remove `relevant memory/docs snippets` from the Step 3 spawn description at line 105 and the two bullets at lines 134-135.
- Do not touch: the `### Agent Context Injection` and `### Design Block Injection` blocks — those inject task-specific material already known to be relevant, which is a different thing
- Edge cases: lines 134-135 list memory and docs snippets as subagent prompt contents and must be removed too, or the command contradicts itself; the worker-online status line at 52 stays, since knowing the worker is up is still useful
- Acceptance: no instruction anywhere in `ec-execute.md` forwards memory or docs snippets into a subagent prompt
- Verify (local): `grep -c "Pass relevant snippets into each subagent" commands/ec-execute.md` → `== 0` (baseline 1) and `grep -ci "relevant memory snippets\|memory/docs snippets" commands/ec-execute.md` → `== 0`
- Dependencies: Task 26

**Task 28 — Run global invariants at module boundaries in ec-execute** `M`
- File: `commands/ec-execute.md`
- Anchor: `3. Subagent MUST run the verify step and confirm actual output before claiming done` → line 106
- Reuse: the Evidence Rule's existing insistence on real command output — this task changes which commands run when, not the evidence standard
- Code sample:
```
3. Each task's `Verify (local)` MUST be run and its real output confirmed before the task is marked done.
4. A task carrying a `Verify (global)` line is a module boundary: run the global invariant after that task's unit completes. If it fails, STOP — do not continue to the next unit.
5. Never substitute a global invariant for a missing local verify. "The project still compiles" is not evidence that this task is correct.
```
- Do not touch: the threshold-mismatch stop at line 174 — it already forbids editing content to satisfy a number and must keep applying to local verifies
- Edge cases: a plan written before this change has no `Verify (global)` lines at all, so every verify is treated as local — that must not break execution, and the final `/ec-review` gate still catches a broken build; a global invariant failing at a boundary must stop the run rather than roll back completed tasks
- Acceptance: global invariants run at boundaries and a boundary failure halts the run
- Verify (local): `grep -c "is not evidence that this task is correct" commands/ec-execute.md` → `== 1` (baseline 0)
- Dependencies: Task 27

**Task 29 — Enforce exception-only fields in the ec-review drift check** `M`
- File: `commands/ec-review.md`
- Anchor: `## Stage 1.5 — Template Drift Check` → line 91
- Reuse: the existing Stage 1.5 structure, which already reads a command file and reports drift — add a plan-lint subsection rather than a new stage
- Code sample:
```
### Plan lint — exception-only fields
Read the plan that was executed (or its archived copy) and flag:
- any `Rollback:` line that is merely a revert or delete of that task's own `File:`
- any per-task `⚠️ Breaking change:` line whose value is `none`
- any `Anchor:` line reading `new file`
- any `Dependencies:` values forming a straight `Task N-1` chain across more than 3 consecutive tasks
Report each as template drift with the task number. These fields are exception-only; their presence with a default value IS the defect.
```
- Do not touch: the GIT RULES drift check in the same stage — it is unrelated and must keep working
- Edge cases: the plan may already be archived by the time review runs, so the check must look in `.claude/plans/archive/` as well; the plan-level `⚠️ Breaking change risk:` line in `### Impact Analysis` legitimately says "none" and must not be flagged; a 3-task plan with a genuine chain must not be flagged, which is why the threshold is "more than 3 consecutive"
- Acceptance: a plan seeded with a mechanical Rollback line is reported as drift, and a plan without those fields passes clean
- Verify (local): `grep -ci "exception-only" commands/ec-review.md` → `>= 1` (baseline 0)
- Dependencies: Task 28

**Task 30 — Add the definitive compile gate and evidence audit to ec-review** `M`
- File: `commands/ec-review.md`
- Anchor: `## Step 2 — Testing` → line 166
- Reuse: the existing Step 2 testing section — the gate belongs with it rather than in a new step
- Code sample:
```
### Definitive global gate
Run every global invariant for this project ONCE, here, and record the real output:
- the build (`cargo build`, `npm run build`, or the project's equivalent)
- the type-check (`tsc --noEmit`, `mypy`, or equivalent)
- the full test suite
Execution no longer runs these per task, so this is the authoritative gate. A failure here is a review failure.

### Evidence audit
For each `- [x]` task in the plan, confirm its `Verify (local)` evidence was actually produced:
- re-run the local verify and compare against the plan's stated expectation
- flag any task marked done whose local verify now fails, or whose threshold was never measurable
This closes the failure mode where a subagent invents output to clear a threshold.
```
- Do not touch: Stage 1 and Stage 2 review content — the gate is additive
- Edge cases: re-running every local verify may be slow on a large plan — cap it by sampling when the plan exceeds 40 tasks, and say so in the command; a project with no build or type-check step must skip those cleanly rather than report a failure; a local verify that was correct at execution time but invalidated by a later task's change must be reported as a plan-ordering defect, not a fabrication
- Acceptance: review runs the global invariants once and audits every completed task's local evidence
- Verify (local): `grep -ci "evidence audit" commands/ec-review.md` → `>= 1` (baseline 0)
- Dependencies: Task 29

**Task 31 — Add a scope boundary check to ec-review** `S`
- File: `commands/ec-review.md`
- Anchor: the `### Definitive global gate` heading added in Task 30 — place this check immediately after it
- Reuse: the plan's `File:` lines as the authoritative scope list
- Code sample:
```
### Scope boundary
Collect every `File:` value in the plan. Then run `git status --short` and confirm every changed path appears in that list. Report any path that does not as an out-of-scope change, naming the task that should have declared it.
```
- Do not touch: the GIT RULES — this check only reads git state; it must never stage, commit or revert anything
- Edge cases: `.claude/` artefacts (the plan, review docs, the archived plan) are written by the workflow itself and must be excluded from the comparison; generated paths such as `token-optimizer/target/` must be excluded via gitignore rather than flagged; a plan that legitimately deletes a file still shows it in `git status`, so match on path, not on change type
- Acceptance: a change to a file absent from every `File:` line is reported, while workflow artefacts are not
- Verify (local): `grep -c "Scope boundary" commands/ec-review.md` → `== 1` (baseline 0)
- Dependencies: Task 30

**Task 32 — Fix git status staged/unstaged classification** `M`
- File: `token-optimizer/src/filters/git.rs`
- Anchor: `} else if trimmed.starts_with("modified:") || trimmed.starts_with("deleted:") {` → line 29 (the unreachable branch)
- Reuse: the existing `staged` / `unstaged` / `untracked` vectors and the output builder at lines 39-61 — only the classification changes
- Code sample:
```rust
enum Section { None, Staged, Unstaged, Untracked }
let mut section = Section::None;
// ...
} else if line.starts_with("Changes to be committed:") {
    section = Section::Staged;
} else if line.starts_with("Changes not staged for commit:") {
    section = Section::Unstaged;
} else if line.starts_with("Untracked files:") {
    section = Section::Untracked;
} else if line.starts_with('\t') {
    let trimmed = line.trim();
    match section {
        Section::Staged => staged.push(truncate_line(trimmed, 120)),
        Section::Unstaged => unstaged.push(truncate_line(trimmed, 120)),
        _ => untracked.push(truncate_line(trimmed, 80)),
    }
}
```
- Do not touch: the `nothing to commit` early return at line 34 and the `header` capture at line 23 — both already behave correctly
- Edge cases: `Unmerged paths:` is a fourth section whose entries must not be silently classified as untracked — handle it explicitly and record the choice; git's hint lines between a section header and its entries start with two spaces rather than a tab, so they must not be captured as entries; `git status --short` emits no section headers at all, so that form must fall through to the lossy-safety fallback rather than be misclassified
- Acceptance: on a repo with both staged and unstaged modifications, the filter reports each under the correct heading
- Verify (local): `grep -c "Changes to be committed" token-optimizer/src/filters/git.rs` → `== 1` (baseline 0)
- ⚠️ Breaking change: output for the same input changes — files previously mislabelled "Staged" now appear under "Unstaged". That is the fix; any consumer that trusted the old labels was being misled
- Dependencies: none

**Task 33 — Support --oneline in the git log filter** `M`
- File: `token-optimizer/src/filters/git.rs`
- Anchor: `if line.starts_with("commit ") {` → line 75
- Reuse: the existing 20-commit truncation and `... (n more commits)` suffix at lines 87-94 — it applies to both formats
- Code sample:
```rust
fn is_oneline(line: &str) -> bool {
    let mut parts = line.splitn(2, ' ');
    match (parts.next(), parts.next()) {
        (Some(sha), Some(rest)) => {
            (7..=40).contains(&sha.len())
                && sha.chars().all(|c| c.is_ascii_hexdigit())
                && !rest.trim().is_empty()
        }
        _ => false,
    }
}
```
`log()` detects the format from the first non-empty line and dispatches either to a oneline path that keeps each line as-is (truncated) or to the existing verbose path.
- Do not touch: `format_commit` at line 97 — the verbose path must keep working exactly as it does now
- Edge cases: `--oneline --graph` prefixes lines with `*`, `|` and `/`, which are not hex, so graph output must reach the lossy-safety fallback rather than be dropped; a verbose log whose subject begins with a hex-looking word must not be misread as oneline, so detect on the first line only; `--oneline` with decorations such as `(HEAD -> main)` must survive
- Acceptance: `git log --oneline -40` through the filter preserves its commits instead of collapsing to an 8-byte empty table
- Verify (local): `git log --oneline -40 | ~/.efficlaude/bin/etok git log | wc -c` → `> 8` (baseline: 8 bytes, per the source analysis)
- Dependencies: Task 32

**Task 34 — Apply the lossy-safety rule to the git filters** `S`
- File: `token-optimizer/src/filters/git.rs`
- Anchor: `fn log(input: &str) -> String {` → line 70
- Reuse: `super::generic::process` at line 12 is already the unrecognised-input path; the new guard returns the input itself where even generic compression would lose structure
- Code sample:
```rust
// At the end of log(): if nothing was recognised, hand back the input untouched.
if commits.is_empty() {
    return input.to_string();
}
```
and the same guard in `status()` where `out.is_empty()` currently calls `generic::process`.
- Do not touch: `diff()`, `branch()` and `stash_list()` beyond adding the same guard where they can produce near-empty output from non-empty input
- Edge cases: genuinely empty input must return empty rather than be treated as a parse failure; a filter that recognises some structure should keep its compressed output rather than falling back wholesale; the rule is about losing structure, not about a low compression ratio
- Acceptance: any git filter given input it cannot parse returns that input unchanged rather than a near-empty result
- Verify (local): `printf 'not git output at all\nsecond line\n' | ~/.efficlaude/bin/etok git log | wc -l` → `== 2`
- Dependencies: Task 33

**Task 35 — Keep the artefact path in the cargo build filter** `M`
- File: `token-optimizer/src/filters/cargo.rs`
- Anchor: `if trimmed.starts_with("error") || trimmed.starts_with("warning") || trimmed.starts_with("Compiling") || trimmed.starts_with("Finished") || trimmed.starts_with("Blocking") {` → line 54
- Reuse: the existing warning-grouping logic at lines 62-67 — extend the dedup to cover repeated `Finished` blocks
- Code sample:
```rust
let lines: Vec<&str> = input.lines().collect();
for (i, line) in lines.iter().enumerate() {
    let trimmed = line.trim();
    let keep = trimmed.starts_with("error") || trimmed.starts_with("warning")
        || trimmed.starts_with("Compiling") || trimmed.starts_with("Finished")
        || trimmed.starts_with("Blocking");
    if keep {
        out.push(truncate_line(trimmed, 120));
        // A "Finished ... at:" line is followed by the artefact path — the only
        // thing a build's output is actually wanted for.
        if trimmed.ends_with("at:") {
            if let Some(next) = lines.get(i + 1) {
                if !next.trim().is_empty() {
                    out.push(next.trim().to_string());
                }
            }
        }
    }
}
```
plus a consecutive-duplicate dedup before joining.
- Do not touch: `test()` — it has its own failure-capture logic and is not implicated
- Edge cases: the path line must NOT be truncated, since a truncated path is useless — that is why it is pushed whole; multiple bundles each produce their own `Finished ... at:` plus path pair and all must survive; the ordinary `Finished dev [unoptimized] target(s)` line does not end in `at:` and must not pull in the following line
- Acceptance: a tauri build's `Finished 1 bundle at:` lines each retain their artefact path, and repeated identical pairs appear once
- Verify (local): `printf 'Finished 1 bundle at:\n    /tmp/app.dmg\n' | ~/.efficlaude/bin/etok cargo build | grep -c "app.dmg"` → `== 1` (baseline 0 — the path is currently dropped)
- Dependencies: Task 34

**Task 36 — Remove the helper dependency from the shell wrappers** `M`
- File: `shell/effi-shell.sh`
- Anchor: `_etok_available() {` → line 6
- Reuse: the `ETOK` variable at line 4; the six wrapper bodies keep their structure
- Code sample:
```bash
# Inlined on purpose: a helper function does not survive every shell-snapshot
# mechanism, and a wrapper calling a missing helper breaks the real command.
git() {
  local sub="${1:-}"
  if [ -x "${ETOK:-}" ]; then
    case "$sub" in
      ...
    esac
  fi
  command git "$@"
}
```
Replace all six `_etok_available` call sites (lines 13, 27, 41, 55, 69, 83) with `[ -x "${ETOK:-}" ]` and delete the helper definition.
- Do not touch: the `command <name> "$@"` fallthrough at the end of each wrapper — it is what keeps the real command working when etok is absent
- Edge cases: `ETOK` itself may be unset if only the wrapper function survived the snapshot, which is why the test uses `${ETOK:-}`; `-x` is false for a missing or non-executable file, giving exactly the desired fallthrough; the wrappers must stay correct under both bash and zsh, since `install.sh:206` appends the source line to both `.zshrc` and `.bashrc`; confirm with a repo-wide grep that nothing outside this file calls `_etok_available` before deleting it
- Acceptance: every wrapper works in a shell where only the wrapper function is defined, and no invocation can emit `command not found`
- Verify (local): `grep -c "_etok_available" shell/effi-shell.sh` → `== 0` (baseline 7) and sourcing the file in a shell with the helper undefined then running `git status` emits no `command not found` (baseline: every git call in this session emits `git:2: command not found: _etok_available`)
- ⚠️ Breaking change: `_etok_available` is removed. It is private to this file; confirm with a repo-wide grep before deleting
- **Separate pre-existing defect found here and deliberately NOT fixed (would widen the edit).** All six wrappers end their optimized path with `return "${PIPESTATUS[0]}"`. `PIPESTATUS` is **bash-only** — zsh populates lowercase `$pipestatus` instead — and `install.sh:206` appends the source line to `.zshrc` as well as `.bashrc`. So under zsh, on the optimized path, the exit status of the real command does not propagate: a failing `cargo build` piped through etok can report success. That is arguably more dangerous than the helper bug this task fixes, because it corrupts an exit code a caller may branch on. Confirmed present: 6 occurrences. It needs its own task
- **Note on observing the fix.** A shell that already snapshotted the old wrapper keeps emitting `git:2: command not found: _etok_available` for its remaining lifetime — including this session's own shell. That is the stale snapshot, not the file on disk; shells started after this change are clean, which is what the bash/zsh proofs demonstrate
- Dependencies: Task 35

**Task 37 — Add Rust tests for the git and cargo filters** `L`
- File: `token-optimizer/src/filters/git.rs` and `token-optimizer/src/filters/cargo.rs` (inline `#[cfg(test)] mod tests`)
- Reuse: nothing — the crate has no tests yet (`grep -c "mod tests"` → 0, and `token-optimizer/tests/` does not exist). Inline test modules are required because the crate is a binary with no lib target, so integration tests under `tests/` would not link
- Code sample:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_status_separates_staged_from_unstaged() {
        let input = "On branch main\nChanges to be committed:\n\tnew file:   a.txt\nChanges not staged for commit:\n\tmodified:   b.txt\n";
        let out = status(input);
        assert!(out.contains("Staged (1)"), "{out}");
        assert!(out.contains("Unstaged (1)"), "{out}");
    }

    #[test]
    fn git_log_oneline_preserves_commits() {
        let input = (0..40).map(|i| format!("abc123{i:x} subject {i}")).collect::<Vec<_>>().join("\n");
        let out = log(&input);
        assert!(out.len() > 8, "{out}");
        assert!(out.contains("subject 0"), "{out}");
    }

    #[test]
    fn git_log_returns_input_when_unparseable() {
        let input = "not git output at all\nsecond line";
        assert_eq!(log(input), input);
    }

    #[test]
    fn cargo_build_keeps_artifact_path() {
        let out = build("Finished 1 bundle at:\n    /tmp/app.dmg\n");
        assert!(out.contains("/tmp/app.dmg"), "{out}");
    }
}
```
- Do not touch: the filters' public behaviour — tests encode the new contract and must not be relaxed to match a buggy implementation
- Edge cases: the 20-commit truncation means a 40-commit oneline input is expected to end with `... (20 more commits)`, so assert the surviving-information property rather than an exact byte count; `status()`, `log()` and `build()` are private, so the test modules must live in the same files to reach them
- Acceptance: tests cover both D10-A and D10-B, the oneline format, the lossy-safety rule and the cargo path retention, and all pass
- Verify (local): `cd token-optimizer && cargo test --quiet 2>&1 | tail -3` → reports 4 or more tests passing, 0 failed (baseline: no tests exist)
- Dependencies: Task 36

**Task 38 — Run the etok module gate** `S`
- File: none — verification only
- Reuse: the crate's own build and test commands
- Do not touch: any source file
- Edge cases: `cargo` may be missing from a non-interactive shell's PATH — `install.sh:166` already sources the cargo env for this reason; if cargo is genuinely unavailable, report that the gate could not run rather than reporting success
- Acceptance: the crate builds clean and its tests pass, and the rebuilt binary is the one the shell wrappers will use
- Verify (global): `cd token-optimizer && cargo build --release --quiet && cargo test --quiet 2>&1 | tail -3` → build exits 0 and tests report 0 failed
- Dependencies: Task 37

**Task 39 — Remove legacy non-prefixed commands in install.sh** `M`
- File: `install.sh`
- Anchor: `for cmd in "${COMMANDS[@]}"; do` → line 69
- Reuse: the `COMMANDS` array at line 14 and the surrounding echo style
- Code sample:
```bash
LEGACY_COMMANDS=("setup" "feature" "brainstorm" "execute" "review" "git" "design")
for cmd in "${LEGACY_COMMANDS[@]}"; do
  LEGACY_FILE="${COMMANDS_DIR:?}/${cmd:?}.md"
  if [ -f "$LEGACY_FILE" ]; then
    rm -f "$LEGACY_FILE"
    echo "  ✓ removed legacy /$cmd (superseded by /ec-$cmd)"
  fi
done
```
placed after the install loop. The `:?` guards are deliberate: they make the shell abort rather than expand to a top-level path if either variable is empty.
- Do not touch: any `ec-` prefixed command file, and any file in `$COMMANDS_DIR` not named in `LEGACY_COMMANDS` — a user's own commands must never be deleted
- Edge cases: `ec-design.md` exists in `~/.claude/commands/` but is absent from the `COMMANDS` array, so it is itself drift — decide explicitly whether it is installed or removed and record which, rather than leaving it unmanaged; the removal must be idempotent; a user who deliberately wrote their own `review.md` would lose it, so the list must stay exactly these seven names and the echo must say what happened
- Acceptance: a fresh install leaves only `ec-` prefixed EffiClaude commands, and re-running the installer is a no-op
- Verify (local): `grep -c "LEGACY_COMMANDS" install.sh` → `== 2` (baseline 0: one definition, one loop reference)
- ⚠️ Breaking change: deletes files from `~/.claude/commands/`. Scope is limited to the seven exact legacy names EffiClaude itself shipped
- Dependencies: Task 38

**Task 40 — Add Python tests for the hook changes** `L`
- File: `tests/test_hooks.py`
- Anchor: `sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'hooks'))` → line 9 (confirms the harness; append the new tests at end of file)
- Reuse: the module-level `sys.path` insert at line 9 and the established per-test style — `from <module> import <name>` inside the test body plus a one-line docstring. 467 lines of precedent; do not invent a new harness
- Code sample:
```python
def test_has_signal_rejects_fast_readonly_bash():
    """A successful read-only probe carries no evidence worth storing."""
    from post_tool_use import _has_signal
    assert _has_signal("Bash", {"command": "curl -s localhost:37777/health"}, {"exit_code": 0}) is False


def test_has_signal_accepts_edit_outside_claude_dir():
    """An edit to a real source file is always signal."""
    from post_tool_use import _has_signal
    assert _has_signal("Write", {"file_path": "server/memory.py"}, {}) is True


def test_has_signal_accepts_failing_command():
    """A failing probe is informative even when it is read-only."""
    from post_tool_use import _has_signal
    assert _has_signal("Bash", {"command": "ls /nope"}, {"exit_code": 2}) is True


def test_record_reject_counts_by_reason(tmp_path, monkeypatch):
    """Rejections are counted so the reject rate stays observable."""
    import post_tool_use
    monkeypatch.setattr(post_tool_use, "REJECT_FILE", tmp_path / "rejects.json")
    post_tool_use._record_reject("no_signal", "Bash")
    post_tool_use._record_reject("no_signal", "Bash")
    assert json.loads((tmp_path / "rejects.json").read_text())["no_signal:Bash"] == 2


def test_relevance_floor_rejects_uniform_distances():
    """Identical distances carry no ranking information — inject nothing."""
    from prompt_submit import _relevance_floor
    assert _relevance_floor([{"distance": 0.5}] * 5) == []


def test_docs_gate_drops_boilerplate_headings():
    """Flask's Donate section must never reach a prompt again."""
    from prompt_submit import _docs_gate
    items = [{"heading": "Donate", "content": "x" * 200},
             {"heading": "Blueprints", "content": "z" * 200}]
    assert len(_docs_gate(items)) == 1
```
- Do not touch: existing tests — the hook changes must not require relaxing any current assertion; a failure there is a real regression to fix in the task that caused it
- Edge cases: no test may depend on a running worker or on the real `~/.efficlaude/` directory — `REJECT_FILE` is resolved at import time from `Path.home()`, so the counter test MUST monkeypatch the module attribute (patching `Path.home` after import would be too late) or it will write into the user's real state; `post_tool_use` and `prompt_submit` are separate modules imported separately; `json` is already imported at line 3 of this file
- Acceptance: the new tests cover the signal gate (accept and reject), the reject counter, the relevance floor and the docs gate, and the whole suite stays green
- Verify (local): `python3 -m pytest tests/test_hooks.py -q 2>&1 | tail -2` → more tests than the current count, 0 failed
- **Dependencies CORRECTED mid-execution: Tasks 4, 5, 6 (write side) AND 16, 17 (read side).** The plan originally wrote `Dependencies: Task 39`, which was a fabricated edge — but in removing it I declared only 4/5/6 and **omitted two genuine edges**. The four read-side tests import `_relevance_floor` and `_docs_gate` from `hooks/prompt_submit.py`, which Tasks 16 and 17 create; attempting them before those land fails at `ImportError`. The write-side half (12 tests, 57 → 69 passed, mutation-verified) completed independently. This is the mirror image of the Task 39/40/42 defect: the first error was asserting edges that did not exist, the second was missing edges that did. Both come from writing the dependency field from narrative order instead of from what each task actually consumes — exactly what Task 23's rule now forbids
- Dependencies: Tasks 4, 5, 6, 16, 17

**Task 41 — Add Python tests for the memory changes** `L`
- File: `tests/test_memory.py` — **existing file, 111 lines, 10 tests. APPEND ONLY. Do not create or overwrite it.**
- Anchor: `def test_fts_search_survives_punctuation(db_path, chroma_path):` → line 108 (the current last test; append after it)
- Reuse: the `db_path` and `chroma_path` fixtures from `tests/conftest.py:8,13` — already `tmp_path`-based, so no new fixture is needed; `from memory import MemoryEngine` at line 4 already works via conftest's path insert; `import sqlite3` at line 1 is already present
- Code sample:
```python
def test_dedup_increments_seen_count(db_path, chroma_path):
    """Identical content collapses to one row with a frequency count."""
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "tool_use", "same content")
    engine.save_observation("proj", "tool_use", "same  content")   # whitespace-normalised duplicate
    with sqlite3.connect(db_path) as conn:
        row = conn.execute("SELECT COUNT(*), MAX(seen_count) FROM observations").fetchone()
    assert row == (1, 2)


def test_bm25_to_distance_is_monotonic():
    """A better BM25 rank must map to a lower distance."""
    import memory as memory_mod
    assert memory_mod._bm25_to_distance(-5.0) < memory_mod._bm25_to_distance(-1.0)
    assert memory_mod._bm25_to_distance(None) == 1.0


def test_rrf_prefers_item_ranked_by_both_paths():
    """Fusion rewards agreement between the lexical and vector paths."""
    import memory as memory_mod
    a = [{"content": "x", "distance": 0.2}, {"content": "y", "distance": 0.3}]
    b = [{"content": "y", "distance": 0.1}]
    assert [i["content"] for i in memory_mod._rrf(a, b, 2)] == ["y", "x"]


def test_search_results_carry_source(db_path, chroma_path):
    """Every retrieval result declares which path produced it."""
    engine = MemoryEngine(db_path, chroma_path)
    engine.save_observation("proj", "obs", "ChromaDB stores embeddings")
    assert all(r.get("source") in {"fts", "vector"} for r in engine.search("proj", "embeddings"))


def test_migration_adds_dedup_columns(db_path, chroma_path):
    """A v1 database gains content_hash and seen_count on open."""
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE observations "
            "(id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT, type TEXT, "
            "content TEXT, metadata TEXT, created_at TEXT)"
        )
        conn.commit()
    MemoryEngine(db_path, chroma_path)
    with sqlite3.connect(db_path) as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(observations)")}
    assert {"content_hash", "seen_count"} <= cols
```
- Do not touch: the 10 existing tests, and the real `~/.efficlaude/efficlaude.db` — every test uses the `db_path`/`chroma_path` fixtures
- Edge cases: constructing a `MemoryEngine` instantiates ChromaDB, which is slow and writes to disk — reuse the fixtures rather than adding more engine-constructing tests than listed; `_rrf` and `_bm25_to_distance` are pure and must be tested without an engine, which is why they import the module rather than take a fixture; the migration test deliberately hand-builds the v1 column set, mirroring `test_reconcile_chromadb_fills_missing` at line 41, and proves the ALTER path rather than the CREATE path
- Acceptance: the file has 15 tests (10 existing, 5 added), covering dedup, the BM25 distance mapping, source tagging, RRF ordering and the v1→v2 migration, and all pass
- Verify (local): `python3 -m pytest tests/test_memory.py -q 2>&1 | tail -2` → `15 passed`, 0 failed (baseline: 10 tests in this file)
- Dependencies: Task 40

**Task 42 — Add command-doc tests for the template changes** `M`
- File: `tests/test_command_docs.py`
- Anchor: the end of the existing module — append in its established style (353 lines of precedent)
- Reuse: the file's existing pattern of reading `commands/*.md` and asserting on content, including however it locates the repo root
- Code sample:
```python
def test_feature_template_has_no_default_rollback():
    text = read_command("ec-feature")
    assert 'Breaking change: {description or "none"}' not in text
    assert 'or "new file"' not in text


def test_feature_template_declares_verify_split():
    text = read_command("ec-feature")
    assert "Verify (local)" in text and "Verify (global)" in text


def test_execute_does_not_forward_memory_snippets():
    assert "Pass relevant snippets into each subagent" not in read_command("ec-execute")


def test_execute_uses_ranged_plan_reads():
    assert "Do not read `### Per Task Detail` in full" in read_command("ec-execute")


def test_review_has_evidence_audit_and_scope_boundary():
    text = read_command("ec-review")
    assert "Evidence audit" in text and "Scope boundary" in text
```
- Do not touch: existing tests in this file, including the GIT RULES drift tests
- Edge cases: these tests assert on exact strings and will need updating whenever the wording changes — assert on the distinctive phrase rather than a whole sentence; use the module's existing repo-root resolution rather than assuming the working directory
- Acceptance: the five new tests pass, and each fails if its corresponding template rule is reverted
- Verify (local): `python3 -m pytest tests/test_command_docs.py -q 2>&1 | tail -2` → more tests than the current count, 0 failed
- Dependencies: Task 41

**Task 43 — Sync installed copies and run the final gate** `M`
- File: `~/.claude/commands/ec-feature.md`, `~/.claude/commands/ec-execute.md`, `~/.claude/commands/ec-review.md`, `~/.efficlaude/hooks/post_tool_use.py`, `~/.efficlaude/hooks/prompt_submit.py`, `~/.efficlaude/server/memory.py`, `~/.efficlaude/server/worker.py`, `~/.efficlaude/server/embedder.py`, `~/.efficlaude/server/purge_noise.py`, `~/.efficlaude/shell/effi-shell.sh`, `~/.efficlaude/bin/etok`
- Reuse: `install.sh`'s own copy path — running the local installer is preferable to hand-copying, since it is the mechanism that must keep working
- Code sample:
```bash
bash install.sh            # local install mode is auto-detected via commands/ec-setup.md
bash ~/.efficlaude/server/stop.sh && bash ~/.efficlaude/server/start.sh
```
- Do not touch: the user's `~/.claude/settings.json` hook registrations — they already point at the hook paths and need no change
- Edge cases: the worker must be restarted or it keeps serving the old `memory.py` resident in memory; `install.sh` appends the shell source line only when its marker is absent, so re-running must not duplicate it — confirm; the legacy-command removal from Task 39 runs here for the first time against the real `~/.claude/commands/`, so verify the `ec-` files survive; `install.sh` installs only the files named in its arrays, so confirm `embedder.py` and `purge_noise.py` are added to whichever server-file list it uses or they will not be copied
- Acceptance: installed copies match the repo, the worker serves the new retrieval behaviour, the legacy commands are gone, and every global invariant passes
- **Defect found BY this gate — worker unavailable ~4 minutes on first start after upgrade.** `CHROMA_SCHEMA_VERSION` 2 → 3 re-ran the legacy probe, which found genuine pre-v2 collections the v2 migration had never actually wiped (its marker existed without the wipe having run), so `_migrate_chroma_layout` cleared the store and `_reconcile_chromadb()` re-embedded all 17,458 observations from SQLite. Measured: ~12 minutes of CPU at 387%, ~240 s wall clock, during which Flask never binds and `/health` returns nothing — `_reconcile_chromadb()` runs synchronously in `MemoryEngine.__init__`, which `server/worker.py` executes at module import, before `app.run()`. The plan's edge case said a rebuild "must never run inside a request path"; it does not, but it does block startup with no readiness signal, so any client polling `/health` concludes the worker is dead. **Correct the framing, not just the number:** the wipe itself was legitimate and beneficial — 293 MB → 65 MB and still settling, against a theoretical floor of 17,458 × 384 × 4 B = 26.8 MB, so the old store was carrying ~226 MB of dead weight. This is the −90% disk reduction the source analysis predicted, delivered as a side effect. The defect is purely the silent multi-minute unavailability. Fix belongs in its own task: either bind Flask first and reconcile in a background thread with a `status: "rebuilding"` health response, or emit progress to `efficlaude.log` so the stall is legible. Not fixed here — it is outside this task's declared boundary and the rebuild is one-time per install
- **Live verification after sync (the four benchmark queries, before → after):**
  - `scroll bug transfer list`: `[0.5, 0.5, 0.5, 0.5, 0.5]` → `[0.165, 0.1932, 0.2005, 0.2088, 0.2217]`, all `source: fts`. The D3 fabricated-score case is now genuinely honest, and this became the best-scoring of the four
  - `bagaimana cara kerja memory engine`: `[1.1882, 1.2107, 1.222, 1.246, 1.2788]` → mixed `fts`+`vector` with FTS contributing `0.0985` and `0.1447`. Fusion working: under the old cliff FTS was ignored wholesale because one vector item sat under 1.2, and this Indonesian-language query is exactly where the English-only embedder fails and lexical matching wins
  - `token optimizer etok`: best `1.0608` → `0.6258`
  - `auto-flow sentinel stop hook driver`: output is no longer ordered by distance because RRF orders by `fused_score`, which is expected
  - `/memory/stats` live: `rejects: {"no_signal:Bash": 20}` — the write-side gate is active and has already rejected 20 noise observations
- Verify (global): all four must hold —
  `python3 -m pytest tests/ -q` → 0 failed, count greater than the 157 baseline;
  `cd token-optimizer && cargo test --quiet 2>&1 | tail -2` → 0 failed;
  `ls ~/.claude/commands/ | grep -c -v '^ec-'` → `== 0` (baseline 6);
  `diff -q commands/ec-execute.md ~/.claude/commands/ec-execute.md` and `diff -q server/memory.py ~/.efficlaude/server/memory.py` → both silent
- Dependencies: Task 42
