import { GAME_CONFIG, ProjectileState, ShipState } from "../../../types";
import {
  SHIP_COLLIDER_VERTICES,
  transformLocalVertices,
} from "../../../../shared/geometry/EntityShapes";
import { drawDebugRadius } from "./RendererVisualPrimitives";

export class RenderDebugSystem {
  private projectileDebugHistory = new Map<
    string,
    Array<{ x: number; y: number; atMs: number }>
  >();

  constructor(
    private ctx: CanvasRenderingContext2D,
    private getNowMs: () => number,
  ) {}

  clear(): void {
    this.projectileDebugHistory.clear();
  }

  drawHomingMissileDetectionRadius(x: number, y: number, radius: number): void {
    drawDebugRadius(this.ctx, x, y, radius, {
      strokeStyle: "rgba(0, 255, 0, 0.8)",
      fillStyle: "rgba(0, 255, 0, 0.1)",
      label: "DETECT",
      labelColor: "#00ff00",
      lineDash: [10, 5],
    });
  }

  drawMineDetectionRadius(x: number, y: number, radius: number): void {
    drawDebugRadius(this.ctx, x, y, radius, {
      strokeStyle: "rgba(0, 255, 0, 0.8)",
      fillStyle: "rgba(0, 255, 0, 0.1)",
      label: "MINE",
      labelColor: "#00ff00",
      lineDash: [10, 5],
    });
  }

  drawTurretDetectionRadius(x: number, y: number, radius: number): void {
    drawDebugRadius(this.ctx, x, y, radius, {
      strokeStyle: "rgba(255, 50, 50, 0.8)",
      fillStyle: "rgba(255, 50, 50, 0.1)",
      label: "TURRET",
      labelColor: "#ff3333",
      lineDash: [10, 5],
    });
  }

  drawTurretBulletRadius(x: number, y: number, radius: number): void {
    drawDebugRadius(this.ctx, x, y, radius, {
      strokeStyle: "rgba(255, 150, 0, 0.8)",
      fillStyle: "rgba(255, 150, 0, 0.1)",
      label: "BULLET",
      labelColor: "#ff9900",
      lineDash: [10, 5],
    });
  }

  drawPowerUpMagneticRadius(
    x: number,
    y: number,
    radius: number,
    isActive: boolean,
  ): void {
    drawDebugRadius(this.ctx, x, y, radius, {
      strokeStyle: isActive
        ? "rgba(200, 100, 255, 0.9)"
        : "rgba(150, 80, 200, 0.7)",
      fillStyle: isActive
        ? "rgba(200, 100, 255, 0.15)"
        : "rgba(150, 80, 200, 0.08)",
      label: "MAGNET",
      labelColor: isActive ? "#cc66ff" : "#9966cc",
      lineDash: [8, 4],
    });
  }

  drawShipColliderDebug(state: ShipState): void {
    const { ctx } = this;
    const vertices = transformLocalVertices(
      SHIP_COLLIDER_VERTICES,
      state.x,
      state.y,
      state.angle,
    );
    if (vertices.length < 3) return;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 170, 0, 0.95)";
    ctx.fillStyle = "rgba(255, 170, 0, 0.12)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i += 1) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 220, 120, 0.95)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(state.x - 2.5, state.y);
    ctx.lineTo(state.x + 2.5, state.y);
    ctx.moveTo(state.x, state.y - 2.5);
    ctx.lineTo(state.x, state.y + 2.5);
    ctx.stroke();
    ctx.restore();
  }

  drawProjectileSweepDebug(projectiles: ProjectileState[]): void {
    const { ctx } = this;
    const nowMs = this.getNowMs();
    const activeProjectileIds = new Set<string>();

    for (const projectile of projectiles) {
      activeProjectileIds.add(projectile.id);
      const radius = Math.max(
        0.1,
        projectile.radius ?? GAME_CONFIG.PROJECTILE_RADIUS,
      );
      const history = this.projectileDebugHistory.get(projectile.id) ?? [];
      const last = history[history.length - 1];
      if (!last || Math.hypot(projectile.x - last.x, projectile.y - last.y) > 0.01) {
        history.push({ x: projectile.x, y: projectile.y, atMs: nowMs });
      } else {
        last.atMs = nowMs;
      }
      while (history.length > 14) {
        history.shift();
      }
      while (history.length > 2 && nowMs - history[0].atMs > 380) {
        history.shift();
      }
      this.projectileDebugHistory.set(projectile.id, history);

      const previous = history.length > 1 ? history[history.length - 2] : null;

      if (!previous) continue;
      const dx = projectile.x - previous.x;
      const dy = projectile.y - previous.y;
      const distSq = dx * dx + dy * dy;

      ctx.save();
      for (let i = 1; i < history.length; i += 1) {
        const a = history[i - 1];
        const b = history[i];
        const t = i / history.length;
        ctx.strokeStyle = `rgba(255, 170, 120, ${0.18 + t * 0.42})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      if (distSq > 1e-6) {
        // Capsule body matching swept-circle width (diameter = 2 * radius).
        ctx.strokeStyle = "rgba(255, 90, 40, 0.45)";
        ctx.lineWidth = radius * 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(projectile.x, projectile.y);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(255, 120, 70, 0.95)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(previous.x, previous.y, radius, 0, Math.PI * 2);
      ctx.arc(projectile.x, projectile.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 220, 170, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(projectile.x, projectile.y);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 210, 120, 0.95)";
      ctx.beginPath();
      ctx.arc(previous.x, previous.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 120, 70, 0.95)";
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 230, 170, 0.95)";
      ctx.fillText("P", previous.x, previous.y - Math.max(3, radius + 1));
      ctx.fillStyle = "rgba(255, 150, 110, 0.95)";
      ctx.fillText("C", projectile.x, projectile.y - Math.max(3, radius + 1));
      ctx.restore();
    }

    for (const projectileId of [...this.projectileDebugHistory.keys()]) {
      if (activeProjectileIds.has(projectileId)) continue;
      this.projectileDebugHistory.delete(projectileId);
    }
  }
}
