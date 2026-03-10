# Game Development Rules
Follow these rules for any game development task:

### SDK Integration (Required)
- Install the platform SDK in every game: `bun add @oasiz/sdk`
- Import the SDK once in game logic files: `import { oasiz } from "@oasiz/sdk";`
- Use `oasiz.*` methods for platform integration instead of direct `window.*` bridge calls.
- For no-build HTML games or CDN usage: `<script src="https://www.oasiz.gg/sdk/v1/oasiz.min.js"></script>` (exposes `window.oasiz`)

### 1. Logic & Style
- **TypeScript**: Use TypeScript for all logic. No JavaScript in `index.html`.
- **CSS**: Place CSS in `<style>` tag in `index.html`.
- **Logs**: Always use `console.log('[FunctionName]', message)`.
- **Backticks**: Never use backticks inside template literals.

### 2. Multiplayer Games (Playroom Kit)

If you are building a **multiplayer game**, use [Playroom Kit](https://docs.joinplayroom.com/) for real-time networking.

#### Key Patterns

**Connecting to a Room:**
```typescript
import { insertCoin, getRoomCode, myPlayer, onPlayerJoin, isHost, getState, setState } from "playroomkit";

await insertCoin({
  skipLobby: true,
  maxPlayersPerRoom: 8,
  roomCode: roomCode,  // e.g., "ABCD" or generated
  defaultPlayerStates: {
    score: 0,
    guessed: false,
  },
});
```

**Broadcasting Room Code to Platform (CRITICAL):**
The platform needs to know the room code so friends can join. Call `oasiz.shareRoomCode()` after connecting:
```typescript
import { oasiz } from "@oasiz/sdk";

// After successful insertCoin:
oasiz.shareRoomCode(getRoomCode());

// When leaving the room, clear it:
oasiz.shareRoomCode(null);
```

**Handling Player Join/Quit:**
```typescript
onPlayerJoin((player) => {
  console.log("[GameManager] Player joined:", player.id);
  players.push(player);

  player.onQuit(() => {
    console.log("[GameManager] Player left:", player.id);
    players = players.filter((p) => p.id !== player.id);
  });
});
```

**State Synchronization:**
```typescript
// Room state (shared by all players)
setState("currentWord", "apple", true);  // reliable=true
const word = getState("currentWord");

// Player state (per-player)
myPlayer().setState("score", 10, true);
const score = player.getState("score");
```

**Host-Only Logic:**
```typescript
if (isHost()) {
  // Only the host manages game transitions
  setState("gamePhase", "playing", true);
}
```

#### Platform-Injected Properties
The SDK exposes read-only properties populated by the platform (all `undefined` in local dev):

| Property             | Type                | Description                              |
| -------------------- | ------------------- | ---------------------------------------- |
| `oasiz.gameId`       | string \| undefined | The platform's game ID                   |
| `oasiz.roomCode`     | string \| undefined | Pre-filled room code from an invite link |
| `oasiz.playerName`   | string \| undefined | The player's display name                |
| `oasiz.playerAvatar` | string \| undefined | URL to the player's profile picture      |

```typescript
import { oasiz } from "@oasiz/sdk";

if (oasiz.roomCode) {
  await connectToRoom(oasiz.roomCode);
}

if (oasiz.playerName) {
  this.hudNameLabel.text = oasiz.playerName;
}
```

---

### 3. Design & Polish
- **Professionalism**: These games will be shown to thousands of people; they must look and feel professional.
- **Aesthetics**: Make the games beautiful. Use high-quality visual assets, smooth animations, and polished UI.
- **Start Screens**: Create stunning start screens that immediately engage players and establish the game's theme.
- **Game Feel**: Focus on "juice"—ensure every interaction (clicks, movements, scoring) feels satisfying through visual and auditory feedback.
- **Settings Button (REQUIRED)**: Every game MUST include a settings button with toggles for Music, FX, and Haptics. See Technical Requirements for full details.


### 4. Technical Requirements

- **No Emojis**: Use icons from a library instead of Emojis, they look unprofessional and inconsistent across platforms.

- **Responsive Full-Screen Canvas**: Games are displayed in an iframe modal that varies in size. Your game MUST:
  - Fill 100% of available width and height using `window.innerWidth` and `window.innerHeight`
  - **Mobile & Web Compatibility**: Every game MUST be fully playable on both desktop (keyboard/mouse) and mobile (touch).
  - **Responsive Controls**: UI elements like virtual joysticks or mobile-only buttons MUST be hidden on desktop.
    - **Detection**: `const isMobile = window.matchMedia('(pointer: coarse)').matches;`
    - **Visibility**: Use `isMobile` to toggle a `.mobile-only` CSS class or directly set `display: none`.
  - **Inner Phone Screen Layout**:
    - On Mobile: Use `html, body { height: 100%; overflow: hidden; touch-action: none; }` to prevent "bouncing" or scrolling.
    - On Desktop: Ensure the game fills the viewport but HUD elements stay tucked into the corners using `fixed` positioning.
  - **Top Safe Area (CRITICAL)**: Games are embedded in a platform that may have top-bar overlays. Interactive buttons (Settings, Pause) placed at the top corners and any HUD content MUST be offset to avoid being covered.
    - **Requirement for Interactive Buttons**: Minimum `45px` from the top on Desktop and `120px` on Mobile.
    - **Example**: `#pauseBtn { position: absolute; top: 45px; right: 20px; }` with `@media (pointer: coarse) { top: 120px; }`.
  
  - Handle window resize events to adapt when the viewport changes
  - Work on both landscape (desktop) and portrait (mobile) orientations
  - Use CSS: `html, body { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; touch-action: none; } canvas { display: block; }`
  - Implement resize handler:
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Also update any camera/projection matrices if 3D
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Initial size

- **Responsive Layout Calculations (CRITICAL)**:
  - Game elements (grids, boards, play areas) must scale dynamically based on viewport dimensions
  - Calculate sizes using percentages of `window.innerWidth` and `window.innerHeight`, with different ratios for mobile vs desktop
  - Use `isMobile` to apply different scaling factors:
    ```typescript
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const hudHeight = isMobile ? h * 0.12 : h * 0.1;
    const maxGridWidth = isMobile ? w * 0.95 : Math.min(w * 0.85, 700);
    ```
  - Account for HUD/UI elements when calculating available space for the game area
  - Recalculate all layout values in `resizeCanvas()` or a dedicated `calculateLayout()` function
  - CSS font sizes and padding should also be responsive using media queries or viewport units (vw, vh)
  - Test at multiple viewport sizes: mobile portrait (375x667), mobile landscape (667x375), tablet (768x1024), desktop (1920x1080)
    
- **UI Architecture (CRITICAL for overlays/menus)**:
  - Container overlays (HUD, menus): Use `pointer-events: none` so clicks pass to canvas
  - Buttons INSIDE overlays: Do NOT use `pointer-events: auto` in CSS - it overrides hidden parent state!
  - Hidden overlays: Use `visibility: hidden` or `display: none`, NOT `opacity: 0; pointer-events: none`
  - If using opacity for fade effects: Set `pointer-events: none` on BOTH the overlay AND its buttons when hidden
  - Bug to avoid: `.overlay.hidden { opacity: 0; pointer-events: none }` + `button { pointer-events: auto }` = invisible buttons still clickable!

- **Settings Button (MANDATORY - EVERY GAME)**:
  - **EVERY game MUST have a settings button** that opens a settings modal/panel.
  - The settings button should use a gear/cog icon and be placed in the top-right corner.
  - **UI Placement (CRITICAL)**: The settings button must follow **Top Safe Area** requirements:
    - **Desktop**: Minimum `45px` from the top.
    - **Mobile**: Minimum `120px` from the top.
  - **Required Toggles**: The settings modal MUST include THREE separate toggles:
    1. **Music** (🎵): Controls background music/soundtrack on/off.
    2. **FX / Sound Effects** (🔊): Controls game sound effects on/off.
    3. **Haptics** (📳): Controls vibration feedback on/off.
  - **Implementation Requirements**:
    - Each toggle must be clearly labeled and easy to tap on mobile.
    - Toggles should have visual on/off states (e.g., filled vs outline icons, or toggle switches).
    - Save preferences to `localStorage` so they persist between sessions.
    - Load saved preferences on game start.
  - **Settings State Pattern**:
    ```typescript
    interface Settings {
      music: boolean;
      fx: boolean;
      haptics: boolean;
    }
    
    // Load on init
    private loadSettings(): Settings {
      const saved = localStorage.getItem("gameSettings");
      return saved ? JSON.parse(saved) : { music: true, fx: true, haptics: true };
    }
    
    // Save on change
    private saveSettings(): void {
      localStorage.setItem("gameSettings", JSON.stringify(this.settings));
    }
    ```
  - **Toggle Event Handler Pattern (CRITICAL for mobile)**:
    - On touch devices, a single tap fires both `touchend` and a synthetic `click`, causing toggles to flip twice (back to the original state).
    - **ALWAYS** use `e.preventDefault()`, `e.stopPropagation()`, and a **300ms debounce** on every settings toggle handler.
    - Use a shared wrapper function so every toggle gets the same protection:
    ```typescript
    let lastToggle = 0;
    function settingsToggle(cb: () => void): (e: Event) => void {
      return (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (Date.now() - lastToggle < 300) return;
        lastToggle = Date.now();
        cb();
        saveSettings();
        updateSettingsToggles();
        triggerHaptic("light");
      };
    }

    document.getElementById("toggle-music")!.addEventListener("click", settingsToggle(() => {
      settings.music = !settings.music;
      if (!settings.music) pauseMusic();
      else if (gamePhase === "playing") playMusic();
    }));
    document.getElementById("toggle-fx")!.addEventListener("click", settingsToggle(() => {
      settings.fx = !settings.fx;
    }));
    document.getElementById("toggle-haptics")!.addEventListener("click", settingsToggle(() => {
      settings.haptics = !settings.haptics;
    }));
    ```
    - This same debounce pattern should also be applied to **shop carousel arrows** and any other button that users report as "double-firing" on mobile.
  - **Best Practices**:
    1. **Separation**: Do not bundle FX and haptics into a single toggle. A user may want to feel the game without hearing it.
    2. **Coupling**: While toggled separately, FX and haptics should be triggered at the same point in code to maintain synchronization.
    3. **Modal Design**: The settings modal should match the game's aesthetic and be easy to dismiss (tap outside or X button).
    4. **Hidden on Start Screen**: Hide the settings button on the start screen; show it only during gameplay.

- **Start Screen UI Rules**:
  - The start screen should be clean and focused on the game title, instructions, and start button.
  - **Hide gameplay UI on start screen**: Settings button, HUD, mobile controls, minimap, and other gameplay elements should NOT be visible on the start screen.
  - **Show on game start**: When the game transitions from start screen to playing, reveal these elements by removing their `hidden` class.
  - **Hide on game over**: Hide gameplay UI again when the game ends to keep the game over screen clean.
  - **Pattern**: Add `hidden` class by default in HTML, then toggle via JavaScript:
    ```typescript
    // On game start
    document.getElementById("settings-btn")?.classList.remove("hidden");
    document.getElementById("mobile-controls")?.classList.remove("hidden");
    document.getElementById("hud")?.classList.remove("hidden");
    
    // On game over
    document.getElementById("settings-btn")?.classList.add("hidden");
    document.getElementById("mobile-controls")?.classList.add("hidden");
    document.getElementById("hud")?.classList.add("hidden");
    ```

- **Mobile Touch Controls (Thumb Buttons)**:
  - For games with on-screen steering/action buttons (left/right arrows, jump, etc.), position them for comfortable thumb access:
  - **Bottom Safe Area**: Use `padding-bottom: 120px` or more to keep buttons clear of OS home gestures and give thumbs room.
  - **Button Size**: Minimum `80px` width/height for easy tapping.
  - **Positioning**: Place left control on bottom-left, right control on bottom-right with `padding: 0 20px 120px`.
  - **Minimap/HUD Offset**: If displaying a minimap or other HUD elements near the bottom, offset them at least `220px` from the bottom on mobile to avoid overlap with touch controls.
  - **Example CSS**:
    ```css
    .mobile-controls {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 0 20px 120px;
      pointer-events: none;
    }
    .steer-btn {
      width: 80px;
      height: 80px;
      pointer-events: auto;
    }
    ```


### 5. Performance & Code Quality

- **Game Loop Must Stop When Not Playing (CRITICAL)**:
  - The `requestAnimationFrame` loop **must never run in the background**. If the tab is hidden or the platform backgrounds the app, the loop must be fully cancelled with `cancelAnimationFrame`.
  - Track the RAF handle and expose `startLoop` / `stopLoop` helpers. Reset `lastFrameTime` on restart to prevent a huge delta-time spike on the first resumed frame.
  - Wire `stopLoop` to both `document.visibilitychange` (tab hidden) and `oasiz.onPause` (platform backgrounding). Wire `startLoop` to `visibilitychange` (tab visible) and `oasiz.onResume`.
  - **User-pause via the pause button should NOT stop the loop** — the loop must keep running to render the pause screen. Only background/platform events kill it entirely.
  - **Required pattern (use this in every game)**:
  ```typescript
  let rafId = 0;

  function startLoop(): void {
    if (rafId) return;             // already running — guard against double-start
    lastFrameTime = 0;             // reset so first frame dt is 0, not a huge spike
    rafId = requestAnimationFrame(gameLoop);
  }

  function stopLoop(): void {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  // Inside gameLoop — store the handle on every frame
  function gameLoop(timestamp: number): void {
    // ... update & draw ...
    rafId = requestAnimationFrame(gameLoop);
  }

  // In init()
  oasiz.onPause(() => {
    if (gameState === "PLAYING") pauseGame(); // update game state
    stopLoop();                               // kill the RAF
  });

  oasiz.onResume(() => {
    startLoop();                              // restart RAF; game state stays PAUSED until user taps Resume
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLoop();
    } else {
      startLoop();
    }
  });

  startLoop();   // kick off the loop once on init
  ```

- **No Random Values in Render Loops (CRITICAL)**:
  - NEVER use `Math.random()` or `randomRange()` inside `draw*()` or `render()` functions
  - Random values in render loops cause visual glitching/flickering as values change every frame
  - Instead, pre-calculate random values during object creation and store them as properties
  - For visual variety, use deterministic functions based on object properties (e.g., `Math.sin(index * 3.7)`)
  - Example fix:
    ```typescript
    // BAD - causes flickering
    drawRock(): void {
      const variance = Math.random() * 0.2;
      // ...
    }
    
    // GOOD - stable visuals
    interface Rock {
      variance: number; // Set once during creation
    }
    createRock(): Rock {
      return { variance: Math.random() * 0.2 };
    }
    ```

- **Verify Method Names Before Using**:
  - Always check existing class methods before calling them
  - Common mistakes to avoid:
    - `pool.get()` → should be `pool.acquire()`
    - `particles.spawn()` → should be `particles.emit()`
  - Search the codebase for the class definition to confirm method signatures

- **Proper Object Pool Usage**:
  - Use `acquire()` to get objects from pool, `release()` to return them
  - When clearing collections, release objects back to pool AND clear the array:
    ```typescript
    // Correct way to clear pooled objects
    for (const obj of this.objects) {
      this.objectPool.release(obj);
    }
    this.objects = [];
    ```

- **Game State Consistency**:
  - When adding new game states (e.g., "BOSS"), update ALL relevant event listeners
  - Check touch, mouse, and keyboard handlers to ensure they work in the new state
  - Example: `if (this.gameState === "PLAYING" || this.gameState === "BOSS")`

- **Meta Tags**:
  - Use `<meta name="mobile-web-app-capable" content="yes">` (NOT `apple-mobile-web-app-capable` which is deprecated)

### 6. Handheld Console (Game Boy) UI Design

When creating games that use a physical handheld console (Game Boy) aesthetic, follow these precise sizing and positioning guidelines to ensure a professional feel and mobile ergonomics:

- **Desktop Chassis**:
  - Use a fixed-size container for the "chassis": `max-width: 420px`, `max-height: 850px`.
  - Add rounded corners (`border-radius: 24px`) and decorative elements like screws in the corners for a tactile feel.

- **Mobile Full-Screen Transition**:
  - On mobile (`pointer: coarse`), remove the chassis constraints: `max-width: none`, `max-height: none`, `border-radius: 0`. The phone becomes the console.

- **Screen Area (`#screen-container`)**:
  - **Desktop**: Occupy roughly `55%` of vertical height.
  - **Mobile**: Occupy exactly `50%` of vertical height.
  - **Top Offset (Mobile)**: Anchor the screen with a `margin-top: 100px` to clear platform overlays.

- **HUD & Progress Integration**:
  - Position these directly below the screen to act as the bridge between "digital" and "physical" areas.
  - **HUD**: Use a slight negative margin on mobile (e.g., `margin-top: -6px`) to "tuck" badges into the screen bezel.
  - **Progress Bar**: Position with `margin-top: 25px` (Desktop) or `0px` (Mobile) for balanced spacing.

- **Physical Controls (D-Pad & Action Buttons)**:
  - **Mobile Ergonomics**: Movement buttons (D-pad) must be at least **`96px`**, and primary action buttons (Jump/A) should be **`100px`**.
  - **Desktop Sizing**: Scale buttons down to roughly **`72px`** for mouse-driven play.
  - **Bottom Safe Area**: Apply a `margin-bottom` of at least **`50px`** on mobile to avoid interference with OS navigation gestures (home bars).
  - **Tactile Feedback**: Every button must have a 3D "pressed" state (`translateY`) and trigger a `"light"` haptic on click/tap.

- **Interactive UI (Pause/Settings)**:
  - Follow the **Top Safe Area** requirements: `top: 115px - 120px` on mobile and `45px` on desktop.

# Coding Agent Guidelines: Oasiz SDK Integration

This document explains how games must use the Oasiz SDK (`@oasiz/sdk`) for score submission, haptic feedback, lifecycle events, player identity, and persistent game state.

Games run inside a sandboxed iframe (web) or WebView (mobile). The SDK communicates with the platform through bridge functions — your game never makes network requests directly. No API keys, tokens, or auth setup needed.

## Installation

### Install via npm (recommended for TypeScript/JavaScript projects)

```bash
bun add @oasiz/sdk
```

```typescript
import { oasiz } from "@oasiz/sdk";
```

Named exports are also available:

```typescript
import {
  submitScore,
  triggerHaptic,
  loadGameState,
  saveGameState,
  onPause,
  onResume,
} from "@oasiz/sdk";
```

### Install via CDN (for no-build HTML games or Unity WebGL exports)

The SDK is available globally as `window.oasiz`.

```html
<script src="https://www.oasiz.gg/sdk/v1/oasiz.min.js"></script>
<script>
  oasiz.submitScore(42);
  oasiz.triggerHaptic("medium");
</script>
```

---

## 1. Score Submission: `oasiz.submitScore`

**Games MUST NOT track high scores, best scores, or persistent history locally.** The platform handles all score persistence and leaderboard logic.

```typescript
oasiz.submitScore(score);
```

| Parameter | Type   | Description                                  |
| --------- | ------ | -------------------------------------------- |
| `score`   | number | Floats are floored, negatives clamped to 0.  |

**When to call** — frequency depends on your game type:

| Game type                | When to submit                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Endless / single-session | Once at game over                                                                               |
| Level-based              | At the end of each level                                                                        |
| Long sessions            | Periodically on a timer (e.g. every 60s), plus once at game over. Gate behind a minimum interval to avoid spamming. |


Tells the platform when the player is actively playing so it can suppress background tasks like notifications.

```typescript
oasiz.gameplayStart();
oasiz.gameplayStop();
```

| Method            | When to call                                          |
| ----------------- | ----------------------------------------------------- |
| `gameplayStart()` | Game starts, resume after pause, entering next level  |
| `gameplayStop()`  | Entering a menu, pausing, game over                   |

> Don't call `gameplayStop()` when the user switches tabs — the platform handles this via `onPause` / `onResume`.

## 4. Multiplayer & Room Sharing

```typescript
oasiz.shareRoomCode(code);
```

| Parameter | Type           | Description                  |
| --------- | -------------- | ---------------------------- |
| `code`    | string \| null | Room code, or null to clear. |

```typescript
await insertCoin({ skipLobby: true });
oasiz.shareRoomCode(getRoomCode());

// When disconnecting
oasiz.shareRoomCode(null);
```

## 5. Lifecycle Events: `oasiz.onPause` / `oasiz.onResume`

Fires when the app goes to background / returns to foreground. Use to pause game loops, mute audio, and save state.

```typescript
const offPause = oasiz.onPause(() => {
  this.gameLoop.stop();
  this.bgMusic.pause();
});

const offResume = oasiz.onResume(() => {
  this.gameLoop.start();
  if (this.settings.music) this.bgMusic.play();
});

// Cleanup when game is destroyed
offPause();
offResume();
```

## 6. Game State Persistence: `oasiz.loadGameState` / `oasiz.saveGameState`

Save and load game progress across sessions, devices, and app reinstalls. Writes are automatically debounced (2 seconds).

```typescript
const state = oasiz.loadGameState();
oasiz.saveGameState({ ...state, level: 3 });
```

### Requirements:
1. **Object Only**: State payloads must be plain JSON objects (not arrays, not primitives).
2. **No Custom Persistence Layer**: Do not build your own backend bridge in game code.
3. **No Local Progress Storage**: Do not use `localStorage` for cross-session game progress/state. Use `oasiz.saveGameState`.

### Runtime API:
- `oasiz.loadGameState(): Record<string, unknown>` — Returns `{}` if no state saved yet. Always validate the shape.
- `oasiz.saveGameState(state: Record<string, unknown>): void` — Queues a debounced save.
- `oasiz.flushGameState(): void` — Forces an immediate write. Use at game over or before page might close.

### When to Save
Use `oasiz.saveGameState` at meaningful checkpoints: level completions, inventory changes, checkpoint snapshots, user-created content updates.

---

## Implementation Patterns

### Score Submission Pattern
```typescript
import { oasiz } from "@oasiz/sdk";

private submitFinalScore(): void {
  console.log("[Game] Submitting final score:", this.score);
  oasiz.submitScore(this.score);
}
```

### Haptic Feedback Pattern
```typescript
import { oasiz } from "@oasiz/sdk";

private triggerLightHaptic(): void {
  if (this.settings.haptics) {
    oasiz.triggerHaptic("light");
  }
}

private handleCollision(isPerfect: boolean): void {
  if (this.settings.haptics) {
    oasiz.triggerHaptic(isPerfect ? "success" : "medium");
  }
}

private onGameOver(): void {
  oasiz.gameplayStop();
  this.submitFinalScore();
  if (this.settings.haptics) {
    oasiz.triggerHaptic("error");
  }
}
```

### Game State Pattern
```typescript
import { oasiz } from "@oasiz/sdk";

private loadPersistentState(): Record<string, unknown> {
  return oasiz.loadGameState();
}

private savePersistentState(nextState: Record<string, unknown>): void {
  oasiz.saveGameState(nextState);
}
```

### Lifecycle Pattern
```typescript
import { oasiz } from "@oasiz/sdk";

class Game {
  start(): void {
    oasiz.gameplayStart();
    this.gameLoop.start();
  }

  pause(): void {
    oasiz.gameplayStop();
    this.showPauseMenu();
  }

  resume(): void {
    oasiz.gameplayStart();
    this.gameLoop.start();
  }

  gameOver(): void {
    oasiz.gameplayStop();
    oasiz.submitScore(this.score);
    oasiz.saveGameState({ level: this.level });
    oasiz.flushGameState();
  }
}
```

---

## Development & Testing

### Local Development
During local development, bridge functions are not present. The SDK detects this and falls back to safe no-ops with console warnings. No special configuration needed.

| Method                        | Local behavior              |
| ----------------------------- | --------------------------- |
| `submitScore()`               | Logs warning, no-op         |
| `emitScoreConfig()`           | Logs warning, no-op         |
| `triggerHaptic()`             | Logs warning, no-op         |
| `loadGameState()`             | Returns `{}`                |
| `saveGameState()`             | Logs warning, no-op         |
| `shareRoomCode()`             | Logs warning, no-op         |
| `onPause()` / `onResume()`   | Fires on visibility change  |

### Pre-submission Checklist
- [ ] `submitScore()` called at the right time for your game type
- [ ] `emitScoreConfig()` called once with 4 anchors during init
- [ ] Haptics wired to key interactions (buttons, hits, game over)
- [ ] `gameplayStart()` / `gameplayStop()` called on play/pause/game-over transitions
- [ ] `onPause` / `onResume` pause game loops
- [ ] Game state saved at meaningful checkpoints (if needed for progression)
- [ ] `flushGameState()` called at game over
- [ ] `loadGameState()` validates fields and handles empty state
- [ ] No `localStorage` for cross-session progress
- [ ] No "best score" or "high score" UI — platform handles leaderboards

## How It Works Under the Hood (For Context)

- **On Web**: The platform injects scripts that listen for these calls. `submitScore` and `saveGameState` send `postMessage` events to the parent window. `triggerHaptic` uses the Web Vibration API as a fallback.
- **On Mobile**: The platform injects a bridge into the WebView. `submitScore`, `triggerHaptic`, and `saveGameState` route through `ReactNativeWebView.postMessage`, which forwards to native handlers.

## Agent Instructions

When writing game logic:
- **Always** include a `score` variable for the current session.
- **Always** call `oasiz.submitScore(this.score)` when the game ends (Game Over).
- **Always** call `oasiz.emitScoreConfig()` once during initialization with 4 anchors.
- **Always** implement haptic feedback for key interactions (hits, pickups, UI).
- **Always** call `oasiz.gameplayStart()` / `oasiz.gameplayStop()` on play/pause/game-over transitions.
- **Always** use `oasiz.loadGameState()` / `oasiz.saveGameState(state)` for per-user persistent game data.
- **Always** subscribe to `oasiz.onPause()` / `oasiz.onResume()` for lifecycle events.
- **Never** use raw `window.*` bridge calls — use the SDK instead.