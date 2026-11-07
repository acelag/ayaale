import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("partners can manage an offer, submit a review edit and duplicate it with fresh dates", async ({
  page,
}, testInfo) => {
  const email = testInfo.project.use.isMobile
    ? "fixture-staff@example.invalid"
    : "fixture-owner@example.invalid";
  await page.goto("/partner/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
  const property = "/partner/properties/10000000-0000-4000-8000-000000000001";
  await page.goto(property);
  await page.getByRole("link", { name: "My Offers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Offers" })).toBeVisible();
  const capacity = page.getByRole("region", { name: "Active offer slots" });
  await expect(capacity.getByText("1 of 3 active", { exact: true })).toBeVisible();

  const card = page
    .getByRole("list", { name: "Offers and drafts" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Fixture managed stay", exact: true }) })
    .first();
  await card.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Offer paused.", { exact: true })).toBeVisible();
  await expect(capacity.getByText("0 of 3 active", { exact: true })).toBeVisible();
  await expect(card.getByText("Paused", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByText("Offer resumed.", { exact: true })).toBeVisible();
  await expect(capacity.getByText("1 of 3 active", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Edit for review" }).click();
  await expect(page.getByRole("heading", { name: "Edit offer draft" })).toBeVisible();
  await expect(page.getByLabel("Offer title")).toHaveValue("Fixture managed stay");
  await page.getByLabel("Offer title").fill("Fixture revised title");
  await page.getByRole("button", { name: "5. Preview", exact: true }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("heading", { name: "Offer submitted" })).toBeVisible();
  await page.getByRole("link", { name: "My Offers", exact: true }).click();
  await expect(card.getByText("Active", { exact: true })).toBeVisible();
  await expect(card.getByText("Latest revision · Pending review")).toBeVisible();

  await card.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByLabel("Offer title")).toHaveValue("Fixture managed stay");
  await page.getByRole("button", { name: "3. Dates and terms", exact: true }).click();
  await expect(page.getByLabel("Publication starts")).toHaveValue("");
  await expect(page.getByLabel("Redemption ends")).toHaveValue("");
  await page.getByRole("link", { name: "My Offers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Offers" })).toBeVisible();
  await card.getByRole("button", { name: "End offer", exact: true }).click();
  await card.getByRole("button", { name: "Confirm end", exact: true }).click();
  await expect(page.getByText("Offer ended.", { exact: true })).toBeVisible();
  await expect(capacity.getByText("0 of 3 active", { exact: true })).toBeVisible();
  await expect(card.getByText("Recorded activity · 3 views · 1 contact click")).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});
