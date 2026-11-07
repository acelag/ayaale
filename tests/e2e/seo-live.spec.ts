import { expect, test } from "@playwright/test";
test("canonical public metadata, verification and WebSite markup are server rendered", async ({
  page,
  request,
}) => {
  const source = await request.get("/", { headers: { "User-Agent": "Googlebot" } });
  expect(await source.text()).toContain(
    'name="google-site-verification" content="synthetic-search-console-verification"',
  );
  await page.goto("/?utm_source=newsletter&utm_medium=email&utm_campaign=weekly-newsletter");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://ayaale.com");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    "https://ayaale.com",
  );
  const data = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(JSON.parse(data[0])).toMatchObject({ "@type": "WebSite", url: "https://ayaale.com" });
  await page.goto("/?q=secret%40example.com&category=stays");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://ayaale.com");
  expect(await page.title()).not.toContain("secret");
});
test("active offers and verified profiles have accurate structured data and social metadata", async ({
  page,
}) => {
  await page.goto("/offers/fixture-coast-1?token=private#private");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://ayaale.com/offers/fixture-coast-1",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://ayaale.com/api/offers/fixture-coast-1/cover",
  );
  const data = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent())!,
  );
  expect(data[1].mainEntity).toMatchObject({
    "@type": "Offer",
    priceSpecification: { priceCurrency: "LKR", price: 18500, valueAddedTaxIncluded: false },
    seller: { name: "Fixture coast house" },
  });
  expect(JSON.stringify(data)).not.toMatch(/AggregateRating|Review|InStock|token=private/);
  await page.goto("/properties/fixture-coast-house");
  const business = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent())!,
  )[1];
  expect(business).toMatchObject({
    "@type": "LocalBusiness",
    name: "Fixture coast house",
    address: { addressCountry: "LK" },
  });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
});
test("private, unavailable and missing pages remain unindexed", async ({ page, request }) => {
  for (const path of [
    "/partner/sign-in",
    "/newsletter/confirm",
    "/offers/fixture-expired",
    "/offers/fixture-paused",
    "/offers/missing-offer",
    "/properties/missing-property",
  ]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  }
  const response = await request.get("/partner/sign-in");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
});
test("sitemap enumerates public canonical URLs and robots allows their images", async ({
  request,
}) => {
  const redirect = await request.get("/offers/fixture-coast-1?utm_source=newsletter", {
    headers: { Host: "www.ayaale.com" },
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe(
    "https://ayaale.com/offers/fixture-coast-1?utm_source=newsletter",
  );
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("application/xml");
  const xml = await sitemap.text();
  expect(xml).toContain("https://ayaale.com/offers/fixture-coast-15");
  expect(xml).toContain("https://ayaale.com/properties/fixture-coast-house");
  expect(xml.match(/<loc>/g)).toHaveLength(17);
  expect(xml).not.toMatch(/partner|fixture-expired|fixture-paused|utm_|lastmod/);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap: https://ayaale.com/sitemap.xml");
  expect(robots).toContain("Allow: /api/offers/*/cover$");
  expect(robots).not.toContain("Disallow: /partner");
  expect((await request.get("/api/offers/fixture-coast-1/cover")).headers()["x-robots-tag"]).toBe(
    "index",
  );
});
