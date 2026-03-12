import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { AUDIO_ASSETS } from "../src/audio/assetManifest";
import { resolveFfmpegBinary } from "./ffmpeg-path";

interface CliOptions {
  sourceDir: string;
  outputDir: string;
  ffmpegBin: string;
  dryRun: boolean;
  onlySelectors: string[];
}

const SUPPORTED_INPUT_EXTENSIONS = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aif", ".aiff"];
const VORBIS_QUALITY = "7";

function log(scope: string, message: string): void {
  console.log("[" + scope + "]", message);
}

function parseCliOptions(projectRoot: string): CliOptions {
  const args = process.argv.slice(2);
  let sourceDir = resolve(projectRoot, "assets", "audio-src");
  let outputDir = resolve(projectRoot, "public", "assets", "audio");
  let ffmpegBin = "";
  let dryRun = false;
  const onlySelectors: string[] = [];

  const addOnlySelectors = (rawValue: string): void => {
    const selectors = rawValue
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    onlySelectors.push(...selectors);
  };

  for (let index = 0; index < args.length; index += 1) {
    const currentArg = args[index];

    if (currentArg === "--src" || currentArg === "--source") {
      const next = args[index + 1];
      if (!next) {
        throw new Error("Missing value for " + currentArg);
      }
      sourceDir = resolvePath(projectRoot, next);
      index += 1;
      continue;
    }

    if (currentArg === "--out" || currentArg === "--output") {
      const next = args[index + 1];
      if (!next) {
        throw new Error("Missing value for " + currentArg);
      }
      outputDir = resolvePath(projectRoot, next);
      index += 1;
      continue;
    }

    if (currentArg === "--ffmpeg-bin") {
      const next = args[index + 1];
      if (!next) {
        throw new Error("Missing value for --ffmpeg-bin");
      }
      ffmpegBin = next;
      index += 1;
      continue;
    }

    if (currentArg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (currentArg === "--only") {
      const next = args[index + 1];
      if (!next) {
        throw new Error("Missing value for --only");
      }
      addOnlySelectors(next);
      index += 1;
      continue;
    }

    if (currentArg === "--help") {
      printUsage();
      process.exit(0);
    }

    if (currentArg.startsWith("--src=") || currentArg.startsWith("--source=")) {
      sourceDir = resolvePath(projectRoot, currentArg.split("=").slice(1).join("="));
      continue;
    }

    if (currentArg.startsWith("--out=") || currentArg.startsWith("--output=")) {
      outputDir = resolvePath(projectRoot, currentArg.split("=").slice(1).join("="));
      continue;
    }

    if (currentArg.startsWith("--ffmpeg-bin=")) {
      ffmpegBin = currentArg.split("=").slice(1).join("=");
      continue;
    }

    if (currentArg.startsWith("--only=")) {
      addOnlySelectors(currentArg.split("=").slice(1).join("="));
      continue;
    }

    throw new Error("Unknown argument: " + currentArg);
  }

  return {
    sourceDir,
    outputDir,
    ffmpegBin,
    dryRun,
    onlySelectors,
  };
}

function printUsage(): void {
  log(
    "processAudioAssets.usage",
    "bun run process:audio [--src assets/audio-src] [--out public/assets/audio] [--ffmpeg-bin ffmpeg] [--dry-run] [--only selector]. FFmpeg resolution order: --ffmpeg-bin, FFMPEG_BIN/FFMPEG_PATH, local .tools/ffmpeg, PATH.",
  );
}

function resolvePath(projectRoot: string, rawPath: string): string {
  if (isAbsolute(rawPath)) {
    return rawPath;
  }
  return resolve(projectRoot, rawPath);
}

function collectManifestRelativePaths(): string[] {
  const unique = new Set<string>();
  for (const asset of Object.values(AUDIO_ASSETS)) {
    unique.add(asset.relativePath);
  }
  return Array.from(unique).sort();
}

function collectManifestRelativePathsByAssetId(): Map<string, string> {
  const output = new Map<string, string>();
  for (const [assetId, asset] of Object.entries(AUDIO_ASSETS)) {
    output.set(assetId.toLowerCase(), asset.relativePath);
  }
  return output;
}

function normalizeSelector(rawSelector: string): string {
  let normalized = rawSelector.trim().replace(/\\/g, "/").toLowerCase();
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

function resolveSelectedTargets(
  manifestTargets: string[],
  onlySelectors: string[],
): string[] {
  if (onlySelectors.length <= 0) {
    return manifestTargets;
  }

  const targetByRelativePath = new Map<string, string>();
  const targetsByBasenameWithoutExtension = new Map<string, Set<string>>();
  const targetByAssetId = collectManifestRelativePathsByAssetId();

  for (const target of manifestTargets) {
    const normalizedTarget = normalizeSelector(target);
    targetByRelativePath.set(normalizedTarget, target);

    const base = basename(target);
    const extension = extname(base);
    const baseWithoutExtension = base.slice(0, base.length - extension.length).toLowerCase();
    const existing = targetsByBasenameWithoutExtension.get(baseWithoutExtension);
    if (existing) {
      existing.add(target);
    } else {
      targetsByBasenameWithoutExtension.set(baseWithoutExtension, new Set([target]));
    }
  }

  const selectedTargets = new Set<string>();

  for (const rawSelector of onlySelectors) {
    const normalizedSelector = normalizeSelector(rawSelector);
    if (normalizedSelector.length <= 0) {
      continue;
    }

    const exactTarget = targetByRelativePath.get(normalizedSelector);
    if (exactTarget) {
      selectedTargets.add(exactTarget);
      continue;
    }

    const assetTarget = targetByAssetId.get(normalizedSelector);
    if (assetTarget) {
      selectedTargets.add(assetTarget);
      continue;
    }

    const selectorBase = basename(normalizedSelector);
    const selectorExtension = extname(selectorBase);
    const selectorWithoutExtension = selectorBase
      .slice(0, selectorBase.length - selectorExtension.length)
      .toLowerCase();
    const basenameMatches = targetsByBasenameWithoutExtension.get(selectorWithoutExtension);
    if (basenameMatches && basenameMatches.size === 1) {
      const firstMatch = basenameMatches.values().next().value as string;
      selectedTargets.add(firstMatch);
      continue;
    }

    if (basenameMatches && basenameMatches.size > 1) {
      throw new Error(
        "Selector \"" +
          rawSelector +
          "\" matched multiple targets: " +
          Array.from(basenameMatches).join(", ") +
          ". Use a full relative path or asset id.",
      );
    }

    throw new Error(
      "Unknown --only selector \"" +
        rawSelector +
        "\". Use asset id (example: sfxFight) or target filename (example: sfx-fight.ogg).",
    );
  }

  if (selectedTargets.size <= 0) {
    throw new Error("No targets selected after applying --only selectors.");
  }

  return manifestTargets.filter((target) => selectedTargets.has(target));
}

function listFilesRecursively(rootDir: string): string[] {
  const output: string[] = [];

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile()) {
        output.push(absolutePath);
      }
    }
  }

  if (!existsSync(rootDir)) {
    return output;
  }

  walk(rootDir);
  return output;
}

function findSourceFile(sourceDir: string, targetRelativePath: string): string | null {
  const exactPath = join(sourceDir, targetRelativePath);
  if (existsSync(exactPath) && statSync(exactPath).isFile()) {
    return exactPath;
  }

  const relativeDir = dirname(targetRelativePath);
  const fileName = basename(targetRelativePath);
  const fileExtension = extname(fileName);
  const fileNameWithoutExtension = fileName.slice(0, fileName.length - fileExtension.length);

  for (const extension of SUPPORTED_INPUT_EXTENSIONS) {
    const sameDirCandidate = join(sourceDir, relativeDir, fileNameWithoutExtension + extension);
    if (existsSync(sameDirCandidate) && statSync(sameDirCandidate).isFile()) {
      return sameDirCandidate;
    }
  }

  const sourceFiles = listFilesRecursively(sourceDir);
  for (const absoluteSourcePath of sourceFiles) {
    const sourceExtension = extname(absoluteSourcePath).toLowerCase();
    if (!SUPPORTED_INPUT_EXTENSIONS.includes(sourceExtension)) {
      continue;
    }

    const sourceWithoutExtension =
      absoluteSourcePath.slice(0, absoluteSourcePath.length - sourceExtension.length);
    const sourceNormalized = sourceWithoutExtension.replace(/\\/g, "/").toLowerCase();
    const targetNoExtension = join(relativeDir, fileNameWithoutExtension);
    const targetNormalized = targetNoExtension.replace(/\\/g, "/").toLowerCase();
    if (sourceNormalized.endsWith(targetNormalized)) {
      return absoluteSourcePath;
    }
  }

  return null;
}

function buildCodecArguments(outputFilePath: string): string[] {
  const outputExtension = extname(outputFilePath).toLowerCase();

  if (outputExtension === ".wav") {
    return ["-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le"];
  }
  if (outputExtension === ".ogg") {
    return ["-ac", "2", "-ar", "44100", "-c:a", "libvorbis", "-q:a", VORBIS_QUALITY];
  }
  if (outputExtension === ".mp3") {
    return ["-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k"];
  }
  if (outputExtension === ".m4a" || outputExtension === ".aac") {
    return ["-ac", "2", "-ar", "44100", "-c:a", "aac", "-b:a", "192k"];
  }

  return ["-ac", "2", "-ar", "44100"];
}

function verifyFfmpeg(ffmpegBin: string): void {
  const check = spawnSync(ffmpegBin, ["-version"], { stdio: "pipe", encoding: "utf8" });
  if (check.error) {
    throw new Error(
      "Could not execute ffmpeg binary \"" +
        ffmpegBin +
        "\". Set FFMPEG_BIN or pass --ffmpeg-bin.",
    );
  }
  if (check.status !== 0) {
    throw new Error(
      "ffmpeg check failed with exit code " +
        String(check.status) +
        ". Set FFMPEG_BIN or pass --ffmpeg-bin.",
    );
  }
}

function processAudioAssets(options: CliOptions): void {
  const manifestTargets = collectManifestRelativePaths();
  if (manifestTargets.length <= 0) {
    throw new Error("No audio targets found in src/audio/assetManifest.ts");
  }
  const selectedTargets = resolveSelectedTargets(
    manifestTargets,
    options.onlySelectors,
  );

  mkdirSync(options.outputDir, { recursive: true });

  if (!options.dryRun) {
    verifyFfmpeg(options.ffmpegBin);
  }

  if (options.onlySelectors.length > 0) {
    log(
      "processAudioAssets.main",
      "Selected " +
        String(selectedTargets.length) +
        " target(s): " +
        selectedTargets.join(", "),
    );
  }

  const missingTargets: string[] = [];
  const processedTargets: string[] = [];

  for (const targetRelativePath of selectedTargets) {
    const sourcePath = findSourceFile(options.sourceDir, targetRelativePath);
    if (!sourcePath) {
      missingTargets.push(targetRelativePath);
      log(
        "processAudioAssets.missing",
        "No source file found for " + targetRelativePath + " in " + options.sourceDir,
      );
      continue;
    }

    const outputPath = join(options.outputDir, targetRelativePath);
    mkdirSync(dirname(outputPath), { recursive: true });

    const ffmpegArgs = ["-y", "-i", sourcePath, "-vn"]
      .concat(buildCodecArguments(outputPath))
      .concat([outputPath]);

    if (options.dryRun) {
      log(
        "processAudioAssets.dryRun",
        options.ffmpegBin + " " + ffmpegArgs.join(" "),
      );
      processedTargets.push(targetRelativePath);
      continue;
    }

    const result = spawnSync(options.ffmpegBin, ffmpegArgs, { stdio: "inherit" });
    if (result.error) {
      throw new Error(
        "ffmpeg failed for " + targetRelativePath + ": " + String(result.error.message),
      );
    }
    if (result.status !== 0) {
      throw new Error(
        "ffmpeg exited with code " +
          String(result.status) +
          " while processing " +
          targetRelativePath,
      );
    }

    processedTargets.push(targetRelativePath);
    log("processAudioAssets.convert", "Wrote " + outputPath);
  }

  log(
    "processAudioAssets.summary",
    "Processed " +
      String(processedTargets.length) +
      " files" +
      (options.dryRun ? " (dry-run)" : "") +
      ".",
  );

  if (missingTargets.length > 0) {
    const missingDescriptor =
      options.onlySelectors.length > 0
        ? "requested files"
        : "expected files from manifest";
    log(
      "processAudioAssets.summary",
      "Missing " +
        String(missingTargets.length) +
        " " +
        missingDescriptor +
        ". Add them to " +
        options.sourceDir +
        " when ready.",
    );
  }
}

function main(): void {
  const projectRoot = resolve(import.meta.dirname, "..");
  const options = parseCliOptions(projectRoot);
  const resolvedFfmpeg = resolveFfmpegBinary(projectRoot, options.ffmpegBin);
  options.ffmpegBin = resolvedFfmpeg.binaryPath;
  log("processAudioAssets.main", "Source directory: " + options.sourceDir);
  log("processAudioAssets.main", "Output directory: " + options.outputDir);
  log(
    "processAudioAssets.main",
    "FFmpeg binary: " +
      options.ffmpegBin +
      " (" +
      resolvedFfmpeg.source +
      ")",
  );
  processAudioAssets(options);
}

try {
  main();
} catch (error) {
  log(
    "processAudioAssets.error",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
