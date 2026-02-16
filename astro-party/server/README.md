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

These are read from `process.env` (no dotenv loader in code by default).

- `PORT` (default: `2567`)
- `CORS_ORIGIN` (default: `*`)
- `MAX_PLAYERS` (default: `4`)
- `SIM_TICK_HZ` (default: `60`)
- `SNAPSHOT_HZ` (default: `20`)
- `ROOM_CODE_LENGTH` (default: `4`)

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
