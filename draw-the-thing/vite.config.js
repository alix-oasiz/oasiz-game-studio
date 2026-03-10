import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  server: {
    port: 5179,
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
});


