import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  await page.goto("/partner/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
}

test("an owner can invite a staff account to two properties and remove just one assignment", async ({
  page,
  browser,
}, testInfo) => {
  const mobile = Boolean(testInfo.project.use.isMobile);
  const suffix = mobile ? "mobile" : "desktop";
  const recipient = `team-invitee-${suffix}@example.invalid`;
  const propertyIds = [1, 2].map(
    (index) => `30000000-0000-4000-8000-00000000000${index + (mobile ? 2 : 0)}`,
  );
  const statusUrl = (index: number) => `/partner/properties/${propertyIds[index]}`;
  await signIn(page, `team-owner-${suffix}@example.invalid`);
  const invites: string[] = [];
  for (let index = 0; index < propertyIds.length; index++) {
    await page.goto(statusUrl(index));
    await page.getByRole("link", { name: "Manage team" }).click();
    await expect(page.getByRole("heading", { name: "Manage property team" })).toBeVisible();
    await page.getByLabel("Staff email").fill(recipient);
    await page.getByRole("button", { name: "Create invitation" }).click();
    const link = page.getByRole("textbox", { name: "Invitation link" });
    await expect(link).toHaveValue(/\/partner\/invite#[0-9a-f]{64}$/);
    const pending = page.getByRole("region", { name: "Pending invitations" });
    await expect(pending.getByText(recipient, { exact: true })).toBeVisible();
    invites.push(await link.inputValue());
  }
  const { violations } = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );

  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const staff = await context.newPage();
    await staff.goto(invites[0]);
    await expect(staff.getByText(/Then reopen your invitation link/)).toBeVisible();
    await signIn(staff, recipient);
    for (const [index, link] of invites.entries()) {
      await staff.goto(link);
      await staff.getByRole("button", { name: "Accept invitation" }).click();
      await expect(staff).toHaveURL(new RegExp(`${statusUrl(index)}$`));
      await expect(staff.getByRole("link", { name: "Manage team" })).toHaveCount(0);
    }
    await page.goto(`${statusUrl(0)}/team`);
    await page.getByRole("button", { name: `Remove staff for ${recipient}` }).click();
    await expect(page.getByText("No staff are assigned to this property.")).toBeVisible();
    expect((await staff.goto(statusUrl(0)))?.status()).toBe(404);
    expect((await staff.goto(statusUrl(1)))?.status()).toBe(200);
    await expect(staff.getByRole("heading", { name: "Fixture Park" })).toBeVisible();
  } finally {
    await context.close();
  }
});
