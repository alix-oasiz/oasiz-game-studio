// Car Balance - A minimalist physics balancing game using Matter.js
// Keep the car balanced on a seesaw platform while dodging bombs!

import Matter from "matter-js";
import { oasiz } from "@oasiz/sdk";

const { Engine, World, Bodies, Body, Events, Composite, Constraint } = Matter;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Bomb {
  x: number; // Target x position on screen
  y: number; // Current y position
  warningTime: number; // Time remaining in warning phase (ms)
  dropping: boolean; // Whether bomb is actively falling
  exploded: boolean; // Whether bomb has exploded
  body: Matter.Body | null; // Physics body when dropping
}

interface CoinDrop {
  body: Matter.Body;
  collected: boolean;
  y: number;
}

interface Explosion {
  x: number;
  y: number;
  time: number; // Time since explosion started
  maxTime: number; // Duration of explosion animation
}

interface CarStyle {
  id: string;
  name: string;
  bodyColor: string;
  bodyStroke: string;
  wheelColor: string;
  hubColor: string;
  widthScale: number; // 0.7 to 1.3
  heightScale: number; // 0.7 to 1.3
  wheelScale: number; // 0.7 to 1.3
  price: number;
}

// Available car styles (6 options)
const CAR_STYLES: CarStyle[] = [
  {
    id: "classic",
    name: "Classic",
    bodyColor: "#3498db",
    bodyStroke: "#1a5276",
    wheelColor: "#1a1a1a",
    hubColor: "#666",
    widthScale: 1.0,
    heightScale: 1.0,
    wheelScale: 1.0,
    price: 0,
  },
  {
    id: "racer",
    name: "Racer",
    bodyColor: "#e63946",
    bodyStroke: "#a11d2a",
    wheelColor: "#1a1a1a",
    hubColor: "#c0c0c0",
    widthScale: 1.25,
    heightScale: 0.7,
    wheelScale: 0.85,
    price: 100,
  },
  {
    id: "monster",
    name: "Monster",
    bodyColor: "#27ae60",
    bodyStroke: "#1e8449",
    wheelColor: "#1a1a1a",
    hubColor: "#555",
    widthScale: 1.1,
    heightScale: 1.2,
    wheelScale: 1.4,
    price: 300,
  },
  {
    id: "cruiser",
    name: "Cruiser",
    bodyColor: "#e67e22",
    bodyStroke: "#a04000",
    wheelColor: "#f5f5dc",
    hubColor: "#d4a056",
    widthScale: 1.15,
    heightScale: 1.1,
    wheelScale: 1.1,
    price: 600,
  },
  {
    id: "mini",
    name: "Mini",
    bodyColor: "#ff69b4",
    bodyStroke: "#c71585",
    wheelColor: "#4a4a4a",
    hubColor: "#aaa",
    widthScale: 0.75,
    heightScale: 0.85,
    wheelScale: 0.8,
    price: 1000,
  },
  {
    id: "tank",
    name: "Tank",
    bodyColor: "#5d6d7e",
    bodyStroke: "#2c3e50",
    wheelColor: "#1c2833",
    hubColor: "#566573",
    widthScale: 1.3,
    heightScale: 1.3,
    wheelScale: 1.2,
    price: 1500,
  },
  {
    id: "dragon",
    name: "Dragon",
    bodyColor: "#2ecc71",
    bodyStroke: "#27ae60",
    wheelColor: "#c0392b",
    hubColor: "#e74c3c",
    widthScale: 1.3,
    heightScale: 0.9,
    wheelScale: 1.1,
    price: 2500,
  },
  {
    id: "alien",
    name: "Alien",
    bodyColor: "#9b59b6",
    bodyStroke: "#8e44ad",
    wheelColor: "#2c3e50",
    hubColor: "#1abc9c",
    widthScale: 1.2,
    heightScale: 0.8,
    wheelScale: 0.9,
    price: 3500,
  },
  {
    id: "space",
    name: "Space",
    bodyColor: "#ecf0f1",
    bodyStroke: "#bdc3c7",
    wheelColor: "#34495e",
    hubColor: "#3498db",
    widthScale: 1.4,
    heightScale: 0.8,
    wheelScale: 1.0,
    price: 5000,
  },
  {
    id: "spy",
    name: "Spy",
    bodyColor: "#111111",
    bodyStroke: "#000000",
    wheelColor: "#000000",
    hubColor: "#333333",
    widthScale: 1.2,
    heightScale: 0.7,
    wheelScale: 0.9,
    price: 7500,
  },
  {
    id: "animal",
    name: "Animal",
    bodyColor: "#f39c12",
    bodyStroke: "#e67e22",
    wheelColor: "#8e44ad",
    hubColor: "#9b59b6",
    widthScale: 1.0,
    heightScale: 1.1,
    wheelScale: 0.8,
    price: 10000,
  },
  {
    id: "ghost",
    name: "Ghost",
    bodyColor: "rgba(255, 255, 255, 0.7)",
    bodyStroke: "rgba(135, 206, 235, 0.8)",
    wheelColor: "rgba(200, 200, 200, 0.5)",
    hubColor: "rgba(135, 206, 235, 0.6)",
    widthScale: 1.1,
    heightScale: 0.9,
    wheelScale: 0.0, // Floating car!
    price: 15000,
  }
];

interface WaterParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface CarComposite {
  composite: Matter.Composite;
  body: Matter.Body;
  wheelA: Matter.Body;
  wheelB: Matter.Body;
  // Store original dimensions for rendering (bounds change when rotated)
  bodyWidth: number;
  bodyHeight: number;
  wheelRadius: number;
  // Car style
  style: CarStyle;
}

type GamePhase = "start" | "playing" | "gameOver";

// ============================================================================
// CONSTANTS
// ============================================================================

// Car dimensions (scaled based on screen)
const CAR_WIDTH = 120;
const CAR_HEIGHT = 30;
const WHEEL_SIZE = 25;

const BAR_LENGTH_RATIO = 0.65;
const BAR_THICKNESS = 12;
const TILT_SPEED = 0.015; // Smooth rotation
// No max tilt - bar can rotate 360 degrees

// Bomb settings
const BOMB_START_TIME = 30000; // 30 seconds before bombs start
const BOMB_WARNING_TIME = 1500; // 1.5 seconds warning
const BOMB_RADIUS = 18;
const BOMB_INITIAL_INTERVAL = 6000;
const BOMB_MIN_INTERVAL = 2500;

// Water settings
const WATER_HEIGHT_RATIO = 0.15;
const WAVE_AMPLITUDE = 8;
const WAVE_FREQUENCY = 0.02;

// Colors (hand-drawn theme)
const COLORS = {
  carBody: "#e63946",
  carBodyStroke: "#222",
  wheel: "#1a1a1a",
  wheelHub: "#666",
  wheelSpoke: "#888",
  wheelCenter: "#aaa",
  bar: "#1a1a1a",
  barStroke: "#1a1a1a",
  pivot: "#222",
};

// Sky color options - vibrant, fun colors
const SKY_COLORS = [
  "#87CEEB", // Classic sky blue
  "#7EC8E3", // Soft cyan blue
  "#E8A87C", // Warm peach/orange
  "#C9A0DC", // Soft lavender purple
  "#B19CD9", // Light purple
  "#D4A574", // Warm tan/brown
  "#98D8C8", // Mint green
  "#F7B7A3", // Coral/salmon
];

let currentSkyColor = SKY_COLORS[0];

// ============================================================================
// GAME STATE
// ============================================================================

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let engine: Matter.Engine;
let world: Matter.World;

let gamePhase: GamePhase = "start";
let gameTime = 0;
let lastTime = 0;
let targetBarAngle = 0;

let car: CarComposite;
let barBody: Matter.Body;

let bombs: Bomb[] = [];
let explosions: Explosion[] = [];
let nextBombTime = BOMB_START_TIME;

let coins: CoinDrop[] = [];
let nextCoinTime = 5000; // First coin after 5 seconds

// Audio
let audioContext: AudioContext | null = null;
let themeMusic: HTMLAudioElement | null = null;
let gameOverMusic: HTMLAudioElement | null = null;
let waterParticles: WaterParticle[] = [];

// Settings
interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface GameState {
  coins: number;
  unlockedCars: string[];
  selectedCarId: string;
}

let gameState: GameState = {
  coins: 0,
  unlockedCars: ["classic"],
  selectedCarId: "classic",
};

function loadPersistentState(): void {
  try {
    const saved = oasiz.loadGameState();
    if (saved && typeof saved === "object") {
      if (typeof saved.coins === "number") gameState.coins = saved.coins;
      if (Array.isArray(saved.unlockedCars))
        gameState.unlockedCars = saved.unlockedCars as string[];
      if (typeof saved.selectedCarId === "string")
        gameState.selectedCarId = saved.selectedCarId;
    }
  } catch (e) {
    console.log("[loadPersistentState] Error loading state", e);
  }

  // Update selected car style based on loaded state
  const found = CAR_STYLES.find((c) => c.id === gameState.selectedCarId);
  if (found) {
    selectedCarStyle = found;
  }

  updateCoinDisplay();
}

function savePersistentState(): void {
  oasiz.saveGameState({
    coins: gameState.coins,
    unlockedCars: gameState.unlockedCars,
    selectedCarId: gameState.selectedCarId,
  });
}

function updateCoinDisplay(): void {
  const hudCoins = document.getElementById("hud-coins");
  const shopCoins = document.getElementById("shop-coins");
  const startCoins = document.getElementById("start-coins");
  if (hudCoins) hudCoins.textContent = gameState.coins.toString();
  if (shopCoins) shopCoins.textContent = gameState.coins.toString();
  if (startCoins) startCoins.textContent = gameState.coins.toString();
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem("carbalance_settings");
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      return {
        music: p.music ?? true,
        fx: p.fx ?? true,
        haptics: p.haptics ?? true,
      };
    }
  } catch (_) {
    console.log("[loadSettings]", "Parse error, using defaults");
  }
  return { music: true, fx: true, haptics: true };
}

function saveSettings(): void {
  localStorage.setItem("carbalance_settings", JSON.stringify(settings));
}

let settings: Settings = loadSettings();

let holdingLeft = false;
let holdingRight = false;

// Layout calculations
let w = 0;
let h = 0;
let pivotX = 0;
let pivotY = 0;
let barLength = 0;
let waterLevel = 0;
let isMobile = false;
let selectedCarStyle: CarStyle = CAR_STYLES[0];

// ============================================================================
// CAR COMPOSITE CREATION
// ============================================================================

/**
 * Creates a composite with a proper car setup of bodies and constraints.
 * Based on the official Matter.js car example.
 * @param xx - X position for car center
 * @param yy - Y position for car center
 * @param width - Width of car body
 * @param height - Height of car body
 * @param wheelSize - Radius of wheels
 * @returns CarComposite with composite, body, wheelA, and wheelB references
 */
function createCar(
  xx: number,
  yy: number,
  width: number,
  height: number,
  wheelSize: number,
  style: CarStyle,
): CarComposite {
  console.log(
    "[createCar] Creating car at",
    xx,
    yy,
    "size:",
    width,
    "x",
    height,
    "wheels:",
    wheelSize,
    "style:",
    style.name,
  );

  // Create a collision group so car parts don't collide with each other
  const group = Body.nextGroup(true);

  // Wheel positioning - wheels at bottom of car body
  const wheelBase = width * 0.35;
  const wheelAOffset = -wheelBase;
  const wheelBOffset = wheelBase;
  // Position wheels below the body center so they touch the ground
  const wheelYOffset = height * 0.3;

  // Create the car composite
  const carComposite = Composite.create({ label: "Car" });

  // Car body - rectangle with chamfer (rounded corners)
  // Very heavy car with minimal air friction = maximum inertia
  const body = Bodies.rectangle(xx, yy, width, height, {
    collisionFilter: {
      group: group,
    },
    chamfer: {
      radius: height * 0.5,
    },
    density: 0.025, // Extra heavy - hard to stop once moving
    friction: 0.3,
    frictionAir: 0.001, // Minimal air resistance - maintains momentum
    label: "carBody",
    render: {
      fillStyle: COLORS.carBody,
    },
  });

  // Front wheel (right side)
  const wheelA = Bodies.circle(
    xx + wheelAOffset,
    yy + wheelYOffset,
    wheelSize,
    {
      collisionFilter: {
        group: group,
      },
      friction: 0.8,
      frictionStatic: 0.1,
      frictionAir: 0.0005, // Very low air resistance
      restitution: 0.05,
      density: 0.03, // Heavy wheels - lots of inertia
      label: "wheelA",
    },
  );

  // Rear wheel (left side)
  const wheelB = Bodies.circle(
    xx + wheelBOffset,
    yy + wheelYOffset,
    wheelSize,
    {
      collisionFilter: {
        group: group,
      },
      friction: 0.8,
      frictionStatic: 0.1,
      frictionAir: 0.0005, // Very low air resistance
      restitution: 0.05,
      density: 0.03, // Heavy wheels - lots of inertia
      label: "wheelB",
    },
  );

  // Axle constraints - connect wheels to body with stiff springs
  const axelA = Constraint.create({
    bodyB: body,
    pointB: { x: wheelAOffset, y: wheelYOffset },
    bodyA: wheelA,
    stiffness: 1,
    length: 0,
    render: {
      visible: false,
    },
  });

  const axelB = Constraint.create({
    bodyB: body,
    pointB: { x: wheelBOffset, y: wheelYOffset },
    bodyA: wheelB,
    stiffness: 1,
    length: 0,
    render: {
      visible: false,
    },
  });

  // Add all parts to the composite
  Composite.add(carComposite, [body, wheelA, wheelB, axelA, axelB]);

  return {
    composite: carComposite,
    body: body,
    wheelA: wheelA,
    wheelB: wheelB,
    // Store fixed dimensions for rendering
    bodyWidth: width,
    bodyHeight: height,
    wheelRadius: wheelSize,
    style: style,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init(): void {
  console.log("[init] Starting Car Balance game with Matter.js physics");

  canvas = document.getElementById("game") as HTMLCanvasElement;
  ctx = canvas.getContext("2d")!;

  isMobile = window.matchMedia("(pointer: coarse)").matches;

  // Set up resize handler
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Set up input handlers
  setupInputHandlers();

  // Set up UI handlers
  setupUIHandlers();

  // Initialize physics
  initPhysics();

  // Initialize audio
  audioContext = null;

  // Load persistent state
  loadPersistentState();

  // Emit score config (if available in SDK)
  if (typeof (oasiz as any).emitScoreConfig === 'function') {
    (oasiz as any).emitScoreConfig({
      anchors: [
        { raw: 100, normalized: 100 },
        { raw: 300, normalized: 300 },
        { raw: 600, normalized: 600 },
        { raw: 1000, normalized: 950 },
      ],
    });
  }

  // Load theme music
  themeMusic = new Audio("https://assets.oasiz.ai/audio/balance.mp3");
  themeMusic.loop = true;
  themeMusic.volume = 0.3;

  // Load game over music
  gameOverMusic = new Audio(
    "https://assets.oasiz.ai/audio/car-balance/gameover.mp3",
  );
  gameOverMusic.loop = false;
  gameOverMusic.volume = 0.4;

  oasiz.onPause(() => {
    if (themeMusic) themeMusic.pause();
  });

  oasiz.onResume(() => {
    if (gamePhase === "playing" && themeMusic) {
      themeMusic.play().catch(() => {});
    }
  });

  // Start game loop
  requestAnimationFrame(gameLoop);
}

function initPhysics(): void {
  console.log("[initPhysics] Creating Matter.js engine with car composite");

  // Recalculate layout to ensure values are current
  w = window.innerWidth;
  h = window.innerHeight;
  pivotX = w / 2;
  pivotY = h * 0.5;
  // Use wider bar on mobile for better gameplay
  const mobileBarRatio = isMobile ? 0.9 : BAR_LENGTH_RATIO;
  barLength = Math.min(w * mobileBarRatio, 550);
  waterLevel = h * (1 - WATER_HEIGHT_RATIO);

  // Create engine with moderate gravity
  engine = Engine.create({
    gravity: { x: 0, y: 1.5 },
    enableSleeping: false,
  });
  world = engine.world;

  // Create the seesaw bar (static but we'll rotate it manually)
  barBody = Bodies.rectangle(pivotX, pivotY, barLength, BAR_THICKNESS, {
    isStatic: true,
    friction: 0.8, // High friction so things roll instead of slide
    frictionStatic: 0.1, // Small static friction
    restitution: 0.0,
    label: "bar",
    chamfer: {
      radius: 2,
    },
  });

  // Scale car based on screen size and selected style
  const scale = isMobile ? 0.7 : 0.9;
  const carWidth = CAR_WIDTH * scale * selectedCarStyle.widthScale;
  const carHeight = CAR_HEIGHT * scale * selectedCarStyle.heightScale;
  const wheelSize = WHEEL_SIZE * scale * selectedCarStyle.wheelScale;

  // Create the car composite - positioned slightly above the bar to drop down
  // The drop height should be modest so the car lands gently
  const dropHeight = wheelSize * 4;
  car = createCar(
    pivotX,
    pivotY - dropHeight,
    carWidth,
    carHeight,
    wheelSize,
    selectedCarStyle,
  );

  // Add everything to the world
  World.add(world, barBody);
  World.add(world, car.composite);

  // Set up collision detection
  Events.on(engine, "collisionStart", handleCollision);

  console.log("[initPhysics] Bar at", pivotX, pivotY, "length:", barLength);
  console.log("[initPhysics] Car starting at", pivotX, pivotY - dropHeight);
}

function handleCollision(event: Matter.IEventCollision<Matter.Engine>): void {
  for (const pair of event.pairs) {
    const labels = [pair.bodyA.label, pair.bodyB.label];

    // Check for bomb-car collision
    if (
      labels.includes("bomb") &&
      (labels.includes("carBody") ||
        labels.includes("wheelA") ||
        labels.includes("wheelB"))
    ) {
      console.log("[handleCollision] Bomb hit car! Game over.");

      // Find which body is the bomb
      const bombBody = pair.bodyA.label === "bomb" ? pair.bodyA : pair.bodyB;

      // Create explosion at bomb position
      createExplosion(bombBody.position.x, bombBody.position.y);

      // Mark bomb as exploded and remove from world
      for (const bomb of bombs) {
        if (bomb.body === bombBody) {
          bomb.exploded = true;
          World.remove(world, bomb.body);
          break;
        }
      }

      // End the game - bomb hit the car!
      endGame();
      return;
    }

    // Check for coin-car collision
    if (
      labels.includes("coin") &&
      (labels.includes("carBody") ||
        labels.includes("wheelA") ||
        labels.includes("wheelB") ||
        labels.includes("bar"))
    ) {
      // If it hits the bar, it just bounces. We only collect if it hits the car.
      // Wait, let's allow it to bounce on the bar, but collect if it hits the car.
      if (
        labels.includes("carBody") ||
        labels.includes("wheelA") ||
        labels.includes("wheelB")
      ) {
        const coinBody = pair.bodyA.label === "coin" ? pair.bodyA : pair.bodyB;

        for (const coin of coins) {
          if (coin.body === coinBody && !coin.collected) {
            coin.collected = true;
            World.remove(world, coin.body);
            gameState.coins += 10; // 10 coins per pickup
            updateCoinDisplay();
            savePersistentState();
            haptic("success");
            // Play coin sound
            if (settings.fx) playCoinSound();
            break;
          }
        }
      }
    }
  }
}

function resetPhysics(): void {
  console.log("[resetPhysics] Resetting physics world");

  // Clear events
  Events.off(engine, "collisionStart", handleCollision);

  // Clear the world
  World.clear(world, false);
  Engine.clear(engine);

  // Reinitialize
  initPhysics();
}

function resizeCanvas(): void {
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;

  // Calculate layout
  pivotX = w / 2;
  pivotY = h * 0.5;
  // Use wider bar on mobile for better gameplay
  const mobileRatio = isMobile ? 0.9 : BAR_LENGTH_RATIO;
  barLength = Math.min(w * mobileRatio, 550);
  waterLevel = h * (1 - WATER_HEIGHT_RATIO);

  console.log("[resizeCanvas] Canvas resized to", w, "x", h);

  // Update bar position if it exists
  if (barBody) {
    Body.setPosition(barBody, { x: pivotX, y: pivotY });
    // Re-scale the bar (would need to recreate it for proper scaling)
  }
}

// ============================================================================
// SETTINGS HELPERS
// ============================================================================

function haptic(
  type: "light" | "medium" | "heavy" | "success" | "error",
): void {
  if (!settings.haptics) return;
  oasiz.triggerHaptic(type);
}

function playFx(fn: () => void): void {
  if (!settings.fx) return;
  fn();
}

// ============================================================================
// INPUT HANDLING
// ============================================================================

function setupInputHandlers(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      holdingLeft = true;
    }
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      holdingRight = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      holdingLeft = false;
    }
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      holdingRight = false;
    }
  });

  // Touch/Mouse for control buttons
  const btnLeft = document.getElementById("btn-left")!;
  const btnRight = document.getElementById("btn-right")!;

  // Left button - tilts beam so left side goes DOWN (holdingRight action)
  btnLeft.addEventListener("mousedown", () => {
    holdingRight = true;
    btnLeft.classList.add("active");
    haptic("light");
  });
  btnLeft.addEventListener("mouseup", () => {
    holdingRight = false;
    btnLeft.classList.remove("active");
  });
  btnLeft.addEventListener("mouseleave", () => {
    holdingRight = false;
    btnLeft.classList.remove("active");
  });
  btnLeft.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      holdingRight = true;
      btnLeft.classList.add("active");
      haptic("light");
    },
    { passive: false },
  );
  btnLeft.addEventListener("touchend", () => {
    holdingRight = false;
    btnLeft.classList.remove("active");
  });
  btnLeft.addEventListener("touchcancel", () => {
    holdingRight = false;
    btnLeft.classList.remove("active");
  });

  // Right button - tilts beam so right side goes DOWN (holdingLeft action)
  btnRight.addEventListener("mousedown", () => {
    holdingLeft = true;
    btnRight.classList.add("active");
    haptic("light");
  });
  btnRight.addEventListener("mouseup", () => {
    holdingLeft = false;
    btnRight.classList.remove("active");
  });
  btnRight.addEventListener("mouseleave", () => {
    holdingLeft = false;
    btnRight.classList.remove("active");
  });
  btnRight.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      holdingLeft = true;
      btnRight.classList.add("active");
      haptic("light");
    },
    { passive: false },
  );
  btnRight.addEventListener("touchend", () => {
    holdingLeft = false;
    btnRight.classList.remove("active");
  });
  btnRight.addEventListener("touchcancel", () => {
    holdingLeft = false;
    btnRight.classList.remove("active");
  });
}

// ============================================================================
// UI HANDLING
// ============================================================================

function setupUIHandlers(): void {
  const startBtn = document.getElementById("start-btn")!;
  const startShopBtn = document.getElementById("start-shop-btn")!;
  const restartBtn = document.getElementById("restart-btn")!;
  const galleryBtn = document.getElementById("gallery-btn")!;
  const backBtn = document.getElementById("back-btn")!;
  const buyBtn = document.getElementById("buy-btn")!;

  startBtn.addEventListener("click", startGame);
  startShopBtn.addEventListener("click", openGallery);
  restartBtn.addEventListener("click", restartGame);
  galleryBtn.addEventListener("click", openGallery);
  backBtn.addEventListener("click", closeGallery);

  buyBtn.addEventListener("click", () => {
    // Find the style we are trying to buy from the data attribute
    const carIdToBuy = buyBtn.dataset.carIdToBuy;
    if (!carIdToBuy) return;
    
    const styleToBuy = CAR_STYLES.find(c => c.id === carIdToBuy);
    if (!styleToBuy) return;

    if (
      gameState.coins >= styleToBuy.price &&
      !gameState.unlockedCars.includes(styleToBuy.id)
    ) {
      gameState.coins -= styleToBuy.price;
      gameState.unlockedCars.push(styleToBuy.id);
      gameState.selectedCarId = styleToBuy.id;
      selectedCarStyle = styleToBuy;
      savePersistentState();
      updateCoinDisplay();
      initGallery(); // Refresh UI
      haptic("success");
    } else {
      haptic("error");
    }
  });

  // Settings
  const settingsBtn = document.getElementById("settings-btn")!;
  const settingsPanel = document.getElementById("settings-panel")!;
  const settingsCloseBtn = document.getElementById("settings-close-btn")!;
  const toggleMusic = document.getElementById(
    "toggle-music",
  ) as HTMLInputElement;
  const toggleFx = document.getElementById("toggle-fx") as HTMLInputElement;
  const toggleHaptics = document.getElementById(
    "toggle-haptics",
  ) as HTMLInputElement;

  toggleMusic.checked = settings.music;
  toggleFx.checked = settings.fx;
  toggleHaptics.checked = settings.haptics;

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPanel.classList.remove("hidden");
    haptic("light");
  });

  settingsCloseBtn.addEventListener("click", () => {
    settingsPanel.classList.add("hidden");
    haptic("light");
  });

  settingsPanel.addEventListener("click", (e) => {
    if (e.target === settingsPanel) settingsPanel.classList.add("hidden");
  });

  toggleMusic.addEventListener("change", () => {
    settings.music = toggleMusic.checked;
    saveSettings();
    haptic("light");
    if (settings.music && gamePhase === "playing" && themeMusic) {
      themeMusic.play().catch(() => {});
    } else if (!settings.music && themeMusic) {
      themeMusic.pause();
    }
  });

  toggleFx.addEventListener("change", () => {
    settings.fx = toggleFx.checked;
    saveSettings();
    haptic("light");
  });

  toggleHaptics.addEventListener("change", () => {
    settings.haptics = toggleHaptics.checked;
    saveSettings();
    haptic("light");
  });

  // Initialize gallery with car options
  initGallery();
}

function initGallery(): void {
  const grid = document.getElementById("gallery-grid")!;
  grid.innerHTML = "";

  CAR_STYLES.forEach((style) => {
    const isUnlocked = gameState.unlockedCars.includes(style.id);
    const isSelected = style.id === gameState.selectedCarId;

    const option = document.createElement("div");
    option.className =
      "car-option" +
      (isSelected ? " selected" : "") +
      (!isUnlocked ? " locked" : "");
    option.dataset.carId = style.id;

    // Create mini canvas for car preview
    const canvas = document.createElement("canvas");
    canvas.width = 70;
    canvas.height = 40;
    drawCarPreview(canvas, style, 0.7);

    const name = document.createElement("div");
    name.className = "car-name";
    name.textContent = style.name;

    option.appendChild(canvas);
    option.appendChild(name);

    option.addEventListener("click", () => selectCar(style));

    grid.appendChild(option);
  });

  // Update the large preview
  updatePreview();
}

function updatePreview(): void {
  const previewCanvas = document.getElementById(
    "preview-canvas",
  ) as HTMLCanvasElement;
  const previewName = document.getElementById("preview-name")!;
  const previewPrice = document.getElementById("preview-price")!;
  const buyBtn = document.getElementById("buy-btn") as HTMLButtonElement;

  // Clear and redraw preview
  const ctx = previewCanvas.getContext("2d")!;
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  
  // Use a temporary style variable based on what we are currently viewing
  // The global selectedCarStyle is only updated when we actually equip/unlock a car
  const styleToPreview = selectedCarStyle; // This will temporarily hold the clicked car due to selectCar logic
  
  drawCarPreview(previewCanvas, styleToPreview, 1.5);

  previewName.textContent = styleToPreview.name;

  const isUnlocked = gameState.unlockedCars.includes(styleToPreview.id);
  if (isUnlocked) {
    previewPrice.textContent = "Unlocked";
    previewPrice.style.color = "#228b22";
    buyBtn.style.display = "none";
  } else {
    previewPrice.textContent = `Cost: ${styleToPreview.price} Coins`;
    previewPrice.style.color = "#b8860b";
    buyBtn.style.display = "block";
    if (gameState.coins >= styleToPreview.price) {
      buyBtn.style.opacity = "1";
      buyBtn.disabled = false;
      // We need to store which car we are about to buy in a data attribute
      buyBtn.dataset.carIdToBuy = styleToPreview.id;
    } else {
      buyBtn.style.opacity = "0.5";
      buyBtn.disabled = true;
    }
  }
}

function selectCar(style: CarStyle): void {
  console.log("[selectCar] Selected:", style.name);
  haptic("light");
  
  const isUnlocked = gameState.unlockedCars.includes(style.id);
  if (isUnlocked) {
    selectedCarStyle = style;
    gameState.selectedCarId = style.id;
    savePersistentState();
  }

  // Always show preview of the clicked car, whether unlocked or not
  // but we don't set it as the active equipped car unless unlocked
  
  // Update selection UI to show which one is currently clicked/previewed
  document.querySelectorAll(".car-option").forEach((el) => {
    const elId = (el as HTMLElement).dataset.carId;
    // Highlight the one that is currently selected in state
    el.classList.toggle("selected", elId === gameState.selectedCarId);
    
    // You could also add a 'previewing' class here if you want to highlight the one being previewed
  });

  // Temporarily use the clicked style for the preview function
  const previousStyle = selectedCarStyle;
  selectedCarStyle = style;
  updatePreview();
  // Restore the actual selected style so it doesn't bleed into the game
  selectedCarStyle = isUnlocked ? style : previousStyle;
}

function drawCarPreview(canvas: HTMLCanvasElement, style: CarStyle, scale: number): void {
  const ctx = canvas.getContext('2d')!;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2 + 5;
  
  // Scale dimensions for preview
  const baseWidth = 40 * scale;
  const baseHeight = 12 * scale;
  const baseWheel = 8 * scale;
  
  const bodyWidth = baseWidth * style.widthScale;
  const bodyHeight = baseHeight * style.heightScale;
  const wheelRadius = baseWheel * style.wheelScale;
  const wheelBase = bodyWidth * 0.38;
  const wheelY = centerY + wheelRadius * 0.3;
  
  // Draw shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(centerX, centerY + wheelRadius + 3, bodyWidth * 0.45, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw left wheel
  ctx.fillStyle = style.wheelColor;
  ctx.beginPath();
  ctx.arc(centerX - wheelBase, wheelY, wheelRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = style.hubColor;
  ctx.beginPath();
  ctx.arc(centerX - wheelBase, wheelY, wheelRadius * 0.45, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw right wheel
  ctx.fillStyle = style.wheelColor;
  ctx.beginPath();
  ctx.arc(centerX + wheelBase, wheelY, wheelRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = style.hubColor;
  ctx.beginPath();
  ctx.arc(centerX + wheelBase, wheelY, wheelRadius * 0.45, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw body (on top of wheels)
  ctx.fillStyle = style.bodyColor;
  ctx.beginPath();
  ctx.roundRect(centerX - bodyWidth / 2, centerY - bodyHeight, bodyWidth, bodyHeight, bodyHeight / 3);
  ctx.fill();
  ctx.strokeStyle = style.bodyStroke;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw custom designs based on style
  ctx.save();
  ctx.translate(centerX, centerY);

  switch (style.id) {
    case "racer":
      // Spoiler for preview
      ctx.fillStyle = style.bodyColor;
      ctx.beginPath();
      ctx.moveTo(-bodyWidth / 2 + 5, -bodyHeight);
      ctx.lineTo(-bodyWidth / 2 - 10, -bodyHeight - 10);
      ctx.lineTo(-bodyWidth / 2 + 5, -bodyHeight - 10);
      ctx.lineTo(-bodyWidth / 2 + 15, -bodyHeight);
      ctx.fill();
      ctx.stroke();

      // Racing stripes
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-bodyWidth / 4, -bodyHeight, bodyWidth / 2, bodyHeight);
      break;

    case "monster":
      // Engine block sticking out
      ctx.fillStyle = "#555";
      ctx.fillRect(bodyWidth * 0.1, -bodyHeight - 8, 12, 10);
      ctx.strokeRect(bodyWidth * 0.1, -bodyHeight - 8, 12, 10);
      ctx.fillStyle = "#ff6600";
      ctx.beginPath();
      ctx.moveTo(bodyWidth * 0.1 + 6, -bodyHeight - 8);
      ctx.lineTo(bodyWidth * 0.1 + 2, -bodyHeight - 14);
      ctx.lineTo(bodyWidth * 0.1 + 10, -bodyHeight - 14);
      ctx.fill();
      break;

    case "tank":
      // Tank barrel for preview
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(bodyWidth / 2 - 5, -bodyHeight * 0.75, 25, bodyHeight * 0.4);
      ctx.strokeRect(bodyWidth / 2 - 5, -bodyHeight * 0.75, 25, bodyHeight * 0.4);

      // Turret dome
      ctx.fillStyle = style.bodyColor;
      ctx.beginPath();
      ctx.arc(0, -bodyHeight, bodyHeight / 2, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      break;
      
    case "cruiser":
      // Surfboard on top
      ctx.fillStyle = "#f5f5dc";
      ctx.beginPath();
      ctx.ellipse(0, -bodyHeight - 4, 20, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Stripe on surfboard
      ctx.fillStyle = "#e63946";
      ctx.beginPath();
      ctx.ellipse(0, -bodyHeight - 4, 10, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case "mini":
      // Cute antenna
      ctx.strokeStyle = "#222";
      ctx.beginPath();
      ctx.moveTo(bodyWidth * 0.3, -bodyHeight);
      ctx.lineTo(bodyWidth * 0.3, -bodyHeight - 15);
      ctx.stroke();
      ctx.fillStyle = "#ff1744";
      ctx.beginPath();
      ctx.arc(bodyWidth * 0.3, -bodyHeight - 15, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;

    case "dragon":
      // Spikes on the back
      ctx.fillStyle = "#27ae60";
      ctx.beginPath();
      ctx.moveTo(-bodyWidth * 0.4, -bodyHeight);
      ctx.lineTo(-bodyWidth * 0.3, -bodyHeight - 10);
      ctx.lineTo(-bodyWidth * 0.2, -bodyHeight);
      ctx.lineTo(-bodyWidth * 0.1, -bodyHeight - 12);
      ctx.lineTo(0, -bodyHeight);
      ctx.lineTo(bodyWidth * 0.1, -bodyHeight - 10);
      ctx.lineTo(bodyWidth * 0.2, -bodyHeight);
      ctx.fill();
      ctx.stroke();
      break;

    case "alien":
      // Glass dome
      ctx.fillStyle = "rgba(46, 204, 113, 0.5)";
      ctx.beginPath();
      ctx.arc(0, -bodyHeight + 2, bodyWidth * 0.3, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      // Alien head inside
      ctx.fillStyle = "#27ae60";
      ctx.beginPath();
      ctx.arc(0, -bodyHeight + 2, bodyWidth * 0.15, Math.PI, 0);
      ctx.fill();
      break;

    case "space":
      // Rocket thruster
      ctx.fillStyle = "#7f8c8d";
      ctx.fillRect(-bodyWidth / 2 - 10, -bodyHeight * 0.8, 10, bodyHeight * 0.6);
      ctx.strokeRect(-bodyWidth / 2 - 10, -bodyHeight * 0.8, 10, bodyHeight * 0.6);
      // Flame
      ctx.fillStyle = "#e74c3c";
      ctx.beginPath();
      ctx.moveTo(-bodyWidth / 2 - 10, -bodyHeight * 0.8);
      ctx.lineTo(-bodyWidth / 2 - 25, -bodyHeight * 0.5);
      ctx.lineTo(-bodyWidth / 2 - 10, -bodyHeight * 0.2);
      ctx.fill();
      break;

    case "spy":
      // Sleek fin and radar
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.moveTo(-bodyWidth * 0.3, -bodyHeight);
      ctx.lineTo(-bodyWidth * 0.4, -bodyHeight - 8);
      ctx.lineTo(-bodyWidth * 0.2, -bodyHeight);
      ctx.fill();
      ctx.stroke();
      break;

    case "animal":
      // Animal ears
      ctx.fillStyle = style.bodyColor;
      ctx.beginPath();
      ctx.moveTo(-bodyWidth * 0.2, -bodyHeight);
      ctx.lineTo(-bodyWidth * 0.1, -bodyHeight - 10);
      ctx.lineTo(0, -bodyHeight);
      ctx.moveTo(0, -bodyHeight);
      ctx.lineTo(bodyWidth * 0.1, -bodyHeight - 10);
      ctx.lineTo(bodyWidth * 0.2, -bodyHeight);
      ctx.fill();
      ctx.stroke();
      // Animal nose
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(bodyWidth * 0.4, -bodyHeight * 0.5, 3, 0, Math.PI * 2);
      ctx.fill();
      break;

    case "ghost":
      // Ghost tail
      ctx.fillStyle = style.bodyColor;
      ctx.beginPath();
      ctx.moveTo(-bodyWidth / 2, -bodyHeight);
      ctx.quadraticCurveTo(-bodyWidth / 2 - 15, -bodyHeight / 2, -bodyWidth / 2, 0);
      ctx.fill();
      // Spooky eyes
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(bodyWidth * 0.2, -bodyHeight * 0.6, 2, 0, Math.PI * 2);
      ctx.arc(bodyWidth * 0.35, -bodyHeight * 0.6, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

function openGallery(): void {
  console.log("[openGallery] Opening gallery");
  document.getElementById("game-over")!.classList.add("hidden");
  document.getElementById("start-screen")!.classList.add("hidden");
  document.getElementById("gallery")!.classList.remove("hidden");

  // Refresh gallery to update selection
  initGallery();
}

function closeGallery(): void {
  console.log("[closeGallery] Closing gallery");
  document.getElementById("gallery")!.classList.add("hidden");
  if (gamePhase === "gameOver") {
    document.getElementById("game-over")!.classList.remove("hidden");
  } else {
    document.getElementById("start-screen")!.classList.remove("hidden");
  }
}

function startGame(): void {
  console.log("[startGame] Starting game");

  if (typeof (oasiz as any).gameplayStart === 'function') {
    (oasiz as any).gameplayStart();
  }
  haptic("light");
  gamePhase = "playing";
  gameTime = 0;

  // Start theme music
  if (themeMusic && settings.music) {
    themeMusic.currentTime = 0;
    themeMusic.play().catch(() => {});
  }
  // Stop game over music if playing
  if (gameOverMusic) {
    gameOverMusic.pause();
    gameOverMusic.currentTime = 0;
  }

  // Randomize sky color
  currentSkyColor = SKY_COLORS[Math.floor(Math.random() * SKY_COLORS.length)];
  console.log("[startGame] Sky color:", currentSkyColor);

  // Reset physics accumulators
  hiddenBias = (Math.random() - 0.5) * 0.002; // Start with random hidden bias
  velocityAccumulator = 0;
  // Start with small tilt - gives player time to react
  targetBarAngle = (Math.random() > 0.5 ? 1 : -1) * 0.05;
  bombs = [];
  explosions = [];
  nextBombTime = BOMB_START_TIME;
  coins = [];
  nextCoinTime = 3000 + Math.random() * 2000;
  waterParticles = [];
  lastTime = performance.now();

  // Reset input states
  holdingLeft = false;
  holdingRight = false;

  // Reset physics
  resetPhysics();

  // Apply initial tilt to bar
  Body.setAngle(barBody, targetBarAngle);

  // Show HUD, controls, and settings
  document.getElementById("start-screen")!.classList.add("hidden");
  document.getElementById("hud")!.classList.remove("hidden");
  document.getElementById("settings-btn")!.classList.remove("hidden");
  document.getElementById("settings-panel")!.classList.add("hidden");
  if (isMobile) {
    document.getElementById("controls")!.classList.remove("hidden");
  }
}

function restartGame(): void {
  console.log("[restartGame] Restarting game");

  haptic("light");
  document.getElementById("game-over")!.classList.add("hidden");
  startGame();
}

function playSplashSound(): void {
  try {
    // Create audio context if needed
    if (!audioContext) {
      audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
    }

    const ctx = audioContext;
    const now = ctx.currentTime;

    // Cute "doink" sound - bouncy spring effect
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // High pitched bounce - starts high, dips, then settles
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(800, now);
    osc1.frequency.exponentialRampToValueAtTime(300, now + 0.08);
    osc1.frequency.exponentialRampToValueAtTime(500, now + 0.12);
    osc1.frequency.exponentialRampToValueAtTime(200, now + 0.2);

    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc1.start(now);
    osc1.stop(now + 0.25);

    // Add a cute "bloop" overtone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1200, now);
    osc2.frequency.exponentialRampToValueAtTime(400, now + 0.1);

    gain2.gain.setValueAtTime(0.15, now);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc2.start(now);
    osc2.stop(now + 0.12);

    console.log("[playSplashSound] Playing doink sound");
  } catch (e) {
    console.log("[playSplashSound] Audio not available");
  }
}

function playCoinSound(): void {
  try {
    if (!audioContext) {
      audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
    }

    const ctx = audioContext;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.setValueAtTime(1600, now + 0.1);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) {
    console.log("[playCoinSound] Audio not available");
  }
}

function endGame(): void {
  console.log(
    "[endGame] Game over at",
    (gameTime / 1000).toFixed(1),
    "seconds",
  );

  if (typeof (oasiz as any).gameplayStop === 'function') {
    (oasiz as any).gameplayStop();
  }
  gamePhase = "gameOver";
  haptic("error");

  // Stop theme music
  if (themeMusic) {
    themeMusic.pause();
  }

  // Play splash sound
  if (settings.fx) playSplashSound();

  // Play game over music after a short delay
  setTimeout(() => {
    if (gameOverMusic && settings.music) {
      gameOverMusic.currentTime = 0;
      gameOverMusic.play().catch(() => {});
    }
  }, 500);

  // Submit score
  const score = Math.floor(gameTime / 100); // Score in tenths of seconds
  oasiz.submitScore(score);

  // Save game state
  savePersistentState();
  oasiz.flushGameState();

  // Create splash particles at car position
  createSplash(car.body.position.x, waterLevel);

  // Update UI
  document.getElementById("hud")!.classList.add("hidden");
  document.getElementById("controls")!.classList.add("hidden");
  document.getElementById("settings-btn")!.classList.add("hidden");
  document.getElementById("settings-panel")!.classList.add("hidden");
  document.getElementById("final-time")!.textContent =
    (gameTime / 1000).toFixed(1) + "s";

  // Delay showing game over screen for splash effect
  setTimeout(() => {
    document.getElementById("game-over")!.classList.remove("hidden");
  }, 800);
}

// ============================================================================
// GAME LOOP
// ============================================================================

function gameLoop(currentTime: number): void {
  // Handle first frame or large time gaps
  if (lastTime === 0 || currentTime - lastTime > 100) {
    lastTime = currentTime;
  }

  const deltaTime = Math.min(currentTime - lastTime, 16.667); // Cap delta for smooth physics
  lastTime = currentTime;

  update(deltaTime);
  render();

  requestAnimationFrame(gameLoop);
}

function update(dt: number): void {
  if (gamePhase === "playing") {
    gameTime += dt;

    // Update bar angle based on input
    updateBarAngle(dt);

    // Apply rolling force to car based on tilt (game feel, not physics)
    applyRollingForce();

    // Update physics engine (use fixed timestep for stability)
    const fixedDelta = Math.min(dt, 16.667);
    Engine.update(engine, fixedDelta);

    // Update bombs
    updateBombs(dt);

    // Update coins
    updateCoins(dt);

    // Check for game over conditions
    checkGameOver();

    // Update timer display
    document.getElementById("timer")!.textContent =
      (gameTime / 1000).toFixed(1) + "s";
  }

  // Always update water particles (for game over splash)
  updateWaterParticles(dt);
}

function updateBarAngle(dt: number): void {
  const currentAngle = barBody.angle;

  // Dead zone around center - makes it impossible to balance perfectly
  const DEAD_ZONE = 0.03; // About 1.7 degrees

  // Apply tilt based on input - bar stays where it is when no key is pressed
  let newAngle = currentAngle;

  if (holdingLeft && !holdingRight) {
    // Tilt left (positive angle)
    newAngle = currentAngle + TILT_SPEED;

    // Skip over the dead zone when crossing from negative to positive
    if (currentAngle < -DEAD_ZONE && newAngle >= -DEAD_ZONE) {
      newAngle = DEAD_ZONE;
    }
  } else if (holdingRight && !holdingLeft) {
    // Tilt right (negative angle)
    newAngle = currentAngle - TILT_SPEED;

    // Skip over the dead zone when crossing from positive to negative
    if (currentAngle > DEAD_ZONE && newAngle <= DEAD_ZONE) {
      newAngle = -DEAD_ZONE;
    }
  }
  // If no key pressed, bar stays at current angle (no auto-centering)
  // No max tilt - bar can rotate freely 360 degrees

  // Rotate bar around pivot point
  Body.setAngle(barBody, newAngle);
  Body.setPosition(barBody, { x: pivotX, y: pivotY });

  // No angular velocity - just set the angle directly
  // This prevents the bar from "pushing" the car when rotating
  Body.setAngularVelocity(barBody, 0);
}

// Hidden bias - even when bar looks level, car will roll in this direction
let hiddenBias = 0;
// Velocity accumulator - acceleration builds up over time
let velocityAccumulator = 0;

function applyRollingForce(): void {
  if (!car || !barBody) return;

  const angle = barBody.angle;

  // Hidden bias that changes randomly - even a "level" bar has a secret slope
  hiddenBias += (Math.random() - 0.5) * 0.0001;
  hiddenBias *= 0.995;
  hiddenBias = Math.max(-0.003, Math.min(0.003, hiddenBias));

  // Effective angle includes hidden bias
  const effectiveAngle = angle + hiddenBias;

  // Strong acceleration from tilt - car picks up speed quickly
  const tiltAcceleration = Math.sin(effectiveAngle) * 0.0008;

  // Velocity builds up fast, decays slowly (high inertia feel)
  velocityAccumulator += tiltAcceleration;
  velocityAccumulator *= 0.998; // Very slow decay = more inertia
  velocityAccumulator = Math.max(-0.015, Math.min(0.015, velocityAccumulator));

  // Position amplifier - runaway effect
  const distFromCenter = (car.body.position.x - pivotX) / barLength;
  const positionMultiplier = 1 + Math.abs(distFromCenter) * 2.5;

  // Minimum force - car is NEVER perfectly still
  const minForce = (Math.random() > 0.5 ? 1 : -1) * 0.0002;

  // Total force
  const totalForce = velocityAccumulator * positionMultiplier + minForce;

  // Apply force to car body
  Body.applyForce(car.body, car.body.position, {
    x: totalForce,
    y: 0,
  });

  // Apply to wheels
  Body.applyForce(car.wheelA, car.wheelA.position, {
    x: totalForce * 0.5,
    y: 0,
  });
  Body.applyForce(car.wheelB, car.wheelB.position, {
    x: totalForce * 0.5,
    y: 0,
  });
}

function updateBombs(dt: number): void {
  // Spawn new bombs after 30 seconds
  if (gameTime >= BOMB_START_TIME && gameTime >= nextBombTime) {
    spawnBomb();

    // Calculate next bomb time with increasing frequency
    const elapsed = gameTime - BOMB_START_TIME;
    const interval = Math.max(
      BOMB_MIN_INTERVAL,
      BOMB_INITIAL_INTERVAL - elapsed * 0.03,
    );
    nextBombTime = gameTime + interval;
  }

  // Update existing bombs
  for (const bomb of bombs) {
    if (bomb.warningTime > 0) {
      bomb.warningTime -= dt;
      if (bomb.warningTime <= 0) {
        bomb.dropping = true;
        // Create physics body for bomb
        bomb.body = Bodies.circle(bomb.x, -50, BOMB_RADIUS, {
          friction: 0.8,
          frictionAir: 0.02,
          restitution: 0.2,
          density: 0.008,
          label: "bomb",
        });
        World.add(world, bomb.body);
      }
    } else if (bomb.dropping && !bomb.exploded && bomb.body) {
      bomb.y = bomb.body.position.y;
      const bombX = bomb.body.position.x;
      const bombY = bomb.body.position.y;

      // Calculate bar surface Y at bomb's X position
      const bombXRelativeToPivot = bombX - pivotX;
      const barSurfaceY =
        pivotY - Math.sin(barBody.angle) * bombXRelativeToPivot;

      // Check if bomb hit the bar
      if (
        bombY >= barSurfaceY - BOMB_RADIUS &&
        bombX >= pivotX - barLength / 2 &&
        bombX <= pivotX + barLength / 2
      ) {
        // Bomb hit the bar - explode!
        createExplosion(bombX, bombY);
        bomb.exploded = true;
        World.remove(world, bomb.body);

        // Check if bomb explosion is close enough to the car
        const carDist = Math.sqrt(
          Math.pow(bombX - car.body.position.x, 2) +
            Math.pow(bombY - car.body.position.y, 2),
        );

        // Explosion radius is larger than bomb - if car is within blast radius, game over
        const explosionRadius = BOMB_RADIUS * 3;
        if (carDist < explosionRadius + car.bodyWidth / 2) {
          // Bomb explosion hit the car - game over!
          console.log(
            "[updateBombs] Bomb explosion hit the car! Distance:",
            carDist.toFixed(0),
          );
          endGame();
          return;
        }
        continue;
      }

      // Check if bomb fell into water
      if (bombY > waterLevel) {
        createExplosion(bombX, waterLevel - 10);
        bomb.exploded = true;
        World.remove(world, bomb.body);
        createSplash(bombX, waterLevel);
      }
    }
  }

  // Update explosions
  for (const explosion of explosions) {
    explosion.time += dt;
  }
  explosions = explosions.filter((e) => e.time < e.maxTime);

  // Remove old exploded bombs
  bombs = bombs.filter((b) => !b.exploded);
}

function createExplosion(x: number, y: number): void {
  haptic("heavy");
  explosions.push({
    x,
    y,
    time: 0,
    maxTime: 500,
  });
}

function spawnBomb(): void {
  // Random position, biased toward where the car is
  const carBias = car.body.position.x * 0.3;
  const randomOffset = (Math.random() - 0.5) * barLength * 0.8;
  const x = Math.max(
    pivotX - barLength / 2 + 50,
    Math.min(
      pivotX + barLength / 2 - 50,
      carBias + pivotX * 0.7 + randomOffset,
    ),
  );

  bombs.push({
    x,
    y: -50,
    warningTime: BOMB_WARNING_TIME,
    dropping: false,
    exploded: false,
    body: null,
  });

  console.log("[spawnBomb] Bomb spawned at x:", x.toFixed(0));
}

function updateCoins(dt: number): void {
  if (gameTime >= nextCoinTime) {
    spawnCoin();
    // Next coin between 3 and 8 seconds
    nextCoinTime = gameTime + 3000 + Math.random() * 5000;
  }

  for (const coin of coins) {
    if (!coin.collected) {
      coin.y = coin.body.position.y;

      // Check if coin fell in water
      if (coin.y > waterLevel) {
        coin.collected = true;
        World.remove(world, coin.body);
        createSplash(coin.body.position.x, waterLevel);
      }
    }
  }

  coins = coins.filter((c) => !c.collected);
}

function spawnCoin(): void {
  const x = pivotX + (Math.random() - 0.5) * barLength * 0.9;

  const coinBody = Bodies.circle(x, -50, 15, {
    friction: 0.8,
    frictionAir: 0.02,
    restitution: 0.5,
    density: 0.005,
    label: "coin",
    render: {
      fillStyle: "#ffd700",
      strokeStyle: "#b8860b",
      lineWidth: 2,
    },
  });

  World.add(world, coinBody);

  coins.push({
    body: coinBody,
    collected: false,
    y: -50,
  });
}

function checkGameOver(): void {
  // Check if any part of the car fell into water
  const lowestY = Math.max(
    car.body.position.y,
    car.wheelA.position.y,
    car.wheelB.position.y,
  );

  if (lowestY > waterLevel) {
    endGame();
    return;
  }

  // Check if car went too far off screen
  if (car.body.position.x < -100 || car.body.position.x > w + 100) {
    endGame();
    return;
  }
}

// ============================================================================
// WATER EFFECTS
// ============================================================================

function createSplash(x: number, y: number): void {
  haptic("medium");
  const particleCount = 30;
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.PI + (Math.random() - 0.5) * Math.PI;
    const speed = 5 + Math.random() * 10;
    waterParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5,
      life: 1,
      maxLife: 0.5 + Math.random() * 0.5,
    });
  }
}

function updateWaterParticles(dt: number): void {
  const dtSeconds = dt / 1000;

  for (const p of waterParticles) {
    p.vy += 15 * dtSeconds; // Gravity
    p.x += p.vx;
    p.y += p.vy;
    p.life -= dtSeconds / p.maxLife;
  }

  waterParticles = waterParticles.filter((p) => p.life > 0);
}

// ============================================================================
// RENDERING
// ============================================================================

function render(): void {
  // Clear canvas - randomized sky color
  ctx.fillStyle = currentSkyColor;
  ctx.fillRect(0, 0, w, h);

  // Draw water
  drawWater();

  // Draw seesaw
  drawSeesaw();

  // Draw coins
  drawCoins();

  // Draw bomb warnings and bombs
  drawBombs();

  // Draw car (using physics body positions)
  drawCar();

  // Draw water particles (on top)
  drawWaterParticles();
}

function drawWater(): void {
  const time = performance.now() * 0.001;

  // Simple blue water with wavy line
  ctx.fillStyle = "#4a90c2";
  ctx.beginPath();
  ctx.moveTo(-10, h);

  // Draw wave top - extend past edges to ensure full coverage
  for (let x = -10; x <= w + 10; x += 8) {
    const waveY =
      waterLevel + Math.sin(x * WAVE_FREQUENCY + time * 1.5) * WAVE_AMPLITUDE;
    ctx.lineTo(x, waveY);
  }

  ctx.lineTo(w + 10, h);
  ctx.closePath();
  ctx.fill();

  // Draw wavy outline on top
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(
    -10,
    waterLevel + Math.sin(-10 * WAVE_FREQUENCY + time * 1.5) * WAVE_AMPLITUDE,
  );

  for (let x = -10; x <= w + 10; x += 8) {
    const waveY =
      waterLevel + Math.sin(x * WAVE_FREQUENCY + time * 1.5) * WAVE_AMPLITUDE;
    ctx.lineTo(x, waveY);
  }
  ctx.stroke();
}

function drawSeesaw(): void {
  ctx.save();
  ctx.translate(pivotX, pivotY);

  // Draw pivot - straight vertical line extending into the ocean (T shape)
  ctx.strokeStyle = COLORS.pivot;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";

  // Line extends from pivot down to bottom of screen
  const lineLength = h - pivotY + 20; // Goes past the bottom
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, lineLength);
  ctx.stroke();

  // Draw bar - solid black
  ctx.rotate(barBody.angle);

  // Bar fill - solid black
  ctx.fillStyle = COLORS.bar;
  ctx.beginPath();
  ctx.roundRect(
    -barLength / 2,
    -BAR_THICKNESS / 2,
    barLength,
    BAR_THICKNESS,
    3,
  );
  ctx.fill();

  ctx.restore();
}

function drawCoins(): void {
  for (const coin of coins) {
    if (!coin.collected && coin.body) {
      ctx.save();
      ctx.translate(coin.body.position.x, coin.body.position.y);
      ctx.rotate(coin.body.angle);

      // Coin body
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();

      // Coin outline
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner circle
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.stroke();

      // "C" text
      ctx.fillStyle = "#b8860b";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("C", 0, 1);

      ctx.restore();
    }
  }
}

function drawBombs(): void {
  // Draw explosions first (behind bombs)
  for (const explosion of explosions) {
    const progress = explosion.time / explosion.maxTime;
    const size = 30 + progress * 60;
    const alpha = 1 - progress;

    // Outer explosion (orange/yellow)
    const gradient = ctx.createRadialGradient(
      explosion.x,
      explosion.y,
      0,
      explosion.x,
      explosion.y,
      size,
    );
    gradient.addColorStop(0, "rgba(255, 200, 50, " + alpha + ")");
    gradient.addColorStop(0.4, "rgba(255, 100, 20, " + alpha * 0.8 + ")");
    gradient.addColorStop(0.7, "rgba(200, 50, 0, " + alpha * 0.5 + ")");
    gradient.addColorStop(1, "rgba(100, 20, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, size, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    if (progress < 0.3) {
      ctx.fillStyle = "rgba(255, 255, 200, " + alpha * 1.5 + ")";
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const bomb of bombs) {
    // Draw warning indicator - extends to current bar position
    if (bomb.warningTime > 0) {
      const flash = Math.sin(performance.now() * 0.015) > 0;

      // Calculate where bar surface is at bomb's X position
      const bombXRelativeToPivot = bomb.x - pivotX;
      const barSurfaceY =
        pivotY - Math.sin(barBody.angle) * bombXRelativeToPivot;

      // Draw warning line from top to bar (dashed)
      ctx.strokeStyle = flash ? "#ff4444" : "#cc3333";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(bomb.x, 30);
      ctx.lineTo(bomb.x, barSurfaceY - 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw target circle at bar position
      ctx.strokeStyle = flash ? "#ff4444" : "#cc3333";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bomb.x, barSurfaceY, 15, 0, Math.PI * 2);
      ctx.stroke();

      // Draw crosshair
      ctx.beginPath();
      ctx.moveTo(bomb.x - 20, barSurfaceY);
      ctx.lineTo(bomb.x + 20, barSurfaceY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bomb.x, barSurfaceY - 20);
      ctx.lineTo(bomb.x, barSurfaceY + 20);
      ctx.stroke();

      // Draw exclamation at top
      ctx.fillStyle = "#ff4444";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.fillText("!", bomb.x, 28);

      // Draw bomb icon at top
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.arc(bomb.x, 55, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw bomb (hand-drawn style - simple black circle with fuse)
    if (bomb.dropping && !bomb.exploded && bomb.body) {
      ctx.save();
      ctx.translate(bomb.body.position.x, bomb.body.position.y);
      ctx.rotate(bomb.body.angle);

      // Bomb body - simple filled circle
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.arc(0, 0, BOMB_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Bomb outline (hand-drawn)
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Fuse - simple curved line
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -BOMB_RADIUS);
      ctx.quadraticCurveTo(6, -BOMB_RADIUS - 8, 3, -BOMB_RADIUS - 12);
      ctx.stroke();

      // Spark - simple orange dot
      const sparkFlicker = Math.sin(performance.now() * 0.05) * 0.5 + 0.5;
      ctx.fillStyle = "#ff6600";
      ctx.beginPath();
      ctx.arc(3, -BOMB_RADIUS - 12, 4 + sparkFlicker * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }
}

/**
 * Draw the car using physics body positions
 * Renders the car body as a rounded rectangle and wheels as circles with spokes
 */
function drawCar(): void {
  if (!car) return;

  // Use stored fixed dimensions (bounds change when body rotates)
  const bodyWidth = car.bodyWidth;
  const bodyHeight = car.bodyHeight;
  const wheelRadius = car.wheelRadius;
  const style = car.style;

  // Draw car body
  ctx.save();
  ctx.translate(car.body.position.x, car.body.position.y);
  ctx.rotate(car.body.angle);

  // Body shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.roundRect(
    -bodyWidth / 2 + 3,
    -bodyHeight / 2 + 3,
    bodyWidth,
    bodyHeight,
    bodyHeight / 2,
  );
  ctx.fill();

  // Body fill - use style color
  ctx.fillStyle = style.bodyColor;
  ctx.beginPath();
  ctx.roundRect(
    -bodyWidth / 2,
    -bodyHeight / 2,
    bodyWidth,
    bodyHeight,
    bodyHeight / 2,
  );
  ctx.fill();

  // Body outline - use style color
  ctx.strokeStyle = style.bodyStroke;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Windshield (on the right/front of car)
  ctx.fillStyle = "#87ceeb";
  ctx.beginPath();
  ctx.roundRect(
    bodyWidth * 0.1,
    -bodyHeight / 2 + 4,
    bodyWidth * 0.25,
    bodyHeight - 8,
    4,
  );
  ctx.fill();
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw custom designs based on style
  switch (style.id) {
    case "racer":
      // Spoiler for preview
      ctx.fillStyle = style.bodyColor;
      ctx.beginPath();
      ctx.moveTo(-bodyWidth / 2 + 5, -bodyHeight / 2);
      ctx.lineTo(-bodyWidth / 2 - 15, -bodyHeight / 2 - 15);
      ctx.lineTo(-bodyWidth / 2 + 10, -bodyHeight / 2 - 15);
      ctx.lineTo(-bodyWidth / 2 + 20, -bodyHeight / 2);
      ctx.fill();
      ctx.stroke();

      // Racing stripes
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-bodyWidth / 4, -bodyHeight / 2, bodyWidth / 2, bodyHeight);
      break;

    case "monster":
      // Engine block sticking out
      ctx.fillStyle = "#555";
      ctx.fillRect(bodyWidth * 0.1, -bodyHeight / 2 - 12, 18, 15);
      ctx.strokeRect(bodyWidth * 0.1, -bodyHeight / 2 - 12, 18, 15);
      ctx.fillStyle = "#ff6600";
      ctx.beginPath();
      ctx.moveTo(bodyWidth * 0.1 + 9, -bodyHeight / 2 - 12);
      ctx.lineTo(bodyWidth * 0.1 + 3, -bodyHeight / 2 - 21);
      ctx.lineTo(bodyWidth * 0.1 + 15, -bodyHeight / 2 - 21);
      ctx.fill();
      break;

    case "tank":
      // Tank barrel for preview
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(bodyWidth / 2 - 10, -bodyHeight / 4, 40, bodyHeight / 2);
      ctx.strokeRect(bodyWidth / 2 - 10, -bodyHeight / 4, 40, bodyHeight / 2);

      // Turret dome
      ctx.fillStyle = style.bodyColor;
      ctx.beginPath();
      ctx.arc(0, -bodyHeight / 2, bodyHeight / 2, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      break;
      
    case "cruiser":
      // Surfboard on top
      ctx.fillStyle = "#f5f5dc";
      ctx.beginPath();
      ctx.ellipse(0, -bodyHeight / 2 - 6, 30, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Stripe on surfboard
      ctx.fillStyle = "#e63946";
      ctx.beginPath();
      ctx.ellipse(0, -bodyHeight / 2 - 6, 15, 2.25, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case "mini":
      // Cute antenna
      ctx.strokeStyle = "#222";
      ctx.beginPath();
      ctx.moveTo(bodyWidth * 0.3, -bodyHeight / 2);
      ctx.lineTo(bodyWidth * 0.3, -bodyHeight / 2 - 22);
      ctx.stroke();
      ctx.fillStyle = "#ff1744";
      ctx.beginPath();
      ctx.arc(bodyWidth * 0.3, -bodyHeight / 2 - 22, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;

    case "dragon":
      // Spikes on the back
      ctx.fillStyle = "#27ae60";
      ctx.beginPath();
      ctx.moveTo(-bodyWidth * 0.4, -bodyHeight / 2);
      ctx.lineTo(-bodyWidth * 0.3, -bodyHeight / 2 - 15);
      ctx.lineTo(-bodyWidth * 0.2, -bodyHeight / 2);
      ctx.lineTo(-bodyWidth * 0.1, -bodyHeight / 2 - 18);
      ctx.lineTo(0, -bodyHeight / 2);
      ctx.lineTo(bodyWidth * 0.1, -bodyHeight / 2 - 15);
      ctx.lineTo(bodyWidth * 0.2, -bodyHeight / 2);
      ctx.fill();
      ctx.stroke();
      break;

    case "alien":
      // Glass dome
      ctx.fillStyle = "rgba(46, 204, 113, 0.5)";
      ctx.beginPath();
      ctx.arc(0, -bodyHeight / 2 + 2, bodyWidth * 0.3, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      // Alien head inside
      ctx.fillStyle = "#27ae60";
      ctx.beginPath();
      ctx.arc(0, -bodyHeight / 2 + 2, bodyWidth * 0.15, Math.PI, 0);
      ctx.fill();
      break;

    case "space":
      // Rocket thruster
      ctx.fillStyle = "#7f8c8d";
      ctx.fillRect(-bodyWidth / 2 - 15, -bodyHeight * 0.4, 15, bodyHeight * 0.6);
      ctx.strokeRect(-bodyWidth / 2 - 15, -bodyHeight * 0.4, 15, bodyHeight * 0.6);
      // Flame
      ctx.fillStyle = "#e74c3c";
      ctx.beginPath();
      ctx.moveTo(-bodyWidth / 2 - 15, -bodyHeight * 0.4);
      ctx.lineTo(-bodyWidth / 2 - 35, -bodyHeight * 0.1);
      ctx.lineTo(-bodyWidth / 2 - 15, bodyHeight * 0.2);
      ctx.fill();
      break;

    case "spy":
      // Sleek fin and radar
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.moveTo(-bodyWidth * 0.3, -bodyHeight / 2);
      ctx.lineTo(-bodyWidth * 0.4, -bodyHeight / 2 - 12);
      ctx.lineTo(-bodyWidth * 0.2, -bodyHeight / 2);
      ctx.fill();
      ctx.stroke();
      break;

    case "animal":
      // Animal ears
      ctx.fillStyle = style.bodyColor;
      ctx.beginPath();
      ctx.moveTo(-bodyWidth * 0.2, -bodyHeight / 2);
      ctx.lineTo(-bodyWidth * 0.1, -bodyHeight / 2 - 15);
      ctx.lineTo(0, -bodyHeight / 2);
      ctx.moveTo(0, -bodyHeight / 2);
      ctx.lineTo(bodyWidth * 0.1, -bodyHeight / 2 - 15);
      ctx.lineTo(bodyWidth * 0.2, -bodyHeight / 2);
      ctx.fill();
      ctx.stroke();
      // Animal nose
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(bodyWidth * 0.4, -bodyHeight * 0.1, 4, 0, Math.PI * 2);
      ctx.fill();
      break;

    case "ghost":
      // Ghost tail
      ctx.fillStyle = style.bodyColor;
      ctx.beginPath();
      ctx.moveTo(-bodyWidth / 2, -bodyHeight / 2);
      ctx.quadraticCurveTo(-bodyWidth / 2 - 25, 0, -bodyWidth / 2, bodyHeight / 2);
      ctx.fill();
      // Spooky eyes
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(bodyWidth * 0.2, -bodyHeight * 0.1, 3, 0, Math.PI * 2);
      ctx.arc(bodyWidth * 0.35, -bodyHeight * 0.1, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
  }

  // Headlight
  ctx.fillStyle = "#ffeb3b";
  ctx.beginPath();
  ctx.arc(bodyWidth / 2 - 8, 0, 5, 0, Math.PI * 2);
  ctx.fill();

  // Tail light
  ctx.fillStyle = "#ff1744";
  ctx.beginPath();
  ctx.arc(-bodyWidth / 2 + 8, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Draw wheels with style colors
  drawWheel(
    car.wheelA.position.x,
    car.wheelA.position.y,
    car.wheelA.angle,
    wheelRadius,
    style,
  );
  drawWheel(
    car.wheelB.position.x,
    car.wheelB.position.y,
    car.wheelB.angle,
    wheelRadius,
    style,
  );
}

/**
 * Draw a single wheel with spokes
 */
function drawWheel(
  x: number,
  y: number,
  angle: number,
  radius: number,
  style: CarStyle,
): void {
  ctx.save();
  ctx.translate(x, y);

  // Tire shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.arc(2, 2, radius, 0, Math.PI * 2);
  ctx.fill();

  // Tire - use style color
  ctx.fillStyle = style.wheelColor;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // Tire outline
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Hub - use style color
  ctx.fillStyle = style.hubColor;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Spokes (rotate with wheel physics rotation)
  ctx.save();
  ctx.rotate(angle);
  ctx.strokeStyle = COLORS.wheelSpoke;
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const spokeAngle = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(
      Math.cos(spokeAngle) * radius * 0.5,
      Math.sin(spokeAngle) * radius * 0.5,
    );
    ctx.stroke();
  }
  ctx.restore();

  // Center cap
  ctx.fillStyle = style.hubColor;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawWaterParticles(): void {
  for (const p of waterParticles) {
    const alpha = p.life;
    // Hand-drawn style water drops
    ctx.fillStyle = "rgba(74, 144, 194, " + alpha + ")";
    ctx.strokeStyle = "rgba(34, 34, 34, " + alpha * 0.5 + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 + (1 - p.life) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// ============================================================================
// START GAME
// ============================================================================

init();
