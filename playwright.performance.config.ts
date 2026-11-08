import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/performance.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  outputDir: "test-results/performance",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/performance", open: "never" }]],
  projects: [{ name: "mobile-performance", use: { ...devices["Pixel 7"] } }],
});
