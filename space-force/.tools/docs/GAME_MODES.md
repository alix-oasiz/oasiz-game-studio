# Space Force Game Modes Source of Truth

This document defines canonical game-mode terminology and behavior for `space-force/`.
It is the source of truth for mode naming, phase flow by ruleset, and mode-specific constraints.

## Purpose

- Separate core match rules from onboarding/attract experience behavior.
- Prevent ad hoc demo/tutorial patches from rewriting core gameplay flow.
- Provide one canonical mode contract for client, server, and shared simulation work.

## Scope

- Applies to runtime mode behavior in:
  - `src/` client flow orchestration and UI mapping
  - `shared/sim/` authoritative rules
  - `server/src/` room command/event behavior
- Does not define visual styling details.

## Canonical Terms

Use these terms consistently in code and docs.

### 1) Ruleset

Defines core gameplay rules, progression, elimination, respawn, and win conditions.

- `ROUND_ELIMINATION`
- `ENDLESS_RESPAWN`

### 2) Experience Context

Defines why the match is running and what interaction model/UI overlays are active.
Experience context must not silently redefine ruleset semantics.

- `LIVE_MATCH`
- `ONBOARDING_TUTORIAL`
- `ATTRACT_BACKGROUND`

### 3) Screen Flow

UI presentation states (start/lobby/game/results) are separate from ruleset/context.
Screen flow can hide or reveal gameplay while the simulation continues.

## Current Global Constraints

- No join-in-progress behavior is supported at this time.
- Leader reassignment behavior remains the existing system behavior.
- New mode work must not alter non-mode networking authority contracts.

## Ruleset Definitions

### `ROUND_ELIMINATION` (existing baseline)

Core behavior:
- Round-based elimination.
- Canonical phase sequence:
  - Match start: `START -> LOBBY -> MATCH_INTRO -> COUNTDOWN -> PLAYING`
  - Round transitions: `ROUND_END -> COUNTDOWN -> PLAYING`
  - Match end: `... -> GAME_END`
- Players can be eliminated and spectate until round transition.
- Match winner is determined by round progression and rounds-to-win logic.

Use cases:
- Standard local/online matches.

### `ENDLESS_RESPAWN` (new continuous ruleset)

Core behavior:
- Continuous combat loop with respawns.
- Intended phase sequence:
  - `START -> LOBBY -> COUNTDOWN -> PLAYING_CONTINUOUS`
- No elimination-driven `ROUND_END`/`GAME_END` transitions.
- Players respawn after death and continue scoring.
- Session ends via: (a) room leader manually ending the match, or (b) automatic time-limit expiry when `endlessTimeLimitSeconds` is set.

Winner semantics:
- Winner is ranking-by-score at session end snapshot.
- Tiebreaker chain: score → round wins → kills.
- Session-end snapshot triggers must be explicit in implementation design.

Win conditions (endless-specific, independent — either or both may be active):
- **Time limit** (`endlessTimeLimitSeconds: number | null`): automatically ends the match after N seconds of PLAYING time. null = no time limit. Timer tracks elapsed sim time only (pausing the sim pauses the timer). On expiry calls `endMatchByScore()`.
- **Kill limit** (`endlessKillLimit: number | null`): automatically ends the match when any player's kill count reaches N. null = no kill limit. On trigger calls `endMatchByScore()`.
- Both conditions are checked independently each sim tick; whichever fires first ends the match.
- Allowed values and defaults are defined centrally in `constants.ts` (`ENDLESS_TIME_LIMIT_OPTIONS`, `ENDLESS_KILL_LIMIT_OPTIONS`) so they can be tuned without touching sim/UI logic.
- Lobby advanced settings shows both cycle controls for endless and hides the rounds-to-win control.

Map support policy:
- All maps are available in endless mode (no per-ruleset exclusions).
- Map rotation pool (`CLASSIC_ROTATION_MAP_IDS`) applies uniformly across rulesets.

## Experience Context Definitions

### `LIVE_MATCH`

- Normal user-visible play session.
- Input, HUD, and scoring are fully active per selected ruleset.

### `ONBOARDING_TUTORIAL`

- Teaches controls and game actions.
- May gate/shape player input and camera behavior.
- Should hand off into an interactive match context without rewriting core ruleset behavior.

### `ATTRACT_BACKGROUND`

- Background simulation for start/attract presentation.
- Typically AI-driven and non-interactive for the user.
- Should not be treated as tutorial progression.
- Should not trigger normal match-end UX or score submission paths.

## Composition Rules (Non-Negotiable)

- A ruleset defines match progression; context does not override that progression implicitly.
- A context may restrict input/UI/audio behavior, but not mutate ruleset semantics without explicit contract.
- Demo/tutorial logic must be expressed through `Experience Context`, not hidden phase hacks.
- Background attract behavior must be treated as `ATTRACT_BACKGROUND`, not conflated with tutorial mode.

## Ownership Boundaries

- Shared simulation (`shared/sim/*`) owns ruleset mechanics and authoritative phase/state transitions.
- Client orchestration (`src/main.ts`) owns context selection and screen mapping.
- Demo/tutorial controllers own onboarding presentation logic and context transitions.
- UI modules must consume phase/context state, not invent alternate progression paths.

## Change Management

When adding/changing a mode:
- Update this file first or in the same milestone.
- Update `ARCHITECTURE.md` if ownership or boundaries change.
- Update `AGENTS.md` guardrails if new policy-level constraints are introduced.
- Log the planned work and outcome in `progress.md`.
