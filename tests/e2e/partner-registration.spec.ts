import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

test("email confirmation gates registration and the owner can track a pending property", async ({
  page,
}) => {
  const email = `fixture-${randomUUID()}@example.invalid`;
  await page.goto("/partner/register");
  await expect(page).toHaveURL(/\/partner\/sign-in$/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create a partner account" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("check your email");
  await page.goto("/partner");
  await expect(page).toHaveURL(/\/partner\/sign-in$/);

  // Simulate the email link returning the provider-issued code in the signup browser.
  await page.goto(`/auth/callback?code=${encodeURIComponent(email)}`);
  await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
  await page.getByRole("link", { name: "Register a property" }).click();
  await page.getByLabel("Property name").fill("Fixture Ocean House");
  await page.getByLabel("Contact person").fill("Fixture Applicant");
  await page.getByLabel("Primary category").selectOption("stays");
  await page.getByLabel("Property type").selectOption("hotel");
  await page.getByLabel("Street address").fill("123 Fixture Road");
  await page.getByLabel("District").selectOption("Galle");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Enter at least one business phone",
  );
  await expect(page.getByLabel("Property name")).toHaveValue("Fixture Ocean House");
  await expect(page.getByLabel("Primary category")).toHaveValue("stays");
  await expect(page.getByLabel("Property type")).toHaveValue("hotel");
  await expect(page.getByLabel("District")).toHaveValue("Galle");
  await page.getByLabel("Business phone").fill("+94771234567");
  const { violations } = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/partner\/properties\/[a-f0-9-]{36}$/);
  await expect(page.getByRole("heading", { name: "Fixture Ocean House" })).toBeVisible();
  await expect(page.getByText("Pending review", { exact: true })).toBeVisible();

  const photo = await sharp({
    create: { width: 240, height: 240, channels: 3, background: "#14624f" },
  })
    .png()
    .toBuffer();
  const picker = page.getByLabel("Property photo");
  expect(
    await picker.evaluate((input) =>
      Number.parseFloat(getComputedStyle(input, "::file-selector-button").minBlockSize),
    ),
  ).toBeGreaterThanOrEqual(44);
  await picker.setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: photo });
  await page.getByRole("button", { name: "Upload photo" }).click();
  await expect(page.getByText("1 photo uploaded")).toBeVisible();

  const propertyUrl = page.url();
  await page.getByRole("link", { name: "Your property registrations" }).click();
  await expect(page.getByRole("link", { name: "Fixture Ocean House" })).toHaveAttribute(
    "href",
    /\/partner\/properties\//,
  );
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/partner\/sign-in$/);
  await page.goto(propertyUrl);
  await expect(page).toHaveURL(/\/partner\/sign-in$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("link", { name: "Fixture Ocean House" })).toBeVisible();
});

test("an unusable confirmation link offers a safe sign-in fallback", async ({ page }) => {
  await page.goto("/auth/callback?code=not-valid&next=https://external.invalid/");
  await expect(page).toHaveURL(/\/partner\/sign-in\?confirmation=invalid$/);
  await expect(page.getByText(/couldn’t start a session/)).toBeVisible();
});
