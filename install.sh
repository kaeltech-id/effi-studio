#!/bin/bash

set -e

REPO="kaeltech-id/EffiClaude"
BRANCH="main"
EFFICLAUDE_HOME="$HOME/.efficlaude"
COMMANDS_DIR="$HOME/.claude/commands"
HOOKS_DIR="$HOME/.efficlaude/hooks"
SERVER_DIR="$HOME/.efficlaude/server"
COMMANDS=("setup" "feature" "execute" "review" "git")
SERVER_FILES=("worker.py" "memory.py" "docs.py" "requirements.txt" "start.sh" "stop.sh")
HOOK_FILES=("post_tool_use.py" "session_stop.py" "prompt_submit.py")

BASE_URL="https://raw.githubusercontent.com/$REPO/$BRANCH"

echo "Installing EffiClaude..."
echo ""

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

# ── 2. Create directories ─────────────────────────────────────────────────────
mkdir -p "$COMMANDS_DIR" "$HOOKS_DIR" "$SERVER_DIR" "$EFFICLAUDE_HOME/chroma"

# ── 3. Install Claude commands ────────────────────────────────────────────────
echo ""
echo "Installing commands..."
for cmd in "${COMMANDS[@]}"; do
  curl -fsSL "$BASE_URL/commands/$cmd.md" -o "$COMMANDS_DIR/$cmd.md"
  echo "  ✓ /$cmd"
done

# ── 4. Install server files ───────────────────────────────────────────────────
echo ""
echo "Installing worker service..."
for file in "${SERVER_FILES[@]}"; do
  curl -fsSL "$BASE_URL/server/$file" -o "$SERVER_DIR/$file"
  echo "  ✓ server/$file"
done
chmod +x "$SERVER_DIR/start.sh" "$SERVER_DIR/stop.sh"

# ── 5. Install hooks ──────────────────────────────────────────────────────────
echo ""
echo "Installing hooks..."
for file in "${HOOK_FILES[@]}"; do
  curl -fsSL "$BASE_URL/hooks/$file" -o "$HOOKS_DIR/$file"
  chmod +x "$HOOKS_DIR/$file"
  echo "  ✓ hooks/$file"
done

# ── 6. Install Python dependencies ───────────────────────────────────────────
echo ""
echo "Installing Python dependencies..."
pip3 install -q -r "$SERVER_DIR/requirements.txt"
echo "  ✓ flask, chromadb, requests installed"

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

os.makedirs(os.path.dirname(settings_path), exist_ok=True)
with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)

print("  ✓ Hooks registered in ~/.claude/settings.json")
PYEOF

# ── 8. Register daemon ────────────────────────────────────────────────────────
echo ""
echo "Registering auto-start daemon..."

if [[ "$OSTYPE" == "darwin"* ]]; then
  PLIST_SRC="$HOME/.efficlaude/server/../launchers/com.efficlaude.worker.plist"
  PLIST_DEST="$HOME/Library/LaunchAgents/com.efficlaude.worker.plist"

  curl -fsSL "$BASE_URL/launchers/com.efficlaude.worker.plist" \
    -o "$HOME/.efficlaude/com.efficlaude.worker.plist"

  sed "s|EFFICLAUDE_HOME|$EFFICLAUDE_HOME|g" \
    "$HOME/.efficlaude/com.efficlaude.worker.plist" > "$PLIST_DEST"

  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  launchctl load "$PLIST_DEST"
  echo "  ✓ macOS launchd daemon registered (auto-starts on login)"

elif command -v systemctl &>/dev/null; then
  SERVICE_DEST="$HOME/.config/systemd/user/efficlaude-worker.service"
  mkdir -p "$(dirname "$SERVICE_DEST")"

  curl -fsSL "$BASE_URL/launchers/efficlaude-worker.service" \
    -o "$HOME/.efficlaude/efficlaude-worker.service"

  sed "s|EFFICLAUDE_HOME|$EFFICLAUDE_HOME|g" \
    "$HOME/.efficlaude/efficlaude-worker.service" > "$SERVICE_DEST"

  systemctl --user daemon-reload
  systemctl --user enable --now efficlaude-worker
  echo "  ✓ systemd user service registered (auto-starts on login)"

else
  echo "  ℹ Daemon auto-start not configured for this OS."
  echo "    Start manually with: python3 ~/.efficlaude/server/worker.py &"
fi

# ── 9. Start worker now ───────────────────────────────────────────────────────
echo ""
bash "$SERVER_DIR/start.sh"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "Done! EffiClaude installed."
echo ""
echo "Next steps:"
echo "  1. Open your project folder in Claude Code"
echo "  2. Run /setup to configure the project"
echo "  3. Start with /feature"
