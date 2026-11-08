import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const servers = Array.isArray(base.webServer) ? base.webServer : [];
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/prelaunch.spec.ts",
  workers: 1,
  outputDir: "test-results/prelaunch",
  reporter: [["list"]],
  webServer: servers.map((server, index) =>
    index === 1
      ? {
          ...server,
          env: {
            ...server.env,
            PRELAUNCH_ENABLED: "true",
            PRELAUNCH_ACCESS_CODE: "synthetic-preview-code-12345",
          },
        }
      : server,
  ),
});
