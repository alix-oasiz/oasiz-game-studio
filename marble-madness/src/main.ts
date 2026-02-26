import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

const BUILD_VERSION = "0.4.4";

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

interface TrailParticle {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
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
  private marbleMaterial: THREE.MeshStandardMaterial;
  private trackMaterial: THREE.MeshStandardMaterial;

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
  private readonly trackLength = 330;
  private readonly trackThickness = 2;
  private readonly trackCenterY = 30;
  private readonly trackCenterZ = 0;
  private readonly startZ = 106;
  private readonly finishZ = -198;
  private readonly loseY = -50;
  private readonly skyscraperTopY = -80;
  private readonly maxRunSeconds = 60;
  private readonly marbleRadius = 1;
  private readonly startFlickSpeed = 16;
  private readonly nudgeImpulse = 1.35;
  private readonly downhillImpulse = 0.06;
  private readonly speedMultiplier = 6;
  private readonly trackStep = 1.5;
  private readonly wallHeight = 3.6;
  private readonly wallThickness = 0.8;
  private readonly platformUvScaleV = 0.035;
  private readonly trackSamples: TrackSample[] = [];
  private readonly trackSlices: TrackSlice[] = [];
  private readonly fireworkTriggerZ = -186;
  private particles: FireworkParticle[] = [];
  private fireworkRows: FireworkRow[] = [];
  private trailParticles: TrailParticle[] = [];
  private trailSpawnSeconds = 0;
  private readonly trailSpawnInterval = 0.015;

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
  private readonly versionLabel: HTMLElement;

  public constructor(canvas: HTMLCanvasElement) {
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
    this.versionLabel = this.requireElement("version-label");
    this.versionLabel.textContent = "Build " + BUILD_VERSION;

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
    this.marbleMesh = new THREE.Mesh(marbleGeometry, this.marbleMaterial);
    this.marbleMesh.castShadow = true;
    this.marbleMesh.receiveShadow = true;
    this.scene.add(this.marbleMesh);
    this.loadMarbleTexture();
    this.loadTileTexture();

    this.buildTrackSlices();
    this.setupSceneVisuals();
    this.bindUi();
    this.bindInput();
    this.applySettingsUi();
    this.applyUiForState();
    this.handleResize();

    window.addEventListener("resize", () => this.handleResize());
    console.log("[Constructor]", "Marble Madness starter created (build " + BUILD_VERSION + ")");
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
        console.log("[LoadMarbleTexture]", "Loaded marble texture from /assets/marble-texture.jpg");
      },
      undefined,
      () => {
        console.log("[LoadMarbleTexture]", "Texture file not found, using fallback marble material");
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
        console.log("[LoadTileTexture]", "Loaded tile texture from /assets/tile-texture.jpg");
      },
      undefined,
      () => {
        console.log("[LoadTileTexture]", "Tile texture not found, using fallback track material");
      },
    );
  }

  private spawnTrailParticle(position: THREE.Vector3): void {
    const speed = this.marbleBody ? this.marbleBody.linvel() : { x: 0, y: 0, z: 0 };
    const speedMag = Math.sqrt(speed.x * speed.x + speed.y * speed.y + speed.z * speed.z);
    const radius = THREE.MathUtils.clamp(0.26 + speedMag * 0.004, 0.26, 0.62);

    const trailMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 10),
      new THREE.MeshStandardMaterial({
        color: "#a8d8ff",
        transparent: true,
        opacity: 0.36,
        roughness: 0.75,
        metalness: 0.0,
        depthWrite: false,
      }),
    );
    trailMesh.position.copy(position);
    trailMesh.position.y += 0.2;
    this.scene.add(trailMesh);
    this.trailParticles.push({
      mesh: trailMesh,
      life: 0.45,
      maxLife: 0.45,
    });
  }

  private updateTrail(delta: number): void {
    if (this.gameState === "playing") {
      this.trailSpawnSeconds += delta;
      if (this.trailSpawnSeconds >= this.trailSpawnInterval) {
        this.trailSpawnSeconds = 0;
        this.spawnTrailParticle(this.marbleMesh.position.clone());
      }
    }

    const alive: TrailParticle[] = [];
    for (const trail of this.trailParticles) {
      trail.life -= delta;
      const progress = THREE.MathUtils.clamp(trail.life / trail.maxLife, 0, 1);
      const scale = 0.65 + progress * 0.55;
      trail.mesh.scale.setScalar(scale);
      const mat = trail.mesh.material;
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.opacity = progress * 0.36;
      }
      if (trail.life > 0) {
        alive.push(trail);
      } else {
        this.scene.remove(trail.mesh);
      }
    }
    this.trailParticles = alive;
  }

  private smooth01(t: number): number {
    return t * t * (3 - 2 * t);
  }

  private sampleTrackX(z: number): number {
    if (z >= 40) {
      return 0;
    }
    if (z > -20) {
      const t = (40 - z) / 60;
      return -4.6 * this.smooth01(THREE.MathUtils.clamp(t, 0, 1));
    }
    if (z > -82) {
      return -4.6;
    }
    if (z > -128) {
      const t = (-82 - z) / 46;
      return THREE.MathUtils.lerp(-4.6, 0, this.smooth01(THREE.MathUtils.clamp(t, 0, 1)));
    }
    return 0;
  }

  private sampleTrackSlope(z: number): number {
    if (z >= 70) {
      return 0.0;
    }
    if (z >= 30) {
      return 0.30;
    }
    if (z >= -12) {
      return 0.24;
    }
    if (z >= -64) {
      return 0.22;
    }
    if (z >= -82) {
      return -0.12;
    }
    if (z >= -102) {
      return 0.14;
    }
    if (z >= -128) {
      return 0.08;
    }
    return 0.01;
  }

  private sampleTrackWidth(z: number): number {
    if (z >= -20) {
      return this.trackWidth;
    }
    if (z >= -76) {
      return 7;
    }
    if (z >= -132) {
      return 10;
    }
    return this.trackWidth;
  }

  private hasFloorAtZ(z: number): boolean {
    const isFirstGap = z < -12 && z > -26;
    return !isFirstGap;
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
      this.trackSamples.push({ z: currentZ, x, y: currentY, tilt, width, hasFloor });

      const nextZ = currentZ - this.trackStep;
      const dz = currentZ - nextZ;
      currentY -= Math.tan(tilt) * dz;
      currentZ = nextZ;
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

    console.log("[BuildTrackSlices]", "Generated tile course slices");
  }

  private getSliceAtZ(z: number): TrackSlice {
    const clampedZ = THREE.MathUtils.clamp(z, this.finishZ, this.startZ);
    const slice = this.trackSlices.find((entry) => clampedZ <= entry.zStart && clampedZ >= entry.zEnd);
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
    this.scene.add(hemi);

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
    this.scene.add(sunLight);

    this.addPlatformRunMeshes();

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
    this.addFinishTriggerCubes();
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
      a.x, a.y, a.z,
      b.x, b.y, b.z,
      c.x, c.y, c.z,
      b.x, b.y, b.z,
      d.x, d.y, d.z,
      c.x, c.y, c.z,
    );
    uvs.push(
      uvA.x, uvA.y,
      uvB.x, uvB.y,
      uvC.x, uvC.y,
      uvB.x, uvB.y,
      uvD.x, uvD.y,
      uvC.x, uvC.y,
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
        (a.x - b.x) * (a.x - b.x)
        + (a.y - b.y) * (a.y - b.y)
        + (a.z - b.z) * (a.z - b.z),
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
      const leftOuterA = new THREE.Vector3(leftAx - this.wallThickness, a.y, a.z);
      const leftInnerB = new THREE.Vector3(leftBx, b.y, b.z);
      const leftOuterB = new THREE.Vector3(leftBx - this.wallThickness, b.y, b.z);
      const leftInnerATop = leftInnerA.clone().add(new THREE.Vector3(0, this.wallHeight, 0));
      const leftOuterATop = leftOuterA.clone().add(new THREE.Vector3(0, this.wallHeight, 0));
      const leftInnerBTop = leftInnerB.clone().add(new THREE.Vector3(0, this.wallHeight, 0));
      const leftOuterBTop = leftOuterB.clone().add(new THREE.Vector3(0, this.wallHeight, 0));

      this.addQuad(
        leftPos, leftUv,
        leftInnerA, leftInnerB, leftInnerATop, leftInnerBTop,
        new THREE.Vector2(0, distanceV), new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(1, distanceV), new THREE.Vector2(1, nextDistanceV),
      );
      this.addQuad(
        leftPos, leftUv,
        leftOuterB, leftOuterA, leftOuterBTop, leftOuterATop,
        new THREE.Vector2(0, nextDistanceV), new THREE.Vector2(0, distanceV),
        new THREE.Vector2(1, nextDistanceV), new THREE.Vector2(1, distanceV),
      );
      this.addQuad(
        leftPos, leftUv,
        leftInnerATop, leftInnerBTop, leftOuterATop, leftOuterBTop,
        new THREE.Vector2(0, distanceV), new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(1, distanceV), new THREE.Vector2(1, nextDistanceV),
      );

      const rightInnerA = new THREE.Vector3(rightAx, a.y, a.z);
      const rightOuterA = new THREE.Vector3(rightAx + this.wallThickness, a.y, a.z);
      const rightInnerB = new THREE.Vector3(rightBx, b.y, b.z);
      const rightOuterB = new THREE.Vector3(rightBx + this.wallThickness, b.y, b.z);
      const rightInnerATop = rightInnerA.clone().add(new THREE.Vector3(0, this.wallHeight, 0));
      const rightOuterATop = rightOuterA.clone().add(new THREE.Vector3(0, this.wallHeight, 0));
      const rightInnerBTop = rightInnerB.clone().add(new THREE.Vector3(0, this.wallHeight, 0));
      const rightOuterBTop = rightOuterB.clone().add(new THREE.Vector3(0, this.wallHeight, 0));

      this.addQuad(
        rightPos, rightUv,
        rightInnerB, rightInnerA, rightInnerBTop, rightInnerATop,
        new THREE.Vector2(0, nextDistanceV), new THREE.Vector2(0, distanceV),
        new THREE.Vector2(1, nextDistanceV), new THREE.Vector2(1, distanceV),
      );
      this.addQuad(
        rightPos, rightUv,
        rightOuterA, rightOuterB, rightOuterATop, rightOuterBTop,
        new THREE.Vector2(0, distanceV), new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(1, distanceV), new THREE.Vector2(1, nextDistanceV),
      );
      this.addQuad(
        rightPos, rightUv,
        rightOuterATop, rightOuterBTop, rightInnerATop, rightInnerBTop,
        new THREE.Vector2(0, distanceV), new THREE.Vector2(0, nextDistanceV),
        new THREE.Vector2(1, distanceV), new THREE.Vector2(1, nextDistanceV),
      );

      distanceV = nextDistanceV;
    }

    const floor = new THREE.BufferGeometry();
    floor.setAttribute("position", new THREE.Float32BufferAttribute(floorPos, 3));
    floor.setAttribute("uv", new THREE.Float32BufferAttribute(floorUv, 2));
    floor.computeVertexNormals();

    const leftWall = new THREE.BufferGeometry();
    leftWall.setAttribute("position", new THREE.Float32BufferAttribute(leftPos, 3));
    leftWall.setAttribute("uv", new THREE.Float32BufferAttribute(leftUv, 2));
    leftWall.computeVertexNormals();

    const rightWall = new THREE.BufferGeometry();
    rightWall.setAttribute("position", new THREE.Float32BufferAttribute(rightPos, 3));
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
      this.scene.add(floorMesh);

      const leftWallMesh = new THREE.Mesh(geo.leftWall, this.trackMaterial);
      leftWallMesh.castShadow = true;
      leftWallMesh.receiveShadow = true;
      this.scene.add(leftWallMesh);

      const rightWallMesh = new THREE.Mesh(geo.rightWall, this.trackMaterial);
      rightWallMesh.castShadow = true;
      rightWallMesh.receiveShadow = true;
      this.scene.add(rightWallMesh);
    }
    console.log("[AddPlatformRunMeshes]", "Built continuous platform and wall meshes");
  }

  private addSkyscrapers(): void {
    const skyscraperGroup = new THREE.Group();

    const skyscraperLayout = [
      { x: -86, z: -34, w: 18, d: 13, h: 134 },
      { x: 92, z: -48, w: 14, d: 16, h: 162 },
      { x: -112, z: -82, w: 20, d: 14, h: 116 },
      { x: 108, z: -96, w: 16, d: 12, h: 178 },
      { x: -96, z: -128, w: 13, d: 17, h: 154 },
      { x: 86, z: -144, w: 19, d: 13, h: 128 },
      { x: -102, z: -176, w: 16, d: 16, h: 186 },
      { x: 98, z: -194, w: 15, d: 14, h: 146 },
      { x: -124, z: -226, w: 18, d: 18, h: 102 },
      { x: 126, z: -244, w: 17, d: 17, h: 98 },
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
      const y = this.getTrackSurfaceY(z) + columnHeight * 0.5;
      const rowBurstPoints: THREE.Vector3[] = [];
      const leftColumn = new THREE.Mesh(new THREE.BoxGeometry(1.6, columnHeight, 1.6), cubeMaterial);
      leftColumn.position.set(-cubeOffsetX, y, z);
      this.scene.add(leftColumn);
      rowBurstPoints.push(new THREE.Vector3(-cubeOffsetX, y + columnHeight * 0.52, z));

      const rightColumn = new THREE.Mesh(new THREE.BoxGeometry(1.6, columnHeight, 1.6), cubeMaterial);
      rightColumn.position.set(cubeOffsetX, y, z);
      this.scene.add(rightColumn);
      rowBurstPoints.push(new THREE.Vector3(cubeOffsetX, y + columnHeight * 0.52, z));

      this.fireworkRows.push({
        activationZ: z,
        burstPoints: rowBurstPoints,
        triggered: false,
      });
    }

    console.log("[AddFinishTriggerCubes]", "Added 3-row edge columns for confetti triggers");
  }

  private spawnFireworks(burstPoints: THREE.Vector3[]): void {
    const points = burstPoints.length > 0
      ? burstPoints
      : [new THREE.Vector3(-4.4, this.getTrackSurfaceY(this.fireworkTriggerZ) + 2.2, this.fireworkTriggerZ)];
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

      const segmentRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-slice.tilt, 0, 0));
      const floorBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(slice.centerX, slice.centerY, slice.centerZ)
        .setRotation({
          x: segmentRotation.x,
          y: segmentRotation.y,
          z: segmentRotation.z,
          w: segmentRotation.w,
        });
      const floorBody = this.world.createRigidBody(floorBodyDesc);
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
      const leftWallCollider = RAPIER.ColliderDesc.cuboid(wallHalfX, wallHalfY, wallHalfZ).setFriction(0.7).setRestitution(0);
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
      const rightWallCollider = RAPIER.ColliderDesc.cuboid(wallHalfX, wallHalfY, wallHalfZ).setFriction(0.7).setRestitution(0);
      this.world.createCollider(rightWallCollider, rightWallBody);
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
        if (count > 0 && Math.abs(last.zEnd - current.zStart) > this.trackStep * 1.5) {
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
    for (const row of this.fireworkRows) {
      row.triggered = false;
    }
    for (const item of this.particles) {
      this.scene.remove(item.mesh);
    }
    this.particles = [];
    for (const item of this.trailParticles) {
      this.scene.remove(item.mesh);
    }
    this.trailParticles = [];
    this.trailSpawnSeconds = 0;
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

    const startX = this.sampleTrackX(this.startZ);
    const startY = this.getTrackSurfaceY(this.startZ) + this.marbleRadius + 0.8;
    this.marbleBody.setTranslation({ x: startX, y: startY, z: this.startZ }, true);
    this.marbleBody.setLinvel({ x: 0, y: 0, z: -this.startFlickSpeed }, true);
    this.marbleBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.marbleBody.wakeUp();

    this.marbleMesh.position.set(startX, startY, this.startZ);
    this.marbleMesh.quaternion.identity();

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
    return this.trackSamples[this.trackSamples.length - 1]?.y ?? this.trackCenterY;
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
    this.updateTrail(delta);
    this.updateParticles(delta);
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
        this.marbleBody.applyImpulse({ x: inputAxis * this.nudgeImpulse * this.speedMultiplier, y: 0, z: 0 }, true);
      }
      const positionBeforeStep = this.marbleBody.translation();
      const surfaceYBeforeStep = this.getTrackSurfaceY(positionBeforeStep.z);
      const groundClearanceBefore = positionBeforeStep.y - (surfaceYBeforeStep + this.marbleRadius);
      const nearGroundBeforeStep = groundClearanceBefore <= 0.85;
      const localTilt = this.getTrackTiltAtZ(positionBeforeStep.z);
      const slopeFactor = Math.max(0, Math.tan(localTilt));
      const momentumBoost = (this.downhillImpulse + slopeFactor * 0.52) * this.speedMultiplier;
      if (nearGroundBeforeStep) {
        this.marbleBody.applyImpulse({ x: 0, y: 0, z: -momentumBoost }, true);
      }

      this.world.step();

      const position = this.marbleBody.translation();
      const velocity = this.marbleBody.linvel();
      const surfaceYAfterStep = this.getTrackSurfaceY(position.z);
      const groundClearanceAfter = position.y - (surfaceYAfterStep + this.marbleRadius);
      const nearGroundAfterStep = groundClearanceAfter <= 0.82;
      if (nearGroundAfterStep) {
        const targetForwardSpeed = this.getTrackTiltAtZ(position.z) > 0.08 ? -34 : -26;
        if (velocity.z > targetForwardSpeed) {
          const catchUpImpulse = (velocity.z - targetForwardSpeed) * 0.06;
          this.marbleBody.applyImpulse({ x: 0, y: 0, z: -catchUpImpulse }, true);
        }
      }

      const rotation = this.marbleBody.rotation();
      this.marbleMesh.position.set(position.x, position.y, position.z);
      this.marbleMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

      for (const row of this.fireworkRows) {
        if (!row.triggered && position.z <= row.activationZ) {
          this.spawnFireworks(row.burstPoints);
          row.triggered = true;
          break;
        }
      }

      if (position.z <= this.finishZ) {
        this.endRun(true);
      } else if (position.y < this.loseY || this.runTimeSeconds >= this.maxRunSeconds) {
        this.endRun(false);
      }
    }
  }

  private updateCamera(delta: number): void {
    const targetPosition = this.marbleMesh.position;

    const panX = targetPosition.x * 0.5;
    const desired = new THREE.Vector3(panX, targetPosition.y + 40, targetPosition.z + 54);
    const lerpFactor = Math.min(1, delta * 4.5);
    this.camera.position.lerp(desired, lerpFactor);

    const look = new THREE.Vector3(panX, targetPosition.y + 1.2, targetPosition.z - 34);
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
