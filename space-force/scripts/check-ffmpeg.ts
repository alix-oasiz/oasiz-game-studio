import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { resolveFfmpegBinary } from "./ffmpeg-path";

function log(scope: string, message: string): void {
  console.log("[" + scope + "]", message);
}

function parseCliFfmpegOverride(): string {
  const args = process.argv.slice(2);
  let ffmpegBin = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") {
      log(
        "checkFfmpeg.usage",
        "bun run ffmpeg:check [--ffmpeg-bin path/to/ffmpeg]",
      );
      process.exit(0);
    }
    if (arg === "--ffmpeg-bin") {
      const next = args[index + 1];
      if (!next) {
        throw new Error("Missing value for --ffmpeg-bin");
      }
      ffmpegBin = next;
      index += 1;
      continue;
    }
    if (arg.startsWith("--ffmpeg-bin=")) {
      ffmpegBin = arg.split("=").slice(1).join("=");
      continue;
    }
    throw new Error("Unknown argument: " + arg);
  }

  return ffmpegBin;
}

function verifyFfmpeg(binaryPath: string): string {
  const check = spawnSync(binaryPath, ["-version"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (check.error) {
    throw new Error(
      "Could not execute FFmpeg at " +
        binaryPath +
        ". Run bun run ffmpeg:install or set FFMPEG_BIN.",
    );
  }
  if (check.status !== 0) {
    throw new Error(
      "FFmpeg check failed with exit code " +
        String(check.status) +
        ". Run bun run ffmpeg:install or set FFMPEG_BIN.",
    );
  }

  const firstLine = (check.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine || "ffmpeg -version";
}

function main(): void {
  const projectRoot = resolve(import.meta.dirname, "..");
  const cliOverride = parseCliFfmpegOverride();
  const resolved = resolveFfmpegBinary(projectRoot, cliOverride);
  log(
    "checkFfmpeg.main",
    "Using FFmpeg binary: " + resolved.binaryPath + " (" + resolved.source + ")",
  );
  const versionLine = verifyFfmpeg(resolved.binaryPath);
  log("checkFfmpeg.main", "Available: " + versionLine);
}

try {
  main();
} catch (error) {
  log(
    "checkFfmpeg.error",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
