import { expect, test, type Page } from "@playwright/test";

const property = "/partner/properties/10000000-0000-4000-8000-000000000001";

async function expectReflow(page: Page) {
  const overflowing = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflowing, `horizontal page overflow on ${page.url()}`).toBe(false);
}

test("partner routes fit a narrow phone and property actions remain touch-sized", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, "Checks the narrow touch viewport");

  for (const [route, heading] of [
    ["/partner/signup", "Create a partner account"],
    ["/partner/invite", "Property staff invitation"],
    ["/partner/sign-in", "Sign in to Ayaale partners"],
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expectReflow(page);
  }

  await page.getByLabel("Email").fill("fixture-owner@example.invalid");
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
  await expectReflow(page);

  await page.goto(property);
  const actions = page.getByRole("navigation", { name: "Property actions" });
  await expect(actions.getByRole("link")).toHaveCount(6);
  for (const link of await actions.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await expectReflow(page);

  for (const path of ["/profile", "/team", "/offers", "/offer", "/analytics", "/subscription"]) {
    const response = await page.goto(property + path);
    expect(response?.ok(), path).toBe(true);
    await expectReflow(page);
  }

  await page.goto("/partner/register");
  await expectReflow(page);
});
