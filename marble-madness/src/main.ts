import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

const BUILD_VERSION = "0.5.52";

type GameState = "start" | "playing" | "gameOver";
type HapticType = "light" | "medium" | "heavy" | "success" | "error";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface PersistedState {
  runsCompleted?: number;
}

interface TrackSample {
  z: number;
  x: number;
  y: number;
  tilt: number;
  width: number;
  hasFloor: boolean;
}

interface TrackSlice {
  zStart: number;
  zEnd: number;
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  centerZ: number;
  centerX: number;
  centerY: number;
  length: number;
  tilt: number;
  width: number;
  hasFloor: boolean;
}

interface FireworkParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

interface FireworkRow {
  activationZ: number;
  burstPoints: THREE.Vector3[];
  triggered: boolean;
}

type PlatformType =
  | "flat"
  | "slope_up_steep"
  | "slope_down_soft"
  | "slope_down_steep"
  | "detour_left_short"
  | "detour_right_short"
  | "bottleneck"
  | "gap_short"
  | "finish_straight";

interface PlatformSection {
  type: PlatformType;
  zStart: number;
  zEnd: number;
  slope: number;
  width: number;
  hasFloor: boolean;
  detourDirection: -1 | 1;
  detourMagnitude: number;
  lateralOffsetStart: number;
  lateralOffsetEnd: number;
}

interface LevelConfig {
  platformCount: number;
  sections: PlatformSection[];
  enemyPackCenterZ: number;
  fireworkZ: number;
}

interface HorizontalBlocker {
  x: number;
  y: number;
  z: number;
  length: number;
  height: number;
  depth: number;
  tilt: number;
}

type ObstacleKind = "rotator_x" | "pinball_bouncer" | "bouncy_pad";

interface ObstacleBase {
  id: string;
  kind: ObstacleKind;
  x: number;
  y: number;
  z: number;
  tilt: number;
  radius: number;
}

interface RotatorXObstacle extends ObstacleBase {
  kind: "rotator_x";
  side: "left" | "right";
  armLength: number;
  armThickness: number;
  height: number;
  spinSpeed: number;
  spinDir: 1 | -1;
  angle: number;
  lastHitAt: number;
}

interface PinballBouncerObstacle extends ObstacleBase {
  kind: "pinball_bouncer";
  columnHeight: number;
  capRadius: number;
  bounceImpulse: number;
  lastHitAt: number;
}

interface BouncyPadObstacle extends ObstacleBase {
  kind: "bouncy_pad";
  side: "left" | "right";
  paddleLength: number;
  paddleWidth: number;
  sweepAmplitude: number;
  sweepSpeed: number;
  phase: number;
  sweepAngle: number;
  launchImpulse: number;
  lastHitAt: number;
}

declare global {
  interface Window {
    submitScore?: (score: number) => void;
    triggerHaptic?: (type: HapticType) => void;
    loadGameState?: () => Record<string, unknown>;
    saveGameState?: (state: Record<string, unknown>) => void;
  }
}

class SoundManager {
  private audioCtx: AudioContext | null = null;
  private rollingGain: GainNode | null = null;
  private rollingFilter: BiquadFilterNode | null = null;
  private musicGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private initialized = false;

  constructor(private getSettings: () => Settings) {}

  public init(): void {
    if (this.initialized) return;
    try {
      this.audioCtx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      this.setupContinuousSounds();
      this.loadMusic();
      this.initialized = true;
      console.log("[SoundManager] Initialized");
    } catch (e) {
      console.error("[SoundManager] Failed to init AudioContext", e);
    }
  }

  private async loadMusic(): Promise<void> {
    if (!this.audioCtx) return;
    try {
      const response = await fetch("/assets/sky-rider.mp3");
      const arrayBuffer = await response.arrayBuffer();
      this.musicBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      console.log("[SoundManager] Music loaded");
      this.tryStartMusic();
    } catch (e) {
      console.error("[SoundManager] Failed to load music", e);
    }
  }

  private tryStartMusic(): void {
    if (!this.audioCtx || !this.musicBuffer || this.musicSource) return;

    this.musicGain = this.audioCtx.createGain();
    this.musicGain.gain.value = this.getSettings().music ? 0.35 : 0;
    this.musicGain.connect(this.audioCtx.destination);

    this.musicSource = this.audioCtx.createBufferSource();
    this.musicSource.buffer = this.musicBuffer;
    this.musicSource.loop = true;
    this.musicSource.connect(this.musicGain);
    this.musicSource.start(0);
  }

  public updateMusicState(): void {
    if (!this.audioCtx || !this.musicGain) return;
    const targetGain = this.getSettings().music ? 0.35 : 0;
    this.musicGain.gain.setTargetAtTime(
      targetGain,
      this.audioCtx.currentTime,
      0.2,
    );
  }

  public resume(): void {
    if (this.audioCtx?.state === "suspended") {
      this.audioCtx.resume();
    }
    this.tryStartMusic();
  }

  private setupContinuousSounds(): void {
    if (!this.audioCtx) return;

    // Noise buffer
    const bufferSize = this.audioCtx.sampleRate * 2;
    const buffer = this.audioCtx.createBuffer(
      1,
      bufferSize,
      this.audioCtx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Rolling sound
    const rollingSource = this.audioCtx.createBufferSource();
    rollingSource.buffer = buffer;
    rollingSource.loop = true;

    this.rollingFilter = this.audioCtx.createBiquadFilter();
    this.rollingFilter.type = "lowpass";
    this.rollingFilter.frequency.value = 100;

    this.rollingGain = this.audioCtx.createGain();
    this.rollingGain.gain.value = 0;

    rollingSource.connect(this.rollingFilter);
    this.rollingFilter.connect(this.rollingGain);
    this.rollingGain.connect(this.audioCtx.destination);
    rollingSource.start();
  }

  public updateLocomotion(speed: number, inAir: boolean): void {
    if (!this.audioCtx || !this.initialized) return;

    if (!this.getSettings().fx) {
      if (this.rollingGain)
        this.rollingGain.gain.setTargetAtTime(
          0,
          this.audioCtx.currentTime,
          0.1,
        );
      return;
    }

    const t = this.audioCtx.currentTime;

    if (inAir) {
      if (this.rollingGain) this.rollingGain.gain.setTargetAtTime(0, t, 0.1);
    } else {
      const targetRollingGain = Math.min(0.1, speed * 0.004);
      const targetRollingFreq = 100 + speed * 15;
      if (this.rollingGain)
        this.rollingGain.gain.setTargetAtTime(targetRollingGain, t, 0.1);
      if (this.rollingFilter)
        this.rollingFilter.frequency.setTargetAtTime(targetRollingFreq, t, 0.1);
    }
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    vol: number,
    freqDecay: boolean = false,
  ): void {
    if (!this.audioCtx || !this.initialized || !this.getSettings().fx) return;

    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqDecay) {
      osc.frequency.exponentialRampToValueAtTime(freq * 0.1, t + duration);
    }

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(t);
    osc.stop(t + duration);
  }

  private playNoiseBurst(
    duration: number,
    vol: number,
    filterFreq: number,
  ): void {
    if (!this.audioCtx || !this.initialized || !this.getSettings().fx) return;

    const bufferSize = this.audioCtx.sampleRate * duration;
    const buffer = this.audioCtx.createBuffer(
      1,
      bufferSize,
      this.audioCtx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;

    const gain = this.audioCtx.createGain();
    const t = this.audioCtx.currentTime;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioCtx.destination);

    source.start(t);
  }

  public playEnemyHit(impact: number): void {
    const vol = Math.min(0.5, impact * 0.1);
    this.playTone(300 + Math.random() * 100, "square", 0.1, vol);
    this.playNoiseBurst(0.1, vol, 1000);
  }

  public playWallHit(impact: number): void {
    const vol = Math.min(0.5, impact * 0.1);
    this.playNoiseBurst(0.15, vol, 400);
  }

  public playHeavyLanding(impact: number): void {
    const vol = Math.min(0.6, impact * 0.1);
    this.playTone(100, "sine", 0.2, vol, true);
    this.playNoiseBurst(0.2, vol, 500);
  }

  public playStartLaunch(): void {
    this.playTone(400, "square", 0.2, 0.3);
    this.playTone(600, "square", 0.3, 0.3);
  }

  public playFallOff(): void {
    if (!this.audioCtx || !this.initialized || !this.getSettings().fx) return;
    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 1.0);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0, t + 1.0);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(t);
    osc.stop(t + 1.0);
  }

  public playFinish(): void {
    this.playTone(400, "square", 0.1, 0.2);
    setTimeout(() => this.playTone(500, "square", 0.1, 0.2), 100);
    setTimeout(() => this.playTone(600, "square", 0.4, 0.2), 200);
  }

  public playFirework(): void {
    this.playNoiseBurst(0.4, 0.3, 2000);
    this.playTone(200 + Math.random() * 400, "sine", 0.3, 0.2, true);
  }

  public playUIClick(): void {
    this.playTone(800, "sine", 0.05, 0.1);
  }

  public playUIToggle(on: boolean): void {
    this.playTone(on ? 1000 : 600, "sine", 0.05, 0.1);
  }
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
  private trackMaterial: THREE.MeshStandardMaterial;
  private enemyMaterial: THREE.MeshStandardMaterial;
  private enemyMarbleMeshes: THREE.Mesh[] = [];
  private enemyMarbleBodies: RAPIER.RigidBody[] = [];

  private gameState: GameState = "start";
  private settings: Settings;
  private persistentState: PersistedState = {};

  private inputLeft = false;
  private inputRight = false;

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
  private readonly trackWidth = 12;
  private readonly trackLength = 330;
  private readonly trackThickness = 2;
  private readonly trackCenterY = 30;
  private readonly trackCenterZ = 0;
  private readonly startZ = 106;
  private readonly finishZ = -198;
  private readonly loseY = -50;
  private readonly loseBoundaryDrop = 18;
  private readonly maxRunSeconds = 60;
  private readonly marbleRadius = 1;
  private readonly enemyMarbleRadius = 0.95;
  private readonly enemyMarbleCount = 20;
  private readonly startFlickSpeed = 16;
  private readonly nudgeImpulse = 1.35;
  private readonly downhillImpulse = 0.06;
  private readonly enemyImpulseMultiplier = 0.7;
  private readonly playerCollisionSteerImpulse = 0.2;
  private readonly enemyBulldozeSideImpulse = 1.55;
  private readonly enemyBulldozeForwardImpulse = 0.9;
  private readonly playerContactUpwardVelocityCap = 4.2;
  private readonly enemyContactUpwardVelocityCap = 16;
  private readonly maxSteeringAngle = Math.PI / 4;
  private readonly steeringTurnRate = 5.5;
  private readonly steeringReturnRate = 4.5;
  private readonly steeringImpulseScale = 0.22;
  private readonly arrowDriveImpulseScale = 0.14;
  private readonly enemyForwardImpulseRatio = 0.8;
  private readonly enemyMaxForwardSpeed = 24;
  private readonly enemyKnockScore = 100;
  private readonly steeringArrowGap = 3.1;
  private readonly steeringArrowLength = 4.1;
  private readonly steeringArrowHeadLength = 1.05;
  private readonly steeringArrowShaftWidth = 0.528;
  private readonly steeringArrowHeadWidth = 1.18;
  private readonly speedMultiplier = 18;
  private readonly trackStep = 0.9;
  private readonly wallHeight = 3.6;
  private readonly wallThickness = 0.8;
  private readonly downhillSlopeAngle = Math.PI / 4;
  private readonly uphillSlopeAngle = -Math.PI / 4;
  private readonly slopeBlendDistance = 8.5;
  private readonly blockerHeight = 1.25;
  private readonly blockerDepth = 0.9;
  private readonly blockerGapWidth = 4.1;
  private readonly blockerSideMargin = 0.9;
  private readonly blockerMinSpacing = 8.5;
  private readonly blockerMaxPerLevel = 8;
  private readonly obstacleStartSafeDistance = 30;
  private readonly obstacleFinishSafeDistance = 28;
  private readonly obstacleClusterSpacing = 12;
  private readonly obstacleMinDistance = 2.2;
  private readonly obstacleMaxPerTypeCap = 12;
  private readonly obstacleWaveLinearGrowth = 1;
  private readonly rotatorHeight = 2.8;
  private readonly rotatorArmLength = 3.2;
  private readonly rotatorArmThickness = 0.92;
  private readonly rotatorSpinSpeedBase = 7.2;
  private readonly bouncerColumnHeight = 1.1;
  private readonly bouncerCapRadius = 0.72;
  private readonly bouncerImpulse = 8.8;
  private readonly bouncyPadLength = 5.6;
  private readonly bouncyPadWidth = 1.05;
  private readonly bouncyPadSweepAmplitude = 1.18;
  private readonly bouncyPadSweepSpeedBase = 3.4;
  private readonly bouncyPadLaunchImpulse = 10.5;
  private readonly platformUvScaleV = 0.035;
  private readonly endlessMode = true;
  private readonly trackSamples: TrackSample[] = [];
  private readonly trackSlices: TrackSlice[] = [];
  private fireworkTriggerZ = -186;
  private levelConfig: LevelConfig;
  private levelObjects: THREE.Object3D[] = [];
  private trackRigidBodies: RAPIER.RigidBody[] = [];
  private particles: FireworkParticle[] = [];
  private fireworkRows: FireworkRow[] = [];
  private trailLine: THREE.Line | null = null;
  private trailPoints: THREE.Vector3[] = [];
  private trailSpawnSeconds = 0;
  private readonly trailSpawnInterval = 0.015;
  private readonly trailMaxPoints = 48;
  private loopsCompleted = 0;
  private levelProgressStartZ = 0;
  private levelProgressEndZ = 0;
  private horizontalBlockers: HorizontalBlocker[] = [];
  private enemyKnockouts = 0;
  private enemyKnockedOff: boolean[] = [];
  private runObstacleOrder: ObstacleKind[] = [];
  private rotatorObstacles: RotatorXObstacle[] = [];
  private pinballBouncers: PinballBouncerObstacle[] = [];
  private bouncyPads: BouncyPadObstacle[] = [];
  private obstacleMeshById = new Map<string, THREE.Object3D>();
  private bouncyPadPaddleById = new Map<string, THREE.Object3D>();
  private bouncerCapById = new Map<string, THREE.Mesh>();
  private bouncerPulseById = new Map<string, number>();
  private obstacleBodyById = new Map<string, RAPIER.RigidBody>();
  private obstacleIdCounter = 0;
  private currentLoseY = this.loseY;

  private readonly startScreen: HTMLElement;
  private readonly gameOverScreen: HTMLElement;
  private readonly settingsModal: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly mobileControls: HTMLElement;
  private readonly settingsButton: HTMLElement;
  private readonly restartButton: HTMLElement;
  private readonly timeLabel: HTMLElement;
  private readonly speedLabel: HTMLElement;
  private readonly levelProgressMarble: HTMLElement;
  private readonly levelProgressMarkers: HTMLElement;
  private readonly resultLabel: HTMLElement;
  private readonly versionLabel: HTMLElement;
  private readonly fpsLabel: HTMLElement;
  private readonly steeringArrow: THREE.Mesh;
  private steeringAngle = 0;
  private debugFlyMode = false;
  private debugLookDragging = false;
  private debugMoveForward = false;
  private debugMoveBackward = false;
  private debugMoveLeft = false;
  private debugMoveRight = false;
  private debugMoveUp = false;
  private debugMoveDown = false;
  private debugMoveFast = false;
  private debugYaw = 0;
  private debugPitch = 0;
  private debugLastMouseX = 0;
  private debugLastMouseY = 0;
  private readonly debugFlyPosition = new THREE.Vector3();

  private soundManager: SoundManager;

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
    this.hud = this.requireElement("hud");
    this.mobileControls = this.requireElement("mobile-controls");
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

    this.settings = this.loadSettings();
    this.persistentState = this.loadPersistentState();

    const marbleGeometry = new THREE.SphereGeometry(this.marbleRadius, 32, 24);
    this.marbleMaterial = new THREE.MeshStandardMaterial({
      color: "#e8f1ff",
      roughness: 0.28,
      metalness: 0.16,
    });
    this.trackMaterial = new THREE.MeshStandardMaterial({
      color: "#dfc092",
      roughness: 0.82,
      metalness: 0.02,
    });
    this.enemyMaterial = new THREE.MeshStandardMaterial({
      color: "#d83f4d",
      roughness: 0.35,
      metalness: 0.12,
    });
    this.marbleMesh = new THREE.Mesh(marbleGeometry, this.marbleMaterial);
    this.marbleMesh.castShadow = true;
    this.marbleMesh.receiveShadow = true;
    this.scene.add(this.marbleMesh);

    const arrowMaterial = new THREE.MeshBasicMaterial({ color: "#59d86f" });
    const shaftLength = Math.max(
      0.2,
      (this.steeringArrowLength - this.steeringArrowHeadLength) * 0.5,
    );
    this.steeringArrow = new THREE.Mesh(
      this.createSteeringArrowGeometry(
        shaftLength,
        this.steeringArrowHeadLength,
        this.steeringArrowShaftWidth,
        this.steeringArrowHeadWidth,
      ),
      arrowMaterial,
    );
    this.steeringArrow.castShadow = false;
    this.steeringArrow.receiveShadow = false;
    this.steeringArrow.visible = false;
    this.scene.add(this.steeringArrow);
    this.ensureTrailLine();

    this.loadMarbleTexture();
    this.loadTileTexture();

    this.levelConfig = this.createRandomLevelConfig();
    this.fireworkTriggerZ = this.levelConfig.fireworkZ;
    this.initializeRunObstacleOrder();
    this.rebuildLevelProgressMarkers();
    this.buildTrackSlices();
    this.buildHorizontalBlockers();
    this.buildWaveObstacles();
    this.setupSceneVisuals();
    this.bindUi();
    this.bindInput();
    this.applySettingsUi();
    this.applyUiForState();
    this.handleResize();

    window.addEventListener("resize", () => this.handleResize());
    console.log(
      "[Constructor]",
      "Marble Madness starter created (build " + BUILD_VERSION + ")",
    );
  }

  public async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.world.integrationParameters.dt = this.fixedStep;

    this.createTrackPhysics();
    this.createMarblePhysics();
    this.createEnemyMarblesPhysics();
    this.resetMarble();

    this.lastFrameSeconds = performance.now() / 1000;
    this.animationFrameId = window.requestAnimationFrame((timeMs) =>
      this.frame(timeMs),
    );
    console.log("[Init]", "Rapier world initialized");
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
        this.trackMaterial.roughness = 0.74;
        this.trackMaterial.metalness = 0.03;
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

  private ensureTrailLine(): void {
    if (this.trailLine) {
      return;
    }
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: "#9fd8ff",
      transparent: true,
      opacity: 0.68,
    });
    this.trailLine = new THREE.Line(geometry, material);
    this.trailLine.frustumCulled = false;
    this.scene.add(this.trailLine);
  }

  private resetTrailLine(): void {
    this.trailPoints = [];
    if (!this.trailLine) {
      return;
    }
    this.trailLine.visible = false;
    this.trailLine.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([], 3),
    );
  }

  private appendTrailPoint(position: THREE.Vector3): void {
    this.ensureTrailLine();
    this.trailPoints.push(position.clone().add(new THREE.Vector3(0, 0.18, 0)));
    if (this.trailPoints.length > this.trailMaxPoints) {
      this.trailPoints.shift();
    }
    if (!this.trailLine) {
      return;
    }
    const points = this.trailPoints;
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i += 1) {
      const offset = i * 3;
      positions[offset] = points[i].x;
      positions[offset + 1] = points[i].y;
      positions[offset + 2] = points[i].z;
    }
    this.trailLine.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    this.trailLine.visible = points.length >= 2;
  }

  private updateTrail(delta: number): void {
    if (!this.trailLine) {
      this.ensureTrailLine();
    }

    if (this.gameState === "playing") {
      this.trailSpawnSeconds += delta;
      if (this.trailSpawnSeconds >= this.trailSpawnInterval) {
        this.trailSpawnSeconds = 0;
        this.appendTrailPoint(this.marbleMesh.position.clone());
      }
      return;
    }
  }

  private smooth01(t: number): number {
    return t * t * (3 - 2 * t);
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private isDownwardSlopeType(type: PlatformType): boolean {
    return type === "slope_down_soft" || type === "slope_down_steep";
  }

  private pickMiddlePlatformType(previousType: PlatformType): PlatformType {
    const canGap = this.isDownwardSlopeType(previousType);
    const forbidDownward = this.isDownwardSlopeType(previousType);
    const roll = Math.random();
    if (canGap && roll < 0.12) {
      return "gap_short";
    }
    if (!forbidDownward && roll < 0.24) {
      return "slope_down_soft";
    }
    if (!forbidDownward && roll < 0.38) {
      return "slope_down_steep";
    }
    if (roll < 0.53) {
      return "bottleneck";
    }
    return Math.random() < 0.5 ? "detour_left_short" : "detour_right_short";
  }

  private createPlatformSection(
    type: PlatformType,
    zStart: number,
    zEnd: number,
  ): PlatformSection {
    if (type === "flat" || type === "finish_straight") {
      return {
        type,
        zStart,
        zEnd,
        slope: 0,
        width: this.trackWidth,
        hasFloor: true,
        detourDirection: 1,
        detourMagnitude: 0,
        lateralOffsetStart: 0,
        lateralOffsetEnd: 0,
      };
    }
    if (type === "slope_down_soft") {
      return {
        type,
        zStart,
        zEnd,
        slope: this.downhillSlopeAngle,
        width: this.trackWidth,
        hasFloor: true,
        detourDirection: 1,
        detourMagnitude: 0,
        lateralOffsetStart: 0,
        lateralOffsetEnd: 0,
      };
    }
    if (type === "slope_up_steep") {
      return {
        type,
        zStart,
        zEnd,
        slope: this.uphillSlopeAngle,
        width: this.trackWidth,
        hasFloor: true,
        detourDirection: 1,
        detourMagnitude: 0,
        lateralOffsetStart: 0,
        lateralOffsetEnd: 0,
      };
    }
    if (type === "slope_down_steep") {
      return {
        type,
        zStart,
        zEnd,
        slope: this.downhillSlopeAngle,
        width: this.trackWidth,
        hasFloor: true,
        detourDirection: 1,
        detourMagnitude: 0,
        lateralOffsetStart: 0,
        lateralOffsetEnd: 0,
      };
    }
    if (type === "bottleneck") {
      return {
        type,
        zStart,
        zEnd,
        slope: 0,
        width: this.randomRange(5.8, 8.4),
        hasFloor: true,
        detourDirection: 1,
        detourMagnitude: 0,
        lateralOffsetStart: 0,
        lateralOffsetEnd: 0,
      };
    }
    if (type === "gap_short") {
      return {
        type,
        zStart,
        zEnd,
        slope: 0,
        width: this.trackWidth,
        hasFloor: false,
        detourDirection: 1,
        detourMagnitude: 0,
        lateralOffsetStart: 0,
        lateralOffsetEnd: 0,
      };
    }
    return {
      type,
      zStart,
      zEnd,
      slope: 0,
      width: this.trackWidth,
      hasFloor: true,
      detourDirection: type === "detour_left_short" ? -1 : 1,
      detourMagnitude: this.randomRange(2.6, 6.8),
      lateralOffsetStart: 0,
      lateralOffsetEnd: 0,
    };
  }

  private applySectionLateralOffsets(sections: PlatformSection[]): void {
    let currentOffset = 0;
    const maxOffset = this.trackWidth * 0.62;
    for (const section of sections) {
      section.lateralOffsetStart = currentOffset;
      if (
        section.type === "detour_left_short" ||
        section.type === "detour_right_short"
      ) {
        const delta = section.detourDirection * section.detourMagnitude * 0.52;
        currentOffset = THREE.MathUtils.clamp(
          currentOffset + delta,
          -maxOffset,
          maxOffset,
        );
      }
      section.lateralOffsetEnd = currentOffset;
    }
  }

  private createRandomLevelConfig(): LevelConfig {
    const platformCount = Math.min(24, 4 + this.loopsCompleted);
    const sections: PlatformSection[] = [];

    const startLength = this.randomRange(24, 32);
    const launchRampLength = this.randomRange(32, 46);
    const enemyFlatLength = this.randomRange(26, 38);
    const finishLength = this.randomRange(24, 34);
    const middleCount = Math.max(0, platformCount - 4);
    const usableLength = Math.max(
      40,
      this.startZ -
        this.finishZ -
        startLength -
        launchRampLength -
        enemyFlatLength -
        finishLength,
    );
    const weights: number[] = [];
    let weightSum = 0;
    for (let i = 0; i < middleCount; i += 1) {
      const weight = this.randomRange(1.15, 2.1);
      weights.push(weight);
      weightSum += weight;
    }

    let currentZ = this.startZ;
    const startSectionEnd = currentZ - startLength;
    sections.push(
      this.createPlatformSection("flat", currentZ, startSectionEnd),
    );
    currentZ = startSectionEnd;
    const launchRampEnd = currentZ - launchRampLength;
    sections.push(
      this.createPlatformSection("slope_down_steep", currentZ, launchRampEnd),
    );
    currentZ = launchRampEnd;
    const enemyFlatEnd = currentZ - enemyFlatLength;
    sections.push(this.createPlatformSection("flat", currentZ, enemyFlatEnd));
    const enemyPackCenterZ = (currentZ + enemyFlatEnd) * 0.5;
    currentZ = enemyFlatEnd;

    let previousType: PlatformType = "flat";
    const typeLog: string[] = ["flat", "slope_down_steep", "flat"];
    for (let i = 0; i < middleCount; i += 1) {
      let length = Math.max(
        15,
        (weights[i] / Math.max(0.001, weightSum)) * usableLength,
      );
      let type = this.pickMiddlePlatformType(previousType);
      if (this.isDownwardSlopeType(type) && this.isDownwardSlopeType(previousType)) {
        type = Math.random() < 0.5 ? "bottleneck" : "flat";
      }
      if (
        type === "gap_short" &&
        !this.isDownwardSlopeType(previousType)
      ) {
        type = "slope_down_soft";
      }
      if (type === "gap_short") {
        // Keep short gaps jumpable at higher speed while preserving longer section pacing.
        length = this.randomRange(10, 15);

        const launchIndex = sections.length - 1;
        if (
          launchIndex >= 0 &&
          sections[launchIndex].type !== "slope_up_steep"
        ) {
          const launchSection = sections[launchIndex];
          sections[launchIndex] = this.createPlatformSection(
            "slope_up_steep",
            launchSection.zStart,
            launchSection.zEnd,
          );
          typeLog[launchIndex] = "slope_up_steep";
        }
      }
      const zEnd = Math.max(this.finishZ + finishLength, currentZ - length);
      sections.push(this.createPlatformSection(type, currentZ, zEnd));
      typeLog.push(type);
      previousType = type;
      currentZ = zEnd;
    }

    if (sections.length > 1) {
      const lastMiddleIndex = sections.length - 1;
      const lastMiddle = sections[lastMiddleIndex];
      sections[lastMiddleIndex] = this.createPlatformSection(
        "flat",
        lastMiddle.zStart,
        lastMiddle.zEnd,
      );
      typeLog[lastMiddleIndex] = "flat";
    }

    sections.push(
      this.createPlatformSection("finish_straight", currentZ, this.finishZ),
    );
    typeLog.push("finish_straight");
    this.applySectionLateralOffsets(sections);

    const fireworkZ = this.finishZ + 12;
    console.log(
      "[CreateRandomLevelConfig]",
      "platformCount=" +
        String(platformCount) +
        " types=" +
        typeLog.join(" > "),
    );
    return {
      platformCount,
      sections,
      enemyPackCenterZ,
      fireworkZ,
    };
  }

  private getSectionAtZ(z: number): PlatformSection {
    const clampedZ = THREE.MathUtils.clamp(z, this.finishZ, this.startZ);
    for (const section of this.levelConfig.sections) {
      if (clampedZ <= section.zStart && clampedZ >= section.zEnd) {
        return section;
      }
    }
    return this.levelConfig.sections[this.levelConfig.sections.length - 1];
  }

  private sampleTrackX(z: number): number {
    const section = this.getSectionAtZ(z);
    const sectionLength = Math.max(0.001, section.zStart - section.zEnd);
    const t = THREE.MathUtils.clamp((section.zStart - z) / sectionLength, 0, 1);
    const smoothT = this.smooth01(t);
    return THREE.MathUtils.lerp(
      section.lateralOffsetStart,
      section.lateralOffsetEnd,
      smoothT,
    );
  }

  private sampleTrackSlope(z: number): number {
    const sections = this.levelConfig.sections;
    const clampedZ = THREE.MathUtils.clamp(z, this.finishZ, this.startZ);
    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      if (!(clampedZ <= section.zStart && clampedZ >= section.zEnd)) {
        continue;
      }

      let slope = section.slope;
      const prevSection = i > 0 ? sections[i - 1] : null;
      const nextSection = i < sections.length - 1 ? sections[i + 1] : null;

      if (prevSection) {
        const toStart = section.zStart - clampedZ;
        if (toStart < this.slopeBlendDistance) {
          const t = THREE.MathUtils.clamp(
            toStart / Math.max(0.001, this.slopeBlendDistance),
            0,
            1,
          );
          slope = THREE.MathUtils.lerp(
            prevSection.slope,
            section.slope,
            this.smooth01(t),
          );
        }
      }

      if (nextSection) {
        const toEnd = clampedZ - section.zEnd;
        if (toEnd < this.slopeBlendDistance) {
          const t = THREE.MathUtils.clamp(
            toEnd / Math.max(0.001, this.slopeBlendDistance),
            0,
            1,
          );
          slope = THREE.MathUtils.lerp(
            nextSection.slope,
            slope,
            this.smooth01(t),
          );
        }
      }

      return slope;
    }
    return 0;
  }

  private sampleTrackWidth(z: number): number {
    const section = this.getSectionAtZ(z);
    return section.width;
  }

  private hasFloorAtZ(z: number): boolean {
    const section = this.getSectionAtZ(z);
    return section.hasFloor;
  }

  private buildTrackSlices(): void {
    this.trackSamples.length = 0;
    this.trackSlices.length = 0;

    let currentZ = this.startZ;
    let currentY = this.trackCenterY + this.trackThickness * 0.5;
    while (currentZ >= this.finishZ) {
      const tilt = this.sampleTrackSlope(currentZ);
      const x = this.sampleTrackX(currentZ);
      const width = this.sampleTrackWidth(currentZ);
      const hasFloor = this.hasFloorAtZ(currentZ);
      this.trackSamples.push({
        z: currentZ,
        x,
        y: currentY,
        tilt,
        width,
        hasFloor,
      });

      const nextZ = currentZ - this.trackStep;
      const dz = currentZ - nextZ;
      const nextTilt = this.sampleTrackSlope(nextZ);
      const midTilt = THREE.MathUtils.lerp(tilt, nextTilt, 0.5);
      currentY -= Math.tan(midTilt) * dz;
      currentZ = nextZ;
    }

    // Smooth vertical profile so flat-to-slope transitions feel continuous instead of stepped.
    for (let pass = 0; pass < 2; pass += 1) {
      const smoothedY: number[] = this.trackSamples.map((sample) => sample.y);
      for (let i = 1; i < this.trackSamples.length - 1; i += 1) {
        const prev = this.trackSamples[i - 1].y;
        const center = this.trackSamples[i].y;
        const next = this.trackSamples[i + 1].y;
        smoothedY[i] = (prev + center * 2 + next) * 0.25;
      }
      for (let i = 1; i < this.trackSamples.length - 1; i += 1) {
        this.trackSamples[i].y = smoothedY[i];
      }
    }

    for (let i = 0; i < this.trackSamples.length - 1; i += 1) {
      const a = this.trackSamples[i];
      const b = this.trackSamples[i + 1];
      const length = Math.max(1, Math.abs(a.z - b.z));
      const tilt = Math.atan2(a.y - b.y, length);
      this.trackSlices.push({
        zStart: a.z,
        zEnd: b.z,
        xStart: a.x,
        xEnd: b.x,
        yStart: a.y,
        yEnd: b.y,
        centerZ: (a.z + b.z) * 0.5,
        centerX: (a.x + b.x) * 0.5,
        centerY: (a.y + b.y) * 0.5 - this.trackThickness * 0.5,
        length,
        tilt,
        width: (a.width + b.width) * 0.5,
        hasFloor: a.hasFloor && b.hasFloor,
      });
    }

    const floorSamples = this.trackSamples.filter((sample) => sample.hasFloor);
    const minFloorY = floorSamples.reduce(
      (minY, sample) => Math.min(minY, sample.y),
      Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(minFloorY)) {
      this.currentLoseY = Math.min(
        this.loseY,
        minFloorY - this.loseBoundaryDrop,
      );
    } else {
      this.currentLoseY = this.loseY;
    }

    console.log("[BuildTrackSlices]", "Generated tile course slices");
  }

  private getSliceAtZ(z: number): TrackSlice {
    const clampedZ = THREE.MathUtils.clamp(z, this.finishZ, this.startZ);
    const slice = this.trackSlices.find(
      (entry) => clampedZ <= entry.zStart && clampedZ >= entry.zEnd,
    );
    if (slice) {
      return slice;
    }
    return this.trackSlices[this.trackSlices.length - 1];
  }

  private getTrackTiltAtZ(z: number): number {
    return this.getSliceAtZ(z).tilt;
  }

  private setupSceneVisuals(): void {
    const hemi = new THREE.HemisphereLight("#d8ebff", "#6a89ad", 1.05);
    this.addLevelObject(hemi);

    const sunLight = new THREE.DirectionalLight("#fff9df", 3.15);
    sunLight.position.set(140, 180, 90);
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
    this.addLevelObject(sunLight);

    this.addPlatformRunMeshes();
    this.addHorizontalBlockerMeshes();
    this.addWaveObstacleMeshes();

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
      0,
      this.getTrackSurfaceY(this.finishZ) + 8.6,
      this.finishZ,
    );
    this.addLevelObject(finishTopBeam);

    this.addCloudBackdrop();
    this.addFinishTriggerCubes();
  }

  private buildHorizontalBlockers(): void {
    this.horizontalBlockers = [];
    const blockerLength = this.trackWidth / 3;
    const candidateSections = this.levelConfig.sections.filter(
      (section) =>
        section.hasFloor &&
        section.type !== "finish_straight" &&
        section.type !== "gap_short" &&
        section.type !== "slope_down_soft" &&
        section.type !== "slope_down_steep" &&
        section.type !== "slope_up_steep" &&
        section.zStart - section.zEnd > 8,
    );

    let lastBlockerZ = Number.POSITIVE_INFINITY;
    for (const section of candidateSections) {
      if (this.horizontalBlockers.length >= this.blockerMaxPerLevel) {
        break;
      }
      if (Math.random() < 0.46) {
        continue;
      }

      const zMin = section.zEnd + 3;
      const zMax = section.zStart - 3;
      if (zMax <= zMin) {
        continue;
      }
      const z = this.randomRange(zMin, zMax);
      if (Math.abs(lastBlockerZ - z) < this.blockerMinSpacing) {
        continue;
      }
      if (z > this.startZ - this.obstacleStartSafeDistance) {
        continue;
      }
      if (z < this.finishZ + this.obstacleFinishSafeDistance) {
        continue;
      }
      if (Math.abs(z - this.fireworkTriggerZ) < 10) {
        continue;
      }

      const widthAtZ = this.sampleTrackWidth(z);
      const usableInnerWidth = widthAtZ - this.blockerSideMargin * 2;
      if (usableInnerWidth <= this.blockerGapWidth + blockerLength + 0.4) {
        continue;
      }

      const innerLeft = -widthAtZ * 0.5 + this.blockerSideMargin;
      const innerRight = widthAtZ * 0.5 - this.blockerSideMargin;

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

      const x = this.sampleTrackX(z) + (segmentLeft + segmentRight) * 0.5;
      const y =
        this.getTrackSurfaceY(z) +
        this.trackThickness * 0.5 +
        this.blockerHeight * 0.5;
      const tilt = this.getTrackTiltAtZ(z);
      this.horizontalBlockers.push({
        x,
        y,
        z,
        length: blockerLength,
        height: this.blockerHeight,
        depth: this.blockerDepth,
        tilt,
      });
      lastBlockerZ = z;
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
    const blockerMaterial = new THREE.MeshStandardMaterial({
      color: "#4a5f7f",
      roughness: 0.62,
      metalness: 0.16,
      emissive: "#1a2438",
      emissiveIntensity: 0.2,
    });
    for (const blocker of this.horizontalBlockers) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(blocker.length, blocker.height, blocker.depth),
        blockerMaterial,
      );
      mesh.position.set(blocker.x, blocker.y, blocker.z);
      mesh.rotation.x = -blocker.tilt;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.addLevelObject(mesh);
    }
    console.log("[AddHorizontalBlockerMeshes]", "Added blocker meshes");
  }

  private initializeRunObstacleOrder(): void {
    this.runObstacleOrder = ["rotator_x", "pinball_bouncer", "bouncy_pad"];
    for (let i = this.runObstacleOrder.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = this.runObstacleOrder[i];
      this.runObstacleOrder[i] = this.runObstacleOrder[j];
      this.runObstacleOrder[j] = tmp;
    }
    console.log(
      "[InitializeRunObstacleOrder]",
      "Run obstacle order=" + this.runObstacleOrder.join(","),
    );
  }

  private nextObstacleId(kind: ObstacleKind): string {
    this.obstacleIdCounter += 1;
    return kind + "_" + String(this.obstacleIdCounter);
  }

  private buildWaveObstacles(): void {
    this.rotatorObstacles = [];
    this.pinballBouncers = [];
    this.bouncyPads = [];

    const wave = this.loopsCompleted + 1;
    const activeTypeCount = THREE.MathUtils.clamp(wave, 1, 3);
    const activeKinds = this.runObstacleOrder.slice(0, activeTypeCount);
    const candidateSections = this.levelConfig.sections.filter(
      (section) =>
        section.hasFloor &&
        section.type !== "finish_straight" &&
        section.type !== "gap_short" &&
        section.type !== "slope_down_soft" &&
        section.type !== "slope_down_steep" &&
        section.type !== "slope_up_steep" &&
        section.zStart - section.zEnd > 10,
    );

    if (candidateSections.length === 0 || activeKinds.length === 0) {
      console.log(
        "[BuildWaveObstacles]",
        "No valid sections for obstacle wave",
      );
      return;
    }

    const placed: ObstacleBase[] = [];
    for (let kindIndex = 0; kindIndex < activeKinds.length; kindIndex += 1) {
      const kind = activeKinds[kindIndex];
      const targetCount = Math.min(
        this.obstacleMaxPerTypeCap,
        2 + this.loopsCompleted * this.obstacleWaveLinearGrowth + kindIndex,
      );

      let placedCount = 0;
      let attempts = 0;
      while (placedCount < targetCount && attempts < targetCount * 40) {
        attempts += 1;
        const section =
          candidateSections[
            Math.floor(Math.random() * candidateSections.length)
          ];
        const zMin = Math.max(
          section.zEnd + 3,
          this.finishZ + this.obstacleFinishSafeDistance,
        );
        const zMax = Math.min(
          section.zStart - 3,
          this.startZ - this.obstacleStartSafeDistance,
        );
        if (zMax <= zMin) {
          continue;
        }
        const anchorZ = this.randomRange(zMin, zMax);
        const clusterSize = Math.min(
          targetCount - placedCount,
          3 + Math.floor(Math.random() * 3),
        );
        let clusterPlaced = 0;

        for (let i = 0; i < clusterSize; i += 1) {
          const z = anchorZ - i * this.obstacleClusterSpacing;
          const obstacle = this.tryCreateWaveObstacle(kind, z, placed);
          if (!obstacle) {
            continue;
          }
          placed.push(obstacle);
          clusterPlaced += 1;
          if (kind === "rotator_x") {
            this.rotatorObstacles.push(obstacle as RotatorXObstacle);
          } else if (kind === "pinball_bouncer") {
            this.pinballBouncers.push(obstacle as PinballBouncerObstacle);
          } else {
            this.bouncyPads.push(obstacle as BouncyPadObstacle);
          }
        }
        placedCount += clusterPlaced;
      }
    }

    console.log(
      "[BuildWaveObstacles]",
      "wave=" +
        String(wave) +
        " rotators=" +
        String(this.rotatorObstacles.length) +
        " bouncers=" +
        String(this.pinballBouncers.length) +
        " pads=" +
        String(this.bouncyPads.length),
    );
  }

  private tryCreateWaveObstacle(
    kind: ObstacleKind,
    z: number,
    existing: ObstacleBase[],
  ): ObstacleBase | null {
    if (Math.abs(z - this.fireworkTriggerZ) < 12) {
      return null;
    }
    if (z > this.startZ - this.obstacleStartSafeDistance) {
      return null;
    }
    if (z < this.finishZ + this.obstacleFinishSafeDistance) {
      return null;
    }
    if (!this.hasFloorAtZ(z)) {
      return null;
    }
    if (Math.abs(this.getTrackTiltAtZ(z)) > 0.08) {
      return null;
    }

    const centerX = this.sampleTrackX(z);
    const width = this.sampleTrackWidth(z);
    const innerHalf = width * 0.5 - this.wallThickness - 0.8;
    if (innerHalf < 2.2) {
      return null;
    }

    let obstacle:
      | RotatorXObstacle
      | PinballBouncerObstacle
      | BouncyPadObstacle
      | null = null;
    if (kind === "rotator_x") {
      const side = Math.random() < 0.5 ? "left" : "right";
      const sideSign = side === "left" ? -1 : 1;
      const x =
        centerX +
        sideSign *
          Math.max(2.1, innerHalf - (this.rotatorArmLength * 0.55 + 0.65));
      obstacle = {
        id: this.nextObstacleId(kind),
        kind,
        x,
        y: this.getTrackSurfaceY(z) + this.rotatorHeight * 0.5 + 0.12,
        z,
        tilt: this.getTrackTiltAtZ(z),
        radius: this.rotatorArmLength + 1.1,
        side,
        armLength: this.rotatorArmLength,
        armThickness: this.rotatorArmThickness,
        height: this.rotatorHeight,
        spinSpeed: this.rotatorSpinSpeedBase + this.randomRange(-0.45, 0.55),
        spinDir: Math.random() < 0.5 ? 1 : -1,
        angle: this.randomRange(0, Math.PI * 2),
        lastHitAt: -999,
      };
    } else if (kind === "pinball_bouncer") {
      const sideSign = Math.random() < 0.5 ? -1 : 1;
      const x =
        centerX +
        sideSign * this.randomRange(innerHalf * 0.28, innerHalf * 0.62);
      obstacle = {
        id: this.nextObstacleId(kind),
        kind,
        x,
        y:
          this.getTrackSurfaceY(z) +
          this.bouncerColumnHeight +
          this.bouncerCapRadius * 0.45,
        z,
        tilt: this.getTrackTiltAtZ(z),
        radius: this.bouncerCapRadius + 0.72,
        columnHeight: this.bouncerColumnHeight,
        capRadius: this.bouncerCapRadius,
        bounceImpulse: this.bouncerImpulse,
        lastHitAt: -999,
      };
    } else {
      const sideSign = Math.random() < 0.5 ? -1 : 1;
      const side: "left" | "right" = sideSign < 0 ? "left" : "right";
      const x = centerX + sideSign * Math.max(2.1, innerHalf - 0.06);
      obstacle = {
        id: this.nextObstacleId(kind),
        kind,
        side,
        x,
        y: this.getTrackSurfaceY(z) + this.marbleRadius * 0.75,
        z,
        tilt: this.getTrackTiltAtZ(z),
        radius: this.bouncyPadLength * 0.66,
        paddleLength: this.bouncyPadLength,
        paddleWidth: this.bouncyPadWidth,
        sweepAmplitude: this.bouncyPadSweepAmplitude,
        sweepSpeed:
          this.bouncyPadSweepSpeedBase + this.randomRange(-0.75, 0.75),
        phase: this.randomRange(0, Math.PI * 2),
        sweepAngle: 0,
        launchImpulse: this.bouncyPadLaunchImpulse,
        lastHitAt: -999,
      };
    }

    if (!obstacle) {
      return null;
    }

    if (Math.abs(obstacle.x - centerX) < 1.7) {
      return null;
    }

    for (const blocker of this.horizontalBlockers) {
      const xClearance = blocker.length * 0.5 + obstacle.radius + 0.75;
      const zClearance = blocker.depth * 0.5 + obstacle.radius + 0.75;
      if (
        Math.abs(obstacle.x - blocker.x) < xClearance &&
        Math.abs(obstacle.z - blocker.z) < zClearance
      ) {
        return null;
      }
    }

    for (const other of existing) {
      const dx = obstacle.x - other.x;
      const dz = obstacle.z - other.z;
      const minDistance =
        obstacle.radius + other.radius + this.obstacleMinDistance;
      if (dx * dx + dz * dz < minDistance * minDistance) {
        return null;
      }
    }

    return obstacle;
  }

  private addWaveObstacleMeshes(): void {
    const rotatorMaterial = new THREE.MeshStandardMaterial({
      color: "#5a7d94",
      roughness: 0.4,
      metalness: 0.5,
      emissive: "#1f3344",
      emissiveIntensity: 0.22,
    });
    const bouncerMaterial = new THREE.MeshStandardMaterial({
      color: "#8f5edb",
      roughness: 0.35,
      metalness: 0.18,
      emissive: "#301860",
      emissiveIntensity: 0.18,
    });
    const padMaterial = new THREE.MeshStandardMaterial({
      color: "#21b483",
      roughness: 0.44,
      metalness: 0.12,
      emissive: "#0e4032",
      emissiveIntensity: 0.2,
    });

    for (const rotator of this.rotatorObstacles) {
      const group = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.28, 0.28, 10),
        rotatorMaterial,
      );
      base.position.y = -rotator.height * 0.43;
      group.add(base);

      const paddleHeight = rotator.height * 0.96;
      const paddleLength = rotator.armLength * 2;
      for (let i = 0; i < 4; i += 1) {
        const angle = Math.PI * 0.25 + (i / 4) * Math.PI * 2;
        const paddle = new THREE.Mesh(
          new THREE.BoxGeometry(
            paddleLength,
            paddleHeight,
            rotator.armThickness,
          ),
          rotatorMaterial,
        );
        paddle.position.set(0, 0, 0);
        paddle.rotation.y = angle;
        group.add(paddle);
      }
      group.rotation.y = rotator.angle;
      group.rotation.x = -rotator.tilt;
      group.position.set(rotator.x, rotator.y, rotator.z);
      group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      this.addLevelObject(group);
      this.obstacleMeshById.set(rotator.id, group);
    }

    for (const bouncer of this.pinballBouncers) {
      const group = new THREE.Group();
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.3, bouncer.columnHeight, 12),
        bouncerMaterial,
      );
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(
          bouncer.capRadius,
          18,
          12,
          0,
          Math.PI * 2,
          0,
          Math.PI * 0.5,
        ),
        bouncerMaterial,
      );
      column.position.y = -bouncer.capRadius * 0.28;
      cap.position.y = bouncer.columnHeight * 0.46;
      group.add(column);
      group.add(cap);
      this.bouncerCapById.set(bouncer.id, cap);
      this.bouncerPulseById.set(bouncer.id, 0);
      group.rotation.x = -bouncer.tilt;
      group.position.set(bouncer.x, bouncer.y, bouncer.z);
      group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      this.addLevelObject(group);
      this.obstacleMeshById.set(bouncer.id, group);
    }

    for (const pad of this.bouncyPads) {
      const group = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), padMaterial);
      const pivot = new THREE.Group();
      const paddle = new THREE.Mesh(
        new THREE.BoxGeometry(pad.paddleLength, 0.24, pad.paddleWidth),
        padMaterial,
      );
      base.position.y = -0.08;
      pivot.position.y = 0.1;
      const sideSign = pad.side === "left" ? 1 : -1;
      paddle.position.set(sideSign * pad.paddleLength * 0.5, 0, 0);
      const startYaw =
        pad.side === "left"
          ? THREE.MathUtils.degToRad(8)
          : Math.PI - THREE.MathUtils.degToRad(8);
      pivot.rotation.y = startYaw;
      group.add(base);
      pivot.add(paddle);
      group.add(pivot);
      group.rotation.x = -pad.tilt;
      group.position.set(pad.x, pad.y, pad.z);
      group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      this.addLevelObject(group);
      this.obstacleMeshById.set(pad.id, group);
      this.bouncyPadPaddleById.set(pad.id, pivot);
    }

    console.log(
      "[AddWaveObstacleMeshes]",
      "Added obstacle meshes total=" +
        String(
          this.rotatorObstacles.length +
            this.pinballBouncers.length +
            this.bouncyPads.length,
        ),
    );
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

  private buildRunGeometry(run: TrackSample[]): {
    floor: THREE.BufferGeometry;
    leftWall: THREE.BufferGeometry;
    rightWall: THREE.BufferGeometry;
  } {
    const floorPos: number[] = [];
    const floorUv: number[] = [];
    const leftPos: number[] = [];
    const leftUv: number[] = [];
    const rightPos: number[] = [];
    const rightUv: number[] = [];

    let distanceV = 0;
    for (let i = 0; i < run.length - 1; i += 1) {
      const a = run[i];
      const b = run[i + 1];
      const segDistance = Math.sqrt(
        (a.x - b.x) * (a.x - b.x) +
          (a.y - b.y) * (a.y - b.y) +
          (a.z - b.z) * (a.z - b.z),
      );
      const nextDistanceV = distanceV + segDistance * this.platformUvScaleV;

      const leftAx = a.x - a.width * 0.5;
      const rightAx = a.x + a.width * 0.5;
      const leftBx = b.x - b.width * 0.5;
      const rightBx = b.x + b.width * 0.5;

      const floorLeftA = new THREE.Vector3(leftAx, a.y, a.z);
      const floorRightA = new THREE.Vector3(rightAx, a.y, a.z);
      const floorLeftB = new THREE.Vector3(leftBx, b.y, b.z);
      const floorRightB = new THREE.Vector3(rightBx, b.y, b.z);
      this.addQuad(
        floorPos,
        floorUv,
        floorLeftA,
        floorRightA,
        floorLeftB,
        floorRightB,
        new THREE.Vector2(0, distanceV),
        new THREE.Vector2(1, distanceV),
        new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(1, nextDistanceV),
      );

      const leftInnerA = new THREE.Vector3(leftAx, a.y, a.z);
      const leftOuterA = new THREE.Vector3(
        leftAx - this.wallThickness,
        a.y,
        a.z,
      );
      const leftInnerB = new THREE.Vector3(leftBx, b.y, b.z);
      const leftOuterB = new THREE.Vector3(
        leftBx - this.wallThickness,
        b.y,
        b.z,
      );
      const leftInnerATop = leftInnerA
        .clone()
        .add(new THREE.Vector3(0, this.wallHeight, 0));
      const leftOuterATop = leftOuterA
        .clone()
        .add(new THREE.Vector3(0, this.wallHeight, 0));
      const leftInnerBTop = leftInnerB
        .clone()
        .add(new THREE.Vector3(0, this.wallHeight, 0));
      const leftOuterBTop = leftOuterB
        .clone()
        .add(new THREE.Vector3(0, this.wallHeight, 0));

      this.addQuad(
        leftPos,
        leftUv,
        leftInnerA,
        leftInnerB,
        leftInnerATop,
        leftInnerBTop,
        new THREE.Vector2(0, distanceV),
        new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(1, distanceV),
        new THREE.Vector2(1, nextDistanceV),
      );
      this.addQuad(
        leftPos,
        leftUv,
        leftOuterB,
        leftOuterA,
        leftOuterBTop,
        leftOuterATop,
        new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(0, distanceV),
        new THREE.Vector2(1, nextDistanceV),
        new THREE.Vector2(1, distanceV),
      );
      this.addQuad(
        leftPos,
        leftUv,
        leftInnerATop,
        leftInnerBTop,
        leftOuterATop,
        leftOuterBTop,
        new THREE.Vector2(0, distanceV),
        new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(1, distanceV),
        new THREE.Vector2(1, nextDistanceV),
      );

      const rightInnerA = new THREE.Vector3(rightAx, a.y, a.z);
      const rightOuterA = new THREE.Vector3(
        rightAx + this.wallThickness,
        a.y,
        a.z,
      );
      const rightInnerB = new THREE.Vector3(rightBx, b.y, b.z);
      const rightOuterB = new THREE.Vector3(
        rightBx + this.wallThickness,
        b.y,
        b.z,
      );
      const rightInnerATop = rightInnerA
        .clone()
        .add(new THREE.Vector3(0, this.wallHeight, 0));
      const rightOuterATop = rightOuterA
        .clone()
        .add(new THREE.Vector3(0, this.wallHeight, 0));
      const rightInnerBTop = rightInnerB
        .clone()
        .add(new THREE.Vector3(0, this.wallHeight, 0));
      const rightOuterBTop = rightOuterB
        .clone()
        .add(new THREE.Vector3(0, this.wallHeight, 0));

      this.addQuad(
        rightPos,
        rightUv,
        rightInnerB,
        rightInnerA,
        rightInnerBTop,
        rightInnerATop,
        new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(0, distanceV),
        new THREE.Vector2(1, nextDistanceV),
        new THREE.Vector2(1, distanceV),
      );
      this.addQuad(
        rightPos,
        rightUv,
        rightOuterA,
        rightOuterB,
        rightOuterATop,
        rightOuterBTop,
        new THREE.Vector2(0, distanceV),
        new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(1, distanceV),
        new THREE.Vector2(1, nextDistanceV),
      );
      this.addQuad(
        rightPos,
        rightUv,
        rightOuterATop,
        rightOuterBTop,
        rightInnerATop,
        rightInnerBTop,
        new THREE.Vector2(0, distanceV),
        new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(1, distanceV),
        new THREE.Vector2(1, nextDistanceV),
      );

      distanceV = nextDistanceV;
    }

    const floor = new THREE.BufferGeometry();
    floor.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(floorPos, 3),
    );
    floor.setAttribute("uv", new THREE.Float32BufferAttribute(floorUv, 2));
    floor.computeVertexNormals();

    const leftWall = new THREE.BufferGeometry();
    leftWall.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(leftPos, 3),
    );
    leftWall.setAttribute("uv", new THREE.Float32BufferAttribute(leftUv, 2));
    leftWall.computeVertexNormals();

    const rightWall = new THREE.BufferGeometry();
    rightWall.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(rightPos, 3),
    );
    rightWall.setAttribute("uv", new THREE.Float32BufferAttribute(rightUv, 2));
    rightWall.computeVertexNormals();

    return { floor, leftWall, rightWall };
  }

  private addPlatformRunMeshes(): void {
    const runs = this.getFloorRuns();
    for (const run of runs) {
      const geo = this.buildRunGeometry(run);
      const floorMesh = new THREE.Mesh(geo.floor, this.trackMaterial);
      floorMesh.receiveShadow = true;
      this.addLevelObject(floorMesh);

      const leftWallMesh = new THREE.Mesh(geo.leftWall, this.trackMaterial);
      leftWallMesh.castShadow = true;
      leftWallMesh.receiveShadow = true;
      this.addLevelObject(leftWallMesh);

      const rightWallMesh = new THREE.Mesh(geo.rightWall, this.trackMaterial);
      rightWallMesh.castShadow = true;
      rightWallMesh.receiveShadow = true;
      this.addLevelObject(rightWallMesh);
    }
    console.log(
      "[AddPlatformRunMeshes]",
      "Built continuous platform and wall meshes",
    );
  }

  private createCloudTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return new THREE.CanvasTexture(canvas);
    }

    ctx.clearRect(0, 0, size, size);
    const blobs = [
      { x: 46, y: 66, r: 28 },
      { x: 73, y: 55, r: 26 },
      { x: 86, y: 72, r: 23 },
      { x: 30, y: 78, r: 20 },
    ];
    for (const blob of blobs) {
      const grad = ctx.createRadialGradient(
        blob.x,
        blob.y,
        4,
        blob.x,
        blob.y,
        blob.r,
      );
      grad.addColorStop(0, "rgba(255, 255, 255, 0.96)");
      grad.addColorStop(0.75, "rgba(246, 251, 255, 0.72)");
      grad.addColorStop(1, "rgba(237, 246, 255, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  private addCloudBackdrop(): void {
    const cloudGroup = new THREE.Group();
    const cloudTexture = this.createCloudTexture();
    const cloudMaterial = new THREE.SpriteMaterial({
      map: cloudTexture,
      color: "#ffffff",
      transparent: true,
      opacity: 0.93,
      depthWrite: false,
      depthTest: true,
      fog: true,
    });

    const cloudClusters = [
      { x: -240, y: -78, z: -30, count: 2, spreadX: 90, spreadY: 12, spreadZ: 70 },
      { x: 246, y: -74, z: -88, count: 2, spreadX: 94, spreadY: 12, spreadZ: 72 },
      { x: -236, y: -82, z: -170, count: 2, spreadX: 96, spreadY: 13, spreadZ: 78 },
      { x: 238, y: -76, z: -236, count: 2, spreadX: 92, spreadY: 12, spreadZ: 74 },
      { x: 0, y: -94, z: -140, count: 3, spreadX: 230, spreadY: 14, spreadZ: 210 },
    ];

    for (const cluster of cloudClusters) {
      for (let i = 0; i < cluster.count; i += 1) {
        const sprite = new THREE.Sprite(cloudMaterial);
        sprite.position.set(
          cluster.x + this.randomRange(-cluster.spreadX, cluster.spreadX),
          cluster.y + this.randomRange(-cluster.spreadY, cluster.spreadY),
          cluster.z + this.randomRange(-cluster.spreadZ, cluster.spreadZ),
        );
        const scale = this.randomRange(200, 360);
        sprite.scale.set(scale * 1.35, scale, 1);
        cloudGroup.add(sprite);
      }
    }

    this.addLevelObject(cloudGroup);
    console.log("[AddCloudBackdrop]", "Placed sprite cloud backdrop clusters");
  }

  private addFinishTriggerCubes(): void {
    const cubeMaterial = this.trackMaterial.clone();
    cubeMaterial.emissive = new THREE.Color("#29456a");
    cubeMaterial.emissiveIntensity = 0.22;
    cubeMaterial.roughness = 0.62;
    cubeMaterial.metalness = 0.04;
    const platformWidth = this.getSliceAtZ(this.fireworkTriggerZ).width;
    const cubeOffsetX = platformWidth * 0.5 + this.wallThickness + 1.4;
    const columnHeight = 4.0;
    const rowOffsets = [10, 0, -10];
    this.fireworkRows = [];

    for (const rowOffset of rowOffsets) {
      const z = this.fireworkTriggerZ + rowOffset;
      const centerX = this.sampleTrackX(z);
      const y = this.getTrackSurfaceY(z) + columnHeight * 0.5;
      const rowBurstPoints: THREE.Vector3[] = [];
      const leftColumn = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, columnHeight, 1.6),
        cubeMaterial,
      );
      leftColumn.position.set(centerX - cubeOffsetX, y, z);
      this.addLevelObject(leftColumn);
      rowBurstPoints.push(
        new THREE.Vector3(centerX - cubeOffsetX, y + columnHeight * 0.52, z),
      );

      const rightColumn = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, columnHeight, 1.6),
        cubeMaterial,
      );
      rightColumn.position.set(centerX + cubeOffsetX, y, z);
      this.addLevelObject(rightColumn);
      rowBurstPoints.push(
        new THREE.Vector3(centerX + cubeOffsetX, y + columnHeight * 0.52, z),
      );

      this.fireworkRows.push({
        activationZ: z,
        burstPoints: rowBurstPoints,
        triggered: false,
      });
    }

    console.log(
      "[AddFinishTriggerCubes]",
      "Added 3-row edge columns for confetti triggers",
    );
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
    if (!this.world) {
      return;
    }

    const physicsSlices = this.buildPhysicsSlices();
    for (const slice of physicsSlices) {
      const segmentRotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-slice.tilt, 0, 0),
      );
      const floorBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(slice.centerX, slice.centerY, slice.centerZ)
        .setRotation({
          x: segmentRotation.x,
          y: segmentRotation.y,
          z: segmentRotation.z,
          w: segmentRotation.w,
        });
      const floorBody = this.world.createRigidBody(floorBodyDesc);
      this.trackRigidBodies.push(floorBody);
      const floorCollider = RAPIER.ColliderDesc.cuboid(
        slice.width * 0.5,
        this.trackThickness * 0.5,
        slice.length * 0.5,
      )
        .setFriction(1.1)
        .setRestitution(0);
      this.world.createCollider(floorCollider, floorBody);

      const wallHalfX = this.wallThickness * 0.5;
      const wallHalfY = this.wallHeight * 0.5;
      const wallHalfZ = slice.length * 0.5;

      const leftWallBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(
          slice.centerX - slice.width * 0.5 - wallHalfX,
          slice.centerY + this.trackThickness * 0.5 + wallHalfY,
          slice.centerZ,
        )
        .setRotation({
          x: segmentRotation.x,
          y: segmentRotation.y,
          z: segmentRotation.z,
          w: segmentRotation.w,
        });
      const leftWallBody = this.world.createRigidBody(leftWallBodyDesc);
      this.trackRigidBodies.push(leftWallBody);
      const leftWallCollider = RAPIER.ColliderDesc.cuboid(
        wallHalfX,
        wallHalfY,
        wallHalfZ,
      )
        .setFriction(0.7)
        .setRestitution(0);
      this.world.createCollider(leftWallCollider, leftWallBody);

      const rightWallBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(
          slice.centerX + slice.width * 0.5 + wallHalfX,
          slice.centerY + this.trackThickness * 0.5 + wallHalfY,
          slice.centerZ,
        )
        .setRotation({
          x: segmentRotation.x,
          y: segmentRotation.y,
          z: segmentRotation.z,
          w: segmentRotation.w,
        });
      const rightWallBody = this.world.createRigidBody(rightWallBodyDesc);
      this.trackRigidBodies.push(rightWallBody);
      const rightWallCollider = RAPIER.ColliderDesc.cuboid(
        wallHalfX,
        wallHalfY,
        wallHalfZ,
      )
        .setFriction(0.7)
        .setRestitution(0);
      this.world.createCollider(rightWallCollider, rightWallBody);
    }

    for (const blocker of this.horizontalBlockers) {
      const blockerRotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-blocker.tilt, 0, 0),
      );
      const blockerBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(blocker.x, blocker.y, blocker.z)
        .setRotation({
          x: blockerRotation.x,
          y: blockerRotation.y,
          z: blockerRotation.z,
          w: blockerRotation.w,
        });
      const blockerBody = this.world.createRigidBody(blockerBodyDesc);
      this.trackRigidBodies.push(blockerBody);
      const blockerCollider = RAPIER.ColliderDesc.cuboid(
        blocker.length * 0.5,
        blocker.height * 0.5,
        blocker.depth * 0.5,
      )
        .setFriction(0.95)
        .setRestitution(0.02);
      this.world.createCollider(blockerCollider, blockerBody);
    }

    for (const rotator of this.rotatorObstacles) {
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-rotator.tilt, rotator.angle, 0),
      );
      const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(rotator.x, rotator.y, rotator.z)
        .setRotation({
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          w: rotation.w,
        });
      const body = this.world.createRigidBody(bodyDesc);
      this.trackRigidBodies.push(body);
      for (let i = 0; i < 4; i += 1) {
        const localAngle = Math.PI * 0.25 + (i / 4) * Math.PI * 2;
        const localRot = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          localAngle,
        );
        const collider = RAPIER.ColliderDesc.cuboid(
          rotator.armLength,
          rotator.height * 0.48,
          rotator.armThickness * 0.5,
        )
          .setTranslation(0, 0, 0)
          .setRotation({
            x: localRot.x,
            y: localRot.y,
            z: localRot.z,
            w: localRot.w,
          })
          .setFriction(0.72)
          .setRestitution(0.04);
        this.world.createCollider(collider, body);
      }
      this.obstacleBodyById.set(rotator.id, body);
    }

    for (const bouncer of this.pinballBouncers) {
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-bouncer.tilt, 0, 0),
      );
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(bouncer.x, bouncer.y, bouncer.z)
        .setRotation({
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          w: rotation.w,
        });
      const body = this.world.createRigidBody(bodyDesc);
      this.trackRigidBodies.push(body);
      const columnCollider = RAPIER.ColliderDesc.cuboid(
        0.24,
        bouncer.columnHeight * 0.5,
        0.24,
      )
        .setFriction(0.6)
        .setRestitution(0.14);
      const capCollider = RAPIER.ColliderDesc.ball(bouncer.capRadius)
        .setTranslation(0, bouncer.columnHeight * 0.52, 0)
        .setFriction(0.55)
        .setRestitution(0.24);
      this.world.createCollider(columnCollider, body);
      this.world.createCollider(capCollider, body);
      this.obstacleBodyById.set(bouncer.id, body);
    }

    for (const pad of this.bouncyPads) {
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-pad.tilt, 0, 0),
      );
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(pad.x, pad.y, pad.z)
        .setRotation({
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          w: rotation.w,
        });
      const body = this.world.createRigidBody(bodyDesc);
      this.trackRigidBodies.push(body);
      const baseCollider = RAPIER.ColliderDesc.cuboid(0.4, 0.16, 0.4)
        .setFriction(0.64)
        .setRestitution(0.08);
      this.world.createCollider(baseCollider, body);
      this.obstacleBodyById.set(pad.id, body);
    }
    console.log("[CreateTrackPhysics]", "Track colliders created");
  }

  private buildPhysicsSlices(): TrackSlice[] {
    const slices = this.trackSlices.filter((slice) => slice.hasFloor);
    const grouped: TrackSlice[] = [];
    const chunkSize = 4;
    let i = 0;
    while (i < slices.length) {
      const first = slices[i];
      let last = first;
      let sumWidth = 0;
      let sumCenterX = 0;
      let count = 0;
      for (let j = i; j < Math.min(i + chunkSize, slices.length); j += 1) {
        const current = slices[j];
        if (
          count > 0 &&
          Math.abs(last.zEnd - current.zStart) > this.trackStep * 1.5
        ) {
          break;
        }
        last = current;
        sumWidth += current.width;
        sumCenterX += current.centerX;
        count += 1;
      }
      const zStart = first.zStart;
      const zEnd = last.zEnd;
      const length = Math.max(0.001, Math.abs(zStart - zEnd));
      const yStart = first.yStart;
      const yEnd = last.yEnd;
      grouped.push({
        zStart,
        zEnd,
        xStart: first.xStart,
        xEnd: last.xEnd,
        yStart,
        yEnd,
        centerZ: (zStart + zEnd) * 0.5,
        centerX: sumCenterX / Math.max(1, count),
        centerY: (yStart + yEnd) * 0.5 - this.trackThickness * 0.5,
        length,
        tilt: Math.atan2(yStart - yEnd, length),
        width: sumWidth / Math.max(1, count),
        hasFloor: true,
      });
      i += count;
    }
    return grouped;
  }

  private createMarblePhysics(): void {
    if (!this.world) {
      return;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, this.getTrackSurfaceY(this.startZ) + 2.2, this.startZ)
      .setLinearDamping(0.04)
      .setAngularDamping(0.03)
      .setCanSleep(false)
      .setCcdEnabled(true);

    this.marbleBody = this.world.createRigidBody(bodyDesc);

    const collider = RAPIER.ColliderDesc.ball(this.marbleRadius)
      .setFriction(1.6)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
      .setRestitution(0)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setDensity(3.4);

    this.world.createCollider(collider, this.marbleBody);
    console.log("[CreateMarblePhysics]", "Marble rigid body created");
  }

  private createEnemyMarblesPhysics(): void {
    if (!this.world) {
      return;
    }

    const geometry = new THREE.SphereGeometry(this.enemyMarbleRadius, 20, 16);
    this.enemyMarbleMeshes = [];
    this.enemyMarbleBodies = [];
    for (let i = 0; i < this.enemyMarbleCount; i += 1) {
      const mesh = new THREE.Mesh(geometry, this.enemyMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.enemyMarbleMeshes.push(mesh);

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          0,
          this.getTrackSurfaceY(this.startZ) + this.enemyMarbleRadius + 2,
          this.startZ - 8,
        )
        .setLinearDamping(0.02)
        .setAngularDamping(0.02)
        .setCanSleep(false)
        .setCcdEnabled(true);
      const body = this.world.createRigidBody(bodyDesc);
      const collider = RAPIER.ColliderDesc.ball(this.enemyMarbleRadius)
        .setFriction(1.25)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setRestitution(0)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setDensity(0.08);
      this.world.createCollider(collider, body);
      this.enemyMarbleBodies.push(body);
    }
    this.enemyKnockedOff = new Array(this.enemyMarbleBodies.length).fill(false);
    console.log(
      "[CreateEnemyMarblesPhysics]",
      "Created " + String(this.enemyMarbleCount) + " enemy marbles",
    );
  }

  private resetEnemyMarbles(): void {
    if (!this.marbleBody) {
      return;
    }

    const startX = this.sampleTrackX(this.startZ);
    const groupCenterZ = this.levelConfig.enemyPackCenterZ;
    const columns = 10;
    const spacingX = 1.08;
    const spacingZ = 1.15;
    for (let i = 0; i < this.enemyMarbleBodies.length; i += 1) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = startX + (col - (columns - 1) * 0.5) * spacingX;
      const z = groupCenterZ - row * spacingZ;
      const y = this.getTrackSurfaceY(z) + this.enemyMarbleRadius + 0.75;
      const body = this.enemyMarbleBodies[i];
      body.setTranslation({ x, y, z }, true);
      body.setLinvel(
        {
          x: 0,
          y: 0,
          z: -this.startFlickSpeed * this.enemyForwardImpulseRatio,
        },
        true,
      );
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.wakeUp();
      this.enemyKnockedOff[i] = false;
      if (this.enemyMarbleMeshes[i]) {
        this.enemyMarbleMeshes[i].visible = true;
      }
    }
    console.log("[ResetEnemyMarbles]", "Enemy marbles reset in a forward pack");
  }

  private syncEnemyMarbleMeshes(): void {
    const count = Math.min(
      this.enemyMarbleMeshes.length,
      this.enemyMarbleBodies.length,
    );
    for (let i = 0; i < count; i += 1) {
      const body = this.enemyMarbleBodies[i];
      const position = body.translation();
      const rotation = body.rotation();
      const mesh = this.enemyMarbleMeshes[i];
      mesh.position.set(position.x, position.y, position.z);
      mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
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
      this.soundManager.playUIClick();
      this.triggerLightHaptic();
      this.startRun();
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

    this.bindSettingToggle("toggle-music", "music");
    this.bindSettingToggle("toggle-fx", "fx");
    this.bindSettingToggle("toggle-haptics", "haptics");
  }

  private bindInput(): void {
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (key === "p" && !event.repeat) {
        this.toggleDebugFlyMode();
        return;
      }
      if (this.debugFlyMode) {
        this.setDebugMovementKey(key, true);
        return;
      }
      if (event.key === "ArrowLeft" || key === "a") {
        this.inputLeft = true;
      }
      if (event.key === "ArrowRight" || key === "d") {
        this.inputRight = true;
      }
    });

    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (this.debugFlyMode) {
        this.setDebugMovementKey(key, false);
        return;
      }
      if (event.key === "ArrowLeft" || key === "a") {
        this.inputLeft = false;
      }
      if (event.key === "ArrowRight" || key === "d") {
        this.inputRight = false;
      }
    });

    this.canvas.addEventListener("contextmenu", (event) => {
      if (this.debugFlyMode) {
        event.preventDefault();
      }
    });

    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.debugFlyMode || event.button !== 2) {
        return;
      }
      this.debugLookDragging = true;
      this.debugLastMouseX = event.clientX;
      this.debugLastMouseY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.debugFlyMode || !this.debugLookDragging) {
        return;
      }
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
    });

    this.canvas.addEventListener("pointerup", (event) => {
      if (event.button === 2) {
        this.debugLookDragging = false;
      }
    });
    this.canvas.addEventListener("pointercancel", () => {
      this.debugLookDragging = false;
    });

    this.bindHoldControl("left-btn", true);
    this.bindHoldControl("right-btn", false);
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

    this.debugFlyMode = !this.debugFlyMode;
    this.debugLookDragging = false;
    this.inputLeft = false;
    this.inputRight = false;

    if (this.debugFlyMode) {
      this.debugFlyPosition.copy(this.camera.position);
      const euler = new THREE.Euler().setFromQuaternion(
        this.camera.quaternion,
        "YXZ",
      );
      this.debugYaw = euler.y;
      this.debugPitch = euler.x;
      this.clearDebugMovementKeys();
      console.log("[ToggleDebugFlyMode]", "Enabled debug fly camera");
      return;
    }

    this.clearDebugMovementKeys();
    this.cameraAnchorsInitialized = false;
    this.updateCamera(1);
    console.log("[ToggleDebugFlyMode]", "Disabled debug fly camera");
  }

  private bindHoldControl(id: string, isLeft: boolean): void {
    const button = document.getElementById(id);
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const onDown = (): void => {
      if (isLeft) {
        this.inputLeft = true;
      } else {
        this.inputRight = true;
      }
      this.triggerLightHaptic();
    };

    const onUp = (): void => {
      if (isLeft) {
        this.inputLeft = false;
      } else {
        this.inputRight = false;
      }
    };

    button.addEventListener("pointerdown", onDown);
    button.addEventListener("pointerup", onUp);
    button.addEventListener("pointercancel", onUp);
    button.addEventListener("pointerleave", onUp);
  }

  private bindSettingToggle(buttonId: string, key: keyof Settings): void {
    const button = document.getElementById(buttonId);
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.addEventListener("click", () => {
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
    });
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
    localStorage.setItem("gameSettings", JSON.stringify(this.settings));
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
    button.textContent = enabled ? "ON" : "OFF";
  }

  private loadPersistentState(): PersistedState {
    if (typeof window.loadGameState !== "function") {
      return {};
    }
    const state = window.loadGameState();
    if (!state || typeof state !== "object") {
      return {};
    }
    return state as PersistedState;
  }

  private savePersistentState(nextState: PersistedState): void {
    this.persistentState = nextState;
    if (typeof window.saveGameState === "function") {
      window.saveGameState({ ...nextState });
    }
  }

  private startRun(): void {
    this.gameState = "playing";
    this.runTimeSeconds = 0;
    this.finishedTimeSeconds = 0;
    this.loopsCompleted = 0;
    this.initializeRunObstacleOrder();
    this.levelConfig = this.createRandomLevelConfig();
    this.fireworkTriggerZ = this.levelConfig.fireworkZ;
    this.rebuildLevelProgressMarkers();
    this.clearLevelVisuals();
    this.clearTrackPhysics();
    this.buildTrackSlices();
    this.buildHorizontalBlockers();
    this.buildWaveObstacles();
    this.setupSceneVisuals();
    this.createTrackPhysics();
    this.enemyKnockouts = 0;
    this.cameraAnchorsInitialized = false;
    for (const row of this.fireworkRows) {
      row.triggered = false;
    }
    for (const item of this.particles) {
      this.scene.remove(item.mesh);
    }
    this.particles = [];
    this.resetTrailLine();
    this.trailSpawnSeconds = 0;
    this.setSettingsVisible(false);
    this.resetMarble();
    this.updateHud();
    this.applyUiForState();
    this.soundManager.playStartLaunch();
    console.log(
      "[StartRun]",
      "Run started in " + (this.endlessMode ? "endless" : "classic") + " mode",
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
        }
      });
    }
    this.levelObjects = [];
    this.fireworkRows = [];
    this.obstacleMeshById.clear();
    this.bouncyPadPaddleById.clear();
    this.bouncerCapById.clear();
    this.bouncerPulseById.clear();
  }

  private clearTrackPhysics(): void {
    if (!this.world) {
      return;
    }
    for (const body of this.trackRigidBodies) {
      this.world.removeRigidBody(body);
    }
    this.trackRigidBodies = [];
    this.obstacleBodyById.clear();
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
    this.resetTrailLine();
    this.trailSpawnSeconds = 0;

    this.clearLevelVisuals();
    this.clearTrackPhysics();
    this.buildTrackSlices();
    this.buildHorizontalBlockers();
    this.buildWaveObstacles();
    this.setupSceneVisuals();
    this.createTrackPhysics();
    this.cameraAnchorsInitialized = false;
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
    this.finishedTimeSeconds = this.runTimeSeconds;

    if (finished) {
      const score =
        this.calculateScore(this.finishedTimeSeconds) +
        this.enemyKnockouts * this.enemyKnockScore;
      this.resultLabel.textContent =
        "Finish time: " +
        this.finishedTimeSeconds.toFixed(2) +
        "s | Score: " +
        String(score);
      this.submitFinalScore(score);
      this.soundManager.playFinish();
      this.triggerHaptic("success");
    } else {
      this.loopsCompleted = 0;
      const score = this.enemyKnockouts * this.enemyKnockScore;
      this.resultLabel.textContent =
        "Run failed. Knocked off: " +
        String(this.enemyKnockouts) +
        " | Score: " +
        String(score);
      this.submitFinalScore(score);
      this.soundManager.playFallOff();
      this.triggerHaptic("error");
    }

    const runsCompleted = (this.persistentState.runsCompleted ?? 0) + 1;
    this.savePersistentState({ runsCompleted });

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
    if (typeof window.submitScore === "function") {
      window.submitScore(safeScore);
    }
    console.log("[SubmitFinalScore]", "Submitted score=" + String(safeScore));
  }

  private setSettingsVisible(visible: boolean): void {
    this.settingsModal.classList.toggle("hidden", !visible);
  }

  private applyUiForState(): void {
    const isStart = this.gameState === "start";
    const isPlaying = this.gameState === "playing";
    const isGameOver = this.gameState === "gameOver";

    this.startScreen.classList.toggle("hidden", !isStart);
    this.hud.classList.toggle("hidden", !isPlaying);
    this.settingsButton.classList.toggle("hidden", !isPlaying);
    this.restartButton.classList.toggle("hidden", !isPlaying);
    this.mobileControls.classList.toggle(
      "hidden",
      !isPlaying || !this.isMobile,
    );
    this.gameOverScreen.classList.toggle("hidden", !isGameOver);
    this.settingsModal.classList.add("hidden");
    this.steeringArrow.visible = isPlaying;
  }

  private triggerLightHaptic(): void {
    this.triggerHaptic("light");
  }

  private triggerHaptic(type: HapticType): void {
    if (!this.settings.haptics) {
      return;
    }
    if (typeof window.triggerHaptic === "function") {
      window.triggerHaptic(type);
    }
  }

  private resetMarble(): void {
    if (!this.marbleBody) {
      return;
    }

    const startX = this.sampleTrackX(this.startZ);
    const startY = this.getTrackSurfaceY(this.startZ) + this.marbleRadius + 0.8;
    this.marbleBody.setTranslation(
      { x: startX, y: startY, z: this.startZ },
      true,
    );
    this.marbleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.marbleBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.marbleBody.wakeUp();
    this.steeringAngle = 0;

    this.marbleMesh.position.set(startX, startY, this.startZ);
    this.marbleMesh.quaternion.identity();
    this.resetEnemyMarbles();
    this.syncEnemyMarbleMeshes();

    this.updateCamera(0.16);
    console.log("[ResetMarble]", "Marble reset to start");
  }

  private getTrackSurfaceY(z: number): number {
    const clampedZ = THREE.MathUtils.clamp(z, this.finishZ, this.startZ);
    for (let i = 0; i < this.trackSamples.length - 1; i += 1) {
      const a = this.trackSamples[i];
      const b = this.trackSamples[i + 1];
      if (clampedZ <= a.z && clampedZ >= b.z) {
        const t = (a.z - clampedZ) / Math.max(0.0001, a.z - b.z);
        return THREE.MathUtils.lerp(a.y, b.y, t);
      }
    }
    return (
      this.trackSamples[this.trackSamples.length - 1]?.y ?? this.trackCenterY
    );
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
        this.accumulator -= this.fixedStep;
      }
    }

    if (this.debugFlyMode) {
      this.updateDebugCamera(delta);
    } else {
      this.updateCamera(delta);
    }
    this.updateTrail(delta);
    this.updateParticles(delta);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);

    this.animationFrameId = window.requestAnimationFrame((next) =>
      this.frame(next),
    );
  }

  private stepPhysics(stepSeconds: number): void {
    if (!this.world || !this.marbleBody) {
      return;
    }

    if (this.gameState === "playing") {
      this.runTimeSeconds += stepSeconds;

      const inputAxis = Number(this.inputRight) - Number(this.inputLeft);
      const targetSteeringAngle = -inputAxis * this.maxSteeringAngle;
      const steeringLerp = Math.min(
        1,
        stepSeconds *
          (inputAxis === 0 ? this.steeringReturnRate : this.steeringTurnRate),
      );
      this.steeringAngle = THREE.MathUtils.lerp(
        this.steeringAngle,
        targetSteeringAngle,
        steeringLerp,
      );

      const positionBeforeStep = this.marbleBody.translation();
      const surfaceYBeforeStep = this.getTrackSurfaceY(positionBeforeStep.z);
      const inAirBeforeStep =
        positionBeforeStep.y > surfaceYBeforeStep + this.marbleRadius + 0.3;
      const airControlMultiplier = inAirBeforeStep ? 0.5 : 1;
      const forwardDirection = this.getTrackForwardDirection(
        positionBeforeStep.z,
      );
      const steerDirection = forwardDirection
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.steeringAngle);
      const adjustedSteerDirection = steerDirection.clone();
      const trackCenterX = this.sampleTrackX(positionBeforeStep.z);
      const halfPlayable = Math.max(
        0.9,
        this.sampleTrackWidth(positionBeforeStep.z) * 0.5 -
          this.wallThickness -
          this.marbleRadius -
          0.12,
      );
      const relativeX = positionBeforeStep.x - trackCenterX;
      const nearWallThreshold = halfPlayable - 0.22;
      const nearLeftWall = relativeX <= -nearWallThreshold;
      const nearRightWall = relativeX >= nearWallThreshold;
      const pushingIntoLeftWall = nearLeftWall && adjustedSteerDirection.x < 0;
      const pushingIntoRightWall =
        nearRightWall && adjustedSteerDirection.x > 0;
      if (pushingIntoLeftWall || pushingIntoRightWall) {
        adjustedSteerDirection.x *= 0.08;
        adjustedSteerDirection.normalize();
        const preVelocity = this.marbleBody.linvel();
        const outwardSpeed =
          (pushingIntoLeftWall ? -1 : 1) * preVelocity.x;
        if (outwardSpeed > 0.05) {
          this.marbleBody.setLinvel(
            {
              x: preVelocity.x * 0.35,
              y: preVelocity.y,
              z: preVelocity.z,
            },
            true,
          );
        }
      }
      const steeringImpulse =
        this.nudgeImpulse *
        this.speedMultiplier *
        this.steeringImpulseScale *
        airControlMultiplier;
      if (inputAxis !== 0) {
        this.marbleBody.applyImpulse(
          {
            x: adjustedSteerDirection.x * steeringImpulse,
            y: 0,
            z: adjustedSteerDirection.z * steeringImpulse,
          },
          true,
        );
      }
      const driveImpulse =
        this.nudgeImpulse *
        this.speedMultiplier *
        this.arrowDriveImpulseScale *
        airControlMultiplier;
      this.marbleBody.applyImpulse(
        {
          x: adjustedSteerDirection.x * driveImpulse,
          y: 0,
          z: adjustedSteerDirection.z * driveImpulse,
        },
        true,
      );
      const enemyForwardImpulse = driveImpulse * this.enemyForwardImpulseRatio;
      for (let i = 0; i < this.enemyMarbleBodies.length; i += 1) {
        if (this.enemyKnockedOff[i]) {
          continue;
        }
        const enemyBody = this.enemyMarbleBodies[i];
        enemyBody.applyImpulse({ x: 0, y: 0, z: -enemyForwardImpulse }, true);
        const enemyVelocity = enemyBody.linvel();
        if (enemyVelocity.z < -this.enemyMaxForwardSpeed) {
          enemyBody.setLinvel(
            {
              x: enemyVelocity.x,
              y: enemyVelocity.y,
              z: -this.enemyMaxForwardSpeed,
            },
            true,
          );
        }
      }

      const prevVelocity = this.marbleBody.linvel();
      this.world.step();

      const position = this.marbleBody.translation();
      let velocity = this.marbleBody.linvel();

      const speed = Math.sqrt(
        velocity.x * velocity.x + velocity.z * velocity.z,
      );
      const surfaceY = this.getTrackSurfaceY(position.z);
      const inAir = position.y > surfaceY + this.marbleRadius + 0.3;
      this.soundManager.updateLocomotion(speed, inAir);

      if (prevVelocity.y < -12 && velocity.y > -2) {
        this.soundManager.playHeavyLanding(Math.abs(prevVelocity.y) * 0.05);
      }

      for (let i = 0; i < this.enemyMarbleBodies.length; i += 1) {
        if (this.enemyKnockedOff[i]) {
          continue;
        }
        if (this.isEnemyOffPlatform(this.enemyMarbleBodies[i])) {
          this.markEnemyKnockedOff(i);
        }
      }

      // Contacts with enemy marbles should feel like pushing through traffic, not getting launched.
      const contactRange = this.marbleRadius + this.enemyMarbleRadius + 0.28;
      const contactRangeSq = contactRange * contactRange;
      let handledContacts = 0;
      for (let i = 0; i < this.enemyMarbleBodies.length; i += 1) {
        if (this.enemyKnockedOff[i]) {
          continue;
        }
        const enemyBody = this.enemyMarbleBodies[i];
        if (handledContacts >= 3) {
          break;
        }
        const enemyPosition = enemyBody.translation();
        const deltaX = enemyPosition.x - position.x;
        const deltaZ = enemyPosition.z - position.z;
        const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
        if (distanceSq > contactRangeSq) {
          continue;
        }
        if (
          Math.abs(enemyPosition.y - position.y) >
          this.marbleRadius + this.enemyMarbleRadius + 0.7
        ) {
          continue;
        }

        const sideSign = deltaX >= 0 ? 1 : -1;
        const playerForwardSpeed = Math.max(0, -velocity.z);
        const impactScale = THREE.MathUtils.clamp(
          playerForwardSpeed / 28,
          0.65,
          2.35,
        );
        this.soundManager.playEnemyHit(impactScale);
        enemyBody.applyImpulse(
          {
            x: sideSign * this.enemyBulldozeSideImpulse * impactScale,
            y: 0.48 * impactScale,
            z: -this.enemyBulldozeForwardImpulse * impactScale,
          },
          true,
        );
        const enemyVelocityAfterHit = enemyBody.linvel();
        if (enemyVelocityAfterHit.y > this.enemyContactUpwardVelocityCap) {
          enemyBody.setLinvel(
            {
              x: enemyVelocityAfterHit.x,
              y: this.enemyContactUpwardVelocityCap,
              z: enemyVelocityAfterHit.z,
            },
            true,
          );
        }

        handledContacts += 1;
      }

      velocity = this.marbleBody.linvel();
      if (velocity.y > this.playerContactUpwardVelocityCap) {
        this.marbleBody.setLinvel(
          {
            x: velocity.x,
            y: this.playerContactUpwardVelocityCap,
            z: velocity.z,
          },
          true,
        );
        velocity = this.marbleBody.linvel();
      }

      this.updateWaveObstacleAnimation();
      this.applyWaveObstacleImpulses(
        this.marbleBody,
        this.marbleRadius,
        true,
        velocity,
      );
      for (let i = 0; i < this.enemyMarbleBodies.length; i += 1) {
        if (this.enemyKnockedOff[i]) {
          continue;
        }
        this.applyWaveObstacleImpulses(
          this.enemyMarbleBodies[i],
          this.enemyMarbleRadius,
          false,
          null,
        );
      }

      this.updateSteeringArrowVisual();

      const rotation = this.marbleBody.rotation();
      this.marbleMesh.position.set(position.x, position.y, position.z);
      this.marbleMesh.quaternion.set(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      );
      this.syncEnemyMarbleMeshes();

      for (const row of this.fireworkRows) {
        if (!row.triggered && position.z <= row.activationZ) {
          this.spawnFireworks(row.burstPoints);
          row.triggered = true;
          break;
        }
      }

      if (position.z <= this.finishZ) {
        if (this.endlessMode) {
          this.advanceToNextRandomLevel();
          return;
        }
        this.endRun(true);
      } else if (
        position.y < this.currentLoseY ||
        (!this.endlessMode && this.runTimeSeconds >= this.maxRunSeconds)
      ) {
        this.endRun(false);
      }
    }
  }

  private updateWaveObstacleAnimation(): void {
    for (const rotator of this.rotatorObstacles) {
      rotator.angle += rotator.spinSpeed * rotator.spinDir * this.fixedStep;
      if (rotator.angle > Math.PI * 2) {
        rotator.angle -= Math.PI * 2;
      } else if (rotator.angle < -Math.PI * 2) {
        rotator.angle += Math.PI * 2;
      }
      const mesh = this.obstacleMeshById.get(rotator.id);
      if (mesh) {
        mesh.rotation.x = -rotator.tilt;
        mesh.rotation.y = rotator.angle;
      }
      const body = this.obstacleBodyById.get(rotator.id);
      if (body) {
        const rotation = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(-rotator.tilt, rotator.angle, 0),
        );
        body.setNextKinematicRotation({
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          w: rotation.w,
        });
      }
    }

    for (const pad of this.bouncyPads) {
      const cycle = 0.5 + 0.5 * Math.sin(this.runTimeSeconds * pad.sweepSpeed + pad.phase);
      const startYaw =
        pad.side === "left"
          ? THREE.MathUtils.degToRad(8)
          : Math.PI - THREE.MathUtils.degToRad(8);
      const endYaw =
        pad.side === "left" ? -Math.PI * 0.5 : Math.PI * 0.5;
      pad.sweepAngle = THREE.MathUtils.lerp(startYaw, endYaw, cycle);
      const paddle = this.bouncyPadPaddleById.get(pad.id);
      if (paddle) {
        paddle.rotation.y = pad.sweepAngle;
      }
    }

    for (const bouncer of this.pinballBouncers) {
      const cap = this.bouncerCapById.get(bouncer.id);
      if (!cap) {
        continue;
      }
      const currentPulse = this.bouncerPulseById.get(bouncer.id) ?? 0;
      const nextPulse = Math.max(0, currentPulse - this.fixedStep * 5.2);
      this.bouncerPulseById.set(bouncer.id, nextPulse);
      const targetScale = 1 + nextPulse * 0.22;
      const lerpFactor = Math.min(1, this.fixedStep * 16);
      const nextScale = THREE.MathUtils.lerp(
        cap.scale.x,
        targetScale,
        lerpFactor,
      );
      cap.scale.setScalar(nextScale);
    }
  }

  private applyWaveObstacleImpulses(
    body: RAPIER.RigidBody,
    radius: number,
    isPlayer: boolean,
    _playerVelocity: RAPIER.Vector | null,
  ): void {
    const now = this.runTimeSeconds;
    const position = body.translation();

    for (const bouncer of this.pinballBouncers) {
      const dx = position.x - bouncer.x;
      const dz = position.z - bouncer.z;
      const range = bouncer.capRadius + radius + 0.52;
      const rangeSq = range * range;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > rangeSq) {
        continue;
      }
      if (Math.abs(position.y - bouncer.y) > bouncer.columnHeight + 1.8) {
        continue;
      }
      if (now - bouncer.lastHitAt < 0.18) {
        continue;
      }
      const distance = Math.sqrt(Math.max(0.0001, distanceSq));
      let normalX = dx / distance;
      let normalZ = dz / distance;
      if (distance < 0.08) {
        const fallback = this.getTrackForwardDirection(bouncer.z)
          .multiplyScalar(-1)
          .normalize();
        normalX = fallback.x;
        normalZ = fallback.z;
      }
      const impulseScale = isPlayer ? 1 : 0.7;
      const currentVelocity = body.linvel();
      const outwardSpeed =
        currentVelocity.x * normalX + currentVelocity.z * normalZ;
      if (outwardSpeed < 0) {
        body.setLinvel(
          {
            x: currentVelocity.x - normalX * outwardSpeed,
            y: currentVelocity.y,
            z: currentVelocity.z - normalZ * outwardSpeed,
          },
          true,
        );
      }
      body.applyImpulse(
        {
          x: normalX * bouncer.bounceImpulse * impulseScale,
          y: 2.1 * impulseScale,
          z: normalZ * bouncer.bounceImpulse * impulseScale,
        },
        true,
      );
      bouncer.lastHitAt = now;
      if (isPlayer) {
        this.bouncerPulseById.set(bouncer.id, 1);
        this.soundManager.playEnemyHit(0.95);
        this.triggerHaptic("medium");
      }
    }

    for (const pad of this.bouncyPads) {
      const dx = position.x - pad.x;
      const dz = position.z - pad.z;
      const range = pad.paddleLength * 0.55 + radius;
      const rangeSq = range * range;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > rangeSq) {
        continue;
      }
      if (Math.abs(position.y - pad.y) > 1.2) {
        continue;
      }
      if (now - pad.lastHitAt < 0.2) {
        continue;
      }

      const forward = this.getTrackForwardDirection(pad.z);
      const inward = new THREE.Vector3(pad.side === "left" ? 1 : -1, 0, 0);
      const paddleForward = new THREE.Vector3(
        Math.cos(pad.sweepAngle),
        0,
        Math.sin(pad.sweepAngle),
      ).normalize();
      const padDirection = forward
        .clone()
        .multiplyScalar(1.35)
        .add(inward.multiplyScalar(0.25))
        .add(paddleForward.multiplyScalar(0.5))
        .normalize();
      const impulseScale = isPlayer ? 1 : 0.74;
      body.applyImpulse(
        {
          x: padDirection.x * pad.launchImpulse * impulseScale,
          y: 1.6 * impulseScale,
          z: padDirection.z * pad.launchImpulse * impulseScale,
        },
        true,
      );
      pad.lastHitAt = now;
      if (isPlayer) {
        this.soundManager.playEnemyHit(0.85);
      }
    }

    if (isPlayer) {
      const velocity = body.linvel();
      if (velocity.y > this.playerContactUpwardVelocityCap) {
        body.setLinvel(
          {
            x: velocity.x,
            y: this.playerContactUpwardVelocityCap,
            z: velocity.z,
          },
          true,
        );
      }
    }
  }

  private updateCamera(delta: number): void {
    const targetPosition = this.marbleMesh.position;

    const panX = targetPosition.x * 0.5;
    const followTarget = new THREE.Vector3(
      panX,
      targetPosition.y + 24,
      targetPosition.z + 32.4,
    );
    const lookTarget = new THREE.Vector3(
      panX,
      targetPosition.y + 0.9,
      targetPosition.z - 20.4,
    );

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
    const stepZ = 2.8;
    const clampedZ = THREE.MathUtils.clamp(z, this.finishZ, this.startZ);
    const nextZ = THREE.MathUtils.clamp(
      clampedZ - stepZ,
      this.finishZ,
      this.startZ,
    );
    const currentX = this.sampleTrackX(clampedZ);
    const nextX = this.sampleTrackX(nextZ);
    const forward = new THREE.Vector3(nextX - currentX, 0, nextZ - clampedZ);
    if (forward.lengthSq() < 0.0001) {
      return new THREE.Vector3(0, 0, -1);
    }
    forward.normalize();
    if (forward.z > -0.02) {
      return new THREE.Vector3(0, 0, -1);
    }
    return forward;
  }

  private createSteeringArrowGeometry(
    shaftLength: number,
    headLength: number,
    shaftWidth: number,
    headWidth: number,
  ): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(-shaftWidth * 0.5, 0);
    shape.lineTo(-shaftWidth * 0.5, shaftLength);
    shape.lineTo(-headWidth * 0.5, shaftLength);
    shape.lineTo(0, shaftLength + headLength);
    shape.lineTo(headWidth * 0.5, shaftLength);
    shape.lineTo(shaftWidth * 0.5, shaftLength);
    shape.lineTo(shaftWidth * 0.5, 0);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: shaftWidth,
      bevelEnabled: false,
      steps: 1,
    });
    geometry.rotateX(-Math.PI * 0.5);
    geometry.translate(0, -shaftWidth * 0.5, 0);
    geometry.computeVertexNormals();
    return geometry;
  }

  private updateSteeringArrowVisual(): void {
    if (!this.marbleBody) {
      this.steeringArrow.visible = false;
      return;
    }
    if (this.gameState !== "playing") {
      this.steeringArrow.visible = false;
      return;
    }

    const marblePosition = this.marbleBody.translation();
    const forwardDirection = this.getTrackForwardDirection(marblePosition.z);
    const arrowDirection = forwardDirection
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.steeringAngle)
      .normalize();
    const arrowOrigin = this.marbleMesh.position
      .clone()
      .add(new THREE.Vector3(0, 0.65, 0))
      .add(arrowDirection.clone().multiplyScalar(this.steeringArrowGap));

    this.steeringArrow.visible = true;
    this.steeringArrow.position.copy(arrowOrigin);
    this.steeringArrow.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      arrowDirection,
    );
  }

  private updateHud(): void {
    const velocity = this.marbleBody?.linvel();
    const speed = velocity
      ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z)
      : 0;
    const currentLevel = this.loopsCompleted + 1;
    const score = this.enemyKnockouts * this.enemyKnockScore;
    this.timeLabel.textContent =
      "Level: " +
      String(currentLevel) +
      " | Passed: " +
      String(this.loopsCompleted);
    this.speedLabel.textContent =
      "Score: " + String(score) + " | Speed: " + speed.toFixed(1);
    this.updateLevelProgressUi();
  }

  private isEnemyOffPlatform(enemyBody: RAPIER.RigidBody): boolean {
    const position = enemyBody.translation();
    const surfaceY = this.getTrackSurfaceY(position.z);
    const centerX = this.sampleTrackX(position.z);
    const halfTrack =
      this.sampleTrackWidth(position.z) * 0.5 + this.wallThickness + 0.9;
    const belowTrack = position.y < surfaceY - (this.enemyMarbleRadius + 1.4);
    const outsideTrack =
      Math.abs(position.x - centerX) > halfTrack &&
      position.y < surfaceY + this.enemyMarbleRadius + 1.6;
    const deepFall = position.y < this.currentLoseY + 8;
    return belowTrack || outsideTrack || deepFall;
  }

  private markEnemyKnockedOff(index: number): void {
    const body = this.enemyMarbleBodies[index];
    this.enemyKnockedOff[index] = true;
    this.enemyKnockouts += 1;
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setTranslation(
      { x: 0, y: this.currentLoseY - 30 - index * 0.2, z: 0 },
      true,
    );
    if (this.enemyMarbleMeshes[index]) {
      this.enemyMarbleMeshes[index].visible = false;
    }
    console.log(
      "[MarkEnemyKnockedOff]",
      "Enemy knocked off count=" + String(this.enemyKnockouts),
    );
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

  private calculateLevelProgress(z: number): number {
    const startZ = this.levelProgressStartZ;
    const endZ = this.levelProgressEndZ;
    const totalLength = Math.max(0.001, startZ - endZ);
    const clampedZ = THREE.MathUtils.clamp(z, endZ, startZ);
    const traversed = startZ - clampedZ;
    return THREE.MathUtils.clamp(traversed / totalLength, 0, 1);
  }

  private updateLevelProgressUi(): void {
    const marblePosition = this.marbleBody?.translation();
    const progress = marblePosition
      ? this.calculateLevelProgress(marblePosition.z)
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
