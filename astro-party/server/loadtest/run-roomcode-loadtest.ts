import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cli } from "@colyseus/loadtest";
import main from "./minimal-roomcode.loadtest";

interface ArgBridge {
  env: string;
  names: string[];
  bareMeansTrue?: boolean;
}

interface EndpointResolution {
  endpoint: string;
  source: string;
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

function ensureArg(name: string, value: string): void {
  if (hasArg(name)) return;
  process.argv.push("--" + name, value);
}

function setEnvFromArg(bridge: ArgBridge): void {
  let matchedName: string | null = null;
  let value: string | null = null;

  for (const name of bridge.names) {
    if (!hasArg(name)) continue;
    matchedName = name;
    value = readArgValue(name);
    if (value !== null) break;
  }

  if (!matchedName) return;
  if (value === null) {
    if (!bridge.bareMeansTrue) return;
    process.env[bridge.env] = "true";
    return;
  }
  if (value.trim().length <= 0) return;
  process.env[bridge.env] = value.trim();
}

function bridgeLoadtestArgsToEnv(): void {
  const bridges: ArgBridge[] = [
    { env: "LOADTEST_ROOM_CODE", names: ["roomCode"] },
    { env: "LOADTEST_REQUEST_TIMEOUT_MS", names: ["requestTimeoutMs"] },
    { env: "LOADTEST_DURATION_SEC", names: ["durationSec"] },
    { env: "LOADTEST_DURATION_MS", names: ["durationMs"] },
    {
      env: "LOADTEST_AUTO_EXIT_ON_COMPLETE",
      names: ["autoExitOnComplete"],
      bareMeansTrue: true,
    },
    { env: "LOADTEST_SUMMARY_INTERVAL_MS", names: ["summaryIntervalMs"] },
    { env: "LOADTEST_INPUT_DEBOUNCE_MS", names: ["inputDebounceMs"] },
  ];

  for (const bridge of bridges) {
    setEnvFromArg(bridge);
  }
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

function resolveDefaultOutputPath(): string {
  const dirPath = path.join(process.cwd(), "loadtest-logs");
  fs.mkdirSync(dirPath, { recursive: true });
  return path.join(
    dirPath,
    "loadtest-roomcode-" + buildTimestampText(new Date()) + ".log",
  );
}

function ensureOutputDirectory(outputPath: string): void {
  const dirPath = path.dirname(outputPath);
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseEnvAssignmentValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 1) return trimmed;
  const startsWithQuote = trimmed.startsWith('"') || trimmed.startsWith("'");
  if (!startsWithQuote) return trimmed;
  const quote = trimmed[0];
  if (!trimmed.endsWith(quote)) return trimmed;
  return trimmed.slice(1, -1);
}

function readEnvKeyFromFile(filePath: string, envKey: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  let contents = "";
  try {
    contents = fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return null;
  }

  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length <= 0) continue;
    if (trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const rawKey = trimmed.slice(0, equalsIndex).trim();
    if (rawKey !== envKey) continue;

    const rawValue = trimmed.slice(equalsIndex + 1);
    const value = parseEnvAssignmentValue(rawValue);
    if (value.trim().length <= 0) return null;
    return value.trim();
  }
  return null;
}

function buildDotEnvCandidates(): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const currentDir = process.cwd();
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const serverDirFromScript = path.resolve(scriptDir, "..");

  const bases = [
    currentDir,
    path.resolve(currentDir, ".."),
    path.resolve(currentDir, "..", ".."),
    serverDirFromScript,
    path.resolve(serverDirFromScript, ".."),
  ];

  for (const base of bases) {
    const filePath = path.resolve(base, ".env");
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    candidates.push(filePath);
  }

  return candidates;
}

function resolveEndpointFromEnvFiles(): EndpointResolution | null {
  const envKey = "VITE_COLYSEUS_WS_URL";
  for (const filePath of buildDotEnvCandidates()) {
    const value = readEnvKeyFromFile(filePath, envKey);
    if (!value) continue;
    process.env[envKey] = value;
    return {
      endpoint: value,
      source: "dotenv file " + filePath,
    };
  }
  return null;
}

function resolveEndpoint(): EndpointResolution {
  const fromArg = readArgValue("endpoint");
  if (typeof fromArg === "string" && fromArg.trim().length > 0) {
    return {
      endpoint: fromArg.trim(),
      source: "cli --endpoint",
    };
  }
  const fromEnv = process.env.VITE_COLYSEUS_WS_URL;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return {
      endpoint: fromEnv.trim(),
      source: "process.env VITE_COLYSEUS_WS_URL",
    };
  }
  const fromFiles = resolveEndpointFromEnvFiles();
  if (fromFiles) {
    return fromFiles;
  }
  console.error(
    "[LoadTest.run-roomcode]",
    "Missing endpoint. Pass --endpoint or set VITE_COLYSEUS_WS_URL.",
  );
  process.exit(1);
}

function requireRoomCode(): void {
  const fromArg = readArgValue("roomCode");
  const fromEnv = process.env.LOADTEST_ROOM_CODE;
  const roomCode = fromArg ?? fromEnv ?? "";
  if (roomCode.trim().length > 0) return;

  console.error(
    "[LoadTest.run-roomcode]",
    "Missing room code. Pass --roomCode or set LOADTEST_ROOM_CODE.",
  );
  process.exit(1);
}

ensureArg("room", "astro_party");
bridgeLoadtestArgsToEnv();

const helpRequested = hasArg("help") || hasArg("h");
if (!helpRequested) {
  requireRoomCode();
  const endpointResolution = resolveEndpoint();
  if (!hasArg("endpoint")) {
    ensureArg("endpoint", endpointResolution.endpoint);
  }
  if (!hasArg("output")) {
    ensureArg("output", resolveDefaultOutputPath());
  }
  console.log(
    "[LoadTest.run-roomcode]",
    "Using endpoint " +
      endpointResolution.endpoint +
      " (source " +
      endpointResolution.source +
      ")",
  );
  const outputPath = readArgValue("output");
  if (outputPath) {
    ensureOutputDirectory(outputPath);
    console.log("[LoadTest.run-roomcode]", "Using output log " + outputPath);
  }
}

cli(main);
