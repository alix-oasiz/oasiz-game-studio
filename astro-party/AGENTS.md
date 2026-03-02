# Astro Party Agent Notes

This file is game-specific guidance for `astro-party/` and is additive to the repo root `AGENTS.md`.

## Scope + Source of Truth

- Applies to files under `astro-party/`.
- Root `AGENTS.md` remains authoritative for global standards.
- Keep docs separated by purpose:
  - `AGENTS.md`: execution policy and durable guardrails.
  - `ARCHITECTURE.md`: current system ownership and architecture map.
  - `GAME_MODES.md`: canonical mode terminology and ruleset/context contracts.
  - `.agents/learning.md`: agent-specific implementation learnings and anti-repeat patterns.
  - `progress.md`: living task reference + milestone journal.

## Delivery Discipline (Hard-line)

- Always evaluate current architecture and existing modules before proposing or implementing changes.
- Prefer small, iterable implementation steps with frequent validation unless the user explicitly requests a major rewrite.
- Default sequence:
  - assess ownership and constraints
  - choose smallest coherent change slice
  - implement
  - validate
  - record milestone
- If a likely fix requires teardown/replacement of a major manager/system, present options and tradeoffs to the user before proceeding.

## Reuse-first Policy

- Reuse existing managers/systems/utilities before introducing parallel logic paths.
- Centralize repeated logic into manager/system modules instead of duplicating behavior across UI/controllers/features.
- Avoid ad hoc per-screen/per-feature handling when a canonical pipeline exists (input, audio, networking, phase flow).
- If duplication is unavoidable due to hard constraints, record reason in `progress.md` and add prevention guardrail to `.agents/learning.md`.

## Architecture Hydration Rule

- `ARCHITECTURE.md` is a living map and must be updated with notable architecture/ownership changes in the same milestone.
- Notable changes include:
  - module ownership moves
  - new manager/system boundaries
  - removed/replaced pipelines
  - new user-imposed hard constraints that affect flow/tooling/UX/platform behavior
- Do not defer architecture updates for major behavior changes.

## Learning Loop Rule

- `.agents/learning.md` captures development-cycle learnings that should prevent repeat mistakes.
- When an approach is proven wrong after work starts, record:
  - incorrect assumption
  - detection signal
  - corrected approach
  - guardrail
- Promote stable, reusable guardrails from `.agents/learning.md` into `AGENTS.md` when they become policy-level.

## Progress Log Contract (`progress.md`)

- `progress.md` has two layers:
  - `Active Task Threads` (living, open-only): only currently in-progress threads belong here.
  - `Milestone Journal` (historical): append-only shipped summaries.
- Cost-control rules:
  - Keep `Active Task Threads` to at most 3 open threads.
  - One thread per user request stream; do not create a new thread for every small follow-up in the same stream.
  - Closed threads must be removed from `Active Task Threads` after milestone capture.
  - Do not duplicate full detail in both sections.
- Active thread update format (lean):
  - required fields: `Original prompt`, `Intent`, `Current plan`, `Status`, `Latest validation`.
  - `Progress updates` should be short timestamped lines (1-2 lines each), not long narrative rewrites.
- Mid-run checkpoint rule (required):
  - Update `Progress updates` during execution, not only at start/end.
  - Add a checkpoint line after each meaningful step boundary:
    - context gathered
    - major edit batch completed
    - validation command completed/failed
    - blocker or assumption change discovered
  - For long runs, record a heartbeat at least every 10 minutes.
  - Checkpoint format:
    - `- [HH:MM] action taken -> result/next`
- Close-out rules:
  - On completion, write one concise milestone entry (scope, key files, validation, outcome), then delete the active thread.
  - If work is docs-only or under ~30 minutes, use milestone-only logging unless the user explicitly asks for detailed in-flight tracking.
- Hygiene rules:
  - Run a condense pass when `progress.md` exceeds ~600 lines or when closed-thread churn makes active work hard to scan.
  - Do not rewrite historical milestone meaning during condense; preserve dates, outcomes, and validation signals.
  - If there are no open threads, keep one explicit placeholder line in `Active Task Threads` instead of leaving closed threads there.

## Reusable Activity: Agent Doc Cleanup

- Trigger phrase:
  - `agent doc cleanup activity`
- Execution rule:
  - When the user asks for this activity (or equivalent wording), run this workflow end-to-end without requiring extra prompt decomposition unless scope is explicitly ambiguous.
- Required inputs:
  - `AGENTS.md`
  - `ARCHITECTURE.md`
  - `.agents/learning.md`
  - `progress.md`
- Workflow:
  - extract recurring issues/signals from `progress.md` (active threads + recent milestones)
  - convert qualifying recurring issues into/through `.agents/learning.md` entries (assumption -> signal -> corrected approach -> guardrail)
  - promote stable repeated learnings from `.agents/learning.md` into concrete AGENTS guardrails
  - remove/merge duplicate or vague guardrails
  - update architecture ownership notes if platform/runtime constraints changed
  - update `progress.md` active task thread + milestone entry for the cleanup run
  - if progress became noisy, run a focused condense pass while preserving/archiving history
- Required outputs:
  - updated policy guardrails in `AGENTS.md`
  - aligned ownership constraints in `ARCHITECTURE.md` (if changed)
  - updated `progress.md` records for the cleanup task
  - updated `.agents/learning.md` when new recurring issues were distilled from progress
  - traceability note listing what was promoted (`progress -> learning -> AGENTS`)
  - explicit architecture outcome note in milestone (`changed` or `no change required`)
- Done criteria:
  - no conflicting guidance between AGENTS/ARCHITECTURE/learning/progress
  - recurring issues converted into explicit, testable guardrail language
  - cleanup run is documented in `progress.md`

## Context Bootstrap (Before Deep File Exploration)

- Before diving into implementation files, load high-signal context in this order:
  - `AGENTS.md` (policy and guardrails)
  - `ARCHITECTURE.md` (ownership and system boundaries)
  - `GAME_MODES.md` (ruleset/context source of truth for mode behavior)
- Then load task-specific docs only (not all docs by default):
  - audio task: `assets/audio-src/README.md`
  - shared sim/assets task: `shared/README.md`, `shared/assets/entities/README.md`, `shared/assets/ships/README.md`
  - server task: `server/README.md`
  - general flow/build task: root `README.md`
- Check `.agents/learning.md` for related anti-repeat guardrails before coding.
- For planned prompts, write/update the active task thread first, then append milestone + validation status in `progress.md` on completion.

## Readme Contract (Read/Update Rules)

Read before touching related area:
- `README.md`: overall dev/build/runtime flow.
- `GAME_MODES.md`: canonical mode contracts and phase flow by ruleset.
- `assets/audio-src/README.md`: audio conversion workflow and source rename mapping.
- `shared/README.md`: deterministic/shared constraints.
- `shared/assets/entities/README.md`: entity SVG contract and generation flow.
- `shared/assets/ships/README.md`: ship skin contract and validation.
- `server/README.md`: backend behavior, env flags, and debug gates.

Update when behavior/process changes:
- Update `README.md` for script/build/bootstrap flow changes.
- Update `assets/audio-src/README.md` for audio source/variant mapping changes.
- Update shared/server readmes when their contracts or runtime behavior change.

## Asset URL + Build Contract

- Runtime asset URLs for deployed output must remain relative.
- Use `./assets/...` URLs (not `/assets/...`, not absolute URLs) for runtime-referenced files.
- Keep `base: "./"` in `vite.config.js`.
- Build output should preserve `./assets/**/*.<ext>`-style references where emitted URLs are used so backend/CDN replacement can operate safely.

## Gameplay Flow Guardrails

- Canonical phase flow for `ROUND_ELIMINATION`:
  - match start: `START -> LOBBY -> MATCH_INTRO -> COUNTDOWN -> PLAYING`
  - round loop: `ROUND_END -> COUNTDOWN -> PLAYING`
  - match end: `... -> GAME_END`
- Ruleset/context naming and behavior must follow `GAME_MODES.md`.
- Do not conflate onboarding tutorial and background attract behavior under one generic "demo" mode.
- Keep ruleset semantics and experience-context behavior separated.
- Onboarding/attract contexts must not cause transient screen jumps through unrelated states.
- Teardown running onboarding/attract context cleanly before create/join actions.
- Do not re-trigger splash/logo/start cues outside intended scope.

## Input Guardrails

- Do not duplicate gameplay input handling in overlays.
- Tutorial gating should consume local input action events from the canonical pipeline.
- Mobile touch controls must come from `MultiInputManager` / `TouchZoneManager`.
- Overlays must not block touch zones during control/try-it phases.
- Any coarse-pointer tap action with state changes must use a shared tap guard (`preventDefault`, `stopPropagation`, cooldown/debounce) to prevent double-fire.

## UI + Layout Guardrails

- Platform is the owner of forced landscape orientation behavior.
- Do not reintroduce client-side portrait-to-landscape forced rotation workarounds for normal gameplay/start/lobby flows.
- UI work should focus on safe placement in landscape:
  - respect platform top HUD overlay space
  - respect notch/device safe zones on either landscape orientation
- For top-corner interactive controls, budget explicit top offset from the effective safe top zone before polish.

## Implementation Planning Guardrails

- Responsive/UI-heavy changes must start with one coherent layout model and a fixed viewport test matrix before incremental polish.
- Loadtest changes must declare primary objective up front:
  - gameplay-path parity, or
  - observability/panel diagnostics
- Process/tooling automation must be validated against real source-of-truth boundaries before being promoted into policy.
- Render-wide visual experiments must declare an explicit frame-budget target and a rollback/disable path before iterative tuning on default gameplay rendering.
- After canonical mode/flow refactors, run a dead-path cleanup sweep in the same delivery window (remove obsolete flags, fallback branches, hidden IDs, and stale docs references).
- Intermittent lag investigations must lock a capture-condition matrix first (feature flags/tooling/device mode) and tie each finding to those conditions before ranking fixes.

## Validation Matrix

Always for runtime-impacting changes:
- `bun run typecheck`
- `bun run build`

When asset pipelines change:
- Audio tooling/paths: `bun run ffmpeg:check`
- Entity/ship SVG source changes:
  - `bun run generate:entities`
  - `bun run generate:ship-skins`

When onboarding/attract/input flow changes, manually validate:
- attract start interaction
- mobile tutorial progression via touch input path
- transition to local/online lobby without START flicker regressions
