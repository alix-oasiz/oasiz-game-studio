# Space Force Shared

Shared game logic and types used by both client and server.

## Why this folder exists

This is the source of truth for deterministic simulation behavior so multiplayer and local simulation stay aligned.

## Folder layout

- `sim/`: deterministic simulation core (state, systems, maps, physics, AI, scoring).
- `geometry/`: shared render geometry + generated entity SVG payloads.
- `assets/`: source SVG assets used by runtime renderers and generation scripts.
- `game/`: shared game-level type definitions.
- `types/`: ambient declarations used by shared code (for example `poly-decomp`).

## Where it is used

- Server: `space-force/server/src/rooms/SpaceForceRoom.ts` uses `shared/sim/SpaceForceSimulation`.
- Client: imports shared maps/types and can run local simulation transport from `shared/sim`.

## Working with shared code

- Keep updates deterministic and platform-agnostic (avoid browser-only or Node-only APIs here).
- Keep shared player metadata contract aligned across sim/server/client; `PlayerListMeta` includes `shipSkinId` and is the authoritative cross-client skin field.
- `AdvancedSettings` (in `shared/sim/types.ts`) is the shared settings contract between client UI, network sync, and sim. Current fields: asteroids density, start powerups, rounds-to-win (round mode), endless time limit (`endlessTimeLimitSeconds`: null | number), endless kill limit (`endlessKillLimit`: null | number), and physics presets. When adding new settings, update the type, `DEFAULT_ADVANCED_SETTINGS` in `constants.ts`, `sanitizeAdvancedSettings` in `simulationSettings.ts`, and the corresponding cycle options constant (`ENDLESS_TIME_LIMIT_OPTIONS`, `ENDLESS_KILL_LIMIT_OPTIONS`, etc.).
- If you update entity SVG inputs in `shared/assets/entities`, regenerate geometry payloads:
  - `cd space-force && bun run generate:entities`
- If you change simulation behavior, validate both runtimes:
  - `cd space-force && bun run build`
  - `cd space-force/server && npm run typecheck && npm run build`
- NodeNext server imports shared files with `.js` extensions in import paths.

## Validation snapshot (February 23, 2026)

- `cd space-force && bun run build`: passes.
- `cd space-force/server && npm run typecheck && npm run build`: passes.
- `cd space-force && bun run typecheck`: passes.
