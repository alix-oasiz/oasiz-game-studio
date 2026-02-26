# Astro Party Architecture

Current architecture and ownership map for `astro-party`.

## Update Contract

- Update this file in the same milestone as any notable ownership/boundary change.
- Pair architecture updates with a `progress.md` entry.
- If user-defined hard constraints change flow/tooling behavior, record them here under the relevant section.

## High-level Runtime Flow

1. Client bootstraps in `src/main.ts`.
2. Client creates/joins room through matchmaking + Colyseus transport.
3. Server (`server/src`) runs authoritative simulation ticks.
4. Server broadcasts snapshots/events; client renders latest authoritative state.
5. Shared deterministic logic in `shared/sim/*` keeps behavior aligned across server and shared consumers.

## Client Topology

Composition:
- `src/main.ts`
  - bootstraps app
  - wires UI callbacks
  - coordinates phase-to-screen sync
  - coordinates demo startup/teardown
  - coordinates scene/audio sync policy
- `src/Game.ts`
  - runtime orchestrator
  - render loop
  - input capture + network send hooks
  - callback surface to UI/main

State/flow managers:
- `src/managers/GameFlowManager.ts`
- `src/managers/PlayerManager.ts`
- `src/managers/BotManager.ts`

Systems:
- `src/systems/input/*`: keyboard/touch/local slot input handling.
- `src/systems/rendering/*`: renderer, effects, layers, assets, camera control.
- `src/systems/camera/*`: adaptive camera behavior.

Networking:
- `src/network/*`: transport integration, snapshot/event sync, metadata mapping.

UI:
- `src/ui/*`: start/lobby/game/end screens, settings, overlays, modals.

Demo:
- `src/demo/DemoController.ts`: demo state machine ownership.
- `src/demo/DemoOverlayUI.ts`: overlay rendering and tutorial UX.

Audio:
- `src/AudioManager.ts`
- `src/audio/assetManifest.ts` (runtime audio source of truth).

## Shared Topology

- `shared/sim/*`: deterministic simulation, game flow, maps, scoring.
- `shared/geometry/*`: entity/skin geometry and generated payloads.
- `shared/assets/*`: source SVG assets for entities/ships/maps/powerups.
- `shared/types/*` and `shared/game/*`: cross-runtime type contracts.

## Server Topology

- `server/src/rooms/*`: authoritative Colyseus room/session behavior.
- `server/src/index.ts`: server bootstrap and transport config.
- `server/src/*` HTTP endpoints: matchmaking and health checks.

## Key Ownership Boundaries

Phase and screen orchestration:
- `GameFlowManager` owns phase progression.
- `main.ts` owns mapping phase -> UI screens and demo interception logic.

Demo mode:
- `DemoController` owns demo state transitions.
- `DemoOverlayUI` owns tutorial overlays and onboarding UX.
- Demo gameplay input should still route through canonical game input pipeline.

Input:
- Canonical local input capture path:
  - input systems -> `Game` -> downstream consumers.
- Mobile controls:
  - `MultiInputManager` + `TouchZoneManager` own touch-zone behavior.

Audio:
- `assetManifest.ts` defines IDs, paths, channels, and scene mapping.
- `AudioManager` owns playback policy and channel behavior.

Rendering assets:
- Entity/ship geometry originates in shared asset manifests and generation scripts.
- Runtime render asset stores use generated/shared inputs.

## Asset Mapping + URL Contract

Runtime URL contract:
- Use relative runtime asset URLs (`./assets/...`) for build output compatibility.
- Avoid `/assets/...` and absolute runtime URLs unless explicitly required.
- Keep `vite.config.js` base as `./`.

Primary mapping locations:
- Audio runtime mapping: `src/audio/assetManifest.ts`
- Audio source/variant tracking: `assets/audio-src/README.md`
- Entity mapping: `shared/assets/entities/manifest.json` + generated entity data
- Ship skin mapping: `shared/assets/ships/skins/manifest.json` + generated skin data
- Map overlay URL mapping: `src/systems/rendering/assets/MapOverlayRegistry.ts`
- Power-up SVG mapping: `src/systems/rendering/assets/PowerUpSvgAssets.ts`
- Static splash/title/media references: `index.html` via `./assets/...`

## Build + Generation Pipelines

Client checks:
- `bun run typecheck`
- `bun run build`

Generation:
- `bun run generate:entities`
- `bun run generate:ship-skins`

Audio processing:
- `bun run ffmpeg:install`
- `bun run ffmpeg:check`
- `bun run process:audio [-- --only <selector>]`

Generated files (do not hand-edit):
- `shared/geometry/generated/EntitySvgData.ts`
- `shared/geometry/generated/ShipSkinSvgData.ts`
