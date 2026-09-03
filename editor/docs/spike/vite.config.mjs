// A4 spike demo 专用 vite 配置——与生产 vite.config.ts 完全独立:
// 独立 root(docs/spike)、独立端口(5199)、build 输出 dist-spike(不进 editor_static)。
// 启动:在 editor/ 目录执行
//   corepack pnpm exec vite --config docs/spike/vite.config.mjs
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
  },
  base: "./",
  build: {
    outDir: "dist-spike",
  },
  optimizeDeps: {
    include: ["@univerjs/core", "@univerjs/preset-sheets-core"],
  },
});
