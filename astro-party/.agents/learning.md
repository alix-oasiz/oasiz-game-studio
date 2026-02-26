# Astro Party Learning Log

Durable implementation learnings to avoid repeating known mistakes.

## Usage Rules

- Append-only. Do not rewrite historical entries.
- Keep entries actionable and specific to a failed assumption or correction.
- When a learning becomes stable policy, mirror it into `AGENTS.md`.
- Link major learnings to matching `progress.md` milestones where relevant.

## Entry Template

```md
## YYYY-MM-DD - <short title>
- Context:
- Wrong assumption:
- Detection signal:
- Corrected approach:
- Guardrail:
- Related files:
```

## 2026-02-26 - Demo tutorial input path must reuse game pipeline

- Context:
  - Mobile demo tutorial progression was keyboard-only in practice.
- Wrong assumption:
  - Overlay-local touch/keyboard handlers were enough to drive tutorial action detection.
- Detection signal:
  - Touch did not advance tutorial/control handoff while gameplay touch zones existed.
  - Required behavior was only observed through keyboard path.
- Corrected approach:
  - Route tutorial action detection through canonical local input action callback path:
    - `Game.onLocalInputAction -> main.ts subscriber bridge -> DemoOverlayUI`.
  - Ensure overlays are non-blocking during try/control phases so touch zones receive input.
- Guardrail:
  - Do not add duplicate gameplay input detection in overlays when input pipeline callbacks already exist.
- Related files:
  - `src/Game.ts`
  - `src/main.ts`
  - `src/demo/DemoOverlayUI.ts`

## 2026-02-26 - Demo teardown must precede create/join transitions

- Context:
  - Entering create room/lobby caused transient jump patterns and unintended start-screen side effects.
- Wrong assumption:
  - It was safe to phase-hop while demo state was still partially active.
- Detection signal:
  - Visible transition from demo PLAYING -> START-like behavior -> lobby.
  - Intro/audio/UI effects briefly replayed out of scope.
- Corrected approach:
  - Perform explicit demo teardown before initiating create/join flow.
  - Keep suppress-next-start side effects scoped to teardown-for-action path.
- Guardrail:
  - For demo-to-action transitions, never patch around transient phases; teardown first, then transition.
- Related files:
  - `src/main.ts`
  - `src/demo/DemoController.ts`
  - `src/demo/DemoOverlayUI.ts`

## 2026-02-26 - Splash/logo/menu audio sequencing must be single-owner per cue

- Context:
  - Cue conflicts occurred between splash/logo/start BGM, including duplicate or conflicting trigger timing.
- Wrong assumption:
  - Multiple flow owners could safely trigger the same cue family with independent timing.
- Detection signal:
  - Perceived conflict where one cue masked another, and retriggers occurred across nearby transitions.
- Corrected approach:
  - Assign one owner per cue timeline segment and gate scene music starts around intro completion boundaries.
  - Cancel pending timers and clear conflicting cue paths when leaving scope.
- Guardrail:
  - For timeline-sensitive cues, keep single ownership and explicit cancellation/phase gates.
- Related files:
  - `src/main.ts`
  - `src/ui/startScreen.ts`
  - `src/AudioManager.ts`
