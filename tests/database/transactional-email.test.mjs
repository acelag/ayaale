import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);

const result = async (query, args) => (await db.query(query, args)).rows[0].result;
const claim = () => result("select public.claim_transactional_email() as result");
const prepare = (job, digest = "a".repeat(64)) =>
  result("select public.prepare_transactional_email($1,$2,$3) as result", [
    job.id,
    job.lease,
    digest,
  ]);
const finish = (job, outcome, provider = null, error = null) =>
  result("select public.finish_transactional_email($1,$2,$3,$4,$5) as result", [
    job.id,
    job.lease,
    outcome,
    provider,
    error,
  ]);
const event = (job, status, provider = "provider-message") =>
  result("select public.record_transactional_email_event($1,$2,$3,clock_timestamp()) as result", [
    job.id,
    provider,
    status,
  ]);
const status = (job) =>
  result("select status as result from private.email_delivery_logs where id=$1", [job.id]);

async function transaction(run) {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now()");
    await run();
  } finally {
    await db.query("rollback");
  }
}
async function enqueue(key) {
  await db.query(
    `insert into private.notification_events(recipient_id,property_id,kind,deduplication_key,title,body)
    values($1,$2,'property_verification',$3,'Verification complete','See your dashboard.')`,
    [ids.owner, ids.property1, key],
  );
}
async function makeDue(job) {
  await db.query(
    "update private.email_delivery_logs set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",
    [job.id],
  );
}

test("only the worker can claim delivery and retries keep one stable logical send", () =>
  transaction(async () => {
    const {
      rows: [access],
    } = await db.query(`select
      has_function_privilege('anon','public.claim_transactional_email()','execute') as anon,
      has_function_privilege('authenticated','public.record_transactional_email_event(uuid,text,text,timestamptz)','execute') as partner`);
    assert.deepEqual(access, { anon: false, partner: false });
    await enqueue("first");
    await db.query("set local role service_role");
    const first = await claim();
    assert.ok(first.id);
    assert.equal(await claim(), null);
    assert.equal(await prepare(first), true);
    assert.equal(await finish(first, "retry", null, "provider_http_503"), true);
    assert.equal(await claim(), null);
    await makeDue(first);
    const retry = await claim();
    assert.equal(first.id, retry.id);
    assert.equal(first.key, retry.key);
    assert.notEqual(first.lease, retry.lease);
    assert.equal(await finish(first, "sent", "wrong"), false);
    assert.equal(await prepare(retry), true);

    assert.equal(await event(retry, "delivered"), true);
    assert.equal(await finish(retry, "sent", "provider-message"), false);
    assert.equal(await event(retry, "sent"), true);
    assert.equal(await event(retry, "bounced", "mismatched"), false);
    assert.equal(await status(retry), "delivered");
    assert.equal(await event(retry, "complained"), true);
    await db.query("reset role");
    await enqueue("second");
    assert.equal(await claim(), null);
    assert.equal(await status(retry), "complained");
  }));

test("the worker rejects stale recipients, changed retry payloads and expired retry windows", () =>
  transaction(async () => {
    await enqueue("before-transfer");
    const stale = await claim();
    await db.query(
      "update public.property_memberships set profile_id=$1 where property_id=$2 and role='owner'",
      [ids.replacement, ids.property1],
    );
    assert.equal(await prepare(stale), false);
    assert.equal(await status(stale), "suppressed");
    await db.query(
      "update public.property_memberships set profile_id=$1 where property_id=$2 and role='owner'",
      [ids.owner, ids.property1],
    );

    await enqueue("changed-payload");
    const changed = await claim();
    assert.equal(await prepare(changed), true);
    await makeDue(changed);
    const again = await claim();
    assert.equal(await prepare(again, "b".repeat(64)), false);
    assert.equal(await status(changed), "failed");

    await enqueue("too-old");
    const old = await claim();
    assert.equal(await prepare(old), true);
    await makeDue(old);
    await db.query(
      "update private.email_delivery_logs set first_attempt_at=now()-interval '23 hours' where id=$1",
      [old.id],
    );
    assert.equal(await claim(), null);
    assert.equal(await status(old), "failed");
  }));

test("approval workflows enqueue notices without private reviewer evidence", () =>
  transaction(async () => {
    const id = await offer();
    await approve(await revision(id));
    await db.query(
      `insert into private.property_verification_decisions(property_id,actor_id,action,partner_message,evidence_summary)
      values ($1,$2,'request_info','Private reviewer message','Private reviewer evidence')`,
      [ids.property1, ids.replacement],
    );
    const { rows } = await db.query(
      "select kind,recipient_id,title,body from private.notification_events order by kind",
    );
    assert.deepEqual(
      rows.map(({ kind, recipient_id }) => [kind, recipient_id]),
      [
        ["offer_review", ids.owner],
        ["property_verification", ids.owner],
      ],
    );
    assert.doesNotMatch(JSON.stringify(rows), /Private reviewer/);
  }));
