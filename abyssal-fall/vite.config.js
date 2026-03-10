import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HITBOX_FILE_PATH = path.resolve(__dirname, "public/hitbox-colliders.json");

function hitboxProjectSavePlugin() {
  return {
    name: "hitbox-project-save",
    configureServer(server) {
      server.middlewares.use("/__hitbox/save", async (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });

        req.on("end", async () => {
          try {
            const parsed = JSON.parse(body);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, error: "Payload must be an object" }));
              return;
            }

            const serialized = JSON.stringify(parsed, null, 2) + "\n";
            await writeFile(HITBOX_FILE_PATH, serialized, "utf8");
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, path: "public/hitbox-colliders.json" }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const plugins = [];
  if (command === "build") plugins.push(viteSingleFile());
  if (command === "serve") plugins.push(hitboxProjectSavePlugin());

  return {
  // Single-file packaging is only needed for production builds.
  plugins,
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
  };
});

