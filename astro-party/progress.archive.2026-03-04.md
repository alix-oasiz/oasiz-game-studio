# Astro Party Progress (Condensed)

Condensed on 2026-02-28 to remove repeated micro-iterations and duplicate validation logs.

- Full pre-condense history is archived at `astro-party/progress.archive.2026-02-28.md`.
- This file now keeps milestone-level outcomes, recurring problems, and durable learnings.

## Progress Usage Contract (Effective 2026-03-02)

- `progress.md` is a two-layer tracking surface:
  - `Active Task Threads` (open-only): living in-flight threads.
  - `Milestone Journal`: append-only shipped outcomes.
- Active thread requirements (when used):
  - required fields: `Original prompt`, `Intent`, `Current plan`, `Status`, `Latest validation`.
  - `Progress updates` must be short timestamped checkpoints.
  - checkpoint format: `- [HH:MM] action taken -> result/next`.
- Mid-run checkpoint rule:
  - update checkpoints during execution, not only at start/end.
  - add a checkpoint after each meaningful boundary (context gathered, major edits, validation result, blocker/assumption change).
  - for long runs, add a heartbeat at least every 10 minutes.
- Close-out rules:
  - after completion, add one concise milestone (scope, key files, validation, outcome) and remove the active thread.
  - if there are no open threads, keep a single explicit placeholder line in `Active Task Threads`.
- Hygiene:
  - run a focused condense pass when the file exceeds ~600 lines or active visibility degrades.
  - preserve historical milestone meaning during condense.

## Active Task Threads

- None currently open. Add one thread when a planned prompt starts; remove it after milestone capture.

## Milestone Journal
## 2026-03-04 - Collision handler modular split (swept/tunnel extraction)

- Scope:
  - Split `simulationCollisionHandlers.ts` to reduce hot-path complexity concentration and improve maintainability without changing collision behavior.
- Changes:
  - Added `shared/sim/modules/simulationSweptCollisions.ts`:
    - owns swept projectile collision ordering/resolution helpers.
    - owns ship-ship and ship-pilot tunneling guard logic.
    - keeps telemetry emission on swept/tunnel paths.
  - Updated `shared/sim/modules/simulationCollisionHandlers.ts`:
    - retained direct collision handlers (`projectile/ship/pilot/asteroid/powerup`) and map-feature collision helpers.
    - replaced large swept/tunnel implementations with thin wrappers that call `runSweptProjectileHitShipCollisions(...)` and `runSweptShipTunnelingGuards(...)`.
    - removed swept-only geometry/capsule helpers from this file.
- Outcome:
  - `simulationCollisionHandlers.ts` reduced to focused ownership surface (406 lines from prior 1127).
  - Swept/tunnel logic isolated to dedicated module, making future tuning/experiments lower-risk.
- Validation:
  - `astro-party`: `bun run sim:collision-matrix` passed (5/5).
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-04 - Telemetry allocation gating in collision hot path

- Scope:
  - Removed avoidable telemetry object allocations from swept/tunneling collision hot paths when telemetry is disabled.
- Changes:
  - `shared/sim/modules/simulationCollisionHandlers.ts`:
    - replaced unconditional telemetry event construction with hard callback guards (`onCollisionTelemetry`) before object creation.
    - removed now-unneeded `emitCollisionTelemetry(...)` helper.
- Outcome:
  - Normal gameplay path (telemetry off) no longer allocates telemetry event objects inside projectile sweep and tunnel guard loops.
- Validation:
  - `astro-party`: `bun run sim:collision-matrix` passed (5/5).
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-04 - Deterministic collision matrix runner + opt-in collision telemetry

- Scope:
  - Implemented a real validation path for anti-tunneling and dead-shooter combo behavior without claiming manual in-client verification.
  - Added temporary opt-in collision telemetry for local/dev sessions.
- Changes:
  - `shared/sim/modules/simulationCollisionHandlers.ts`:
    - added `CollisionTelemetryEvent` contract and optional `onCollisionTelemetry` callback on collision context.
    - emits telemetry events for:
      - swept projectile wall/shield/ship/pilot hits,
      - swept projectile no-hit path,
      - ship-ship tunnel resolution,
      - ship-pilot tunnel resolution.
  - `shared/sim/AstroPartySimulation.ts`:
    - wired telemetry emission from sim collision context.
    - added runtime opt-in flag resolution:
      - `globalThis.__ASTRO_COLLISION_TELEMETRY__`
      - `process.env.ASTRO_COLLISION_TELEMETRY`
    - telemetry output is logged as structured JSON lines via `[CollisionTelemetry]`.
  - `scripts/run-sim-collision-matrix.ts`:
    - added deterministic matrix runner covering:
      - projectile vs ship swept hit,
      - projectile vs pilot swept hit,
      - ship vs ship tunnel guard,
      - ship vs pilot tunnel guard,
      - dead-shooter post-death scoring with combo non-advance.
  - `package.json`:
    - added `sim:collision-matrix` script.
- Outcome:
  - Deterministic matrix now provides repeatable pass/fail checks for the key collision/combo edge cases.
  - Temporary telemetry can be enabled during local/dev play to inspect swept/tunnel resolutions and no-hit projectile sweeps.
- Validation:
  - `astro-party`: `bun run sim:collision-matrix` passed (5/5).
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-03 - Pilot glow effects disabled for mobile clarity test

- Scope:
  - Temporarily disabled pilot blur/glow visuals to isolate blur/softness perception on mobile.
- Changes:
  - `shared/assets/entities/pilot.svg`:
    - removed blur shadow path (`softShadow` / `feGaussianBlur`) from pilot visual rendering.
    - removed glow gradients `visorGlow` and `thrusterGlow`.
    - removed thruster glow circle using `url(#thrusterGlow)`.
    - replaced visor glow fill (`url(#visorGlow)`) with a non-gradient solid fill (`var(--slot-primary)`) and fixed opacity.
  - `shared/assets/entities/pilot_death_debris_visor.svg`:
    - removed visor radial glow gradient and replaced visor fill with non-gradient solid fill + fixed opacity.
  - `shared/geometry/generated/EntitySvgData.ts` regenerated from source asset changes.
- Validation:
  - `astro-party`: `bun run generate:entities` passed.
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-03 - Non-substep anti-tunneling implementation (projectile/ship/pilot) + deferred substep note

- Scope:
  - Implemented non-substep anti-tunneling guards for high-speed collision paths in shared authoritative simulation.
  - Deferred physics substep implementation and documented rollout approach separately.
- Changes:
  - `shared/sim/modules/simulationCollisionHandlers.ts`:
    - extended swept projectile handling to account for moving targets using previous/current poses:
      - projectile vs ship sweep now checks prior/current ship hull plus movement capsule.
      - projectile vs pilot sweep added with equivalent moving-target checks.
      - shield sweep now checks prior/current shield poses plus movement path instead of stale-only pose checks.
    - added swept anti-tunnel guard pass for:
      - ship vs ship (detect pass-through and apply corrective separation/velocity response),
      - ship vs pilot (detect pass-through and route through existing kill handler).
  - `shared/sim/AstroPartySimulation.ts`:
    - captures previous ship/pilot poses before physics integration.
    - runs swept ship/pilot tunnel guards immediately after physics update.
    - passes prior ship/pilot pose data into swept projectile collision handling.
  - `substep-approach.md`:
    - added deferred implementation note for adaptive physics-only substeps (explicitly not implemented in this milestone).
- Outcome:
  - Non-substep safeguards now cover the requested tunneling classes to a practical degree:
    - projectile vs dashing/moving ship,
    - projectile vs moving pilot,
    - ship vs ship,
    - ship vs pilot.
  - Substep approach is documented for controlled later rollout.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-03 - Demo spotlight glow/veil behavior corrected per follow-up

- Scope:
  - Adjusted demo spotlight behavior so the ship circle stays visibly glowing and the surrounding veil remains dark during tutorial interaction steps.
- Changes:
  - `src/demo/DemoOverlayUI.ts`:
    - `startSpotlight()` now explicitly initializes a darker veil (`--spot-bg-alpha: 0.88`).
    - `dimSpotlight()` no longer applies the lightened `spot-dimmed` path; it now keeps veil darkness and preserves ring visibility (`opacity: 1`) while widening spotlight radius.
- Outcome:
  - Demo circle remains prominent/glowing instead of visually fading into a lighter background treatment.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-03 - Demo ship spotlight alignment with live pre-countdown intro

- Scope:
  - Compared demo ship-circle spotlight behavior against the live pre-countdown intro ring path and fixed cross-flow/mobile positioning mismatches.
- Changes:
  - `src/main.ts`:
    - added shared `getOverlayShipViewportPos()` helper and reused it in both:
      - live pre-countdown intro tracking (`startLiveMatchPlayerIntro`)
      - demo overlay callback (`getShipPos`)
    - expanded `hideLiveMatchPlayerIntro()` cleanup to reset spotlight/ring inline properties so styles do not leak between demo/live flows.
  - `src/demo/DemoOverlayUI.ts`:
    - set ring opacity explicitly on spotlight start.
    - removed delayed first position update and position immediately.
    - increased ship tracking cadence from `50ms` to `16ms` for smoother ring follow.
    - reset spotlight ring inline geometry/style properties on stop to avoid stale size/position carryover.
- Outcome:
  - Demo and live intro now use a consistent ship-to-overlay coordinate mapping path.
  - Spotlight ring starts centered immediately, tracks more smoothly on mobile/desktop, and no longer carries stale ring sizing into subsequent intro flows.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-03 - Combo post-death chain guard + timeout sync fix

- Scope:
  - Fixed combo-flow bug where post-death projectile hits could restart combo chains and appear to persist.
- Root issues:
  - combat score/combo eligibility allowed attacker state beyond active combat state.
  - combo timeout reset path did not broadcast player-meta sync, leaving stale client combo state until another unrelated player sync event.
- Changes:
  - `shared/sim/systems/GameFlowSystem.ts`:
    - tightened `shouldAwardCombatScore(...)` to require attacker state `ACTIVE` (blocks post-death projectile follow-up combo rebuilds).
    - updated `updateCombatComboTimeouts(...)` to call `sim.syncPlayers()` when any combo timeout reset occurs.
- Outcome:
  - Combo no longer triggers from post-death projectile follow-ups.
  - Expired combos now clear consistently on clients without waiting for unrelated score/state events.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-02 - Combo HUD art-direction correction (de-neon comic/arcade pass)

- Scope:
  - Replaced neon-coupled combo badge styling with a stronger comic/arcade plate treatment.
- Changes:
  - `src/ui/screens.ts`:
    - removed per-player color CSS variable injection from combo badge markup (de-coupled combo visuals from ship neon palette).
  - `index.html`:
    - replaced combo badge styles with:
      - warm arcade plate gradient (amber/orange),
      - halftone-like dot texture,
      - heavier dark outlines and shadow stacking,
      - red active pips,
      - `POW!` burst tag for increment animation.
- Outcome:
  - Combo presentation no longer reads as “neon UI chip” and better aligns with requested comic/arcade direction.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Combo HUD follow-up stability fixes (review pass)

- Scope:
  - Applied two UX/state fixes identified in staged review for combo hints.
- Changes:
  - `src/ui/screens.ts`:
    - clear combo multiplier cache when control hints are hidden (`shouldShow === false`) to avoid stale increment state across transitions.
    - added scheduled combo hint refresh timer while combos are active so segmented combo pips/timeouts update and clear without waiting for unrelated player/state events.
    - refresh timer auto-cancels when hints are hidden or no local players are present.
- Outcome:
  - Combo hint state no longer lingers stale after timeout.
  - Increment animation eligibility is reset correctly after hide/show transitions.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Combo HUD visual direction pass (comic/arcade styling)

- Scope:
  - Reworked combo indicator visuals away from clean/modern timer-bar style into comic/arcade presentation.
- Changes:
  - `src/ui/screens.ts`:
    - combo markup now renders:
      - burst title (`Combo!`)
      - chunky multiplier text
      - segmented combo pips (6-step visual energy indicator)
    - removed sleek timer-bar markup from combo card.
  - `index.html`:
    - replaced combo card CSS with skewed comic plate styling, halftone-like texture accents, chunkier typography treatment, and stronger increment impact animation (`BAM` burst tag on combo-up).
- Outcome:
  - Combo state now reads as arcade/comic instead of modern HUD widget.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Combo HUD visibility hotfix (timebase alignment)

- Scope:
  - Fixed combo HUD not appearing due mismatched timer comparison domains.
- Root cause:
  - Combo expiry (`comboExpiresAtMs`) is authored in simulation time (`sim.nowMs`).
  - HUD visibility check in `src/ui/screens.ts` incorrectly compared it against `Date.now()` (wall clock), resulting in immediate negative remaining time and hidden combo badge.
- Changes:
  - `src/Game.ts`:
    - added `getHostSimTimeMs()` accessor returning `networkSync.hostSimTimeMs`.
  - `src/ui/screens.ts`:
    - switched combo remaining-time baseline from `Date.now()` to `game.getHostSimTimeMs()`.
- Outcome:
  - Combo badge/timer now displays during active combo windows and animated increment behavior is visible as intended.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Comic-style animated combo HUD in control hints + full combo metadata sync

- Scope:
  - Added a comic/arcade combo visualization to the bottom-center control-hint cards (desktop game HUD path).
  - Combo panel now animates on multiplier increments instead of static text behavior.
  - Wired combo metadata end-to-end so local and online clients receive authoritative combo values.
- Shared/server metadata pipeline:
  - `shared/sim/types.ts`:
    - extended `PlayerListMeta` with:
      - `comboMultiplier`
      - `comboExpiresAtMs`
  - `shared/sim/modules/simulationSnapshot.ts`:
    - emits combo fields in `buildPlayerListPayload(...)`.
  - `server/src/rooms/AstroPartyRoomState.ts`:
    - added schema fields on `RoomPlayerMetaState`:
      - `comboMultiplier`
      - `comboExpiresAtMs`
  - `server/src/rooms/AstroPartyRoom.ts`:
    - applies combo field sync in `applyPlayerListState(...)`.
- Client data sync:
  - `src/network/transports/NetworkTransport.ts`:
    - extended `PlayerMeta` with combo fields.
  - `src/network/transports/LocalSharedSimTransport.ts`:
    - combo fields exposed via `getState(...)` and `normalizePlayerMeta(...)`.
  - `src/network/transports/ColyseusTransport.ts`:
    - schema meta parsing includes combo fields.
    - `getState(...)` exposes combo fields.
    - player-list signature includes combo fields so UI updates on combo changes.
  - `shared/game/types.ts` + `src/managers/PlayerManager.ts`:
    - `PlayerData` now carries combo fields with defaults.
  - `src/Game.ts` + `src/network/NetworkSyncSystem.ts`:
    - combo values are synced from network metadata/state into player runtime data.
  - `src/debug/debugPanel.ts`:
    - updated fallback `PlayerData` mocks with combo defaults.
- HUD/UX implementation:
  - `src/managers/BotManager.ts` and `src/Game.ts`:
    - local-player hint payload now includes player id + combo fields.
  - `src/ui/screens.ts`:
    - control hints render combo badge with per-player increment detection.
    - increment events trigger animated class (`combo-up`) for comic pop/burst effect.
    - combo timer uses authoritative remaining-time-derived CSS duration.
  - `index.html`:
    - added combo badge/timer/burst/punch keyframes and active hint styling.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-02 - Authoritative combat combo multiplier (tentative v1)

- Scope:
  - Added server-authoritative combat combo scoring multiplier with timeout.
  - Tentative tuning set to `5x` cap and `12s` combo window.
  - Combos reset on victim ship destruction/pilot death and on round reset boundaries.
- Changes:
  - `shared/sim/scoring.ts`:
    - added `combatCombo` config block under `SCORE_RULES`:
      - `enabled: true`
      - `durationMs: 12000`
      - `capMultiplier: 5`
      - `stepPerStreak: 0.5`
    - added `getCombatComboRules()` accessor.
  - `shared/sim/types.ts`:
    - extended `RuntimePlayer` with combo runtime fields:
      - `comboStreak`
      - `comboMultiplier`
      - `comboExpiresAtMs`
  - `shared/sim/systems/GameFlowSystem.ts`:
    - refactored score event handling to use a local `ScoreEventType`.
    - `awardPlayerScore(...)` now applies multiplier only for combat events (`SHIP_DESTROY`, `PILOT_KILL`).
    - added combo lifecycle helpers:
      - activation/advance on combat score events
      - timeout expiry handling
      - reset helper
    - resets combo for victim in:
      - `onShipHit(...)`
      - `killPilot(...)`
    - clears all combo state in `clearRoundEntities(...)`.
    - added `updateCombatComboTimeouts(sim)` for per-tick timeout expiration.
  - `shared/sim/AstroPartySimulation.ts`:
    - initialized combo fields in `createPlayer(...)`.
    - reset combo fields in `resetPlayersForNewSequence(...)`.
    - wired per-tick timeout maintenance via `updateCombatComboTimeouts(this)` in the `PLAYING` update path.
- Behavior:
  - Combat scoring ramps with streak, capped at `5x`.
  - No-combat window beyond `12s` expires combo back to base.
  - Taking a ship hit or pilot death immediately resets that player's combo.
  - Non-combat score events (`ROUND_WIN`, `GAME_WIN`) remain unmultiplied.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-02 - Turret pre-combat preview render (map 5 only)

- Scope:
  - Added render-only turret preview for `MATCH_INTRO`/`COUNTDOWN` when authoritative turret state is not yet present.
  - Kept simulation/authority flow unchanged.
- Changes:
  - `src/systems/rendering/GameRenderer.ts`:
    - `renderGameplayPass(...)` now receives current map definition.
    - `getGameplayRenderData(...)` now resolves turret through `resolveTurretForRender(...)`.
    - Added preview fallback using map contract + `TURRET_TUNING`:
      - pre-combat phases only
      - map must have turret
      - only used when `networkTurret` is null
    - Added `getPreviewTurretAngle(...)` to keep preview motion aligned with turret idle rotation.
- Outcome:
  - Turret map now shows turret before countdown starts, while authoritative runtime turret still takes over in `PLAYING`.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Pre-combat map-visual contract cleanup (renderer-owned, no sim workaround)

- Scope:
  - Refactored yellow-block pre-combat rendering logic into explicit map-visual ownership helpers in `GameRenderer`.
  - Kept authority/simulation flow unchanged (no map-feature pre-spawn workaround reintroduced).
- Changes:
  - `src/systems/rendering/GameRenderer.ts`:
    - replaced phase-coupled inline yellow-block fallback with explicit helper contract:
      - `isPreCombatMapPreviewPhase(...)`
      - `hasCompleteYellowBlockHpSnapshot(...)`
      - `resolveYellowBlocksForRender(...)`
    - `renderMapPass(...)` now resolves fallback intent once and passes it through clearly.
- Outcome:
  - Maintains the intended behavior (yellow blocks render in `MATCH_INTRO`/`COUNTDOWN` even when HP snapshot is not yet hydrated) with cleaner ownership and less patch-like branching.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Per-match authoritative intro phase (`MATCH_INTRO`) wired with minimal client overlay

- Scope:
  - Added a one-time per-match intro phase before countdown without adding per-round intro behavior.
  - Kept changes focused to phase flow + existing overlay/camera hooks.
- Shared/server flow changes:
  - Added `MATCH_INTRO` to phase contract:
    - `shared/sim/types.ts`
  - Added intro duration constant:
    - `shared/sim/constants.ts` (`MATCH_INTRO_DURATION_MS = 1200`)
  - Updated authoritative sequence in `AstroPartySimulation`:
    - match start now: `LOBBY -> MATCH_INTRO -> COUNTDOWN -> PLAYING`
    - intro spawns ships for visual presentation, counts down timer, then enters normal countdown
    - round transitions remain `ROUND_END -> COUNTDOWN -> PLAYING` (no per-round intro)
    - `COUNTDOWN` entry reset extracted into helper to avoid duplicate logic
    - `MATCH_INTRO` included in low-player abort-to-lobby guard
  - Server room handling:
    - `AstroPartyRoom` clears stale round result state on `MATCH_INTRO` phase entry.
- Client flow/render changes:
  - `GameRenderer` now renders gameplay layer during `MATCH_INTRO` so ships are visible in intro.
  - `Game` sync path now accepts snapshots during `MATCH_INTRO`.
  - `Game` sticky-roster and roster-resync hooks include `MATCH_INTRO`.
  - `main.ts` phase routing updates:
    - screen/audio mapping includes `MATCH_INTRO`
    - platform gameplay activity includes `MATCH_INTRO`
    - one-time live intro spotlight+zoom now triggers only on `MATCH_INTRO` entry and resets on `START/LOBBY/GAME_END`.
- Documentation alignment:
  - Updated `GAME_MODES.md` canonical `ROUND_ELIMINATION` sequence to include one-time `MATCH_INTRO` before countdown.
  - Updated `AGENTS.md` gameplay flow guardrail to match the new canonical phase sequence.
- Follow-up transition smoothing (same thread, post-validation):
  - Preserved intro ship visual state during `MATCH_INTRO -> COUNTDOWN` handoff so countdown no longer hard-cuts to empty scene.
  - Enabled gameplay-pass rendering during `COUNTDOWN` so intro ships remain visible while countdown text overlays.
  - Extended intro overlay hide timer (`900ms -> 1350ms`) to overlap countdown start and reduce abrupt zoom drop.
  - Replaced hard camera handoff with eased intro blend:
    - zoom boost now eases down over time instead of staying fixed then dropping,
    - ship-focus now blends back to adaptive camera focus based on remaining boost,
    - intro spotlight waits for real ship viewport position before first render (no center flash fallback).
  - Cinematic polish pass (no fallback):
    - Intro spotlight veil now fades with the zoom timeline (`--spot-bg-alpha` animated down to 0).
    - Spotlight radius now expands with the zoom timeline (`--spot-r` animated outward) for curved cinematic pullback.
    - Removed fallback spotlight behavior during intro tracking:
      - if ship lock is unavailable at start, intro does not begin,
    - if ship lock is lost mid-intro, intro aborts instead of falling back to last/center position.
    - Adjusted camera focus blend curve to smoothstep against zoom multiplier for less linear-feeling handoff.
  - Map-element consistency fix (countdown preloading):
    - Initial mitigation used authority-side map-feature pre-spawn in intro/countdown.
    - Root cause was later identified as mixed visual ownership:
      - repulsion/center-hole visuals are static map-definition rendered,
      - yellow blocks were gated by runtime `yellowBlockHp` snapshot presence.
    - Replaced mitigation with targeted render-path fix:
      - during `MATCH_INTRO`/`COUNTDOWN`, if yellow-block HP snapshot is unavailable, render yellow blocks from map definition at full HP.
      - removed intro/countdown map-feature pre-spawn workaround from simulation flow.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-02 - Live-match intro experiment rollback (pre-countdown cinematic path)

- Scope:
  - Attempted a lightweight client-side cinematic intro path before round start, then rolled it back after runtime validation showed it still felt late relative to countdown.
- Attempted changes:
  - Moved intro trigger from `COUNTDOWN -> PLAYING` to `COUNTDOWN` entry in `src/main.ts`.
  - Added intro spotlight fallback targeting in `src/Game.ts` so pre-spawn phases could use deterministic spawn-slot positioning.
  - Hardened intro startup to avoid waiting on late ship hydration:
    - spawn-slot lookup from authoritative transport player order,
    - immediate fallback chain (`ship -> spawn slot -> arena center`),
    - removed delayed retry/poll startup path.
  - Validation on implementation passes:
    - `bun run typecheck` passed.
    - `bun run build` passed.
- Outcome:
  - Manual behavior still did not meet expectation (intro perceived as happening after countdown).
  - Root practical constraint for this path: very short `LOBBY -> COUNTDOWN` window plus current authoritative spawn/phase timing.
- Reversion log:
  - Reverted experiment files to `HEAD`:
    - `src/main.ts`
    - `src/Game.ts`
    - `progress.md` (this was reverted during cleanup, then this recovery milestone was appended per process requirement).
  - Per follow-up user request, also cleared remaining staged edits and returned repo to fully clean state:
    - `index.html`
    - `src/ui/elements.ts`
- Reasoning:
  - Preserve a stable baseline and switch to the alternate approach instead of iterating further on a path that failed the intended timing outcome.

## 2026-03-02 - Progress log recovery entry (separate)

- Scope:
  - Added an explicit standalone log entry to record that `progress.md` had been reverted during cleanup and was then restored via append-only milestone updates.
- Why this entry exists:
  - Keeps history auditable without rewriting prior milestones.
  - Aligns with the progress log contract to append recovery context instead of silently replacing it.
- Validation:
  - Docs-only update; no runtime commands rerun.

## Recurring Patterns Filtered Out

- Iterative UI micro-patches were repeatedly applied to the same lobby/start layouts.
  - Learning: prefer one coherent responsive pass with a fixed viewport matrix before follow-up polish.
- Mobile taps double-fired across multiple UI surfaces.
  - Learning: use one shared coarse-pointer debounce wrapper for all tap actions.
- Tooling/process experiments were introduced then rolled back quickly.
  - Learning: run a viability check against the real source of truth before enforcing new process automation.
- Loadtest harness behavior drifted from production matchmaking flow.
  - Learning: lock intended test objective first (API parity vs panel observability), then choose connection path.
- Validation output was logged repeatedly for the same milestone.
  - Learning: report one validation block per milestone, with explicit exceptions only.

## 2026-03-02 - Fire/Yellow-block SFX mix rebalance (mix-v1) with source backups

- Scope:
  - Reduced projectile/fire SFX dominance and increased yellow-block hit audibility under music.
  - Kept source backups in repo as requested.
- Audio source updates:
  - Added backups:
    - `assets/audio-src/sfx-fire-pre-mix-v1.wav`
    - `assets/audio-src/sfx-hit-soft-pre-mix-v1.wav`
  - Retuned active sources:
    - `assets/audio-src/sfx-fire.wav` (shorter/less harsh projectile cue)
    - `assets/audio-src/sfx-hit-soft.wav` (snappier, brighter block-hit cue)
  - Regenerated runtime outputs:
    - `public/assets/audio/sfx-fire.ogg`
    - `public/assets/audio/sfx-hit-soft.ogg`
- Runtime mix/policy updates:
  - `src/audio/assetManifest.ts`:
    - `sfxFire.volume`: `0.70 -> 0.56`
    - `sfxHitSoft.volume`: `0.58 -> 0.72`
  - `src/AudioManager.ts`:
    - Added a small fire SFX anti-stack guard (`70ms` min interval) to reduce overlap spam without changing gameplay fire rate.
- Documentation:
  - Updated `assets/audio-src/README.md` with active/backup mapping for fire and soft-hit variants.
- Validation:
  - `bun run process:audio -- --only sfx-fire.ogg,sfx-hit-soft.ogg` passed.
  - `bun run ffmpeg:check` passed.
  - `bun run typecheck` passed.
  - `bun run build` passed.

## 2026-03-02 - Gameplay BGM default volume reduction for SFX clarity

- Scope:
  - Lowered in-game (gameplay) BGM default volume to reduce masking against asteroid/yellow-block hit SFX.
  - Left menu/results music defaults unchanged.
- Changes:
  - `src/audio/assetManifest.ts`:
    - `gameplayLoop.volume`: `0.32 -> 0.24`
- Validation:
  - `bun run typecheck` passed.
  - `bun run build` passed.

## 2026-03-02 - Soft-hit volume bump (yellow blocks)

- Scope:
  - Increased yellow-block soft-hit runtime gain by one step for improved audibility.
- Changes:
  - `src/audio/assetManifest.ts`:
    - `sfxHitSoft.volume`: `0.72 -> 0.76`
- Validation:
  - `bun run typecheck` passed.
  - `bun run build` passed.

## 2026-03-02 - Countdown tail cleanup + UI click swap + powerup pickup SFX

- Scope:
  - Removed tail artifact from countdown cue.
  - Swapped UI click source to `sound (3).wav`.
  - Added a new powerup-pickup SFX path using `pickupCoin (2).wav`.
- Audio source updates:
  - Added backups:
    - `assets/audio-src/sfx-countdown-pre-tailfix-v1.wav`
    - `assets/audio-src/sfx-ui-click-pre-sound3-v1.wav`
  - Updated active sources:
    - `assets/audio-src/sfx-countdown.wav` (trim/fade tail cleanup)
    - `assets/audio-src/sfx-ui-click.wav` (from `sound (3).wav`)
    - `assets/audio-src/sfx-powerup.wav` (from `pickupCoin (2).wav`)
  - Regenerated runtime outputs:
    - `public/assets/audio/sfx-countdown.ogg`
    - `public/assets/audio/sfx-ui-click.ogg`
    - `public/assets/audio/sfx-powerup.ogg`
- Runtime wiring:
  - Added `sfxPowerup` asset in `src/audio/assetManifest.ts`.
  - Added `playPowerupPickup()` in `src/AudioManager.ts`.
  - Added authoritative mapping `powerupPickup -> sfxPowerup` in `src/feedback/gameplayFeedback.ts`.
  - Emitted sim sound event when powerup is granted in `shared/sim/modules/simulationCollisionHandlers.ts`.
- Documentation:
  - Updated `assets/audio-src/README.md` expected output list and variant mapping sections for countdown/ui click/powerup.
- Validation:
  - `bun run process:audio -- --only sfx-countdown.ogg,sfx-ui-click.ogg,sfx-powerup.ogg` passed.
  - `bun run ffmpeg:check` passed.
  - `bun run typecheck` passed.
  - `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-02-16 - Networking Authority Rewrite

- Replaced client interpolation/prediction queueing with newest-snapshot authoritative sync in `src/network/NetworkSyncSystem.ts`.
- Server snapshot delivery aligned to simulation tick; removed decoupled snapshot timer in `server/src/rooms/AstroPartyRoom.ts`.
- Input path sends immediately on edge changes while preserving keepalive cadence in `src/systems/PlayerInputResolver.ts`.
- Simplified network tuning and removed obsolete self-prediction module.
- Validation:
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `bun run build` passed.
  - Smoke automation script executed successfully in later reruns.

## 2026-02-17 - Authoritative Scoring + Midcore UX Corrections

- Centralized score policy and rewards in `shared/sim/scoring.ts`; server became authoritative score owner.
- Propagated `score` and `scoresById` through sim, room schema, transports, and client sync.
- Updated HUD/endboard to render authoritative points-based standings.
- Fixed host mobile touch dash consumption path to match desktop behavior.
- Standardized leave action visibility between HUD and settings on mobile/local-player edge cases.
- Introduced debug-tool gating + taint propagation to block score submission in debug-tainted sessions.
- Added QA/dev debug panel (build-gated) with phase previews and debug actions.
- Expanded map selection model with Classic rotation + Turret map and corresponding preview/sim behavior.
- Validation:
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `bun run build` passed.

## 2026-02-18 - Lobby Responsive System Reset

- Reworked lobby/map panel layout for coarse-pointer portrait constraints to stop overflow and clipping.
- Replaced multi-button mode selector with compact cycle control and aligned Advanced action sizing.
- Removed non-essential map description/behavior text from lobby to preserve usable space.
- Finalized portrait strategy around stable content-fit model instead of incremental per-breakpoint patching.
- Validation:
  - `astro-party`: `bun run build` passed.

## 2026-02-20 to 2026-02-21 - Combat FX + Input Reliability + Mobile Controls

- Added projectile casing visual system with pooling/capping and baseline gating for in-flight snapshot joins.
- Added pilot death debris FX system with deterministic piece behavior and gameplay-interaction impulses.
- Implemented continue-sequence flow to advance matches without full lobby reset.
- Fixed authoritative ship-destroy/pilot-kill FX trigger logic to avoid false positives on disconnect/remove.
- Added server type fix for `poly-decomp` and explicit dependency wiring.
- Improved mobile controls:
  - left-rail safe spacing,
  - touch SVG icon upgrades,
  - triangular one-player controls,
  - coarse-pointer tap debounce guards for duplicate clicks.
- Validation:
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `bun run build` passed where server files changed.

## 2026-02-23 to 2026-02-25 - Rendering, Title Intro, and Audio Timeline Polish

- Added pilot swim-arm animation and pilot hardpoint pipeline parity with ship asset flow.
- Rebuilt start/title presentation with staged logo animation and sequential reveal of subtitle/hints/buttons.
- Fixed intro replay and pre-flash regressions by tightening start-screen state ownership.
- Retuned title motion beats and audio cue timing; corrected splash/title cue ownership.
- Added splash build-version label and startup preload improvements.
- Applied in-game comic/cel visual pass and targeted FX follow-up fixes.
- Validation:
  - `astro-party`: repeated `bun run build` passes across milestones.

## 2026-02-26 - Documentation Governance and Structure

- Split docs by ownership:
  - `AGENTS.md` for policy,
  - `ARCHITECTURE.md` for topology/ownership,
  - `.agents/learning.md` for anti-repeat learnings.
- Added and then removed local governance hash-drift tooling after identifying source-of-truth mismatch.
- Kept context-bootstrap and architecture-hydration guardrails as active process policy.
- Moved learning log under `.agents/` and updated references.
- Validation:
  - Docs-only milestones noted where runtime validation was intentionally not rerun.

## 2026-02-26 - Server Loadtest, Monitor, and Deploy Tooling Consolidation

- Added minimal room-code loadtest path, then hardened pause/resume/disconnect handling.
- Added and refined lobby-fill loadtest runner; corrected create/join parity with game matchmaking.
- Added Colyseus monitor integration with optional auth and safer enablement behavior.
- Added `/ops/stats` instrumentation and capacity sweep runner with staged reporting.
- Hardened deploy scripts (preflight checks, branch handling, install-mode fallback, health/ops checks).
- Added monitor setup helper/reference scripts and docs.
- Validation:
  - `astro-party/server`: `npm run typecheck` and `npm run build` passed for code/tooling milestones.
  - Script-template-only updates were documented as not executed in-workspace.

## 2026-02-27 - Observability and Correlated Incident Workflow

- Added richer loadtest disconnect/error telemetry with absolute timestamps.
- Extended server leave diagnostics and `/ops/stats` consented/unconsented leave tracking.
- Added monitoring command reference for PM2, ops stats, host load, and correlation workflows.
- Implemented observed-run pipeline:
  - droplet observer capture,
  - parser/index builder,
  - static dashboard with run comparison and anomaly cards.
- Validation:
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.
  - `astro-party/server`: `npm run observed:index` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party`: `bun run typecheck` failed due pre-existing `src/demo/DemoOverlayUI.ts` timeout typing mismatch.

## 2026-02-28 - Guardrail promotion + progress workflow + orientation ownership update

- Promoted repeated learnings into concrete `AGENTS.md` guardrails:
  - shared coarse-pointer tap guard requirement
  - coherent responsive planning before micro-patch loops
  - loadtest objective declaration (`parity` vs `observability`)
  - source-of-truth validation before policy automation
- Updated `progress.md` contract to a two-layer model:
  - active task threads for planned prompts (living updates)
  - append-only milestone journal for shipped outcomes
- Updated `ARCHITECTURE.md` ownership contract:
  - platform now owns forced landscape orientation
  - client UI owns safe-area/top-HUD-aware placement for both landscape directions
- Validation:
  - Docs-only update; no runtime commands rerun.

## 2026-02-28 - Reusable "agent doc cleanup activity" workflow added

- Added a named reusable activity section in `AGENTS.md`:
  - trigger phrase
  - execution rule
  - required inputs
  - workflow checklist
  - required outputs
  - done criteria
- Goal:
  - allow shorthand invocation ("agent doc cleanup activity") to run the full policy/architecture/progress cleanup flow.
- Validation:
  - Docs-only update; no runtime commands rerun.

## 2026-02-28 - Reusable activity flow made explicit (`progress -> learning -> AGENTS`)

- Tightened `AGENTS.md` reusable cleanup workflow so it now explicitly requires:
  - extracting recurring issues from `progress.md`
  - distilling/recording them in `.agents/learning.md`
  - promoting stable guardrails into `AGENTS.md`
- Added required output traceability note:
  - promotion mapping must be documented as `progress -> learning -> AGENTS`
- Validation:
  - Docs-only update; no runtime commands rerun.

## 2026-02-28 - Demo/runtime flow hardening for findings 1-4

- Added explicit game loop lifecycle control in `src/Game.ts`:
  - RAF handle ownership (`startLoop`/`stopLoop`)
  - background stop/resume on `document.visibilitychange`
  - platform pause/resume wiring through `oasiz.onPause` / `oasiz.onResume`
- Replaced direct bridge usage with SDK integration:
  - score submission via `oasiz.submitScore`
  - haptics via `oasiz.triggerHaptic`
  - room sharing via `oasiz.shareRoomCode`
  - injected room/player identity + persisted demo-seen state via `oasiz.roomCode`, `oasiz.playerName`, `oasiz.loadGameState`, `oasiz.saveGameState`
- Fixed compile blocker in `src/demo/DemoOverlayUI.ts` by correcting interval handle typing.
- Added start-screen action lock to prevent duplicate create/local/join actions before async demo teardown/network operations complete.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-02-28 - Centralized Oasiz SDK adapter boundary

- Added `src/platform/oasizBridge.ts` as the single `@oasiz/sdk` import boundary.
- Moved platform integration calls behind bridge wrappers:
  - score submit
  - haptics
  - load/save game state
  - room-code sharing
  - injected room/player identity reads
  - lifecycle pause/resume + gameplay activity hints
- Refactored existing consumers (`Game`, `main`, `SettingsManager`, UI, transports) to use bridge methods.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-02-28 - Remaining open issues documented

- Added `remaining-issues.md` as a dedicated open-issues reference after fixes 1-4.
- Captured unresolved items with concrete evidence and suggested fixes:
  - orientation ownership mismatch vs architecture contract
  - top safe-area offset budget gap for interactive top controls
- Validation:
  - Docs-only update; no runtime commands rerun.

## 2026-02-28 - Agent Mistake Log: Uncalled-for cache workaround (constraint violation)

- Issue:
  - An unrequested runtime cache-busting redirect workaround was added to `src/main.ts` during discussion.
- Why this was a bad call:
  - It violated the active collaboration constraint: user did not ask for a new workaround implementation.
  - It introduced behavior-changing code in a path where the user asked for diagnosis and direct answers.
- Corrective action taken:
  - The unrequested `main.ts` workaround block was fully reverted without resetting unrelated staged changes.
- Durable learning:
  - Do not implement speculative fixes without explicit user approval when the user has set hard constraints.
  - In escalation threads, respond with verified analysis first; wait for explicit implementation instruction before editing code.
## 2026-03-01 - Attract map cleanup (remove hidden demo map + repulse swap)

- Removed hidden demo map usage and switched attract/demo runtime to Repulse (`mapId=3`).
- Removed hidden map id (`6`) from shared map contracts (`MapId`, map definitions, and context-allowance special-case).
- Updated attract starfield map forcing to Repulse.
- Updated demo border behavior so only attract/menu background hides arena border; tutorial/freeplay restores border.
- Updated Repulse visual theme to use default repulsion palette matching prior hidden-map attract visuals.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-01 - Demo starfield flow + map theme cleanup

- Removed demo starfield duplicate initialization path and fallback guard in `main.ts`.
  - Demo starfield is now activated once in `startDemoSession` after demo startup.
  - Removed `starfieldInitializedForDemo` state/branching.
- Removed remaining dead map `6` runtime trace in `src/ui/screens.ts`.
- Updated starfield gradients to distinct per-playable-map themes (`1..5`) with map `3` aligned to the prior purple haze look.
- Updated in-canvas map theming to distinct per-playable-map border colors:
  - map 1 (Cache) gold
  - map 2 (Vortex) orange
  - map 3 (Repulse) violet, with explicit violet repulsion accents
  - map 4 (Bunkers) green
  - map 5 (Turret) blue
  - map 0 (classic rotation selector) neutral fallback only
- Removed active flow usage of map-geometry visibility toggles:
  - deleted `setMapElementsVisible(...)` calls from `screens.ts` and demo phase intercept in `main.ts`.
  - default map element rendering is now enabled in `Game.ts`.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-01 - Repulse theme applied: Crimson Ion (Rawr)

- Applied selected Repulse palette (`Crimson Ion`) to runtime map 3 visuals:
  - Starfield gradient updated in `src/ui/screens.ts` (map 3).
  - In-canvas map border + repulsion zone palette updated in `src/systems/rendering/GameRenderer.ts` (map 3).
- Updated `.tools/ui-mocks/theme-swatches.html` current-runtime map 3 card to match live values.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-01 - Root cleanup for mock/swatch artifacts

- Moved root `lobby-mocks/` into `.tools/ui-mocks/`.
- Renamed and moved root `repulse-theme-swatches.html` to `.tools/ui-mocks/theme-swatches.html`.

## 2026-03-01 - Tutorial-to-live promotion + score gating to live context

- Gated score award events in shared sim to `experienceContext === LIVE_MATCH` only.
  - Combat and win scoring no longer accrues during attract/tutorial contexts.
- Replaced tutorial completion freeplay branch with direct promotion to normal live endless.
  - On tutorial completion, demo routing is disabled, demo session is exited without teardown, and normal phase UI/HUD routing is resumed.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.
## 2026-03-01 - Demo FREEPLAY cleanup + local score-submit eligibility fix

- Removed remaining `FREEPLAY` runtime branching and state handling from demo flow (`src/demo/DemoController.ts`, `src/main.ts`).
- Tutorial completion remains a direct promotion path into live endless; no separate freeplay state machine branch remains.
- Updated tutorial completion flow copy in `src/demo/DemoOverlayUI.ts` to reflect live-match promotion.
- Added local score-submission eligibility guard in `src/Game.ts`:
  - local mode must be a single-human participant session,
  - session must still satisfy existing live-context + bot-eligibility + debug-taint policy checks.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

## 2026-03-01 - First-run demo startup timing hold after title intro

- Added intro visual-settle signaling in `src/ui/startScreen.ts` via `onIntroVisualComplete`.
- Added `waitingForStartIntroVisualCompletion` gating in `src/main.ts` and required both:
  - intro audio readiness
  - intro visual-settle readiness
  before first-run demo startup can launch.
- Kept non-first-run startup path immediate (`showAttract=false`) so return-to-menu behavior is unchanged.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Selective comic halftone render pass (map + ship + pilot + asteroids)

- Added `src/systems/rendering/effects/RenderHalftoneComposer.ts` to generate a low-resolution dot overlay from the current frame and composite it using multiply blending.
- Updated `src/systems/rendering/Renderer.ts` with `applyHalftoneToCurrentFrame()` to run the compositor between world passes.
- Refactored `src/systems/rendering/GameRenderer.ts` into:
  - halftone-targeted pass: map geometry, ship sprites, pilot sprites, asteroids, and map overlay.
  - normal pass: trails, beams, projectiles, powerups, mines, homing missiles, turrets, bullet casings/debris/particles, debug overlays, countdown.
- Result:
  - Comic halftone look is applied selectively without halftoning high-frequency combat/effects layers.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Halftone refinement to stable comic screen

- Reworked `src/systems/rendering/effects/RenderHalftoneComposer.ts` from a generic animated-dot post overlay into a structured halftone screen:
  - fixed angled lattice (deterministic and frame-stable),
  - tone-driven dot radius from sampled luminance/alpha,
  - DPI-aware spacing to keep cost stable across high-DPR displays.
- Added a subtle bottom-weighted screen wash in the compositor to align closer with the brighter-lower-field comic reference direction.
- Preserved selective targeting from prior pass split:
  - halftone still applies only to map + ships + pilots + asteroids path.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Halftone correction pass (camera swim + oversized dots)

- Updated `src/systems/rendering/effects/RenderHalftoneComposer.ts`:
  - removed the added bottom wash,
  - reduced dot footprint and quantized tone levels for a tighter comic grain,
  - tightened thresholds to prevent noisy over-coverage.
- Updated `src/systems/rendering/Renderer.ts` halftone call:
  - passes world-origin anchor and zoom-aware lattice spacing into the composer.
- Result:
  - Dot lattice now tracks world/camera movement better and no longer appears as large random animated dots.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Asteroid-only object-space halftone pivot

- Removed the frame-wide halftone post pipeline and restored standard single-pass rendering path in:
  - `src/systems/rendering/GameRenderer.ts`
  - `src/systems/rendering/Renderer.ts`
- Added asteroid-local halftone treatment in `src/systems/rendering/layers/EntityVisualsRenderer.ts`:
  - deterministic dot pattern generated on first asteroid use,
  - cache keyed by asteroid id + geometry signature,
  - object-space fill clipped to asteroid shape for stable visuals.
- Deleted unused `src/systems/rendering/effects/RenderHalftoneComposer.ts`.
- Result:
  - asteroid comic texture retained while removing global dot crawl and post-pass frame cost.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-01 - Start-to-attract transition polish (title outro + attract easing)

- Added a simple first-run title outro sequence:
  - `force` exits center -> right first,
  - `space` exits center -> right second,
  - then demo startup begins.
- Added start-shell outro animation for subtitle/helpers/buttons while title exits.
- Added attract overlay easing so attract content fades/slides in instead of popping in.
- Runtime wiring:
  - `src/ui/startScreen.ts`: added `playTitleOutro()` and intro/outro class management.
  - `src/main.ts`: first-run startup now awaits `playTitleOutro()` before `startDemoSession(true)`, with in-progress guard/cancel safety.
  - `index.html`: added title/start-shell outro keyframes and attract content transition styles.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Deep lag findings + branch parity audit logged

- Added `astro-party/lag-findings-deep-pass.md` as a live deep-pass investigation log with incremental findings and evidence.
- Logged random-lag findings across sim/render/network/server paths and a follow-up branch validation against `space-force-dev-observed-next`.
- Captured fixed/not-fixed status for observed-next and debounce safeguard audit conclusions.
- Validation:
  - Investigation/docs update; no standalone build command run for this milestone.

## 2026-03-02 - Lag mitigation patches applied (haptics + snapshot fanout + collision groups)

- Applied coarse-pointer-only haptic gating in:
  - `astro-party/src/SettingsManager.ts`
  - `astro-party/src/ui/haptics.ts`
- Applied server snapshot fanout precompute reuse in:
  - `astro-party/server/src/rooms/AstroPartyRoom.ts`
- Applied player collision-group cleanup parity in:
  - `astro-party/shared/sim/physics/Physics.ts`
  - `astro-party/shared/sim/AstroPartySimulation.ts`
- Validation:
  - `astro-party`: `bun run typecheck` passed.

## 2026-03-02 - Asteroid halftone cache rewrite (remove per-frame signature churn)

- Reworked asteroid halftone caching in:
  - `astro-party/src/systems/rendering/layers/EntityVisualsRenderer.ts`
- Removed per-frame `vertices -> signature string` generation path.
- Switched to stable asteroid-id keyed cache lookup and one-time entry creation.
- Kept deterministic per-asteroid halftone variation via hash seed (`id + variant`).
- Validation:
  - `astro-party`: `bun run typecheck` passed.

## 2026-03-02 - Demo seen flag now platform-only (no local device persistence)

- Updated `astro-party/src/main.ts` demo-seen helpers:
  - removed localStorage read path from `isDemoSeen()`
  - removed localStorage write path from `markDemoSeen()`
  - retained platform state read/write via existing bridge helpers
- Result:
  - demo-seen no longer persists to device-local storage.
- Validation:
  - `astro-party`: `bun run typecheck` passed.

## 2026-03-02 - Halftone implementation removed from asteroid renderer

- Removed asteroid halftone runtime implementation in:
  - `astro-party/src/systems/rendering/layers/EntityVisualsRenderer.ts`
- Removed:
  - halftone cache state/types/constants
  - halftone overlay draw branch in `drawAsteroid(...)`
  - halftone helper methods and hash utility used only by that path
- Result:
  - Asteroids now render base/facet/crater styling only; no halftone processing remains.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Background starfield animation re-enabled

- Updated starfield CSS in `astro-party/index.html`:
  - `.stars-container.active .stars-layer` now uses `animation-play-state: running`.
- Result:
  - Background star rotation resumes when the stars container is active (game/demo background states).
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.

## 2026-03-02 - Agent doc cleanup activity (governance pass)

- Scope:
  - executed reusable cleanup workflow across `AGENTS.md`, `ARCHITECTURE.md`, `.agents/learning.md`, and `progress.md`.
  - removed closed-thread clutter from `Active Task Threads` and restored explicit milestone-journal boundary.
- Policy and learning updates:
  - added AGENTS guardrails for empty-active placeholder and explicit architecture outcome note in cleanup milestones.
  - added new learning entry on interruption-recoverable progress tracking discipline.
- Traceability:
  - `progress -> learning`: recurring closed-thread/no-midrun-signal issue distilled into `2026-03-02` learning entry.
  - `learning -> AGENTS`: promoted to explicit progress hygiene/cleanup output guardrails.
- Architecture outcome:
  - no change required in `astro-party/ARCHITECTURE.md` for this cleanup run.
- Validation:
  - docs-only governance cleanup; no runtime commands rerun.

## 2026-03-02 - Learning extraction follow-up from full progress history

- Scope:
  - re-audited full `progress.md` milestones to extract additional durable learnings beyond the initial cleanup pass.
- Added learning entries in `.agents/learning.md`:
  - render-effect experiments need budget + rollback gates
  - mode/flow refactors require immediate dead-path sweeps
  - intermittent lag triage must lock capture conditions first
- Promoted policy guardrails in `AGENTS.md`:
  - render-wide visual experiment budget/rollback requirement
  - required post-refactor dead-path cleanup sweep
  - capture-condition matrix requirement for intermittent lag investigations
- Traceability:
  - `progress -> learning`: recurring March render/flow/lag patterns distilled into three new learning entries.
  - `learning -> AGENTS`: promoted these three patterns to implementation planning guardrails.
- Architecture outcome:
  - no change required in `astro-party/ARCHITECTURE.md` for this pass.
- Validation:
  - docs-only governance update; no runtime commands rerun.

## 2026-03-02 - Tutorial dialog CTA consolidated to one centered in-panel button

- Scope:
  - Replaced dual tutorial prompt controls (`Skip` + `Next`) with a single centered in-panel button.
  - Updated tutorial prompt behavior to use `Next` in-place and removed side-position split.
- Changes:
  - `index.html`:
    - centered `.demo-tutorial-actions` row
    - removed separate `demoTutorialNext` button markup and `demo-next-btn` styles
    - kept single `demoTutorialSkip` element (now initialized as hidden, labeled `Next`)
  - `src/demo/DemoOverlayUI.ts`:
    - removed `tutorialNext` element dependency
    - added unified button flow:
      - during typewriter: tap fast-forwards text
      - for explicit dialog advancement steps: tap advances via shared in-place `Next`
      - for action-required steps: button is hidden after text completes
    - kept final-step repurpose to `Start Playing`
- Validation:
  - `bun run typecheck` passed.
  - `bun run build` passed.

## 2026-03-02 - Round-end linger trial (render gameplay during ROUND_END)

- Scope:
  - Removed the visual hard-cut at round end by keeping gameplay entities rendered during `ROUND_END`.
  - Kept simulation/timing behavior unchanged (no new phases or timer rewrites).
- Changes:
  - `src/systems/rendering/GameRenderer.ts`:
    - updated `isGameplayRenderPhase(...)` to include `ROUND_END`
- Outcome:
  - During the existing round-end window, ships/pilots/projectiles/asteroids and effect layers remain visible instead of disappearing immediately.
- Validation:
  - `bun run typecheck` passed.
  - `bun run build` passed.

## 2026-03-02 - Round-end linger cinematic camera polish

- Scope:
  - Reduced static/frozen feel during `ROUND_END` linger without changing sim authority/phase flow.
- Changes:
  - `src/systems/camera/AdaptiveCameraController.ts`:
    - tracks phase transitions and round-end elapsed time
    - enables single-anchor focus in `ROUND_END`/`GAME_END` (winner-centric framing when one survivor remains)
    - adds subtle deterministic round-end camera drift and mild zoom breathing
- Outcome:
  - `ROUND_END` now reads as a short cinematic hold instead of a hard static pause.
- Validation:
  - `bun run typecheck` passed.
  - `bun run build` passed.

## 2026-03-02 - Round-end winner prompt repositioned off center focus

- Scope:
  - Prevented the round winner prompt from covering the ship during round-end linger.
- Changes:
  - `index.html`:
    - moved `.round-result` from center (`top: 50%`) to safe top-center anchoring
    - desktop anchor: `top: max(calc(var(--safe-top, 0px) + 64px), 15vh)`
    - coarse-pointer anchor: `top: max(calc(var(--safe-top, 0px) + 106px), 20vh)`
    - changed transform to `translateX(-50%)` (removed vertical centering)
- Outcome:
  - Winner ship/camera focal area remains visible while round result text is still prominent.
- Validation:
  - `bun run typecheck` passed.
  - `bun run build` passed.

## 2026-03-04 (Socket pressure guard for cosmetic events)
- Updated `server/src/rooms/AstroPartyRoom.ts` to route cosmetic broadcasts through per-client buffer-aware fanout:
  - `evt:sound`, `evt:screen_shake`, `evt:dash_particles` now use `broadcastCosmeticToClients(...)`.
  - Cosmetic events are skipped for clients whose outbound buffer exceeds `CLIENT_MAX_OUTBOUND_BUFFER_BYTES`.
- Scope intentionally minimal for deployment branch:
  - no additional close-context/event-loop instrumentation changes included.
- Validation:
  - `astro-party/server`: `npm run typecheck` passed
  - `astro-party/server`: `npm run build` passed
