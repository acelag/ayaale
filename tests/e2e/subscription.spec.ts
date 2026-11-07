import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const coast = "/partner/properties/10000000-0000-4000-8000-000000000001";
const hills = "/partner/properties/10000000-0000-4000-8000-000000000002";

async function signIn(page: Page, role: "owner" | "staff") {
  await page.goto("/partner/sign-in");
  await page.getByLabel("Email").fill(`fixture-${role}@example.invalid`);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
}

test("owners see trial status, offer usage and future pricing for the selected property", async ({
  page,
}) => {
  await signIn(page, "owner");
  await page.goto(coast);
  await page.getByRole("link", { name: "Subscription and billing" }).click();
  await expect(page.getByRole("heading", { name: "Subscription and billing" })).toBeVisible();
  await expect(page.getByText("Free trial active", { exact: true })).toBeVisible();
  await expect(page.locator("time[datetime='2027-04-01T00:00:00Z']")).toContainText("5:30 AM");
  await expect(page.getByText("1 of 3 active", { exact: true })).toBeVisible();
  for (const amount of ["1,500", "8,000", "15,000"]) {
    await expect(page.getByText(`LKR ${amount}`, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Billing history" })).toContainText(
    "no payments or invoices",
  );
  await expect(page.getByRole("link", { name: /checkout|pay now/i })).toHaveCount(0);
  const audit = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );

  const switcher = page.getByLabel("Switch property");
  await expect(switcher.getByRole("option", { name: /Fixture Staff Venue/ })).toHaveCount(0);
  await switcher.selectOption(hills.split("/").at(-1)!);
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${hills}/subscription$`));
  await expect(page.getByText("Free trial expired", { exact: true })).toBeVisible();
  await expect(page.getByText("0 of 3 active", { exact: true })).toBeVisible();
});

test("assigned staff cannot open a property's subscription page", async ({ page }) => {
  await signIn(page, "staff");
  await page.goto(coast);
  await expect(page.getByRole("link", { name: "Subscription and billing" })).toHaveCount(0);
  expect((await page.goto(`${coast}/subscription`))?.status()).toBe(404);
});
