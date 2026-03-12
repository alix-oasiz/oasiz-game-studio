# Demo vs Normal Flow Evaluation

Date: 2026-03-01
Scope: `space-force` full app flow (boot, start screen, demo controller, screen/audio sync, game phases, local/online transport, shared sim)

## Initial Issues Identified (Chunk-Level Review)

1. Demo background phase updates might reset start UI during user interaction.
2. Race between deferred demo startup and create/join actions.
3. `suppressNextStartPhaseEffects` might leak if teardown fails.
4. Demo overlay state-changing taps are missing shared mobile tap guard pattern.

## Whole-App Flow Re-Evaluation

### Canonical phase pipeline (normal gameplay)

- Confirmed canonical gameplay phase ownership remains consistent with policy:
  - `START -> LOBBY -> COUNTDOWN -> PLAYING -> ROUND_END -> GAME_END`
- Key references:
  - `src/managers/GameFlowManager.ts`
  - `shared/sim/SpaceForceSimulation.ts`
  - `shared/sim/systems/GameFlowSystem.ts`
  - `src/main.ts` (`syncScreenToPhase`)

### Demo flow as implemented (actual runtime)

- Demo boot path:
  - `main.ts` queues startup after intro.
  - `startDemoSession()` creates `DemoController` and `DemoOverlayUI`.
  - `DemoController.startDemo()` sets demo mode, creates local room, adds bots, sets demo map, starts match, skips countdown.
- Important whole-system behavior:
  - In shared sim, `isDemo` disables elimination-based round/game ending.
  - Result: demo typically enters `PLAYING` and stays there (with respawn monitor), rather than repeatedly cycling rounds/phases.

## Validation of Initial Issues (Whole-App Verdict)

### 1) Demo phase updates resetting start UI repeatedly

Verdict: **Partially valid, overstated in initial pass**.

- What remains true:
  - During demo interception, in `MENU` state, phase handling can call `startUI.resetStartButtons(false)` on gameplay phase events.
- What changed after full-flow check:
  - In demo mode, phase transitions are not expected to churn repeatedly because `isDemo` prevents normal round/game-end progression.
  - So this is not a continuous/reset-every-frame issue; it is mostly a transition-time risk.

### 2) Race between deferred demo startup and create/join actions

Verdict: **Valid**.

- Why valid in full flow:
  - `pendingDemoStartupAfterIntro` can still be armed while user action begins from `START`.
  - If user action has not yet moved app phase away from `START`, pending startup can launch demo session concurrently.
  - Existing start-action lock prevents duplicate button taps, but does not cancel pending deferred demo startup.

### 3) `suppressNextStartPhaseEffects` leakage risk

Verdict: **Conditionally valid, lower practical risk**.

- Why conditionally valid:
  - Flag is set before async teardown and only auto-cleared on handling a subsequent `START` phase.
  - If teardown fails before `START` transition, flag can remain set longer than intended.
- Why lower risk in current implementation:
  - Demo teardown uses local transport path where disconnect is generally stable/no-throw.
  - Still a defensive correctness concern.

### 4) Missing shared tap guard on demo overlay action buttons

Verdict: **Valid as policy + potential edge-case bug**.

- In whole app, some handlers are idempotent enough to reduce blast radius.
- But this still violates stated guardrail for coarse-pointer state-changing actions and can cause occasional double-fire/flicker on mobile stacks.

## New Issues Identified During Full-Flow Evaluation

### A) Dead/unused teardown path creates maintenance ambiguity

Severity: Low

- `teardownDemoAndShowMenu()` exists but appears unused in main flow.
- Risk:
  - Duplicated teardown variants can diverge, making future fixes inconsistent.

### B) Demo startup/deferred queue state is not explicitly canceled at start-action boundary

Severity: Medium (related to issue #2 but broader ownership gap)

- The flow relies on phase change to naturally block startup, rather than explicit intent cancellation when user commits to action.
- This is an ownership clarity issue between demo scheduler and start action pipeline.

## Core Loop Conflict Check (RAF / Sim Loop)

### Terminology

- `RAF` means `requestAnimationFrame`, the browser render-loop scheduler used by `Game.startLoop()/stopLoop()`.

### Findings

### C) Demo/local simulation can continue while RAF is stopped

Severity: High

- `Game` stops RAF on `visibilitychange` and platform pause.
- Demo/local simulation tick runs in `LocalSharedSimTransport` via a separate `setInterval`.
- That interval is not automatically tied to pause/resume lifecycle unless `pauseSimulation(true)` is explicitly set.
- Net effect: in some demo states, simulation can keep advancing while render loop is paused.

### D) Tutorial pause pauses sim tick, but not input capture/send path

Severity: Medium

- Tutorial panel uses demo pause callbacks that set simulation paused.
- Core game loop still runs and continues to capture/send input while paused.
- This can create latent input state that applies immediately on resume.

### E) Demo maintenance timers are independent from RAF lifecycle

Severity: Low

- Demo respawn/cleanup intervals run while demo is active.
- They are not bound to app pause/resume hooks in the same way as RAF.

### Things that looked safe in core-loop review

- RAF double-start is guarded (`rafId` check), so demo flow does not create duplicate frame loops.
- Demo phase interception does not create recursive phase mutations that destabilize the loop.
- Shared sim demo mode (`isDemo`) suppresses elimination-based round/game churn, reducing phase thrash risk.

## Conclusion

- No evidence that core canonical gameplay phase ordering is broken.
- The most meaningful real integration conflict remains the deferred demo startup vs committed create/join flow.
- Initial concern about repeated menu-reset from demo phase events was directionally correct but overestimated when viewed with shared sim demo behavior (`isDemo` prevents phase churn).
- Additional loop-level check shows the most important technical conflict is lifecycle split:
  - RAF loop is lifecycle-managed, but local demo simulation uses an independent interval.

## Evidence Map (Primary Files)

- `src/main.ts`
- `src/demo/DemoController.ts`
- `src/demo/DemoOverlayUI.ts`
- `src/ui/startScreen.ts`
- `src/managers/GameFlowManager.ts`
- `src/Game.ts`
- `shared/sim/SpaceForceSimulation.ts`
- `shared/sim/systems/GameFlowSystem.ts`
- `src/network/transports/LocalSharedSimTransport.ts`
- `src/systems/input/PlayerInputResolver.ts`
