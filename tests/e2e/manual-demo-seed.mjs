// Manual practice data, exclusively inside createDatabaseHarness's random local database.
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { fixtureUserByEmail } from "./partner-fixture.mjs";
import { createOfferFixtures } from "../database/offer-fixtures.mjs";

export async function seedManualDemo(db, ids, objects) {
  const name = (await db.query("select current_database() as name")).rows[0].name;
  if (process.env.AYAALE_LOCAL_DEMO !== "1" || !/^ayaale_test_[a-f0-9]{32}$/.test(name))
    throw new Error("Manual samples require an isolated test database");
  const users = ["owner", "admin", "staff"].map((role) =>
    fixtureUserByEmail(`fixture-${role}@example.invalid`),
  );
  const [owner, admin, staff] = users;
  await db.query("begin");
  try {
    for (const user of users) {
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
        user.id,
        user.email,
      ]);
      await db.query("insert into public.profiles(id,display_name) values($1,$2)", [
        user.id,
        `Sample ${user.email.split("@")[0].replace("fixture-", "")}`,
      ]);
    }
    await db.query("insert into private.platform_admins(profile_id) values($1)", [admin.id]);
    await db.query(
      "update public.property_memberships set profile_id=$1 where role='owner' and profile_id=$2",
      [owner.id, ids.owner],
    );
    await db.query("delete from public.property_memberships where role='staff'");
    await db.query(
      "insert into public.property_memberships(property_id,profile_id,role,staff_slot) values($1,$2,'staff',1)",
      [ids.property1, staff.id],
    );
    const day = randomUUID();
    const pending = randomUUID();
    const props = [
      {
        id: ids.property1,
        name: "SAMPLE Garden Stay",
        slug: "sample-garden-stay",
        category: "stays",
        type: "guest_house",
        district: "Kandy",
        color: "#356859",
      },
      {
        id: ids.property2,
        name: "SAMPLE Table Cafe",
        slug: "sample-table-cafe",
        category: "dining",
        type: "cafe",
        district: "Colombo",
        color: "#88543d",
      },
      {
        id: day,
        name: "SAMPLE Day Retreat",
        slug: "sample-day-retreat",
        category: "day_outs",
        type: "day_out_venue",
        district: "Galle",
        color: "#346d8c",
      },
    ];
    for (const p of props) {
      const values = [p.id, p.slug, p.name, p.category, p.type, p.district];
      if (p.id === day) {
        await db.query(
          `insert into public.properties(id,slug,name,primary_category,property_type,district,address,latitude,longitude,google_maps_url,verification_status)
          values($1,$2,$3,$4,$5,$6,'FICTIONAL - local test only',6.9271,79.8612,'https://maps.google.com/?q=synthetic-sample-only','verified')`,
          values,
        );
        await db.query(
          "insert into public.property_memberships(property_id,profile_id,role) values($1,$2,'owner')",
          [p.id, owner.id],
        );
      } else
        await db.query(
          "update public.properties set slug=$2,name=$3,primary_category=$4,property_type=$5,district=$6,address='FICTIONAL - local test only' where id=$1",
          values,
        );
      await db.query(
        "update public.properties set description='Fictional property for local practice. Not a real business. Do not book or contact.',public_phone='+12025550101',public_whatsapp='+12025550101',amenities=array['Pool','Parking'] where id=$1",
        [p.id],
      );
      const asset = randomUUID();
      const path = `${p.id}/${asset}/main.webp`;
      const thumb = `${p.id}/${asset}/thumbnail.webp`;
      const image = await sharp(
        Buffer.from(
          `<svg width="640" height="480"><rect width="640" height="480" fill="${p.color}"/><text x="320" y="220" text-anchor="middle" fill="white" font-size="44">SAMPLE</text><text x="320" y="280" text-anchor="middle" fill="white" font-size="24">Local practice only</text></svg>`,
        ),
      )
        .webp()
        .toBuffer();
      objects.set(path, image);
      objects.set(thumb, image);
      await db.query(
        "insert into public.photo_assets(id,property_id,created_by,main_path,thumbnail_path,width,height,byte_size) values($1,$2,$3,$4,$5,640,480,$6)",
        [asset, p.id, owner.id, path, thumb, image.length],
      );
      await db.query(
        "insert into private.property_public_photos(property_id,asset_id,position,alt_text) values($1,$2,1,'Sample graphic - not a property photograph')",
        [p.id, asset],
      );
      p.asset = asset;
      p.path = path;
    }
    await db.query(
      `insert into public.properties(id,slug,name,primary_category,property_type,address,district)
      values($1,'sample-pending-property','SAMPLE Pending Property','stays','villa','Fictional address - local test only','Matara')`,
      [pending],
    );
    await db.query(
      "insert into public.property_memberships(property_id,profile_id,role) values($1,$2,'owner')",
      [pending, owner.id],
    );
    await db.query(
      `insert into private.property_verification_requests(property_id,requested_by,request_kind,applicant_contact_name,proposed_profile,applicant_message)
      values($1,$2,'initial','Sample owner',$3,'LOCAL TEST ONLY: practice verification; no real business exists.')`,
      [
        pending,
        owner.id,
        JSON.stringify({
          name: "SAMPLE Pending Property",
          primary_category: "stays",
          property_type: "villa",
          address: "Fictional address - local test only",
          district: "Matara",
        }),
      ],
    );
    const fixtures = createOfferFixtures(db, { ...ids, owner: owner.id, replacement: admin.id });
    const active = [];
    async function make(p, title, status = "active") {
      const offer = randomUUID();
      const slug = `sample-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      await db.query("insert into public.offers(id,property_id,slug) values($1,$2,$3)", [
        offer,
        p.id,
        slug,
      ]);
      const rev = await fixtures.revision(offer, 1, p.category);
      await db.query(
        `update private.offer_revisions set title=$2,short_description='SAMPLE - local practice offer, not redeemable.',promotional_price=$3,original_price=$4,cover_photo_path=$5,
        redemption_starts_on=(now() at time zone 'Asia/Colombo')::date,
        redemption_ends_on=(now() at time zone 'Asia/Colombo')::date+30,
        publication_ends_at=now()+interval '14 days',terms='LOCAL TEST ONLY. Not a real offer. No bookings or payments.' where id=$1`,
        [
          rev,
          `SAMPLE ${title}`,
          p.category === "stays" ? 18500 : 4500,
          p.category === "stays" ? 24000 : 6000,
          p.path,
        ],
      );
      if (status === "pending_review") {
        await fixtures.submit(rev);
        await db.query("update public.offers set status='pending_review' where id=$1", [offer]);
      } else {
        await fixtures.approve(rev);
        await fixtures.publish(offer, rev, status);
      }
      if (status === "active") active.push({ id: offer, rev, p, slug });
      return { id: offer, rev, slug };
    }
    for (const p of props) {
      await make(
        p,
        p.category === "stays"
          ? "Weekend stay"
          : "dining" === p.category
            ? "Lunch for two"
            : "Pool day pass",
      );
      await make(
        p,
        p.category === "stays"
          ? "Family escape"
          : "dining" === p.category
            ? "Dinner special"
            : "Garden picnic",
      );
      await db.query(
        "insert into private.offer_wizard_drafts(id,property_id,created_by,content) values($1,$2,$3,$4)",
        [
          randomUUID(),
          p.id,
          owner.id,
          JSON.stringify({
            title: `SAMPLE ${p.name.replace("SAMPLE ", "")} draft`,
            category: p.category,
            cover: p.asset,
            gallery: [],
            promotional_price: "5000",
            short_description: "Sample draft to finish using the offer wizard.",
          }),
        ],
      );
    }
    await make(props[0], "Paused stay", "paused");
    await make(props[1], "Offer awaiting admin review", "pending_review");
    await make(props[2], "Ended day package", "ended");
    for (const [index, o] of active.entries()) {
      for (let n = 0; n < index + 4; n++)
        await db.query(
          `insert into private.offer_view_events(offer_id,deduplication_key,occurred_at) values($1,$2,clock_timestamp())`,
          [o.id, createHash("sha256").update(randomUUID()).digest("hex")],
        );
      for (const channel of ["call", "whatsapp"])
        await db.query(
          "insert into private.contact_click_events(offer_id,channel,deduplication_key) values($1,$2,$3)",
          [o.id, channel, createHash("sha256").update(randomUUID()).digest("hex")],
        );
    }
    await db.query(
      "insert into private.issue_reports(offer_id,reason,comment) values($1,'incorrect_price','SAMPLE report: practice checking the price; this is not an allegation about a real business.')",
      [active[0].id],
    );
    // Synthetic newsletter audience with real consent transitions; no sends.
    for (const [index, state] of ["confirmed", "confirmed", "pending", "unsubscribed"].entries()) {
      const subscriber = randomUUID();
      await db.query("insert into private.newsletter_subscribers(id,email) values($1,$2)", [
        subscriber,
        `sample-reader-${index + 1}@example.invalid`,
      ]);
      const requested = (
        await db.query(
          "insert into private.subscriber_consents(subscriber_id,action,consent_text,consent_version,privacy_version,source) values($1,'requested','Sample weekly newsletter consent','sample-v1','sample-privacy-v1','homepage') returning id",
          [subscriber],
        )
      ).rows[0].id;
      if (state !== "pending") {
        const confirmed = (
          await db.query(
            "insert into private.subscriber_consents(subscriber_id,action,request_id,consent_text,consent_version,privacy_version,source) values($1,'confirmed',$2,'Sample weekly newsletter consent','sample-v1','sample-privacy-v1','confirmation') returning occurred_at::text",
            [subscriber, requested],
          )
        ).rows[0].occurred_at;
        await db.query(
          "update private.newsletter_subscribers set status='confirmed',confirmed_at=$2 where id=$1",
          [subscriber, confirmed],
        );
      }
      if (state === "unsubscribed") {
        const withdrawn = (
          await db.query(
            "insert into private.subscriber_consents(subscriber_id,action,consent_text,consent_version,privacy_version,source) values($1,'withdrawn','Sample withdrawal','sample-v1','sample-privacy-v1','unsubscribe') returning occurred_at::text",
            [subscriber],
          )
        ).rows[0].occurred_at;
        await db.query(
          "update private.newsletter_subscribers set status='unsubscribed',withdrawn_at=$2 where id=$1",
          [subscriber, withdrawn],
        );
      }
    }
    const campaign = randomUUID();
    await db.query(
      "insert into private.newsletters(id,subject,intro,created_by) values($1,'SAMPLE Friday discoveries','Local practice edition. No messages will be sent.',$2)",
      [campaign, admin.id],
    );
    for (const [i, o] of active.entries())
      await db.query(
        "insert into private.newsletter_offers(newsletter_id,offer_id,revision_id,position) values($1,$2,$3,$4)",
        [campaign, o.id, o.rev, i + 1],
      );
    await db.query("commit");
    console.log(
      JSON.stringify({
        sampleProperties: 4,
        activeOffers: active.length,
        drafts: 3,
        paused: 1,
        ended: 1,
        pendingOfferReviews: 1,
        pendingVerifications: 1,
        newsletterDrafts: 1,
        owner: "fixture-owner@example.invalid",
        admin: "fixture-admin@example.invalid",
        staff: "fixture-staff@example.invalid",
      }),
    );
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
