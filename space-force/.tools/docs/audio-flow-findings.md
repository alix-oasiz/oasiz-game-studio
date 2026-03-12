# Audio Flow Regression Findings and Fix Plan

Date: 2026-02-26  
Scope: Rewire match/main/splash audio flow after PR #14 merge.  
Out of scope for now: Missing audio source outputs (`sfx-win.ogg`, `sfx-pilot-eject.ogg`).

## 1) Menu/Main BGM is being overridden by hidden demo match phases

Evidence:
- `main.ts` always runs `syncAudioToPhase()` on every game phase change.
- Demo mode intercepts screen/UI rendering, but does not intercept audio routing.
- Demo startup quickly pushes `LOBBY -> COUNTDOWN -> PLAYING`, which maps to `GAMEPLAY` music.

Impact:
- Main/start screen can show while gameplay BGM is playing underneath.

Fix:
- Make audio routing demo-aware in `main.ts`.
- Add a resolver that uses both `phase` and `demoController.getState()`:
  - `ATTRACT` and `MENU`: force `START` scene music.
  - `TUTORIAL` and `FREEPLAY`: allow `GAMEPLAY` scene music.
  - Demo inactive: keep current phase-based mapping.
- Use this resolver inside `syncAudioToPhase()` instead of phase-only mapping.

## 2) Results cue can fire during menu because demo reaches `GAME_END` in background

Evidence:
- `GAME_END` maps to `RESULTS` scene.
- Demo auto-restarts after `GAME_END`, but not before results music can trigger.

Impact:
- Menu/start can get unwanted results sting interruptions.

Fix:
- In demo `ATTRACT`/`MENU` states, suppress `GAME_END -> RESULTS` transitions.
- Keep currently playing menu track (or explicitly reassert `START`) until user enters active gameplay.

## 3) Demo attract mutes FX through persisted settings

Evidence:
- Demo attract calls `SettingsManager.set("fx", false)`.
- `SettingsManager.set` writes to `localStorage`.
- Restore happens later (`enterMenu`/`teardown`), but persistence can leak across interrupted sessions.

Impact:
- FX may remain off unexpectedly across reloads/sessions.
- This also affects cue playback that is currently on FX channel.

Fix:
- Stop using persisted settings writes for temporary demo muting.
- Replace with a runtime-only demo FX suppression path (non-persistent), e.g.:
  - `AudioManager` transient mute flag for gameplay FX only, or
  - demo-aware gating in gameplay feedback emitters.
- Keep user settings unchanged in storage during demo.

## 4) Splash/logo cues are on FX channel, so they are blocked when FX is off

Evidence:
- `splashScreenSting` and `logoRevealSting` are `channel: "fx"` in manifest.
- Channel gating blocks all FX when `fx` setting is disabled.

Impact:
- Splash/logo cue sequence can disappear whenever FX is disabled (intentionally or accidentally).

Fix:
- Decouple startup cues from gameplay FX mute:
  - Preferred: move splash/logo cues to a non-gameplay channel (`ui` or dedicated cue channel).
  - Alternative: keep as FX but exempt cue IDs from demo-only gameplay FX suppression.
- Ensure splash/logo remain audible even when gameplay FX is muted for attract mode.

## 5) Missing manifest outputs (deferred)

Files:
- `public/assets/audio/sfx-win.ogg`
- `public/assets/audio/sfx-pilot-eject.ogg`

Status:
- Deferred by request for this pass.

Notes:
- These are still referenced in gameplay sound mapping.
- Keep this tracked as a follow-up risk item; do not block current flow rewiring.

## Recommended implementation order

1. Add demo-aware audio scene resolver in `main.ts` and route `syncAudioToPhase()` through it.
2. Explicitly suppress demo background `GAME_END -> RESULTS` while in `ATTRACT`/`MENU`.
3. Replace persisted demo FX muting with runtime-only suppression.
4. Reclassify splash/logo cues (or exempt them from demo gameplay FX suppression).
5. Leave missing source outputs deferred for later backfill.
