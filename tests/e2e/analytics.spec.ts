import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const key = "ayaale.analytics.v1";
test.beforeEach(async ({ page }) => {
  // Never contact Google in tests. Exercise the queue the vendor consumes.
  await page.route(/https:\/\/.*(?:googletagmanager|google-analytics)\.com\//, (route) =>
    route.fulfill({ contentType: "text/javascript", body: "/* synthetic GA loader */" }),
  );
});

test("analytics is opt-in, sanitized, and revocable", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("googletagmanager.com")) requests.push(request.url());
  });
  await page.goto("/?q=private%40example.com&token=secret#private-fragment");
  await expect(page.getByRole("button", { name: "Allow analytics", exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Decline analytics", exact: true }).click();
  await expect(page.getByRole("button", { name: "Privacy choices", exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
  await page.getByRole("button", { name: "Allow analytics", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  const queue = await page.evaluate(() =>
    Array.from((window as Window & { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [], (args) =>
      Array.from(args),
    ),
  );
  const serialized = JSON.stringify(queue);
  expect(serialized).toContain('"page_view"');
  expect(serialized).toContain('"send_page_view":false');
  expect(serialized).toContain('"ad_storage":"denied"');
  for (const secret of ["private@example.com", "token=secret", "private-fragment"])
    expect(serialized).not.toContain(secret);
  await page
    .context()
    .addCookies([{ name: "_ga", value: "synthetic", url: "http://127.0.0.1:3100" }]);
  await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
  await page.getByRole("button", { name: "Decline analytics", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("ayaale-ga4"))))
    .toBe(false);
  expect((await page.context().cookies()).some((cookie) => cookie.name === "_ga")).toBe(false);
  expect(requests).toHaveLength(1);
});

test("saved consent never enables Google on account or token pages", async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ choice: "allow", time: Date.now() })),
    key,
  );
  for (const path of ["/partner/sign-in", "/newsletter/unsubscribe#opaque-private-token"]) {
    await page.goto(path);
    await expect(page.locator("#ayaale-ga4")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Analytics privacy choices" })).toHaveCount(0);
    expect(await page.evaluate(() => "dataLayer" in window)).toBe(false);
  }
});

test("browser privacy signals override previously granted consent", async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ choice: "allow", time: Date.now() }));
    Object.defineProperty(navigator, "globalPrivacyControl", { value: true });
  }, key);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Privacy choices", exact: true })).toBeVisible();
  expect(await page.evaluate(() => "dataLayer" in window)).toBe(false);
});

test("public-to-account navigation unloads the analytics document", async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ choice: "allow", time: Date.now() })),
    key,
  );
  await page.goto("/");
  await expect(page.locator("#ayaale-ga4")).toHaveCount(1);
  await page.getByRole("link", { name: "Create a partner account" }).click();
  await expect(page).toHaveURL(/\/partner\/signup/);
  await expect(page.locator("#ayaale-ga4")).toHaveCount(0);
  expect(await page.evaluate(() => "dataLayer" in window)).toBe(false);
});

test("public events contain fixed labels and the choice controls are accessible", async ({
  page,
}) => {
  await page.goto(
    "/offers/fixture-coast-1?utm_source=newsletter&utm_medium=email&utm_campaign=weekly-newsletter&token=secret",
  );
  const { violations } = await new AxeBuilder({ page })
    .include('[aria-label="Analytics privacy choices"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Allow analytics", exact: true }).click();
  await expect(page.locator("#ayaale-ga4")).toHaveCount(1);
  // Prevent external navigation while exercising the genuine click handlers.
  await page
    .getByRole("link", { name: "Call", exact: true })
    .evaluate((anchor) => anchor.addEventListener("click", (event) => event.preventDefault()));
  await page.getByRole("link", { name: "Call", exact: true }).click();
  const queue = await page.evaluate(() =>
    Array.from((window as Window & { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [], (args) =>
      Array.from(args),
    ),
  );
  const click = queue.find((args) => args[0] === "event" && args[1] === "contact_click");
  expect(click?.[2]).toMatchObject({
    channel: "call",
    page_type: "offer",
    page_location:
      "http://127.0.0.1:3100/offers?utm_source=newsletter&utm_medium=email&utm_campaign=weekly-newsletter",
  });
  expect(JSON.stringify(queue)).not.toMatch(/9477|fixture-coast|token=secret|Fixture coast/);
  expect(queue.filter((args) => args[1] === "page_view")).toHaveLength(1);
});

test("expired preferences and Do Not Track do not enable analytics", async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ choice: "allow", time: 1 }));
    Object.defineProperty(navigator, "doNotTrack", { value: "1" });
  }, key);
  await page.goto("/");
  await page.getByRole("button", { name: "Allow analytics", exact: true }).click();
  await expect(page.getByRole("button", { name: "Privacy choices", exact: true })).toBeVisible();
  expect(await page.evaluate(() => "dataLayer" in window)).toBe(false);
});
