#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${OBSERVE_ROOT:-/tmp/space-force-observe}"
APP_NAME="${OBSERVE_PM2_APP:-space-force-colyseus}"
DEFAULT_OPS_URL="${OBSERVE_OPS_URL:-http://127.0.0.1:2567/ops/stats}"
DEFAULT_OPS_TOKEN="${OBSERVE_OPS_TOKEN:-}"
DEFAULT_INTERVAL_SEC="${OBSERVE_INTERVAL_SEC:-2}"
DEFAULT_IFACE="${OBSERVE_IFACE:-}"

log() {
  echo "[space-force-observe] $*"
}

usage() {
  cat <<'EOF'
Usage:
  space-force-observe.sh start <runId> [--ops-url <url>] [--ops-token <token>] [--interval-sec <n>] [--iface <name>] [--pm2-app <name>]
  space-force-observe.sh stop <runId>
  space-force-observe.sh status <runId>
  space-force-observe.sh pack <runId>
EOF
}

ensure_run_id() {
  local run_id="$1"
  if [[ ! "$run_id" =~ ^[A-Za-z0-9._-]+$ ]]; then
    log "Invalid runId: $run_id"
    exit 1
  fi
}

run_dir() {
  local run_id="$1"
  echo "$ROOT_DIR/$run_id"
}

pid_file_path() {
  local run_id="$1"
  local kind="$2"
  echo "$(run_dir "$run_id")/$kind.pid"
}

is_pid_running() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return 1
  fi
  kill -0 "$pid" >/dev/null 2>&1
}

update_meta_json() {
  local run_id="$1"
  local field="$2"
  local value="$3"
  local meta_path
  meta_path="$(run_dir "$run_id")/meta.json"
  if command -v jq >/dev/null 2>&1; then
    local tmp_path
    tmp_path="${meta_path}.tmp"
    if [[ -f "$meta_path" ]]; then
      jq --arg field "$field" --arg value "$value" '.[$field] = $value' "$meta_path" >"$tmp_path" 2>/dev/null || true
    else
      echo '{}' >"$tmp_path"
      jq --arg field "$field" --arg value "$value" '.[$field] = $value' "$tmp_path" >"${tmp_path}.2" 2>/dev/null || true
      mv -f "${tmp_path}.2" "$tmp_path" 2>/dev/null || true
    fi
    if [[ -f "$tmp_path" ]]; then
      mv -f "$tmp_path" "$meta_path"
      return
    fi
  fi
  log "jq not available; skipping meta update field=$field"
}

default_iface() {
  if [[ -n "$DEFAULT_IFACE" ]]; then
    echo "$DEFAULT_IFACE"
    return
  fi
  local detected
  detected="$(ip route show default 2>/dev/null | awk '/default/ {print $5; exit}')"
  if [[ -n "$detected" ]]; then
    echo "$detected"
  else
    echo "eth0"
  fi
}

resolve_nvm_node_bin() {
  local home_dir="${HOME:-/root}"
  ls -1d "$home_dir"/.nvm/versions/node/*/bin 2>/dev/null | sort | tail -n 1
}

resolve_pm2_home() {
  if [[ -n "${PM2_HOME:-}" ]]; then
    echo "$PM2_HOME"
    return
  fi
  local home_dir="${HOME:-/root}"
  echo "$home_dir/.pm2"
}

resolve_pm2_bin() {
  if command -v pm2 >/dev/null 2>&1; then
    command -v pm2
    return
  fi
  local node_bin
  node_bin="$(resolve_nvm_node_bin)"
  if [[ -n "$node_bin" && -x "$node_bin/pm2" ]]; then
    echo "$node_bin/pm2"
    return
  fi
  echo ""
}

start_metrics_loop() {
  local run_id="$1"
  local ops_url="$2"
  local ops_token="$3"
  local interval_sec="$4"
  local iface="$5"

  local dir
  dir="$(run_dir "$run_id")"
  local loop_script="$dir/.metrics-loop.sh"
  local metrics_log="$dir/metrics.log"

  cat >"$loop_script" <<EOF
#!/usr/bin/env bash
set -u

APP_NAME='$APP_NAME'
OPS_URL='$ops_url'
OPS_TOKEN='$ops_token'
INTERVAL_SEC='$interval_sec'
IFACE='$iface'
METRICS_LOG='$metrics_log'
HAS_JQ=0
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=1
fi

resolve_nvm_node_bin() {
  local home_dir="\${HOME:-/root}"
  ls -1d "\$home_dir"/.nvm/versions/node/*/bin 2>/dev/null | sort | tail -n 1
}

resolve_pm2_home() {
  if [[ -n "\${PM2_HOME:-}" ]]; then
    echo "\$PM2_HOME"
    return
  fi
  local home_dir="\${HOME:-/root}"
  echo "\$home_dir/.pm2"
}

resolve_pm2_bin() {
  if command -v pm2 >/dev/null 2>&1; then
    command -v pm2
    return
  fi
  local node_bin
  node_bin="\$(resolve_nvm_node_bin)"
  if [[ -n "\$node_bin" && -x "\$node_bin/pm2" ]]; then
    echo "\$node_bin/pm2"
    return
  fi
  echo ""
}

prepare_pm2_runtime() {
  local node_bin
  node_bin="\$(resolve_nvm_node_bin)"
  if [[ -n "\$node_bin" ]]; then
    PATH="\$node_bin:\$PATH"
    export PATH
  fi
  PM2_HOME="\$(resolve_pm2_home)"
  export PM2_HOME
}

read_iface_counters() {
  local line
  line="\$(awk -v i="\$IFACE" '\$1 ~ (i":") {print \$2 " " \$10; exit}' /proc/net/dev 2>/dev/null)"
  if [[ -z "\$line" ]]; then
    echo "0 0"
  else
    echo "\$line"
  fi
}

read -r prev_rx prev_tx <<< "\$(read_iface_counters)"

prepare_pm2_runtime
pm2_bin="\$(resolve_pm2_bin)"

while true; do
  ts="\$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  load1="\$(awk '{print \$1}' /proc/loadavg 2>/dev/null)"
  if [[ -z "\$load1" ]]; then
    load1="0"
  fi

  mem_line="\$(awk '/MemTotal/{t=\$2} /MemAvailable/{a=\$2} END {if (t > 0) {u=t-a; printf "%.1f %.2f", u/1024, (u*100/t)} else {printf "0.0 0.00"}}' /proc/meminfo 2>/dev/null)"
  read -r mem_used_mb mem_used_pct <<< "\$mem_line"
  if [[ -z "\$mem_used_mb" ]]; then
    mem_used_mb="0"
  fi
  if [[ -z "\$mem_used_pct" ]]; then
    mem_used_pct="0"
  fi

  pm2_values="-1 -1 -1"
  if [[ "\$HAS_JQ" -eq 1 && -n "\$pm2_bin" ]]; then
    pm2_json="\$("\$pm2_bin" jlist 2>/dev/null || true)"
    if [[ -n "\$pm2_json" ]]; then
      pm2_values="\$(printf '%s' "\$pm2_json" | jq -r --arg app "\$APP_NAME" '
        (
          [.[] | select(.name == \$app) | {
            cpu: (.monit.cpu // 0),
            memMb: ((.monit.memory // 0) / 1048576),
            restarts: (.pm2_env.restart_time // 0)
          }] | .[0]
        ) // {cpu: -1, memMb: -1, restarts: -1}
        | "\(.cpu) \(.memMb) \(.restarts)"
      ' 2>/dev/null || echo '-1 -1 -1')"
    fi
  fi
  read -r pm2_cpu pm2_mem_mb pm2_restarts <<< "\$pm2_values"

  if [[ -n "\$OPS_TOKEN" ]]; then
    ops_json="\$(curl -fsS -H "x-ops-token: \${OPS_TOKEN}" "\$OPS_URL" 2>/dev/null || echo '{}')"
  else
    ops_json="\$(curl -fsS "\$OPS_URL" 2>/dev/null || echo '{}')"
  fi
  ops_values="-1 -1 -1 -1"
  if [[ "\$HAS_JQ" -eq 1 ]]; then
    ops_values="\$(printf '%s' "\$ops_json" | jq -r '
      [
        (.clients.active // -1),
        (.rooms.active // -1),
        (.clients.leftUnconsentedTotal // -1),
        (.rttMs.p95 // -1)
      ] | @tsv
    ' 2>/dev/null | tr '\t' ' ' || echo '-1 -1 -1 -1')"
    if [[ -z "\$ops_values" ]]; then
      ops_values="-1 -1 -1 -1"
    fi
  fi
  read -r ops_clients ops_rooms ops_unconsented ops_rtt_p95 <<< "\$ops_values"

  read -r rx tx <<< "\$(read_iface_counters)"
  drx=\$((rx - prev_rx))
  dtx=\$((tx - prev_tx))
  if (( drx < 0 )); then drx=0; fi
  if (( dtx < 0 )); then dtx=0; fi
  prev_rx=\$rx
  prev_tx=\$tx
  rx_bps=\$((drx / INTERVAL_SEC))
  tx_bps=\$((dtx / INTERVAL_SEC))

  echo "\$ts host.load1=\$load1 host.memUsedMB=\$mem_used_mb host.memUsedPct=\$mem_used_pct pm2.cpuPct=\$pm2_cpu pm2.memMB=\$pm2_mem_mb pm2.restarts=\$pm2_restarts ops.clients=\$ops_clients ops.rooms=\$ops_rooms ops.leftUnconsented=\$ops_unconsented ops.rttP95ms=\$ops_rtt_p95 net.rxBps=\$rx_bps net.txBps=\$tx_bps" >> "\$METRICS_LOG"
  sleep "\$INTERVAL_SEC"
done
EOF

  chmod +x "$loop_script"
  nohup "$loop_script" >/dev/null 2>&1 &
  echo "$!" >"$(pid_file_path "$run_id" "metrics")"
}

start_pm2_log_stream() {
  local run_id="$1"
  local dir
  dir="$(run_dir "$run_id")"

  local pm2_bin
  local pm2_home
  local node_bin

  pm2_bin="$(resolve_pm2_bin)"
  pm2_home="$(resolve_pm2_home)"
  node_bin="$(resolve_nvm_node_bin)"

  if [[ -z "$pm2_bin" ]]; then
    log "PM2 binary not found for app stream: $APP_NAME"
    return
  fi

  local path_for_pm2="$PATH"
  if [[ -n "$node_bin" ]]; then
    path_for_pm2="$node_bin:$path_for_pm2"
  fi

  nohup env PATH="$path_for_pm2" PM2_HOME="$pm2_home" "$pm2_bin" logs "$APP_NAME" --time --lines 0 >>"$dir/pm2.log" 2>&1 &
  echo "$!" >"$(pid_file_path "$run_id" "pm2")"
}

start_kernel_log_stream() {
  local run_id="$1"
  local dir
  dir="$(run_dir "$run_id")"
  nohup bash -lc "dmesg -wT 2>/dev/null | grep -Ei 'killed process|out of memory|oom|segfault'" >>"$dir/kernel.log" 2>&1 &
  echo "$!" >"$(pid_file_path "$run_id" "kernel")"
}

stop_worker() {
  local run_id="$1"
  local kind="$2"
  local pid_file
  pid_file="$(pid_file_path "$run_id" "$kind")"
  if [[ ! -f "$pid_file" ]]; then
    return
  fi
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if is_pid_running "$pid"; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 0.2
    if is_pid_running "$pid"; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  fi
  rm -f "$pid_file"
}

cmd_start() {
  local run_id="$1"
  shift

  local ops_url="$DEFAULT_OPS_URL"
  local ops_token="$DEFAULT_OPS_TOKEN"
  local interval_sec="$DEFAULT_INTERVAL_SEC"
  local iface
  iface="$(default_iface)"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ops-url)
        ops_url="$2"
        shift 2
        ;;
      --ops-token)
        ops_token="$2"
        shift 2
        ;;
      --interval-sec)
        interval_sec="$2"
        shift 2
        ;;
      --iface)
        iface="$2"
        shift 2
        ;;
      --pm2-app)
        APP_NAME="$2"
        shift 2
        ;;
      *)
        log "Unknown start flag: $1"
        exit 1
        ;;
    esac
  done

  mkdir -p "$ROOT_DIR"
  local dir
  dir="$(run_dir "$run_id")"
  mkdir -p "$dir"
  : >"$dir/pm2.log"
  : >"$dir/kernel.log"
  : >"$dir/metrics.log"

  local pm2_home
  pm2_home="$(resolve_pm2_home)"

  cat >"$dir/meta.json" <<EOF
{
  "runId": "$run_id",
  "startedAtIso": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "observerRoot": "$ROOT_DIR",
  "pm2App": "$APP_NAME",
  "pm2Home": "$pm2_home",
  "opsUrl": "$ops_url",
  "intervalSec": $interval_sec,
  "iface": "$iface"
}
EOF

  stop_worker "$run_id" "pm2"
  stop_worker "$run_id" "kernel"
  stop_worker "$run_id" "metrics"

  start_pm2_log_stream "$run_id"
  start_kernel_log_stream "$run_id"
  start_metrics_loop "$run_id" "$ops_url" "$ops_token" "$interval_sec" "$iface"

  update_meta_json "$run_id" "observerStartedAtIso" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  log "Started observer for runId=$run_id root=$dir"
}

cmd_stop() {
  local run_id="$1"
  stop_worker "$run_id" "pm2"
  stop_worker "$run_id" "kernel"
  stop_worker "$run_id" "metrics"
  update_meta_json "$run_id" "stoppedAtIso" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  log "Stopped observer for runId=$run_id"
}

cmd_status() {
  local run_id="$1"
  local kinds=(pm2 kernel metrics)
  local any_running=0
  for kind in "${kinds[@]}"; do
    local pid_file
    pid_file="$(pid_file_path "$run_id" "$kind")"
    local state="stopped"
    local pid="none"
    if [[ -f "$pid_file" ]]; then
      pid="$(cat "$pid_file" 2>/dev/null || true)"
      if is_pid_running "$pid"; then
        state="running"
        any_running=1
      fi
    fi
    echo "$kind pid=$pid state=$state"
  done
  if [[ $any_running -eq 1 ]]; then
    exit 0
  fi
  exit 1
}

cmd_pack() {
  local run_id="$1"
  local dir
  dir="$(run_dir "$run_id")"
  if [[ ! -d "$dir" ]]; then
    log "Run directory not found: $dir"
    exit 1
  fi
  local archive_path="$ROOT_DIR/$run_id.tar.gz"
  tar -czf "$archive_path" -C "$ROOT_DIR" "$run_id"
  update_meta_json "$run_id" "packedAtIso" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  update_meta_json "$run_id" "archivePath" "$archive_path"
  log "Packed artifacts: $archive_path"
}

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

command_name="$1"
run_id="$2"
shift 2
ensure_run_id "$run_id"

case "$command_name" in
  start)
    cmd_start "$run_id" "$@"
    ;;
  stop)
    cmd_stop "$run_id"
    ;;
  status)
    cmd_status "$run_id"
    ;;
  pack)
    cmd_pack "$run_id"
    ;;
  *)
    usage
    exit 1
    ;;
esac
