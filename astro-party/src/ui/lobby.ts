import { Game } from "../Game";
import { GameMode, MapId, PlayerData } from "../types";
import { AudioManager } from "../AudioManager";
import { triggerHaptic } from "./haptics";
import { elements } from "./elements";
import { escapeHtml } from "./text";

export interface LobbyUI {
  updateLobbyUI: (players: PlayerData[]) => void;
  setModeUI: (mode: GameMode, source?: "local" | "remote") => void;
  updateRoomCode: (code: string) => void;
  setMapUI: (mapId: MapId, source?: "local" | "remote") => void;
  updateMapSelector: () => void;
}

export function createLobbyUI(game: Game, isMobile: boolean): LobbyUI {
  let addingBot = false;
  let addButtonGuardUntilMs = 0;
  const ADD_BUTTON_TAP_GUARD_MS = 450;

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
    if (!isLeader) {
      elements.addBotSection.classList.add("hidden");
      return;
    }

    if (playerCount < 4) {
      elements.addBotSection.classList.remove("hidden");
      elements.addAIBotBtn.disabled = false;

      const hasRemote = game.hasRemotePlayers();
      const supportsLocalPlayers = game.supportsLocalPlayers();
      const canShowLocal = supportsLocalPlayers && !hasRemote;
      elements.addLocalPlayerBtn.style.display = canShowLocal ? "flex" : "none";
      elements.addLocalPlayerBtn.disabled = !supportsLocalPlayers;
      elements.addLocalPlayerBtn.title = supportsLocalPlayers
        ? "Add Local Player (same keyboard)"
        : "Local players are deferred in this version";
    } else {
      elements.addBotSection.classList.add("hidden");
    }
  }

  function attachRemoveBotHandlers(): void {
    const removeButtons = document.querySelectorAll(".remove-bot-btn");
    removeButtons.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const playerId = (btn as HTMLElement).dataset.playerId;
        if (playerId) {
          triggerHaptic("light");
          AudioManager.playUIClick();
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
        const playerId = (btn as HTMLElement).dataset.playerId;
        if (!playerId) return;
        triggerHaptic("light");
        AudioManager.playUIClick();
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
    elements.lobbyScreen.classList.toggle("is-host", isLeader);

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

      const kickButton =
        isLeader && !isSelf
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

    const canStart = game.canStartGame();

    if (isLeader) {
      elements.startGameBtn.style.display = "block";
      elements.startGameBtn.disabled = !canStart;
      if (canStart) {
        elements.lobbyStatus.innerHTML = "Ready to start!";
      } else {
        elements.lobbyStatus.innerHTML =
          'Need at least 2 players<span class="waiting-dots"><span class="waiting-dot"></span><span class="waiting-dot"></span><span class="waiting-dot"></span></span>';
      }
    } else {
      elements.startGameBtn.style.display = "none";
      elements.lobbyStatus.innerHTML =
        'Waiting for leader to start<span class="waiting-dots"><span class="waiting-dot"></span><span class="waiting-dot"></span><span class="waiting-dot"></span></span>';
    }

    updateBotControlsVisibility(players.length, isLeader);
    elements.gameModeSection.classList.toggle("hidden", false);
    elements.gameModeSection.classList.toggle("readonly", !isLeader);
    elements.modeStandard.disabled = !isLeader;
    elements.modeChaotic.disabled = !isLeader;
    elements.modeSane.disabled = !isLeader;
    elements.modeCustom.disabled = true;
    elements.advancedSettingsBtn.style.display = isLeader ? "block" : "none";
    elements.advancedSettingsBtn.disabled = !isLeader;
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
    elements.modeStandard.classList.toggle("active", mode === "STANDARD");
    elements.modeChaotic.classList.toggle("active", mode === "CHAOTIC");
    elements.modeSane.classList.toggle("active", mode === "SANE");
    elements.modeCustom.classList.toggle("active", mode === "CUSTOM");
    if (source === "local") {
      game.setGameMode(mode, "local");
    }
  }

  function setMapUI(
    mapId: MapId,
    source: "local" | "remote" = "local",
  ): void {
    elements.mapBtn0.classList.toggle("active", mapId === 0);
    elements.mapBtn1.classList.toggle("active", mapId === 1);
    elements.mapBtn2.classList.toggle("active", mapId === 2);
    elements.mapBtn3.classList.toggle("active", mapId === 3);
    elements.mapBtn4.classList.toggle("active", mapId === 4);
    if (source === "local") {
      game.setMap(mapId, "local");
    }
  }

  function updateMapSelector(): void {
    const lobbyIsLeader = game.isLeader();
    elements.mapSelectorSection.classList.toggle("hidden", false);
    elements.mapSelectorSection.classList.toggle("readonly", !lobbyIsLeader);
    elements.mapBtn0.disabled = !lobbyIsLeader;
    elements.mapBtn1.disabled = !lobbyIsLeader;
    elements.mapBtn2.disabled = !lobbyIsLeader;
    elements.mapBtn3.disabled = !lobbyIsLeader;
    elements.mapBtn4.disabled = !lobbyIsLeader;
    setMapUI(game.getMapId(), "remote");
  }

  elements.copyCodeBtn.addEventListener("click", () => {
    if (game.getSessionMode() === "local") return;
    const code = game.getRoomCode();
    navigator.clipboard.writeText(code).then(() => {
      triggerHaptic("light");
      elements.copyCodeBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path fill="#22c55e" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
      setTimeout(() => {
        elements.copyCodeBtn.innerHTML =
          '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
      }, 2000);
    });
  });

  elements.addAIBotBtn.addEventListener("click", async () => {
    if (!beginAddButtonAction()) return;
    triggerHaptic("light");
    AudioManager.playUIClick();
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
    if (!game.supportsLocalPlayers()) {
      return;
    }
    if (!beginAddButtonAction()) return;
    elements.addLocalPlayerBtn.disabled = true;
    triggerHaptic("light");
    AudioManager.playUIClick();

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
    triggerHaptic("light");
    hideKeySelectModal();
  });

  elements.keyOptions.addEventListener("click", async (e) => {
    const option = (e.target as HTMLElement).closest(
      ".key-option",
    ) as HTMLButtonElement;
    if (!option || option.disabled || addingBot) return;

    addingBot = true;
    triggerHaptic("light");
    AudioManager.playUIClick();
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
    if (!game.canStartGame()) return;
    triggerHaptic("medium");
    game.startGame();
  });

  elements.modeStandard.addEventListener("click", () => {
    triggerHaptic("light");
    setModeUI("STANDARD");
  });

  elements.modeChaotic.addEventListener("click", () => {
    triggerHaptic("light");
    setModeUI("CHAOTIC");
  });

  elements.modeSane.addEventListener("click", () => {
    triggerHaptic("light");
    setModeUI("SANE");
  });

  function handleMapButtonClick(mapId: MapId): void {
    triggerHaptic("light");
    setMapUI(mapId, "local");
  }

  elements.mapBtn0.addEventListener("click", () => {
    handleMapButtonClick(0);
  });

  elements.mapBtn1.addEventListener("click", () => {
    handleMapButtonClick(1);
  });

  elements.mapBtn2.addEventListener("click", () => {
    handleMapButtonClick(2);
  });

  elements.mapBtn3.addEventListener("click", () => {
    handleMapButtonClick(3);
  });

  elements.mapBtn4.addEventListener("click", () => {
    handleMapButtonClick(4);
  });

  elements.leaveLobbyBtn.addEventListener("click", async () => {
    triggerHaptic("light");
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
  };
}
