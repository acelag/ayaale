import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("Chromium accepts Ayaale's manifest and reports no installability errors", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);

  const session = await page.context().newCDPSession(page);
  try {
    const { url, errors } = await session.send("Page.getAppManifest");
    expect(new URL(url).pathname).toBe("/manifest.webmanifest");
    expect(errors).toEqual([]);
    const { installabilityErrors } = await session.send("Page.getInstallabilityErrors");
    expect(installabilityErrors).toEqual([]);
  } finally {
    await session.detach();
  }
});

test("install assets load at their declared sizes and launch the public home page", async ({
  page,
  request,
}) => {
  await page.goto("/offers/fixture-coast-1");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );

  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: "/",
    name: "Ayaale",
    short_name: "Ayaale",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    manifest.theme_color,
  );

  for (const size of [192, 512]) {
    const icon = manifest.icons.find(
      (icon: { sizes: string; type: string; purpose: string }) =>
        icon.sizes === `${size}x${size}` && icon.type === "image/png",
    );
    expect(icon?.purpose.split(" ")).toEqual(expect.arrayContaining(["any", "maskable"]));
    expect(icon.src).toMatch(/^\/icons\//);
    const image = await request.get(icon.src);
    expect(image.ok()).toBe(true);
    expect(image.headers()["content-type"]).toContain("image/png");
    expect(await sharp(await image.body()).metadata()).toMatchObject({
      format: "png",
      width: size,
      height: size,
      hasAlpha: false,
    });
  }

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("type", "image/svg+xml");
  const appleIcon = page.locator('link[rel="apple-touch-icon"]');
  await expect(appleIcon).toHaveAttribute("sizes", "180x180");
  const appleIconUrl = await appleIcon.getAttribute("href");
  expect(appleIconUrl).toMatch(/^\/apple-icon\.png/);
  const appleImage = await request.get(appleIconUrl!);
  expect(appleImage.ok()).toBe(true);
  expect(await sharp(await appleImage.body()).metadata()).toMatchObject({
    format: "png",
    width: 180,
    height: 180,
  });

  expect((await page.goto(manifest.start_url))?.ok()).toBe(true);
  await expect(page.getByRole("link", { name: "Ayaale home" })).toBeVisible();
});
