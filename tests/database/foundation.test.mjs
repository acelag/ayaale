import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import pg from "pg";
import { createDatabaseHarness } from "./helpers.mjs";

const { db, ids, testUrl, setup, cleanup } = createDatabaseHarness();
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
async function rejectSql(sql, params, code) {
  await transaction(async () =>
    assert.rejects(db.query(sql, params), (error) => error.code === code),
  );
}

test("foundation tables retain RLS and anonymous denial with scoped authenticated reads", async () => {
  const { rows } = await db.query(`select n.nspname, c.relname, c.relrowsecurity,
    has_table_privilege('anon',c.oid,'select,insert,update,delete') as anon_access,
    has_table_privilege('authenticated',c.oid,'select,insert,update,delete') as user_access
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' and c.relname in ('profiles','properties','property_memberships'))
       or (n.nspname='private' and c.relname='property_verification_requests')`);
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.relrowsecurity, true);
    assert.equal(row.anon_access, false);
    assert.equal(row.user_access, true);
  }
});

test("one person can own multiple properties and staff can have explicit multiple assignments", async () => {
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from public.property_memberships where profile_id=$1",
        [ids.owner],
      )
    ).rows[0].count,
    2,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from public.property_memberships where profile_id=$1",
        [ids.staff1],
      )
    ).rows[0].count,
    2,
  );
});

test("rejects missing auth user, duplicate membership and second owner", async () => {
  await rejectSql(
    "insert into public.profiles(id,display_name) values ($1,'Missing auth')",
    [randomUUID()],
    "23503",
  );
  await rejectSql(
    "insert into public.property_memberships(property_id,profile_id,role,staff_slot) values ($1,$2,'staff',2)",
    [ids.property1, ids.staff1],
    "23505",
  );
  await rejectSql(
    "insert into public.property_memberships(property_id,profile_id,role) values ($1,$2,'owner')",
    [ids.property1, ids.replacement],
    "23505",
  );
});

test("staff slots enforce two-person capacity and reject invalid/null slots", async () => {
  await rejectSql(
    "insert into public.property_memberships(property_id,profile_id,role,staff_slot) values ($1,$2,'staff',1)",
    [ids.property1, ids.third],
    "23505",
  );
  await rejectSql(
    "insert into public.property_memberships(property_id,profile_id,role,staff_slot) values ($1,$2,'staff',3)",
    [ids.property1, ids.third],
    "23514",
  );
  await rejectSql(
    "insert into public.property_memberships(property_id,profile_id,role) values ($1,$2,'staff')",
    [ids.property1, ids.third],
    "23514",
  );
});

test("property cannot commit without its owner; transfer is atomic", async () => {
  await transaction(async () => {
    await db.query(
      "delete from public.property_memberships where property_id=$1 and role='owner'",
      [ids.property1],
    );
    await assert.rejects(
      db.query("set constraints all immediate"),
      (error) => error.code === "23514",
    );
  });
  await transaction(async () => {
    await db.query(
      "delete from public.property_memberships where property_id=$1 and role='owner'",
      [ids.property1],
    );
    await db.query(
      "insert into public.property_memberships(property_id,profile_id,role) values ($1,$2,'owner')",
      [ids.property1, ids.replacement],
    );
    await db.query("set constraints all immediate");
    assert.equal(
      (
        await db.query(
          "select profile_id from public.property_memberships where property_id=$1 and role='owner'",
          [ids.property1],
        )
      ).rows[0].profile_id,
      ids.replacement,
    );
  });
  await transaction(async () => {
    await db.query(
      "insert into public.properties(slug,name,primary_category,property_type,address,district) values ('ownerless-test','Ownerless','stays','hotel','Synthetic address','Colombo')",
    );
    await assert.rejects(
      db.query("set constraints all immediate"),
      (error) => error.code === "23514",
    );
  });
});

test("owner deletion cannot silently orphan properties; unallocated property deletion can cascade", async () => {
  await transaction(async () => {
    await db.query("delete from auth.users where id=$1", [ids.owner]);
    await assert.rejects(
      db.query("set constraints all immediate"),
      (error) => error.code === "23514",
    );
  });
  await transaction(async () => {
    const pendingProperty = randomUUID();
    await db.query(
      "insert into public.properties(id,slug,name,primary_category,property_type,address,district) values($1,$2,'Pending fixture','stays','hotel','Synthetic address','Colombo')",
      [pendingProperty, "pending-" + pendingProperty],
    );
    await db.query(
      "insert into public.property_memberships(property_id,profile_id,role) values($1,$2,'owner')",
      [pendingProperty, ids.owner],
    );
    await db.query("delete from public.properties where id=$1", [pendingProperty]);
    await db.query("set constraints all immediate");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as count from public.property_memberships where property_id=$1",
          [pendingProperty],
        )
      ).rows[0].count,
      0,
    );
  });
});

test("rejects invalid location, contact, category, type and slug data", async () => {
  for (const sql of [
    "update public.properties set latitude=91 where id=$1",
    "update public.properties set longitude=null where id=$1",
    "update public.properties set google_maps_url=null where id=$1",
    "update public.properties set verified_at=null where id=$1",
    "update public.properties set public_phone='0771234567' where id=$1",
    "update public.properties set website_url='javascript:alert(1)' where id=$1",
    "update public.properties set primary_category='booking' where id=$1",
    "update public.properties set property_type='homestay' where id=$1",
    "update public.properties set property_type='other' where id=$1",
    "update public.properties set slug='Bad Slug' where id=$1",
    "update public.properties set name=' ' where id=$1",
  ])
    await rejectSql(sql, [ids.property1], "23514");
  await rejectSql(
    "update public.properties set slug='synthetic-property2' where id=$1",
    [ids.property1],
    "23505",
  );
});

test("pending private changes do not modify approved public identity", async () => {
  await transaction(async () => {
    await db.query(
      `insert into private.property_verification_requests(property_id,requested_by,request_kind,proposed_profile)
      values ($1,$2,'critical_change','{"name":"Proposed new name"}')`,
      [ids.property1, ids.owner],
    );
    const row = (
      await db.query("select name,verification_status from public.properties where id=$1", [
        ids.property1,
      ])
    ).rows[0];
    assert.deepEqual(row, { name: "Synthetic hotel", verification_status: "verified" });
    await assert.rejects(
      db.query(
        `insert into private.property_verification_requests(property_id,request_kind,proposed_profile)
      values ($1,'critical_change','{"address":"Another proposal"}')`,
        [ids.property1],
      ),
      (error) => error.code === "23505",
    );
  });
});

test("verification proposals reject privilege fields, empty payloads and unsupported decisions", async () => {
  for (const payload of [
    "{}",
    "[]",
    '{"verification_status":"verified"}',
    '{"owner_id":"anything"}',
  ]) {
    await rejectSql(
      "insert into private.property_verification_requests(property_id,request_kind,proposed_profile) values ($1,'initial',$2)",
      [ids.property1, payload],
      "23514",
    );
  }
  await rejectSql(
    `insert into private.property_verification_requests(property_id,request_kind,status,proposed_profile)
    values ($1,'initial','approved','{"name":"Proposal"}')`,
    [ids.property1],
    "23514",
  );
});

test("timestamps update without permitting created_at replacement", async () => {
  await transaction(async () => {
    const old = (await db.query("select created_at from public.profiles where id=$1", [ids.owner]))
      .rows[0].created_at;
    await db.query(
      "update public.profiles set display_name='Updated',created_at='2000-01-01' where id=$1",
      [ids.owner],
    );
    const row = (
      await db.query("select created_at,updated_at from public.profiles where id=$1", [ids.owner])
    ).rows[0];
    assert.equal(row.created_at.toISOString(), old.toISOString());
    assert.ok(row.updated_at >= row.created_at);
  });
});

test("RLS still denies authenticated access even if a later grant is accidentally introduced", async () => {
  await transaction(async () => {
    await db.query("grant select,insert on public.profiles to authenticated");
    await db.query("set local role authenticated");
    assert.equal(
      (await db.query("select count(*)::int as count from public.profiles")).rows[0].count,
      0,
    );
    await assert.rejects(
      db.query("insert into public.profiles(id,display_name) values ($1,'Blocked')", [
        randomUUID(),
      ]),
      (error) => error.code === "42501",
    );
  });
});

test("concurrent inserts cannot claim the same final staff slot", async () => {
  const other = new pg.Client({ connectionString: testUrl.toString() });
  await other.connect();
  try {
    await db.query("begin");
    await other.query("begin; set local lock_timeout='200ms'");
    await db.query(
      "insert into public.property_memberships(property_id,profile_id,role,staff_slot) values ($1,$2,'staff',2)",
      [ids.property2, ids.staff2],
    );
    await assert.rejects(
      other.query(
        "insert into public.property_memberships(property_id,profile_id,role,staff_slot) values ($1,$2,'staff',2)",
        [ids.property2, ids.third],
      ),
      (error) => error.code === "55P03",
    );
  } finally {
    await db.query("rollback");
    await other.query("rollback");
    await other.end();
  }
});

test("approval records require a reviewer and an evidence method", async () => {
  await rejectSql(
    `insert into private.property_verification_requests(
    property_id,request_kind,status,proposed_profile,reviewed_at,verification_method)
    values ($1,'initial','approved','{"name":"Proposal"}',now(),'independent_contact')`,
    [ids.property1],
    "23514",
  );
  await transaction(async () => {
    await db.query(
      `insert into private.property_verification_requests(
      property_id,request_kind,status,proposed_profile,reviewed_at,verification_method,reviewed_by)
      values ($1,'initial','approved','{"name":"Proposal"}',now(),'independent_contact',$2)`,
      [ids.property1, ids.replacement],
    );
    assert.equal(
      (await db.query("select name from public.properties where id=$1", [ids.property1])).rows[0]
        .name,
      "Synthetic hotel",
    );
  });
});

test("trusted service role can use schema constraints without security-definer helpers", async () => {
  await transaction(async () => {
    await db.query("set local role service_role");
    await db.query("update public.profiles set display_name='Service update' where id=$1", [
      ids.owner,
    ]);
    await db.query(
      "delete from public.property_memberships where property_id=$1 and role='owner'",
      [ids.property1],
    );
    await db.query(
      "insert into public.property_memberships(property_id,profile_id,role) values ($1,$2,'owner')",
      [ids.property1, ids.replacement],
    );
    await db.query("set constraints all immediate");
  });
});
