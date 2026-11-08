import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

// All application pages, actions, roles, RPCs, triggers and private event writes
// use the migrated local database. Only Auth delivery/storage bytes are fixtures.
test("one property completes onboarding → verification → trial → offer → contact → expiry → duplication", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `journey-${suffix}@example.invalid`;
  const name = `Journey hotel ${suffix}`;
  const title = `Journey lunch ${suffix}`;
  let property = "";
  const stages: unknown[] = [];
  const control = async (action: string) => {
    const response = await page.request.post(`http://127.0.0.1:3101/__journey/${action}`, {
      headers: { "x-journey-control": "synthetic-journey-control" },
      data: { property },
    });
    expect(response.status()).toBe(200);
    return response.json();
  };
  const adminContext = await browser.newContext({ baseURL });
  const visitorContext = await browser.newContext({ baseURL });
  const admin = await adminContext.newPage();
  const visitor = await visitorContext.newPage();
  try {
    await test.step("signup, PKCE confirmation and property registration", async () => {
      await page.goto("/partner/signup");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("check your email");
      await page.goto(`/auth/callback?code=${encodeURIComponent(email)}`);
      await expect(page.getByRole("heading", { name: "All Properties Overview" })).toBeVisible();
      await page.getByRole("link", { name: "Register a property" }).click();
      await page.getByLabel("Property name").fill(name);
      await page.getByLabel("Contact person").fill("Journey applicant");
      await page.getByLabel("Primary category").selectOption("stays");
      await page.getByLabel("Property type").selectOption("hotel");
      await page.getByLabel("Street address").fill(`123 Journey ${suffix} Road`);
      await page.getByRole("combobox", { name: "District", exact: true }).selectOption("Galle");
      await page.getByLabel("Business phone").fill("+94771234567");
      await page.getByLabel("Business WhatsApp").fill("+94777654321");
      await page.getByRole("button", { name: "Submit for review", exact: true }).click();
      await expect(page).toHaveURL(/\/partner\/properties\/[a-f0-9-]{36}$/);
      property = page.url().split("/").at(-1)!;
      const pending = await control("state");
      expect(pending.verification).toBe("pending");
      expect(pending.trials).toBe(0);
      stages.push({ stage: "registered", ...pending });
      const image = await sharp({
        create: { width: 320, height: 240, channels: 3, background: "#14624f" },
      })
        .png()
        .toBuffer();
      await page
        .getByLabel("Property photo")
        .setInputFiles({ name: "journey.png", mimeType: "image/png", buffer: image });
      await page.getByRole("button", { name: "Upload photo", exact: true }).click();
      await expect(page.getByText("1 photo uploaded", { exact: true })).toBeVisible();
    });
    let trial: unknown;
    await test.step("independent administrator verifies and allocates exactly one trial", async () => {
      await admin.goto("/admin");
      await admin.getByLabel("Email").fill("fixture-admin@example.invalid");
      await admin.getByLabel("Password").fill("fixture-only-password");
      await admin.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(admin.getByRole("heading", { name: "Admin overview" })).toBeVisible();
      await admin.goto(`/admin/verifications/${property}`);
      await admin.getByLabel("Verification method").selectOption("both");
      await admin
        .getByLabel("Confirmed Google Maps link")
        .fill(`https://maps.google.com/?q=journey-${suffix}`);
      await admin.getByLabel("Latitude").fill("6.02");
      await admin.getByLabel("Longitude").fill("80.22");
      await admin
        .getByLabel(/Internal evidence summary/)
        .fill("Synthetic journey: location and applicant authority checked independently.");
      await admin.getByLabel("I confirmed the business exists.").check();
      await admin.getByLabel("I confirmed the applicant is authorized to represent it.").check();
      await admin.getByRole("button", { name: "Approve property", exact: true }).click();
      await expect(admin.getByText("Property status · verified", { exact: true })).toBeVisible();
      await page.goto(`/partner/properties/${property}/subscription`);
      await expect(page.getByText("Free trial active", { exact: true })).toBeVisible();
      const verified = await control("state");
      expect(verified.trials).toBe(1);
      expect(verified.trial.sixMonths).toBe(true);
      trial = verified.trial;
      expect(trial).toBeTruthy();
      stages.push({ stage: "verified-with-trial", ...verified });
    });
    await test.step("save, resume, preview and submit the same private draft", async () => {
      await page.goto(`/partner/properties/${property}/offer`);
      await page.getByLabel("Offer title").fill(title);
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
      await page.goto(`/partner/properties/${property}/offer`);
      await page.getByRole("link", { name: title, exact: true }).click();
      await expect(page.getByLabel("Offer title")).toHaveValue(title);
      await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("dining");
      await page.getByLabel("Short description").fill("A synthetic lunch for two.");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByLabel("Promotional price (LKR)", { exact: true }).fill("4500");
      await page.getByLabel("Original price (LKR) (optional)", { exact: true }).fill("6000");
      await page.getByLabel("Price unit").selectOption("per_couple");
      await page.getByLabel("Package coverage").fill("Lunch for two");
      await page.getByLabel("Adults included").fill("2");
      await page.getByLabel("Inclusions (one per line)").fill("Lunch\nDessert");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      const date = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
      await page.getByLabel("Publication starts").fill(date(-1).slice(0, 16));
      await page.getByLabel("Publication ends").fill(date(7).slice(0, 16));
      await page.getByLabel("Redemption starts").fill(date(1).slice(0, 10));
      await page.getByLabel("Redemption ends").fill(date(8).slice(0, 10));
      await page.getByLabel("Terms and conditions").fill("Synthetic test: book in advance.");
      await page.getByLabel("Are taxes included?").selectOption("yes");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page
        .getByRole("combobox", { name: "Cover photo", exact: true })
        .selectOption({ index: 1 });
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.getByRole("region", { name: "Offer card preview" })).toContainText(title);
      await expect
        .poll(() =>
          page
            .getByRole("img", { name: "Proposed offer cover", exact: true })
            .evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
      await page.getByRole("button", { name: "Submit for review", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Offer submitted" })).toBeVisible();
      const submitted = await control("state");
      expect(submitted.offers).toHaveLength(1);
      expect(submitted.offers[0].status).toBe("pending_review");
      expect(submitted.offers[0].firstPublished).toBeNull();
      expect((await visitor.goto(`/offers/${submitted.offers[0].slug}`))?.status()).toBe(404);
      stages.push({ stage: "submitted-private", ...submitted });
    });
    let slug = "";
    await test.step("approve and publish the submitted revision, then record a contact click", async () => {
      const submitted = await control("state");
      await admin.goto(`/admin/offer-reviews/${submitted.offers[0].id}`);
      const decision = admin.getByRole("form", { name: "Review decision" });
      for (const check of await decision.getByRole("checkbox").all()) await check.check();
      await decision.getByRole("button", { name: "Approve offer", exact: true }).click();
      await expect(admin.getByText("Review decision saved.", { exact: true })).toBeVisible();
      const published = await control("state");
      expect(published.offers[0].status).toBe("active");
      expect(published.offers[0].firstPublished).toBeTruthy();
      expect(published.offers[0].revision).toBeTruthy();
      slug = published.offers[0].slug;
      await visitor.goto(`/?q=${encodeURIComponent(title)}`);
      await visitor.getByRole("link", { name: title, exact: true }).click();
      await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(visitor.getByRole("link", { name: "Call", exact: true })).toHaveAttribute(
        "href",
        "tel:+94771234567",
      );
      // Intercept the external destination; never open WhatsApp or place a call.
      await visitorContext.route("https://wa.me/**", (route) =>
        route.fulfill({ body: "Synthetic contact destination" }),
      );
      const recorded = visitor.waitForResponse((response) =>
        response.url().endsWith(`/api/offers/${slug}/contact`),
      );
      const popup = visitor.waitForEvent("popup");
      await visitor.getByRole("link", { name: "WhatsApp", exact: true }).click();
      expect((await recorded).status()).toBe(204);
      await (await popup).close();
      const contacted = await control("state");
      expect(contacted.contacts).toBe(1);
      expect(contacted.trials).toBe(1);
      expect(contacted.trial).toEqual(trial);
      stages.push({ stage: "published-contacted", ...contacted });
    });
    await test.step("real lifecycle job expires the offer once and preserves its old URL", async () => {
      const expired = await control("expire");
      expect(expired.before.offers[0].status).toBe("active");
      expect(expired.before.publicState).toBe("ended");
      expect(expired.job.expired).toBe(1);
      expect(expired.retry.expired).toBe(0);
      expect(expired.after.offers[0].status).toBe("expired");
      expect(expired.after.expirations).toBe(1);
      expect((await visitor.goto(`/offers/${slug}`))?.status()).toBe(200);
      await expect(
        visitor.getByRole("heading", { name: "This offer has ended", exact: true }),
      ).toBeVisible();
      await expect(visitor.getByRole("link", { name: "WhatsApp", exact: true })).toHaveCount(0);
      await visitor.goto(`/?q=${encodeURIComponent(title)}`);
      await expect(visitor.getByRole("link", { name: title, exact: true })).toHaveCount(0);
      await page.goto(`/partner/properties/${property}/offers`);
      await expect(page.getByText("0 of 3 active", { exact: true })).toBeVisible();
      stages.push({ stage: "expired", ...expired });
    });
    await test.step("duplicate into a new private draft with all dates cleared", async () => {
      const item = page
        .getByRole("list", { name: "Offers and drafts" })
        .getByRole("listitem")
        .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
        .first();
      await expect(item.getByText("Expired", { exact: true })).toBeVisible();
      await item.getByRole("button", { name: "Duplicate", exact: true }).click();
      await expect(page.getByLabel("Offer title")).toHaveValue(title);
      const draft = new URL(page.url()).searchParams.get("draft");
      const state = await control("state");
      expect(state.offers).toHaveLength(1);
      expect(draft).not.toBe(state.offers[0].id);
      expect(state.drafts.find((row: { id: string }) => row.id === draft)?.submitted).toBe(false);
      await page.getByRole("button", { name: "3. Dates and terms", exact: true }).click();
      for (const label of [
        "Publication starts",
        "Publication ends",
        "Redemption starts",
        "Redemption ends",
      ])
        await expect(page.getByLabel(label)).toHaveValue("");
      expect(state.trials).toBe(1);
      expect(state.trial).toEqual(trial);
      expect(state.contacts).toBe(1);
      stages.push({ stage: "duplicated-private", ...state });
    });
  } finally {
    await info.attach("journey-checkpoints", {
      body: JSON.stringify(stages, null, 2),
      contentType: "application/json",
    });
    await adminContext.close();
    await visitorContext.close();
  }
});
