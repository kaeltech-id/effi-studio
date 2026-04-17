#!/bin/bash

set -e

COMMANDS_DIR="$HOME/.claude/commands"
REPO="kaeltech-id/EffiClaude"
BRANCH="main"
COMMANDS=("setup" "feature" "execute" "review" "git")

echo "Installing EffiClaude commands..."

mkdir -p "$COMMANDS_DIR"

for cmd in "${COMMANDS[@]}"; do
  curl -fsSL "https://raw.githubusercontent.com/$REPO/$BRANCH/commands/$cmd.md" \
    -o "$COMMANDS_DIR/$cmd.md"
  echo "  ✓ /$cmd"
done

echo ""
echo "Done! Commands installed to $COMMANDS_DIR"
echo ""
echo "Next steps:"
echo "  1. Open your project folder in Claude Code"
echo "  2. Run /setup to configure the project"
echo "  3. Start with /feature"
