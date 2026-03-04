# Astro Party Architecture

Current architecture and ownership map for `astro-party`.

Companion source-of-truth docs:
- `AGENTS.md`: implementation policy and guardrails
- `GAME_MODES.md`: canonical mode terminology and ruleset/context contracts
- `progress.md`: active planning threads and milestone history

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

## Mode Model (Authoritative Contract)

- Mode behavior is modeled on separate axes:
  - `Ruleset`: core match progression rules.
  - `Experience Context`: onboarding/attract/live interaction behavior.
  - `Screen Flow`: UI presentation state.
- Canonical naming and behavior contracts for these axes are defined in `GAME_MODES.md`.
- Architecture and implementation must not collapse these axes into one overloaded "demo mode" concept.

## Client Topology

Composition:
- `src/main.ts`
  - bootstraps app
  - wires UI callbacks
  - coordinates phase-to-screen sync
  - coordinates onboarding/attract context startup/teardown
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
- `shared/sim/modules/simulationCollisionHandlers.ts`: direct overlap collision handlers + map-feature collision helpers.
- `shared/sim/modules/simulationSweptCollisions.ts`: swept projectile resolution and ship/pilot anti-tunneling guards.
- `shared/geometry/*`: entity/skin geometry and generated payloads.
- `shared/assets/*`: source SVG assets for entities/ships/maps/powerups.
- `shared/types/*` and `shared/game/*`: cross-runtime type contracts.

## Server Topology

- `server/src/rooms/*`: authoritative Colyseus room/session behavior.
- `server/src/index.ts`: server bootstrap, transport config, HTTP routes, Colyseus monitor mounting/auth gate, and ops stats endpoint wiring.
- `server/src/http/roomCodeRegistry.ts`: process-local room-code lookup map (single-instance/sticky-routing assumption until externalized store is introduced).
- `server/src/monitoring/*`: in-process operational counters/rate tracking and RTT summaries for `/ops/stats`.
- `server/src/*` HTTP endpoints: matchmaking, health checks, and ops stats.
- `server/loadtest/*`: synthetic client harnesses (`roomcode`, `lobbyfill`, capacity sweep orchestrator) and observed-run tooling (`run-observed-loadtest.ps1`, `astro-observe.sh`, parser/index builder).
- `server/observed-runs/*`: local artifact store + static dashboard (`dashboard/index.html`) for multi-run timeline/incident comparison from file-based artifacts.

## Key Ownership Boundaries

Phase and screen orchestration:
- `GameFlowManager` owns runtime phase progression for the active ruleset.
- `main.ts` owns mapping phase -> UI screens and demo interception logic.
- `GAME_MODES.md` owns canonical definitions for allowed ruleset/context combinations and expected phase progression.

Onboarding/attract context:
- `DemoController` owns onboarding/attract context transitions.
- `DemoOverlayUI` owns tutorial overlays and onboarding UX.
- Onboarding context gameplay input should still route through canonical game input pipeline.

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

Platform orientation + safe-area contract:
- Platform now enforces landscape orientation for runtime presentation.
- Client UI should not own forced portrait-rotation transforms as a normal compatibility path.
- Client layout ownership is safe placement within landscape:
  - respect platform top HUD overlay bounds
  - respect device notch/safe zones for both landscape directions
  - keep top-corner interactive UI offset by effective safe-top spacing

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
- `bun run sim:collision-matrix` (required when collision/scoring hot paths change)

Generation:
- `bun run generate:entities`
- `bun run generate:ship-skins`

Audio processing:
- `bun run ffmpeg:install`
- `bun run ffmpeg:check`
- `bun run process:audio [-- --only <selector>]`

Server container/toolchain baseline:
- server Node/npm baseline is pinned to:
  - Node `22.19.0`
  - npm `11.6.0`
- server Docker build context is `astro-party` root with Dockerfile `server/Dockerfile` so shared simulation sources are available at build time.

Generated files (do not hand-edit):
- `shared/geometry/generated/EntitySvgData.ts`
- `shared/geometry/generated/ShipSkinSvgData.ts`
