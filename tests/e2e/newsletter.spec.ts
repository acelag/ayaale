import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const token = "A".repeat(43);

test("homepage newsletter requires explicit consent and gives a generic acknowledgement", async ({
  page,
}) => {
  await page.goto("/#newsletter");
  const panel = page.getByRole("region", { name: "Discover Sri Lanka’s Best Deals Every Week" });
  const checkbox = panel.getByRole("checkbox", { name: /weekly Friday newsletter/ });
  await expect(checkbox).not.toBeChecked();
  await panel.getByLabel("Email address").fill("fixture@example.invalid");
  await panel.getByRole("button", { name: "Send confirmation email" }).click();
  await expect(panel.getByRole("status")).toHaveCount(0);
  await checkbox.check();
  await panel.getByRole("button", { name: "Send confirmation email" }).click();
  await expect(panel.getByRole("status")).toContainText(
    "You won’t receive the newsletter until you confirm.",
  );
  const audit = await new AxeBuilder({ page })
    .include("#newsletter")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations.map(({ id }) => id)).toEqual([]);
});

test("opening confirmation and unsubscribe links never changes consent until submit", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/newsletter/")) requests++;
  });
  await page.goto(`/newsletter/confirm#${token}`);
  const confirm = page.getByRole("button", { name: "Confirm subscription" });
  await expect(confirm).toBeEnabled();
  expect(requests).toBe(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await confirm.click();
  await expect(page.getByRole("status")).toContainText("You’re subscribed.");
  await expect(page).toHaveURL(/\/newsletter\/confirm$/);
  await page.goto(`/newsletter/unsubscribe#${token}`);
  const unsubscribe = page.getByRole("button", { name: "Unsubscribe" });
  await expect(unsubscribe).toBeEnabled();
  expect(requests).toBe(1);
  await unsubscribe.click();
  await expect(page.getByRole("status")).toContainText("newsletter delivery has been stopped");
  expect(requests).toBe(2);
});

test("one-click unsubscribe accepts the standard POST and GET only opens the review page", async ({
  request,
}) => {
  const path = `/api/newsletter/unsubscribe?token=${token}`;
  const get = await request.get(path, { maxRedirects: 0 });
  expect(get.status()).toBe(303);
  expect(get.headers().location).toContain(`/newsletter/unsubscribe#${token}`);
  expect(get.headers()["cache-control"]).toBe("no-store");
  const bad = await request.post(path, { form: { "List-Unsubscribe": "other" } });
  expect(bad.status()).toBe(400);
  const good = await request.post(path, { form: { "List-Unsubscribe": "One-Click" } });
  expect(good.status()).toBe(200);
  const multipart = await request.post(path, { multipart: { "List-Unsubscribe": "One-Click" } });
  expect(multipart.status()).toBe(200);
  const crossOrigin = await request.post("/api/newsletter/confirm", {
    headers: { Origin: "https://example.invalid" },
    data: { token },
  });
  expect(crossOrigin.status()).toBe(403);
});
