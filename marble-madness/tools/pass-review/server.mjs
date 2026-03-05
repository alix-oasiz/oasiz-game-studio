import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { URL } from "node:url";

const rootDir = process.cwd();
const toolDir = path.join(rootDir, "tools", "pass-review");
const publicDir = path.join(toolDir, "public");
const stateDir = path.join(toolDir, "state");
const passFile = path.join(stateDir, "current-pass.json");
const decisionFile = path.join(stateDir, "decision.json");
const screenshotsDir = path.join(rootDir, "screenshots");
const port = Number(process.env.PASS_REVIEW_PORT ?? 4317);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function isInside(parentPath, childPath) {
  const normalizedParent = path.resolve(parentPath) + path.sep;
  const normalizedChild = path.resolve(childPath);
  return normalizedChild.startsWith(normalizedParent) || normalizedChild === path.resolve(parentPath);
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
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

function sanitizeDecision(inputValue, passId) {
  const input = inputValue && typeof inputValue === "object" ? inputValue : {};
  const status = input.status === "approved" || input.status === "declined" ? input.status : "pending";
  return {
    passId: typeof input.passId === "string" && input.passId.trim() ? input.passId.trim() : passId,
    status,
    reason: typeof input.reason === "string" ? input.reason.trim() : "",
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim()
        ? input.updatedAt.trim()
        : new Date().toISOString(),
  };
}

async function getState() {
  const pass = await readJson(passFile, null);
  if (!pass) {
    return {
      pass: null,
      decision: {
        passId: null,
        status: "pending",
        reason: "",
        updatedAt: new Date().toISOString(),
      },
    };
  }
  const defaultDecision = {
    passId: pass.passId ?? null,
    status: "pending",
    reason: "",
    updatedAt: new Date().toISOString(),
  };
  const decision = sanitizeDecision(
    await readJson(decisionFile, defaultDecision),
    pass.passId ?? null,
  );
  if (decision.passId !== pass.passId) {
    return { pass, decision: defaultDecision };
  }
  return { pass, decision };
}

async function parseRequestBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 1024 * 1024) {
      throw new Error("Body too large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function servePublicFile(res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] ?? "application/octet-stream";
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function getGalleryImages() {
  let entries = [];
  try {
    entries = await fs.readdir(screenshotsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const images = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) {
      continue;
    }
    const absolutePath = path.join(screenshotsDir, entry.name);
    try {
      const stat = await fs.stat(absolutePath);
      images.push({
        name: entry.name,
        path: path.relative(rootDir, absolutePath).replace(/\\/g, "/"),
        modifiedAt: stat.mtime.toISOString(),
        modifiedMs: stat.mtimeMs,
        sizeBytes: stat.size,
      });
    } catch {
      // Skip files that cannot be stat-ed.
    }
  }
  images.sort((a, b) => b.modifiedMs - a.modifiedMs);
  return images;
}

createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/api/state") {
    sendJson(res, 200, await getState());
    return;
  }

  if (req.method === "GET" && pathname === "/api/gallery") {
    sendJson(res, 200, {
      images: await getGalleryImages(),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/publish") {
    try {
      const body = await parseRequestBody(req);
      const pass = sanitizePass(body.pass ?? body);
      if (!pass.screenshots.length) {
        sendJson(res, 400, { error: "At least one screenshot is required." });
        return;
      }
      const decision = {
        passId: pass.passId,
        status: "pending",
        reason: "",
        updatedAt: new Date().toISOString(),
      };
      await writeJson(passFile, pass);
      await writeJson(decisionFile, decision);
      sendJson(res, 200, { pass, decision });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Failed to publish pass." });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/decision") {
    try {
      const body = await parseRequestBody(req);
      const state = await getState();
      const passId = state.pass?.passId ?? null;
      if (!passId) {
        sendJson(res, 400, { error: "No active pass. Publish a pass first." });
        return;
      }
      const status = body.status;
      if (status !== "approved" && status !== "declined") {
        sendJson(res, 400, { error: "Status must be approved or declined." });
        return;
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (status === "declined" && !reason) {
        sendJson(res, 400, { error: "Decline reason is required." });
        return;
      }
      const decision = {
        passId,
        status,
        reason,
        updatedAt: new Date().toISOString(),
      };
      await writeJson(decisionFile, decision);
      sendJson(res, 200, { decision });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Failed to save decision." });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/image") {
    const requestedPath = requestUrl.searchParams.get("path");
    if (!requestedPath) {
      sendText(res, 400, "Missing image path");
      return;
    }
    const resolvedPath = path.resolve(rootDir, requestedPath);
    if (!isInside(rootDir, resolvedPath)) {
      sendText(res, 403, "Forbidden");
      return;
    }
    const extension = path.extname(resolvedPath).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(MIME_TYPES, extension)) {
      sendText(res, 400, "Unsupported file type");
      return;
    }
    await servePublicFile(res, resolvedPath);
    return;
  }

  let filePath = pathname === "/" ? path.join(publicDir, "index.html") : path.join(publicDir, pathname);
  filePath = path.normalize(filePath);
  if (!isInside(publicDir, filePath)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  await servePublicFile(res, filePath);
})
  .listen(port, "127.0.0.1", () => {
    console.log("[PassReviewServer]", "Listening on http://127.0.0.1:" + String(port));
  });
