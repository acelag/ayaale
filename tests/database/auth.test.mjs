import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
const { db, ids, setup, cleanup } = createDatabaseHarness();
before(setup);
after(cleanup);
async function asUser(id, fn, confirmed = true) {
  await db.query("begin");
  try {
    if (confirmed)
      await db.query("update auth.users set email_confirmed_at=now() where id=$1", [id]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    await db.query("set local role authenticated");
    await fn();
  } finally {
    await db.query("rollback");
  }
}
test("unconfirmed identity sees no private business data", () =>
  asUser(
    ids.owner,
    async () => {
      assert.equal((await db.query("select count(*) from public.properties")).rows[0].count, "0");
      assert.equal(
        (await db.query("select public.has_platform_admin_access() as allowed")).rows[0].allowed,
        false,
      );
    },
    false,
  ));
test("confirmed owner sees assigned properties and own subscription only", () =>
  asUser(ids.owner, async () => {
    assert.equal((await db.query("select count(*) from public.properties")).rows[0].count, "2");
    assert.equal(
      (await db.query("select count(*) from private.property_subscriptions")).rows[0].count,
      "2",
    );
    assert.equal((await db.query("select count(*) from public.profiles")).rows[0].count, "1");
  }));
test("confirmed staff sees assigned properties without billing or private reports", () =>
  asUser(ids.staff2, async () => {
    assert.equal((await db.query("select count(*) from public.properties")).rows[0].count, "1");
    assert.equal(
      (await db.query("select count(*) from private.property_subscriptions")).rows[0].count,
      "0",
    );
    assert.equal((await db.query("select count(*) from private.issue_reports")).rows[0].count, "0");
  }));
test("unassigned verified person has no property role or admin privilege", () =>
  asUser(ids.third, async () => {
    assert.equal((await db.query("select count(*) from public.properties")).rows[0].count, "0");
    assert.equal(
      (await db.query("select public.has_platform_admin_access() as allowed")).rows[0].allowed,
      false,
    );
  }));
test("verified identity cannot self-assign admin or verification state", () =>
  asUser(ids.owner, async () => {
    await assert.rejects(
      db.query("update public.properties set verification_status='verified'"),
      (e) => e.code === "42501",
    );
  }));
test("administrator is provisioned outside user metadata and can read cross-property state", async () => {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.third]);
    await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.third]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.third]);
    await db.query("set local role authenticated");
    assert.equal(
      (await db.query("select public.has_platform_admin_access() as allowed")).rows[0].allowed,
      true,
    );
    assert.equal((await db.query("select count(*) from public.properties")).rows[0].count, "2");
  } finally {
    await db.query("rollback");
  }
});
test("banned verified identity loses database access immediately", async () => {
  await db.query("begin");
  try {
    await db.query(
      "update auth.users set email_confirmed_at=now(),banned_until=now()+interval '1 day' where id=$1",
      [ids.owner],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.owner]);
    await db.query("set local role authenticated");
    assert.equal((await db.query("select count(*) from public.properties")).rows[0].count, "0");
  } finally {
    await db.query("rollback");
  }
});
