import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/__dev__/setupTests.ts"],
    include: [
      "src/__dev__/main/quality/**/*.test.{ts,tsx}",
      "src/__dev__/main/integration/**/*.test.{ts,tsx}",
      "src/__dev__/main/playground/**/*.test.{ts,tsx}",
    ],
    testTimeout: 7200000, // 2 hours
    fileParallelism: false, // Prevent files from running in parallel
    maxWorkers: 1, // Restrict to single worker
    sequence: {
      concurrent: false, // Run tests sequentially within file
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@lib": path.resolve(__dirname, "./src/lib"),
    },
  },
});
