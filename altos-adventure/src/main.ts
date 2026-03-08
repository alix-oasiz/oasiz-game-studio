type GameState = "START" | "PLAYING" | "GAME_OVER";
type HapticType = "light" | "medium" | "heavy" | "success" | "error";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface TerrainPoint {
  x: number;
  y: number;
}

interface Gap {
  start: number;
  end: number;
}

interface Rock {
  x: number;
  radius: number;
  variation: number;
  spin: number;
}

interface Coin {
  x: number;
  y: number;
  radius: number;
  bobPhase: number;
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface PopupText {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  text: string;
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

interface PlayerState {
  y: number;
  vy: number;
  grounded: boolean;
  rotation: number;
  angularVelocity: number;
  rotationTravel: number;
}

declare global {
  interface Window {
    submitScore?: (score: number) => void;
    triggerHaptic?: (type: HapticType) => void;
  }
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error("Missing required element: " + id);
  }
  return element as T;
}

const canvas = getElement<HTMLCanvasElement>("game-canvas");
const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Canvas context unavailable");
}

const startScreen = getElement<HTMLDivElement>("start-screen");
const gameOverScreen = getElement<HTMLDivElement>("game-over-screen");
const settingsModal = getElement<HTMLDivElement>("settings-modal");

const startButton = getElement<HTMLButtonElement>("start-btn");
const restartButton = getElement<HTMLButtonElement>("restart-btn");
const menuButton = getElement<HTMLButtonElement>("menu-btn");
const settingsButton = getElement<HTMLButtonElement>("settings-btn");
const settingsCloseButton = getElement<HTMLButtonElement>("settings-close");

const hud = getElement<HTMLDivElement>("hud");
const scoreValue = getElement<HTMLSpanElement>("score-value");
const distanceValue = getElement<HTMLSpanElement>("distance-value");
const comboValue = getElement<HTMLSpanElement>("combo-value");
const finalScore = getElement<HTMLParagraphElement>("final-score");

const musicToggle = getElement<HTMLButtonElement>("music-toggle");
const fxToggle = getElement<HTMLButtonElement>("fx-toggle");
const hapticsToggle = getElement<HTMLButtonElement>("haptics-toggle");

const isMobile = window.matchMedia("(pointer: coarse)").matches;

const SETTINGS_STORAGE_KEY = "altosAdventureSettings";

const layout = {
  playerScreenX: 0,
  playerRadius: 0,
  gravity: 0,
  jumpImpulse: 0,
  spinSpeed: 0,
  terrainStep: 0,
  terrainMinY: 0,
  terrainMaxY: 0,
};

let w = 0;
let h = 0;
let worldAnchorY = 0;

let gameState: GameState = "START";
let inputHeld = false;
let cameraX = 0;
let previewCameraX = 0;
let speed = 0;
let distanceMeters = 0;
let trickPoints = 0;
let coinPoints = 0;
let score = 0;
let comboMultiplier = 1;
let comboTimer = 0;
let timeSeconds = 0;
let finalRunScore = 0;

let terrainVelocity = 0;
let nextGapX = 0;
let nextRockX = 0;
let nextCoinX = 0;

let terrainPoints: TerrainPoint[] = [];
let gaps: Gap[] = [];
let rocks: Rock[] = [];
let coins: Coin[] = [];
let particles: Particle[] = [];
let popups: PopupText[] = [];

let clouds: Cloud[] = [];
let stars: Star[] = [];

let player: PlayerState = {
  y: 0,
  vy: 0,
  grounded: true,
  rotation: 0,
  angularVelocity: 0,
  rotationTravel: 0,
};

let settings: Settings = loadSettings();

let audioContext: AudioContext | null = null;
let musicBus: GainNode | null = null;
let fxBus: GainNode | null = null;
let ambientOscA: OscillatorNode | null = null;
let ambientOscB: OscillatorNode | null = null;
let ambientFilter: BiquadFilterNode | null = null;
let musicStepTimer = 0;
let musicStepIndex = 0;
const musicPattern = [220, 247, 196, 174, 220, 262];

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function normalizeAngle(angle: number): number {
  let result = angle % (Math.PI * 2);
  if (result > Math.PI) result -= Math.PI * 2;
  if (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
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

function saveSettings(): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function updateToggleState(): void {
  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticsToggle.classList.toggle("active", settings.haptics);
}

function triggerHaptic(type: HapticType): void {
  if (!settings.haptics) return;
  if (typeof window.triggerHaptic === "function") {
    window.triggerHaptic(type);
  }
}

function ensureAudio(): void {
  if (!audioContext) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) {
      console.log("[Audio]", "WebAudio not available");
      return;
    }

    audioContext = new Ctor();
    musicBus = audioContext.createGain();
    fxBus = audioContext.createGain();
    musicBus.gain.value = 0;
    fxBus.gain.value = settings.fx ? 0.24 : 0;
    musicBus.connect(audioContext.destination);
    fxBus.connect(audioContext.destination);

    ambientFilter = audioContext.createBiquadFilter();
    ambientFilter.type = "lowpass";
    ambientFilter.frequency.value = 900;

    ambientOscA = audioContext.createOscillator();
    ambientOscA.type = "sine";
    ambientOscA.frequency.value = 74;

    ambientOscB = audioContext.createOscillator();
    ambientOscB.type = "triangle";
    ambientOscB.frequency.value = 111;

    const oscAGain = audioContext.createGain();
    oscAGain.gain.value = 0.18;
    const oscBGain = audioContext.createGain();
    oscBGain.gain.value = 0.12;

    ambientOscA.connect(oscAGain);
    ambientOscB.connect(oscBGain);
    oscAGain.connect(ambientFilter);
    oscBGain.connect(ambientFilter);
    ambientFilter.connect(musicBus);

    ambientOscA.start();
    ambientOscB.start();

    console.log("[Audio]", "Audio graph initialized");
  }

  if (audioContext && audioContext.state === "suspended") {
    void audioContext.resume();
  }
}

function setMusicMixTarget(active: boolean): void {
  if (!audioContext || !musicBus) return;
  const now = audioContext.currentTime;
  const target = active ? 0.16 : 0;
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.linearRampToValueAtTime(target, now + 0.25);
}

function setFxMixTarget(active: boolean): void {
  if (!audioContext || !fxBus) return;
  const now = audioContext.currentTime;
  const target = active ? 0.24 : 0;
  fxBus.gain.cancelScheduledValues(now);
  fxBus.gain.linearRampToValueAtTime(target, now + 0.12);
}

function updateAudioMix(): void {
  ensureAudio();
  const shouldPlayMusic = settings.music && (gameState === "PLAYING" || gameState === "START");
  setMusicMixTarget(shouldPlayMusic);
  setFxMixTarget(settings.fx);
}

function playFxTone(
  frequency: number,
  duration: number,
  wave: OscillatorType,
  volume: number,
  frequencyEnd: number,
): void {
  if (!settings.fx) return;
  ensureAudio();
  if (!audioContext || !fxBus) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = wave;
  oscillator.frequency.value = frequency;
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(40, frequencyEnd),
    audioContext.currentTime + duration,
  );

  gain.gain.value = 0.0001;
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.001, volume),
    audioContext.currentTime + 0.02,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);

  oscillator.connect(gain);
  gain.connect(fxBus);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration + 0.02);
}

function playJumpFx(): void {
  playFxTone(420, 0.12, "triangle", 0.09, 240);
}

function playCoinFx(): void {
  playFxTone(980, 0.08, "sine", 0.07, 1320);
}

function playLandingFx(powerful: boolean): void {
  if (powerful) {
    playFxTone(160, 0.18, "square", 0.12, 90);
    return;
  }
  playFxTone(190, 0.1, "triangle", 0.08, 120);
}

function playCrashFx(): void {
  playFxTone(260, 0.16, "sawtooth", 0.14, 60);
}

function playUiFx(): void {
  playFxTone(540, 0.07, "sine", 0.05, 660);
}

function playMusicPulse(): void {
  if (!audioContext || !musicBus || !settings.music) return;

  const note = musicPattern[musicStepIndex % musicPattern.length];
  musicStepIndex += 1;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = note;

  gain.gain.value = 0.0001;
  gain.gain.exponentialRampToValueAtTime(0.04, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.36);

  oscillator.connect(gain);
  gain.connect(musicBus);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.4);
}

function recalculateLayout(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  w = canvas.width;
  h = canvas.height;

  layout.playerScreenX = isMobile ? w * 0.34 : w * 0.28;
  layout.playerRadius = clamp(h * (isMobile ? 0.022 : 0.019), 13, 20);
  layout.gravity = isMobile ? 1680 : 1760;
  layout.jumpImpulse = isMobile ? 720 : 760;
  layout.spinSpeed = isMobile ? 9.3 : 8.7;
  layout.terrainStep = isMobile ? 22 : 26;
  layout.terrainMinY = h * 0.42;
  layout.terrainMaxY = h * 0.84;
  worldAnchorY = h * 0.68;
}

function resetSkyElements(): void {
  stars = [];
  clouds = [];

  const starCount = isMobile ? 42 : 64;
  for (let i = 0; i < starCount; i += 1) {
    stars.push({
      x: Math.random(),
      y: Math.random() * 0.6,
      size: randomRange(0.8, 2.4),
      twinkleSpeed: randomRange(1.2, 3.8),
      twinklePhase: randomRange(0, Math.PI * 2),
    });
  }

  const cloudCount = isMobile ? 8 : 12;
  for (let i = 0; i < cloudCount; i += 1) {
    clouds.push({
      x: randomRange(-w, w * 4),
      y: randomRange(h * 0.1, h * 0.4),
      width: randomRange(140, 280),
      height: randomRange(36, 72),
      alpha: randomRange(0.12, 0.26),
    });
  }
}

function initializeTerrain(): void {
  terrainPoints = [];
  gaps = [];
  rocks = [];
  coins = [];
  terrainVelocity = 0;

  const startY = worldAnchorY;
  terrainPoints.push({ x: -500, y: startY });
  terrainPoints.push({ x: -200, y: startY });
  terrainPoints.push({ x: 0, y: startY });

  nextGapX = 760;
  nextRockX = 420;
  nextCoinX = 310;

  extendTerrainTo(w * 3);
}

function shouldSpawnGap(centerX: number): boolean {
  for (let i = 0; i < gaps.length; i += 1) {
    const gap = gaps[i];
    if (Math.abs((gap.start + gap.end) * 0.5 - centerX) < 320) {
      return false;
    }
  }
  return true;
}

function isGapAt(worldX: number): boolean {
  for (let i = 0; i < gaps.length; i += 1) {
    const gap = gaps[i];
    if (worldX >= gap.start && worldX <= gap.end) {
      return true;
    }
  }
  return false;
}

function terrainHeightAt(worldX: number): number | null {
  if (terrainPoints.length < 2) return null;
  if (isGapAt(worldX)) return null;

  let low = 0;
  let high = terrainPoints.length - 2;

  while (low <= high) {
    const mid = Math.floor((low + high) * 0.5);
    const a = terrainPoints[mid];
    const b = terrainPoints[mid + 1];

    if (worldX < a.x) {
      high = mid - 1;
    } else if (worldX > b.x) {
      low = mid + 1;
    } else {
      const span = b.x - a.x;
      if (span <= 0) return a.y;
      const t = (worldX - a.x) / span;
      return lerp(a.y, b.y, t);
    }
  }

  if (worldX < terrainPoints[0].x) {
    return terrainPoints[0].y;
  }
  return terrainPoints[terrainPoints.length - 1].y;
}

function terrainSlopeAt(worldX: number): number {
  const left = terrainHeightAt(worldX - 8);
  const right = terrainHeightAt(worldX + 8);
  if (left === null || right === null) return 0;
  return (right - left) / 16;
}

function spawnCoinRibbon(startX: number): void {
  const coinCount = 4;
  const spacing = isMobile ? 44 : 52;
  for (let i = 0; i < coinCount; i += 1) {
    const x = startX + i * spacing;
    const terrainY = terrainHeightAt(x);
    if (terrainY === null) continue;
    const arc = Math.sin((i / (coinCount - 1)) * Math.PI) * (isMobile ? 54 : 66);
    coins.push({
      x,
      y: terrainY - 70 - arc,
      radius: 10,
      bobPhase: randomRange(0, Math.PI * 2),
      collected: false,
    });
  }
}

function extendTerrainTo(targetX: number): void {
  while (terrainPoints[terrainPoints.length - 1].x < targetX) {
    const previous = terrainPoints[terrainPoints.length - 1];
    const x = previous.x + layout.terrainStep;
    const towardCenter = (worldAnchorY - previous.y) * 0.02;
    const rollingWave = Math.sin(x * 0.006) * 1.8;
    terrainVelocity = clamp(
      terrainVelocity + randomRange(-0.75, 0.75) + towardCenter,
      -7.4,
      7.4,
    );
    const y = clamp(previous.y + terrainVelocity + rollingWave, layout.terrainMinY, layout.terrainMaxY);
    terrainPoints.push({ x, y });

    if (x > nextGapX && shouldSpawnGap(x) && x > 800) {
      const width = randomRange(isMobile ? 130 : 160, isMobile ? 230 : 290);
      gaps.push({
        start: x - width * 0.5,
        end: x + width * 0.5,
      });
      nextGapX = x + randomRange(isMobile ? 500 : 620, isMobile ? 880 : 1040);
    }

    if (x > nextRockX) {
      const rockX = x + randomRange(80, 220);
      if (!isGapAt(rockX)) {
        rocks.push({
          x: rockX,
          radius: randomRange(18, 32),
          variation: Math.random(),
          spin: randomRange(-0.4, 0.4),
        });
      }
      nextRockX = x + randomRange(260, 420);
    }

    if (x > nextCoinX) {
      spawnCoinRibbon(x + randomRange(100, 200));
      nextCoinX = x + randomRange(260, 420);
    }
  }
}

function spawnSnowBurst(x: number, y: number, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const direction = randomRange(-Math.PI * 0.9, -Math.PI * 0.1);
    const force = randomRange(40, 210);
    const life = randomRange(0.22, 0.46);
    particles.push({
      x,
      y,
      vx: Math.cos(direction) * force,
      vy: Math.sin(direction) * force,
      gravity: 900,
      life,
      maxLife: life,
      size: randomRange(1.4, 3.5),
      color: "rgba(247, 248, 255, 1)",
    });
  }
}

function spawnCoinBurst(x: number, y: number): void {
  for (let i = 0; i < 12; i += 1) {
    const direction = randomRange(0, Math.PI * 2);
    const force = randomRange(25, 120);
    const life = randomRange(0.18, 0.34);
    particles.push({
      x,
      y,
      vx: Math.cos(direction) * force,
      vy: Math.sin(direction) * force - 50,
      gravity: 240,
      life,
      maxLife: life,
      size: randomRange(1.6, 2.8),
      color: "rgba(248, 219, 126, 1)",
    });
  }
}

function resetRunState(): void {
  cameraX = 0;
  previewCameraX = 0;
  speed = isMobile ? 330 : 360;
  distanceMeters = 0;
  trickPoints = 0;
  coinPoints = 0;
  score = 0;
  comboMultiplier = 1;
  comboTimer = 0;
  finalRunScore = 0;
  particles = [];
  popups = [];

  initializeTerrain();

  const groundY = terrainHeightAt(layout.playerScreenX) ?? worldAnchorY;
  player = {
    y: groundY - layout.playerRadius,
    vy: 0,
    grounded: true,
    rotation: 0,
    angularVelocity: 0,
    rotationTravel: 0,
  };

  updateHud();
}

function setState(nextState: GameState): void {
  gameState = nextState;

  if (nextState === "START") {
    startScreen.classList.remove("hidden");
    gameOverScreen.classList.add("hidden");
    hud.classList.add("hidden");
    settingsButton.classList.add("hidden");
    settingsModal.classList.add("hidden");
  }

  if (nextState === "PLAYING") {
    startScreen.classList.add("hidden");
    gameOverScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    settingsButton.classList.remove("hidden");
  }

  if (nextState === "GAME_OVER") {
    startScreen.classList.add("hidden");
    gameOverScreen.classList.remove("hidden");
    hud.classList.add("hidden");
    settingsButton.classList.add("hidden");
    settingsModal.classList.add("hidden");
  }

  updateAudioMix();
}

function updateHud(): void {
  score = Math.max(0, Math.floor(distanceMeters + trickPoints + coinPoints));
  scoreValue.textContent = score.toString();
  distanceValue.textContent = Math.floor(distanceMeters).toString() + " m";
  comboValue.textContent = "x" + comboMultiplier.toString();
}

function submitFinalScore(): void {
  if (typeof window.submitScore === "function") {
    const safeScore = Math.max(0, Math.floor(finalRunScore));
    console.log("[submitFinalScore]", "Submitting final score " + safeScore.toString());
    window.submitScore(safeScore);
  } else {
    console.log("[submitFinalScore]", "submitScore bridge not available");
  }
}

function endRun(reason: string): void {
  if (gameState !== "PLAYING") return;
  finalRunScore = score;
  finalScore.textContent = finalRunScore.toString();
  console.log("[endRun]", "Run ended due to " + reason + " with score " + finalRunScore.toString());
  playCrashFx();
  triggerHaptic("error");
  submitFinalScore();
  setState("GAME_OVER");
}

function jump(): void {
  if (!player.grounded) return;
  player.grounded = false;
  player.vy = -layout.jumpImpulse;
  player.angularVelocity = 0;
  player.rotationTravel = 0;
  playJumpFx();
  triggerHaptic("light");
  spawnSnowBurst(layout.playerScreenX - 8, player.y + layout.playerRadius, 7);
}

function startRun(): void {
  ensureAudio();
  resetRunState();
  setState("PLAYING");
  playUiFx();
  triggerHaptic("light");
  console.log("[startRun]", "New run started");
}

function returnToStart(): void {
  resetRunState();
  setState("START");
  console.log("[returnToStart]", "Returned to start screen");
}

function processLanding(groundY: number, slope: number): void {
  const flips = Math.floor(player.rotationTravel / (Math.PI * 2));
  const alignment = Math.abs(normalizeAngle(player.rotation - Math.atan(slope)));

  if (alignment > 1.12) {
    endRun("bad-landing");
    return;
  }

  player.grounded = true;
  player.y = groundY - layout.playerRadius;
  player.vy = 0;
  player.angularVelocity = 0;
  player.rotation = Math.atan(slope) * 0.85;

  const landingX = layout.playerScreenX;
  spawnSnowBurst(landingX, player.y + layout.playerRadius, flips > 0 ? 14 : 8);

  if (flips > 0) {
    if (comboTimer > 0) {
      comboMultiplier = clamp(comboMultiplier + 1, 1, 12);
    } else {
      comboMultiplier = 2;
    }
    comboTimer = 2.7;

    const bonus = flips * 120 * comboMultiplier;
    trickPoints += bonus;
    popups.push({
      x: landingX,
      y: player.y - 26,
      life: 1.1,
      maxLife: 1.1,
      text: flips.toString() + " flip +" + bonus.toString(),
    });

    playLandingFx(true);
    triggerHaptic(flips >= 2 ? "success" : "medium");
  } else {
    playLandingFx(false);
    if (comboTimer <= 0) {
      comboMultiplier = 1;
    }
  }
}

function updatePlayer(dt: number): void {
  const activeCamera = gameState === "PLAYING" ? cameraX : previewCameraX;
  const playerWorldX = activeCamera + layout.playerScreenX;
  const groundY = terrainHeightAt(playerWorldX);

  if (player.grounded) {
    if (groundY === null) {
      player.grounded = false;
      player.vy = 70;
    } else {
      const slope = terrainSlopeAt(playerWorldX);
      player.y = groundY - layout.playerRadius;
      player.rotation = lerp(player.rotation, Math.atan(slope) * 0.85, dt * 8);
    }
  } else {
    const targetAngularVelocity = inputHeld ? layout.spinSpeed : 0;
    player.angularVelocity = lerp(player.angularVelocity, targetAngularVelocity, dt * 8);
    player.rotation += player.angularVelocity * dt;
    player.rotationTravel += Math.abs(player.angularVelocity * dt);

    player.vy += layout.gravity * dt;
    player.y += player.vy * dt;

    if (groundY !== null && player.vy > 0 && player.y >= groundY - layout.playerRadius) {
      processLanding(groundY, terrainSlopeAt(playerWorldX));
    }
  }

  if (player.y - layout.playerRadius > h + 180) {
    endRun("fall");
  }
}

function updateCoins(): void {
  const playerWorldX = cameraX + layout.playerScreenX;
  for (let i = 0; i < coins.length; i += 1) {
    const coin = coins[i];
    if (coin.collected) continue;

    const bob = Math.sin(timeSeconds * 3 + coin.bobPhase) * 6;
    const dx = coin.x - playerWorldX;
    const dy = coin.y + bob - player.y;
    const hitRadius = layout.playerRadius + coin.radius;
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      coin.collected = true;
      coinPoints += 20;
      spawnCoinBurst(layout.playerScreenX, coin.y + bob);
      playCoinFx();
      triggerHaptic("light");
    }
  }

  coins = coins.filter((coin) => !coin.collected && coin.x > cameraX - 120);
}

function updateRocks(): void {
  const playerWorldX = cameraX + layout.playerScreenX;

  for (let i = 0; i < rocks.length; i += 1) {
    const rock = rocks[i];
    const terrainY = terrainHeightAt(rock.x);
    if (terrainY === null) continue;

    const rockCenterY = terrainY - rock.radius * 0.6;
    const dx = playerWorldX - rock.x;
    if (Math.abs(dx) > rock.radius + layout.playerRadius + 10) {
      continue;
    }

    const dy = player.y - rockCenterY;
    const threshold = (rock.radius * 0.68 + layout.playerRadius) ** 2;
    if (dx * dx + dy * dy < threshold) {
      endRun("rock-hit");
      return;
    }
  }

  rocks = rocks.filter((rock) => rock.x > cameraX - 160);
}

function cleanupWorld(): void {
  const terrainCutoff = cameraX - w * 1.4;
  while (terrainPoints.length > 3 && terrainPoints[1].x < terrainCutoff) {
    terrainPoints.shift();
  }

  gaps = gaps.filter((gap) => gap.end > cameraX - 140);
}

function recycleClouds(activeCamera: number): void {
  for (let i = 0; i < clouds.length; i += 1) {
    const cloud = clouds[i];
    const screenX = cloud.x - activeCamera * 0.38;
    if (screenX < -cloud.width - 120) {
      cloud.x = activeCamera * 0.38 + w + randomRange(120, 420);
      cloud.y = randomRange(h * 0.1, h * 0.4);
      cloud.width = randomRange(140, 280);
      cloud.height = randomRange(36, 72);
      cloud.alpha = randomRange(0.12, 0.26);
    }
  }
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += particle.gravity * dt;
    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function updatePopups(dt: number): void {
  for (let i = popups.length - 1; i >= 0; i -= 1) {
    const popup = popups[i];
    popup.life -= dt;
    popup.y -= 36 * dt;
    if (popup.life <= 0) {
      popups.splice(i, 1);
    }
  }
}

function updateGame(dt: number): void {
  if (gameState === "PLAYING") {
    speed = clamp(speed + dt * 10, 330, 640);
    cameraX += speed * dt;
    distanceMeters += speed * dt * 0.082;
    comboTimer -= dt;
    if (comboTimer <= 0) {
      comboTimer = 0;
      comboMultiplier = 1;
    }

    extendTerrainTo(cameraX + w * 2.2);
    cleanupWorld();
    recycleClouds(cameraX);

    updatePlayer(dt);
    updateCoins();
    updateRocks();

    musicStepTimer -= dt;
    if (musicStepTimer <= 0) {
      musicStepTimer = 0.64;
      playMusicPulse();
    }

    updateHud();
  } else if (gameState === "START") {
    previewCameraX += dt * 86;
    extendTerrainTo(previewCameraX + w * 2);
    cleanupWorld();
    recycleClouds(previewCameraX);
    const playerWorldX = previewCameraX + layout.playerScreenX;
    const groundY = terrainHeightAt(playerWorldX);
    if (groundY !== null) {
      const slope = terrainSlopeAt(playerWorldX);
      player.grounded = true;
      player.vy = 0;
      player.y = groundY - layout.playerRadius;
      player.rotation = lerp(player.rotation, Math.atan(slope) * 0.85, dt * 8);
    }
  }

  updateParticles(dt);
  updatePopups(dt);
}

function drawSky(activeCamera: number): void {
  const dayCycle = (Math.sin(timeSeconds * 0.04) + 1) * 0.5;
  const nightAmount = clamp((dayCycle - 0.55) * 2.4, 0, 1);

  const topHue = lerp(204, 28, dayCycle);
  const topSat = lerp(68, 52, dayCycle);
  const topLight = lerp(48, 18, dayCycle);
  const bottomHue = lerp(38, 215, dayCycle);
  const bottomSat = lerp(78, 42, dayCycle);
  const bottomLight = lerp(74, 24, dayCycle);

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "hsl(" + topHue.toFixed(1) + " " + topSat.toFixed(1) + "% " + topLight.toFixed(1) + "%)");
  gradient.addColorStop(
    1,
    "hsl(" + bottomHue.toFixed(1) + " " + bottomSat.toFixed(1) + "% " + bottomLight.toFixed(1) + "%)",
  );
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const sunX = w * 0.78 + Math.sin(timeSeconds * 0.11) * 30;
  const sunY = h * 0.22 + Math.cos(timeSeconds * 0.08) * 18;
  const sunRadius = isMobile ? 44 : 58;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 243, 216, " + (0.18 + (1 - dayCycle) * 0.28).toFixed(3) + ")";
  ctx.fill();

  for (let i = 0; i < stars.length; i += 1) {
    const star = stars[i];
    const twinkle = 0.45 + 0.55 * Math.sin(timeSeconds * star.twinkleSpeed + star.twinklePhase);
    const alpha = twinkle * nightAmount * 0.86;
    if (alpha <= 0.01) continue;
    ctx.fillStyle = "rgba(248, 249, 255, " + alpha.toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < clouds.length; i += 1) {
    const cloud = clouds[i];
    const screenX = cloud.x - activeCamera * 0.38;
    if (screenX < -cloud.width || screenX > w + cloud.width) continue;
    const alpha = cloud.alpha * (1 - nightAmount * 0.5);
    ctx.fillStyle = "rgba(255, 247, 232, " + alpha.toFixed(3) + ")";
    ctx.beginPath();
    ctx.ellipse(screenX, cloud.y, cloud.width * 0.5, cloud.height * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(
      screenX - cloud.width * 0.2,
      cloud.y + cloud.height * 0.08,
      cloud.width * 0.34,
      cloud.height * 0.36,
      0,
      0,
      Math.PI * 2,
    );
    ctx.ellipse(
      screenX + cloud.width * 0.23,
      cloud.y + cloud.height * 0.05,
      cloud.width * 0.28,
      cloud.height * 0.3,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawMountainLayer(activeCamera: number, parallax: number, baseY: number, amplitude: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-50, h + 40);
  for (let x = -50; x <= w + 80; x += 36) {
    const worldX = activeCamera * parallax + x;
    const y =
      baseY +
      Math.sin(worldX * 0.0012 + parallax * 8.2) * amplitude +
      Math.sin(worldX * 0.0023 + parallax * 2.4) * amplitude * 0.45;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w + 80, h + 40);
  ctx.closePath();
  ctx.fill();
}

function drawSnowGround(activeCamera: number): void {
  const sampleStep = 7;
  let segmentOpen = false;
  let segmentStartX = 0;
  let previousX = 0;
  let previousY = 0;

  for (let screenX = -sampleStep; screenX <= w + sampleStep; screenX += sampleStep) {
    const worldX = activeCamera + screenX;
    const terrainY = terrainHeightAt(worldX);

    if (terrainY === null) {
      if (segmentOpen) {
        ctx.lineTo(previousX, h + 60);
        ctx.lineTo(segmentStartX, h + 60);
        ctx.closePath();
        ctx.fillStyle = "rgba(236, 245, 255, 0.95)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 2;
        ctx.stroke();
        segmentOpen = false;
      }
      continue;
    }

    if (!segmentOpen) {
      ctx.beginPath();
      ctx.moveTo(screenX, terrainY);
      segmentOpen = true;
      segmentStartX = screenX;
    } else {
      ctx.lineTo(screenX, terrainY);
    }

    previousX = screenX;
    previousY = terrainY;
  }

  if (segmentOpen) {
    ctx.lineTo(previousX, h + 60);
    ctx.lineTo(segmentStartX, h + 60);
    ctx.closePath();
    ctx.fillStyle = "rgba(236, 245, 255, 0.95)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawGaps(activeCamera: number): void {
  for (let i = 0; i < gaps.length; i += 1) {
    const gap = gaps[i];
    const startX = gap.start - activeCamera;
    const endX = gap.end - activeCamera;
    if (endX < -50 || startX > w + 50) continue;
    const gradient = ctx.createLinearGradient(0, h * 0.5, 0, h);
    gradient.addColorStop(0, "rgba(23, 43, 65, 0.45)");
    gradient.addColorStop(1, "rgba(9, 20, 32, 0.95)");
    ctx.fillStyle = gradient;
    ctx.fillRect(startX, h * 0.44, endX - startX, h * 0.66);
  }
}

function drawRocks(activeCamera: number): void {
  for (let i = 0; i < rocks.length; i += 1) {
    const rock = rocks[i];
    const screenX = rock.x - activeCamera;
    if (screenX < -120 || screenX > w + 120) continue;

    const terrainY = terrainHeightAt(rock.x);
    if (terrainY === null) continue;
    const screenY = terrainY - rock.radius * 0.6;
    const wobble = Math.sin(timeSeconds * 0.9 + rock.spin * 8) * rock.radius * 0.06;

    ctx.beginPath();
    ctx.ellipse(screenX, terrainY + rock.radius * 0.16, rock.radius * 0.9, rock.radius * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10, 18, 28, 0.25)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(screenX - rock.radius * 0.95, screenY + rock.radius * 0.35 + wobble);
    ctx.quadraticCurveTo(
      screenX - rock.radius * 0.32,
      screenY - rock.radius * (0.8 + rock.variation * 0.25),
      screenX + rock.radius * 0.2,
      screenY - rock.radius * (0.42 - rock.variation * 0.15),
    );
    ctx.quadraticCurveTo(
      screenX + rock.radius * 1.02,
      screenY - rock.radius * 0.1,
      screenX + rock.radius * 0.8,
      screenY + rock.radius * 0.42,
    );
    ctx.quadraticCurveTo(
      screenX + rock.radius * 0.12,
      screenY + rock.radius * 0.78,
      screenX - rock.radius * 0.95,
      screenY + rock.radius * 0.35 + wobble,
    );
    ctx.closePath();
    ctx.fillStyle = "rgba(77, 93, 118, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(45, 59, 78, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawCoins(activeCamera: number): void {
  for (let i = 0; i < coins.length; i += 1) {
    const coin = coins[i];
    if (coin.collected) continue;
    const screenX = coin.x - activeCamera;
    if (screenX < -50 || screenX > w + 50) continue;

    const bob = Math.sin(timeSeconds * 3 + coin.bobPhase) * 6;
    const screenY = coin.y + bob;
    ctx.beginPath();
    ctx.arc(screenX, screenY, coin.radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(246, 201, 96, 0.94)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(177, 133, 42, 0.95)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(screenX, screenY, coin.radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 236, 176, 0.85)";
    ctx.fill();
  }
}

function drawParticles(): void {
  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    if (alpha <= 0) continue;
    ctx.fillStyle = particle.color.replace("1)", alpha.toFixed(3) + ")");
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPopupText(): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < popups.length; i += 1) {
    const popup = popups[i];
    const alpha = clamp(popup.life / popup.maxLife, 0, 1);
    ctx.fillStyle = "rgba(255, 244, 213, " + alpha.toFixed(3) + ")";
    ctx.font = "700 " + (isMobile ? 16 : 18).toString() + "px Manrope";
    ctx.fillText(popup.text, popup.x, popup.y);
  }
}

function drawPlayer(activeCamera: number): void {
  const playerWorldX = activeCamera + layout.playerScreenX;
  const groundY = terrainHeightAt(playerWorldX);

  if (groundY !== null) {
    ctx.beginPath();
    ctx.ellipse(
      layout.playerScreenX,
      groundY + layout.playerRadius * 0.4,
      layout.playerRadius * 1.8,
      layout.playerRadius * 0.44,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "rgba(12, 22, 34, 0.28)";
    ctx.fill();
  }

  ctx.save();
  ctx.translate(layout.playerScreenX, player.y);
  ctx.rotate(player.rotation);

  const boardW = layout.playerRadius * 3.3;
  const boardH = layout.playerRadius * 0.44;
  ctx.fillStyle = "#34536e";
  ctx.beginPath();
  ctx.roundRect(-boardW * 0.5, layout.playerRadius * 0.78, boardW, boardH, boardH * 0.5);
  ctx.fill();

  ctx.fillStyle = "#e9f0fa";
  ctx.beginPath();
  ctx.arc(0, 0, layout.playerRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2f4a67";
  ctx.beginPath();
  ctx.ellipse(-layout.playerRadius * 0.16, layout.playerRadius * 0.9, layout.playerRadius * 0.8, layout.playerRadius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f2b26f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(layout.playerRadius * 0.5, -layout.playerRadius * 0.35);
  ctx.lineTo(layout.playerRadius * 1.52, -layout.playerRadius * 0.82);
  ctx.lineTo(layout.playerRadius * 2.05, -layout.playerRadius * 0.62);
  ctx.stroke();
  ctx.restore();
}

function drawScene(): void {
  const activeCamera = gameState === "PLAYING" ? cameraX : previewCameraX;

  drawSky(activeCamera);
  drawMountainLayer(activeCamera, 0.14, h * 0.58, h * 0.11, "rgba(51, 73, 96, 0.42)");
  drawMountainLayer(activeCamera, 0.23, h * 0.64, h * 0.09, "rgba(40, 60, 82, 0.58)");
  drawMountainLayer(activeCamera, 0.34, h * 0.7, h * 0.07, "rgba(31, 49, 69, 0.76)");
  drawGaps(activeCamera);
  drawSnowGround(activeCamera);
  drawRocks(activeCamera);
  drawCoins(activeCamera);
  drawPlayer(activeCamera);
  drawParticles();
  drawPopupText();
}

function openSettings(): void {
  if (gameState !== "PLAYING") return;
  settingsModal.classList.remove("hidden");
  playUiFx();
  triggerHaptic("light");
}

function closeSettings(): void {
  settingsModal.classList.add("hidden");
}

function onInputPress(): void {
  if (gameState !== "PLAYING") return;
  ensureAudio();
  if (!inputHeld && player.grounded) {
    jump();
  }
  inputHeld = true;
}

function onInputRelease(): void {
  inputHeld = false;
}

function toggleMusic(): void {
  settings.music = !settings.music;
  saveSettings();
  updateToggleState();
  updateAudioMix();
  playUiFx();
  triggerHaptic("light");
  console.log("[toggleMusic]", "Music " + (settings.music ? "enabled" : "disabled"));
}

function toggleFx(): void {
  settings.fx = !settings.fx;
  saveSettings();
  updateToggleState();
  updateAudioMix();
  playUiFx();
  triggerHaptic("light");
  console.log("[toggleFx]", "FX " + (settings.fx ? "enabled" : "disabled"));
}

function toggleHaptics(): void {
  settings.haptics = !settings.haptics;
  saveSettings();
  updateToggleState();
  if (settings.haptics) {
    triggerHaptic("light");
  }
  console.log("[toggleHaptics]", "Haptics " + (settings.haptics ? "enabled" : "disabled"));
}

function bindEvents(): void {
  startButton.addEventListener("click", () => {
    startRun();
  });

  restartButton.addEventListener("click", () => {
    playUiFx();
    triggerHaptic("light");
    startRun();
  });

  menuButton.addEventListener("click", () => {
    playUiFx();
    triggerHaptic("light");
    returnToStart();
  });

  settingsButton.addEventListener("click", () => {
    openSettings();
  });

  settingsCloseButton.addEventListener("click", () => {
    playUiFx();
    triggerHaptic("light");
    closeSettings();
  });

  settingsModal.addEventListener("click", (event) => {
    if (event.target === settingsModal) {
      closeSettings();
    }
  });

  musicToggle.addEventListener("click", () => {
    toggleMusic();
  });

  fxToggle.addEventListener("click", () => {
    toggleFx();
  });

  hapticsToggle.addEventListener("click", () => {
    toggleHaptics();
  });

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    onInputPress();
  });

  canvas.addEventListener("pointerup", (event) => {
    event.preventDefault();
    onInputRelease();
  });

  canvas.addEventListener("pointercancel", () => {
    onInputRelease();
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === " " || event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
        event.preventDefault();
        onInputPress();
      }
    },
    { passive: false },
  );

  window.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
      event.preventDefault();
      onInputRelease();
    }
  });

  window.addEventListener("blur", () => {
    onInputRelease();
  });

  window.addEventListener("resize", () => {
    recalculateLayout();
    resetSkyElements();
    console.log("[resizeCanvas]", "Resized to " + w.toString() + "x" + h.toString());
  });
}

let previousTime = performance.now();

function gameLoop(timestamp: number): void {
  const dt = Math.min(0.033, (timestamp - previousTime) / 1000);
  previousTime = timestamp;
  timeSeconds += dt;

  updateGame(dt);
  drawScene();

  requestAnimationFrame(gameLoop);
}

function init(): void {
  recalculateLayout();
  resetSkyElements();
  resetRunState();
  updateToggleState();
  bindEvents();
  setState("START");
  updateAudioMix();

  requestAnimationFrame(gameLoop);
  console.log("[init]", "Alto clone initialized");
}

init();
