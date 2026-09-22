import { createReadStream, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// Dev-only config: serve the frontend from local source (with HMR) while pulling
// the plan payload and spacecraft model straight from the public `cfl-models`
// S3 bucket referenced by cf-services. Textures are served from the local repo.
//
//   npx vite --config vite.config.s3.ts
//
// Nothing here is used by the production build (see vite.config.ts).

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const S3_BASE = "https://cfl-models.s3.us-west-2.amazonaws.com";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Serve repo-root textures/ at /textures/* (they live outside the Vite root).
function localTextures(): Plugin {
  return {
    name: "serve-local-textures",
    configureServer(server) {
      server.middlewares.use("/textures", (req, res, next) => {
        const rel = (req.url ?? "").split("?")[0].replace(/^\/+/, "");
        const file = resolve(repoRoot, "textures", rel);
        if (!file.startsWith(resolve(repoRoot, "textures")) || !existsSync(file)) {
          next();
          return;
        }
        const type = MIME[extname(file).toLowerCase()];
        if (type) res.setHeader("Content-Type", type);
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: "app",
  base: "./",
  plugins: [localTextures()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // Plan payload → the seeded latest/ Tamalpais export.
      "/viz-data": {
        target: S3_BASE,
        changeOrigin: true,
        rewrite: () => "/tamalpais/viz/latest/viz_data.json",
      },
      // Spacecraft CAD + config (model/spacecraft.glb, model/spacecraft.config.json).
      "/model": {
        target: S3_BASE,
        changeOrigin: true,
      },
    },
  },
});
