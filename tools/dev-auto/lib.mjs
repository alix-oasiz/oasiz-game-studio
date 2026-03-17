import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_WATCH_EXTENSIONS = [
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
];

const DEFAULT_SKIP_DIRS = [
  "node_modules",
  "dist",
  ".git",
  "test-results",
  "screenshots",
];

export function parseCliArgs(argv) {
  const options = {
    configPath: "dev-auto.config.json",
    background: false,
    logFile: "dev.log",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config") {
      options.configPath = argv[index + 1] ?? options.configPath;
      index += 1;
      continue;
    }
    if (value === "--background") {
      options.background = true;
      continue;
    }
    if (value === "--log-file") {
      options.logFile = argv[index + 1] ?? options.logFile;
      index += 1;
    }
  }

  return options;
}

export function loadConfig(configPath) {
  const resolvedConfigPath = path.resolve(configPath);
  const projectRoot = path.dirname(resolvedConfigPath);
  const raw = fs.readFileSync(resolvedConfigPath, "utf8");
  const parsed = JSON.parse(raw);
  const host = String(parsed.host ?? "127.0.0.1");
  const port = String(parsed.port ?? "5173");
  const versionFile = path.resolve(projectRoot, parsed.versionFile ?? "src/main.ts");
  const watchDirs = Array.isArray(parsed.watchDirs) ? parsed.watchDirs : ["src", "public"];
  const watchFiles = Array.isArray(parsed.watchFiles)
    ? parsed.watchFiles
    : ["index.html", "vite.config.js", "tsconfig.json"];
  const watchExtensions = new Set(parsed.watchExtensions ?? DEFAULT_WATCH_EXTENSIONS);
  const skipDirs = new Set(parsed.skipDirs ?? DEFAULT_SKIP_DIRS);
  const lockFile = path.resolve(projectRoot, parsed.lockFile ?? ".dev-auto.lock");
  const nodeCmd = process.execPath;
  const viteCli = path.resolve(projectRoot, "node_modules", "vite", "bin", "vite.js");

  const config = {
    configPath: resolvedConfigPath,
    projectRoot,
    host,
    port,
    versionFile,
    versionRegex: parsed.versionRegex ?? 'const BUILD_VERSION = "(\\d+)\\.(\\d+)\\.(\\d+)";',
    watchDirs,
    watchFiles,
    watchExtensions,
    skipDirs,
    lockFile,
    logPrefix: parsed.logPrefix ?? "WatchFlow",
    buildCommand: parsed.buildCommand ?? ["$NODE", "$VITE", "build"],
    devCommand: parsed.devCommand ?? ["$NODE", "$VITE", "--host", host, "--port", port, "--strictPort"],
  };

  return config;
}

export function log(name, message) {
  console.log("[" + name + "]", message);
}

export function toRelative(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).replaceAll("\\", "/");
}

export function isPidRunning(pid) {
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

export function acquireLock(config) {
  try {
    if (fs.existsSync(config.lockFile)) {
      const raw = fs.readFileSync(config.lockFile, "utf8");
      const existing = JSON.parse(raw);
      const activePid = Number.parseInt(String(existing?.pid ?? ""), 10);
      if (isPidRunning(activePid)) {
        log(
          config.logPrefix,
          "Another dev:auto instance is already running (PID " + String(activePid) + "). Exiting.",
        );
        return false;
      }
    }
  } catch {
    // Replace unreadable or stale lockfiles.
  }

  fs.writeFileSync(
    config.lockFile,
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
  return true;
}

export function releaseLock(config) {
  try {
    if (!fs.existsSync(config.lockFile)) {
      return;
    }
    const raw = fs.readFileSync(config.lockFile, "utf8");
    const lock = JSON.parse(raw);
    if (Number(lock?.pid) === process.pid) {
      fs.unlinkSync(config.lockFile);
    }
  } catch {
    // Ignore cleanup errors on shutdown.
  }
}

export function resolveCommandTokens(config, values) {
  const viteCli = path.resolve(config.projectRoot, "node_modules", "vite", "bin", "vite.js");
  return values.map((value) => {
    if (value === "$NODE") {
      return process.execPath;
    }
    if (value === "$VITE") {
      return viteCli;
    }
    if (value === "$HOST") {
      return config.host;
    }
    if (value === "$PORT") {
      return config.port;
    }
    return value;
  });
}

export function runCommand(config, values, extraOptions = {}) {
  const resolved = resolveCommandTokens(config, values);
  const command = resolved[0];
  const args = resolved.slice(1);

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: config.projectRoot,
      stdio: extraOptions.stdio ?? "inherit",
      detached: extraOptions.detached ?? false,
      shell: false,
    });

    if (extraOptions.detached) {
      child.unref();
      resolve(0);
      return;
    }

    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export function parseVersionSource(config) {
  const source = fs.readFileSync(config.versionFile, "utf8");
  const regex = new RegExp(config.versionRegex);
  const match = source.match(regex);
  if (!match) {
    throw new Error("Could not find BUILD_VERSION in " + toRelative(config.projectRoot, config.versionFile));
  }
  const version = match.slice(1, 4).join(".");
  return {
    source,
    match,
    version,
  };
}

export function readBuildVersion(config) {
  return parseVersionSource(config).version;
}

export function bumpBuildVersion(config) {
  const parsed = parseVersionSource(config);
  const major = Number.parseInt(parsed.match[1], 10);
  const minor = Number.parseInt(parsed.match[2], 10);
  const patch = Number.parseInt(parsed.match[3], 10) + 1;
  const nextVersion = major + "." + minor + "." + patch;
  const nextSource = parsed.source.replace(parsed.version, nextVersion);
  fs.writeFileSync(config.versionFile, nextSource, "utf8");
  return nextVersion;
}

export function shouldWatchFile(config, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) {
    return config.watchFiles.includes(path.basename(filePath));
  }
  return config.watchExtensions.has(ext);
}

export function shouldSkipDir(config, dirPath) {
  return config.skipDirs.has(path.basename(dirPath));
}

export function collectDirs(config, rootDir) {
  const dirs = [];
  if (!fs.existsSync(rootDir)) {
    return dirs;
  }

  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || shouldSkipDir(config, current)) {
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

export function stopProcessTree(pid) {
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

export async function killExistingDevServer(config) {
  if (process.platform === "win32") {
    const script =
      "$hostMatch = '*vite*--host " +
      config.host +
      "*--port " +
      config.port +
      "*'; " +
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like $hostMatch } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }";
    await runCommand(
      config,
      ["powershell", "-NoProfile", "-Command", script],
      { stdio: "ignore" },
    );
    return;
  }

  const pattern = "vite --host " + config.host + " --port " + config.port;
  await runCommand(config, ["pkill", "-f", pattern], { stdio: "ignore" });
}

export function spawnDevServer(config, options = {}) {
  const resolved = resolveCommandTokens(config, config.devCommand);
  const command = resolved[0];
  const args = resolved.slice(1);
  const child = spawn(command, args, {
    cwd: config.projectRoot,
    stdio: options.stdio ?? "inherit",
    detached: options.detached ?? false,
    shell: false,
  });
  if (options.detached) {
    child.unref();
  }
  return child;
}
