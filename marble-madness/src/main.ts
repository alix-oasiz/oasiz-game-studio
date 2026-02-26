import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

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

interface TrackSegment {
  zStart: number;
  zEnd: number;
  length: number;
  tilt: number;
  surfaceYStart: number;
  surfaceYEnd: number;
  centerZ: number;
  centerY: number;
}

declare global {
  interface Window {
    submitScore?: (score: number) => void;
    triggerHaptic?: (type: HapticType) => void;
    loadGameState?: () => Record<string, unknown>;
    saveGameState?: (state: Record<string, unknown>) => void;
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

  private gameState: GameState = "start";
  private settings: Settings;
  private persistentState: PersistedState = {};

  private inputLeft = false;
  private inputRight = false;

  private animationFrameId = 0;
  private lastFrameSeconds = 0;
  private accumulator = 0;

  private runTimeSeconds = 0;
  private finishedTimeSeconds = 0;

  private readonly fixedStep = 1 / 60;
  private readonly trackWidth = 12;
  private readonly trackLength = 240;
  private readonly trackThickness = 2;
  private readonly trackCenterY = 30;
  private readonly trackCenterZ = 0;
  private readonly startZ = 102;
  private readonly finishZ = -102;
  private readonly loseY = -50;
  private readonly skyscraperTopY = -80;
  private readonly maxRunSeconds = 60;
  private readonly marbleRadius = 1;
  private readonly nudgeImpulse = 1.35;
  private readonly downhillImpulse = 0.08;
  private readonly trackSegmentDefs = [
    { length: 70, tilt: 0.14 },
    { length: 60, tilt: 0.24 },
    { length: 55, tilt: 0.34 },
    { length: 55, tilt: 0.22 },
  ];

  private readonly trackSegments: TrackSegment[] = [];

  private readonly startScreen: HTMLElement;
  private readonly gameOverScreen: HTMLElement;
  private readonly settingsModal: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly mobileControls: HTMLElement;
  private readonly settingsButton: HTMLElement;
  private readonly restartButton: HTMLElement;
  private readonly timeLabel: HTMLElement;
  private readonly speedLabel: HTMLElement;
  private readonly resultLabel: HTMLElement;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#071327");

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1400);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.75 : 2));
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
    this.resultLabel = this.requireElement("result-label");

    this.settings = this.loadSettings();
    this.persistentState = this.loadPersistentState();

    const marbleGeometry = new THREE.SphereGeometry(this.marbleRadius, 32, 24);
    const marbleMaterial = new THREE.MeshStandardMaterial({
      color: "#e8f1ff",
      roughness: 0.28,
      metalness: 0.16,
    });
    this.marbleMesh = new THREE.Mesh(marbleGeometry, marbleMaterial);
    this.scene.add(this.marbleMesh);

    this.buildTrackSegments();
    this.setupSceneVisuals();
    this.bindUi();
    this.bindInput();
    this.applySettingsUi();
    this.applyUiForState();
    this.handleResize();

    window.addEventListener("resize", () => this.handleResize());
    console.log("[Constructor]", "Marble Madness starter created");
  }

  public async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.world.integrationParameters.dt = this.fixedStep;

    this.createTrackPhysics();
    this.createMarblePhysics();
    this.resetMarble();

    this.lastFrameSeconds = performance.now() / 1000;
    this.animationFrameId = window.requestAnimationFrame((timeMs) => this.frame(timeMs));
    console.log("[Init]", "Rapier world initialized");
  }

  private requireElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error("Missing element with id " + id);
    }
    return element;
  }

  private buildTrackSegments(): void {
    this.trackSegments.length = 0;

    let currentZ = this.trackCenterZ + this.trackLength * 0.5;
    let currentSurfaceY = this.trackCenterY + this.trackThickness * 0.5;

    for (const def of this.trackSegmentDefs) {
      const nextZ = currentZ - def.length;
      const drop = Math.tan(def.tilt) * def.length;
      const nextSurfaceY = currentSurfaceY - drop;

      this.trackSegments.push({
        zStart: currentZ,
        zEnd: nextZ,
        length: def.length,
        tilt: def.tilt,
        surfaceYStart: currentSurfaceY,
        surfaceYEnd: nextSurfaceY,
        centerZ: (currentZ + nextZ) * 0.5,
        centerY: (currentSurfaceY + nextSurfaceY) * 0.5 - this.trackThickness * 0.5,
      });

      currentZ = nextZ;
      currentSurfaceY = nextSurfaceY;
    }

    console.log("[BuildTrackSegments]", "Built segmented ramp profile");
  }

  private getSegmentAtZ(z: number): TrackSegment {
    const clampedZ = THREE.MathUtils.clamp(
      z,
      this.trackCenterZ - this.trackLength * 0.5,
      this.trackCenterZ + this.trackLength * 0.5,
    );
    const segment = this.trackSegments.find((entry) => clampedZ <= entry.zStart && clampedZ >= entry.zEnd);
    if (segment) {
      return segment;
    }
    return this.trackSegments[this.trackSegments.length - 1];
  }

  private getTrackTiltAtZ(z: number): number {
    return this.getSegmentAtZ(z).tilt;
  }

  private setupSceneVisuals(): void {
    const hemi = new THREE.HemisphereLight("#d8ebff", "#6a89ad", 1.05);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight("#ffffff", 0.75);
    dir.position.set(10, 24, 18);
    this.scene.add(dir);

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: "#d4bea1",
      roughness: 0.73,
      metalness: 0.04,
    });

    for (const segment of this.trackSegments) {
      const segmentGroup = new THREE.Group();
      segmentGroup.rotation.x = -segment.tilt;
      segmentGroup.position.set(0, segment.centerY, segment.centerZ);

      const road = new THREE.Mesh(
        new THREE.BoxGeometry(this.trackWidth, this.trackThickness, segment.length),
        new THREE.MeshStandardMaterial({
          color: "#dfc092",
          roughness: 0.82,
          metalness: 0.02,
        }),
      );
      segmentGroup.add(road);

      const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, segment.length), wallMaterial);
      wallLeft.position.set(-this.trackWidth * 0.5 - 0.5, 1.2, 0);
      segmentGroup.add(wallLeft);

      const wallRight = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, segment.length), wallMaterial);
      wallRight.position.set(this.trackWidth * 0.5 + 0.5, 1.2, 0);
      segmentGroup.add(wallRight);

      this.scene.add(segmentGroup);
    }

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
    finishStrip.rotation.x = -this.getTrackTiltAtZ(this.finishZ);
    finishStrip.position.set(0, this.getTrackSurfaceY(this.finishZ) + 0.08, this.finishZ);
    this.scene.add(finishStrip);

    const finishFrameMaterial = new THREE.MeshStandardMaterial({
      color: "#1b2f4e",
      roughness: 0.5,
      metalness: 0.3,
    });
    const finishPillarLeft = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 0.8), finishFrameMaterial);
    finishPillarLeft.rotation.x = -this.getTrackTiltAtZ(this.finishZ);
    finishPillarLeft.position.set(-this.trackWidth * 0.5 + 0.8, this.getTrackSurfaceY(this.finishZ) + 4.2, this.finishZ);
    this.scene.add(finishPillarLeft);

    const finishPillarRight = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 0.8), finishFrameMaterial);
    finishPillarRight.rotation.x = -this.getTrackTiltAtZ(this.finishZ);
    finishPillarRight.position.set(this.trackWidth * 0.5 - 0.8, this.getTrackSurfaceY(this.finishZ) + 4.2, this.finishZ);
    this.scene.add(finishPillarRight);

    const finishTopBeam = new THREE.Mesh(
      new THREE.BoxGeometry(this.trackWidth - 1, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color: "#2e4b73", roughness: 0.5, metalness: 0.28 }),
    );
    finishTopBeam.rotation.x = -this.getTrackTiltAtZ(this.finishZ);
    finishTopBeam.position.set(0, this.getTrackSurfaceY(this.finishZ) + 8.6, this.finishZ);
    this.scene.add(finishTopBeam);

    this.addSkyscrapers();
    this.addBlockerVisuals();
  }

  private addSkyscrapers(): void {
    const skyscraperGroup = new THREE.Group();

    const skyscraperLayout = [
      { x: -88, z: -118, w: 18, d: 13, h: 134 },
      { x: 94, z: -96, w: 14, d: 16, h: 162 },
      { x: -104, z: -42, w: 20, d: 14, h: 116 },
      { x: 98, z: -8, w: 16, d: 12, h: 178 },
      { x: -92, z: 34, w: 13, d: 17, h: 154 },
      { x: 88, z: 62, w: 19, d: 13, h: 128 },
      { x: -98, z: 108, w: 16, d: 16, h: 186 },
      { x: 96, z: 122, w: 15, d: 14, h: 146 },
      { x: -122, z: 16, w: 18, d: 18, h: 102 },
      { x: 124, z: 26, w: 17, d: 17, h: 98 },
    ];

    for (const tower of skyscraperLayout) {
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(tower.w, tower.h, tower.d),
        new THREE.MeshStandardMaterial({
          color: "#cfe4fb",
          roughness: 0.88,
          metalness: 0.05,
        }),
      );
      building.position.set(tower.x, this.skyscraperTopY - tower.h * 0.5, tower.z);
      skyscraperGroup.add(building);
    }

    this.scene.add(skyscraperGroup);
    console.log("[AddSkyscrapers]", "Placed 10 skyscrapers under floating ramp");
  }

  private getBlockerLayout(): Array<{ z: number; side: -1 | 1 }> {
    return [
      { z: 68, side: -1 },
      { z: 36, side: 1 },
      { z: 2, side: -1 },
      { z: -30, side: 1 },
      { z: -62, side: -1 },
    ];
  }

  private addBlockerVisuals(): void {
    const blockerWidth = this.trackWidth * (1 / 3);
    const blockerX = this.trackWidth * 0.5 - blockerWidth * 0.5 - 1.0;
    const blockerMaterial = new THREE.MeshStandardMaterial({
      color: "#8a3d2f",
      roughness: 0.68,
      metalness: 0.08,
    });

    for (const blocker of this.getBlockerLayout()) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(blockerWidth, 1.1, 1.2), blockerMaterial);
      wall.rotation.x = -this.getTrackTiltAtZ(blocker.z);
      wall.position.set(blocker.side * blockerX, this.getTrackSurfaceY(blocker.z) + 0.55, blocker.z);
      this.scene.add(wall);
    }

    console.log("[AddBlockerVisuals]", "Added horizontal blocker walls");
  }

  private createTrackPhysics(): void {
    if (!this.world) {
      return;
    }

    for (const segment of this.trackSegments) {
      const segmentRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-segment.tilt, 0, 0));
      const floorBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, segment.centerY, segment.centerZ)
        .setRotation({
          x: segmentRotation.x,
          y: segmentRotation.y,
          z: segmentRotation.z,
          w: segmentRotation.w,
        });
      const floorBody = this.world.createRigidBody(floorBodyDesc);
      const floorCollider = RAPIER.ColliderDesc.cuboid(
        this.trackWidth * 0.5,
        this.trackThickness * 0.5,
        segment.length * 0.5,
      )
        .setFriction(1.1)
        .setRestitution(0.02);
      this.world.createCollider(floorCollider, floorBody);

      const wallHalfX = 0.5;
      const wallHalfY = 1.2;
      const wallHalfZ = segment.length * 0.5;

      const leftWallBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(-this.trackWidth * 0.5 - 0.5, segment.centerY + 1.2, segment.centerZ)
        .setRotation({
          x: segmentRotation.x,
          y: segmentRotation.y,
          z: segmentRotation.z,
          w: segmentRotation.w,
        });
      const leftWallBody = this.world.createRigidBody(leftWallBodyDesc);
      const leftWallCollider = RAPIER.ColliderDesc.cuboid(wallHalfX, wallHalfY, wallHalfZ).setFriction(0.7);
      this.world.createCollider(leftWallCollider, leftWallBody);

      const rightWallBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(this.trackWidth * 0.5 + 0.5, segment.centerY + 1.2, segment.centerZ)
        .setRotation({
          x: segmentRotation.x,
          y: segmentRotation.y,
          z: segmentRotation.z,
          w: segmentRotation.w,
        });
      const rightWallBody = this.world.createRigidBody(rightWallBodyDesc);
      const rightWallCollider = RAPIER.ColliderDesc.cuboid(wallHalfX, wallHalfY, wallHalfZ).setFriction(0.7);
      this.world.createCollider(rightWallCollider, rightWallBody);
    }

    this.createBlockerPhysics();
    console.log("[CreateTrackPhysics]", "Track colliders created");
  }

  private createBlockerPhysics(): void {
    if (!this.world) {
      return;
    }

    const blockerWidth = this.trackWidth * (1 / 3);
    const blockerHalfWidth = blockerWidth * 0.5;
    const blockerX = this.trackWidth * 0.5 - blockerHalfWidth - 1.0;

    for (const blocker of this.getBlockerLayout()) {
      const x = blocker.side * blockerX;
      const y = this.getTrackSurfaceY(blocker.z) + 0.55;
      const tilt = this.getTrackTiltAtZ(blocker.z);
      const trackRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, 0, 0));
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(x, y, blocker.z)
        .setRotation({ x: trackRotation.x, y: trackRotation.y, z: trackRotation.z, w: trackRotation.w });
      const body = this.world.createRigidBody(bodyDesc);
      const collider = RAPIER.ColliderDesc.cuboid(blockerHalfWidth, 0.55, 0.6).setFriction(0.9).setRestitution(0.05);
      this.world.createCollider(collider, body);
    }

    console.log("[CreateBlockerPhysics]", "Added blocker colliders");
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
      .setFriction(1.2)
      .setRestitution(0.04)
      .setDensity(1.3);

    this.world.createCollider(collider, this.marbleBody);
    console.log("[CreateMarblePhysics]", "Marble rigid body created");
  }

  private bindUi(): void {
    document.getElementById("start-btn")?.addEventListener("click", () => {
      this.triggerLightHaptic();
      this.startRun();
    });

    document.getElementById("play-again-btn")?.addEventListener("click", () => {
      this.triggerLightHaptic();
      this.startRun();
    });

    this.restartButton.addEventListener("click", () => {
      this.triggerLightHaptic();
      this.startRun();
    });

    this.settingsButton.addEventListener("click", () => {
      this.triggerLightHaptic();
      this.setSettingsVisible(true);
    });

    document.getElementById("settings-close")?.addEventListener("click", () => {
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
      if (event.key === "ArrowLeft" || key === "a") {
        this.inputLeft = true;
      }
      if (event.key === "ArrowRight" || key === "d") {
        this.inputRight = true;
      }
    });

    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (event.key === "ArrowLeft" || key === "a") {
        this.inputLeft = false;
      }
      if (event.key === "ArrowRight" || key === "d") {
        this.inputRight = false;
      }
    });

    this.bindHoldControl("left-btn", true);
    this.bindHoldControl("right-btn", false);
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
      this.triggerLightHaptic();
      console.log("[BindSettingToggle]", "Updated setting " + key + "=" + String(this.settings[key]));
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
    this.setSettingsVisible(false);
    this.resetMarble();
    this.updateHud();
    this.applyUiForState();
    console.log("[StartRun]", "Run started");
  }

  private endRun(finished: boolean): void {
    if (this.gameState !== "playing") {
      return;
    }

    this.gameState = "gameOver";
    this.finishedTimeSeconds = this.runTimeSeconds;

    if (finished) {
      this.resultLabel.textContent = "Finish time: " + this.finishedTimeSeconds.toFixed(2) + "s";
      const score = this.calculateScore(this.finishedTimeSeconds);
      this.submitFinalScore(score);
      this.triggerHaptic("success");
    } else {
      this.resultLabel.textContent = "Run failed. Try again.";
      this.submitFinalScore(0);
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
    this.mobileControls.classList.toggle("hidden", !isPlaying || !this.isMobile);
    this.gameOverScreen.classList.toggle("hidden", !isGameOver);
    this.settingsModal.classList.add("hidden");
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

    const startY = this.getTrackSurfaceY(this.startZ) + this.marbleRadius + 0.8;
    this.marbleBody.setTranslation({ x: 0, y: startY, z: this.startZ }, true);
    this.marbleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.marbleBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.marbleBody.wakeUp();

    this.marbleMesh.position.set(0, startY, this.startZ);
    this.marbleMesh.quaternion.identity();

    this.updateCamera(0.16);
    console.log("[ResetMarble]", "Marble reset to start");
  }

  private getTrackSurfaceY(z: number): number {
    const segment = this.getSegmentAtZ(z);
    const segmentProgress = THREE.MathUtils.clamp(
      (segment.zStart - z) / Math.max(0.0001, segment.zStart - segment.zEnd),
      0,
      1,
    );
    return THREE.MathUtils.lerp(segment.surfaceYStart, segment.surfaceYEnd, segmentProgress);
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.75 : 2));
    this.renderer.setSize(width, height);

    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();

    console.log("[HandleResize]", "Viewport resized to " + String(width) + "x" + String(height));
  }

  private frame(timeMs: number): void {
    const nowSeconds = timeMs / 1000;
    const delta = Math.min(0.05, nowSeconds - this.lastFrameSeconds);
    this.lastFrameSeconds = nowSeconds;

    this.accumulator += delta;
    while (this.accumulator >= this.fixedStep) {
      this.stepPhysics(this.fixedStep);
      this.accumulator -= this.fixedStep;
    }

    this.updateCamera(delta);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);

    this.animationFrameId = window.requestAnimationFrame((next) => this.frame(next));
  }

  private stepPhysics(stepSeconds: number): void {
    if (!this.world || !this.marbleBody) {
      return;
    }

    if (this.gameState === "playing") {
      this.runTimeSeconds += stepSeconds;

      const inputAxis = Number(this.inputRight) - Number(this.inputLeft);
      if (inputAxis !== 0) {
        this.marbleBody.applyImpulse({ x: inputAxis * this.nudgeImpulse, y: 0, z: 0 }, true);
      }
      const positionBeforeStep = this.marbleBody.translation();
      const localTilt = this.getTrackTiltAtZ(positionBeforeStep.z);
      const slopeFactor = Math.max(0, Math.tan(localTilt));
      const momentumBoost = this.downhillImpulse + slopeFactor * 0.55;
      this.marbleBody.applyImpulse({ x: 0, y: 0, z: -momentumBoost }, true);

      this.world.step();

      const position = this.marbleBody.translation();
      const rotation = this.marbleBody.rotation();
      this.marbleMesh.position.set(position.x, position.y, position.z);
      this.marbleMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

      if (position.z <= this.finishZ) {
        this.endRun(true);
      } else if (position.y < this.loseY || this.runTimeSeconds >= this.maxRunSeconds) {
        this.endRun(false);
      }
    }
  }

  private updateCamera(delta: number): void {
    const targetPosition = this.marbleMesh.position;

    const desired = new THREE.Vector3(targetPosition.x * 0.55, targetPosition.y + 40, targetPosition.z + 54);
    const lerpFactor = Math.min(1, delta * 4.5);
    this.camera.position.lerp(desired, lerpFactor);

    const look = new THREE.Vector3(targetPosition.x * 0.7, targetPosition.y + 1.2, targetPosition.z - 34);
    this.camera.lookAt(look);
  }

  private updateHud(): void {
    const velocity = this.marbleBody?.linvel();
    const speed = velocity ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) : 0;
    this.timeLabel.textContent = "Time: " + this.runTimeSeconds.toFixed(2) + "s";
    this.speedLabel.textContent = "Speed: " + speed.toFixed(1);
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
