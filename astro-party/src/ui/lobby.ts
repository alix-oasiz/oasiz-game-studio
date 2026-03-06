import { Game } from "../Game";
import { BaseGameMode, GameMode, MapId, PlayerData, Ruleset } from "../types";
import { elements } from "./elements";
import { getMapDefinition, isMapAllowedForRuleset } from "../../shared/sim/maps.js";
import { renderMapPreviewOnCanvas } from "./mapPreview";
import { escapeHtml } from "./text";
import { createUIFeedback } from "../feedback/uiFeedback";
import { isPlatformRuntime } from "../platform/oasizBridge";

export interface LobbyUI {
  updateLobbyUI: (players: PlayerData[]) => void;
  setModeUI: (mode: GameMode, source?: "local" | "remote") => void;
  setRulesetUI: (ruleset: Ruleset, source?: "local" | "remote") => void;
  updateRoomCode: (code: string) => void;
  setMapUI: (mapId: MapId, source?: "local" | "remote") => void;
  updateMapSelector: () => void;
  closeMapPicker: () => void;
}

export function createLobbyUI(game: Game, isMobile: boolean): LobbyUI {
  const feedback = createUIFeedback("lobby");
  const HOST_ONLY_ACTION_MESSAGE = "Only the room leader can do that";
  let addingBot = false;
  let addButtonGuardUntilMs = 0;
  let startButtonGuardUntilMs = 0;
  let modeCycleGuardUntilMs = 0;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const kickButtonGuardUntilByPlayer = new Map<string, number>();
  const ADD_BUTTON_TAP_GUARD_MS = 450;
  const START_BUTTON_TAP_GUARD_MS = 650;
  const KICK_BUTTON_TAP_GUARD_MS = 450;
  const MODE_CYCLE_TAP_GUARD_MS = 340;
  const MAP_PICKER_ORDER: MapId[] = [0, 5, 1, 2, 3, 4];
  const MODE_CYCLE_ORDER: BaseGameMode[] = ["STANDARD", "SANE", "CHAOTIC"];
  const RULESET_CYCLE_ORDER: Ruleset[] = [
    "ROUND_ELIMINATION",
    "ENDLESS_RESPAWN",
  ];
  const mapPickerCards = new Map<MapId, HTMLButtonElement>();
  const isPlatform = isPlatformRuntime();

  const SLOTS = ["P1", "P2", "P3", "P4"];
  const BADGE_ICO = {
    you: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>',
    ai: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5 2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5z"/></svg>',
    local: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 9h10a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-1.2l-2-2H10.2l-2 2H7a4 4 0 0 1-4-4v-2a4 4 0 0 1 4-4zm1 2v2h2v-2H8zm6 0v2h2v-2h-2z"/></svg>',
    online: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4a8 8 0 0 1 8 8h2c0-5.52-4.48-10-10-10S2 6.48 2 12h2a8 8 0 0 1 8-8zm0 4a4 4 0 0 1 4 4h2a6 6 0 0 0-12 0h2a4 4 0 0 1 4-4zm0 6a2 2 0 0 1 2 2h2a4 4 0 0 0-8 0h2a2 2 0 0 1 2-2z"/></svg>',
  };
  const BADGE_CLS = { you: "", ai: "tb--ai", local: "tb--local", online: "tb--online" };
  const BADGE_LBL = { you: "You", ai: "AI Bot", local: "Local", online: "Online" };
  const PLAYER_ROLE = {
    you: "Room Leader",
    ai: "AI Opponent",
    local: "Local Player",
    online: "Remote Player",
  };

  function hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
  }

  function shipSVG(color: string): string {
    return `<svg class="card-ship-svg" viewBox="0 0 72 90" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="36" cy="86" rx="11" ry="4.5" fill="${color}" opacity="0.18"/>
      <polygon points="36,4 52,72 36,60 20,72" fill="${color}" opacity="0.9"/>
      <polygon points="36,16 48,68 36,58 24,68" fill="rgba(255,255,255,0.12)"/>
      <polygon points="36,4 20,72 8,60" fill="${color}" opacity="0.55"/>
      <polygon points="36,4 52,72 64,60" fill="${color}" opacity="0.55"/>
      <circle cx="36" cy="32" r="5" fill="rgba(255,255,255,0.55)"/>
    </svg>`;
  }

  function beginAddButtonAction(): boolean {
    const now = performance.now();
    if (addingBot || now < addButtonGuardUntilMs) {
      return false;
    }
    addingBot = true;
    addButtonGuardUntilMs = now + ADD_BUTTON_TAP_GUARD_MS;
    return true;
  }

  function endAddButtonAction(): void {
    addingBot = false;
  }

  function showHostOnlyActionToast(): void {
    feedback.error();
    game.showSystemMessage(HOST_ONLY_ACTION_MESSAGE, 2500);
  }

  function setHostLocked(element: HTMLElement, locked: boolean): void {
    element.classList.toggle("host-locked", locked);
    element.setAttribute("aria-disabled", locked ? "true" : "false");
  }

  function updateRoomCodeVisibility(): void {
    const roomContainer = elements.roomCodeDisplay.closest(
      ".room-tag",
    ) as HTMLElement | null;
    if (!roomContainer) return;
    const isLocal = game.getSessionMode() === "local";
    roomContainer.style.display = isLocal || isPlatform ? "none" : "flex";
  }

  function updateRoomCode(code: string): void {
    updateRoomCodeVisibility();
    if (game.getSessionMode() === "local" || isPlatform) {
      elements.roomCodeDisplay.textContent = "----";
      return;
    }
    elements.roomCodeDisplay.textContent = code;
  }

  function updateBotControlsVisibility(
    playerCount: number,
    isLeader: boolean,
  ): void {
    if (playerCount >= 4) {
      elements.addBotSection.classList.add("hidden");
      return;
    }

    elements.addBotSection.classList.remove("hidden");
    elements.addAIBotBtn.disabled = false;
    setHostLocked(elements.addAIBotBtn, !isLeader);
    elements.addAIBotBtn.title = isLeader
      ? "Add AI Bot"
      : "Only the room leader can add AI bots";

    const hasRemote = game.hasRemotePlayers();
    const supportsLocalPlayers = game.supportsLocalPlayers();
    const canShowLocal = supportsLocalPlayers && !hasRemote;
    elements.addLocalPlayerBtn.style.display = canShowLocal ? "flex" : "none";
    elements.addLocalPlayerBtn.disabled = !supportsLocalPlayers;
    setHostLocked(elements.addLocalPlayerBtn, supportsLocalPlayers && !isLeader);
    if (!supportsLocalPlayers) {
      elements.addLocalPlayerBtn.title = "Local players are deferred in this version";
      return;
    }
    elements.addLocalPlayerBtn.title = isLeader
      ? "Add Local Player (same keyboard)"
      : "Only the room leader can add local players";
  }

  function updateLaunchStatus(playerCount: number, isLeader: boolean): void {
    const dot = document.getElementById("lobbyStatusDot");
    const txt = elements.lobbyStatus;
    const hasEnough = playerCount >= 2;
    if (dot) dot.className = hasEnough ? "lstatus-dot" : "lstatus-dot warn";
    if (!hasEnough) {
      txt.textContent = "Need at least 2 players";
    } else if (isLeader) {
      txt.textContent = "Ready to launch";
    } else {
      txt.textContent = "Waiting for host\u2026";
    }
  }

  function updateLobbyUI(players: PlayerData[]): void {
    const myPlayerId = game.getMyPlayerId();
    const isLeader = game.isLeader();
    const leaderId = game.getLeaderId();

    const crownSVG =
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 19h14l1-9-4.5 3.5L12 6 8.5 13.5 4 10l1 9z"/></svg>';

    let html = "";
    for (let i = 0; i < 4; i++) {
      if (i < players.length) {
        const player = players[i];
        const color = player.color.primary;
        const rgb = hexToRgb(color);
        const isSelf = player.id === myPlayerId;
        const isLeaderPlayer = leaderId ? player.id === leaderId : false;
        const canAct = isLeader && !isSelf;
        const botType = game.getPlayerBotType(player.id);

        let type: "you" | "ai" | "local" | "online";
        if (isSelf) type = "you";
        else if (botType === "ai") type = "ai";
        else if (botType === "local") type = "local";
        else type = "online";

        const tbStyle =
          type === "you"
            ? `style="background:rgba(${rgb},0.14);border:1px solid rgba(${rgb},0.3);color:${color}"`
            : "";

        let actionBtn = "";
        if (canAct) {
          const action =
            botType === "ai" || botType === "local" ? "remove" : "kick";
          const label =
            botType === "ai" || botType === "local" ? "Remove" : "Kick";
          actionBtn = `<button class="card-act" data-action="${action}" data-player-id="${player.id}">${label}</button>`;
        }

        html += `<div class="pcard pcard--filled" style="--pc:${color};--pc-rgb:${rgb}">
          <div class="card-glow"></div>
          <div class="card-slot">${SLOTS[i]}</div>
          <div class="card-type">
            <span class="type-badge ${BADGE_CLS[type]}" ${tbStyle}>${BADGE_ICO[type]}${BADGE_LBL[type]}</span>
          </div>
          <div class="card-scene">
            <div class="card-viewport">
              <div class="viewport-ring"></div>
              <div class="viewport-inner">${shipSVG(color)}</div>
            </div>
          </div>
          <div class="card-info">
            <div class="card-name">${escapeHtml(player.name)}</div>
            <div class="card-role">${PLAYER_ROLE[type]}</div>
            <div class="card-footer">
              ${isLeaderPlayer ? `<span class="host-pip">${crownSVG}Host</span>` : "<span></span>"}
              ${actionBtn}
            </div>
          </div>
        </div>`;
      } else {
        const canAdd = isLeader;
        const plusCircleSVGFill =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>';
        html += `<div class="pcard pcard--empty">
          <div class="card-scene">
            <div class="empty-content">
              <div class="empty-icon">${plusCircleSVGFill}</div>
              <div class="empty-label">${SLOTS[i]} \u2014 Empty</div>
              <div class="empty-btns">
                <button class="empty-btn" data-action="add-ai" ${canAdd ? "" : "disabled"}>+ Add AI</button>
                <button class="empty-btn" data-action="add-local" ${canAdd ? "" : "disabled"}>+ Local</button>
              </div>
            </div>
          </div>
        </div>`;
      }
    }

    elements.playersList.innerHTML = html;

    const hasEnoughPlayers = players.length >= 2;
    elements.startGameBtn.disabled = !hasEnoughPlayers || !isLeader;
    setHostLocked(elements.startGameBtn, isLeader ? false : hasEnoughPlayers);
    elements.startGameBtn.title = isLeader
      ? "Start match"
      : "Only the room leader can start the match";

    updateLaunchStatus(players.length, isLeader);
    updateBotControlsVisibility(players.length, isLeader);

    elements.gameModeSection.classList.toggle("readonly", !isLeader);
    elements.modeCycleBtn.disabled = false;
    elements.rulesetCycleBtn.disabled = false;
    elements.advancedSettingsBtn.disabled = false;
    setHostLocked(elements.modeCycleBtn, !isLeader);
    setHostLocked(elements.rulesetCycleBtn, !isLeader);
    setHostLocked(elements.advancedSettingsBtn, !isLeader);
    elements.advancedSettingsBtn.title = isLeader
      ? "Open advanced settings"
      : "Only the room leader can edit advanced settings";

    updateRoomCodeVisibility();
    setRulesetUI(game.getRuleset(), "remote");
    updateMapSelector();
  }

  // Card tray event delegation — set up ONCE at init
  elements.playersList.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest(
      "[data-action]",
    ) as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    e.stopPropagation();
    const action = btn.dataset.action;
    const playerId = btn.dataset.playerId;

    if (action === "add-ai") {
      elements.addAIBotBtn.click();
    } else if (action === "add-local") {
      elements.addLocalPlayerBtn.click();
    } else if ((action === "remove" || action === "kick") && playerId) {
      if (!game.isLeader()) {
        showHostOnlyActionToast();
        return;
      }
      if (isCoarsePointer) {
        const now = performance.now();
        const guardUntil = kickButtonGuardUntilByPlayer.get(playerId) ?? 0;
        if (now < guardUntil) return;
        kickButtonGuardUntilByPlayer.set(playerId, now + KICK_BUTTON_TAP_GUARD_MS);
      }
      feedback.button();
      btn.disabled = true;
      try {
        if (action === "remove") await game.removeBot(playerId);
        else await game.kickPlayer(playerId);
      } catch (err) {
        console.error("[Lobby] Action failed:", err);
      }
      btn.disabled = false;
    }
  });

  function showKeySelectModal(): void {
    elements.keySelectModal.classList.add("active");
    elements.keySelectBackdrop.classList.add("active");

    const usedSlots = game.getUsedKeySlots();
    const options = elements.keyOptions.querySelectorAll(".key-option");
    options.forEach((option) => {
      const slot = Number.parseInt((option as HTMLElement).dataset.slot || "0");
      (option as HTMLButtonElement).disabled = usedSlots.includes(slot);
    });
  }

  function hideKeySelectModal(): void {
    elements.keySelectModal.classList.remove("active");
    elements.keySelectBackdrop.classList.remove("active");
  }

  function setModeUI(
    mode: GameMode,
    source: "local" | "remote" = "local",
  ): void {
    elements.modeCycleValue.textContent = mode;
    elements.modeCycleBtn.classList.toggle("is-custom", mode === "CUSTOM");
    elements.modeCycleBtn.setAttribute("data-mode", mode);
    if (source === "local") {
      game.setGameMode(mode, "local");
    }
  }

  function labelRuleset(ruleset: Ruleset): string {
    return ruleset === "ENDLESS_RESPAWN" ? "ENDLESS" : "ROUND";
  }

  function setRulesetUI(
    ruleset: Ruleset,
    source: "local" | "remote" = "local",
  ): void {
    elements.rulesetCycleValue.textContent = labelRuleset(ruleset);
    elements.rulesetCycleBtn.setAttribute("data-ruleset", ruleset);
    if (source === "local") {
      game.setRuleset(ruleset, "local");
    }
    updateMapSelector();
  }

  function mapBehaviorLabel(mapId: MapId): string {
    if (mapId === 0) {
      return game.getRuleset() === "ENDLESS_RESPAWN"
        ? "Rotates endless-compatible maps"
        : "Rotates each round";
    }
    return "Fixed for this match";
  }

  function closeMapPicker(): void {
    elements.mapPickerModal.classList.remove("active");
    elements.mapPickerBackdrop.classList.remove("active");
  }

  function renderMapPickerPreviews(): void {
    for (const [mapId, card] of mapPickerCards) {
      const canvas = card.querySelector("canvas");
      if (!canvas) continue;
      renderMapPreviewOnCanvas(canvas as HTMLCanvasElement, mapId);
    }
  }

  function ensureMapPickerCards(): void {
    if (mapPickerCards.size > 0) return;
    elements.mapPickerGrid.innerHTML = "";

    for (const mapId of MAP_PICKER_ORDER) {
      const map = getMapDefinition(mapId);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "map-picker-card";
      card.dataset.mapId = mapId.toString();

      const preview = document.createElement("canvas");
      preview.className = "map-picker-canvas";
      preview.width = 120;
      preview.height = 84;

      const meta = document.createElement("div");
      meta.className = "map-picker-meta";

      const name = document.createElement("div");
      name.className = "map-picker-name";
      name.textContent = map.name;

      const desc = document.createElement("div");
      desc.className = "map-picker-desc";
      desc.textContent = map.description;

      const badge = document.createElement("span");
      badge.className = "map-picker-badge";
      if (mapId === 0) {
        badge.classList.add("rotation");
        badge.textContent = "Rotation";
      } else {
        badge.textContent = "Fixed";
      }

      meta.appendChild(name);
      meta.appendChild(desc);
      meta.appendChild(badge);
      card.appendChild(preview);
      card.appendChild(meta);

      card.addEventListener("click", () => {
        if (!game.isLeader()) {
          showHostOnlyActionToast();
          return;
        }
        feedback.button();
        setMapUI(mapId, "local");
        closeMapPicker();
      });

      mapPickerCards.set(mapId, card);
      elements.mapPickerGrid.appendChild(card);
    }
  }

  function updateMapPickerState(selectedMapId: MapId): void {
    const isLeader = game.isLeader();
    const ruleset = game.getRuleset();
    for (const [mapId, card] of mapPickerCards) {
      const allowed = isMapAllowedForRuleset(mapId, ruleset);
      card.classList.toggle("active", mapId === selectedMapId);
      card.classList.toggle("disabled", !allowed);
      card.disabled = !allowed;
      card.title = allowed ? "" : "Unavailable for selected ruleset";
      setHostLocked(card, !isLeader);
    }
  }

  function updateMapSummary(selectedMapId: MapId): void {
    const map = getMapDefinition(selectedMapId);
    elements.mapCurrentName.textContent = map.name;
    elements.mapCurrentDesc.textContent = map.description;
    elements.mapCurrentBehavior.textContent = mapBehaviorLabel(selectedMapId);
    renderMapPreviewOnCanvas(elements.mapPreviewCanvas, selectedMapId);
  }

  function setMapUI(mapId: MapId, source: "local" | "remote" = "local"): void {
    if (source === "local") {
      game.setMap(mapId, "local");
      return;
    }
    updateMapSummary(mapId);
    updateMapPickerState(mapId);
  }

  function updateMapSelector(): void {
    const lobbyIsLeader = game.isLeader();
    const selectedMapId = game.getMapId();
    elements.mapSelectorSection.classList.toggle("hidden", false);
    elements.mapSelectorSection.classList.toggle("readonly", !lobbyIsLeader);
    elements.openMapPickerBtn.disabled = false;
    setHostLocked(elements.openMapPickerBtn, !lobbyIsLeader);
    elements.openMapPickerBtn.title = lobbyIsLeader
      ? "Change arena"
      : "Only the room leader can change the arena";
    ensureMapPickerCards();
    setMapUI(selectedMapId, "remote");
  }

  elements.copyCodeBtn.addEventListener("click", () => {
    if (game.getSessionMode() === "local" || isPlatform) return;
    const code = game.getRoomCode();
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      feedback.error();
      console.error("[Lobby] Clipboard API unavailable");
      return;
    }
    void navigator.clipboard.writeText(code)
      .then(() => {
        feedback.subtle();
        elements.copyCodeBtn.innerHTML =
          '<svg viewBox="0 0 24 24"><path fill="#22c55e" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        setTimeout(() => {
          elements.copyCodeBtn.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        }, 2000);
      })
      .catch((err: unknown) => {
        feedback.error();
        console.error("[Lobby] Failed to copy room code:", err);
      });
  });

  elements.addAIBotBtn.addEventListener("click", async () => {
    if (!game.isLeader()) {
      showHostOnlyActionToast();
      return;
    }
    if (!beginAddButtonAction()) return;
    feedback.button();
    elements.addAIBotBtn.disabled = true;

    try {
      await game.addAIBot();
    } catch (e) {
      console.error("[Main] Failed to add AI bot:", e);
    } finally {
      elements.addAIBotBtn.disabled = false;
      endAddButtonAction();
    }
  });

  elements.addLocalPlayerBtn.addEventListener("click", async () => {
    if (!game.isLeader()) {
      showHostOnlyActionToast();
      return;
    }
    if (!game.supportsLocalPlayers()) {
      return;
    }
    if (!beginAddButtonAction()) return;
    elements.addLocalPlayerBtn.disabled = true;
    feedback.button();

    try {
      if (isMobile) {
        const usedSlots = game.getUsedKeySlots();
        let nextSlot = -1;
        for (let i = 1; i < 4; i++) {
          if (!usedSlots.includes(i)) {
            nextSlot = i;
            break;
          }
        }
        if (nextSlot >= 0) {
          await game.addLocalBot(nextSlot);
        }
      } else {
        showKeySelectModal();
      }
    } catch (e) {
      console.error("[Main] Failed to add local player:", e);
    } finally {
      elements.addLocalPlayerBtn.disabled = false;
      endAddButtonAction();
    }
  });

  elements.keySelectBackdrop.addEventListener("click", hideKeySelectModal);
  elements.keySelectCancel.addEventListener("click", () => {
    feedback.subtle();
    hideKeySelectModal();
  });

  elements.keyOptions.addEventListener("click", async (e) => {
    const option = (e.target as HTMLElement).closest(
      ".key-option",
    ) as HTMLButtonElement;
    if (!option || option.disabled || addingBot) return;

    addingBot = true;
    feedback.button();
    hideKeySelectModal();

    const slot = Number.parseInt(option.dataset.slot || "1");
    try {
      await game.addLocalBot(slot);
    } catch (e) {
      console.error("[Main] Failed to add local player:", e);
    }
    addingBot = false;
  });

  elements.startGameBtn.addEventListener("click", () => {
    const now = performance.now();
    if (now < startButtonGuardUntilMs) {
      return;
    }
    startButtonGuardUntilMs = now + START_BUTTON_TAP_GUARD_MS;
    const hasEnoughPlayers = game.getPlayerCount() >= 2;
    if (!game.isLeader()) {
      showHostOnlyActionToast();
      return;
    }
    if (!hasEnoughPlayers) return;
    feedback.confirm();
    game.startGame();
  });

  elements.modeCycleBtn.addEventListener("click", () => {
    if (isCoarsePointer) {
      const now = performance.now();
      if (now < modeCycleGuardUntilMs) {
        return;
      }
      modeCycleGuardUntilMs = now + MODE_CYCLE_TAP_GUARD_MS;
    }
    if (!game.isLeader()) {
      showHostOnlyActionToast();
      return;
    }
    feedback.button();
    const mode = game.getGameMode();
    const anchorMode: BaseGameMode =
      mode === "CUSTOM" ? game.getBaseMode() : mode;
    const currentIndex = MODE_CYCLE_ORDER.indexOf(anchorMode);
    const nextMode =
      MODE_CYCLE_ORDER[(currentIndex + 1) % MODE_CYCLE_ORDER.length];
    setModeUI(nextMode);
  });

  elements.rulesetCycleBtn.addEventListener("click", () => {
    if (isCoarsePointer) {
      const now = performance.now();
      if (now < modeCycleGuardUntilMs) {
        return;
      }
      modeCycleGuardUntilMs = now + MODE_CYCLE_TAP_GUARD_MS;
    }
    if (!game.isLeader()) {
      showHostOnlyActionToast();
      return;
    }
    feedback.button();
    const ruleset = game.getRuleset();
    const currentIndex = RULESET_CYCLE_ORDER.indexOf(ruleset);
    const nextRuleset =
      RULESET_CYCLE_ORDER[(currentIndex + 1) % RULESET_CYCLE_ORDER.length];
    setRulesetUI(nextRuleset, "local");
  });

  elements.openMapPickerBtn.addEventListener("click", () => {
    if (!game.isLeader()) {
      showHostOnlyActionToast();
      return;
    }
    feedback.button();
    ensureMapPickerCards();
    updateMapPickerState(game.getMapId());
    renderMapPickerPreviews();
    elements.mapPickerModal.classList.add("active");
    elements.mapPickerBackdrop.classList.add("active");
  });

  elements.mapPickerClose.addEventListener("click", () => {
    feedback.subtle();
    closeMapPicker();
  });

  elements.mapPickerBackdrop.addEventListener("click", closeMapPicker);

  window.addEventListener("resize", () => {
    if (!elements.mapPickerModal.classList.contains("active")) return;
    renderMapPickerPreviews();
  });

  elements.leaveLobbyBtn.addEventListener("click", async () => {
    feedback.subtle();
    closeMapPicker();
    elements.leaveLobbyBtn.disabled = true;
    await game.leaveGame();
    elements.leaveLobbyBtn.disabled = false;
  });

  return {
    updateLobbyUI,
    setModeUI,
    setRulesetUI,
    setMapUI,
    updateMapSelector,
    updateRoomCode,
    closeMapPicker,
  };
}
