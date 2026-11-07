import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  await page.goto("/partner/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
}

test("owner sees combined and per-property totals and can switch assigned properties", async ({
  page,
}) => {
  await signIn(page, "fixture-owner@example.invalid");
  const totals = page.getByRole("region", { name: "Portfolio totals" });
  await expect(totals.getByText("Owned properties", { exact: true }).locator("..")).toHaveText(
    "Owned properties2",
  );
  await expect(totals.getByText("Published offers", { exact: true }).locator("..")).toHaveText(
    "Published offers7",
  );
  await expect(totals.getByText("Active offers", { exact: true }).locator("..")).toHaveText(
    "Active offers3",
  );
  const table = page.getByRole("table");
  await expect(table.getByRole("row", { name: /Offer views/ }).getByRole("cell")).toHaveText([
    "21",
    "12",
  ]);
  await expect(table.getByRole("row", { name: /WhatsApp clicks/ }).getByRole("cell")).toHaveText([
    "4",
    "3",
  ]);
  await expect(table.getByRole("row", { name: /Call clicks/ }).getByRole("cell")).toHaveText([
    "3",
    "1",
  ]);
  const breakdown = page.getByRole("region", { name: "Your property registrations" });
  await expect(breakdown.getByRole("link", { name: "Fixture Hills" })).toBeVisible();
  await expect(breakdown.getByRole("link", { name: "Fixture Staff Venue" })).toHaveCount(0);
  const switcher = page.getByRole("combobox", { name: "Switch property" });
  await expect(switcher.getByRole("option", { name: /Fixture Unassigned/ })).toHaveCount(0);
  await switcher.selectOption({ label: "Fixture Staff Venue · Galle (staff)" });
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByRole("heading", { name: "Fixture Staff Venue" })).toBeVisible();
  await expect(switcher).toHaveValue("10000000-0000-4000-8000-000000000003");
  await switcher.selectOption("");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});

test("staff can open their assigned property but cannot see owner totals or unassigned properties", async ({
  page,
}) => {
  await signIn(page, "fixture-staff@example.invalid");
  await expect(page.getByRole("heading", { name: "Staff assignments" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monthly activity" })).toHaveCount(0);
  await page.getByRole("link", { name: "Fixture Coast" }).click();
  await expect(page.getByRole("heading", { name: "Fixture Coast" })).toBeVisible();
  const response = await page.goto("/partner/properties/10000000-0000-4000-8000-000000000002");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Fixture Hills" })).toHaveCount(0);
});
