import type { YellowBlock, CenterHole, RepulsionZone } from "../../../../shared/sim/maps";
import { GAME_CONFIG } from "../../../types";

export interface CenterHoleTheme {
  drawSnake?: boolean;
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

const MAP_COMIC_COLORS = Object.freeze({
  outline: "#11131a",
  neutral: "#f8f1d4",
  zoneAccent: "#f46d43",
});

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

  private withAlpha(color: string, alpha: number): string {
    if (color.startsWith("#")) {
      let hex = color.slice(1);
      if (hex.length === 3) {
        hex = hex
          .split("")
          .map((part) => part + part)
          .join("");
      }
      if (hex.length === 6) {
        const r = Number.parseInt(hex.slice(0, 2), 16);
        const g = Number.parseInt(hex.slice(2, 4), 16);
        const b = Number.parseInt(hex.slice(4, 6), 16);
        if (
          Number.isFinite(r) &&
          Number.isFinite(g) &&
          Number.isFinite(b)
        ) {
          return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
        }
      }
    }
    return color;
  }

  drawArenaBorder(borderColor: string = "#00f0ff"): void {
    const { ctx } = this;
    const w = GAME_CONFIG.ARENA_WIDTH;
    const h = GAME_CONFIG.ARENA_HEIGHT;
    ctx.save();
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

    ctx.strokeStyle = MAP_COMIC_COLORS.outline;
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    const cornerSize = 24;
    const outside = -7;
    const inside = cornerSize - 7;
    ctx.strokeStyle = MAP_COMIC_COLORS.neutral;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(outside, inside);
    ctx.lineTo(outside, outside);
    ctx.lineTo(inside, outside);
    ctx.moveTo(w - inside, outside);
    ctx.lineTo(w - outside, outside);
    ctx.lineTo(w - outside, inside);
    ctx.moveTo(w - outside, h - inside);
    ctx.lineTo(w - outside, h - outside);
    ctx.lineTo(w - inside, h - outside);
    ctx.moveTo(inside, h - outside);
    ctx.lineTo(outside, h - outside);
    ctx.lineTo(outside, h - inside);
    ctx.stroke();

    ctx.restore();
  }

  drawYellowBlock(block: YellowBlock, hitPulse: number = 0): void {
    const { ctx } = this;
    const pulse = this.clamp01(hitPulse);
    ctx.save();

    const fillBoost = Math.round(24 * pulse);
    const fillR = Math.min(255, 247 + fillBoost);
    const fillG = Math.min(255, 211 + fillBoost);
    const fillB = Math.min(255, 84 + Math.round(6 * pulse));
    ctx.fillStyle =
      "rgb(" +
      fillR +
      ", " +
      fillG +
      ", " +
      fillB +
      ")";
    ctx.fillRect(block.x, block.y, block.width, block.height);

    ctx.strokeStyle = MAP_COMIC_COLORS.outline;
    ctx.lineWidth = 3;
    ctx.strokeRect(block.x + 1, block.y + 1, block.width - 2, block.height - 2);

    ctx.strokeStyle =
      "rgb(255, " + Math.min(255, 231 + Math.round(18 * pulse)) + ", 154)";
    ctx.lineWidth = 1;
    ctx.strokeRect(block.x + 4, block.y + 4, block.width - 8, block.height - 8);

    ctx.beginPath();
    ctx.rect(block.x + 2, block.y + 2, block.width - 4, block.height - 4);
    ctx.clip();

    ctx.strokeStyle = this.withAlpha("#8d6118", 0.4);
    ctx.lineWidth = 1;
    const hatchStep = 6;
    for (
      let start = block.x - block.height;
      start < block.x + block.width + block.height;
      start += hatchStep
    ) {
      ctx.beginPath();
      ctx.moveTo(start, block.y + block.height);
      ctx.lineTo(start + block.height, block.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawYellowBlockHitFlash(block: YellowBlock, intensity: number): void {
    const { ctx } = this;
    const clamped = this.clamp01(intensity);
    if (clamped <= 0) return;

    const expansion = 5 * (1 - clamped);
    ctx.save();
    ctx.fillStyle = "rgba(255, 245, 190, " + (0.18 * clamped) + ")";
    ctx.fillRect(
      block.x - expansion,
      block.y - expansion,
      block.width + expansion * 2,
      block.height + expansion * 2,
    );
    ctx.strokeStyle = "rgba(255, 228, 143, " + (0.65 * clamped) + ")";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      block.x - expansion,
      block.y - expansion,
      block.width + expansion * 2,
      block.height + expansion * 2,
    );
    ctx.restore();
  }

  drawCenterHole(
    hole: CenterHole,
    time: number,
    playerMovementDirection: number,
    theme?: {
      drawSnake?: boolean;
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

    const ringColor = theme?.ring ?? "#4444ff";
    const innerRingColor = theme?.innerRing ?? "#6666ff";
    const arrowColor = theme?.arrow ?? "#00f0ff";
    const outerFill = this.withAlpha(ringColor, 0.25);
    const innerFill = this.withAlpha(innerRingColor, 0.28);

    ctx.fillStyle = outerFill;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = innerFill;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius * 0.68, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#08090d";
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius * 0.46, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = MAP_COMIC_COLORS.outline;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = MAP_COMIC_COLORS.outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius * 0.68, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = innerRingColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius * 0.68, 0, Math.PI * 2);
    ctx.stroke();

    if (hole.hasRotatingArrow) {
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
        ctx.strokeStyle = MAP_COMIC_COLORS.outline;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = 2.4;
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
      ctx.fillStyle = MAP_COMIC_COLORS.outline;
      ctx.beginPath();
      ctx.moveTo(0, -arrowSize);
      ctx.lineTo(-arrowSize * 0.5, arrowSize * 0.5);
      ctx.lineTo(arrowSize * 0.5, arrowSize * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = arrowColor;
      ctx.beginPath();
      ctx.moveTo(0, -arrowSize * 0.7);
      ctx.lineTo(-arrowSize * 0.34, arrowSize * 0.32);
      ctx.lineTo(arrowSize * 0.34, arrowSize * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

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

    if (theme?.drawSnake) {
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
      const r = 255;
      const g = Math.floor(136 - visualIndex * 12);
      const b = Math.floor(68 - visualIndex * 6);
      ctx.fillStyle = "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
      ctx.strokeStyle = MAP_COMIC_COLORS.outline;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.2, size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (leadWeight > 0) {
        ctx.fillStyle = "rgba(255, 236, 208, " + (0.55 * leadWeight) + ")";
        ctx.beginPath();
        ctx.ellipse(size * 0.25, -size * 0.1, size * 0.42, size * 0.28, 0, 0, Math.PI * 2);
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
    const ringColor = theme?.ring ?? "#ff4444";
    const arrowColor = theme?.arrow ?? "rgba(255, 100, 50, 0.7)";
    const coreColor = theme?.core ?? MAP_COMIC_COLORS.zoneAccent;

    const pulse = 0.9 + Math.sin(time * 3) * 0.1;
    const drawRadius = zone.radius * pulse;

    ctx.fillStyle = this.withAlpha(ringColor, 0.17);
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.withAlpha(coreColor, 0.34);
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius * 0.63, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.withAlpha(gradientInner, 0.35);
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = MAP_COMIC_COLORS.outline;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius, 0, Math.PI * 2);
    ctx.stroke();

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
      ctx.strokeStyle = MAP_COMIC_COLORS.neutral;
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
      ctx.fillStyle = MAP_COMIC_COLORS.outline;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-3, -4);
      ctx.lineTo(-3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = arrowColor;
      ctx.beginPath();
      ctx.moveTo(3.5, 0);
      ctx.lineTo(-1.8, -2.2);
      ctx.lineTo(-1.8, 2.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

}

