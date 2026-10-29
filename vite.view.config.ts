// Builds the view as ONE classic IIFE script plus one stylesheet in dist/view/.
// scripts/embed-view.ts then inlines both into view.html (no module script, no external assets).
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/view",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: "view/main.tsx",
      formats: ["iife"],
      name: "ApprovalDeskView",
      fileName: () => "view.js",
      cssFileName: "view",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
