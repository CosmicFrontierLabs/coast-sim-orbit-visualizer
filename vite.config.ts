import { defineConfig } from "vite";

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
  },
});
