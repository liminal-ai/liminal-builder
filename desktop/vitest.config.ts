import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer/src"),
      "@server": resolve(__dirname, "../server"),
      "@shared": resolve(__dirname, "../shared"),
    },
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environmentMatchGlobs: [["src/renderer/**/*", "jsdom"]],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
