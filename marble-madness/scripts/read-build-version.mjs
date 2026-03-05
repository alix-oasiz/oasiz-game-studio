import fs from "node:fs";
import path from "node:path";

const mainPath = path.resolve("src/main.ts");
const source = fs.readFileSync(mainPath, "utf8");
const match = source.match(/const BUILD_VERSION = "(\d+\.\d+\.\d+)";/);

if (!match) {
  console.error("[BuildVersion]", "Could not find BUILD_VERSION in src/main.ts");
  process.exit(1);
}

console.log("[BuildVersion]", "Current BUILD_VERSION is " + match[1]);
