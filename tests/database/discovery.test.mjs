import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";
const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
const raw = [],
  revisions = [];
let properties;
async function addProperty(name) {
  const id = randomUUID();
  await db.query(
    `insert into public.properties(id,slug,name,primary_category,property_type,address,district,latitude,longitude,google_maps_url,verification_status)
 values($1,$2,$3,'stays','hotel','Synthetic address','Kandy',6.9,79.8,'https://maps.google.com/?q=6.9,79.8','verified')`,
    [id, `synthetic-${id}`, name],
  );
  await db.query(
    "insert into public.property_memberships(property_id,profile_id,role) values($1,$2,'owner')",
    [id, ids.owner],
  );
  return id;
}
before(async () => {
  await setup();
  await db.query("begin");
  await db.query("update public.properties set name='Boundary inn' where id=$1", [ids.property1]);
  properties = [ids.property1, ids.property2];
  for (let i = 2; i < 7; i++) properties.push(await addProperty(`Synthetic hotel ${i}`));
  const sequence = [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 0, 0, 0, 5, 5, 5];
  for (let i = sequence.length - 1; i >= 0; i--) {
    const off = await offer(properties[sequence[i]]),
      rev = await revision(off, 1, i === 3 ? "dining" : "stays");
    await db.query("update private.offer_revisions set title=$2 where id=$1", [
      rev,
      `Synthetic listing ${i + 1}`,
    ]);
    await approve(rev);
    await publish(off, rev);
    raw[i] = off;
    revisions[i] = rev;
  }
  await db.query("commit");
});
after(cleanup);
async function tx(fn) {
  await db.query("begin");
  try {
    await fn();
  } finally {
    await db.query("rollback");
  }
}
async function page(category = "all", q = "", cursor = null) {
  return (
    await db.query("select public.list_discovery_offers($1,$2,$3) as result", [category, q, cursor])
  ).rows[0].result;
}
const list = (result) => result.offers.map((x) => x.id);
test("anonymous projection returns only public approved card data, no table grants", () =>
  tx(async () => {
    await db.query("set local role anon");
    const result = await page();
    assert.equal(result.offers.length, 12);
    assert.deepEqual(
      Object.keys(result.offers[0]).sort(),
      [
        "id",
        "title",
        "category",
        "property",
        "district",
        "price",
        "originalPrice",
        "discountPercent",
        "priceUnit",
        "startingFrom",
        "adults",
        "children",
        "nights",
        "inclusions",
      ].sort(),
    );
    await assert.rejects(
      db.query("select * from private.offer_revisions"),
      (e) => e.code === "42501",
    );
  }));
test("12-item keyset preserves newest-first except required fair alternation across pages", () =>
  tx(async () => {
    const first = await page();
    assert.deepEqual(list(first), raw.slice(0, 12));
    assert.ok(first.continuation);
    const next = await page("all", "", first.continuation);
    assert.deepEqual(list(next), [raw[13], raw[12], raw[14], raw[15]]);
    assert.equal(next.continuation, null);
    assert.equal(new Set([...list(first), ...list(next)]).size, 16);
  }));
test("the third same-property candidate is carried to the following page when displaced at position 12", () =>
  tx(async () => {
    // Remove one earlier card so the third consecutive property-1 offer lands at the page edge.
    await db.query("update public.offers set status='paused' where id=$1", [raw[0]]);
    const first = await page();
    assert.deepEqual(list(first), [...raw.slice(1, 12), raw[13]]);
    assert.deepEqual(first.continuation.pending, [raw[12]]);
    const second = await page("all", "", first.continuation);
    assert.deepEqual(list(second), [raw[12], raw[14], raw[15]]);
    await db.query("update public.offers set status='paused' where id=$1", [raw[12]]);
    assert.deepEqual(list(await page("all", "", first.continuation)), [raw[14], raw[15]]);
  }));
test("category and literal case-insensitive search are applied before ranking; one-property results are retained", () =>
  tx(async () => {
    assert.deepEqual(list(await page("dining", "synthetic")), [raw[3]]);
    assert.deepEqual(list(await page("all", "BOUNDARY INN")), raw.slice(10, 13));
    assert.deepEqual(list(await page("all", "%")), []);
    assert.deepEqual(list(await page("all", "Kandy")).slice(0, 1), [raw[1]]);
  }));
test("query-time visibility excludes paused/hidden offers, cancelled entitlement and suspended property", () =>
  tx(async () => {
    await db.query("update public.offers set status='paused' where id=$1", [raw[0]]);
    await db.query("update public.offers set status='hidden_by_admin' where id=$1", [raw[1]]);
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [properties[4]],
    );
    await db.query("update public.properties set verification_status='suspended' where id=$1", [
      properties[5],
    ]);
    const result = await page();
    for (const index of [0, 1, 4 - 1, 7, 13, 14, 15]) assert.ok(!list(result).includes(raw[index]));
  }));
test("elapsed publication or redemption stays excluded even with raw active status", () =>
  tx(async () => {
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.offer_revisions set publication_ends_at=now()-interval '1 second' where id=$1",
      [revisions[0]],
    );
    await db.query(
      "update private.offer_revisions set redemption_starts_on=current_date-2,redemption_ends_on=current_date-1 where id=$1",
      [revisions[1]],
    );
    await db.query("set local session_replication_role='origin'");
    const result = await page();
    assert.ok(!list(result).includes(raw[0]));
    assert.ok(!list(result).includes(raw[1]));
  }));
test("newly published rows do not shift an existing continuation; unavailable rows disappear", async () => {
  const first = await page();
  await tx(async () => {
    const off = await offer(properties[6]),
      rev = await revision(off);
    await approve(rev);
    await publish(off, rev);
    await db.query("update public.offers set status='paused' where id=$1", [raw[12]]);
    const next = await page("all", "", first.continuation);
    assert.deepEqual(list(next), raw.slice(13));
    assert.ok(!list(next).includes(off));
    assert.ok(list(await page()).includes(off));
  });
});
test("equal publication timestamps use descending UUID tie-break, not unstable insertion order", () =>
  tx(async () => {
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update public.offers set first_published_at=now()-interval '1 hour' where id=any($1::uuid[])",
      [raw.slice(10, 13)],
    );
    await db.query("set local session_replication_role='origin'");
    assert.deepEqual(
      list(await page("all", "Boundary inn")),
      [...raw.slice(10, 13)].sort().reverse(),
    );
  }));
test("unapproved edits never replace the visible approved revision", () =>
  tx(async () => {
    const draft = await revision(raw[0], 2);
    await db.query("update private.offer_revisions set title='Private edit marker' where id=$1", [
      draft,
    ]);
    assert.deepEqual(list(await page("all", "Private edit marker")), []);
    assert.equal((await page()).offers[0].title, "Synthetic listing 1");
  }));
test("invalid filters and unbounded continuation input fail closed", async () => {
  for (const [category, q, cursor] of [
    ["bad", "", null],
    ["all", "x".repeat(121), null],
    ["all", "", { pending: Array(4).fill(randomUUID()) }],
  ]) {
    await assert.rejects(page(category, q, cursor), (e) => e.code === "22023");
  }
});

async function filtered(filters, cursor = null, category = "all") {
  return (
    await db.query("select public.list_discovery_offers_filtered($1,'',$2,$3) as result", [
      category,
      cursor,
      filters,
    ])
  ).rows[0].result;
}

test("filtered anonymous count and cards share destination, price, redemption and stay constraints", () =>
  tx(async () => {
    const dates = (
      await db.query(
        "select redemption_starts_on::text as start, redemption_ends_on::text as finish from private.offer_revisions where id=$1",
        [revisions[0]],
      )
    ).rows[0];
    await db.query("set local role anon");
    const result = await filtered(
      {
        destination: "colombo",
        min: "150",
        max: "150",
        from: dates.start,
        to: dates.finish,
        guests: "2",
        nights: "1",
      },
      null,
      "stays",
    );
    assert.equal(result.total, 6);
    assert.equal(result.offers.length, result.total);
    assert.equal((await filtered({ destination: "Colombo", guests: "3" })).total, 0);
    assert.equal((await filtered({ from: "2099-01-01" })).total, 0);
    assert.equal((await filtered({ max: "149.99" })).total, 0);
  }));

test("explicit sorts rank by price, discount and publication deadline across pages", () =>
  tx(async () => {
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.offer_revisions set promotional_price=50, original_price=250, publication_ends_at=now()+interval '5 minutes' where id=$1",
      [revisions[15]],
    );
    await db.query("set local session_replication_role='origin'");
    for (const sort of ["price", "discount", "ending"]) {
      const first = await filtered({ sort });
      assert.equal(first.total, 16);
      assert.equal(first.offers.length, 12);
      assert.equal(first.offers[0].id, raw[15]);
      const next = await filtered({ sort }, first.continuation);
      assert.equal(next.total, 16);
      assert.equal(next.offers.length, 4);
      assert.equal(new Set([...list(first), ...list(next)]).size, 16);
    }
  }));

test("filter ranges and continuations from another sort are rejected", async () => {
  const first = await filtered({ sort: "price" });
  await assert.rejects(
    filtered({ sort: "ending" }, first.continuation),
    (error) => error.code === "22023",
  );
  await assert.rejects(filtered({ min: "200", max: "100" }), (error) => error.code === "22023");
  await assert.rejects(
    filtered({ from: "2027-06-20", to: "2027-06-19" }),
    (error) => error.code === "22023",
  );
});

test("offer details expose only the active approved snapshot and linked cards expose its slug", () =>
  tx(async () => {
    const slug = `synthetic-${raw[0]}`;
    await db.query("set local role anon");
    const result = await filtered({});
    assert.equal(result.offers[0].slug, slug);
    const { rows } = await db.query("select public.get_public_offer_details($1) as detail", [slug]);
    const detail = rows[0].detail;
    assert.equal(detail.title, result.offers[0].title);
    assert.equal(detail.price, 150);
    assert.ok(detail.publicationStart && detail.redemptionStart);
    assert.ok(detail.terms);
    for (const field of ["cover_path", "cover_photo_path", "reviewed_by", "public_phone"]) {
      assert.equal(Object.hasOwn(detail, field), false);
    }
    assert.equal(
      (await db.query("select public.get_public_offer_details('missing-offer') as detail")).rows[0]
        .detail,
      null,
    );
    await assert.rejects(
      db.query("select public.get_public_offer_cover_path($1)", [slug]),
      (error) => error.code === "42501",
    );
  }));

test("cover lookup requires the approved path, matching property and current visibility", () =>
  tx(async () => {
    const asset = randomUUID();
    const property = properties[1];
    const path = `${property}/${asset}/main.webp`;
    await db.query(
      "insert into public.photo_assets(id,property_id,created_by,main_path,thumbnail_path,width,height,byte_size) values($1,$2,$3,$4,$5,32,24,256)",
      [asset, property, ids.owner, path, `${property}/${asset}/thumbnail.webp`],
    );
    // Exercise a same-property and an invalid cross-property approved reference.
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.offer_revisions set cover_photo_path=$1 where id=any($2::uuid[])",
      [path, revisions.slice(0, 2)],
    );
    await db.query("set local session_replication_role='origin'");
    const slug = `synthetic-${raw[0]}`;
    const otherSlug = `synthetic-${raw[1]}`;
    await db.query("set local role service_role");
    assert.equal(
      (await db.query("select public.get_public_offer_cover_path($1) as path", [slug])).rows[0]
        .path,
      path,
    );
    assert.equal(
      (await db.query("select public.get_public_offer_cover_path($1) as path", [otherSlug])).rows[0]
        .path,
      null,
    );
    await db.query("update public.offers set status='paused' where id=$1", [raw[0]]);
    const result = await db.query(
      "select public.get_public_offer_details($1) as detail, public.get_public_offer_cover_path($1) as path",
      [slug],
    );
    assert.deepEqual(result.rows[0], { detail: null, path: null });
  }));

test("contact clicks use active public channels and deduplicate retries", () =>
  tx(async () => {
    const slug = `synthetic-${raw[0]}`;
    await db.query("update public.properties set public_phone='+94771234567' where id=$1", [
      properties[1],
    ]);
    const token = randomUUID();
    const args = [slug, "call", token];
    await db.query("set local role service_role");
    const click = async (params) =>
      (await db.query("select public.record_offer_contact_click($1,$2,$3) as result", params))
        .rows[0].result;
    assert.equal(await click(args), "recorded");
    assert.equal(await click(args), "duplicate");
    assert.equal(await click([slug, "whatsapp", token]), "unavailable");
    const events = await db.query(
      "select channel, source, deduplication_key from private.contact_click_events where offer_id=$1",
      [raw[0]],
    );
    assert.equal(events.rows.length, 1);
    assert.equal(events.rows[0].channel, "call");
    assert.equal(events.rows[0].source, "unknown");
    assert.match(events.rows[0].deduplication_key, /^[a-f0-9]{64}$/);
    await db.query("update public.offers set status='paused' where id=$1", [raw[0]]);
    assert.equal(await click([slug, "call", randomUUID()]), "unavailable");
  }));

test("public details show configured contact fields while event insertion requires service access", () =>
  tx(async () => {
    const slug = `synthetic-${raw[0]}`;
    await db.query("update public.properties set public_whatsapp='+94777654321' where id=$1", [
      properties[1],
    ]);
    await db.query("set local role anon");
    const result = await db.query("select public.get_public_offer_details($1) as detail", [slug]);
    assert.equal(result.rows[0].detail.whatsapp, "+94777654321");
    await assert.rejects(
      db.query("select public.record_offer_contact_click($1,'whatsapp',$2)", [slug, randomUUID()]),
      (error) => error.code === "42501",
    );
  }));

test("verified public profiles survive an empty offer list and expose only public fields", () =>
  tx(async () => {
    const property = properties[6];
    const slug = `synthetic-${property}`;
    await db.query(
      "update public.properties set amenities=array['Wi-Fi','Parking'],google_reviews_url='https://g.page/r/test/review' where id=$1",
      [property],
    );
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [property],
    );
    await db.query("set local role anon");
    const { rows } = await db.query("select public.get_public_property_profile($1) as profile", [
      slug,
    ]);
    assert.deepEqual(rows[0].profile.amenities, ["Wi-Fi", "Parking"]);
    assert.deepEqual(rows[0].profile.offers, []);
    assert.equal(rows[0].profile.reviewsUrl, "https://g.page/r/test/review");
    assert.equal(Object.hasOwn(rows[0].profile, "verified_at"), false);
    await assert.rejects(
      db.query("select public.get_public_property_photo_path($1,1::smallint)", [slug]),
      (error) => error.code === "42501",
    );
  }));

test("property photo lookup and listing require a public assignment on a verified property", () =>
  tx(async () => {
    const property = properties[6];
    const slug = `synthetic-${property}`;
    const asset = randomUUID();
    const path = `${property}/${asset}/main.webp`;
    await db.query(
      "insert into public.photo_assets(id,property_id,created_by,main_path,thumbnail_path,width,height,byte_size) values($1,$2,$3,$4,$5,32,24,256)",
      [asset, property, ids.owner, path, `${property}/${asset}/thumbnail.webp`],
    );
    await db.query("savepoint wrong_owner");
    await assert.rejects(
      db.query(
        "insert into private.property_public_photos(property_id,asset_id,position,alt_text) values($1,$2,1,'Photo')",
        [properties[5], asset],
      ),
      (error) => error.code === "23503",
    );
    await db.query("rollback to savepoint wrong_owner");
    await db.query("set local role service_role");
    const photo = async () =>
      (
        await db.query("select public.get_public_property_photo_path($1,1::smallint) as path", [
          slug,
        ])
      ).rows[0].path;
    assert.equal(await photo(), null);
    await db.query(
      "insert into private.property_public_photos(property_id,asset_id,position,alt_text) values($1,$2,1,'Garden entrance')",
      [property, asset],
    );
    assert.equal(await photo(), path);
    const { rows } = await db.query("select public.get_public_property_profile($1) as profile", [
      slug,
    ]);
    assert.deepEqual(rows[0].profile.photos, [{ position: 1, alt: "Garden entrance" }]);
    await db.query("update public.properties set verification_status='suspended' where id=$1", [
      property,
    ]);
    assert.equal(await photo(), null);
    const result = await db.query("select public.get_public_property_profile($1) as profile", [
      slug,
    ]);
    assert.equal(result.rows[0].profile, null);
  }));

async function offerPage(slug) {
  return (await db.query("select public.get_public_offer_page($1) as result", [slug])).rows[0]
    .result;
}

test("old links distinguish pause and end, using the last published revision and current alternatives", () =>
  tx(async () => {
    const slug = `synthetic-${raw[0]}`;
    await db.query("update public.offers set status='paused' where id=any($1::uuid[])", [
      [raw[0], raw[4]],
    ]);
    await db.query("update public.offers set status='ended' where id=$1", [raw[1]]);
    const unpublished = await revision(raw[0], 2, "stays");
    await approve(unpublished);
    await db.query("update public.offers set approved_revision_id=$2 where id=$1", [
      raw[0],
      unpublished,
    ]);
    await db.query("set local role anon");
    const paused = await offerPage(slug);
    assert.deepEqual(Object.keys(paused).sort(), ["related", "state", "title"]);
    assert.equal(paused.state, "paused");
    assert.equal(paused.title, "Synthetic listing 1");
    assert.deepEqual(
      paused.related.map((candidate) => candidate.slug),
      [raw[8], raw[10], raw[11]].map((id) => `synthetic-${id}`),
    );
    assert.deepEqual(Object.keys(paused.related[0]).sort(), [
      "district",
      "property",
      "slug",
      "title",
    ]);
    const ended = await offerPage(`synthetic-${raw[1]}`);
    assert.equal(ended.state, "ended");
    assert.equal(ended.title, "Synthetic listing 2");
    const active = await offerPage(`synthetic-${raw[2]}`);
    assert.equal(active.state, "active");
    assert.equal(active.offer.title, "Synthetic listing 3");
    assert.equal(active.offer.price, 150);
  }));

test("unknown and never-published slugs stay private, while withdrawals hide historical identity", () =>
  tx(async () => {
    const draft = await offer(properties[6]);
    await db.query("update public.offers set status='hidden_by_admin' where id=$1", [raw[1]]);
    await db.query("update public.properties set verification_status='suspended' where id=$1", [
      properties[1],
    ]);
    await db.query("update public.offers set status='ended', archived_at=now() where id=$1", [
      raw[3],
    ]);
    await db.query("set local role anon");
    assert.equal(await offerPage("missing-offer"), null);
    assert.equal(await offerPage(`synthetic-${draft}`), null);
    for (const id of [raw[0], raw[1], raw[3]]) {
      const result = await offerPage(`synthetic-${id}`);
      assert.equal(result.state, "unavailable");
      assert.equal(result.title, null);
      assert.deepEqual(
        result.related.map((candidate) => candidate.slug),
        [raw[2], raw[5], raw[6]].map((candidate) => `synthetic-${candidate}`),
      );
    }
  }));

test("availability follows dates and entitlement even before an offer status update", () =>
  tx(async () => {
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.offer_revisions set publication_ends_at=now()-interval '1 second' where id=$1",
      [revisions[0]],
    );
    await db.query("set local session_replication_role='origin'");
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [properties[2]],
    );
    await db.query("set local role anon");
    assert.equal((await offerPage(`synthetic-${raw[0]}`)).state, "ended");
    assert.equal((await offerPage(`synthetic-${raw[1]}`)).state, "unavailable");
    const unavailableSlugs = [raw[0], raw[1], raw[5], raw[9]].map((id) => `synthetic-${id}`);
    const { related } = await offerPage(`synthetic-${raw[1]}`);
    assert.equal(related.length, 3);
    assert.ok(related.every((candidate) => !unavailableSlugs.includes(candidate.slug)));
  }));

async function sitemapPage(after = null, size = 1000) {
  return (await db.query("select * from public.list_public_sitemap_paths($1,$2)", [after, size]))
    .rows;
}
test("anonymous sitemap exposes only ordered public paths with stable bounded keysets", () =>
  tx(async () => {
    await db.query("set local role anon");
    const all = await sitemapPage();
    assert.equal(all.length, 23);
    assert.deepEqual(Object.keys(all[0]), ["path"]);
    const first = await sitemapPage(null, 3);
    const second = await sitemapPage(first.at(-1).path, 3);
    assert.deepEqual([...first, ...second], all.slice(0, 6));
    assert.equal((await sitemapPage(null, 0)).length, 1);
    assert.deepEqual(await sitemapPage(null, 100000), all);
    assert.ok(all.some((row) => row.path === "/properties/synthetic-property2"));
  }));
test("sitemap excludes withdrawals, unpublished revisions and inactive entitlements", () =>
  tx(async () => {
    await db.query("update public.offers set status='paused' where id=$1", [raw[0]]);
    await db.query("update public.offers set status='hidden_by_admin' where id=$1", [raw[1]]);
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [properties[4]],
    );
    await db.query("update public.properties set verification_status='suspended' where id=$1", [
      properties[5],
    ]);
    const draft = await offer(properties[0]);
    await revision(draft);
    await db.query("set local role anon");
    const paths = (await sitemapPage()).map((row) => row.path);
    for (const id of [raw[0], raw[1], raw[3], raw[7], raw[13], raw[14], raw[15], draft])
      assert.ok(!paths.includes(`/offers/synthetic-${id}`));
    const suspended = (
      await db.query("select public.get_public_property_profile($1) as profile", [
        `synthetic-${properties[5]}`,
      ])
    ).rows[0].profile;
    assert.equal(suspended, null);
    assert.ok(paths.includes("/properties/synthetic-property2"));
  }));
test("sitemap uses current dates even before lifecycle status updates", () =>
  tx(async () => {
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.offer_revisions set publication_ends_at=now()-interval '1 second' where id=$1",
      [revisions[0]],
    );
    await db.query(
      "update private.offer_revisions set redemption_starts_on=current_date-2,redemption_ends_on=current_date-1 where id=$1",
      [revisions[1]],
    );
    await db.query("set local session_replication_role='origin'");
    await db.query("set local role anon");
    const paths = (await sitemapPage()).map((row) => row.path);
    assert.ok(!paths.includes(`/offers/synthetic-${raw[0]}`));
    assert.ok(!paths.includes(`/offers/synthetic-${raw[1]}`));
  }));
