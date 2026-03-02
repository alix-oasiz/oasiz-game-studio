# Entity SVG Pipeline

This folder is the source of truth for entity art + collider geometry.

## Required contract per SVG

1. Include a valid `viewBox`.
2. Include a collider path with a stable id, for example:
   - `<path id="collider" d="M ... Z" />`
3. Keep collider path commands simple (`M`, `L`, `Z`) so deterministic vertex extraction stays stable.

## Optional metadata contract

- `<metadata id="render-meta"> ...json... </metadata>` is supported.
- Current metadata keys:
  - `trail`: trail VFX tuning (`anchor`, `maxAgeSec`, radii, alpha, blur, sampling fields).
  - `hardpoints`: optional explicit hardpoints (`muzzle`, `trail`, `joustLeft`, `joustRight`, `shieldRadii`, `pilotDash`, `pilotArmLeft`, `pilotArmRight`).

## Editor hardpoint guide layer (optional)

- You can include an editor-only group:
  - `<g id="editor-hardpoints">...</g>`
- The generator extracts hardpoints from these ids and strips the group from runtime SVG:
  - `hardpoint-muzzle` (`circle`)
  - `hardpoint-trail` (`circle`)
  - `hardpoint-joust-left` (`circle`)
  - `hardpoint-joust-right` (`circle`)
  - `hardpoint-shield` (`ellipse`, uses `rx/ry`)
  - `hardpoint-pilot-dash` (`circle`)
  - `hardpoint-pilot-arm-left` (`circle`)
  - `hardpoint-pilot-arm-right` (`circle`)

## Add or update an entity

1. Add/update the SVG file in this folder.
2. Update `manifest.json` with:
   - `file`
   - `colliderPathId`
   - `renderScale` (visual-only scale from viewBox)
   - `physicsScale` (collider-only scale)
   - `slotDefaults` (CSS variables used by the SVG)
3. Regenerate generated geometry data:
   - `cd astro-party && bun run generate:entities`
4. Optionally run full client build (also regenerates entities through `prebuild`):
   - `cd astro-party && bun run build`

Generated data is emitted to `shared/geometry/generated/EntitySvgData.ts`.

## Validation snapshot (February 23, 2026)

- `cd astro-party && bun run generate:entities`: passes.
