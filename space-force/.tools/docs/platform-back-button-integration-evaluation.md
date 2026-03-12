# Platform Back + Leave Behavior

Date: 2026-03-07
Scope: `space-force` navigation/leave behavior only.
Status: Implemented in code.

## Locked Product Rules

1. Platform quit API (`oasiz.leaveGame()` via `requestPlatformLeaveGame()`) is start-screen-only.
2. Non-start leave/back flows are confirmation-driven with `Yes` / `No`.
3. Leave contexts must distinguish lobby leave vs match leave, and endless host termination should surface as end-match intent.

## Implemented Behavior Map

| Context / Trigger | Immediate Path | Confirm Result (`Yes`) | Calls platform quit directly |
| --- | --- | --- | --- |
| Start flow (start screen / demo attract / demo menu) + platform back | `requestPlatformLeaveGame()` | n/a | Yes |
| Lobby leave button | `openLeaveModal("LOBBY_LEAVE")` | `game.leaveGame()` | No |
| Platform back while in lobby | `openLeaveModal("LOBBY_LEAVE")` | `game.leaveGame()` | No |
| Match leave button(s) / end screen leave | `openLeaveModal("MATCH_LEAVE")` | `game.leaveGame()` | No |
| Platform back in match phases | `openLeaveModal("MATCH_LEAVE" \| "END_MATCH")` | `game.leaveGame()` and `game.endMatch()` first when endless host is terminating | No |
| Platform back in tutorial | `openLeaveModal("TUTORIAL_LEAVE")` | `teardownDemoAndShowMenu()` | No |

## Wiring Notes

- `src/ui/modals.ts`
  - Removed platform-quit escalation from modal confirm.
  - Added context-aware modal copy and standardized action labels to `Yes` / `No`.
  - Added `END_MATCH` and `TUTORIAL_LEAVE` contexts.
- `src/main.ts`
  - Back handler now gates platform quit to start/demo-menu contexts only.
  - Lobby and match phases always route to leave modal.
  - Tutorial back now routes to confirmation modal and safely tears down demo via callback.

## Manual Validation Matrix

1. Platform back on start screen exits app.
2. Platform back in lobby shows `Leave Lobby?` and does not exit app before confirmation.
3. Platform back during match shows `Leave Match?` (or `End Match?` for endless host in `PLAYING`).
4. Lobby/match leave UI buttons follow same modal behavior as platform back.
5. Platform back during tutorial shows `Leave Tutorial?` and returns to start flow on confirm.
