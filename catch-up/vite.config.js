import { defineConfig } from "vite";
import path from "path";

export default defineConfig(() => {
  const buildStamp = process.env.BUILD_STAMP || Date.now().toString(36);

  return {
    base: "./",
    resolve: {
      alias: {
        "phaser-box2d": path.resolve("node_modules/phaser-box2d/dist/PhaserBox2D.js"),
      },
    },
    logLevel: "warning",
    build: {
      minify: "terser",
      terserOptions: {
        compress: {
          passes: 2,
        },
        mangle: true,
        format: {
          comments: false,
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            phaser: ["phaser"],
          },
          entryFileNames: `assets/[name]-${buildStamp}.js`,
          chunkFileNames: `assets/[name]-${buildStamp}.js`,
          assetFileNames: `assets/[name]-${buildStamp}[extname]`,
        },
      },
    },
  };
});
