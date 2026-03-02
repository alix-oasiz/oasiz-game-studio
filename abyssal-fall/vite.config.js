import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ command }) => ({
  // Single-file packaging is only needed for production builds.
  plugins: command === "build" ? [viteSingleFile()] : [],
  server: {
    // WSL-mounted Windows paths (/mnt/c/...) can miss FS events without polling.
    watch: {
      usePolling: true,
      interval: 120,
    },
  },
  build: {
    target: "esnext",
    minify: true,
    // Ensure everything is inlined into a single file
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
}));

