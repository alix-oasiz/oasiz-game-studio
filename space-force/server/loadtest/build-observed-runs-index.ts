import fs from "node:fs";
import path from "node:path";

interface CliOptions {
  runsDir: string;
  runIdFilter: string | null;
  massDropThreshold: number;
}

interface RunMetaFile {
  runId?: string;
  startedAtIso?: string;
  endedAtIso?: string;
  runner?: string;
  params?: Record<string, unknown>;
  loadtestExitCode?: number;
  [key: string]: unknown;
}

interface MetricsSample {
  tsIso: string;
  hostLoad1: number | null;
  hostMemUsedPct: number | null;
  hostMemUsedMb: number | null;
  pm2CpuPct: number | null;
  pm2MemMb: number | null;
  pm2Restarts: number | null;
  opsClients: number | null;
  opsRooms: number | null;
  opsLeftUnconsented: number | null;
  opsRttP95Ms: number | null;
  netRxBps: number | null;
  netTxBps: number | null;
}

interface LoadtestSummarySample {
  tsIso: string;
  attempted: number | null;
  joined: number | null;
  active: number | null;
  failed: number | null;
  disconnected: number | null;
  roomsCreated: number | null;
  matchStarts: number | null;
  abnormalDisconnects: number | null;
  consentedLeaves: number | null;
  snapshotsPlaying: number | null;
  inputsSent: number | null;
}

interface LoadtestLeaveEvent {
  tsIso: string;
  clientId: number | null;
  roomId: string | null;
  leaveCode: number | null;
  phase: string | null;
  isAbnormalDisconnect: boolean;
  isConsentedLeave: boolean;
}

interface LoadtestParsed {
  runnerLabel: string | null;
  summarySamples: LoadtestSummarySample[];
  leaveEvents: LoadtestLeaveEvent[];
  disconnectCodes: Record<string, number>;
  failureReasons: Record<string, number>;
  result: {
    joined: number | null;
    expected: number | null;
    failedJoins: number | null;
    disconnected: number | null;
    topDisconnectCodes: string | null;
  };
  successfulConnections: number | null;
  failedConnections: number | null;
}

interface MarkerEvent {
  tsIso: string;
  type:
    | "process_boot"
    | "pm2_error"
    | "pm2_unconsented_leave"
    | "kernel_oom"
    | "kernel_segfault";
  title: string;
  details: string;
  severity: "info" | "warn" | "high";
}

interface IncidentEvent {
  id: string;
  tsIso: string;
  type:
    | "mass_drop"
    | "unconsented_jump"
    | "restart_event"
    | "leave1006_burst"
    | "process_boot"
    | "crash_signal";
  title: string;
  details: string;
  severity: "info" | "warn" | "high";
  metric?: string;
  value?: number;
}

interface ParsedEventsFile {
  runId: string;
  generatedAtIso: string;
  runMeta: RunMetaFile | null;
  runnerDetected: string | null;
  summary: {
    joined: number | null;
    expected: number | null;
    failedJoins: number | null;
    disconnected: number | null;
    successfulConnections: number | null;
    failedConnections: number | null;
    disconnectCodes: Record<string, number>;
    failureReasons: Record<string, number>;
    peakOpsClients: number | null;
    peakOpsRooms: number | null;
    peakOpsLeftUnconsented: number | null;
    opsLeftUnconsentedStart: number | null;
    opsLeftUnconsentedEnd: number | null;
    opsLeftUnconsentedDelta: number | null;
    peakPm2MemMb: number | null;
    peakPm2CpuPct: number | null;
    peakPm2Restarts: number | null;
    peakNetRxBps: number | null;
    peakNetTxBps: number | null;
    abnormalDisconnects: number | null;
    consentedLeaves: number | null;
    serverDisconnects: number | null;
    loadtestExitCode: number | null;
  };
  timelines: {
    metrics: MetricsSample[];
    loadtestSummary: LoadtestSummarySample[];
  };
  markers: MarkerEvent[];
  incidents: IncidentEvent[];
}

interface RunIndexEntry {
  runId: string;
  runDir: string;
  startedAtIso: string | null;
  endedAtIso: string | null;
  runner: string | null;
  params: Record<string, unknown> | null;
  summary: ParsedEventsFile["summary"];
  incidentCounts: Record<string, number>;
  topIncidents: IncidentEvent[];
  parsedEventsPath: string;
  files: {
    runMeta: string;
    loadtestLog: string;
    metricsLog: string;
    pm2Log: string;
    kernelLog: string;
  };
}

interface RunsIndexFile {
  generatedAtIso: string;
  runs: RunIndexEntry[];
}

function logInfo(message: string): void {
  console.log("[ObservedIndex.main]", message);
}

function parseCliOptions(): CliOptions {
  let runsDir = path.join(process.cwd(), "observed-runs");
  let runIdFilter: string | null = null;
  let massDropThreshold = 8;

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i] ?? "";
    if (arg === "--runsDir") {
      runsDir = process.argv[i + 1] ?? runsDir;
      i += 1;
      continue;
    }
    if (arg === "--runId") {
      runIdFilter = process.argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--massDropThreshold") {
      const raw = process.argv[i + 1];
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        massDropThreshold = parsed;
      }
      i += 1;
      continue;
    }
  }

  return {
    runsDir: path.resolve(runsDir),
    runIdFilter,
    massDropThreshold,
  };
}

function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function readTextFile(filePath: string): string {
  if (!fileExists(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function stripUtf8Bom(input: string): string {
  if (input.charCodeAt(0) === 0xfeff) {
    return input.slice(1);
  }
  return input;
}

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

function parseNumber(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIso(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function parseIsoFromLine(line: string): string | null {
  const match = line.match(
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:\d{2}))/,
  );
  if (!match) return null;
  return normalizeIso(match[1] ?? null);
}

function parseKeyValueTokens(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_.]+)=([^\s]+)/g;
  while (true) {
    const match = regex.exec(line);
    if (!match) break;
    const key = match[1] ?? "";
    const value = match[2] ?? "";
    if (key.length <= 0) continue;
    out[key] = value;
  }
  return out;
}

function parseCodeMap(raw: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  const parts = raw.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length <= 0) continue;
    const [keyRaw, countRaw] = trimmed.split(":");
    const key = (keyRaw ?? "").trim();
    const count = Number.parseInt((countRaw ?? "").trim(), 10);
    if (key.length <= 0 || !Number.isFinite(count)) continue;
    out[key] = count;
  }
  return out;
}

function maxNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null);
  if (filtered.length <= 0) return null;
  return Math.max(...filtered);
}

function parseMetricsLog(metricsLogPath: string): MetricsSample[] {
  const content = readTextFile(metricsLogPath);
  if (content.length <= 0) return [];

  const lines = content.split(/\r?\n/);
  const samples: MetricsSample[] = [];

  for (const rawLine of lines) {
    const line = stripAnsi(rawLine).trim();
    if (line.length <= 0) continue;

    const firstSpace = line.indexOf(" ");
    if (firstSpace <= 0) continue;
    const tsCandidate = line.slice(0, firstSpace);
    const tsIso = normalizeIso(tsCandidate);
    if (!tsIso) continue;

    const tokens = parseKeyValueTokens(line.slice(firstSpace + 1));
    const pm2CpuRaw = parseNumber(tokens["pm2.cpuPct"]);
    const pm2MemRaw = parseNumber(tokens["pm2.memMB"]);
    const pm2RestartsRaw = parseNumber(tokens["pm2.restarts"]);
    const pm2MemNormalized =
      pm2MemRaw !== null && Number.isFinite(pm2MemRaw) && pm2MemRaw > 0
        ? pm2MemRaw
        : null;
    const pm2CpuNormalized =
      pm2MemNormalized !== null &&
      pm2CpuRaw !== null &&
      Number.isFinite(pm2CpuRaw) &&
      pm2CpuRaw >= 0
        ? pm2CpuRaw
        : null;
    const pm2RestartsNormalized =
      pm2MemNormalized !== null &&
      pm2RestartsRaw !== null &&
      Number.isFinite(pm2RestartsRaw) &&
      pm2RestartsRaw >= 0
        ? pm2RestartsRaw
        : null;
    samples.push({
      tsIso,
      hostLoad1: parseNumber(tokens["host.load1"]),
      hostMemUsedPct: parseNumber(tokens["host.memUsedPct"]),
      hostMemUsedMb: parseNumber(tokens["host.memUsedMB"]),
      pm2CpuPct: pm2CpuNormalized,
      pm2MemMb: pm2MemNormalized,
      pm2Restarts: pm2RestartsNormalized,
      opsClients: parseNumber(tokens["ops.clients"]),
      opsRooms: parseNumber(tokens["ops.rooms"]),
      opsLeftUnconsented: parseNumber(tokens["ops.leftUnconsented"]),
      opsRttP95Ms: parseNumber(tokens["ops.rttP95ms"]),
      netRxBps: parseNumber(tokens["net.rxBps"]),
      netTxBps: parseNumber(tokens["net.txBps"]),
    });
  }

  return samples.sort((a, b) => a.tsIso.localeCompare(b.tsIso));
}

function parseLoadtestLog(loadtestLogPath: string): LoadtestParsed {
  const content = readTextFile(loadtestLogPath);
  const result: LoadtestParsed = {
    runnerLabel: null,
    summarySamples: [],
    leaveEvents: [],
    disconnectCodes: {},
    failureReasons: {},
    result: {
      joined: null,
      expected: null,
      failedJoins: null,
      disconnected: null,
      topDisconnectCodes: null,
    },
    successfulConnections: null,
    failedConnections: null,
  };
  if (content.length <= 0) return result;

  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripAnsi(rawLine);
    if (line.length <= 0) continue;

    if (line.includes("LoadTest.lobbyfill")) {
      result.runnerLabel = "lobbyfill";
    } else if (line.includes("LoadTest.minimal")) {
      result.runnerLabel = "roomcode";
    }

    if (line.includes("Successful connections:")) {
      const match = line.match(/Successful connections:\s*([0-9]+)/);
      if (match) {
        result.successfulConnections = parseInteger(match[1]);
      }
    }

    if (line.includes("Failed connections:")) {
      const match = line.match(/Failed connections:\s*([0-9]+)/);
      if (match) {
        result.failedConnections = parseInteger(match[1]);
      }
    }

    if (
      line.includes("LoadTest.lobbyfill.summary") ||
      line.includes("LoadTest.minimal.summary")
    ) {
      if (line.includes("disconnectCodes=")) {
        const match = line.match(/disconnectCodes=([^'"\r\n]+)/);
        if (match) {
          result.disconnectCodes = parseCodeMap(match[1] ?? null);
        }
      }
      if (line.includes("leaveCodes=") && Object.keys(result.disconnectCodes).length <= 0) {
        const match = line.match(/leaveCodes=([^'"\r\n]+)/);
        if (match) {
          result.disconnectCodes = parseCodeMap(match[1] ?? null);
        }
      }
      if (line.includes("failureReasons=")) {
        const match = line.match(/failureReasons=([^'"\r\n]+)/);
        if (match) {
          result.failureReasons = parseCodeMap(match[1] ?? null);
        }
      }
      if (line.includes("ts=") && line.includes("attempted=")) {
        const tsMatch = line.match(/ts=([0-9T:\-+.Z]+)/);
        const tsIso = normalizeIso(tsMatch?.[1] ?? null);
        if (!tsIso) continue;
        const tokens = parseKeyValueTokens(line);
        result.summarySamples.push({
          tsIso,
          attempted: parseInteger(tokens.attempted),
          joined: parseInteger(tokens.joined),
          active: parseInteger(tokens.active),
          failed: parseInteger(tokens.failed),
          disconnected: parseInteger(tokens.disconnected),
          roomsCreated: parseInteger(tokens.roomsCreated),
          matchStarts: parseInteger(tokens.matchStarts),
          abnormalDisconnects: parseInteger(
            tokens.abnormalDisconnects ?? tokens.serverDisconnects,
          ),
          consentedLeaves: parseInteger(tokens.consentedLeaves),
          snapshotsPlaying: parseInteger(tokens.snapshotsPlaying),
          inputsSent: parseInteger(tokens.inputsSent),
        });
      }
    }

    if (
      line.includes("LoadTest.lobbyfill.result") ||
      line.includes("LoadTest.minimal.result")
    ) {
      const joinedMatch = line.match(/joined=([0-9]+)\/([0-9]+)/);
      if (joinedMatch) {
        result.result.joined = parseInteger(joinedMatch[1]);
        result.result.expected = parseInteger(joinedMatch[2]);
      }
      const failedJoins = line.match(/failedJoins=([0-9]+)/);
      const disconnected = line.match(/disconnected=([0-9]+)/);
      const topDisconnectCodes =
        line.match(/topDisconnectCodes=([^'"\r\n]+)/) ??
        line.match(/topLeaveCodes=([^'"\r\n]+)/);
      result.result.failedJoins = parseInteger(failedJoins?.[1]);
      result.result.disconnected = parseInteger(disconnected?.[1]);
      result.result.topDisconnectCodes = topDisconnectCodes
        ? (topDisconnectCodes[1] ?? "").trim()
        : null;
    }

    if (
      line.includes("LoadTest.lobbyfill.attachInputLoop") &&
      line.includes("leaveCode=")
    ) {
      const tsMatch = line.match(/ts=([0-9T:\-+.Z]+)/);
      const tsIso = normalizeIso(tsMatch?.[1] ?? null);
      if (!tsIso) continue;
      const tokens = parseKeyValueTokens(line);
      const leaveCode = parseInteger(tokens.leaveCode);
      const clientId = parseInteger(tokens.client);
      const roomId = tokens.roomId ?? null;
      const phase = tokens.phase ?? null;
      const isAbnormalDisconnect =
        tokens.isAbnormalDisconnect !== undefined
          ? tokens.isAbnormalDisconnect === "true"
          : leaveCode === 1005 || leaveCode === 1006;
      const isConsentedLeave =
        (tokens.isConsentedLeave ?? (leaveCode === 4000 ? "true" : "false")) ===
        "true";
      result.leaveEvents.push({
        tsIso,
        clientId,
        roomId,
        leaveCode,
        phase,
        isAbnormalDisconnect,
        isConsentedLeave,
      });
    }
  }

  result.summarySamples.sort((a, b) => a.tsIso.localeCompare(b.tsIso));
  result.leaveEvents.sort((a, b) => a.tsIso.localeCompare(b.tsIso));
  return result;
}

function parsePm2Log(pm2LogPath: string): MarkerEvent[] {
  const content = readTextFile(pm2LogPath);
  if (content.length <= 0) return [];
  const lines = content.split(/\r?\n/);
  const markers: MarkerEvent[] = [];

  for (const rawLine of lines) {
    const line = stripAnsi(rawLine);
    if (line.length <= 0) continue;
    const tsIso = parseIsoFromLine(line) ?? new Date().toISOString();

    if (line.includes("[Server.lifecycle]")) {
      const jsonStart = line.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const payload = JSON.parse(line.slice(jsonStart)) as {
            event?: string;
            bootId?: string;
          };
          if (payload.event === "boot") {
            markers.push({
              tsIso,
              type: "process_boot",
              title: "Server boot",
              details: "Server.lifecycle boot event" + (payload.bootId ? " bootId=" + payload.bootId : ""),
              severity: "warn",
            });
          } else if (
            payload.event === "unhandledRejection" ||
            payload.event === "uncaughtException" ||
            payload.event === "httpServerError"
          ) {
            markers.push({
              tsIso,
              type: "pm2_error",
              title: "Server lifecycle error",
              details: "Server.lifecycle event=" + (payload.event ?? "unknown"),
              severity: "high",
            });
          }
        } catch (_error) {
          // Ignore malformed lines.
        }
      }
    }

    if (line.includes("SpaceForceRoom.onLeave") && line.includes("consented=false")) {
      markers.push({
        tsIso,
        type: "pm2_unconsented_leave",
        title: "Unconsented leave",
        details: line.trim(),
        severity: "info",
      });
    }

    if (
      /(\bout of memory\b|\boom(?:[-\s]killer)?\b|\bkilled process\b|\bsegfault\b|Unhandled promise rejection|Uncaught exception)/i.test(
        line,
      )
    ) {
      markers.push({
        tsIso,
        type: "pm2_error",
        title: "PM2/server error signal",
        details: line.trim(),
        severity: "high",
      });
    }
  }

  return markers.sort((a, b) => a.tsIso.localeCompare(b.tsIso));
}

function parseKernelLog(kernelLogPath: string): MarkerEvent[] {
  const content = readTextFile(kernelLogPath);
  if (content.length <= 0) return [];
  const lines = content.split(/\r?\n/);
  const markers: MarkerEvent[] = [];

  for (const rawLine of lines) {
    const line = stripAnsi(rawLine).trim();
    if (line.length <= 0) continue;
    if (!/(oom|out of memory|segfault|killed process)/i.test(line)) continue;

    const bracketMatch = line.match(/^\[([^\]]+)\]/);
    let tsIso: string | null = null;
    if (bracketMatch) {
      const candidate = (bracketMatch[1] ?? "").trim();
      tsIso = normalizeIso(candidate);
      if (!tsIso) {
        tsIso = normalizeIso(candidate + " UTC");
      }
    }
    if (!tsIso) {
      tsIso = parseIsoFromLine(line);
    }
    if (!tsIso) {
      tsIso = new Date().toISOString();
    }

    markers.push({
      tsIso,
      type: /(segfault)/i.test(line) ? "kernel_segfault" : "kernel_oom",
      title: /(segfault)/i.test(line) ? "Kernel segfault signal" : "Kernel OOM signal",
      details: line,
      severity: "high",
    });
  }

  return markers.sort((a, b) => a.tsIso.localeCompare(b.tsIso));
}

function buildIncidents(
  runId: string,
  metrics: MetricsSample[],
  loadtest: LoadtestParsed,
  markers: MarkerEvent[],
  massDropThreshold: number,
): IncidentEvent[] {
  const incidents: IncidentEvent[] = [];
  let incidentCounter = 0;
  const nextId = (): string => {
    incidentCounter += 1;
    return runId + "-inc-" + incidentCounter.toString().padStart(4, "0");
  };

  for (let i = 1; i < metrics.length; i += 1) {
    const previous = metrics[i - 1];
    const current = metrics[i];
    if (!previous || !current) continue;

    if (
      previous.opsClients !== null &&
      current.opsClients !== null &&
      previous.opsClients - current.opsClients >= massDropThreshold
    ) {
      incidents.push({
        id: nextId(),
        tsIso: current.tsIso,
        type: "mass_drop",
        title: "Mass client drop",
        details:
          "ops.clients dropped from " +
          previous.opsClients.toString() +
          " to " +
          current.opsClients.toString(),
        severity: "high",
        metric: "ops.clients",
        value: previous.opsClients - current.opsClients,
      });
    }

    if (
      previous.opsLeftUnconsented !== null &&
      current.opsLeftUnconsented !== null &&
      current.opsLeftUnconsented - previous.opsLeftUnconsented >= 2
    ) {
      incidents.push({
        id: nextId(),
        tsIso: current.tsIso,
        type: "unconsented_jump",
        title: "Unconsented leave jump",
        details:
          "ops.leftUnconsented increased from " +
          previous.opsLeftUnconsented.toString() +
          " to " +
          current.opsLeftUnconsented.toString(),
        severity: "warn",
        metric: "ops.leftUnconsented",
        value: current.opsLeftUnconsented - previous.opsLeftUnconsented,
      });
    }

    if (
      previous.pm2Restarts !== null &&
      current.pm2Restarts !== null &&
      current.pm2Restarts > previous.pm2Restarts
    ) {
      incidents.push({
        id: nextId(),
        tsIso: current.tsIso,
        type: "restart_event",
        title: "PM2 restart count increased",
        details:
          "pm2.restarts increased from " +
          previous.pm2Restarts.toString() +
          " to " +
          current.pm2Restarts.toString(),
        severity: "high",
        metric: "pm2.restarts",
        value: current.pm2Restarts - previous.pm2Restarts,
      });
    }
  }

  const burstBuckets = new Map<string, LoadtestLeaveEvent[]>();
  for (const event of loadtest.leaveEvents) {
    if (event.leaveCode !== 1006) continue;
    const bucket = event.tsIso.slice(0, 16);
    const existing = burstBuckets.get(bucket) ?? [];
    existing.push(event);
    burstBuckets.set(bucket, existing);
  }
  for (const [bucket, events] of burstBuckets.entries()) {
    if (events.length < 3) continue;
    const tsIso = events[0]?.tsIso ?? bucket;
    incidents.push({
      id: nextId(),
      tsIso,
      type: "leave1006_burst",
      title: "leaveCode=1006 burst",
      details: events.length.toString() + " abnormal disconnects in ~1 minute bucket",
      severity: "high",
      value: events.length,
    });
  }

  for (const marker of markers) {
    if (marker.type === "process_boot") {
      incidents.push({
        id: nextId(),
        tsIso: marker.tsIso,
        type: "process_boot",
        title: marker.title,
        details: marker.details,
        severity: marker.severity,
      });
      continue;
    }
    if (
      marker.type === "pm2_error" ||
      marker.type === "kernel_oom" ||
      marker.type === "kernel_segfault"
    ) {
      incidents.push({
        id: nextId(),
        tsIso: marker.tsIso,
        type: "crash_signal",
        title: marker.title,
        details: marker.details,
        severity: "high",
      });
    }
  }

  return incidents.sort((a, b) => a.tsIso.localeCompare(b.tsIso));
}

function readRunMeta(runMetaPath: string): RunMetaFile | null {
  if (!fileExists(runMetaPath)) return null;
  try {
    const payload = JSON.parse(stripUtf8Bom(readTextFile(runMetaPath))) as RunMetaFile;
    return payload;
  } catch (_error) {
    return null;
  }
}

function firstNonNegative(values: Array<number | null>): number | null {
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value < 0) continue;
    return value;
  }
  return null;
}

function lastNonNegative(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value < 0) continue;
    return value;
  }
  return null;
}

function resolveRunDirectories(runsDir: string, runIdFilter: string | null): string[] {
  if (!fileExists(runsDir)) return [];
  const entries = fs.readdirSync(runsDir, { withFileTypes: true });
  const dirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "dashboard") continue;
    if (runIdFilter && entry.name !== runIdFilter) continue;
    const runDirPath = path.join(runsDir, entry.name);
    const hasArtifacts =
      fileExists(path.join(runDirPath, "run-meta.json")) ||
      fileExists(path.join(runDirPath, "loadtest.log")) ||
      fileExists(path.join(runDirPath, "metrics.log")) ||
      fileExists(path.join(runDirPath, "pm2.log")) ||
      fileExists(path.join(runDirPath, "kernel.log"));
    if (!hasArtifacts) continue;
    dirs.push(entry.name);
  }
  return dirs.sort((a, b) => b.localeCompare(a));
}

function buildRunData(
  runsDir: string,
  runId: string,
  massDropThreshold: number,
): ParsedEventsFile {
  const runDir = path.join(runsDir, runId);
  const rawRunMeta = readRunMeta(path.join(runDir, "run-meta.json"));
  const metrics = parseMetricsLog(path.join(runDir, "metrics.log"));
  const loadtest = parseLoadtestLog(path.join(runDir, "loadtest.log"));
  const runnerDetected =
    (typeof rawRunMeta?.runner === "string" && rawRunMeta.runner.trim().length > 0
      ? rawRunMeta.runner.trim()
      : null) ?? loadtest.runnerLabel ?? null;
  const runMeta: RunMetaFile | null =
    rawRunMeta !== null
      ? runnerDetected && typeof rawRunMeta.runner !== "string"
        ? {
            ...rawRunMeta,
            runner: runnerDetected,
          }
        : rawRunMeta
      : runnerDetected
        ? { runner: runnerDetected }
        : null;
  const pm2Markers = parsePm2Log(path.join(runDir, "pm2.log"));
  const kernelMarkers = parseKernelLog(path.join(runDir, "kernel.log"));
  const markers = [...pm2Markers, ...kernelMarkers].sort((a, b) =>
    a.tsIso.localeCompare(b.tsIso),
  );
  const incidents = buildIncidents(runId, metrics, loadtest, markers, massDropThreshold);

  const lastSummary =
    loadtest.summarySamples.length > 0
      ? loadtest.summarySamples[loadtest.summarySamples.length - 1]
      : null;
  const abnormalDisconnectsFromLeaves = loadtest.leaveEvents.filter(
    (event) => event.isAbnormalDisconnect,
  ).length;
  const consentedLeavesFromLeaves = loadtest.leaveEvents.filter(
    (event) => event.isConsentedLeave,
  ).length;
  const abnormalDisconnectsFromCodes = Object.entries(loadtest.disconnectCodes).reduce(
    (sum, entry) => {
      const [code, count] = entry;
      if (code !== "1005" && code !== "1006") return sum;
      return sum + count;
    },
    0,
  );
  const consentedLeavesFromCodes = Object.entries(loadtest.disconnectCodes).reduce(
    (sum, entry) => {
      const [code, count] = entry;
      if (code !== "4000") return sum;
      return sum + count;
    },
    0,
  );
  const opsLeftUnconsentedStart = firstNonNegative(
    metrics.map((sample) => sample.opsLeftUnconsented),
  );
  const opsLeftUnconsentedEnd = lastNonNegative(
    metrics.map((sample) => sample.opsLeftUnconsented),
  );
  const opsLeftUnconsentedDelta =
    opsLeftUnconsentedStart !== null && opsLeftUnconsentedEnd !== null
      ? Math.max(0, opsLeftUnconsentedEnd - opsLeftUnconsentedStart)
      : null;

  return {
    runId,
    generatedAtIso: new Date().toISOString(),
    runMeta,
    runnerDetected,
    summary: {
      joined: loadtest.result.joined,
      expected: loadtest.result.expected,
      failedJoins: loadtest.result.failedJoins,
      disconnected: loadtest.result.disconnected,
      successfulConnections: loadtest.successfulConnections,
      failedConnections: loadtest.failedConnections,
      disconnectCodes: loadtest.disconnectCodes,
      failureReasons: loadtest.failureReasons,
      peakOpsClients: maxNullable(metrics.map((sample) => sample.opsClients)),
      peakOpsRooms: maxNullable(metrics.map((sample) => sample.opsRooms)),
      peakOpsLeftUnconsented: maxNullable(
        metrics.map((sample) => sample.opsLeftUnconsented),
      ),
      opsLeftUnconsentedStart,
      opsLeftUnconsentedEnd,
      opsLeftUnconsentedDelta,
      peakPm2MemMb: maxNullable(metrics.map((sample) => sample.pm2MemMb)),
      peakPm2CpuPct: maxNullable(metrics.map((sample) => sample.pm2CpuPct)),
      peakPm2Restarts: maxNullable(metrics.map((sample) => sample.pm2Restarts)),
      peakNetRxBps: maxNullable(metrics.map((sample) => sample.netRxBps)),
      peakNetTxBps: maxNullable(metrics.map((sample) => sample.netTxBps)),
      abnormalDisconnects:
        abnormalDisconnectsFromCodes > 0
          ? abnormalDisconnectsFromCodes
          : lastSummary?.abnormalDisconnects ?? abnormalDisconnectsFromLeaves,
      consentedLeaves:
        consentedLeavesFromCodes > 0
          ? consentedLeavesFromCodes
          : lastSummary?.consentedLeaves ?? consentedLeavesFromLeaves,
      serverDisconnects:
        abnormalDisconnectsFromCodes > 0
          ? abnormalDisconnectsFromCodes
          : lastSummary?.abnormalDisconnects ?? abnormalDisconnectsFromLeaves,
      loadtestExitCode:
        typeof runMeta?.loadtestExitCode === "number"
          ? runMeta.loadtestExitCode
          : null,
    },
    timelines: {
      metrics,
      loadtestSummary: loadtest.summarySamples,
    },
    markers,
    incidents,
  };
}

function writeParsedEventsFile(
  runsDir: string,
  runId: string,
  data: ParsedEventsFile,
): void {
  const filePath = path.join(runsDir, runId, "parsed-events.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function countIncidentTypes(incidents: IncidentEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const incident of incidents) {
    const key = incident.type;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function resolveStartedAtIso(parsed: ParsedEventsFile): string | null {
  const fromMeta = normalizeIso(parsed.runMeta?.startedAtIso ?? null);
  if (fromMeta) return fromMeta;
  const metricStart = parsed.timelines.metrics[0]?.tsIso ?? null;
  if (metricStart) return metricStart;
  const summaryStart = parsed.timelines.loadtestSummary[0]?.tsIso ?? null;
  return summaryStart;
}

function resolveEndedAtIso(parsed: ParsedEventsFile): string | null {
  const fromMeta = normalizeIso(parsed.runMeta?.endedAtIso ?? null);
  if (fromMeta) return fromMeta;
  const metricEnd =
    parsed.timelines.metrics.length > 0
      ? parsed.timelines.metrics[parsed.timelines.metrics.length - 1]?.tsIso ?? null
      : null;
  if (metricEnd) return metricEnd;
  const summaryEnd =
    parsed.timelines.loadtestSummary.length > 0
      ? parsed.timelines.loadtestSummary[parsed.timelines.loadtestSummary.length - 1]
          ?.tsIso ?? null
      : null;
  return summaryEnd;
}

function buildRunIndexEntry(runId: string, parsed: ParsedEventsFile): RunIndexEntry {
  return {
    runId,
    runDir: runId,
    startedAtIso: resolveStartedAtIso(parsed),
    endedAtIso: resolveEndedAtIso(parsed),
    runner: parsed.runnerDetected,
    params:
      parsed.runMeta?.params && typeof parsed.runMeta.params === "object"
        ? (parsed.runMeta.params as Record<string, unknown>)
        : null,
    summary: parsed.summary,
    incidentCounts: countIncidentTypes(parsed.incidents),
    topIncidents: parsed.incidents.slice(0, 20),
    parsedEventsPath: path.posix.join(runId, "parsed-events.json"),
    files: {
      runMeta: path.posix.join(runId, "run-meta.json"),
      loadtestLog: path.posix.join(runId, "loadtest.log"),
      metricsLog: path.posix.join(runId, "metrics.log"),
      pm2Log: path.posix.join(runId, "pm2.log"),
      kernelLog: path.posix.join(runId, "kernel.log"),
    },
  };
}

function sortRunEntries(runs: RunIndexEntry[]): RunIndexEntry[] {
  return [...runs].sort((a, b) => {
    const aTs = a.startedAtIso ? Date.parse(a.startedAtIso) : Number.NaN;
    const bTs = b.startedAtIso ? Date.parse(b.startedAtIso) : Number.NaN;
    if (Number.isFinite(aTs) && Number.isFinite(bTs)) {
      return bTs - aTs;
    }
    if (Number.isFinite(aTs)) return -1;
    if (Number.isFinite(bTs)) return 1;
    return b.runId.localeCompare(a.runId);
  });
}

async function main(): Promise<void> {
  const options = parseCliOptions();
  ensureDirectory(options.runsDir);

  let runIds = resolveRunDirectories(options.runsDir, options.runIdFilter);
  if (runIds.length <= 0 && options.runIdFilter) {
    logInfo(
      "Requested --runId " +
        options.runIdFilter +
        " was not found. Rebuilding index from all runs.",
    );
    runIds = resolveRunDirectories(options.runsDir, null);
  }
  if (runIds.length <= 0) {
    const emptyIndex: RunsIndexFile = {
      generatedAtIso: new Date().toISOString(),
      runs: [],
    };
    fs.writeFileSync(
      path.join(options.runsDir, "index.json"),
      JSON.stringify(emptyIndex, null, 2),
    );
    logInfo("No observed run folders found. Wrote empty index.json");
    return;
  }

  const runEntries: RunIndexEntry[] = [];
  for (const runId of runIds) {
    const parsed = buildRunData(options.runsDir, runId, options.massDropThreshold);
    writeParsedEventsFile(options.runsDir, runId, parsed);
    runEntries.push(buildRunIndexEntry(runId, parsed));
    logInfo(
      "Parsed runId=" +
        runId +
        " metrics=" +
        parsed.timelines.metrics.length.toString() +
        " incidents=" +
        parsed.incidents.length.toString(),
    );
  }

  const sortedEntries = sortRunEntries(runEntries);
  const indexFile: RunsIndexFile = {
    generatedAtIso: new Date().toISOString(),
    runs: sortedEntries,
  };
  fs.writeFileSync(
    path.join(options.runsDir, "index.json"),
    JSON.stringify(indexFile, null, 2),
  );
  logInfo("Wrote observed-runs/index.json with " + sortedEntries.length.toString() + " runs");
}

void main().catch((error) => {
  console.error("[ObservedIndex.main]", "Fatal error", error);
  process.exit(1);
});
