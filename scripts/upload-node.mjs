import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve, extname, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// Load .env
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}

const API_URL = process.env.OASIZ_API_URL || "https://api.oasiz.ai/api/upload/game";
const API_TOKEN = process.env.OASIZ_UPLOAD_TOKEN;
const CREATOR_EMAIL = process.env.OASIZ_EMAIL;

if (!API_TOKEN) { console.error("ERROR: OASIZ_UPLOAD_TOKEN not set"); process.exit(1); }
if (!CREATOR_EMAIL) { console.error("ERROR: OASIZ_EMAIL not set"); process.exit(1); }

const gameFolder = process.argv[2];
if (!gameFolder) { console.error("Usage: node scripts/upload-node.mjs <game-folder>"); process.exit(1); }

const gamePath = resolve(ROOT, gameFolder);
const distPath = join(gamePath, "dist");
const publishPath = join(gamePath, "publish.json");

// Read publish.json
let publishConfig = { title: gameFolder, description: "test", category: "arcade", verticalOnly: false };
if (existsSync(publishPath)) {
  publishConfig = { ...publishConfig, ...JSON.parse(readFileSync(publishPath, "utf-8")) };
}

// Read bundle HTML
const bundleHtml = readFileSync(join(distPath, "index.html"), "utf-8");
console.log(`Bundle HTML: ${(bundleHtml.length / 1024).toFixed(1)} KB`);

// Collect assets
const MIME_TYPES = {
  ".js": "application/javascript", ".css": "text/css", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg",
  ".wav": "audio/wav", ".ogg": "audio/ogg", ".mp4": "video/mp4",
  ".webm": "video/webm", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".json": "application/json",
};

function collectAssets(dir, base) {
  const assets = {};
  if (!existsSync(dir)) return assets;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      Object.assign(assets, collectAssets(fullPath, base));
    } else {
      const relativePath = relative(base, fullPath);
      if (relativePath === "index.html") continue;
      const ext = extname(entry).toLowerCase();
      const mime = MIME_TYPES[ext];
      if (!mime) continue;
      if (stat.size > 50 * 1024 * 1024) { console.log(`  Skipping large file: ${relativePath}`); continue; }
      const data = readFileSync(fullPath);
      assets[relativePath] = `data:${mime};base64,${data.toString("base64")}`;
      console.log(`  Asset: ${relativePath} (${(stat.size / 1024).toFixed(1)} KB)`);
    }
  }
  return assets;
}

const assets = collectAssets(distPath, distPath);
const assetCount = Object.keys(assets).length;
console.log(`Collected ${assetCount} assets`);

// Read thumbnail
let thumbnailBase64 = undefined;
const thumbDir = join(gamePath, "thumbnail");
if (existsSync(thumbDir)) {
  for (const f of readdirSync(thumbDir)) {
    if (/\.(png|jpg|jpeg|webp)$/i.test(f)) {
      const data = readFileSync(join(thumbDir, f));
      const ext = extname(f).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      thumbnailBase64 = `data:${mime};base64,${data.toString("base64")}`;
      console.log(`Thumbnail: ${f}`);
      break;
    }
  }
}

// Build payload
const payload = {
  title: publishConfig.title,
  slug: gameFolder,
  description: publishConfig.description,
  category: publishConfig.category,
  email: CREATOR_EMAIL,
  verticalOnly: publishConfig.verticalOnly ?? false,
  bundleHtml,
  ...(thumbnailBase64 && { thumbnailBase64 }),
  ...(assetCount > 0 && { assets }),
};

const body = JSON.stringify(payload);
console.log(`\nUploading "${payload.title}" to ${API_URL}... (${(body.length / 1024 / 1024).toFixed(1)} MB)`);

try {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Upload failed (${response.status}): ${errorText}`);
    process.exit(1);
  }

  const result = await response.json();
  console.log("Upload complete!", result);
} catch (error) {
  console.error(`Upload request failed: ${error.message}`);
  process.exit(1);
}
