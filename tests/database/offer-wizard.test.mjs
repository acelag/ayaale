import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
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
async function asUser(id) {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
async function save(property, id, version, fields, submit = false) {
  return (
    await db.query("select public.save_offer_wizard($1,$2,$3,$4,$5) as result", [
      property,
      id,
      version,
      fields,
      submit,
    ])
  ).rows[0].result;
}
async function read(property, id) {
  return (await db.query("select public.get_offer_wizard($1,$2,0) as result", [property, id]))
    .rows[0].result;
}
async function photo(property) {
  const id = randomUUID();
  await db.query(
    "insert into public.photo_assets(id,property_id,created_by,main_path,thumbnail_path,width,height,byte_size) values($1,$2,$3,$4,$5,320,240,256)",
    [id, property, ids.owner, `${property}/${id}/main.webp`, `${property}/${id}/thumbnail.webp`],
  );
  return id;
}
async function content(cover, gallery = []) {
  const { rows } = await db.query(`select
    to_char(now() at time zone 'Asia/Colombo' + interval '1 day','YYYY-MM-DD"T"HH24:MI') as start,
    to_char(now() at time zone 'Asia/Colombo' + interval '7 days','YYYY-MM-DD"T"HH24:MI') as end,
    to_char(now() at time zone 'Asia/Colombo' + interval '10 days','YYYY-MM-DD') as redeem`);
  return {
    category: "dining",
    title: "Synthetic dining package",
    short_description: "A dining offer for two",
    promotional_price: "4500",
    original_price: "6000",
    price_unit: "per_couple",
    price_qualifier: "exact",
    package_coverage: "Lunch for two",
    adults: "2",
    children: "0",
    inclusions: "Lunch\nDessert",
    publication_starts_at: rows[0].start,
    publication_ends_at: rows[0].end,
    redemption_starts_on: rows[0].redeem,
    redemption_ends_on: rows[0].redeem,
    terms: "Book in advance.",
    taxes_included: "yes",
    meal_period: "Lunch",
    service_start: "12:00",
    service_end: "15:00",
    room_type: "This hidden field is omitted",
    cover,
    gallery,
  };
}

test("assigned staff can save and resume partial drafts, with stale writes rejected", () =>
  tx(async () => {
    const id = randomUUID();
    await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
      [ids.staff2, ids.third],
    ]);
    await db.query("update public.properties set verification_status='pending' where id=$1", [
      ids.property1,
    ]);
    await asUser(ids.staff2);
    const partial = { title: "Draft only", gallery: [] };
    assert.equal(await save(ids.property1, id, 0, partial), "saved");
    assert.equal(await save(ids.property1, id, 0, partial), "saved");
    assert.equal(await save(ids.property1, id, 0, { ...partial, title: "Stale" }), "stale");
    assert.deepEqual((await read(ids.property1, id)).draft, {
      id,
      version: 1,
      content: partial,
      submitted: false,
    });
    assert.equal(await save(ids.property1, id, 1, partial, true), "unverified");
    assert.equal((await db.query("select id from public.offers where id=$1", [id])).rowCount, 0);
    await asUser(ids.third);
    assert.equal(await read(ids.property1, id), null);
    assert.equal(await save(ids.property1, id, 1, partial), "forbidden");
  }));

test("submission atomically creates a locked review revision with Sri Lanka dates, discount and gallery", () =>
  tx(async () => {
    const id = randomUUID();
    const cover = await photo(ids.property1),
      second = await photo(ids.property1),
      third = await photo(ids.property1);
    const fields = await content(cover, [third, second]);
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.owner]);
    await db.query("update public.properties set public_whatsapp='+94771234567' where id=$1", [
      ids.property1,
    ]);
    await asUser(ids.owner);
    assert.equal(await save(ids.property1, id, 0, fields, true), "submitted");
    assert.equal(await save(ids.property1, id, 0, fields, true), "submitted");
    assert.equal(await save(ids.property1, id, 1, fields), "locked");
    assert.deepEqual((await read(ids.property1, id)).drafts, []);
    await db.query("reset role");
    const { rows } = await db.query(
      `select o.status, o.approved_revision_id, o.first_published_at,
      r.discount_percent::float as discount, r.category_details, r.inclusions, r.cover_photo_path,
      to_char(r.publication_starts_at at time zone 'Asia/Colombo','YYYY-MM-DD"T"HH24:MI') as starts,
      array(select g.asset_id from private.offer_revision_gallery g where g.revision_id=r.id order by g.position) as gallery
      from public.offers o join private.offer_revisions r on r.offer_id=o.id where o.id=$1`,
      [id],
    );
    assert.deepEqual(rows, [
      {
        status: "pending_review",
        approved_revision_id: null,
        first_published_at: null,
        discount: 25,
        category_details: { meal_period: "Lunch", service_start: "12:00", service_end: "15:00" },
        inclusions: ["Lunch", "Dessert"],
        cover_photo_path: `${ids.property1}/${cover}/main.webp`,
        starts: fields.publication_starts_at,
        gallery: [third, second],
      },
    ]);
    assert.equal(
      (await db.query("select public.get_public_offer_page($1) as result", [`offer-${id}`])).rows[0]
        .result,
      null,
    );
  }));

test("review rejects missing contacts, cross-property assets and incomplete submissions without creating an offer", () =>
  tx(async () => {
    const id = randomUUID(),
      cover = await photo(ids.property1),
      foreign = await photo(ids.property2);
    const fields = await content(cover);
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.owner]);
    await asUser(ids.owner);
    assert.equal(await save(ids.property1, id, 0, fields, true), "contact");
    await db.query("reset role");
    await db.query("update public.properties set public_phone='+94771234567' where id=$1", [
      ids.property1,
    ]);
    await asUser(ids.owner);
    assert.equal(
      await save(ids.property1, id, 0, { ...fields, gallery: [foreign] }, true),
      "photos",
    );
    assert.equal(await save(ids.property1, id, 0, { ...fields, gallery: [cover] }, true), "photos");
    assert.equal(
      await save(
        ids.property1,
        id,
        0,
        { ...fields, publication_ends_at: fields.publication_starts_at },
        true,
      ),
      "dates",
    );
    assert.equal(
      await save(ids.property1, id, 0, { ...fields, taxes_included: "no" }, true),
      "invalid",
    );
    assert.equal(await save(ids.property1, id, 0, { ...fields, children: "1" }, true), "invalid");
    assert.equal((await db.query("select id from public.offers where id=$1", [id])).rowCount, 0);
    assert.equal((await read(ids.property1, id)).draft, null);
  }));
