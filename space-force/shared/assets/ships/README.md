# Ship Assets

This directory stores ship visuals that are independent from gameplay physics.

`shared/assets/entities/ship.svg` is the canonical gameplay ship source for:
- collider vertices
- center of gravity
- hardpoints (muzzle, trail, shield, joust)

`shared/assets/ships/skins/` contains visual-only ship variants.

## Authoring Contract

Use this contract for every new ship skin.

Required geometry and orientation:
- Keep root viewBox exactly: `viewBox="-20 -20 40 40"`.
- Keep a `g` with `id="visual"` and this exact transform:
  `scale(1 0.8) rotate(90) scale(0.35) translate(-0.25 -4.5)`.
- Keep ship nose facing positive local X after transform (same gameplay facing as canonical ship).
- Keep collider path present for alignment reference:
  - `<path id="collider" d="..."/>`
  - collider `d` must match canonical ship collider exactly.

Required semantics:
- Include `role="img"` on `<svg>`.
- Include `aria-label="Ship skin: <name>"` on `<svg>`.

Required role markers and slot mapping:
- Tag major body surfaces:
  - one element with `data-role="hull-main"`
  - one element with `data-role="wing-left"`
  - one element with `data-role="wing-right"`
- Every element tagged with those `data-role` values must resolve to
  `fill: var(--slot-primary, #00f0ff)` (via inline fill, style, or a mapped class rule).
- Use `var(--slot-secondary, #ffffff)` in at least one visible region.
- Use `var(--slot-stroke, #041018)` or an equivalent class mapped to that variable for key outlines.

Performance and portability rules:
- Keep SVG self-contained (no external image/font dependencies).
- Avoid heavy filter stacks; do not use expensive blur filters by default.
- No script tags or animation tags.
- If an SVG includes `<g id="editor-hardpoints">` for authoring references, generator strips it from runtime output.

File and manifest workflow:
1. Add the skin SVG into `shared/assets/ships/skins/`.
2. Add an entry in `shared/assets/ships/skins/manifest.json`.
3. Use `renderScale: 1.5` unless there is a deliberate reason to change.
4. Regenerate data:
   - `cd space-force && bun run generate:ship-skins`

Validation behavior:
- Generator is strict by default and fails on functional contract breaks.
- Validation modes:
  - `strict` (default): hard-fail on errors.
  - `warn`: downgrade hard errors to warnings.
  - `off`: skip contract validation.
- Set mode with env var:
  - Bash/zsh: `SHIP_SKIN_VALIDATION=warn bun run generate:ship-skins`
  - PowerShell: `$env:SHIP_SKIN_VALIDATION='warn'; bun run generate:ship-skins`
- Convenience scripts:
  - `bun run generate:ship-skins:warn`
  - `bun run generate:ship-skins:off`

Generated output:
- `shared/geometry/generated/ShipSkinSvgData.ts`

## Agent Prompt Template

Use this prompt when asking an agent (including Codex) to generate a new skin.

```text
Create a new visual-only ship skin SVG for Space Force.

Base reference:
- shared/assets/entities/ship.svg

Style direction:
- <describe style here>

Hard constraints (must follow exactly):
- Root viewBox must be: -20 -20 40 40
- Include <g id="visual"> with transform:
  scale(1 0.8) rotate(90) scale(0.35) translate(-0.25 -4.5)
- Include <path id="collider"> and keep collider d identical to canonical ship.svg
- Include role="img" and aria-label on <svg>
- Use slot variables:
  - Tag major surfaces with data-role:
    - hull-main
    - wing-left
    - wing-right
  - Every required data-role surface must use --slot-primary fill
  - --slot-secondary in at least 1 region
  - --slot-stroke for major outlines
- Keep the asset self-contained and lightweight (no external refs, no heavy filters)

Deliverables:
1) New SVG file at shared/assets/ships/skins/<new_skin_name>.svg
2) Add manifest entry in shared/assets/ships/skins/manifest.json with renderScale 1.5
3) Run: bun run generate:ship-skins
4) Do not modify gameplay collider/hardpoint sources in shared/assets/entities/ship.svg
```
