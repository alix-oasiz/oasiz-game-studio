import type { Game } from "../Game";
import { PLAYER_COLORS, type PlayerData, type PowerUpType } from "../types";
import { elements } from "../ui/elements";
import type { ScreenController } from "../ui/screens";
import { createPhysicsLabController } from "./physicsLab";
import { SeededRNG } from "../../shared/sim/SeededRNG";

interface DebugPanelOptions {
  game: Game;
  screenController: ScreenController;
  restoreLiveUi: () => void;
  playDemo?: () => Promise<void>;
}

const PANEL_ID = "qaDebugPanel";
const TOGGLE_ID = "qaDebugToggle";
const LAB_TOGGLE_ID = "qaLabToggle";
const STATUS_ID = "qaDebugStatus";
const COARSE_TAP_GUARD_MS = 340;

const POWERUP_ACTIONS: Array<{
  label: string;
  type: PowerUpType | "SPAWN_RANDOM";
}> = [
  { label: "Laser", type: "LASER" },
  { label: "Shield", type: "SHIELD" },
  { label: "Scatter", type: "SCATTER" },
  { label: "Mine", type: "MINE" },
  { label: "Random Crate", type: "SPAWN_RANDOM" },
];

export function mountDebugPanel(options: DebugPanelOptions): void {
  if (document.getElementById(PANEL_ID)) return;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const tapGuardUntilByElement = new WeakMap<EventTarget, number>();
  const shouldHandleTap = (
    target: EventTarget | null,
    guardMs: number = COARSE_TAP_GUARD_MS,
  ): boolean => {
    if (!isCoarsePointer || !target) return true;
    const now = performance.now();
    const guardUntil = tapGuardUntilByElement.get(target) ?? 0;
    if (now < guardUntil) {
      return false;
    }
    tapGuardUntilByElement.set(target, now + guardMs);
    return true;
  };

  const physicsLab = createPhysicsLabController(options.game, {
    onVisibilityChange: (visible) => {
      const labToggle = document.getElementById(
        LAB_TOGGLE_ID,
      ) as HTMLButtonElement | null;
      if (!labToggle) return;
      labToggle.setAttribute("aria-expanded", visible ? "true" : "false");
    },
  });

  injectStyles();

  const root = document.createElement("div");
  root.className = "qa-debug-root";

  const toggles = document.createElement("div");
  toggles.className = "qa-debug-toggle-row";

  const toggle = document.createElement("button");
  toggle.id = TOGGLE_ID;
  toggle.className = "qa-debug-toggle";
  toggle.type = "button";
  toggle.textContent = "DBG";
  toggle.setAttribute("aria-expanded", "false");

  const labToggle = document.createElement("button");
  labToggle.id = LAB_TOGGLE_ID;
  labToggle.className = "qa-debug-lab-toggle";
  labToggle.type = "button";
  labToggle.textContent = "LAB";
  labToggle.setAttribute("aria-expanded", "false");

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = "qa-debug-panel";
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("inert", "");

  let statusIntervalId: number | null = null;
  const stopStatusUpdates = (): void => {
    if (statusIntervalId === null) return;
    window.clearInterval(statusIntervalId);
    statusIntervalId = null;
  };
  const startStatusUpdates = (): void => {
    if (statusIntervalId !== null) return;
    statusIntervalId = window.setInterval(() => {
      updateStatus(options.game);
    }, 500);
  };
  const closeDebugPanel = (): void => {
    closePanel(panel, toggle);
    stopStatusUpdates();
  };
  const closePhysicsLab = (): void => {
    physicsLab.close();
  };
  const openDebugPanel = (): void => {
    closePhysicsLab();
    openPanel(panel, toggle);
    updateStatus(options.game);
    startStatusUpdates();
  };
  const openPhysicsLab = (): void => {
    closeDebugPanel();
    physicsLab.open();
  };

  panel.appendChild(buildHeader(closeDebugPanel, shouldHandleTap));
  panel.appendChild(buildStatusBlock());
  panel.appendChild(
    buildSection(
      "Screens",
      [
        {
          label: "Live",
          onClick: () => {
            options.restoreLiveUi();
          },
        },
        {
          label: "Start",
          onClick: () => {
            options.screenController.showScreen("start");
          },
        },
        {
          label: "Lobby",
          onClick: () => {
            options.screenController.showScreen("lobby");
          },
        },
        {
          label: "Game HUD",
          onClick: () => {
            options.screenController.showScreen("game");
            options.screenController.setRoundResultVisible(false);
          },
        },
        {
          label: "Round End Mock",
          onClick: () => {
            showRoundEndPreview(options.game, options.screenController);
          },
        },
        {
          label: "Match End Mock",
          onClick: () => {
            showGameEndPreview(options.game, options.screenController);
          },
        },
      ],
      shouldHandleTap,
    ),
  );
  panel.appendChild(
    buildSection(
      "Debug",
      [
        {
          label: "Toggle Dev Viz",
          onClick: () => {
            options.game.toggleDevMode();
          },
        },
        {
          label: "Physics Lab",
          onClick: () => {
            openPhysicsLab();
          },
        },
        {
          label: "Eject Pilot",
          onClick: () => {
            options.game.requestDebugEjectPilot();
          },
        },
      ],
      shouldHandleTap,
    ),
  );
  panel.appendChild(
    buildSection(
      "Powerups",
      POWERUP_ACTIONS.map((action) => ({
        label: action.label,
        onClick: () => {
          options.game.requestDebugPowerUp(action.type);
        },
      })),
      shouldHandleTap,
    ),
  );

  if (options.playDemo) {
    const playDemoFn = options.playDemo;
    panel.appendChild(
      buildSection(
        "Demo",
        [
          {
            label: "Play Demo",
            onClick: () => {
              closeDebugPanel();
              void playDemoFn();
            },
          },
        ],
        shouldHandleTap,
      ),
    );
  }

  toggles.appendChild(toggle);
  toggles.appendChild(labToggle);
  root.appendChild(toggles);
  root.appendChild(panel);
  document.body.appendChild(root);

  toggle.addEventListener("click", (event) => {
    if (!shouldHandleTap(event.currentTarget)) return;
    if (panel.classList.contains("active")) {
      closeDebugPanel();
      return;
    }
    openDebugPanel();
  });
  labToggle.addEventListener("click", (event) => {
    if (!shouldHandleTap(event.currentTarget)) return;
    if (physicsLab.isOpen()) {
      closePhysicsLab();
      return;
    }
    openPhysicsLab();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeDebugPanel();
    closePhysicsLab();
  });
  window.addEventListener("beforeunload", stopStatusUpdates, { once: true });

  updateStatus(options.game);
}

function buildHeader(
  onClose: () => void,
  shouldHandleTap: (target: EventTarget | null) => boolean,
): HTMLElement {
  const header = document.createElement("div");
  header.className = "qa-debug-header";

  const title = document.createElement("span");
  title.className = "qa-debug-title";
  title.textContent = "QA Debug";

  const close = document.createElement("button");
  close.className = "qa-debug-close";
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", (event) => {
    if (!shouldHandleTap(event.currentTarget)) return;
    onClose();
  });

  header.appendChild(title);
  header.appendChild(close);
  return header;
}

function buildStatusBlock(): HTMLElement {
  const status = document.createElement("div");
  status.id = STATUS_ID;
  status.className = "qa-debug-status";
  status.textContent = "Loading debug state...";
  return status;
}

function buildSection(
  title: string,
  actions: Array<{ label: string; onClick: () => void }>,
  shouldHandleTap: (target: EventTarget | null) => boolean,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "qa-debug-section";

  const heading = document.createElement("h4");
  heading.className = "qa-debug-section-title";
  heading.textContent = title;

  const grid = document.createElement("div");
  grid.className = "qa-debug-grid";

  for (const action of actions) {
    const button = document.createElement("button");
    button.className = "qa-debug-btn";
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", (event) => {
      if (!shouldHandleTap(event.currentTarget)) return;
      action.onClick();
    });
    grid.appendChild(button);
  }

  section.appendChild(heading);
  section.appendChild(grid);
  return section;
}

function showRoundEndPreview(
  game: Game,
  screenController: ScreenController,
): void {
  const mockPlayers = buildMockPlayers(game.getPlayers());
  const winner = mockPlayers[0];
  const roundNum = Math.max(1, Math.min(9, winner.roundWins + 1));

  screenController.showScreen("game");
  screenController.updateScoreTrack(mockPlayers);
  elements.roundResultTitle.textContent = "ROUND " + roundNum.toString();
  elements.roundResultSubtitle.textContent =
    "WINNER: " + winner.name.toUpperCase();
  screenController.setRoundResultVisible(true);
}

function showGameEndPreview(
  game: Game,
  screenController: ScreenController,
): void {
  const mockPlayers = buildMockPlayers(game.getPlayers());
  const winner = mockPlayers[0];

  screenController.showScreen("end");
  screenController.updateGameEnd(mockPlayers);
  elements.winnerName.textContent = winner.name;
}

function hashTextSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildMockPlayers(livePlayers: PlayerData[]): PlayerData[] {
  const source = livePlayers.length > 0 ? livePlayers : buildFallbackPlayers();

  const mock = source.map((player, index) => {
    const baseSeed = hashTextSeed(player.id + "|" + player.name + "|" + index);
    const rng = new SeededRNG(baseSeed);
    return {
      ...player,
      score: rng.nextInt(100, 9099),
      roundWins: rng.nextInt(0, 3),
      kills: rng.nextInt(0, 19),
      state: "ACTIVE" as const,
    };
  });

  mock.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.roundWins !== a.roundWins) return b.roundWins - a.roundWins;
    return b.kills - a.kills;
  });
  return mock;
}

function buildFallbackPlayers(): PlayerData[] {
  return [
    {
      id: "qa_1",
      name: "Pilot 1",
      color: PLAYER_COLORS[0],
      kills: 0,
      roundWins: 0,
      score: 0,
      comboMultiplier: 1,
      comboExpiresAtMs: 0,
      state: "ACTIVE",
    },
    {
      id: "qa_2",
      name: "Pilot 2",
      color: PLAYER_COLORS[1],
      kills: 0,
      roundWins: 0,
      score: 0,
      comboMultiplier: 1,
      comboExpiresAtMs: 0,
      state: "ACTIVE",
    },
    {
      id: "qa_3",
      name: "Pilot 3",
      color: PLAYER_COLORS[2],
      kills: 0,
      roundWins: 0,
      score: 0,
      comboMultiplier: 1,
      comboExpiresAtMs: 0,
      state: "ACTIVE",
    },
    {
      id: "qa_4",
      name: "Pilot 4",
      color: PLAYER_COLORS[3],
      kills: 0,
      roundWins: 0,
      score: 0,
      comboMultiplier: 1,
      comboExpiresAtMs: 0,
      state: "ACTIVE",
    },
  ];
}

function updateStatus(game: Game): void {
  const target = document.getElementById(STATUS_ID);
  if (!target) return;
  const status = game.getDebugStatus();
  const phase = game.getPhase();
  target.textContent =
    "Phase: " +
    phase +
    " | Room debug: " +
    (status.roomEnabled ? "ON" : "OFF") +
    " | Session tainted: " +
    (status.sessionTainted ? "YES" : "NO");
}

function injectStyles(): void {
  if (document.getElementById("qaDebugStyles")) return;
  const style = document.createElement("style");
  style.id = "qaDebugStyles";
  style.textContent = `
    .qa-debug-root {
      position: fixed;
      left: calc(var(--box-left) + var(--hud-side-gap) + 52px);
      top: calc(var(--box-top) + var(--hud-top-pad));
      z-index: 250;
      pointer-events: none;
    }

    .qa-debug-toggle-row {
      pointer-events: none;
      display: flex;
      gap: 6px;
    }

    .qa-debug-toggle,
    .qa-debug-lab-toggle {
      pointer-events: auto;
      width: 50px;
      height: 34px;
      border-radius: 10px;
      background: rgba(20, 16, 4, 0.92);
      font-family: 'Orbitron', sans-serif;
      font-size: 0.74rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      transition: background 0.16s ease, border-color 0.16s ease;
    }

    .qa-debug-toggle {
      border: 1px solid rgba(255, 180, 0, 0.85);
      color: #ffcf47;
      box-shadow: 0 0 18px rgba(255, 180, 0, 0.25);
    }

    .qa-debug-lab-toggle {
      border: 1px solid rgba(0, 240, 255, 0.75);
      color: #86f4ff;
      box-shadow: 0 0 16px rgba(0, 240, 255, 0.22);
    }

    .qa-debug-toggle[aria-expanded="true"] {
      background: rgba(34, 24, 6, 0.96);
    }

    .qa-debug-lab-toggle[aria-expanded="true"] {
      background: rgba(4, 24, 30, 0.94);
    }

    .qa-debug-panel {
      pointer-events: none;
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
      transition: opacity 0.16s ease, transform 0.16s ease;
      margin-top: 8px;
      width: min(390px, calc(var(--box-width) - 20px));
      max-height: min(72vh, calc(var(--box-height) - 120px));
      overflow-y: auto;
      background: rgba(6, 8, 20, 0.95);
      border: 1px solid rgba(255, 180, 0, 0.35);
      border-radius: 14px;
      padding: 12px;
      box-shadow: 0 18px 36px rgba(0, 0, 0, 0.5);
    }

    .qa-debug-panel.active {
      pointer-events: auto;
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .qa-debug-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .qa-debug-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 0.85rem;
      color: #ffcf47;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .qa-debug-close {
      border: 1px solid rgba(255, 255, 255, 0.25);
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.85);
      border-radius: 8px;
      font-size: 0.72rem;
      padding: 4px 8px;
    }

    .qa-debug-status {
      font-size: 0.66rem;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 10px;
      line-height: 1.35;
    }

    .qa-debug-section {
      margin-bottom: 10px;
    }

    .qa-debug-section-title {
      margin: 0 0 6px;
      font-family: 'Orbitron', sans-serif;
      font-size: 0.66rem;
      color: rgba(255, 214, 110, 0.86);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .qa-debug-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }

    .qa-debug-btn {
      border: 1px solid rgba(0, 240, 255, 0.45);
      background: rgba(0, 240, 255, 0.08);
      color: #86f4ff;
      border-radius: 8px;
      padding: 7px 8px;
      font-size: 0.68rem;
      font-family: 'Orbitron', sans-serif;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      text-align: center;
    }

    @media (pointer: coarse) {
      .qa-debug-root {
        left: calc(var(--box-left) + var(--hud-side-gap) + 58px);
        top: calc(var(--box-top) + var(--hud-top-pad));
      }

      .qa-debug-toggle {
        width: 56px;
        height: 38px;
      }

      .qa-debug-lab-toggle {
        width: 56px;
        height: 38px;
      }

      .qa-debug-panel {
        width: min(420px, calc(var(--box-width) - 16px));
        max-height: min(68vh, calc(var(--box-height) - 90px));
      }

      .qa-debug-btn {
        padding: 9px 8px;
      }
    }

    @media (pointer: coarse) and (orientation: portrait) {
      .qa-debug-root {
        left: calc(var(--box-left) + 8px + var(--hud-side-gap));
        top: calc(var(--box-top) + 8px);
      }

      .qa-debug-toggle-row {
        gap: 10px;
      }

      .qa-debug-toggle,
      .qa-debug-lab-toggle {
        width: 64px;
        height: 44px;
        border-radius: 12px;
        font-size: 0.8rem;
      }

      .qa-debug-panel {
        margin-top: 10px;
        width: min(500px, calc(100vw - 16px), calc(var(--box-width) - 12px));
        max-height: min(70vh, calc(var(--box-height) - 80px));
        padding: 12px;
      }

      .qa-debug-grid {
        grid-template-columns: 1fr;
      }

      .qa-debug-btn {
        min-height: 40px;
        font-size: 0.72rem;
      }
    }
  `;
  document.head.appendChild(style);
}

function openPanel(panel: HTMLElement, toggle: HTMLButtonElement): void {
  panel.classList.add("active");
  panel.removeAttribute("inert");
  panel.setAttribute("aria-hidden", "false");
  toggle.setAttribute("aria-expanded", "true");
}

function closePanel(
  panel: HTMLElement,
  toggle: HTMLButtonElement | null,
): void {
  const active = document.activeElement as HTMLElement | null;
  if (active && panel.contains(active)) {
    if (toggle) {
      toggle.focus();
    } else {
      active.blur();
    }
  }
  panel.classList.remove("active");
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("inert", "");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
  }
}
