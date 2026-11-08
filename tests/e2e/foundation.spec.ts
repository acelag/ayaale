import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public content is server-rendered and unfinished content remains noindex", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("look forward to.");
  expect(html).toContain("Fixture coast stay 1");
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
});

test("health exposes only liveness and rejects unsupported writes", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  expect(health.headers()["cache-control"]).toBe("no-store");
  expect(health.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect((await request.post("/api/health")).status()).toBe(405);
});

test("keyboard users can skip to main content and follow the page link", async ({
  page,
  browserName,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  // WebKit on macOS uses Option-Tab to include links in keyboard navigation.
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
  );
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const headingBox = await page.getByRole("heading", { level: 1 }).boundingBox();
  const headerBox = await page.locator("header").boundingBox();
  expect(headingBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
  );
  const about = page.getByRole("link", { name: "Explore offers", exact: true });
  await expect(about).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#offers$/);
  await expect(page.getByRole("heading", { name: "Find your next little escape" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("layout reflows without horizontal scrolling and keeps touch targets usable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const size = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(size.content).toBeLessThanOrEqual(size.viewport);
  const target = await page
    .getByRole("link", { name: "Explore offers", exact: true })
    .boundingBox();
  expect(target).not.toBeNull();
  expect(target!.height).toBeGreaterThanOrEqual(44);
  expect(target!.width).toBeGreaterThanOrEqual(44);
});

test("foundation has no detectable WCAG A/AA accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("missing routes return a genuine 404", async ({ request }) => {
  expect((await request.get("/this-route-does-not-exist")).status()).toBe(404);
});
