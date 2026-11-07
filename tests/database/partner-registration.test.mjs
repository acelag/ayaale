import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
before(setup);
after(cleanup);

const details = {
  name: "Synthetic registration",
  contact_name: "Synthetic applicant",
  primary_category: "stays",
  property_type: "hotel",
  address: "123 Example Street",
  district: "Galle",
  public_phone: "+94771234567",
  google_maps_url: "https://maps.google.com/?q=Galle",
};

async function tx(fn) {
  await db.query("begin");
  try {
    await fn();
  } finally {
    await db.query("rollback");
  }
}

async function register(id, proposal = details) {
  const { rows } = await db.query("select public.register_partner_property($1,$2) as result", [
    id,
    proposal,
  ]);
  return rows[0].result;
}

async function authenticate(id) {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}

test("a verified applicant atomically registers a private property, owner and review request", () =>
  tx(async () => {
    const applicant = randomUUID();
    const id = randomUUID();
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
      applicant,
      "applicant@example.invalid",
    ]);
    await authenticate(applicant);
    assert.equal(await register(id), "registered");
    assert.equal(await register(id, { ...details, name: "Attempted overwrite" }), "registered");
    await db.query("set constraints all immediate");
    await db.query("reset role");
    const { rows } = await db.query(
      `select p.slug,p.name,p.verification_status,p.verified_at,m.role,m.profile_id,r.status,
      r.applicant_contact_name,r.proposed_profile
      from public.properties p join public.property_memberships m on m.property_id=p.id
      join private.property_verification_requests r on r.property_id=p.id where p.id=$1`,
      [id],
    );
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.name, details.name);
    assert.equal(row.verification_status, "pending");
    assert.equal(row.verified_at, null);
    assert.equal(row.role, "owner");
    assert.equal(row.profile_id, applicant);
    assert.equal(row.status, "pending");
    assert.equal(row.applicant_contact_name, details.contact_name);
    assert.equal(Object.hasOwn(row.proposed_profile, "contact_name"), false);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from private.trial_allocations where property_id=$1",
          [id],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select public.get_public_property_profile($1) as result", [row.slug]))
        .rows[0].result,
      null,
    );
    assert.equal(
      (
        await db.query(
          "select actor_id from private.audit_logs where record_id=$1 and relation_name='public.properties'",
          [id],
        )
      ).rows[0].actor_id,
      applicant,
    );
  }));

test("registration denies unconfirmed, banned and anonymous callers and rejects privilege fields", () =>
  tx(async () => {
    await authenticate(ids.owner);
    assert.equal(await register(randomUUID()), "unauthorized");
    await db.query("reset role");
    await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
      [ids.owner, ids.staff1],
    ]);
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [
      ids.staff1,
    ]);
    await authenticate(ids.staff1);
    assert.equal(await register(randomUUID()), "unauthorized");
    await authenticate(ids.owner);
    for (const invalid of [
      { ...details, verification_status: "verified" },
      { ...details, owner_id: ids.staff1 },
      { ...details, public_phone: "" },
      { ...details, contact_name: "" },
      { ...details, district: "invalid" },
      { ...details, property_type: "restaurant" },
      { ...details, google_maps_url: "https://maps.google.com.attacker.invalid/maps" },
    ])
      assert.equal(await register(randomUUID(), invalid), "invalid");
    const { rows } = await db.query(
      "select has_function_privilege('anon','public.register_partner_property(uuid,jsonb)','execute') as anon, has_function_privilege('anon','private.register_partner_property(uuid,jsonb)','execute') as helper",
    );
    assert.deepEqual(rows[0], { anon: false, helper: false });
  }));

test("one applicant cannot read or reuse another registration and new requests are limited", () =>
  tx(async () => {
    const id = randomUUID();
    await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
      [ids.owner, ids.third],
    ]);
    await authenticate(ids.owner);
    assert.equal(await register(id), "registered");
    await authenticate(ids.third);
    assert.equal(
      (await db.query("select id from public.properties where id=$1", [id])).rowCount,
      0,
    );
    assert.equal(await register(id), "invalid");
    await authenticate(ids.owner);
    for (let i = 0; i < 4; i++) {
      assert.equal(
        await register(randomUUID(), {
          ...details,
          name: `Distinct hotel ${i}`,
          address: `${i} Alternate Road`,
          google_maps_url: `https://maps.google.com/?q=hotel-${i}`,
        }),
        "registered",
      );
    }
    assert.equal(await register(randomUUID()), "limited");
    assert.equal(await register(id), "registered");
  }));

test("duplicates become private claims and only a reviewed transfer changes access", () =>
  tx(async () => {
    const original = ids.property1;
    const applicant = ids.replacement;
    await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
      [ids.owner, ids.staff2, ids.staff1, applicant, ids.third],
    ]);
    await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.third]);
    await db.query(
      "update public.properties set name='Harbour Hotel',address='25 Ocean Road',district='Galle',public_phone='+94771234567',google_maps_url='https://maps.google.com/?q=harbour' where id=$1",
      [original],
    );
    const allocation = (
      await db.query("select subscription_id from private.trial_allocations where property_id=$1", [
        original,
      ])
    ).rows[0];
    const claim = randomUUID();
    const competing = randomUUID();
    const rejected = randomUUID();
    const duplicate = {
      ...details,
      name: " harbour-hotel ",
      address: "25, Ocean Road",
      google_maps_url: "",
    };
    const claimDetails = {
      ...duplicate,
      claim_message: "Verify my authority with the management office.",
    };
    const mine = async () =>
      (await db.query("select public.get_my_ownership_claims() as result")).rows[0].result;
    const adminView = async (id) =>
      (await db.query("select public.get_admin_ownership_claims($1) as result", [id])).rows[0]
        .result;
    const decide = async (id, target, operation = "approve", verified = true) =>
      (
        await db.query("select public.decide_ownership_claim($1,$2,$3,$4,$5,$6) as result", [
          id,
          operation,
          "Reviewed claim outcome",
          "Called an independently sourced contact",
          verified,
          target,
        ])
      ).rows[0].result;
    const role = async (id) =>
      (await db.query("select private.property_role($1) as role", [id])).rows[0].role;

    await authenticate(applicant);
    assert.equal(await register(claim, duplicate), "duplicate");
    assert.equal(await register(claim, claimDetails), "claimed");
    assert.equal(await register(claim, claimDetails), "claimed");
    assert.equal(await register(randomUUID(), claimDetails), "existing_claim");
    assert.equal(await role(original), null);
    assert.equal(await adminView(claim), null);
    assert.equal(await decide(claim, original), "forbidden");
    assert.deepEqual(
      (await mine()).map(({ id, status, propertyId }) => ({ id, status, propertyId })),
      [{ id: claim, status: "pending", propertyId: null }],
    );
    assert.equal((await db.query("select id from private.ownership_claims")).rowCount, 0);

    await authenticate(ids.staff2);
    assert.equal(await register(competing, claimDetails), "claimed");
    await authenticate(ids.staff1);
    assert.equal(await register(rejected, claimDetails), "claimed");
    await authenticate(ids.owner);
    assert.equal(await role(original), "owner");
    assert.deepEqual(await mine(), []);

    await authenticate(ids.third);
    const review = await adminView(claim);
    assert.deepEqual(review.candidates[0].signals, ["name", "address", "contact"]);
    assert.equal(await decide(rejected, null, "reject", false), "saved");
    assert.equal(await decide(claim, original, "approve", false), "invalid");
    assert.equal(await decide(claim, ids.property2), "stale");
    assert.equal(await decide(claim, original), "saved");
    assert.equal(await decide(competing, original), "stale");
    assert.equal(await decide(claim, original), "stale");

    await authenticate(ids.owner);
    assert.equal(await role(original), null);
    await authenticate(ids.staff2);
    assert.equal(await role(original), null);
    await authenticate(ids.staff1);
    assert.equal(await role(ids.property2), "staff");
    assert.equal((await mine())[0].status, "rejected");
    await authenticate(applicant);
    assert.equal(await role(original), "owner");
    assert.equal((await mine())[0].propertyId, original);
    assert.equal((await mine())[0].message, "Reviewed claim outcome");
    assert.doesNotMatch(
      JSON.stringify(await mine()),
      /independently sourced contact|ownerId|candidates/,
    );
    await db.query("reset role");
    await db.query("set constraints all immediate");
    assert.deepEqual(
      (
        await db.query(
          "select subscription_id from private.trial_allocations where property_id=$1",
          [original],
        )
      ).rows[0],
      allocation,
    );
    assert.equal(
      (await db.query("select count(*) from public.properties where id=$1", [claim])).rows[0].count,
      "0",
    );
  }));

test("map and paired contact signals block duplicates while a shared phone alone is allowed", () =>
  tx(async () => {
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.owner]);
    await authenticate(ids.owner);
    assert.equal(await register(randomUUID()), "registered");
    assert.equal(
      await register(randomUUID(), {
        ...details,
        name: "Different name",
        address: "57 Other Street",
        google_maps_url: details.google_maps_url + "#pin",
      }),
      "duplicate",
    );
    assert.equal(
      await register(randomUUID(), {
        ...details,
        address: "57 Other Street",
        google_maps_url: "",
      }),
      "duplicate",
    );
    assert.equal(
      await register(randomUUID(), {
        ...details,
        name: "Different name",
        address: "57 Other Street",
        google_maps_url: "",
      }),
      "registered",
    );
  }));
