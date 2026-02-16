# Astro Party Shared

Shared game logic and types used by both client and server.

## Why this folder exists

This is the source of truth for deterministic simulation behavior so multiplayer and local simulation stay aligned.

## Folder layout

- `sim/`: simulation state, systems, constants, maps, collision, AI, weapons, flow.
- `geometry/`: shared shape data used by simulation/rendering/prediction.
- `game/types.ts`: shared game-level type definitions.

## Where it is used

- Server: `astro-party/server/src/rooms/AstroPartyRoom.ts` uses `shared/sim/AstroPartySimulation`.
- Client: imports shared maps/types and can run local simulation transport from `shared/sim`.

## Working with shared code

- Keep updates deterministic and platform-agnostic (avoid browser-only or Node-only APIs here).
- If you change simulation behavior, validate both:
  - `cd astro-party && bun run typecheck && bun run build`
  - `cd astro-party/server && npm run typecheck && npm run build`
- NodeNext server imports shared files with `.js` extensions in import paths.
