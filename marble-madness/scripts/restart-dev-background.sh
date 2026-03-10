#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-5173}"
HOST="${2:-127.0.0.1}"
LOG_FILE="${3:-dev.log}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PIDS="$(pgrep -f "vite --host ${HOST} --port ${PORT}" || true)"
if [[ -n "$PIDS" ]]; then
  echo "[DevRestartBg] Stopping existing Vite process on ${HOST}:${PORT}"
  kill $PIDS
  sleep 1
fi

cd "$PROJECT_DIR"
echo "[DevRestartBg] Starting Vite on ${HOST}:${PORT} in background"
nohup ./node_modules/.bin/vite --host "$HOST" --port "$PORT" > "$LOG_FILE" 2>&1 &
echo "[DevRestartBg] Vite PID $!"
