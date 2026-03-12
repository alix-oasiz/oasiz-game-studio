// Simple mock SDK for local development
const oasiz = {
  emitScoreConfig: (config: any) => {},
  onPause: (cb: any) => {},
  onResume: (cb: any) => {},
  gameplayStart: () => console.log("Game started"),
  gameplayStop: () => console.log("Game stopped"),
  submitScore: (score: number) => console.log("Score:", score),
  triggerHaptic: (type: string) => {},
};

// Game constants
const GRAVITY = 0.6;
const FLIP_POWER = -15;
const SPIN_ACCELERATION = 0.2; // How fast spin builds up while holding (slower)
const MAX_SPIN_SPEED = 15; // Lower max speed
const OBSTACLE_SPEED = 2;
const OBSTACLE_SPAWN_INTERVAL = 3000;

interface Bottle {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  rotationSpeed: number;
  angularAcceleration: number;
  width: number;
  height: number;
  isFlipping: boolean;
  isCharging: boolean; // Holding to build spin
  isFailed: boolean; // Failed landing, falling over
  tipDirection: number; // -1 = left, 1 = right
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

class BottleFlipGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bottle: Bottle;
  private obstacles: Obstacle[] = [];
  private score: number = 0;
  private gameState: "start" | "playing" | "gameOver" = "start";
  private animationId: number = 0;
  private lastObstacleTime: number = 0;
  private settings: Settings;
  private isMobile: boolean;
  private groundY: number = 0;
  private flipsCompleted: number = 0;

  constructor() {
    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Load settings
    this.settings = {
      music: localStorage.getItem("music") !== "false",
      fx: localStorage.getItem("fx") !== "false",
      haptics: localStorage.getItem("haptics") !== "false",
    };

    // Initialize bottle
    this.bottle = {
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
      rotation: 0,
      rotationSpeed: 0,
      angularAcceleration: 0,
      width: 60,
      height: 120,
      isFlipping: false,
      isCharging: false,
      isFailed: false,
      tipDirection: 1,
    };

    this.setupCanvas();
    this.setupEventListeners();
    this.setupSettings();
    this.initOasizSDK();
  }

  private initOasizSDK(): void {
    // Configure score normalization
    oasiz.emitScoreConfig({
      anchors: [
        { raw: 5, normalized: 100 },
        { raw: 15, normalized: 300 },
        { raw: 30, normalized: 600 },
        { raw: 50, normalized: 950 },
      ],
    });

    // Listen for pause/resume events
    oasiz.onPause(() => {
      if (this.gameState === "playing") {
        this.pauseGame();
      }
    });

    oasiz.onResume(() => {
      if (this.gameState === "playing") {
        this.resumeGame();
      }
    });
  }

  private setupCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.groundY = this.canvas.height - 100;

    window.addEventListener("resize", () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.groundY = this.canvas.height - 100;
    });
  }

  private setupEventListeners(): void {
    // Start button
    document.getElementById("startBtn")?.addEventListener("click", () => {
      this.startGame();
    });

    // Restart button
    document.getElementById("restartBtn")?.addEventListener("click", () => {
      this.startGame();
    });

    // Hold to charge, release to flip
    this.canvas.addEventListener("mousedown", () => {
      if (this.gameState === "playing" && !this.bottle.isFlipping) {
        this.startCharging();
      }
    });

    this.canvas.addEventListener("mouseup", () => {
      if (this.gameState === "playing" && this.bottle.isCharging) {
        this.releaseFlip();
      }
    });

    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.gameState === "playing" && !this.bottle.isFlipping) {
        this.startCharging();
      }
    });

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      if (this.gameState === "playing" && this.bottle.isCharging) {
        this.releaseFlip();
      }
    });
  }

  private setupSettings(): void {
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsModal = document.getElementById("settingsModal");
    const closeSettings = document.getElementById("closeSettings");

    settingsBtn?.addEventListener("click", () => {
      settingsModal?.classList.remove("hidden");
    });

    closeSettings?.addEventListener("click", () => {
      settingsModal?.classList.add("hidden");
    });

    // Setup toggles
    this.setupToggle("musicToggle", "music");
    this.setupToggle("fxToggle", "fx");
    this.setupToggle("hapticsToggle", "haptics");
  }

  private setupToggle(id: string, setting: keyof Settings): void {
    const toggle = document.getElementById(id);
    if (!toggle) return;

    if (this.settings[setting]) {
      toggle.classList.add("active");
    }

    toggle.addEventListener("click", () => {
      this.settings[setting] = !this.settings[setting];
      localStorage.setItem(setting, String(this.settings[setting]));
      toggle.classList.toggle("active");
    });
  }

  private startGame(): void {
    console.log("GAME STARTING!");
    console.log("Canvas size:", this.canvas.width, "x", this.canvas.height);
    this.gameState = "playing";
    this.score = 0;
    this.flipsCompleted = 0;
    this.obstacles = [];
    this.lastObstacleTime = Date.now();

    // Reset bottle (centered on screen)
    this.bottle.x = this.canvas.width / 2 - this.bottle.width / 2;
    this.bottle.y = this.groundY - this.bottle.height;
    this.bottle.velocityX = 0;
    this.bottle.velocityY = 0;
    this.bottle.rotation = 0;
    this.bottle.rotationSpeed = 0;
    this.bottle.angularAcceleration = 0;
    this.bottle.isFlipping = false;
    this.bottle.isCharging = false;
    this.bottle.isFailed = false;
    this.bottle.tipDirection = 1;

    // Hide start/game over screens
    document.getElementById("startScreen")?.classList.add("hidden");
    document.getElementById("gameOverScreen")?.classList.add("hidden");

    // Update score display
    this.updateScoreDisplay();

    // Start gameplay
    oasiz.gameplayStart();

    // Start game loop
    this.gameLoop();
  }

  private startCharging(): void {
    this.bottle.isCharging = true;
    this.bottle.rotationSpeed = 0;

    // Haptic feedback
    if (this.settings.haptics) {
      oasiz.triggerHaptic("light");
    }
  }

  private releaseFlip(): void {
    this.bottle.isCharging = false;
    this.bottle.isFlipping = true;

    // Launch power based on spin speed
    const spinPower = Math.min(this.bottle.rotationSpeed / MAX_SPIN_SPEED, 1);
    this.bottle.velocityY = FLIP_POWER * (0.5 + spinPower * 0.5); // 50-100% power
    this.bottle.velocityX = 0; // No horizontal movement - bottle stays centered

    // Haptic feedback
    if (this.settings.haptics) {
      oasiz.triggerHaptic("medium");
    }
  }

  private spawnObstacle(): void {
    const now = Date.now();
    if (now - this.lastObstacleTime < OBSTACLE_SPAWN_INTERVAL) {
      return;
    }

    this.lastObstacleTime = now;

    const minHeight = 50;
    const maxHeight = 150;
    const height = Math.random() * (maxHeight - minHeight) + minHeight;

    this.obstacles.push({
      x: this.canvas.width,
      y: this.groundY - height,
      width: 60,
      height: height,
      speed: OBSTACLE_SPEED + Math.random() * 1,
    });
  }

  private updatePhysics(): void {
    // Handle charging (holding to spin)
    if (this.bottle.isCharging) {
      // Build up spin speed while holding
      this.bottle.rotationSpeed = Math.min(
        this.bottle.rotationSpeed + SPIN_ACCELERATION,
        MAX_SPIN_SPEED
      );
      this.bottle.rotation += this.bottle.rotationSpeed;
    }

    // Handle failed bottle falling over with realistic physics
    if (this.bottle.isFailed) {
      // Apply angular acceleration (gravity pulling on the off-center mass)
      this.bottle.rotationSpeed += this.bottle.angularAcceleration;

      // Store old rotation for position calculation
      const oldRotation = this.bottle.rotation;
      this.bottle.rotation += this.bottle.rotationSpeed;

      // Calculate pivot point (bottom edge where bottle tips from)
      // Bottle tips from bottom left or right corner
      const pivotOffsetX = this.bottle.tipDirection === 1 ? this.bottle.width / 2 : -this.bottle.width / 2;
      const pivotY = this.bottle.y + this.bottle.height; // Bottom of bottle

      // As bottle rotates around bottom corner, adjust position
      const angle = this.bottle.rotation * Math.PI / 180;
      const halfHeight = this.bottle.height / 2;

      // Calculate how much the center of the bottle moves as it tips
      // The bottle rotates around its bottom corner
      if (Math.abs(this.bottle.rotationSpeed) > 0.1) {
        this.bottle.x += this.bottle.tipDirection * Math.cos(angle) * 0.3;
        this.bottle.y = this.groundY - this.bottle.height + Math.abs(Math.sin(angle)) * halfHeight;
      }

      // Check if bottle is now horizontal (stopped falling)
      const normalizedRot = ((this.bottle.rotation % 360) + 360) % 360;
      const targetAngle = this.bottle.tipDirection === 1 ? 90 : 270;
      const isHorizontal = Math.abs(normalizedRot - targetAngle) < 5;

      if (isHorizontal || this.bottle.rotationSpeed < 0.1) {
        // Stop the rotation when horizontal
        this.bottle.rotation = targetAngle;
        this.bottle.angularAcceleration = 0;
        this.bottle.rotationSpeed = 0;
      }
    }

    if (this.bottle.isFlipping) {
      // Apply gravity
      this.bottle.velocityY += GRAVITY;

      // Update position
      this.bottle.x += this.bottle.velocityX;
      this.bottle.y += this.bottle.velocityY;

      // Update rotation
      this.bottle.rotation += this.bottle.rotationSpeed;

      // Check landing
      if (this.bottle.y >= this.groundY - this.bottle.height) {
        this.handleLanding();
      }

      // Check collision with obstacles
      if (this.checkCollisions() && !this.bottle.isFailed) {
        // Hit an obstacle - make it fall
        this.bottle.isFailed = true;
        this.bottle.isFlipping = false;
        this.bottle.velocityY = 0;
        this.bottle.rotationSpeed = 5;

        setTimeout(() => {
          this.gameOver();
        }, 1500);
      }
    }

    // Update obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      this.obstacles[i].x -= this.obstacles[i].speed;

      // Remove off-screen obstacles
      if (this.obstacles[i].x + this.obstacles[i].width < 0) {
        this.obstacles.splice(i, 1);
      }
    }

    // Spawn new obstacles (disabled for now)
    // if (this.bottle.isFlipping) {
    //   this.spawnObstacle();
    // }
  }

  private handleLanding(): void {
    this.bottle.y = this.groundY - this.bottle.height;
    this.bottle.velocityY = 0;
    this.bottle.velocityX = 0;
    this.bottle.isFlipping = false;
    this.bottle.isCharging = false;

    // Check if bottle landed upright
    const normalizedRotation = ((this.bottle.rotation % 360) + 360) % 360;
    const isUpright =
      (normalizedRotation < 15 || normalizedRotation > 345) ||
      (normalizedRotation > 165 && normalizedRotation < 195);

    if (isUpright) {
      // Successful landing!
      this.bottle.rotation = normalizedRotation < 180 ? 0 : 180;
      this.bottle.rotationSpeed = 0;
      this.flipsCompleted++;
      this.score += 10;

      // Bonus points for avoiding obstacles
      if (this.obstacles.some((obs) => obs.x < this.bottle.x && obs.x > this.bottle.x - 200)) {
        this.score += 5;
      }

      this.updateScoreDisplay();

      // Haptic feedback for success
      if (this.settings.haptics) {
        oasiz.triggerHaptic("success");
      }

      // Reset position for next flip (keep centered)
      setTimeout(() => {
        this.bottle.x = this.canvas.width / 2 - this.bottle.width / 2;
      }, 500);
    } else {
      // Failed landing - calculate which way to tip
      this.bottle.isFailed = true;

      // Determine tip direction based on rotation
      // 0-90 or 270-360 = tip right, 90-270 = tip left
      if (normalizedRotation < 90 || normalizedRotation > 270) {
        this.bottle.tipDirection = 1; // Tip right
      } else {
        this.bottle.tipDirection = -1; // Tip left
      }

      // Start with current rotation speed, add acceleration for tipping
      this.bottle.angularAcceleration = this.bottle.tipDirection * 0.8;

      // Trigger game over after letting it fall
      setTimeout(() => {
        this.gameOver();
      }, 2000);
    }
  }

  private checkCollisions(): boolean {
    for (const obstacle of this.obstacles) {
      if (
        this.bottle.x + this.bottle.width > obstacle.x &&
        this.bottle.x < obstacle.x + obstacle.width &&
        this.bottle.y + this.bottle.height > obstacle.y &&
        this.bottle.y < obstacle.y + obstacle.height
      ) {
        return true;
      }
    }
    return false;
  }

  private gameOver(): void {
    this.gameState = "gameOver";
    oasiz.gameplayStop();

    // Submit score
    oasiz.submitScore(this.score);

    // Haptic feedback
    if (this.settings.haptics) {
      oasiz.triggerHaptic("error");
    }

    // Show game over screen
    const gameOverScreen = document.getElementById("gameOverScreen");
    const finalScore = document.getElementById("finalScore");
    if (finalScore) {
      finalScore.textContent = `Score: ${this.score}`;
    }
    gameOverScreen?.classList.remove("hidden");

    cancelAnimationFrame(this.animationId);
  }

  private pauseGame(): void {
    cancelAnimationFrame(this.animationId);
  }

  private resumeGame(): void {
    this.gameLoop();
  }

  private updateScoreDisplay(): void {
    const scoreEl = document.getElementById("score");
    if (scoreEl) {
      scoreEl.textContent = String(this.score);
    }
  }

  private render(): void {
    // Clear canvas with a visible background
    this.ctx.fillStyle = "#1a202c";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw ground (bright so it's visible)
    this.ctx.fillStyle = "#48bb78";
    this.ctx.fillRect(0, this.groundY, this.canvas.width, this.canvas.height - this.groundY);

    // Debug text
    this.ctx.fillStyle = "white";
    this.ctx.font = "20px sans-serif";
    this.ctx.fillText(`Charging: ${this.bottle.isCharging} | Spin: ${Math.floor(this.bottle.rotationSpeed)}`, 10, 30);
    this.ctx.fillText(`Flipping: ${this.bottle.isFlipping}`, 10, 60);

    // Draw obstacles
    for (const obstacle of this.obstacles) {
      this.ctx.fillStyle = "#e53e3e";
      this.ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

      // Draw obstacle border
      this.ctx.strokeStyle = "#c53030";
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }

    // Draw bottle
    this.ctx.save();
    this.ctx.translate(
      this.bottle.x + this.bottle.width / 2,
      this.bottle.y + this.bottle.height / 2
    );
    this.ctx.rotate((this.bottle.rotation * Math.PI) / 180);

    // Bottle body
    this.ctx.fillStyle = "#ff6b6b";
    this.ctx.fillRect(
      -this.bottle.width / 2,
      -this.bottle.height / 2,
      this.bottle.width,
      this.bottle.height
    );

    // Bottle outline (make it super visible)
    this.ctx.strokeStyle = "#000";
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(
      -this.bottle.width / 2,
      -this.bottle.height / 2,
      this.bottle.width,
      this.bottle.height
    );

    // Bottle cap
    this.ctx.fillStyle = "#2b6cb0";
    this.ctx.fillRect(-this.bottle.width / 2, -this.bottle.height / 2, this.bottle.width, 20);

    // Bottle label
    this.ctx.fillStyle = "yellow";
    this.ctx.fillRect(-this.bottle.width / 2 + 5, -5, this.bottle.width - 10, 15);

    this.ctx.restore();
  }

  private gameLoop = (): void => {
    if (this.gameState === "playing") {
      this.updatePhysics();
      this.render();
      this.animationId = requestAnimationFrame(this.gameLoop);
    }
  };
}

// Initialize game when DOM is ready
new BottleFlipGame();
