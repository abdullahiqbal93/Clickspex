import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI === undefined ? 0 : 2,
  forbidOnly: process.env.CI !== undefined,
  reporter: [["list"]],
});
