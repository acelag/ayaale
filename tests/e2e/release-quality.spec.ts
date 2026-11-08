import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/offers/fixture-coast-1",
  "/properties/fixture-coast-house",
  "/partner/signup",
  "/partner/sign-in",
];

for (const path of routes) {
  test(`release accessibility and enlarged-text reflow: ${path}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      audit.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
    ).toEqual([]);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => innerWidth),
    );
    await page.screenshot({
      path: info.outputPath(`enlarged-${path.replaceAll(/[^a-z0-9]/g, "-") || "home"}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("phone offer actions remain usable in landscape and above page content", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/offers/fixture-coast-1");
  for (const name of ["WhatsApp", "Call"]) {
    const action = page.getByRole("link", { name, exact: true });
    await action.scrollIntoViewIfNeeded();
    const box = await action.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});
