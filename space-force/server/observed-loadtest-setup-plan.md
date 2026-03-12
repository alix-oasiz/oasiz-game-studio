# Observed Loadtest Setup Plan (Rough)

## Goal

Run loadtests with one local trigger and automatically:

1. Start server-side logging on droplet
2. Warm up baseline metrics
3. Run loadtest
4. Stop/pack server logs
5. Pull artifacts locally
6. View correlated multi-run dashboard

This should reduce terminal hopping and manual correlation.

## Scope

In scope:

- Single-trigger run orchestration
- Server-side observer script
- Artifact packaging and pull
- Multi-run dashboard with selectable run IDs

Out of scope (for initial version):

- Full Prometheus/Grafana deployment
- Permanent DB-backed observability pipeline

## High-Level Components

### 1) Droplet Observer Script

File target:

- `/root/space-force-observe.sh`

Commands:

- `start <runId>`
- `stop <runId>`
- `status <runId>`
- `pack <runId>`

What it records:

- App logs (`pm2 logs space-force-colyseus --time`)
- Kernel crash signals (`dmesg` filtered for OOM/segfault/killed process)
- Correlation metrics stream every N seconds:
  - host load / memory
  - pm2 cpu / memory / restart count
  - ops stats (`clients`, `rooms`, `leftUnconsented`, etc)
  - network rx/tx bytes per second
  - optional socket summary (`ss -s`)

Output layout on droplet (example):

- `/tmp/space-force-observe/<runId>/pm2.log`
- `/tmp/space-force-observe/<runId>/kernel.log`
- `/tmp/space-force-observe/<runId>/metrics.log`
- `/tmp/space-force-observe/<runId>/meta.json`
- `/tmp/space-force-observe/<runId>.tar.gz`

### 2) Local Orchestrator

File target:

- `space-force/server/loadtest/run-observed-loadtest.ps1`

Behavior:

1. Build `runId` (UTC)
2. Call droplet observer `start`
3. Sleep warmup (`WarmupSec`)
4. Run existing loadtest command
5. Always call droplet observer `stop` + `pack` (finally block)
6. SCP packed artifacts to local run directory
7. Emit one local manifest for dashboard indexing

### 3) Local Run Store

Directory target:

- `space-force/server/observed-runs/`

Per-run folder:

- `observed-runs/<runId>/`
  - `run-meta.json`
  - `loadtest.log`
  - `pm2.log`
  - `kernel.log`
  - `metrics.log`
  - `parsed-events.json`

Global index:

- `observed-runs/index.json`

## Multi-Run Dashboard (Not Per-Run Single Page)

File target:

- `space-force/server/observed-runs/dashboard/index.html` (or static app files)

Required behavior:

1. Read `observed-runs/index.json`
2. List historical run IDs with key metadata:
   - start/end time
   - test params (`numClients`, `usersPerRoom`, duration, etc)
   - summary stats (`joined`, `failed`, `disconnectCodes`, peak clients)
3. Allow selecting one or multiple runs
4. Render correlated timelines per selected run on shared UTC axis:
   - `ops.clients`, `ops.rooms`, `ops.leftUnconsented`
   - `pm2.memMB`, `pm2.cpuPct`, `pm2.restarts`
   - `host.memUsedPct`, `host.load1`, `net.rxBps`, `net.txBps`
   - event markers:
     - `leaveCode=1006` bursts
     - process boot markers (`Server.lifecycle boot`)
     - OOM/segfault markers
5. Quick incident cards:
   - mass-drop timestamps (e.g. clients drop >= X in one interval)
   - unconsented leave jumps
   - restart events

## Target Operator Flow

1. Configure params once (locally):
   - `numClients`, `usersPerRoom`, `durationSec`, `delay`, `warmupSec`
2. Run one command:
   - `npm run loadtest:observed -- --numClients 40 ...`
3. Watch normal loadtest terminal output
4. On completion:
   - artifacts pulled automatically
   - run indexed automatically
5. Open dashboard and select run IDs to compare

## Data/Time Correlation Rules

- Normalize all timestamps to UTC ISO8601
- Keep source-specific raw timestamp in parsed events for traceability
- Correlation precedence:
  1. process lifecycle events
  2. app-level disconnect/unconsented events
  3. loadtest disconnect events
  4. host/network trends

## Why Not DB First?

A DB pipeline is valid long-term, but for current stage:

- file artifacts are faster to ship and debug
- lower setup overhead
- easier to iterate on parsing and incident rules

Consider DB later when you need:

- cross-host retention
- team querying
- longer historical analytics beyond local files

## Phase Plan

Phase 1:

- Build observer script + local orchestrator
- Confirm end-to-end artifact pull

Phase 2:

- Build parser + `observed-runs/index.json`
- Add incident extraction

Phase 3:

- Build multi-run dashboard selector + timeline overlays
- Add run comparison summaries

Phase 4 (optional):

- Add persistent store (SQLite/Postgres) if historical querying becomes painful
