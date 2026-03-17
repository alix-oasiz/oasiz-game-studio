import fs from "node:fs";
import path from "node:path";
import {
  killExistingDevServer,
  loadConfig,
  log,
  parseCliArgs,
  spawnDevServer,
} from "./lib.mjs";

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const config = loadConfig(options.configPath);

  log("DevRestart", "Stopping existing dev server on " + config.host + ":" + config.port);
  await killExistingDevServer(config);

  log("DevRestart", "Starting dev server on " + config.host + ":" + config.port);
  if (options.background) {
    const logPath = path.resolve(config.projectRoot, options.logFile);
    const output = fs.openSync(logPath, "a");
    spawnDevServer(config, {
      detached: true,
      stdio: ["ignore", output, output],
    });
    log("DevRestart", "Dev server running in background, log file: " + path.basename(logPath));
    return;
  }

  const child = spawnDevServer(config);
  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  log("DevRestart", String(error));
  process.exit(1);
});
