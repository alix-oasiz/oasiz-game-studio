# Astro Party

High-level overview of the Astro Party game package.

## What is in this folder?

- `src/`: browser client (Vite + TypeScript), UI, rendering, input, networking.
- `server/`: Colyseus + Express authoritative multiplayer server.
- `shared/`: shared simulation/types used by server and client-local simulation paths.
- `index.html`: game shell + UI layout.

Project governance/docs:

- `AGENTS.md`: implementation policy + guardrails.
- `ARCHITECTURE.md`: current architecture/ownership map.
- `.agents/learning.md`: append-only agent learning memory and anti-repeat guardrails.
- `progress.md`: append-only milestone timeline with validation status.

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

## Production note

For production runtime (especially when observability endpoints are not needed), disable server monitoring surfaces:

- `COLYSEUS_MONITOR_ENABLED=false`
- `OPS_STATS_ENABLED=false`

## Build and typecheck

Validated on February 23, 2026:

- `astro-party`: `bun run build` passes.
- `astro-party`: `bun run typecheck` passes.
- `astro-party/server`: `npm run typecheck` passes.
- `astro-party/server`: `npm run build` passes.

```bash
cd astro-party
bun run typecheck
bun run build
```

Note: `bun run build` triggers `prebuild`, which runs:

```bash
bun run generate:entities
bun run generate:ship-skins
```

Ship skin generation now validates the skin contract in strict mode by default.
If a skin breaks required rules (for example missing major-surface role markers or missing
`--slot-primary` mapping on hull/wing surfaces), `generate:ship-skins` fails and therefore
`bun run build` fails.

For intentional local iteration with known-invalid skins:

```bash
bun run generate:ship-skins:warn
bun run generate:ship-skins:off
```

Or via env var:

```bash
SHIP_SKIN_VALIDATION=warn bun run generate:ship-skins
```

See `shared/assets/ships/README.md` for the full ship skin contract.

## Audio assets

Process audio into runtime assets with:

```bash
cd astro-party
bun run ffmpeg:install
bun run ffmpeg:check
bun run process:audio
```

For source layout, ffmpeg path overrides, and expected output files, see:
`assets/audio-src/README.md`.

```bash
cd astro-party/server
npm run typecheck
npm run build
```

## Client env (`astro-party/.env`)

Start from `.env.example`.

- `VITE_MATCH_HTTP_URL`: matchmaking HTTP base URL
- `VITE_COLYSEUS_WS_URL`: Colyseus websocket base URL
- `VITE_QA_DEBUG_TOOLS`: set to `true` to compile QA debug panel/tools into non-dev builds

If unset, the client falls back to `window.location` with port `2567`.

## QA/Debug panel (mobile + desktop)

- The in-game QA debug sheet is compiled only when:
  - `import.meta.env.DEV` is true, or
  - `VITE_QA_DEBUG_TOOLS=true`
- It provides quick preview actions for UI validation without full match flow:
  - `Start`, `Lobby`, `Game HUD`, `Round End Mock`, `Match End Mock`, `Live`
  - Dev helpers: `Toggle Dev Viz` and power-up grant shortcuts
- In production builds without `VITE_QA_DEBUG_TOOLS=true`, this panel is not compiled.
- Server does not require env toggles for debug command acceptance.
- Any server-accepted debug action taints the session and blocks score submission to platform APIs.

## Runtime/platform integration

- Room auto-join can be injected via `window.__ROOM_CODE__`.
- Player identity can be injected via `window.__PLAYER_NAME__`.
- Transport URL overrides can be injected via `window.__MATCH_HTTP_URL__` / `window.__COLYSEUS_WS_URL__`.
- The game shares active room code with host platforms via `window.shareRoomCode(...)` when available.
- Final session score is submitted at game end via `window.submitScore(...)` when available.

## Architecture in one minute

1. Client calls server HTTP endpoints to create/join a match.
2. Client connects to Colyseus room `astro_party`.
3. Server runs fixed-step simulation and broadcasts snapshots/events.
4. Shared simulation/types keep server and local/offline behavior aligned.
