import { expect, test } from "@playwright/test";
test("development stays unindexed and never advertises a sitemap", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://ayaale.com");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /");
  expect(await robots.text()).not.toContain("Sitemap:");
  expect((await request.get("/sitemap.xml")).status()).toBe(404);
  expect(
    (await request.get("/api/offers/fixture-coast-1/cover")).headers()["x-robots-tag"],
  ).toContain("noindex");
  await expect(page.locator('meta[name="google-site-verification"]')).toHaveCount(0);
});
