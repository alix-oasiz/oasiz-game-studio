import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const APP_VERSION = process.env.npm_package_version || "0.0.0";

function createBuildTag() {
  const override = process.env.OASIZ_BUILD_TAG?.trim();
  if (override) {
    return override;
  }

  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate(),
  )}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
}

const APP_BUILD_TAG = createBuildTag();

export default defineConfig({
  plugins: [viteSingleFile()],
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD_TAG__: JSON.stringify(APP_BUILD_TAG),
  },
  build: {
    target: "esnext",
    minify: true,
    // Ensure everything bundleable is inlined into the generated HTML.
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  // Suppress warnings during build
  logLevel: "warn",
});
