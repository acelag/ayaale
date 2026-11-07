import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, path: string) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("a duplicate registration can become a private claim and gain access after manual approval", async ({
  page,
}, testInfo) => {
  const device = testInfo.project.use.isMobile ? "mobile" : "desktop";
  const claimant = `fixture-claimant-${device}@example.invalid`;
  const property = `Fixture claim hotel ${device}`;
  await signIn(page, claimant, "/partner/sign-in");
  await page.getByRole("link", { name: "Register a property" }).click();
  await page.getByLabel("Property name").fill(property);
  await page.getByLabel("Contact person").fill("Fixture claimant");
  await page.getByLabel("Primary category").selectOption("stays");
  await page.getByLabel("Property type").selectOption("hotel");
  await page.getByLabel("Street address").fill("52 Ocean Road");
  await page.getByLabel("District").selectOption("Galle");
  await page.getByLabel("Business phone").fill("+94771234567");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "A property may already match" }),
  ).toBeVisible();
  await expect(page.getByLabel("Property name")).toHaveValue(property);
  await page
    .getByLabel("Explain your authority to represent the property")
    .fill("Verify my appointment with hotel management.");
  await page.getByRole("button", { name: "Submit ownership claim" }).click();
  await expect(page.getByRole("heading", { name: "My ownership claims" })).toBeVisible();
  await expect(page.getByText("Pending review", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open property" })).toHaveCount(0);
  await page.getByRole("link", { name: "Partner home", exact: true }).first().click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await signIn(page, "fixture-admin@example.invalid", "/admin");
  await page.getByRole("link", { name: "Ownership claims", exact: true }).click();
  await page.getByRole("link", { name: property }).click();
  await page.getByRole("radio", { name: `${property} · Galle` }).check();
  await page.getByLabel("Message to the claimant").fill("Ownership transfer approved.");
  await page.getByRole("button", { name: "Approve transfer" }).click();
  await expect(
    page.getByRole("form", { name: "Record an ownership decision" }).getByRole("alert"),
  ).toContainText("independent verification");
  await page
    .getByLabel("I independently verified the claimant’s authority to take ownership.")
    .check();
  await page
    .getByLabel(/Internal evidence summary/)
    .fill("Confirmed with independently sourced management contact.");
  const audit = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.getByRole("button", { name: "Approve transfer" }).click();
  await expect(page.getByText("Ownership decision saved.")).toBeVisible();
  await page.getByRole("link", { name: "Ayaale administration" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await signIn(page, claimant, "/partner/sign-in");
  await page.getByRole("link", { name: "My ownership claims" }).click();
  await expect(page.getByText("Ownership transfer approved.")).toBeVisible();
  await expect(
    page.getByText("Confirmed with independently sourced management contact."),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Open property" }).click();
  await expect(page.getByRole("heading", { name: property })).toBeVisible();
});
