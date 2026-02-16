# Astro Party

High-level overview of the Astro Party game package.

## What is in this folder?

- `src/`: browser client (Vite + TypeScript), UI, rendering, input, networking.
- `server/`: Colyseus + Express authoritative multiplayer server.
- `shared/`: shared simulation/types used by server and client-local simulation paths.
- `index.html`: game shell + UI layout.

## Local development

Use two terminals: one for the server, one for the client.

```bash
# Terminal 1 - server
cd astro-party/server
npm install
npm run dev
```

```bash
# Terminal 2 - client
cd astro-party
bun install
cp .env.example .env
bun run dev
```

Defaults:

- Client dev URL: `http://localhost:5173`
- Server URL: `http://localhost:2567` / `ws://localhost:2567`

## Build and typecheck

```bash
cd astro-party
bun run typecheck
bun run build
```

```bash
cd astro-party/server
npm run typecheck
npm run build
```

## Client env (`astro-party/.env`)

Start from `.env.example`.

- `VITE_MATCH_HTTP_URL`: matchmaking HTTP base URL
- `VITE_COLYSEUS_WS_URL`: Colyseus websocket base URL

If unset, the client falls back to `window.location` with port `2567`.

## Runtime/platform integration

- Room auto-join can be injected via `window.__ROOM_CODE__`.
- Player identity can be injected via `window.__PLAYER_NAME__` / `window.__PLAYER_AVATAR__`.
- The game shares active room code with host platforms via `window.shareRoomCode(...)` when available.
- Final session score is submitted at game end via `window.submitScore(...)` when available.

## Architecture in one minute

1. Client calls server HTTP endpoints to create/join a match.
2. Client connects to Colyseus room `astro_party`.
3. Server runs fixed-step simulation and broadcasts snapshots/events.
4. Shared simulation/types keep server and local/offline behavior aligned.
