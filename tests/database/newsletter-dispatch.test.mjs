import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);
const hash = () => randomBytes(32).toString("hex");
const value = async (sql, args) => (await db.query(sql, args)).rows[0]?.result;
async function identity(id) {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
async function transaction(run) {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now()");
    await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.replacement]);
    const choices = [];
    for (let i = 0; i < 5; i++) {
      const id = await offer(i < 3 ? ids.property1 : ids.property2);
      const rev = await revision(id, 1, i < 3 ? "stays" : "dining");
      await db.query(
        "update private.offer_revisions set publication_ends_at=now()+interval '30 days' where id=$1",
        [rev],
      );
      await approve(rev);
      await publish(id, rev);
      choices.push({ id, rev });
    }
    const friday = await value(`select (((now() at time zone 'Asia/Colombo')::date +
      (case when extract(dow from now() at time zone 'Asia/Colombo')=5 then 7
      else (5-extract(dow from now() at time zone 'Asia/Colombo')::int+7)%7 end))::timestamp
      at time zone 'Asia/Colombo' + interval '10 hours')::text as result`);
    await identity(ids.replacement);
    const saved = await value(
      "select public.save_admin_newsletter(null,'','Friday picks','Selected offers',$1,$2) as result",
      [choices.map((x) => x.id), choices.map((x) => x.rev)],
    );
    await run(saved.id, friday, choices);
    await db.query("reset role; set constraints all immediate");
  } finally {
    await db.query("rollback");
  }
}
const detail = (id) => value("select public.get_admin_newsletter($1) as result", [id]);
const schedule = async (id, at) =>
  value("select public.schedule_admin_newsletter($1,$2,$3,false) as result", [
    id,
    (await detail(id)).version,
    at,
  ]);
async function subscriber(email) {
  await db.query("reset role");
  const confirm = hash(),
    unsubscribe = hash();
  assert.equal(
    (
      await value("select public.request_newsletter_signup($1,$2,$3,$4,'test-v1') as result", [
        email,
        confirm,
        unsubscribe,
        hash(),
      ])
    ).status,
    "send",
  );
  assert.equal(
    await value("select public.apply_newsletter_token('confirm',$1) as result", [confirm]),
    "confirmed",
  );
  return unsubscribe;
}
const claim = (at) => value("select private.claim_newsletter_email_at($1) as result", [at]);
async function prepare(job, at) {
  const unsubscribe = hash();
  const clicks = Object.fromEntries(job.draft.offers.map((x) => [x.id, hash()]));
  assert.equal(
    await value("select private.prepare_newsletter_email_at($1,$2,$3,$4,$5,$6) as result", [
      job.id,
      job.lease,
      "a".repeat(64),
      unsubscribe,
      clicks,
      at,
    ]),
    true,
  );
  return { unsubscribe, clicks };
}

test("Friday dispatch deduplicates recipients, records signed outcomes, clicks and unsubscribes", () =>
  transaction(async (id, at) => {
    const monday = await value("select ($1::timestamptz+interval '3 days')::text as result", [at]);
    assert.equal(await schedule(id, monday), "friday");
    assert.equal(await schedule(id, at), "saved");
    await subscriber("first@example.invalid");
    await subscriber("second@example.invalid");
    assert.equal(
      await claim(
        await value("select ($1::timestamptz-interval '1 minute')::text as result", [at]),
      ),
      null,
    );
    const first = await claim(at);
    assert.ok(first.id);
    const links = await prepare(first, at);
    const second = await claim(at);
    assert.notEqual(second.id, first.id);
    await prepare(second, at);
    assert.equal(await claim(at), null);
    assert.equal(
      await value(
        "select public.finish_transactional_email($1,$2,'sent','provider-first',null) as result",
        [first.id, first.lease],
      ),
      true,
    );
    assert.equal(
      await value(
        "select public.record_transactional_email_event($1,'provider-first','delivered',clock_timestamp()) as result",
        [first.id],
      ),
      true,
    );
    const click = Object.values(links.clicks)[0];
    assert.ok(await value("select public.record_newsletter_click($1,true) as result", [click]));
    assert.ok(await value("select public.record_newsletter_click($1,true) as result", [click]));
    assert.equal(
      await value("select public.apply_newsletter_token('unsubscribe',$1) as result", [
        links.unsubscribe,
      ]),
      "withdrawn",
    );
    assert.equal(
      await value(
        "select public.finish_transactional_email($1,$2,'sent','provider-second',null) as result",
        [second.id, second.lease],
      ),
      true,
    );
    assert.equal(
      await value(
        "select public.record_transactional_email_event($1,'provider-second','bounced',clock_timestamp()) as result",
        [second.id],
      ),
      true,
    );
    assert.equal(
      await value("select status as result from private.newsletter_subscribers where email=$1", [
        second.email,
      ]),
      "suppressed",
    );
    await claim(at);
    await identity(ids.replacement);
    const metrics = await value("select public.get_admin_newsletter_metrics($1) as result", [id]);
    assert.equal(metrics.status, "sent");
    assert.equal(metrics.audience, 2);
    assert.equal(metrics.accepted, 2);
    assert.equal(metrics.delivered, 1);
    assert.equal(metrics.clicked, 1);
    assert.equal(metrics.bounced, 1);
    assert.equal(metrics.unsubscribed, 1);
    assert.equal(
      await value(
        "select has_function_privilege('authenticated','public.claim_newsletter_email()','execute') as result",
      ),
      false,
    );
  }));

test("withdrawal after queueing and expired selections prevent sending", () =>
  transaction(async (id, at, choices) => {
    assert.equal(await schedule(id, at), "saved");
    const withdraw = await subscriber("consent@example.invalid");
    const job = await claim(at);
    assert.ok(job);
    assert.equal(
      await value("select public.apply_newsletter_token('unsubscribe',$1) as result", [withdraw]),
      "withdrawn",
    );
    assert.equal(
      await value("select private.prepare_newsletter_email_at($1,$2,$3,$4,$5,$6) as result", [
        job.id,
        job.lease,
        hash(),
        hash(),
        Object.fromEntries(choices.map((x) => [x.id, hash()])),
        at,
      ]),
      false,
    );
    await db.query("update public.offers set status='paused' where id=$1", [choices[0].id]);
    assert.equal(await claim(at), null);
    assert.equal(
      await value("select status as result from private.newsletters where id=$1", [id]),
      "failed",
    );
  }));

test("weekly reservations, repeated selections and stale scheduling are rejected", () =>
  transaction(async (id, at, choices) => {
    const old = await detail(id);
    assert.equal(await schedule(id, at), "saved");
    assert.equal(
      await value("select public.schedule_admin_newsletter($1,$2,$3,false) as result", [
        id,
        old.version,
        at,
      ]),
      "stale",
    );
    const second = await value(
      "select public.save_admin_newsletter(null,'','Another draft','',$1,$2) as result",
      [choices.map((x) => x.id), choices.map((x) => x.rev)],
    );
    assert.equal(await schedule(second.id, at), "week_taken");
    const next = await value("select ($1::timestamptz+interval '7 days')::text as result", [at]);
    assert.equal(await schedule(second.id, next), "repetitive");
    await identity(ids.owner);
    assert.equal(
      await value("select public.schedule_admin_newsletter($1,'',$2,false) as result", [
        second.id,
        at,
      ]),
      "forbidden",
    );
    assert.equal(
      await value("select public.get_admin_newsletter_metrics($1) as result", [id]),
      null,
    );
  }));

for (const expiry of ["publication", "redemption", "subscription"]) {
  test(`T054 ${expiry} expiry after claiming a newsletter suppresses preparation without issuing links`, () =>
    transaction(async (id, at, choices) => {
      assert.equal(await schedule(id, at), "saved");
      await subscriber(`late-${expiry}@example.invalid`);
      const job = await claim(at);
      assert.ok(job);
      await db.query("reset role; set local session_replication_role='replica'");
      if (expiry === "publication")
        await db.query("update private.offer_revisions set publication_ends_at=$2 where id=$1", [
          choices[0].rev,
          at,
        ]);
      else if (expiry === "redemption")
        await db.query(
          "update private.offer_revisions set redemption_starts_on=($2::timestamptz at time zone 'Asia/Colombo')::date-2,redemption_ends_on=($2::timestamptz at time zone 'Asia/Colombo')::date-1 where id=$1",
          [choices[0].rev, at],
        );
      else
        await db.query(
          "update private.property_subscriptions set period_ends_at=$2 where property_id=$1",
          [ids.property1, at],
        );
      await db.query("set local session_replication_role='origin'");
      assert.equal(
        await value("select private.prepare_newsletter_email_at($1,$2,$3,$4,$5,$6) as result", [
          job.id,
          job.lease,
          hash(),
          hash(),
          Object.fromEntries(choices.map((item) => [item.id, hash()])),
          at,
        ]),
        false,
      );
      const log = (
        await db.query(
          "select status,last_error_code,payload_digest from private.email_delivery_logs where id=$1",
          [job.id],
        )
      ).rows[0];
      assert.deepEqual(log, {
        status: "suppressed",
        last_error_code: "dispatch_ineligible",
        payload_digest: null,
      });
      assert.equal(await value("select count(*)::int as result from private.newsletter_links"), 0);
      assert.equal(
        await value(
          "select count(*)::int as result from private.newsletter_tokens where newsletter_delivery_id is not null",
        ),
        0,
      );
    }));
}
