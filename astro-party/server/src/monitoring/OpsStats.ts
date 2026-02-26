import os from "node:os";

interface RateSnapshot {
  perSec10s: number;
  perSec60s: number;
}

interface NumericSummary {
  samples: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

interface OpsStatsSnapshot {
  generatedAtIso: string;
  uptimeSec: number;
  process: {
    pid: number;
    nodeVersion: string;
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
    arrayBuffersBytes: number;
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
  };
  rooms: {
    active: number;
    createdTotal: number;
    disposedTotal: number;
  };
  clients: {
    active: number;
    joinedTotal: number;
    leftTotal: number;
    joinsRate: RateSnapshot;
    leavesRate: RateSnapshot;
  };
  messages: {
    inputTotal: number;
    pingTotal: number;
    snapshotFanoutTotal: number;
    inputRate: RateSnapshot;
    pingRate: RateSnapshot;
    snapshotFanoutRate: RateSnapshot;
    commandsTotalByType: Record<string, number>;
  };
  errors: {
    roomErrorTotal: number;
    roomErrorByCode: Record<string, number>;
  };
  rttMs: NumericSummary;
}

class RollingCounter {
  private readonly buckets = new Map<number, number>();

  constructor(private readonly windowSec: number) {}

  increment(amount = 1, nowMs = Date.now()): void {
    const second = Math.floor(nowMs / 1000);
    this.buckets.set(second, (this.buckets.get(second) ?? 0) + amount);
    this.prune(second);
  }

  sum(lastSec: number, nowMs = Date.now()): number {
    const nowSec = Math.floor(nowMs / 1000);
    this.prune(nowSec);
    let total = 0;
    const startSec = nowSec - Math.max(0, lastSec) + 1;
    for (let sec = startSec; sec <= nowSec; sec += 1) {
      total += this.buckets.get(sec) ?? 0;
    }
    return total;
  }

  private prune(nowSec: number): void {
    const cutoff = nowSec - this.windowSec;
    for (const sec of this.buckets.keys()) {
      if (sec >= cutoff) continue;
      this.buckets.delete(sec);
    }
  }
}

class QuantileWindow {
  private readonly values: number[] = [];

  constructor(private readonly maxSamples: number) {}

  record(value: number): void {
    if (!Number.isFinite(value)) return;
    if (value < 0) return;
    this.values.push(value);
    if (this.values.length <= this.maxSamples) return;
    const dropCount = this.values.length - this.maxSamples;
    this.values.splice(0, dropCount);
  }

  snapshot(): NumericSummary {
    if (this.values.length <= 0) {
      return {
        samples: 0,
        min: null,
        max: null,
        avg: null,
        p50: null,
        p95: null,
        p99: null,
      };
    }

    const sorted = [...this.values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, value) => acc + value, 0);
    return {
      samples: sorted.length,
      min: sorted[0] ?? null,
      max: sorted[sorted.length - 1] ?? null,
      avg: sum / sorted.length,
      p50: quantileSorted(sorted, 0.5),
      p95: quantileSorted(sorted, 0.95),
      p99: quantileSorted(sorted, 0.99),
    };
  }
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length <= 0) return 0;
  const clampedQ = Math.max(0, Math.min(1, q));
  const index = Math.floor((sorted.length - 1) * clampedQ);
  return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
}

function mapToRecord(map: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of map.entries()) {
    out[key] = value;
  }
  return out;
}

function toRateSnapshot(counter: RollingCounter): RateSnapshot {
  const sum10s = counter.sum(10);
  const sum60s = counter.sum(60);
  return {
    perSec10s: sum10s / 10,
    perSec60s: sum60s / 60,
  };
}

export class OpsStats {
  private readonly startedAtMs = Date.now();
  private readonly activeRoomIds = new Set<string>();
  private readonly activeSessionIds = new Set<string>();
  private readonly commandCounts = new Map<string, number>();
  private readonly roomErrorByCode = new Map<string, number>();

  private readonly joinsCounter = new RollingCounter(120);
  private readonly leavesCounter = new RollingCounter(120);
  private readonly inputCounter = new RollingCounter(120);
  private readonly pingCounter = new RollingCounter(120);
  private readonly snapshotFanoutCounter = new RollingCounter(120);
  private readonly rttWindow = new QuantileWindow(6000);

  private roomCreatedTotal = 0;
  private roomDisposedTotal = 0;
  private clientJoinedTotal = 0;
  private clientLeftTotal = 0;
  private inputTotal = 0;
  private pingTotal = 0;
  private snapshotFanoutTotal = 0;
  private roomErrorTotal = 0;

  recordRoomCreated(roomId: string): void {
    if (roomId.trim().length <= 0) return;
    this.roomCreatedTotal += 1;
    this.activeRoomIds.add(roomId);
  }

  recordRoomDisposed(roomId: string): void {
    if (roomId.trim().length > 0) {
      this.activeRoomIds.delete(roomId);
    }
    this.roomDisposedTotal += 1;
  }

  recordClientJoined(sessionId: string): void {
    if (sessionId.trim().length <= 0) return;
    this.activeSessionIds.add(sessionId);
    this.clientJoinedTotal += 1;
    this.joinsCounter.increment(1);
  }

  recordClientLeft(sessionId: string): void {
    if (sessionId.trim().length > 0) {
      this.activeSessionIds.delete(sessionId);
    }
    this.clientLeftTotal += 1;
    this.leavesCounter.increment(1);
  }

  recordCommand(command: string): void {
    if (command.trim().length <= 0) return;
    this.commandCounts.set(command, (this.commandCounts.get(command) ?? 0) + 1);
  }

  recordInput(rttMs: number | null): void {
    this.inputTotal += 1;
    this.inputCounter.increment(1);
    if (typeof rttMs === "number" && Number.isFinite(rttMs) && rttMs >= 0) {
      this.rttWindow.record(rttMs);
    }
  }

  recordPing(): void {
    this.pingTotal += 1;
    this.pingCounter.increment(1);
  }

  recordSnapshotFanout(clientCount: number): void {
    if (!Number.isFinite(clientCount)) return;
    const count = Math.max(0, Math.floor(clientCount));
    if (count <= 0) return;
    this.snapshotFanoutTotal += count;
    this.snapshotFanoutCounter.increment(count);
  }

  recordRoomError(code: string): void {
    this.roomErrorTotal += 1;
    if (code.trim().length <= 0) return;
    this.roomErrorByCode.set(code, (this.roomErrorByCode.get(code) ?? 0) + 1);
  }

  snapshot(): OpsStatsSnapshot {
    const memory = process.memoryUsage();
    const loadAvg = os.loadavg();

    return {
      generatedAtIso: new Date().toISOString(),
      uptimeSec: Math.max(0, Math.floor((Date.now() - this.startedAtMs) / 1000)),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
        arrayBuffersBytes: memory.arrayBuffers,
        loadAvg1m: loadAvg[0] ?? 0,
        loadAvg5m: loadAvg[1] ?? 0,
        loadAvg15m: loadAvg[2] ?? 0,
      },
      rooms: {
        active: this.activeRoomIds.size,
        createdTotal: this.roomCreatedTotal,
        disposedTotal: this.roomDisposedTotal,
      },
      clients: {
        active: this.activeSessionIds.size,
        joinedTotal: this.clientJoinedTotal,
        leftTotal: this.clientLeftTotal,
        joinsRate: toRateSnapshot(this.joinsCounter),
        leavesRate: toRateSnapshot(this.leavesCounter),
      },
      messages: {
        inputTotal: this.inputTotal,
        pingTotal: this.pingTotal,
        snapshotFanoutTotal: this.snapshotFanoutTotal,
        inputRate: toRateSnapshot(this.inputCounter),
        pingRate: toRateSnapshot(this.pingCounter),
        snapshotFanoutRate: toRateSnapshot(this.snapshotFanoutCounter),
        commandsTotalByType: mapToRecord(this.commandCounts),
      },
      errors: {
        roomErrorTotal: this.roomErrorTotal,
        roomErrorByCode: mapToRecord(this.roomErrorByCode),
      },
      rttMs: this.rttWindow.snapshot(),
    };
  }
}

export const opsStats = new OpsStats();
