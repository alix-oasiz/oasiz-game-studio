import { Game } from "../Game";
import { BaseGameMode, GameMode, MapId, PlayerData, Ruleset } from "../types";
import { elements } from "./elements";
import { getMapDefinition, isMapAllowedForRuleset } from "../../shared/sim/maps.js";
import { applySvgColorSlots } from "../../shared/geometry/EntityAssets.js";
import {
  type ShipSkinId,
  getShipSkin,
  getShipSkinOverrideForPlayer,
  resolveShipSkinIdForPlayer,
  setShipSkinOverrideForPlayer,
  SHIP_SKIN_IDS,
} from "../../shared/geometry/ShipSkins.js";
import { renderMapPreviewOnCanvas } from "./mapPreview";
import { escapeHtml } from "./text";
import { createUIFeedback } from "../feedback/uiFeedback";
import { isPlatformRuntime, openInviteModal } from "../platform/oasizBridge";
import {
  getOrCreatePreferredShipSkinId,
  setPreferredShipSkinId,
} from "../preferences/preferredShipSkin";
import type { LeaveModalContext } from "./modals";

export interface LobbyUI {
  updateLobbyUI: (players: PlayerData[]) => void;
  setModeUI: (mode: GameMode, source?: "local" | "remote") => void;
  setRulesetUI: (ruleset: Ruleset, source?: "local" | "remote") => void;
  updateRoomCode: (code: string) => void;
  setMapUI: (mapId: MapId, source?: "local" | "remote") => void;
  updateMapSelector: () => void;
  closeMapPicker: () => void;
}

export function createLobbyUI(
  game: Game,
  isMobile: boolean,
  openLeaveModal: (context?: LeaveModalContext) => void,
): LobbyUI {
  const feedback = createUIFeedback("lobby");
  const HOST_ONLY_ACTION_MESSAGE = "Only the room leader can do that";
  let addingBot = false;
  let addButtonGuardUntilMs = 0;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const phoneCardActionLayoutQuery = window.matchMedia(
    "(pointer: coarse) and (max-height: 600px)",
  );
  const tapGuardUntilByKey = new Map<string, number>();
  const ADD_BUTTON_TAP_GUARD_MS = 450;
  const TAP_GUARD_MS = 340;
  const START_BUTTON_TAP_GUARD_MS = 650;
  const MAP_PICKER_ORDER: MapId[] = [0, 5, 1, 2, 3, 4];
  const MODE_CYCLE_ORDER: BaseGameMode[] = ["STANDARD", "SANE", "CHAOTIC"];
  const RULESET_CYCLE_ORDER: Ruleset[] = [
    "ROUND_ELIMINATION",
    "ENDLESS_RESPAWN",
  ];
  const mapPickerCards = new Map<MapId, HTMLButtonElement>();
  const isPlatform = isPlatformRuntime();
  elements.leaveLobbyBtn.style.display = isPlatform ? "none" : "inline-flex";

  const SLOTS = ["P1", "P2", "P3", "P4"];
  const BADGE_ICO = {
    you: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>',
    ai: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5 2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5z"/></svg>',
    local: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 9h10a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-1.2l-2-2H10.2l-2 2H7a4 4 0 0 1-4-4v-2a4 4 0 0 1 4-4zm1 2v2h2v-2H8zm6 0v2h2v-2h-2z"/></svg>',
    online: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4a8 8 0 0 1 8 8h2c0-5.52-4.48-10-10-10S2 6.48 2 12h2a8 8 0 0 1 8-8zm0 4a4 4 0 0 1 4 4h2a6 6 0 0 0-12 0h2a4 4 0 0 1 4-4zm0 6a2 2 0 0 1 2 2h2a4 4 0 0 0-8 0h2a2 2 0 0 1 2-2z"/></svg>',
  };
  const META_ICON_CLS = {
    you: "meta-ident--you",
    ai: "meta-ident--ai",
    local: "meta-ident--local",
    online: "meta-ident--online",
  };
  const BADGE_LBL = { you: "You", ai: "AI Bot", local: "Local", online: "Online" };
  const CROWN_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 19h14l1-9-4.5 3.5L12 6 8.5 13.5 4 10l1 9z"/></svg>';
  const CYCLE_SKIN_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 13.86-5.66"/><polyline points="18 2 18 8 12 8"/><path d="M20 12a8 8 0 0 1-13.86 5.66"/><polyline points="6 22 6 16 12 16"/></svg>';
  const PLUS_CIRCLE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>';
  const SHIP_SYNC_DEBOUNCE_MS = 160;
  let pendingShipSkinSyncTimer: number | null = null;
  let pendingShipSkinSyncId: ShipSkinId | null = null;
  let preferredSkinId: ShipSkinId | null = null;
  let cardSlotEls: HTMLElement[] | null = null;

  function applyPreferredSkinToSelf(): void {
    if (!preferredSkinId) return;
    const myPlayerId = game.getMyPlayerId();
    if (!myPlayerId) return;
    setShipSkinOverrideForPlayer(myPlayerId, preferredSkinId);
  }

  function scheduleShipSkinSync(skinId: ShipSkinId): void {
    pendingShipSkinSyncId = skinId;
    if (pendingShipSkinSyncTimer !== null) {
      window.clearTimeout(pendingShipSkinSyncTimer);
      pendingShipSkinSyncTimer = null;
    }
    pendingShipSkinSyncTimer = window.setTimeout(() => {
      pendingShipSkinSyncTimer = null;
      const queuedSkin = pendingShipSkinSyncId;
      if (!queuedSkin) return;
      pendingShipSkinSyncId = null;
      game.setMyShipSkin(queuedSkin);
    }, SHIP_SYNC_DEBOUNCE_MS);
  }

  function cycleShipSkinForPlayer(playerId: string, isSelf: boolean): void {
    if (SHIP_SKIN_IDS.length <= 0) return;
    const currentSkin =
      getShipSkinOverrideForPlayer(playerId) ??
      resolveShipSkinIdForPlayer(playerId);
    const currentIndex = SHIP_SKIN_IDS.indexOf(currentSkin);
    const nextIndex =
      currentIndex >= 0 ? (currentIndex + 1) % SHIP_SKIN_IDS.length : 0;
    const nextSkinId = SHIP_SKIN_IDS[nextIndex];
    setShipSkinOverrideForPlayer(playerId, nextSkinId);
    if (isSelf) {
      preferredSkinId = nextSkinId;
      setPreferredShipSkinId(nextSkinId);
      scheduleShipSkinSync(nextSkinId);
    }
    feedback.button();
    updateLobbyUI(game.getPlayers());
  }
  preferredSkinId = getOrCreatePreferredShipSkinId();

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

  function svgDataUri(svgText: string): string {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
  }

  function shipPreviewMarkup(playerId: string, color: string): string {
    try {
      const skinId = resolveShipSkinIdForPlayer(playerId);
      const skin = getShipSkin(skinId);
      const coloredTemplate = applySvgColorSlots(skin.svgTemplate, {
        "slot-primary": color,
      });
      const imageSrc = svgDataUri(coloredTemplate);
      return '<div class="card-ship-wrap card-ship-asset" data-skin-id="' +
        skinId +
        '"><img class="card-ship-img" alt="" src="' +
        imageSrc +
        '">' +
        "</div>";
    } catch {
      return '<div class="card-ship-wrap card-ship-fallback">' + shipSVG(color) + "</div>";
    }
  }

  function isTapGuardBlocked(
    event: Event,
    guardKey: string,
    guardMs: number = TAP_GUARD_MS,
  ): boolean {
    if (!isCoarsePointer) return false;
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    const guardUntil = tapGuardUntilByKey.get(guardKey) ?? 0;
    if (now < guardUntil) return true;
    tapGuardUntilByKey.set(guardKey, now + guardMs);
    return false;
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

  function isLocalSession(): boolean {
    return game.getSessionMode() === "local";
  }

  function canShowLocalAddOption(): boolean {
    const hasRemote = game.hasRemotePlayers();
    const supportsLocalPlayers = game.supportsLocalPlayers();
    return isLocalSession() && supportsLocalPlayers && !hasRemote;
  }

  function canShowInviteOption(): boolean {
    return !isLocalSession() && isPlatform;
  }

  function updateSessionModeIndicator(): void {
    const isLocal = isLocalSession();
    elements.sessionModeIndicator.setAttribute("data-mode", isLocal ? "local" : "online");
    elements.sessionModeLocal.classList.toggle("on", isLocal);
    elements.sessionModeOnline.classList.toggle("on", !isLocal);
  }

  function updateRoomCodeVisibility(): void {
    const roomContainer = elements.roomCodeDisplay.closest(
      ".room-tag",
    ) as HTMLElement | null;
    if (!roomContainer) return;
    const isLocal = isLocalSession();
    roomContainer.style.display = isLocal || isPlatform ? "none" : "flex";
  }

  function updateRoomCode(code: string): void {
    updateSessionModeIndicator();
    updateRoomCodeVisibility();
    if (isLocalSession() || isPlatform) {
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
    elements.addAIBotBtn.disabled = !isLeader;
    setHostLocked(elements.addAIBotBtn, !isLeader);
    elements.addAIBotBtn.title = isLeader
      ? "Add AI Bot"
      : "Only the room leader can add AI bots";

    const supportsLocalPlayers = game.supportsLocalPlayers();
    const canShowLocal = canShowLocalAddOption();
    elements.addLocalPlayerBtn.style.display = canShowLocal ? "flex" : "none";
    elements.addLocalPlayerBtn.disabled = !canShowLocal || !isLeader;
    setHostLocked(elements.addLocalPlayerBtn, canShowLocal && !isLeader);
    if (!supportsLocalPlayers) {
      elements.addLocalPlayerBtn.title = "Local players are deferred in this version";
      return;
    }
    if (!isLocalSession()) {
      elements.addLocalPlayerBtn.title = "Switch to local mode to add local players";
      return;
    }
    if (!canShowLocal) {
      elements.addLocalPlayerBtn.title = "Local add disabled while remote players are present";
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

  function ensureCardSlots(): HTMLElement[] {
    if (cardSlotEls) return cardSlotEls;
    cardSlotEls = [];
    for (let i = 0; i < 4; i++) {
      const el = document.createElement("div");
      el.className = "pcard pcard--empty";
      el.dataset.slotPlayerId = "";
      el.dataset.emptySlotKey = "";
      elements.playersList.appendChild(el);
      cardSlotEls.push(el);
    }
    return cardSlotEls;
  }

  function useCompactCardActionLayout(): boolean {
    return phoneCardActionLayoutQuery.matches;
  }

  function getCardActionMeta(botType: string | null): {
    action: "remove" | "kick";
    label: string;
  } {
    const action = botType === "ai" || botType === "local" ? "remove" : "kick";
    const label = action === "remove" ? "Remove" : "Kick";
    return { action, label };
  }

  function buildCardActionIconButton(playerId: string, botType: string | null): string {
    const { action, label } = getCardActionMeta(botType);
    const actionLabel = label + " player";
    return `<button class="card-act card-act--icon" type="button" data-action="${action}" data-player-id="${playerId}" aria-label="${actionLabel}" title="${actionLabel}"><span class="card-act-icon" aria-hidden="true">&times;</span></button>`;
  }

  function buildCardActionTextButton(playerId: string, botType: string | null): string {
    const { action, label } = getCardActionMeta(botType);
    return `<button class="card-act card-act--text" type="button" data-action="${action}" data-player-id="${playerId}">${label}</button>`;
  }

  function buildFilledCardHTML(
    player: PlayerData,
    slotIdx: number,
    type: "you" | "ai" | "local" | "online",
    isSelf: boolean,
    isLeaderPlayer: boolean,
    canAct: boolean,
    botType: string | null,
    color: string,
  ): string {
    const useCompactActions = useCompactCardActionLayout();
    const canCycleSkin = isSelf || (botType === "local" && canAct);
    const cornerAction = !isSelf && canAct && useCompactActions
      ? buildCardActionIconButton(player.id, botType)
      : "";
    const footerContent = !isSelf && canAct && !useCompactActions
      ? `<div class="card-footer-actions">${buildCardActionTextButton(player.id, botType)}</div>`
      : '<span class="card-footer-spacer"></span>';
    const footerBlock = useCompactActions ? "" : `<div class="card-footer">${footerContent}</div>`;
    return `<div class="card-glow"></div>
          <div class="card-meta">
            <div class="card-meta-left">
              ${isLeaderPlayer ? `<span class="meta-host" title="Host" aria-label="Host">${CROWN_SVG}</span>` : ""}
              <span class="card-slot">${SLOTS[slotIdx]}</span>
            </div>
            <div class="card-meta-right">${cornerAction}</div>
          </div>
          <div class="card-scene">
            <div class="card-vp-wrap">
              <div class="card-viewport">
                <div class="viewport-ring"></div>
                <div class="viewport-inner">${shipPreviewMarkup(player.id, color)}</div>
              </div>
              ${canCycleSkin ? '<div class="card-tap-hint">Tap to change</div>' : ""}
            </div>
          </div>
          <div class="card-info">
            <div class="card-name"><span class="card-name-text">${escapeHtml(player.name)}</span>${isSelf ? '<span class="card-name-you">[YOU]</span>' : ""}</div>
            ${footerBlock}
          </div>`;
  }

  function buildEmptyCardHTML(
    slotIdx: number,
    canAdd: boolean,
    canShowLocalAdd: boolean,
    canShowInvite: boolean,
  ): string {
    const localBtn = canShowLocalAdd
      ? `<button class="empty-btn" data-action="add-local"${canAdd ? "" : " disabled"}><span class="eb-plus">+</span><span>Add Local</span></button>`
      : "";
    const inviteBtn = canShowInvite
      ? `<button class="empty-btn" data-action="invite"><span class="eb-plus">+</span><span>Invite</span></button>`
      : "";
    const tapHint = canShowLocalAdd
      ? "Tap to add player"
      : canShowInvite
        ? "Tap to add or invite"
        : "Tap to add bot";
    return `<div class="card-scene">
            <div class="empty-content">
              <div class="empty-icon">${PLUS_CIRCLE_SVG}</div>
              <div class="empty-label">${SLOTS[slotIdx]} \u2014 Empty</div>
              <div class="empty-btns">
                <button class="empty-btn" data-action="add-ai"${canAdd ? "" : " disabled"}><span class="eb-plus">+</span><span>Add Bot</span></button>
                ${localBtn}
                ${inviteBtn}
              </div>
              <div class="empty-tap-hint">${tapHint}</div>
            </div>
          </div>`;
  }

  function patchCardShipSkin(
    card: HTMLElement,
    playerId: string,
    color: string,
  ): void {
    const shipWrap = card.querySelector<HTMLElement>(".card-ship-wrap");
    if (!shipWrap) return;
    const currentSkinId = shipWrap.dataset.skinId ?? "";
    const expectedSkinId = resolveShipSkinIdForPlayer(playerId);
    if (currentSkinId === expectedSkinId) return;
    try {
      const skin = getShipSkin(expectedSkinId);
      const coloredTemplate = applySvgColorSlots(skin.svgTemplate, {
        "slot-primary": color,
      });
      const imageSrc = svgDataUri(coloredTemplate);
      shipWrap.dataset.skinId = expectedSkinId;
      shipWrap.className = "card-ship-wrap card-ship-asset";
      shipWrap.innerHTML = `<img class="card-ship-img" alt="" src="${imageSrc}">`;
    } catch {
      shipWrap.dataset.skinId = "";
      shipWrap.className = "card-ship-wrap card-ship-fallback";
      shipWrap.innerHTML = shipSVG(color);
    }
  }

  function updateLobbyUI(players: PlayerData[]): void {
    const myPlayerId = game.getMyPlayerId();
    const isLeader = game.isLeader();
    const leaderId = game.getLeaderId();
    const canShowLocalAdd = canShowLocalAddOption();
    const canShowInvite = canShowInviteOption();
    applyPreferredSkinToSelf();

    const cards = ensureCardSlots();
    for (let i = 0; i < 4; i++) {
      const card = cards[i];
      if (i < players.length) {
        const player = players[i];
        const color = player.color.primary;
        const rgb = hexToRgb(color);
        const isSelf = player.id === myPlayerId;
        const isLeaderPlayer = leaderId ? player.id === leaderId : false;
        const canAct = isLeader && !isSelf;
        const botType = game.getPlayerBotType(player.id);
        const useCompactActions = useCompactCardActionLayout();

        let type: "you" | "ai" | "local" | "online";
        if (isSelf) type = "you";
        else if (botType === "ai") type = "ai";
        else if (botType === "local") type = "local";
        else type = "online";

        card.style.setProperty("--pc", color);
        card.style.setProperty("--pc-rgb", rgb);

        const prevPlayerId = card.dataset.slotPlayerId ?? "";
        if (prevPlayerId !== player.id) {
          // New player in slot (empty→filled or player swap): full redraw for this card
          card.dataset.slotPlayerId = player.id;
          card.dataset.emptySlotKey = "";
          card.className = "pcard pcard--filled";
          card.innerHTML = buildFilledCardHTML(
            player, i, type, isSelf, isLeaderPlayer, canAct, botType, color,
          );
        } else {
          // Same player: targeted updates — ship animation continues uninterrupted
          card.className = "pcard pcard--filled";

          // Ship skin: only patches the wrap's innerHTML if skin changed
          patchCardShipSkin(card, player.id, color);

          // Name (rare, but handle it; also sync YOU label if isSelf resolved late)
          const nameEl = card.querySelector<HTMLElement>(".card-name");
          if (nameEl) {
            const nameText = nameEl.querySelector<HTMLElement>(".card-name-text");
            if (nameText && nameText.textContent !== player.name) {
              nameText.textContent = player.name;
            }
            const youLabel = nameEl.querySelector(".card-name-you");
            if (isSelf && !youLabel) {
              nameEl.insertAdjacentHTML("beforeend", '<span class="card-name-you">[YOU]</span>');
            } else if (!isSelf && youLabel) {
              youLabel.remove();
            }
          }

          // Host pip in meta rail
          const metaLeft = card.querySelector<HTMLElement>(".card-meta-left");
          if (metaLeft) {
            const hostPip = metaLeft.querySelector(".meta-host");
            if (isLeaderPlayer && !hostPip) {
              metaLeft.insertAdjacentHTML(
                "afterbegin",
                `<span class="meta-host" title="Host" aria-label="Host">${CROWN_SVG}</span>`,
              );
            } else if (!isLeaderPlayer && hostPip) {
              hostPip.remove();
            }
          }

          // Corner action (host controls for remove/kick)
          const metaRight = card.querySelector<HTMLElement>(".card-meta-right");
          if (metaRight) {
            const nextAction = !isSelf && canAct && useCompactActions
              ? buildCardActionIconButton(player.id, botType)
              : "";
            if (metaRight.innerHTML !== nextAction) {
              metaRight.innerHTML = nextAction;
            }
          }

          // Footer action (larger layouts only)
          const cardInfo = card.querySelector<HTMLElement>(".card-info");
          if (cardInfo) {
            const footer = cardInfo.querySelector<HTMLElement>(".card-footer");
            if (useCompactActions) {
              if (footer) footer.remove();
            } else {
              const newFooter = !isSelf && canAct
                ? `<div class="card-footer-actions">${buildCardActionTextButton(player.id, botType)}</div>`
                : '<span class="card-footer-spacer"></span>';
              if (footer) {
                if (footer.innerHTML !== newFooter) {
                  footer.innerHTML = newFooter;
                }
              } else {
                cardInfo.insertAdjacentHTML("beforeend", `<div class="card-footer">${newFooter}</div>`);
              }
            }
          }

          // Tap hint (canCycleSkin can flip if host status changes, or myPlayerId resolved late)
          const canCycleSkin = isSelf || (botType === "local" && canAct);
          const vpWrap = card.querySelector<HTMLElement>(".card-vp-wrap");
          if (vpWrap) {
            const existingHint = vpWrap.querySelector(".card-tap-hint");
            if (canCycleSkin && !existingHint) {
              vpWrap.insertAdjacentHTML("beforeend", '<div class="card-tap-hint">Tap to change</div>');
            } else if (!canCycleSkin && existingHint) {
              existingHint.remove();
            }
          }

        }
      } else {
        // Empty slot
        const prevPlayerId = card.dataset.slotPlayerId ?? "";
        const emptyKey = `${isLeader ? "1" : "0"}_${canShowLocalAdd ? "1" : "0"}_${canShowInvite ? "1" : "0"}`;
        if (prevPlayerId !== "" || card.dataset.emptySlotKey !== emptyKey) {
          // Transitioning from filled, or empty-slot params changed: redraw
          card.dataset.slotPlayerId = "";
          card.dataset.emptySlotKey = emptyKey;
          card.className = "pcard pcard--empty";
          card.style.removeProperty("--pc");
          card.style.removeProperty("--pc-rgb");
          card.innerHTML = buildEmptyCardHTML(i, isLeader, canShowLocalAdd, canShowInvite);
        }
      }
    }

    const hasEnoughPlayers = players.length >= 2;
    elements.startGameBtn.disabled = !hasEnoughPlayers || !isLeader;
    setHostLocked(elements.startGameBtn, !isLeader);
    if (!hasEnoughPlayers) {
      elements.startGameBtn.title = "Need at least 2 players";
    } else if (isLeader) {
      elements.startGameBtn.title = "Start match";
    } else {
      elements.startGameBtn.title = "Only the room leader can start the match";
    }

    updateLaunchStatus(players.length, isLeader);
    updateBotControlsVisibility(players.length, isLeader);

    elements.gameModeSection.classList.toggle("readonly", !isLeader);
    elements.modeCycleBtn.disabled = !isLeader;
    elements.rulesetCycleBtn.disabled = !isLeader;
    elements.advancedSettingsBtn.disabled = !isLeader;
    setHostLocked(elements.modeCycleBtn, !isLeader);
    setHostLocked(elements.rulesetCycleBtn, !isLeader);
    setHostLocked(elements.advancedSettingsBtn, !isLeader);
    elements.modeCycleBtn.title = isLeader
      ? "Cycle game mode"
      : "Only the room leader can edit game mode";
    elements.rulesetCycleBtn.title = isLeader
      ? "Cycle ruleset"
      : "Only the room leader can change ruleset";
    elements.advancedSettingsBtn.title = isLeader
      ? "Open advanced settings"
      : "Only the room leader can edit advanced settings";

    updateSessionModeIndicator();
    updateRoomCodeVisibility();
    setRulesetUI(game.getRuleset(), "remote");
    updateMapSelector();
  }

  // Add-player dialog (phone coarse only)
  const addPlayerModal = document.getElementById("addPlayerModal") as HTMLElement;
  const addPlayerBackdrop = document.getElementById("addPlayerBackdrop") as HTMLElement;
  const addPlayerAIBtn = document.getElementById("addPlayerAIBtn") as HTMLButtonElement;
  const addPlayerLocalBtn = document.getElementById("addPlayerLocalBtn") as HTMLButtonElement;
  const addPlayerInviteBtn = document.getElementById("addPlayerInviteBtn") as HTMLButtonElement;
  const addPlayerCloseBtn = document.getElementById("addPlayerCloseBtn") as HTMLButtonElement;

  function openAddPlayerDialog(): void {
    addPlayerLocalBtn.style.display = canShowLocalAddOption() ? "" : "none";
    addPlayerInviteBtn.style.display = canShowInviteOption() ? "" : "none";
    addPlayerModal.classList.add("active");
    addPlayerBackdrop.classList.add("active");
  }
  function closeAddPlayerDialog(): void {
    addPlayerModal.classList.remove("active");
    addPlayerBackdrop.classList.remove("active");
  }

  addPlayerAIBtn.addEventListener("click", () => {
    closeAddPlayerDialog();
    elements.addAIBotBtn.click();
  });
  addPlayerLocalBtn.addEventListener("click", () => {
    closeAddPlayerDialog();
    elements.addLocalPlayerBtn.click();
  });
  addPlayerInviteBtn.addEventListener("click", () => {
    closeAddPlayerDialog();
    elements.addInvitePlayerBtn.click();
  });
  addPlayerCloseBtn.addEventListener("click", closeAddPlayerDialog);
  addPlayerBackdrop.addEventListener("click", closeAddPlayerDialog);

  // Card tray event delegation — set up ONCE at init
  elements.playersList.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest(
      "[data-action]",
    ) as HTMLButtonElement | null;

    if (btn && !btn.disabled) {
      const action = btn.dataset.action ?? "unknown";
      const playerId = btn.dataset.playerId ?? "none";
      if (isTapGuardBlocked(e, "tray-action:" + action + ":" + playerId, TAP_GUARD_MS)) {
        return;
      }
      e.stopPropagation();

      if (action === "add-ai") {
        elements.addAIBotBtn.click();
      } else if (action === "add-local") {
        elements.addLocalPlayerBtn.click();
      } else if (action === "invite") {
        elements.addInvitePlayerBtn.click();
      } else if ((action === "remove" || action === "kick") && playerId) {
        if (!game.isLeader()) {
          showHostOnlyActionToast();
          return;
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
      return;
    }

    // Phone: tap on empty card → open add-player dialog (local or online+platform) or add bot directly
    const emptyCard = (e.target as HTMLElement).closest<HTMLElement>(".pcard--empty");
    if (emptyCard && window.matchMedia("(pointer: coarse) and (max-height: 600px)").matches) {
      const canInvite = canShowInviteOption();
      if (!game.isLeader() && !canInvite) return;
      if (canShowLocalAddOption() || canInvite) {
        openAddPlayerDialog();
      } else if (game.isLeader()) {
        elements.addAIBotBtn.click();
      }
      return;
    }

    // Card-body tap → cycle skin (self / leader-owned local player)
    // Guard: skip if click landed on any button
    if (!(e.target as HTMLElement).closest("button")) {
      const filledCard = (e.target as HTMLElement).closest<HTMLElement>(".pcard--filled");
      if (filledCard) {
        const slotPlayerId = filledCard.dataset.slotPlayerId ?? "";
        if (!slotPlayerId) return;
        const myPlayerId = game.getMyPlayerId();
        const isSelf = slotPlayerId === myPlayerId;
        const isLocalPlayer = game.getPlayerBotType(slotPlayerId) === "local";
        if (!isSelf && (!isLocalPlayer || !game.isLeader())) return;
        if (isTapGuardBlocked(e, "card-skin:" + slotPlayerId, TAP_GUARD_MS)) return;
        cycleShipSkinForPlayer(slotPlayerId, isSelf);
      }
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
        ? "Random map for the match"
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

      meta.appendChild(name);
      card.appendChild(preview);
      card.appendChild(meta);

      card.addEventListener("click", (event) => {
        if (isTapGuardBlocked(event, "map-card:" + mapId.toString(), TAP_GUARD_MS)) {
          return;
        }
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
      const lockedByHost = !isLeader;
      card.classList.toggle("active", mapId === selectedMapId);
      card.classList.toggle("disabled", !allowed);
      card.disabled = !allowed || lockedByHost;
      card.title = !allowed
        ? "Unavailable for selected ruleset"
        : lockedByHost
          ? "Only the room leader can change the arena"
          : "";
      setHostLocked(card, lockedByHost);
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
    elements.openMapPickerBtn.disabled = !lobbyIsLeader;
    setHostLocked(elements.openMapPickerBtn, !lobbyIsLeader);
    elements.openMapPickerBtn.title = lobbyIsLeader
      ? "Change arena"
      : "Only the room leader can change the arena";
    ensureMapPickerCards();
    setMapUI(selectedMapId, "remote");
  }

  elements.copyCodeBtn.addEventListener("click", (event) => {
    if (isTapGuardBlocked(event, "copy-room-code", TAP_GUARD_MS)) {
      return;
    }
    if (game.getSessionMode() === "local" || isPlatform) return;
    const code = game.getRoomCode();
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      feedback.error();
      console.error("[Lobby] Clipboard API unavailable");
      return;
    }
    void navigator.clipboard.writeText(code)
      .then(() => {
        feedback.button();
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

  elements.addAIBotBtn.addEventListener("click", async (event) => {
    if (isTapGuardBlocked(event, "add-ai", ADD_BUTTON_TAP_GUARD_MS)) {
      return;
    }
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

  elements.addLocalPlayerBtn.addEventListener("click", async (event) => {
    if (isTapGuardBlocked(event, "add-local", ADD_BUTTON_TAP_GUARD_MS)) {
      return;
    }
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

  elements.addInvitePlayerBtn.addEventListener("click", (event) => {
    if (isTapGuardBlocked(event, "invite", ADD_BUTTON_TAP_GUARD_MS)) return;
    feedback.button();
    openInviteModal();
  });

  elements.keySelectBackdrop.addEventListener("click", (event) => {
    if (isTapGuardBlocked(event, "key-select-backdrop", TAP_GUARD_MS)) {
      return;
    }
    hideKeySelectModal();
  });
  elements.keySelectCancel.addEventListener("click", (event) => {
    if (isTapGuardBlocked(event, "key-select-cancel", TAP_GUARD_MS)) {
      return;
    }
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

  elements.startGameBtn.addEventListener("click", (event) => {
    if (isTapGuardBlocked(event, "start-game", START_BUTTON_TAP_GUARD_MS)) {
      return;
    }
    const hasEnoughPlayers = game.getPlayerCount() >= 2;
    if (!game.isLeader()) {
      showHostOnlyActionToast();
      return;
    }
    if (!hasEnoughPlayers) return;
    feedback.confirm();
    game.startGame();
  });

  elements.modeCycleBtn.addEventListener("click", (event) => {
    if (isTapGuardBlocked(event, "mode-cycle", TAP_GUARD_MS)) return;
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

  // Whole mode section tap → cycle ruleset (round/endless); mode button stays for base mode cycling
  elements.gameModeSection.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    // Let modeCycleBtn and advancedSettingsBtn handle themselves
    if (target.closest("#modeCycleBtn") || target.closest("#advancedSettingsBtn")) return;
    if (isTapGuardBlocked(event, "ruleset-cycle", TAP_GUARD_MS)) return;
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

  elements.mapSelectorSection.addEventListener("click", (event) => {
    if (isTapGuardBlocked(event, "open-map-picker", TAP_GUARD_MS)) {
      return;
    }
    if (!game.isLeader()) return;
    feedback.button();
    ensureMapPickerCards();
    updateMapPickerState(game.getMapId());
    elements.mapPickerModal.classList.add("active");
    elements.mapPickerBackdrop.classList.add("active");
    // Render after modal is visible so getBoundingClientRect returns real canvas dimensions
    requestAnimationFrame(() => renderMapPickerPreviews());
  });

  elements.mapPickerClose.addEventListener("click", (event) => {
    if (isTapGuardBlocked(event, "close-map-picker", TAP_GUARD_MS)) {
      return;
    }
    feedback.subtle();
    closeMapPicker();
  });

  elements.mapPickerBackdrop.addEventListener("click", (event) => {
    if (isTapGuardBlocked(event, "close-map-picker-backdrop", TAP_GUARD_MS)) {
      return;
    }
    closeMapPicker();
  });

  window.addEventListener("resize", () => {
    if (!elements.mapPickerModal.classList.contains("active")) return;
    renderMapPickerPreviews();
  });

  elements.leaveLobbyBtn.addEventListener("click", (event) => {
    if (isTapGuardBlocked(event, "leave-lobby", START_BUTTON_TAP_GUARD_MS)) {
      return;
    }
    feedback.subtle();
    closeMapPicker();
    openLeaveModal("LOBBY_LEAVE");
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
