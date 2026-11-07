import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import { createDatabaseHarness } from "./helpers.mjs";

const { db, ids, testUrl, setup, cleanup } = createDatabaseHarness();
const email = {
  owner: "owner@fixture.invalid",
  staff1: "staff@fixture.invalid",
  third: "third@fixture.invalid",
  replacement: "replacement@fixture.invalid",
};
const token = () => randomBytes(32).toString("hex");
const digest = (value) => createHash("sha256").update(value).digest("hex");
before(setup);
after(cleanup);

async function asUser(id, client = db) {
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
async function verified(names = Object.keys(email)) {
  for (const name of names) {
    await db.query("update auth.users set email=$2,email_confirmed_at=now() where id=$1", [
      ids[name],
      email[name],
    ]);
  }
}
async function tx(fn) {
  await db.query("begin");
  try {
    await fn();
  } finally {
    await db.query("rollback");
  }
}
async function call(client, name, args) {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(",");
  return (await client.query(`select public.${name}(${placeholders}) as result`, args)).rows[0]
    .result;
}
const create = (property, address, raw, client = db) =>
  call(client, "create_property_staff_invite", [property, address, digest(raw)]);
const accept = (raw, client = db) => call(client, "accept_property_staff_invite", [raw]);
const team = (property) => call(db, "get_property_team", [property]);
const manage = (property, id, operation) =>
  call(db, "manage_property_staff", [property, id, operation]);

test("a verified invitee can accept separate property assignments and removal affects only one", () =>
  tx(async () => {
    const one = token(),
      two = token();
    await verified();
    await db.query("delete from public.property_memberships where profile_id=$1 and role='staff'", [
      ids.staff1,
    ]);
    await asUser(ids.owner);
    assert.equal(await create(ids.property1, " THIRD@FIXTURE.INVALID ", one), "created");
    assert.equal(await create(ids.property1, email.third, token()), "pending");
    assert.equal(await create(ids.property2, email.third, two), "created");
    assert.equal((await team(ids.property1)).invites[0].email, email.third);
    await asUser(ids.staff1);
    assert.equal(await accept(one), "unavailable");
    await asUser(ids.third);
    assert.equal(await accept(one), ids.property1);
    assert.equal(await accept(one), ids.property1);
    assert.equal(await accept(two), ids.property2);
    assert.deepEqual(
      (
        await db.query("select property_id from public.property_memberships where profile_id=$1", [
          ids.third,
        ])
      ).rows
        .map((row) => row.property_id)
        .sort(),
      [ids.property1, ids.property2].sort(),
    );
    assert.equal(await team(ids.property1), null);
    assert.equal(await create(ids.property1, email.replacement, token()), "forbidden");
    await asUser(ids.owner);
    const member = (await team(ids.property1)).staff.find((row) => row.email === email.third);
    assert.ok(member);
    assert.equal(await manage(ids.property2, member.id, "remove"), "saved");
    assert.equal(await manage(ids.property1, member.id, "remove"), "saved");
    await asUser(ids.third);
    assert.equal(await accept(one), "unavailable");
    assert.equal(
      (await db.query("select id from public.properties where id=$1", [ids.property1])).rowCount,
      0,
    );
    assert.equal(
      (await db.query("select id from public.properties where id=$1", [ids.property2])).rowCount,
      1,
    );
    await db.query("reset role");
    const { rows } = await db.query(
      "select token_hash from private.property_staff_invitations where property_id=$1",
      [ids.property1],
    );
    assert.deepEqual(rows, [{ token_hash: digest(one) }]);
  }));

test("reserved seats release after revocation or expiry and old owner invites are invalid", () =>
  tx(async () => {
    await verified();
    const one = token(),
      two = token(),
      three = token();
    await asUser(ids.owner);
    assert.equal(await create(ids.property1, email.third, token()), "full");
    assert.equal(await create(ids.property2, email.third, one), "created");
    assert.equal(await create(ids.property2, email.replacement, token()), "full");
    const invite = (await team(ids.property2)).invites[0];
    assert.equal(await manage(ids.property2, invite.id, "revoke"), "saved");
    assert.equal(await create(ids.property2, email.replacement, two), "created");
    await db.query("reset role");
    await db.query(
      "update private.property_staff_invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where token_hash=$1",
      [digest(two)],
    );
    await asUser(ids.owner);
    assert.equal(await create(ids.property2, email.third, three), "created");
    await db.query("reset role");
    await db.query(
      "update public.property_memberships set profile_id=$2 where property_id=$1 and role='owner'",
      [ids.property2, ids.replacement],
    );
    await asUser(ids.third);
    assert.equal(await accept(one), "unavailable");
    assert.equal(await accept(three), "unavailable");
    await asUser(ids.replacement);
    assert.equal(await accept(two), "unavailable");
    assert.deepEqual((await team(ids.property2)).invites, []);
    await db.query("reset role");
    await db.query(
      "update public.property_memberships set profile_id=$2 where property_id=$1 and role='owner'",
      [ids.property2, ids.owner],
    );
    await asUser(ids.third);
    assert.equal(await accept(three), "unavailable");
  }));

test("concurrent owners' requests cannot reserve the same last staff seat", async () => {
  await verified();
  const clients = [
    new pg.Client({ connectionString: testUrl.toString() }),
    new pg.Client({ connectionString: testUrl.toString() }),
  ];
  try {
    await Promise.all(clients.map((client) => client.connect()));
    for (const client of clients) {
      await client.query("begin");
      await asUser(ids.owner, client);
    }
    const reserve = async (client, address) => {
      const result = await create(ids.property2, address, token(), client);
      await client.query("commit");
      return result;
    };
    assert.deepEqual(
      (
        await Promise.all(
          clients.map((client, index) => reserve(client, [email.third, email.replacement][index])),
        )
      ).sort(),
      ["created", "full"],
    );
  } finally {
    await Promise.all(clients.map((client) => client.end()));
  }
});
