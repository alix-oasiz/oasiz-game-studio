const getElement = <T extends HTMLElement>(id: string): T => {
  return document.getElementById(id) as T;
};

export const elements = {
  // Screens
  startScreen: getElement<HTMLElement>("startScreen"),
  lobbyScreen: getElement<HTMLElement>("lobbyScreen"),
  gameEndScreen: getElement<HTMLElement>("gameEndScreen"),

  // Start screen
  mainButtons: getElement<HTMLElement>("mainButtons"),
  startSecondaryActions: getElement<HTMLElement>("startSecondaryActions"),
  startHowToPlayBtn: getElement<HTMLButtonElement>("startHowToPlayBtn"),
  startSettingsBtn: getElement<HTMLButtonElement>("startSettingsBtn"),
  joinSection: getElement<HTMLElement>("joinSection"),
  createRoomBtn: getElement<HTMLButtonElement>("createRoomBtn"),
  joinRoomBtn: getElement<HTMLButtonElement>("joinRoomBtn"),
  localMatchBtn: getElement<HTMLButtonElement>("localMatchBtn"),
  roomCodeInput: getElement<HTMLInputElement>("roomCodeInput"),
  joinError: getElement<HTMLElement>("joinError"),
  submitJoinBtn: getElement<HTMLButtonElement>("submitJoinBtn"),
  backToStartBtn: getElement<HTMLButtonElement>("backToStartBtn"),

  // Lobby screen
  sessionModeIndicator: getElement<HTMLElement>("sessionModeIndicator"),
  sessionModeLocal: getElement<HTMLElement>("sessionModeLocal"),
  sessionModeOnline: getElement<HTMLElement>("sessionModeOnline"),
  roomCodeDisplay: getElement<HTMLElement>("roomCodeDisplay"),
  copyCodeBtn: getElement<HTMLButtonElement>("copyCodeBtn"),
  playersList: getElement<HTMLElement>("playersList"),
  lobbyStatus: getElement<HTMLElement>("lobbyStatus"),
  startGameBtn: getElement<HTMLButtonElement>("startGameBtn"),
  leaveLobbyBtn: getElement<HTMLButtonElement>("leaveLobbyBtn"),

  // Game end screen
  winnerName: getElement<HTMLElement>("winnerName"),
  finalScores: getElement<HTMLElement>("finalScores"),
  continueBtn: getElement<HTMLButtonElement>("continueBtn"),
  playAgainBtn: getElement<HTMLButtonElement>("playAgainBtn"),
  leaveEndBtn: getElement<HTMLButtonElement>("leaveEndBtn"),

  // HUD
  hud: getElement<HTMLElement>("hud"),
  scoreTrack: getElement<HTMLElement>("scoreTrack"),
  endlessTimer: getElement<HTMLElement>("endlessTimer"),
  comboHud: getElement<HTMLElement>("comboHud"),
  leaveGameBtn: getElement<HTMLButtonElement>("leaveGameBtn"),
  endMatchBtn: getElement<HTMLButtonElement>("endMatchBtn"),
  settingsCenterHotspot: getElement<HTMLButtonElement>("settingsCenterHotspot"),

  // Leave confirmation modal
  leaveModal: getElement<HTMLElement>("leaveModal"),
  leaveModalTitle: getElement<HTMLElement>("leaveModalTitle"),
  leaveModalMessage: getElement<HTMLElement>("leaveModalMessage"),
  leaveBackdrop: getElement<HTMLElement>("leaveBackdrop"),
  leaveCancelBtn: getElement<HTMLButtonElement>("leaveCancelBtn"),
  leaveConfirmBtn: getElement<HTMLButtonElement>("leaveConfirmBtn"),

  // Settings
  settingsBtn: getElement<HTMLButtonElement>("settingsBtn"),
  settingsModal: getElement<HTMLElement>("settingsModal"),
  settingsLeaveBtn: getElement<HTMLButtonElement>("settingsLeaveBtn"),
  settingsBackdrop: getElement<HTMLElement>("settingsBackdrop"),
  toggleMusic: getElement<HTMLElement>("toggleMusic"),
  toggleFx: getElement<HTMLElement>("toggleFx"),
  toggleHaptics: getElement<HTMLElement>("toggleHaptics"),
  toggleHints: getElement<HTMLElement>("toggleHints"),
  settingsClose: getElement<HTMLButtonElement>("settingsClose"),

  // Round result overlay
  roundResult: getElement<HTMLElement>("roundResult"),
  roundResultTitle: getElement<HTMLElement>("roundResultTitle"),
  roundResultSubtitle: getElement<HTMLElement>("roundResultSubtitle"),
  controlHints: getElement<HTMLElement>("controlHints"),
  systemMessage: getElement<HTMLElement>("systemMessage"),

  // Bot controls
  addBotSection: getElement<HTMLElement>("addBotSection"),
  addAIBotBtn: getElement<HTMLButtonElement>("addAIBotBtn"),
  addLocalPlayerBtn: getElement<HTMLButtonElement>("addLocalPlayerBtn"),
  addInvitePlayerBtn: getElement<HTMLButtonElement>("addInvitePlayerBtn"),
  advancedSettingsBtn: getElement<HTMLButtonElement>("advancedSettingsBtn"),
  mapPreviewCanvas: getElement<HTMLCanvasElement>("mapPreviewCanvas"),

  // Game mode toggle
  gameModeSection: getElement<HTMLElement>("gameModeSection"),
  modeCycleBtn: getElement<HTMLButtonElement>("modeCycleBtn"),
  modeCycleValue: getElement<HTMLElement>("modeCycleValue"),
  rulesetCycleBtn: getElement<HTMLButtonElement>("rulesetCycleBtn"),
  rulesetCycleValue: getElement<HTMLElement>("rulesetCycleValue"),

  // Map selector
  mapSelectorSection: getElement<HTMLElement>("mapSelectorSection"),
  mapCurrentName: getElement<HTMLElement>("mapCurrentName"),
  mapCurrentDesc: getElement<HTMLElement>("mapCurrentDesc"),
  mapCurrentBehavior: getElement<HTMLElement>("mapCurrentBehavior"),
  openMapPickerBtn: getElement<HTMLButtonElement>("openMapPickerBtn"),
  mapPickerBackdrop: getElement<HTMLElement>("mapPickerBackdrop"),
  mapPickerModal: getElement<HTMLElement>("mapPickerModal"),
  mapPickerGrid: getElement<HTMLElement>("mapPickerGrid"),
  mapPickerClose: getElement<HTMLButtonElement>("mapPickerClose"),

  // Key selection modal
  keySelectModal: getElement<HTMLElement>("keySelectModal"),
  keySelectBackdrop: getElement<HTMLElement>("keySelectBackdrop"),
  keyOptions: getElement<HTMLElement>("keyOptions"),
  keySelectCancel: getElement<HTMLButtonElement>("keySelectCancel"),

  // Advanced settings modal
  advancedSettingsModal: getElement<HTMLElement>("advancedSettingsModal"),
  advancedSettingsBackdrop: getElement<HTMLElement>("advancedSettingsBackdrop"),
  advancedSettingsClose: getElement<HTMLButtonElement>("advancedSettingsClose"),
  advancedSettingsDone: getElement<HTMLButtonElement>("advancedSettingsDone"),
  advancedTabElements: getElement<HTMLButtonElement>("advancedTabElements"),
  advancedTabPhysics: getElement<HTMLButtonElement>("advancedTabPhysics"),
  advancedPanelElements: getElement<HTMLElement>("advancedPanelElements"),
  advancedPanelPhysics: getElement<HTMLElement>("advancedPanelPhysics"),
  asteroidsCycle: getElement<HTMLButtonElement>("asteroidsCycle"),
  startPowerupsToggle: getElement<HTMLButtonElement>("startPowerupsToggle"),
  roundsRow: getElement<HTMLElement>("roundsRow"),
  roundsCycle: getElement<HTMLButtonElement>("roundsCycle"),
  endlessTimeLimitRow: getElement<HTMLElement>("endlessTimeLimitRow"),
  endlessTimeLimitCycle: getElement<HTMLButtonElement>("endlessTimeLimitCycle"),
  endlessKillLimitRow: getElement<HTMLElement>("endlessKillLimitRow"),
  endlessKillLimitCycle: getElement<HTMLButtonElement>("endlessKillLimitCycle"),
  shipSpeedCycle: getElement<HTMLButtonElement>("shipSpeedCycle"),
  dashPowerCycle: getElement<HTMLButtonElement>("dashPowerCycle"),
  rotationPresetCycle: getElement<HTMLButtonElement>("rotationPresetCycle"),
  recoilPresetCycle: getElement<HTMLButtonElement>("recoilPresetCycle"),
  shipRestitutionCycle: getElement<HTMLButtonElement>("shipRestitutionCycle"),
  shipFrictionAirCycle: getElement<HTMLButtonElement>("shipFrictionAirCycle"),
  wallRestitutionCycle: getElement<HTMLButtonElement>("wallRestitutionCycle"),
  wallFrictionCycle: getElement<HTMLButtonElement>("wallFrictionCycle"),
  shipFrictionCycle: getElement<HTMLButtonElement>("shipFrictionCycle"),
  angularDampingCycle: getElement<HTMLButtonElement>("angularDampingCycle"),

  netStats: getElement<HTMLElement>("netStats"),

  // Mobile controls
  mobileControls: getElement<HTMLElement>("mobileControls"),

  // Starfield background
  starsContainer: getElement<HTMLElement>("starsContainer"),
  starsBg: getElement<HTMLElement>("starsBg"),
  starsLayer: getElement<HTMLElement>("starsLayer"),

  // Demo overlays
  demoAttractOverlay: getElement<HTMLElement>("demoAttractOverlay"),
  demoTapText: getElement<HTMLElement>("demoTapText"),
  demoSkipBtn: getElement<HTMLButtonElement>("demoSkipBtn"),
  demoTutorialOverlay: getElement<HTMLElement>("demoTutorialOverlay"),
  demoTutorialPanel: getElement<HTMLElement>("demoTutorialPanel"),
  demoTutorialDiagram: getElement<HTMLElement>("demoTutorialDiagram"),
  demoTutorialDialogue: getElement<HTMLElement>("demoTutorialDialogue"),
  demoTutorialSkip: getElement<HTMLButtonElement>("demoTutorialSkip"),
  demoSettingsBtn: getElement<HTMLButtonElement>("demoSettingsBtn"),
  demoSkipTutorialBtn: getElement<HTMLButtonElement>("demoSkipTutorialBtn"),
} as const;
