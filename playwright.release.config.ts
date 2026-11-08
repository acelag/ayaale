import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// This matrix complements the full Chromium regression; it does not pretend
// desktop WebKit is the Safari application running on a physical iPhone.
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: [
    "**/foundation.spec.ts",
    "**/discovery.spec.ts",
    "**/property-profile.spec.ts",
    "**/partner-phone.spec.ts",
    "**/property-analytics.spec.ts",
    "**/release-quality.spec.ts",
  ],
  outputDir: "test-results/release",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/release", open: "never" }]],
  projects: [
    { name: "iphone-webkit", use: { ...devices["iPhone 13"], reducedMotion: "reduce" } },
    {
      name: "narrow-android-chromium",
      use: { ...devices["Pixel 7"], viewport: { width: 320, height: 740 } },
    },
  ],
});
