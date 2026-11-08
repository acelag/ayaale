import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
const servers = Array.isArray(base.webServer) ? base.webServer : [];
export default defineConfig({
  ...base,
  testMatch: "**/full-journey.spec.ts",
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: { ...base.use, actionTimeout: 10_000, navigationTimeout: 20_000 },
  outputDir: "test-results/journey",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/journey", open: "never" }]],
  projects: [
    { name: "journey-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "journey-iphone-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: servers.map((server, index) =>
    index === 0
      ? {
          ...server,
          command: "node tests/e2e/journey-database-server.mjs",
          gracefulShutdown: { signal: "SIGTERM" as const, timeout: 10_000 },
        }
      : server,
  ),
});
