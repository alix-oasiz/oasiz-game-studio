# Paper.io 3D — Offline Bot Game — Build Specification

## Overview

Build a **browser-based, offline Paper.io clone** using **HTML + TypeScript + Three.js**.
The game renders in a 3D top-down perspective (isometric-ish camera), runs fully client-side,
and pits the player against several AI bots. No server, no network calls.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Language | TypeScript (strict mode) |
| Renderer | Three.js (r160+) |
| Build | Vite |
| Styling | Vanilla CSS (single file) |
| No frameworks | No React, Vue, etc. |

---

## Visual Style & Aesthetic

### Camera
- Fixed isometric-ish top-down 3D camera (`PerspectiveCamera`)
- Position: roughly `(0, 80, 60)` looking at `(0, 0, 0)`
- Slight tilt so there is depth perception — NOT fully orthographic
- Camera does NOT follow the player; the entire map is visible at all times
- Very slight ambient camera sway (±0.3 units, 0.5 Hz) for life

### Color Palette — Player & Bots

Each player (human + bots) is assigned one of these distinct flat colors.
Colors must feel clean, saturated, and modern — like candy or neon felt.

```yaml
colors:
  player:     "#00E5FF"   # electric cyan
  bot_1:      "#FF3D71"   # hot coral
  bot_2:      "#FFAA00"   # golden amber
  bot_3:      "#00E096"   # mint green
  bot_4:      "#A259FF"   # soft violet
  bot_5:      "#FF6B35"   # tangerine
  reserve_6:  "#F72585"   # neon pink
  reserve_7:  "#4CC9F0"   # sky blue
```

Each color has a **territory** variant (same hue, 60% opacity, flat) and a **trail** variant
(same hue, 85% opacity, slightly emissive glow).

### Board / Arena
- Flat `PlaneGeometry` grid: **60×60 cells**, each cell = 1 unit
- Board surface: very dark near-black `#0D0D12` with a subtle grid overlay
- Grid lines: `#1A1A28`, 1px, rendered via a grid `ShaderMaterial` or texture
- Arena is bounded — players cannot leave. Border is a thin glowing white line `#FFFFFF` at 20% opacity.
- Background behind board: deep dark gradient `#07070F`

### 3D Shape Language

All geometry is **clean, low-poly, and slightly extruded** — think "flat design meets 3D depth."

#### Player / Bot Avatar
- Shape: **Rounded cube / chamfered box** — use `BoxGeometry(0.7, 0.35, 0.7)` with a
  slight `MeshToonMaterial` so it feels toy-like
- The top face is slightly lighter than side faces (achieved via `MeshToonMaterial` with a
  gradient map of 3 steps)
- A thin emissive ring (`TorusGeometry` r=0.45, tube=0.04) floats 0.05 units above the cube,
  pulsing opacity 0.6→1.0 at ~1.2 Hz to show "active energy"
- Avatar casts shadow

#### Territory Cells
- Each claimed cell is a slightly raised flat tile: `BoxGeometry(0.95, 0.06, 0.95)`
- Color = player's territory color (60% opacity `MeshLambertMaterial`)
- Tiles have a 0.05-unit gap between them so the board grid shows through
- When territory is first claimed, tiles **scale-in** from 0→1 over 180ms with an easing (`easeOutBack`)

#### Trail
- Trail cells are the same `BoxGeometry(0.95, 0.10, 0.95)` but slightly taller than territory
- Color = player's trail color (85% opacity, emissive 0.3)
- Trail cells have a very gentle vertical float animation (±0.015 units, 2 Hz)

#### Death / Elimination Effect
- When a player dies (trail is cut), their territory tiles rapidly shrink and fade over 400ms
- Spawn a burst of 12–16 small tetrahedra (`TetrahedronGeometry(0.15)`) that fly outward
  and fade — simple particle effect via `group.children` + manual update loop
- Play a short pitched-down sound (use Web Audio API, synthesized, no audio files needed)

#### Territory Capture Completion Flash
- When player returns to base and a loop is closed, briefly flash all newly captured tiles
  from white → player color over 250ms

---

## Grid & Game Logic

### Coordinate System
- Grid is a 60×60 2D array: `grid[x][z]` (y is always 0 in world space)
- Cell states: `EMPTY | TERRITORY(owner) | TRAIL(owner)`
- World position of cell `(x, z)` = `(x - 30 + 0.5, 0, z - 30 + 0.5)` (centered on origin)

### Player State (per player)
```typescript
interface PlayerState {
  id: number;
  color: string;
  position: { x: number; z: number };   // current grid cell
  direction: Direction;                  // UP | DOWN | LEFT | RIGHT
  trail: Array<{ x: number; z: number }>;
  territory: Set<string>;                // "x,z" keys
  alive: boolean;
  isHuman: boolean;
}
```

### Movement
- Movement is **tile-by-tile**, not free. Players advance one cell per tick.
- Tick rate: **10 ticks/second** (100ms per tick)
- Player cannot reverse direction 180° in a single tick (must go through a perpendicular direction first)
- When moving onto an EMPTY or ENEMY_TERRITORY cell, a trail is laid on the previous cell
- When moving back onto own TERRITORY, the trail loop is **closed**

### Territory Capture
- On loop close, flood-fill the interior of the trail + existing territory
- Interior cells become the player's TERRITORY
- ENEMY TERRITORY inside the flood-fill is also captured (stolen)
- The trail itself also becomes territory

### Collision / Death
A player dies if:
1. Their avatar moves onto **any trail cell** (including their own)
2. Another player's avatar moves onto **their trail cell**
3. They move outside the 60×60 grid boundary

### Starting State
- Each player starts with a **5×5 block of territory** centered on their spawn point
- Spawn points are evenly distributed near the corners / edges of the map:
  ```
  Human:  (5, 5)
  Bot 1:  (55, 5)
  Bot 2:  (5, 55)
  Bot 3:  (55, 55)
  Bot 4:  (30, 5)
  Bot 5:  (30, 55)
  ```

---

## Bot AI

Bots operate at the same tick rate as the player.

### Difficulty Levels (selectable at start screen)
| Level | Lookahead | Aggression | Trail Safety |
|---|---|---|---|
| Easy | 3 | Low | High |
| Medium | 8 | Medium | Medium |
| Hard | 16 | High | Low |

### Bot Behavior State Machine

Each bot cycles through these states:

```
EXPAND → RETURN_HOME → EXPAND → ...
       ↘ HUNT (if aggressive + player is nearby and vulnerable)
       ↘ FLEE (if own trail is dangerously long and enemy is close)
```

#### EXPAND
- Bot ventures out from its territory, drawing a trail
- Plans a rough rectangular or spiral loop
- Will not expand if trail length > `maxTrailLength` (Easy=8, Med=15, Hard=25)

#### RETURN_HOME
- Once trail is long enough (or enemy approaches), pathfind back to own territory
- Use simple BFS/greedy to find shortest path home avoiding all trails

#### HUNT
- High-aggression bots will target the player's trail if they can reach it within N steps
- They calculate if they can cut the trail before the player returns

#### FLEE
- If an enemy bot's head is within N cells of the current bot's trail, immediately return home

### Bot Randomness
- Add jitter: 15% chance per tick the bot picks a slightly suboptimal move to feel human
- Vary expansion rectangle size/shape randomly each excursion

---

## Controls

### Keyboard (Human Player)
```
Arrow Keys / WASD  →  Change direction
P                  →  Pause / Resume
R                  →  Restart (when game over)
ESC                →  Return to main menu
```

### Mobile (Touch)
- Detect swipe gestures (threshold 20px) for direction changes
- Virtual D-pad rendered in bottom-right corner as 4 semi-transparent arrow buttons

---

## HUD / UI

### In-Game HUD (rendered as HTML overlay, NOT Three.js)
```
┌─────────────────────────────────────────────┐
│  [Player color dot] YOU  34%    ⏱ 02:14     │
│  [Leaderboard panel - top right]             │
│    🔵 You      34%                           │
│    🔴 Bot 1    21%                           │
│    🟡 Bot 2    18%                           │
│    ...                                       │
└─────────────────────────────────────────────┘
```

- Territory % = (player territory cells / total cells) × 100
- Timer counts UP from 0:00
- Leaderboard sorted by territory % in real time
- Dead bots shown greyed out with a skull icon

### Main Menu (full screen, rendered as HTML)
Style: dark, minimal, centered — feels like a premium mobile game menu.

```
[Game Logo — "PAPER.IO 3D" in bold geometric font]

[Number of Bots: 3 / 5 ★]    ← increment buttons
[Difficulty:  Easy / Medium / Hard]   ← toggle

[  PLAY  ]   ← large CTA button, glows on hover

[How to Play]  ← small text link that expands inline instructions
```

Font: Use **"Orbitron"** (Google Fonts) for headers, **"DM Sans"** for body/UI.

Color scheme: Background `#07070F`, text `#E8E8F0`, accent `#00E5FF`.

### Game Over Screen (overlay)
```
┌──────────────────────────┐
│   GAME OVER              │
│                          │
│   Final Score: 34%       │
│   Rank: #2 of 4          │
│   Time: 02:14            │
│                          │
│   [  PLAY AGAIN  ]       │
│   [  MAIN MENU   ]       │
└──────────────────────────┘
```

Appears when:
- The human player dies → show immediately
- OR only one player remains

---

## Lighting

```yaml
lighting:
  ambient:
    type: AmbientLight
    color: "#1a1a2e"
    intensity: 0.6

  directional:
    type: DirectionalLight
    color: "#ffffff"
    intensity: 1.2
    position: [20, 40, 20]
    castShadow: true
    shadow_mapSize: 2048

  point_accent:
    type: PointLight
    color: "#00E5FF"     # matches player color, subtle fill
    intensity: 0.4
    position: [0, 10, 0]
    distance: 80
```

- Enable `renderer.shadowMap.enabled = true`
- Avatars cast + receive shadows
- Territory tiles receive shadows (but don't cast, for performance)

---

## Performance Guidelines

- Use **instanced meshes** (`THREE.InstancedMesh`) for territory tiles and trail tiles — one
  draw call per player per cell type instead of thousands of separate meshes
- Cap at 60 FPS via `renderer.setAnimationLoop`
- Tile updates: only update `InstancedMesh` matrices for **changed cells** per tick, not full rebuild
- Bot pathfinding runs in the game tick loop, not in `requestAnimationFrame` — keep render loop clean
- Target smooth on a mid-range laptop (no GPU required)

---

## Audio (Web Audio API — no audio files)

All sounds are synthesized procedurally:

```yaml
sounds:
  trail_tick:
    type: oscillator
    waveform: square
    frequency: 220
    duration_ms: 30
    gain: 0.05

  territory_captured:
    type: oscillator
    waveform: sine
    frequency: [440, 660]   # quick ascending two-tone
    duration_ms: 120
    gain: 0.15

  player_death:
    type: oscillator
    waveform: sawtooth
    frequency: [300, 80]    # descending
    duration_ms: 400
    gain: 0.2

  enemy_death:
    type: oscillator
    waveform: triangle
    frequency: [600, 300]
    duration_ms: 200
    gain: 0.1
```

- Master volume: 40% by default
- Mute button in HUD (top-left corner, 🔊 icon)

---

## File Structure

```
/
├── index.html
├── style.css
├── src/
│   ├── main.ts              # entry point, bootstraps game
│   ├── Game.ts              # main game loop, state machine
│   ├── Grid.ts              # 60x60 grid data + flood fill logic
│   ├── Player.ts            # PlayerState + human input handling
│   ├── Bot.ts               # BotAI state machine
│   ├── Renderer.ts          # Three.js scene setup, instanced meshes
│   ├── TileManager.ts       # manages InstancedMesh updates per tick
│   ├── ParticleSystem.ts    # death burst particles
│   ├── Audio.ts             # Web Audio synth sounds
│   ├── HUD.ts               # DOM overlay HUD + leaderboard
│   ├── Menu.ts              # main menu + game over screen DOM
│   └── constants.ts         # colors, grid size, speeds, etc.
├── tsconfig.json
├── vite.config.ts
└── package.json
```

---

## Constants Reference

```typescript
// constants.ts
export const GRID_SIZE = 60;
export const CELL_SIZE = 1;
export const TICK_RATE_MS = 100;          // 10 ticks/second
export const START_TERRITORY_RADIUS = 2; // 5x5 starting block

export const COLORS = {
  player:  0x00E5FF,
  bot:    [0xFF3D71, 0xFFAA00, 0x00E096, 0xA259FF, 0xFF6B35],
  board:   0x0D0D12,
  grid:    0x1A1A28,
  bg:      0x07070F,
};

export const TERRITORY_OPACITY = 0.6;
export const TRAIL_OPACITY      = 0.85;
export const TRAIL_EMISSIVE     = 0.3;

export const BOT_DIFFICULTY = {
  easy:   { lookahead: 3,  aggression: 0.1, maxTrail: 8  },
  medium: { lookahead: 8,  aggression: 0.4, maxTrail: 15 },
  hard:   { lookahead: 16, aggression: 0.8, maxTrail: 25 },
};

export const SPAWN_POINTS = [
  { x: 5,  z: 5  },  // human
  { x: 55, z: 5  },  // bot 1
  { x: 5,  z: 55 },  // bot 2
  { x: 55, z: 55 },  // bot 3
  { x: 30, z: 5  },  // bot 4
  { x: 30, z: 55 },  // bot 5
];
```

---

## Implementation Notes for the AI Agent

1. **Start with `Grid.ts` and `Game.ts`** — nail the pure logic (no rendering) and test flood-fill separately.
2. **Build `Renderer.ts` next** — get the board, one player, and tiles showing before adding bots.
3. Use `THREE.InstancedMesh` from day one — retrofitting it later is painful.
4. Keep `Bot.ts` simple at first (just EXPAND + RETURN_HOME), add HUNT/FLEE after basics work.
5. `HUD.ts` is pure DOM — no Three.js. Keep it in a `<div id="hud">` overlaying the canvas.
6. `Menu.ts` hides the canvas entirely when active; swap via CSS `display`.
7. The game tick (`setInterval` at 100ms) and render loop (`requestAnimationFrame`) are **separate** — do not couple them.
8. Test bot collision detection carefully — bots dying on their own trails is a common bug.
9. Flood fill must handle edge cases: trails that don't form a closed loop should NOT capture territory (the bot simply dies if they're killed mid-trail).
10. Use TypeScript enums for `Direction`, `CellState`, `BotBehaviorState` to avoid magic strings.
