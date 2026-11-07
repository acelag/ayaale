import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const queue = "/admin/reports";
const detail = `${queue}/60000000-0000-4000-8000-000000000001`;

async function signIn(page: Page, role: string) {
  await page.goto(queue);
  await expect(page).toHaveURL(/\/partner\/sign-in\?next=admin$/);
  await page.getByLabel("Email").fill(`fixture-${role}@example.invalid`);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("admin can review a complaint, hide a listing, and close the case", async ({ page }) => {
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Open complaint moderation queue" }).click();
  await expect(page.getByRole("heading", { name: "Complaint moderation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fixture complaint offer" })).toBeVisible();
  await expect(page.getByText("High priority · Open")).toBeVisible();
  await expect(page.getByText("fixture-reporter@example.invalid")).toHaveCount(0);
  await page.getByRole("link", { name: "Fixture complaint offer" }).click();
  await page.getByText("Private visitor submission").click();
  await expect(page.getByText("fixture-reporter@example.invalid")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Other complaints for this business" }),
  ).toContainText("Fixture reported property");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await page.getByLabel("Action", { exact: true }).selectOption("request_changes");
  await expect(page.getByLabel("Instructions for the owner")).toBeVisible();
  await page.getByLabel("Action", { exact: true }).selectOption("temporarily_hide");
  await page.getByLabel("Internal note").fill("Confirmed the price mismatch.");
  await page.getByLabel("I confirm hiding this offer from the public site.").check();

  const audit = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );

  await page.getByRole("button", { name: "Save moderation action" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Moderation action saved." }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Moderation history" })).toContainText(
    "Confirmed the price mismatch.",
  );
  await expect(page.getByRole("region", { name: "Complaint details" })).toContainText(
    "hidden by admin",
  );
  await page.getByLabel("Action", { exact: true }).selectOption("resolve");
  await page.getByLabel("Internal note").fill("Investigation complete. Keep the offer hidden.");
  await page.getByRole("button", { name: "Save moderation action" }).click();
  await expect(page.getByRole("region", { name: "Complaint details" })).toContainText("Resolved");
  await expect(page.getByRole("button", { name: "Save moderation action" })).toHaveCount(0);
  await page.getByRole("link", { name: "Complaint moderation", exact: true }).click();
  await expect(page.getByRole("link", { name: "Closed" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Fixture complaint offer" })).toBeVisible();
});

test("property members cannot open complaint queues or private visitor submissions", async ({
  page,
}, info) => {
  await signIn(page, info.project.use.isMobile ? "staff" : "owner");
  expect((await page.goto(queue))?.status()).toBe(404);
  expect((await page.goto(detail))?.status()).toBe(404);
  await expect(page.getByText("fixture-reporter@example.invalid")).toHaveCount(0);
});
