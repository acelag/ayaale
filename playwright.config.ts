import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/chromium",
  fullyParallel: true,
  testIgnore: [
    "**/seo-live.spec.ts",
    "**/performance.spec.ts",
    "**/release-quality.spec.ts",
    "**/full-journey.spec.ts",
    "**/manual-practice.spec.ts",
    "**/prelaunch.spec.ts",
  ],
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 30_000,
  globalTimeout: 10 * 60 * 1000,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/chromium", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "node tests/e2e/discovery-fixture-server.mjs",
      url: "http://127.0.0.1:3101/ready",
      reuseExistingServer: false,
    },
    {
      command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/api/health",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_ANALYTICS_ENABLED: "true",
        NEXT_PUBLIC_GA4_MEASUREMENT_ID: "G-TEST049AAA",
        NEXT_PUBLIC_ANALYTICS_PRIVACY_URL: "https://example.invalid/privacy",
        APP_ENV: "development",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-test-key",
        SUPABASE_SECRET_KEY: "synthetic-service-key-for-tests",
        NEWSLETTER_SIGNUP_ENABLED: "true",
        NEWSLETTER_PRIVACY_VERSION: "fixture-privacy-v1",
        NEWSLETTER_PRIVACY_URL: "https://example.invalid/privacy",
        NEWSLETTER_SENDER_DETAILS: "Synthetic test sender",
        TRANSACTIONAL_EMAIL_FROM: "Ayaale <newsletter@example.invalid>",
        RESEND_API_KEY: "re_synthetic_test_key",
      },
    },
  ],
});
