Run interactive feature planning. Read .claude/project-config.json and CLAUDE.md first.

## Step 0 — Load Context & Memory
Check worker status: `curl -s http://localhost:37777/health`
- If running: show "(worker online ✓ — memory active)" then load recent project memory:
  `curl -s "http://localhost:37777/memory/context?project={project_name}&limit=10"`
  Use memory to understand: what files have been touched recently, past decisions, patterns used. Do not dump raw memory.
- If offline: show "(worker OFFLINE ⚠️ — memory unavailable)" and continue. Read .claude/context/ files for context.

**Setup check (optional):** Check whether any of `.claude/context/stack.md`, `.claude/context/structure.md`, `.claude/context/conventions.md`, or `.claude/context/notes.md` exist and are non-empty.
- If any present: use them for context and proceed normally.
- If none present: show "(no setup found — working from a live scan; run /ec-setup anytime to add project context)", do a quick live scan of the repo for stack/structure, and proceed. Do NOT stop.

**Branch detection:** Run:
```bash
BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')
[ -z "$BRANCH" ] && BRANCH="default"
PLAN_FILE=".claude/plans/${BRANCH}.md"
DECISION_FILE=".claude/decisions/${BRANCH}.md"
```
Note: "(branch: {BRANCH} → plan: {PLAN_FILE})"

**Auto-Flow check:** Detect whether this run is part of an auto-flow chain:
```bash
AUTOFLOW=".claude/.autoflow"
AUTO="no"
if [ -f "$AUTOFLOW" ]; then
  MTIME=$(stat -f %m "$AUTOFLOW" 2>/dev/null || stat -c %Y "$AUTOFLOW" 2>/dev/null || echo 0)
  AGE=$(( $(date +%s) - MTIME ))
  SENT_BRANCH=$(grep '^branch=' "$AUTOFLOW" 2>/dev/null | cut -d= -f2)
  if [ "$AGE" -gt 7200 ] || [ "$SENT_BRANCH" != "$BRANCH" ]; then rm -f "$AUTOFLOW"; else AUTO="yes"; fi
fi
```
When `AUTO=yes`: auto-skip every confirmation gate. Do NOT delete the sentinel here — it is consumed/removed by `/ec-review`.

**Incomplete plan guard:** Before proceeding, check if `{PLAN_FILE}` exists.
If it exists, count lines matching `- [ ]`.
If count > 0:
  If `AUTO=yes`: skip the prompt — archive (see "Archive before overwrite" below) and overwrite automatically, then continue.
  Show: "⚠️ {PLAN_FILE} has {n} incomplete task(s). Overwrite and start fresh? (y/n):"
  If n: Stop — "Run /ec-execute to finish the current plan, or manually delete {PLAN_FILE}."
  If y: continue normally — plan will be overwritten at Step 3.

**Archive before overwrite:** If `{PLAN_FILE}` already exists, archive it before it is overwritten (runs for both the `If y` path above and the no-incomplete-tasks overwrite at Step 3):
```bash
if [ -f "$PLAN_FILE" ]; then
  mkdir -p .claude/plans/archive
  SLUG=$(grep -m1 '^## Feature:' "$PLAN_FILE" | sed 's/^## Feature: *//' | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-' | cut -c1-40)
  [ -z "$SLUG" ] && SLUG="plan"
  cp "$PLAN_FILE" ".claude/plans/archive/${BRANCH}-$(date +%Y-%m-%d-%H%M)-${SLUG}.md"
  echo "(archived previous plan → .claude/plans/archive/${BRANCH}-$(date +%Y-%m-%d-%H%M)-${SLUG}.md)"
fi
```
This write targets `.claude/plans/` — permitted by the No-Code Rule.

**Check for brainstorm decision:** If `{DECISION_FILE}` exists, read it silently.
- Look for `_Created: {YYYY-MM-DD}_` on the last non-empty line. If found, parse the date.
  - If older than 7 days:
    Show: "({DECISION_FILE} found but expired — created {n} days ago: \"{title_from_first_heading_or_filename}\")"
    Ask: "Use it anyway? (y/n):"
    - If y: proceed normally using this decision — treat as if within 7 days
    - If n: delete `{DECISION_FILE}`, then proceed to saved brainstorms check
  - If within 7 days, or date line absent: proceed normally.
- Pre-fill the feature description from the decision's "Chosen Approach" section
- If the decision file contains a `## Design Contract` section, load it verbatim as the starting Design Contract — do not re-ask question 2 unless its Source line reads "none supplied"
- If the decision file contains a `## Design Direction` section, load it verbatim as the starting Design Direction and skip question 2 entirely — the user already declined a reference at brainstorm time. A plan carries a Design Contract or a Design Direction, never both.
- Skip asking about approach — user already decided
- Note: "({DECISION_FILE} loaded — using chosen approach from brainstorm)"
- Do NOT delete `{DECISION_FILE}` here — it will be deleted by `/ec-review` after a clean review
- Parse `## Proof Mode` from the decision. If the section is absent, or names no mode, treat it as `handoff`.
  Note: "(proof mode: {MODE})". `PROOF_MODE` governs Step 2.5, the task template, and the Handoff block below.
  Whichever path supplied it, STAMP the resolved mode into the plan file as a `Proof mode: {MODE}` line directly
  under `## Feature:` (Step 3). The plan file is the only artifact all four commands read, that survives both
  decision-file deletion paths, and that is archived with the cycle — so it, not the decision, is the mode's
  system of record downstream.

**Check for saved brainstorms:** If no `{DECISION_FILE}` was found:
- Check if `.claude/brainstorms/` exists and contains `.md` files
- If files found, list them numbered (read the `# Title` line from each file):
  ```
  Saved brainstorms:
  1. {filename} — {title}
  2. {filename} — {title}
  Pick a number to use, or 'skip' for a new feature:
  ```
- If user picks a number: load that file as the decision source, pre-fill Chosen Approach, note "(brainstorm loaded: {filename})", delete the picked file after plan is complete
- A saved brainstorm uses the same template as a decision, so it may carry `## Proof Mode`. Parse it here exactly as the decision branch does, default to `handoff` when absent, note "(proof mode: {MODE})", and stamp it into the plan file. Skipping this would silently downgrade a declared `in-cycle` to `handoff` and then destroy the only record when the brainstorm is deleted.
- If user types 'skip' or no files exist: proceed to Step 1 normally

**No-Code Rule:** This command MUST NOT create, edit, or write any project files.
Allowed writes: `.claude/plans/` only.
If you find yourself about to write code or modify project files — stop. That belongs in `/ec-execute`.
Reading is always allowed — this command MAY run read-only shell commands (`grep`, `grep -n`, `sed -n`, `wc -l`, `ls`, `git diff --stat`) to measure the codebase. It MUST NOT run any command that writes, deletes, or changes git state.

## Step 1 — Gather Input
Ask ONE question at a time. Every input is optional — minimum viable input is a plain text description.

1. "How would you like to describe this feature?"
   - Option A: Ticket number (Jira, Linear, GitHub Issues, Notion, etc.)
   - Option B: Paste a link or description directly
   - Option C: Just tell me what you want to build
   - If ticket system configured in project-config.json: auto-fetch from that system
   - If no tool: accept any free-form text description

2. "Do you have a design reference? (Figma link / screenshot path / text description / skip)"

   **If Figma URL detected (contains figma.com):**

   - Check if Figma MCP is available by checking `~/.claude/settings.json` for `mcpServers.figma`
   - **If MCP available (preferred):** Call the `get_figma_data` MCP tool with the URL:
     ```
     get_figma_data({ url: "{figma_url}" })
     ```
     Use the returned structured layout, styling, component, and typography data directly.
     Note: "(Figma MCP used — structured design data loaded)"

   - **If MCP not available (fallback):** Extract file_key + node_id from URL manually:
     - file_key: value after `/design/` or `/file/` in the URL
     - node_id: value of `node-id` query param (replace `-` with `:`)
     - Fetch: `https://api.figma.com/v1/files/{file_key}/nodes?ids={node_id}` with `X-Figma-Token: {figma_api_key}`
     - Parse returned JSON for layout, fills, typography, and component structure

   **If screenshot path:** read and analyze the image
   **If text description:** use as-is
   **If skip:** plan UI based on feature description only

   **Build the Design Contract (every branch except skip):** After loading the reference, extract a Design Contract with this exact structure. It is written into the plan file verbatim, so it must stand on its own without the image:
   ```
   ### Design Contract
   - Source: {figma url | screenshot absolute path | text description}  ·  Viewport: {e.g. 1440x900 desktop, 390x844 mobile, or "unspecified"}
   - Layout: {structure and section order top-to-bottom, alignment, grid/flex behaviour}
   - Spacing: {observed padding / margin / gap values}
   - Typography: {per text element — size, weight, line-height, color}
   - Color: {background, surface, border, text, accent — hex where determinable}
   - Elements: {exhaustive ordered list of every visible element — containers, text, icons, dividers, badges, inputs, buttons}
   - Copy: {exact literal text strings visible in the reference}
   - States: {default / hover / focus / disabled / loading / empty / error — record each as shown, or "not shown"}
   - Deviations allowed: {responsive adaptation or token substitution notes, or "none"}
   ```
   Rules: describe what is actually visible, never what is typical. If a value cannot be determined from the reference, write `not determinable from reference` rather than guessing. Always keep the original path or URL in the Source line so subagents can re-read the image at execute time; resolve a relative screenshot path to an absolute path before storing it. Extraction is identical whether Figma data came from the MCP tool or the REST fallback.

   **If skip and the feature has UI scope:** write no Design Contract. Build a `### Design Direction` block instead, inferring the three dials from the feature description and stating a one-line reason for each; the plan then carries a Design Direction and no `### Design Contract`.

   **If the feature has no UI scope:** write no Design Contract and no `[design:]` tags.

3. "Any API contract? (paste JSON / OpenAPI / endpoint description / skip)"

4. "Anything else I should know? (or type 'done')"

## Step 2 — Analyze
Read .claude/context/stack.md, .claude/context/structure.md, .claude/context/conventions.md, and .claude/context/notes.md — load each only if it exists (all optional).

### Docs Lookup (if worker running)
For the feature being planned, search relevant docs:
```
curl -s "http://localhost:37777/docs/search?q={feature_keywords}&project={project_name}&limit=5"
```
Use returned docs snippets to ensure planned API usage is correct and up-to-date.
Do not show raw docs to user — silently incorporate into plan accuracy.

### Memory Cross-Check (if worker running)
Search memory for anything relevant to this feature:
```
curl -s "http://localhost:37777/memory/search?q={feature_keywords}&project={project_name}&limit=5"
```
Use results to: avoid re-creating things that already exist, follow past decisions, flag if this feature was attempted before.

### Agent-Augmented Analysis
Based on `stack.md`, detect the primary stack(s) and read the relevant agent file(s):
- Map stack to agent: `.py` → `ec-python`, `.tsx`/`.jsx` → `ec-react`, `.ts` server → `ec-nodejs`, `.vue` → `ec-vue`, `.dart` → `ec-flutter`, `.swift` → `ec-ios`, `.kt` → `ec-android`, `.go` → `ec-golang`, `.java` → `ec-java`, `.php` → `ec-php`
- Read up to 2 most relevant: `cat ~/.claude/agents/{agent-name}.md`
- If file not found: skip silently — analysis continues without it
Apply domain knowledge to: reuse scan (idiomatic patterns/libs for this stack), impact analysis (common coupling risks), and per-task recommendations.
Do not show agent file content to the user — apply silently.

### Reuse Scan
Silently scan existing codebase for:
- Components, hooks, utils that overlap with this feature
- Existing patterns that should be followed
- Anything reusable — reference in plan, do not recreate

### Impact Analysis
Identify existing files that will be modified or at risk of breaking.

### Breaking Change Detection
Flag any task that could break existing behavior, APIs, or shared components.

### Agent Detection (per task)
For each task in the plan, determine the appropriate agent from file path and task description:

| File pattern | Agent |
|---|---|
| `*.tsx`, `*.jsx` (component files) | `ec-react` |
| `*.vue` | `ec-vue` |
| `pages/**`, `app/**` with `.tsx`/`.ts` | `ec-nextjs` |
| `*.d.ts`, `types/**`, type-heavy `.ts` | `ec-typescript` |
| `tailwind.config.*`, utility CSS | `ec-tailwind` |
| `.native.tsx`, Expo imports | `ec-react-native` |
| `*.dart` | `ec-flutter` |
| `*.swift` | `ec-ios` |
| `*.kt`, Android path `.java` | `ec-android` |
| mobile perf/profiling tasks | `ec-mobile-perf` |
| `*.py` | `ec-python` |
| `*.js`/`*.ts` server-side non-FE | `ec-nodejs` |
| `*.go` | `ec-golang` |
| `*.java` Spring/backend | `ec-java` |
| `*.php` | `ec-php` |
| `*.sql`, `migrations/` | `ec-sql` or `ec-migration` |
| `*.test.*`, `*.spec.*` unit | `ec-unit-test` |
| `e2e/`, `cypress/`, `playwright/` | `ec-e2e` |
| API test files | `ec-api-test` |
| `Dockerfile`, `docker-compose*` | `ec-docker` |
| `.github/workflows/` | `ec-cicd` |
| `*.tf`, `terraform/`, cloud infra | `ec-cloud` |
| auth, security-related tasks | `ec-security` |
| performance/profiling tasks | `ec-performance` |
| refactoring (no new feature) | `ec-refactor` |
| code review tasks | `ec-reviewer` |
| API design, OpenAPI, `.yaml` specs | `ec-api-design` |
| system design, architecture tasks | `ec-architect` |
| LLM, AI, RAG, prompt tasks | `ec-llm` |
| no clear match | (omit tag — do not force) |

Add `[agent: ec-xxx]` after size tag in every task line:
`- [ ] Task N: {name} [{size}] [agent: ec-xxx] [design: {source}#{frame}] — {description}`
Add the design tag only to tasks that render UI. Omit it entirely on non-UI tasks. `{source}` is the path or URL from the Design Contract Source line, or the literal `direction` when the plan carries a `### Design Direction` instead (which has no Source line) — e.g. `[design: direction#SettingsPanel]`; `{frame}` is the specific screen or component name, or `main` when the reference has a single frame.
If no agent clearly matches, omit the tag entirely.

## Step 2.5 — Grounding Pass (mandatory)
**Scope by proof mode.** On `handoff`, the pass records only what stays
checkable in milliseconds: the line count of each file a task touches, the
exact `Anchor` string with its line number, and `test -f` for every file a
task claims is new. The test baseline and the whole-project baselines are
skipped. **Per-string baselines are NOT skipped when a task needs one:** a
`Verify (local)` of the form `grep -c "{string}" {file}` → `== n` is a numeric
threshold like any other, and it MUST record its current count here. The rule
skips the baselines nothing needs; it never forbids one that is needed.
Omitting a needed baseline makes `/ec-refine`'s Step 1 unable to reach its PASS
row, which would fail a correct plan. On `in-cycle` the full pass runs exactly
as specified, every baseline included.

Before writing any task, measure the codebase instead of assuming it. For every file a task will touch:
1. Confirm the file exists and record its line count: `wc -l {file}`
2. Record the exact anchor string each task will locate, with its line number: `grep -n "{anchor}" {file}`
3. For every string a Verify step will count, record its CURRENT count: `grep -c "{string}" {file}`
4. Record the current test baseline if the project has a suite

### Batched probe script
Issue these measurements as ONE script, not one call per file or per task. A 130-task plan is several hundred read-only probes; as separate calls that is most of an hour of round-trips.

```bash
probe() { printf '%s|%s|%s\n' "$1" "$2" "$(timeout 10 bash -c "$2" 2>&1 | tail -1)"; }
probe 'lines src/a.ts'  'wc -l < src/a.ts'
probe 'anchor T1'       'grep -n -F "export function foo" src/a.ts | head -1'
probe 'count foo'       'grep -c -F "foo" src/a.ts'
probe 'absent src/b.ts' 'test -f src/b.ts; echo $?'
```

Every probe here is read-only, which is what makes batching safe. The output of the script IS the `### Grounding` content — transcribe it, never retype it from memory.

Write all of it into the plan's `### Grounding` section verbatim — actual output, never predicted output.

**Traceability rule:** every numeric threshold in a Verify step MUST be derived from a baseline recorded here. Write `== n` when the exact post-change count is known from the baseline plus the edits specified; use `>= n` only when the edit count genuinely varies. A threshold that cannot be traced to a baseline is a planning defect — measure it, do not guess it.

**Count stability rule.** An exact `grep -c "{string}" {file}` → `== n` is only stable while no LATER OR CONCURRENT task in this plan touches that file or adds that string. Inside a wave there is no earlier or later, so a same-wave sibling counts as concurrent. Co-location fusion makes several tasks per file the norm, so before writing `== n`, scan the remaining tasks: if any later task touches the same file, or adds test fixtures containing the same string, either use `>= n` or anchor the count to a construct unique to this task (a function signature, a full statement) rather than a bare substring. Otherwise `/ec-review`'s evidence audit will re-run the check against a file that has legitimately moved on, and report a plan-ordering defect for a task that was correct when it ran.

Only read-only commands are permitted here (see the No-Code Rule).

## Step 3 — Write Plan

### What belongs in a task — deliverable first

**Deliverable rule (applies in every mode).** Whatever the cycle was asked to
produce is always a task, whatever its medium and however long it takes —
writing code, editing config, running a migration, or entering a server to
change its state. This rule is stated first and is never overridden: the mode
below never judges whether work is "code".

**Proof rule (`handoff` mode only).** A step whose only job is to prove the
change works must not spend wall-clock inside the cycle. Building an artifact
so it can be inspected, launching an app or a browser to look at it, bundling,
compiling Rust, or running a suite to feel sure — all move to `### Handoff`.
The one exception is a static check that finishes in about two seconds, which
stays as `Verify (local)`.

**The allowed-check rule — stated here once; `/ec-refine`, `/ec-execute` and
`/ec-review` reference this paragraph rather than restating it.** A
`Verify (local)` on `handoff` must be a read-only command that inspects files
already on disk and finishes in about two seconds. These qualify: `grep` and
`grep -c`, `test -f` / `test -x` / `test -d`, `wc -l`, `ls`, `sed -n`, `head`,
`tail`, `jq`, `bash -n`, `node --check`, `python3 -m json.tool`,
`python3 -I -c` on a parse, and `tsc --noEmit`. These do not, and are Handoff
steps however quick they feel: any build or bundle (`npm run build`,
`vite build`, `cargo build`, `go build`, `make`, `mvn`, `gradle`,
`xcodebuild`), any Rust compile-check (`cargo check`), any test runner
(`pytest`, `npm test`, `jest`, `vitest`, `cargo test`, `go test`), any linter
or type-checker that walks the whole project (`eslint`, `ruff`, `mypy`), any
launcher or driver (`npm run tauri`, `hdiutil`, `docker build`, `playwright`,
`cypress`, `curl` against a running server), and anything reaching outside this
working tree. A command on neither list is judged by the principle above, and
ambiguity resolves to Handoff. Measured on this repo: 16 allowed checks cost
0.04s in total, `tsc --noEmit` 2.19s, `cargo check` 35.97s, a universal DMG
build 122s — which is where the line was drawn.

In `in-cycle` mode the proof rule does not apply, because there the artifact or
the running system is itself the deliverable and the deliverable rule covers it.

**When the two rules appear to collide, escalate rather than guess.** If what
the cycle was asked to produce IS an artifact or a running system — "build the
DMG", "publish the package", "get the app launching" — then that build is the
deliverable, not a proof of it, and `handoff` is the wrong mode for the cycle.
Say so and switch to `in-cycle`, noting "(deliverable is an artifact —
escalated to in-cycle)". Never resolve the collision by dropping the
deliverable: the deliverable rule is never overridden.

### Task Granularity Rules
Each task must represent 2–5 minutes of focused work. One action per task.
Never write tasks like "implement the feature" or "handle edge cases".
Instead, split into atomic steps:
- "Add {field} to {type} in {file}"
- "Create {ComponentName} with {props}"
- "Add {endpoint} call in {file}"
- "Handle loading state in {component}"

Every task must include:
- Exact file path to create or modify
- Concrete code sample or clear expected output (no "fill in details")
- Specific verification step: how to confirm this task is done

### Flat Format Rules (mandatory — no exceptions)
- Task list MUST be flat — no batch headers, no phase labels, no grouping of any kind
- NEVER write: "## Batch A", "### Phase 1", "#### Group:", "**Wave 1**", or any grouping construct
- Every task MUST use exact format: `- [ ] Task N: {name} [{size}] [agent: ec-xxx] [design: {source}#{frame}] — {description}` (omit agent tag if no clear match; omit design tag on non-UI tasks)
- Add the design tag only to tasks that render UI. Omit it entirely on non-UI tasks. `{source}` is the path or URL from the Design Contract Source line, or the literal `direction` when the plan carries a `### Design Direction` instead (which has no Source line) — e.g. `[design: direction#SettingsPanel]`; `{frame}` is the specific screen or component name, or `main` when the reference has a single frame. The design tag always comes after the agent tag.
- Task numbers are sequential integers 1 to N, no gaps, no sub-numbering (1.1, 1.2, etc.)
- Size of the feature does not affect format — 3 tasks or 50 tasks use identical flat structure
- Why flat: `/ec-execute` groups the work itself, from `File:` and `Dependencies:`. Waves are derived at execution time, never authored — a hand-written grouping would freeze one ordering into the plan and override the only grouping that reflects the real graph

```
## Feature: {feature_name}
Proof mode: {handoff | in-cycle}

### Impact Analysis
- Files affected: {list}
- ⚠️ Breaking change risk: {list or "none"}

### Reusable Existing Code
- {component/hook/util} at {path} — used for {reason}

### Design Contract
- Source: {figma url | screenshot absolute path | text description}  ·  Viewport: {viewport or "unspecified"}
- Layout: {structure and section order top-to-bottom, alignment, grid/flex behaviour}
- Spacing: {observed padding / margin / gap values}
- Typography: {per text element — size, weight, line-height, color}
- Color: {background, surface, border, text, accent — hex where determinable}
- Elements: {exhaustive ordered list of every visible element}
- Copy: {exact literal text strings visible in the reference}
- States: {default / hover / focus / disabled / loading / empty / error — each as shown, or "not shown"}
- Deviations allowed: {responsive adaptation or token substitution notes, or "none"}

Omit this whole section when the feature has no UI scope.

### Design Direction
- Dials: ENERGY {1-3} · RHYTHM {1-3} · MOTION {1-3} — {one-line reason for each}
- Palette: {2-3 core colors + 1 accent, hex} — {reason}
- Typography: {headline face, body face, scale} — {reason}
- Identity motif: {the repeated gesture or pattern specific to this product}
- Rules: apply ~/.claude/agents/ec-antislop.md in full — hard gates, purpose gates, quality locks

Include this section only when the feature has UI scope AND no visual reference was supplied. A plan contains `### Design Contract` or `### Design Direction`, never both, and never neither when the feature has UI scope.

### Grounding
Measured in Step 2.5 — real command output only, never predicted.
- Baseline string counts: `grep -c "{string}" {file}` → {n}   (one line per string a Verify step will count)
- Baseline line counts: `wc -l {file}` → {n}   (one line per file a task touches)
- Baseline test result: {exact command} → {result, or "no suite"}
- Verified anchors: `{exact anchor string}` → {file}:{line}   (one line per task; write "new file — no anchor" when the task creates the file)

A Verify step with no numeric threshold — file existence, exit status, string presence — has nothing to trace; the traceability rule does not apply to it.

### Tasks
- [ ] Task 1: {name} [S/M/L] [agent: ec-xxx] [design: {source}#{frame}] — {one-line description}
- [ ] Task 2: {name} [S/M/L] [agent: ec-xxx] — {one-line description}
- [ ] Task N: ...

### Handoff
_Written on `handoff` mode. The proof steps this plan deliberately does not run,
as commands you can paste. Omit the section only when there are none._
- {what it proves} → `{exact command}`   (e.g. "DMG is universal and mounts" → `cd studio && npm run build:dmg`)
- {what to open} → {exact URL or app}    (e.g. "the new settings pane" → launch Effi Studio, Settings tab)

### Per Task Detail
**Task 1 — {name}** `S/M/L`
- File: {exact path to create/modify}
- Anchor: {exact existing string the executor must locate, with its line number from Grounding — omit this line entirely when the task creates the file}
- Reuse: {existing code to use, or "none"}
- Code sample: {concrete snippet or expected structure}
- Do not touch: {files, sections, or behaviours this task must leave alone — or "n/a"}
- Edge cases: loading state / empty state / error state
- ⚠️ Breaking change: {what breaks and for whom — omit this line entirely when nothing breaks}
- Acceptance: {the observable end state, stated independently of any command}
- Verify (local): {a command that FAILS if this task is wrong — a specific grep -c, test -f, or anchor match. Milliseconds. Traced to a baseline in ### Grounding}
- Verify (global): {omit on most tasks. Only at a module boundary: the whole-project invariant — build, type-check, or test suite}
- Rollback: {only when undoing this task needs more than reverting the file — omit this line entirely otherwise}
- Dependencies: {ONLY the tasks whose output this task genuinely requires — "none" is the common and correct answer. Never write "Task N-1" merely because it precedes this one. The one edge that is never optional: the task that creates the file this task edits}

**Task 2 — {name}**
...
```

**Exception-only fields.** `Rollback`, `⚠️ Breaking change` and `Anchor` are written ONLY when their value differs from the mechanical default. A `Rollback` that is merely a revert or delete of that task's own `File:` is derivable from `File:` — omit it. Omitting one of these lines is correct, not an oversight; `/ec-review` treats a default value as the defect, never the absence.

**Fields by proof mode.** On `handoff`, a task carries these six core lines:
`File`, `Anchor`, `Code sample`, `Do not touch`, `Verify (local)`,
`Dependencies`. `Reuse` and `Edge cases` fold into `Code sample`; `Acceptance`
folds into `Verify (local)`; `Verify (global)` is omitted entirely. `Anchor`
and `Do not touch` are never dropped — they are what makes `/ec-execute`'s
concurrent waves provably safe. `⚠️ Breaking change` and `Rollback` stay
exception-only exactly as above, and `Anchor` keeps its own exception: a task
that CREATES its file omits it, because there is nothing to locate — writing
`Anchor: new file` is the defect, not the omission. So a `handoff` task carries
five or six core lines plus any exception-only line that applies. Extra fields
are verbose, not wrong: the rule names what is required, it does not forbid
more. On `in-cycle`, every field documented above applies as written, and
`### Handoff` is unnecessary rather than forbidden.

**Honest dependencies.** A dependency means this task cannot start until that task's output exists. A straight 1→2→3→…→N chain is almost always fabricated, and `/ec-execute` LEVELS this field into waves of concurrent units — so a false edge directly narrows the wave and costs real minutes, while an empty value is a valid and common answer. One edge is mandatory: if this task edits a file another task in this plan creates, name that task. `/ec-refine` fails the plan for that omission, because under concurrency it would let this task run before the file exists.

**Two kinds of verification.** Local evidence proves THIS task did what it claims. A global invariant (build, type-check, test suite) proves a repo-wide property and must NOT be attached to every task — a passing whole-project compile says nothing about the task that triggered it, and attaching it everywhere is both slower and less accurate. Place global invariants at module boundaries and let `/ec-review` run the definitive gate. A task whose only honest proof is a compile may carry a global verify; the rule is "not on every task", not "never".

Size guide: S = <1hr · M = 1–3hr · L = >3hr

**Lock check:** Before writing, verify the plan file is not locked by an active ec-execute session:
```bash
LOCK_CHECK=$(python3 ~/.efficlaude/server/file_lock.py status "{PLAN_FILE}" 2>/dev/null \
  || echo '{"status":"free"}')
LOCK_STATUS=$(echo "$LOCK_CHECK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','free'))" 2>/dev/null)
```
- If LOCK_STATUS is `"locked"`:
  - Extract holder: `echo "$LOCK_CHECK" | python3 -c "import sys,json; h=json.load(sys.stdin).get('holder',{}); print(f\"session {h.get('session_id','?')} (PID {h.get('pid','?')}) running {h.get('command','ec-execute')}\")"`
  - Show: "⚠️ {PLAN_FILE} is locked: {holder_info} — ec-execute may be running in another terminal"
  - Ask: "Overwrite anyway? This will interrupt the other session. (y/n):"
    - If `n`: stop — "Wait for the other session to finish, then run /ec-plan again."
    - If `y`: proceed with writing plan.

Run `mkdir -p .claude/plans` then save plan to `{PLAN_FILE}`.

## Step 4 — Self-Review Before Presenting
Before showing the plan, check:
- [ ] Every task has an exact file path
- [ ] Every task has a concrete code sample or expected output
- [ ] Every task has a verify step
- [ ] No task says "fill in details", "handle edge cases", or "similar to Task N"
- [ ] No task would take more than 5 minutes
- [ ] Dependencies are correctly ordered
- [ ] Every task that edits an existing file has an Anchor confirmed to exist by the Grounding Pass; new-file tasks omit the line and are recorded in ### Grounding instead
- [ ] Every numeric threshold in a Verify step traces to a baseline in ### Grounding — in both modes, since a `grep -c` threshold on `handoff` records its own baseline
- [ ] On `in-cycle`, every task has an Acceptance stated independently of its Verify command; on `handoff` it folds into `Verify (local)`, which must therefore be falsifiable on its own
- [ ] No Verify threshold was written without measuring the current value first — including a `grep -c` on `handoff`
- [ ] No task carries a mechanical Rollback, a "none" Breaking change, or a "new file" Anchor — those lines are omitted
- [ ] Every task has a Verify (local) that fails if the task is wrong
- [ ] Global invariants appear only at module boundaries, not on every task
- [ ] Dependencies name only genuine prerequisites — no fabricated Task N-1 chain
- [ ] Every task that edits a file another task creates declares that edge
- [ ] Every file a task claims is new was confirmed absent by the Grounding Pass — never assumed
- [ ] Design Contract is present and self-contained if the feature has UI scope
- [ ] Every UI task carries a [design:] tag
- [ ] A UI feature carries exactly one of ### Design Contract / ### Design Direction — never both, never neither
- [ ] Design Direction states all three dials with a one-line reason each
- [ ] Every task that calls an API names its error-handling approach — reused existing handler, or a new handler to create. On `handoff` that naming folds into `Code sample`
- [ ] Proof mode is resolved and noted, defaulting to `handoff` when the decision does not say
- [ ] On `handoff`, no task builds, launches, serves, bundles, compiles Rust, or runs a suite — those are in `### Handoff`
- [ ] On `handoff`, every `Verify (local)` is one of the allowed static checks
- [ ] On `handoff`, `### Handoff` lists every proof step the plan chose not to run, or is omitted because there are none

Fix any issues found, then present the plan.

## Step 5 — Save Feature Intent to Memory (if worker running)
After plan is confirmed, save feature intent:
```
curl -s -X POST http://localhost:37777/memory/observe \
  -H "Content-Type: application/json" \
  -d '{
    "project": "{project_name}",
    "type": "feature_plan",
    "content": "Planning feature: {feature_name}. Tasks: {task_count}. Files: {affected_files}.",
    "metadata": {"source": "feature"}
  }'
```

## Step 6 — Confirm
- If `AUTO=yes` (auto-flow): skip this confirm gate and auto-proceed.
Ask: "Plan sudah benar? Confirm (y/n):"
- If y: proceed
- If n: ask "Apa yang perlu diubah?" → revise plan → re-confirm

**Auto-Flow stage advance:** If `AUTO=yes`, record that planning is done so the Stop-hook driver routes to the next stage even if this context is lost:
```bash
if [ -f .claude/.autoflow ]; then
  python3 - <<'PY'
import os
p = os.path.join(".claude", ".autoflow")
f = {}
for line in open(p):
    if "=" in line:
        k, _, v = line.strip().partition("=")
        f[k] = v
f["stage"] = "refine"
done = [s for s in f.get("stages_done", "").split(",") if s]
if "plan" not in done:
    done.append("plan")
f["stages_done"] = ",".join(done)
order = ["branch", "created", "stage", "stages_done", "iterations",
         "driver_stage", "driver_progress"]
keys = [k for k in order if k in f] + [k for k in f if k not in order]
open(p, "w").write("\n".join(f"{k}={f[k]}" for k in keys) + "\n")
PY
fi
```

Next: run `/ec-refine` to audit this plan before any code is written.
