import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const buildVersionJsonPath = resolve(rootDir, "build-version.json");
const outputPath = resolve(rootDir, "src", "build-version.ts");

const buildVersionJson = JSON.parse(readFileSync(buildVersionJsonPath, "utf8"));
const currentVersion = typeof buildVersionJson.version === "string" ? buildVersionJson.version : "0.0.0";
const parts = currentVersion.split(".").map((value) => Number.parseInt(value, 10));
const major = Number.isFinite(parts[0]) ? parts[0] : 0;
const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
const buildVersion = `${major}.${minor}.${patch + 1}`;

writeFileSync(buildVersionJsonPath, JSON.stringify({ version: buildVersion }, null, 4) + "\n", "utf8");
const fileContents = `export const BUILD_VERSION = "${buildVersion}";\n`;

writeFileSync(outputPath, fileContents, "utf8");
console.log("[writeBuildVersion]", buildVersion);
