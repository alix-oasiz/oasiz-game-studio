# Astro Party Server Monitoring Command Reference

This guide assumes split-host operation:

- Server runs on droplet
- Loadtest runs on local machine

Local convention:

```bash
cd astro-party/server
```

Run local commands from that directory without extra `cd` hops.

## Server-side Commands (droplet)

### 1) PM2 dashboard (interactive)

```bash
pm2 monit
```

### 2) Colyseus process logs (with timestamps)

```bash
pm2 logs astro-party-colyseus --time --lines 0
```

### 3) Focused disconnect signal stream

```bash
pm2 logs astro-party-colyseus --time --lines 0 | grep -E "AstroPartyRoom.onLeave|consented=false"
```

### 4) Kernel crash/OOM watcher

```bash
sudo dmesg -wT | grep -Ei "killed process|out of memory|oom|segfault"
```

### 5) Ops stats quick watcher (no token)

```bash
watch -n 1 'curl -fsS http://127.0.0.1:2567/ops/stats | jq "{t:.generatedAtIso, active:.clients.active, leftTotal:.clients.leftTotal, leftConsented:.clients.leftConsentedTotal, leftUnconsented:.clients.leftUnconsentedTotal, lastUnconsented:(.clients.recentLeaves|map(select(.consented==false))|last), rooms:.rooms.active, rttP95:.rttMs.p95}"'
```

### 6) Ops stats quick watcher (with token)

```bash
OPS_TOKEN="replace-with-ops-token"
watch -n 1 "curl -fsS -H 'x-ops-token: ${OPS_TOKEN}' http://127.0.0.1:2567/ops/stats | jq '{t:.generatedAtIso, active:.clients.active, leftTotal:.clients.leftTotal, leftConsented:.clients.leftConsentedTotal, leftUnconsented:.clients.leftUnconsentedTotal, lastUnconsented:(.clients.recentLeaves|map(select(.consented==false))|last), rooms:.rooms.active, rttP95:.rttMs.p95}'"
```

### 7) One-off compact ops snapshot

```bash
curl -fsS http://127.0.0.1:2567/ops/stats | jq '{t:.generatedAtIso, clients:.clients, rooms:.rooms, rtt:.rttMs}'
```

### 8) Persist PM2 logs to file (ongoing)

Keep this running during test. Stop with `Ctrl+C`.

```bash
pm2 logs astro-party-colyseus --time --lines 0 | tee -a /tmp/astro-party-colyseus-live.log
```

### 9) Host load quick view

```bash
vmstat 1
```

### 10) Correlation stream logger (ongoing)

Requirements: `jq` installed on droplet.  
Optional: set `OPS_TOKEN` if `/ops/stats` requires token.

Keep this running during test. Stop with `Ctrl+C`.

```bash
LOG="/tmp/astro-correlation-$(date +%Y%m%d-%H%M%S).log"
IFACE="${IFACE:-$(ip route show default 2>/dev/null | awk '/default/ {print $5; exit}')}"
IFACE="${IFACE:-eth0}"
OPS_URL="${OPS_URL:-http://127.0.0.1:2567/ops/stats}"
OPS_TOKEN="${OPS_TOKEN:-}"
INTERVAL_SEC=2

read -r prev_rx prev_tx <<EOF
$(awk -v i="$IFACE" '$1 ~ (i":") {print $2, $10}' /proc/net/dev)
EOF
echo "writing ${LOG}"
echo "using interface ${IFACE}"

while true; do
  ts="$(date -Is)"
  load1="$(awk '{print $1}' /proc/loadavg)"
  mem_line="$(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END {u=t-a; printf "%.1f %.2f", u/1024, (u*100/t)}' /proc/meminfo)"
  mem_used_mb="$(echo "$mem_line" | awk '{print $1}')"
  mem_used_pct="$(echo "$mem_line" | awk '{print $2}')"

  pm2_json="$(pm2 jlist 2>/dev/null || echo '[]')"
  pm2_cpu="$(echo "$pm2_json" | jq -r '.[] | select(.name=="astro-party-colyseus") | (.monit.cpu // 0)' | head -n1)"
  pm2_mem_mb="$(echo "$pm2_json" | jq -r '.[] | select(.name=="astro-party-colyseus") | (((.monit.memory // 0)/1048576))' | head -n1)"
  pm2_restarts="$(echo "$pm2_json" | jq -r '.[] | select(.name=="astro-party-colyseus") | (.pm2_env.restart_time // 0)' | head -n1)"

  if [ -n "$OPS_TOKEN" ]; then
    ops_json="$(curl -fsS -H "x-ops-token: ${OPS_TOKEN}" "${OPS_URL}" 2>/dev/null || echo '{}')"
  else
    ops_json="$(curl -fsS "${OPS_URL}" 2>/dev/null || echo '{}')"
  fi
  ops_clients="$(echo "$ops_json" | jq -r '.clients.active // -1')"
  ops_unconsented="$(echo "$ops_json" | jq -r '.clients.leftUnconsentedTotal // -1')"
  ops_rooms="$(echo "$ops_json" | jq -r '.rooms.active // -1')"
  ops_rtt_p95="$(echo "$ops_json" | jq -r '.rttMs.p95 // -1')"

  read -r rx tx <<EOF
$(awk -v i="$IFACE" '$1 ~ (i":") {print $2, $10}' /proc/net/dev)
EOF
  drx=$((rx - prev_rx))
  dtx=$((tx - prev_tx))
  prev_rx=$rx
  prev_tx=$tx
  rx_bps=$((drx / INTERVAL_SEC))
  tx_bps=$((dtx / INTERVAL_SEC))

  echo "${ts} host.load1=${load1} host.memUsedMB=${mem_used_mb} host.memUsedPct=${mem_used_pct} pm2.cpuPct=${pm2_cpu} pm2.memMB=${pm2_mem_mb} pm2.restarts=${pm2_restarts} ops.clients=${ops_clients} ops.rooms=${ops_rooms} ops.leftUnconsented=${ops_unconsented} ops.rttP95ms=${ops_rtt_p95} net.rxBps=${rx_bps} net.txBps=${tx_bps}"
  sleep "${INTERVAL_SEC}"
done | tee -a "${LOG}"
```

## Local Commands (loadtest machine)

### 11) Run lobbyfill loadtest

```bash
npm run loadtest:lobbyfill -- --numClients 40 --usersPerRoom 4 --delay 300 --durationSec 360 --summaryIntervalMs 5000
```

### 12) Find disconnect signals in local loadtest logs

```bash
rg -n "leaveCode=1006|isServerDisconnect=true|disconnectCodes=|serverDisconnects=[1-9]|roomErrorCode" loadtest-logs/loadtest-lobbyfill-*.log
```

### 13) Compare with droplet unconsented leave stream

Tab A (droplet):

```bash
pm2 logs astro-party-colyseus --time --lines 0 | grep -E "AstroPartyRoom.onLeave|consented=false"
```

Tab B (local):

```bash
rg -n "leaveCode=1006|isServerDisconnect=true" loadtest-logs/loadtest-lobbyfill-*.log
```

Correlate by ISO timestamps (`ts=...` in loadtest and `--time` in PM2 logs).

### 14) Pull droplet artifacts and correlate locally

```bash
scp astro-droplet:/tmp/astro-correlation-*.log .
scp astro-droplet:/tmp/astro-party-colyseus-live.log .
rg -n "1006|isServerDisconnect=true" loadtest-logs/loadtest-lobbyfill-*.log
rg -n "AstroPartyRoom.onLeave|consented=false|leftUnconsented|pm2.restarts|net.rxBps|net.txBps|rttP95" ./astro-correlation-*.log ./astro-party-colyseus-live.log
```

If you do not use SSH config alias:

```bash
scp root@<droplet-ip>:/tmp/astro-correlation-*.log .
scp root@<droplet-ip>:/tmp/astro-party-colyseus-live.log .
```

## Notes

- `1006` means abnormal websocket close, not graceful leave packet.
- `leftUnconsentedTotal` in `/ops/stats` is the primary server-side signal.
- If `/ops/stats` is token-protected, pass `x-ops-token` in all curl/watch commands.
