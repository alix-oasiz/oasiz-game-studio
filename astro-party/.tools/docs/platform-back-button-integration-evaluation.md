# Platform Back Button Integration Evaluation

Date: 2026-03-07
Scope: `astro-party` platform navigation/back behavior only.

## Goal

Use platform back handling for in-game/back actions and hide custom top leave/back buttons when running inside platform runtime, while ensuring there is always a guaranteed quit path.

Product decision locked:
- Use one central confirmation modal for back-triggered leave actions.
- In lobby: show lobby-specific confirm copy.
- In active match flow: show match-specific confirm copy.

## SDK Findings (from npm docs + local install)

- npm docs (`@oasiz/sdk` latest) describe navigation APIs:
  - `oasiz.onBackButton(callback)`
  - `oasiz.onLeaveGame(callback)`
  - `oasiz.leaveGame()`
- Project currently has `@oasiz/sdk@1.0.1` installed (`astro-party/package.json`, `astro-party/node_modules/@oasiz/sdk/package.json`).
- Current local type surface used in the project wrapper (`src/platform/oasizBridge.ts`) does not expose navigation APIs yet; only pause/resume, score, haptics, room code, gameplay activity.

Implication:
- For clean typed integration, update dependency to `@oasiz/sdk@1.0.2` (or newer) first.
- Then extend `src/platform/oasizBridge.ts` to expose `onBackButton`, `onLeaveGame`, and `leaveGame`.

## Current Back/Leave Surface in Game

Top leave/back UI currently present:
- `#leaveLobbyBtn` in lobby topbar (`index.html`, wired in `src/ui/lobby.ts`)
- `#leaveGameBtn` in HUD top-left (`index.html`, wired in `src/ui/modals.ts`)

Other leave/back surfaces:
- `#leaveEndBtn` (end screen footer) via `src/ui/screens.ts`
- `#settingsLeaveBtn` (inside settings modal) via `src/ui/settings.ts`
- `#backToStartBtn` (join form back) via `src/ui/startScreen.ts`

Current behavior baseline:
- No platform back integration exists in `src/main.ts`.
- `game.leaveGame()` returns to START screen and disconnects room (`src/Game.ts`).
- No global `Escape`/back stack manager exists.

## What to Wire, Where, and When

## 1) Platform bridge wiring

Files:
- `src/platform/oasizBridge.ts`
- `src/main.ts`

Add wrapper methods:
- `onBackButton(callback): () => void`
- `onLeaveGame(callback): () => void`
- `requestPlatformLeaveGame(): void`

Runtime condition:
- Register handlers only when `isPlatformRuntime()` is true.

## 2) Hide custom top leave/back on platform

Files:
- `src/ui/lobby.ts`
- `src/ui/screens.ts`

Rules:
- Hide `leaveLobbyBtn` on platform.
- Hide `leaveGameBtn` on platform.
- Keep non-top footer actions (`leaveEndBtn`, `settingsLeaveBtn`) unless product wants full migration later.

## 3) Central back-action arbiter in main

File:
- `src/main.ts`

Reason:
- `main.ts` already owns phase->screen sync and demo context orchestration, so it is the right owner for a single back decision tree.

Back action routing (updated with product decision):
1. Close top-most open modal/overlay:
- leave confirm modal
- settings modal
- advanced settings modal
- map picker modal
- key-select modal
- start join section (equivalent to `backToStart`)
2. If demo tutorial active: end tutorial and return to start/menu demo state (do not quit app).
3. If phase is `LOBBY`: open central confirm modal with lobby copy.
4. If phase is `MATCH_INTRO` / `COUNTDOWN` / `PLAYING` / `ROUND_END` / `GAME_END`: open central confirm modal with match copy.
5. If already at START/root: call `requestPlatformLeaveGame()`.
6. Final fallback for unknown state: call `requestPlatformLeaveGame()`.

## 3.1) Central confirmation modal contract

Files:
- `src/ui/modals.ts`
- `src/ui/settings.ts`
- `src/ui/screens.ts`
- `index.html` (minimal text/element hooks if needed)

Plan:
- Reuse one modal controller with explicit context input, for example:
  - `LOBBY_LEAVE`
  - `MATCH_LEAVE`
- Dynamic modal content by context:
  - Lobby title/body: "Leave Lobby?" and equivalent text.
  - Match title/body: "Leave Match?" and equivalent text.
- Confirm action for both contexts:
  - `await game.leaveGame()` (returns to START).
- Cancel/backdrop action:
  - close modal only.

Integration note:
- Existing footer/settings leave buttons should call the same modal API so leave confirmation behavior stays consistent across button and platform back paths.

## 4) Host-initiated leave callback

File:
- `src/main.ts`

Hook `onLeaveGame` for lightweight cleanup only:
- stop/pause audio
- close open overlays
- optional flush/persist hooks if needed

Do not block host close in this callback.

## Safety: Prevent "Unquittable" States

Non-negotiable safeguards:
- Always keep a terminal fallback to `requestPlatformLeaveGame()`.
- Guard against re-entrancy (single in-flight back action at a time).
- Do not keep back listener behavior that consumes events without action.
- Ensure listener cleanup/unsubscribe on teardown/destroy paths.

If any back branch returns "handled" but does not mutate state, treat it as a bug.

## Proposed Minimal Implementation Sequence

1. Upgrade SDK and extend `oasizBridge` with nav wrappers.
2. Convert leave modal into a central, context-driven confirm modal.
3. Route existing leave entry points (lobby/game/settings/end) through central modal API.
4. Add platform back arbiter in `main.ts` with precedence above.
5. Hide top leave buttons on platform (`lobby.ts`, `screens.ts`).
6. Hook `onLeaveGame` cleanup.
7. Validate with platform and local-runtime test matrix.

## Validation Matrix

Platform runtime:
- START + no modal: platform back exits game.
- START + join section open: back closes join section, next back exits game.
- START + settings open: back closes settings.
- Tutorial active: back exits tutorial to start/menu (not app exit).
- LOBBY: back opens lobby leave confirm; confirm leaves to START; cancel stays in lobby.
- PLAYING/COUNTDOWN/ROUND_END/MATCH_INTRO: back opens match leave confirm; confirm leaves to START; cancel resumes game flow.
- GAME_END: back opens match leave confirm; confirm leaves to START; cancel stays on end screen.
- Any modal open in any phase: back closes modal first.

Non-platform runtime:
- Existing custom leave/top buttons still work as before.
- No regression in start/lobby/game/end flows.

## Product Decision Status

Resolved:
- Platform back in lobby and in active match flow must open a confirmation modal first.
- Confirmation modal is central/shared, with context-specific copy and the same leave action (`game.leaveGame()`).

Still open (optional polish, not blocking implementation):
- Exact final UX copy strings for lobby/match confirm text.
