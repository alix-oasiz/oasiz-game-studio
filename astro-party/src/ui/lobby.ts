import { Game } from "../Game";
import { BaseGameMode, GameMode, MapId, PlayerData } from "../types";
import { elements } from "./elements";
import { getMapDefinition } from "../../shared/sim/maps.js";
import { renderMapPreviewOnCanvas } from "./mapPreview";
import { escapeHtml } from "./text";
import { createUIFeedback } from "../feedback/uiFeedback";

export interface LobbyUI {
  updateLobbyUI: (players: PlayerData[]) => void;
  setModeUI: (mode: GameMode, source?: "local" | "remote") => void;
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
  const mapPickerCards = new Map<MapId, HTMLButtonElement>();

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
      ".lobby-room",
    ) as HTMLElement | null;
    if (!roomContainer) return;
    const isLocal = game.getSessionMode() === "local";
    roomContainer.style.display = isLocal ? "none" : "flex";
  }

  function updateRoomCode(code: string): void {
    updateRoomCodeVisibility();
    if (game.getSessionMode() === "local") {
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

  function attachRemoveBotHandlers(): void {
    const removeButtons = document.querySelectorAll(".remove-bot-btn");
    removeButtons.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const playerId = (btn as HTMLElement).dataset.playerId;
        if (playerId) {
          feedback.button();
          await game.removeBot(playerId);
        }
      });
    });
  }

  function attachKickHandlers(): void {
    const kickButtons = document.querySelectorAll(".player-kick");
    kickButtons.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!game.isLeader()) {
          showHostOnlyActionToast();
          return;
        }
        const playerId = (btn as HTMLElement).dataset.playerId;
        if (!playerId) return;
        if (isCoarsePointer) {
          const now = performance.now();
          const guardUntil = kickButtonGuardUntilByPlayer.get(playerId) ?? 0;
          if (now < guardUntil) {
            return;
          }
          kickButtonGuardUntilByPlayer.set(
            playerId,
            now + KICK_BUTTON_TAP_GUARD_MS,
          );
        }
        feedback.button();
        (btn as HTMLButtonElement).disabled = true;
        try {
          await game.kickPlayer(playerId);
        } catch (err) {
          console.error("[Main] Failed to kick player:", err);
        }
        (btn as HTMLButtonElement).disabled = false;
      });
    });
  }

  function updateLobbyUI(players: PlayerData[]): void {
    const myPlayerId = game.getMyPlayerId();
    const isLeader = game.isLeader();
    const leaderId = game.getLeaderId();

    const shipIcon = (color: string) =>
      '<svg viewBox="0 0 24 24" fill="' +
      color +
      '"><path d="M12 2L4 12l3 1.5L12 22l5-8.5L20 12z"/></svg>';
    const crownIcon =
      '<svg viewBox="0 0 24 24"><path d="M5 19h14l1-9-4.5 3.5L12 6 8.5 13.5 4 10l1 9z"/></svg>';
    const botIcon =
      '<svg viewBox="0 0 24 24"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5 2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5z"/></svg>';
    const localIcon =
      '<svg viewBox="0 0 24 24"><path d="M7 9h10a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-1.2l-2-2H10.2l-2 2H7a4 4 0 0 1-4-4v-2a4 4 0 0 1 4-4zm1 2v2h2v-2H8zm6 0v2h2v-2h-2z"/></svg>';
    const remoteIcon =
      '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 1 8 8h2c0-5.52-4.48-10-10-10S2 6.48 2 12h2a8 8 0 0 1 8-8zm0 4a4 4 0 0 1 4 4h2a6 6 0 0 0-12 0h2a4 4 0 0 1 4-4zm0 6a2 2 0 0 1 2 2h2a4 4 0 0 0-8 0h2a2 2 0 0 1 2-2z"/></svg>';
    const kickIcon =
      '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';

    const rows = players.map((player) => {
      const isLeaderPlayer = leaderId ? player.id === leaderId : false;
      const isSelf = player.id === myPlayerId;
      const nameDisplay = isSelf
        ? escapeHtml(player.name) + ' <span class="player-self">(You)</span>'
        : escapeHtml(player.name);
      const botType = game.getPlayerBotType(player.id);
      let typeBadge = "";
      if (botType === "ai") {
        typeBadge =
          '<span class="player-type ai" title="AI Bot">' + botIcon + "</span>";
      } else if (botType === "local") {
        typeBadge =
          '<span class="player-type local" title="Local Player">' +
          localIcon +
          "</span>";
      } else if (isSelf) {
        typeBadge =
          '<span class="player-type local" title="You">' +
          localIcon +
          "</span>";
      } else {
        typeBadge =
          '<span class="player-type remote" title="Online Player">' +
          remoteIcon +
          "</span>";
      }

      const kickButton = isLeader && !isSelf
        ? '<button class="player-kick" data-player-id="' +
          player.id +
          '" aria-label="Kick player">' +
          kickIcon +
          "</button>"
        : "";

      return (
        '<div class="player-row">' +
        '<div class="player-ship">' +
        shipIcon(player.color.primary) +
        "</div>" +
        '<div class="player-name" title="' +
        escapeHtml(player.name) +
        '">' +
        nameDisplay +
        "</div>" +
        '<div class="player-badges">' +
        typeBadge +
        (isLeaderPlayer
          ? '<span class="player-host">' + crownIcon + "</span>"
          : "") +
        kickButton +
        "</div>" +
        "</div>"
      );
    });

    const emptyCount = Math.max(0, 4 - players.length);
    for (let i = 0; i < emptyCount; i++) {
      rows.push(
        '<div class="player-row empty">' +
          '<div class="player-ship"></div>' +
          '<div class="player-name">Waiting for player...</div>' +
          '<div class="player-loader"></div>' +
          "</div>",
      );
    }

    elements.playersList.innerHTML = rows.join("");
    updateRoomCodeVisibility();

    const hasEnoughPlayers = players.length >= 2;

    elements.startGameBtn.style.display = "block";
    elements.startGameBtn.disabled = !hasEnoughPlayers;
    setHostLocked(elements.startGameBtn, isLeader ? false : hasEnoughPlayers);
    elements.startGameBtn.title = isLeader
      ? "Start match"
      : "Only the room leader can start the match";
    if (!hasEnoughPlayers) {
      elements.lobbyStatus.innerHTML =
        'Need at least 2 players<span class="waiting-dots"><span class="waiting-dot"></span><span class="waiting-dot"></span><span class="waiting-dot"></span></span>';
    } else if (isLeader) {
      elements.lobbyStatus.innerHTML = "Ready to start!";
    } else {
      elements.lobbyStatus.innerHTML =
        'Waiting for leader to start<span class="waiting-dots"><span class="waiting-dot"></span><span class="waiting-dot"></span><span class="waiting-dot"></span></span>';
    }

    updateBotControlsVisibility(players.length, isLeader);
    elements.gameModeSection.classList.toggle("hidden", false);
    elements.gameModeSection.classList.toggle("readonly", !isLeader);
    elements.modeCycleBtn.disabled = false;
    elements.advancedSettingsBtn.disabled = false;
    setHostLocked(elements.modeCycleBtn, !isLeader);
    setHostLocked(elements.advancedSettingsBtn, !isLeader);
    elements.advancedSettingsBtn.title = isLeader
      ? "Open advanced settings"
      : "Only the room leader can edit advanced settings";
    const actionsBox = elements.gameModeSection.closest(".lobby-actions");
    if (actionsBox) {
      actionsBox.classList.toggle("readonly", !isLeader);
    }

    updateMapSelector();

    attachRemoveBotHandlers();
    attachKickHandlers();
  }

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

  function mapBehaviorLabel(mapId: MapId): string {
    return mapId === 0 ? "Rotates each round" : "Fixed for this match";
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
    for (const [mapId, card] of mapPickerCards) {
      card.classList.toggle("active", mapId === selectedMapId);
      card.disabled = false;
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
    elements.openMapPickerBtn.textContent = "Change Map";
    elements.openMapPickerBtn.disabled = false;
    setHostLocked(elements.openMapPickerBtn, !lobbyIsLeader);
    elements.openMapPickerBtn.title = lobbyIsLeader
      ? "Change arena"
      : "Only the room leader can change the arena";
    ensureMapPickerCards();
    setMapUI(selectedMapId, "remote");
  }

  elements.copyCodeBtn.addEventListener("click", () => {
    if (game.getSessionMode() === "local") return;
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
            '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
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
    setMapUI,
    updateMapSelector,
    updateRoomCode,
    closeMapPicker,
  };
}
