import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, role: "admin" | "owner") {
  await page.goto("/admin/offer-reviews");
  await expect(page).toHaveURL(/\/partner\/sign-in\?next=admin$/);
  await page.getByLabel("Email").fill(`fixture-${role}@example.invalid`);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("admins can preview submitted content, approve it and read the revision history", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Open offer review queue" }).click();
  await page.getByRole("link", { name: "Fixture submitted offer" }).click();
  const preview = page.getByRole("region", { name: "Public content preview" });
  await expect(preview).toContainText("LKR 15,000");
  await expect(preview).toContainText("Advance booking required.");
  await expect(preview.getByRole("img", { name: "Submitted offer cover photo" })).toBeVisible();
  const decision = page.getByRole("form", { name: "Review decision" });
  await decision.getByRole("button", { name: "Approve offer" }).click();
  await expect(decision.getByRole("alert")).toContainText("Complete every approval check");
  for (const check of await decision.getByRole("checkbox").all()) await check.check();
  await decision.getByLabel("Message to the partner").fill("Approved after reviewing the offer.");
  const audit = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await decision.getByRole("button", { name: "Approve offer" }).click();
  await expect(page.getByText("Review decision saved.")).toBeVisible();
  await expect(page.getByText(/Offer status Active/)).toBeVisible();
  const history = page.getByRole("region", { name: "Revision history" });
  await expect(history).toContainText("Revision 1 · Approved");
  await expect(history).toContainText("Approved after reviewing the offer.");
  await expect(decision).toHaveCount(0);
  await page.getByRole("link", { name: "Offer review queue", exact: true }).click();
  await page.getByRole("link", { name: "Decided revisions" }).click();
  await expect(page.getByRole("link", { name: "Fixture submitted offer" })).toBeVisible();
});

test("an owner cannot open the admin review queue or a submitted revision preview", async ({
  page,
}) => {
  await signIn(page, "owner");
  expect((await page.goto("/admin/offer-reviews"))?.status()).toBe(404);
  expect(
    (await page.goto("/admin/offer-reviews/40000000-0000-4000-8000-000000000010"))?.status(),
  ).toBe(404);
  await expect(page.getByRole("region", { name: "Public content preview" })).toHaveCount(0);
});
