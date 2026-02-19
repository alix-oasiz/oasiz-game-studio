# Astro Party Server

Authoritative multiplayer backend for Astro Party.

## Responsibilities

- Hosts Colyseus room `astro_party`.
- Runs fixed-step simulation and broadcasts snapshots/events.
- Exposes matchmaking and health HTTP endpoints.
- Tracks room codes for friend joins.

## Stack

- Node.js + TypeScript
- Colyseus (`colyseus`, `@colyseus/ws-transport`)
- Express (`/healthz`, `/match/create`, `/match/join`)

## Run locally

```bash
cd astro-party/server
npm install
npm run dev
```

Build/start:

```bash
cd astro-party/server
npm run build
npm run start
```

Default port is `2567`.

## Environment variables

These are read from `process.env`.

`npm run dev` and `npm run start` load `.env` from `astro-party/server/.env` via Node's `--env-file-if-exists=.env`.

Shell-provided environment variables still work and take precedence over `.env`.

- `PORT` (default: `2567`)
- `CORS_ORIGIN` (default: `*`)
- `MAX_PLAYERS` (default: `4`)
- `SIM_TICK_HZ` (default: `60`)
- `ROOM_CODE_LENGTH` (default: `4`)
- `SNAPSHOT_HZ_LOBBY` (default: `12`, capped at tick rate)
- `CLIENT_MAX_OUTBOUND_BUFFER_BYTES` (default: `262144`)
- `WS_MAX_PAYLOAD_BYTES` (default: `262144`)
- `DEBUG_TOOLS_ENABLED` (default: `false`)

## Debug tools

Debug commands are enabled only when both server and client gates are enabled.

### 1) Enable on server

Set `DEBUG_TOOLS_ENABLED=true` in the server process environment.

PowerShell:

```powershell
cd astro-party/server
$env:DEBUG_TOOLS_ENABLED="true"
npm run dev
```

Bash:

```bash
cd astro-party/server
DEBUG_TOOLS_ENABLED=true npm run dev
```

If your deploy runner does not use `.env`, set `DEBUG_TOOLS_ENABLED=true` in the process environment.
If you run the server with custom commands (not `npm run dev` / `npm run start`), pass envs explicitly or include `--env-file-if-exists=.env`.

### 2) Enable on client

Client debug tools are enabled in either case:

- Running a dev build (`import.meta.env.DEV === true`)
- `VITE_QA_DEBUG_TOOLS=true`

### 3) In-game debug keys

- `0` toggle dev visualization
- `1` Laser
- `2` Shield
- `3` Scatter
- `4` Mine
- `5` Reverse
- `6` Joust
- `7` Homing missile
- `9` Spawn random power-up

## HTTP API

- `GET /healthz` -> `{ ok: true }`
- `POST /match/create`
  - body: `{ "playerName"?: string }`
  - returns: `{ roomCode, roomId, seatReservation }`
- `POST /match/join`
  - body: `{ "roomCode": string, "playerName"?: string }`
  - returns success payload with `seatReservation`, or `{ ok: false, error, message }`

## Deploy note

`server-deploy-script.txt` contains a PM2-based deployment script used in production workflows.
