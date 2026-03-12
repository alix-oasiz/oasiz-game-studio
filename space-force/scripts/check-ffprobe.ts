import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { resolveFfprobeBinary } from "./ffprobe-path";

function log(scope: string, message: string): void {
  console.log("[" + scope + "]", message);
}

function parseCliFfprobeOverride(): string {
  const args = process.argv.slice(2);
  let ffprobeBin = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") {
      log(
        "checkFfprobe.usage",
        "bun run ffprobe:check [--ffprobe-bin path/to/ffprobe]",
      );
      process.exit(0);
    }
    if (arg === "--ffprobe-bin") {
      const next = args[index + 1];
      if (!next) {
        throw new Error("Missing value for --ffprobe-bin");
      }
      ffprobeBin = next;
      index += 1;
      continue;
    }
    if (arg.startsWith("--ffprobe-bin=")) {
      ffprobeBin = arg.split("=").slice(1).join("=");
      continue;
    }
    throw new Error("Unknown argument: " + arg);
  }

  return ffprobeBin;
}

function verifyFfprobe(binaryPath: string): string {
  const check = spawnSync(binaryPath, ["-version"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (check.error) {
    throw new Error(
      "Could not execute FFprobe at " +
        binaryPath +
        ". Run bun run ffprobe:install or set FFPROBE_BIN.",
    );
  }
  if (check.status !== 0) {
    throw new Error(
      "FFprobe check failed with exit code " +
        String(check.status) +
        ". Run bun run ffprobe:install or set FFPROBE_BIN.",
    );
  }

  const firstLine = (check.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine || "ffprobe -version";
}

function main(): void {
  const projectRoot = resolve(import.meta.dirname, "..");
  const cliOverride = parseCliFfprobeOverride();
  const resolved = resolveFfprobeBinary(projectRoot, cliOverride);
  log(
    "checkFfprobe.main",
    "Using FFprobe binary: " + resolved.binaryPath + " (" + resolved.source + ")",
  );
  const versionLine = verifyFfprobe(resolved.binaryPath);
  log("checkFfprobe.main", "Available: " + versionLine);
}

try {
  main();
} catch (error) {
  log(
    "checkFfprobe.error",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
