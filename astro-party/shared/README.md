# Astro Party Shared

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

- Server: `astro-party/server/src/rooms/AstroPartyRoom.ts` uses `shared/sim/AstroPartySimulation`.
- Client: imports shared maps/types and can run local simulation transport from `shared/sim`.

## Working with shared code

- Keep updates deterministic and platform-agnostic (avoid browser-only or Node-only APIs here).
- If you update entity SVG inputs in `shared/assets/entities`, regenerate geometry payloads:
  - `cd astro-party && bun run generate:entities`
- If you change simulation behavior, validate both runtimes:
  - `cd astro-party && bun run build`
  - `cd astro-party/server && npm run typecheck && npm run build`
- NodeNext server imports shared files with `.js` extensions in import paths.

## Validation snapshot (February 23, 2026)

- `cd astro-party && bun run build`: passes.
- `cd astro-party/server && npm run typecheck && npm run build`: passes.
- `cd astro-party && bun run typecheck`: passes.
