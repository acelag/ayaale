import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);

async function tx(fn) {
  await db.query("begin");
  try {
    await fn();
  } finally {
    await db.query("rollback");
  }
}

async function authenticate(id) {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}

async function overview() {
  return (await db.query("select public.get_partner_overview() as result")).rows[0].result;
}

async function publishFixture(property) {
  const id = await offer(property);
  const approved = await revision(id);
  await approve(approved);
  await publish(id, approved);
  return id;
}

const zero = { views: 0, whatsapp: 0, calls: 0 };

test("portfolio counts lifetime publications, effective offers and Sri Lanka monthly activity", () =>
  tx(async () => {
    const active = await publishFixture(ids.property1);
    const inactive = await publishFixture(ids.property2);
    await offer(ids.property1);
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [ids.property2],
    );
    await db.query(
      `
      insert into private.offer_view_events(offer_id,deduplication_key,occurred_at,excluded_reason)
      select $1,repeat(key,64),date,reason from (values
        ('a',now(),null),('b',now(),'bot'),('c',now()+interval '1 day',null),
        ('d',(date_trunc('month',now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo')-interval '1 second',null),
        ('e',now()-interval '3 months',null)
      ) as v(key,date,reason)
    `,
      [active],
    );
    await db.query(
      `
      insert into private.contact_click_events(offer_id,channel,deduplication_key,occurred_at,excluded_reason)
      values ($1,'whatsapp',repeat('a',64),now(),null),
        ($1,'whatsapp',repeat('b',64),now(),'internal_test'),
        ($2,'call',repeat('a',64),now(),null),
        ($1,'call',repeat('c',64),(date_trunc('month',now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo')-interval '1 second',null)
    `,
      [active, inactive],
    );
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.owner]);
    await authenticate(ids.owner);
    const result = await overview();
    assert.match(result.currentMonth, /^\d{4}-\d{2}$/);
    assert.notEqual(result.currentMonth, result.previousMonth);
    const properties = new Map(result.properties.map((row) => [row.id, row]));
    assert.deepEqual(properties.get(ids.property1), {
      id: ids.property1,
      published: 1,
      active: 1,
      current: { views: 1, whatsapp: 1, calls: 0 },
      previous: { views: 1, whatsapp: 0, calls: 1 },
    });
    assert.deepEqual(properties.get(ids.property2), {
      id: ids.property2,
      published: 1,
      active: 0,
      current: { views: 0, whatsapp: 0, calls: 1 },
      previous: zero,
    });
    assert.equal(properties.size, 2);
    assert.equal((await db.query("select id from private.contact_click_events")).rowCount, 0);
  }));

test("only verified owners get totals, excluding archived properties and staff assignments", () =>
  tx(async () => {
    const archived = randomUUID();
    await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
      [ids.owner, ids.staff1, ids.third],
    ]);
    await db.query(
      `insert into public.properties(id,slug,name,primary_category,property_type,address,district,archived_at)
      values($1,$2,'Archived property','stays','hotel','Fixture street','Galle',now())`,
      [archived, `synthetic-${archived}`],
    );
    await db.query(
      "insert into public.property_memberships(property_id,profile_id,role) values($1,$2,'owner')",
      [archived, ids.owner],
    );
    await db.query(
      "update public.property_memberships set profile_id=$2 where property_id=$1 and role='owner'",
      [ids.property2, ids.third],
    );
    await db.query(
      "update public.property_memberships set profile_id=$2 where property_id=$1 and role='staff'",
      [ids.property2, ids.owner],
    );
    await authenticate(ids.owner);
    assert.deepEqual((await overview()).properties, [
      { id: ids.property1, active: 0, published: 0, current: zero, previous: zero },
    ]);
    await authenticate(ids.staff1);
    assert.deepEqual((await overview()).properties, []);
    await authenticate(ids.third);
    assert.deepEqual(
      (await overview()).properties.map(({ id }) => id),
      [ids.property2],
    );
    await authenticate(ids.staff2);
    assert.equal(await overview(), null);
    const { rows } = await db.query(
      "select has_function_privilege('anon','public.get_partner_overview()','execute') as allowed",
    );
    assert.equal(rows[0].allowed, false);
  }));

async function analytics(property, days = 30, page = 0) {
  return (
    await db.query("select public.get_property_analytics($1,$2,$3) as result", [
      property,
      days,
      page,
    ])
  ).rows[0].result;
}

test("property analytics counts Sri Lanka days and months across historical offers with scoped access", () =>
  tx(async () => {
    const first = await publishFixture(ids.property1);
    const second = await publishFixture(ids.property2);
    await db.query("update public.offers set status='ended' where id=$1", [first]);
    await offer(ids.property1);
    await db.query(
      `
      with dates as (
        select date_trunc('month',now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo' as boundary
      )
      insert into private.offer_view_events(offer_id,deduplication_key,occurred_at,excluded_reason)
      select $1,repeat(key,64),event_time,reason from dates cross join lateral (values
        ('a',now(),null),('b',boundary-interval '1 second',null),('c',boundary,null),
        ('d',now(),'bot'),('e',now()+interval '1 day',null),('f',now(),'rapid_repeat')
      ) events(key,event_time,reason)
    `,
      [first],
    );
    await db.query(
      `
      insert into private.contact_click_events(offer_id,channel,deduplication_key,excluded_reason)
      values ($1,'whatsapp',repeat('a',64),null),($1,'call',repeat('b',64),null),
        ($1,'call',repeat('c',64),'internal_test'),($2,'call',repeat('d',64),null)
    `,
      [first, second],
    );
    await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
      [ids.staff2, ids.third, ids.owner],
    ]);
    await authenticate(ids.staff2);
    const result = await analytics(ids.property1, 90);
    assert.deepEqual(result.current, { views: 2, whatsapp: 1, calls: 1 });
    assert.deepEqual(result.previous, { views: 1, whatsapp: 0, calls: 0 });
    assert.equal(result.trend.length, 90);
    assert.equal(result.trend.at(-1).calls, 1);
    assert.deepEqual(result.offers, [
      { id: first, title: "Synthetic offer", views: 3, whatsapp: 1, calls: 1 },
    ]);
    assert.equal((await analytics(ids.property1, 7)).trend.length, 7);
    assert.equal((await analytics(ids.property1, 1000)).trend.length, 30);
    assert.deepEqual((await analytics(ids.property1, 90, 1)).offers, []);
    assert.equal(await analytics(ids.property2), null);
    await authenticate(ids.third);
    assert.equal(await analytics(ids.property1), null);
    await authenticate(ids.owner);
    assert.equal((await analytics(ids.property2)).current.calls, 1);
  }));

test("view collection is server-only, deduplicates retries and rejects offers no longer live", () =>
  tx(async () => {
    const offerId = await publishFixture(ids.property1);
    const slug = `synthetic-${offerId}`;
    const token = randomUUID();
    const record = async (event = token) =>
      (await db.query("select public.record_offer_view($1,$2) as result", [slug, event])).rows[0]
        .result;
    const grants = (
      await db.query(`
      select has_function_privilege('anon','public.get_property_analytics(uuid,integer,integer)','execute') as anon_reads,
        has_function_privilege('authenticated','public.record_offer_view(text,uuid)','execute') as user_writes
    `)
    ).rows[0];
    assert.deepEqual(grants, { anon_reads: false, user_writes: false });
    await db.query("set local role service_role");
    assert.equal(await record(), "recorded");
    assert.equal(await record(), "duplicate");
    const event = (
      await db.query(
        "select source,deduplication_key from private.offer_view_events where offer_id=$1",
        [offerId],
      )
    ).rows[0];
    assert.equal(event.source, "unknown");
    assert.match(event.deduplication_key, /^[0-9a-f]{64}$/);
    await db.query("reset role");
    await db.query("update public.offers set status='paused' where id=$1", [offerId]);
    await db.query("set local role service_role");
    assert.equal(await record(randomUUID()), "unavailable");
  }));
