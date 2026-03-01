#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-5173}"
HOST="${2:-127.0.0.1}"

PIDS="$(pgrep -f "vite --host ${HOST} --port ${PORT}" || true)"
if [[ -n "$PIDS" ]]; then
  echo "[DevRestart] Stopping existing Vite process on ${HOST}:${PORT}"
  kill $PIDS
  sleep 1
fi

echo "[DevRestart] Starting Vite on ${HOST}:${PORT}"
npm run dev -- --host "$HOST" --port "$PORT"
