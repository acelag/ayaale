import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "manual-practice.spec.ts",
  workers: 1,
  timeout: 60_000,
  outputDir: "test-results/manual-demo",
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3200", actionTimeout: 15_000 },
  projects: [
    { name: "practice-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "practice-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run demo:local",
    url: "http://127.0.0.1:3200/api/health",
    timeout: 60_000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
  },
});
