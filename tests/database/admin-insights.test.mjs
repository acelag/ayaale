import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, submit, approve, publish } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);

async function transaction(run) {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now()");
    await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.replacement]);
    await run();
  } finally {
    await db.query("rollback");
  }
}

async function asUser(id) {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}

const result = async (query, args) => (await db.query(query, args)).rows[0].result;
const analytics = (days) =>
  result("select public.get_admin_platform_analytics($1) as result", [days]);
const health = (expiring = 0, inactive = 0) =>
  result("select public.get_admin_content_health($1,$2) as result", [expiring, inactive]);

test("admin analytics aggregates eligible events across properties and excludes invalid activity", () =>
  transaction(async () => {
    const first = await offer();
    const second = await offer(ids.property2);
    const draft = await offer();
    for (const id of [first, second]) {
      const approved = await revision(id);
      await approve(approved);
      await publish(id, approved);
    }
    await db.query(
      `insert into private.offer_view_events(offer_id,deduplication_key,occurred_at,source,source_reliable,excluded_reason)
       values ($1,repeat('a',64),now(),'newsletter',true,null),
              ($2,repeat('b',64),now(),'unknown',false,null),
              ($2,repeat('c',64),now(),'unknown',false,'internal_test'),
              ($2,repeat('d',64),now()-interval '10 days','unknown',false,null),
              ($2,repeat('e',64),now()+interval '2 days','unknown',false,null),
              ($3,repeat('f',64),now(),'unknown',false,null)`,
      [first, second, draft],
    );
    await db.query(
      `insert into private.contact_click_events(offer_id,channel,deduplication_key,excluded_reason)
       values ($1,'whatsapp',repeat('a',64),null),($2,'call',repeat('b',64),null),
              ($2,'call',repeat('c',64),'rapid_repeat')`,
      [first, second],
    );
    assert.equal(
      await result(
        "select has_function_privilege('anon','public.get_admin_platform_analytics(integer)','execute') as result",
      ),
      false,
    );
    assert.equal(
      await result(
        "select has_function_privilege('anon','public.get_admin_content_health(integer,integer)','execute') as result",
      ),
      false,
    );
    for (const id of ["", ids.owner, ids.staff1]) {
      await asUser(id);
      assert.equal(await analytics(7), null);
      assert.equal(await health(), null);
    }
    await asUser(ids.replacement);
    const seven = await analytics(7);
    assert.equal(seven.trend.length, 7);
    assert.equal(seven.viewIngestionReady, true);
    assert.deepEqual(seven.trend.at(-1), {
      date: await result("select (now() at time zone 'Asia/Colombo')::date::text as result"),
      views: 2,
      whatsapp: 1,
      calls: 1,
    });
    assert.equal(seven.trend[0].views, 0);
    assert.deepEqual(seven.sources, [
      { source: "newsletter", views: 1 },
      { source: "unknown", views: 1 },
    ]);
    const defaultRange = await analytics(365);
    assert.equal(defaultRange.trend.length, 30);
    assert.equal(
      defaultRange.trend.reduce((total, day) => total + day.views, 0),
      3,
    );
  }));

test("content health uses live eligibility, earliest end and verified property inactivity", () =>
  transaction(async () => {
    const expiring = await offer();
    const hidden = await offer();
    const endsAt = await result("select (now()+interval '1 day')::text as result");
    for (const id of [expiring, hidden]) {
      const approved = await revision(id);
      await db.query("update private.offer_revisions set publication_ends_at=$2 where id=$1", [
        approved,
        endsAt,
      ]);
      await approve(approved);
      await publish(id, approved);
    }
    await db.query("update public.offers set status='hidden_by_admin' where id=$1", [hidden]);
    const underReview = await offer();
    await submit(await revision(underReview));
    await db.query(
      `insert into private.property_verification_requests(property_id,request_kind,proposed_profile)
      values ($1,'critical_change','{"name":"Proposed hotel"}')`,
      [ids.property1],
    );

    // Age the original verification timestamps in this disposable fixture.
    await db.query("set local session_replication_role='replica'");
    await db.query("update public.properties set verified_at=now()-interval '40 days'");
    await db.query(
      "update private.property_subscriptions set period_ends_at=now()+interval '12 hours' where property_id=$1",
      [ids.property1],
    );
    await db.query("set local session_replication_role='origin'");
    await asUser(ids.replacement);
    const overview = await health();
    assert.equal(overview.propertyReviews, 1);
    assert.equal(overview.offerReviews, 1);
    assert.deepEqual(
      overview.expiring.map((row) => row.id),
      [expiring],
    );
    assert.equal(
      Date.parse(overview.expiring[0].endsAt),
      Date.parse(
        await result(
          "select period_ends_at::text as result from private.property_subscriptions where property_id=$1",
          [ids.property1],
        ),
      ),
    );
    assert.deepEqual(
      overview.inactive.map((row) => [row.id, row.lastActivity]),
      [[ids.property2, null]],
    );
    assert.deepEqual((await health(1, 1)).expiring, []);
    assert.deepEqual((await health(1, 1)).inactive, []);
  }));
