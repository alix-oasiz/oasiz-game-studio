import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

export default defineConfig({
  plugins: [viteSingleFile()],
  resolve: {
    alias: {
      "phaser-box2d": path.resolve("node_modules/phaser-box2d/dist/PhaserBox2D.js"),
    },
  },
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
  logLevel: "warn",
});
