#!/bin/bash

set -e

REPO="kaeltech-id/EffiClaude"
BRANCH="main"
EFFICLAUDE_HOME="$HOME/.efficlaude"
COMMANDS_DIR="$HOME/.claude/commands"
AGENTS_DIR="$HOME/.claude/agents"
HOOKS_DIR="$HOME/.efficlaude/hooks"
SERVER_DIR="$HOME/.efficlaude/server"
BIN_DIR="$HOME/.efficlaude/bin"
SHELL_DIR="$HOME/.efficlaude/shell"
COMMANDS=("ec-setup" "ec-feature" "ec-brainstorm" "ec-execute" "ec-review" "ec-git" "ec-export" "ec-import" "ec-mode" "ec-next" "ec-selfhealing")
AGENTS=("ec-react" "ec-vue" "ec-nextjs" "ec-typescript" "ec-tailwind" "ec-react-native" "ec-flutter" "ec-ios" "ec-android" "ec-mobile-perf" "ec-python" "ec-nodejs" "ec-golang" "ec-java" "ec-php" "ec-sql" "ec-nosql" "ec-migration" "ec-unit-test" "ec-e2e" "ec-api-test" "ec-docker" "ec-cicd" "ec-cloud" "ec-security" "ec-performance" "ec-refactor" "ec-reviewer" "ec-api-design" "ec-architect" "ec-llm" "ec-antislop")
SERVER_FILES=("worker.py" "memory.py" "embedder.py" "docs.py" "graph.py" "logger.py" "file_lock.py" "purge_noise.py" "requirements.txt" "start.sh" "stop.sh" "watchdog.sh")
HOOK_FILES=("post_tool_use.py" "session_stop.py" "prompt_submit.py" "commit-msg")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_INSTALL=false
[ -f "$SCRIPT_DIR/commands/ec-setup.md" ] && LOCAL_INSTALL=true

fetch_file() {
  local rel="$1" dest="$2"
  if [ "$LOCAL_INSTALL" = true ]; then
    cp "$SCRIPT_DIR/$rel" "$dest"
  else
    curl -fsSL "$BASE_URL/$rel" -o "$dest"
  fi
}

BASE_URL="https://raw.githubusercontent.com/$REPO/$BRANCH"

echo "Installing EffiClaude..."
echo ""
[ "$LOCAL_INSTALL" = true ] && echo "  (local install — copying from repo)"

# ── 1. Check Python ───────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "✗ Python 3 not found. Please install Python 3.8+ and re-run."
  exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 8 ]; }; then
  echo "✗ Python 3.8+ required (found $PYTHON_VERSION). Please upgrade Python."
  exit 1
fi

echo "  ✓ Python $PYTHON_VERSION"

# ── 1b. Check Node.js (optional — for Figma MCP) ─────────────────────────────
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  echo "  ✓ Node.js $NODE_VERSION (Figma MCP supported)"
else
  echo "  ℹ Node.js not found — Figma MCP unavailable. Install Node.js to enable it."
fi

# ── 2. Create directories ─────────────────────────────────────────────────────
mkdir -p "$COMMANDS_DIR" "$AGENTS_DIR" "$HOOKS_DIR" "$SERVER_DIR" "$BIN_DIR" "$SHELL_DIR" "$EFFICLAUDE_HOME/chroma"

# ── 3. Install Claude commands ────────────────────────────────────────────────
echo ""
echo "Installing commands..."
for cmd in "${COMMANDS[@]}"; do
  fetch_file "commands/$cmd.md" "$COMMANDS_DIR/$cmd.md"
  echo "  ✓ /$cmd"
done
fetch_file "VERSION" "$EFFICLAUDE_HOME/VERSION"
echo "  ✓ VERSION"

LEGACY_COMMANDS=("setup" "feature" "brainstorm" "execute" "review" "git" "design")
for cmd in "${LEGACY_COMMANDS[@]}"; do
  LEGACY_FILE="${COMMANDS_DIR:?}/${cmd:?}.md"
  if [ -f "$LEGACY_FILE" ]; then
    rm -f "$LEGACY_FILE"
    echo "  ✓ removed legacy /$cmd (superseded by /ec-$cmd)"
  fi
done

# ── 3b. Install Claude agents ─────────────────────────────────────────────────
echo ""
echo "Installing agents..."
for agent in "${AGENTS[@]}"; do
  fetch_file "agents/$agent.md" "$AGENTS_DIR/$agent.md"
  echo "  ✓ @$agent"
done

# ── 4. Install server files ───────────────────────────────────────────────────
echo ""
echo "Installing worker service..."
for file in "${SERVER_FILES[@]}"; do
  fetch_file "server/$file" "$SERVER_DIR/$file"
  echo "  ✓ server/$file"
done
chmod +x "$SERVER_DIR/start.sh" "$SERVER_DIR/stop.sh" "$SERVER_DIR/watchdog.sh"

# ── 5. Install hooks ──────────────────────────────────────────────────────────
echo ""
echo "Installing hooks..."
for file in "${HOOK_FILES[@]}"; do
  fetch_file "hooks/$file" "$HOOKS_DIR/$file"
  chmod +x "$HOOKS_DIR/$file"
  echo "  ✓ hooks/$file"
done

# Install commit-msg hook into current project's .git/hooks/
if git rev-parse --git-dir > /dev/null 2>&1; then
  GIT_HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
  cp "$HOOKS_DIR/commit-msg" "$GIT_HOOKS_DIR/commit-msg"
  chmod +x "$GIT_HOOKS_DIR/commit-msg"
  echo "  ✓ commit-msg hook installed in .git/hooks/"
fi

# ── 6. Install Python dependencies ───────────────────────────────────────────
echo ""
echo "Installing Python dependencies..."
pip3 install -q -r "$SERVER_DIR/requirements.txt" \
  || { echo "  ✗ Failed to install Python dependencies. Check requirements.txt."; exit 1; }
echo "  ✓ Python dependencies installed"

# ── 7. Register hooks in ~/.claude/settings.json ─────────────────────────────
echo ""
echo "Registering hooks..."

SETTINGS_FILE="$HOME/.claude/settings.json"

python3 - <<PYEOF
import json, os

settings_path = "$SETTINGS_FILE"
hooks_dir = "$HOOKS_DIR"

if os.path.exists(settings_path):
    with open(settings_path) as f:
        settings = json.load(f)
else:
    settings = {}

settings.setdefault("hooks", {})

settings["hooks"]["PostToolUse"] = [
    {
        "matcher": "Write|Edit|MultiEdit|Bash",
        "hooks": [{"type": "command", "command": f"python3 {hooks_dir}/post_tool_use.py"}]
    }
]
settings["hooks"]["Stop"] = [
    {
        "hooks": [{"type": "command", "command": f"python3 {hooks_dir}/session_stop.py"}]
    }
]
settings["hooks"]["UserPromptSubmit"] = [
    {
        "hooks": [{"type": "command", "command": f"python3 {hooks_dir}/prompt_submit.py"}]
    }
]
settings["statusCommand"] = "mode=$(cat .claude/.mode 2>/dev/null || echo 'structured'); [ \"$mode\" = 'vibe' ] && echo '⚡ vibe' || echo ''"

os.makedirs(os.path.dirname(settings_path), exist_ok=True)
with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)

print("  ✓ Hooks registered in ~/.claude/settings.json")
PYEOF

# ── 8. Install token optimizer (etok) ────────────────────────────────────────
echo ""
echo "Installing token optimizer (etok)..."

# Source cargo env so rustup-installed cargo is visible in non-interactive shells
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
export PATH="$HOME/.cargo/bin:$PATH"

PLATFORM="$(uname -s)-$(uname -m)"
ETOK_INSTALLED=false

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
else
  RELEASE_URL="https://github.com/$REPO/releases/latest/download/etok-$PLATFORM"
  if curl -fsSL "$RELEASE_URL" -o "$BIN_DIR/etok" 2>/dev/null; then
    chmod +x "$BIN_DIR/etok"
    ETOK_INSTALLED=true
    echo "  ✓ etok downloaded (pre-built binary)"
  else
    echo "  ℹ etok skipped — install Rust (https://rustup.rs) and re-run to enable token optimization"
  fi
fi

if [ "$ETOK_INSTALLED" = true ]; then
  chmod +x "$BIN_DIR/etok"
  fetch_file "shell/effi-shell.sh" "$SHELL_DIR/effi-shell.sh"

  for RC in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ -f "$RC" ] && ! grep -q "effi-shell.sh" "$RC"; then
      echo '' >> "$RC"
      echo '# EffiClaude token optimizer' >> "$RC"
      echo 'source "$HOME/.efficlaude/shell/effi-shell.sh"' >> "$RC"
    fi
  done
  echo "  ✓ Shell wrappers installed (git, npm, yarn, pnpm, docker, cargo)"
fi

# ── 9. Register daemon ────────────────────────────────────────────────────────
echo ""
echo "Registering auto-start daemon..."

if [[ "$OSTYPE" == "darwin"* ]]; then
  PLIST_DEST="$HOME/Library/LaunchAgents/com.efficlaude.worker.plist"

  fetch_file "launchers/com.efficlaude.worker.plist" "$HOME/.efficlaude/com.efficlaude.worker.plist"

  sed "s|EFFICLAUDE_HOME|$EFFICLAUDE_HOME|g" \
    "$HOME/.efficlaude/com.efficlaude.worker.plist" > "$PLIST_DEST"

  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  launchctl load "$PLIST_DEST"
  echo "  ✓ macOS launchd daemon registered (auto-starts on login)"

elif command -v systemctl &>/dev/null; then
  SERVICE_DEST="$HOME/.config/systemd/user/efficlaude-worker.service"
  mkdir -p "$(dirname "$SERVICE_DEST")"

  fetch_file "launchers/efficlaude-worker.service" "$HOME/.efficlaude/efficlaude-worker.service"

  sed "s|EFFICLAUDE_HOME|$EFFICLAUDE_HOME|g" \
    "$HOME/.efficlaude/efficlaude-worker.service" > "$SERVICE_DEST"

  systemctl --user daemon-reload
  systemctl --user enable --now efficlaude-worker
  echo "  ✓ systemd user service registered (auto-starts on login)"

else
  echo "  ℹ Daemon auto-start not configured for this OS."
  echo "    Start manually with: python3 ~/.efficlaude/server/worker.py &"
fi

# ── 10. Restart worker (stop + start to load new code) ───────────────────────
echo ""
echo "Restarting worker..."
bash "$SERVER_DIR/stop.sh" 2>/dev/null || true
sleep 1
bash "$SERVER_DIR/start.sh"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "Done! EffiClaude installed."
echo ""
echo "Next steps:"
echo "  1. Open your project folder in Claude Code"
echo "  2. Run /ec-setup to configure the project"
echo "     - Provide your Figma API key to enable Figma MCP (paste any Figma frame link in /ec-feature)"
echo "  3. Start with /ec-feature"
