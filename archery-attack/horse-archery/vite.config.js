import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ command }) => ({
  plugins: command === "build" ? [viteSingleFile()] : [],
  build: {
    target: "esnext",
    minify: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  logLevel: command === "build" ? "warn" : "info",
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
}));

