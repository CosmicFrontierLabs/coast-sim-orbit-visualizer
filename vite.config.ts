import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "app",
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/viz-data": "http://127.0.0.1:8000",
      "/trajectory": "http://127.0.0.1:8000",
      "/data": "http://127.0.0.1:8000",
      "/model": "http://127.0.0.1:8000",
      "/textures": "http://127.0.0.1:8000",
    },
  },
  build: {
    outDir: "../orbit_visualizer/dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(repoRoot, "app/index.html"),
        plan_stats: resolve(repoRoot, "app/plan_stats.html"),
      },
    },
  },
});
