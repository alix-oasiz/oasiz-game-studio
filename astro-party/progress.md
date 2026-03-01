# Astro Party Progress (Condensed)

Condensed on 2026-02-28 to remove repeated micro-iterations and duplicate validation logs.

- Full pre-condense history is archived at `astro-party/progress.archive.2026-02-28.md`.
- This file now keeps milestone-level outcomes, recurring problems, and durable learnings.

## Progress Usage Contract (Effective 2026-02-28)

- `progress.md` is a two-layer tracking surface:
  - `Active Task Threads` for planned prompts (living, updated in-place while active).
  - `Milestone Journal` for shipped outcomes (append-only historical summaries).
- For any prompt requiring planned work, track these fields in an active thread:
  - Original prompt
  - Intent
  - Plan
  - Progress updates
  - Validation status
  - Outcome/next steps
- Once completed, close the thread and capture final outcome in a dated milestone entry.

## Active Task Threads

### 2026-03-01 - First-run demo startup timing hold after title intro (Closed)

- Original prompt:
  - Fix first-run (`demo_seen` false) startup flow where demo begins before the full title intro completes and holds.
- Intent:
  - Ensure startup sequence is: splash -> title intro completes -> intentional hold beat -> attract demo begins.
- Plan:
  - Add an explicit title-intro visual-settle readiness signal from `startScreen.ts`.
  - Keep non-first-run demo startup path immediate.
  - Gate demo startup on both intro-audio readiness and intro-visual readiness.
- Progress updates:
  - Added `onIntroVisualComplete` callback wiring in `startScreen.ts` based on intro timeline settle.
  - Added `waitingForStartIntroVisualCompletion` gating in `main.ts`.
  - Updated demo startup orchestration so first-run attract waits for both intro audio and visual readiness.
  - Kept non-first-run startup path immediate (`showAttract=false`) while removing ad hoc startup-hold timer logic.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
- Outcome:
  - Closed. First-run demo startup no longer jumps early and now waits for the full intro lifecycle to settle.

### 2026-03-01 - Demo FREEPLAY cleanup + local score-submit eligibility fix (Closed)

- Original prompt:
  - Remove leftover freeplay complexity and fix local-mode score submission so single-human local sessions with bots submit.
- Intent:
  - Simplify demo runtime to the intended attract -> tutorial -> live transition and restore expected score submission behavior in eligible local matches.
- Plan:
  - Remove `FREEPLAY` from demo state contracts and all runtime gating checks.
  - Keep tutorial completion on direct promotion to live match.
  - Tighten local score submission policy to allow only live, non-demo, single-human local sessions.
- Progress updates:
  - Removed `FREEPLAY` state/method checks from `DemoController` and dependent `main.ts` gating branches (gameplay-activity, touch layout, and input-control routing).
  - Updated tutorial transition messaging/comments in `DemoOverlayUI` to match direct live promotion semantics.
  - Added local score policy helper in `Game.ts` to count human participants (including local split participants) and require exactly one human for local score submission eligibility.
  - Kept attract/tutorial score blocking intact via existing `isDemoSession` and `experienceContext === LIVE_MATCH` gates.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.

### 2026-03-01 - One-shot ruleset/context runtime implementation + endless mode + demo hardening (Closed)

- Original prompt:
  - Implement the one-shot plan for canonical ruleset/context modeling, endless respawn + explicit end-match flow, UI/runtime refactor, and demo-flow hardening fixes.
- Intent:
  - Ship the locked decisions end-to-end in runtime code (shared sim, server, transports, client/game, UI, and demo lifecycle).
- Plan:
  - Add canonical `Ruleset`/`ExperienceContext` contracts and wire them through sim state + room meta.
  - Implement authoritative endless respawn + leader-triggered endless end.
  - Refactor runtime to separate tuning mode vs ruleset/context semantics.
  - Add lobby/gameplay UI surfaces for ruleset selection + endless end-match.
  - Apply demo regression fixes from evaluation (deferred-start race, tap guards, lifecycle/input gating).
- Progress updates:
  - Added canonical `Ruleset` + `ExperienceContext` types and room-meta propagation across shared sim/server/transports/client.
  - Implemented authoritative endless behavior in shared sim (`ENDLESS_RESPAWN` respawn loop + explicit `endMatchByScore` transition to `GAME_END`).
  - Added server command support for `cmd:set_ruleset` and `cmd:end_match`; synchronized state schema/meta.
  - Added transport/network/game APIs for ruleset/context/end-match and wired callbacks/state updates.
  - Refactored client runtime usage: demo/tutorial contexts now set explicit `ExperienceContext` and score submission is blocked outside `LIVE_MATCH`.
  - Added lobby ruleset control + map whitelist enforcement and gameplay `End Match` button wiring for endless leader flow.
  - Implemented demo hardening fixes:
    - deferred demo startup canceled on committed start action,
    - start-phase suppression wrapped in scoped teardown transaction (no leak),
    - shared tap guard on demo state-changing actions,
    - local sim pause/resume tied to visibility/platform lifecycle,
    - local input capture/send halted while tutorial pauses sim.
  - Added context-aware map validation so internal demo map `6` remains usable in non-live contexts while staying non-pickable for live matches.
  - Removed residual demo timer-based respawn dependency in `DemoController`.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party/server`: `npm run typecheck` passed.
- Outcome:
  - Closed. One-shot ruleset/context + endless + demo hardening milestone implemented and typechecked.

### 2026-03-01 - Game modes source-of-truth doc integration (Closed)

- Original prompt:
  - Review AGENTS/ARCHITECTURE docs and add a source-of-truth document for game modes to guide upcoming mode implementation.
- Intent:
  - Establish a canonical contract for ruleset vs context behavior before implementation work starts.
- Plan:
  - Add `GAME_MODES.md` with canonical terminology and behavior contracts.
  - Wire references and guardrails into `AGENTS.md`.
  - Align ownership boundaries in `ARCHITECTURE.md`.
  - Add discoverability reference in `README.md`.
- Progress updates:
  - Created `GAME_MODES.md` with canonical terms (`Ruleset`, `Experience Context`, `Screen Flow`), baseline constraints, ruleset definitions, and ownership/change-management rules.
  - Updated `AGENTS.md` to include `GAME_MODES.md` as a high-signal source in scope/context bootstrap/read rules and gameplay-flow guardrails.
  - Updated `ARCHITECTURE.md` with a mode-model contract section and explicit ownership linkage to `GAME_MODES.md`.
  - Updated `README.md` governance docs list to include `GAME_MODES.md`.
- Validation:
  - Docs-only update; no runtime commands rerun.
- Outcome:
  - Closed. Mode implementation can now anchor on `astro-party/GAME_MODES.md` as the canonical source of truth.

### 2026-03-01 - Demo vs normal flow whole-app evaluation (Closed)

- Original prompt:
  - Evaluate demo vs normal gameplay phase/sequence integration, then verify findings against whole-app runtime flow.
- Intent:
  - Separate chunk-level suspicions from real end-to-end integration issues and capture a single source-of-truth report.
- Plan:
  - Record initial findings from targeted file review.
  - Trace full runtime flow across main/demo/ui/game/network/shared-sim.
  - Re-validate each initial issue and capture net-new issues.
  - Publish results to a dedicated markdown report.
- Progress updates:
  - Completed whole-flow trace for boot, deferred demo startup, start actions, phase/screen/audio sync, demo sim behavior, and transport paths.
  - Re-classified initial findings by whole-app validity.
  - Added new low/medium integration observations around teardown/scheduler ownership clarity.
  - Wrote report: `demo-vs-normal-flow-evaluation.md`.
- Validation:
  - Analysis/docs update only; no runtime build/typecheck rerun.
- Outcome:
  - Closed. Final verdict and evidence are documented in `astro-party/demo-vs-normal-flow-evaluation.md`.

### 2026-02-28 - Agent doc cleanup activity reference wiring (Closed)

- Original prompt:
  - Add a reference in the agent docs so saying "agent doc cleanup activity" is enough to trigger the full documentation cleanup workflow.
- Intent:
  - Make doc-governance cleanup reusable as a named activity with predictable outputs.
- Plan:
  - Add a reusable activity section in `AGENTS.md` with trigger phrase, scope, workflow, and done criteria.
  - Record this run in `progress.md`.
- Progress updates:
  - Added `Reusable Activity: Agent Doc Cleanup` section to `AGENTS.md`.
  - Documented execution rule so the shorthand phrase directly triggers the workflow.
- Validation:
  - Docs-only update; no runtime commands rerun.
- Outcome:
  - Closed. Future requests can use `agent doc cleanup activity` as the directive.

### 2026-02-28 - Guardrail/Architecture doc finetune (Closed)

- Original prompt:
  - Review learnings, promote concrete guardrails into `AGENTS.md`, update `progress.md` usage as a living planned-work reference, and update architecture constraints for platform-owned landscape orientation.
- Intent:
  - Convert recurring mistakes into policy-level guardrails and reduce repeat orientation/layout churn.
- Plan:
  - Review `learning.md` for stable patterns.
  - Promote policy-level rules into `AGENTS.md`.
  - Update `progress.md` contract for active planned-work tracking.
  - Update `ARCHITECTURE.md` with platform orientation ownership + safe-area responsibilities.
- Progress updates:
  - Completed learning-to-policy promotion in `AGENTS.md`.
  - Added `progress.md` two-layer contract and active-task workflow.
  - Added architecture ownership note: platform enforces landscape; client owns safe-area/HUD-aware placement.
- Validation:
  - Docs-only update; no runtime commands rerun.
- Outcome:
  - Closed. New guardrails and architecture contract are now explicit and durable.

### 2026-02-28 - Demo flow/runtime fixes (loop lifecycle + SDK + tap race guard) (Closed)

- Original prompt:
  - Review issues and fix items 1 to 4 from the demo flow/performance findings.
- Intent:
  - Remove background loop waste, align platform integration with SDK policy, clear compile blocker, and prevent duplicate start/join actions during demo teardown.
- Plan:
  - Add explicit RAF lifecycle ownership and background stop/resume hooks.
  - Replace direct bridge usage with `@oasiz/sdk` in runtime touchpoints.
  - Fix demo timer typing mismatch.
  - Add start-screen action locking so buttons disable before async teardown/network work.
- Progress updates:
  - Added `startLoop`/`stopLoop`, RAF handle tracking, `visibilitychange` and `oasiz.onPause/onResume` wiring in `src/Game.ts`.
  - Migrated score submit, haptics, room share, and injected player identity/state paths to `oasiz.*`.
  - Added SDK dependency (`@oasiz/sdk`) to `package.json`.
  - Fixed `DemoOverlayUI` interval typing to unblock typecheck.
  - Added start-screen action lock and early disable path in `src/ui/startScreen.ts`.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
- Outcome:
  - Closed. Findings 1-4 were implemented and validated in local checks.

### 2026-02-28 - Central SDK adapter refactor (Closed)

- Original prompt:
  - Instead of importing SDK directly in many files, centralize integration in one wrapper.
- Intent:
  - Improve maintainability and reduce churn risk from SDK API updates by routing platform calls through one adapter module.
- Plan:
  - Create a platform bridge module as the single `@oasiz/sdk` import location.
  - Refactor current call sites to consume bridge methods.
  - Validate compile/build and ensure no direct SDK imports remain outside the bridge.
- Progress updates:
  - Added `src/platform/oasizBridge.ts` with wrappers for score submit, haptics, room share, lifecycle hooks, gameplay activity, and injected room/player properties.
  - Refactored `Game`, `main`, `SettingsManager`, UI haptics/start flow, and transport files to call bridge methods.
  - Removed direct `@oasiz/sdk` imports from feature files.
- Validation:
  - `astro-party`: `bun run typecheck` passed.
  - `astro-party`: `bun run build` passed.
- Outcome:
  - Closed. Platform SDK integration now has a single import/adapter boundary.

### 2026-02-28 - Remaining issues doc capture (Closed)

- Original prompt:
  - Document the remaining unresolved issues into an `.md` file.
- Intent:
  - Preserve the post-fix open issues in a single actionable reference.
- Plan:
  - Reconfirm unresolved findings from the previous review.
  - Create a dedicated markdown file with severity, impact, evidence, and suggested fixes.
- Progress updates:
  - Created `remaining-issues.md` with the two still-open items:
    - orientation ownership mismatch
    - top safe-area offset budget not enforced for top interactive controls
- Validation:
  - Docs-only update; no runtime commands rerun.
- Outcome:
  - Closed. Remaining issues are now documented and linkable.

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
