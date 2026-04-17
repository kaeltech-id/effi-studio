#!/bin/bash

PIDFILE="$HOME/.efficlaude/worker.pid"

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
