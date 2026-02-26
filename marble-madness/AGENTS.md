# AGENTS.md - Marble Madness Context Index

This file is an index/dispatcher for project conventions.
Do not duplicate detailed conventions here.

## Context Loading Policy
- Load only the convention file(s) needed for the current task.
- Do not load unrelated convention files to minimize context/token usage.
- Apply rules from the selected file as authoritative for that domain.

## Convention Files
- `PLATFORM_CONVENTIONS.md`
  - Load when the task involves platform layout, tile sequencing, slope/width transitions, gaps, wall-floor blending, camera pan semantics, or platform texture density.
- `OBSTACLE_CONVENTIONS.md`
  - Load when the task involves obstacle design, blockers, hazards, timing gates, trigger zones, obstacle difficulty tuning, or obstacle event logic.

## Naming Policy
- Use **platform** terminology in code/docs/prompts
