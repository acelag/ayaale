import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, role: string) {
  await page.goto("/admin/newsletters");
  await page.getByLabel("Email").fill(`fixture-${role}@example.invalid`);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("admins can create, reorder, preview, and save a private newsletter draft", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Marketing · Newsletters" }).click();
  await page.getByRole("link", { name: "Create newsletter" }).click();
  await page.getByLabel("Subject").fill("Friday picks");
  await page.getByLabel("Introduction").fill("Two deals <script>example</script>");
  await page.getByRole("button", { name: "Add Fixture coast stay" }).click();
  await page.getByLabel("Search live offers").fill("dining");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 matching offers shown." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Fixture coast stay" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add Fixture dining offer" }).click();
  await page.getByRole("button", { name: "Move Fixture dining offer up" }).click();
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  const preview = page.frameLocator('iframe[title="Desktop newsletter preview"]');
  await expect(preview.getByRole("heading", { level: 2 }).first()).toHaveText(
    "Fixture dining offer",
  );
  await expect(
    preview.getByText("Two deals <script>example</script>", { exact: true }),
  ).toBeVisible();
  await expect(preview.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Newsletter draft saved." }),
  ).toBeVisible();
  await expect(page.getByLabel("Subject")).toHaveValue("Friday picks");
  await expect(page.getByRole("heading", { name: "Schedule and campaign results" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Schedule Friday newsletter" })).toBeDisabled();
  await expect(page.getByText("Click totals count recipients", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send test to me" })).toBeDisabled();
  await expect(
    page.getByText("Test email is unavailable until the sender is configured."),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});

test("property members cannot open the newsletter editor", async ({ page }) => {
  await signIn(page, "owner");
  expect((await page.goto("/admin/newsletters"))?.status()).toBe(404);
  expect((await page.goto("/admin/newsletters/new"))?.status()).toBe(404);
});

test("newsletter click links redirect within Ayaale without exposing tokens in referrers", async ({
  request,
}) => {
  const token = "A".repeat(43);
  const response = await request.get(`/newsletter/click?token=${token}`, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe(
    "http://127.0.0.1:3100/offers/fixture-coast-1?utm_source=newsletter&utm_medium=email&utm_campaign=weekly-newsletter",
  );
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect((await request.get("/newsletter/click?token=invalid")).status()).toBe(404);
});
