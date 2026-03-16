# 🎮 Game Development Guide

Welcome to the Oasiz Game Studio! This guide will help you create high-quality games for the Oasiz platform.

## Quality Bar

**The bar for quality is a game you'd see on the App Store.** If you wouldn't download it, it shouldn't be on our platform.

- Games must be **fun** and **polished**
- If games are **challenging**, they should increase in difficulty
- All games need professional-grade visuals, animations, and game feel. This can mean assets (jpg, png, etc), animated sprites, glb, but assets are not required.
It is very feasible to reach this quality level using vanilla JS, CSS, and HTML Canvas, use what you're comfortable with.
- Games should either have:
      - depth (many levels with delightful nuance) 
      - or high replay value (slowly increases in difficulty making you want to play again and again)
      - The best games have both but there are exceptions (flappy bird, etc)
- Every interaction should feel satisfying (we call this "juice"), this includes start screen, pause menus, heads-up displays (HUD), game over screen, etc
- Highly reccomend generating music using Suno and sound effects using models like Google Lyria
### Game Categories

| Category | Description |
|----------|-------------|
| **Action** | Fast-paced games requiring quick reflexes |
| **Casual** | Easy to pick up, relaxing gameplay |
| **Puzzle** | Brain teasers and logic challenges |
| **Arcade** | Classic arcade-style mechanics |
| **Party** | Social, multiplayer-friendly games |

> 💡 **Pro tip**: Download the Oasiz app via testflight to see the quality bar and get inspiration from existing games. Ask abel@oasiz.ai if you do not yet have access.

---

## Getting Started

### Step 1: Fork the Repository

Start by forking this repository to your own GitHub account:

1. Click the **Fork** button at the top right of this repository
2. Clone your forked repository locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/oasiz-game-studio.git
   cd oasiz-game-studio
   ```

### Step 2: Create Your Game

```bash
# 1. Copy the template folder
cp -r template/ your-game-name/

# 2. Navigate to your game folder
cd your-game-name/

# 3. Install dependencies
bun install

# 4. Start building!
# - Game logic starts in src/main.ts
# - HTML/CSS goes in index.html
bun run dev

# 5. Build when ready
bun run build
```

### Step 3: Submit a Pull Request

When your game is complete and tested:

1. **Commit your changes** to your forked repository:
   ```bash
   git add .
   git commit -m "Add [your-game-name] game"
   git push origin main
   ```

2. **Create a Pull Request** back to the main Oasiz repository:
   - Go to your forked repository on GitHub
   - Click **"Contribute"** → **"Open pull request"**
   - Add a description of your game and any notes for reviewers
   - Submit the PR for review

3. **Wait for review** — the Oasiz team will review your game and provide feedback or merge it into the main repository

---

## Project Structure

```
your-game-name/
├── src/
│   ├── main.ts      # Entry point for the game logic
│   └── ...          # Other TypeScript modules
├── index.html       # Entry point + CSS styles
├── package.json     # Dependencies
├── tsconfig.json    # TypeScript config
└── vite.config.js   # Build config
```

**Key rules:**
- All game code resides in the `src/` directory.
- `src/main.ts` is the entry point, but code can be split across multiple files within `src/`.
- All CSS in `<style>` tags in `index.html`
- No JavaScript in `index.html`

---

## Working with AI (Cursor)

Reference `@AGENTS.md` in your prompts—it contains all the rules for:
- Haptic feedback patterns
- Score submission
- Mobile/desktop responsiveness
- Settings modal requirements
- UI safe areas
- Performance best practices

Example prompt:
```
@AGENTS.md Create a simple endless runner game with a jumping character
```

---

## Platform Requirements

### Responsive Design
Games run in an iframe modal at various sizes. Your game MUST:
- Fill 100% of viewport (`window.innerWidth` × `window.innerHeight`)
- Work on both mobile (touch) and desktop (keyboard/mouse)
- Handle resize events
- Hide mobile-only controls on desktop

```typescript
const isMobile = window.matchMedia('(pointer: coarse)').matches;
```

### Safe Areas
Games are embedded with platform overlays. Interactive buttons must respect:
- **Desktop**: Minimum `45px` from top
- **Mobile**: Minimum `120px` from top

### Required Settings Modal
Every game MUST have a settings button (gear icon) with toggles for:
1. **Music** 🎵 - Background music on/off
2. **FX** 🔊 - Sound effects on/off  
3. **Haptics** 📳 - Vibration on/off

Settings persist via `localStorage`.

### Score Submission
Call `window.submitScore(score)` on game over:

```typescript
private submitFinalScore(): void {
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(this.score);
  }
}
```

**Never** track high scores locally—the platform handles leaderboards.

### Haptic Feedback
Trigger haptics for satisfying game feel:

```typescript
// Available types: "light", "medium", "heavy", "success", "error"
if (typeof (window as any).triggerHaptic === "function") {
  (window as any).triggerHaptic("medium");
}
```

| Type | Use Case |
|------|----------|
| `light` | UI taps, button presses |
| `medium` | Collecting items, standard hits |
| `heavy` | Explosions, major collisions |
| `success` | Level complete, achievements |
| `error` | Damage, game over |

### Multiplayer Games

If you're building a **multiplayer game**, use [Playroom Kit](https://docs.joinplayroom.com/) for real-time networking. See `draw-the-thing/` as a complete working example.

```bash
# Install Playroom Kit
bun add playroomkit
```

**Key requirements for multiplayer games:**

1. **Broadcast Room Code** — Call `window.shareRoomCode(roomCode)` after connecting so friends can join:
   ```typescript
   import { insertCoin, getRoomCode } from "playroomkit";
   
   await insertCoin({ skipLobby: true, roomCode: "ABCD" });
   
   // Broadcast to platform
   if (typeof (window as any).shareRoomCode === "function") {
     (window as any).shareRoomCode(getRoomCode());
   }
   ```

2. **Handle Injected Room Codes** — The platform may auto-inject a room code:
   ```typescript
   if (window.__ROOM_CODE__) {
     await connectToRoom(window.__ROOM_CODE__);
   }
   ```

3. **Clear Room Code on Leave** — When players leave, clear the shared code:
   ```typescript
   (window as any).shareRoomCode(null);
   ```

For detailed patterns (player state, host logic, RPC calls), see `Agents.md` and the `draw-the-thing/` source code.

> 📚 **For more in-depth Playroom Kit knowledge**, see [`playroom_js.md`](./playroom_js.md).

---

## Assets


Asset files will be hosted at `https://assets.oasiz.ai/ when importing your game to the platform. For development, include assets locally.

---

## Build & Test

```bash
# Build your game (run from game folder, not root)
cd your-game-name
bun run build

# Output goes to dist/index.html
```

### Upload to Test on the Oasiz App

You can upload your game directly to test it on the Oasiz platform before submitting a PR.

PLEASE TEST ON THE OASIZ APP FOR PERFORMANCE, TESTING ON WEBBROWSER OR SIMULATOR IS NOT ENOUGH.

#### 1. Set Up Environment Variables

Create a `.env` file in the root directory (or set these in your shell):

Easiest way is to just copy env.example directly (copy them exactly) and change the email to your account email (the email that is used to create your account)

```bash
# Required - get these from the Oasiz team
OASIZ_UPLOAD_TOKEN=your_upload_token (copy from env.example)
OASIZ_EMAIL=your-registered-email@example.com
OASIZ_API_URL= copy from env.example 

# Optional - defaults to production API
# OASIZ_API_URL=http://localhost:3001/api/upload/game


```

#### 2. (Optional) Create a publish.json

Add a `publish.json` file in your game folder for metadata:

```json
{
  "title": "Your Game Title",
  "description": "A brief description of your game",
  "category": "arcade",
  "verticalOnly": false
}
```

Categories: `arcade`, `puzzle`, `party`, `action`, `strategy`, `casual`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `title` | string | folder name | Display name of the game |
| `description` | string | `"test"` | Brief game description |
| `category` | string | `"arcade"` | Game category |
| `verticalOnly` | boolean | `true` | Lock to portrait orientation. Set to `false` for landscape-friendly games. |

If you skip this file, defaults will be used (folder name as title, "test" for description/category, portrait-locked).

**Update vs. new game:** The platform uses the **`title`** (from `publish.json`) combined with your **account email** (from `OASIZ_EMAIL`) to determine whether to update an existing game or create a new one:
- **Same title + same email** = updates the existing game
- **Different title + same email** = creates a new game
- **Same title + different email** = creates a new game (each creator has their own namespace)

To upload a new version of the same game, just keep the title the same and run `bun run upload` again. To create a separate new game, change the `title` in `publish.json`.

#### 3. Upload Your Game

```bash
# From the repo root directory
bun run upload your-game-name

# Orientation options (overrides publish.json):
bun run upload your-game-name horizontal   # Landscape-friendly (verticalOnly=false)
bun run upload your-game-name vertical     # Portrait-locked (verticalOnly=true, default)

# Other options:
bun run upload your-game-name --skip-build  # Use existing dist/
bun run upload your-game-name --dry-run     # Test without uploading

# Combine options:
bun run upload your-game-name horizontal --skip-build
# List all available games
bun run upload --list
```

**Orientation:** By default, games are uploaded as portrait-locked (`verticalOnly=true`). If your game works well in landscape, pass `horizontal` or set `"verticalOnly": false` in `publish.json`. The CLI argument overrides `publish.json`.

The upload script will:
1. Build your game (install deps + vite build)
2. Read the bundled HTML from `dist/index.html`
3. Collect and upload assets to CDN
4. Include thumbnail if `thumbnail/` folder exists
5. Upload to the Oasiz platform

---

## Unity WebGL Games

Unity games follow a different workflow. The full Unity project source lives under `Unity/` and the WebGL build output is produced manually in the Unity Editor.

### Folder Structure

```
Unity/
└── YourGame/                    ← Unity project root
    ├── Assets/                  ← All game source (scenes, scripts, art)
    ├── ProjectSettings/         ← Unity project settings
    ├── Packages/                ← Unity package manifest + lockfile
    ├── publish.json             ← Required for upload (create this manually)
    └── Build/                   ← WebGL export goes here (gitignored)
        ├── index.html
        ├── Build/               ← Unity always creates this nested subfolder
        │   ├── Build.loader.js
        │   ├── Build.framework.js
        │   ├── Build.data
        │   └── Build.wasm
        ├── StreamingAssets/     ← Optional: JSON data, audio, etc.
        └── TemplateData/        ← Optional: loading screen assets
```

> The `Build/` folder is gitignored — it contains large binary files (`.wasm` can be 50 MB+). You export it locally before uploading.

### Unity SDK

If your Unity game needs the Oasiz SDK, install it into the Unity project before building WebGL.

Download the Unity package here:

- `https://assets.oasiz.ai/sdk/OasizSDK.unitypackage`

In Unity:

1. Open your Unity project under `Unity/YourGame/`
2. Go to **Assets -> Import Package -> Custom Package...**
3. Select `OasizSDK.unitypackage`
4. Import the package into your project

The SDK should end up inside your Unity project's `Assets/` folder, for example:

```
Unity/
└── YourGame/
    ├── Assets/
    │   └── OasizSDK/
    │       ├── Runtime/
    │       │   ├── OasizSDK.cs
    │       │   ├── OasizTypes.cs
    │       │   ├── com.oasiz.sdk.Runtime.asmdef
    │       │   └── Plugins/
    │       │       └── WebGL/
    │       │           └── OasizBridge.jslib
    │       └── ...
    ├── ProjectSettings/
    ├── Packages/
    ├── publish.json
    └── Build/
```

Keep all Unity game files inside `Unity/YourGame/`. Do not put Unity scenes, scripts, textures, or project settings at the repo root.

### Unity SDK Quick Start

Initialize the SDK early in your game's lifecycle so it can register WebGL bridge listeners and survive scene changes:

```csharp
using System.Collections.Generic;
using Oasiz;
using UnityEngine;

public class GameManager : MonoBehaviour
{
    private void Awake()
    {
        _ = OasizSDK.Instance;

        OasizSDK.EmitScoreConfig(new ScoreConfig(
            new ScoreAnchor(30, 100),
            new ScoreAnchor(60, 300),
            new ScoreAnchor(120, 600),
            new ScoreAnchor(300, 950)
        ));

        var state = OasizSDK.LoadGameState();
        OasizSDK.OnPause += HandlePause;
        OasizSDK.OnResume += HandleResume;
    }

    private void OnGameOver(int score, int currentLevel)
    {
        OasizSDK.SaveGameState(new Dictionary<string, object>
        {
            ["level"] = currentLevel,
        });
        OasizSDK.FlushGameState();
        OasizSDK.SubmitScore(score);
        OasizSDK.TriggerHaptic(HapticType.Error);
    }

    private void HandlePause()
    {
        // Pause gameplay/audio here
    }

    private void HandleResume()
    {
        // Resume gameplay/audio here
    }
}
```

### Unity SDK API Reference

The current Unity SDK supports the same main runtime feature areas as the current JavaScript SDK:

- score submission and score normalization
- haptic feedback
- game state load/save/flush
- pause and resume lifecycle events
- back button and leave game navigation hooks
- multiplayer room code sharing
- injected identity values like `GameId` and `PlayerName`

#### Score

Use these methods to report scores and configure score normalization:

- `OasizSDK.SubmitScore(int score)`
- `OasizSDK.EmitScoreConfig(ScoreConfig config)`

```csharp
OasizSDK.EmitScoreConfig(new ScoreConfig(
    new ScoreAnchor(10, 100),
    new ScoreAnchor(30, 300),
    new ScoreAnchor(75, 600),
    new ScoreAnchor(200, 950)
));

OasizSDK.SubmitScore(Mathf.FloorToInt(score));
```

Rules:

- call `SubmitScore()` once at game over or at the appropriate end-of-session moment
- pass exactly 4 anchors to `EmitScoreConfig()`
- `raw` anchor values should increase strictly
- the last normalized anchor should be `950`

#### Haptics

Use `OasizSDK.TriggerHaptic(HapticType type)` for key interactions:

```csharp
OasizSDK.TriggerHaptic(HapticType.Light);
OasizSDK.TriggerHaptic(HapticType.Medium);
OasizSDK.TriggerHaptic(HapticType.Success);
OasizSDK.TriggerHaptic(HapticType.Error);
```

Available haptic types:

- `HapticType.Light`
- `HapticType.Medium`
- `HapticType.Heavy`
- `HapticType.Success`
- `HapticType.Error`

Suggested usage:

- `Light` for UI taps and menu buttons
- `Medium` for pickups, collisions, and normal scoring moments
- `Heavy` for major impacts
- `Success` for level complete or special achievements
- `Error` for damage, failure, or game over

#### Game State

Use these methods for persistent player state:

- `OasizSDK.LoadGameState()`
- `OasizSDK.SaveGameState(Dictionary<string, object> state)`
- `OasizSDK.FlushGameState()`

```csharp
var state = OasizSDK.LoadGameState();

if (state.TryGetValue("__json", out var raw))
{
    Debug.Log("Loaded raw state JSON: " + raw);
}

OasizSDK.SaveGameState(new Dictionary<string, object>
{
    ["level"] = level,
    ["coins"] = coins,
});

OasizSDK.FlushGameState();
```

Notes:

- `SaveGameState()` is debounced by the platform, so it is safe to call at checkpoints
- `FlushGameState()` forces an immediate write
- the current Unity SDK returns raw JSON under `state["__json"]` for full parsing when needed

#### Lifecycle

Use the lifecycle events to react to backgrounding and resume:

- `OasizSDK.OnPause`
- `OasizSDK.OnResume`

```csharp
private void OnEnable()
{
    OasizSDK.OnPause += HandlePause;
    OasizSDK.OnResume += HandleResume;
}

private void OnDisable()
{
    OasizSDK.OnPause -= HandlePause;
    OasizSDK.OnResume -= HandleResume;
}
```

Recommended usage:

- pause gameplay and mute audio on `OnPause`
- resume gameplay and restore audio on `OnResume`

#### Navigation

Use these APIs when your game needs to handle platform back actions or close itself:

- `OasizSDK.SubscribeBackButton(Action handler)`
- `OasizSDK.OnLeaveGame`
- `OasizSDK.LeaveGame()`

```csharp
using System;

private Action _unsubscribeBack;

private void OnEnable()
{
    _unsubscribeBack = OasizSDK.SubscribeBackButton(HandleBack);
    OasizSDK.OnLeaveGame += HandleLeaveGame;
}

private void OnDisable()
{
    _unsubscribeBack?.Invoke();
    OasizSDK.OnLeaveGame -= HandleLeaveGame;
}

private void HandleBack()
{
    // Open or close pause menu
}

private void HandleLeaveGame()
{
    OasizSDK.FlushGameState();
}
```

#### Multiplayer and Injected Values

Use these APIs for multiplayer room sharing and platform-injected identity values:

- `OasizSDK.ShareRoomCode(string roomCode)`
- `OasizSDK.GameId`
- `OasizSDK.RoomCode`
- `OasizSDK.PlayerName`
- `OasizSDK.PlayerAvatar`

```csharp
OasizSDK.ShareRoomCode("ABCD");
OasizSDK.ShareRoomCode(null);

string gameId = OasizSDK.GameId;
string roomCode = OasizSDK.RoomCode;
string playerName = OasizSDK.PlayerName;
string playerAvatar = OasizSDK.PlayerAvatar;
```

Use cases:

- send the active room code to the platform for invites
- read `RoomCode` to auto-join multiplayer sessions
- read `PlayerName` and `PlayerAvatar` for player-facing UI

#### Editor Behavior

In the Unity Editor, the platform bridge is not injected. The SDK is designed to safely no-op and print `Debug.Log` messages instead of crashing. This means:

- you can test compile-time integration in the Editor
- real score submission, haptics, and platform bridge behavior only happen in WebGL with the Oasiz host bridge available

#### How the Unity SDK Works

The Unity SDK uses:

- `OasizSDK.cs` as the persistent singleton MonoBehaviour
- `OasizBridge.jslib` as the WebGL bridge layer for `[DllImport("__Internal")]`
- DOM custom events `oasiz:pause`, `oasiz:resume`, `oasiz:back`, and `oasiz:leave` for incoming host events

### Step 1: Export WebGL from Unity

1. Open the project in Unity (e.g. `Unity/ThreadTangle/`)
2. Make sure your game files live under `Unity/YourGame/`:
   - `Assets/` for scenes, scripts, prefabs, textures, audio
   - `ProjectSettings/` for Unity project settings
   - `Packages/` for Unity package configuration
   - `publish.json` at the game root
3. Go to **File -> Build Settings**
4. Select **WebGL** platform (switch platform if needed)
5. Set the output folder to `Build/` inside your game directory:
   - `Unity/YourGame/Build/`
6. Click **Build**

Unity will produce the nested structure above automatically — this is Unity's default WebGL output.

### Step 2: Create publish.json

Add a `publish.json` at the root of your game folder (next to `Assets/`):

```json
{
  "title": "Your Game Title",
  "description": "A brief description of your game",
  "category": "puzzle",
  "verticalOnly": true
}
```

### Step 3: Upload

The upload script auto-detects Unity games — just use the game name:

```bash
# Auto-detected (script looks in Unity/ folder if not found at root)
bun run upload YourGame

# Or explicit path:
bun run upload Unity/YourGame

# Dry run to verify everything looks right before uploading:
bun run upload YourGame --dry-run

# List all games (shows TypeScript and Unity sections separately):
bun run upload --list
```

The script will **skip the build step** (Unity games are pre-built) and:
1. Read `Build/index.html` and rewrite asset paths to CDN URLs
2. Upload all files in `Build/` to the CDN
3. Upload to the Oasiz platform

### Updating a Unity Game

After making code changes in Unity:

```
Edit .cs files → Open Unity Editor (auto-recompiles) → File → Build Settings → Build → bun run upload YourGame
```

The `Build/` folder is replaced each time you build in Unity, so just re-run the upload after every new build.

#### 4. Test on the App

Once uploaded, open the Oasiz app and navigate to **Profile → Drafts** to find your game. Tap it to launch and verify:

- The game loads correctly
- Touch controls work on mobile
- Score submission works on game over
- The overall experience matches your local testing

### Testing Checklist
- [ ] Works on mobile (touch controls)
- [ ] Works on desktop (keyboard/mouse)
- [ ] Settings modal with Music/FX/Haptics toggles
- [ ] Score submits on game over
- [ ] No visual glitches or flickering
- [ ] Responsive at all viewport sizes
- [ ] Start screen is polished and engaging
- [ ] Game is actually fun!

---

## Common Pitfalls

❌ **Don't** use `Math.random()` in render loops (causes flickering)  
❌ **Don't** use emojis (inconsistent across platforms)  
❌ **Don't** track high scores locally  
❌ **Don't** put JavaScript in `index.html`  
❌ **Don't** forget to handle window resize  

✅ **Do** pre-calculate random values during object creation  
✅ **Do** use icon libraries instead of emojis  
✅ **Do** call `window.submitScore()` on game over  
✅ **Do** use TypeScript for all game logic  
✅ **Do** test on both mobile and desktop  

---

## Need Help?

1. Check `AGENTS.md` for detailed technical requirements
2. Look at existing games for implementation patterns
3. Download the Oasiz app to understand the quality bar

**Remember: If it wouldn't be on the App Store, it shouldn't be on Oasiz.**

Happy game making! 🚀

