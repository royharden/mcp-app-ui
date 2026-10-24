// Bundles the stdio entry for Node: dist/server/stdio.js. Dependencies stay external.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "server/stdio.ts",
    outDir: "dist/server",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: {
      output: { format: "es", entryFileNames: "stdio.js" },
    },
  },
});
