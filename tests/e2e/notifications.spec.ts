import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, role: string, admin = false) {
  await page.goto(admin ? "/admin" : "/partner");
  await page.getByLabel("Email").fill(`fixture-${role}@example.invalid`);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(admin ? /\/admin$/ : /\/partner$/);
}

test("the partner bell opens a private inbox and reflects marking a notification read", async ({
  page,
}) => {
  await signIn(page, "owner");
  await page.getByRole("link", { name: "Notifications, 1 unread" }).click();
  await expect(page.getByRole("heading", { name: "Property registration received" })).toBeVisible();
  await expect(page.getByText("High-priority complaint")).toHaveCount(0);
  const audit = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.getByRole("button", { name: "Mark as read: Property registration received" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Notification marked as read." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Notifications, 0 unread" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Mark as read/ })).toHaveCount(0);
  expect((await page.goto("/admin/notifications"))?.status()).toBe(404);
});

test("the admin bell links urgent complaints to the private case", async ({ page }) => {
  await signIn(page, "admin", true);
  await page.getByRole("link", { name: "Notifications, 1 unread" }).click();
  await expect(page.getByRole("heading", { name: "High-priority complaint" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review complaint" })).toHaveAttribute(
    "href",
    "/admin/reports/60000000-0000-4000-8000-000000000001",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});
