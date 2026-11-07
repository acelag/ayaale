import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyResendEvent } from "../lib/email/resend-events.mjs";
import {
  dispatchTransactionalEmails,
  sendWithResend,
  transactionalPayload,
} from "../lib/email/transactional.mjs";

const settings = {
  from: "Ayaale <mail@example.invalid>",
  origin: "https://ayaale.example.invalid",
};
const job = {
  id: "10000000-0000-4000-8000-000000000001",
  lease: "lease",
  key: "email-key",
  email: "partner@example.invalid",
  kind: "offer_review",
  title: "Offer approved\r\nBcc: test",
  body: "Your revision is approved.",
  propertyId: "10000000-0000-4000-8000-000000000002",
};

test("worker prepares a stable digest and sends the same provider key on retry", async () => {
  const seen = [];
  for (const lease of ["first", "second"]) {
    const totals = await dispatchTransactionalEmails({
      ...settings,
      limit: 1,
      rpc: async (name, args) => {
        if (name === "claim_transactional_email") return { ...job, lease };
        if (name === "prepare_transactional_email") seen.push(args.digest);
        return true;
      },
      send: async ({ body, key }) => {
        assert.equal(key, job.key);
        assert.equal(JSON.parse(body).tags[0].value, job.id);
        assert.doesNotMatch(JSON.parse(body).subject, /[\r\n]/);
        return lease === "first" ? { outcome: "retry" } : { outcome: "sent" };
      },
    });
    assert.equal(lease === "first" ? totals.deferred : totals.accepted, 1);
  }
  assert.equal(seen[0], seen[1]);
  const critical = transactionalPayload(
    { ...job, kind: "complaint", critical: true, body: "PRIVATE REPORT" },
    settings,
  );
  assert.doesNotMatch(critical.text, /PRIVATE REPORT/);
  assert.match(critical.text, /\/admin\/reports/);
});

test("trial reminders and monthly summaries link to their property pages", () => {
  assert.match(
    transactionalPayload({ ...job, kind: "trial_reminder" }, settings).text,
    /\/subscription/,
  );
  assert.match(
    transactionalPayload({ ...job, kind: "performance_summary" }, settings).text,
    /\/analytics/,
  );
});

test("provider failures are categorized without logging response details", async () => {
  const send = (status, json) =>
    sendWithResend({
      apiKey: "fake",
      key: "stable-key",
      body: "{}",
      fetcher: async (_url, options) => {
        assert.equal(options.headers["Idempotency-Key"], "stable-key");
        return Response.json(json, { status });
      },
    });
  assert.equal((await send(429, { message: "private" })).outcome, "retry");
  assert.equal((await send(409, { name: "concurrent_idempotent_requests" })).outcome, "retry");
  assert.equal((await send(409, { name: "invalid_idempotent_request" })).outcome, "failed");
  assert.equal((await send(422, { message: "private" })).error_code, "provider_http_422");
  assert.equal((await send(200, { id: "valid-id" })).provider_id, "valid-id");
  await assert.rejects(send(401, {}), /authorization/);
});

test("delivery callbacks require a valid fresh signature over the raw request", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const stamp = String(now / 1000);
  const id = "msg_synthetic";
  const key = Buffer.alloc(32, 7);
  const secret = `whsec_${key.toString("base64")}`;
  const provider = "20000000-0000-4000-8000-000000000001";
  const raw = Buffer.from(
    JSON.stringify({
      type: "email.delivered",
      created_at: new Date(now).toISOString(),
      data: { email_id: provider, tags: { ayaale_delivery: job.id } },
    }),
  );
  const signature = createHmac("sha256", key)
    .update(`${id}.${stamp}.`)
    .update(raw)
    .digest("base64");
  const headers = new Headers({
    "svix-id": id,
    "svix-timestamp": stamp,
    "svix-signature": `v1,${signature}`,
  });
  assert.deepEqual(verifyResendEvent(raw, headers, secret, now), {
    delivery_id: job.id,
    provider_id: provider,
    event_status: "delivered",
    occurred_at: new Date(now).toISOString(),
  });
  assert.throws(() =>
    verifyResendEvent(Buffer.concat([raw, Buffer.from(" ")]), headers, secret, now),
  );
  assert.throws(() => verifyResendEvent(raw, headers, secret, now + 301_000));
});
