# HUD Polish Plan

Three independent improvements targeting release readiness.

---

## 1. Triangle touch zone definition (inset shadow)

**Goal:** Give the corner triangles a subtle edge without a glow effect.

**Change:**
- Add `box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18)` to `.corner-tri-left` and `.corner-tri-right`.
- `clip-path` clips the rendered shadow to the triangle shape, so all three edges (including hypotenuse) get a faint 1px inner outline.
- No glow, no blur — just enough definition to separate the triangle from the game canvas.

**Files:**
- `index.html` — `.corner-tri-left`, `.corner-tri-right` CSS blocks

**Validation:** `bun run typecheck` + `bun run build`

---

## 2. Touch zone icons (ship/pilot phase-aware)

**Goal:** Replace text labels with SVG icons. Icons switch when the player transitions between ship and ejected-pilot phase.

### Icon set

| Zone | Ship phase | Pilot phase |
|------|-----------|-------------|
| A (rotate) | Rotate arrow (circular arrow) | Directional arrow (move/thrust) |
| A (dodge hint) | Double arrow (dash) | — same as rotate in pilot |
| B (fire) | Crosshair / bullet | Crosshair (same — pilot can still fire) |

Dodge hint: A small secondary icon or badge that appears on the rotate zone when double-tap-dodge is available (i.e. always in ship mode, irrelevant in pilot mode since dash mechanic differs).

### Implementation approach

**DOM:** Replace label/sublabel text nodes with SVG icon elements inside the zone. `pointer-events: none` on all icon elements — touch events fire on the zone div, not children. Safe to update mid-game.

**State switching:** Add `updateSingleLayoutIcons(playerState: PlayerState)` method on `TouchZoneManager`. Called from the existing `onPlayersUpdate` path in `main.ts` when the local player's state changes (`ACTIVE` → `EJECTED` or back). Only fires for `single` layout; other layouts are unaffected.

**Zone element tagging:** Tag each single-layout zone with `data-action="rotate"` or `data-action="fire"` so `updateSingleLayoutIcons` can query them without storing extra refs.

**Icon format:** Inline SVG strings defined as constants in `touchZones.ts`. Minimal paths, no external assets, no load dependency.

### Pilot state detection

```
PlayerData.state === "EJECTED"  →  pilot mode icons
PlayerData.state === "ACTIVE"   →  ship mode icons
```

Call `game.getPlayers()` filtered to `game.getMyPlayerId()` in the update path.

**Files:**
- `src/systems/input/touchZones.ts` — icon constants, `updateSingleLayoutIcons()`, zone data-action tagging
- `src/main.ts` — call `touchZoneManager.updateSingleLayoutIcons()` in `onPlayersUpdate` for single layout
- `index.html` — `.touch-zone-icon` CSS (size, centering, opacity)

**Validation:** `bun run typecheck` + `bun run build`. Manual: verify touch zones respond normally after icon swap mid-game (no lost input, no stuck state).

---

## 3. Net stats: ping-only, online-only, safe placement

**Goal:** For release, show only the information that matters to players. Strip internals, hide for local sessions, ensure it never falls under a notch.

### Content

Show only: `42ms` (RTT rounded to nearest ms, no label prefix needed — the number alone is readable in context).

Drop: jitter, snapshot age, tick interval, transport type (WS is now hardcoded, not useful to surface).

### Visibility

- **Online session only** — hide entirely for local matches (`game.isLocalSession()` or equivalent).
- **Always visible when shown** — must not be covered by platform top overlay or device notch.

### Placement

Move from bottom-right to **top-right**, offset by `--safe-top` + platform overlay height so it clears both notch and the platform HUD strip.

Exact position: `top: calc(var(--safe-top, 0px) + 48px); right: 12px;`
(48px = enough clearance below platform top bar on both portrait-rotated landscape and standard landscape)

Reduce opacity: `rgba(255, 255, 255, 0.35)` text, no background panel — just the number, very unobtrusive.

Remove the `background` and `padding`/`border-radius` entirely. Font stays Orbitron at 10px.

### Files

- `src/ui/screens.ts` — `updateNetworkStats()`: trim to RTT only, gate on online session
- `index.html` — `.net-stats` repositioned to top-right with safe-top offset, opacity reduced, background removed

**Validation:** `bun run typecheck` + `bun run build`. Manual: confirm not visible in local match, visible in online match, clears notch on iPhone landscape.

---

## Delivery order

1. Net stats (smallest, standalone, release-critical)
2. Triangle inset shadow (one CSS line)
3. Touch icons (most surface area, needs manual touch validation)
