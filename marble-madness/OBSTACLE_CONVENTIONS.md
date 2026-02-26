# Obstacle Conventions

## Purpose
Defines obstacle vocabulary, behavior, and implementation standards.

## Core Terms
- Obstacle: Any gameplay element that blocks, redirects, risks, or times player movement.
- Hazard: Obstacle that causes failure on contact.
- Blocker: Obstacle that physically impedes passage but can be navigated around.
- Gate: Obstacle with an intentional opening/timing window.
- Trigger: Invisible or visible zone that activates an event when crossed.

## Obstacle Categories
- Static blocker:
  - Fixed position/rotation.
  - Examples: side block, center block, narrow lane divider.
- Dynamic mover:
  - Moves or rotates with deterministic motion.
  - Examples: sweeper bar, oscillating wall.
- Timing gate:
  - Periodic open/close behavior.
- Jump challenge:
  - Gap + landing pressure with optional side risk.
- Triggered event obstacle:
  - Spawns, enables, or changes state after trigger.

## Authoring Rules
- Deterministic behavior only.
  - No `Math.random()` in per-frame update loops.
- Visual and collider alignment is mandatory.
- Every obstacle must have a clear read:
  - silhouette contrast
  - readable motion direction if dynamic
- Obstacle spacing should preserve flow:
  - avoid unavoidable failure unless explicitly requested
  - provide recovery room after high-risk obstacles

## Difficulty Guidelines
- Easy:
  - wide openings
  - slower dynamic motion
  - single mechanic at a time
- Medium:
  - narrower openings
  - moderate motion speed
  - occasional mechanic combinations
- Hard:
  - tight openings
  - faster timing windows
  - chained obstacle sequences

## Trigger/Event Rules
- Trigger zones should be explicit in code and deterministic in placement.
- One-shot events must guard against repeated firing.
- If obstacle events are celebratory (confetti/fireworks), keep visuals non-blocking to gameplay.

## Physics Rules
- Use fixed bodies for static obstacles.
- Use kinematic bodies for moving obstacles.
- Friction/restitution should be deliberate per obstacle type.
- Keep CCD enabled for fast-moving interactions to reduce tunneling.

## Prompt Contract
When user describes obstacles in plain English, Codex should:
1. Translate description into obstacle sequence/types.
2. Resolve placement parameters (z span, lateral placement, width/height, timing).
3. Keep obstacle behavior deterministic.
4. Validate that the course remains playable unless user requests punishing/impossible behavior.
