import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const coast = "/partner/properties/10000000-0000-4000-8000-000000000001";
const hills = "/partner/properties/10000000-0000-4000-8000-000000000002";

test("property analytics supports assigned partners, range controls and accessible trend data", async ({
  page,
}, testInfo) => {
  const staff = testInfo.project.use.isMobile;
  await page.goto("/partner/sign-in");
  await page
    .getByLabel("Email")
    .fill(staff ? "fixture-staff@example.invalid" : "fixture-owner@example.invalid");
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
  await page.goto(coast);
  await page.getByRole("link", { name: "Property analytics" }).click();
  await expect(page.getByRole("heading", { name: "Activity in the last 30 days" })).toBeVisible();
  await page.getByRole("link", { name: "7 days", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Activity in the last 7 days" })).toBeVisible();
  await page.getByText("View daily data", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Daily activity data" }).getByRole("row"),
  ).toHaveCount(8);
  await expect(
    page
      .getByRole("region", { name: "Offer performance data" })
      .getByRole("cell", { name: "26.7%" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monthly comparison" })).toBeVisible();
  const sources = page.getByRole("region", { name: "Recorded view sources" });
  await expect(sources).toContainText("Newsletter");
  await expect(sources).toContainText("Unknown");
  await expect(sources).toContainText("66.7%");
  expect(
    (
      await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations.map(({ id }) => id),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );

  if (staff) {
    expect((await page.goto(`${hills}/analytics`))?.status()).toBe(404);
  } else {
    await page.getByLabel("Switch property").selectOption(hills.split("/").at(-1)!);
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${hills}/analytics$`));
    await expect(page.getByText("Fixture Hills · Galle", { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Offer performance data" })
        .getByRole("cell", { name: "50%" }),
    ).toBeVisible();
  }
});

test("offer views reuse a tab's token after refresh and reject cross-origin writes", async ({
  page,
  request,
}) => {
  await page.route("**/api/offers/*/view", async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), "user-agent": "Mozilla/5.0 AyaaleBrowser" },
    });
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "webdriver", { get: () => false }),
  );
  const isView = (response: import("@playwright/test").Response) =>
    response.url().endsWith("/fixture-coast-1/view");
  const first = page.waitForResponse(isView);
  await page.goto("/offers/fixture-coast-1");
  const recorded = await first;
  expect(recorded.status()).toBe(204);
  const token = recorded.request().headers()["x-offer-view"];
  expect(token).toMatch(/^[0-9a-f-]{36}$/i);
  const second = page.waitForResponse(isView);
  await page.reload();
  expect((await second).request().headers()["x-offer-view"]).toBe(token);

  const denied = await request.post("/api/offers/fixture-coast-1/view", {
    headers: { origin: "https://example.invalid", "x-offer-view": token },
  });
  expect(denied.status()).toBe(403);

  const ignored = await request.post("/api/offers/fixture-paused/view", {
    headers: {
      origin: "http://127.0.0.1:3100",
      "user-agent": "FixtureBot",
      "x-offer-view": token,
    },
  });
  expect(ignored.status()).toBe(204);
});

test("view attribution sends only a bounded category with current consent", async ({ page }) => {
  await page.route(/https:\/\/.*(?:googletagmanager|google-analytics)\.com\//, (route) =>
    route.fulfill({ contentType: "text/javascript", body: "/* synthetic analytics */" }),
  );
  await page.route("**/api/offers/*/view", (route) =>
    route.continue({
      headers: { ...route.request().headers(), "user-agent": "Mozilla/5.0 AyaaleBrowser" },
    }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "ayaale.analytics.v1",
      JSON.stringify({ choice: "allow", time: Date.now() }),
    ),
  );
  await page.goto("/?utm_source=newsletter&utm_medium=email&utm_campaign=weekly-newsletter");
  const landingView = page.waitForRequest((request) =>
    request.url().includes("/api/offers/fixture-coast-1/view"),
  );
  await page.getByRole("link", { name: "Fixture coast stay 1", exact: true }).first().click();
  expect((await landingView).headers()["x-offer-source"]).toBe("newsletter");
  const url =
    "/offers/fixture-coast-1?utm_source=facebook&utm_medium=social&utm_campaign=social-launch&token=private%40example.com";
  const view = () =>
    page.waitForRequest((request) => request.url().includes("/api/offers/fixture-coast-1/view"));
  let pending = view();
  await page.goto(url);
  const attributed = await pending;
  expect(attributed.headers()["x-offer-source"]).toBe("social");
  expect(attributed.headers()["referer"]).toBeUndefined();
  expect(attributed.postData()).toBeNull();
  await page.evaluate(() =>
    localStorage.setItem(
      "ayaale.analytics.v1",
      JSON.stringify({ choice: "decline", time: Date.now() }),
    ),
  );
  pending = view();
  await page.reload();
  expect((await pending).headers()["x-offer-source"]).toBe("unknown");
  await page.evaluate(() =>
    localStorage.setItem(
      "ayaale.analytics.v1",
      JSON.stringify({ choice: "allow", time: Date.now() }),
    ),
  );
  pending = view();
  await page.goto(`${url}&utm_source=facebook`);
  expect((await pending).headers()["x-offer-source"]).toBe("unknown");
});
