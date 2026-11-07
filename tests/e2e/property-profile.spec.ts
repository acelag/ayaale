import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("offer details link to a verified property with amenities, directions and no active offers", async ({
  page,
}) => {
  await page.goto("/offers/fixture-coast-1");
  await page.getByRole("link", { name: "View property profile" }).click();
  await expect(page).toHaveURL(/\/properties\/fixture-coast-house$/);
  await expect(page).toHaveTitle(/Fixture coast house/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fixture coast house");
  await expect(page.getByText("Verified by Ayaale")).toBeVisible();
  await expect(page.getByRole("link", { name: "Get directions" })).toHaveAttribute(
    "href",
    "https://maps.google.com/?q=Galle",
  );
  await expect(page.getByRole("link", { name: "Google reviews" })).toHaveAttribute(
    "href",
    "https://g.page/r/fixture/review",
  );
  await expect(page.getByText("There are no active offers at this property.")).toBeVisible();
  await expect(page.getByText("Outdoor shower")).toBeHidden();
  await page.getByText("View all amenities").click();
  await expect(page.getByText("Outdoor shower")).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});

test("assigned public photos load and unknown property routes return 404", async ({
  page,
  request,
}) => {
  await page.goto("/properties/fixture-coast-house");
  const cover = page.getByRole("img", { name: "Garden entrance" });
  await expect
    .poll(() => cover.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  const gallery = await request.get("/api/public-properties/fixture-coast-house/photos/2");
  expect(gallery.status()).toBe(200);
  expect(gallery.headers()["cache-control"]).toBe("no-store");
  expect((await request.get("/api/public-properties/fixture-coast-house/photos/3")).status()).toBe(
    404,
  );
  expect((await request.get("/properties/missing-property")).status()).toBe(404);
});
