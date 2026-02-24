#!/usr/bin/env bun
/// <reference types="@types/bun" />
/**
 * Upload Game Script
 *
 * Builds and uploads a game to the Oasiz platform.
 *
 * Usage:
 *   bun run upload <game-folder>
 *   bun run scripts/upload-game.ts <game-folder>
 *
 * Requirements:
 *   - OASIZ_UPLOAD_TOKEN env var must be set
 *   - OASIZ_API_URL env var (defaults to production)
 *   - Game folder must have a publish.json file
 *
 * Example:
 *   export OASIZ_UPLOAD_TOKEN=your_token_here
 *   bun run upload block-blast
 */

import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve, relative, extname } from "path";
import { $ } from "bun";

// Configuration
const DEFAULT_API_URL = "https://api.oasiz.ai/api/upload/game";
const API_URL = process.env.OASIZ_API_URL || DEFAULT_API_URL;
const API_TOKEN = process.env.OASIZ_UPLOAD_TOKEN;
const CREATOR_EMAIL = process.env.OASIZ_EMAIL;

// Types
interface PublishConfig {
  title: string;
  description: string;
  category: "arcade" | "puzzle" | "party" | "action" | "strategy" | "casual";
  gameId?: string;
  isMultiplayer?: boolean;
  maxPlayers?: number;
  verticalOnly?: boolean;
}

interface UploadPayload {
  title: string;
  slug: string;
  description: string;
  category: string;
  email: string;
  gameId?: string;
  isMultiplayer?: boolean;
  maxPlayers?: number;
  verticalOnly?: boolean;
  thumbnailBase64?: string;
  bundleHtml: string;
  /** Asset files to upload separately (path -> base64 content) */
  assets?: Record<string, string>;
}

// Helpers
function logInfo(message: string): void {
  console.log(`[upload-game] ${message}`);
}

function logError(message: string): void {
  console.error(`[upload-game] ERROR: ${message}`);
}

function logSuccess(message: string): void {
  console.log(`[upload-game] ✓ ${message}`);
}

async function validateEnvironment(): Promise<void> {
  if (!API_TOKEN) {
    logError("OASIZ_UPLOAD_TOKEN environment variable not set");
    console.log("");
    console.log("To set up your upload token:");
    console.log("  1. Get your token from the Oasiz team");
    console.log("  2. Add it to your shell:");
    console.log("     export OASIZ_UPLOAD_TOKEN=your_token_here");
    console.log("");
    console.log("Or add it to your ~/.zshrc or ~/.bashrc for persistence.");
    process.exit(1);
  }

  if (!CREATOR_EMAIL) {
    logError("OASIZ_EMAIL environment variable not set");
    console.log("");
    console.log("Set your registered Oasiz email:");
    console.log("  export OASIZ_EMAIL=your-email@example.com");
    console.log("");
    console.log("This email must be registered in the Oasiz platform.");
    process.exit(1);
  }
}

function getGameFolders(): string[] {
  const rootDir = resolve(import.meta.dir, "..");
  const excludeDirs = new Set([
    "scripts",
    "template",
    "node_modules",
    ".git",
    "unfinished-games",
    "perfect-drop",
  ]);

  return readdirSync(rootDir, { withFileTypes: true })
    .filter((dirent) => {
      if (!dirent.isDirectory()) return false;
      if (excludeDirs.has(dirent.name)) return false;
      if (dirent.name.startsWith(".")) return false;

      // Check if it looks like a game folder (has src/main.ts or index.html)
      const gamePath = join(rootDir, dirent.name);
      return (
        existsSync(join(gamePath, "src", "main.ts")) ||
        existsSync(join(gamePath, "index.html"))
      );
    })
    .map((dirent) => dirent.name);
}

function validateGameFolder(gameFolder: string): string {
  const rootDir = resolve(import.meta.dir, "..");
  const gamePath = join(rootDir, gameFolder);

  if (!existsSync(gamePath)) {
    logError(`Game folder not found: ${gameFolder}`);
    console.log("");
    console.log("Available game folders:");
    const folders = getGameFolders();
    folders.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }

  return gamePath;
}

async function readPublishConfig(gamePath: string): Promise<PublishConfig> {
  const publishPath = join(gamePath, "publish.json");
  const gameFolder = gamePath.split("/").pop() || "unknown";

  // Default config if publish.json doesn't exist
  const defaultConfig: PublishConfig = {
    title: gameFolder,
    description: "test",
    category: "arcade",
  };

  if (!existsSync(publishPath)) {
    logInfo(`No publish.json found, using defaults`);
    return defaultConfig;
  }

  const content = await Bun.file(publishPath).text();
  const config = JSON.parse(content) as Partial<PublishConfig>;

  // Merge with defaults for any missing fields
  return {
    title: config.title || defaultConfig.title,
    description: config.description || defaultConfig.description,
    category: config.category || defaultConfig.category,
    gameId: config.gameId,
    isMultiplayer: config.isMultiplayer,
    maxPlayers: config.maxPlayers,
    verticalOnly: config.verticalOnly,
  };
}

async function buildGame(gamePath: string): Promise<void> {
  const gameFolder = gamePath.split("/").pop();
  logInfo(`Building ${gameFolder}...`);

  try {
    // Always run bun install to ensure dependencies are up to date
    logInfo("Installing dependencies...");
    await $`cd ${gamePath} && bun install`.quiet();

    // Check if game has a custom build script in package.json
    const packageJsonPath = join(gamePath, "package.json");
    let useCustomBuild = false;
    
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await Bun.file(packageJsonPath).text());
      if (packageJson.scripts?.build) {
        useCustomBuild = true;
      }
    }

    // Use the game's own build command if available, otherwise fallback to vite
    logInfo("Running build...");
    if (useCustomBuild) {
      await $`cd ${gamePath} && bun run build`.quiet();
    } else {
      await $`cd ${gamePath} && bunx --bun vite build`.quiet();
    }
    logSuccess(`Built ${gameFolder}`);
  } catch (error) {
    logError(`Build failed for ${gameFolder}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Get MIME type for a file based on extension
 */
function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".json": "application/json",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  if (!existsSync(dirPath)) return arrayOfFiles;
  
  const files = readdirSync(dirPath);
  
  for (const file of files) {
    const fullPath = join(dirPath, file);
    if (statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  
  return arrayOfFiles;
}

/**
 * Collect all assets from the dist folder for separate upload
 * Returns a map of relative path -> base64 content
 */
async function collectAssets(gamePath: string): Promise<Record<string, string>> {
  const distPath = join(gamePath, "dist");
  const assets: Record<string, string> = {};
  
  if (!existsSync(distPath)) {
    logError("Dist folder not found");
    return assets;
  }
  
  const allFiles = getAllFiles(distPath);
  
  for (const filePath of allFiles) {
    const relativePath = relative(distPath, filePath);
    
    // Skip HTML files - they're sent separately as bundleHtml
    if (relativePath.endsWith('.html')) continue;
    
    // Skip very large files (> 50MB)
    const file = Bun.file(filePath);
    if (file.size > 50 * 1024 * 1024) {
      logInfo(`  Skipping very large file: ${relativePath} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      continue;
    }
    
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    assets[relativePath] = base64;
  }
  
  return assets;
}

/**
 * Check if a build has external assets that need inlining
 */
function hasExternalAssets(html: string): boolean {
  // Check for external script/link references
  return (
    html.includes('src="./assets/') ||
    html.includes("src='./assets/") ||
    html.includes('src="/assets/') ||
    html.includes("src='/assets/") ||
    html.includes('href="./assets/') ||
    html.includes("href='./assets/") ||
    html.includes('href="/assets/') ||
    html.includes("href='/assets/") ||
    html.includes('href="./style.css') ||
    html.includes('href="/style.css')
  );
}

/**
 * Inline all external assets into the HTML
 * This handles JS, CSS, images, audio, and other assets
 */
async function inlineAssets(gamePath: string, html: string): Promise<string> {
  const distPath = join(gamePath, "dist");
  let result = html;
  
  // Get all files in dist
  const allFiles = getAllFiles(distPath);
  
  // Create a map of relative paths to file contents
  const fileMap = new Map<string, { content: string; isText: boolean }>();
  
  // Max size for inlining binary assets (10MB - to include background music)
  const MAX_BINARY_SIZE = 10 * 1024 * 1024; // 10MB
  
  for (const filePath of allFiles) {
    const relativePath = relative(distPath, filePath);
    const ext = extname(filePath).toLowerCase();
    const isTextFile = [".js", ".mjs", ".css", ".json", ".svg"].includes(ext);
    
    if (isTextFile) {
      const content = await Bun.file(filePath).text();
      fileMap.set(relativePath, { content, isText: true });
    } else {
      // Binary files - check size first
      const file = Bun.file(filePath);
      const fileSize = file.size;
      
      if (fileSize > MAX_BINARY_SIZE) {
        logInfo(`  Skipping large file: ${relativePath} (${(fileSize / 1024 / 1024).toFixed(1)}MB > 1MB limit)`);
        continue;
      }
      
      // Convert to base64 data URI
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mimeType = getMimeType(filePath);
      const dataUri = `data:${mimeType};base64,${base64}`;
      fileMap.set(relativePath, { content: dataUri, isText: false });
    }
  }
  
  // Step 1: Inline CSS files
  // Match: <link rel="stylesheet" href="./style.css"> or href="/style.css"
  const cssLinkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  let cssMatch;
  while ((cssMatch = cssLinkRegex.exec(html)) !== null) {
    const fullMatch = cssMatch[0];
    let href = cssMatch[1];
    
    // Normalize path
    if (href.startsWith("./")) href = href.slice(2);
    if (href.startsWith("/")) href = href.slice(1);
    
    const fileData = fileMap.get(href);
    if (fileData && fileData.isText) {
      // Inline asset references within CSS
      let cssContent = fileData.content;
      cssContent = await inlineUrlsInCss(cssContent, fileMap, href);
      result = result.replace(fullMatch, `<style>${cssContent}</style>`);
      logInfo(`Inlined CSS: ${href}`);
    }
  }
  
  // Also handle link tags where href comes before rel
  const cssLinkRegex2 = /<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi;
  while ((cssMatch = cssLinkRegex2.exec(result)) !== null) {
    const fullMatch = cssMatch[0];
    let href = cssMatch[1];
    
    if (href.startsWith("./")) href = href.slice(2);
    if (href.startsWith("/")) href = href.slice(1);
    
    const fileData = fileMap.get(href);
    if (fileData && fileData.isText) {
      let cssContent = fileData.content;
      cssContent = await inlineUrlsInCss(cssContent, fileMap, href);
      result = result.replace(fullMatch, `<style>${cssContent}</style>`);
      logInfo(`Inlined CSS: ${href}`);
    }
  }
  
  // Step 2: Remove modulepreload links (not needed when inlined)
  result = result.replace(/<link[^>]*rel=["']modulepreload["'][^>]*>/gi, "");
  
  // Step 3: Inline JS files
  // Match: <script type="module" src="./assets/index-xxx.js">
  const jsScriptRegex = /<script[^>]*src=["']([^"']+\.m?js)["'][^>]*><\/script>/gi;
  let jsMatch;
  const jsReplacements: { fullMatch: string; replacement: string }[] = [];
  
  // Reset regex
  jsScriptRegex.lastIndex = 0;
  while ((jsMatch = jsScriptRegex.exec(result)) !== null) {
    const fullMatch = jsMatch[0];
    let src = jsMatch[1];
    
    // Normalize path
    if (src.startsWith("./")) src = src.slice(2);
    if (src.startsWith("/")) src = src.slice(1);
    
    const fileData = fileMap.get(src);
    if (fileData && fileData.isText) {
      // Process JS content to inline imported assets
      let jsContent = fileData.content;
      jsContent = inlineAssetsInJs(jsContent, fileMap, src);
      
      // CRITICAL: Escape ALL HTML-like patterns in JS content
      // The app's prepareHtmlForMobile does string replacements like:
      //   html.replace('</body>', '<script>...</script></body>')
      // If JS contains these strings literally, it would break the injection
      const htmlTagPatterns = [
        /<\/script/gi,
        /<\/body/gi,
        /<\/head/gi,
        /<\/html/gi,
        /<!--/g,
        /-->/g,
      ];
      for (const pattern of htmlTagPatterns) {
        jsContent = jsContent.replace(pattern, (match) => {
          return match.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
        });
      }
      
      // Escape emoji and other non-ASCII characters that might cause encoding issues
      jsContent = jsContent.replace(/[\u0080-\uFFFF]/g, (char) => {
        return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
      });
      
      // Preserve module type if present
      const isModule = fullMatch.includes('type="module"') || fullMatch.includes("type='module'");
      const scriptTag = isModule 
        ? `<script type="module">${jsContent}</script>`
        : `<script>${jsContent}</script>`;
      
      jsReplacements.push({ fullMatch, replacement: scriptTag });
      logInfo(`Inlined JS: ${src} (${(jsContent.length / 1024).toFixed(1)} KB)`);
    }
  }
  
  // Apply JS replacements
  for (const { fullMatch, replacement } of jsReplacements) {
    result = result.replace(fullMatch, replacement);
  }
  
  // Step 4: Inline remaining asset references in HTML (images, etc.)
  // Match src="./assets/..." or src="/assets/..."
  const assetSrcRegex = /(src=["'])(\.?\/?)assets\/([^"']+)(["'])/gi;
  result = result.replace(assetSrcRegex, (match, prefix, slash, assetPath, suffix) => {
    const fullPath = `assets/${assetPath}`;
    const fileData = fileMap.get(fullPath);
    if (fileData && !fileData.isText) {
      return `${prefix}${fileData.content}${suffix}`;
    }
    return match;
  });
  
  // Also handle href for assets
  const assetHrefRegex = /(href=["'])(\.?\/?)assets\/([^"']+)(["'])/gi;
  result = result.replace(assetHrefRegex, (match, prefix, slash, assetPath, suffix) => {
    const fullPath = `assets/${assetPath}`;
    const fileData = fileMap.get(fullPath);
    if (fileData && !fileData.isText) {
      return `${prefix}${fileData.content}${suffix}`;
    }
    return match;
  });
  
  return result;
}

/**
 * Inline url() references in CSS content
 */
async function inlineUrlsInCss(
  cssContent: string, 
  fileMap: Map<string, { content: string; isText: boolean }>,
  cssPath: string
): Promise<string> {
  // Match url('./something') or url("./something") or url(./something)
  const urlRegex = /url\(["']?([^"')]+)["']?\)/gi;
  
  return cssContent.replace(urlRegex, (match, url) => {
    // Skip data URIs and external URLs
    if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
      return match;
    }
    
    // Resolve relative to CSS file location
    let resolvedPath = url;
    if (url.startsWith("./")) resolvedPath = url.slice(2);
    if (url.startsWith("/")) resolvedPath = url.slice(1);
    
    // If CSS is in assets/, resolve relative to that
    const cssDir = cssPath.includes("/") ? cssPath.split("/").slice(0, -1).join("/") : "";
    if (cssDir && !resolvedPath.startsWith("assets/")) {
      resolvedPath = cssDir + "/" + resolvedPath;
    }
    
    const fileData = fileMap.get(resolvedPath);
    if (fileData && !fileData.isText) {
      return `url(${fileData.content})`;
    }
    
    return match;
  });
}

/**
 * Inline asset references in JS content (for dynamic imports and asset URLs)
 * Used in legacy --inline mode
 */
function inlineAssetsInJs(
  jsContent: string,
  fileMap: Map<string, { content: string; isText: boolean }>,
  jsPath: string
): string {
  let result = jsContent;
  
  // Replace asset URL strings for common folder patterns
  // Matches: "assets/...", "audio/...", "./assets/...", "./audio/...", etc.
  const assetFolders = ['assets', 'audio', 'images', 'sounds', 'music', 'fonts', 'data'];
  const folderPattern = assetFolders.join('|');
  const assetUrlRegex = new RegExp(`(["'])(\.?\/?)(${folderPattern})\/([^"']+)(["'])`, 'gi');
  
  result = result.replace(assetUrlRegex, (match, q1, prefix, folder, assetPath, q2) => {
    // Strip query string (e.g., ?h=abc123 cache-busting hashes from Vite)
    const assetPathClean = assetPath.split('?')[0];
    const fullPath = `${folder}/${assetPathClean}`;
    const fileData = fileMap.get(fullPath);
    
    if (fileData) {
      // Check file size - warn if large
      const estimatedSize = fileData.content.length;
      if (estimatedSize > 500000) {
        logInfo(`  Warning: Large asset ${fullPath} (${(estimatedSize / 1024).toFixed(0)}KB)`);
      }
      
      if (fileData.isText) {
        // For JSON files, process content to inline nested asset URLs
        if (assetPathClean.endsWith(".json")) {
          let jsonContent = fileData.content;
          
          // Replace asset URLs inside the JSON with data URIs
          const jsonUrlRegex = /"url"\s*:\s*"([^"]+)"/gi;
          jsonContent = jsonContent.replace(jsonUrlRegex, (match, url) => {
            if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
              return match;
            }
            
            const urlClean = url.split('?')[0];
            const assetData = fileMap.get(urlClean);
            
            if (assetData) {
              if (assetData.isText) {
                const assetBase64 = Buffer.from(assetData.content).toString("base64");
                const assetMime = getMimeType(url);
                return `"url": "data:${assetMime};base64,${assetBase64}"`;
              } else {
                return `"url": "${assetData.content}"`;
              }
            }
            return match;
          });
          
          const base64 = Buffer.from(jsonContent).toString("base64");
          return `${q1}data:application/json;base64,${base64}${q2}`;
        }
        
        // For other text files, convert to data URI
        const base64 = Buffer.from(fileData.content).toString("base64");
        const mimeType = getMimeType(fullPath);
        return `${q1}data:${mimeType};base64,${base64}${q2}`;
      }
      
      // Binary files already have data URI in fileData.content
      return `${q1}${fileData.content}${q2}`;
    }
    
    return match;
  });
  
  return result;
}

/**
 * Read the built HTML without inlining assets
 * Assets will be uploaded separately and URLs rewritten by the backend
 */
async function readBundleHtml(gamePath: string, useInlining: boolean = false): Promise<string> {
  const distPath = join(gamePath, "dist", "index.html");

  if (!existsSync(distPath)) {
    logError("Build output not found at dist/index.html");
    logError("Make sure the game builds correctly with: bun run build");
    process.exit(1);
  }

  let html = await Bun.file(distPath).text();
  
  // Only inline if explicitly requested (legacy mode)
  if (useInlining && hasExternalAssets(html)) {
    logInfo("Detected multi-file build, inlining assets...");
    html = await inlineAssets(gamePath, html);
    logSuccess("All assets inlined into HTML");
  }

  return html;
}

async function readThumbnail(gamePath: string): Promise<string | undefined> {
  const thumbnailDir = join(gamePath, "thumbnail");

  if (!existsSync(thumbnailDir)) {
    logInfo("No thumbnail folder found (optional)");
    return undefined;
  }

  // Find the first image file in the thumbnail directory
  const files = readdirSync(thumbnailDir);
  const imageFile = files.find((f) =>
    /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
  );

  if (!imageFile) {
    logInfo("No thumbnail image found in thumbnail/ folder");
    return undefined;
  }

  const thumbnailPath = join(thumbnailDir, imageFile);
  const buffer = await Bun.file(thumbnailPath).arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = imageFile.endsWith(".png")
    ? "image/png"
    : imageFile.endsWith(".webp")
      ? "image/webp"
      : imageFile.endsWith(".gif")
        ? "image/gif"
        : "image/jpeg";

  logSuccess(`Found thumbnail: ${imageFile}`);
  return `data:${mimeType};base64,${base64}`;
}

async function uploadGame(payload: UploadPayload): Promise<void> {
  const payloadSize = JSON.stringify(payload).length;
  logInfo(`Uploading ${payload.title} to ${API_URL}... (${(payloadSize / 1024 / 1024).toFixed(1)} MB)`);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError(`Upload failed (${response.status}): ${errorText}`);
      process.exit(1);
    }

    const result = (await response.json()) as { gameId?: string };
    logSuccess(`Upload complete!`);
    if (result.gameId) {
      logSuccess(`Uploaded game successfully`);
    }
  } catch (error) {
    logError(`Upload request failed: ${error}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle --list flag
  if (args.includes("--list") || args.includes("-l")) {
    console.log("Available games:");
    const folders = getGameFolders();
    folders.forEach((f) => {
      const hasPublish = existsSync(
        join(resolve(import.meta.dir, ".."), f, "publish.json")
      );
      console.log(`  ${hasPublish ? "✓" : "○"} ${f}`);
    });
    console.log("");
    console.log("✓ = has publish.json, ○ = needs publish.json");
    process.exit(0);
  }

  // Handle --help flag
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log("Usage: bun run upload <game-folder> [options]");
    console.log("");
    console.log("Options:");
    console.log("  horizontal     Upload as landscape-friendly (verticalOnly=false)");
    console.log("  vertical       Upload as portrait-locked (verticalOnly=true, default)");
    console.log("  new            Upload as a new game (ignore existing gameId)");
    console.log("  --list, -l     List available game folders");
    console.log("  --skip-build   Skip the build step (use existing dist/)");
    console.log("  --dry-run      Build but don't upload (test mode)");
    console.log("  --inline       Inline all assets into HTML (legacy mode)");
    console.log("  --help, -h     Show this help message");
    console.log("");
    console.log("By default, assets are uploaded separately for CDN delivery.");
    console.log("Use --inline for games that need all assets in the HTML.");
    console.log("");
    console.log("Examples:");
    console.log("  bun run upload block-blast");
    console.log("  bun run upload block-blast horizontal");
    console.log("  bun run upload two-dots --skip-build");
    console.log("  bun run upload endless-hexagon --inline");
    console.log("  bun run upload --list");
    console.log("");
    console.log("Environment:");
    console.log("  OASIZ_UPLOAD_TOKEN  Your API token (required)");
    console.log("  OASIZ_EMAIL         Your registered Oasiz email (required)");
    console.log("  OASIZ_API_URL       API endpoint (optional, has default)");
    process.exit(0);
  }

  const gameFolder = args[0];
  const skipBuild = args.includes("--skip-build");
  const dryRun = args.includes("--dry-run");
  const useInlining = args.includes("--inline");
  const uploadAsNew = args.includes("new");

  // Orientation: "horizontal" → verticalOnly=false, "vertical" or omitted → verticalOnly=true
  const hasHorizontal = args.includes("horizontal");
  const hasVertical = args.includes("vertical");
  const orientationOverride: boolean | undefined = hasHorizontal ? false : hasVertical ? true : undefined;

  // Validate environment
  if (!dryRun) {
    await validateEnvironment();
  }

  // Validate and resolve game path
  const gamePath = validateGameFolder(gameFolder);
  logInfo(`Processing game: ${gameFolder}`);

  // Read publish config
  const publishConfig = await readPublishConfig(gamePath);
  logSuccess(`Loaded publish.json: "${publishConfig.title}"`);

  if (uploadAsNew) {
    logInfo("Uploading as NEW game (ignoring existing gameId)");
  }

  // Build the game
  if (!skipBuild) {
    await buildGame(gamePath);
  } else {
    logInfo("Skipping build (--skip-build)");
  }

  // Read the built HTML bundle
  const bundleHtml = await readBundleHtml(gamePath, useInlining);
  logSuccess(`Read bundle: ${(bundleHtml.length / 1024).toFixed(1)} KB`);

  // Collect assets for separate upload (unless using inline mode)
  let assets: Record<string, string> | undefined;
  if (!useInlining) {
    logInfo("Collecting assets for CDN upload...");
    assets = await collectAssets(gamePath);
    const assetCount = Object.keys(assets).length;
    const totalSize = Object.values(assets).reduce((sum, b64) => sum + b64.length * 0.75, 0);
    logSuccess(`Collected ${assetCount} assets (${(totalSize / 1024 / 1024).toFixed(1)} MB total)`);
  }

  // Read thumbnail if available
  const thumbnailBase64 = await readThumbnail(gamePath);

  // Prepare payload
  const payload: UploadPayload = {
    title: publishConfig.title,
    slug: gameFolder,
    description: publishConfig.description,
    category: publishConfig.category,
    email: CREATOR_EMAIL!,
    gameId: uploadAsNew ? undefined : publishConfig.gameId,
    isMultiplayer: publishConfig.isMultiplayer,
    maxPlayers: publishConfig.maxPlayers,
    verticalOnly: orientationOverride ?? publishConfig.verticalOnly,
    thumbnailBase64,
    bundleHtml,
    ...(assets && { assets }),
  };

  if (dryRun) {
    logInfo("Dry run mode - skipping upload");
    console.log("");
    console.log("Would upload:");
    console.log(`  Title: ${payload.title}`);
    console.log(`  Slug: ${payload.slug}`);
    console.log(`  Category: ${payload.category}`);
    console.log(`  Description: ${payload.description}`);
    console.log(`  Creator Email: ${payload.email}`);
    console.log(`  Has Thumbnail: ${!!payload.thumbnailBase64}`);
    console.log(`  Vertical Only: ${payload.verticalOnly ?? true} (default: true)`);
    console.log(`  Bundle Size: ${(payload.bundleHtml.length / 1024).toFixed(1)} KB`);
    console.log(`  Mode: ${useInlining ? 'Inline (legacy)' : 'CDN Assets'}`);
    if (assets) {
      console.log(`  Assets: ${Object.keys(assets).length} files`);
    }
    console.log(`  Game ID: ${payload.gameId || "(will be assigned)"}`);
    process.exit(0);
  }

  // Upload!
  await uploadGame(payload);
}

main().catch((error) => {
  logError(`Unexpected error: ${error}`);
  process.exit(1);
});