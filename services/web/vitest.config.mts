import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Unit tests for plain frontend logic (no rendering), so the Node environment is enough.
export default defineConfig({
  // Resolves the "@/..." import alias from tsconfig.json paths
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});