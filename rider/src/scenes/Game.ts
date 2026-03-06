import Phaser from "phaser";
import { getAudioManager } from "../audio";

type TrackPoint = { x: number; y: number };

export default class Game extends Phaser.Scene {
    private motorcycle!: Phaser.Physics.Matter.Image;
    private backgroundGraphics!: Phaser.GameObjects.Graphics;
    private trackGraphics!: Phaser.GameObjects.Graphics;
    private speedText!: Phaser.GameObjects.Text;
    private statusText!: Phaser.GameObjects.Text;
    private spaceKey!: Phaser.Input.Keyboard.Key;
    private isAccelerating: boolean = false;
    private driveSpeed: number = 0;
    private trackPoints: TrackPoint[] = [];
    private lastTrackX: number = 0;
    private nextRampDirection: number = -1;
    private readonly maxSpeed: number = 12;
    private readonly accelerationPerFrame: number = 0.24;
    private readonly coastDragPerFrame: number = 0.992;
    private readonly trackHeightRatio: number = 0.7;
    private readonly flatLength: number = 140;
    private readonly rampRun: number = 180;
    private readonly rampHeight: number = 100;
    private readonly initialTrackLength: number = 3200;
    private readonly trackSpawnBuffer: number = 1800;
    private readonly segmentThickness: number = 40;
    private readonly jointCapRadius: number = 26;
    private readonly audio = getAudioManager();

    constructor() {
        super("Game");
    }

    preload() {
        this.load.image("motorcycle", "assets/motorcycle.png");
    }

    create() {
        this.cameras.main.setBackgroundColor(0x0a0014);
        this.matter.world.setBounds(-200, -400, 20000, this.scale.height + 1200);
        this.drawBackground();
        this.createTriangleTrack();
        this.createBike();
        this.createHud();
        this.bindInput();
        this.cameras.main.startFollow(this.motorcycle, true, 0.08, 0.08);
        this.cameras.main.setLerp(0.08, 0.08);
        this.cameras.main.setDeadzone(this.scale.width * 0.2, this.scale.height * 0.25);
        this.audio.startMusic("game");
        this.audio.stopEngine();
        this.installTextStateHook();
    }

    private drawBackground() {
        const width = this.scale.width;
        const height = this.scale.height;

        this.backgroundGraphics = this.add.graphics();
        this.backgroundGraphics.setScrollFactor(0);
        this.backgroundGraphics.fillGradientStyle(0x020611, 0x020611, 0x122446, 0x122446, 1);
        this.backgroundGraphics.fillRect(0, 0, width, height);

        this.backgroundGraphics.fillStyle(0x04183a, 1);
        this.backgroundGraphics.beginPath();
        this.backgroundGraphics.moveTo(0, height * 0.72);
        this.backgroundGraphics.lineTo(width * 0.18, height * 0.52);
        this.backgroundGraphics.lineTo(width * 0.36, height * 0.66);
        this.backgroundGraphics.lineTo(width * 0.56, height * 0.48);
        this.backgroundGraphics.lineTo(width * 0.82, height * 0.7);
        this.backgroundGraphics.lineTo(width, height * 0.58);
        this.backgroundGraphics.lineTo(width, height);
        this.backgroundGraphics.lineTo(0, height);
        this.backgroundGraphics.closePath();
        this.backgroundGraphics.fillPath();
    }

    private createTriangleTrack() {
        const baseY = this.scale.height * this.trackHeightRatio;
        this.trackPoints = [{ x: 0, y: baseY }, { x: 260, y: baseY }];
        this.lastTrackX = 260;
        this.nextRampDirection = -1;

        this.trackGraphics = this.add.graphics();
        this.createTrackSegment(this.trackPoints[0], this.trackPoints[1]);
        this.createTrackJoint(this.trackPoints[0]);
        this.createTrackJoint(this.trackPoints[1]);
        this.extendTrackTo(this.initialTrackLength);
    }

    private extendTrackTo(targetX: number) {
        const baseY = this.scale.height * this.trackHeightRatio;

        while (this.lastTrackX < targetX) {
            this.appendTrackPoint({ x: this.lastTrackX + this.flatLength, y: baseY });
            this.appendTrackPoint({
                x: this.lastTrackX + this.rampRun * 0.5,
                y: baseY + this.nextRampDirection * this.rampHeight
            });
            this.appendTrackPoint({
                x: this.lastTrackX + this.rampRun * 0.5,
                y: baseY
            });
            this.nextRampDirection *= -1;
        }

        this.redrawTrack();
    }

    private appendTrackPoint(point: TrackPoint) {
        const previousPoint = this.trackPoints[this.trackPoints.length - 1];
        this.trackPoints.push(point);
        this.lastTrackX = point.x;
        this.createTrackSegment(previousPoint, point);
        this.createTrackJoint(point);
    }

    private redrawTrack() {
        this.trackGraphics.clear();

        this.trackGraphics.lineStyle(22, 0xd1007a, 0.12);
        this.trackGraphics.beginPath();
        this.trackGraphics.moveTo(this.trackPoints[0].x, this.trackPoints[0].y);
        for (let i = 1; i < this.trackPoints.length; i++) {
            this.trackGraphics.lineTo(this.trackPoints[i].x, this.trackPoints[i].y);
        }
        this.trackGraphics.strokePath();

        this.trackGraphics.lineStyle(9, 0xd1007a, 0.7);
        this.trackGraphics.beginPath();
        this.trackGraphics.moveTo(this.trackPoints[0].x, this.trackPoints[0].y);
        for (let i = 1; i < this.trackPoints.length; i++) {
            this.trackGraphics.lineTo(this.trackPoints[i].x, this.trackPoints[i].y);
        }
        this.trackGraphics.strokePath();

        this.trackGraphics.lineStyle(4, 0xffffff, 1);
        this.trackGraphics.beginPath();
        this.trackGraphics.moveTo(this.trackPoints[0].x, this.trackPoints[0].y);
        for (let i = 1; i < this.trackPoints.length; i++) {
            this.trackGraphics.lineTo(this.trackPoints[i].x, this.trackPoints[i].y);
        }
        this.trackGraphics.strokePath();
    }

    private createTrackSegment(start: TrackPoint, end: TrackPoint) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        this.matter.add.rectangle(
            (start.x + end.x) * 0.5,
            (start.y + end.y) * 0.5,
            length,
            this.segmentThickness,
            {
                isStatic: true,
                angle,
                friction: 0.95,
                restitution: 0
            }
        );
    }

    private createTrackJoint(point: TrackPoint) {
        this.matter.add.circle(point.x, point.y, this.jointCapRadius, {
            isStatic: true,
            friction: 0.95,
            restitution: 0
        });
    }

    private createBike() {
        const startY = this.scale.height * this.trackHeightRatio - 52;
        this.motorcycle = this.matter.add.image(120, startY, "motorcycle");
        this.motorcycle.setScale(0.36);
        this.motorcycle.setTint(0xffffff);
        this.motorcycle.setRectangle(this.motorcycle.width * 0.34, this.motorcycle.height * 0.18);
        this.motorcycle.setBounce(0);
        this.motorcycle.setFriction(0.08, 0.01, 0.02);
        this.motorcycle.setFrictionAir(0.004);
        this.motorcycle.setFixedRotation();
    }

    private createHud() {
        this.speedText = this.add.text(24, 24, "SPD 0.00", {
            fontSize: "24px",
            fontFamily: "Arial Black, Arial, sans-serif",
            fontStyle: "bold",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 6
        });
        this.speedText.setScrollFactor(0).setDepth(100);

        this.statusText = this.add.text(24, 58, "HOLD TO ACCELERATE", {
            fontSize: "20px",
            fontFamily: "Arial Black, Arial, sans-serif",
            fontStyle: "bold",
            color: "#cccccc",
            stroke: "#000000",
            strokeThickness: 5
        });
        this.statusText.setScrollFactor(0).setDepth(100);
    }

    private bindInput() {
        this.input.on("pointerdown", () => {
            this.audio.unlockFromUserGesture();
            this.isAccelerating = true;
        });
        this.input.on("pointerup", () => {
            this.isAccelerating = false;
        });
        this.input.on("pointerout", () => {
            this.isAccelerating = false;
        });

        this.input.keyboard?.addCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    private installTextStateHook() {
        (window as any).render_game_to_text = () => JSON.stringify({
            mode: "gameplay",
            player: {
                x: Math.round(this.motorcycle.x),
                y: Math.round(this.motorcycle.y),
                vx: Number(this.motorcycle.body.velocity.x.toFixed(3)),
                vy: Number(this.motorcycle.body.velocity.y.toFixed(3)),
                angle: Number(this.motorcycle.rotation.toFixed(3)),
                av: Number(this.motorcycle.body.angularVelocity.toFixed(3)),
                grounded: Math.abs(this.motorcycle.body.velocity.y) < 0.35,
                accelerating: this.isAccelerating
            },
            score: {
                flips: 0,
                gems: 0
            },
            nearbyTerrain: [],
            nearbyGems: []
        });
    }

    update(_time: number, delta: number) {
        if (this.spaceKey?.isDown) {
            this.isAccelerating = true;
        } else if (!this.input.activePointer.isDown) {
            this.isAccelerating = false;
        }

        const dt60 = Phaser.Math.Clamp(delta / (1000 / 60), 0.5, 2);
        if (this.isAccelerating) {
            this.driveSpeed = Math.min(this.maxSpeed, this.driveSpeed + this.accelerationPerFrame * dt60);
        } else {
            this.driveSpeed *= Math.pow(this.coastDragPerFrame, dt60);
        }

        this.motorcycle.setVelocityX(this.driveSpeed);

        if (this.motorcycle.x + this.trackSpawnBuffer > this.lastTrackX) {
            this.extendTrackTo(this.motorcycle.x + this.trackSpawnBuffer);
        }

        this.speedText.setText(`SPD ${this.driveSpeed.toFixed(2)}`);
        this.statusText.setText(this.isAccelerating ? "ACCELERATING" : "HOLD TO ACCELERATE");
        this.audio.updateEngine({
            speed: this.driveSpeed,
            accelerating: this.isAccelerating,
            grounded: Math.abs(this.motorcycle.body.velocity.y) < 0.35,
            active: true
        });
    }
}
