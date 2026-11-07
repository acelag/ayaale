import assert from "node:assert/strict";
import { test } from "node:test";
import {
  newsletterDeliveryPayload,
  dispatchNewsletters,
  newsletterDigest,
} from "../lib/newsletter/dispatch.mjs";

const job = {
  id: "10000000-0000-4000-8000-000000000001",
  lease: "first",
  key: "stable",
  email: "recipient@example.invalid",
  draft: {
    subject: "Friday picks",
    intro: "Hello <script>bad</script>",
    offers: [
      {
        id: "offer",
        title: "Stay <img>",
        summary: "Selected offer",
        property: "Coast",
        category: "stays",
        price: 10000,
        unit: "per_night",
        startingFrom: false,
        slug: "coast",
        current: true,
      },
    ],
  },
};
const config = {
  origin: "https://ayaale.example.invalid",
  from: "mail@example.invalid",
  linkSecret: "x".repeat(48),
  senderDetails: "Ayaale sender",
  privacyUrl: "https://ayaale.example.invalid/privacy",
};

test("newsletter payloads keep stable opaque links, unsubscribe headers and escaped content", () => {
  const first = newsletterDeliveryPayload(job, config);
  const retry = newsletterDeliveryPayload({ ...job, lease: "second" }, config);
  assert.deepEqual(first, retry);
  assert.match(first.payload.headers["List-Unsubscribe-Post"], /One-Click/);
  assert.match(first.payload.html, /href="https:.*newsletter\/unsubscribe#/);
  assert.doesNotMatch(first.payload.html, /<script>|<img>/);
  assert.doesNotMatch(first.payload.html, /recipient@example/);
  assert.match(first.payload.text, /Unsubscribe:/);
  assert.notEqual(
    newsletterDigest(first.payload.headers["List-Unsubscribe"]),
    first.unsubscribeDigest,
  );
});

test("worker rechecks eligibility before provider send and reuses the logical send key", async () => {
  let sends = 0;
  const totals = await dispatchNewsletters({
    config,
    limit: 1,
    rpc: async (name) => (name === "claim_newsletter_email" ? job : false),
    send: async () => {
      sends++;
      throw new Error("Should not send");
    },
  });
  assert.equal(sends, 0);
  assert.equal(totals.skipped, 1);
  const accepted = await dispatchNewsletters({
    config,
    limit: 1,
    rpc: async (name) => (name === "claim_newsletter_email" ? job : true),
    send: async ({ key }) => {
      assert.equal(key, job.key);
      return { outcome: "sent", provider_id: "id", error_code: null };
    },
  });
  assert.equal(accepted.accepted, 1);
});
