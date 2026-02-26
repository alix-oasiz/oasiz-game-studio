import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

type CapacityRunner = "roomcode" | "lobbyfill";

interface SweepConfig {
  runner: CapacityRunner;
  roomCode: string | null;
  usersPerRoom: number | null;
  waitForGroupMs: number | null;
  startDelayMs: number | null;
  startFallbackMs: number | null;
  stages: number[];
  durationSec: number;
  delayMs: number;
  cooldownSec: number;
  summaryIntervalMs: number;
  requestTimeoutMs: number | null;
  endpoint: string | null;
  outputDir: string;
  doToken: string | null;
  doDropletId: string | null;
  doInterface: "public" | "private";
}

interface ParsedLoadtestResult {
  joined: number | null;
  expected: number | null;
  failedJoins: number | null;
  disconnected: number | null;
  serverDisconnects: number | null;
  inputsSent: number | null;
  topLeaveCodes: string | null;
}

interface DoMetricSummary {
  series: number;
  samples: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  p95: number | null;
}

interface StageSummary {
  stageIndex: number;
  clients: number;
  startedAtIso: string;
  endedAtIso: string;
  startedAtSec: number;
  endedAtSec: number;
  loadtestExitCode: number;
  logPath: string;
  parsedResult: ParsedLoadtestResult;
  doMetrics: Record<string, DoMetricSummary>;
  doMetricErrors: string[];
}

function hasArg(name: string): boolean {
  const exact = "--" + name;
  const prefix = exact + "=";
  return process.argv.some((arg) => arg === exact || arg.startsWith(prefix));
}

function readArgValue(name: string): string | null {
  const exact = "--" + name;
  const prefix = exact + "=";
  for (let i = 0; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === exact) {
      const next = process.argv[i + 1];
      if (typeof next === "string" && !next.startsWith("--")) {
        return next;
      }
      return null;
    }
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }
  return null;
}

function readStringArgOrEnv(argName: string, envName: string): string | null {
  const fromArg = readArgValue(argName);
  if (typeof fromArg === "string" && fromArg.trim().length > 0) {
    return fromArg.trim();
  }
  const fromEnv = process.env[envName];
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return null;
}

function readNumberArgOrEnv(
  argName: string,
  envName: string,
  fallback: number,
): number {
  const fromArg = readArgValue(argName);
  if (fromArg !== null) {
    const parsed = Number.parseFloat(fromArg);
    if (Number.isFinite(parsed)) return parsed;
  }
  const fromEnv = process.env[envName];
  if (typeof fromEnv === "string") {
    const parsed = Number.parseFloat(fromEnv);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readNullableNumberArgOrEnv(
  argName: string,
  envName: string,
): number | null {
  const fromArg = readArgValue(argName);
  if (fromArg !== null) {
    const parsed = Number.parseFloat(fromArg);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const fromEnv = process.env[envName];
  if (typeof fromEnv === "string") {
    const parsed = Number.parseFloat(fromEnv);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseStages(raw: string): number[] {
  const out: number[] = [];
  const parts = raw.split(",");
  for (const part of parts) {
    const parsed = Number.parseInt(part.trim(), 10);
    if (!Number.isFinite(parsed)) continue;
    if (parsed <= 0) continue;
    out.push(parsed);
  }
  return out;
}

function pad2(value: number): string {
  return value < 10 ? "0" + value.toString() : value.toString();
}

function buildTimestampText(now: Date): string {
  return (
    now.getFullYear().toString() +
    pad2(now.getMonth() + 1) +
    pad2(now.getDate()) +
    "-" +
    pad2(now.getHours()) +
    pad2(now.getMinutes()) +
    pad2(now.getSeconds())
  );
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveConfig(): SweepConfig {
  const runnerRaw = readStringArgOrEnv("runner", "LOADTEST_CAPACITY_RUNNER");
  const runner: CapacityRunner = runnerRaw === "roomcode" ? "roomcode" : "lobbyfill";

  const roomCode = readStringArgOrEnv("roomCode", "LOADTEST_ROOM_CODE");
  if (runner === "roomcode" && !roomCode) {
    console.error(
      "[LoadTest.capacity]",
      "Missing room code for roomcode runner. Pass --roomCode or set LOADTEST_ROOM_CODE.",
    );
    process.exit(1);
  }

  const usersPerRoomRaw = readNullableNumberArgOrEnv(
    "usersPerRoom",
    "LOADTEST_USERS_PER_ROOM",
  );
  const usersPerRoom =
    usersPerRoomRaw !== null && usersPerRoomRaw > 0
      ? Math.floor(usersPerRoomRaw)
      : null;

  const waitForGroupMsRaw = readNullableNumberArgOrEnv(
    "waitForGroupMs",
    "LOADTEST_WAIT_FOR_GROUP_MS",
  );
  const waitForGroupMs =
    waitForGroupMsRaw !== null && waitForGroupMsRaw > 0
      ? Math.floor(waitForGroupMsRaw)
      : null;

  const startDelayMsRaw = readNullableNumberArgOrEnv(
    "startDelayMs",
    "LOADTEST_START_DELAY_MS",
  );
  const startDelayMs =
    startDelayMsRaw !== null && startDelayMsRaw >= 0
      ? Math.floor(startDelayMsRaw)
      : null;

  const startFallbackMsRaw = readNullableNumberArgOrEnv(
    "startFallbackMs",
    "LOADTEST_START_FALLBACK_MS",
  );
  const startFallbackMs =
    startFallbackMsRaw !== null && startFallbackMsRaw > 0
      ? Math.floor(startFallbackMsRaw)
      : null;

  const stagesRaw =
    readStringArgOrEnv("stages", "LOADTEST_CAPACITY_STAGES") ?? "20,40,60,80";
  const stages = parseStages(stagesRaw);
  if (stages.length <= 0) {
    console.error(
      "[LoadTest.capacity]",
      "No valid stages. Example: --stages 20,40,60",
    );
    process.exit(1);
  }

  const durationSec = Math.max(
    1,
    Math.floor(readNumberArgOrEnv("durationSec", "LOADTEST_DURATION_SEC", 300)),
  );
  const delayMs = Math.max(
    0,
    Math.floor(readNumberArgOrEnv("delay", "LOADTEST_DELAY_MS", 20)),
  );
  const cooldownSec = Math.max(
    0,
    Math.floor(readNumberArgOrEnv("cooldownSec", "LOADTEST_COOLDOWN_SEC", 20)),
  );
  const summaryIntervalMs = Math.max(
    1000,
    Math.floor(
      readNumberArgOrEnv("summaryIntervalMs", "LOADTEST_SUMMARY_INTERVAL_MS", 5000),
    ),
  );
  const requestTimeoutMsRaw = readNullableNumberArgOrEnv(
    "requestTimeoutMs",
    "LOADTEST_REQUEST_TIMEOUT_MS",
  );
  const requestTimeoutMs =
    requestTimeoutMsRaw !== null
      ? Math.max(1000, Math.floor(requestTimeoutMsRaw))
      : null;

  const endpoint = readStringArgOrEnv("endpoint", "VITE_COLYSEUS_WS_URL");

  const defaultOutputDir = path.join(
    process.cwd(),
    "loadtest-logs",
    "capacity-sweep-" + buildTimestampText(new Date()),
  );
  const outputDir =
    readStringArgOrEnv("outputDir", "LOADTEST_CAPACITY_OUTPUT_DIR") ??
    defaultOutputDir;
  ensureDir(outputDir);

  const doToken = readStringArgOrEnv("doToken", "DO_API_TOKEN");
  const doDropletId = readStringArgOrEnv("doDropletId", "DO_DROPLET_ID");
  const doInterfaceRaw =
    readStringArgOrEnv("doInterface", "DO_DROPLET_INTERFACE") ?? "public";
  const doInterface = doInterfaceRaw === "private" ? "private" : "public";

  if ((doToken && !doDropletId) || (!doToken && doDropletId)) {
    console.log(
      "[LoadTest.capacity]",
      "DigitalOcean metric fetch disabled: set both DO_API_TOKEN and DO_DROPLET_ID.",
    );
  }

  return {
    runner,
    roomCode: roomCode ? roomCode.toUpperCase() : null,
    usersPerRoom,
    waitForGroupMs,
    startDelayMs,
    startFallbackMs,
    stages,
    durationSec,
    delayMs,
    cooldownSec,
    summaryIntervalMs,
    requestTimeoutMs,
    endpoint,
    outputDir,
    doToken,
    doDropletId,
    doInterface,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runLoadtestStage(
  config: SweepConfig,
  clients: number,
  outputLogPath: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const runnerScript =
      config.runner === "roomcode" ? "loadtest:roomcode" : "loadtest:lobbyfill";
    const args = [
      "run",
      runnerScript,
      "--",
      "--numClients",
      clients.toString(),
      "--delay",
      config.delayMs.toString(),
      "--durationSec",
      config.durationSec.toString(),
      "--summaryIntervalMs",
      config.summaryIntervalMs.toString(),
      "--autoExitOnComplete",
      "true",
      "--output",
      outputLogPath,
    ];

    if (config.runner === "roomcode" && config.roomCode) {
      args.push("--roomCode", config.roomCode);
    }

    if (config.runner === "lobbyfill") {
      if (config.usersPerRoom !== null) {
        args.push("--usersPerRoom", config.usersPerRoom.toString());
      }
      if (config.waitForGroupMs !== null) {
        args.push("--waitForGroupMs", config.waitForGroupMs.toString());
      }
      if (config.startDelayMs !== null) {
        args.push("--startDelayMs", config.startDelayMs.toString());
      }
      if (config.startFallbackMs !== null) {
        args.push("--startFallbackMs", config.startFallbackMs.toString());
      }
    }

    if (config.endpoint) {
      args.push("--endpoint", config.endpoint);
    }
    if (config.requestTimeoutMs !== null) {
      args.push("--requestTimeoutMs", config.requestTimeoutMs.toString());
    }

    const child = spawn(npmCommand, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

function parseNumberField(line: string, key: string): number | null {
  const regex = new RegExp(key + "=([0-9]+)");
  const match = line.match(regex);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLoadtestResult(logPath: string): ParsedLoadtestResult {
  if (!fs.existsSync(logPath)) {
    return {
      joined: null,
      expected: null,
      failedJoins: null,
      disconnected: null,
      serverDisconnects: null,
      inputsSent: null,
      topLeaveCodes: null,
    };
  }

  const content = fs.readFileSync(logPath, "utf8");
  const lines = content.split(/\r?\n/);

  let resultLine: string | null = null;
  let summaryLine: string | null = null;
  for (const line of lines) {
    if (line.includes("joined=") && line.includes("failedJoins=")) {
      resultLine = line;
    }
    if (line.includes("serverDisconnects=") && line.includes("inputsSent=")) {
      summaryLine = line;
    }
  }

  let joined: number | null = null;
  let expected: number | null = null;
  let failedJoins: number | null = null;
  let disconnected: number | null = null;
  let topLeaveCodes: string | null = null;

  if (resultLine) {
    const joinedMatch = resultLine.match(/joined=([0-9]+)\/([0-9]+)/);
    if (joinedMatch) {
      const parsedJoined = Number.parseInt(joinedMatch[1] ?? "", 10);
      const parsedExpected = Number.parseInt(joinedMatch[2] ?? "", 10);
      joined = Number.isFinite(parsedJoined) ? parsedJoined : null;
      expected = Number.isFinite(parsedExpected) ? parsedExpected : null;
    }
    failedJoins = parseNumberField(resultLine, "failedJoins");
    disconnected = parseNumberField(resultLine, "disconnected");
    const topMatch = resultLine.match(/topLeaveCodes=([^'"\r\n]+)/);
    if (topMatch && typeof topMatch[1] === "string") {
      topLeaveCodes = topMatch[1].trim();
    }
  }

  const serverDisconnects =
    summaryLine !== null ? parseNumberField(summaryLine, "serverDisconnects") : null;
  const inputsSent =
    summaryLine !== null ? parseNumberField(summaryLine, "inputsSent") : null;

  return {
    joined,
    expected,
    failedJoins,
    disconnected,
    serverDisconnects,
    inputsSent,
    topLeaveCodes,
  };
}

function quantile(values: number[], q: number): number | null {
  if (values.length <= 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const clampedQ = Math.max(0, Math.min(1, q));
  const index = Math.floor((sorted.length - 1) * clampedQ);
  return sorted[index] ?? sorted[sorted.length - 1] ?? null;
}

function summarizeDoMetric(payload: unknown): DoMetricSummary {
  const values: number[] = [];
  const view = payload as {
    data?: {
      result?: Array<{ values?: Array<[number | string, number | string]> }>;
    };
  };
  const result = view.data?.result;
  if (Array.isArray(result)) {
    for (const series of result) {
      const points = series.values;
      if (!Array.isArray(points)) continue;
      for (const point of points) {
        const rawValue = point?.[1];
        const parsed =
          typeof rawValue === "number"
            ? rawValue
            : Number.parseFloat(String(rawValue));
        if (!Number.isFinite(parsed)) continue;
        values.push(parsed);
      }
    }
  }

  if (values.length <= 0) {
    return {
      series: Array.isArray(result) ? result.length : 0,
      samples: 0,
      min: null,
      max: null,
      avg: null,
      p95: null,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
  return {
    series: Array.isArray(result) ? result.length : 0,
    samples: values.length,
    min,
    max,
    avg,
    p95: quantile(values, 0.95),
  };
}

async function fetchDoMetric(
  token: string,
  metricPath: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL("https://api.digitalocean.com" + metricPath);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
  });

  const bodyText = await response.text();
  const payload = bodyText.length > 0 ? JSON.parse(bodyText) : {};
  if (!response.ok) {
    throw new Error(
      "DigitalOcean metric request failed " +
        response.status.toString() +
        " " +
        response.statusText,
    );
  }
  return payload;
}

function formatStageClients(value: number): string {
  return value.toString().padStart(4, "0");
}

function stageCsvLine(stage: StageSummary): string {
  return [
    stage.stageIndex.toString(),
    stage.clients.toString(),
    stage.loadtestExitCode.toString(),
    stage.startedAtIso,
    stage.endedAtIso,
    stage.parsedResult.joined?.toString() ?? "",
    stage.parsedResult.expected?.toString() ?? "",
    stage.parsedResult.failedJoins?.toString() ?? "",
    stage.parsedResult.disconnected?.toString() ?? "",
    stage.parsedResult.serverDisconnects?.toString() ?? "",
    stage.parsedResult.inputsSent?.toString() ?? "",
    stage.parsedResult.topLeaveCodes ?? "",
  ].join(",");
}

async function main(): Promise<void> {
  const config = resolveConfig();
  const doMetricsEnabled = Boolean(config.doToken && config.doDropletId);

  console.log(
    "[LoadTest.capacity]",
    "Starting capacity sweep runner=" +
      config.runner +
      " roomCode=" +
      (config.roomCode ?? "auto") +
      " stages=" +
      config.stages.join(",") +
      " durationSec=" +
      config.durationSec,
  );
  console.log("[LoadTest.capacity]", "Output directory " + config.outputDir);

  const doMetricsDir = path.join(config.outputDir, "do-metrics");
  if (doMetricsEnabled) {
    ensureDir(doMetricsDir);
    console.log(
      "[LoadTest.capacity]",
      "DigitalOcean metric capture enabled dropletId=" + config.doDropletId,
    );
  }

  const summaries: StageSummary[] = [];

  for (let index = 0; index < config.stages.length; index += 1) {
    const clients = config.stages[index] ?? 0;
    const startedAtSec = Math.floor(Date.now() / 1000);
    const startedAtIso = new Date(startedAtSec * 1000).toISOString();
    const stageTag = "stage-" + (index + 1).toString() + "-" + formatStageClients(clients);
    const logPath = path.join(config.outputDir, stageTag + ".log");

    console.log(
      "[LoadTest.capacity]",
      "Running " +
        stageTag +
        " clients=" +
        clients +
        " logPath=" +
        logPath,
    );
    const exitCode = await runLoadtestStage(config, clients, logPath);
    const endedAtSec = Math.floor(Date.now() / 1000);
    const endedAtIso = new Date(endedAtSec * 1000).toISOString();

    const parsedResult = parseLoadtestResult(logPath);
    const stageSummary: StageSummary = {
      stageIndex: index + 1,
      clients,
      startedAtIso,
      endedAtIso,
      startedAtSec,
      endedAtSec,
      loadtestExitCode: exitCode,
      logPath,
      parsedResult,
      doMetrics: {},
      doMetricErrors: [],
    };

    if (doMetricsEnabled && config.doToken && config.doDropletId) {
      const baseParams = {
        host_id: config.doDropletId,
        start: stageSummary.startedAtSec.toString(),
        end: stageSummary.endedAtSec.toString(),
      };
      const fetchPlan: Array<{
        id: string;
        path: string;
        params: Record<string, string>;
      }> = [
        {
          id: "cpu",
          path: "/v2/monitoring/metrics/droplet/cpu",
          params: { ...baseParams },
        },
        {
          id: "load_1",
          path: "/v2/monitoring/metrics/droplet/load_1",
          params: { ...baseParams },
        },
        {
          id: "load_5",
          path: "/v2/monitoring/metrics/droplet/load_5",
          params: { ...baseParams },
        },
        {
          id: "memory_available",
          path: "/v2/monitoring/metrics/droplet/memory_available",
          params: { ...baseParams },
        },
        {
          id: "memory_free",
          path: "/v2/monitoring/metrics/droplet/memory_free",
          params: { ...baseParams },
        },
        {
          id: "bandwidth_inbound",
          path: "/v2/monitoring/metrics/droplet/bandwidth",
          params: {
            ...baseParams,
            interface: config.doInterface,
            direction: "inbound",
          },
        },
        {
          id: "bandwidth_outbound",
          path: "/v2/monitoring/metrics/droplet/bandwidth",
          params: {
            ...baseParams,
            interface: config.doInterface,
            direction: "outbound",
          },
        },
      ];

      for (const plan of fetchPlan) {
        try {
          const payload = await fetchDoMetric(config.doToken, plan.path, plan.params);
          const rawPath = path.join(doMetricsDir, stageTag + "." + plan.id + ".json");
          fs.writeFileSync(rawPath, JSON.stringify(payload, null, 2));
          stageSummary.doMetrics[plan.id] = summarizeDoMetric(payload);
        } catch (error) {
          const message = String(error);
          stageSummary.doMetricErrors.push(plan.id + ": " + message);
          console.log(
            "[LoadTest.capacity]",
            "DO metric fetch failed stage=" + stageTag + " metric=" + plan.id + " " + message,
          );
        }
      }
    }

    summaries.push(stageSummary);

    console.log(
      "[LoadTest.capacity]",
      "Finished " +
        stageTag +
        " exitCode=" +
        exitCode +
        " joined=" +
        (parsedResult.joined ?? "n/a") +
        "/" +
        (parsedResult.expected ?? "n/a") +
        " failedJoins=" +
        (parsedResult.failedJoins ?? "n/a"),
    );

    if (index < config.stages.length - 1 && config.cooldownSec > 0) {
      console.log(
        "[LoadTest.capacity]",
        "Cooldown " + config.cooldownSec + "s before next stage",
      );
      await sleep(config.cooldownSec * 1000);
    }
  }

  const summaryPath = path.join(config.outputDir, "capacity-summary.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        config,
        stages: summaries,
      },
      null,
      2,
    ),
  );

  const csvPath = path.join(config.outputDir, "capacity-summary.csv");
  const csvHeader =
    "stageIndex,clients,loadtestExitCode,startedAtIso,endedAtIso,joined,expected,failedJoins,disconnected,serverDisconnects,inputsSent,topLeaveCodes";
  const csvLines = [csvHeader, ...summaries.map(stageCsvLine)];
  fs.writeFileSync(csvPath, csvLines.join("\n"));

  console.log("[LoadTest.capacity]", "Wrote summary json " + summaryPath);
  console.log("[LoadTest.capacity]", "Wrote summary csv " + csvPath);
}

void main().catch((error) => {
  console.error("[LoadTest.capacity]", "Fatal error", error);
  process.exit(1);
});
