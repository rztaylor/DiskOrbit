import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  outputDir: "../.cache/playwright-results",
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
});

