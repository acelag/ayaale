import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, role: string) {
  await page.goto("/partner/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(`fixture-${role}@example.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}

test("practice catalogue, safe contact simulation and isolated owner/staff/admin dashboards work", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "Practice site" })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(6);
  await page.getByRole("link", { name: "SAMPLE Weekend stay", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "SAMPLE Weekend stay", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp", exact: true })).toHaveCount(0);
  const recorded = page.waitForResponse(
    (r) => r.url().endsWith("/contact") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
  expect((await recorded).status()).toBe(204);
  await expect(page.getByText("Practice click only. No call or WhatsApp opened.")).toBeVisible();
  await expect(page).toHaveURL(/\/offers\/sample-weekend-stay$/);
  await login(page, "owner");
  await expect(
    page.getByRole("heading", { name: "SAMPLE Pending Property", exact: true }),
  ).toBeVisible();
  const property = await page
    .getByRole("link", { name: "SAMPLE Garden Stay", exact: true })
    .getAttribute("href");
  await page.goto(`${property}/offers`);
  await expect(page.getByText("SAMPLE Paused stay", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Partner home", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "staff");
  expect((await page.goto(`${property}/subscription`))?.status()).toBe(404);
  await page.goto("/partner");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "admin");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin overview", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Starter launch trials" })).toContainText(
    "3 of 100 trials allocated",
  );
  await page.getByRole("link", { name: "Marketing · Newsletters", exact: true }).click();
  await expect(page.getByText("SAMPLE Friday discoveries", { exact: true })).toBeVisible();
});
