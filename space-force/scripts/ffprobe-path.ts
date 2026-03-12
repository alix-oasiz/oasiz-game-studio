import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type FfprobeBinarySource = "cli" | "env" | "local" | "path";

export interface ResolvedFfprobeBinary {
  binaryPath: string;
  source: FfprobeBinarySource;
}

function normalizePath(rawValue: string | undefined | null): string | null {
  if (!rawValue) {
    return null;
  }
  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getLocalFfprobeBinaryPath(projectRoot: string): string {
  const binaryName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  return resolve(projectRoot, ".tools", "ffmpeg", binaryName);
}

export function resolveFfprobeBinary(
  projectRoot: string,
  cliValue: string | undefined | null,
): ResolvedFfprobeBinary {
  const cliPath = normalizePath(cliValue);
  if (cliPath) {
    return {
      binaryPath: cliPath,
      source: "cli",
    };
  }

  const envPath =
    normalizePath(process.env.FFPROBE_BIN) ??
    normalizePath(process.env.FFPROBE_PATH);
  if (envPath) {
    return {
      binaryPath: envPath,
      source: "env",
    };
  }

  const localPath = getLocalFfprobeBinaryPath(projectRoot);
  if (existsSync(localPath)) {
    return {
      binaryPath: localPath,
      source: "local",
    };
  }

  const cwdRoot = resolve(process.cwd());
  if (cwdRoot !== projectRoot) {
    const cwdLocalPath = getLocalFfprobeBinaryPath(cwdRoot);
    if (existsSync(cwdLocalPath)) {
      return {
        binaryPath: cwdLocalPath,
        source: "local",
      };
    }
  }

  return {
    binaryPath: "ffprobe",
    source: "path",
  };
}
