import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";

const { db, setup, cleanup } = createDatabaseHarness();
before(setup);
after(cleanup);
const digest = () => randomBytes(32).toString("hex");
const result = async (sql, args) => (await db.query(sql, args)).rows[0]?.result;
const tokens = () => ({ confirm: digest(), unsubscribe: digest() });
const request = (email, pair, budget = digest()) =>
  result("select public.request_newsletter_signup($1,$2,$3,$4,'privacy-v1') as result", [
    email,
    pair.confirm,
    pair.unsubscribe,
    budget,
  ]);
const apply = (purpose, token) =>
  result("select public.apply_newsletter_token($1,$2) as result", [purpose, token]);
const current = (email) =>
  result("select status as result from private.newsletter_subscribers where email=$1", [email]);

async function transaction(run) {
  await db.query("begin");
  try {
    await db.query("set local role service_role");
    await run();
    await db.query("set constraints all immediate");
  } finally {
    await db.query("rollback");
  }
}

test("double opt-in records matching consent and old links cannot reverse a fresh rejoin", () =>
  transaction(async () => {
    const email = "reader@example.invalid";
    const first = tokens();
    assert.equal((await request(" Reader@Example.Invalid ", first)).status, "send");
    assert.equal(await current(email), "pending");
    assert.equal((await request(email, tokens())).status, "accepted");
    assert.equal(await apply("confirm", first.unsubscribe), "invalid");
    assert.equal(await apply("confirm", first.confirm), "confirmed");
    assert.equal(await apply("confirm", first.confirm), "confirmed");
    assert.equal((await request(email, tokens())).status, "accepted");
    assert.equal(await current(email), "confirmed");
    assert.equal(await apply("unsubscribe", first.unsubscribe), "withdrawn");
    assert.equal(await apply("unsubscribe", first.unsubscribe), "withdrawn");
    assert.equal(await apply("confirm", first.confirm), "invalid");
    assert.equal(await current(email), "unsubscribed");

    const second = tokens();
    assert.equal((await request(email, second)).status, "send");
    assert.equal(await current(email), "unsubscribed");
    assert.equal(await apply("unsubscribe", first.unsubscribe), "invalid");
    assert.equal(await apply("confirm", second.confirm), "confirmed");
    assert.equal(await apply("unsubscribe", first.unsubscribe), "invalid");
    assert.equal(await current(email), "confirmed");
    const { rows } = await db.query(
      "select action,consent_text,consent_version,privacy_version,request_id from private.subscriber_consents order by occurred_at",
    );
    assert.deepEqual(
      rows.map((row) => row.action),
      ["requested", "confirmed", "withdrawn", "requested", "confirmed"],
    );
    assert.equal(rows[0].consent_text, rows[1].consent_text);
    assert.equal(rows[1].consent_version, "t046-v1");
    assert.equal(rows[1].privacy_version, "privacy-v1");
    assert.ok(rows[1].request_id);
  }));

test("pending unsubscribe stops confirmation, expired tokens fail, and budgets bound requests", () =>
  transaction(async () => {
    const email = "pending@example.invalid";
    const first = tokens();
    assert.equal((await request(email, first)).status, "send");
    assert.equal(await apply("unsubscribe", first.unsubscribe), "withdrawn");
    assert.equal(await apply("confirm", first.confirm), "invalid");

    const expired = tokens();
    assert.equal((await request("expired@example.invalid", expired)).status, "send");
    await db.query("reset role");
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.newsletter_tokens set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where token_hash=$1",
      [expired.confirm],
    );
    await db.query("set local session_replication_role='origin'");
    await db.query("set local role service_role");
    assert.equal(await apply("confirm", expired.confirm), "invalid");

    const shared = digest();
    for (let i = 0; i < 4; i++)
      assert.equal((await request(`limit${i}@example.invalid`, tokens(), shared)).status, "send");
    assert.equal((await request("limited@example.invalid", tokens(), shared)).status, "limited");
    assert.equal(await current("limited@example.invalid"), undefined);
    const {
      rows: [acl],
    } = await db.query(`select
      has_function_privilege('anon','public.request_newsletter_signup(text,text,text,text,text)','execute') as anon,
      has_function_privilege('authenticated','public.apply_newsletter_token(text,text)','execute') as authenticated`);
    assert.deepEqual(acl, { anon: false, authenticated: false });
  }));
