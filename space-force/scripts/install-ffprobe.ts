import { copyFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getLocalFfprobeBinaryPath } from "./ffprobe-path";

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
        "installFfprobe.usage",
        "bun run ffprobe:install [--force]",
      );
      process.exit(0);
    }
    throw new Error("Unknown argument: " + arg);
  }

  return { force };
}

function resolveFfprobeStaticPath(moduleValue: unknown): string | null {
  if (typeof moduleValue === "string") {
    return moduleValue;
  }
  if (moduleValue && typeof moduleValue === "object") {
    const root = moduleValue as {
      default?: unknown;
      path?: unknown;
    };
    if (typeof root.path === "string") {
      return root.path;
    }
    if (typeof root.default === "string") {
      return root.default;
    }
    if (root.default && typeof root.default === "object") {
      const nestedPath = (root.default as { path?: unknown }).path;
      if (typeof nestedPath === "string") {
        return nestedPath;
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const options = parseOptions();
  const projectRoot = resolve(import.meta.dirname, "..");
  const localBinaryPath = getLocalFfprobeBinaryPath(projectRoot);

  if (existsSync(localBinaryPath) && !options.force) {
    log(
      "installFfprobe.main",
      "FFprobe already installed at " +
        localBinaryPath +
        ". Use --force to overwrite.",
    );
    return;
  }

  const ffprobeStaticModule = await import("ffprobe-static");
  const ffprobeStaticPath = resolveFfprobeStaticPath(ffprobeStaticModule);
  if (!ffprobeStaticPath || !existsSync(ffprobeStaticPath)) {
    throw new Error(
      "Could not resolve ffprobe-static binary. Run bun install in space-force first.",
    );
  }

  mkdirSync(dirname(localBinaryPath), { recursive: true });
  copyFileSync(ffprobeStaticPath, localBinaryPath);

  if (process.platform !== "win32") {
    chmodSync(localBinaryPath, 0o755);
  }

  log(
    "installFfprobe.main",
    "Installed FFprobe to " + localBinaryPath,
  );
}

main().catch((error) => {
  log(
    "installFfprobe.error",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
