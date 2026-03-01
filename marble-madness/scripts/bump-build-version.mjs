import fs from "node:fs";
import path from "node:path";

const mainPath = path.resolve("src/main.ts");
const source = fs.readFileSync(mainPath, "utf8");
const match = source.match(/const BUILD_VERSION = "(\d+)\.(\d+)\.(\d+)";/);

if (!match) {
  console.error("[BuildVersion]", "Could not find BUILD_VERSION in src/main.ts");
  process.exit(1);
}

const major = Number.parseInt(match[1], 10);
const minor = Number.parseInt(match[2], 10);
const patch = Number.parseInt(match[3], 10) + 1;
const nextVersion = major + "." + minor + "." + patch;
const nextSource = source.replace(
  /const BUILD_VERSION = "\d+\.\d+\.\d+";/,
  'const BUILD_VERSION = "' + nextVersion + '";',
);

fs.writeFileSync(mainPath, nextSource, "utf8");
console.log("[BuildVersion]", "Updated BUILD_VERSION to " + nextVersion);
