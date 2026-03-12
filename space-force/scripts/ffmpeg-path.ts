import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type FfmpegBinarySource = "cli" | "env" | "local" | "path";

export interface ResolvedFfmpegBinary {
  binaryPath: string;
  source: FfmpegBinarySource;
}

function normalizePath(rawValue: string | undefined | null): string | null {
  if (!rawValue) {
    return null;
  }
  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getLocalFfmpegBinaryPath(projectRoot: string): string {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return resolve(projectRoot, ".tools", "ffmpeg", binaryName);
}

export function resolveFfmpegBinary(
  projectRoot: string,
  cliValue: string | undefined | null,
): ResolvedFfmpegBinary {
  const cliPath = normalizePath(cliValue);
  if (cliPath) {
    return {
      binaryPath: cliPath,
      source: "cli",
    };
  }

  const envPath =
    normalizePath(process.env.FFMPEG_BIN) ??
    normalizePath(process.env.FFMPEG_PATH);
  if (envPath) {
    return {
      binaryPath: envPath,
      source: "env",
    };
  }

  const localPath = getLocalFfmpegBinaryPath(projectRoot);
  if (existsSync(localPath)) {
    return {
      binaryPath: localPath,
      source: "local",
    };
  }

  const cwdRoot = resolve(process.cwd());
  if (cwdRoot !== projectRoot) {
    const cwdLocalPath = getLocalFfmpegBinaryPath(cwdRoot);
    if (existsSync(cwdLocalPath)) {
      return {
        binaryPath: cwdLocalPath,
        source: "local",
      };
    }
  }

  return {
    binaryPath: "ffmpeg",
    source: "path",
  };
}
