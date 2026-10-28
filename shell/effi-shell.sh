#!/bin/bash
# EffiClaude shell wrappers — token-optimize common command output

ETOK="$HOME/.efficlaude/bin/etok"

# Inlined on purpose: a helper function does not survive every shell-snapshot
# mechanism, and a wrapper calling a missing helper breaks the real command.

# git — optimize status, log, diff, branch, stash list
git() {
  local sub="${1:-}"
  if [ -x "${ETOK:-}" ]; then
    case "$sub" in
      status|log|diff|branch|"stash")
        command git "$@" 2>&1 | "$ETOK" git "$@"
        return "${PIPESTATUS[0]}"
        ;;
    esac
  fi
  command git "$@"
}

# npm
npm() {
  local sub="${1:-}"
  if [ -x "${ETOK:-}" ]; then
    case "$sub" in
      install|i|add|ci)
        command npm "$@" 2>&1 | "$ETOK" npm "$@"
        return "${PIPESTATUS[0]}"
        ;;
    esac
  fi
  command npm "$@"
}

# yarn
yarn() {
  local sub="${1:-}"
  if [ -x "${ETOK:-}" ]; then
    case "$sub" in
      install|add)
        command yarn "$@" 2>&1 | "$ETOK" yarn "$@"
        return "${PIPESTATUS[0]}"
        ;;
    esac
  fi
  command yarn "$@"
}

# pnpm
pnpm() {
  local sub="${1:-}"
  if [ -x "${ETOK:-}" ]; then
    case "$sub" in
      install|add|i)
        command pnpm "$@" 2>&1 | "$ETOK" pnpm "$@"
        return "${PIPESTATUS[0]}"
        ;;
    esac
  fi
  command pnpm "$@"
}

# docker
docker() {
  local sub="${1:-}"
  if [ -x "${ETOK:-}" ]; then
    case "$sub" in
      ps|logs|build)
        command docker "$@" 2>&1 | "$ETOK" docker "$@"
        return "${PIPESTATUS[0]}"
        ;;
    esac
  fi
  command docker "$@"
}

# cargo
cargo() {
  local sub="${1:-}"
  if [ -x "${ETOK:-}" ]; then
    case "$sub" in
      test|build|check)
        command cargo "$@" 2>&1 | "$ETOK" cargo "$@"
        return "${PIPESTATUS[0]}"
        ;;
    esac
  fi
  command cargo "$@"
}
