# Demo / Attract Mode Current State (Post-Merge Audit)

## Summary

This document reflects the demo system as currently implemented in the repo. The original implementation plan is now outdated in several areas (lifecycle, audio behavior, and second-visit behavior).

Current behavior:
- A local AI battle is started after splash whenever no injected `__ROOM_CODE__` is present.
- First visit shows full attract overlay.
- Subsequent visits skip attract UI but keep the background demo battle running behind the start screen.
- Scores are blocked while demo session mode is active.

## Runtime Lifecycle

State machine in `src/demo/DemoController.ts`:

`IDLE -> STARTING -> ATTRACT -> TUTORIAL -> FREEPLAY -> MENU -> TEARING_DOWN -> DONE`

### Effective flow

1. App boots, splash finishes.
2. If `window.__ROOM_CODE__` exists, auto-join path runs and demo is skipped.
3. Otherwise, demo local room starts.
4. If `astro-party-demo-seen` is missing, attract overlay is shown.
5. If `astro-party-demo-seen` exists, app goes straight to start menu with background demo battle (`MENU` state).

### Demo transitions

- `startDemo()`
  - Sets demo session flag.
  - Switches transport to local mode.
  - Creates room, toggles host to AI, adds 3 AI bots (4 AI total).
  - Sets hidden map `6`.
  - Hides arena border visually.
  - Starts game and skips countdown.
  - Starts respawn monitor and stale pilot cleanup loop.
- `enterTutorial()`
  - Transitions from attract to tutorial.
  - Returns host control to human.
  - Enables keyboard/touch gameplay input paths.
- `enterFreePlay()`
  - Ends scripted tutorial and resumes sim.
  - Shows `Exit Demo` button.
- `enterMenu()`
  - Keeps battle running in background.
  - Returns host to AI.
  - Used by skip and exit paths.
- `teardown()`
  - Stops monitors/timers.
  - Restores audio mix and border.
  - Clears demo flag.
  - Leaves room via `game.leaveGame()`.

## What Changed vs Original Plan

1. Demo is no longer strictly first-launch-only.
- First launch controls attract overlay visibility only.
- Background demo battle still runs on later visits.

2. Tutorial completion no longer tears down immediately.
- Completing tutorial enters `FREEPLAY`.
- Player exits via explicit `Exit Demo` button.

3. Audio handling changed.
- No persisted `SettingsManager.fx` mute/unmute writes.
- Runtime mix uses `AudioManager.setGameplayFxVolumeMultiplier(...)`.
- In `STARTING`/`ATTRACT`/`MENU`, gameplay FX are reduced (not fully muted).
- Menu BGM is preserved during background demo states.

4. Touch/input flow was hardened.
- Attract overlay uses pointer handlers that prevent skip tap propagation.
- Tutorial uses live local input action subscriptions (`rotate`/`fire`) from game loop events.
- Mobile left-rotate touch zone is highlighted during player intro spotlight.

## Current File-Level Implementation

### Core demo modules

- `src/demo/DemoController.ts`
  - Manages state, room bootstrap, phase reactions, auto-restart, pause/resume, respawn, and cleanup.
  - Auto-restarts match on `GAME_END` after ~1.5s (`continueMatchSequence()`).
  - Skips every countdown while demo is active.
  - Respawns spectating players with delayed timers and performs stale pilot cleanup.

- `src/demo/DemoOverlayUI.ts`
  - Attract, tutorial, player-intro spotlight, and exit button logic.
  - Tutorial now has explicit `Next` progression and action-gated "try it" phases.
  - Uses callbacks for pause/resume, camera zoom boost, ship tracking, and action subscriptions.

- `src/demo/demoTutorial.ts`
  - Provides platform-specific tutorial steps and SVG control diagrams.
  - Typewriter renderer retained.

### Engine/network support

- `shared/sim/types.ts`
  - `MapId` includes `6`.

- `shared/sim/maps.ts`
  - Hidden demo map `6` exists in `MAP_DEFINITIONS`.
  - Map `6` is not in `ALL_MAP_IDS` or `CLASSIC_ROTATION_MAP_IDS`.
  - Current map shape is repulsion + asteroids (no center hole in present code).

- `shared/sim/AstroPartySimulation.ts`
  - `setMap` validation accepts `0..6`.
  - Added demo support APIs: `setPlayerAI`, `skipCountdown`, `demoCleanupStalePilots`, `demoRespawnPlayer`.

- `src/network/transports/NetworkTransport.ts`
  - Optional demo hooks exposed:
    - `setPlayerAI`
    - `skipCountdown`
    - `pauseSimulation`
    - `demoRespawnPlayer`
    - `demoCleanupStalePilots`

- `src/network/transports/LocalSharedSimTransport.ts`
  - Implements demo hooks and simulation pause gate.

- `src/network/NetworkManager.ts`
  - Pass-through methods for the same demo hooks.

- `src/Game.ts`
  - Demo session flag and score-submit policy guard:
    - `if (this.isDemoSession) return false;` in score eligibility.
  - Demo APIs exposed to `main.ts`:
    - `setHostAI`
    - `skipDemoCountdown`
    - `setSimPaused`
    - `demoRespawnPlayer`
    - `demoCleanupStalePilots`
    - `setDemoZoomBoost`
    - `getLocalShipViewportPos`
  - Emits local input action edges (`rotate`/`fire`) for tutorial logic.

### UI and orchestration

- `src/main.ts`
  - Demo bootstrap now always runs without injected room code.
  - Attract is gated by `localStorage` key `astro-party-demo-seen`.
  - Demo-aware audio scene routing keeps start/menu music during background demo phases.
  - Demo-aware screen routing suppresses normal HUD/UI while demo battle runs.
  - Start screen buttons call `beforeAction` teardown hook before normal room actions.
  - Demo touch layout is shown only in tutorial/freeplay states.

- `src/ui/screens.ts`
  - Map `6` starfield gradient included.
  - Added `forceDemoStarfield(...)` for non-game screens during demo.
  - Preserves starfield visibility when `.demo-stars` is active.

- `src/ui/startScreen.ts`
  - `setBeforeAction(...)` integrated for demo teardown-before-action behavior.

- `src/ui/elements.ts`
  - Demo overlay elements registered (core attract/tutorial controls).

- `index.html`
  - Demo CSS and DOM now include:
    - Attract overlay
    - Tutorial overlay with `Next`
    - `Exit Demo` button
    - Player intro spotlight overlay/ring
    - Mobile touch highlight style for left rotate zone

## Current Verification Checklist

1. First launch shows attract overlay over live 4-AI match.
2. Tap/keypress enters tutorial, with typewriter + action-gated steps.
3. Tutorial completion enters freeplay and shows `Exit Demo` button.
4. Skip from attract/tutorial enters start menu while background battle continues.
5. Second launch skips attract UI but still shows menu over background battle.
6. Demo map `6` remains hidden from map picker.
7. No score submission occurs while demo session flag is active.
8. Demo battle auto-restarts after match end and skips countdown.
9. Mobile touch controls are hidden in attract/menu demo states and active in tutorial/freeplay.
