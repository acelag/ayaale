import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptedSource, trafficSource } from "../lib/analytics/traffic-source.mjs";
import { campaignQuery, CONSENT_AGE } from "../lib/analytics/privacy.mjs";

const now = 1_800_000_000_000;
const allow = JSON.stringify({ choice: "allow", time: now });
const source = (query = "", referrer = "", consent = allow) =>
  trafficSource(`https://ayaale.com/offers/example${query}`, referrer, consent, now);

test("only complete catalogue campaigns and recognized external origins receive attribution", () => {
  for (const [name, expected] of [
    ["newsletter", "newsletter"],
    ["facebook", "social"],
    ["instagram", "social"],
    ["partner", "referral"],
  ])
    assert.equal(source(`?${campaignQuery(name)}`), expected);
  assert.equal(source("", "https://www.google.com/search?q=private@example.com"), "search");
  assert.equal(source("", "https://l.facebook.com/path?token=secret"), "social");
  assert.equal(source(`?${campaignQuery("newsletter")}`, "https://www.google.com/"), "newsletter");
});

test("ambiguous or absent evidence remains Unknown rather than Direct", () => {
  for (const query of [
    "",
    "?utm_source=newsletter",
    `?${campaignQuery("facebook")}&utm_source=facebook`,
    `?${campaignQuery("facebook")}&utm_content=private`,
    "?UTM_SOURCE=facebook",
    "?utm_source=unknown&utm_medium=social&utm_campaign=social-launch",
  ])
    assert.equal(source(query), "unknown");
  // Invalid campaign tags must not fall back to a plausible referrer.
  assert.equal(source("?utm_source=unknown", "https://www.google.com/"), "unknown");
  for (const from of [
    "https://ayaale.com/",
    "https://www.google.com.evil.invalid/",
    "http://www.google.com/",
    "https://private.invalid/",
    "https://user:password@www.google.com/",
    "invalid",
  ])
    assert.equal(source("", from), "unknown");
});

test("source collection needs current consent and never forwards arbitrary labels", () => {
  for (const consent of [
    null,
    "invalid",
    JSON.stringify({ choice: "decline", time: now }),
    JSON.stringify({ choice: "allow", time: now - CONSENT_AGE }),
    JSON.stringify({ choice: "allow", time: now + 1 }),
  ])
    assert.equal(source(`?${campaignQuery("newsletter")}`, "", consent), "unknown");
  for (const value of [
    null,
    "direct",
    "Google",
    "private@example.com",
    "social,newsletter",
    "__proto__",
  ])
    assert.equal(acceptedSource(value), "unknown");
});

test("a public landing source survives internal navigation only in its document and fixed time window", async () => {
  const { createSourceContext } = await import("../lib/analytics/traffic-source.mjs");
  const context = createSourceContext();
  const landing = `https://ayaale.com/?${campaignQuery("newsletter")}`;
  assert.equal(context.read(landing, "", allow, now), "newsletter");
  assert.equal(
    context.read("https://ayaale.com/offers/example", "", allow, now + 1000),
    "newsletter",
  );
  assert.equal(
    context.read(
      "https://ayaale.com/offers/example",
      "https://www.google.com/",
      allow,
      now + 30 * 60 * 1000,
    ),
    "unknown",
  );
  assert.equal(context.read(landing, "", allow, now + 30 * 60 * 1000), "unknown");
  assert.equal(
    createSourceContext().read("https://ayaale.com/offers/example", "", allow, now),
    "unknown",
  );
  assert.equal(context.read("https://ayaale.com/partner", "", allow, now), "unknown");
  assert.equal(context.read("https://ayaale.com/offers/example", "", allow, now), "unknown");
  context.read(landing, "", allow, now);
  assert.equal(context.read(landing, "", null, now), "unknown");
  assert.equal(context.read("https://ayaale.com/offers/example", "", allow, now), "unknown");
});
