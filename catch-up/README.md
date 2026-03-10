# Catch Up

A "Getting Over It"-inspired browser climbing game. You play as a tomato holding a T-shaped bottle opener, using it as a lever to climb a tower of kitchen items. Built with Phaser 3 and Box2D v3 physics.

---

## Gameplay

Move the mouse to aim the bottle opener. Push it into any surface and your body is forced in the opposite direction — this is how you climb. Fall from a high section and you lose all that progress. Every step is earned.

---

## Tech Stack

| Package | Role |
|---|---|
| `phaser@3.90.0` | Rendering, scenes, input |
| `phaser-box2d@^1.1.0` | Box2D v3 physics wrapper |
| `typescript@^5.9.3` | Type safety |
| `vite@^7.3.0` | Dev server + build tool |
| `terser@^5.28.1` | Build minification |

---

## Project Structure

```
catch-up/
├── index.html              # Entry point + all UI markup and CSS
├── vite.config.js          # Build config (hashed assets + split chunks)
├── tsconfig.json           # TypeScript config
├── package.json
└── src/
    ├── main.ts             # Game state machine + UI wiring
    ├── box2d-mode.ts       # Full game implementation (physics, render, map)
    └── phaser-box2d.d.ts   # TypeScript type shim for phaser-box2d
```

### Reference Files (Unity originals, not compiled)
```
PlayerControl.cs   # Force physics — ported to box2d-mode.ts update loop
Hand.cs            # Arm rotation logic — ported to drawTomatoHand()
Head.cs            # Blink + face logic — ported to updateBlink() + renderScene()
```

---

## Source Files

### `src/main.ts`

Entry point. Manages the 'start' → 'playing' state machine and wires all HTML UI elements to game events.

**Responsibilities:**
- Start / stop the Box2D game via `launchBox2DGame` / `destroyBox2DGame`
- Show/hide HUD, settings modal, quit screen
- Receive live altitude from the Box2D scene via `setAltitudeCallback` and push it to the HUD DOM elements
- Custom cursor tracking

**Key elements it controls:**

| ID | Description |
|---|---|
| `#play-btn` | Starts the game |
| `#hud-height` | Live altitude display |
| `#hud-max` | Session best altitude |
| `#quit-btn` | Ends session, shows results |
| `#final-height` | Final altitude on quit screen |
| `#settings-modal` | Toggle physics settings |

---

### `src/box2d-mode.ts`

The entire game in one file (~1300 lines). Exports three functions and is otherwise self-contained.

**Exports:**
```typescript
launchBox2DGame(container: HTMLElement): Phaser.Game
destroyBox2DGame(game: Phaser.Game): void
setAltitudeCallback(cb: (meters: number) => void): void
```

#### Physics Config (`cfg`)

All gameplay-critical values live in one mutable object, editable at runtime via the dev panel.

```typescript
const cfg = {
  maxRange:          120,    // max hammer reach from player body (px)
  forceMult:         0.012,  // spring constant — higher = snappier lever
  maxSpeed:          8,      // velocity cap (m/s)
  hammerLerp:        0.18,   // hammer position smoothing (0=instant, 1=no movement)
  hammerR:           18,     // hammer contact detection radius (px)
  gravity:           12.0,   // m/s² — heavier than real to feel punishing
  playerFriction:    0.85,   // high friction so player grips surfaces
  playerRestitution: 0.0,    // no bounce
  playerDensity:     0.008,  // heavy body (cauldron feel)
  playerLinearDamp:  0.35,   // damping — kills drift on landing
  rockFriction:      0.95,
  rockRestitution:   0.0,
};
```

#### Coordinate System

Box2D uses Y-up while Phaser/screen uses Y-down. All conversions go through `PPM = 30` (pixels per meter).

```
Screen → Box2D:  (sx / PPM,   -sy / PPM)
Box2D → Screen:  (bx * PPM,  -(by * PPM))
```

#### Core Physics Loop (`update`)

Runs every frame, 10 steps:

1. Read player position from Box2D
2. Compute `mouseVec` = `clamp(mouse - playerPos, maxRange)` — mirrors Unity's `ClampMagnitude`
3. Check if hammer (previous frame) touches a rock: `isHammerNearRock()`
4. If touching: `targetBodyPos = hammerPos - mouseVec`, apply `force = (targetBodyPos - bodyPos) * forceMult`
5. Cap velocity to `maxSpeed`
6. Step Box2D physics (4 substeps for solid contacts)
7. Lerp hammer toward `playerPos + mouseVec`, binary-search-clip it to rock surfaces
8. Smooth camera follow (12% per frame)
9. Calculate altitude and fire callback
10. Update blink animation, then call `renderScene()`

This directly ports the spring-force mechanic from `PlayerControl.cs`.

#### Map Layout (`buildRockLayout`)

56 rocks across 6 hand-designed sections. Sections share X space, so falling from a high section drops you into a lower one.

| # | Section | Rocks | Description |
|---|---|---|---|
| 0 | Tutorial | 5 | Large close platforms. Impossible to fail. |
| 1 | Trash Pile | 16 | Dense chaotic cluster. Teaches momentum. |
| — | Rest Ledge 1 | 1 | Wide safe platform (plate) |
| 2 | The Chimney | 10 | Alternating left/right walls. Shrinking holds. |
| — | Rest Ledge 2 | 1 | Wide safe platform (plate) |
| 3 | Orange Hell | 12 | Thin slabs, wide gaps, committed swings required. |
| — | Rest Ledge 3 | 1 | "False summit" (plate) |
| 4 | Devil's Chimney | 8 | Tiny round holds, near-vertical, catastrophic fall. |
| 5 | Summit | 1 | Wide golden platter. The reward. |

Rock generation uses `generateRock(cx, cy, rx, ry, n, seed)` — an irregular polygon sampled around an ellipse with a seeded pseudo-random radius per vertex. Max 7 vertices (Box2D polygon limit).

#### Kitchen Item Rendering (`drawKitchenItemGfx`)

Each rock is rendered as a kitchen item using Phaser's `Graphics` API (no sprites). Style is assigned by section:

| Section | Items |
|---|---|
| Tutorial / Pile | plate, pot, bowl, board, mug, pan |
| Chimney | board, mug |
| Orange Hell | knife, spoon |
| Devil's Chimney | mug, bowl |
| Rest ledges | plate |
| Summit | platter |

#### Player Rendering (`renderScene`)

10-layer draw order:

1. Cream tile background
2. Wooden counter ground
3. Kitchen item rocks
4. Bottle opener handle (silver shaft + T-bar)
5. T-bar glow when touching rock (yellow)
6. Two articulated tomato hands (from `drawTomatoHand`)
7. Tomato body (red circle, shading, ribs, highlight)
8. Green calyx leaves + stalk
9. Face (eyes, pupils, mouth — facing direction based on mouse X)
10. Blink animation (eyes close for 2 of 4 blink frames)

Hand articulation (`drawTomatoHand`) ports `Hand.cs`:
- Shoulder origin offset from body centre
- Elbow joint = midpoint + perpendicular offset
- Three fingers spread perpendicular to arm direction
- `flipX` based on whether hammer is above or below shoulder

#### Dev Panel (`createDevPanel`)

An in-game debug overlay (fixed, top-right). Collapsible.

- **12 sliders** for all `cfg` parameters — changes apply immediately
- **COPY JSON** — copies current `cfg` to clipboard
- **RESET** — restores all values to session defaults
- **TELEPORT grid** — 9 buttons, one per section + spawn, for skipping ahead during testing

Teleport sets Box2D body position via `b2Body_SetTransform`, zeroes velocity, resets hammer, and snaps the camera.

---

### `src/phaser-box2d.d.ts`

Handwritten TypeScript type shim for the phaser-box2d JS library (which ships no `.d.ts`). Add new API calls here before using them in `box2d-mode.ts`.

Key additions beyond the standard API:
```typescript
b2Body_SetTransform(bodyId, position, rotation?)  // teleport
b2MakeRot(angle)                                  // create rotation from angle
```

---

## Running Locally

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production output in dist/
npm run typecheck # TS type check without building
```

> **Note:** `vite build` may fail with `ENOENT: dist/PhaserBox2D.js` — this is a known issue with the phaser-box2d package. `npm run dev` works correctly.

---

## Physics Design Notes

### Why it feels like Getting Over It

- **Heavy gravity (12 m/s²):** Drops are fast and punishing.
- **High friction (0.85):** Player grips surfaces instead of sliding off.
- **High linear damping (0.35):** Kills drift — you stay where you land.
- **4 physics substeps:** Prevents tunnelling through thin rocks.
- **Angular damping (3.0):** Player barely spins (cauldron feel, not pinball).
- **forceMult (0.012):** Punchy lever response — moving the mouse snaps the body.

### Force Formula (from PlayerControl.cs)

```
mouseVec       = clamp(mouse - bodyPos, maxRange)
hammerTarget   = bodyPos + mouseVec           // where hammer wants to be
                                               // (lerps toward this each frame)
targetBodyPos  = hammerPos - mouseVec          // implied body position
force          = (targetBodyPos - bodyPos) * forceMult
```

When the hammer is planted on a rock and you move the mouse, the hammer hasn't caught up yet — the error between current and target hammer position is what generates the force. Equilibrium = no force.
