import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import pg from "pg";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, testUrl, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);
async function transaction(fn) {
  await db.query("begin");
  try {
    await fn();
  } finally {
    await db.query("rollback");
  }
}
async function rejects(sql, params = [], code = "23514") {
  await db.query("savepoint expected_failure");
  try {
    await assert.rejects(db.query(sql, params), (error) => error.code === code);
  } finally {
    await db.query("rollback to savepoint expected_failure; release savepoint expected_failure");
  }
}
async function property(verified = true) {
  const id = randomUUID();
  await db.query(
    `insert into public.properties(id,slug,name,primary_category,property_type,address,district,
    latitude,longitude,google_maps_url,verification_status)
    values($1,$2,'Synthetic hotel','stays','hotel','Synthetic address','Colombo',6.9,79.8,
    'https://maps.google.com/?q=6.9,79.8',$3)`,
    [id, `synthetic-${id}`, verified ? "verified" : "pending"],
  );
  await db.query(
    "insert into public.property_memberships(property_id,profile_id,role) values($1,$2,'owner')",
    [id, ids.owner],
  );
  return id;
}
async function prepared(propertyId) {
  const id = await offer(propertyId),
    rev = await revision(id);
  await approve(rev);
  return { id, rev };
}
async function activate(item) {
  await publish(item.id, item.rev);
}
async function clients(fn) {
  const a = new pg.Client({ connectionString: testUrl.toString() });
  const b = new pg.Client({ connectionString: testUrl.toString() });
  await Promise.all([a.connect(), b.connect()]);
  try {
    await fn(a, b);
  } finally {
    await Promise.all([a.query("rollback"), b.query("rollback")]);
    await Promise.all([a.end(), b.end()]);
  }
}

test("Starter catalogue stores exact LKR periods, cap three and disabled payments", async () => {
  assert.deepEqual(
    (await db.query("select code,active_offer_limit,payments_enabled from public.plans")).rows,
    [{ code: "starter", active_offer_limit: 3, payments_enabled: false }],
  );
  assert.deepEqual(
    (
      await db.query(
        "select billing_months,amount,currency from public.plan_prices order by billing_months",
      )
    ).rows,
    [1, 6, 12].map((months, i) => ({
      billing_months: months,
      amount: ["1500.00", "8000.00", "15000.00"][i],
      currency: "LKR",
    })),
  );
  await transaction(async () => {
    await rejects("update public.plans set payments_enabled=true");
    await rejects("update public.plans set active_offer_limit=4");
    await rejects("update public.plan_prices set amount='NaN'");
    await rejects(
      `insert into private.property_subscriptions(property_id,plan_id,price_id,kind,status,period_starts_at,period_ends_at)
      select $1,p.plan_id,p.id,'paid','active',now(),now()+interval '1 month' from public.plan_prices p where billing_months=1`,
      [ids.property1],
    );
  });
});

test("five entitlement tables deny browser access and restrict trusted catalogue/ledger writes", async () => {
  const { rows } = await db.query(`select c.relrowsecurity,
    has_table_privilege('anon',c.oid,'select,insert,update,delete') as anon_access,
    has_table_privilege('authenticated',c.oid,'select,insert,update,delete') as user_access
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' and c.relname in ('plans','plan_prices')) or
    (n.nspname='private' and c.relname in ('property_subscriptions','trial_campaigns','trial_allocations'))`);
  assert.equal(rows.length, 5);
  for (const row of rows)
    assert.deepEqual(row, { relrowsecurity: true, anon_access: false, user_access: true });
  const privileges = (
    await db.query(`select
    has_table_privilege('service_role','public.plans','update') as edit_plan,
    has_table_privilege('service_role','private.trial_allocations','delete') as recycle_trial,
    has_function_privilege('authenticated','private.allocate_launch_trial(uuid)','execute') as allocate`)
  ).rows[0];
  assert.deepEqual(privileges, { edit_plan: false, recycle_trial: false, allocate: false });
});

test("registration reserves no slot; first approval stamps and allocates six calendar months", async () => {
  await transaction(async () => {
    const id = await property(false);
    assert.equal(
      (await db.query("select count(*) from private.trial_allocations where property_id=$1", [id]))
        .rows[0].count,
      "0",
    );
    await rejects("select private.allocate_launch_trial($1)", [id]);
    await db.query(
      "update public.properties set verification_status='verified',verified_at='2000-01-01' where id=$1",
      [id],
    );
    const row = (
      await db.query(
        `select p.verified_at=s.period_starts_at as same_start,
      s.period_ends_at=(((p.verified_at at time zone 'Asia/Colombo')+interval '6 months') at time zone 'Asia/Colombo') as six_months,
      p.verified_at>now()-interval '1 minute' as stamped,a.subscription_id=s.id as linked
      from public.properties p join private.property_subscriptions s on s.property_id=p.id
      join private.trial_allocations a on a.property_id=p.id where p.id=$1`,
        [id],
      )
    ).rows[0];
    assert.deepEqual(row, { same_start: true, six_months: true, stamped: true, linked: true });
    await db.query("set constraints all immediate");
  });
});

test("ownership transfer and reverification cannot restart or extend a trial", async () => {
  await transaction(async () => {
    const original = (
      await db.query("select * from private.property_subscriptions where property_id=$1", [
        ids.property1,
      ])
    ).rows[0];
    await db.query(
      "update public.property_memberships set profile_id=$2 where property_id=$1 and role='owner'",
      [ids.property1, ids.replacement],
    );
    await db.query("update public.properties set verification_status='suspended' where id=$1", [
      ids.property1,
    ]);
    await db.query("update public.properties set verification_status='verified' where id=$1", [
      ids.property1,
    ]);
    assert.equal(
      (await db.query("select private.allocate_launch_trial($1) as id", [ids.property1])).rows[0]
        .id,
      original.id,
    );
    await rejects("update public.properties set verified_at=now()+interval '1 day' where id=$1", [
      ids.property1,
    ]);
    await rejects(
      "update private.property_subscriptions set period_ends_at=period_ends_at+interval '1 day' where id=$1",
      [original.id],
    );
    await rejects("update private.property_subscriptions set status='expired' where id=$1", [
      original.id,
    ]);
    await db.query("update private.property_subscriptions set status='cancelled' where id=$1", [
      original.id,
    ]);
    await rejects("update private.property_subscriptions set status='active' where id=$1", [
      original.id,
    ]);
    await rejects(
      "delete from private.trial_allocations where property_id=$1",
      [ids.property1],
      "55000",
    );
    await rejects(
      "update private.trial_allocations set approved_at=now() where property_id=$1",
      [ids.property1],
      "55000",
    );
    await rejects("delete from public.properties where id=$1", [ids.property1], "23503");
  });
});

test("campaign counter cannot diverge from ledger or recycle an allocation", async () => {
  await transaction(async () => {
    await rejects("update private.trial_campaigns set allocated_count=allocated_count-1");
    await rejects("update private.trial_campaigns set allocation_limit=101");
    await rejects(
      "update private.trial_campaigns set allocated_count=allocated_count+1; set constraints all immediate",
    );
  });
});

test("rolled-back approval consumes no trial slot", async () => {
  const beforeCount = (await db.query("select allocated_count from private.trial_campaigns"))
    .rows[0].allocated_count;
  await transaction(async () => {
    await property();
    await db.query("set constraints all immediate");
  });
  assert.equal(
    (await db.query("select allocated_count from private.trial_campaigns")).rows[0].allocated_count,
    beforeCount,
  );
});

test("three active offers per property; paused/ended offers free capacity and drafts remain unlimited", async () => {
  await transaction(async () => {
    const items = [];
    for (let i = 0; i < 5; i++) items.push(await prepared(ids.property1));
    for (const item of items.slice(0, 3)) await activate(item);
    await rejects("update public.offers set status='active',approved_revision_id=$2 where id=$1", [
      items[3].id,
      items[3].rev,
    ]);
    await db.query("update public.offers set status='paused' where id=$1", [items[0].id]);
    await activate(items[3]);
    await rejects("update public.offers set status='active' where id=$1", [items[0].id]);
    await db.query("update public.offers set status='ended' where id=$1", [items[1].id]);
    await activate(items[4]);
    const other = await prepared(ids.property2);
    await activate(other);
    for (let i = 0; i < 8; i++) await offer();
    assert.equal(
      (
        await db.query(
          "select count(*) from public.offers where property_id=$1 and status='draft'",
          [ids.property1],
        )
      ).rows[0].count,
      "8",
    );
  });
});

test("trial end is exclusive; effective offers disappear without deleting history or autocharging", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    await db.query(
      "update private.offer_revisions set publication_ends_at=now()+interval '7 months',redemption_ends_on=current_date+250 where id=$1",
      [rev],
    );
    await approve(rev);
    await publish(id, rev);
    const result = (
      await db.query(
        `select
      private.offer_is_effectively_active($2,s.period_ends_at-interval '1 microsecond') as before_end,
      private.offer_is_effectively_active($2,s.period_ends_at) as at_end,
      (select count(*) from private.current_property_entitlement($1,s.period_starts_at-interval '1 microsecond')) as before_start,
      (select count(*) from private.current_property_entitlement($1,s.period_starts_at)) as at_start
      from private.property_subscriptions s where property_id=$1`,
        [ids.property1, id],
      )
    ).rows[0];
    assert.deepEqual(result, { before_end: true, at_end: false, before_start: "0", at_start: "1" });
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [ids.property1],
    );
    assert.equal(
      (await db.query("select private.offer_is_effectively_active($1) as active", [id])).rows[0]
        .active,
      false,
    );
    await rejects("update public.offers set status='active' where id=$1", [id]);
    await offer();
    assert.equal(
      (await db.query("select count(*) from private.offer_status_history where offer_id=$1", [id]))
        .rows[0].count,
      "2",
    );
    assert.equal(
      (await db.query("select count(*) from private.property_subscriptions where kind='paid'"))
        .rows[0].count,
      "0",
    );
  });
});

async function raceOffers(isolation) {
  await db.query("begin");
  const id = await property(),
    items = [];
  for (let i = 0; i < 4; i++) items.push(await prepared(id));
  for (const item of items.slice(0, 2)) await activate(item);
  await db.query("commit");
  await clients(async (a, b) => {
    await Promise.all([
      a.query(`begin isolation level ${isolation}`),
      b.query(`begin isolation level ${isolation}`),
    ]);
    await Promise.all([
      a.query("select count(*) from public.offers"),
      b.query("select count(*) from public.offers"),
    ]);
    const action = async (client, item) => {
      try {
        await client.query(
          "update public.offers set status='active',approved_revision_id=$2 where id=$1",
          [item.id, item.rev],
        );
        await client.query("commit");
        return "ok";
      } catch (error) {
        await client.query("rollback");
        return error.code;
      }
    };
    const outcomes = await Promise.all([action(a, items[2]), action(b, items[3])]);
    assert.deepEqual(
      outcomes.sort(),
      [isolation === "repeatable read" ? "40001" : "23514", "ok"].sort(),
    );
  });
  assert.equal(
    (
      await db.query(
        "select count(*) from public.offers where property_id=$1 and status='active'",
        [id],
      )
    ).rows[0].count,
    "3",
  );
}
test("simultaneous final offer-slot claims serialize under READ COMMITTED", async () => {
  await raceOffers("read committed");
});
test("stale REPEATABLE READ writers must retry instead of exceeding cap", async () => {
  await raceOffers("repeatable read");
});

test("concurrent approvals competing for slot 100 grant exactly one trial; 101st can still verify", async () => {
  await db.query("begin");
  const used = (await db.query("select allocated_count from private.trial_campaigns")).rows[0]
    .allocated_count;
  for (let i = used; i < 99; i++) await property();
  await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
    [ids.owner, ids.replacement],
  ]);
  await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.replacement]);
  const candidates = [randomUUID(), randomUUID()];
  const asUser = async (client, id) => {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  };
  const counter = async (client) =>
    (await client.query("select public.get_admin_overview()->'launchTrial' as result")).rows[0]
      .result;
  await asUser(db, ids.owner);
  for (const [index, id] of candidates.entries()) {
    const { rows } = await db.query("select public.register_partner_property($1,$2) as result", [
      id,
      {
        name: index === 0 ? "Galle Launch Hotel" : "Matara Launch Resort",
        contact_name: "Fixture owner",
        primary_category: "stays",
        property_type: "hotel",
        address: index === 0 ? "100 Galle Road" : "101 Matara Road",
        district: index === 0 ? "Galle" : "Matara",
        public_phone: index === 0 ? "+94771234560" : "+94771234561",
      },
    ]);
    assert.equal(rows[0].result, "registered");
  }
  assert.equal(await counter(db), null);
  await asUser(db, ids.replacement);
  assert.deepEqual(await counter(db), { allocated: 99, limit: 100, remaining: 1 });
  const versions = [];
  for (const id of candidates) {
    const { rows } = await db.query(
      "select public.get_admin_verifications($1)->>'version' as version",
      [id],
    );
    versions.push(rows[0].version);
  }
  await db.query("commit");
  await clients(async (a, b) => {
    await Promise.all([a.query("begin"), b.query("begin")]);
    await Promise.all([asUser(a, ids.replacement), asUser(b, ids.replacement)]);
    const decision = (client, index) =>
      client.query("select public.decide_property_verification($1,$2,'approve',$3) as result", [
        candidates[index],
        versions[index],
        {
          method: "both",
          evidence: "Verified business and applicant",
          existence: true,
          authority: true,
          maps:
            index === 0
              ? "https://maps.google.com/?q=6.02,80.22"
              : "https://maps.google.com/?q=5.94,80.55",
          latitude: index === 0 ? "6.02" : "5.94",
          longitude: index === 0 ? "80.22" : "80.55",
        },
      ]);
    assert.equal((await decision(a, 0)).rows[0].result, "saved");
    // Other administrators still see committed availability while the winner is in flight.
    assert.deepEqual(await counter(b), { allocated: 99, limit: 100, remaining: 1 });
    const pid = async (client) =>
      (await client.query("select pg_backend_pid() as pid")).rows[0].pid;
    const [winnerPid, competingPid] = await Promise.all([pid(a), pid(b)]);
    const competingApproval = decision(b, 1);
    try {
      const deadline = Date.now() + 5000;
      while (true) {
        const { rows } = await db.query(
          "select $1::integer = any(pg_blocking_pids($2)) as waiting",
          [winnerPid, competingPid],
        );
        if (rows[0].waiting) break;
        assert.ok(Date.now() < deadline, "Expected the competing approval to wait for the winner");
        await setTimeout(15);
      }
    } finally {
      await a.query("commit");
    }
    assert.equal((await competingApproval).rows[0].result, "saved");
    assert.equal((await decision(b, 1)).rows[0].result, "stale");
    assert.deepEqual(await counter(b), { allocated: 100, limit: 100, remaining: 0 });
    await b.query("commit");
  });
  assert.equal(
    (await db.query("select allocated_count from private.trial_campaigns")).rows[0].allocated_count,
    100,
  );
  assert.equal(
    (await db.query("select count(*) from private.trial_allocations")).rows[0].count,
    "100",
  );
  assert.equal(
    (
      await db.query(
        "select count(*) from private.trial_allocations where property_id=any($1::uuid[])",
        [candidates],
      )
    ).rows[0].count,
    "1",
  );
  assert.equal(
    (
      await db.query(
        "select count(*) from public.properties where id=any($1::uuid[]) and verification_status='verified'",
        [candidates],
      )
    ).rows[0].count,
    "2",
  );
});

test("the subscription projection exposes trial dates, live usage and catalogue prices only to the current owner", () =>
  transaction(async () => {
    const pending = await property(false);
    await activate(await prepared(ids.property1));
    await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
      [ids.owner, ids.staff1, ids.third],
    ]);
    await db.query(
      "update public.property_memberships set profile_id=$2 where property_id=$1 and role='owner'",
      [ids.property2, ids.third],
    );
    const acl = (
      await db.query(`
      select has_function_privilege('anon','public.get_property_subscription(uuid)','execute') as anon,
        has_function_privilege('authenticated','public.get_property_subscription(uuid)','execute') as authenticated
    `)
    ).rows[0];
    assert.deepEqual(acl, { anon: false, authenticated: true });

    await db.query("set local role authenticated");
    const identity = (user) =>
      db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    const subscription = async (id = ids.property1) =>
      (await db.query("select public.get_property_subscription($1) as result", [id])).rows[0]
        .result;
    await identity(ids.owner);
    const result = await subscription();
    assert.equal(result.plan, "Starter");
    assert.equal(result.trial.state, "active");
    assert.ok(Date.parse(result.trial.endsAt) > Date.parse(result.trial.startsAt));
    assert.deepEqual(result.usage, { active: 1, limit: 3, eligibility: "available" });
    assert.deepEqual(result.prices, [
      { months: 1, amount: 1500, currency: "LKR" },
      { months: 6, amount: 8000, currency: "LKR" },
      { months: 12, amount: 15000, currency: "LKR" },
    ]);
    const waiting = await subscription(pending);
    assert.equal(waiting.trial, null);
    assert.equal(waiting.previouslyVerified, false);
    assert.deepEqual(waiting.usage, { active: 0, limit: 3, eligibility: "unverified" });
    assert.equal(await subscription(ids.property2), null);
    await identity(ids.staff1);
    assert.equal(await subscription(), null);
    await identity(ids.staff2);
    assert.equal(await subscription(), null);
    await identity(ids.third);
    assert.equal((await subscription(ids.property2)).trial.state, "active");

    await db.query("reset role");
    // Simulate a valid past period without an expiry worker having updated its stored state.
    await db.query("set local session_replication_role='replica'");
    await db.query(
      `
      update private.property_subscriptions set
        period_starts_at=now()-interval '7 months',period_ends_at=now()-interval '1 month'
      where property_id=$1
    `,
      [ids.property1],
    );
    await db.query("set local session_replication_role='origin'");
    await db.query("set local role authenticated");
    await identity(ids.owner);
    const expired = await subscription();
    assert.equal(expired.trial.state, "expired");
    assert.deepEqual(expired.usage, { active: 0, limit: 3, eligibility: "no_entitlement" });
  }));
