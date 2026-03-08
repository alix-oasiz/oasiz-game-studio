/**
 * Sprite Packer Script
 *
 * Converts individual frame PNGs in public/assets/sprites/{dir}/
 * into single spritesheets + Phaser JSON atlas files in public/assets/spritesheets/
 *
 * Usage: bun run scripts/pack-sprites.ts
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

const SPRITES_DIR = join(import.meta.dir, "..", "public", "assets", "sprites");
const OUTPUT_DIR = join(
  import.meta.dir,
  "..",
  "public",
  "assets",
  "spritesheets",
);

interface FrameInfo {
  filename: string;
  path: string;
  index: number;
}

async function getSpriteDirs(): Promise<string[]> {
  const entries = await readdir(SPRITES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function getFrames(dirName: string): Promise<FrameInfo[]> {
  const dirPath = join(SPRITES_DIR, dirName);
  const files = await readdir(dirPath);
  const pngFiles = files
    .filter((f) => f.endsWith(".png") && f.startsWith("frame"))
    .sort();

  return pngFiles.map((f, i) => ({
    filename: f,
    path: join(dirPath, f),
    index: i,
  }));
}

async function packSpritesheet(dirName: string): Promise<void> {
  const frames = await getFrames(dirName);
  if (frames.length === 0) {
    console.log(`  [SKIP] ${dirName}: no frames found`);
    return;
  }

  // Read first frame to get dimensions
  const firstMeta = await sharp(frames[0].path).metadata();
  const frameW = firstMeta.width!;
  const frameH = firstMeta.height!;

  // Calculate grid layout (roughly square)
  const cols = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / cols);
  const sheetW = cols * frameW;
  const sheetH = rows * frameH;

  // Composite all frames onto a single sheet
  const composites: sharp.OverlayOptions[] = [];
  const atlasFrames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> = {};

  for (let i = 0; i < frames.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * frameW;
    const y = row * frameH;

    const frameBuffer = await readFile(frames[i].path);
    composites.push({
      input: frameBuffer,
      left: x,
      top: y,
    });

    // Frame key matches what Phaser expects: "frame0000", "frame0001", etc.
    const num = String(i).padStart(4, "0");
    atlasFrames[`frame${num}`] = {
      frame: { x, y, w: frameW, h: frameH },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frameW, h: frameH },
      sourceSize: { w: frameW, h: frameH },
    };
  }

  // Create the spritesheet image
  const sheetBuffer = await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  // Write the spritesheet PNG
  const pngPath = join(OUTPUT_DIR, `${dirName}.png`);
  await writeFile(pngPath, sheetBuffer);

  // Build Phaser JSON Hash atlas format
  const atlas = {
    frames: atlasFrames,
    meta: {
      image: `${dirName}.png`,
      format: "RGBA8888",
      size: { w: sheetW, h: sheetH },
      scale: 1,
    },
  };

  const jsonPath = join(OUTPUT_DIR, `${dirName}.json`);
  await writeFile(jsonPath, JSON.stringify(atlas, null, 2));

  const sizeKB = (sheetBuffer.length / 1024).toFixed(1);
  console.log(
    `  [OK] ${dirName}: ${frames.length} frames -> ${sheetW}x${sheetH} (${sizeKB} KB)`,
  );
}

async function main() {
  console.log("Sprite Packer: Converting individual PNGs to spritesheets\n");

  await mkdir(OUTPUT_DIR, { recursive: true });

  const dirs = await getSpriteDirs();
  console.log(`Found ${dirs.length} sprite directories:\n`);

  let totalFrames = 0;
  let totalSheets = 0;

  for (const dir of dirs) {
    await packSpritesheet(dir);
    const frames = await getFrames(dir);
    totalFrames += frames.length;
    if (frames.length > 0) totalSheets++;
  }

  console.log(
    `\nDone! Packed ${totalFrames} frames into ${totalSheets} spritesheets.`,
  );
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("Pack failed:", err);
  process.exit(1);
});
