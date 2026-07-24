## Feature: Design Contract Propagation + Frontend Agent Protocol

### Impact Analysis
- Files affected: `commands/ec-brainstorm.md`, `commands/ec-feature.md`, `commands/ec-execute.md`, `commands/ec-review.md`, `agents/ec-react.md`, `agents/ec-vue.md`, `agents/ec-nextjs.md`, `agents/ec-react-native.md`, `agents/ec-tailwind.md`, `agents/ec-flutter.md`, `agents/ec-ios.md`, `agents/ec-android.md`
- ⚠️ Breaking change risk: none — all changes are additive Markdown. The `[design:]` tag is optional and parsed independently of the existing `[agent:]` tag, so existing plans without it keep working. No Python, schema, or worker endpoint changes. `tests/test_command_docs.py` and `tests/test_docs.py` assert on existing strings only; no existing line is removed by this plan.

### Reusable Existing Code
- `[agent: ec-xxx]` tag mechanism — written at `commands/ec-feature.md:199`, parsed at `commands/ec-execute.md:133` — the `[design:]` tag copies this exact pattern
- Agent Context Injection block at `commands/ec-execute.md:132-139` — Design Contract injection is added as a sibling subsection reusing the same prompt-prepend approach
- Existing Figma MCP / screenshot handling at `commands/ec-feature.md:99-117` — extended in place, not replaced
- Existing "Design Analysis (if UI/frontend problem)" block in `commands/ec-brainstorm.md` Step 2 — extended to emit its findings instead of discarding them
- Existing "Accessibility (UI components only)" section in `commands/ec-review.md` Stage 2 — new gates sit beside it in the same Stage 2 structure

### Design Contract
- Source: none supplied — this feature changes prompt/command Markdown only and renders no UI. No fidelity claim applies to its own implementation.

### Canonical Text Blocks (referenced by the tasks below)

**BLOCK A — Design Contract template** (used by Tasks 1, 2, 3):
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

**BLOCK B — Visual Fidelity Protocol** (used by Tasks 5–12, with `{markup}` swapped per platform):
```
## Visual Fidelity Protocol
When a Design Contract or image reference is supplied, it is the specification of record:
- Read the referenced image with the Read tool before writing any {markup} — never implement from a text summary alone
- Enumerate every element in the reference and map each to concrete code — the mapping is 1:1, no exceptions
- Never omit, merge, or simplify an element because it looks decorative; never invent an element the reference does not contain
- Take measured values from the reference, not from habit: spacing, sizing, radius, weight, line-height, color
- Reproduce copy exactly as shown — no rewording, no placeholder text, no lorem ipsum
- Implement every state the reference shows, plus loading / empty / error for any data-driven region
- If a deviation is unavoidable (responsive breakpoint, design token substitution, platform constraint), implement it and declare it in your output as "Deviation: {what} — {why}" — silent deviation is a failure
- Before claiming done, walk the reference element by element and confirm each has a counterpart in the code
```

**BLOCK C — API Error Protocol** (used by Tasks 5–8 and 10–12; NOT Task 9/ec-tailwind, which owns no network layer):
```
## API Error Protocol
Every network call ships with error handling — not optional, and it applies even when the task never mentions it:
- Before writing a call, Grep the codebase for existing error handling ({platform-specific examples}) and reuse what already exists
- If nothing exists, create the handler yourself as a reusable function in the project's conventional location — never inline a one-off catch and move on
- Cover: network failure, non-2xx status, timeout, malformed or empty payload, auth expiry (401/403)
- Surface every failure in the UI as a state the user can see and recover from — never fail silently to a blank screen or an endless spinner
- Pair every request with its loading state and its empty state
- Never swallow an error with an empty catch, and never treat logging as the only response
```

### Tasks
- [x] Task 1: Design Contract in ec-brainstorm [S] [agent: ec-llm] — emit design findings as a Design Contract draft instead of discarding them internally
- [x] Task 2: Design Contract capture in ec-feature [M] [agent: ec-llm] — extract contract at Step 1 Q2, persist into plan template, add [design:] tag rules and self-review items
- [x] Task 3: Design Contract injection in ec-execute [M] [agent: ec-llm] — parse [design:], inject contract plus image path into subagent prompt, extend Evidence Rule
- [x] Task 4: Fidelity and error gates in ec-review [S] [agent: ec-llm] — add Visual Fidelity and API Error Handling sections to Stage 2
- [x] Task 5: Protocols in ec-react [S] [agent: ec-llm] — append Visual Fidelity + API Error Protocol
- [x] Task 6: Protocols in ec-vue [S] [agent: ec-llm] — append Visual Fidelity + API Error Protocol
- [x] Task 7: Protocols in ec-nextjs [S] [agent: ec-llm] — append Visual Fidelity + API Error Protocol
- [x] Task 8: Protocols in ec-react-native [S] [agent: ec-llm] — append Visual Fidelity + API Error Protocol
- [x] Task 9: Fidelity protocol in ec-tailwind [S] [agent: ec-llm] — append Visual Fidelity Protocol only, no network layer
- [x] Task 10: Protocols in ec-flutter [S] [agent: ec-llm] — append Visual Fidelity + API Error Protocol
- [x] Task 11: Protocols in ec-ios [S] [agent: ec-llm] — append Visual Fidelity + API Error Protocol
- [x] Task 12: Protocols in ec-android [S] [agent: ec-llm] — append Visual Fidelity + API Error Protocol

### Per Task Detail

**Task 1 — Design Contract in ec-brainstorm** `S`
- File: `commands/ec-brainstorm.md`
- Reuse: existing "**Design Analysis (if UI/frontend problem)**" block in Step 2; existing decision template in Step 5
- Code sample: two edits.
  1. Replace the Design Analysis closing line "Weave findings into the recommendation description — do not add as a separate section in the output." with that same line followed by:
     ```
     **Carry forward:** if UI/frontend context was detected, also record the design reference the user supplied (Figma URL, screenshot path, or text description) and draft a Design Contract from it using the field list in the decision template below. If no reference was supplied, record the single line `- Source: none supplied — /ec-feature must ask for one before planning UI tasks.`
     ```
  2. In the Step 5 decision template, insert between `## Chosen Approach` and `## Key Assumptions`:
     ```
     ## Design Contract
     _Include this section only when the problem has UI/frontend scope._
     {BLOCK A field list, without the outer ### heading}
     ```
- Edge cases: non-UI brainstorm → section omitted entirely; UI brainstorm with no reference → the explicit "none supplied" line so `/ec-feature` knows to ask
- ⚠️ Breaking change: none — decision files without the section remain valid input to `/ec-feature`
- Verify: `grep -c "Design Contract" commands/ec-brainstorm.md` returns ≥ 3 and `grep -c "none supplied" commands/ec-brainstorm.md` returns ≥ 1
- Dependencies: none

**Task 2 — Design Contract capture in ec-feature** `M`
- File: `commands/ec-feature.md`
- Reuse: design reference question at line 99; Figma MCP branch at lines 101-116; `[agent: ec-xxx]` tag rule at line 199; Flat Format Rules; plan template in Step 3; self-review checklist in Step 4
- Code sample: four edits to this one file.
  1. In Step 0's decision-file handling, after the "Pre-fill the feature description from the decision's Chosen Approach section" bullet, add: `- If the decision file contains a "## Design Contract" section, load it verbatim as the starting Design Contract — do not re-ask question 2 unless its Source line reads "none supplied"`
  2. In Step 1, after the existing "**If skip:** plan UI based on feature description only" line, append:
     ```
     **Build the Design Contract (every branch except skip):** After loading the reference, extract a Design Contract with this exact structure. It is written into the plan file verbatim, so it must stand on its own without the image:
     {BLOCK A}
     Rules: describe what is actually visible, never what is typical. If a value cannot be determined from the reference, write `not determinable from reference` rather than guessing. Always keep the original path or URL in the Source line so subagents can re-read the image at execute time; store screenshot paths as absolute paths.
     **If skip and the feature has UI scope:** write the contract with the single line `- Source: none supplied — implement from the feature description; no fidelity claim can be made.`
     ```
  3. In Step 3, extend the Flat Format Rules and the task-line format to `- [ ] Task N: {name} [{size}] [agent: ec-xxx] [design: {source}#{frame}] — {description}` with the rule: `Add the design tag only to tasks that render UI. Omit it entirely on non-UI tasks. {source} is the path or URL from the Design Contract Source line; {frame} is the specific screen or component name, or "main" when the reference has a single frame.` Then insert the `### Design Contract` section into the plan template between `### Reusable Existing Code` and `### Tasks`.
  4. In Step 4's self-review checklist, append: `- [ ] Design Contract is present and self-contained if the feature has UI scope`, `- [ ] Every UI task carries a [design:] tag`, `- [ ] Every task that calls an API names its error-handling approach — reused existing handler, or a new handler to create`
- Edge cases: non-UI feature → no contract, no tags, checklist items vacuously satisfied; Figma MCP unavailable → REST fallback feeds the same extraction; relative image path → resolved and stored absolute
- ⚠️ Breaking change: none — the `[design:]` tag is appended after `[agent:]`, so the existing `\[agent: (ec-\w+)\]` parse in `/ec-execute` is unaffected
- Verify: `grep -c "Design Contract" commands/ec-feature.md` returns ≥ 5, `grep -c "\[design:" commands/ec-feature.md` returns ≥ 2, `grep -c "not determinable from reference" commands/ec-feature.md` returns ≥ 1
- Dependencies: none

**Task 3 — Design Contract injection in ec-execute** `M`
- File: `commands/ec-execute.md`
- Reuse: "### Agent Context Injection" block at lines 132-139; "### Evidence Rule" block at lines 142-148; the subagent prompt bullet list in Step 4
- Code sample: three edits to this one file.
  1. In Step 4's "Each subagent prompt must include:" list, add after the "Edge cases to handle" bullet: `- The "### Design Contract" block from the plan, verbatim, for any task carrying a [design:] tag` and `- The API error-handling approach named in the task detail`
  2. Immediately after the "### Agent Context Injection" block, add:
     ```
     ### Design Contract Injection
     For each task, check for a `[design: {source}#{frame}]` tag in the task line:
     1. Extract source and frame: parse `\[design: ([^#\]]+)#([^\]]+)\]` from the task line
     2. Read the `### Design Contract` block from `{PLAN_FILE}` in full
     3. Append to the subagent prompt:
        "Design Contract — this is the specification of record for this task. Implement it 1:1.\n{contract_block}\nReference: {source} (frame: {frame})\nIf {source} is a readable local file, open it with the Read tool and inspect it before writing any code. Declare any deviation explicitly in your output."
     4. If {source} is a path that no longer exists: show `(⚠️ design reference {source} missing — implementing from the Design Contract text only)` and proceed with the text block
     5. If the task has a `[design:]` tag but `{PLAN_FILE}` has no Design Contract block: show `(⚠️ no Design Contract in plan — proceeding without visual spec)` and proceed
     6. If no `[design:]` tag: proceed normally — no contract injected
     ```
  3. In the "### Evidence Rule" numbered list, insert before the final "If verification fails" item: `6. If the task carried a [design:] tag: walk the Design Contract element list and confirm each element has a counterpart in the code, then report any deviation as "Deviation: {what} — {why}"` and `7. If the task added an API call: confirm the call has error handling covering network failure, non-2xx status, timeout, and malformed payload, and that the failure is visible in the UI — missing error handling means the task is not done`
- Edge cases: missing image file → text-only fallback; tag present but no contract block → warn and proceed; no tag → unchanged behaviour
- ⚠️ Breaking change: none — all additions are new subsections and new list items; the existing agent-tag parse is untouched
- Verify: `grep -c "Design Contract Injection" commands/ec-execute.md` returns 1, `grep -c "Design Contract" commands/ec-execute.md` returns ≥ 4, `grep -c "Deviation:" commands/ec-execute.md` returns ≥ 1
- Dependencies: Task 2 defines the tag format this task parses — order matters for coherence, not mechanics

**Task 4 — Fidelity and error gates in ec-review** `S`
- File: `commands/ec-review.md`
- Reuse: Stage 2 section structure; the existing "### Accessibility (UI components only)" block it sits beside
- Code sample: insert two sections into Stage 2, immediately before "### API Correctness (if docs available)":
  ```
  ### Visual Fidelity (if the plan has a Design Contract)
  - Every element listed in the Design Contract has a counterpart in the implemented code
  - No element was invented that the contract does not list
  - Copy matches the contract exactly — no rewording, no placeholder text
  - Spacing, typography, and color match the contract's measured values
  - Every state the contract records is implemented, plus loading / empty / error on data-driven regions
  - Any deviation is declared in the code or the execution report — an undeclared deviation is an issue to fix

  ### API Error Handling (any code that calls an API)
  - Every call has error handling — none is left bare
  - Existing project error handlers were reused where they exist; a new reusable handler was created where they did not
  - Coverage includes network failure, non-2xx status, timeout, malformed or empty payload, and auth expiry
  - Failures surface in the UI as a recoverable state — no blank screen, no endless spinner
  - No empty catch blocks and no log-only handling
  ```
- Edge cases: plan has no Design Contract → the Visual Fidelity section is skipped by its own conditional heading; backend-only change → the API Error Handling section applies to callers only, so it is vacuous
- ⚠️ Breaking change: none — Stage 2 already fixes issues directly, so the new gates follow the existing "fix and note what changed" rule
- Verify: `grep -c "Visual Fidelity" commands/ec-review.md` returns ≥ 1 and `grep -c "API Error Handling" commands/ec-review.md` returns ≥ 1
- Dependencies: none

**Task 5 — Protocols in ec-react** `S`
- File: `agents/ec-react.md`
- Reuse: existing section style — `## Heading` with terse `- ` bullets, no prose paragraphs
- Code sample: insert BLOCK B (`{markup}` → `JSX`) and BLOCK C immediately before the existing final `## What to never do` section. In BLOCK C, `{platform-specific examples}` → `error boundaries, React Query onError and retry config, axios or fetch interceptors, a shared handleApiError util, toast helpers`. Append to the existing `## What to never do` list: `- Never render a fetch result without loading, empty, and error branches`
- Edge cases: n/a — static prompt text
- ⚠️ Breaking change: none
- Verify: `grep -c "## Visual Fidelity Protocol" agents/ec-react.md` returns 1, `grep -c "## API Error Protocol" agents/ec-react.md` returns 1, and `grep -c "## What to never do" agents/ec-react.md` still returns 1
- Dependencies: none

**Task 6 — Protocols in ec-vue** `S`
- File: `agents/ec-vue.md`
- Reuse: existing section style in the file
- Code sample: add BLOCK B (`{markup}` → `template markup`) and BLOCK C. In BLOCK C, `{platform-specific examples}` → `an app-level errorHandler, Pinia error state, a composable such as useFetch or useApi, axios interceptors, toast plugins`. If the file ends with a "never do" style section, insert both blocks before it; otherwise append at end of file.
- Edge cases: n/a
- ⚠️ Breaking change: none
- Verify: `grep -c "## Visual Fidelity Protocol" agents/ec-vue.md` returns 1 and `grep -c "## API Error Protocol" agents/ec-vue.md` returns 1
- Dependencies: none

**Task 7 — Protocols in ec-nextjs** `S`
- File: `agents/ec-nextjs.md`
- Reuse: existing section style in the file
- Code sample: add BLOCK B (`{markup}` → `JSX`) and BLOCK C, same placement rule as Task 6. In BLOCK C, `{platform-specific examples}` → `error.tsx and global-error.tsx boundaries, not-found.tsx, server action return-shape conventions, a shared fetcher wrapper, route handler error helpers`. Add one Next-specific bullet to BLOCK C: `- Server Components and server actions need the same coverage — a thrown error must resolve to an error.tsx boundary or a typed error return, never an unhandled rejection`
- Edge cases: n/a
- ⚠️ Breaking change: none
- Verify: `grep -c "## Visual Fidelity Protocol" agents/ec-nextjs.md` returns 1, `grep -c "## API Error Protocol" agents/ec-nextjs.md` returns 1, `grep -c "error.tsx" agents/ec-nextjs.md` returns ≥ 1
- Dependencies: none

**Task 8 — Protocols in ec-react-native** `S`
- File: `agents/ec-react-native.md`
- Reuse: existing section style in the file
- Code sample: add BLOCK B (`{markup}` → `component tree`) and BLOCK C, same placement rule as Task 6. In BLOCK C, `{platform-specific examples}` → `React Query onError, a shared apiClient wrapper, ErrorBoundary components, Toast or Snackbar helpers`. Add to BLOCK C: `- Handle offline explicitly — check connectivity and show a retryable offline state, never a silent failure`. Add to BLOCK B: `- Respect safe-area insets and platform density when translating a reference — declare these as deviations when they shift the layout`
- Edge cases: n/a
- ⚠️ Breaking change: none
- Verify: `grep -c "## Visual Fidelity Protocol" agents/ec-react-native.md` returns 1, `grep -c "## API Error Protocol" agents/ec-react-native.md` returns 1, `grep -c "offline" agents/ec-react-native.md` returns ≥ 1
- Dependencies: none

**Task 9 — Fidelity protocol in ec-tailwind** `S`
- File: `agents/ec-tailwind.md`
- Reuse: existing section style in the file
- Code sample: add BLOCK B only (`{markup}` → `utility classes`), same placement rule as Task 6, plus two Tailwind-specific bullets: `- Map measured values to the nearest design token; if no token matches, add the token to the config rather than reaching for an arbitrary value` and `- When a token substitution changes the rendered value, declare it as a deviation and include the original measurement`. Do NOT add BLOCK C — this agent owns no network layer.
- Edge cases: n/a
- ⚠️ Breaking change: none
- Verify: `grep -c "## Visual Fidelity Protocol" agents/ec-tailwind.md` returns 1 and `grep -c "## API Error Protocol" agents/ec-tailwind.md` returns 0
- Dependencies: none

**Task 10 — Protocols in ec-flutter** `S`
- File: `agents/ec-flutter.md`
- Reuse: existing section style in the file
- Code sample: add BLOCK B (`{markup}` → `widget tree`) and BLOCK C, same placement rule as Task 6. In BLOCK C, `{platform-specific examples}` → `a Result or Either wrapper, Dio interceptors, AsyncValue error handling in Riverpod, a shared ApiException type, SnackBar helpers`. Add to BLOCK C: `- Render AsyncValue.error and AsyncValue.loading explicitly — never leave a .when branch unimplemented or defaulting to an empty widget`
- Edge cases: n/a
- ⚠️ Breaking change: none
- Verify: `grep -c "## Visual Fidelity Protocol" agents/ec-flutter.md` returns 1, `grep -c "## API Error Protocol" agents/ec-flutter.md` returns 1, `grep -c "AsyncValue" agents/ec-flutter.md` returns ≥ 1
- Dependencies: none

**Task 11 — Protocols in ec-ios** `S`
- File: `agents/ec-ios.md`
- Reuse: existing section style in the file
- Code sample: add BLOCK B (`{markup}` → `view hierarchy`) and BLOCK C, same placement rule as Task 6. In BLOCK C, `{platform-specific examples}` → `a shared APIError enum, a Result-returning networking layer, URLSession wrappers, an alert or ContentUnavailableView presenter`. Add to BLOCK C: `- Map thrown errors to a typed error case and a user-facing message — never surface a raw NSError description in the UI`
- Edge cases: n/a
- ⚠️ Breaking change: none
- Verify: `grep -c "## Visual Fidelity Protocol" agents/ec-ios.md` returns 1, `grep -c "## API Error Protocol" agents/ec-ios.md` returns 1, `grep -c "APIError" agents/ec-ios.md` returns ≥ 1
- Dependencies: none

**Task 12 — Protocols in ec-android** `S`
- File: `agents/ec-android.md`
- Reuse: existing section style in the file
- Code sample: add BLOCK B (`{markup}` → `composable tree`) and BLOCK C, same placement rule as Task 6. In BLOCK C, `{platform-specific examples}` → `a Result or sealed UiState wrapper, Retrofit CallAdapter or OkHttp interceptors, a shared ApiException type, Snackbar helpers`. Add to BLOCK C: `- Model the screen as a sealed UiState with explicit Loading, Empty, Error, and Content branches — an unhandled branch is a bug`
- Edge cases: n/a
- ⚠️ Breaking change: none
- Verify: `grep -c "## Visual Fidelity Protocol" agents/ec-android.md` returns 1, `grep -c "## API Error Protocol" agents/ec-android.md` returns 1, `grep -c "UiState" agents/ec-android.md` returns ≥ 1
- Dependencies: none
