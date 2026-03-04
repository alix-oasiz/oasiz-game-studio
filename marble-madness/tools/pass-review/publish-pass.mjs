import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const toolDir = path.join(rootDir, "tools", "pass-review");
const stateDir = path.join(toolDir, "state");
const passFile = path.join(stateDir, "current-pass.json");
const decisionFile = path.join(stateDir, "decision.json");

function usage() {
  console.error("Usage: npm run review:publish -- <json-file-path>");
}

function sanitizeScreenshots(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  const screenshots = [];
  for (let index = 0; index < input.length; index += 1) {
    const item = input[index];
    if (typeof item === "string") {
      screenshots.push({
        label: "Screenshot " + String(index + 1),
        path: item,
      });
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : "Screenshot " + String(index + 1);
    const screenshotPath =
      typeof item.path === "string" && item.path.trim() ? item.path.trim() : "";
    if (!screenshotPath) {
      continue;
    }
    screenshots.push({ label, path: screenshotPath });
  }
  return screenshots;
}

function sanitizePass(inputValue) {
  const input = inputValue && typeof inputValue === "object" ? inputValue : {};
  const now = new Date().toISOString();
  const screenshots = sanitizeScreenshots(input.screenshots);
  const nextSteps = Array.isArray(input.nextSteps)
    ? input.nextSteps
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
    : [];

  return {
    passId:
      typeof input.passId === "string" && input.passId.trim()
        ? input.passId.trim()
        : "pass-" + now.replace(/[^\d]/g, "").slice(0, 14),
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : "Untitled Pass",
    summary:
      typeof input.summary === "string" ? input.summary.trim() : "",
    screenshots,
    reasoning:
      typeof input.reasoning === "string" ? input.reasoning.trim() : "",
    nextSteps,
    createdAt:
      typeof input.createdAt === "string" && input.createdAt.trim()
        ? input.createdAt.trim()
        : now,
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    usage();
    process.exit(1);
  }

  const absoluteInputPath = path.resolve(rootDir, inputPath);
  const raw = await fs.readFile(absoluteInputPath, "utf8");
  const pass = sanitizePass(JSON.parse(raw));
  if (!pass.screenshots.length) {
    throw new Error("Pass must include at least one screenshot.");
  }

  const decision = {
    passId: pass.passId,
    status: "pending",
    reason: "",
    updatedAt: new Date().toISOString(),
  };

  await writeJson(passFile, pass);
  await writeJson(decisionFile, decision);

  console.log(
    "[PublishPass]",
    "Published passId=" +
      pass.passId +
      " screenshots=" +
      String(pass.screenshots.length),
  );
}

main().catch((error) => {
  console.error("[PublishPass]", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
