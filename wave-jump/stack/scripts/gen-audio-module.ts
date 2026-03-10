/**
 * Generate a TypeScript module with base64-encoded audio data URLs.
 * Run: bun run scripts/gen-audio-module.ts
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const AUDIO_DIR = join(import.meta.dir, "..", "src", "audio");
const OUT_FILE = join(import.meta.dir, "..", "src", "audioData.ts");

const files = await readdir(AUDIO_DIR);
const mp3Files = files.filter((f) => f.endsWith(".mp3")).sort();

let output = "/* Auto-generated — do not edit by hand. */\n";
output += "/* Run: bun run scripts/gen-audio-module.ts */\n\n";

for (const file of mp3Files) {
  const buf = await Bun.file(join(AUDIO_DIR, file)).arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  const dataUrl = `data:audio/mpeg;base64,${b64}`;

  // Convert filename to camelCase identifier
  const name = file
    .replace(".mp3", "")
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const exportName = name + "Url";

  output += `export const ${exportName} = "${dataUrl}";\n\n`;
  console.log(`[gen-audio] ${file} → ${exportName} (${b64.length} chars)`);
}

await Bun.write(OUT_FILE, output);
console.log(`[gen-audio] Written to ${OUT_FILE}`);
