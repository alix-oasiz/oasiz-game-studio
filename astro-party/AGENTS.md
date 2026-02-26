# Astro Party Agent Notes

This file is game-specific guidance for `astro-party/` and is additive to the repo root `AGENTS.md`.

## Scope + Source of Truth

- Applies to files under `astro-party/`.
- Root `AGENTS.md` remains authoritative for global standards.
- Keep docs separated by purpose:
  - `AGENTS.md`: execution policy and durable guardrails.
  - `ARCHITECTURE.md`: current system ownership and architecture map.
  - `.agents/learning.md`: agent-specific implementation learnings and anti-repeat patterns.
  - `progress.md`: append-only milestone timeline with validation status.

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

- `progress.md` is append-only.
- Never rewrite historical milestones; append dated entries.
- Use established style:
  - date heading
  - concise scope
  - key file/module changes
  - validation section (or explicit reason not run)
  - follow-ups where relevant

## Context Bootstrap (Before Deep File Exploration)

- Before diving into implementation files, load high-signal context in this order:
  - `AGENTS.md` (policy and guardrails)
  - `ARCHITECTURE.md` (ownership and system boundaries)
- Then load task-specific docs only (not all docs by default):
  - audio task: `assets/audio-src/README.md`
  - shared sim/assets task: `shared/README.md`, `shared/assets/entities/README.md`, `shared/assets/ships/README.md`
  - server task: `server/README.md`
  - general flow/build task: root `README.md`
- Check `.agents/learning.md` for related anti-repeat guardrails before coding.
- After implementation, append milestone + validation status in `progress.md`.

## Readme Contract (Read/Update Rules)

Read before touching related area:
- `README.md`: overall dev/build/runtime flow.
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

- Canonical phase flow: `START -> LOBBY -> COUNTDOWN -> PLAYING -> ROUND_END -> GAME_END`.
- Demo mode must not cause transient screen jumps through unrelated states.
- Teardown demo cleanly before create/join actions.
- Do not re-trigger splash/logo/start cues outside intended scope.

## Input Guardrails

- Do not duplicate gameplay input handling in overlays.
- Tutorial gating should consume local input action events from the canonical pipeline.
- Mobile touch controls must come from `MultiInputManager` / `TouchZoneManager`.
- Overlays must not block touch zones during control/try-it phases.

## Validation Matrix

Always for runtime-impacting changes:
- `bun run typecheck`
- `bun run build`

When asset pipelines change:
- Audio tooling/paths: `bun run ffmpeg:check`
- Entity/ship SVG source changes:
  - `bun run generate:entities`
  - `bun run generate:ship-skins`

When demo/input flow changes, manually validate:
- attract start interaction
- mobile tutorial progression via touch input path
- transition to local/online lobby without START flicker regressions
