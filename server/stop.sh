#!/bin/bash

PIDFILE="$HOME/.efficlaude/worker.pid"
WATCHDOG_PIDFILE="$HOME/.efficlaude/watchdog.pid"

# Stop watchdog first so it doesn't restart the worker after we kill it
if [ -f "$WATCHDOG_PIDFILE" ]; then
  WD_PID=$(cat "$WATCHDOG_PIDFILE")
  if kill -0 "$WD_PID" 2>/dev/null; then
    kill "$WD_PID"
    rm "$WATCHDOG_PIDFILE"
    echo "EffiClaude watchdog stopped (PID $WD_PID)"
  else
    rm "$WATCHDOG_PIDFILE"
  fi
fi

PLIST="$HOME/Library/LaunchAgents/com.efficlaude.worker.plist"
if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null && \
    echo "EffiClaude LaunchAgent unloaded (run install.sh or 'launchctl load' to re-enable)"
fi

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    rm "$PIDFILE"
    echo "EffiClaude worker stopped (PID $PID)"
  else
    rm "$PIDFILE"
    echo "Worker was not running."
  fi
else
  echo "No worker PID file found."
fi
