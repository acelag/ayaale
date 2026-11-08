import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish, submit } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);
const result = async (sql, args) => (await db.query(sql, args)).rows[0]?.result;
async function transaction(run) {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now()");
    await run();
  } finally {
    await db.query("rollback");
  }
}
async function user(id) {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
const listing = (property = ids.property1) =>
  result("select public.get_partner_offers($1) as result", [property]);
const capacity = () =>
  result("select public.get_property_offer_capacity($1) as result", [ids.property1]);
const manage = (property, item, operation, version = "", draft = null) =>
  result("select public.manage_partner_offer($1,$2,$3,$4,$5) as result", [
    property,
    item,
    operation,
    version,
    draft,
  ]);
const page = (id) =>
  result("select public.get_public_offer_page($1) as result", [`synthetic-${id}`]);
async function active(property = ids.property1, cover = null) {
  const id = await offer(property),
    rev = await revision(id);
  if (cover)
    await db.query("update private.offer_revisions set cover_photo_path=$2 where id=$1", [
      rev,
      cover,
    ]);
  await approve(rev);
  await publish(id, rev);
  return { id, rev };
}

test("T054 duplicate claims cannot retarget an existing claim or displace its current owner", () =>
  transaction(async () => {
    const details = (name, address, map) => ({
      name,
      address,
      contact_name: "Synthetic claimant",
      primary_category: "stays",
      property_type: "hotel",
      district: "Galle",
      public_phone: "+94771234567",
      google_maps_url: map,
      claim_message: "Please independently verify my authority.",
    });
    const first = details("North Hotel", "10 North Road", "https://maps.google.com/?q=north");
    const second = details("South Hotel", "20 South Road", "https://maps.google.com/?q=south");
    for (const [id, detail] of [
      [ids.property1, first],
      [ids.property2, second],
    ])
      await db.query(
        "update public.properties set name=$2,address=$3,district='Galle',google_maps_url=$4 where id=$1",
        [id, detail.name, detail.address, detail.google_maps_url],
      );
    const claim = randomUUID();
    await user(ids.third);
    const register = (id, detail) =>
      result("select public.register_partner_property($1,$2) as result", [id, detail]);
    assert.equal(await register(claim, first), "claimed");
    assert.equal(await register(claim, second), "claimed");
    assert.equal(await register(randomUUID(), first), "existing_claim");
    const mine = await result("select public.get_my_ownership_claims() as result");
    assert.equal(mine.length, 1);
    assert.equal(mine[0].name, first.name);
    assert.equal(mine[0].propertyId, null);
    await db.query("reset role");
    assert.equal(await result("select count(*)::int as result from private.ownership_claims"), 1);
    assert.equal(
      (await db.query("select details from private.ownership_claims where id=$1", [claim])).rows[0]
        .details.name,
      first.name,
    );
    assert.equal(
      await result(
        "select count(*)::int as result from public.property_memberships where profile_id=$1",
        [ids.third],
      ),
      0,
    );
    assert.equal(
      await result(
        "select count(*)::int as result from public.property_memberships where profile_id=$1 and role='owner'",
        [ids.owner],
      ),
      2,
    );
  }));

test("T054 removing confirmation revokes saved-draft operations without changing existing content", () =>
  transaction(async () => {
    const live = await active();
    const draft = randomUUID();
    const content = { title: "Original private draft", gallery: [] };
    await user(ids.staff2);
    assert.equal(
      await result("select public.save_offer_wizard($1,$2,0,$3,false) as result", [
        ids.property1,
        draft,
        content,
      ]),
      "saved",
    );
    await db.query("reset role");
    await db.query("update auth.users set email_confirmed_at=null where id=$1", [ids.staff2]);
    await user(ids.staff2);
    assert.equal(
      await result("select public.get_offer_wizard($1,$2) as result", [ids.property1, draft]),
      null,
    );
    assert.equal(
      await result("select public.save_offer_wizard($1,$2,1,$3,false) as result", [
        ids.property1,
        draft,
        { ...content, title: "Forged overwrite" },
      ]),
      "forbidden",
    );
    assert.equal(await manage(ids.property1, live.id, "duplicate", "", randomUUID()), "forbidden");
    assert.equal(await listing(), null);
    await db.query("reset role");
    assert.deepEqual(
      (
        await db.query("select version,content from private.offer_wizard_drafts where id=$1", [
          draft,
        ])
      ).rows[0],
      { version: 1, content },
    );
    assert.equal(
      await result(
        "select count(*)::int as result from private.offer_wizard_drafts where property_id=$1",
        [ids.property1],
      ),
      1,
    );
    assert.equal((await page(live.id)).state, "active");
  }));

test("T054 a valid property ID cannot authorize another property's offer or draft ID", () =>
  transaction(async () => {
    const foreign = await active(ids.property2);
    const foreignDraft = randomUUID();
    await user(ids.owner);
    assert.equal(
      await result("select public.save_offer_wizard($1,$2,0,$3,false) as result", [
        ids.property2,
        foreignDraft,
        { title: "Foreign private draft", gallery: [] },
      ]),
      "saved",
    );
    await user(ids.staff2);
    for (const item of [foreign.id, foreignDraft]) {
      assert.equal(await manage(ids.property1, item, "duplicate", "", randomUUID()), "unavailable");
      assert.equal(await manage(ids.property2, item, "duplicate", "", randomUUID()), "forbidden");
    }
    assert.equal(await manage(ids.property1, foreign.id, "pause", "forged-version"), "unavailable");
    assert.equal(await listing(ids.property2), null);
    await db.query("reset role");
    assert.equal(
      await result(
        "select count(*)::int as result from private.offer_wizard_drafts where property_id=$1",
        [ids.property1],
      ),
      0,
    );
    assert.equal(
      (
        await db.query("select status,approved_revision_id from public.offers where id=$1", [
          foreign.id,
        ])
      ).rows[0].status,
      "active",
    );
    assert.equal(
      (
        await db.query("select content from private.offer_wizard_drafts where id=$1", [
          foreignDraft,
        ])
      ).rows[0].content.title,
      "Foreign private draft",
    );
  }));

test("T054 repeated approval cannot exceed capacity and a waiting approval activates only after a slot frees", () =>
  transaction(async () => {
    await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.replacement]);
    await db.query("update public.properties set public_phone='+94771234567' where id=$1", [
      ids.property1,
    ]);
    const asset = randomUUID(),
      path = `${ids.property1}/${asset}/main.webp`;
    await db.query(
      "insert into public.photo_assets(id,property_id,created_by,main_path,thumbnail_path,width,height,byte_size) values($1,$2,$3,$4,$5,320,240,256)",
      [asset, ids.property1, ids.owner, path, `${ids.property1}/${asset}/thumbnail.webp`],
    );
    const live = [
      await active(ids.property1, path),
      await active(ids.property1, path),
      await active(ids.property1, path),
    ];
    const waiting = await offer(),
      rev = await revision(waiting);
    await db.query("update private.offer_revisions set cover_photo_path=$2 where id=$1", [
      rev,
      path,
    ]);
    await submit(rev);
    await db.query("update public.offers set status='pending_review' where id=$1", [waiting]);
    await user(ids.replacement);
    const detail = await result("select public.get_admin_offer_reviews($1) as result", [waiting]);
    const args = [
      waiting,
      rev,
      detail.version,
      "approve",
      "",
      { price: true, dates: true, inclusions: true, contact: true, photos: true, terms: true },
    ];
    const decide = () =>
      result("select public.decide_offer_review($1,$2,$3,$4,$5,$6) as result", args);
    assert.equal(await decide(), "saved");
    assert.equal(await decide(), "stale");
    assert.equal(await page(waiting), null);
    await db.query("set local role service_role");
    assert.equal((await result("select public.run_offer_lifecycle() as result")).activated, 0);
    await user(ids.staff2);
    assert.equal((await capacity()).active, 3);
    const version = (await listing()).find((item) => item.id === live[0].id).version;
    assert.equal(await manage(ids.property1, live[0].id, "pause", version), "saved");
    await db.query("set local role service_role");
    assert.equal((await result("select public.run_offer_lifecycle() as result")).activated, 1);
    assert.equal((await result("select public.run_offer_lifecycle() as result")).activated, 0);
    await user(ids.staff2);
    assert.equal((await capacity()).active, 3);
    assert.equal((await page(waiting)).state, "active");
    await db.query("reset role");
    assert.equal(
      await result(
        "select count(*)::int as result from private.offer_status_history where offer_id=$1 and new_status='active'",
        [waiting],
      ),
      1,
    );
  }));

test("T054 an elapsed subscription blocks resume and contact ingestion before any expiry job runs", () =>
  transaction(async () => {
    const live = await active();
    const paused = await active();
    await db.query("update public.offers set status='paused' where id=$1", [paused.id]);
    const allocation = await result(
      "select id::text as result from private.trial_allocations where property_id=$1",
      [ids.property1],
    );
    // Advance the fixture entitlement clock only; keep the stored subscription and offer states active.
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.property_subscriptions set period_starts_at=now()-interval '6 months',period_ends_at=now()-interval '1 microsecond' where property_id=$1",
      [ids.property1],
    );
    await db.query("set local session_replication_role='origin'");
    const unavailable = await page(live.id);
    assert.equal(unavailable.state, "unavailable");
    assert.equal(Object.hasOwn(unavailable, "offer"), false);
    await user(ids.staff2);
    assert.equal((await capacity()).eligibility, "no_entitlement");
    const version = (await listing()).find((item) => item.id === paused.id).version;
    assert.equal(await manage(ids.property1, paused.id, "resume", version), "ineligible");
    await db.query("set local role service_role");
    assert.equal(
      await result("select public.record_offer_contact_click($1,'call',$2) as result", [
        `synthetic-${live.id}`,
        randomUUID(),
      ]),
      "unavailable",
    );
    await db.query("reset role");
    assert.equal(
      await result("select status as result from public.offers where id=$1", [live.id]),
      "active",
    );
    assert.equal(
      await result(
        "select status as result from private.property_subscriptions where property_id=$1",
        [ids.property1],
      ),
      "active",
    );
    assert.equal(
      await result(
        "select id::text as result from private.trial_allocations where property_id=$1",
        [ids.property1],
      ),
      allocation,
    );
    assert.equal(
      await result(
        "select count(*)::int as result from private.property_subscriptions where property_id=$1",
        [ids.property1],
      ),
      1,
    );
    assert.equal(
      await result(
        "select count(*)::int as result from private.property_subscriptions where kind='paid'",
      ),
      0,
    );
    assert.equal(
      await result(
        "select count(*)::int as result from private.contact_click_events where offer_id=$1",
        [live.id],
      ),
      0,
    );
  }));

test("T054 a burst of untrusted reports is bounded and cannot automatically hide or suspend a listing", () =>
  transaction(async () => {
    const live = await active();
    await db.query("set local role service_role");
    const report = (id) =>
      result(
        "select public.submit_public_issue_report('offer',$1,$2,'misleading_information',$3,$4) as result",
        [
          `synthetic-${live.id}`,
          id,
          "Synthetic unverified allegation <script>alert(1)</script>",
          "claimed-admin@example.invalid",
        ],
      );
    const first = randomUUID();
    assert.equal(await report(first), "received");
    assert.equal(await report(first), "received");
    for (let index = 1; index < 20; index++) assert.equal(await report(randomUUID()), "received");
    assert.equal(await report(randomUUID()), "limited");
    assert.equal((await page(live.id)).state, "active");
    await db.query("reset role");
    assert.equal(
      await result("select count(*)::int as result from private.issue_reports where offer_id=$1", [
        live.id,
      ]),
      20,
    );
    assert.equal(await result("select count(*)::int as result from private.moderation_actions"), 0);
    assert.equal(
      await result("select verification_status as result from public.properties where id=$1", [
        ids.property1,
      ]),
      "verified",
    );
    assert.equal(
      await result(
        "select count(*)::int as result from private.issue_reports where offer_id=$1 and status='open'",
        [live.id],
      ),
      20,
    );
  }));
