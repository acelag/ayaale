import test from "node:test";
import assert from "node:assert/strict";
import {
  analyticsConfigured,
  analyticsEvent,
  campaignQuery,
  consentChoice,
  CONSENT_AGE,
  publicPage,
  safePage,
  safeReferrer,
} from "../lib/analytics/privacy.mjs";

test("analytics excludes account/token routes and removes personal URL data", () => {
  for (const path of [
    "/partner",
    "/admin",
    "/auth/callback",
    "/newsletter/unsubscribe",
    "/api/health",
    "/offers/a%40example.com",
  ])
    assert.equal(publicPage(path), null);
  assert.deepEqual(
    safePage(
      "https://ayaale.com/offers/private-property?q=someone%40example.com&token=secret#gclid=secret",
    ),
    {
      page_location: "https://ayaale.com/offers",
      page_title: "Ayaale offer",
      page_referrer: "",
      page_type: "offer",
    },
  );
  assert.equal(safePage("https://ayaale.com/newsletter/click?token=secret"), null);
  assert.equal(safePage("file:///"), null);
  assert.equal(safeReferrer("https://www.google.com/search?q=private"), "https://www.google.com");
  assert.equal(safeReferrer("https://ayaale.com/partner?token=secret"), "");
  assert.equal(safeReferrer("https://personal.example/private"), "");
});
test("only complete catalogue campaigns reach GA; links contain no subscriber data", () => {
  const query = campaignQuery("newsletter");
  assert.equal(query, "utm_source=newsletter&utm_medium=email&utm_campaign=weekly-newsletter");
  assert.equal(
    safePage(`https://ayaale.com/?${query}&email=secret`).page_location,
    `https://ayaale.com/?${query}`,
  );
  for (const query of [
    "utm_source=newsletter&utm_medium=email&utm_campaign=person@example.com",
    "utm_source=newsletter&utm_source=private&utm_medium=email&utm_campaign=weekly-newsletter",
    "gclid=secret",
  ])
    assert.equal(safePage(`https://ayaale.com/?${query}`).page_location, "https://ayaale.com/");
  assert.equal(campaignQuery("person@example.com"), "");
  assert.equal(campaignQuery("toString"), "");
});
test("consent expires and malformed/future records never allow tracking", () => {
  const now = 1_900_000_000_000;
  assert.equal(consentChoice(JSON.stringify({ choice: "allow", time: now - 1 }), now), "allow");
  assert.equal(consentChoice(JSON.stringify({ choice: "decline", time: now }), now), "decline");
  for (const record of [
    "",
    "null",
    "{}",
    JSON.stringify({ choice: "allow", time: now + 1 }),
    JSON.stringify({ choice: "allow", time: now - CONSENT_AGE }),
  ])
    assert.equal(consentChoice(record, now), null);
});
test("event parameters allow only fixed categories and contact channels", () => {
  assert.deepEqual(analyticsEvent("contact_click", "whatsapp"), { channel: "whatsapp" });
  assert.equal(analyticsEvent("contact_click", "+94771234567"), null);
  assert.deepEqual(analyticsEvent("offer_search", "private search"), {});
  assert.equal(analyticsEvent("category_select", "someone@example.com"), null);
  assert.equal(analyticsEvent("unknown", "secret"), null);
});

test("disabled, missing and invalid analytics settings fail closed", () => {
  assert.equal(analyticsConfigured("true", "G-TEST049AAA", "https://ayaale.com/privacy"), true);
  for (const args of [
    ["false", "G-TEST049AAA", "https://ayaale.com/privacy"],
    [undefined, "G-TEST049AAA", "https://ayaale.com/privacy"],
    ["true", "", "https://ayaale.com/privacy"],
    ["true", "G-TEST049AAA", "https://?"],
    ["true", "G-TEST049AAA", "javascript:alert(1)"],
    ["true", "G-TEST049AAA", "https://user:secret@ayaale.com/privacy"],
  ])
    assert.equal(analyticsConfigured(...args), false);
});
