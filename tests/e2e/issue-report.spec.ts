import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("visitors can reach and submit an accessible offer report without an account", async ({
  page,
}) => {
  await page.goto("/offers/fixture-coast-1");
  await page.getByRole("link", { name: "Report an issue" }).click();
  await expect(page).toHaveURL(/#report-an-issue$/);
  const form = page.getByRole("region", { name: "Report an issue" });
  await form.getByLabel("Reason").selectOption("incorrect_price");
  await form.getByLabel("Comment (optional)").fill("The listed total differs.");
  await form.getByLabel("Email (optional)").fill("visitor@example.invalid");
  const { violations } = await new AxeBuilder({ page })
    .include("#report-an-issue")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByRole("status")).toContainText("Ayaale received your report");
  await expect(form.getByLabel("Email (optional)")).toHaveCount(0);
  await expect(page).toHaveURL(/\/offers\/fixture-coast-1#report-an-issue$/);
});

test("property report retains input on a temporary limit and allows optional fields to be omitted", async ({
  page,
}) => {
  await page.goto("/properties/fixture-coast-house");
  await page.getByRole("link", { name: "Report an issue" }).click();
  const form = page.getByRole("region", { name: "Report an issue" });
  await form.getByLabel("Reason").selectOption("other");
  await form.getByLabel("Comment (optional)").fill("Please check the published information.");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByRole("alert")).toContainText("Too many reports");
  await expect(form.getByLabel("Comment (optional)")).toHaveValue(
    "Please check the published information.",
  );
  await form.getByLabel("Comment (optional)").clear();
  await form.getByLabel("Reason").selectOption("misleading_information");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByRole("status")).toContainText("Ayaale received your report");
});

test("old public offers can still be reported and withdrawn pages omit the form", async ({
  page,
}) => {
  await page.goto("/offers/fixture-paused");
  const form = page.getByRole("region", { name: "Report an issue" });
  await form.getByLabel("Reason").selectOption("unavailable_offer");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByRole("status")).toContainText("Ayaale received your report");
  await page.goto("/offers/fixture-unavailable");
  await expect(form).toHaveCount(0);
});

test("the server explains invalid optional emails and retains the report", async ({ page }) => {
  await page.goto("/properties/fixture-coast-house");
  const form = page.getByRole("region", { name: "Report an issue" });
  await form.getByLabel("Reason").selectOption("unreachable_contact");
  const email = form.getByLabel("Email (optional)");
  await email.fill("visitor@local");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByRole("alert")).toContainText("Enter a valid email address");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveValue("visitor@local");
  await email.clear();
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByRole("status")).toContainText("Ayaale received your report");
});
