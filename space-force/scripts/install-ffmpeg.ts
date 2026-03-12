import { copyFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getLocalFfmpegBinaryPath } from "./ffmpeg-path";

interface InstallOptions {
  force: boolean;
}

function log(scope: string, message: string): void {
  console.log("[" + scope + "]", message);
}

function parseOptions(): InstallOptions {
  const args = process.argv.slice(2);
  let force = false;

  for (const arg of args) {
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--help") {
      log(
        "installFfmpeg.usage",
        "bun run ffmpeg:install [--force]",
      );
      process.exit(0);
    }
    throw new Error("Unknown argument: " + arg);
  }

  return { force };
}

function resolveFfmpegStaticPath(moduleValue: unknown): string | null {
  if (typeof moduleValue === "string") {
    return moduleValue;
  }
  if (moduleValue && typeof moduleValue === "object") {
    const defaultExport = (moduleValue as { default?: unknown }).default;
    if (typeof defaultExport === "string") {
      return defaultExport;
    }
  }
  return null;
}

async function main(): Promise<void> {
  const options = parseOptions();
  const projectRoot = resolve(import.meta.dirname, "..");
  const localBinaryPath = getLocalFfmpegBinaryPath(projectRoot);

  if (existsSync(localBinaryPath) && !options.force) {
    log(
      "installFfmpeg.main",
      "FFmpeg already installed at " +
        localBinaryPath +
        ". Use --force to overwrite.",
    );
    return;
  }

  const ffmpegStaticModule = await import("ffmpeg-static");
  const ffmpegStaticPath = resolveFfmpegStaticPath(ffmpegStaticModule);
  if (!ffmpegStaticPath || !existsSync(ffmpegStaticPath)) {
    throw new Error(
      "Could not resolve ffmpeg-static binary. Run bun install in space-force first.",
    );
  }

  mkdirSync(dirname(localBinaryPath), { recursive: true });
  copyFileSync(ffmpegStaticPath, localBinaryPath);

  if (process.platform !== "win32") {
    chmodSync(localBinaryPath, 0o755);
  }

  log(
    "installFfmpeg.main",
    "Installed FFmpeg to " + localBinaryPath,
  );
}

main().catch((error) => {
  log(
    "installFfmpeg.error",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
