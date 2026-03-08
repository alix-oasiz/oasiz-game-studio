import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const LEVELS_FILE = join(import.meta.dir, "src", "levels.ts");
const EDITOR_FILE = join(import.meta.dir, "level-editor.html");
const PORT = 4444;

interface LevelData {
  id: number;
  name: string;
  grid: number[][];
  player: { x: number; y: number };
  boxes: { x: number; y: number }[];
}

function parseLevelsFile(): LevelData[] {
  const src = readFileSync(LEVELS_FILE, "utf-8");
  const match = src.match(/const LEVELS:\s*LevelData\[\]\s*=\s*(\[[\s\S]*?\]);\s*\nexport/);
  if (!match) {
    console.log("[parseLevelsFile] Could not find LEVELS array, returning empty");
    return [];
  }
  const jsonStr = match[1]
    .replace(/\/\/.*$/gm, "")
    .replace(/,\s*([\]}])/g, "$1")
    .replace(/(\w+)\s*:/g, '"$1":');
  try {
    return JSON.parse(jsonStr) as LevelData[];
  } catch (e) {
    console.error("[parseLevelsFile] JSON parse failed:", e);
    return [];
  }
}

function formatLevel(lv: LevelData): string {
  const gridStr = lv.grid.map((row) => "      [" + row.join(", ") + "]").join(",\n");
  const boxesStr = lv.boxes.map((b) => "{ x: " + b.x + ", y: " + b.y + " }").join(", ");
  const playerStr = "{ x: " + lv.player.x + ", y: " + lv.player.y + " }";

  return (
    "  {\n" +
    "    id: " + lv.id + ",\n" +
    '    name: "' + (lv.name || "Untitled").replace(/"/g, '\\"') + '",\n' +
    "    grid: [\n" + gridStr + ",\n    ],\n" +
    "    player: " + playerStr + ",\n" +
    "    boxes: [" + boxesStr + "],\n" +
    "  }"
  );
}

function writeLevelsFile(levels: LevelData[]): void {
  const items = levels.map((lv) => formatLevel(lv));
  const content =
    'export interface Position {\n  x: number;\n  y: number;\n}\n\n' +
    'export interface LevelData {\n  id: number;\n  name: string;\n  grid: number[][];\n  player: Position;\n  boxes: Position[];\n}\n\n' +
    "const LEVELS: LevelData[] = [\n" + items.join(",\n") + ",\n];\n\nexport default LEVELS;\n";
  writeFileSync(LEVELS_FILE, content, "utf-8");
  console.log("[writeLevelsFile] Wrote " + levels.length + " levels to " + LEVELS_FILE);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/levels" && req.method === "GET") {
      try {
        const levels = parseLevelsFile();
        return new Response(JSON.stringify(levels), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
      }
    }

    if (url.pathname === "/api/levels" && req.method === "POST") {
      try {
        const levels = (await req.json()) as LevelData[];
        writeLevelsFile(levels);
        return new Response(JSON.stringify({ ok: true, count: levels.length }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
      }
    }

    if (url.pathname === "/api/levels" && req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/" || url.pathname === "/level-editor.html") {
      const html = readFileSync(EDITOR_FILE, "utf-8");
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log("[level-editor-server] Running at http://localhost:" + PORT);
