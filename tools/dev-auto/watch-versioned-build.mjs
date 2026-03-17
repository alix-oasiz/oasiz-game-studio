import fs from "node:fs";
import path from "node:path";
import {
  acquireLock,
  bumpBuildVersion,
  collectDirs,
  loadConfig,
  log,
  parseCliArgs,
  readBuildVersion,
  releaseLock,
  runCommand,
  shouldSkipDir,
  shouldWatchFile,
  spawnDevServer,
  stopProcessTree,
  toRelative,
} from "./lib.mjs";

const DEBOUNCE_MS = 450;
const SELF_WRITE_GUARD_MS = 2000;

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const config = loadConfig(options.configPath);
  const watchers = [];
  let debounceTimer = null;
  let ignoreUntil = 0;
  let isBuilding = false;
  let rerunRequested = false;
  let devServer = null;
  let isShuttingDown = false;
  let devRestartTimer = null;

  function logBuildVersion(context) {
    log("BuildVersion", context + " " + readBuildVersion(config));
  }

  function scheduleBuild(absolutePath) {
    if (Date.now() < ignoreUntil) {
      return;
    }
    if (!shouldWatchFile(config, absolutePath)) {
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runBuildPipeline(toRelative(config.projectRoot, absolutePath)).catch((error) => {
        log(config.logPrefix, "Build pipeline error: " + String(error));
      });
    }, DEBOUNCE_MS);
  }

  function startDevServer() {
    if (devServer) {
      return;
    }
    log(config.logPrefix, "Starting dev server on http://" + config.host + ":" + config.port + "/");
    devServer = spawnDevServer(config);
    devServer.on("exit", (code, signal) => {
      const hadServer = devServer !== null;
      devServer = null;
      if (!isShuttingDown && hadServer) {
        log(
          config.logPrefix,
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
      log(config.logPrefix, "Restarting dev server");
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
    log(config.logPrefix, "Change detected at " + triggerPath);
    log(config.logPrefix, "Running version bump + build");
    logBuildVersion("Before bump:");

    const nextVersion = bumpBuildVersion(config);
    log("BuildVersion", "Updated BUILD_VERSION to " + nextVersion);
    logBuildVersion("After bump:");

    const buildCode = await runCommand(config, config.buildCommand);
    if (buildCode === 0) {
      logBuildVersion("Build succeeded at version:");
      await restartDevServer();
    } else {
      logBuildVersion("Build failed at version:");
      log(config.logPrefix, "Dev server left unchanged after failed build");
    }

    isBuilding = false;
    if (rerunRequested) {
      rerunRequested = false;
      await runBuildPipeline("queued-change");
    }
  }

  function initWatchers() {
    for (const relativeDir of config.watchDirs) {
      const root = path.join(config.projectRoot, relativeDir);
      const dirs = collectDirs(config, root);
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
              if (fs.statSync(targetPath).isDirectory() && !shouldSkipDir(config, targetPath)) {
                for (const nestedDir of collectDirs(config, targetPath)) {
                  const nestedWatcher = fs.watch(nestedDir, (nestedEventType, nestedFile) => {
                    if (!nestedFile || nestedEventType === "rename" && !fs.existsSync(path.join(nestedDir, nestedFile.toString()))) {
                      return;
                    }
                    scheduleBuild(path.join(nestedDir, nestedFile.toString()));
                  });
                  watchers.push(nestedWatcher);
                }
              }
            } catch {
              // Ignore transient rename races.
            }
          }
          scheduleBuild(targetPath);
        });
        watchers.push(watcher);
      }
    }

    for (const file of config.watchFiles) {
      const filePath = path.join(config.projectRoot, file);
      if (!fs.existsSync(filePath)) {
        continue;
      }
      const watcher = fs.watch(filePath, () => {
        scheduleBuild(filePath);
      });
      watchers.push(watcher);
    }

    log(config.logPrefix, "Watching source files for testable changes");
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
    releaseLock(config);
  }

  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  process.on("uncaughtException", (error) => {
    log(config.logPrefix, "Uncaught exception: " + String(error));
  });

  log(config.logPrefix, "Booting watch workflow");
  if (!acquireLock(config)) {
    process.exit(0);
    return;
  }
  logBuildVersion("Current build version:");
  startDevServer();
  initWatchers();
}

main().catch((error) => {
  log("WatchFlow", "Fatal startup error: " + String(error));
  process.exit(1);
});
