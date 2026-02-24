import type { YellowBlock, CenterHole, RepulsionZone } from "../../../../shared/sim/maps";
import { GAME_CONFIG } from "../../../types";

export interface CenterHoleTheme {
  ring: string;
  innerRing: string;
  arrow: string;
  glow: string;
  gradientInner: string;
  gradientMid: string;
  gradientOuter: string;
}

export interface RepulsionZoneTheme {
  gradientInner: string;
  gradientMid: string;
  gradientOuter: string;
  core: string;
  ring: string;
  arrow: string;
  glow: string;
}

export class MapEffectsRenderer {
  private centerHoleRotationState = new Map<
    string,
    {
      direction: number;
      ringOffset: number;
      snakeOffset: number;
      snakeSizeFlipT: number;
      lastTime: number;
    }
  >();

  constructor(private ctx: CanvasRenderingContext2D) {}

  clearTransientState(): void {
    this.centerHoleRotationState.clear();
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  drawArenaBorder(borderColor: string = "#00f0ff"): void {
    const { ctx } = this;
    const w = GAME_CONFIG.ARENA_WIDTH;
    const h = GAME_CONFIG.ARENA_HEIGHT;
    const borderWidth = 4;

    // Neon border glow
    ctx.save();
    ctx.strokeStyle = borderColor;
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 20;
    ctx.lineWidth = borderWidth;

    // Draw rounded rectangle border
    const radius = 20;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.arcTo(w, 0, w, radius, radius);
    ctx.lineTo(w, h - radius);
    ctx.arcTo(w, h, w - radius, h, radius);
    ctx.lineTo(radius, h);
    ctx.arcTo(0, h, 0, h - radius, radius);
    ctx.lineTo(0, radius);
    ctx.arcTo(0, 0, radius, 0, radius);
    ctx.closePath();
    ctx.stroke();

    // Inner dim fill for area outside arena (corners if visible)
    ctx.restore();
  }

  drawYellowBlock(block: YellowBlock): void {
    const { ctx } = this;
    ctx.save();

    ctx.shadowColor = "#ffee00";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "#ffee00";
    ctx.lineWidth = 2;
    ctx.strokeRect(block.x + 1, block.y + 1, block.width - 2, block.height - 2);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 180, 0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(block.x + 4, block.y + 4, block.width - 8, block.height - 8);

    ctx.restore();
  }

  drawCenterHole(
    hole: CenterHole,
    time: number,
    playerMovementDirection: number,
    theme?: {
      ring: string;
      innerRing: string;
      arrow: string;
      glow: string;
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
    },
  ): void {
    const { ctx } = this;
    ctx.save();

    const direction = playerMovementDirection === -1 ? -1 : 1;
    const { ringAngle, snakeAngle, snakeSizeFlipT } = this.getStableCenterHoleAngles(
      hole,
      time,
      direction,
    );

    const gradientInner = theme?.gradientInner ?? "rgba(0, 0, 0, 0.95)";
    const gradientMid = theme?.gradientMid ?? "rgba(10, 10, 30, 0.9)";
    const gradientOuter = theme?.gradientOuter ?? "rgba(20, 20, 50, 0.6)";
    const ringColor = theme?.ring ?? "#4444ff";
    const ringGlow = theme?.glow ?? ringColor;
    const innerRingColor = theme?.innerRing ?? "#6666ff";
    const arrowColor = theme?.arrow ?? "#00f0ff";

    const gradient = ctx.createRadialGradient(
      hole.x,
      hole.y,
      0,
      hole.x,
      hole.y,
      hole.radius,
    );
    gradient.addColorStop(0, gradientInner);
    gradient.addColorStop(0.7, gradientMid);
    gradient.addColorStop(1, gradientOuter);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ringColor;
    ctx.shadowColor = ringGlow;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 10;
    ctx.strokeStyle = innerRingColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    if (hole.hasRotatingArrow) {
      ctx.shadowBlur = 0;
      const lineRadius = hole.radius + 18;
      const rotationAngle = ringAngle;
      const segments = 3;
      const segmentArc = Math.PI / 6;
      const gapArc = Math.PI / 12;

      for (let i = 0; i < segments; i++) {
        const startAngle = rotationAngle + i * (segmentArc + gapArc);
        const endAngle = startAngle + segmentArc;

        ctx.beginPath();
        ctx.arc(hole.x, hole.y, lineRadius, startAngle, endAngle);
        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = 4;
        ctx.shadowColor = arrowColor;
        ctx.shadowBlur = 12;
        ctx.stroke();
      }

      const arrowAngle = rotationAngle + 0.25 * direction;
      const ax = hole.x + Math.cos(arrowAngle) * (lineRadius + 8);
      const ay = hole.y + Math.sin(arrowAngle) * (lineRadius + 8);
      const arrowSize = 10;

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(
        arrowAngle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2),
      );
      ctx.fillStyle = arrowColor;
      ctx.shadowColor = arrowColor;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(0, -arrowSize);
      ctx.lineTo(-arrowSize * 0.5, arrowSize * 0.5);
      ctx.lineTo(arrowSize * 0.5, arrowSize * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.shadowBlur = 0;
      for (let i = 1; i <= 5; i++) {
        const trailAngle = rotationAngle - i * 0.4 * direction;
        const trailAlpha = 0.5 - i * 0.08;
        ctx.globalAlpha = Math.max(0, trailAlpha);
        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = 3 - i * 0.4;
        ctx.beginPath();
        ctx.arc(
          hole.x,
          hole.y,
          lineRadius,
          trailAngle,
          trailAngle + Math.PI / 8,
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (theme?.ring === "#ff5a2b") {
      this.drawVortexSnake(hole, snakeAngle, snakeSizeFlipT, theme);
    }

    ctx.restore();
  }

  private getCenterHoleStateKey(hole: CenterHole): string {
    return `${hole.x}|${hole.y}|${hole.radius}`;
  }

  private getStableCenterHoleAngles(
    hole: CenterHole,
    time: number,
    direction: number,
  ): { ringAngle: number; snakeAngle: number; snakeSizeFlipT: number } {
    const ringSpeed = 1.5;
    const snakeSpeed = 1.2;
    const sizeFlipRate = 8;
    const sizeFlipTarget = direction === -1 ? 1 : 0;
    const key = this.getCenterHoleStateKey(hole);
    const state = this.centerHoleRotationState.get(key);
    if (!state) {
      const initial = {
        direction,
        ringOffset: 0,
        snakeOffset: 0,
        snakeSizeFlipT: sizeFlipTarget,
        lastTime: time,
      };
      this.centerHoleRotationState.set(key, initial);
      return {
        ringAngle: time * ringSpeed * direction,
        snakeAngle: time * snakeSpeed * direction,
        snakeSizeFlipT: initial.snakeSizeFlipT,
      };
    }

    const dt = this.clamp(time - state.lastTime, 0, 0.2);
    if (state.direction !== direction) {
      const currentRingAngle = time * ringSpeed * state.direction + state.ringOffset;
      state.ringOffset = currentRingAngle - time * ringSpeed * direction;

      const currentSnakeAngle = time * snakeSpeed * state.direction + state.snakeOffset;
      state.snakeOffset = currentSnakeAngle - time * snakeSpeed * direction;

      state.direction = direction;
    }
    const blendAlpha = 1 - Math.exp(-sizeFlipRate * dt);
    state.snakeSizeFlipT +=
      (sizeFlipTarget - state.snakeSizeFlipT) * blendAlpha;
    state.lastTime = time;

    return {
      ringAngle: time * ringSpeed * state.direction + state.ringOffset,
      snakeAngle: time * snakeSpeed * state.direction + state.snakeOffset,
      snakeSizeFlipT: state.snakeSizeFlipT,
    };
  }

  private drawVortexSnake(
    hole: CenterHole,
    baseAngle: number,
    sizeFlipT: number,
    theme: {
      ring: string;
      innerRing: string;
      arrow: string;
      glow: string;
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
    },
  ): void {
    void theme;
    const { ctx } = this;
    const snakeRadius = hole.radius + 25;
    const segmentCount = 8;
    const segmentSpacing = 0.25;
    const leadIndex = (segmentCount - 1) * this.clamp01(sizeFlipT);

    ctx.save();
    for (let i = segmentCount - 1; i >= 0; i--) {
      // Keep segment spacing independent from rotation direction so
      // direction swaps reverse motion smoothly without flipping tail side.
      const segmentAngle = baseAngle - i * segmentSpacing;
      const x = hole.x + Math.cos(segmentAngle) * snakeRadius;
      const y = hole.y + Math.sin(segmentAngle) * snakeRadius;
      const flippedIndex = segmentCount - 1 - i;
      const visualIndex = i + (flippedIndex - i) * sizeFlipT;
      const size = 8 - visualIndex * 0.6;
      const alpha = 1 - visualIndex * 0.08;
      const leadWeight = this.clamp01(1 - Math.abs(i - leadIndex));

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(segmentAngle);
      if (leadWeight > 0) {
        ctx.shadowColor = "#ff8844";
        ctx.shadowBlur = 20 * leadWeight;
      }

      const r = 255;
      const g = Math.floor(136 - visualIndex * 12);
      const b = Math.floor(68 - visualIndex * 6);
      ctx.fillStyle = "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.2, size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      if (leadWeight > 0) {
        ctx.fillStyle = "rgba(255, 170, 102, " + leadWeight + ")";
        ctx.beginPath();
        ctx.ellipse(size * 0.3, 0, size * 0.5, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawRepulsionZone(
    zone: RepulsionZone,
    time: number,
    theme?: {
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
      core: string;
      ring: string;
      arrow: string;
      glow: string;
    },
  ): void {
    const { ctx } = this;
    ctx.save();

    const gradientInner = theme?.gradientInner ?? "rgba(255, 50, 50, 0.4)";
    const gradientMid = theme?.gradientMid ?? "rgba(255, 100, 50, 0.2)";
    const gradientOuter = theme?.gradientOuter ?? "rgba(255, 100, 50, 0)";
    const coreColor = theme?.core ?? "rgba(200, 30, 30, 0.6)";
    const ringColor = theme?.ring ?? "#ff4444";
    const arrowColor = theme?.arrow ?? "rgba(255, 100, 50, 0.7)";
    const ringGlow = theme?.glow ?? ringColor;

    const pulse = 0.9 + Math.sin(time * 3) * 0.1;
    const drawRadius = zone.radius * pulse;

    const gradient = ctx.createRadialGradient(
      zone.x,
      zone.y,
      0,
      zone.x,
      zone.y,
      drawRadius,
    );
    gradient.addColorStop(0, gradientInner);
    gradient.addColorStop(0.5, gradientMid);
    gradient.addColorStop(1, gradientOuter);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ringColor;
    ctx.shadowColor = ringGlow;
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    const waveCount = 4;
    const waveStart = drawRadius * 0.95;
    const waveRange = drawRadius * 0.75;
    const waveSpeed = 24;
    for (let i = 0; i < waveCount; i++) {
      const waveOffset =
        (time * waveSpeed + (i * waveRange) / waveCount) % waveRange;
      const waveRadius = waveStart + waveOffset;
      const waveAlpha = 0.35 * (1 - waveOffset / waveRange);
      ctx.globalAlpha = waveAlpha;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, waveRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const arrowCount = 6;
    for (let i = 0; i < arrowCount; i++) {
      const angle = (i / arrowCount) * Math.PI * 2 + time * 1.5;
      const dist = drawRadius * 0.6 + Math.sin(time * 4 + i) * 5;
      const ax = zone.x + Math.cos(angle) * dist;
      const ay = zone.y + Math.sin(angle) * dist;

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.fillStyle = arrowColor;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-3, -4);
      ctx.lineTo(-3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

}

