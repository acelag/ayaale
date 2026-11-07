import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const servers = Array.isArray(base.webServer) ? base.webServer : [];
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/seo-live.spec.ts",
  webServer: servers.map((server, index) =>
    index === 1
      ? {
          ...server,
          env: {
            ...server.env,
            APP_ENV: "production",
            NEXT_PUBLIC_SITE_URL: "https://ayaale.com",
            SEO_INDEXING_ENABLED: "true",
            GOOGLE_SITE_VERIFICATION: "synthetic-search-console-verification",
            OFFER_VIEW_TRACKING: "on",
          },
        }
      : server,
  ),
});
