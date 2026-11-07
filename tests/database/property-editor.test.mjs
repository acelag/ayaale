import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
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

async function asUser(id) {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}

async function photo(property) {
  const id = randomUUID();
  await db.query(
    "insert into public.photo_assets(id,property_id,created_by,main_path,thumbnail_path,width,height,byte_size) values($1,$2,$3,$4,$5,320,240,256)",
    [id, property, ids.owner, `${property}/${id}/main.webp`, `${property}/${id}/thumbnail.webp`],
  );
  return id;
}

async function get(property = ids.property1) {
  return (await db.query("select public.get_property_editor($1) as result", [property])).rows[0]
    .result;
}
async function save(version, fields, property = ids.property1) {
  return (
    await db.query("select public.submit_property_profile($1,$2,$3) as result", [
      property,
      version,
      fields,
    ])
  ).rows[0].result;
}

test("profile proposals preserve the approved name and gallery, with retry and stale edit handling", () =>
  transaction(async () => {
    const approvedPhoto = await photo(ids.property1);
    const first = await photo(ids.property1);
    const second = await photo(ids.property1);
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.owner]);
    await db.query("update public.properties set public_phone='+94771234567' where id=$1", [
      ids.property1,
    ]);
    await db.query(
      "insert into private.property_public_photos(property_id,asset_id,position,alt_text) values($1,$2,1,'Approved entrance')",
      [ids.property1, approvedPhoto],
    );
    await asUser(ids.owner);
    const before = await get();
    assert.deepEqual(before.profile.gallery, [{ id: approvedPhoto, alt: "Approved entrance" }]);
    assert.equal(await save(before.version, before.profile), "unchanged");
    const fields = {
      ...before.profile,
      name: "New name under review",
      amenities: ["Pool", "Wi-Fi"],
      gallery: [
        { id: second, alt: "Garden view" },
        { id: first, alt: "Front entrance" },
      ],
    };
    assert.equal(await save(before.version, fields), "saved");
    assert.equal(await save(before.version, fields), "saved");
    assert.equal(await save(before.version, { ...fields, name: "Stale name" }), "stale");
    const after = await get();
    assert.notEqual(after.version, before.version);
    assert.deepEqual(after.profile, fields);
    assert.equal(after.requestStatus, "pending");
    const { rows } = await db.query(
      "select public.get_public_property_profile('synthetic-property1') as result",
    );
    assert.equal(rows[0].result.name, "Synthetic hotel");
    assert.deepEqual(rows[0].result.amenities, []);
    assert.deepEqual(rows[0].result.photos, [{ position: 1, alt: "Approved entrance" }]);
    await db.query("reset role");
    const request = await db.query(
      "select request_kind, requested_by from private.property_verification_requests where property_id=$1",
      [ids.property1],
    );
    assert.deepEqual(request.rows, [{ request_kind: "critical_change", requested_by: ids.owner }]);
  }));

test("profile editor denies unrelated users and staff, including direct RPC and forged photo assignments", () =>
  transaction(async () => {
    const otherPhoto = await photo(ids.property2);
    await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
      [ids.owner, ids.staff1, ids.third],
    ]);
    await db.query("update public.properties set public_phone='+94771234567' where id=$1", [
      ids.property1,
    ]);
    await asUser(ids.owner);
    const state = await get();
    assert.equal(
      await save(state.version, {
        ...state.profile,
        gallery: [{ id: otherPhoto, alt: "Other photo" }],
      }),
      "invalid",
    );
    assert.equal(
      await save(state.version, { ...state.profile, verified_at: new Date().toISOString() }),
      "invalid",
    );
    assert.equal(
      await save(state.version, {
        ...state.profile,
        google_maps_url: "https://maps.google.com.example.invalid/",
      }),
      "invalid",
    );
    for (const actor of [ids.staff1, ids.third]) {
      await asUser(actor);
      assert.equal(await get(), null);
      assert.equal(await save(state.version, state.profile), "forbidden");
    }
    const { rows } = await db.query(
      "select has_function_privilege('anon','public.submit_property_profile(uuid,text,jsonb)','execute') as allowed",
    );
    assert.equal(rows[0].allowed, false);
  }));

test("a pending registration keeps one initial request when the owner submits requested changes", () =>
  transaction(async () => {
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.owner]);
    const id = randomUUID();
    await asUser(ids.owner);
    const { rows } = await db.query("select public.register_partner_property($1,$2) as result", [
      id,
      {
        name: "Fixture registration",
        contact_name: "Private Applicant",
        primary_category: "stays",
        property_type: "hotel",
        address: "123 Example Street",
        district: "Galle",
        public_phone: "+94771234567",
      },
    ]);
    assert.equal(rows[0].result, "registered");
    const state = await get(id);
    assert.equal(
      await save(state.version, { ...state.profile, description: "Pending description" }, id),
      "saved",
    );
    await db.query("reset role");
    const requests = await db.query(
      "select request_kind,applicant_contact_name from private.property_verification_requests where property_id=$1",
      [id],
    );
    assert.deepEqual(requests.rows, [
      { request_kind: "initial", applicant_contact_name: "Private Applicant" },
    ]);
    await db.query(
      "update private.property_verification_requests set status='more_information_required',reviewed_at=now() where property_id=$1",
      [id],
    );
    await asUser(ids.owner);
    const waiting = await get(id);
    assert.equal(waiting.editable, true);
    assert.equal(waiting.requestStatus, "more_information_required");
    assert.equal(
      await save(waiting.version, { ...waiting.profile, description: "Updated information" }, id),
      "saved",
    );
    assert.equal((await get(id)).requestStatus, "pending");
    await db.query("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*) from private.property_verification_requests where property_id=$1",
          [id],
        )
      ).rows[0].count,
      "1",
    );
  }));

test("admin checklist, information request, approval, profile rejection and suspension use one audited workflow", () =>
  transaction(async () => {
    const id = randomUUID();
    await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
      [ids.owner, ids.third],
    ]);
    await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.third]);
    await asUser(ids.owner);
    const registered = await db.query("select public.register_partner_property($1,$2) as result", [
      id,
      {
        name: "Fixture review hotel",
        contact_name: "Fixture applicant",
        primary_category: "stays",
        property_type: "hotel",
        address: "123 Example Street",
        district: "Galle",
        public_phone: "+94771234567",
      },
    ]);
    assert.equal(registered.rows[0].result, "registered");
    const adminView = async () =>
      (await db.query("select public.get_admin_verifications($1) as result", [id])).rows[0].result;
    const decide = async (version, operation, decision) =>
      (
        await db.query("select public.decide_property_verification($1,$2,$3,$4) as result", [
          id,
          version,
          operation,
          decision,
        ])
      ).rows[0].result;
    assert.equal(await adminView(), null);
    assert.equal(await decide("fake", "approve", {}), "forbidden");
    await db.query("reset role");
    const asset = await photo(id);
    const { slug } = (await db.query("select slug from public.properties where id=$1", [id]))
      .rows[0];
    const publicProfile = async () =>
      (await db.query("select public.get_public_property_profile($1) as result", [slug])).rows[0]
        .result;
    await asUser(ids.third);
    const pending = await adminView();
    assert.equal(pending.request.status, "pending");
    assert.equal(await decide(pending.version, "approve", {}), "invalid");
    assert.equal(
      await decide(pending.version, "request_info", {
        message: "Please clarify the entrance photo.",
        evidence: "Internal evidence",
      }),
      "saved",
    );
    assert.equal(await decide(pending.version, "reject", { message: "Stale review" }), "stale");
    assert.equal((await adminView()).status, "more_information_required");
    assert.equal(await publicProfile(), null);

    await asUser(ids.owner);
    const response = await get(id);
    assert.equal(response.decisionMessage, "Please clarify the entrance photo.");
    assert.equal(
      await save(
        response.version,
        { ...response.profile, gallery: [{ id: asset, alt: "Front entrance" }] },
        id,
      ),
      "saved",
    );
    assert.equal((await get(id)).requestStatus, "pending");
    await asUser(ids.third);
    const review = await adminView();
    const approval = {
      method: "both",
      evidence: "Verified business and applicant",
      existence: true,
      authority: true,
      maps: "https://maps.google.com/?q=6.02,80.22",
      latitude: "6.02",
      longitude: "80.22",
    };
    assert.equal(
      await decide(review.version, "approve", { ...approval, latitude: "99" }),
      "invalid",
    );
    assert.equal(await publicProfile(), null);
    assert.equal(await decide(review.version, "approve", approval), "saved");
    assert.equal((await publicProfile()).photos[0].alt, "Front entrance");
    assert.deepEqual(
      (await adminView()).history.map(({ action }) => action),
      ["approve", "request_info"],
    );

    await db.query("reset role");
    const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
    const active = await offer(id);
    const approved = await revision(active);
    await approve(approved);
    await publish(active, approved);
    const trialCount = async () =>
      Number(
        (
          await db.query("select count(*) from private.trial_allocations where property_id=$1", [
            id,
          ])
        ).rows[0].count,
      );
    assert.equal(await trialCount(), 1);
    await asUser(ids.owner);
    const profile = await get(id);
    assert.equal(
      await save(profile.version, { ...profile.profile, name: "Unapproved name" }, id),
      "saved",
    );
    await asUser(ids.third);
    assert.equal(
      await decide((await adminView()).version, "reject", { message: "Name needs evidence." }),
      "saved",
    );
    assert.equal((await publicProfile()).name, "Fixture review hotel");
    const verified = await adminView();
    assert.equal(
      await decide(verified.version, "suspend", { message: "Verification concern" }),
      "invalid",
    );
    assert.equal(
      await decide(verified.version, "suspend", { message: "Verification concern", confirm: true }),
      "saved",
    );
    assert.equal((await adminView()).status, "suspended");
    assert.equal(await publicProfile(), null);
    await db.query("reset role");
    assert.equal(
      (await db.query("select private.offer_is_effectively_active($1) as active", [active])).rows[0]
        .active,
      false,
    );
    assert.equal(await trialCount(), 1);
  }));
