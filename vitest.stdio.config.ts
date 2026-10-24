import { defineConfig } from "vitest/config";

// Requires `npm run build` first: spawns dist/server/stdio.js as a real subprocess.
export default defineConfig({
  test: {
    include: ["tests/stdio/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
  },
});
