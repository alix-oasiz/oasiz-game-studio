import { oasiz } from "@oasiz/sdk";
import * as Tone from "tone";

/**
 * PADDLE BOUNCE - A polished ping-pong arcade game
 *
 * Features:
 * - CSS-drawn hand-drawn style graphics (thick black borders)
 * - Touch drag and keyboard controls
 * - Difficulty scaling with speed ramp
 * - Satisfying animations and visual feedback
 * - Mobile and desktop support
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Paddle
  PADDLE_WIDTH_RATIO: 0.55, // Ratio of screen width (bigger)
  PADDLE_HEIGHT: 32,
  PADDLE_BOTTOM_OFFSET_RATIO: 0.22, // Ratio of screen height
  PADDLE_MAX_SPEED: 28, // For keyboard movement

  // Paddle zones (as ratio of paddle half-width)
  ZONE_CENTER: 0.35, // Dead center - perfect hit (wider for easier hits)
  ZONE_INNER: 0.65, // Close to center - good hit
  ZONE_OUTER: 1.0, // Outer edges - angled hit

  // Ball
  BALL_RADIUS: 20, // Larger ball
  BALL_GRAVITY: 1.0, // Gravity acceleration per frame
  BALL_INITIAL_VY: -26, // Upward velocity on hit
  BALL_CENTER_HIT_VY: -28, // Slightly higher bounce for center hits
  BALL_MAX_VY: 32, // Terminal velocity (faster falling)
  BALL_BOUNCE_DAMPING: 0.92, // Energy loss on wall bounce
  BALL_SPEED_RAMP: 0.02, // +2% per ramp interval
  BALL_SPEED_RAMP_INTERVAL: 5, // Every N bounces
  BALL_MAX_SPEED_MULTIPLIER: 1.6,

  // Bounce angle
  BOUNCE_ANGLE_INFLUENCE: 1.0, // How much hit position affects angle
  MIN_VERTICAL_VELOCITY_RATIO: 0.4, // Prevent near-horizontal bounces

  // Visual
  BORDER_WIDTH: 4,
  PADDLE_BORDER_WIDTH: 5,
  BALL_BORDER_WIDTH: 4,

  // Colors (warm orange theme by default)
  BACKGROUND_COLORS: [
    { bg: "#F5A962", accent: "#E08B3D" }, // Orange
    { bg: "#9DB4A0", accent: "#7A9A7E" }, // Sage green
    { bg: "#E8D06B", accent: "#D4BC4F" }, // Yellow
    { bg: "#E88B8B", accent: "#D46B6B" }, // Coral
    { bg: "#8BB8E8", accent: "#6B9AD4" }, // Sky blue
  ],

  // Animations
  PADDLE_HIT_LIFT: 8,
  PADDLE_HIT_TILT: 0.25, // Amount to squash Y to simulate tilt back (0.25 = 25% squash)
  PADDLE_HIT_DURATION: 150,

  // Particles
  PARTICLE_COUNT: 8,
  PARTICLE_LIFE: 400,

  // Coins
  COIN_SIZE: 32, // Slightly smaller than ball (radius 20 = diam 40)
  COIN_SCORE: 3,
  COIN_SPAWN_MIN: 2500, // 2.5s
  COIN_SPAWN_MAX: 7500, // 7.5s
  COIN_BORDER_WIDTH: 4,
  COIN_SCORE_THRESHOLD: 10,
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";
type HitZone =
  | "center-left"
  | "center-right"
  | "inner"
  | "outer"
  | "top"
  | "bottom";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Coin {
  x: number;
  y: number;
  rotation: number;
  bob: number;
  collected: boolean;
  collectTime: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

// ============= UTILITY FUNCTIONS =============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0x00ff) - amount);
  const b = Math.max(0, (num & 0x0000ff) - amount);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

// ============= GLOBALS =============
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const gameContainer = document.getElementById("game-container")!;

// UI Elements
const startScreen = document.getElementById("startScreen")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const pauseScreen = document.getElementById("pauseScreen")!;
const settingsModal = document.getElementById("settingsModal")!;
const settingsBtn = document.getElementById("settingsBtn")!;
const pauseBtn = document.getElementById("pauseBtn")!;
const finalScore = document.getElementById("finalScore")!;
const paddlePreview = document.getElementById("paddlePreview")!;
const startButton = document.getElementById("startButton")!;

// State
let gameState: GameState = "START";
let w = gameContainer.clientWidth;
let h = gameContainer.clientHeight;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

// Game objects
let paddleX = w / 2;
let paddleY = h - h * CONFIG.PADDLE_BOTTOM_OFFSET_RATIO;
let paddleWidth = w * CONFIG.PADDLE_WIDTH_RATIO;
let paddleTargetX = paddleX;
let paddleLiftOffset = 0;
let paddleLiftTime = 0;
let paddleTiltScale = 1; // Scale Y to simulate tilting back (1 = normal, < 1 = tilted back)
let paddleTiltTime = 0;

let ballX = w / 2;
let ballY = h / 2;
let ballVX = 0;
let ballVY = 0;
let hitStrength = 1; // Multiplier for hit power (increases with score)
let ballTrail: { x: number; y: number; alpha: number }[] = [];
let isFirstBounce = true; // Track if this is the first bounce for spin effect
let lastHitZone: HitZone = "center-left";
let centerHitFlash = 0; // Flash effect timer for center hits

// Score
let score = 0;
let bouncesSinceLastRamp = 0;

// Particles
let particles: Particle[] = [];

// Coins
let coins: Coin[] = [];
let nextCoinSpawnTimer = 0;

// Settings
let settings: Settings = {
  music: localStorage.getItem("paddleBounce_music") !== "false",
  fx: localStorage.getItem("paddleBounce_fx") !== "false",
  haptics: localStorage.getItem("paddleBounce_haptics") !== "false",
};

// Input state
let keysDown: Set<string> = new Set();
let touchStartX = 0;
let touchCurrentX = 0;
let isDragging = false;

// Current color theme
let currentColorIndex = 0;
let bgColor = CONFIG.BACKGROUND_COLORS[0].bg;
let accentColor = CONFIG.BACKGROUND_COLORS[0].accent;

// Paddle image
const paddleImage = new Image();
paddleImage.src = "https://assets.oasiz.ai/assets/paddle-bounce/paddle.png";
let paddleImageLoaded = false;
paddleImage.onload = () => {
  paddleImageLoaded = true;
  console.log("[paddleImage] Paddle image loaded");
};

// Audio
const bgMusic = new Audio("https://assets.oasiz.ai/audio/paddle_song.mp3");
bgMusic.loop = true;
bgMusic.preload = "auto";

// Tap sounds for paddle hits
const hitSynth = new Tone.Synth({
  oscillator: { type: "sine" },
  envelope: { attack: 0.001, decay: 0.01, sustain: 0, release: 0.01 },
}).toDestination();

// Coin collection sound
const coinSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "triangle" },
  envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
}).toDestination();

function playHitSound(isCenterHit: boolean): void {
  if (!settings.fx) return;
  if (Tone.getContext().state !== "running") {
    Tone.start();
  }

  if (isCenterHit) {
    // Crisp "tap" for center
    hitSynth.triggerAttackRelease("F#6", "64n");
  } else {
    // Slightly lower, slightly softer "tap" for outer zones
    hitSynth.triggerAttackRelease("C6", "64n");
  }
}

function playCoinSound(): void {
  if (!settings.fx) return;
  if (Tone.getContext().state !== "running") {
    Tone.start();
  }

  // Sparkling "ding"
  coinSynth.triggerAttackRelease(["C6", "E6", "G6"], "16n");
}

// ============= DRAWING FUNCTIONS =============
function drawBackground(): void {
  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, bgColor);
  gradient.addColorStop(1, darkenColor(bgColor, 20));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Center hit flash effect - bright white flash
  if (centerHitFlash > 0) {
    const flashAlpha = (centerHitFlash / 300) * 0.6;
    ctx.fillStyle = "rgba(255, 255, 255, " + flashAlpha + ")";
    ctx.fillRect(0, 0, w, h);
  }
}

function drawScore(): void {
  // Large score in center (watermark style)
  const scoreText = score.toString();
  const fontSize = Math.min(w * 0.75, 500);
  ctx.font = "700 " + fontSize + "px Fredoka";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = darkenColor(bgColor, 30);
  ctx.globalAlpha = 0.25;
  ctx.fillText(scoreText, w / 2, h * 0.42);

  // "SCORE" label below
  const labelSize = Math.min(w * 0.08, 32);
  ctx.font = "600 " + labelSize + "px Fredoka";
  ctx.fillText("SCORE", w / 2, h * 0.42 + fontSize * 0.4);
  ctx.globalAlpha = 1;
}

function drawPaddle(): void {
  const px = paddleX;
  const py = paddleY - paddleLiftOffset;

  if (paddleImageLoaded) {
    // Use the image asset
    const imgWidth = paddleWidth * 1.1;
    const imgHeight = imgWidth * (paddleImage.height / paddleImage.width);

    // Pivot point for tilt (bottom of paddle face - where hand would hold it)
    const drawY = py - imgHeight * 0.35;
    const pivotY = drawY + imgHeight * 0.7; // Near bottom of paddle

    ctx.save();

    // Apply Y-scale to simulate tilting back towards user
    // Scale from the bottom pivot point
    ctx.translate(px, pivotY);
    ctx.scale(1, paddleTiltScale);
    ctx.translate(-px, -pivotY);

    // Draw shadow
    ctx.globalAlpha = 0.2;
    ctx.drawImage(
      paddleImage,
      px - imgWidth / 2 + 4,
      drawY + 6,
      imgWidth,
      imgHeight,
    );

    // Draw paddle
    ctx.globalAlpha = 1;
    ctx.drawImage(paddleImage, px - imgWidth / 2, drawY, imgWidth, imgHeight);

    ctx.restore();
  } else {
    // Fallback: simple ellipse while image loads
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, paddleTiltScale);
    ctx.translate(-px, -py);
    ctx.fillStyle = "#E85A71";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(
      px,
      py,
      paddleWidth / 2,
      CONFIG.PADDLE_HEIGHT * 0.7,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawBall(): void {
  // Draw trail
  for (let i = 0; i < ballTrail.length; i++) {
    const t = ballTrail[i];
    ctx.beginPath();
    ctx.arc(
      t.x,
      t.y,
      CONFIG.BALL_RADIUS * (0.3 + 0.5 * t.alpha),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "rgba(255, 255, 255, " + t.alpha * 0.3 + ")";
    ctx.fill();
  }

  // Main ball
  ctx.beginPath();
  ctx.arc(ballX, ballY, CONFIG.BALL_RADIUS, 0, Math.PI * 2);

  // Ball gradient (white with highlight)
  const ballGradient = ctx.createRadialGradient(
    ballX - CONFIG.BALL_RADIUS * 0.3,
    ballY - CONFIG.BALL_RADIUS * 0.3,
    0,
    ballX,
    ballY,
    CONFIG.BALL_RADIUS,
  );
  ballGradient.addColorStop(0, "#ffffff");
  ballGradient.addColorStop(0.7, "#f0f0f0");
  ballGradient.addColorStop(1, "#e0e0e0");
  ctx.fillStyle = ballGradient;
  ctx.fill();

  // Thick black border
  ctx.strokeStyle = "#000";
  ctx.lineWidth = CONFIG.BALL_BORDER_WIDTH;
  ctx.stroke();
}

function drawParticles(): void {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, " + alpha + ")";
    ctx.fill();
  }
}

function drawStartScreen(): void {
  // Draw paddle preview SVG
  if (!paddlePreview.innerHTML) {
    const svgWidth = 160;
    const svgHeight = 200;
    paddlePreview.innerHTML =
      '<svg width="' +
      svgWidth +
      '" height="' +
      svgHeight +
      '" viewBox="0 0 100 140">' +
      '<ellipse cx="50" cy="45" rx="44" ry="36" fill="url(#headGrad)" stroke="#000" stroke-width="6"/>' +
      '<rect x="40" y="75" width="20" height="50" rx="3" fill="url(#handleGrad)" stroke="#000" stroke-width="5"/>' +
      '<rect x="36" y="115" width="28" height="15" rx="4" fill="#333" stroke="#000" stroke-width="5"/>' +
      "<defs>" +
      '<linearGradient id="headGrad" x1="0%" y1="0%" x2="0%" y2="100%">' +
      '<stop offset="0%" style="stop-color:#FF5A71"/>' +
      '<stop offset="100%" style="stop-color:#D43A51"/>' +
      "</linearGradient>" +
      '<linearGradient id="handleGrad" x1="0%" y1="0%" x2="100%" y2="0%">' +
      '<stop offset="0%" style="stop-color:#C9A66B"/>' +
      '<stop offset="50%" style="stop-color:#F3D6A5"/>' +
      '<stop offset="100%" style="stop-color:#C9A66B"/>' +
      "</linearGradient>" +
      "</defs>" +
      "</svg>";
  }
}

// ============= GAME LOGIC =============
function resetBall(): void {
  console.log("[resetBall] Resetting ball position");
  ballX = w / 2;
  ballY = h * 0.15;
  ballTrail = [];
  isFirstBounce = true;

  // Start falling straight down
  ballVX = 0;
  ballVY = 0; // Gravity will accelerate it
}

function resetGame(): void {
  console.log("[resetGame] Starting new game");
  score = 0;
  bouncesSinceLastRamp = 0;
  hitStrength = 1;
  paddleX = w / 2;
  paddleTargetX = w / 2;
  paddleLiftOffset = 0;
  particles = [];
  coins = [];
  nextCoinSpawnTimer =
    CONFIG.COIN_SPAWN_MIN +
    Math.random() * (CONFIG.COIN_SPAWN_MAX - CONFIG.COIN_SPAWN_MIN);

  // Pick random color theme
  currentColorIndex = Math.floor(
    Math.random() * CONFIG.BACKGROUND_COLORS.length,
  );
  bgColor = CONFIG.BACKGROUND_COLORS[currentColorIndex].bg;
  accentColor = CONFIG.BACKGROUND_COLORS[currentColorIndex].accent;
  gameContainer.style.background = bgColor;

  resetBall();
}

function spawnParticles(x: number, y: number): void {
  for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
    const angle =
      (Math.PI * 2 * i) / CONFIG.PARTICLE_COUNT + Math.random() * 0.5;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: CONFIG.PARTICLE_LIFE,
      maxLife: CONFIG.PARTICLE_LIFE,
      size: 4 + Math.random() * 4,
    });
  }
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1; // Gravity
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ============= COIN LOGIC =============
function spawnCoin(): void {
  if (score < CONFIG.COIN_SCORE_THRESHOLD) return;

  const margin = 60;
  const paddleYPos = h - h * CONFIG.PADDLE_BOTTOM_OFFSET_RATIO;

  // Calculate how high the ball can reasonably reach
  // Max height = (vy^2) / (2 * g)
  const maxJumpHeight =
    Math.pow(CONFIG.BALL_CENTER_HIT_VY * 1.2, 2) / (2 * CONFIG.BALL_GRAVITY);
  const reachLimitY = Math.max(margin + 50, paddleYPos - maxJumpHeight);

  const coinX = margin + Math.random() * (w - margin * 2);
  const coinY = reachLimitY + Math.random() * (paddleYPos - reachLimitY - 100);

  coins.push({
    x: coinX,
    y: coinY,
    rotation: Math.random() * Math.PI * 2,
    bob: 0,
    collected: false,
    collectTime: 0,
  });

  console.log(
    "[spawnCoin] Coin spawned at:",
    coinX.toFixed(0),
    coinY.toFixed(0),
    "Reach limit Y:",
    reachLimitY.toFixed(0),
  );

  // Set next spawn timer
  nextCoinSpawnTimer =
    CONFIG.COIN_SPAWN_MIN +
    Math.random() * (CONFIG.COIN_SPAWN_MAX - CONFIG.COIN_SPAWN_MIN);
}

function drawCoins(): void {
  for (const coin of coins) {
    if (coin.collected && coin.collectTime > 200) continue;

    ctx.save();

    const bobOffset = Math.sin(Date.now() / 300) * 5;
    const drawY = coin.y + bobOffset;
    const size = CONFIG.COIN_SIZE;
    const alpha = coin.collected ? 1 - coin.collectTime / 200 : 1;
    const scale = coin.collected ? 1 + coin.collectTime / 100 : 1;

    ctx.translate(coin.x, drawY);
    ctx.rotate(
      coin.rotation + (coin.collected ? 0 : Math.sin(Date.now() / 500) * 0.2),
    );
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    // Hand-drawn style slightly rounded square
    const r = 8; // Border radius
    const half = size / 2;

    // Outer thick black border
    ctx.beginPath();
    ctx.roundRect(-half, -half, size, size, r);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = CONFIG.COIN_BORDER_WIDTH;
    ctx.stroke();

    // Gold fill with shiny shades
    const gradient = ctx.createLinearGradient(-half, -half, half, half);
    gradient.addColorStop(0, "#FFD700"); // Gold
    gradient.addColorStop(0.4, "#FFF8DC"); // Cornsilk (shiny highlight)
    gradient.addColorStop(0.6, "#FFD700"); // Gold
    gradient.addColorStop(1, "#DAA520"); // Goldenrod (shadow)
    ctx.fillStyle = gradient;
    ctx.fill();

    // Inner detail (small rounded square)
    ctx.beginPath();
    ctx.roundRect(-half * 0.5, -half * 0.5, half, half, r * 0.5);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }
}

function updateCoins(dt: number): void {
  if (gameState !== "PLAYING") return;

  // Handle spawning
  if (score >= CONFIG.COIN_SCORE_THRESHOLD) {
    nextCoinSpawnTimer -= dt;
    if (nextCoinSpawnTimer <= 0) {
      spawnCoin();
    }
  }

  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];

    if (coin.collected) {
      coin.collectTime += dt;
      if (coin.collectTime > 200) {
        coins.splice(i, 1);
      }
      continue;
    }

    // Ball-Coin collision (simple distance)
    const dist = Math.hypot(ballX - coin.x, ballY - coin.y);
    const threshold = CONFIG.BALL_RADIUS + CONFIG.COIN_SIZE * 0.5;

    if (dist < threshold) {
      collectCoin(coin);
    }
  }
}

function collectCoin(coin: Coin): void {
  coin.collected = true;
  score += CONFIG.COIN_SCORE;

  console.log("[collectCoin] Coin collected! New score:", score);

  // Play coin sound
  playCoinSound();

  if (settings.haptics) {
    oasiz.triggerHaptic("medium");
  }

  // Visual feedback (particles)
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x: coin.x,
      y: coin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 400,
      maxLife: 400,
      size: 3 + Math.random() * 3,
    });
  }
}

function handlePaddleHit(): void {
  // Only increment score on center hits (left or right)
  const isCenterHit =
    lastHitZone === "center-left" || lastHitZone === "center-right";

  // Play hit sound (crisp for center, soft for edges)
  playHitSound(isCenterHit);

  if (isCenterHit) {
    score++;
    console.log(
      "[handlePaddleHit] Center hit! Score:",
      score,
      "zone:",
      lastHitZone,
    );
    if (settings.haptics) {
      oasiz.triggerHaptic("success");
    }
  } else {
    console.log(
      "[handlePaddleHit] Ball hit paddle, zone:",
      lastHitZone,
      "(no score)",
    );
    if (settings.haptics) {
      oasiz.triggerHaptic("medium");
    }
  }
  bouncesSinceLastRamp++;

  // Paddle lift and rotation animation - stronger for center hits
  const liftMultiplier = isCenterHit ? 1.5 : 1;
  paddleLiftOffset = CONFIG.PADDLE_HIT_LIFT * liftMultiplier;
  paddleLiftTime = CONFIG.PADDLE_HIT_DURATION;

  // Tilt effect - squash Y to simulate tilting back on impact
  paddleTiltScale = 1 - CONFIG.PADDLE_HIT_TILT * liftMultiplier;
  paddleTiltTime = CONFIG.PADDLE_HIT_DURATION;

  // Difficulty ramp - increase hit strength over time
  if (bouncesSinceLastRamp >= CONFIG.BALL_SPEED_RAMP_INTERVAL) {
    bouncesSinceLastRamp = 0;
    const maxStrength = CONFIG.BALL_MAX_SPEED_MULTIPLIER;
    if (hitStrength < maxStrength) {
      hitStrength *= 1 + CONFIG.BALL_SPEED_RAMP;
      hitStrength = Math.min(hitStrength, maxStrength);
      console.log(
        "[handlePaddleHit] Hit strength increased to:",
        hitStrength.toFixed(2),
      );
    }
  }
}

function updateBall(): void {
  // Update trail
  ballTrail.unshift({ x: ballX, y: ballY, alpha: 1 });
  if (ballTrail.length > 6) {
    ballTrail.pop();
  }
  for (const t of ballTrail) {
    t.alpha *= 0.8;
  }

  // Apply gravity - ball accelerates downward
  ballVY += CONFIG.BALL_GRAVITY;

  // Cap terminal velocity
  if (ballVY > CONFIG.BALL_MAX_VY) {
    ballVY = CONFIG.BALL_MAX_VY;
  }

  // Move ball
  ballX += ballVX;
  ballY += ballVY;

  // Wall collisions - bounce with energy loss
  if (ballX - CONFIG.BALL_RADIUS < 0) {
    ballX = CONFIG.BALL_RADIUS;
    ballVX = Math.abs(ballVX) * CONFIG.BALL_BOUNCE_DAMPING;
  }
  if (ballX + CONFIG.BALL_RADIUS > w) {
    ballX = w - CONFIG.BALL_RADIUS;
    ballVX = -Math.abs(ballVX) * CONFIG.BALL_BOUNCE_DAMPING;
  }
  if (ballY - CONFIG.BALL_RADIUS < 0) {
    ballY = CONFIG.BALL_RADIUS;
    ballVY = Math.abs(ballVY) * CONFIG.BALL_BOUNCE_DAMPING;
  }

  // Paddle collision - ELLIPTICAL collision detection
  // Calculate paddle image dimensions
  const imgWidth = paddleWidth * 1.1;
  const imgHeight = paddleImageLoaded
    ? imgWidth * (paddleImage.height / paddleImage.width)
    : CONFIG.PADDLE_HEIGHT * 3;
  const paddleDrawY = paddleY - imgHeight * 0.35 - paddleLiftOffset;

  // Define the ellipse representing the paddle face
  // Center of the ellipse (where the rubber face is in the image)
  // Position it at the visual center of the paddle face
  const ellipseCX = paddleX;
  const ellipseCY = paddleDrawY + imgHeight * 0.48; // Much lower - at the paddle face

  // Semi-axes of the ellipse - match the visual paddle face
  const ellipseA = paddleWidth * 0.2; // Horizontal semi-axis (tight to match paddle face)
  const ellipseB = imgHeight * 0.14; // Vertical semi-axis

  // Circle-to-ellipse collision detection
  // Normalize ball position to ellipse space
  const dx = (ballX - ellipseCX) / ellipseA;
  const dy = (ballY - ellipseCY) / ellipseB;
  const normalizedDist = Math.sqrt(dx * dx + dy * dy);

  // Ball touches ellipse when normalized distance is close to 1
  // Account for ball radius by expanding the collision threshold
  const ballRadiusNormalized =
    CONFIG.BALL_RADIUS / Math.min(ellipseA, ellipseB);
  const isColliding =
    normalizedDist <= 1 + ballRadiusNormalized && normalizedDist >= 0.5;

  // Only bounce when ball is moving down and colliding
  if (ballVY > 0 && isColliding) {
    // Calculate hit position in ellipse-relative coordinates
    const hitPosX = dx; // -1 to 1 (left to right on ellipse)
    const absHitPosX = Math.abs(hitPosX);

    // Vertical position: negative = top of ellipse, positive = bottom
    const hitPosY = dy;

    // Determine hit zone based on horizontal position (primary for scoring)
    // hitPosX: -1 to 1 (left to right on ellipse)
    let zone: HitZone;
    if (absHitPosX <= CONFIG.ZONE_CENTER) {
      // Perfect hit zone - split into left and right for skill-based bouncing
      zone = hitPosX < 0 ? "center-left" : "center-right";
    } else if (absHitPosX <= CONFIG.ZONE_INNER) {
      zone = "inner"; // Close to center - good hit
    } else if (hitPosY < -0.7) {
      zone = "top"; // Extreme top edge
    } else if (hitPosY > 0.7) {
      zone = "bottom"; // Extreme bottom edge
    } else {
      zone = "outer"; // Outer edges
    }
    lastHitZone = zone;
    console.log(
      "[updateBall] Hit zone:",
      zone,
      "hitPosX:",
      hitPosX.toFixed(2),
      "absHitPosX:",
      absHitPosX.toFixed(2),
    );

    // Apply zone-specific physics
    let bounceVY = CONFIG.BALL_INITIAL_VY;
    let horizontalInfluence = CONFIG.BOUNCE_ANGLE_INFLUENCE;
    let particleCount = CONFIG.PARTICLE_COUNT;

    switch (zone) {
      case "center-left":
        // Perfect hit on left side - bounce slightly right for skill chaining
        bounceVY = CONFIG.BALL_CENTER_HIT_VY;
        horizontalInfluence = 0.1;
        particleCount = CONFIG.PARTICLE_COUNT * 3;
        centerHitFlash = 300;
        // Add slight rightward nudge to set up next perfect hit
        ballVX += 2;
        console.log("[updateBall] CENTER-LEFT HIT! Bouncing right");
        break;
      case "center-right":
        // Perfect hit on right side - bounce slightly left for skill chaining
        bounceVY = CONFIG.BALL_CENTER_HIT_VY;
        horizontalInfluence = 0.1;
        particleCount = CONFIG.PARTICLE_COUNT * 3;
        centerHitFlash = 300;
        // Add slight leftward nudge to set up next perfect hit
        ballVX -= 2;
        console.log("[updateBall] CENTER-RIGHT HIT! Bouncing left");
        break;
      case "inner":
        // Good hit - strong bounce with slight angle
        bounceVY = CONFIG.BALL_INITIAL_VY * 1.05;
        horizontalInfluence = 0.45;
        break;
      case "outer":
        // Edge hit - weaker bounce, strong angle
        bounceVY = CONFIG.BALL_INITIAL_VY * 0.8;
        horizontalInfluence = 1.1;
        break;
      case "top":
        // Top edge - ball clips over, weak bounce
        bounceVY = CONFIG.BALL_INITIAL_VY * 0.85;
        horizontalInfluence = 0.8;
        break;
      case "bottom":
        // Bottom edge - risky save, unpredictable
        bounceVY = CONFIG.BALL_INITIAL_VY * 0.6;
        horizontalInfluence = 1.3;
        ballVX += (Math.random() - 0.5) * 5; // More randomness
        break;
    }

    // Apply horizontal velocity based on hit position and zone
    const maxHorizontalBoost = 8 * hitStrength;
    ballVX = hitPosX * maxHorizontalBoost * horizontalInfluence;

    // Add randomness to prevent predictable straight bounces
    ballVX += (Math.random() - 0.5) * 4;

    // Add rightward drift on the first bounce only
    if (isFirstBounce) {
      ballVX += 3.5; // Slight rightward drift after first bounce
      isFirstBounce = false;
      console.log("[updateBall] First bounce spin applied");
    }

    // Apply vertical bounce with strength
    ballVY = bounceVY * hitStrength;

    // Position ball tangent to ellipse surface
    // Calculate the point on the ellipse where the ball should be
    const hitAngle = Math.atan2(dy, dx);
    const ellipseSurfaceX = ellipseCX + Math.cos(hitAngle) * ellipseA;
    const ellipseSurfaceY = ellipseCY + Math.sin(hitAngle) * ellipseB;

    // Position ball just above this point (with some margin)
    ballY = ellipseSurfaceY - CONFIG.BALL_RADIUS - 3;

    // Spawn particles at the contact point (more for center hits)
    const isCenterZone = zone === "center-left" || zone === "center-right";
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
      const speed = isCenterZone
        ? 4 + Math.random() * 6
        : 2 + Math.random() * 4;
      particles.push({
        x: ellipseSurfaceX,
        y: ellipseSurfaceY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        life: CONFIG.PARTICLE_LIFE,
        maxLife: CONFIG.PARTICLE_LIFE,
        size: isCenterZone ? 5 + Math.random() * 5 : 4 + Math.random() * 4,
      });
    }

    handlePaddleHit();
  }

  // Game over check
  if (ballY - CONFIG.BALL_RADIUS > h) {
    console.log("[updateBall] Ball fell, game over. Final score:", score);
    gameOver();
  }
}

function updatePaddle(dt: number): void {
  // Paddle lift animation decay
  if (paddleLiftTime > 0) {
    paddleLiftTime -= dt;
    if (paddleLiftTime <= 0) {
      paddleLiftOffset = 0;
    } else {
      paddleLiftOffset =
        CONFIG.PADDLE_HIT_LIFT * (paddleLiftTime / CONFIG.PADDLE_HIT_DURATION);
    }
  }

  // Paddle tilt animation decay
  if (paddleTiltTime > 0) {
    paddleTiltTime -= dt;
    if (paddleTiltTime <= 0) {
      paddleTiltScale = 1;
    } else {
      const tiltProgress = paddleTiltTime / CONFIG.PADDLE_HIT_DURATION;
      paddleTiltScale = 1 - CONFIG.PADDLE_HIT_TILT * tiltProgress;
    }
  }

  // Calculate target position based on input
  if (isDragging) {
    // Touch/mouse control - directly follow the pointer position
    paddleTargetX = clamp(
      touchCurrentX,
      paddleWidth * 0.25,
      w - paddleWidth * 0.25,
    );
  }

  // Keyboard control
  if (keysDown.has("ArrowLeft") || keysDown.has("a") || keysDown.has("A")) {
    paddleTargetX = clamp(
      paddleX - CONFIG.PADDLE_MAX_SPEED,
      paddleWidth * 0.25,
      w - paddleWidth * 0.25,
    );
  }
  if (keysDown.has("ArrowRight") || keysDown.has("d") || keysDown.has("D")) {
    paddleTargetX = clamp(
      paddleX + CONFIG.PADDLE_MAX_SPEED,
      paddleWidth * 0.25,
      w - paddleWidth * 0.25,
    );
  }

  // Instant positioning for touch/mouse, smooth for keyboard
  if (isDragging) {
    paddleX = paddleTargetX; // Instant snap to cursor
  } else {
    paddleX = lerp(paddleX, paddleTargetX, 0.4); // Smooth for keyboard
  }
}

function gameOver(): void {
  gameState = "GAME_OVER";

  oasiz.submitScore(score);
  console.log("[gameOver] Score submitted:", score);
  if (settings.haptics) {
    oasiz.triggerHaptic("error");
  }

  // Update UI
  finalScore.textContent = score.toString();

  // Show game over screen
  startScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
  pauseBtn.classList.add("hidden");
}

function startGame(): void {
  console.log("[startGame] Starting game");
  gameState = "PLAYING";

  // Handle background music and Tone.js start
  if (settings.music || settings.fx) {
    Tone.start();
  }
  if (settings.music) {
    bgMusic
      .play()
      .catch((e) => console.log("[startGame] Audio play failed:", e));
  }

  resetGame();

  // Hide overlays
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");

  // Show game UI
  pauseBtn.classList.remove("hidden");
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  console.log("[pauseGame] Game paused");
  gameState = "PAUSED";
  pauseScreen.classList.remove("hidden");

  // Pause music on pause
  bgMusic.pause();
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  console.log("[resumeGame] Game resumed");
  gameState = "PLAYING";
  pauseScreen.classList.add("hidden");

  // Resume music on resume
  if (settings.music) {
    bgMusic
      .play()
      .catch((e) => console.log("[resumeGame] Audio play failed:", e));
  }
}

function showStartScreen(): void {
  console.log("[showStartScreen] Showing start screen");
  gameState = "START";

  // Handle background music
  if (settings.music) {
    bgMusic
      .play()
      .catch((e) => console.log("[showStartScreen] Audio play failed:", e));
  }

  // Reset color to default
  currentColorIndex = 0;
  bgColor = CONFIG.BACKGROUND_COLORS[0].bg;
  gameContainer.style.background = bgColor;

  // Show start screen
  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  pauseBtn.classList.add("hidden");
}

// ============= INPUT HANDLERS =============
function setupInputHandlers(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    keysDown.add(e.key);

    if (e.key === "Escape") {
      if (gameState === "PLAYING") pauseGame();
      else if (gameState === "PAUSED") resumeGame();
    }
  });

  window.addEventListener("keyup", (e) => {
    keysDown.delete(e.key);
  });

  // Helper to get X position relative to container
  function getRelativeX(clientX: number): number {
    const rect = gameContainer.getBoundingClientRect();
    return clientX - rect.left;
  }

  // Touch
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameState !== "PLAYING") return;

    const touch = e.touches[0];
    touchStartX = getRelativeX(touch.clientX);
    touchCurrentX = touchStartX;
    isDragging = true;
  });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!isDragging || gameState !== "PLAYING") return;
    touchCurrentX = getRelativeX(e.touches[0].clientX);
  });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    isDragging = false;
    paddleTargetX = paddleX;
  });

  // Mouse (for desktop)
  canvas.addEventListener("mousedown", (e) => {
    if (gameState !== "PLAYING") return;

    touchStartX = getRelativeX(e.clientX);
    touchCurrentX = touchStartX;
    isDragging = true;
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDragging || gameState !== "PLAYING") return;
    touchCurrentX = getRelativeX(e.clientX);
  });

  canvas.addEventListener("mouseup", () => {
    isDragging = false;
    paddleTargetX = paddleX;
  });

  const triggerLightHaptic = () => {
    if (settings.haptics) {
      oasiz.triggerHaptic("light");
    }
  };

  // UI Buttons
  startButton.addEventListener("click", () => {
    triggerLightHaptic();
    startGame();
  });

  settingsBtn.addEventListener("click", () => {
    triggerLightHaptic();
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    triggerLightHaptic();
    settingsModal.classList.add("hidden");
  });

  pauseBtn.addEventListener("click", () => {
    triggerLightHaptic();
    pauseGame();
  });
  document.getElementById("resumeButton")!.addEventListener("click", () => {
    triggerLightHaptic();
    resumeGame();
  });
  document
    .getElementById("pauseRestartButton")!
    .addEventListener("click", () => {
      triggerLightHaptic();
      pauseScreen.classList.add("hidden");
      startGame();
    });
  document.getElementById("pauseMenuButton")!.addEventListener("click", () => {
    triggerLightHaptic();
    showStartScreen();
  });

  document.getElementById("restartButton")!.addEventListener("click", () => {
    triggerLightHaptic();
    startGame();
  });
  document
    .getElementById("backToStartButton")!
    .addEventListener("click", () => {
      triggerLightHaptic();
      showStartScreen();
    });

  // Settings toggles
  const musicToggle = document.getElementById("musicToggle")!;
  const fxToggle = document.getElementById("fxToggle")!;
  const hapticsToggle = document.getElementById("hapticsToggle")!;

  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticsToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    triggerLightHaptic();
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    localStorage.setItem("paddleBounce_music", settings.music.toString());

    if (settings.music) {
      if (gameState === "PLAYING" || gameState === "START") {
        bgMusic
          .play()
          .catch((e) => console.log("[musicToggle] Audio play failed:", e));
      }
    } else {
      bgMusic.pause();
    }
  });

  fxToggle.addEventListener("click", () => {
    triggerLightHaptic();
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    localStorage.setItem("paddleBounce_fx", settings.fx.toString());

    if (settings.fx) {
      Tone.start();
    }
  });

  hapticsToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticsToggle.classList.toggle("active", settings.haptics);
    localStorage.setItem("paddleBounce_haptics", settings.haptics.toString());

    // Trigger haptic after toggling on to show it works
    if (settings.haptics) {
      triggerLightHaptic();
    }
  });
}

// ============= RESIZE HANDLER =============
function resizeCanvas(): void {
  w = gameContainer.clientWidth;
  h = gameContainer.clientHeight;
  canvas.width = w;
  canvas.height = h;

  // Recalculate paddle dimensions
  paddleWidth = w * CONFIG.PADDLE_WIDTH_RATIO;
  paddleY = h - h * CONFIG.PADDLE_BOTTOM_OFFSET_RATIO;

  // Clamp paddle position
  paddleX = clamp(paddleX, paddleWidth * 0.25, w - paddleWidth * 0.25);
  paddleTargetX = paddleX;

  console.log("[resizeCanvas] Canvas resized to:", w, "x", h);
}

// ============= GAME LOOP =============
// Fixed timestep for consistent physics across all refresh rates
const FIXED_TIMESTEP = 1000 / 60; // 60 updates per second (16.667ms)
const MAX_DELTA = 100; // Cap delta to prevent spiral of death on tab switch

let lastTime = 0;
let accumulator = 0;

function gameLoop(timestamp: number): void {
  // Calculate delta time, capping it to prevent huge jumps
  let dt = timestamp - lastTime;
  lastTime = timestamp;

  // Cap delta time to prevent spiral of death (e.g., when tab is backgrounded)
  if (dt > MAX_DELTA) {
    dt = MAX_DELTA;
  }

  // Accumulate time for fixed timestep physics
  accumulator += dt;

  // Run physics at fixed timestep
  while (accumulator >= FIXED_TIMESTEP) {
    if (gameState === "PLAYING") {
      updatePaddle(FIXED_TIMESTEP);
      updateBall();
      updateParticles(FIXED_TIMESTEP);
      updateCoins(FIXED_TIMESTEP);

      // Decay center hit flash
      if (centerHitFlash > 0) {
        centerHitFlash -= FIXED_TIMESTEP;
        if (centerHitFlash < 0) centerHitFlash = 0;
      }
    }
    accumulator -= FIXED_TIMESTEP;
  }

  // Clear and draw background (rendering happens every frame for smooth visuals)
  drawBackground();

  if (gameState === "PLAYING") {
    drawScore();
    drawPaddle();
    drawCoins();
    drawBall();
    drawParticles();
  } else if (gameState === "START") {
    // Only clear background and draw title screen
    drawStartScreen();
  } else if (gameState === "PAUSED" || gameState === "GAME_OVER") {
    // Draw frozen state
    drawScore();
    drawPaddle();
    drawCoins();
    drawBall();
    drawParticles();
  }

  requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  console.log("[init] Initializing Paddle Bounce");

  // SDK: lifecycle hooks for background/foreground
  oasiz.onPause(() => {
    if (gameState === "PLAYING") {
      pauseGame();
    }
  });
  oasiz.onResume(() => {});

  // Setup canvas
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Setup input
  setupInputHandlers();

  // Initialize display
  gameContainer.style.background = bgColor;

  // Initialize paddle position
  paddleX = w / 2;
  paddleTargetX = w / 2;
  paddleY = h - h * CONFIG.PADDLE_BOTTOM_OFFSET_RATIO;

  // Start game loop
  requestAnimationFrame(gameLoop);

  // Initialize display state
  showStartScreen();

  console.log("[init] Game initialized.");
}

init();
