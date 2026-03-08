#!/usr/bin/env bun
/**
 * Generate individual chibi character art for Dungeon Loop start screen.
 * Each character is generated separately with transparent backgrounds
 * so they can pop up individually on the title screen.
 *
 * Usage:
 *   bun run tools/generateCoverArt.ts
 */

import sharp from "sharp";
import { replicateCreatePrediction, replicateWaitForPrediction, coerceOutputUrl, downloadToFile } from "./replicateClient";
import { existsSync, mkdirSync } from "node:fs";

const ASSETS = "dungeon-loop/public/assets";
const OUT_DIR = `${ASSETS}/cover-chars`;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// ── Sprite definitions for reference images ──
const sprites = {
  knight: { path: `${ASSETS}/PlayerSprites/Hero03 Knight Idle-Sheet.png`, fw: 19, fh: 20, frame: 0 },
  mage: { path: `${ASSETS}/MagePlayer/Hero01 Mage Idle2x-Sheet.png`, fw: 32, fh: 36, frame: 0 },
  archer: { path: `${ASSETS}/ArcherPlayer/Hero02 Archer Idle-Sheet2x.png`, fw: 30, fh: 34, frame: 0 },
  rogue: { path: `${ASSETS}/RoguePlayer/Hero04 Rogue Idle2x-Sheet.png`, fw: 42, fh: 34, frame: 0 },
  slime: { path: `${ASSETS}/Enemies/SlimeBoss/Enemy06Idle-Sheet2x.png`, fw: 34, fh: 32, frame: 0 },
  dragon: { path: `${ASSETS}/Enemies/DragonBoss/Enemy10idle-Sheet2x.png`, fw: 110, fh: 72, frame: 0 },
  mummy: { path: `${ASSETS}/Enemies/MummyBos/Enemy07Idle-Sheet2x.png`, fw: 44, fh: 66, frame: 0 },
};

async function extractFrame(sprite: { path: string; fw: number; fh: number; frame: number }, scale: number): Promise<Buffer> {
  const { path, fw, fh, frame } = sprite;
  const cropped = await sharp(path)
    .extract({ left: frame * fw, top: 0, width: fw, height: fh })
    .toBuffer();
  return sharp(cropped)
    .resize(fw * scale, fh * scale, { kernel: "nearest" })
    .png()
    .toBuffer();
}

async function spriteToDataUri(sprite: { path: string; fw: number; fh: number; frame: number }): Promise<string> {
  const buf = await extractFrame(sprite, 8);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ── Character definitions with exact chibi prompts ──
interface CharDef {
  id: string;
  spriteKey: keyof typeof sprites;
  prompt: string;
}

const characters: CharDef[] = [
  {
    id: "knight",
    spriteKey: "knight",
    prompt: `Chibi cartoon character: a brave WARRIOR KNIGHT.
REFERENCE IMAGE shows the exact pixel sprite design — match its colors and equipment exactly.
- Stocky chibi proportions (big head, small body)
- NO HELMET — instead has long flowing BLACK HAIR (spiky, wild, anime-style black hair)
- Eyes: WHITE SCLERA, BLUE IRIS, small BLACK PUPIL. Big expressive anime eyes with clearly visible white whites-of-eyes, bright blue iris ring, and small black dot pupil.
- Dark black and dark red/maroon colored heavy plate armor (NOT silver, NOT gold — dark black-red armor as in the sprite)
- Large broad silver blade sword with a RED sword guard/crossguard, held up in right hand
- RED shield with dark emblem held in left hand (the shield is red/crimson colored, NOT blue)
- Determined heroic expression, slight battle stance
- Full body visible, facing slightly to the left in a 3/4 view
- Solid plain white background for easy cutout
- Clean sharp linework, vibrant cartoon shading
- NO text, NO extra elements, just the single character on white`,
  },
  {
    id: "mage",
    spriteKey: "mage",
    prompt: `Chibi cartoon character: a powerful MAGE.
REFERENCE IMAGE shows the exact pixel sprite design — match its colors and equipment exactly.
- Cute chibi proportions (big head, small body)
- Eyes: WHITE SCLERA, DARK BROWN IRIS, small BLACK PUPIL. Big expressive anime eyes with clearly visible white whites-of-eyes, warm brown iris ring, and small black dot pupil.
- Bright cyan/teal blue hooded robe and cloak (matching the sprite's blue-teal color exactly)
- Wooden staff with glowing blue crystal orb on top, held in one hand
- Other hand channeling orange fire magic with a small flame
- ORANGE fabric mouth cover / face mask covering nose and mouth (like a ninja mask, bright orange color)
- Mysterious but cute expression, hood up with orange mask visible
- Full body visible, facing slightly to the left in a 3/4 view
- Solid plain white background for easy cutout
- Clean sharp linework, vibrant cartoon shading
- NO text, NO extra elements, just the single character on white`,
  },
  {
    id: "archer",
    spriteKey: "archer",
    prompt: `Chibi cartoon character: a skilled ARCHER.
REFERENCE IMAGE shows the exact pixel sprite design — match its colors and equipment exactly.
- Cute chibi proportions (big head, small body)
- Eyes: WHITE SCLERA, GOLDEN YELLOW IRIS, small BLACK PUPIL. Big expressive anime eyes with clearly visible white whites-of-eyes, bright golden-amber iris ring, and small black dot pupil.
- Bright PINK HAIR (very important — vivid pink/magenta colored hair as shown in sprite)
- GREEN leather tunic and outfit (matching the sprite's green color)
- Golden bow drawn with a glowing arrow nocked, aiming forward
- Brown quiver of arrows on back
- Focused determined expression
- Full body visible, facing slightly to the left in a 3/4 view
- Solid plain white background for easy cutout
- Clean sharp linework, vibrant cartoon shading
- NO text, NO extra elements, just the single character on white`,
  },
  {
    id: "rogue",
    spriteKey: "rogue",
    prompt: `Chibi cartoon character: a stealthy ROGUE assassin.
REFERENCE IMAGE shows the exact pixel sprite design — use it as loose reference for pose.
- Cute chibi proportions (big head, small body)
- BROWN SKIN tone (dark brown complexion, very important!)
- Eyes: WHITE SCLERA, BLUE IRIS, small BLACK PUPIL. Big expressive anime eyes with clearly visible white whites-of-eyes, bright blue iris ring, and small black dot pupil.
- YELLOW head cover / bandana / hood wrapped around head (bright yellow fabric)
- SHIRTLESS / NO TOP — bare brown-skinned chest and arms visible (muscular but chibi)
- YELLOW pants / bottom clothing (bright yellow fabric matching the head cover)
- TWO KNIVES — one in each hand, clearly visible and prominent (curved blades, combat ready)
- Crouched agile combat stance, ready to strike
- Confident smirk expression
- Full body visible, facing slightly to the left in a 3/4 view
- Solid plain white background for easy cutout
- Clean sharp linework, vibrant cartoon shading
- NO text, NO extra elements, just the single character on white`,
  },
  {
    id: "slime",
    spriteKey: "slime",
    prompt: `Chibi cartoon character: a SLIME KING boss monster.
REFERENCE IMAGE shows the exact pixel sprite design — match its colors exactly.
- Cute but menacing chibi proportions
- Green gelatinous blob body with darker green spots (matching sprite's green tones)
- Tiny golden crown sitting on top of the slime
- Dripping acid/slime droplets around the base
- Angry cute expression with beady eyes and frowning mouth
- Full body visible, facing slightly to the right in a 3/4 view
- Solid plain white background for easy cutout
- Clean sharp linework, vibrant cartoon shading
- NO text, NO extra elements, just the single character on white`,
  },
  {
    id: "dragon",
    spriteKey: "dragon",
    prompt: `Chibi cartoon character: a fearsome FIRE DRAGON boss monster.
REFERENCE IMAGE shows the exact pixel sprite design — match its colors exactly.
- Chibi proportions but still imposing (big head, thick body, small limbs)
- Red-orange scales with orange underbelly (matching the sprite's red-orange coloring exactly)
- Spread leathery dark red wings
- Breathing a small burst of fire from mouth
- Glowing green eyes (matching sprite)
- Sharp teeth visible in a menacing grin
- Small but powerful claws
- Full body visible, facing slightly to the right in a 3/4 view
- Solid plain white background for easy cutout
- Clean sharp linework, vibrant cartoon shading
- NO text, NO extra elements, just the single character on white`,
  },
  {
    id: "mummy",
    spriteKey: "mummy",
    prompt: `Chibi cartoon character: a MUMMY PHARAOH boss monster.
REFERENCE IMAGE shows the exact pixel sprite design — match its colors exactly.
- Tall chibi proportions (slightly elongated compared to others)
- Yellowish-tan tattered bandages wrapping the body (matching sprite's golden-tan color)
- Glowing purple curse runes/markings visible on bandages
- Glowing purple eyes peering from behind bandages
- Arms outstretched in a menacing curse-casting pose
- Ancient pharaoh headdress partially visible under bandages
- Full body visible, facing slightly to the right in a 3/4 view
- Solid plain white background for easy cutout
- Clean sharp linework, vibrant cartoon shading
- NO text, NO extra elements, just the single character on white`,
  },
];

// ── Generate all characters ──
async function generateCharacter(char: CharDef): Promise<void> {
  const rawFile = `${OUT_DIR}/${char.id}-raw.png`;
  const finalFile = `${OUT_DIR}/${char.id}.png`;

  console.log(`\n[${char.id}] Extracting sprite reference...`);
  const refDataUri = await spriteToDataUri(sprites[char.spriteKey]);

  console.log(`[${char.id}] Calling Nano Banana Pro...`);
  const pred = await replicateCreatePrediction({
    owner: "google",
    model: "nano-banana-pro",
    input: {
      prompt: char.prompt,
      image_input: [refDataUri],
      aspect_ratio: "1:1",
      output_format: "png",
      safety_tolerance: 2,
      prompt_upsampling: true,
    },
  });

  console.log(`[${char.id}] Prediction: ${pred.id} — waiting...`);
  const done = await replicateWaitForPrediction(pred.id, { timeoutMs: 5 * 60 * 1000 });
  const url = coerceOutputUrl(done.output);

  await downloadToFile(url, rawFile);
  console.log(`[${char.id}] Raw image saved: ${rawFile}`);

  // Remove white background using sharp — make near-white pixels transparent
  console.log(`[${char.id}] Removing white background...`);
  const raw = sharp(rawFile);
  const { data, info } = await raw.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // Threshold: pixels with R,G,B all > 235 are treated as background
  const threshold = 235;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > threshold && g > threshold && b > threshold) {
      data[i + 3] = 0; // set alpha to 0 (transparent)
    }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(finalFile);
  console.log(`[${char.id}] Final transparent PNG: ${finalFile}`);
}

async function main() {
  // Regenerate only specific characters (pass names as CLI args, or all if none given)
  const args = process.argv.slice(2);
  const toGenerate = args.length > 0
    ? characters.filter((c) => args.includes(c.id))
    : characters;

  console.log("=== Dungeon Loop Chibi Character Generator ===");
  console.log(`Generating ${toGenerate.length} character(s): ${toGenerate.map((c) => c.id).join(", ")}`);
  console.log(`Output: ${OUT_DIR}/\n`);

  for (const char of toGenerate) {
    await generateCharacter(char);
  }

  console.log("\n=== Done! ===");
  console.log("Files:");
  for (const char of toGenerate) {
    console.log(`  ${OUT_DIR}/${char.id}.png`);
  }
}

main().catch((err) => {
  console.error("[generateCoverArt] Error:", err);
  process.exit(1);
});
