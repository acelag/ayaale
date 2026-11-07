import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signInFromAdmin(page: Page, role: "admin" | "owner" | "staff") {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/partner\/sign-in\?next=admin$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to Ayaale administration" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(`fixture-${role}@example.invalid`);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("platform admins can open the private queue overview on desktop and phones", async ({
  page,
}) => {
  await signInFromAdmin(page, "admin");
  await expect(page.getByRole("heading", { name: "Admin overview" })).toBeVisible();
  const trials = page.getByRole("region", { name: "Starter launch trials" });
  await expect(trials).toContainText("99 of 100 trials allocated");
  await expect(trials).toContainText("1 place remaining");
  await expect(
    page.getByRole("navigation", { name: "Admin queues" }).getByRole("link"),
  ).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Pending verifications" })).toContainText(
    "Fixture pending property",
  );
  await expect(page.getByRole("region", { name: "Offers awaiting review" })).toContainText(
    "Revision 2",
  );
  await expect(page.getByRole("region", { name: "Unresolved reports" })).toContainText(
    "high priority · Investigating",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  const audit = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations.map(({ id }) => id)).toEqual([]);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/partner\/sign-in$/);
});

test("property owners and staff cannot open the platform overview", async ({ page }, testInfo) => {
  await signInFromAdmin(page, testInfo.project.use.isMobile ? "staff" : "owner");
  expect((await page.reload())?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Admin overview" })).toHaveCount(0);
  await expect(page.getByText("Fixture pending property")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Starter launch trials" })).toHaveCount(0);
  for (const path of ["/admin/analytics", "/admin/content-health", "/admin/settings"]) {
    expect((await page.goto(path))?.status()).toBe(404);
  }
});

test("admins can inspect platform activity, content health and deployment settings", async ({
  page,
}) => {
  await signInFromAdmin(page, "admin");
  await page.getByRole("link", { name: "Platform analytics" }).click();
  await expect(page.getByRole("heading", { name: "Platform analytics" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Recorded view sources" })).toContainText(
    "Unknown",
  );
  await page.getByRole("link", { name: "7 days" }).click();
  await expect(page.getByRole("link", { name: "7 days" })).toHaveAttribute("aria-current", "page");
  await page.getByText("View daily data").click();
  await expect(
    page.getByRole("region", { name: "Daily activity data" }).getByRole("row"),
  ).toHaveCount(8);
  await page.getByRole("link", { name: "Admin overview", exact: true }).click();
  await page.getByRole("link", { name: "Content health" }).click();
  await expect(page.getByRole("link", { name: "Property verifications (2)" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Expiring offers" })).toContainText(
    "Fixture expiring offer",
  );
  await expect(page.getByRole("region", { name: "Inactive properties" })).toContainText(
    "Fixture quiet property",
  );
  const audit = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.getByRole("link", { name: "Admin overview", exact: true }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Sri Lanka time (Asia/Colombo)")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator("body")).not.toContainText("synthetic-service-key-for-tests");
});
