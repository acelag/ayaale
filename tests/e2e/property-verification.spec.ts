import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a platform admin can verify a property from the checklist and then suspend it", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Email").fill("fixture-admin@example.invalid");
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Open verification queue" }).click();
  await page.getByRole("link", { name: "Fixture review hotel" }).click();
  await expect(page.getByRole("heading", { name: "Fixture review hotel" })).toBeVisible();
  await page.getByLabel("Uploaded photo").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Preview photo" }).click();
  await expect(
    page.getByRole("img", { name: "Private preview of the selected property photo" }),
  ).toBeVisible();
  await page.getByLabel("Verification method").selectOption("both");
  await page.getByLabel("Latitude").fill("6.02");
  await page.getByLabel("Longitude").fill("80.22");
  await page
    .getByLabel(/Internal evidence summary/)
    .fill("Reviewed the location and applicant evidence.");
  await page.getByRole("button", { name: "Approve property" }).click();
  await expect(
    page.getByRole("form", { name: "Record a decision" }).getByRole("alert"),
  ).toContainText("Complete the checklist");
  await expect(page.getByLabel("Latitude")).toHaveValue("6.02");
  await page.getByLabel("I confirmed the business exists.").check();
  await page.getByLabel("I confirmed the applicant is authorized to represent it.").check();
  const audit = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.getByRole("button", { name: "Approve property" }).click();
  await expect(page.getByText("Property status · verified")).toBeVisible();
  await page
    .getByLabel("Message to the partner")
    .fill("Contact information requires verification.");
  await page
    .getByLabel("I confirm suspension will hide the public property and its offers.")
    .check();
  await page.getByRole("button", { name: "Suspend property" }).click();
  await expect(page.getByText("Property status · suspended")).toBeVisible();
  await expect(page.getByRole("region", { name: "Decision history" })).toContainText(
    "Contact information requires verification.",
  );
});
