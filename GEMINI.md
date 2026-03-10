# Oasiz Game Studio - Project Context

This document provides a comprehensive overview of the Oasiz Game Studio project, its structure, and development conventions.

## Project Overview

This is a monorepo for developing, and publishing browser-based games to the Oasiz platform. The repository contains multiple individual game projects, each within its own directory.

The primary technology stack is **TypeScript** for game logic and **Vite** for the build tooling. The project uses **Bun** as the package manager and script runner.

## Project Structure

Each game resides in its own top-level directory (e.g., `arrow-arena/`, `block-buster/`). A typical game project has the following structure:

```
your-game-name/
├── src/
│   ├── main.ts      # Entry point for the game logic
│   └── ...          # Other TypeScript modules
├── index.html       # Entry point + CSS styles
├── package.json     # Dependencies and scripts
├── tsconfig.json    # TypeScript configuration
└── vite.config.js   # Vite build configuration
```

- All game code resides in the `src/` directory.
- `src/main.ts` is the entry point, but code can be split across multiple files within `src/`.
- All CSS styles should be within `<style>` tags in `index.html`.
- No JavaScript should be present in `index.html`.

## Building and Running a Game

### Development

To run a game in development mode:

1.  Navigate to the game's directory: `cd your-game-name/`
2.  Install dependencies: `bun install`
3.  Start the development server: `bun run dev`

### Production Build

To create a production build of a game:

1.  Navigate to the game's directory: `cd your-game-name/`
2.  Install dependencies if you haven't already: `bun install`
3.  Build the game: `bun run build`
    The output will be in the `dist/` directory.

### Uploading a Game

To upload a game to the Oasiz platform for testing, run the following command from the **root** of the repository:

```bash
# Set up environment variables first (see README.md)
bun run upload your-game-name
```

## Development Conventions

### Platform Integration

Games must integrate with the Oasiz platform for features like score submission, haptic feedback, and settings.

-   **Score Submission:**
    ```typescript
    // Call this function on game over
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(this.score);
    }
    ```

-   **Haptic Feedback:**
    ```typescript
    // Available types: "light", "medium", "heavy", "success", "error"
    if (typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic("medium");
    }
    ```

-   **Settings Modal:** Every game must have a settings button with toggles for Music, Sound Effects, and Haptics, persisting the state to `localStorage`.

### Responsiveness and Safe Areas

-   Games must be responsive and fill 100% of the viewport.
-   Interactive elements must respect safe areas: `45px` from the top on desktop and `120px` from the top on mobile.

### Multiplayer

For multiplayer games, use the **Playroom Kit**. The `draw-the-thing/` directory serves as a complete example.

### AI-Assisted Development

The `Agents.md` file contains detailed rules and guidelines for AI-assisted development, covering haptics, score submission, responsiveness, and more. It is intended to be used in prompts to AI assistants.
