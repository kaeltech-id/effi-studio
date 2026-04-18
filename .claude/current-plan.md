## Feature: local-install-mode

### Impact Analysis
- Files affected: `install.sh`, `README.md`
- ⚠️ Breaking change risk: none — existing remote install behavior unchanged when running outside repo

### Reusable Existing Code
- `SCRIPT_DIR` pattern (Bash `${BASH_SOURCE[0]}`) — standard portable script self-detection
- All source files already present at `$SCRIPT_DIR/{commands,server,hooks,launchers,shell,token-optimizer}/`

### Tasks
- [x] Task 1: Add SCRIPT_DIR and LOCAL_INSTALL detection [S] — detect if install.sh runs from within the repo
- [x] Task 2: Add fetch_file helper function [S] — cp vs curl routing based on LOCAL_INSTALL flag
- [x] Task 3: Refactor commands + VERSION download [S] — replace curl with fetch_file in Step 3
- [x] Task 4: Refactor server files download [S] — replace curl with fetch_file in Step 4
- [x] Task 5: Refactor hooks download [S] — replace curl with fetch_file in Step 5
- [x] Task 6: Refactor launchers download [S] — replace curl with fetch_file in Step 9
- [x] Task 7: Refactor etok build section [S] — local install builds directly from SCRIPT_DIR, skip temp dir
- [x] Task 8: Refactor shell/effi-shell.sh download [S] — replace curl with fetch_file
- [x] Task 9: Update README Install section [S] — replace curl|bash with clone-then-install instructions

### Per Task Detail

**Task 1 — Add SCRIPT_DIR and LOCAL_INSTALL detection** `S`
- File: `install.sh`
- Reuse: none
- Code sample: add after line 16 (after arrays, before BASE_URL):
  ```bash
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  LOCAL_INSTALL=false
  [ -f "$SCRIPT_DIR/commands/ec-setup.md" ] && LOCAL_INSTALL=true
  ```
  Add after `echo "Installing EffiClaude..."`:
  ```bash
  [ "$LOCAL_INSTALL" = true ] && echo "  (local install — copying from repo)"
  ```
- Edge cases: symlinked install.sh — `${BASH_SOURCE[0]}` resolves correctly
- ⚠️ Breaking change: none
- Verify: `LOCAL_INSTALL` is `true` when run from `/Users/admin/EffiClaude/`
- Dependencies: none

**Task 2 — Add fetch_file helper function** `S`
- File: `install.sh`
- Reuse: none
- Code sample: add after LOCAL_INSTALL block, before `echo "Installing EffiClaude..."`:
  ```bash
  fetch_file() {
    local rel="$1" dest="$2"
    if [ "$LOCAL_INSTALL" = true ]; then
      cp "$SCRIPT_DIR/$rel" "$dest"
    else
      curl -fsSL "$BASE_URL/$rel" -o "$dest"
    fi
  }
  ```
- ⚠️ Breaking change: none
- Verify: function defined in script — no syntax error on `bash -n install.sh`
- Dependencies: Task 1

**Task 3 — Refactor commands + VERSION download** `S`
- File: `install.sh`, Step 3 (lines 53–58)
- Code sample:
  ```bash
  fetch_file "commands/$cmd.md" "$COMMANDS_DIR/$cmd.md"
  ...
  fetch_file "VERSION" "$EFFICLAUDE_HOME/VERSION"
  ```
- ⚠️ Breaking change: none
- Verify: run install.sh locally → `ls ~/.claude/commands/ec-setup.md` exists
- Dependencies: Task 2

**Task 4 — Refactor server files download** `S`
- File: `install.sh`, Step 4 (lines 63–66)
- Code sample: `fetch_file "server/$file" "$SERVER_DIR/$file"`
- ⚠️ Breaking change: none
- Verify: `ls ~/.efficlaude/server/worker.py` exists after install
- Dependencies: Task 2

**Task 5 — Refactor hooks download** `S`
- File: `install.sh`, Step 5 (lines 72–76)
- Code sample: `fetch_file "hooks/$file" "$HOOKS_DIR/$file"`
- ⚠️ Breaking change: none
- Verify: `ls ~/.efficlaude/hooks/post_tool_use.py` exists after install
- Dependencies: Task 2

**Task 6 — Refactor launchers download** `S`
- File: `install.sh`, Step 9 (lines 195–215)
- Code sample:
  ```bash
  # macOS:
  fetch_file "launchers/com.efficlaude.worker.plist" "$HOME/.efficlaude/com.efficlaude.worker.plist"
  # Linux:
  fetch_file "launchers/efficlaude-worker.service" "$HOME/.efficlaude/efficlaude-worker.service"
  ```
- ⚠️ Breaking change: none
- Verify: `ls ~/.efficlaude/com.efficlaude.worker.plist` exists after install on macOS
- Dependencies: Task 2

**Task 7 — Refactor etok build section** `S`
- File: `install.sh`, lines 148–161
- Code sample: replace internals of `if command -v cargo` block:
  ```bash
  if command -v cargo &>/dev/null; then
    if [ "$LOCAL_INSTALL" = true ]; then
      (cd "$SCRIPT_DIR/token-optimizer" && cargo build --release -q && cp target/release/etok "$BIN_DIR/etok")
    else
      TMPDIR_ETOK=$(mktemp -d)
      curl -fsSL "$BASE_URL/token-optimizer/Cargo.toml" -o "$TMPDIR_ETOK/Cargo.toml"
      mkdir -p "$TMPDIR_ETOK/src/filters"
      for f in main.rs; do
        curl -fsSL "$BASE_URL/token-optimizer/src/$f" -o "$TMPDIR_ETOK/src/$f"
      done
      for f in mod.rs generic.rs git.rs npm.rs docker.rs cargo.rs; do
        curl -fsSL "$BASE_URL/token-optimizer/src/filters/$f" -o "$TMPDIR_ETOK/src/filters/$f"
      done
      (cd "$TMPDIR_ETOK" && cargo build --release -q && cp target/release/etok "$BIN_DIR/etok")
      rm -rf "$TMPDIR_ETOK"
    fi
    ETOK_INSTALLED=true
    echo "  ✓ etok built from source"
  ```
- ⚠️ Breaking change: none — remote path unchanged
- Verify: `~/.efficlaude/bin/etok` exists after local install with Rust
- Dependencies: Task 1

**Task 8 — Refactor shell/effi-shell.sh download** `S`
- File: `install.sh`, line 175
- Code sample: `fetch_file "shell/effi-shell.sh" "$SHELL_DIR/effi-shell.sh"`
- ⚠️ Breaking change: none
- Verify: `ls ~/.efficlaude/shell/effi-shell.sh` exists after install
- Dependencies: Task 2

**Task 9 — Update README Install section** `S`
- File: `README.md`
- Code sample: replace current Install section (curl|bash one-liner) with:
  ```markdown
  ## Install

  ```bash
  git clone git@github.com:kaeltech-id/EffiClaude.git
  cd EffiClaude
  bash install.sh
  ```

  **Requirements:** Python 3.8+ · [Claude Code](https://claude.ai/code)
  **Optional:** Rust (token optimizer) · Node.js (Figma MCP) — auto-detected

  Installs commands to `~/.claude/commands/`, starts worker daemon, registers hooks, builds `etok`.
  ```
- ⚠️ Breaking change: removes curl|bash one-liner — correct since repo is private and that one-liner fails
- Verify: README renders correctly with new install steps
- Dependencies: none
