import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  base: "./",
  build: {
    outDir: "../src/lumio_config/editor_static",
    emptyOutDir: true,
    sourcemap: false,
  },
  optimizeDeps: {
    include: [
      "@univerjs/core",
      "@univerjs/preset-sheets-core",
      "@univerjs/preset-sheets-filter",
      "@univerjs/preset-sheets-sort",
      "@univerjs/preset-sheets-data-validation",
      "@univerjs/preset-sheets-find-replace",
    ],
  },
});
