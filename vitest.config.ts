import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    passWithNoTests: true,
    reporters: ["verbose"],
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "html"],
    },
  },
});
