import { $ } from "bun";
import { existsSync, readdirSync, statSync } from "fs";
import { extname, join, relative } from "path";

export interface UploadAssetMap {
  [relativePath: string]: string;
}

export interface DistSummary {
  htmlBytes: number;
  assetCount: number;
  assetBytes: number;
  totalBytes: number;
  topAssets: Array<{ path: string; bytes: number }>;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }
  if (bytes >= 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  }
  return bytes + " B";
}

function getAllFiles(dirPath: string, allFiles: string[] = []): string[] {
  if (!existsSync(dirPath)) return allFiles;
  const files = readdirSync(dirPath);
  for (const file of files) {
    const fullPath = join(dirPath, file);
    if (statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, allFiles);
    } else {
      allFiles.push(fullPath);
    }
  }
  return allFiles;
}

export async function buildGame(gamePath: string): Promise<void> {
  await $`cd ${gamePath} && bun install`.quiet();

  const packageJsonPath = join(gamePath, "package.json");
  let useCustomBuild = false;
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(await Bun.file(packageJsonPath).text()) as {
      scripts?: Record<string, string>;
    };
    useCustomBuild = Boolean(packageJson.scripts?.build);
  }

  if (useCustomBuild) {
    await $`cd ${gamePath} && bun run build`.quiet();
    return;
  }

  await $`cd ${gamePath} && bunx --bun vite build`.quiet();
}

export async function readBundleHtml(gamePath: string): Promise<string> {
  const distIndexPath = join(gamePath, "dist", "index.html");
  if (!existsSync(distIndexPath)) {
    throw new Error("Build output not found at dist/index.html");
  }
  return Bun.file(distIndexPath).text();
}

export async function collectAssets(gamePath: string): Promise<UploadAssetMap> {
  const distPath = join(gamePath, "dist");
  const assets: UploadAssetMap = {};

  if (!existsSync(distPath)) {
    return assets;
  }

  const allFiles = getAllFiles(distPath);
  for (const filePath of allFiles) {
    const relPath = relative(distPath, filePath);
    if (relPath.endsWith(".html")) continue;

    const file = Bun.file(filePath);
    if (file.size > 50 * 1024 * 1024) continue;

    const buffer = await file.arrayBuffer();
    assets[relPath] = Buffer.from(buffer).toString("base64");
  }

  return assets;
}

export async function readThumbnail(gamePath: string): Promise<string | undefined> {
  const thumbnailPath = join(gamePath, "thumbnail");
  if (!existsSync(thumbnailPath)) return undefined;

  const files = readdirSync(thumbnailPath);
  const imageFile = files.find((file) => /\.(png|jpe?g|webp|gif)$/i.test(file));
  if (!imageFile) return undefined;

  const fullPath = join(thumbnailPath, imageFile);
  const buffer = await Bun.file(fullPath).arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const lower = imageFile.toLowerCase();
  const mimeType = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : lower.endsWith(".gif")
        ? "image/gif"
        : "image/jpeg";
  return "data:" + mimeType + ";base64," + base64;
}

export function summarizeDist(gamePath: string): DistSummary {
  const distPath = join(gamePath, "dist");
  if (!existsSync(distPath)) {
    throw new Error("dist folder not found");
  }

  const files = getAllFiles(distPath);
  let htmlBytes = 0;
  let assetBytes = 0;
  let assetCount = 0;
  const assets: Array<{ path: string; bytes: number }> = [];

  for (const filePath of files) {
    const relPath = relative(distPath, filePath);
    const bytes = statSync(filePath).size;
    const ext = extname(filePath).toLowerCase();
    const isHtml = ext === ".html";

    if (isHtml) {
      htmlBytes += bytes;
      continue;
    }

    assetCount += 1;
    assetBytes += bytes;
    assets.push({ path: relPath, bytes });
  }

  assets.sort((a, b) => b.bytes - a.bytes);

  return {
    htmlBytes,
    assetCount,
    assetBytes,
    totalBytes: htmlBytes + assetBytes,
    topAssets: assets.slice(0, 5),
  };
}
