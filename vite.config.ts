// Bridge Lab: a static page (dist/) that runs the real server in the page over the SDK
// in-memory transport and renders the exact view resource in a sandboxed iframe.
// Build the view first (npm run build:view): the Lab imports server/generated/view-html.ts.
// No fixed dev port: before publishing one, claim a port with the agent-ports ledger.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // dist/view (built first) must survive; dist/server is built after.
    emptyOutDir: false,
  },
});
