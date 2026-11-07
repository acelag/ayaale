import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const statusPath = "/partner/properties/10000000-0000-4000-8000-000000000001";

async function signIn(page: Page, email: string) {
  await page.goto("/partner/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
}

test("an owner submits profile details and an ordered private gallery for review", async ({
  page,
}) => {
  await signIn(page, "fixture-owner@example.invalid");
  await page.goto(statusPath);
  await page.getByRole("link", { name: "Edit property profile" }).click();
  await expect(page.getByRole("heading", { name: "Edit property profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View public profile" })).toHaveAttribute(
    "href",
    "/properties/fixture-coast-house",
  );
  await expect(page.getByText("40% complete")).toBeVisible();
  await page
    .getByLabel("Description (optional)", { exact: true })
    .fill("A coastal venue with a private garden.");
  await page.getByLabel("Amenities", { exact: true }).fill("Garden\nParking");
  const photos = page.getByLabel("Uploaded photo");
  await photos.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add to gallery" }).click();
  await page.getByLabel("Cover photo description").fill("Front entrance");
  await photos.selectOption({ index: 2 });
  await page.getByRole("button", { name: "Add to gallery" }).click();
  await page.getByLabel("Photo 2 description").fill("Garden seating");
  await page.getByRole("button", { name: "Move up photo 2" }).click();
  await expect(page.getByLabel("Cover photo description")).toHaveValue("Garden seating");
  await expect(page.getByText("100% complete")).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.getByRole("button", { name: "Submit profile for review" }).click();
  await expect(page.getByText("Profile changes submitted for review.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Cover photo description")).toHaveValue("Garden seating");
});

test("assigned staff can preview private photos without opening the owner editor", async ({
  page,
}) => {
  await signIn(page, "fixture-staff@example.invalid");
  await page.goto(statusPath);
  await page.getByRole("link", { name: "Manage property photos" }).click();
  await expect(page.getByRole("heading", { name: "Manage property photos" })).toBeVisible();
  await page.getByLabel("Uploaded photo").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Preview photo" }).click();
  const preview = page.getByRole("img", { name: "Private preview of the selected property photo" });
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Submit profile for review" })).toHaveCount(0);
  expect(
    (await page.goto("/partner/properties/10000000-0000-4000-8000-000000000002/profile"))?.status(),
  ).toBe(404);
});
