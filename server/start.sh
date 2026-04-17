#!/bin/bash

PIDFILE="$HOME/.efficlaude/worker.pid"
LOGFILE="$HOME/.efficlaude/worker.log"
WORKER="$HOME/.efficlaude/server/worker.py"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "EffiClaude worker already running (PID $(cat "$PIDFILE"))"
  exit 0
fi

nohup python3 "$WORKER" >> "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"
echo "EffiClaude worker started (PID $!)"
