export class ScreenShakeController {
  private intensity = 0;
  private duration = 0;
  private offsetX = 0;
  private offsetY = 0;

  applyTransform(ctx: CanvasRenderingContext2D): void {
    if (this.duration <= 0) return;
    ctx.translate(this.offsetX, this.offsetY);
  }

  update(dt: number, nowMs: number): void {
    if (this.duration <= 0) return;

    this.duration -= dt;
    const time = nowMs * 0.05;
    const decay = this.duration > 0 ? 1 : 0;
    this.offsetX =
      Math.sin(time * 1.1) * Math.cos(time * 0.7) * this.intensity * decay;
    this.offsetY =
      Math.sin(time * 0.9) * Math.cos(time * 1.3) * this.intensity * decay;

    if (this.duration <= 0) {
      this.intensity = 0;
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }

  add(intensity: number, duration: number): void {
    this.intensity = Math.max(this.intensity, intensity);
    this.duration = Math.max(this.duration, duration);
  }

  clear(): void {
    this.intensity = 0;
    this.duration = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }
}
