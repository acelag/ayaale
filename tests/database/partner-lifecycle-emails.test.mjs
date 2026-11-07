import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);

async function transaction(run) {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now()");
    await run();
  } finally {
    await db.query("rollback");
  }
}
const result = async (sql, params) => (await db.query(sql, params)).rows[0].result;
const runAt = (at) =>
  result("select private.queue_partner_lifecycle_emails_at($1) as result", [at]);

test("trial reminders queue at 30, 7 and 1 Sri Lanka calendar days and survive transfers without duplication", () =>
  transaction(async () => {
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [ids.property2],
    );
    const at = (days) =>
      result(
        `select (((period_ends_at at time zone 'Asia/Colombo')::date-$2::integer)::timestamp
        at time zone 'Asia/Colombo')::text as result from private.property_subscriptions where property_id=$1`,
        [ids.property1, days],
      );
    assert.equal((await runAt(await at(31))).trialReminders, 0);
    assert.equal((await runAt(await at(30))).trialReminders, 1);
    assert.equal((await runAt(await at(30))).trialReminders, 0);
    await db.query(
      "update public.property_memberships set profile_id=$1 where property_id=$2 and role='owner'",
      [ids.replacement, ids.property1],
    );
    assert.equal((await runAt(await at(30))).trialReminders, 0);
    assert.equal((await runAt(await at(29))).trialReminders, 0);
    assert.equal((await runAt(await at(7))).trialReminders, 1);
    assert.equal((await runAt(await at(1))).trialReminders, 1);
    assert.equal((await runAt(await at(0))).trialReminders, 0);
    const { rows } = await db.query(
      "select recipient_id,deduplication_key,body from private.notification_events where kind='trial_reminder' order by created_at",
    );
    assert.deepEqual(
      rows.map(({ recipient_id, deduplication_key }) => [
        recipient_id,
        deduplication_key.split(":").at(-1),
      ]),
      [
        [ids.owner, "30"],
        [ids.replacement, "7"],
        [ids.replacement, "1"],
      ],
    );
    assert.ok(rows.every(({ body }) => body.includes("will not charge you automatically")));
  }));

test("monthly totals cover the previous Sri Lanka calendar month and keep property data separate", () =>
  transaction(async () => {
    const first = await offer(ids.property1);
    const second = await offer(ids.property2);
    for (const id of [first, second]) {
      const rev = await revision(id);
      await approve(rev);
      await publish(id, rev);
    }
    await db.query(
      "update public.property_memberships set profile_id=$1 where property_id=$2 and role='owner'",
      [ids.replacement, ids.property2],
    );
    await db.query("set local session_replication_role='replica'");
    await db.query("update public.properties set verified_at='2026-08-01Z'");
    await db.query("update public.offers set first_published_at='2026-09-01Z'");
    await db.query("set local session_replication_role='origin'");
    await db.query(
      `insert into private.offer_view_events(offer_id,deduplication_key,occurred_at,excluded_reason)
       values ($1,repeat('a',64),'2026-09-30 18:29:59+00',null),
              ($1,repeat('b',64),'2026-09-30 18:30:00+00',null),
              ($1,repeat('c',64),'2026-10-31 18:29:59+00',null),
              ($1,repeat('d',64),'2026-10-31 18:30:00+00',null),
              ($1,repeat('e',64),'2026-10-15 00:00:00+00','internal_test'),
              ($2,repeat('f',64),'2026-10-15 00:00:00+00',null)`,
      [first, second],
    );
    await db.query(
      `insert into private.contact_click_events(offer_id,channel,deduplication_key,occurred_at,excluded_reason)
       values ($1,'whatsapp',repeat('a',64),'2026-10-15 00:00:00+00',null),
              ($1,'call',repeat('b',64),'2026-10-15 00:00:00+00','bot'),
              ($2,'call',repeat('c',64),'2026-10-15 00:00:00+00',null)`,
      [first, second],
    );

    assert.equal((await runAt("2026-11-08 00:05:00+05:30")).monthlySummaries, 0);
    assert.equal((await runAt("2026-11-01 00:05:00+05:30")).monthlySummaries, 2);
    assert.equal((await runAt("2026-11-06 09:05:00+05:30")).monthlySummaries, 0);
    const { rows } = await db.query(
      "select property_id,recipient_id,title,body from private.notification_events where kind='performance_summary'",
    );
    const one = rows.find((row) => row.property_id === ids.property1);
    const two = rows.find((row) => row.property_id === ids.property2);
    assert.equal(one.recipient_id, ids.owner);
    assert.match(one.title, /October 2026/);
    assert.match(one.body, /views: 2\nWhatsApp clicks: 1\nCall clicks: 0/);
    assert.equal(two.recipient_id, ids.replacement);
    assert.match(two.body, /views: 1\nWhatsApp clicks: 0\nCall clicks: 1/);
    await db.query(
      "update public.property_memberships set profile_id=$1 where property_id=$2 and role='owner'",
      [ids.owner, ids.property2],
    );
    assert.equal((await runAt("2026-11-07 09:05:00+05:30")).monthlySummaries, 0);
  }));

test("browser roles cannot queue partner email and the worker suppresses a cancelled trial", () =>
  transaction(async () => {
    const {
      rows: [acl],
    } = await db.query(`select
      has_function_privilege('anon','public.queue_partner_lifecycle_emails()','execute') as anon,
      has_function_privilege('authenticated','public.queue_partner_lifecycle_emails()','execute') as partner,
      has_function_privilege('service_role','private.queue_partner_lifecycle_emails_at(timestamptz)','execute') as can_set_clock`);
    assert.deepEqual(acl, { anon: false, partner: false, can_set_clock: false });
    await db.query(
      `insert into private.notification_events(recipient_id,property_id,kind,deduplication_key,title,body)
      values ($1,$2,'trial_reminder','t044:trial:' || $2::uuid || ':30','Trial reminder','See your subscription')`,
      [ids.owner, ids.property1],
    );
    const job = await result("select public.claim_transactional_email() as result");
    assert.equal(job.kind, "trial_reminder");
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [ids.property1],
    );
    assert.equal(
      await result("select public.prepare_transactional_email($1,$2,$3) as result", [
        job.id,
        job.lease,
        "a".repeat(64),
      ]),
      false,
    );
    assert.equal(
      await result("select status as result from private.email_delivery_logs where id=$1", [
        job.id,
      ]),
      "suppressed",
    );
  }));
