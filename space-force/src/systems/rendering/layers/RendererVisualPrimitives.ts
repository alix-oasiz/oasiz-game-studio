export interface DebugRadiusOptions {
  strokeStyle: string;
  fillStyle: string;
  label: string;
  labelColor: string;
  lineDash: number[];
  lineWidth?: number;
  secondaryLabel?: string;
}

export function drawDebugRadius(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  options: DebugRadiusOptions,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = options.strokeStyle;
  ctx.lineWidth = options.lineWidth ?? 2;
  ctx.setLineDash(options.lineDash);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = options.fillStyle;
  ctx.fill();

  ctx.setLineDash([]);
  ctx.fillStyle = options.labelColor;
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.fillText(options.label, 0, radius + 15);
  ctx.fillText(options.secondaryLabel ?? radius + "px", 0, radius + 28);
  ctx.restore();
}

export function drawMineExplosionEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = `rgba(18, 20, 26, ${alpha})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 211, 139, ${alpha * 0.95})`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
  ctx.stroke();

  const rayCount = 12;
  ctx.strokeStyle = `rgba(255, 238, 205, ${alpha * 0.85})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < rayCount; i++) {
    const rayAngle = (i / rayCount) * Math.PI * 2;
    const inner = radius * 0.28;
    const outer = radius * (0.75 + (i % 2) * 0.2);
    ctx.beginPath();
    ctx.moveTo(Math.cos(rayAngle) * inner, Math.sin(rayAngle) * inner);
    ctx.lineTo(Math.cos(rayAngle) * outer, Math.sin(rayAngle) * outer);
    ctx.stroke();
  }

  ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawMineBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nowMs: number,
  mineSize: number,
): void {
  ctx.save();
  ctx.translate(x, y);

  const pulseSpeed = 0.008;
  const pulseAmount = 0.15;
  const pulseScale = 1 + Math.sin(nowMs * pulseSpeed) * pulseAmount;
  ctx.scale(pulseScale, pulseScale);

  const spikeCount = 8;
  const innerRadius = mineSize * 0.6;
  const outerRadius = mineSize;

  ctx.fillStyle = "#767f92";
  ctx.strokeStyle = "#12141a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < spikeCount * 2; i++) {
    const angle = (i / (spikeCount * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#ffe3ab";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = "#f28f3b";
  ctx.beginPath();
  ctx.arc(0, 0, mineSize * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#12141a";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffe39d";
  ctx.beginPath();
  ctx.arc(0, 0, mineSize * 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
