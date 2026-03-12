import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { oasiz } from "@oasiz/sdk";
import {
  createMarbleBody,
  createPhysicsWorld,
  MarbleVisualController,
  type PhysicsDebugSnapshot,
  resetMarbleBody,
  stepPhysicsTick,
  type PhysicsHost,
} from "./marble";
import {
  buildTrackSlices as buildTrackSlicesData,
  createRandomLevelConfig as createRandomLevelConfigData,
  getDefaultDesignerMiddleTypes as getDefaultDesignerMiddleTypesData,
  getPlatformTypeLabel as getPlatformTypeLabelData,
  getSectionAtZ as getSectionAtZData,
  getSectionProgressT as getSectionProgressTData,
  getSpiralRadius as getSpiralRadiusData,
  hasFloorAtZ as hasFloorAtZData,
  isDownwardSlopeType as isDownwardSlopeTypeData,
  isSpiralType as isSpiralTypeData,
  sampleSpiralProgressT as sampleSpiralProgressTData,
  sampleTrackCenterAtSectionT as sampleTrackCenterAtSectionTData,
  sampleTrackSlope as sampleTrackSlopeData,
  sampleTrackWidth as sampleTrackWidthData,
  sampleTrackX as sampleTrackXData,
  type LevelConfig,
  type PlatformSection,
  type PlatformType,
  type TrackSample,
  type TrackSlice,
} from "./level-generation";
import {
  addCloudBackdrop as addCloudBackdropVisual,
  addFinishTriggerCubes as addFinishTriggerCubesVisual,
  type FireworkRow,
} from "./level-visuals";
import {
  applyObstacleInteractions,
  addWaveObstacleMeshes as addWaveObstacleMeshesData,
  buildWaveObstacles as buildWaveObstaclesData,
  clearTrackPhysicsBodies,
  clearObstacleVisualState,
  createTrackPhysicsBodies,
  createRunObstacleOrder,
  updateWaveObstacleAnimation as updateWaveObstacleAnimationData,
  type BouncyPadObstacle,
  type FallingPlatformObstacle,
  type ObstacleKind,
  type PinballBouncerObstacle,
  type RotatorXObstacle,
  type SwingingHammerObstacle,
  type WaveObstacleKind,
} from "./obstacles";
import {
  SoundManager,
  type LandingSoundDebugInfo,
} from "./sound-manager";

const BUILD_VERSION = "0.5.215";

type GameState = "start" | "playing" | "gameOver";
type HapticType = "light" | "medium" | "heavy" | "success" | "error";
type SettingsTab = "audio" | "designer" | "repeat" | "obstacles" | "debug";
type DesignerObstacleFocus = ObstacleKind | "horizontal_blocker";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface PersistedState {
  runsCompleted?: number;
}

interface FireworkParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

interface HorizontalBlocker {
  s: number;
  x: number;
  y: number;
  z: number;
  length: number;
  height: number;
  depth: number;
  tilt: number;
}

class MarbleMadnessStarter {
  private readonly canvas: HTMLCanvasElement;
  private readonly isMobile: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private world: RAPIER.World | null = null;

  private marbleBody: RAPIER.RigidBody | null = null;
  private marbleMesh: THREE.Mesh;
  private marbleMaterial: THREE.MeshStandardMaterial;
  private trackMaterial: THREE.MeshPhysicalMaterial;

  private gameState: GameState = "start";
  private settings: Settings;
  private persistentState: PersistedState = {};

  private animationFrameId = 0;
  private lastFrameSeconds = 0;
  private accumulator = 0;
  private fpsSmoothed = 60;
  private cameraFollowAnchor = new THREE.Vector3();
  private cameraLookAnchor = new THREE.Vector3();
  private cameraAnchorsInitialized = false;

  private runTimeSeconds = 0;
  private finishedTimeSeconds = 0;

  private readonly fixedStep = 1 / 60;
  private readonly trackWidth = 18;
  private readonly trackLength = 330;
  private readonly trackThickness = 2;
  private readonly trackCenterY = 30;
  private readonly trackCenterZ = 0;
  private readonly startZ = 106;
  private finishZ = -198;
  private readonly baseFinishZ = -198;
  private readonly loseY = -50;
  private readonly loseBoundaryDrop = 18;
  private readonly maxRunSeconds = 60;
  private readonly marbleRadius = 1;
  private readonly startFlickSpeed = 16;
  private readonly nudgeImpulse = 1.2;
  private readonly downhillImpulse = 0.06;
  private readonly playerCollisionSteerImpulse = 0.2;
  private readonly playerContactUpwardVelocityCap = 4.2;
  private readonly groundedProbePadding = 0.34;
  private readonly airControlMultiplier = 0.45;
  private readonly obstacleAirborneVerticalScale = 0.35;
  private readonly obstacleRisingVerticalScale = 0.5;
  private readonly obstaclePlayerUpwardVelocityCap = 3.8;
  private readonly startMomentumRatio = 0.5;
  private readonly maxHorizontalSpeed = 46.8;
  private readonly speedRampSeconds = 18;
  private readonly speedMultiplier = 18;
  private readonly trackStep = 0.9;
  private readonly wallHeight = 2.38;
  private readonly wallThickness = 0.8;
  private readonly halfPipeFlatWidthRatio = 0.56;
  private readonly halfPipeRenderSegments = 16;
  private readonly downhillSlopeAngle = Math.PI / 4;
  private readonly uphillSlopeAngle = -Math.PI / 4;
  private readonly slopeBlendDistance = 8.5;
  private readonly spiralRadius = 26;
  private readonly spiralEntryLength = 12;
  private readonly spiralExitLength = 12;
  private readonly spiralInwardBankHeight = 0.34;
  private readonly spiralSupportPlankThickness = 0.36;
  private readonly spiralSupportPlankDepth = 0.72;
  private readonly blockerHeight = 1.25;
  private readonly blockerDepth = 0.9;
  private readonly blockerGapWidth = 4.1;
  private readonly blockerSideMargin = 0.9;
  private readonly blockerMinSpacing = 8.5;
  private readonly blockerMaxPerLevel = 8;
  private readonly obstacleStartSafeDistance = 30;
  private readonly obstacleFinishSafeDistance = 28;
  private readonly obstacleClusterSpacing = 16;
  private readonly obstacleMinDistance = 3;
  private readonly obstacleMaxPerTypeCap = 12;
  private readonly obstacleWaveLinearGrowth = 1;
  private readonly obstacleSectionEntrySafeDistanceMin = 6;
  private readonly obstacleSectionEntrySafeRatio = 0.24;
  private readonly designerMiddleCount = 8;
  private readonly designerRepeatMiddleCount = 3;
  private readonly rotatorHeight = 2.8;
  private readonly rotatorArmLength = 3.2;
  private readonly rotatorArmThickness = 0.92;
  private readonly rotatorSpinSpeedBase = 7.2;
  private readonly bouncerColumnHeight = 1.45;
  private readonly bouncerCapRadius = 1.08;
  private readonly bouncerImpulse = 13.5;
  private readonly bouncyPadLength = 5.6;
  private readonly bouncyPadWidth = 1.05;
  private readonly bouncyPadSweepAmplitude = 1.18;
  private readonly bouncyPadSweepSpeedBase = 3.4;
  private readonly bouncyPadLaunchImpulse = 10.5;
  private readonly swingingHammerLength = 4.2;
  private readonly swingingHammerPivotHeight = 3.5;
  private readonly swingingHammerSweepAmplitude = 1.05;
  private readonly swingingHammerSweepSpeedBase = 2.8;
  private readonly swingingHammerKnockbackImpulse = 15;
  private readonly fallingPlatformLength = 4.5;
  private readonly fallingPlatformWidth = 16.5;
  private readonly fallingPlatformFallDelay = 2.0;
  private readonly fallingPlatformFallDuration = 1.5;
  private readonly fallingPlatformFallDistance = 20;
  private readonly platformUvScaleV = 0.035;
  private readonly endlessMode = true;
  private readonly trackSamples: TrackSample[] = [];
  private readonly trackSlices: TrackSlice[] = [];
  private readonly sectionArcRanges: Array<{ sStart: number; sEnd: number }> = [];
  private trackArcLength = 0;
  private fireworkTriggerS = 0;
  private fireworkTriggerZ = -186;
  private levelConfig: LevelConfig;
  private levelObjects: THREE.Object3D[] = [];
  private trackRigidBodies: RAPIER.RigidBody[] = [];
  private particles: FireworkParticle[] = [];
  private fireworkRows: FireworkRow[] = [];
  private readonly trailSpawnInterval = 0.015;
  private readonly trailMaxPoints = 48;
  private loopsCompleted = 0;
  private levelProgressStartZ = 0;
  private levelProgressEndZ = 0;
  private activeSettingsTab: SettingsTab = "audio";
  private customMiddlePlatformTypes: PlatformType[] | null = null;
  private forcedRunObstacleOrder: ObstacleKind[] | null = null;
  private designedMiddleTypes: PlatformType[] = [];
  private designerRepeatType: PlatformType = "flat";
  private designerObstacleFocus: DesignerObstacleFocus = "horizontal_blocker";
  private readonly designerSelectableTypes: PlatformType[] = [
    "flat",
    "slope_down_soft",
    "slope_down_steep",
    "spiral_down_left",
    "spiral_down_right",
    "detour_left_short",
    "detour_right_short",
    "bottleneck",
    "jump",
  ];
  private horizontalBlockers: HorizontalBlocker[] = [];
  private runObstacleOrder: ObstacleKind[] = [];
  private rotatorObstacles: RotatorXObstacle[] = [];
  private pinballBouncers: PinballBouncerObstacle[] = [];
  private bouncyPads: BouncyPadObstacle[] = [];
  private swingingHammers: SwingingHammerObstacle[] = [];
  private fallingPlatforms: FallingPlatformObstacle[] = [];
  private obstacleMeshById = new Map<string, THREE.Object3D>();
  private bouncyPadPaddleById = new Map<string, THREE.Object3D>();
  private bouncerCapById = new Map<string, THREE.Mesh>();
  private bouncerPulseById = new Map<string, number>();
  private obstacleBodyById = new Map<string, RAPIER.RigidBody>();
  private bouncyPadJointById = new Map<string, RAPIER.RevoluteImpulseJoint>();
  private obstacleIdCounter = 0;
  private currentLoseY = this.loseY;

  private readonly startScreen: HTMLElement;
  private readonly gameOverScreen: HTMLElement;
  private readonly settingsModal: HTMLElement;
  private readonly settingsPaneAudio: HTMLElement;
  private readonly settingsPaneDesigner: HTMLElement | null;
  private readonly settingsPaneRepeat: HTMLElement | null;
  private readonly settingsPaneObstacles: HTMLElement | null;
  private readonly settingsPaneDebug: HTMLElement | null;
  private readonly settingsTabAudio: HTMLButtonElement | null;
  private readonly settingsTabDesigner: HTMLButtonElement | null;
  private readonly settingsTabRepeat: HTMLButtonElement | null;
  private readonly settingsTabObstacles: HTMLButtonElement | null;
  private readonly settingsTabDebug: HTMLButtonElement | null;
  private readonly designerList: HTMLElement | null;
  private readonly designerMeta: HTMLElement | null;
  private readonly designerSpawnButton: HTMLButtonElement | null;
  private readonly obstacleFocusSelect: HTMLSelectElement | null;
  private readonly obstacleFocusSpawnButton: HTMLButtonElement | null;
  private readonly designerRepeatSelect: HTMLSelectElement | null;
  private readonly designerRepeatMeta: HTMLElement | null;
  private readonly designerRepeatSpawnButton: HTMLButtonElement | null;
  private readonly debugTrackWireToggleButton: HTMLButtonElement | null;
  private readonly debugPhysicsWireToggleButton: HTMLButtonElement | null;
  private readonly debugCloudCountToggleButton: HTMLButtonElement | null;
  private readonly debugPhysicsPanelToggleButton: HTMLButtonElement | null;
  private readonly debugThudTraceToggleButton: HTMLButtonElement | null;
  private readonly debugCubeLevelSpawnButton: HTMLButtonElement | null;
  private readonly hud: HTMLElement;
  private readonly swipeOverlay: HTMLElement;
  private readonly swipeHandle: HTMLElement;
  private readonly swipePowerLabel: HTMLElement;
  private readonly settingsButton: HTMLElement;
  private readonly restartButton: HTMLElement;
  private readonly timeLabel: HTMLElement;
  private readonly speedLabel: HTMLElement;
  private readonly levelProgressMarble: HTMLElement;
  private readonly levelProgressMarkers: HTMLElement;
  private readonly resultLabel: HTMLElement;
  private readonly versionLabel: HTMLElement;
  private readonly fpsLabel: HTMLElement;
  private readonly physicsDebugPanel: HTMLPreElement;
  private readonly cloudDebugPanel: HTMLDivElement;
  private readonly thudDebugPanel: HTMLPreElement;
  private marbleVisuals: MarbleVisualController;
  private debugFlyMode = false;
  private debugLookDragging = false;
  private debugMoveForward = false;
  private debugMoveBackward = false;
  private debugMoveLeft = false;
  private debugMoveRight = false;
  private debugMoveUp = false;
  private debugMoveDown = false;
  private debugMoveFast = false;

  private get halfPipePhysicsSegments(): number {
    return this.halfPipeRenderSegments;
  }
  private debugYaw = 0;
  private debugPitch = 0;
  private debugLastMouseX = 0;
  private debugLastMouseY = 0;
  private readonly debugFlyPosition = new THREE.Vector3();
  private debugPlatformLabels: THREE.Sprite[] = [];
  private debugBoundaryMarkers: THREE.Line[] = [];
  private agentDebugMinimalMode = false;
  private agentDebugSpawnPending = false;
  private agentDebugCameraMode: "overview" | "side" | "top" = "overview";
  private agentDebugHideClouds = false;
  private physicsDebugSnapshot: PhysicsDebugSnapshot | null = null;
  private wasAirborne = false;
  private airborneSeconds = 0;
  private previousVerticalVelocity = 0;
  private lastLandingSfxRunTime = -999;
  private lastObstacleThudRunTime = -999;
  private rotatorHitAtById = new Map<string, number>();
  private rotatorTouchingById = new Map<string, boolean>();
  private bouncyPadHitAtById = new Map<string, number>();
  private bouncyPadTouchingById = new Map<string, boolean>();
  private hammerHitAtById = new Map<string, number>();
  private hammerTouchingById = new Map<string, boolean>();
  private blockerHitAtByIndex = new Map<number, number>();
  private blockerTouchingByIndex = new Map<number, boolean>();
  private debugTrackWireframeEnabled = false;
  private debugPhysicsWireframeEnabled = false;
  private debugCloudCountOverlayEnabled = false;
  private debugPhysicsPanelEnabled = false;
  private debugThudTraceEnabled = false;
  private cloudSpriteCount = 0;
  private thudDebugEntries: string[] = [];
  private thudTraceFlashTimer = 0;
  private trackWireframeObjects: THREE.LineSegments[] = [];
  private physicsWireframeObjects: THREE.LineSegments[] = [];
  private activeSwipePointerId: number | null = null;
  private swipeStartClient = new THREE.Vector2();
  private swipeCurrentClient = new THREE.Vector2();
  private swipePreviousClient = new THREE.Vector2();
  private swipeStartTimeMs = 0;
  private swipeLastMoveTimeMs = 0;
  private swipeDirection = new THREE.Vector3();
  private pendingSwipeImpulse = new THREE.Vector3();
  private swipeStrength = 0;
  private readonly swipeDeadZonePx = 12;
  private readonly swipeMaxDistancePx = 210;
  private readonly swipeIndicatorRadiusPx = 34;
  private readonly swipeMaxDurationMs = 1000;
  private readonly swipeVelocityForMaxPxPerSec = 2000;
  private readonly swipePerMoveDistanceForMaxPx = 96;
  private readonly swipeBurstMinImpulse = 2.025;
  private readonly swipeBurstMaxImpulse = 15.75;
  private readonly swipeBurstStrengthExponent = 0.95;

  private soundManager: SoundManager;
  private lastSettingsToggleAtMs = 0;

  public constructor(canvas: HTMLCanvasElement) {
    this.soundManager = new SoundManager(() => this.settings);
    this.canvas = canvas;
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#8fd3ff");

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1400);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.isMobile ? 1.75 : 2),
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.startScreen = this.requireElement("start-screen");
    this.gameOverScreen = this.requireElement("game-over-screen");
    this.settingsModal = this.requireElement("settings-modal");
    this.settingsPaneAudio = this.requireElement("settings-pane-audio");
    this.settingsPaneDesigner = document.getElementById("settings-pane-designer");
    this.settingsPaneRepeat = document.getElementById("settings-pane-repeat");
    this.settingsPaneObstacles = document.getElementById("settings-pane-obstacles");
    this.settingsPaneDebug = document.getElementById("settings-pane-debug");
    this.settingsTabAudio = document.getElementById(
      "settings-tab-audio",
    ) as HTMLButtonElement | null;
    this.settingsTabDesigner = document.getElementById(
      "settings-tab-designer",
    ) as HTMLButtonElement | null;
    this.settingsTabRepeat = document.getElementById(
      "settings-tab-repeat",
    ) as HTMLButtonElement | null;
    this.settingsTabObstacles = document.getElementById(
      "settings-tab-obstacles",
    ) as HTMLButtonElement | null;
    this.settingsTabDebug = document.getElementById(
      "settings-tab-debug",
    ) as HTMLButtonElement | null;
    this.designerList = document.getElementById("designer-list");
    this.designerMeta = document.getElementById("designer-meta");
    this.designerSpawnButton = document.getElementById(
      "designer-spawn",
    ) as HTMLButtonElement | null;
    this.obstacleFocusSelect = document.getElementById(
      "obstacle-focus-select",
    ) as HTMLSelectElement | null;
    this.obstacleFocusSpawnButton = document.getElementById(
      "obstacle-focus-spawn",
    ) as HTMLButtonElement | null;
    this.designerRepeatSelect = document.getElementById(
      "designer-repeat-select",
    ) as HTMLSelectElement | null;
    this.designerRepeatMeta = document.getElementById("designer-repeat-meta");
    this.designerRepeatSpawnButton = document.getElementById(
      "designer-repeat-spawn",
    ) as HTMLButtonElement | null;
    this.debugTrackWireToggleButton = document.getElementById(
      "debug-track-wire-toggle",
    ) as HTMLButtonElement | null;
    this.debugPhysicsWireToggleButton = document.getElementById(
      "debug-physics-wire-toggle",
    ) as HTMLButtonElement | null;
    this.debugCloudCountToggleButton = document.getElementById(
      "debug-cloud-count-toggle",
    ) as HTMLButtonElement | null;
    this.debugPhysicsPanelToggleButton = document.getElementById(
      "debug-physics-panel-toggle",
    ) as HTMLButtonElement | null;
    this.debugThudTraceToggleButton = document.getElementById(
      "debug-thud-trace-toggle",
    ) as HTMLButtonElement | null;
    this.debugCubeLevelSpawnButton = document.getElementById(
      "debug-cube-level-spawn",
    ) as HTMLButtonElement | null;
    this.hud = this.requireElement("hud");
    this.swipeOverlay = this.requireElement("mobile-controls");
    this.swipeHandle = this.requireElement("swipe-handle");
    this.swipePowerLabel = this.requireElement("swipe-power-label");
    this.settingsButton = this.requireElement("settings-btn");
    this.restartButton = this.requireElement("restart-btn");
    this.timeLabel = this.requireElement("time-label");
    this.speedLabel = this.requireElement("speed-label");
    this.levelProgressMarble = this.requireElement("level-progress-marble");
    this.levelProgressMarkers = this.requireElement("level-progress-markers");
    this.resultLabel = this.requireElement("result-label");
    this.versionLabel = this.requireElement("version-label");
    this.fpsLabel = this.requireElement("fps-label");
    this.versionLabel.textContent = "Build " + BUILD_VERSION;
    this.fpsLabel.textContent = "FPS 0";
    this.physicsDebugPanel = document.createElement("pre");
    this.physicsDebugPanel.style.position = "fixed";
    this.physicsDebugPanel.style.top = "50%";
    this.physicsDebugPanel.style.right = "16px";
    this.physicsDebugPanel.style.transform = "translateY(-50%)";
    this.physicsDebugPanel.style.zIndex = "120";
    this.physicsDebugPanel.style.margin = "0";
    this.physicsDebugPanel.style.padding = "10px 12px";
    this.physicsDebugPanel.style.maxWidth = this.isMobile ? "78vw" : "420px";
    this.physicsDebugPanel.style.whiteSpace = "pre-wrap";
    this.physicsDebugPanel.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    this.physicsDebugPanel.style.fontSize = this.isMobile ? "11px" : "12px";
    this.physicsDebugPanel.style.lineHeight = "1.35";
    this.physicsDebugPanel.style.background = "rgba(4, 12, 24, 0.72)";
    this.physicsDebugPanel.style.color = "#cfe6ff";
    this.physicsDebugPanel.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    this.physicsDebugPanel.style.borderRadius = "8px";
    this.physicsDebugPanel.style.pointerEvents = "none";
    this.physicsDebugPanel.innerHTML =
      "<span style=\"color:#9fc3e7\">Physics debug panel ready</span>";
    document.body.appendChild(this.physicsDebugPanel);
    this.cloudDebugPanel = document.createElement("div");
    this.cloudDebugPanel.style.position = "fixed";
    this.cloudDebugPanel.style.top = "120px";
    this.cloudDebugPanel.style.right = "16px";
    this.cloudDebugPanel.style.zIndex = "120";
    this.cloudDebugPanel.style.margin = "0";
    this.cloudDebugPanel.style.padding = "8px 10px";
    this.cloudDebugPanel.style.maxWidth = "320px";
    this.cloudDebugPanel.style.fontFamily =
      "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    this.cloudDebugPanel.style.fontSize = "12px";
    this.cloudDebugPanel.style.lineHeight = "1.25";
    this.cloudDebugPanel.style.background = "rgba(4, 12, 24, 0.72)";
    this.cloudDebugPanel.style.color = "#cfe6ff";
    this.cloudDebugPanel.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    this.cloudDebugPanel.style.borderRadius = "8px";
    this.cloudDebugPanel.style.pointerEvents = "none";
    this.cloudDebugPanel.style.display = "none";
    this.cloudDebugPanel.textContent = "Clouds: 0";
    document.body.appendChild(this.cloudDebugPanel);
    this.thudDebugPanel = document.createElement("pre");
    this.thudDebugPanel.style.position = "fixed";
    this.thudDebugPanel.style.left = "16px";
    this.thudDebugPanel.style.bottom = "84px";
    this.thudDebugPanel.style.zIndex = "120";
    this.thudDebugPanel.style.margin = "0";
    this.thudDebugPanel.style.padding = "8px 10px";
    this.thudDebugPanel.style.maxWidth = this.isMobile ? "88vw" : "420px";
    this.thudDebugPanel.style.maxHeight = this.isMobile ? "34vh" : "260px";
    this.thudDebugPanel.style.overflow = "auto";
    this.thudDebugPanel.style.whiteSpace = "pre-wrap";
    this.thudDebugPanel.style.fontFamily =
      "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    this.thudDebugPanel.style.fontSize = this.isMobile ? "10px" : "11px";
    this.thudDebugPanel.style.lineHeight = "1.3";
    this.thudDebugPanel.style.background = "rgba(4, 12, 24, 0.72)";
    this.thudDebugPanel.style.color = "#cfe6ff";
    this.thudDebugPanel.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    this.thudDebugPanel.style.borderRadius = "8px";
    this.thudDebugPanel.style.pointerEvents = "none";
    this.thudDebugPanel.style.display = "none";
    this.thudDebugPanel.style.transition = "color 120ms ease, border-color 120ms ease, background 120ms ease";
    this.thudDebugPanel.textContent = "Thud trace ready";
    document.body.appendChild(this.thudDebugPanel);

    this.settings = this.loadSettings();
    this.persistentState = this.loadPersistentState();
    this.designedMiddleTypes = this.getDefaultDesignerMiddleTypes();

    const marbleGeometry = new THREE.SphereGeometry(this.marbleRadius, 32, 24);
    this.marbleMaterial = new THREE.MeshStandardMaterial({
      color: "#e8f1ff",
      roughness: 0.28,
      metalness: 0.16,
    });
    this.trackMaterial = new THREE.MeshPhysicalMaterial({
      color: "#dfc092",
      roughness: 0.62,
      metalness: 0.04,
      clearcoat: 0.3,
      clearcoatRoughness: 0.42,
    });
    this.marbleMesh = new THREE.Mesh(marbleGeometry, this.marbleMaterial);
    this.marbleMesh.castShadow = true;
    this.marbleMesh.receiveShadow = true;
    this.scene.add(this.marbleMesh);
    this.marbleVisuals = new MarbleVisualController(this.scene, {
      trailSpawnInterval: this.trailSpawnInterval,
      trailMaxPoints: this.trailMaxPoints,
    });

    this.loadMarbleTexture();
    this.loadTileTexture();

    this.levelConfig = this.createRandomLevelConfig();
    this.fireworkTriggerZ = this.levelConfig.fireworkZ;
    this.runObstacleOrder =
      this.forcedRunObstacleOrder && this.forcedRunObstacleOrder.length > 0
        ? this.forcedRunObstacleOrder.slice()
        : createRunObstacleOrder();
    console.log(
      "[InitializeRunObstacleOrder]",
      "Run obstacle order=" + this.runObstacleOrder.join(","),
    );
    this.rebuildLevelProgressMarkers();
    this.buildTrackSlices();
    this.buildRunObstacles();
    this.setupSceneVisuals();
    this.bindUi();
    this.bindInput();
    this.initializeDesignerUi();
    this.initializeDesignerRepeatUi();
    this.initializeObstacleFocusUi();
    this.initializeDebugToolsUi();
    this.setSettingsTab("audio");
    this.applySettingsUi();
    this.applyUiForState();
    this.emitScoreConfig();
    this.resetSwipeInput(true);
    this.handleResize();
    this.registerLifecycleHandlers();

    window.addEventListener("resize", () => this.handleResize());
    console.log(
      "[Constructor]",
      "Marble Madness starter created (build " + BUILD_VERSION + ")",
    );
  }

  public async init(): Promise<void> {
    await RAPIER.init();
    this.world = createPhysicsWorld(this.fixedStep);

    this.createTrackPhysics();
    this.createMarblePhysics();
    this.resetMarble();

    this.startLoop();
    console.log("[Init]", "Rapier world initialized");
  }

  private registerLifecycleHandlers(): void {
    oasiz.onPause(() => {
      this.resetSwipeInput(true);
      this.soundManager.pause();
      this.stopLoop();
      console.log("[OnPause]", "Paused render loop");
    });
    oasiz.onResume(() => {
      this.soundManager.resume();
      this.startLoop();
      console.log("[OnResume]", "Resumed render loop");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.resetSwipeInput(true);
        this.soundManager.pause();
        this.stopLoop();
        console.log("[VisibilityChange]", "Document hidden, stopped render loop");
      } else {
        this.soundManager.resume();
        this.startLoop();
        console.log("[VisibilityChange]", "Document visible, resumed render loop");
      }
    });
  }

  private startLoop(): void {
    if (this.animationFrameId) {
      return;
    }
    this.lastFrameSeconds = performance.now() / 1000;
    this.animationFrameId = window.requestAnimationFrame((timeMs) =>
      this.frame(timeMs),
    );
  }

  private stopLoop(): void {
    if (!this.animationFrameId) {
      return;
    }
    window.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
  }

  private requireElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error("Missing element with id " + id);
    }
    return element;
  }

  private loadMarbleTexture(): void {
    const loader = new THREE.TextureLoader();
    loader.load(
      "/assets/marble-texture.jpg",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1.2, 1.2);
        this.marbleMaterial.map = texture;
        this.marbleMaterial.roughness = 0.24;
        this.marbleMaterial.metalness = 0.08;
        this.marbleMaterial.needsUpdate = true;
        console.log(
          "[LoadMarbleTexture]",
          "Loaded marble texture from /assets/marble-texture.jpg",
        );
      },
      undefined,
      () => {
        console.log(
          "[LoadMarbleTexture]",
          "Texture file not found, using fallback marble material",
        );
      },
    );
  }

  private loadTileTexture(): void {
    const loader = new THREE.TextureLoader();
    loader.load(
      "/assets/tile-texture.jpg",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        this.trackMaterial.map = texture;
        this.trackMaterial.roughness = 0.54;
        this.trackMaterial.metalness = 0.05;
        this.trackMaterial.clearcoat = 0.34;
        this.trackMaterial.clearcoatRoughness = 0.36;
        this.trackMaterial.needsUpdate = true;
        console.log(
          "[LoadTileTexture]",
          "Loaded tile texture from /assets/tile-texture.jpg",
        );
      },
      undefined,
      () => {
        console.log(
          "[LoadTileTexture]",
          "Tile texture not found, using fallback track material",
        );
      },
    );
  }

  private smooth01(t: number): number {
    return t * t * (3 - 2 * t);
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private getDefaultDesignerMiddleTypes(): PlatformType[] {
    return getDefaultDesignerMiddleTypesData();
  }

  private getPlatformTypeLabel(type: PlatformType): string {
    return getPlatformTypeLabelData(type);
  }

  private isDesignerSelectableType(value: string): value is PlatformType {
    return this.designerSelectableTypes.includes(value as PlatformType);
  }

  private isSpiralType(type: PlatformType): boolean {
    return isSpiralTypeData(type);
  }

  private isDownwardSlopeType(type: PlatformType): boolean {
    return isDownwardSlopeTypeData(type);
  }

  private createRandomLevelConfig(
    forcedMiddleTypes: PlatformType[] | null = null,
  ): LevelConfig {
    const levelConfig = createRandomLevelConfigData({
      loopsCompleted: this.loopsCompleted,
      startZ: this.startZ,
      finishZ: this.baseFinishZ,
      trackWidth: this.trackWidth,
      downhillSlopeAngle: this.downhillSlopeAngle,
      uphillSlopeAngle: this.uphillSlopeAngle,
      spiralRadius: this.spiralRadius,
      spiralEntryLength: this.spiralEntryLength,
      spiralExitLength: this.spiralExitLength,
      forcedMiddleTypes,
      randomRange: (min: number, max: number) => this.randomRange(min, max),
    });
    const finalSection = levelConfig.sections[levelConfig.sections.length - 1];
    this.finishZ = finalSection ? finalSection.zEnd : this.baseFinishZ;
    const typeLog = levelConfig.sections.map((section) => section.type);
    const mode = forcedMiddleTypes && forcedMiddleTypes.length > 0
      ? "custom"
      : "random";
    console.log(
      "[CreateRandomLevelConfig]",
      "platformCount=" + String(levelConfig.platformCount) + " mode=" + mode + " types=" +
        typeLog.join(" > "),
    );
    return levelConfig;
  }

  private getSectionAtZ(z: number): PlatformSection {
    return getSectionAtZData(this.levelConfig, this.finishZ, this.startZ, z);
  }

  private getSectionProgressT(section: PlatformSection, z: number): number {
    return getSectionProgressTData(section, z);
  }

  private getSpiralRadius(section: PlatformSection): number {
    return getSpiralRadiusData(section);
  }

  private sampleSpiralProgressT(section: PlatformSection, z: number): number {
    return sampleSpiralProgressTData(section, z);
  }

  private sampleTrackX(z: number): number {
    return sampleTrackXData(this.levelConfig, this.finishZ, this.startZ, z);
  }

  private sampleTrackCenterAtSectionT(
    section: PlatformSection,
    t: number,
    nominalZ: number,
  ): { x: number; z: number } {
    return sampleTrackCenterAtSectionTData(section, t, nominalZ);
  }

  private getTrackSampleAtArcLength(s: number): TrackSample {
    if (this.trackSamples.length === 0) {
      return {
        s: 0,
        nominalZ: this.startZ,
        z: this.startZ,
        x: 0,
        y: this.trackCenterY + this.trackThickness * 0.5,
        tilt: 0,
        width: this.trackWidth,
        hasFloor: true,
        sectionIndex: 0,
      };
    }
    if (s <= 0) {
      return this.trackSamples[0];
    }
    if (s >= this.trackArcLength) {
      return this.trackSamples[this.trackSamples.length - 1];
    }
    let low = 0;
    let high = this.trackSamples.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) * 0.5);
      const value = this.trackSamples[mid].s;
      if (value < s) {
        low = mid + 1;
      } else if (value > s) {
        high = mid - 1;
      } else {
        return this.trackSamples[mid];
      }
    }
    const upperIndex = THREE.MathUtils.clamp(low, 1, this.trackSamples.length - 1);
    const lower = this.trackSamples[upperIndex - 1];
    const upper = this.trackSamples[upperIndex];
    const span = Math.max(0.0001, upper.s - lower.s);
    const t = THREE.MathUtils.clamp((s - lower.s) / span, 0, 1);
    return {
      s,
      nominalZ: THREE.MathUtils.lerp(lower.nominalZ, upper.nominalZ, t),
      z: THREE.MathUtils.lerp(lower.z, upper.z, t),
      x: THREE.MathUtils.lerp(lower.x, upper.x, t),
      y: THREE.MathUtils.lerp(lower.y, upper.y, t),
      tilt: THREE.MathUtils.lerp(lower.tilt, upper.tilt, t),
      width: THREE.MathUtils.lerp(lower.width, upper.width, t),
      hasFloor: lower.hasFloor && upper.hasFloor,
      sectionIndex: t < 0.5 ? lower.sectionIndex : upper.sectionIndex,
    };
  }

  private getNearestTrackSampleIndex(x: number, z: number): number {
    if (this.trackSamples.length === 0) {
      return 0;
    }
    let bestIndex = 0;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.trackSamples.length; i += 1) {
      const sample = this.trackSamples[i];
      const dx = sample.x - x;
      const dz = sample.z - z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  private getNearestTrackSample(x: number, z: number): TrackSample {
    const index = this.getNearestTrackSampleIndex(x, z);
    return this.trackSamples[index] ?? this.getTrackSampleAtArcLength(0);
  }

  private getTrackSurfaceYAtArcLength(s: number): number {
    return this.getTrackSampleAtArcLength(s).y;
  }

  private getTrackWidthAtArcLength(s: number): number {
    return this.getTrackSampleAtArcLength(s).width;
  }

  private hasFloorAtArcLength(s: number): boolean {
    return this.getTrackSampleAtArcLength(s).hasFloor;
  }

  private getTrackTiltAtArcLength(s: number): number {
    const sample = this.getTrackSampleAtArcLength(s);
    return sample.tilt;
  }

  private getTrackForwardDirectionAtArcLength(s: number): THREE.Vector3 {
    const step = 2.4;
    const clampedS = THREE.MathUtils.clamp(s, 0, this.trackArcLength);
    const a = this.getTrackSampleAtArcLength(clampedS);
    const nextS = THREE.MathUtils.clamp(clampedS + step, 0, this.trackArcLength);
    const prevS = THREE.MathUtils.clamp(clampedS - step, 0, this.trackArcLength);
    const b = nextS > clampedS
      ? this.getTrackSampleAtArcLength(nextS)
      : this.getTrackSampleAtArcLength(prevS);
    const directionSign = nextS > clampedS ? 1 : -1;
    const forward = new THREE.Vector3(
      (b.x - a.x) * directionSign,
      0,
      (b.z - a.z) * directionSign,
    );
    if (forward.lengthSq() < 0.0001) {
      return new THREE.Vector3(0, 0, -1);
    }
    return forward.normalize();
  }

  private getTrackForwardDirectionAtPosition(x: number, z: number): THREE.Vector3 {
    const nearest = this.getNearestTrackSample(x, z);
    return this.getTrackForwardDirectionAtArcLength(nearest.s);
  }

  private getArcLengthFromNominalZ(nominalZ: number): number {
    if (this.trackSamples.length === 0) {
      return 0;
    }
    let bestIndex = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.trackSamples.length; i += 1) {
      const delta = Math.abs(this.trackSamples[i].nominalZ - nominalZ);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }
    return this.trackSamples[bestIndex].s;
  }

  private sampleTrackSlope(z: number): number {
    return sampleTrackSlopeData(
      this.levelConfig,
      this.finishZ,
      this.startZ,
      z,
      this.slopeBlendDistance,
      this.uphillSlopeAngle,
      this.downhillSlopeAngle,
    );
  }

  private sampleTrackWidth(z: number): number {
    return sampleTrackWidthData(this.levelConfig, this.finishZ, this.startZ, z);
  }

  private hasFloorAtZ(z: number): boolean {
    return hasFloorAtZData(this.levelConfig, this.finishZ, this.startZ, z);
  }

  private buildTrackSlices(): void {
    const result = buildTrackSlicesData({
      levelConfig: this.levelConfig,
      startZ: this.startZ,
      finishZ: this.finishZ,
      trackCenterY: this.trackCenterY,
      trackThickness: this.trackThickness,
      trackWidth: this.trackWidth,
      trackStep: this.trackStep,
      slopeBlendDistance: this.slopeBlendDistance,
      uphillSlopeAngle: this.uphillSlopeAngle,
      downhillSlopeAngle: this.downhillSlopeAngle,
      fireworkTriggerZ: this.fireworkTriggerZ,
      loseY: this.loseY,
      loseBoundaryDrop: this.loseBoundaryDrop,
    });
    this.trackSamples.length = 0;
    this.trackSamples.push(...result.trackSamples);
    this.trackSlices.length = 0;
    this.trackSlices.push(...result.trackSlices);
    this.sectionArcRanges.length = 0;
    this.sectionArcRanges.push(...result.sectionArcRanges);
    this.trackArcLength = result.trackArcLength;
    this.fireworkTriggerS = result.fireworkTriggerS;
    this.currentLoseY = result.currentLoseY;
    this.validateTrackSeams();
    console.log("[BuildTrackSlices]", "Generated tile course slices");
  }

  private validateTrackSeams(): void {
    if (this.trackSamples.length < 2 || this.trackSlices.length < 1) {
      console.log("[ValidateTrackSeams]", "Skipped - insufficient samples");
      return;
    }

    const positionTolerance = 0.0001;
    const arcTolerance = 0.0001;
    let maxSliceJoinDelta = 0;
    let maxSliceArcJoinDelta = 0;
    let maxSampleToSliceDelta = 0;

    for (let i = 1; i < this.trackSlices.length; i += 1) {
      const previous = this.trackSlices[i - 1];
      const current = this.trackSlices[i];
      const joinDelta = Math.max(
        Math.abs(previous.xEnd - current.xStart),
        Math.abs(previous.yEnd - current.yStart),
        Math.abs(previous.zEnd - current.zStart),
      );
      const arcDelta = Math.abs(previous.sEnd - current.sStart);
      maxSliceJoinDelta = Math.max(maxSliceJoinDelta, joinDelta);
      maxSliceArcJoinDelta = Math.max(maxSliceArcJoinDelta, arcDelta);
    }

    const compareCount = Math.min(
      this.trackSlices.length,
      this.trackSamples.length - 1,
    );
    for (let i = 0; i < compareCount; i += 1) {
      const slice = this.trackSlices[i];
      const sampleStart = this.trackSamples[i];
      const sampleEnd = this.trackSamples[i + 1];
      const startDelta = Math.max(
        Math.abs(slice.xStart - sampleStart.x),
        Math.abs(slice.yStart - sampleStart.y),
        Math.abs(slice.zStart - sampleStart.z),
      );
      const endDelta = Math.max(
        Math.abs(slice.xEnd - sampleEnd.x),
        Math.abs(slice.yEnd - sampleEnd.y),
        Math.abs(slice.zEnd - sampleEnd.z),
      );
      maxSampleToSliceDelta = Math.max(
        maxSampleToSliceDelta,
        startDelta,
        endDelta,
      );
    }

    const hasJoinIssue =
      maxSliceJoinDelta > positionTolerance ||
      maxSliceArcJoinDelta > arcTolerance ||
      maxSampleToSliceDelta > positionTolerance;

    if (hasJoinIssue) {
      console.log(
        "[ValidateTrackSeams]",
        "WARNING joinDelta=" +
          maxSliceJoinDelta.toFixed(6) +
          " arcDelta=" +
          maxSliceArcJoinDelta.toFixed(6) +
          " sampleSliceDelta=" +
          maxSampleToSliceDelta.toFixed(6),
      );
      return;
    }

    console.log(
      "[ValidateTrackSeams]",
      "OK joinDelta=" +
        maxSliceJoinDelta.toFixed(6) +
        " arcDelta=" +
        maxSliceArcJoinDelta.toFixed(6) +
        " sampleSliceDelta=" +
        maxSampleToSliceDelta.toFixed(6),
    );
  }

  private getSliceAtZ(z: number): TrackSlice {
    if (this.trackSlices.length === 0) {
      return {
        sStart: 0,
        sEnd: 0,
        zStart: this.startZ,
        zEnd: this.startZ - this.trackStep,
        xStart: 0,
        xEnd: 0,
        yStart: this.trackCenterY,
        yEnd: this.trackCenterY,
        centerZ: this.startZ - this.trackStep * 0.5,
        centerX: 0,
        centerY: this.trackCenterY - this.trackThickness * 0.5,
        length: this.trackStep,
        horizontalLength: this.trackStep,
        tilt: 0,
        yaw: 0,
        width: this.trackWidth,
        hasFloor: true,
      };
    }
    let best = this.trackSlices[0];
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const slice of this.trackSlices) {
      const delta = Math.abs(slice.centerZ - z);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = slice;
      }
    }
    return best;
  }

  private getTrackTiltAtZ(z: number): number {
    return this.getTrackTiltAtArcLength(this.getArcLengthFromNominalZ(z));
  }

  private getStartSpawnArcLength(): number {
    const firstFloorSectionIndex = this.levelConfig.sections.findIndex((section) =>
      section.hasFloor
    );
    if (firstFloorSectionIndex < 0) {
      return 0;
    }
    const arcRange = this.sectionArcRanges[firstFloorSectionIndex];
    if (!arcRange) {
      return 0;
    }
    if (arcRange.sEnd <= arcRange.sStart) {
      return arcRange.sStart;
    }
    return (arcRange.sStart + arcRange.sEnd) * 0.5;
  }

  private setupSceneVisuals(): void {
    const hemi = new THREE.HemisphereLight("#d8ebff", "#6a89ad", 1.26);
    this.addLevelObject(hemi);

    const sunLight = new THREE.DirectionalLight("#fff9df", 3.78);
    sunLight.position.set(-64, 186, -276);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.00015;
    sunLight.shadow.normalBias = 0.02;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 600;
    sunLight.shadow.camera.left = -220;
    sunLight.shadow.camera.right = 220;
    sunLight.shadow.camera.top = 220;
    sunLight.shadow.camera.bottom = -220;
    sunLight.target.position.set(0, 24, -150);
    this.addLevelObject(sunLight.target);
    this.addLevelObject(sunLight);

    this.addPlatformRunMeshes();
    this.addSpiralSupportColumns();
    this.addHorizontalBlockerMeshes();
    addWaveObstacleMeshesData({
      rotatorObstacles: this.rotatorObstacles,
      pinballBouncers: this.pinballBouncers,
      bouncyPads: this.bouncyPads,
      swingingHammers: this.swingingHammers,
      fallingPlatforms: this.fallingPlatforms,
      obstacleMeshById: this.obstacleMeshById,
      bouncyPadPaddleById: this.bouncyPadPaddleById,
      bouncerCapById: this.bouncerCapById,
      bouncerPulseById: this.bouncerPulseById,
      addLevelObject: (object) => this.addLevelObject(object),
    });

    const finishStrip = new THREE.Group();
    const stripeCount = 12;
    const stripeWidth = (this.trackWidth * 0.96) / stripeCount;
    for (let i = 0; i < stripeCount; i += 1) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(stripeWidth, 0.16, 1.6),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? "#f8fbff" : "#1c2a3a",
          emissive: i % 2 === 0 ? "#cde1ff" : "#000000",
          emissiveIntensity: i % 2 === 0 ? 0.12 : 0,
        }),
      );
      const x = -this.trackWidth * 0.48 + stripeWidth * 0.5 + i * stripeWidth;
      stripe.position.set(x, 0, 0);
      finishStrip.add(stripe);
    }
    const finishCenterX = this.sampleTrackX(this.finishZ);
    finishStrip.rotation.x = -this.getTrackTiltAtZ(this.finishZ);
    finishStrip.position.set(
      finishCenterX,
      this.getTrackSurfaceY(this.finishZ) + 0.08,
      this.finishZ,
    );
    this.addLevelObject(finishStrip);

    const finishFrameMaterial = new THREE.MeshStandardMaterial({
      color: "#1b2f4e",
      roughness: 0.5,
      metalness: 0.3,
    });
    const finishPillarLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 8.5, 0.8),
      finishFrameMaterial,
    );
    finishPillarLeft.rotation.x = -this.getTrackTiltAtZ(this.finishZ);
    finishPillarLeft.position.set(
      finishCenterX - this.trackWidth * 0.5 + 0.8,
      this.getTrackSurfaceY(this.finishZ) + 4.2,
      this.finishZ,
    );
    this.addLevelObject(finishPillarLeft);

    const finishPillarRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 8.5, 0.8),
      finishFrameMaterial,
    );
    finishPillarRight.rotation.x = -this.getTrackTiltAtZ(this.finishZ);
    finishPillarRight.position.set(
      finishCenterX + this.trackWidth * 0.5 - 0.8,
      this.getTrackSurfaceY(this.finishZ) + 4.2,
      this.finishZ,
    );
    this.addLevelObject(finishPillarRight);

    const finishTopBeam = new THREE.Mesh(
      new THREE.BoxGeometry(this.trackWidth - 1, 0.9, 0.9),
      new THREE.MeshStandardMaterial({
        color: "#2e4b73",
        roughness: 0.5,
        metalness: 0.28,
      }),
    );
    finishTopBeam.rotation.x = -this.getTrackTiltAtZ(this.finishZ);
    finishTopBeam.position.set(
      finishCenterX,
      this.getTrackSurfaceY(this.finishZ) + 8.6,
      this.finishZ,
    );
    this.addLevelObject(finishTopBeam);

    this.addCloudBackdrop();
    this.addFinishTriggerCubes();
    this.addDebugBoundaryMarkers();
    this.addDebugPlatformLabels();
  }

  private createDebugPlatformLabelSprite(lines: string[]): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 760;
    canvas.height = 216;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      const fallbackTexture = new THREE.CanvasTexture(canvas);
      const fallbackMaterial = new THREE.SpriteMaterial({
        map: fallbackTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      return new THREE.Sprite(fallbackMaterial);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(6, 12, 30, 0.84)";
    ctx.strokeStyle = "rgba(146, 185, 255, 0.82)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 18);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#eaf3ff";
    ctx.font = "700 34px Trebuchet MS";
    ctx.textBaseline = "top";
    ctx.fillText(lines[0] ?? "", 24, 20);

    ctx.fillStyle = "#c5dcff";
    ctx.font = "600 28px Trebuchet MS";
    ctx.fillText(lines[1] ?? "", 24, 78);
    ctx.fillText(lines[2] ?? "", 24, 132);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(8.4, 2.4, 1);
    sprite.renderOrder = 24;
    return sprite;
  }

  private getDebugSectionDetails(section: PlatformSection): string {
    const parts: string[] = [];
    parts.push("Slope " + THREE.MathUtils.radToDeg(section.slope).toFixed(1) + "deg");
    if (!section.hasFloor) {
      parts.push("Gap");
    }
    if (
      section.type === "detour_left_short" ||
      section.type === "detour_right_short"
    ) {
      parts.push(
        "Detour " +
          (section.detourDirection < 0 ? "L" : "R") +
          " " +
          section.detourMagnitude.toFixed(1),
      );
    }
    if (this.isSpiralType(section.type)) {
      parts.push(
        "Spiral " +
          (section.type === "spiral_down_left" ? "L" : "R") +
          " " +
          section.detourMagnitude.toFixed(1),
      );
    }
    return parts.join(" | ");
  }

  private addDebugPlatformLabels(): void {
    this.debugPlatformLabels = [];
    if (this.isMobile) {
      return;
    }

    for (let index = 0; index < this.levelConfig.sections.length; index += 1) {
      const section = this.levelConfig.sections[index];
      const centerZ = (section.zStart + section.zEnd) * 0.5;
      const centerX = this.sampleTrackX(centerZ);
      const side = index % 2 === 0 ? 1 : -1;
      const labelX = centerX + side * (section.width * 0.5 + 4.4);
      const labelY = this.getTrackSurfaceYAtPosition(labelX, centerZ) + 3.2;
      const length = Math.max(0.001, section.zStart - section.zEnd);
      const lines = [
        String(index + 1) + ". " + this.getPlatformTypeLabel(section.type),
        "Len " + length.toFixed(1) + " | Width " + section.width.toFixed(1),
        this.getDebugSectionDetails(section),
      ];
      const label = this.createDebugPlatformLabelSprite(lines);
      label.position.set(labelX, labelY, centerZ);
      this.debugPlatformLabels.push(label);
      this.addLevelObject(label);
    }

    this.updateDebugPlatformLabelVisibility();
    console.log(
      "[AddDebugPlatformLabels]",
      "Debug labels added: " + String(this.debugPlatformLabels.length),
    );
  }

  private createDebugBoundaryMarker(z: number, width: number): THREE.Line {
    const centerX = this.sampleTrackX(z);
    const y = this.getTrackSurfaceY(z) + 0.22;
    const half = width * 0.56 + this.wallThickness * 0.25;
    const points = [
      new THREE.Vector3(centerX - half, y, z),
      new THREE.Vector3(centerX + half, y, z),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: "#ff3b3b",
      dashSize: 0.7,
      gapSize: 0.45,
      linewidth: 1,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    line.renderOrder = 30;
    return line;
  }

  private addDebugBoundaryMarkers(): void {
    this.debugBoundaryMarkers = [];
    if (this.isMobile) {
      return;
    }

    const boundaries = new Map<string, { z: number; width: number }>();
    for (const section of this.levelConfig.sections) {
      const startKey = section.zStart.toFixed(3);
      const endKey = section.zEnd.toFixed(3);
      if (!boundaries.has(startKey)) {
        boundaries.set(startKey, { z: section.zStart, width: section.width });
      }
      if (!boundaries.has(endKey)) {
        boundaries.set(endKey, { z: section.zEnd, width: section.width });
      }
    }

    for (const boundary of boundaries.values()) {
      const marker = this.createDebugBoundaryMarker(boundary.z, boundary.width);
      this.debugBoundaryMarkers.push(marker);
      this.addLevelObject(marker);
    }

    this.updateDebugPlatformLabelVisibility();
    console.log(
      "[AddDebugBoundaryMarkers]",
      "Debug boundaries added: " + String(this.debugBoundaryMarkers.length),
    );
  }

  private updateDebugPlatformLabelVisibility(): void {
    const visible = this.debugFlyMode && this.gameState === "playing";
    for (const label of this.debugPlatformLabels) {
      label.visible = visible;
    }
    for (const marker of this.debugBoundaryMarkers) {
      marker.visible = visible;
    }
  }

  private buildHorizontalBlockers(maxPerLevel: number = this.blockerMaxPerLevel): void {
    this.horizontalBlockers = [];
    this.blockerHitAtByIndex.clear();
    this.blockerTouchingByIndex.clear();
    const blockerLength = this.trackWidth / 3;
    const candidateSections = this.levelConfig.sections
      .map((section, index) => ({ section, index }))
      .filter(
        ({ section }) =>
        section.hasFloor &&
        section.type !== "start" &&
        section.type !== "end" &&
        section.type !== "bottleneck" &&
        section.type !== "jump" &&
        section.type !== "slope_down_soft" &&
        section.type !== "slope_down_steep" &&
        section.type !== "spiral_down_left" &&
        section.type !== "spiral_down_right" &&
        section.zStart - section.zEnd > 8,
      );

    let lastBlockerS = Number.NEGATIVE_INFINITY;
    for (const entry of candidateSections) {
      if (this.horizontalBlockers.length >= maxPerLevel) {
        break;
      }
      if (Math.random() < 0.46) {
        continue;
      }

      const arcRange = this.sectionArcRanges[entry.index];
      if (!arcRange) {
        continue;
      }
      const sectionSpan = Math.max(0, arcRange.sEnd - arcRange.sStart);
      const sectionEntrySafeDistance = Math.max(
        this.obstacleSectionEntrySafeDistanceMin,
        sectionSpan * this.obstacleSectionEntrySafeRatio,
      );
      const sMin = arcRange.sStart + sectionEntrySafeDistance;
      const sMax = arcRange.sEnd - 3;
      if (sMax <= sMin) {
        continue;
      }
      const s = this.randomRange(sMin, sMax);
      if (Math.abs(lastBlockerS - s) < this.blockerMinSpacing) {
        continue;
      }
      if (s < this.obstacleStartSafeDistance) {
        continue;
      }
      if (this.trackArcLength - s < this.obstacleFinishSafeDistance) {
        continue;
      }
      if (Math.abs(s - this.fireworkTriggerS) < 10) {
        continue;
      }

      const sample = this.getTrackSampleAtArcLength(s);
      const widthAtS = sample.width;
      const usableInnerWidth = widthAtS - this.blockerSideMargin * 2;
      if (usableInnerWidth <= this.blockerGapWidth + blockerLength + 0.4) {
        continue;
      }

      const innerLeft = -widthAtS * 0.5 + this.blockerSideMargin;
      const innerRight = widthAtS * 0.5 - this.blockerSideMargin;

      const placeLeftSegment = Math.random() < 0.5;
      const segmentLeft = placeLeftSegment
        ? innerLeft
        : innerRight - blockerLength;
      const segmentRight = placeLeftSegment
        ? innerLeft + blockerLength
        : innerRight;
      if (segmentRight - segmentLeft < blockerLength - 0.01) {
        continue;
      }

      const z = sample.z;
      const x = sample.x + (segmentLeft + segmentRight) * 0.5;
      const y =
        this.getTrackSurfaceYAtPosition(x, z) +
        this.trackThickness * 0.5 +
        this.blockerHeight * 0.5;
      const tilt = this.getTrackTiltAtArcLength(s);
      this.horizontalBlockers.push({
        s,
        x,
        y,
        z,
        length: blockerLength,
        height: this.blockerHeight,
        depth: this.blockerDepth,
        tilt,
      });
      lastBlockerS = s;
    }
    console.log(
      "[BuildHorizontalBlockers]",
      "Built blockers: " + String(this.horizontalBlockers.length),
    );
  }

  private addHorizontalBlockerMeshes(): void {
    if (this.horizontalBlockers.length === 0) {
      return;
    }
    for (const blocker of this.horizontalBlockers) {
      const geometry = this.createHorizontalBlockerRootGeometry(blocker);
      const mesh = new THREE.Mesh(
        geometry,
        this.trackMaterial,
      );
      mesh.position.set(blocker.x, blocker.y, blocker.z);
      mesh.rotation.y = Math.PI;
      mesh.rotation.x = -blocker.tilt;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.addLevelObject(mesh);
    }
    console.log("[AddHorizontalBlockerMeshes]", "Added blocker meshes");
  }

  private createHorizontalBlockerRootGeometry(
    blocker: HorizontalBlocker,
  ): THREE.BufferGeometry {
    const rootExtension = this.trackThickness * 0.9;
    const rampHeight = blocker.height + rootExtension;
    const rampDepth = blocker.depth * 0.92;
    const halfLength = blocker.length * 0.5;
    const halfDepth = blocker.depth * 0.5;
    const halfHeight = blocker.height * 0.5;
    const bottomY = -halfHeight - rootExtension;
    const curveSamples = 10;
    const shape = new THREE.Shape();
    shape.moveTo(-halfDepth, bottomY);
    shape.lineTo(halfDepth - rampDepth, bottomY);
    for (let index = 1; index <= curveSamples; index += 1) {
      const t = index / curveSamples;
      const z = THREE.MathUtils.lerp(halfDepth, halfDepth - rampDepth, t);
      const y = bottomY + rampHeight * (1 - Math.pow(1 - t, 2.2));
      shape.lineTo(z, y);
    }
    shape.lineTo(-halfDepth, halfHeight);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: blocker.length,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 10,
    });
    geometry.rotateY(Math.PI * 0.5);
    geometry.translate(-halfLength, 0, 0);
    geometry.computeVertexNormals();
    return geometry;
  }

  private getFloorRuns(): TrackSample[][] {
    const runs: TrackSample[][] = [];
    let current: TrackSample[] = [];
    for (const sample of this.trackSamples) {
      if (sample.hasFloor) {
        current.push(sample);
      } else if (current.length > 1) {
        runs.push(current);
        current = [];
      } else {
        current = [];
      }
    }
    if (current.length > 1) {
      runs.push(current);
    }
    return runs;
  }

  private addQuad(
    positions: number[],
    uvs: number[],
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    uvA: THREE.Vector2,
    uvB: THREE.Vector2,
    uvC: THREE.Vector2,
    uvD: THREE.Vector2,
  ): void {
    positions.push(
      a.x,
      a.y,
      a.z,
      b.x,
      b.y,
      b.z,
      c.x,
      c.y,
      c.z,
      b.x,
      b.y,
      b.z,
      d.x,
      d.y,
      d.z,
      c.x,
      c.y,
      c.z,
    );
    uvs.push(
      uvA.x,
      uvA.y,
      uvB.x,
      uvB.y,
      uvC.x,
      uvC.y,
      uvB.x,
      uvB.y,
      uvD.x,
      uvD.y,
      uvC.x,
      uvC.y,
    );
  }

  private getHalfPipeHeightAtOffset(xOffsetAbs: number, width: number): number {
    const halfWidth = Math.max(0.001, width * 0.5);
    const flatHalf = halfWidth * this.halfPipeFlatWidthRatio;
    if (xOffsetAbs <= flatHalf) {
      return 0;
    }

    const bankWidth = Math.max(0.001, halfWidth - flatHalf);
    const t = THREE.MathUtils.clamp((xOffsetAbs - flatHalf) / bankWidth, 0, 1);
    const eased = 1 - Math.pow(1 - t, 2.2);
    return eased * this.wallHeight;
  }

  private getSpiralBankOffset(sample: TrackSample, localX: number): number {
    const section = this.levelConfig.sections[sample.sectionIndex];
    if (!section || !this.isSpiralType(section.type)) {
      return 0;
    }
    const halfWidth = Math.max(0.001, sample.width * 0.5);
    const normalized = THREE.MathUtils.clamp(localX / halfWidth, -1, 1);
    const inwardSign = section.type === "spiral_down_left" ? -1 : 1;
    return -normalized * inwardSign * this.spiralInwardBankHeight;
  }

  private buildRunSurfaceGeometry(
    run: TrackSample[],
    crossSegments: number,
    includeUvs: boolean,
  ): THREE.BufferGeometry {
    const upVector = new THREE.Vector3(0, 1, 0);
    const positions: number[] = [];
    const uvs: number[] = [];
    const rightBySample: THREE.Vector3[] = [];
    const vBySample: number[] = [];
    const topRings: THREE.Vector3[][] = [];
    const bottomRings: THREE.Vector3[][] = [];

    let distanceV = 0;
    for (let i = 0; i < run.length; i += 1) {
      const prev = run[Math.max(0, i - 1)];
      const next = run[Math.min(run.length - 1, i + 1)];
      const tangent = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z);
      if (tangent.lengthSq() < 0.0001) {
        tangent.set(0, 0, -1);
      } else {
        tangent.normalize();
      }
      const right = new THREE.Vector3().crossVectors(tangent, upVector);
      if (right.lengthSq() < 0.0001) {
        right.set(1, 0, 0);
      } else {
        right.normalize();
      }
      rightBySample.push(right);

      if (i > 0) {
        const a = run[i - 1];
        const b = run[i];
        distanceV +=
          Math.sqrt(
            (a.x - b.x) * (a.x - b.x) +
              (a.y - b.y) * (a.y - b.y) +
              (a.z - b.z) * (a.z - b.z),
          ) * this.platformUvScaleV;
      }
      vBySample.push(distanceV);

      const sample = run[i];
      const ringTop: THREE.Vector3[] = [];
      const ringBottom: THREE.Vector3[] = [];
      for (let stripIndex = 0; stripIndex <= crossSegments; stripIndex += 1) {
        const u = stripIndex / crossSegments;
        const localX = (u - 0.5) * sample.width;
        const localY =
          this.getHalfPipeHeightAtOffset(Math.abs(localX), sample.width) +
          this.getSpiralBankOffset(sample, localX);
        const topPoint = new THREE.Vector3(sample.x, sample.y, sample.z)
          .addScaledVector(right, localX)
          .add(new THREE.Vector3(0, localY, 0));
        const bottomPoint = topPoint.clone().add(new THREE.Vector3(0, -this.trackThickness, 0));
        ringTop.push(topPoint);
        ringBottom.push(bottomPoint);
      }
      topRings.push(ringTop);
      bottomRings.push(ringBottom);
    }

    for (let ringIndex = 0; ringIndex < run.length - 1; ringIndex += 1) {
      const vA = vBySample[ringIndex];
      const vB = vBySample[ringIndex + 1];
      for (let stripIndex = 0; stripIndex < crossSegments; stripIndex += 1) {
        const u0 = stripIndex / crossSegments;
        const u1 = (stripIndex + 1) / crossSegments;
        const uvA = new THREE.Vector2(u0, vA);
        const uvB = new THREE.Vector2(u1, vA);
        const uvC = new THREE.Vector2(u0, vB);
        const uvD = new THREE.Vector2(u1, vB);

        const topA = topRings[ringIndex][stripIndex];
        const topB = topRings[ringIndex][stripIndex + 1];
        const topC = topRings[ringIndex + 1][stripIndex];
        const topD = topRings[ringIndex + 1][stripIndex + 1];
        this.addQuad(positions, uvs, topA, topB, topC, topD, uvA, uvB, uvC, uvD);

        const botA = bottomRings[ringIndex][stripIndex];
        const botB = bottomRings[ringIndex][stripIndex + 1];
        const botC = bottomRings[ringIndex + 1][stripIndex];
        const botD = bottomRings[ringIndex + 1][stripIndex + 1];
        this.addQuad(positions, uvs, botA, botC, botB, botD, uvA, uvC, uvB, uvD);
      }

      const sideUvA = new THREE.Vector2(0, vA);
      const sideUvB = new THREE.Vector2(1, vA);
      const sideUvC = new THREE.Vector2(0, vB);
      const sideUvD = new THREE.Vector2(1, vB);

      const leftTopA = topRings[ringIndex][0];
      const leftTopB = topRings[ringIndex + 1][0];
      const leftBotA = bottomRings[ringIndex][0];
      const leftBotB = bottomRings[ringIndex + 1][0];
      this.addQuad(
        positions,
        uvs,
        leftTopA,
        leftTopB,
        leftBotA,
        leftBotB,
        sideUvA,
        sideUvC,
        sideUvB,
        sideUvD,
      );

      const last = crossSegments;
      const rightTopA = topRings[ringIndex][last];
      const rightTopB = topRings[ringIndex + 1][last];
      const rightBotA = bottomRings[ringIndex][last];
      const rightBotB = bottomRings[ringIndex + 1][last];
      this.addQuad(
        positions,
        uvs,
        rightTopA,
        rightBotA,
        rightTopB,
        rightBotB,
        sideUvA,
        sideUvB,
        sideUvC,
        sideUvD,
      );
    }

    const startV = vBySample[0] ?? 0;
    const endV = vBySample[vBySample.length - 1] ?? 0;
    for (let stripIndex = 0; stripIndex < crossSegments; stripIndex += 1) {
      const u0 = stripIndex / crossSegments;
      const u1 = (stripIndex + 1) / crossSegments;
      const startUvA = new THREE.Vector2(u0, startV);
      const startUvB = new THREE.Vector2(u1, startV);
      const startUvC = new THREE.Vector2(u0, startV + this.platformUvScaleV);
      const startUvD = new THREE.Vector2(u1, startV + this.platformUvScaleV);
      this.addQuad(
        positions,
        uvs,
        topRings[0][stripIndex],
        bottomRings[0][stripIndex],
        topRings[0][stripIndex + 1],
        bottomRings[0][stripIndex + 1],
        startUvA,
        startUvC,
        startUvB,
        startUvD,
      );

      const endUvA = new THREE.Vector2(u0, endV);
      const endUvB = new THREE.Vector2(u1, endV);
      const endUvC = new THREE.Vector2(u0, endV + this.platformUvScaleV);
      const endUvD = new THREE.Vector2(u1, endV + this.platformUvScaleV);
      const lastRing = topRings.length - 1;
      this.addQuad(
        positions,
        uvs,
        topRings[lastRing][stripIndex],
        topRings[lastRing][stripIndex + 1],
        bottomRings[lastRing][stripIndex],
        bottomRings[lastRing][stripIndex + 1],
        endUvA,
        endUvB,
        endUvC,
        endUvD,
      );
    }

    const surface = new THREE.BufferGeometry();
    surface.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    if (includeUvs) {
      surface.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    }
    const welded = mergeVertices(surface, 1e-4);
    welded.computeVertexNormals();
    surface.dispose();
    return welded;
  }

  private addPlatformRunMeshes(): void {
    const runs = this.getFloorRuns();
    this.trackWireframeObjects = [];
    this.physicsWireframeObjects = [];
    for (const run of runs) {
      const surfaceGeometry = this.buildRunSurfaceGeometry(
        run,
        this.halfPipeRenderSegments,
        true,
      );
      const surfaceMesh = new THREE.Mesh(surfaceGeometry, this.trackMaterial);
      surfaceMesh.castShadow = true;
      surfaceMesh.receiveShadow = true;
      this.addLevelObject(surfaceMesh);

      const renderWireframe = new THREE.LineSegments(
        new THREE.WireframeGeometry(surfaceGeometry),
        new THREE.LineBasicMaterial({
          color: "#f8da72",
          transparent: true,
          opacity: 0.92,
        }),
      );
      renderWireframe.visible = this.debugTrackWireframeEnabled;
      this.trackWireframeObjects.push(renderWireframe);
      this.addLevelObject(renderWireframe);

      const physicsSurfaceGeometry = this.buildRunSurfaceGeometry(
        run,
        Math.max(2, this.halfPipePhysicsSegments),
        false,
      );
      const physicsWireframe = new THREE.LineSegments(
        new THREE.WireframeGeometry(physicsSurfaceGeometry),
        new THREE.LineBasicMaterial({
          color: "#4dc8ff",
          transparent: true,
          opacity: 0.86,
        }),
      );
      physicsWireframe.visible = this.debugPhysicsWireframeEnabled;
      this.physicsWireframeObjects.push(physicsWireframe);
      this.addLevelObject(physicsWireframe);
      physicsSurfaceGeometry.dispose();
    }
    this.applyDebugGeometryVisibility();
    console.log(
      "[AddPlatformRunMeshes]",
      "Built continuous half-pipe platform meshes",
    );
  }

  private addSpiralSupportColumns(): void {
    const spiralSections = this.levelConfig.sections.filter((section) =>
      this.isSpiralType(section.type),
    );
    if (spiralSections.length === 0) {
      return;
    }

    const woodMaterial = new THREE.MeshPhysicalMaterial({
      color: "#8d643f",
      roughness: 0.5,
      metalness: 0.08,
      clearcoat: 0.22,
      clearcoatRoughness: 0.38,
      emissive: "#2a1a0f",
      emissiveIntensity: 0.08,
    });

    for (const section of spiralSections) {
      const columnX = THREE.MathUtils.lerp(
        section.lateralOffsetStart,
        section.lateralOffsetEnd,
        0.5,
      );
      const columnZ = (section.zStart + section.zEnd) * 0.5;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      const sampleCount = 24;
      for (let i = 0; i <= sampleCount; i += 1) {
        const t = i / sampleCount;
        const nominalZ = THREE.MathUtils.lerp(section.zStart, section.zEnd, t);
        const point = this.sampleTrackCenterAtSectionT(section, t, nominalZ);
        const y = this.getTrackSurfaceYAtPosition(point.x, point.z);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      const baseY = minY - 7.2;
      const topY = maxY + 3.6;
      const height = Math.max(10, topY - baseY);
      const radius = this.getSpiralRadius(section);
      const radiusOuter = Math.max(2.4, Math.min(5.6, radius * 0.18));
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(radiusOuter, radiusOuter * 1.04, height, 24),
        woodMaterial,
      );
      column.position.set(columnX, baseY + height * 0.5, columnZ);
      column.castShadow = true;
      column.receiveShadow = true;
      this.addLevelObject(column);

      const supportCount = 10;
      for (let i = 0; i < supportCount; i += 1) {
        const t = (i + 0.5) / supportCount;
        const nominalZ = THREE.MathUtils.lerp(section.zStart, section.zEnd, t);
        const point = this.sampleTrackCenterAtSectionT(section, t, nominalZ);
        const surfaceY = this.getTrackSurfaceYAtPosition(point.x, point.z);
        const trackUndersideY = surfaceY - this.trackThickness * 0.9;
        const start = new THREE.Vector3(columnX, trackUndersideY - 0.32, columnZ);
        const end = new THREE.Vector3(point.x, trackUndersideY, point.z);
        const span = end.clone().sub(start);
        const length = span.length();
        if (length < 1.2) {
          continue;
        }
        const support = new THREE.Mesh(
          new THREE.BoxGeometry(
            length,
            this.spiralSupportPlankThickness,
            this.spiralSupportPlankDepth,
          ),
          woodMaterial,
        );
        support.position.copy(start.clone().add(end).multiplyScalar(0.5));
        support.quaternion.setFromUnitVectors(
          new THREE.Vector3(1, 0, 0),
          span.normalize(),
        );
        support.castShadow = true;
        support.receiveShadow = true;
        this.addLevelObject(support);
      }
    }

    console.log(
      "[AddSpiralSupportColumns]",
      "Added spiral columns: " + String(spiralSections.length),
    );
  }

  private addCloudBackdrop(): void {
    const minTrackY = this.trackSamples.reduce(
      (minY, sample) => Math.min(minY, sample.y),
      Number.POSITIVE_INFINITY,
    );
    const trackYReference =
      this.trackSamples.length > 0
        ? this.trackSamples.reduce((sum, sample) => sum + sample.y, 0) /
          this.trackSamples.length
        : this.trackCenterY;
    this.cloudSpriteCount = addCloudBackdropVisual({
      agentDebugHideClouds: this.agentDebugHideClouds,
      minTrackY: Number.isFinite(minTrackY) ? minTrackY : this.trackCenterY,
      trackYReference,
      cloudZStart: this.startZ + 72,
      cloudZEnd: this.finishZ - 26,
      randomRange: (min: number, max: number) => this.randomRange(min, max),
      sampleTrackX: (z: number) => this.sampleTrackX(z),
      getSliceWidthAtZ: (z: number) => this.getSliceAtZ(z).width,
      getTrackSurfaceY: (z: number) => this.getTrackSurfaceY(z),
      isCloudPlacementBlocked: (x: number, z: number, cloudRadius: number) => {
        if (this.trackSamples.length === 0) {
          return false;
        }
        const nearest = this.getNearestTrackSample(x, z);
        const dx = x - nearest.x;
        const dz = z - nearest.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const noCloudRadius =
          nearest.width * 0.5 + this.wallThickness + 18 + cloudRadius;
        return dist < noCloudRadius;
      },
      addLevelObject: (object: THREE.Object3D) => this.addLevelObject(object),
    });
    this.updateCloudCountOverlay();
  }

  private addFinishTriggerCubes(): void {
    this.fireworkRows = addFinishTriggerCubesVisual({
      trackMaterial: this.trackMaterial,
      fireworkTriggerZ: this.fireworkTriggerZ,
      wallThickness: this.wallThickness,
      getSliceWidthAtZ: (z: number) => this.getSliceAtZ(z).width,
      sampleTrackX: (z: number) => this.sampleTrackX(z),
      getTrackSurfaceY: (z: number) => this.getTrackSurfaceY(z),
      addLevelObject: (object: THREE.Object3D) => this.addLevelObject(object),
    });
  }

  private spawnFireworks(burstPoints: THREE.Vector3[]): void {
    const points =
      burstPoints.length > 0
        ? burstPoints
        : [
            new THREE.Vector3(
              -4.4,
              this.getTrackSurfaceY(this.fireworkTriggerZ) + 2.2,
              this.fireworkTriggerZ,
            ),
          ];
    const colors = ["#72d7ff", "#ffe17a", "#ff7ad1", "#8dff99"];

    for (const burst of points) {
      for (let i = 0; i < 44; i += 1) {
        const particle = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.25, 0.25),
          new THREE.MeshStandardMaterial({
            color: colors[i % colors.length],
            roughness: 0.45,
            metalness: 0.08,
          }),
        );
        particle.position.copy(burst);
        this.scene.add(particle);

        const angle = (i / 44) * Math.PI * 2;
        const velocity = new THREE.Vector3(
          Math.cos(angle) * (3 + (i % 6) * 0.45),
          4 + (i % 5) * 0.55,
          Math.sin(angle) * (3 + (i % 7) * 0.42),
        );
        this.particles.push({ mesh: particle, velocity, life: 1.6 });
      }
    }

    this.triggerHaptic("success");
    this.soundManager.playFirework();
    console.log("[SpawnFireworks]", "Fireworks burst triggered");
  }

  private updateParticles(delta: number): void {
    const gravity = 12.5;
    const alive: FireworkParticle[] = [];
    for (const item of this.particles) {
      item.life -= delta;
      item.velocity.y -= gravity * delta;
      item.mesh.position.addScaledVector(item.velocity, delta);
      item.mesh.rotation.x += delta * 5;
      item.mesh.rotation.y += delta * 4;
      if (item.life > 0) {
        alive.push(item);
      } else {
        this.scene.remove(item.mesh);
      }
    }
    this.particles = alive;
  }

  private createTrackPhysics(): void {
    createTrackPhysicsBodies({
      world: this.world,
      trackRigidBodies: this.trackRigidBodies,
      obstacleBodyById: this.obstacleBodyById,
      bouncyPadJointById: this.bouncyPadJointById,
      halfPipePhysicsSegments: this.halfPipePhysicsSegments,
      trackThickness: this.trackThickness,
      horizontalBlockers: this.horizontalBlockers,
      rotatorObstacles: this.rotatorObstacles,
      pinballBouncers: this.pinballBouncers,
      bouncyPads: this.bouncyPads,
      swingingHammers: this.swingingHammers,
      fallingPlatforms: this.fallingPlatforms,
      buildPhysicsRuns: () => this.getFloorRuns(),
      getHalfPipeHeightAtOffset: (xOffsetAbs, width) =>
        this.getHalfPipeHeightAtOffset(xOffsetAbs, width),
    });
    console.log("[CreateTrackPhysics]", "Track colliders created");
  }

  private createMarblePhysics(): void {
    if (!this.world) {
      return;
    }
    const spawnS = this.getStartSpawnArcLength();
    const startSample = this.getTrackSampleAtArcLength(spawnS);
    this.marbleBody = createMarbleBody(
      this.world,
      startSample,
      this.marbleRadius,
    );
    console.log("[CreateMarblePhysics]", "Marble rigid body created");
  }

  private initializeDesignerUi(): void {
    if (this.isMobile || !this.designerList) {
      return;
    }

    while (this.designerList.firstChild) {
      this.designerList.removeChild(this.designerList.firstChild);
    }

    for (let i = 0; i < this.designerMiddleCount; i += 1) {
      const row = document.createElement("div");
      row.className = "designer-row";

      const label = document.createElement("div");
      label.className = "designer-row-label";
      label.textContent = "Slot " + String(i + 1);
      row.appendChild(label);

      const select = document.createElement("select");
      select.className = "designer-select";
      select.dataset.slotIndex = String(i);
      for (const type of this.designerSelectableTypes) {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = this.getPlatformTypeLabel(type);
        select.appendChild(option);
      }
      select.value = this.designedMiddleTypes[i] ?? "flat";
      select.addEventListener("change", () => {
        this.designedMiddleTypes = this.readDesignerMiddleTypes();
        this.updateDesignerMeta();
      });
      row.appendChild(select);
      this.designerList.appendChild(row);
    }

    this.designedMiddleTypes = this.readDesignerMiddleTypes();
    this.updateDesignerMeta();
    console.log(
      "[InitializeDesignerUi]",
      "Initialized designer slots=" + String(this.designedMiddleTypes.length),
    );
  }

  private readDesignerMiddleTypes(): PlatformType[] {
    if (!this.designerList) {
      return this.designedMiddleTypes.slice();
    }
    const next: PlatformType[] = [];
    const selects = this.designerList.querySelectorAll("select");
    for (const entry of selects) {
      if (!(entry instanceof HTMLSelectElement)) {
        continue;
      }
      const value = entry.value;
      if (this.isDesignerSelectableType(value)) {
        next.push(value);
      }
    }
    return next;
  }

  private updateDesignerMeta(): void {
    if (!this.designerMeta) {
      return;
    }
    this.designerMeta.textContent =
      "Middle platforms: " + String(this.designedMiddleTypes.length);
  }

  private initializeDesignerRepeatUi(): void {
    if (this.isMobile || !this.designerRepeatSelect) {
      return;
    }
    while (this.designerRepeatSelect.firstChild) {
      this.designerRepeatSelect.removeChild(this.designerRepeatSelect.firstChild);
    }
    for (const type of this.designerSelectableTypes) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = this.getPlatformTypeLabel(type);
      this.designerRepeatSelect.appendChild(option);
    }
    this.designerRepeatSelect.value = this.designerRepeatType;
    this.designerRepeatSelect.addEventListener("change", () => {
      const value = this.designerRepeatSelect?.value;
      if (value && this.isDesignerSelectableType(value)) {
        this.designerRepeatType = value;
      }
      this.updateDesignerRepeatMeta();
    });
    this.updateDesignerRepeatMeta();
    console.log(
      "[InitializeDesignerRepeatUi]",
      "Repeat type initialized as " + this.designerRepeatType,
    );
  }

  private initializeObstacleFocusUi(): void {
    if (this.isMobile || !this.obstacleFocusSelect) {
      return;
    }
    this.obstacleFocusSelect.value = this.designerObstacleFocus;
    this.obstacleFocusSelect.addEventListener("change", () => {
      const value = this.obstacleFocusSelect?.value;
      if (
        value === "horizontal_blocker" ||
        value === "rotator_x" ||
        value === "pinball_bouncer" ||
        value === "bouncy_pad"
      ) {
        this.designerObstacleFocus = value;
      }
    });
  }

  private initializeDebugToolsUi(): void {
    if (this.isMobile) {
      return;
    }
    this.updateDebugToolButtons();
    this.applyDebugGeometryVisibility();
    console.log("[InitializeDebugToolsUi]", "Debug tool controls initialized");
  }

  private applyDebugGeometryVisibility(): void {
    for (const line of this.trackWireframeObjects) {
      line.visible = this.debugTrackWireframeEnabled;
    }
    for (const line of this.physicsWireframeObjects) {
      line.visible = this.debugPhysicsWireframeEnabled;
    }
  }

  private updateDebugToolButtons(): void {
    if (this.debugTrackWireToggleButton) {
      this.debugTrackWireToggleButton.dataset.enabled = this.debugTrackWireframeEnabled
        ? "true"
        : "false";
      this.debugTrackWireToggleButton.textContent = this.debugTrackWireframeEnabled
        ? "ON"
        : "OFF";
    }
    if (this.debugPhysicsWireToggleButton) {
      this.debugPhysicsWireToggleButton.dataset.enabled = this.debugPhysicsWireframeEnabled
        ? "true"
        : "false";
      this.debugPhysicsWireToggleButton.textContent = this.debugPhysicsWireframeEnabled
        ? "ON"
        : "OFF";
    }
    if (this.debugCloudCountToggleButton) {
      this.debugCloudCountToggleButton.dataset.enabled = this.debugCloudCountOverlayEnabled
        ? "true"
        : "false";
      this.debugCloudCountToggleButton.textContent = this.debugCloudCountOverlayEnabled
        ? "ON"
        : "OFF";
    }
    if (this.debugPhysicsPanelToggleButton) {
      this.debugPhysicsPanelToggleButton.dataset.enabled = this.debugPhysicsPanelEnabled
        ? "true"
        : "false";
      this.debugPhysicsPanelToggleButton.textContent = this.debugPhysicsPanelEnabled
        ? "ON"
        : "OFF";
    }
    if (this.debugThudTraceToggleButton) {
      this.debugThudTraceToggleButton.dataset.enabled = this.debugThudTraceEnabled
        ? "true"
        : "false";
      this.debugThudTraceToggleButton.textContent = this.debugThudTraceEnabled
        ? "ON"
        : "OFF";
    }
  }

  private toggleTrackWireframeView(): void {
    if (this.isMobile) {
      return;
    }
    this.debugTrackWireframeEnabled = !this.debugTrackWireframeEnabled;
    this.applyDebugGeometryVisibility();
    this.updateDebugToolButtons();
    console.log(
      "[ToggleTrackWireframeView]",
      "Track mesh wireframe=" +
        (this.debugTrackWireframeEnabled ? "on" : "off"),
    );
  }

  private togglePhysicsWireframeView(): void {
    if (this.isMobile) {
      return;
    }
    this.debugPhysicsWireframeEnabled = !this.debugPhysicsWireframeEnabled;
    this.applyDebugGeometryVisibility();
    this.updateDebugToolButtons();
    console.log(
      "[TogglePhysicsWireframeView]",
      "Physics mesh wireframe=" +
        (this.debugPhysicsWireframeEnabled ? "on" : "off"),
    );
  }

  private toggleCloudCountOverlay(): void {
    if (this.isMobile) {
      return;
    }
    this.debugCloudCountOverlayEnabled = !this.debugCloudCountOverlayEnabled;
    this.updateDebugToolButtons();
    this.updateCloudCountOverlay();
    console.log(
      "[ToggleCloudCountOverlay]",
      "Cloud count overlay=" +
        (this.debugCloudCountOverlayEnabled ? "on" : "off"),
    );
  }

  private togglePhysicsDebugPanel(): void {
    if (this.isMobile) {
      return;
    }
    this.debugPhysicsPanelEnabled = !this.debugPhysicsPanelEnabled;
    this.updateDebugToolButtons();
    this.updatePhysicsDebugPanelVisibility();
    console.log(
      "[TogglePhysicsDebugPanel]",
      "Physics debug panel=" +
        (this.debugPhysicsPanelEnabled ? "on" : "off"),
    );
  }

  private toggleThudTraceOverlay(): void {
    if (this.isMobile) {
      return;
    }
    this.debugThudTraceEnabled = !this.debugThudTraceEnabled;
    this.updateDebugToolButtons();
    this.updateThudTraceOverlay();
    console.log(
      "[ToggleThudTraceOverlay]",
      "Thud trace overlay=" +
        (this.debugThudTraceEnabled ? "on" : "off"),
    );
  }

  private updateCloudCountOverlay(): void {
    const shouldShow =
      this.gameState === "playing" &&
      !this.isMobile &&
      this.debugCloudCountOverlayEnabled;
    this.cloudDebugPanel.style.display = shouldShow ? "block" : "none";
    this.cloudDebugPanel.textContent =
      "Cloud Sprites: " + String(this.cloudSpriteCount);
  }

  private updateThudTraceOverlay(): void {
    const shouldShow =
      this.gameState === "playing" &&
      !this.isMobile &&
      this.debugThudTraceEnabled;
    this.thudDebugPanel.style.display = shouldShow ? "block" : "none";
    this.thudDebugPanel.textContent =
      this.thudDebugEntries.length > 0
        ? this.thudDebugEntries.join("\n")
        : "Thud Trace: waiting for landing events";
  }

  private recordThudTraceEvent(info: LandingSoundDebugInfo): void {
    const entry =
      "t=" +
      this.runTimeSeconds.toFixed(2) +
      "s played=" +
      (info.played ? "yes" : "no") +
      " reason=" +
      info.reason +
      " clip=" +
      info.clipId +
      " dur=" +
      info.clipDurationSeconds.toFixed(3) +
      "s gain=" +
      info.gain.toFixed(3) +
      " impact=" +
      info.impact.toFixed(3);
    this.thudDebugEntries.unshift(entry);
    if (this.thudDebugEntries.length > 6) {
      this.thudDebugEntries = this.thudDebugEntries.slice(0, 6);
    }
    this.updateThudTraceOverlay();
    this.flashThudTraceOverlay();
  }

  private playObstacleThud(impact: number, source: string): void {
    if (this.runTimeSeconds - this.lastObstacleThudRunTime < 0.09) {
      return;
    }
    const clampedImpact = Math.max(2.3, Math.min(16, impact));
    const thudInfo = this.soundManager.playHeavyLanding(clampedImpact);
    this.recordThudTraceEvent({
      ...thudInfo,
      reason: source + ":" + thudInfo.reason,
      impact: clampedImpact,
    });
    if (thudInfo.played) {
      this.lastObstacleThudRunTime = this.runTimeSeconds;
    }
  }

  private flashThudTraceOverlay(): void {
    this.thudDebugPanel.style.color = "#ffe7aa";
    this.thudDebugPanel.style.borderColor = "rgba(255, 216, 120, 0.82)";
    this.thudDebugPanel.style.background = "rgba(52, 33, 4, 0.84)";
    if (this.thudTraceFlashTimer) {
      window.clearTimeout(this.thudTraceFlashTimer);
    }
    this.thudTraceFlashTimer = window.setTimeout(() => {
      this.thudDebugPanel.style.color = "#cfe6ff";
      this.thudDebugPanel.style.borderColor = "rgba(255, 255, 255, 0.2)";
      this.thudDebugPanel.style.background = "rgba(4, 12, 24, 0.72)";
      this.thudTraceFlashTimer = 0;
    }, 180);
  }

  private getActiveObstacleKinds(): ObstacleKind[] {
    const activeTypeCount = THREE.MathUtils.clamp(this.loopsCompleted + 1, 1, 4);
    return this.runObstacleOrder.slice(0, activeTypeCount);
  }

  private buildRunObstacles(): void {
    this.rotatorHitAtById.clear();
    this.rotatorTouchingById.clear();
    this.bouncyPadHitAtById.clear();
    this.bouncyPadTouchingById.clear();
    this.hammerHitAtById.clear();
    this.hammerTouchingById.clear();
    const activeKinds = this.getActiveObstacleKinds();
    const includeBlockers = activeKinds.includes("horizontal_blocker");
    const isSingleTypeFocus = (this.forcedRunObstacleOrder?.length ?? 0) === 1;
    if (includeBlockers) {
      const blockerCap = isSingleTypeFocus ? 24 : this.blockerMaxPerLevel;
      this.buildHorizontalBlockers(blockerCap);
    } else {
      this.horizontalBlockers = [];
      this.blockerHitAtByIndex.clear();
      this.blockerTouchingByIndex.clear();
    }

    const waveKinds = activeKinds.filter(
      (kind): kind is WaveObstacleKind => kind !== "horizontal_blocker",
    );
    if (waveKinds.length === 0) {
      this.rotatorObstacles = [];
      this.pinballBouncers = [];
      this.bouncyPads = [];
      this.swingingHammers = [];
      this.fallingPlatforms = [];
      return;
    }

    const rebuiltObstacles = buildWaveObstaclesData({
      loopsCompleted: isSingleTypeFocus ? Math.max(this.loopsCompleted, 14) : this.loopsCompleted,
      runObstacleOrder: waveKinds,
      levelSections: this.levelConfig.sections,
      sectionArcRanges: this.sectionArcRanges,
      fireworkTriggerS: this.fireworkTriggerS,
      obstacleStartSafeDistance: this.obstacleStartSafeDistance,
      obstacleFinishSafeDistance: this.obstacleFinishSafeDistance,
      trackArcLength: this.trackArcLength,
      wallThickness: this.wallThickness,
      obstacleMaxPerTypeCap: isSingleTypeFocus
        ? this.obstacleMaxPerTypeCap * 3
        : this.obstacleMaxPerTypeCap,
      obstacleWaveLinearGrowth: this.obstacleWaveLinearGrowth,
      obstacleClusterSpacing: this.obstacleClusterSpacing,
      obstacleMinDistance: this.obstacleMinDistance,
      rotatorArmLength: this.rotatorArmLength,
      rotatorArmThickness: this.rotatorArmThickness,
      rotatorHeight: this.rotatorHeight,
      rotatorSpinSpeedBase: this.rotatorSpinSpeedBase,
      bouncerColumnHeight: this.bouncerColumnHeight,
      bouncerCapRadius: this.bouncerCapRadius,
      bouncerImpulse: this.bouncerImpulse,
      bouncyPadLength: this.bouncyPadLength,
      bouncyPadWidth: this.bouncyPadWidth,
      bouncyPadSweepAmplitude: this.bouncyPadSweepAmplitude,
      bouncyPadSweepSpeedBase: this.bouncyPadSweepSpeedBase,
      bouncyPadLaunchImpulse: this.bouncyPadLaunchImpulse,
      swingingHammerLength: this.swingingHammerLength,
      swingingHammerPivotHeight: this.swingingHammerPivotHeight,
      swingingHammerSweepAmplitude: this.swingingHammerSweepAmplitude,
      swingingHammerSweepSpeedBase: this.swingingHammerSweepSpeedBase,
      swingingHammerKnockbackImpulse: this.swingingHammerKnockbackImpulse,
      fallingPlatformLength: this.fallingPlatformLength,
      fallingPlatformWidth: this.fallingPlatformWidth,
      fallingPlatformFallDelay: this.fallingPlatformFallDelay,
      fallingPlatformFallDuration: this.fallingPlatformFallDuration,
      fallingPlatformFallDistance: this.fallingPlatformFallDistance,
      marbleRadius: this.marbleRadius,
      horizontalBlockers: this.horizontalBlockers,
      hasFloorAtArcLength: (s) => this.hasFloorAtArcLength(s),
      getTrackTiltAtArcLength: (s) => this.getTrackTiltAtArcLength(s),
      getTrackSampleAtArcLength: (s) => this.getTrackSampleAtArcLength(s),
      getTrackSurfaceYAtPosition: (x, z) => this.getTrackSurfaceYAtPosition(x, z),
      randomRange: (min, max) => this.randomRange(min, max),
      nextObstacleId: (kind) => {
        this.obstacleIdCounter += 1;
        return kind + "_" + String(this.obstacleIdCounter);
      },
    });
    this.rotatorObstacles = rebuiltObstacles.rotatorObstacles;
    this.pinballBouncers = rebuiltObstacles.pinballBouncers;
    this.bouncyPads = rebuiltObstacles.bouncyPads;
    this.swingingHammers = rebuiltObstacles.swingingHammers;
    this.fallingPlatforms = rebuiltObstacles.fallingPlatforms;
  }

  private updateDesignerRepeatMeta(): void {
    if (!this.designerRepeatMeta) {
      return;
    }
    this.designerRepeatMeta.textContent =
      "Middle platforms: " + String(this.designerRepeatMiddleCount);
  }

  private setSettingsTab(tab: SettingsTab): void {
    this.activeSettingsTab = tab;
    const showDesigner = tab === "designer" && !this.isMobile;
    const showRepeat = tab === "repeat" && !this.isMobile;
    const showObstacles = tab === "obstacles" && !this.isMobile;
    const showDebug = tab === "debug" && !this.isMobile;
    const showAudio = !showDesigner && !showRepeat && !showObstacles && !showDebug;
    this.settingsPaneAudio.classList.toggle("hidden", !showAudio);
    if (this.settingsPaneDesigner) {
      this.settingsPaneDesigner.classList.toggle("hidden", !showDesigner);
    }
    if (this.settingsPaneRepeat) {
      this.settingsPaneRepeat.classList.toggle("hidden", !showRepeat);
    }
    if (this.settingsPaneObstacles) {
      this.settingsPaneObstacles.classList.toggle("hidden", !showObstacles);
    }
    if (this.settingsPaneDebug) {
      this.settingsPaneDebug.classList.toggle("hidden", !showDebug);
    }
    if (this.settingsTabAudio) {
      this.settingsTabAudio.dataset.active = showAudio ? "true" : "false";
    }
    if (this.settingsTabDesigner) {
      this.settingsTabDesigner.dataset.active = showDesigner ? "true" : "false";
    }
    if (this.settingsTabRepeat) {
      this.settingsTabRepeat.dataset.active = showRepeat ? "true" : "false";
    }
    if (this.settingsTabObstacles) {
      this.settingsTabObstacles.dataset.active = showObstacles ? "true" : "false";
    }
    if (this.settingsTabDebug) {
      this.settingsTabDebug.dataset.active = showDebug ? "true" : "false";
    }
  }

  private spawnDesignedLevel(): void {
    if (this.isMobile) {
      return;
    }
    const designed = this.readDesignerMiddleTypes();
    if (designed.length === 0) {
      return;
    }
    this.designedMiddleTypes = designed;
    this.customMiddlePlatformTypes = designed.slice();
    this.forcedRunObstacleOrder = null;
    this.soundManager.playUIClick();
    this.triggerLightHaptic();
    this.setSettingsVisible(false);
    this.startRun();
    console.log(
      "[SpawnDesignedLevel]",
      "Spawned designed level types=" + designed.join(","),
    );
  }

  private spawnObstacleFocusLevel(): void {
    if (this.isMobile) {
      return;
    }
    const selected = this.obstacleFocusSelect?.value ?? this.designerObstacleFocus;
    if (
      selected === "horizontal_blocker" ||
      selected === "rotator_x" ||
      selected === "pinball_bouncer" ||
      selected === "bouncy_pad"
    ) {
      this.designerObstacleFocus = selected;
    }
    this.customMiddlePlatformTypes = new Array<PlatformType>(
      this.designerMiddleCount,
    ).fill("flat");
    this.forcedRunObstacleOrder = [this.designerObstacleFocus];
    this.soundManager.playUIClick();
    this.triggerLightHaptic();
    this.setSettingsVisible(false);
    this.startRun();
    console.log(
      "[SpawnObstacleFocusLevel]",
      "Spawned obstacle focus type=" + this.designerObstacleFocus,
    );
  }

  private spawnRepeatedDesignedLevel(): void {
    if (this.isMobile) {
      return;
    }
    const selected = this.designerRepeatSelect?.value ?? this.designerRepeatType;
    if (this.isDesignerSelectableType(selected)) {
      this.designerRepeatType = selected;
    }
    const repeated = new Array<PlatformType>(this.designerRepeatMiddleCount).fill(
      this.designerRepeatType,
    );
    this.customMiddlePlatformTypes = repeated;
    this.forcedRunObstacleOrder = null;
    this.soundManager.playUIClick();
    this.triggerLightHaptic();
    this.setSettingsVisible(false);
    this.startRun();
    console.log(
      "[SpawnRepeatedDesignedLevel]",
      "Spawned repeated layout type=" +
        this.designerRepeatType +
      " count=" +
        String(this.designerRepeatMiddleCount),
    );
  }

  private spawnDebugCubeLevel(): void {
    if (this.isMobile) {
      return;
    }
    const middleTypes: PlatformType[] = [
      "flat",
      "slope_down_steep",
      "flat",
      "flat",
      "flat",
      "flat",
      "flat",
      "flat",
    ];
    this.customMiddlePlatformTypes = middleTypes;
    this.forcedRunObstacleOrder = null;
    this.agentDebugMinimalMode = true;
    this.agentDebugHideClouds = true;
    this.soundManager.playUIClick();
    this.triggerLightHaptic();
    this.setSettingsVisible(false);
    this.startRun();
    console.log(
      "[SpawnDebugCubeLevel]",
      "Spawned flat-ramp-flat debug level with minimal obstacles",
    );
  }

  private bindUi(): void {
    window.addEventListener(
      "pointerdown",
      () => {
        this.soundManager.init();
        this.soundManager.resume();
      },
      { capture: true },
    );

    document.getElementById("start-btn")?.addEventListener("click", () => {
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
      this.startRun();
    });

    document.getElementById("play-again-btn")?.addEventListener("click", () => {
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
      this.startRun();
    });

    this.restartButton.addEventListener("click", () => {
      this.restartCurrentLevel("button");
    });

    this.settingsButton.addEventListener("click", () => {
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
      this.setSettingsVisible(true);
    });

    document.getElementById("settings-close")?.addEventListener("click", () => {
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
      this.setSettingsVisible(false);
    });

    this.settingsModal.addEventListener("click", (event) => {
      if (event.target === this.settingsModal) {
        this.setSettingsVisible(false);
      }
    });

    this.settingsTabAudio?.addEventListener("click", () => {
      this.setSettingsTab("audio");
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
    });

    this.settingsTabDesigner?.addEventListener("click", () => {
      this.setSettingsTab("designer");
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
    });

    this.settingsTabRepeat?.addEventListener("click", () => {
      this.setSettingsTab("repeat");
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
    });
    this.settingsTabObstacles?.addEventListener("click", () => {
      this.setSettingsTab("obstacles");
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
    });
    this.settingsTabDebug?.addEventListener("click", () => {
      this.setSettingsTab("debug");
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
    });

    this.designerSpawnButton?.addEventListener("click", () => {
      this.spawnDesignedLevel();
    });
    this.designerRepeatSpawnButton?.addEventListener("click", () => {
      this.spawnRepeatedDesignedLevel();
    });
    this.obstacleFocusSpawnButton?.addEventListener("click", () => {
      this.spawnObstacleFocusLevel();
    });
    this.debugCubeLevelSpawnButton?.addEventListener("click", () => {
      this.spawnDebugCubeLevel();
    });
    this.debugTrackWireToggleButton?.addEventListener("click", () => {
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
      this.toggleTrackWireframeView();
    });
    this.debugPhysicsWireToggleButton?.addEventListener("click", () => {
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
      this.togglePhysicsWireframeView();
    });
    this.debugCloudCountToggleButton?.addEventListener("click", () => {
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
      this.toggleCloudCountOverlay();
    });
    this.debugPhysicsPanelToggleButton?.addEventListener("click", () => {
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
      this.togglePhysicsDebugPanel();
    });
    this.debugThudTraceToggleButton?.addEventListener("click", () => {
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
      this.toggleThudTraceOverlay();
    });

    this.bindSettingToggle("toggle-music", "music");
    this.bindSettingToggle("toggle-fx", "fx");
    this.bindSettingToggle("toggle-haptics", "haptics");
  }

  private bindInput(): void {
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (key === "k" && !event.repeat) {
        this.spawnAgentDebugHelixLayout("left");
        return;
      }
      if (key === "l" && !event.repeat) {
        this.spawnAgentDebugHelixLayout("right");
        return;
      }
      if (key === "p" && !event.repeat) {
        this.toggleDebugFlyMode();
        return;
      }
      if (key === "r" && !event.repeat) {
        this.restartCurrentLevel("keyboard");
        return;
      }
      if ((key === "1" || key === "2" || key === "3") && !event.repeat) {
        if (this.gameState !== "playing") {
          return;
        }
        this.agentDebugCameraMode =
          key === "1" ? "overview" : key === "2" ? "side" : "top";
        if (!this.debugFlyMode) {
          this.toggleDebugFlyMode();
        }
        this.focusDebugHelixView(this.agentDebugCameraMode);
        return;
      }
      if (this.debugFlyMode) {
        if (key === "o" && !event.repeat) {
          this.agentDebugCameraMode = "overview";
          this.focusDebugHelixView("overview");
          return;
        }
        this.setDebugMovementKey(key, true);
        return;
      }
    });

    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (this.debugFlyMode) {
        this.setDebugMovementKey(key, false);
      }
    });

    this.canvas.addEventListener("contextmenu", (event) => {
      if (this.debugFlyMode) {
        event.preventDefault();
      }
    });

    this.canvas.addEventListener("pointerdown", (event) => {
      if (this.debugFlyMode && event.button === 2) {
        this.debugLookDragging = true;
        this.debugLastMouseX = event.clientX;
        this.debugLastMouseY = event.clientY;
        this.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }

      if (this.debugFlyMode || this.gameState !== "playing") {
        return;
      }
      if (event.button !== 0) {
        return;
      }

      this.activeSwipePointerId = event.pointerId;
      this.swipeStartClient.set(event.clientX, event.clientY);
      this.swipeCurrentClient.copy(this.swipeStartClient);
      this.swipePreviousClient.copy(this.swipeStartClient);
      this.swipeStartTimeMs = performance.now();
      this.swipeLastMoveTimeMs = this.swipeStartTimeMs;
      this.pendingSwipeImpulse.set(0, 0, 0);
      this.updateSwipeDirectionFromPointer();
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (this.debugFlyMode && this.debugLookDragging) {
        const deltaX = event.clientX - this.debugLastMouseX;
        const deltaY = event.clientY - this.debugLastMouseY;
        this.debugLastMouseX = event.clientX;
        this.debugLastMouseY = event.clientY;
        const lookSensitivity = 0.0032;
        this.debugYaw += deltaX * lookSensitivity;
        this.debugPitch = THREE.MathUtils.clamp(
          this.debugPitch - deltaY * lookSensitivity,
          -Math.PI * 0.48,
          Math.PI * 0.48,
        );
        return;
      }
      if (this.activeSwipePointerId !== event.pointerId) {
        return;
      }
      const nowMs = performance.now();
      if (nowMs - this.swipeStartTimeMs >= this.swipeMaxDurationMs) {
        this.resetSwipeInput();
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }
      this.swipeCurrentClient.set(event.clientX, event.clientY);
      this.queueSwipeImpulseFromMove(nowMs);
      this.updateSwipeDirectionFromPointer();
      event.preventDefault();
    });

    this.canvas.addEventListener("pointerup", (event) => {
      if (event.button === 2) {
        this.debugLookDragging = false;
      }
      if (this.activeSwipePointerId === event.pointerId) {
        this.resetSwipeInput();
      }
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    });
    this.canvas.addEventListener("pointercancel", (event) => {
      this.debugLookDragging = false;
      if (this.activeSwipePointerId === event.pointerId) {
        this.resetSwipeInput();
      }
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    });
  }

  private setDebugMovementKey(key: string, pressed: boolean): void {
    if (key === "w") {
      this.debugMoveForward = pressed;
    } else if (key === "s") {
      this.debugMoveBackward = pressed;
    } else if (key === "a") {
      this.debugMoveLeft = pressed;
    } else if (key === "d") {
      this.debugMoveRight = pressed;
    } else if (key === "q") {
      this.debugMoveDown = pressed;
    } else if (key === "e") {
      this.debugMoveUp = pressed;
    } else if (key === "shift") {
      this.debugMoveFast = pressed;
    }
  }

  private clearDebugMovementKeys(): void {
    this.debugMoveForward = false;
    this.debugMoveBackward = false;
    this.debugMoveLeft = false;
    this.debugMoveRight = false;
    this.debugMoveUp = false;
    this.debugMoveDown = false;
    this.debugMoveFast = false;
  }

  private toggleDebugFlyMode(): void {
    if (this.gameState !== "playing") {
      return;
    }

    this.resetSwipeInput(true);
    this.debugFlyMode = !this.debugFlyMode;
    this.debugLookDragging = false;

    if (this.debugFlyMode) {
      this.debugFlyPosition.copy(this.camera.position);
      const euler = new THREE.Euler().setFromQuaternion(
        this.camera.quaternion,
        "YXZ",
      );
      this.debugYaw = euler.y;
      this.debugPitch = euler.x;
      this.clearDebugMovementKeys();
      this.updateDebugPlatformLabelVisibility();
      console.log("[ToggleDebugFlyMode]", "Enabled debug fly camera");
      return;
    }

    this.clearDebugMovementKeys();
    this.cameraAnchorsInitialized = false;
    this.updateCamera(1);
    this.updateDebugPlatformLabelVisibility();
    console.log("[ToggleDebugFlyMode]", "Disabled debug fly camera");
  }

  private spawnAgentDebugHelixLayout(direction: "left" | "right"): void {
    const spiralType: PlatformType =
      direction === "left" ? "spiral_down_left" : "spiral_down_right";
    this.customMiddlePlatformTypes = [spiralType];
    this.agentDebugMinimalMode = true;
    this.agentDebugSpawnPending = true;
    this.agentDebugCameraMode = "overview";
    this.agentDebugHideClouds = true;
    this.startRun();
    console.log(
      "[SpawnAgentDebugHelixLayout]",
      "Spawned minimal helix layout type=" + spiralType,
    );
  }

  private focusDebugHelixView(
    mode: "overview" | "side" | "top" = "overview",
  ): void {
    if (!this.debugFlyMode) {
      return;
    }

    const spiralSection = this.levelConfig.sections.find((section) =>
      this.isSpiralType(section.type),
    );
    if (!spiralSection) {
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    const sampleCount = 28;
    for (let i = 0; i <= sampleCount; i += 1) {
      const t = i / sampleCount;
      const z = THREE.MathUtils.lerp(spiralSection.zStart, spiralSection.zEnd, t);
      const x = this.sampleTrackX(z);
      const y = this.getTrackSurfaceY(z);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }

    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const spanX = Math.max(6, maxX - minX);
    const spanY = Math.max(4, maxY - minY);
    const spanZ = Math.max(6, maxZ - minZ);

    if (mode === "side") {
      this.debugFlyPosition.set(
        centerX + Math.max(26, spanX * 2.2),
        centerY + spanY * 0.38 + 8.5,
        centerZ + spanZ * 0.08,
      );
    } else if (mode === "top") {
      this.debugFlyPosition.set(
        centerX,
        maxY + Math.max(spanX, spanZ) * 2.1 + 44,
        centerZ + spanZ * 0.08,
      );
    } else {
      this.debugFlyPosition.set(
        centerX + spanX * 1.08 + 18,
        centerY + spanY * 0.92 + 28,
        centerZ + spanZ * 1.66 + 28,
      );
    }
    this.camera.position.copy(this.debugFlyPosition);
    const lookTarget = new THREE.Vector3(centerX, centerY, centerZ);
    this.camera.lookAt(lookTarget);
    const lookDir = lookTarget.clone().sub(this.debugFlyPosition).normalize();
    this.debugYaw = Math.atan2(lookDir.x, -lookDir.z);
    this.debugPitch = Math.asin(THREE.MathUtils.clamp(lookDir.y, -1, 1));
    this.updateDebugPlatformLabelVisibility();
    console.log("[FocusDebugHelixView]", "Framed helix view mode=" + mode);
  }

  private applyAgentDebugPostSpawn(): void {
    if (!this.agentDebugSpawnPending || this.gameState !== "playing") {
      return;
    }
    this.agentDebugSpawnPending = false;
    if (!this.debugFlyMode) {
      this.toggleDebugFlyMode();
    }
    this.focusDebugHelixView(this.agentDebugCameraMode);
  }

  private updateSwipeDirectionFromPointer(): void {
    const deltaX = this.swipeCurrentClient.x - this.swipeStartClient.x;
    const deltaY = this.swipeCurrentClient.y - this.swipeStartClient.y;
    const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const effectiveDistance = Math.max(0, dragDistance - this.swipeDeadZonePx);
    const strength = THREE.MathUtils.clamp(
      effectiveDistance /
        Math.max(1, this.swipeMaxDistancePx - this.swipeDeadZonePx),
      0,
      1,
    );
    this.swipeStrength = strength;
    if (strength <= 0.0001) {
      this.swipeDirection.set(0, 0, 0);
    }
    this.updateSwipeOverlayVisual(deltaX, deltaY, strength);
  }

  private queueSwipeImpulseFromMove(nowMs: number): void {
    if (!this.marbleBody) {
      return;
    }
    const deltaX = this.swipeCurrentClient.x - this.swipePreviousClient.x;
    const deltaY = this.swipeCurrentClient.y - this.swipePreviousClient.y;
    this.swipePreviousClient.copy(this.swipeCurrentClient);
    const dtMs = Math.max(1, nowMs - this.swipeLastMoveTimeMs);
    this.swipeLastMoveTimeMs = nowMs;
    const deltaDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (deltaDistance <= this.swipeDeadZonePx) {
      return;
    }

    const velocityPxPerSec = (deltaDistance * 1000) / dtMs;
    const velocityStrength = THREE.MathUtils.clamp(
      velocityPxPerSec / this.swipeVelocityForMaxPxPerSec,
      0,
      1,
    );
    const distanceStrength = THREE.MathUtils.clamp(
      deltaDistance / this.swipePerMoveDistanceForMaxPx,
      0,
      1,
    );
    const strokeStrength = THREE.MathUtils.clamp(
      velocityStrength * 0.72 + distanceStrength * 0.44,
      0,
      1,
    );
    if (strokeStrength <= 0.0001) {
      return;
    }

    const position = this.marbleBody.translation();
    const forward = this
      .getTrackForwardDirectionAtPosition(position.x, position.z)
      .setY(0);
    if (forward.lengthSq() < 0.0001) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    const right = new THREE.Vector3()
      .crossVectors(forward, new THREE.Vector3(0, 1, 0))
      .normalize();
    const normalizedDragX = deltaX / Math.max(0.0001, deltaDistance);
    const normalizedDragY = deltaY / Math.max(0.0001, deltaDistance);
    this.swipeDirection
      .copy(right)
      .multiplyScalar(normalizedDragX)
      .add(forward.multiplyScalar(-normalizedDragY));
    if (this.swipeDirection.lengthSq() < 0.0001) {
      return;
    }
    this.swipeDirection.normalize();

    const curvedStrength = Math.pow(
      strokeStrength,
      this.swipeBurstStrengthExponent,
    );
    const impulseMagnitude = THREE.MathUtils.lerp(
      this.swipeBurstMinImpulse,
      this.swipeBurstMaxImpulse,
      curvedStrength,
    );
    this.pendingSwipeImpulse.addScaledVector(
      this.swipeDirection,
      impulseMagnitude,
    );
  }

  private updateSwipeOverlayVisual(
    deltaX: number,
    deltaY: number,
    strength: number,
  ): void {
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance < 0.0001 || strength <= 0.0001) {
      this.swipeHandle.style.transform = "translate(0px, 0px)";
      this.swipeOverlay.classList.remove("swipe-active");
      this.swipePowerLabel.textContent = "Swipe Power 0%";
      return;
    }
    const normX = deltaX / distance;
    const normY = deltaY / distance;
    const handleDistance = this.swipeIndicatorRadiusPx * strength;
    const handleX = normX * handleDistance;
    const handleY = normY * handleDistance;
    this.swipeHandle.style.transform =
      "translate(" +
      handleX.toFixed(1) +
      "px, " +
      handleY.toFixed(1) +
      "px)";
    this.swipeOverlay.classList.add("swipe-active");
    this.swipePowerLabel.textContent =
      "Swipe Power " + String(Math.round(strength * 100)) + "%";
  }

  private resetSwipeInput(silent: boolean = false): void {
    this.activeSwipePointerId = null;
    this.swipeStartClient.set(0, 0);
    this.swipeCurrentClient.set(0, 0);
    this.swipePreviousClient.set(0, 0);
    this.swipeStartTimeMs = 0;
    this.swipeLastMoveTimeMs = 0;
    this.swipeDirection.set(0, 0, 0);
    this.pendingSwipeImpulse.set(0, 0, 0);
    this.swipeStrength = 0;
    this.updateSwipeOverlayVisual(0, 0, 0);
    if (!silent) {
      console.log("[ResetSwipeInput]", "Swipe state cleared");
    }
  }

  private applySwipeImpulse(): void {
    if (this.gameState !== "playing" || !this.marbleBody) {
      return;
    }
    if (
      this.activeSwipePointerId !== null &&
      performance.now() - this.swipeStartTimeMs >= this.swipeMaxDurationMs
    ) {
      this.resetSwipeInput();
      return;
    }
    if (this.pendingSwipeImpulse.lengthSq() <= 0.000001) {
      return;
    }
    const impulseX = this.pendingSwipeImpulse.x;
    const impulseZ = this.pendingSwipeImpulse.z;
    this.pendingSwipeImpulse.set(0, 0, 0);
    this.marbleBody.applyImpulse(
      {
        x: impulseX,
        y: 0,
        z: impulseZ,
      },
      true,
    );
  }

  private bindSettingToggle(buttonId: string, key: keyof Settings): void {
    const button = document.getElementById(buttonId);
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.addEventListener("click", this.createSettingsToggleHandler((event) => {
      this.settings[key] = !this.settings[key];
      this.saveSettings();
      this.applySettingsUi();
      this.soundManager.playUIToggle(Boolean(this.settings[key]));
      if (key === "music") {
        this.soundManager.updateMusicState();
      }
      this.triggerLightHaptic();
      console.log(
        "[BindSettingToggle]",
        "Updated setting " + key + "=" + String(this.settings[key]),
      );
    }));
  }

  private createSettingsToggleHandler(
    callback: (event: Event) => void,
  ): (event: Event) => void {
    return (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now - this.lastSettingsToggleAtMs < 300) {
        return;
      }
      this.lastSettingsToggleAtMs = now;
      callback(event);
    };
  }

  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem("gameSettings");
      if (!raw) {
        return { music: true, fx: true, haptics: true };
      }
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        music: parsed.music ?? true,
        fx: parsed.fx ?? true,
        haptics: parsed.haptics ?? true,
      };
    } catch {
      return { music: true, fx: true, haptics: true };
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem("gameSettings", JSON.stringify(this.settings));
    } catch (error) {
      console.log(
        "[SaveSettings]",
        "Unable to persist settings: " + String(error),
      );
    }
  }

  private applySettingsUi(): void {
    this.setToggleUi("toggle-music", this.settings.music);
    this.setToggleUi("toggle-fx", this.settings.fx);
    this.setToggleUi("toggle-haptics", this.settings.haptics);
  }

  private setToggleUi(id: string, enabled: boolean): void {
    const button = document.getElementById(id);
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.dataset.enabled = enabled ? "true" : "false";
  }

  private loadPersistentState(): PersistedState {
    const state = oasiz.loadGameState();
    if (!state || typeof state !== "object") {
      return {};
    }
    return state as PersistedState;
  }

  private savePersistentState(nextState: PersistedState): void {
    this.persistentState = nextState;
    oasiz.saveGameState({ ...nextState });
  }

  private restartCurrentLevel(source: "button" | "keyboard"): void {
    if (this.gameState !== "playing") {
      return;
    }

    this.soundManager.playUIClick();
    this.triggerLightHaptic();
    this.runTimeSeconds = 0;
    this.finishedTimeSeconds = 0;
    this.fireworkTriggerZ = this.levelConfig.fireworkZ;
    this.rebuildLevelProgressMarkers();
    this.clearLevelVisuals();
    this.clearTrackPhysics();
    this.buildTrackSlices();
    this.setupSceneVisuals();
    this.createTrackPhysics();
    this.cameraAnchorsInitialized = false;
    for (const row of this.fireworkRows) {
      row.triggered = false;
    }
    for (const item of this.particles) {
      this.scene.remove(item.mesh);
    }
    this.particles = [];
    this.marbleVisuals.resetTrail();
    this.resetSwipeInput(true);
    this.setSettingsVisible(false);
    this.resetMarble();
    this.updateHud();
    this.applyUiForState();
    this.soundManager.playStartLaunch();
    console.log(
      "[RestartCurrentLevel]",
      "Reloaded current level via " + source,
    );
  }

  private startRun(): void {
    this.resetSwipeInput(true);
    this.gameState = "playing";
    this.runTimeSeconds = 0;
    this.finishedTimeSeconds = 0;
    this.loopsCompleted = 0;
    this.lastObstacleThudRunTime = -999;
    this.rotatorHitAtById.clear();
    this.rotatorTouchingById.clear();
    this.bouncyPadHitAtById.clear();
    this.bouncyPadTouchingById.clear();
    this.blockerHitAtByIndex.clear();
    this.blockerTouchingByIndex.clear();
    const useAgentDebugMinimal = this.agentDebugMinimalMode;
    this.agentDebugMinimalMode = false;
    if (!useAgentDebugMinimal) {
      this.agentDebugHideClouds = false;
    }
    const useCustomMiddle =
      Array.isArray(this.customMiddlePlatformTypes) &&
      this.customMiddlePlatformTypes.length > 0;
    this.runObstacleOrder =
      this.forcedRunObstacleOrder && this.forcedRunObstacleOrder.length > 0
        ? this.forcedRunObstacleOrder.slice()
        : createRunObstacleOrder();
    console.log(
      "[InitializeRunObstacleOrder]",
      "Run obstacle order=" + this.runObstacleOrder.join(","),
    );
    this.levelConfig = this.createRandomLevelConfig(
      useCustomMiddle ? this.customMiddlePlatformTypes : null,
    );
    this.fireworkTriggerZ = this.levelConfig.fireworkZ;
    this.rebuildLevelProgressMarkers();
    this.clearLevelVisuals();
    this.clearTrackPhysics();
    this.buildTrackSlices();
    if (useAgentDebugMinimal) {
      this.horizontalBlockers = [];
      this.blockerHitAtByIndex.clear();
      this.blockerTouchingByIndex.clear();
      this.rotatorObstacles = [];
      this.pinballBouncers = [];
      this.bouncyPads = [];
    } else {
      this.buildRunObstacles();
    }
    this.setupSceneVisuals();
    this.createTrackPhysics();
    this.cameraAnchorsInitialized = false;
    for (const row of this.fireworkRows) {
      row.triggered = false;
    }
    for (const item of this.particles) {
      this.scene.remove(item.mesh);
    }
    this.particles = [];
    this.marbleVisuals.resetTrail();
    this.setSettingsVisible(false);
    this.resetMarble();
    this.updateHud();
    this.applyUiForState();
    this.applyAgentDebugPostSpawn();
    this.soundManager.onRunStart();
    this.soundManager.playStartLaunch();
    console.log(
      "[StartRun]",
      "Run started in " +
        (this.endlessMode ? "endless" : "classic") +
        " mode with " +
        (useCustomMiddle ? "custom" : "random") +
        " layout" +
        (useAgentDebugMinimal ? " (agent debug minimal)" : ""),
    );
  }

  private addLevelObject(object: THREE.Object3D): void {
    this.scene.add(object);
    this.levelObjects.push(object);
  }

  private clearLevelVisuals(): void {
    for (const object of this.levelObjects) {
      this.scene.remove(object);
      object.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          if (node.geometry) {
            node.geometry.dispose();
          }
          if (Array.isArray(node.material)) {
            for (const material of node.material) {
              if (
                material !== this.trackMaterial &&
                material !== this.marbleMaterial
              ) {
                material.dispose();
              }
            }
          } else if (
            node.material &&
            node.material !== this.trackMaterial &&
            node.material !== this.marbleMaterial
          ) {
            node.material.dispose();
          }
        } else if (node instanceof THREE.Line) {
          if (node.geometry) {
            node.geometry.dispose();
          }
          const lineMaterial = node.material;
          if (Array.isArray(lineMaterial)) {
            for (const material of lineMaterial) {
              material.dispose();
            }
          } else if (lineMaterial) {
            lineMaterial.dispose();
          }
        } else if (node instanceof THREE.Sprite) {
          const spriteMaterial = node.material;
          if (spriteMaterial.map) {
            spriteMaterial.map.dispose();
          }
          spriteMaterial.dispose();
        }
      });
    }
    this.levelObjects = [];
    this.debugPlatformLabels = [];
    this.debugBoundaryMarkers = [];
    this.trackWireframeObjects = [];
    this.physicsWireframeObjects = [];
    this.fireworkRows = [];
    clearObstacleVisualState({
      obstacleMeshById: this.obstacleMeshById,
      bouncyPadPaddleById: this.bouncyPadPaddleById,
      bouncerCapById: this.bouncerCapById,
      bouncerPulseById: this.bouncerPulseById,
    });
  }

  private clearTrackPhysics(): void {
    clearTrackPhysicsBodies(
      this.world,
      this.trackRigidBodies,
      this.obstacleBodyById,
      this.bouncyPadJointById,
    );
  }

  private advanceToNextRandomLevel(): void {
    if (!this.world || !this.marbleBody) {
      return;
    }

    this.loopsCompleted += 1;
    this.levelConfig = this.createRandomLevelConfig();
    this.fireworkTriggerZ = this.levelConfig.fireworkZ;
    this.rebuildLevelProgressMarkers();

    for (const item of this.particles) {
      this.scene.remove(item.mesh);
    }
    this.particles = [];
    this.marbleVisuals.resetTrail();

    this.clearLevelVisuals();
    this.clearTrackPhysics();
    this.buildTrackSlices();
    this.buildRunObstacles();
    this.setupSceneVisuals();
    this.createTrackPhysics();
    this.cameraAnchorsInitialized = false;
    this.resetSwipeInput(true);
    this.resetMarble();
    this.updateLevelProgressUi();

    console.log(
      "[AdvanceToNextRandomLevel]",
      "Advanced to random level #" + String(this.loopsCompleted),
    );
  }

  private endRun(finished: boolean): void {
    if (this.gameState !== "playing") {
      return;
    }

    this.gameState = "gameOver";
    this.resetSwipeInput(true);
    this.finishedTimeSeconds = this.runTimeSeconds;

    if (finished) {
      const score = this.calculateScore(this.finishedTimeSeconds);
      this.resultLabel.textContent =
        "Finish time: " +
        this.finishedTimeSeconds.toFixed(2) +
        "s | Score: " +
        String(score);
      this.submitFinalScore(score);
      this.soundManager.playFinish();
      this.soundManager.advanceToNextTrack();
      this.triggerHaptic("success");
    } else {
      this.loopsCompleted = 0;
      const score = 0;
      this.resultLabel.textContent = "Run failed. Score: 0";
      this.submitFinalScore(score);
      this.soundManager.playFallOff();
      this.triggerHaptic("error");
    }

    const runsCompleted = (this.persistentState.runsCompleted ?? 0) + 1;
    this.savePersistentState({ runsCompleted });
    oasiz.flushGameState();

    this.applyUiForState();
    console.log("[EndRun]", "Run ended with finished=" + String(finished));
  }

  private calculateScore(timeSeconds: number): number {
    const clamped = Math.max(0, Math.min(this.maxRunSeconds, timeSeconds));
    const score = Math.max(0, Math.floor((this.maxRunSeconds - clamped) * 100));
    return score;
  }

  private submitFinalScore(score: number): void {
    const safeScore = Math.max(0, Math.floor(score));
    oasiz.submitScore(safeScore);
    console.log("[SubmitFinalScore]", "Submitted score=" + String(safeScore));
  }

  private emitScoreConfig(): void {
    const sdkBridge = oasiz as typeof oasiz & {
      emitScoreConfig?: (config: {
        anchors: Array<{ raw: number; normalized: number }>;
      }) => void;
    };
    if (typeof sdkBridge.emitScoreConfig !== "function") {
      console.log("[EmitScoreConfig]", "emitScoreConfig unavailable");
      return;
    }
    sdkBridge.emitScoreConfig({
      anchors: [
        { raw: 500, normalized: 120 },
        { raw: 2000, normalized: 360 },
        { raw: 4000, normalized: 680 },
        { raw: 6000, normalized: 950 },
      ],
    });
    console.log("[EmitScoreConfig]", "Published score anchors");
  }

  private setSettingsVisible(visible: boolean): void {
    this.settingsModal.classList.toggle("hidden", !visible);
    this.syncGameplayActivity();
    if (visible) {
      this.setSettingsTab(this.isMobile ? "audio" : this.activeSettingsTab);
      if (!this.isMobile) {
        this.designedMiddleTypes = this.readDesignerMiddleTypes();
        this.updateDesignerMeta();
        this.updateDesignerRepeatMeta();
      }
    }
  }

  private syncGameplayActivity(): void {
    const sdkBridge = oasiz as unknown as {
      gameplayStart?: () => void;
      gameplayStop?: () => void;
    };
    const runtimeOasiz = (globalThis as { oasiz?: typeof sdkBridge }).oasiz;
    const settingsOpen = !this.settingsModal.classList.contains("hidden");
    const shouldBeActive = this.gameState === "playing" && !settingsOpen;
    if (shouldBeActive) {
      const sdkCall = sdkBridge.gameplayStart;
      const runtimeCall = runtimeOasiz?.gameplayStart;
      if (typeof sdkCall === "function") {
        sdkCall();
        console.log("[SyncGameplayActivity]", "gameplayStart via sdk import");
      } else if (typeof runtimeCall === "function") {
        runtimeCall();
        console.log("[SyncGameplayActivity]", "gameplayStart via runtime oasiz");
      } else {
        console.log("[SyncGameplayActivity]", "gameplayStart unavailable");
      }
    } else {
      const sdkCall = sdkBridge.gameplayStop;
      const runtimeCall = runtimeOasiz?.gameplayStop;
      if (typeof sdkCall === "function") {
        sdkCall();
        console.log("[SyncGameplayActivity]", "gameplayStop via sdk import");
      } else if (typeof runtimeCall === "function") {
        runtimeCall();
        console.log("[SyncGameplayActivity]", "gameplayStop via runtime oasiz");
      } else {
        console.log("[SyncGameplayActivity]", "gameplayStop unavailable");
      }
    }
  }

  private applyUiForState(): void {
    const isStart = this.gameState === "start";
    const isPlaying = this.gameState === "playing";
    const isGameOver = this.gameState === "gameOver";

    this.startScreen.classList.toggle("hidden", !isStart);
    this.hud.classList.toggle("hidden", !isPlaying);
    this.settingsButton.classList.toggle("hidden", !isPlaying);
    this.restartButton.classList.toggle("hidden", !isPlaying);
    this.swipeOverlay.classList.toggle("hidden", !isPlaying);
    this.gameOverScreen.classList.toggle("hidden", !isGameOver);
    this.settingsModal.classList.add("hidden");
    this.updatePhysicsDebugPanelVisibility();
    this.updateCloudCountOverlay();
    this.updateThudTraceOverlay();
    this.updateDebugPlatformLabelVisibility();
    if (!isPlaying) {
      this.resetSwipeInput(true);
    }
    this.syncGameplayActivity();
  }

  private updatePhysicsDebugPanelVisibility(): void {
    const shouldShow =
      this.gameState === "playing" &&
      !this.isMobile &&
      this.debugPhysicsPanelEnabled;
    this.physicsDebugPanel.style.display = shouldShow ? "block" : "none";
  }

  private triggerLightHaptic(): void {
    this.triggerHaptic("light");
  }

  private triggerHaptic(type: HapticType): void {
    if (!this.settings.haptics) {
      return;
    }
    oasiz.triggerHaptic(type);
  }

  private resetMarble(): void {
    if (!this.marbleBody) {
      return;
    }

    const spawnS = this.getStartSpawnArcLength();
    const startSample = this.getTrackSampleAtArcLength(spawnS);
    resetMarbleBody(
      this.marbleBody,
      startSample,
      this.marbleRadius,
      (s) => this.getTrackSurfaceYAtArcLength(s),
      spawnS,
    );
    this.marbleBody.setLinvel(
      {
        x: 0,
        y: 0,
        z: 0,
      },
      true,
    );

    const bodyPosition = this.marbleBody.translation();
    this.marbleMesh.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
    this.marbleMesh.quaternion.identity();
    this.wasAirborne = false;
    this.airborneSeconds = 0;
    this.previousVerticalVelocity = 0;

    this.updateCamera(0.16);
    console.log("[ResetMarble]", "Marble reset to start");
  }

  private getTrackSurfaceY(z: number): number {
    const clampedZ = THREE.MathUtils.clamp(z, this.finishZ, this.startZ);
    for (let i = 0; i < this.trackSamples.length - 1; i += 1) {
      const a = this.trackSamples[i];
      const b = this.trackSamples[i + 1];
      if (clampedZ <= a.nominalZ && clampedZ >= b.nominalZ) {
        const t =
          (a.nominalZ - clampedZ) / Math.max(0.0001, a.nominalZ - b.nominalZ);
        return THREE.MathUtils.lerp(a.y, b.y, t);
      }
    }
    return (
      this.trackSamples[this.trackSamples.length - 1]?.y ?? this.trackCenterY
    );
  }

  private getTrackSurfaceYAtPosition(x: number, z: number): number {
    const nearest = this.getNearestTrackSample(x, z);
    const centerX = nearest.x;
    const width = nearest.width;
    const baseY = nearest.y;
    const bankOffset = this.getHalfPipeHeightAtOffset(
      Math.abs(x - centerX),
      width,
    );
    return baseY + bankOffset;
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.isMobile ? 1.75 : 2),
    );
    this.renderer.setSize(width, height);

    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();

    console.log(
      "[HandleResize]",
      "Viewport resized to " + String(width) + "x" + String(height),
    );
  }

  private frame(timeMs: number): void {
    const nowSeconds = timeMs / 1000;
    const delta = Math.min(0.05, nowSeconds - this.lastFrameSeconds);
    this.lastFrameSeconds = nowSeconds;
    const instantFps = 1 / Math.max(0.0001, delta);
    this.fpsSmoothed = THREE.MathUtils.lerp(this.fpsSmoothed, instantFps, 0.12);
    this.fpsLabel.textContent = "FPS " + String(Math.round(this.fpsSmoothed));

    if (this.debugFlyMode) {
      this.accumulator = 0;
    } else {
      this.accumulator += delta;
      while (this.accumulator >= this.fixedStep) {
        this.stepPhysics(this.fixedStep);
        if (this.gameState === "playing") {
          applyObstacleInteractions({
            runTimeSeconds: this.runTimeSeconds,
            marbleRadius: this.marbleRadius,
            marbleBody: this.marbleBody,
            rotatorObstacles: this.rotatorObstacles,
            bouncyPads: this.bouncyPads,
            pinballBouncers: this.pinballBouncers,
            swingingHammers: this.swingingHammers,
            fallingPlatforms: this.fallingPlatforms,
            rotatorHitAtById: this.rotatorHitAtById,
            rotatorTouchingById: this.rotatorTouchingById,
            bouncyPadHitAtById: this.bouncyPadHitAtById,
            bouncyPadTouchingById: this.bouncyPadTouchingById,
            hammerHitAtById: this.hammerHitAtById,
            hammerTouchingById: this.hammerTouchingById,
            horizontalBlockers: this.horizontalBlockers,
            blockerHitAtByIndex: this.blockerHitAtByIndex,
            blockerTouchingByIndex: this.blockerTouchingByIndex,
            bouncerPulseById: this.bouncerPulseById,
            onRotatorHit: (impact) => {
              this.playObstacleThud(impact, "rotator");
            },
            onBouncyPadHit: (impact) => {
              this.playObstacleThud(impact, "bouncy_pad");
            },
            onHorizontalBlockerHit: (impact) => {
              this.playObstacleThud(impact, "horizontal_blocker");
            },
            onPinballBouncerHit: () => {
              this.soundManager.playBouncerBoing();
            },
            onSwingingHammerHit: (impact) => {
              this.playObstacleThud(impact, "swinging_hammer");
            },
          });
          updateWaveObstacleAnimationData({
            fixedStep: this.fixedStep,
            runTimeSeconds: this.runTimeSeconds,
            rotatorObstacles: this.rotatorObstacles,
            pinballBouncers: this.pinballBouncers,
            bouncyPads: this.bouncyPads,
            swingingHammers: this.swingingHammers,
            fallingPlatforms: this.fallingPlatforms,
            obstacleMeshById: this.obstacleMeshById,
            bouncyPadPaddleById: this.bouncyPadPaddleById,
            bouncerCapById: this.bouncerCapById,
            bouncerPulseById: this.bouncerPulseById,
            obstacleBodyById: this.obstacleBodyById,
            bouncyPadJointById: this.bouncyPadJointById,
          });
        }
        this.accumulator -= this.fixedStep;
      }
    }

    if (this.debugFlyMode) {
      this.updateDebugCamera(delta);
    } else {
      this.updateCamera(delta);
    }
    const locomotionVelocity = this.marbleBody?.linvel();
    const locomotionSpeed = locomotionVelocity
      ? Math.sqrt(
        locomotionVelocity.x * locomotionVelocity.x +
          locomotionVelocity.z * locomotionVelocity.z,
      )
      : 0;
    const locomotionInAir = this.physicsDebugSnapshot?.airborne ?? true;
    const locomotionVerticalVelocity = locomotionVelocity?.y ?? 0;
    const rollingSpeed =
      this.gameState === "playing" && !this.debugFlyMode ? locomotionSpeed : 0;
    const rollingInAir =
      this.gameState === "playing" && !this.debugFlyMode ? locomotionInAir : true;
    this.soundManager.updateLocomotion(rollingSpeed, rollingInAir);
    if (this.gameState === "playing" && !this.debugFlyMode) {
      if (locomotionInAir) {
        this.airborneSeconds += delta;
      }
      if (this.wasAirborne && !locomotionInAir) {
        const impactSpeed = Math.max(0, -this.previousVerticalVelocity);
        if (
          this.airborneSeconds > 0.14 &&
          impactSpeed > 3.2 &&
          this.runTimeSeconds - this.lastLandingSfxRunTime > 0.28
        ) {
          const thudInfo = this.soundManager.playHeavyLanding(impactSpeed);
          this.recordThudTraceEvent(thudInfo);
          this.lastLandingSfxRunTime = this.runTimeSeconds;
        }
        this.airborneSeconds = 0;
      }
      this.wasAirborne = locomotionInAir;
      this.previousVerticalVelocity = locomotionVerticalVelocity;
    } else {
      this.wasAirborne = false;
      this.airborneSeconds = 0;
      this.previousVerticalVelocity = locomotionVerticalVelocity;
    }
    this.marbleVisuals.update(
      {
        gameState: this.gameState,
        marbleBody: this.marbleBody,
        marbleMesh: this.marbleMesh,
      },
      delta,
    );
    this.updateParticles(delta);
    this.updateHud();
    this.updatePhysicsDebugOverlay();
    this.renderer.render(this.scene, this.camera);

    this.animationFrameId = window.requestAnimationFrame((next) =>
      this.frame(next),
    );
  }

  private stepPhysics(stepSeconds: number): void {
    this.applySwipeImpulse();
    stepPhysicsTick(this as unknown as PhysicsHost, stepSeconds);
    this.updateFireworkTriggers();
  }

  private isInsideFinishFrame(position: RAPIER.Vector): boolean {
    const finishCenterX = this.sampleTrackX(this.finishZ);
    const finishSurfaceY = this.getTrackSurfaceY(this.finishZ);
    const frameHalfInnerWidth = this.trackWidth * 0.5 - 1.25;
    const frameBottomY = finishSurfaceY + 0.05;
    const frameTopY = finishSurfaceY + 8.15;
    const xInset = this.marbleRadius * 0.2;
    const yInset = this.marbleRadius * 0.2;
    const withinX =
      Math.abs(position.x - finishCenterX) <= frameHalfInnerWidth - xInset;
    const withinY =
      position.y >= frameBottomY + yInset &&
      position.y <= frameTopY - yInset;
    return withinX && withinY;
  }

  private updateFireworkTriggers(): void {
    if (this.gameState !== "playing" || !this.marbleBody) {
      return;
    }
    const marblePosition = this.marbleBody.translation();
    const marbleZ = marblePosition.z;
    for (const row of this.fireworkRows) {
      if (
        !row.triggered &&
        marbleZ <= row.activationZ &&
        this.isInsideFireworkLane(row, marblePosition)
      ) {
        row.triggered = true;
        this.spawnFireworks(row.burstPoints);
      }
    }
  }

  private isInsideFireworkLane(
    row: FireworkRow,
    position: RAPIER.Vector,
  ): boolean {
    if (row.burstPoints.length < 2) {
      return false;
    }
    const leftX = Math.min(row.burstPoints[0].x, row.burstPoints[1].x);
    const rightX = Math.max(row.burstPoints[0].x, row.burstPoints[1].x);
    const xInset = this.marbleRadius * 0.2;
    const withinX = position.x >= leftX + xInset && position.x <= rightX - xInset;
    const surfaceY = this.getTrackSurfaceY(row.activationZ);
    const minY = surfaceY - this.marbleRadius * 0.35;
    const withinY = position.y >= minY;
    return withinX && withinY;
  }

  private updateCamera(delta: number): void {
    const targetPosition = this.marbleMesh.position;
    const nearest = this.getNearestTrackSample(targetPosition.x, targetPosition.z);
    const forward = this.getTrackForwardDirectionAtArcLength(nearest.s);
    const followTarget = targetPosition
      .clone()
      .add(new THREE.Vector3(0, 8.5, 0))
      .add(forward.clone().multiplyScalar(-12));
    const lookTarget = targetPosition
      .clone()
      .add(new THREE.Vector3(0, 0.2, 0))
      .add(forward.clone().multiplyScalar(4.8));

    if (!this.cameraAnchorsInitialized) {
      this.cameraFollowAnchor.copy(followTarget);
      this.cameraLookAnchor.copy(lookTarget);
      this.cameraAnchorsInitialized = true;
    }

    // Delayed camera anchors smooth small physics jitters.
    const followSmooth = Math.min(1, delta * 2.2);
    const lookSmooth = Math.min(1, delta * 2.6);
    this.cameraFollowAnchor.lerp(followTarget, followSmooth);
    this.cameraLookAnchor.lerp(lookTarget, lookSmooth);

    const cameraSmooth = Math.min(1, delta * 4.0);
    this.camera.position.lerp(this.cameraFollowAnchor, cameraSmooth);
    this.camera.lookAt(this.cameraLookAnchor);
  }

  private updateDebugCamera(delta: number): void {
    const moveSpeed = this.debugMoveFast ? 54 : 27;
    const moveStep = moveSpeed * delta;

    const forward = new THREE.Vector3(
      Math.sin(this.debugYaw) * Math.cos(this.debugPitch),
      Math.sin(this.debugPitch),
      -Math.cos(this.debugYaw) * Math.cos(this.debugPitch),
    ).normalize();
    const right = new THREE.Vector3()
      .crossVectors(forward, new THREE.Vector3(0, 1, 0))
      .normalize();
    const move = new THREE.Vector3();
    if (this.debugMoveForward) {
      move.add(forward);
    }
    if (this.debugMoveBackward) {
      move.sub(forward);
    }
    if (this.debugMoveRight) {
      move.add(right);
    }
    if (this.debugMoveLeft) {
      move.sub(right);
    }
    if (this.debugMoveUp) {
      move.y += 1;
    }
    if (this.debugMoveDown) {
      move.y -= 1;
    }
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(moveStep);
      this.debugFlyPosition.add(move);
    }

    this.camera.position.copy(this.debugFlyPosition);
    this.camera.lookAt(this.debugFlyPosition.clone().add(forward));
  }

  private getTrackForwardDirection(z: number): THREE.Vector3 {
    const s = this.getArcLengthFromNominalZ(z);
    return this.getTrackForwardDirectionAtArcLength(s);
  }

  private updateHud(): void {
    const velocity = this.marbleBody?.linvel();
    const speed = velocity
      ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z)
      : 0;
    const currentLevel = this.loopsCompleted + 1;
    this.timeLabel.textContent =
      "Level: " +
      String(currentLevel) +
      " | Passed: " +
      String(this.loopsCompleted);
    this.speedLabel.textContent = "Speed: " + speed.toFixed(1);
    this.updateLevelProgressUi();
  }

  private setPhysicsDebug(snapshot: PhysicsDebugSnapshot): void {
    this.physicsDebugSnapshot = snapshot;
  }

  private updatePhysicsDebugOverlay(): void {
    if (!this.physicsDebugSnapshot) {
      return;
    }
    const debug = this.physicsDebugSnapshot;
    const jumpHint =
      debug.verticalDelta > 0.8
        ? "upward velocity injected by collision/normal response"
        : "no strong upward injection detected";
    const label = "color:#8fb7de";
    const value = "color:#ffe08a";
    const title = "color:#b7d8ff";
    const note = "color:#9ad2b6";
    this.physicsDebugPanel.innerHTML =
      "<span style=\"" +
      title +
      "\">Rapier Marble Metrics</span>\n" +
      "<span style=\"" +
      label +
      "\">hSpeed=</span><span style=\"" +
      value +
      "\">" +
      debug.horizontalSpeed.toFixed(3) +
      "</span> " +
      "<span style=\"" +
      label +
      "\">maxHSpeed=</span><span style=\"" +
      value +
      "\">" +
      this.maxHorizontalSpeed.toFixed(3) +
      "</span> " +
      "<span style=\"" +
      label +
      "\">startRatio=</span><span style=\"" +
      value +
      "\">" +
      this.startMomentumRatio.toFixed(3) +
      "</span> " +
      "<span style=\"" +
      label +
      "\">rampSec=</span><span style=\"" +
      value +
      "\">" +
      this.speedRampSeconds.toFixed(2) +
      "</span>\n" +
      "<span style=\"" +
      label +
      "\">vY=</span><span style=\"" +
      value +
      "\">" +
      debug.verticalVelocity.toFixed(3) +
      "</span> " +
      "<span style=\"" +
      label +
      "\">dVY=</span><span style=\"" +
      value +
      "\">" +
      debug.verticalDelta.toFixed(3) +
      "</span>\n" +
      "<span style=\"" +
      label +
      "\">jumpHint=</span><span style=\"" +
      note +
      "\">" +
      jumpHint +
      "</span>";
  }

  private rebuildLevelProgressMarkers(): void {
    while (this.levelProgressMarkers.firstChild) {
      this.levelProgressMarkers.removeChild(
        this.levelProgressMarkers.firstChild,
      );
    }

    const sections = this.levelConfig.sections;
    const firstSection = sections[0];
    const lastSection = sections[sections.length - 1];
    this.levelProgressStartZ = firstSection ? firstSection.zStart : this.startZ;
    this.levelProgressEndZ = lastSection ? lastSection.zEnd : this.finishZ;
    this.levelProgressMarble.style.left = "0%";

    const sectionCount = Math.max(1, sections.length);
    if (sectionCount <= 1) {
      return;
    }

    for (let index = 1; index < sectionCount; index += 1) {
      const marker = document.createElement("div");
      marker.className = "level-progress-marker";
      marker.style.left = ((index / sectionCount) * 100).toFixed(3) + "%";
      this.levelProgressMarkers.appendChild(marker);
    }
    console.log(
      "[RebuildLevelProgressMarkers]",
      "Progress markers rebuilt for sections: " + String(sectionCount),
    );
  }

  private calculateLevelProgress(s: number): number {
    return THREE.MathUtils.clamp(
      s / Math.max(0.001, this.trackArcLength),
      0,
      1,
    );
  }

  private updateLevelProgressUi(): void {
    const marblePosition = this.marbleBody?.translation();
    const progress = marblePosition
      ? this.calculateLevelProgress(
          this.getNearestTrackSample(marblePosition.x, marblePosition.z).s,
        )
      : 0;
    this.levelProgressMarble.style.left = (progress * 100).toFixed(3) + "%";
  }
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("game-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Missing game canvas");
  }

  const game = new MarbleMadnessStarter(canvas);
  await game.init();
  console.log("[Boot]", "Game boot complete");
}

void boot();

export {};
