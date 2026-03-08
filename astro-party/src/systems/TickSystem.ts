export class TickSystem {
  private readonly tickRate: number;
  private readonly tickDurationMs: number;
  private readonly maxFrameTimeMs: number;

  private currentTick: number = 0;
  private accumulatorMs: number = 0;
  private lastFrameTimeMs: number = 0;

  constructor(tickRate: number = 60, maxFrameTimeMs: number = 250) {
    this.tickRate = tickRate;
    this.tickDurationMs = 1000 / tickRate;
    this.maxFrameTimeMs = maxFrameTimeMs;
    this.lastFrameTimeMs = performance.now();
  }

  update(onTick: (tick: number) => void): void {
    const now = performance.now();
    let frameTime = now - this.lastFrameTimeMs;
    if (frameTime > this.maxFrameTimeMs) {
      frameTime = this.maxFrameTimeMs;
    }
    this.lastFrameTimeMs = now;
    this.accumulatorMs += frameTime;

    while (this.accumulatorMs >= this.tickDurationMs) {
      onTick(this.currentTick);
      this.currentTick += 1;
      this.accumulatorMs -= this.tickDurationMs;
    }
  }

  getCurrentTick(): number {
    return this.currentTick;
  }

  getTickDurationMs(): number {
    return this.tickDurationMs;
  }

  getSimTimeMs(): number {
    return this.currentTick * this.tickDurationMs;
  }

  getAccumulatorAlpha(): number {
    return this.accumulatorMs / this.tickDurationMs;
  }

  reset(startTick: number = 0): void {
    this.currentTick = startTick;
    this.accumulatorMs = 0;
    this.lastFrameTimeMs = performance.now();
  }
}
