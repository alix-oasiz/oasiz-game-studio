# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

This is a TypeScript multiplayer game project using PlayroomKit. When debugging sync issues, focus on the PlayroomKit state/lifecycle APIs and avoid reading bundled/minified source code.
For playroomkit docs, always rely on the official docs available at https://docs.joinplayroom.com

## Project Overview

This is a monorepo for Oasiz Game Studio containing 30+ browser-based games. Games are built with TypeScript and Vite, bundled into single HTML files, and deployed to the Oasiz mobile platform.

**Quality bar**: Games must be App Store quality - polished, fun, professional visuals, and satisfying "game feel."

## Development Commands

All commands run from within a game folder (e.g., `cd paddle-bounce`):

```bash
bun install      # Install dependencies
bun run dev      # Start dev server with hot reload
bun run build    # Build to dist/index.html (single-file bundle)
bun run typecheck
bun run format   # Prettier
```

Upload from repo root:

```bash
bun run upload <game-folder>              # Build + upload
bun run upload <game-folder> --skip-build # Use existing dist/
bun run upload <game-folder> --dry-run    # Test without uploading
```

## Architecture

### Project Structure

```
game-name/
├── src/
│   ├── main.ts      # Entry point for the game logic
│   └── ...          # Other TypeScript modules
├── index.html        # Entry point + ALL CSS in <style> tags
├── package.json
├── tsconfig.json
├── vite.config.js
├── publish.json      # Optional: title, description, category
├── thumbnail/        # Optional: game thumbnail
└── dist/index.html   # Build output (single file with everything inlined)
```

### Key Rules

- All game code resides in the `src/` directory. `src/main.ts` is the entry point, but code can be split across multiple files within `src/`.
- All CSS in `<style>` tags in `index.html` - no separate CSS files
- Build output is a single `dist/index.html` with all assets inlined
- No JavaScript in `index.html`

### Tech Stack

- **Bun** - Package manager and runtime
- **Vite + vite-plugin-singlefile** - Bundles everything into one HTML file
- **TypeScript** - All game logic
- **Optional**: Phaser 3, Matter.js, Tone.js, PlayroomKit (multiplayer)

## Platform Integration (CRITICAL)

### Score Submission

Call ONLY on game over with a non-negative integer:

```typescript
if (typeof (window as any).submitScore === "function") {
  (window as any).submitScore(this.score);
}
```

**Never** track high scores locally - the platform handles leaderboards.

### Haptic Feedback

```typescript
if (typeof (window as any).triggerHaptic === "function") {
  (window as any).triggerHaptic("medium"); // light, medium, heavy, success, error
}
```

| Type | Use Case |
| ------ | ---------- |
| `light` | UI taps, button presses |
| `medium` | Collecting items, standard hits |
| `heavy` | Explosions, major collisions |
| `success` | Level complete, achievements |
| `error` | Damage, game over |

### Settings Modal (MANDATORY)

Every game MUST have a settings button (gear icon) with three toggles:

1. **Music** - Background music on/off
2. **FX** - Sound effects on/off
3. **Haptics** - Vibration on/off

Save to `localStorage`, load on init. Settings button placement:

- Desktop: minimum 45px from top
- Mobile: minimum 120px from top (platform overlay)

### Responsive Design

```typescript
const isMobile = window.matchMedia('(pointer: coarse)').matches;
```

- Fill 100% viewport (`window.innerWidth` × `window.innerHeight`)
- Handle resize events
- Hide mobile controls on desktop
- Mobile touch buttons: minimum 80px, 120px+ from bottom

### Multiplayer (PlayroomKit)

Reference `draw-the-thing/` for patterns. Broadcast room code to platform:
```typescript
if (typeof (window as any).shareRoomCode === "function") {
  (window as any).shareRoomCode(getRoomCode()); // or null when leaving
}
```

## Common Pitfalls

**Avoid:**

- `Math.random()` in render loops (causes flickering) - pre-calculate during object creation
- Emojis (inconsistent across platforms) - use icon libraries
- JavaScript in `index.html`
- Tracking high scores locally
- Forgetting window resize handling

**Do:**

- Test on mobile AND desktop
- Call `window.submitScore()` on game over
- Implement haptic feedback for all interactions
- Pre-calculate random values and store as object properties

## Reference Implementations

- **Multiplayer**: `draw-the-thing/`
- **Physics**: `car-balance/` (Matter.js)
- **Audio**: `paddle-bounce/` (Tone.js)
- **Phaser 3**: `endless-hexagon/`

## Multiplayer/Networking

When building multiplayer/networking features, always reference official SDK documentation (PlayroomKit JS SDK) before implementing matchmaking, WebSocket connections, or real-time sync logic.

## Code Style

For TypeScript projects, ensure all type definitions are complete and strict - this is the primary language in use.

## Testing

- After implementing game features, provide a simple test checklist the user can run to verify core functionality works (e.g., 'Test: 1. Open two browser tabs 2. Both should connect to matchmaking 3. Game should start when matched').
- Do not run the `bun run dev` command on your own after completion since that requires user validation
- `bun run build` command returns empty response when it succeeds so do not wait extensively once it returns


## Code Changes

- When fixing bugs, make minimal targeted changes. Do NOT over-engineer solutions (e.g., adding cooldown systems, complex state machines) when a simple fix is needed. Ask before adding complexity.
- After making code fixes, verify the fix doesn't introduce regressions by checking related functionality. Never use page reloads or full resets as a "fix" for state bugs.
- When fixing UI bugs, check for ALL visible issues in the affected area before submitting changes. Don't fix one thing while missing obvious adjacent problems (e.g., lobby player order, host indicators, color meanings).

See `Agents.md` for complete technical requirements and patterns.
