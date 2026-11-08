import { expect, test } from "@playwright/test";

test("coming soon protects deep links and APIs, unlocks securely, and keeps admin authentication", async ({
  page,
  request,
}) => {
  for (const path of [
    "/",
    "/offers/fixture-coast-1",
    "/partner/signup",
    "/admin",
    "/sitemap.xml",
  ]) {
    const response = await page.goto(path);
    await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(0);
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    expect(response?.headers()["cache-control"]).toContain("no-store");
  }
  expect((await request.get("/api/discovery")).status()).toBe(503);
  expect((await request.get("/api/offers/fixture-coast-1/cover")).status()).toBe(503);
  expect((await request.get("/api/health")).status()).toBe(200);
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
  const forged = await request.post("/preview-access", {
    form: { accessCode: "synthetic-preview-code-12345" },
    headers: { Origin: "https://untrusted.example" },
  });
  expect(forged.status()).toBe(403);
  await page.goto("/");
  await page.getByText("Private preview access", { exact: true }).click();
  await page.getByLabel("Access code", { exact: true }).fill("wrong-code-for-testing");
  await page.getByRole("button", { name: "Enter preview", exact: true }).click();
  await expect(page.locator("#preview-error")).toContainText("wasn’t accepted");
  await page.getByLabel("Access code", { exact: true }).fill("synthetic-preview-code-12345");
  await page.getByRole("button", { name: "Enter preview", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Private preview" })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(12);
  const cookie = (await page.context().cookies()).find((c) => c.name === "ayaale-preview");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.value).not.toContain("synthetic-preview-code");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Sign in to Ayaale administration" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Leave preview", exact: true }).click();
  await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/discovery")).status()).toBe(503);
});
