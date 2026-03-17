import { bumpBuildVersion, loadConfig, log, parseCliArgs } from "./lib.mjs";

try {
  const options = parseCliArgs(process.argv.slice(2));
  const config = loadConfig(options.configPath);
  const nextVersion = bumpBuildVersion(config);
  log("BuildVersion", "Updated BUILD_VERSION to " + nextVersion);
} catch (error) {
  log("BuildVersion", String(error));
  process.exit(1);
}
