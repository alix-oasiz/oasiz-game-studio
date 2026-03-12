import Phaser from 'phaser';

const oasiz = {
  emitScoreConfig: (config: any) => {},
  onPause: (cb: any) => {},
  onResume: (cb: any) => {},
  gameplayStart: () => console.log("Game started"),
  gameplayStop: () => console.log("Game stopped"),
  submitScore: (score: number) => console.log("Score:", score),
  triggerHaptic: (type: string) => {},
};

class BottleFlipScene extends Phaser.Scene {
  private bottle!: Phaser.Physics.Matter.Image;
  private arrow!: Phaser.GameObjects.Triangle;
  private ground!: Phaser.GameObjects.Rectangle;
  private score: number = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private versionText!: Phaser.GameObjects.Text;
  private isCharging: boolean = false;
  private chargeStartTime: number = 0;
  private chargePower: number = 0;
  private gameStarted: boolean = false;
  private canFlip: boolean = true;
  private bottleStartX: number = 0;
  private bottleStartY: number = 0;
  private pivotX: number = 0; // Center point to orbit around
  private pivotY: number = 0;
  private orbitRadius: number = 150; // Distance from pivot
  private orbitAngle: number = 0; // Current angle in orbit

  constructor() {
    super({ key: 'BottleFlipScene' });
  }

  preload() {
    // No assets needed for now
  }

  create() {
    console.log("Phaser scene created!");
    const { width, height } = this.cameras.main;
    console.log("Canvas size:", width, height);

    // Set up Matter physics world with thick walls to prevent clipping
    this.matter.world.setBounds(0, 0, width, height, 64, true, true, true, true);
    this.matter.world.setGravity(0, 1.5);

    // Create ground - bright green so it's visible
    const groundY = height - 50;
    this.ground = this.add.rectangle(width / 2, groundY + 50, width, 100, 0x00ff00);
    this.ground.setStrokeStyle(4, 0x000000);
    this.matter.add.gameObject(this.ground, {
      isStatic: true,
      friction: 0.8,
      restitution: 0.2
    });

    console.log("Ground created at", groundY);

    // Create bottle with proper physics body
    this.createBottle();

    // UI Text - make very visible
    this.scoreText = this.add.text(width / 2, 80, '0', {
      fontSize: '64px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(100);

    this.instructionText = this.add.text(width / 2, height / 2,
      'HOLD TO SPIN\nRELEASE TO FLIP!', {
      fontSize: '40px',
      color: '#ffffff',
      align: 'center',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(100);

    this.versionText = this.add.text(width - 10, 10, 'v6.3', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(1, 0).setDepth(100);

    console.log("UI created");

    // Input handling
    this.input.on('pointerdown', this.startCharge, this);
    this.input.on('pointerup', this.releaseFlip, this);

    oasiz.gameplayStart();
  }

  createBottle() {
    const { width, height } = this.cameras.main;

    // Remove old bottle and arrow if they exist
    if (this.bottle) {
      this.bottle.destroy();
    }
    if (this.arrow) {
      this.arrow.destroy();
    }

    // Set pivot point (center to spin around)
    this.pivotX = width / 2;
    this.pivotY = height / 3;

    // Calculate bottle starting position (on the orbit circle)
    this.orbitAngle = -Math.PI / 4; // Start at 45 degrees
    this.bottleStartX = this.pivotX + Math.cos(this.orbitAngle) * this.orbitRadius;
    this.bottleStartY = this.pivotY + Math.sin(this.orbitAngle) * this.orbitRadius;
    console.log("Creating bottle at", this.bottleStartX, this.bottleStartY);

    // Create a simple rectangle game object
    const bottleRect = this.add.rectangle(
      this.bottleStartX,
      this.bottleStartY,
      34, // width
      114, // height
      0x4A90E2 // blue color
    );
    bottleRect.setStrokeStyle(3, 0x2E5C8A);

    // Set origin to CENTER for both sprite and physics to match
    bottleRect.setOrigin(0.5, 0.5);

    // Add Matter physics
    this.bottle = this.matter.add.gameObject(bottleRect, {
      restitution: 0.3,
      friction: 0.8,
      density: 0.008,
      frictionAir: 0.02,
      ignoreGravity: true
    }) as any;

    // Get body reference
    const body = this.bottle.body as MatterJS.BodyType;

    // Create red arrow pointing up (triangle) - at the top of bottle
    this.arrow = this.add.triangle(
      this.bottleStartX,
      this.bottleStartY - 57 - 15, // Top of bottle (half height + offset)
      0, 12,    // Point 1 (top)
      -8, 0,    // Point 2 (bottom left)
      8, 0,     // Point 3 (bottom right)
      0xff0000  // Red
    );
    this.arrow.setStrokeStyle(2, 0x990000);
    this.arrow.setDepth(10);

    this.bottle.setAngle(45); // Start at 45° to prevent auto-win
    this.canFlip = true;

    // Debug: Log actual physics body dimensions
    console.log("Bottle created!");
    console.log("Sprite dimensions:", this.bottle.width, "x", this.bottle.height);
    console.log("Physics body bounds:", body.bounds);
    console.log("Physics body position:", body.position);
    console.log("Sprite position:", this.bottle.x, this.bottle.y);
    console.log("Center of mass:", body.centerOfMass);
  }

  startCharge() {
    if (!this.canFlip) return;

    this.gameStarted = true;
    this.instructionText.setVisible(false);
    this.isCharging = true;
    this.chargeStartTime = this.time.now;
    this.chargePower = 0;
  }

  releaseFlip() {
    if (!this.isCharging) return;

    this.isCharging = false;
    this.canFlip = false;

    // Enable gravity - bottle will now fall
    this.bottle.setIgnoreGravity(false);

    // Calculate power based on hold duration
    const holdDuration = this.time.now - this.chargeStartTime;
    const power = Math.min(holdDuration / 1000, 2); // Max 2 seconds

    // Calculate tangent velocity (perpendicular to radius)
    const tangentAngle = this.orbitAngle + Math.PI / 2;
    const speed = 10 + power * 8; // Much higher speed to maintain momentum (max ~18)

    // Launch in tangent direction
    const velocityX = Math.cos(tangentAngle) * speed;
    const velocityY = Math.sin(tangentAngle) * speed;
    this.bottle.setVelocity(velocityX, velocityY);

    // Apply angular velocity based on spin speed
    const spinPower = power * 0.2;
    this.bottle.setAngularVelocity(spinPower);

    // Check for landing after a delay
    this.time.delayedCall(2000, this.checkLanding, [], this);
  }

  checkLanding() {
    // Check if bottle has settled
    const body = this.bottle.body as MatterJS.BodyType;
    const velocity = body.velocity;
    const angularVelocity = body.angularVelocity;

    if (Math.abs(velocity.y) < 0.5 && Math.abs(angularVelocity) < 0.1) {
      // Bottle has settled - check if upright
      const angle = Phaser.Math.Angle.WrapDegrees(this.bottle.angle);
      const isUpright = Math.abs(angle) < 15 || Math.abs(angle - 180) < 15 || Math.abs(angle + 180) < 15;

      if (isUpright) {
        // Success!
        this.score += 10;
        this.scoreText.setText(this.score.toString());

        // Reset for next flip
        this.time.delayedCall(1000, () => {
          this.createBottle();
        }, [], this);
      } else {
        // Failed
        this.gameOver();
      }
    } else {
      // Still moving, check again
      this.time.delayedCall(500, this.checkLanding, [], this);
    }
  }

  gameOver() {
    oasiz.gameplayStop();
    oasiz.submitScore(this.score);

    const { width, height } = this.cameras.main;

    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);
    const gameOverText = this.add.text(width / 2, height / 2 - 50, 'Game Over!', {
      fontSize: '64px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const finalScoreText = this.add.text(width / 2, height / 2 + 30, `Score: ${this.score}`, {
      fontSize: '32px',
      color: '#ffffff'
    }).setOrigin(0.5);

    const restartText = this.add.text(width / 2, height / 2 + 100, 'Tap to Restart', {
      fontSize: '24px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.input.once('pointerdown', () => {
      this.scene.restart();
    });
  }

  update() {
    // Update arrow position and rotation to follow bottle top
    if (this.arrow && this.bottle) {
      const angleRad = Phaser.Math.DegToRad(this.bottle.angle);
      const topDistance = 57 + 15; // Half height + arrow offset

      this.arrow.setPosition(
        this.bottle.x - Math.sin(angleRad) * topDistance,
        this.bottle.y + Math.cos(angleRad) * topDistance
      );
      this.arrow.setRotation(angleRad);
    }

    if (this.isCharging) {
      const holdDuration = this.time.now - this.chargeStartTime;
      const holdSeconds = holdDuration / 1000;

      // Orbit around pivot point - accelerating spin
      const angularSpeed = 2 * Math.PI * holdSeconds; // Radians per second, increases with time
      this.orbitAngle += angularSpeed * (1/60); // Update orbit angle

      // Calculate position on orbit circle
      const x = this.pivotX + Math.cos(this.orbitAngle) * this.orbitRadius;
      const y = this.pivotY + Math.sin(this.orbitAngle) * this.orbitRadius;

      this.bottle.setPosition(x, y);
      this.bottle.setVelocity(0, 0); // Cancel physics velocity during charge

      // Bottle rotates to face tangent direction (perpendicular to radius)
      const tangentAngle = this.orbitAngle + Math.PI / 2;
      this.bottle.setAngle(Phaser.Math.RadToDeg(tangentAngle));

      this.chargePower = Math.min(holdSeconds, 2);
    }
  }
}

// Phaser game config
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'game-container',
  backgroundColor: 0xFFB347,
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1.5 },
      debug: {
        showBody: true,
        showStaticBody: true,
        lineColor: 0x00ff00,
        lineOpacity: 0.8,
        lineThickness: 2
      }
    }
  },
  scene: [BottleFlipScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  }
};

// Remove old canvas if exists
const oldCanvas = document.getElementById('gameCanvas');
if (oldCanvas) {
  oldCanvas.remove();
}

// Create game container
const container = document.createElement('div');
container.id = 'game-container';
container.style.position = 'fixed';
container.style.top = '0';
container.style.left = '0';
container.style.width = '100vw';
container.style.height = '100vh';
container.style.zIndex = '1';
document.body.appendChild(container);

console.log("Game container created");

// Hide UI overlay
const uiOverlay = document.querySelector('.ui-overlay') as HTMLElement;
if (uiOverlay) {
  uiOverlay.style.display = 'none';
}

new Phaser.Game(config);
