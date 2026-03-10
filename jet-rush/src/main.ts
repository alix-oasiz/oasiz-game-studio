import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { C, type GameState, type HapticType, type BlockRow, type Particle, type Collectible } from "./config";
import { oasiz } from "@oasiz/sdk";
import { AudioManager } from "./audio";
import { createJet, updateJetFX, loadShipFBX, type JetModel } from "./jet";
import { Shop } from "./shop";
import { buildGround, recycleGround, spawnRow, destroyRow, updateBlockAnimations, OUTLINE_BASE_COLORS } from "./world";
import { spawnExplosion, tickExplosion, releaseAllParticles, setTrailColor, spawnSpeedLines } from "./particles";
import { spawnCollectible, tickCollectibles, destroyCollectible } from "./collectibles";
import { getCorridorCenter } from "./world";
import { initInput, resetInput, type InputState } from "./input";
import { cacheUI, loadSettings, applySettingsUI, bindSettingsUI, showPlaying, showGameOver, showStartScreen, updateStartOrbTotal, type UIElements } from "./ui";

class JetRush {
  /* Three.js core */
  private scene: THREE.Scene;
  private cam: THREE.PerspectiveCamera;
  private ren: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private fxaaPass: ShaderPass;

  /* Objects */
  private jet: JetModel;
  private groundTiles: THREE.Group[];
  private rows: BlockRow[] = [];
  private explParts: Particle[] = [];
  private trailMesh: THREE.Mesh | null = null;
  private readonly PLAY_TRAIL_MAX = 30;
  private trailRing: THREE.Vector3[] = [];
  private trailHead = 0;
  private trailCount = 0;
  private trailGeo: THREE.BufferGeometry | null = null;
  private trailMat: THREE.MeshBasicMaterial | null = null;
  private trailIdxFilled = 0;
  private trailColor = new THREE.Color(0x00aaff);
  private collectibles: Collectible[] = [];
  private nextCollectZ = 0;
  private readonly _rng = (): number => Math.random();

  /* State */
  private state: GameState = "START";
  private score = 0;
  private planeZ = 0;
  private planeX = 0;
  private targetX = 0;
  private tilt = 0;
  private speed: number = C.SPEED_INIT;
  private elapsed = 0;
  private lastT = 0;
  private nextRowZ = 0;
  private shake = 0;
  private trailTimer = 0;
  private runSeed = 42;
  private mobile: boolean;
  private orbsCollected = 0;
  private totalOrbs = 0;
  private lastMilestone = 0;
  private lastDisplayedScore = -1;

  /* Invincibility */
  private invincible = false;
  private invincibleTimer = 0;
  private shieldMesh: THREE.Mesh | null = null;
  private stealthEnergy = 0;

  /* Collect Sparkles */
  private sparkles: THREE.Mesh[] = [];
  private sparkleActive: boolean[] = [];
  private sparkleTimers: number[] = [];

  /* Debounce */
  private lastGameStateChange = 0;

  /* Systems */
  private input: InputState;
  private settings = loadSettings();
  private sfx = new AudioManager();
  private ui: UIElements;
  private shop: Shop;

  constructor() {
    console.log("[JetRush]", "Init");
    this.mobile = window.matchMedia("(pointer: coarse)").matches;

    /* Scene — tighter fog on mobile to hide reduced draw distance */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020a18);
    this.scene.fog = this.mobile
      ? new THREE.Fog(0x020a18, 60, 200)
      : new THREE.Fog(0x020a18, 80, 320);

    this.cam = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.5,
      this.mobile ? 250 : 500,
    );
    this.cam.position.set(0, C.CAM_UP, C.CAM_BACK);

    this.ren = new THREE.WebGLRenderer({
      antialias: !this.mobile,
      powerPreference: "high-performance",
    });
    this.ren.setPixelRatio(this.mobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2));
    this.ren.setSize(window.innerWidth, window.innerHeight);
    this.ren.toneMapping = THREE.ACESFilmicToneMapping;
    this.ren.toneMappingExposure = 1.0;
    document.getElementById("gameContainer")!.appendChild(this.ren.domElement);

    /* Post-processing: Bloom (half-res on mobile to save GPU) */
    this.composer = new EffectComposer(this.ren);
    this.composer.addPass(new RenderPass(this.scene, this.cam));

    const bloomRes = this.mobile
      ? new THREE.Vector2(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2))
      : new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.bloomPass = new UnrealBloomPass(
      bloomRes,
      C.BLOOM_STRENGTH,
      C.BLOOM_RADIUS,
      C.BLOOM_THRESHOLD,
    );
    this.composer.addPass(this.bloomPass);
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.uniforms["resolution"].value.set(
      1 / (window.innerWidth * this.ren.getPixelRatio()),
      1 / (window.innerHeight * this.ren.getPixelRatio()),
    );
    if (!this.mobile) {
      this.composer.addPass(this.fxaaPass);
    }
    this.composer.addPass(new OutputPass());

    this.initLights();

    /* Shop (needs to init before jet so we know which model to load) */
    this.shop = new Shop(
      () => this.totalOrbs,
      (n) => { this.totalOrbs = n; this.saveTotalOrbs(); updateStartOrbTotal(this.ui, this.totalOrbs); },
      (t) => this.hap(t),
      () => this.playFX("ui"),
      (modelPath) => loadShipFBX(this.jet.body, modelPath),
    );

    /* Build world */
    this.jet = createJet(this.scene, this.shop.getSelectedModelPath());
    this.initSparkles();
    this.groundTiles = buildGround(this.scene);
    this.spawnIdleBlocks();

    /* UI & Input */
    this.ui = cacheUI();
    this.totalOrbs = this.loadTotalOrbs();
    updateStartOrbTotal(this.ui, this.totalOrbs);

    this.input = initInput(
      () => this.state,
      () => this.startGame(),
      (t) => this.hap(t),
      () => false,
    );
    applySettingsUI(this.settings);
    bindSettingsUI(
      () => this.state,
      this.settings,
      this.sfx,
      (t) => this.hap(t),
      (k) => this.playFX(k),
      () => {
        this.state = "PAUSED";
        console.log("[JetRush]", "Game paused (settings open)");
      },
      () => {
        if (this.state === "PAUSED") {
          this.state = "PLAYING";
          console.log("[JetRush]", "Game resumed");
        }
      },
    );

    /* Pause button */
    this.ui.pauseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.state !== "PLAYING") return;
      this.hap("light");
      this.playFX("ui");
      this.state = "PAUSED";
      document.getElementById("pauseModal")?.classList.remove("hidden");
    });

    /* Pause modal: Resume */
    document.getElementById("resumeBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hap("light");
      this.playFX("ui");
      document.getElementById("pauseModal")?.classList.add("hidden");
      if (this.state === "PAUSED") this.state = "PLAYING";
    });

    /* Pause modal: Quit to Menu */
    this.ui.quitBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hap("light");
      this.playFX("ui");
      document.getElementById("pauseModal")?.classList.add("hidden");
      this.returnToStart();
    });

    /* Hyper Boost button */
    this.ui.stealthBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.state !== "PLAYING" || this.stealthEnergy <= 0) return;
      this.hap("success");
      this.playFX("stealth_on");
      this.playFX("stealth_loop_start");
      this.activateShield(this.stealthEnergy * 0.2);
      this.setStealthEnergy(0);
    });

    /* SDK lifecycle hooks */
    oasiz.onPause(() => {
      console.log("[JetRush]", "oasiz:pause — stopping loop");
      this.suspendLoop();
    });
    oasiz.onResume(() => {
      console.log("[JetRush]", "oasiz:resume — resuming loop");
      this.resumeLoop();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        console.log("[JetRush]", "Tab hidden — stopping loop");
        this.suspendLoop();
      } else {
        console.log("[JetRush]", "Tab visible — resuming loop");
        this.resumeLoop();
      }
    });

    /* Pre-allocate trail ring buffers */
    for (let i = 0; i < this.PLAY_TRAIL_MAX; i++) this.trailRing.push(new THREE.Vector3());
    for (let i = 0; i < this.IDLE_TRAIL_MAX_POINTS; i++) this.idleTrailRing.push(new THREE.Vector3());

    window.addEventListener("resize", () => this.resize());
    this.ren.setAnimationLoop((t) => this.loop(t));
  }

  private loopRunning = true;

  private suspendLoop(): void {
    if (!this.loopRunning) return;
    this.loopRunning = false;
    this.ren.setAnimationLoop(null);
    if (this.state === "PLAYING") this.state = "PAUSED";
    this.sfx.musicOff();
    this.sfx.stealthLoopStop();
  }

  private resumeLoop(): void {
    if (this.loopRunning) return;
    this.loopRunning = true;
    this.lastT = 0;
    this.ren.setAnimationLoop((t) => this.loop(t));
    if (this.state === "PAUSED") {
      this.state = "PLAYING";
    }
    if (this.settings.music && (this.state === "PLAYING" || this.state === "START")) {
      this.sfx.musicOn();
    }
  }

  private get rowAhead(): number {
    return this.mobile ? 120 : C.ROW_AHEAD;
  }

  /* ═══ Lights ═══ */

  private initLights(): void {
    this.scene.add(new THREE.AmbientLight(0x334466, 0.9));

    const sun = new THREE.DirectionalLight(0x6688bb, 1.4);
    sun.position.set(8, 25, -15);
    this.scene.add(sun);

    const back = new THREE.DirectionalLight(0xff4466, 0.25);
    back.position.set(-5, 10, 20);
    this.scene.add(back);

    this.scene.add(new THREE.HemisphereLight(0x223344, 0x0a0a14, 0.6));
  }

  /* ═══ Sparkles ═══ */

  private initSparkles(): void {
    const geo = new THREE.BoxGeometry(0.04, 1.2, 0.04);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < 6; i++) {
      const effectGroup = new THREE.Group();
      for (let j = 0; j < 6; j++) {
        const beam = new THREE.Mesh(geo, mat);
        effectGroup.add(beam);
      }
      effectGroup.visible = false;
      this.jet.group.add(effectGroup);
      this.sparkles.push(effectGroup as unknown as THREE.Mesh);
      this.sparkleActive.push(false);
      this.sparkleTimers.push(0);
    }
  }

  private triggerSparkle(): void {
    let idx = -1;
    for (let i = 0; i < this.sparkles.length; i++) {
      if (!this.sparkleActive[i]) { idx = i; break; }
    }
    if (idx === -1) idx = 0;

    this.sparkleActive[idx] = true;
    this.sparkleTimers[idx] = 0.5;

    const s = this.sparkles[idx];
    s.visible = true;
    s.position.set(0, -1.0, 0);
    s.rotation.set(0, 0, 0);
    s.scale.set(1, 0.1, 1);

    s.children.forEach(child => {
      const beam = child as THREE.Mesh;
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.6 + Math.random() * 0.8;
      const yOffset = (Math.random() - 0.5) * 0.8;
      beam.position.set(Math.cos(angle) * radius, yOffset, Math.sin(angle) * radius);
      beam.scale.set(1, 0.5 + Math.random() * 1.0, 1);
    });
  }

  private tickSparkles(dt: number): void {
    for (let i = 0; i < this.sparkles.length; i++) {
      if (!this.sparkleActive[i]) continue;

      this.sparkleTimers[i] -= dt;
      const s = this.sparkles[i];

      if (this.sparkleTimers[i] <= 0) {
        this.sparkleActive[i] = false;
        s.visible = false;
        continue;
      }

      const life = this.sparkleTimers[i] / 0.5;
      const progress = 1.0 - life;

      s.position.y = -1.0 + progress * 2.5;
      const scaleY = Math.sin(progress * Math.PI) * 1.5;
      s.scale.set(1, Math.max(0.01, scaleY), 1);

      s.children.forEach(child => {
        (child as THREE.Mesh).material.opacity = Math.sin(progress * Math.PI) * 0.7;
      });
    }
  }

  /* ═══ Resize ═══ */

  private getViewportSize(): { w: number; h: number } {
    return { w: window.innerWidth, h: window.innerHeight };
  }

  private resize(): void {
    const { w, h } = this.getViewportSize();
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.ren.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(
      this.mobile ? Math.floor(w / 2) : w,
      this.mobile ? Math.floor(h / 2) : h,
    );
    const pixelRatio = this.ren.getPixelRatio();
    this.fxaaPass.uniforms["resolution"].value.set(
      1 / (w * pixelRatio),
      1 / (h * pixelRatio),
    );
    this.mobile = window.matchMedia("(pointer: coarse)").matches;
  }

  /* ═══ Idle Blocks (start screen atmosphere) ═══ */

  private spawnIdleBlocks(): void {
    this.idleNextRowZ = 30;
    for (let z = 30; z > -200; z -= C.ROW_SPACING) {
      this.rows.push(spawnRow(this.scene, z, 42, false, 0, true, this.mobile));
    }
    this.idleNextRowZ = -200;
  }

  /* ═══ Start ═══ */

  private startGame(): void {
    if (this.shop.isOpen()) return;
    if (Date.now() - this.lastGameStateChange < 500) return;
    this.lastGameStateChange = Date.now();
    console.log("[startGame]", "New run");
    this.state = "PLAYING";
    this.score = 0;
    this.lastMilestone = 0;
    this.planeZ = 0;
    this.planeX = 0;
    this.targetX = 0;
    this.tilt = 0;
    this.speed = C.SPEED_INIT;
    this.elapsed = 0;
    this.lastT = 0;
    this.shake = 0;
    this.trailTimer = 0;
    this.runSeed = Math.floor(Math.random() * 100000);
    this.nextRowZ = -40;
    this.idleZ = 0;

    resetInput(this.input);
    this.cleanupIdleTrail();
    this.clearAll();
    this.setStealthEnergy(0);

    this.jet.group.visible = true;
    this.jet.group.position.set(0, C.PLANE_Y, 0);
    this.jet.body.rotation.set(0, 0, 0);

    this.orbsCollected = 0;
    this.nextCollectZ = -30;

    /* Pre-spawn only the immediate safe zone; the rest fills in via tick() */
    this.nextRowZ = 15;
    const safeLimit = -60;
    while (this.nextRowZ > safeLimit) {
      this.rows.push(
        spawnRow(this.scene, this.nextRowZ, this.runSeed, true, this.score, false, this.mobile, this.planeX),
      );
      this.nextRowZ -= C.ROW_SPACING;
    }

    this.activateShield();

    showPlaying(this.ui);
    if (this.settings.music) this.sfx.musicOn();
    this.hap("light");
    this.playFX("ui");
  }

  private clearAll(): void {
    for (const row of this.rows) destroyRow(this.scene, row);
    this.rows = [];
    this.cleanupPlayTrail();
    this.deactivateShield();
    releaseAllParticles(this.scene, this.explParts);
    this.explParts = [];
    for (const c of this.collectibles) destroyCollectible(this.scene, c);
    this.collectibles = [];
  }

  /* ═══ Game Over ═══ */

  private die(): void {
    console.log("[die]", "Score:", this.score, "Orbs:", this.orbsCollected);
    this.state = "GAME_OVER";

    this.totalOrbs += this.orbsCollected;
    this.saveTotalOrbs();
    oasiz.flushGameState();

    showGameOver(this.ui, this.score, this.orbsCollected);
    spawnExplosion(
      this.scene,
      this.jet.group.position.x,
      this.jet.group.position.y,
      this.jet.group.position.z,
      this.explParts,
    );
    this.jet.group.visible = false;

    this.submitScore();
    this.playFX("crash");
    this.hap("error");
    this.sfx.musicOff();
  }

  /* ═══ Loop ═══ */

  private loop(t: number): void {
    if (this.lastT === 0) {
      this.lastT = t;
      return;
    }
    const dt = Math.min((t - this.lastT) / 1000, 0.05);
    this.lastT = t;
    this.elapsed += dt;

    updateBlockAnimations(this.rows, this.elapsed, this.cam.position.z);

    if (this.state === "PLAYING") this.tick(dt);
    else if (this.state === "START") this.idle(dt);

    this.explParts = tickExplosion(this.scene, this.explParts, dt);

    this.updateCamera(dt);

    if (this.state === "PLAYING" || this.state === "PAUSED") {
      this.composer.render();
    } else {
      this.ren.render(this.scene, this.cam);
    }
  }

  /* ═══ Camera ═══ */

  private updateCamera(dt: number): void {
    if (this.state === "START") return;

    if (this.state === "PLAYING" || this.state === "PAUSED" || this.state === "GAME_OVER") {
      const px = this.jet.group.position.x;
      const pz = this.jet.group.position.z;

      const tx = px;
      const tz = pz + C.CAM_BACK;

      this.cam.position.x += (tx - this.cam.position.x) * C.CAM_SMOOTH * dt;
      this.cam.position.y +=
        (C.CAM_UP - this.cam.position.y) * C.CAM_SMOOTH * dt;
      this.cam.position.z += (tz - this.cam.position.z) * C.CAM_SMOOTH * dt;

      if (this.shake > 0) {
        this.shake *= 0.87;
        if (this.shake < 0.01) this.shake = 0;
        this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.7;
        this.cam.position.y += (Math.random() - 0.5) * this.shake * 0.4;
      }

      this.cam.lookAt(
        px,
        C.PLANE_Y - 0.5,
        pz - C.CAM_LOOK_AHEAD,
      );
    }
  }

  /* ═══ Idle (Start Screen) ═══ */

  private idleZ = 0;
  private idleNextRowZ = 0;
  private idleX = 0;
  private idleXTarget = 0;
  private idleWanderTimer = 0;
  private idleTrailTimer = 0;
  private idleTrailStrip: THREE.Mesh | null = null;
  private idleTrailRing: THREE.Vector3[] = [];
  private idleTrailHead = 0;
  private idleTrailCount = 0;
  private readonly IDLE_TRAIL_MAX_POINTS = 120;
  private idleTrailGeo: THREE.BufferGeometry | null = null;
  private idleTrailMat: THREE.MeshBasicMaterial | null = null;

  private idle(dt: number): void {
    this.jet.group.visible = true;

    const idleSpeed = 28;
    this.idleZ -= idleSpeed * dt;
    this.idleWanderTimer -= dt;
    if (this.idleWanderTimer <= 0) {
      this.idleWanderTimer = 1.2 + Math.random() * 1.6;
      this.idleXTarget = (Math.random() * 2 - 1) * 8.5;
    }
    const blend = 1 - Math.pow(0.001, dt);
    this.idleX += (this.idleXTarget - this.idleX) * blend;

    this.jet.group.position.x = this.idleX;
    this.jet.group.position.y = C.PLANE_Y;
    this.jet.group.position.z = this.idleZ;
    const idleBank = THREE.MathUtils.clamp((this.idleXTarget - this.idleX) * -0.09, -0.35, 0.35);
    this.jet.body.rotation.z += (idleBank - this.jet.body.rotation.z) * Math.min(1, dt * 5);
    this.jet.body.rotation.x = 0;

    updateJetFX(this.jet.body, this.elapsed);

    this.updateIdleTrail(dt);

    recycleGround(this.groundTiles, this.idleZ);

    let idleSpawned = 0;
    while (this.idleNextRowZ > this.idleZ - this.rowAhead && idleSpawned < 4) {
      this.rows.push(spawnRow(this.scene, this.idleNextRowZ, 42, false, 0, true, this.mobile));
      this.idleNextRowZ -= C.ROW_SPACING;
      idleSpawned++;
    }

    const behind = this.idleZ + C.ROW_BEHIND;
    let idleRwIdx = 0;
    for (let i = 0; i < this.rows.length; i++) {
      if (this.rows[i].z > behind) {
        destroyRow(this.scene, this.rows[i]);
      } else {
        this.rows[idleRwIdx++] = this.rows[i];
      }
    }
    this.rows.length = idleRwIdx;

    const camHeight = 55;
    const camLookAhead = 25;
    this.cam.position.set(0, camHeight, this.idleZ + 12);
    this.cam.lookAt(0, C.PLANE_Y, this.idleZ - camLookAhead);
  }

  private updateIdleTrail(dt: number): void {
    this.idleTrailTimer += dt;
    if (this.idleTrailTimer > 0.016) {
      this.idleTrailTimer = 0;
      const pos = this.jet.group.position;
      this.idleTrailRing[this.idleTrailHead].set(pos.x, pos.y, pos.z);
      this.idleTrailHead = (this.idleTrailHead + 1) % this.IDLE_TRAIL_MAX_POINTS;
      if (this.idleTrailCount < this.IDLE_TRAIL_MAX_POINTS) this.idleTrailCount++;
    }

    const count = this.idleTrailCount;
    if (count < 2) return;

    const idxCount = (count - 1) * 6;

    if (!this.idleTrailMat) {
      this.idleTrailMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    }

    if (!this.idleTrailGeo) {
      this.idleTrailGeo = new THREE.BufferGeometry();
      const maxVerts = this.IDLE_TRAIL_MAX_POINTS * 2;
      const maxIdx = (this.IDLE_TRAIL_MAX_POINTS - 1) * 6;
      this.idleTrailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3));
      this.idleTrailGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(maxVerts * 4), 4));
      this.idleTrailGeo.setIndex(new THREE.BufferAttribute(new Uint16Array(maxIdx), 1));
    }

    const posArr = (this.idleTrailGeo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const colArr = (this.idleTrailGeo.attributes.color as THREE.BufferAttribute).array as Float32Array;
    const idxArr = this.idleTrailGeo.index!.array as Uint16Array;

    const start = (this.idleTrailHead - count + this.IDLE_TRAIL_MAX_POINTS) % this.IDLE_TRAIL_MAX_POINTS;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const width = (0.3 + t * 1.8) * 0.3;
      const p = this.idleTrailRing[(start + i) % this.IDLE_TRAIL_MAX_POINTS];
      const vi = i * 2 * 3;
      posArr[vi] = p.x - width;     posArr[vi + 1] = p.y; posArr[vi + 2] = p.z;
      posArr[vi + 3] = p.x + width; posArr[vi + 4] = p.y; posArr[vi + 5] = p.z;

      const alpha = t * t;
      const g = 0.6 + t * 0.2;
      const ci = i * 2 * 4;
      colArr[ci] = 0;     colArr[ci + 1] = g; colArr[ci + 2] = 1; colArr[ci + 3] = alpha * 0.6;
      colArr[ci + 4] = 0; colArr[ci + 5] = g; colArr[ci + 6] = 1; colArr[ci + 7] = alpha * 0.6;

      if (i < count - 1) {
        const bi = i * 2;
        const ii = i * 6;
        idxArr[ii] = bi;     idxArr[ii + 1] = bi + 1; idxArr[ii + 2] = bi + 2;
        idxArr[ii + 3] = bi + 1; idxArr[ii + 4] = bi + 3; idxArr[ii + 5] = bi + 2;
      }
    }

    this.idleTrailGeo.setDrawRange(0, idxCount);
    (this.idleTrailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.idleTrailGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.idleTrailGeo.index!.needsUpdate = true;

    if (!this.idleTrailStrip) {
      this.idleTrailStrip = new THREE.Mesh(this.idleTrailGeo, this.idleTrailMat);
      this.idleTrailStrip.frustumCulled = false;
      this.scene.add(this.idleTrailStrip);
    }
  }

  private cleanupIdleTrail(): void {
    if (this.idleTrailStrip) {
      this.scene.remove(this.idleTrailStrip);
      this.idleTrailStrip = null;
    }
    if (this.idleTrailGeo) {
      this.idleTrailGeo.setDrawRange(0, 0);
    }
    this.idleTrailHead = 0;
    this.idleTrailCount = 0;
  }

  /* ═══ Gameplay Ribbon Trail ═══ */

  private updatePlayTrail(): void {
    const count = this.trailCount;
    if (count < 2) return;

    const idxCount = (count - 1) * 6;

    if (!this.trailMat) {
      this.trailMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    }

    if (!this.trailGeo) {
      this.trailGeo = new THREE.BufferGeometry();
      const maxVerts = this.PLAY_TRAIL_MAX * 2;
      const maxIdx = (this.PLAY_TRAIL_MAX - 1) * 6;
      this.trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3));
      this.trailGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(maxVerts * 4), 4));
      this.trailGeo.setIndex(new THREE.BufferAttribute(new Uint16Array(maxIdx), 1));
    }

    const posArr = (this.trailGeo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const colArr = (this.trailGeo.attributes.color as THREE.BufferAttribute).array as Float32Array;
    const idxArr = this.trailGeo.index!.array as Uint16Array;
    const trailYOffset = -0.5;

    const needIdxUpdate = count > this.trailIdxFilled;
    const start = (this.trailHead - count + this.PLAY_TRAIL_MAX) % this.PLAY_TRAIL_MAX;
    const tr = this.trailColor.r, tg = this.trailColor.g, tb = this.trailColor.b;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const width = t * 0.2;
      const p = this.trailRing[(start + i) % this.PLAY_TRAIL_MAX];
      const y = p.y + trailYOffset;
      const vi = i * 6;
      posArr[vi] = p.x - width;     posArr[vi + 1] = y; posArr[vi + 2] = p.z;
      posArr[vi + 3] = p.x + width; posArr[vi + 4] = y; posArr[vi + 5] = p.z;

      const alpha = t * t;
      const bright = 0.55 + t * 0.25;
      const r = tr * bright;
      const g = tg * bright;
      const b = tb * bright;
      const a = alpha * 0.55;
      const ci = i * 8;
      colArr[ci] = r;     colArr[ci + 1] = g; colArr[ci + 2] = b; colArr[ci + 3] = a;
      colArr[ci + 4] = r; colArr[ci + 5] = g; colArr[ci + 6] = b; colArr[ci + 7] = a;

      if (needIdxUpdate && i < count - 1) {
        const bi = i * 2;
        const ii = i * 6;
        idxArr[ii] = bi;     idxArr[ii + 1] = bi + 1; idxArr[ii + 2] = bi + 2;
        idxArr[ii + 3] = bi + 1; idxArr[ii + 4] = bi + 3; idxArr[ii + 5] = bi + 2;
      }
    }
    if (needIdxUpdate) this.trailIdxFilled = count;

    this.trailGeo.setDrawRange(0, idxCount);
    (this.trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.trailGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    if (needIdxUpdate) this.trailGeo.index!.needsUpdate = true;

    if (!this.trailMesh) {
      this.trailMesh = new THREE.Mesh(this.trailGeo, this.trailMat);
      this.trailMesh.frustumCulled = false;
      this.scene.add(this.trailMesh);
    }
  }

  private cleanupPlayTrail(): void {
    if (this.trailMesh) {
      this.scene.remove(this.trailMesh);
      this.trailMesh = null;
    }
    if (this.trailGeo) {
      this.trailGeo.setDrawRange(0, 0);
    }
    this.trailHead = 0;
    this.trailCount = 0;
    this.trailIdxFilled = 0;
  }

  /* ═══ Game Tick ═══ */

  private tick(dt: number): void {
    this.tickSparkles(dt);

    /* Speed ramp */
    this.speed = Math.min(
      C.SPEED_MAX,
      C.SPEED_INIT + (Math.abs(this.planeZ) * C.SPEED_RAMP) / 100,
    );
    if (this.invincible) {
      this.speed += 20;
    }

    const dz = this.speed * dt;
    this.planeZ -= dz;
    this.score = Math.floor(Math.abs(this.planeZ) / 3);

    /* Milestone check */
    const currentMilestone = Math.floor(this.score / 500) * 500;
    if (currentMilestone > 0 && currentMilestone > this.lastMilestone) {
      this.lastMilestone = currentMilestone;
      this.showMilestone(currentMilestone);
      this.playFX("milestone");
      this.hap("success");
    }

    /* Lateral movement from input */
    let mx = 0;
    if (this.input.left) mx -= 1;
    if (this.input.right) mx += 1;

    this.targetX += mx * C.LATERAL_SPEED * dt;

    /* Hide tutorial on first input */
    if (mx !== 0) {
      this.ui.tutorial.classList.add("hidden");
    }

    const lf = 1 - Math.pow(0.0005, dt);
    this.planeX += (this.targetX - this.planeX) * lf;

    this.jet.group.position.set(this.planeX, C.PLANE_Y, this.planeZ);

    /* Bank tilt */
    const tt = -mx * 0.65;
    this.tilt += (tt - this.tilt) * 6 * dt;
    this.jet.body.rotation.z = this.tilt;

    /* Engine FX */
    updateJetFX(this.jet.body, this.elapsed);

    /* Dynamic trail color based on score milestones (every 500 score = new biome) */
    const biomeTier = Math.min(
      OUTLINE_BASE_COLORS.length - 1,
      Math.floor(this.score / 500),
    );
    const outlineCol = OUTLINE_BASE_COLORS[biomeTier];
    setTrailColor(outlineCol);
    this.trailColor.copy(outlineCol);

    /* Trail */
    this.trailTimer += dt;
    if (this.trailTimer > 0.016) {
      this.trailTimer = 0;
      const pos = this.jet.group.position;
      this.trailRing[this.trailHead].set(pos.x, pos.y, pos.z);
      this.trailHead = (this.trailHead + 1) % this.PLAY_TRAIL_MAX;
      if (this.trailCount < this.PLAY_TRAIL_MAX) this.trailCount++;
    }
    this.updatePlayTrail();

    /* Recycle ground */
    recycleGround(this.groundTiles, this.planeZ, this.planeX);

    /* Spawn rows ahead (capped per frame to avoid stutter) */
    const MAX_ROWS_PER_FRAME = 6;
    let spawned = 0;
    while (this.nextRowZ > this.planeZ - this.rowAhead && spawned < MAX_ROWS_PER_FRAME) {
      this.rows.push(
        spawnRow(this.scene, this.nextRowZ, this.runSeed, false, this.score, false, this.mobile, this.planeX),
      );
      this.nextRowZ -= C.ROW_SPACING;
      spawned++;
    }

    /* Cleanup rows behind */
    const behind = this.planeZ + C.ROW_BEHIND;
    let rwIdx = 0;
    for (let i = 0; i < this.rows.length; i++) {
      if (this.rows[i].z > behind) {
        destroyRow(this.scene, this.rows[i]);
      } else {
        this.rows[rwIdx++] = this.rows[i];
      }
    }
    this.rows.length = rwIdx;

    /* Spawn collectibles ahead */
    while (this.nextCollectZ > this.planeZ - this.rowAhead) {
      if (this._rng() < C.COLLECT_SPAWN_CHANCE) {
        const cx = getCorridorCenter(this.nextCollectZ, this.runSeed);
        this.collectibles.push(
          spawnCollectible(this.scene, this.nextCollectZ, cx, this._rng),
        );
      }
      this.nextCollectZ -= C.COLLECT_SPAWN_INTERVAL;
    }

    /* Tick collectibles — attract & collect */
    const picked = tickCollectibles(
      this.collectibles,
      this.planeX,
      C.PLANE_Y,
      this.planeZ,
      dt,
      this.elapsed,
    );
    if (picked > 0) {
      for (let i = 0; i < picked; i++) this.triggerSparkle();
      this.orbsCollected += picked;
      this.score += picked * C.COLLECT_SCORE_BONUS;
      this.ui.orbDisplay.textContent = String(this.orbsCollected);
      this.hap("medium");
      this.playFX("collect");
      if (!this.invincible) {
        this.setStealthEnergy(this.stealthEnergy + picked);
        this.spawnPlusOneFX(picked);
      }
    }

    /* Remove collected & far-behind (only if not attracting) */
    const collectBehind = this.planeZ + C.ROW_BEHIND;
    let cIdx = 0;
    for (let i = 0; i < this.collectibles.length; i++) {
      const c = this.collectibles[i];
      if (c.collected) {
        destroyCollectible(this.scene, c);
      } else if (!c.attracting && c.worldZ > collectBehind) {
        destroyCollectible(this.scene, c);
      } else {
        this.collectibles[cIdx++] = c;
      }
    }
    this.collectibles.length = cIdx;

    /* Invincibility countdown & shield animation */
    if (this.invincible) {
      this.invincibleTimer -= dt;
      if (this.invincibleTimer <= 0) {
        this.deactivateShield();
      } else if (this.shieldMesh) {
        this.shieldMesh.rotation.y += dt * 0.5;
        this.shieldMesh.rotation.x += dt * 0.3;
        const mat = this.shieldMesh.material as THREE.MeshBasicMaterial;
        const pulse = 0.45 + Math.sin(this.elapsed * 4) * 0.15;
        if (this.invincibleTimer < 2) {
          const blink = Math.sin(this.elapsed * 14) > 0 ? 1.0 : 0.15;
          mat.opacity = pulse * blink;
        } else {
          mat.opacity = pulse;
        }
      }
    }

    /* Speed lines during hyper boost */
    if (this.invincible && this.state === "PLAYING") {
      spawnSpeedLines(this.scene, this.planeX, C.PLANE_Y, this.planeZ, this.explParts);
    }

    /* Collision detection */
    if (this.checkCollisions()) return;

    if (this.score !== this.lastDisplayedScore) {
      this.lastDisplayedScore = this.score;
      this.ui.scoreTxt.textContent = String(this.score);
    }
  }

  /* ═══ Collision ═══ */

  private checkCollisions(): boolean {
    if (this.invincible) return false;

    for (const row of this.rows) {
      if (Math.abs(row.z - this.planeZ) > 5) continue;

      for (const b of row.blocks) {
        const halfD = b.depth / 2;
        if (this.planeZ > b.worldZ + halfD + C.PLANE_HIT_R) continue;
        if (this.planeZ < b.worldZ - halfD - C.PLANE_HIT_R) continue;

        const halfW = b.width / 2;
        if (this.planeX > b.worldX + halfW + C.PLANE_HIT_HALF_W) continue;
        if (this.planeX < b.worldX - halfW - C.PLANE_HIT_HALF_W) continue;

        if (b.currentTop < C.PLANE_Y - C.PLANE_HIT_R) continue;

        this.shake = 1.5;
        this.die();
        return true;
      }
    }
    return false;
  }

  /* ═══ Invincibility Shield ═══ */

  private createShieldMesh(): THREE.Mesh {
    const geo = new THREE.IcosahedronGeometry(C.SHIELD_RADIUS, 2);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0, 1.8, 3.0),
      wireframe: true,
      transparent: true,
      opacity: 0.5,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "shield";
    return mesh;
  }

  private activateShield(duration: number = 5): void {
    this.invincible = true;
    this.invincibleTimer = duration;

    if (!this.shieldMesh) {
      this.shieldMesh = this.createShieldMesh();
    }
    this.shieldMesh.visible = true;
    this.shieldMesh.rotation.set(0, 0, 0);
    (this.shieldMesh.material as THREE.MeshBasicMaterial).opacity = 0.5;

    if (!this.jet.group.children.includes(this.shieldMesh)) {
      this.jet.group.add(this.shieldMesh);
    }
  }

  private deactivateShield(): void {
    if (this.invincible) {
      this.playFX("stealth_loop_stop");
    }
    this.invincible = false;
    this.invincibleTimer = 0;
    if (this.shieldMesh) {
      this.shieldMesh.visible = false;
    }
  }

  /* ═══ Stealth Energy ═══ */

  private setStealthEnergy(val: number): void {
    this.stealthEnergy = Math.max(0, Math.min(20, val));
    const pct = (this.stealthEnergy / 20) * 100;
    this.ui.stealthFill.style.width = `${pct}%`;
    this.ui.stealthBtn.classList.toggle("disabled", this.stealthEnergy <= 0);
    this.ui.stealthBtn.classList.toggle("stealth-full", this.stealthEnergy === 20);
  }

  private _cachedBtnRect: DOMRect | null = null;
  private _cachedBtnRectTime = 0;

  private spawnPlusOneFX(amount: number): void {
    const fx = document.createElement("div");
    fx.className = "plus-one-fx";
    fx.textContent = `+${amount}`;

    const now = this.elapsed;
    if (!this._cachedBtnRect || now - this._cachedBtnRectTime > 1) {
      this._cachedBtnRect = this.ui.stealthBtn.getBoundingClientRect();
      this._cachedBtnRectTime = now;
    }
    const rect = this._cachedBtnRect;
    const offset = (Math.random() - 0.5) * 40;
    fx.style.left = `${rect.left + rect.width / 2 + offset}px`;
    fx.style.top = `${rect.top - 20}px`;

    document.body.appendChild(fx);
    setTimeout(() => {
      if (document.body.contains(fx)) document.body.removeChild(fx);
    }, 1000);
  }

  /* ═══ Return to Start ═══ */

  private returnToStart(): void {
    if (Date.now() - this.lastGameStateChange < 500) return;
    this.lastGameStateChange = Date.now();
    console.log("[JetRush]", "Return to start");
    this.state = "START";
    this.totalOrbs += this.orbsCollected;
    this.orbsCollected = 0;
    this.saveTotalOrbs();
    oasiz.flushGameState();

    this.clearAll();
    this.sfx.musicOff();

    this.idleZ = 0;
    this.idleX = 0;

    this.spawnIdleBlocks();
    this.setStealthEnergy(0);

    showStartScreen(this.ui, this.totalOrbs);

    this.playFX("ui");
    this.hap("light");
  }

  /* ═══ Helpers ═══ */

  private hap(type: HapticType): void {
    if (this.settings.haptics) {
      oasiz.triggerHaptic(type);
    }
  }

  private playFX(kind: "ui" | "crash" | "collect" | "stealth_on" | "stealth_loop_start" | "stealth_loop_stop" | "milestone"): void {
    if (kind === "stealth_loop_stop") {
      this.sfx.stealthLoopStop();
      return;
    }
    if (!this.settings.fx) return;

    if (kind === "ui") this.sfx.ui();
    else if (kind === "crash") this.sfx.crash();
    else if (kind === "collect") this.sfx.collect();
    else if (kind === "stealth_on") this.sfx.stealthOn();
    else if (kind === "stealth_loop_start") this.sfx.stealthLoopStart();
    else if (kind === "milestone") this.sfx.milestone();
  }

  private submitScore(): void {
    const s = Math.max(0, this.score);
    console.log("[submitScore]", s);
    oasiz.submitScore(s);
  }

  private loadTotalOrbs(): number {
    const state = oasiz.loadGameState();
    return typeof state.orbs === "number" ? (state.orbs as number) : 0;
  }

  private saveTotalOrbs(): void {
    const state = oasiz.loadGameState();
    oasiz.saveGameState({ ...state, orbs: this.totalOrbs });
  }

  private showMilestone(distance: number): void {
    const biomeTier = Math.floor(distance / 500) % OUTLINE_BASE_COLORS.length;
    const col = OUTLINE_BASE_COLORS[biomeTier];
    const hex = "#" + col.getHexString();

    const banner = document.createElement("div");
    banner.className = "milestone-banner";

    const num = document.createElement("div");
    num.className = "milestone-distance";
    num.style.color = hex;
    num.style.textShadow = `0 0 30px ${hex}, 0 0 60px ${hex}40`;
    num.textContent = String(distance);

    const label = document.createElement("div");
    label.className = "milestone-label";
    label.style.color = hex;
    label.textContent = "meters";

    banner.appendChild(num);
    banner.appendChild(label);
    document.body.appendChild(banner);

    setTimeout(() => banner.remove(), 2000);
  }

}

document.addEventListener("DOMContentLoaded", () => {
  new JetRush();
});
