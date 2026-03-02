// @ts-nocheck
/**
 * Oasiz uploader CLI
 *
 * Usage:
 *   bun run upload --list
 *   bun run upload <game-name> [--skip-build] [--dry-run]
 *
 * Expects:
 *   - game folder contains dist/index.html after build
 *   - credentials in .env:
 *       OASIZ_UPLOAD_TOKEN=...
 *       OASIZ_EMAIL=...
 *       (optional) OASIZ_API_URL=...
 */
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

type PublishMeta = {
  title?: string;
  description?: string;
  category?: string;
};

type CliOptions = {
  list: boolean;
  skipBuild: boolean;
  dryRun: boolean;
  gameName: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const list = args.includes("--list");
  const skipBuild = args.includes("--skip-build");
  const dryRun = args.includes("--dry-run");

  const positional = args.filter((a) => !a.startsWith("--"));
  const gameName = positional.length > 0 ? positional[0] : null;

  return { list, skipBuild, dryRun, gameName };
}

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

async function loadEnv(): Promise<void> {
  const envPath = resolve(".env");
  if (!existsSync(envPath)) return;

  const text = await Bun.file(envPath).text();
  const parsed = parseDotEnv(text);
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof process.env[k] === "undefined") process.env[k] = v;
  }
}

async function listGames(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const games: string[] = [];
  for (const d of dirs) {
    // "Game folder" heuristic: package.json + index.html + src/main.ts
    const pkg = join(rootDir, d, "package.json");
    const html = join(rootDir, d, "index.html");
    const main = join(rootDir, d, "src", "main.ts");
    if (existsSync(pkg) && existsSync(html) && existsSync(main)) games.push(d);
  }
  games.sort((a, b) => a.localeCompare(b));
  return games;
}

async function runCmd(cwd: string, cmd: string[], label: string): Promise<void> {
  console.log(`[upload] ${label}:`, cmd.join(" "));
  const proc = Bun.spawn(cmd, {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`[upload] Command failed (${label}) exit=${exitCode}`);
}

function coerceMeta(raw: unknown, gameName: string): Required<PublishMeta> {
  const fallback: Required<PublishMeta> = { title: gameName, description: "test", category: "test" };
  if (!raw || typeof raw !== "object") return fallback;
  const m = raw as PublishMeta;
  return {
    title: typeof m.title === "string" && m.title.trim() ? m.title.trim() : fallback.title,
    description:
      typeof m.description === "string" && m.description.trim() ? m.description.trim() : fallback.description,
    category: typeof m.category === "string" && m.category.trim() ? m.category.trim() : fallback.category,
  };
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

async function findThumbnail(gameDir: string): Promise<
  | {
      filename: string;
      mime: string;
      base64: string;
    }
  | null
> {
  const thumbDir = join(gameDir, "thumbnail");
  if (!existsSync(thumbDir)) return null;

  const entries = await readdir(thumbDir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const picked = files.find((f) => /\.(png|jpe?g|webp|gif)$/i.test(f));
  if (!picked) return null;

  const buf = Buffer.from(await Bun.file(join(thumbDir, picked)).arrayBuffer());
  return {
    filename: picked,
    mime: guessMime(picked),
    base64: buf.toString("base64"),
  };
}

async function main(): Promise<void> {
  await loadEnv();

  const opts = parseArgs(process.argv);
  const rootDir = resolve(".");

  if (opts.list) {
    const games = await listGames(rootDir);
    if (games.length === 0) {
      console.log("[upload] No game folders found at repo root.");
      return;
    }
    console.log("[upload] Available games:");
    for (const g of games) console.log(`- ${g}`);
    return;
  }

  if (!opts.gameName) {
    console.log("[upload] Usage:");
    console.log("  bun run upload --list");
    console.log("  bun run upload <game-name> [--skip-build] [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const token = process.env.OASIZ_UPLOAD_TOKEN || "";
  const email = process.env.OASIZ_EMAIL || "";
  const apiUrl = process.env.OASIZ_API_URL || "https://api.oasiz.ai/api/upload/game";

  if (!token) throw new Error("[upload] Missing OASIZ_UPLOAD_TOKEN (set it in .env)");
  if (!email || email.includes("your-registered-email")) {
    throw new Error("[upload] Missing/placeholder OASIZ_EMAIL (set it in .env to your account email)");
  }

  const gameName = opts.gameName;
  const gameDir = resolve(gameName);
  if (!existsSync(gameDir)) throw new Error(`[upload] Game folder not found: ${gameDir}`);

  if (!opts.skipBuild) {
    await runCmd(gameDir, ["bun", "install"], "install");
    await runCmd(gameDir, ["bun", "run", "build"], "build");
  }

  const distHtmlPath = join(gameDir, "dist", "index.html");
  if (!existsSync(distHtmlPath)) {
    throw new Error(`[upload] Missing ${distHtmlPath}. Build must output dist/index.html`);
  }

  const html = await Bun.file(distHtmlPath).text();
  if (!html || html.length < 1000) {
    console.log("[upload] Warning: dist/index.html looks unusually small.");
  }

  const publishPath = join(gameDir, "publish.json");
  const rawMeta = existsSync(publishPath) ? await Bun.file(publishPath).json() : null;
  const meta = coerceMeta(rawMeta, gameName);

  const thumbnail = await findThumbnail(gameDir);

  const payload = {
    email,
    game: gameName,
    title: meta.title,
    description: meta.description,
    category: meta.category,
    html,
    thumbnail, // null or { filename, mime, base64 }
  };

  if (opts.dryRun) {
    console.log("[upload] Dry run OK.");
    console.log(`[upload] Would upload game="${payload.game}" title="${payload.title}" category="${payload.category}"`);
    console.log(`[upload] HTML bytes=${Buffer.byteLength(html, "utf8")}`);
    console.log(`[upload] Thumbnail=${thumbnail ? thumbnail.filename : "none"}`);
    console.log(`[upload] API URL=${apiUrl}`);
    return;
  }

  console.log(`[upload] Uploading "${gameName}"...`);

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[upload] Upload failed (${res.status}): ${text}`);
  }

  console.log("[upload] Upload OK:", text);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exitCode = 1;
});

