## Feature: Slim the interaction critical path

### Impact Analysis
- Files affected: `hooks/prompt_submit.py`, `hooks/post_tool_use.py`
- ⚠️ Breaking change risk: none — stdin input contract and `<efficlaude-context>` output format are unchanged; only execution scheduling changes.
- Note: hooks are copied to `~/.efficlaude/hooks/` at install time. Changes only take effect after `bash install.sh` (or manual copy). Verification below runs the repo files directly to confirm behavior before reinstall.

### Reusable Existing Code
- Detached `subprocess.Popen(..., stdout=DEVNULL, stderr=DEVNULL)` pattern at `hooks/prompt_submit.py:64-69` (in `ensure_worker()`) and `server/start.sh` — reuse for all fire-and-forget spawns.
- `_warn(tag, msg)` logger in both hooks — reuse for child-process failure logging.
- `fetch(url, timeout)` helper in `prompt_submit.py:50` — already returns `None`/`[]` on failure (graceful empty preserved under parallelism).
- `ensure_worker_quick()` in `post_tool_use.py:72` — moved into the detached child path, off the critical path.

### Tasks
- [x] Task 1: Add ThreadPoolExecutor import to prompt_submit [S] [agent: ec-python] — import concurrent.futures
- [x] Task 2: Parallelize memory + docs search in prompt_submit [S] [agent: ec-python] — run both worker calls concurrently
- [x] Task 3: Make check_update local-only (read cached remote version) [S] [agent: ec-python] — remove network call from prompt path
- [x] Task 4: Add background update refresh + --refresh-update handler [M] [agent: ec-python] — detached refresh of version cache
- [x] Task 5: Make post_tool_use observe fire-and-forget [M] [agent: ec-python] — detached self-reinvocation for the POST
- [x] Task 6: Verify end-to-end hook latency improvement [S] [agent: ec-python] — time both hooks with dummy stdin

### Per Task Detail

**Task 1 — Add ThreadPoolExecutor import to prompt_submit** `S`
- File: `hooks/prompt_submit.py` (modify import block, ~line 5-13)
- Reuse: none
- Code sample: add to the imports near the top:
  ```python
  from concurrent.futures import ThreadPoolExecutor
  ```
- Edge cases: stdlib only (Python 3.8+ per stack.md) — no dependency change.
- ⚠️ Breaking change: none
- Verify: `python3 -c "import ast; ast.parse(open('hooks/prompt_submit.py').read())"` exits 0 and `grep -q 'ThreadPoolExecutor' hooks/prompt_submit.py`.
- Dependencies: none

**Task 2 — Parallelize memory + docs search in prompt_submit** `S`
- File: `hooks/prompt_submit.py` (replace sequential calls at lines 165-166 in `main()`)
- Reuse: `get_memory_context()`, `get_docs_context()` — unchanged; both already return `[]` on failure.
- Code sample: replace
  ```python
  memory_items = get_memory_context(project, prompt)
  docs_items = get_docs_context(project, prompt)
  ```
  with
  ```python
  with ThreadPoolExecutor(max_workers=2) as ex:
      mem_future = ex.submit(get_memory_context, project, prompt)
      docs_future = ex.submit(get_docs_context, project, prompt)
      memory_items = mem_future.result()
      docs_items = docs_future.result()
  ```
- Edge cases: both threads join before `parts[]` is built → output ordering (memory then docs) identical to current. Failure in either thread → that helper returns `[]` (same graceful-empty behavior).
- ⚠️ Breaking change: none — output identical, only concurrent.
- Verify: pipe a dummy event and confirm context still emitted:
  `echo '{"prompt":"optimize performance"}' | python3 hooks/prompt_submit.py` prints an `<efficlaude-context>` block with both memory and docs sections (when present).
- Dependencies: Task 1

**Task 3 — Make check_update local-only (read cached remote version)** `S`
- File: `hooks/prompt_submit.py` (replace `check_update()` body, lines 96-115; add constant near line 37)
- Reuse: existing `VERSION_FILE`, `UPDATE_CHECK_FILE` constants.
- Code sample: add constant by the other path constants:
  ```python
  REMOTE_VERSION_CACHE = os.path.expanduser("~/.efficlaude/.remote_version")
  ```
  Replace `check_update()` with a local-read-only version (no network):
  ```python
  def check_update():
      try:
          if not os.path.exists(VERSION_FILE) or not os.path.exists(REMOTE_VERSION_CACHE):
              return None
          with open(VERSION_FILE) as f:
              local = f.read().strip()
          with open(REMOTE_VERSION_CACHE) as f:
              remote = f.read().strip()
          if remote and local != remote:
              return f"EffiClaude {remote} available (installed: {local}). Run: bash install.sh"
      except Exception:
          pass
      return None
  ```
- Edge cases: first run after deploy → `REMOTE_VERSION_CACHE` absent → returns `None` (no message) until Task 4's background refresh populates it; message appears on a later prompt. Acceptable — update notice is advisory, never blocking.
- ⚠️ Breaking change: none — same message format; behavior shifts from "block ≤3s on GitHub" to "instant local read".
- Verify: `grep -n 'urlopen' hooks/prompt_submit.py` shows NO occurrence inside `check_update` (only in `refresh_update_cache` from Task 4 and `fetch`); `python3 -c "import ast; ast.parse(open('hooks/prompt_submit.py').read())"` exits 0.
- Dependencies: none

**Task 4 — Add background update refresh + --refresh-update handler** `M`
- File: `hooks/prompt_submit.py` (add two functions near `check_update`; edit `main()` top + the `update_msg` line ~161)
- Reuse: detached `Popen` pattern from `ensure_worker()` (lines 64-69); `VERSION_URL`, `REMOTE_VERSION_CACHE`, `UPDATE_CHECK_FILE`.
- Code sample: add:
  ```python
  def maybe_refresh_update():
      try:
          if os.path.exists(UPDATE_CHECK_FILE):
              with open(UPDATE_CHECK_FILE) as f:
                  last = float(f.read().strip())
              if time.time() - last < 86400:
                  return
          subprocess.Popen(
              [sys.executable, os.path.abspath(__file__), "--refresh-update"],
              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
          )
      except Exception:
          pass

  def refresh_update_cache():
      try:
          with urllib.request.urlopen(VERSION_URL, timeout=3) as resp:
              remote = resp.read().decode().strip()
          with open(REMOTE_VERSION_CACHE, "w") as f:
              f.write(remote)
          with open(UPDATE_CHECK_FILE, "w") as f:
              f.write(str(time.time()))
      except Exception:
          pass
  ```
  At the very TOP of `main()` (before `sys.stdin.read()`), add the child-mode branch:
  ```python
  def main():
      if "--refresh-update" in sys.argv[1:]:
          refresh_update_cache()
          return
      ...
  ```
  Replace `update_msg = check_update()` (line ~161) with:
  ```python
      maybe_refresh_update()
      update_msg = check_update()
  ```
- Edge cases: detached child must not be `wait()`ed (it isn't); stdout/stderr→DEVNULL so it never blocks parent. Network failure in child → silent `except`, cache simply not refreshed.
- ⚠️ Breaking change: none — `--refresh-update` only fires from the self-spawned child; normal stdin path unaffected.
- Verify: `EFFICLAUDE_PORT=37777 python3 hooks/prompt_submit.py --refresh-update` exits 0 and creates/updates `~/.efficlaude/.remote_version`:
  `test -f ~/.efficlaude/.remote_version && echo OK`.
- Dependencies: Task 3

**Task 5 — Make post_tool_use observe fire-and-forget** `M`
- File: `hooks/post_tool_use.py` (rewrite `main()`, lines 89-110; `ensure_worker_quick`/`post_observation` unchanged)
- Reuse: detached `Popen` pattern; `_warn()`; existing `ensure_worker_quick()` and `post_observation()` (moved into child path).
- Code sample: replace `main()` with:
  ```python
  def main():
      if len(sys.argv) >= 4 and sys.argv[1] == "--observe":
          if ensure_worker_quick():
              try:
                  post_observation(sys.argv[2], sys.argv[3])
              except Exception as e:
                  _warn("post_tool_use", f"observe failed: {e}")
          return

      try:
          raw = sys.stdin.read()
          data = json.loads(raw)
      except Exception:
          sys.exit(0)

      tool_name = data.get("tool_name", "")
      if tool_name not in TRACKED_TOOLS:
          sys.exit(0)

      observation = build_observation(tool_name, data.get("tool_input", {}))
      if not observation:
          sys.exit(0)

      project = get_project_name()
      try:
          subprocess.Popen(
              [sys.executable, os.path.abspath(__file__), "--observe", project, observation],
              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
          )
      except Exception:
          pass
  ```
- Edge cases: parent no longer calls `ensure_worker_quick()` (its 1s health check + possible start moves to child) → tool flow never blocks on worker. Dropped observation under detached failure = same failure mode as today (silent + `_warn`); SQLite/ChromaDB write in worker stays atomic per request.
- ⚠️ Breaking change: none — `--observe` only fires from the self-spawned child.
- Verify: `echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.txt"}}' | python3 hooks/post_tool_use.py` returns immediately (no blocking wait); then within ~2s `curl -s "http://localhost:37777/memory/search?q=Wrote%20file%20x.txt&project=EffiClaude&limit=3"` shows the observation recorded.
- Dependencies: none

**Task 6 — Verify end-to-end hook latency improvement** `S`
- File: none (measurement only — no file writes)
- Reuse: `/usr/bin/time -p`
- Code sample: run before declaring done:
  ```bash
  echo "=== prompt_submit ==="; for i in 1 2 3; do \
    echo '{"prompt":"optimize worker performance latency"}' | /usr/bin/time -p python3 hooks/prompt_submit.py >/dev/null; done
  echo "=== post_tool_use ==="; for i in 1 2 3; do \
    echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/x.txt","old_string":"a"}}' | /usr/bin/time -p python3 hooks/post_tool_use.py >/dev/null; done
  ```
- Edge cases: `python3` interpreter startup (~30-60ms) is included in the measurement and is unavoidable for a hook — compare relative improvement, not absolute zero.
- ⚠️ Breaking change: none
- Verify: prompt_submit `real` time ≈ `max(memory, docs)` (~250-350ms incl. interpreter), materially below the prior sequential ~400-700ms; post_tool_use `real` returns fast (no 2s observe wait). Record the numbers.
- Dependencies: Task 2, Task 3, Task 4, Task 5

Size guide: S = <1hr · M = 1-3hr · L = >3hr
