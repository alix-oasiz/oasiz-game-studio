# Game Development Rules
Follow these rules for any game development task:

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
The platform needs to know the room code so friends can join. Call `window.shareRoomCode()` after connecting:
```typescript
// Share room code with parent so friends can join
function shareRoomCode(roomCode: string | null): void {
  if (typeof (window as any).shareRoomCode === "function") {
    (window as any).shareRoomCode(roomCode);
  }
}

// After successful insertCoin:
shareRoomCode(getRoomCode());

// When leaving the room, clear it:
shareRoomCode(null);
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

#### Injected Window Variables
The platform may inject these variables for auto-joining:
```typescript
declare global {
  interface Window {
    __ROOM_CODE__?: string;     // Pre-filled room code
    __PLAYER_NAME__?: string;   // Player's display name
    __PLAYER_AVATAR__?: string; // Player's avatar URL
  }
}

// Check on init:
if (window.__ROOM_CODE__) {
  await connectToRoom(window.__ROOM_CODE__);
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

# Coding Agent Guidelines: High Score Submission, Haptics, and Game State

This document explains how games generated by the Oasis coding agent must handle score submission, haptic feedback, and persistent game state to integrate with the platform's systems on both web and mobile.

## 1. High Score Submission: `window.submitScore`

To maintain platform-agnosticism, games should not worry about how scores are saved or transmitted. Instead, they must call a global function provided by the host environment. **Games MUST NOT track high scores, best scores, or persistent history locally.** The platform handles all score persistence and leaderboard logic.

```javascript
window.submitScore(score);
```

### Requirements:
1. **`score`**: Must be a **non-negative integer**.
2. **Availability**: The platform (Web or Mobile) automatically injects this function into the game's environment. The game code should check for its existence before calling it to prevent errors during local development.
3. **No Local Persistence**: Do not use `localStorage` or other local state to save high scores. Only display the current session's score.

## 2. Haptic Feedback: `window.triggerHaptic`

Games can trigger native haptic feedback on mobile devices by calling:

```javascript
window.triggerHaptic(type);
```

### Available Types:
| Type | Use Case | Feel |
|------|----------|------|
| `"light"` | UI taps, button presses, minor interactions | Soft tap |
| `"medium"` | Collecting items, standard impacts | Standard tap |
| `"heavy"` | Explosions, major collisions, screen shake | Strong thud |
| `"success"` | Level complete, achievements, high score | Celebratory pattern |
| `"error"` | Damage taken, game over, invalid action | Warning pattern |

### When to Use Haptics:
- **Collisions**: Use `heavy` for wall/enemy hits or screen shake events.
- **Pickups**: Use `light` or `medium` for coins, power-ups, or items.
- **Damage**: Use `error` when the player takes damage.
- **Victory**: Use `success` on level complete or reaching a high score.
- **UI**: Use `light` for button presses or menu navigation.

### Best Practices (The "Paddle Bounce" Standard):
- **UI Button Rule**: Every single menu button (Start, Restart, Settings, Pause) should trigger a `"light"` haptic on click/tap.
- **Tiered Feedback**: Use haptic intensity to communicate quality. 
    - *Example (Threes)*: `light` for a small merge, `medium` for a good merge, and `success` for discovering a new character.
    - *Example (Paddle Bounce)*: `success` for a perfect center hit, `medium` for an edge hit.
- **Continuous Actions**: For continuous controls (like a D-Pad or tilt buttons), trigger a `"light"` haptic on the initial press to provide a tactile "click."
- **Major Events**: Use `"heavy"` sparingly for game-changing events like bomb explosions or major screen shakes.

## 3. Game State Persistence: `window.loadGameState` / `window.saveGameState`

Games can load and persist per-user state for the current game via injected runtime helpers:

```javascript
const state = window.loadGameState();
window.saveGameState({ ...state, level: 3 });
```

### Requirements:
1. **Object Only**: State payloads must be plain JSON objects (not arrays, not primitives).
2. **Availability**: The platform injects these functions automatically. Check for existence to avoid local-dev crashes.
3. **No Custom Persistence Layer**: Do not build your own backend bridge in game code.
4. **No Local Progress Storage**: Do not use `localStorage` for cross-session game progress/state. Use `window.saveGameState` so state is synced per game per user across web/mobile.

### Runtime API:
- `window.loadGameState(): Record<string, unknown>`  
  Returns the latest persisted state object for this user and game.
- `window.saveGameState(state: Record<string, unknown>): void`  
  Queues a save for the provided state object.
- `window.flushGameState(): void`  
  Forces an immediate flush of any pending state save (usually not needed, but available for important checkpoints).

## When to Save Game State

Use `window.saveGameState` at meaningful checkpoints such as:
1. Level editor changes
2. Inventory/progression updates
3. Checkpoint or run-end snapshots
4. User-created content updates

## When to Submit Scores

The agent should implement score submission **only** at the end of the game:

1. **Game Over**: This is the only time to submit the final score. Do not submit intermediate scores or track "best" scores within the game UI.

## Implementation Pattern

The following patterns should be used in the game's main logic (e.g., `main.ts` or `GameManager`):

### Score Submission Pattern
```typescript
private submitFinalScore(): void {
  console.log("[Game] Submitting final score:", this.score);
  
  // Always check if the function exists to avoid crashes
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(this.score);
  }
}
```

### Haptic Feedback Pattern
```typescript
// Helper for UI buttons
private triggerLightHaptic(): void {
  if (this.settings.haptics && typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic("light");
  }
}

private handleCollision(isPerfect: boolean): void {
  if (this.settings.haptics && typeof (window as any).triggerHaptic === "function") {
    // Tiered feedback based on hit quality
    (window as any).triggerHaptic(isPerfect ? "success" : "medium");
  }
}

private onGameOver(): void {
  this.submitFinalScore();
  
  // Trigger error haptic on game over
  if (this.settings.haptics && typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic("error");
  }
}
```

### Game State Pattern
```typescript
private loadPersistentState(): Record<string, unknown> {
  if (typeof (window as any).loadGameState === "function") {
    return (window as any).loadGameState();
  }
  return {};
}

private savePersistentState(nextState: Record<string, unknown>): void {
  if (typeof (window as any).saveGameState === "function") {
    (window as any).saveGameState(nextState);
  }
}
```

## How It Works Under the Hood (For Context)

- **On Web**: The platform injects scripts that listen for these calls. `submitScore` and `saveGameState` send `postMessage` events to the parent window. `triggerHaptic` uses the Web Vibration API as a fallback.
- **On Mobile**: The platform injects a bridge into the WebView. `submitScore`, `triggerHaptic`, and `saveGameState` route through `ReactNativeWebView.postMessage`, which forwards to native handlers.

## Agent Instructions

When writing game logic:
- **Always** include a `score` variable for the current session.
- **Always** call `window.submitScore(this.score)` when the game ends (Game Over).
- **Always** implement haptic feedback for key interactions (hits, pickups, UI).
- **Always** use `window.loadGameState()` / `window.saveGameState(state)` for per-user persistent game data.
- **Check** for the existence of these functions before calling them.
- **Never** track high scores, "best" scores, or most recent scores locally.
- **Never** store cross-session gameplay progress in `localStorage`.
- **Never** display a "Best" or "High Score" UI element. Only show the current session's score.
- **Never** attempt to implement the storage logic or native bridge within the game code itself.
