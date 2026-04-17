#!/bin/bash

WORKER="$HOME/.efficlaude/server/worker.py"
LOGFILE="$HOME/.efficlaude/worker.log"
PIDFILE="$HOME/.efficlaude/worker.pid"
WATCHDOG_PIDFILE="$HOME/.efficlaude/watchdog.pid"

echo $$ > "$WATCHDOG_PIDFILE"
trap "rm -f $WATCHDOG_PIDFILE" EXIT

BACKOFF=3
MAX_BACKOFF=30

while true; do
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    sleep 5
    continue
  fi
  echo "[$(date)] Starting worker..." >> "$LOGFILE"
  python3 "$WORKER" >> "$LOGFILE" 2>&1 &
  WORKER_PID=$!
  echo $WORKER_PID > "$PIDFILE"
  wait $WORKER_PID 2>/dev/null
  EXIT_CODE=$?
  [ $EXIT_CODE -eq 0 ] && break
  echo "[$(date)] Worker crashed (exit $EXIT_CODE). Restart in ${BACKOFF}s..." >> "$LOGFILE"
  sleep $BACKOFF
  BACKOFF=$((BACKOFF * 2))
  [ $BACKOFF -gt $MAX_BACKOFF ] && BACKOFF=$MAX_BACKOFF
done
