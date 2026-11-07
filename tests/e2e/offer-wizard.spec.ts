import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a partner can resume a draft, preview an offer and submit it for review", async ({
  page,
}, testInfo) => {
  const staff = testInfo.project.use.isMobile;
  await page.goto("/partner/sign-in");
  await page
    .getByLabel("Email")
    .fill(staff ? "fixture-staff@example.invalid" : "fixture-owner@example.invalid");
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
  const property = "/partner/properties/10000000-0000-4000-8000-000000000001";
  await page.goto(property);
  await page.getByRole("link", { name: "Create or resume an offer" }).click();
  await expect(page.getByRole("heading", { name: "Create an offer" })).toBeVisible();
  const title = `Lunch for two ${staff ? "mobile" : "desktop"}`;
  await page.getByLabel("Offer title").fill(title);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
  const draftUrl = page.url();
  await page.goto(`${property}/offer`);
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: "Edit offer draft" })).toBeVisible();
  await expect(page.getByLabel("Offer title")).toHaveValue(title);
  await page.getByRole("button", { name: "5. Preview", exact: true }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  const error = page.getByRole("main").getByRole("alert");
  await expect(error).toContainText("Choose a category");
  await expect(error).toBeFocused();
  await expect(page.getByLabel("Offer title")).toHaveValue(title);
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("dining");
  await page.getByLabel("Short description").fill("A private dining preview.");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Promotional price (LKR)", { exact: true }).fill("4500");
  await page.getByLabel("Original price (LKR) (optional)", { exact: true }).fill("6000");
  await page.getByLabel("Price unit").selectOption("per_couple");
  await page.getByLabel("Package coverage").fill("Lunch for two");
  await page.getByLabel("Adults included").fill("2");
  await page.getByLabel("Inclusions (one per line)").fill("Lunch\nDessert");
  await page.getByLabel("Meal period (optional)").fill("Lunch");
  await page.getByLabel("Meal service starts (optional)").fill("12:00");
  await expect(page.getByText("25% discount")).toBeVisible();
  await expect(page.getByLabel("Nights included")).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const future = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();
  if (staff) {
    const start = page.getByLabel("Publication starts");
    const box = await start.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThan(320);
  }
  await page.getByLabel("Publication starts").fill(future(1).slice(0, 16));
  await page.getByLabel("Publication ends").fill(future(7).slice(0, 16));
  await page.getByLabel("Redemption starts").fill(future(8).slice(0, 10));
  await page.getByLabel("Redemption ends").fill(future(9).slice(0, 10));
  await page.getByLabel("Terms and conditions").fill("Book in advance.");
  await page.getByLabel("Are taxes included?").selectOption("yes");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("combobox", { name: "Cover photo", exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Uploaded photo").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add to gallery" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  const card = page.getByRole("region", { name: "Offer card preview" });
  await expect(card.getByRole("heading", { name: title })).toBeVisible();
  await expect(card.getByRole("img", { name: "Proposed offer cover" })).toBeVisible();
  await expect(card).toContainText("25% less");
  const details = page.getByRole("region", { name: "Offer detail preview" });
  await expect(details).toContainText("Book in advance.");
  await expect(details).toContainText("12:00");
  await expect(details.getByRole("img", { name: "Proposed gallery photo 1" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("heading", { name: "Offer submitted" })).toBeVisible();
  await page.goto(draftUrl);
  await expect(page.getByRole("heading", { name: "Offer submitted" })).toBeVisible();
});
