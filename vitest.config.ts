import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["scripts/test/**/*.ts", "src/**/*.test.ts", "public/js/**/*.test.js"],
    environment: "node",
  },
})
