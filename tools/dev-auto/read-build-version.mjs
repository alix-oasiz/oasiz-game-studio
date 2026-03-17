import { loadConfig, log, parseCliArgs, readBuildVersion } from "./lib.mjs";

try {
  const options = parseCliArgs(process.argv.slice(2));
  const config = loadConfig(options.configPath);
  log("BuildVersion", "Current BUILD_VERSION is " + readBuildVersion(config));
} catch (error) {
  log("BuildVersion", String(error));
  process.exit(1);
}
