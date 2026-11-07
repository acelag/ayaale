import { expect, test } from "@playwright/test";
test("feed shows 12 server-rendered approved-card fixtures and pricing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(12);
  await expect(
    page
      .getByRole("navigation", { name: "Offer categories" })
      .getByRole("link", { name: "All Offers", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const card = page.getByRole("article").first();
  await expect(card.getByText("LKR 18,500", { exact: true })).toBeVisible();
  await expect(card.getByText("per night", { exact: true })).toBeVisible();
  await expect(card.getByText("Verified by Ayaale", { exact: true })).toBeVisible();
});

test("GET search and category links preserve URL state without client JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/`);
    await page.getByRole("link", { name: "Load More" }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect(page.getByRole("article")).toHaveCount(3);
    await page.goto(`${baseURL}/`);
    await page.getByRole("searchbox").fill("Colombo");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/q=Colombo/);
    await expect(page.getByRole("article")).toHaveCount(1);
    await page
      .getByRole("navigation", { name: "Offer categories" })
      .getByRole("link", { name: "Dining", exact: true })
      .click();
    await expect(page).toHaveURL(/category=dining/);
    await expect(page.getByRole("searchbox")).toHaveValue("Colombo");
    await expect(page.getByRole("article")).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole("searchbox")).toHaveValue("Colombo");
    await page.getByRole("link", { name: "Clear search and category" }).click();
    await expect(page.getByRole("article")).toHaveCount(12);
  } finally {
    await context.close();
  }
});
test("no-match search can be reset and user input is escaped", async ({ page }) => {
  await page.goto("/?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E&category=invalid");
  await expect(page.getByRole("heading", { name: "No offers match this search" })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("<script>alert(1)</script>");
  await page.getByRole("link", { name: "See all offers" }).click();
  await expect(page.getByRole("article")).toHaveCount(12);
});
test("listing CTA opens partner signup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "List Your Property" }).click();
  await expect(page).toHaveURL(/\/partner\/signup$/);
  await expect(page.getByRole("heading", { name: "Create a partner account" })).toBeVisible();
});
test("responsive header, cards and category controls fit representative widths", async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      view: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.view);
    const nav = page.getByRole("navigation", { name: "Offer categories" });
    for (const link of await nav.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    const thumb = page.getByRole("article").first().locator("img");
    const box = await thumb.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width < 640 ? 112 : 160);
  }
});

test("text enlargement, forced colors and reduced motion retain navigation and reflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.getByRole("link", { name: "List Your Property" })).toBeVisible();
});

test("Load More appends results and preserves focus and existing cards after a retry", async ({
  page,
}) => {
  await page.goto("/");
  const more = page.getByRole("link", { name: "Load More", exact: true });
  await page.route("**/api/discovery?**", (route) => route.fulfill({ status: 503 }));
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t load more" })).toBeVisible();
  await expect(more).toBeFocused();
  await expect(page.getByRole("article")).toHaveCount(12);
  await page.unroute("**/api/discovery?**");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article")).toHaveCount(15);
  await expect(page.getByRole("status")).toContainText("3 more offers loaded.");
  await expect(page.getByRole("link", { name: "All offers shown" })).toBeFocused();
});
test("provider failure is distinct from an empty result and preserves search on retry", async ({
  page,
}) => {
  await page.goto("/?q=provider-offline&category=stays");
  await expect(
    page.getByRole("heading", { name: "Offers are unavailable right now" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    /category=stays&q=provider-offline/,
  );
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("filter sheet previews matching count, applies URL criteria and returns focus on Escape", async ({
  page,
}) => {
  await page.goto("/?category=stays");
  const opener = page.getByRole("button", { name: "Filters", exact: true });
  await opener.click();
  const sheet = page.getByRole("dialog", { name: "Filter offers" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Nights")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.click();
  await sheet.getByLabel("Destination").fill("Colombo");
  await expect(sheet.getByRole("button", { name: "Show 0 Offers" })).toBeVisible();
  await sheet.getByLabel("Destination").fill("Galle");
  await sheet.getByLabel("Maximum price (LKR)").fill("7000");
  await expect(sheet.getByRole("button", { name: "Show 13 Offers" })).toBeVisible();
  await sheet.getByRole("button", { name: "Show 13 Offers" }).click();
  await expect(page).toHaveURL(/destination=Galle/);
  const chips = page.getByRole("list", { name: "Active filters" });
  await expect(chips).toContainText("Galle");
  await page.getByRole("link", { name: "Load More" }).click();
  await expect(page.getByRole("article")).toHaveCount(13);
  await chips.getByRole("link", { name: "Remove Maximum price (LKR) filter: 7000" }).click();
  await expect(chips).toContainText("Galle");
  await expect(chips).not.toContainText("7000");
  await chips.getByRole("link", { name: "Reset filters" }).click();
  await expect(chips).toHaveCount(0);
});

test("changing sort keeps criteria and resets the continuation", async ({ page }) => {
  await page.goto("/?destination=Galle");
  await page.getByLabel("Sort offers").selectOption("price");
  await expect(page).toHaveURL(/sort=price/);
  await expect(page).toHaveURL(/destination=Galle/);
  await expect(page.getByRole("article").first()).toContainText("LKR 6,500");
});
