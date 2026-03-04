import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PROJECT_ROOT = process.cwd();
const HOST = process.env.MM_HOST ?? "127.0.0.1";
const PORT = process.env.MM_PORT ?? "5173";
const DEBOUNCE_MS = 450;
const SELF_WRITE_GUARD_MS = 2000;
const WATCH_DIRS = ["src", "public"];
const WATCH_FILES = ["index.html", "vite.config.js", "tsconfig.json"];
const WATCH_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".html",
  ".glsl",
  ".vert",
  ".frag",
]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "test-results", "screenshots"]);
const LOCK_FILE = path.join(PROJECT_ROOT, ".dev-auto.lock");

const nodeCmd = process.execPath;
const viteCli = path.join(PROJECT_ROOT, "node_modules", "vite", "bin", "vite.js");
const versionBumpScript = path.join(PROJECT_ROOT, "scripts", "bump-build-version.mjs");
const mainTsPath = path.join(PROJECT_ROOT, "src", "main.ts");
const watchers = [];
let debounceTimer = null;
let ignoreUntil = 0;
let isBuilding = false;
let rerunRequested = false;
let devServer = null;
let isShuttingDown = false;
let devRestartTimer = null;
let lockAcquired = false;

function log(name, message) {
  console.log("[" + name + "]", message);
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, "utf8");
      const existing = JSON.parse(raw);
      const activePid = Number.parseInt(String(existing?.pid ?? ""), 10);
      if (isPidRunning(activePid)) {
        log(
          "WatchFlow",
          "Another dev:auto instance is already running (PID " +
            String(activePid) +
            "). Exiting.",
        );
        return false;
      }
    }
  } catch {
    // If lock read fails, continue and replace it.
  }

  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify(
      {
        pid: process.pid,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  lockAcquired = true;
  return true;
}

function releaseLock() {
  if (!lockAcquired) {
    return;
  }
  try {
    if (!fs.existsSync(LOCK_FILE)) {
      return;
    }
    const raw = fs.readFileSync(LOCK_FILE, "utf8");
    const lock = JSON.parse(raw);
    if (Number(lock?.pid) === process.pid) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // Ignore cleanup errors on shutdown.
  } finally {
    lockAcquired = false;
  }
}

function toRelative(targetPath) {
  return path.relative(PROJECT_ROOT, targetPath).replaceAll("\\", "/");
}

function readBuildVersion() {
  try {
    const source = fs.readFileSync(mainTsPath, "utf8");
    const match = source.match(/const BUILD_VERSION = "(\d+\.\d+\.\d+)";/);
    return match ? match[1] : "unknown";
  } catch {
    return "unknown";
  }
}

function shouldWatchFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) {
    return WATCH_FILES.includes(path.basename(filePath));
  }
  return WATCH_EXTENSIONS.has(ext);
}

function shouldSkipDir(dirPath) {
  const name = path.basename(dirPath);
  return SKIP_DIRS.has(name);
}

function collectDirs(rootDir) {
  const dirs = [];
  if (!fs.existsSync(rootDir)) {
    return dirs;
  }

  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || shouldSkipDir(current)) {
      continue;
    }
    dirs.push(current);
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      }
    }
  }
  return dirs;
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function stopProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) {
      resolve();
      return;
    }

    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        shell: false,
      });
      killer.on("exit", () => resolve());
      return;
    }

    try {
      process.kill(pid, "SIGTERM");
    } catch {
      resolve();
      return;
    }
    setTimeout(resolve, 300);
  });
}

function startDevServer() {
  if (devServer) {
    return;
  }
  log("WatchFlow", "Starting dev server on http://" + HOST + ":" + PORT + "/");
  devServer = spawn(
    nodeCmd,
    [viteCli, "--host", HOST, "--port", PORT, "--strictPort"],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      shell: false,
    },
  );
  devServer.on("exit", (code, signal) => {
    const hadServer = devServer !== null;
    devServer = null;
    if (!isShuttingDown && hadServer) {
      log(
        "WatchFlow",
        "Dev server exited (code " +
          String(code ?? "null") +
          ", signal " +
          String(signal ?? "null") +
          ")",
      );
      if (!devRestartTimer) {
        devRestartTimer = setTimeout(() => {
          devRestartTimer = null;
          if (!isShuttingDown && !devServer) {
            startDevServer();
          }
        }, 700);
      }
    }
  });
}

async function restartDevServer() {
  if (devServer?.pid) {
    log("WatchFlow", "Restarting dev server");
    await stopProcessTree(devServer.pid);
    devServer = null;
  }
  startDevServer();
}

async function runBuildPipeline(triggerPath) {
  if (isBuilding) {
    rerunRequested = true;
    return;
  }

  isBuilding = true;
  rerunRequested = false;
  ignoreUntil = Date.now() + SELF_WRITE_GUARD_MS;
  log("WatchFlow", "Change detected at " + triggerPath);
  log("WatchFlow", "Running version bump + build");
  log("WatchFlow", "Build version before bump: " + readBuildVersion());

  const bumpCode = await runCommand(nodeCmd, [versionBumpScript]);
  if (bumpCode !== 0) {
    log("WatchFlow", "Version bump failed, build skipped");
    isBuilding = false;
    if (rerunRequested) {
      rerunRequested = false;
      await runBuildPipeline("queued-change");
    }
    return;
  }
  log("WatchFlow", "Expected build version: " + readBuildVersion());

  const buildCode = await runCommand(nodeCmd, [viteCli, "build"]);
  if (buildCode === 0) {
    log("WatchFlow", "Build succeeded at version " + readBuildVersion());
    await restartDevServer();
  } else {
    log(
      "WatchFlow",
      "Build failed at version " + readBuildVersion() + ", dev server left unchanged",
    );
  }

  isBuilding = false;
  if (rerunRequested) {
    rerunRequested = false;
    await runBuildPipeline("queued-change");
  }
}

function scheduleBuild(absolutePath) {
  const now = Date.now();
  if (now < ignoreUntil) {
    return;
  }
  if (!shouldWatchFile(absolutePath)) {
    return;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBuildPipeline(toRelative(absolutePath)).catch((error) => {
      log("WatchFlow", "Build pipeline error: " + String(error));
    });
  }, DEBOUNCE_MS);
}

function initWatchers() {
  for (const relativeDir of WATCH_DIRS) {
    const root = path.join(PROJECT_ROOT, relativeDir);
    const dirs = collectDirs(root);
    for (const dir of dirs) {
      const watcher = fs.watch(dir, (eventType, filename) => {
        if (!filename) {
          return;
        }
        const targetPath = path.join(dir, filename.toString());
        const normalized = path.normalize(targetPath);
        if (normalized.includes(path.sep + "node_modules" + path.sep)) {
          return;
        }
        if (eventType === "rename" && fs.existsSync(targetPath)) {
          try {
            if (fs.statSync(targetPath).isDirectory() && !shouldSkipDir(targetPath)) {
              for (const nestedDir of collectDirs(targetPath)) {
                const nestedWatcher = fs.watch(nestedDir, (ev, file) => {
                  if (!file) {
                    return;
                  }
                  scheduleBuild(path.join(nestedDir, file.toString()));
                });
                watchers.push(nestedWatcher);
              }
            }
          } catch {
            // Ignore race conditions where files disappear.
          }
        }
        scheduleBuild(targetPath);
      });
      watchers.push(watcher);
    }
  }

  for (const file of WATCH_FILES) {
    const filePath = path.join(PROJECT_ROOT, file);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const watcher = fs.watch(filePath, () => {
      scheduleBuild(filePath);
    });
    watchers.push(watcher);
  }

  log("WatchFlow", "Watching source files for testable changes");
}

async function shutdown() {
  isShuttingDown = true;
  for (const watcher of watchers) {
    watcher.close();
  }
  watchers.length = 0;
  if (devRestartTimer) {
    clearTimeout(devRestartTimer);
    devRestartTimer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (devServer?.pid) {
    await stopProcessTree(devServer.pid);
  }
  devServer = null;
  releaseLock();
}

async function main() {
  log("WatchFlow", "Booting watch workflow");
  if (!acquireLock()) {
    process.exit(0);
    return;
  }
  log("WatchFlow", "Current build version: " + readBuildVersion());
  startDevServer();
  initWatchers();
}

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

process.on("uncaughtException", (error) => {
  log("WatchFlow", "Uncaught exception: " + String(error));
});

main().catch((error) => {
  log("WatchFlow", "Fatal startup error: " + String(error));
  process.exit(1);
});
