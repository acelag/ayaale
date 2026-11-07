import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("discovery links to approved details with separate dates, price and cover", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Fixture coast stay 1", exact: true }).click();
  await expect(page).toHaveURL(/\/offers\/fixture-coast-1$/);
  await expect(page).toHaveTitle(/Fixture coast stay 1/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fixture coast stay 1");
  await expect(page.getByRole("region", { name: "Offer price" })).toContainText("LKR 18,500");
  await expect(page.getByRole("region", { name: "Offer price" })).toContainText("per night");
  await expect(page.getByRole("region", { name: "Offer dates" })).toContainText(
    "Publication window",
  );
  await expect(page.getByRole("region", { name: "Offer dates" })).toContainText(
    "Eligible stay dates",
  );
  await expect(page.locator('time[datetime="2026-11-20"]')).toBeVisible();
  await expect(page.getByRole("region", { name: "Terms and conditions" })).toContainText(
    "Additional taxes apply.",
  );
  await expect(page.getByText("Garden room")).toBeVisible();
  await expect(page.getByRole("link", { name: "Get directions" })).toHaveAttribute(
    "href",
    "https://maps.google.com/?q=Galle",
  );
  const { violations } = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  const photo = page.getByRole("img", { name: "Cover photo for Fixture coast stay 1" });
  await expect(photo).toHaveAttribute("src", "/api/offers/fixture-coast-1/cover");
  await expect
    .poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});

test("unknown offers return 404 and missing covers have a labeled fallback", async ({
  request,
  page,
}) => {
  expect((await request.get("/offers/missing-offer")).status()).toBe(404);
  expect((await request.get("/api/offers/missing-offer/cover")).status()).toBe(404);
  const cover = await request.get("/api/offers/fixture-coast-1/cover");
  expect(cover.status()).toBe(200);
  expect(cover.headers()["cache-control"]).toBe("no-store");
  expect(cover.headers()["content-type"]).toBe("image/webp");
  await page.goto("/offers/fixture-coast-2");
  await expect(page.getByText("Category illustration")).toBeVisible();
  await expect(page.getByText("Redemption dates", { exact: true })).toBeVisible();
  await expect(page.getByText("Eligible stay dates")).toHaveCount(0);
});

test("contact controls use approved numbers, track clicks and copy the offer URL", async ({
  page,
  baseURL,
}, testInfo) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .context()
    .route("https://wa.me/**", (route) => route.fulfill({ body: "WhatsApp fixture" }));
  await page.goto("/offers/fixture-coast-1");
  const whatsapp = page.getByRole("link", { name: "WhatsApp", exact: true });
  const href = new URL((await whatsapp.getAttribute("href"))!);
  expect(href.origin + href.pathname).toBe("https://wa.me/94777654321");
  expect(href.searchParams.get("text")).toContain("Fixture coast stay 1");
  expect(href.searchParams.get("text")).toContain(`${baseURL}/offers/fixture-coast-1`);
  await expect(page.getByRole("link", { name: "Call", exact: true })).toHaveAttribute(
    "href",
    "tel:+94771234567",
  );

  if (testInfo.project.use.isMobile) {
    const bar = await page.locator(".offer-contact-bar").boundingBox();
    expect(bar).not.toBeNull();
    expect(bar!.y + bar!.height).toBeCloseTo(await page.evaluate(() => innerHeight), 0);
  }

  const tracked = page.waitForResponse((response) =>
    response.url().endsWith("/api/offers/fixture-coast-1/contact"),
  );
  const popup = page.waitForEvent("popup");
  await whatsapp.click();
  expect((await tracked).status()).toBe(204);
  expect((await tracked).request().headers()["x-contact-channel"]).toBe("whatsapp");
  await (await popup).close();

  await page.getByRole("button", { name: "Copy Link" }).click();
  await expect(
    page.getByRole("region", { name: "Offer actions" }).getByRole("status"),
  ).toContainText("Offer link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${baseURL}/offers/fixture-coast-1`,
  );
});

test("contact events reject cross-origin requests and missing channels are absent", async ({
  request,
  page,
}) => {
  const response = await request.post("/api/offers/fixture-coast-1/contact", {
    headers: {
      Origin: "https://external.invalid",
      "X-Contact-Channel": "whatsapp",
      "X-Contact-Event": "00000000-0000-4000-8000-000000000001",
    },
  });
  expect(response.status()).toBe(403);
  await page.goto("/offers/fixture-coast-2");
  await expect(page.getByRole("link", { name: "WhatsApp", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Call", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy Link" })).toBeVisible();
});

test("an expired link offers current alternatives without stale details or contact actions", async ({
  page,
  request,
}) => {
  const response = await page.goto("/offers/fixture-expired");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This offer has ended");
  await expect(page.getByText("Fixture former weekend")).toBeVisible();
  await expect(page.getByRole("region", { name: "Offer price" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Offer dates" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^(WhatsApp|Call)$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy Link" })).toHaveCount(0);
  expect((await request.get("/api/offers/fixture-expired/cover")).status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const { violations } = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.getByRole("link", { name: /Fixture coast stay 1/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fixture coast stay 1");
});

test("paused and unavailable links explain their state and offer a browse fallback", async ({
  page,
}) => {
  expect((await page.goto("/offers/fixture-paused"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This offer is paused");
  await expect(page.getByRole("region", { name: "Available offers" })).toBeVisible();

  expect((await page.goto("/offers/fixture-unavailable"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This offer is unavailable");
  await expect(page.getByText("There are no offers to suggest right now.")).toBeVisible();
  await page.getByRole("link", { name: "Browse all offers" }).click();
  await expect(page).toHaveURL(/\/#offers$/);
});
