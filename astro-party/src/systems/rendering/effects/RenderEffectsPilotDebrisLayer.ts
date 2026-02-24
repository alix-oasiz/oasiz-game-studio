import { GAME_CONFIG, Particle } from "../../../types";
import { getEntityAsset } from "../../../../shared/geometry/EntityAssets";
import { EntitySpriteStore } from "../assets/EntitySpriteStore";

type PilotDebrisKind = "visor" | "shellLeft" | "shellRight" | "core";
type PilotDebrisAssetId =
  | "pilot_death_debris_visor"
  | "pilot_death_debris_shell_left"
  | "pilot_death_debris_shell_right"
  | "pilot_death_debris_core";

interface PilotDebrisPiece {
  kind: PilotDebrisKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  radius: number;
  mass: number;
  life: number;
  maxLife: number;
  persistent: boolean;
  primaryColor: string;
  secondaryColor: string;
  outlineColor: string;
}

interface PilotDeathBurstFx {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  color: string;
}

export class RenderEffectsPilotDebrisLayer {
  private static readonly PILOT_DEBRIS_BASELINE_PILOT_WIDTH = 52;
  private static readonly PILOT_DEBRIS_SCALE_MULTIPLIER = 1;
  private static readonly PILOT_DEBRIS_PERSISTENT_LIFE = 1;
  private static readonly MAX_PILOT_DEBRIS_PIECES = 36;
  private static readonly MAX_PILOT_DEATH_BURSTS = 10;

  private pilotDebrisPieces: PilotDebrisPiece[] = [];
  private pilotDeathBursts: PilotDeathBurstFx[] = [];

  constructor(
    private entitySprites: EntitySpriteStore,
    private random: () => number,
    private pushParticle: (particle: Particle) => void,
  ) {}

  clear(): void {
    this.pilotDebrisPieces = [];
    this.pilotDeathBursts = [];
  }

  spawnPilotKillBurst(x: number, y: number, color: string): void {
    const burstColor = color || "#00f0ff";
    this.spawnPilotDeathBurst(x, y, burstColor);

    const haloCount = 12;
    for (let i = 0; i < haloCount; i++) {
      const angle = (i / haloCount) * Math.PI * 2 + this.random() * 0.18;
      const spawnRadius = 5.5 + this.random() * 2.5;
      const speed = 25 + this.random() * 35;
      const life = 0.11 + this.random() * 0.08;
      this.pushParticle({
        x: x + Math.cos(angle) * spawnRadius,
        y: y + Math.sin(angle) * spawnRadius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.2 + this.random() * 1.4,
        color: this.random() > 0.35 ? "#ffffff" : "#c8f4ff",
      });
    }

    const ventCount = 8;
    for (let i = 0; i < ventCount; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 42 + this.random() * 34;
      const life = 0.12 + this.random() * 0.1;
      this.pushParticle({
        x: x + (this.random() - 0.5) * 4,
        y: y + (this.random() - 0.5) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1 + this.random() * 1.1,
        color: this.random() > 0.55 ? burstColor : "#dff8ff",
      });
    }
  }

  spawnPilotDeathBurst(x: number, y: number, color: string): void {
    const burstColor = color || "#00f0ff";
    this.pilotDeathBursts.push({
      x,
      y,
      angle: this.random() * Math.PI * 2,
      life: 0.36,
      maxLife: 0.36,
      color: burstColor,
    });
    while (
      this.pilotDeathBursts.length >
      RenderEffectsPilotDebrisLayer.MAX_PILOT_DEATH_BURSTS
    ) {
      this.pilotDeathBursts.shift();
    }

    const implosionCount = 14;
    for (let i = 0; i < implosionCount; i++) {
      const angle = (i / implosionCount) * Math.PI * 2 + this.random() * 0.2;
      const spawnRadius = 12 + this.random() * 4;
      const speed = 70 + this.random() * 40;
      const life = 0.09 + this.random() * 0.08;
      this.pushParticle({
        x: x + Math.cos(angle) * spawnRadius,
        y: y + Math.sin(angle) * spawnRadius,
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.5 + this.random() * 1.5,
        color: this.random() > 0.5 ? "#ffffff" : burstColor,
      });
    }

    const explosionCount = 20;
    for (let i = 0; i < explosionCount; i++) {
      const angle = (i / explosionCount) * Math.PI * 2 + this.random() * 0.3;
      const speed = 30 + this.random() * 55;
      const life = 0.16 + this.random() * 0.14;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.8 + this.random() * 2.2,
        color: this.random() > 0.35 ? burstColor : "#dff8ff",
      });
    }

    this.spawnPilotDeathDebrisPieces(x, y, burstColor);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.pilotDeathBursts.length <= 0 && this.pilotDebrisPieces.length <= 0) {
      return;
    }

    for (const burst of this.pilotDeathBursts) {
      const phase = 1 - burst.life / burst.maxLife;
      const implodeT = phase < 0.34 ? 1 - phase / 0.34 : 0;
      const ringRadius = 5 + phase * 16;
      ctx.save();
      ctx.translate(burst.x, burst.y);
      ctx.rotate(burst.angle + phase * 5.8);

      ctx.globalAlpha = Math.max(0, 0.76 * (1 - phase));
      ctx.fillStyle = burst.color;
      ctx.beginPath();
      ctx.arc(0, 0, 2.8 + implodeT * 4.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = Math.max(0, 0.54 * (1 - phase));
      ctx.strokeStyle = "#dff8ff";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = Math.max(0, 0.45 * (1 - phase));
      ctx.strokeStyle = burst.color;
      for (let i = 0; i < 6; i++) {
        const rayAngle = (i / 6) * Math.PI * 2;
        const rayInner = ringRadius * 0.35;
        const rayOuter = ringRadius * 0.78;
        ctx.beginPath();
        ctx.moveTo(Math.cos(rayAngle) * rayInner, Math.sin(rayAngle) * rayInner);
        ctx.lineTo(Math.cos(rayAngle) * rayOuter, Math.sin(rayAngle) * rayOuter);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const piece of this.pilotDebrisPieces) {
      const alpha = Math.max(0, Math.min(1, piece.life / piece.maxLife));
      this.drawPilotDebrisPiece(ctx, piece, alpha);
    }
    ctx.globalAlpha = 1;
  }

  update(dt: number): void {
    const linearDrag = Math.max(0, 1 - dt * 5.8);
    const angularDrag = Math.max(0, 1 - dt * 7.2);

    for (let i = this.pilotDeathBursts.length - 1; i >= 0; i--) {
      const burst = this.pilotDeathBursts[i];
      burst.life -= dt;
      if (burst.life <= 0) {
        this.pilotDeathBursts.splice(i, 1);
      }
    }

    for (let i = 0; i < this.pilotDebrisPieces.length; i++) {
      const piece = this.pilotDebrisPieces[i];
      piece.vx *= linearDrag;
      piece.vy *= linearDrag;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.angle += piece.angularVelocity * dt;
      piece.angularVelocity *= angularDrag;

      const minX = piece.radius;
      const maxX = GAME_CONFIG.ARENA_WIDTH - piece.radius;
      if (piece.x < minX) {
        piece.x = minX;
        piece.vx = Math.abs(piece.vx) * 0.38;
      } else if (piece.x > maxX) {
        piece.x = maxX;
        piece.vx = -Math.abs(piece.vx) * 0.38;
      }

      const minY = piece.radius;
      const maxY = GAME_CONFIG.ARENA_HEIGHT - piece.radius;
      if (piece.y < minY) {
        piece.y = minY;
        piece.vy = Math.abs(piece.vy) * 0.38;
      } else if (piece.y > maxY) {
        piece.y = maxY;
        piece.vy = -Math.abs(piece.vy) * 0.38;
      }

      if (!piece.persistent) {
        piece.life -= dt;
        const speedSq = piece.vx * piece.vx + piece.vy * piece.vy;
        if (speedSq < 16 && piece.life < piece.maxLife * 0.45) {
          piece.life -= dt * 1.35;
        }
      }
    }

    for (let i = 0; i < this.pilotDebrisPieces.length; i++) {
      const a = this.pilotDebrisPieces[i];
      for (let j = i + 1; j < this.pilotDebrisPieces.length; j++) {
        const b = this.pilotDebrisPieces[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist) continue;

        const dist = Math.sqrt(Math.max(1e-6, distSq));
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const separateA = overlap * (b.mass / (a.mass + b.mass));
        const separateB = overlap * (a.mass / (a.mass + b.mass));
        a.x -= nx * separateA;
        a.y -= ny * separateA;
        b.x += nx * separateB;
        b.y += ny * separateB;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal >= 0) continue;
        const restitution = 0.32;
        const impulse =
          (-(1 + restitution) * velAlongNormal) / (1 / a.mass + 1 / b.mass);
        const impulseX = impulse * nx;
        const impulseY = impulse * ny;
        a.vx -= impulseX / a.mass;
        a.vy -= impulseY / a.mass;
        b.vx += impulseX / b.mass;
        b.vy += impulseY / b.mass;
      }
    }

    for (let i = this.pilotDebrisPieces.length - 1; i >= 0; i--) {
      if (this.pilotDebrisPieces[i].life <= 0) {
        this.pilotDebrisPieces.splice(i, 1);
      }
    }
  }

  bumpWithBody(
    bodyX: number,
    bodyY: number,
    bodyRadius: number,
    bodyVx: number,
    bodyVy: number,
  ): void {
    if (this.pilotDebrisPieces.length <= 0) return;
    for (let i = 0; i < this.pilotDebrisPieces.length; i++) {
      const piece = this.pilotDebrisPieces[i];
      const dx = piece.x - bodyX;
      const dy = piece.y - bodyY;
      const minDist = piece.radius + bodyRadius;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(Math.max(1e-6, distSq));
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      piece.x += nx * (overlap + 0.08);
      piece.y += ny * (overlap + 0.08);

      piece.vx += nx * 10 + bodyVx * 0.15;
      piece.vy += ny * 10 + bodyVy * 0.15;
      const maxSpeed = 88;
      const speedSq = piece.vx * piece.vx + piece.vy * piece.vy;
      if (speedSq > maxSpeed * maxSpeed) {
        const speed = Math.sqrt(speedSq);
        const scale = maxSpeed / speed;
        piece.vx *= scale;
        piece.vy *= scale;
      }
      piece.angularVelocity += (bodyVx * ny - bodyVy * nx) * 0.03;
    }
  }

  getPilotDebrisScaleFactor(): number {
    const pilotRenderWidth = getEntityAsset("pilot").renderSize.width;
    return (
      (pilotRenderWidth /
        RenderEffectsPilotDebrisLayer.PILOT_DEBRIS_BASELINE_PILOT_WIDTH) *
      RenderEffectsPilotDebrisLayer.PILOT_DEBRIS_SCALE_MULTIPLIER
    );
  }

  private spawnPilotDeathDebrisPieces(
    x: number,
    y: number,
    primaryColor: string,
  ): void {
    const pilotScale = this.getPilotDebrisScaleFactor();
    const templates: ReadonlyArray<{
      kind: PilotDebrisKind;
      offsetX: number;
      offsetY: number;
      radius: number;
      speedMin: number;
      speedMax: number;
      angleJitter: number;
      secondaryColor: string;
      outlineColor: string;
    }> = [
      {
        kind: "visor",
        offsetX: 10.6,
        offsetY: -7.8,
        radius: 4.1,
        speedMin: 16,
        speedMax: 28,
        angleJitter: 0.45,
        secondaryColor: "#0b1120",
        outlineColor: "#e8f5ff",
      },
      {
        kind: "shellLeft",
        offsetX: -8.1,
        offsetY: 0,
        radius: 5.8,
        speedMin: 14,
        speedMax: 24,
        angleJitter: 0.4,
        secondaryColor: "#141d2a",
        outlineColor: "#cfe8ff",
      },
      {
        kind: "shellRight",
        offsetX: 5.8,
        offsetY: 0.2,
        radius: 5.4,
        speedMin: 14,
        speedMax: 24,
        angleJitter: 0.4,
        secondaryColor: "#162233",
        outlineColor: "#cfe8ff",
      },
      {
        kind: "core",
        offsetX: -0.4,
        offsetY: 0,
        radius: 2.9,
        speedMin: 10,
        speedMax: 18,
        angleJitter: 0.9,
        secondaryColor: "#05131d",
        outlineColor: "#e9fcff",
      },
    ];

    for (const template of templates) {
      const baseAngle = Math.atan2(template.offsetY, template.offsetX);
      const launchAngle =
        baseAngle + (this.random() - 0.5) * template.angleJitter;
      const speed =
        template.speedMin * pilotScale +
        this.random() * (template.speedMax - template.speedMin) * pilotScale;
      const radiusJitter =
        template.radius * pilotScale * (0.92 + this.random() * 0.18);
      const mass = Math.max(0.7, radiusJitter * radiusJitter * 0.06);

      this.pilotDebrisPieces.push({
        kind: template.kind,
        x:
          x +
          template.offsetX * pilotScale +
          (this.random() - 0.5) * 1.1 * pilotScale,
        y:
          y +
          template.offsetY * pilotScale +
          (this.random() - 0.5) * 1.1 * pilotScale,
        vx: Math.cos(launchAngle) * speed,
        vy: Math.sin(launchAngle) * speed,
        angle: this.random() * Math.PI * 2,
        angularVelocity: (this.random() - 0.5) * 3.2,
        radius: radiusJitter,
        mass,
        life: RenderEffectsPilotDebrisLayer.PILOT_DEBRIS_PERSISTENT_LIFE,
        maxLife: RenderEffectsPilotDebrisLayer.PILOT_DEBRIS_PERSISTENT_LIFE,
        persistent: true,
        primaryColor: primaryColor,
        secondaryColor: template.secondaryColor,
        outlineColor: template.outlineColor,
      });
    }

    while (
      this.pilotDebrisPieces.length >
      RenderEffectsPilotDebrisLayer.MAX_PILOT_DEBRIS_PIECES
    ) {
      this.pilotDebrisPieces.shift();
    }
  }

  private drawPilotDebrisPiece(
    ctx: CanvasRenderingContext2D,
    piece: PilotDebrisPiece,
    alpha: number,
  ): void {
    if (alpha <= 0) return;

    const spriteAssetId = this.getPilotDebrisAssetId(piece.kind);
    const baseRadius = this.getPilotDebrisBaseRadius(piece.kind);
    const spriteScale = Math.max(0.45, piece.radius / baseRadius);

    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.angle);
    ctx.scale(spriteScale, spriteScale);
    ctx.globalAlpha = alpha;
    const drewSprite = this.entitySprites.drawEntity(ctx, spriteAssetId, {
      "slot-primary": piece.primaryColor,
      "slot-secondary": piece.secondaryColor,
      "slot-stroke": piece.outlineColor,
    });
    ctx.restore();
    if (drewSprite) {
      return;
    }

    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.angle);
    ctx.globalAlpha = alpha;

    if (piece.kind === "visor") {
      const r = piece.radius;
      ctx.fillStyle = piece.secondaryColor;
      ctx.strokeStyle = piece.outlineColor;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = piece.primaryColor;
      ctx.globalAlpha = alpha * 0.34;
      ctx.beginPath();
      ctx.ellipse(0.4 * r, -0.05 * r, r * 0.72, r * 0.46, 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;

      ctx.fillStyle = "#eaf9ff";
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(r * 0.38, -r * 0.4, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.restore();
      return;
    }

    if (piece.kind === "core") {
      const r = piece.radius;
      ctx.fillStyle = piece.primaryColor;
      ctx.strokeStyle = piece.outlineColor;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.95, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    const s = piece.radius / 5.8;
    ctx.scale(s, s);
    ctx.fillStyle = piece.primaryColor;
    ctx.strokeStyle = piece.outlineColor;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    if (piece.kind === "shellLeft") {
      ctx.moveTo(-6.8, -4.3);
      ctx.lineTo(-1.8, -5.5);
      ctx.lineTo(0.5, -1.2);
      ctx.lineTo(0.5, 1.2);
      ctx.lineTo(-1.7, 5.4);
      ctx.lineTo(-6.1, 4.5);
      ctx.lineTo(-7.3, 0.2);
    } else {
      ctx.moveTo(-1.4, -5.5);
      ctx.lineTo(2.8, -5.4);
      ctx.lineTo(5.1, -3.7);
      ctx.lineTo(6.5, -1.1);
      ctx.lineTo(6.5, 1.1);
      ctx.lineTo(5.1, 3.7);
      ctx.lineTo(2.8, 5.4);
      ctx.lineTo(-1.4, 5.5);
      ctx.lineTo(-2.4, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = piece.secondaryColor;
    ctx.globalAlpha = alpha * 0.34;
    ctx.beginPath();
    if (piece.kind === "shellLeft") {
      ctx.moveTo(-5.4, -2.8);
      ctx.lineTo(-2.0, -3.4);
      ctx.lineTo(-0.8, -0.8);
      ctx.lineTo(-0.8, 0.8);
      ctx.lineTo(-2.1, 3.3);
      ctx.lineTo(-5.2, 2.6);
    } else {
      ctx.moveTo(-0.3, -3.8);
      ctx.lineTo(2.6, -3.6);
      ctx.lineTo(4.3, -2.3);
      ctx.lineTo(5.2, -0.9);
      ctx.lineTo(5.2, 0.9);
      ctx.lineTo(4.2, 2.4);
      ctx.lineTo(2.6, 3.6);
      ctx.lineTo(-0.2, 3.8);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.restore();
  }

  private getPilotDebrisAssetId(kind: PilotDebrisKind): PilotDebrisAssetId {
    switch (kind) {
      case "visor":
        return "pilot_death_debris_visor";
      case "shellLeft":
        return "pilot_death_debris_shell_left";
      case "shellRight":
        return "pilot_death_debris_shell_right";
      case "core":
        return "pilot_death_debris_core";
    }
  }

  private getPilotDebrisBaseRadius(kind: PilotDebrisKind): number {
    const pilotScale = this.getPilotDebrisScaleFactor();
    switch (kind) {
      case "visor":
        return 4.1 * pilotScale;
      case "shellLeft":
        return 5.8 * pilotScale;
      case "shellRight":
        return 5.4 * pilotScale;
      case "core":
        return 2.9 * pilotScale;
    }
  }
}
