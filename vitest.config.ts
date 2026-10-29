import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the active suites. Top-level tests/*.test.ts are the inactive legacy node:test files.
    include: [
      "tests/unit/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      "tests/harness/**/*.test.ts",
      "tests/security/**/*.test.ts",
    ],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20000,
  },
});
