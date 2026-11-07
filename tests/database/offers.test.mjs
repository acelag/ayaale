import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createOfferFixtures } from "./offer-fixtures.mjs";
import { createDatabaseHarness } from "./helpers.mjs";

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
async function rejects(sql, params, code = "23514") {
  await db.query("savepoint expected_failure");
  try {
    await assert.rejects(db.query(sql, params), (error) => error.code === code);
  } finally {
    await db.query("rollback to savepoint expected_failure; release savepoint expected_failure");
  }
}
const { offer, revision, submit, approve, publish } = createOfferFixtures(db, ids);

test("offer and revision/history tables have RLS and no browser privileges", async () => {
  const { rows } = await db.query(`select c.relrowsecurity,
    has_table_privilege('anon',c.oid,'select,insert,update,delete') as anon_access,
    has_table_privilege('authenticated',c.oid,'select,insert,update,delete') as user_access
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' and c.relname='offers')
    or (n.nspname='private' and c.relname in ('offer_revisions','offer_status_history'))`);
  assert.equal(rows.length, 3);
  const privileges = (
    await db.query(`select
    has_table_privilege('service_role','public.offers','delete') as delete_offer,
    has_table_privilege('service_role','private.offer_status_history','update') as rewrite_history`)
  ).rows[0];
  assert.deepEqual(privileges, { delete_offer: false, rewrite_history: false });
  for (const row of rows)
    assert.deepEqual(row, { relrowsecurity: true, anon_access: false, user_access: true });
});

test("promotional price is mandatory, fixed precision, positive and currency/unit bounded", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    for (const sql of [
      "update private.offer_revisions set promotional_price=0 where id=$1",
      "update private.offer_revisions set promotional_price=-1 where id=$1",
      "update private.offer_revisions set original_price=0 where id=$1",
      "update private.offer_revisions set promotional_price='NaN'::numeric where id=$1",
      "update private.offer_revisions set original_price='NaN'::numeric where id=$1",
      "update private.offer_revisions set currency='USD' where id=$1",
      "update private.offer_revisions set price_unit='free_text_unit' where id=$1",
      "update private.offer_revisions set price_qualifier='guaranteed_lowest' where id=$1",
    ])
      await rejects(sql, [rev]);
    await rejects(
      "update private.offer_revisions set promotional_price=null where id=$1",
      [rev],
      "23502",
    );
    await db.query(
      "update private.offer_revisions set promotional_price=123.456,price_unit='per_night',price_qualifier='starting_from' where id=$1",
      [rev],
    );
    const row = (
      await db.query(
        "select promotional_price,price_unit,price_qualifier from private.offer_revisions where id=$1",
        [rev],
      )
    ).rows[0];
    assert.deepEqual(row, {
      promotional_price: "123.46",
      price_unit: "per_night",
      price_qualifier: "starting_from",
    });
  });
});

test("discount is database-generated only when comparison is valid and never overstates 100 percent", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    assert.equal(
      (await db.query("select discount_percent from private.offer_revisions where id=$1", [rev]))
        .rows[0].discount_percent,
      "25.00",
    );
    for (const original of [null, 100, 150]) {
      await db.query("update private.offer_revisions set original_price=$2 where id=$1", [
        rev,
        original,
      ]);
      assert.equal(
        (await db.query("select discount_percent from private.offer_revisions where id=$1", [rev]))
          .rows[0].discount_percent,
        null,
      );
    }
    await db.query(
      "update private.offer_revisions set original_price=9999999999.99,promotional_price=0.01 where id=$1",
      [rev],
    );
    assert.equal(
      (await db.query("select discount_percent from private.offer_revisions where id=$1", [rev]))
        .rows[0].discount_percent,
      "99.99",
    );
    await rejects(
      "update private.offer_revisions set discount_percent=90 where id=$1",
      [rev],
      "428C9",
    );
  });
});

test("publication timestamps and inclusive redemption dates remain distinct and valid", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    await db.query(
      "update private.offer_revisions set redemption_ends_on=redemption_starts_on where id=$1",
      [rev],
    );
    await submit(rev);
    assert.equal(
      (
        await db.query(
          "select (redemption_starts_on>publication_ends_at::date) as distinct_windows from private.offer_revisions where id=$1",
          [rev],
        )
      ).rows[0].distinct_windows,
      true,
    );
    const rev2 = await revision(id, 2);
    await rejects(
      "update private.offer_revisions set publication_ends_at=publication_starts_at where id=$1",
      [rev2],
    );
    await rejects("update private.offer_revisions set publication_ends_at='infinity' where id=$1", [
      rev2,
    ]);
    await rejects("update private.offer_revisions set redemption_ends_on='infinity' where id=$1", [
      rev2,
    ]);
    await rejects("update private.offer_revisions set publication_starts_at=null where id=$1", [
      rev2,
    ]);
    await rejects(
      "update private.offer_revisions set redemption_ends_on=redemption_starts_on-1 where id=$1",
      [rev2],
    );
  });
});

test("incomplete drafts cannot be submitted or inserted as already approved", async () => {
  await transaction(async () => {
    const id = await offer();
    const rev = (
      await db.query(
        `insert into private.offer_revisions(offer_id,revision_number,title,short_description,category,promotional_price,price_unit)
      values($1,1,'Draft','Incomplete draft','dining',100,'per_person') returning id`,
        [id],
      )
    ).rows[0].id;
    await rejects(
      "update private.offer_revisions set status='pending_review',submitted_by=$2,submitted_at=clock_timestamp() where id=$1",
      [rev, ids.owner],
    );
    await rejects(
      "update private.offer_revisions set status='approved',reviewed_by=$2,reviewed_at=clock_timestamp() where id=$1",
      [rev, ids.owner],
    );
    await rejects(
      `insert into private.offer_revisions(offer_id,revision_number,status,title,short_description,category,promotional_price,price_unit)
      values($1,2,'approved','Skipped review','Invalid','dining',100,'per_person')`,
      [id],
    );
  });
});

test("category, inclusions, child coverage and photo references are bounded", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    for (const sql of [
      "update private.offer_revisions set inclusions=array[' '] where id=$1",
      "update private.offer_revisions set inclusions=array[null] where id=$1",
      "update private.offer_revisions set adults=0 where id=$1",
      "update private.offer_revisions set children=-1 where id=$1",
      "update private.offer_revisions set child_age_min=15,child_age_max=5 where id=$1",
      "update private.offer_revisions set category='dining' where id=$1",
      "update private.offer_revisions set category_details='[]' where id=$1",
      'update private.offer_revisions set category_details=\'{"subscription":"paid"}\' where id=$1',
      "update private.offer_revisions set cover_photo_path='../another-property/cover.jpg' where id=$1",
      "update private.offer_revisions set cover_photo_path='https://untrusted.example/photo.jpg' where id=$1",
    ])
      await rejects(sql, [rev]);
    await db.query("update private.offer_revisions set children=1 where id=$1", [rev]);
    await rejects(
      "update private.offer_revisions set status='pending_review',submitted_by=$2,submitted_at=clock_timestamp() where id=$1",
      [rev, ids.owner],
    );
    await db.query(
      "update private.offer_revisions set child_age_min=2,child_age_max=11,child_policy='Included within the listed allowance' where id=$1",
      [rev],
    );
    await submit(rev);
  });
});

test("unverified businesses can draft but cannot submit or publish", async () => {
  await transaction(async () => {
    await db.query("update public.properties set verification_status='pending' where id=$1", [
      ids.property1,
    ]);
    const id = await offer(),
      rev = await revision(id);
    await rejects(
      "update private.offer_revisions set status='pending_review',submitted_by=$2,submitted_at=clock_timestamp() where id=$1",
      [rev, ids.owner],
    );
    await rejects("update public.offers set status='active' where id=$1", [id]);
  });
});

test("submitted content and completed review decisions cannot be edited or reopened", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    await submit(rev);
    for (const sql of [
      "update private.offer_revisions set promotional_price=50 where id=$1",
      "update private.offer_revisions set publication_ends_at=publication_ends_at+interval '1 day' where id=$1",
      "update private.offer_revisions set title='Changed after submission' where id=$1",
      "update private.offer_revisions set status='draft' where id=$1",
    ])
      await rejects(sql, [rev]);
    await db.query(
      "update private.offer_revisions set status='approved',reviewed_by=$2,reviewed_at=clock_timestamp() where id=$1",
      [rev, ids.replacement],
    );
    await rejects(
      "update private.offer_revisions set review_message='Changed decision' where id=$1",
      [rev],
    );
    await rejects("delete from private.offer_revisions where id=$1", [rev], "55000");
  });
});

test("approved pointers reject drafts and revisions belonging to another offer", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    await rejects("update public.offers set approved_revision_id=$2 where id=$1", [id, rev]);
    await approve(rev);
    const other = await offer();
    await rejects("update public.offers set approved_revision_id=$2,status='active' where id=$1", [
      other,
      rev,
    ]);
    await publish(id, rev);
  });
});

test("active approved content remains unchanged while a separate edit awaits review", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    await approve(rev);
    await publish(id, rev);
    const edit = await revision(id, 2);
    await db.query("update private.offer_revisions set promotional_price=75 where id=$1", [edit]);
    await submit(edit);
    const row = (
      await db.query(
        "select o.status,o.approved_revision_id,r.promotional_price from public.offers o join private.offer_revisions r on r.id=o.approved_revision_id where o.id=$1",
        [id],
      )
    ).rows[0];
    assert.deepEqual(row, {
      status: "active",
      approved_revision_id: rev,
      promotional_price: "150.00",
    });
    const third = await revision(id, 3);
    await rejects(
      "update private.offer_revisions set status='pending_review',submitted_by=$2,submitted_at=clock_timestamp() where id=$1",
      [third, ids.owner],
      "23505",
    );
    await rejects("update private.offer_revisions set revision_number=2 where id=$1", [third]);
  });
});

test("status/revision history appends with actor and cannot be rewritten", async () => {
  await transaction(async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.owner]);
    const id = await offer(),
      rev = await revision(id);
    await approve(rev);
    await publish(id, rev, "approved");
    await publish(id, rev);
    const rows = (
      await db.query(
        "select previous_status,new_status,changed_by from private.offer_status_history where offer_id=$1 order by changed_at",
        [id],
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => r.new_status),
      ["draft", "approved", "active"],
    );
    assert.ok(rows.every((r) => r.changed_by === ids.owner));
    await rejects(
      "update private.offer_status_history set new_status='paused' where offer_id=$1",
      [id],
      "55000",
    );
    await rejects("delete from private.offer_status_history where offer_id=$1", [id], "55000");
  });
});

test("URL/property identity and first publication timestamp stay stable through pause/end", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    await approve(rev);
    await publish(id, rev);
    const first = (await db.query("select first_published_at from public.offers where id=$1", [id]))
      .rows[0].first_published_at;
    await rejects("update public.offers set slug='new-url' where id=$1", [id]);
    await rejects("update public.offers set property_id=$2 where id=$1", [id, ids.property2]);
    await rejects("update public.offers set approved_revision_id=null where id=$1", [id]);
    await db.query(
      "update public.offers set status='paused',first_published_at='2000-01-01' where id=$1",
      [id],
    );
    await db.query("update public.offers set status='ended' where id=$1", [id]);
    const row = (
      await db.query(
        "select first_published_at,approved_revision_id from public.offers where id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(row.first_published_at.toISOString(), first.toISOString());
    assert.equal(row.approved_revision_id, rev);
    await rejects("delete from public.offers where id=$1", [id], "23503");
  });
});

test("future and elapsed publication windows cannot be activated", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    await db.query(
      "update private.offer_revisions set publication_starts_at=now()+interval '1 day',publication_ends_at=now()+interval '2 days' where id=$1",
      [rev],
    );
    await approve(rev);
    await publish(id, rev, "scheduled");
    await rejects("update public.offers set status='active' where id=$1", [id]);
    const id2 = await offer(),
      rev2 = await revision(id2);
    await db.query(
      "update private.offer_revisions set publication_starts_at=now()-interval '2 days',publication_ends_at=now()-interval '1 day' where id=$1",
      [rev2],
    );
    await approve(rev2);
    await rejects("update public.offers set approved_revision_id=$2,status='active' where id=$1", [
      id2,
      rev2,
    ]);
  });
});

test("trusted service writes work with invoker triggers and no security-definer function", async () => {
  await transaction(async () => {
    await db.query("set local role service_role");
    const id = await offer(),
      rev = await revision(id);
    await approve(rev);
    await publish(id, rev);
    await db.query("update public.offers set status='paused' where id=$1", [id]);
    assert.equal(
      (await db.query("select status from public.offers where id=$1", [id])).rows[0].status,
      "paused",
    );
  });
});

test("Dining and Day Outs support category-specific content without stay nights", async () => {
  await transaction(async () => {
    for (const category of ["dining", "day_outs"]) {
      const id = await offer(),
        rev = await revision(id, 1, category);
      const details =
        category === "dining"
          ? { meal_period: "Lunch", service_start: "12:00", service_end: "15:00" }
          : { access_start: "09:00", access_end: "17:00", facilities: ["Pool"] };
      await db.query("update private.offer_revisions set category_details=$2 where id=$1", [
        rev,
        details,
      ]);
      await approve(rev);
      await publish(id, rev);
      assert.equal(
        (await db.query("select nights from private.offer_revisions where id=$1", [rev])).rows[0]
          .nights,
        null,
      );
    }
  });
});

test("each essential field is required before submission and taxes cannot remain undisclosed", async () => {
  await transaction(async () => {
    const id = await offer(),
      rev = await revision(id);
    for (const assignment of [
      "package_coverage=null",
      "adults=null",
      "inclusions='{}'",
      "terms=null",
      "taxes_included=null",
      "cover_photo_path=null",
      "nights=null",
      "taxes_included=false,tax_details=null",
    ]) {
      await rejects(
        `update private.offer_revisions set ${assignment},status='pending_review',submitted_by=$2,submitted_at=clock_timestamp() where id=$1`,
        [rev, ids.owner],
      );
    }
    await db.query(
      "update private.offer_revisions set taxes_included=false,tax_details='10 percent tax, excluded from the promotional price' where id=$1",
      [rev],
    );
    await submit(rev);
  });
});

test("history references cannot cross offer boundaries or invent statuses", async () => {
  await transaction(async () => {
    const id = await offer(),
      other = await offer(),
      rev = await revision(other);
    await approve(rev);
    await rejects(
      "insert into private.offer_status_history(offer_id,new_status,approved_revision_id) values($1,'approved',$2)",
      [id, rev],
      "23503",
    );
    await rejects(
      "insert into private.offer_status_history(offer_id,new_status) values($1,'invented')",
      [id],
    );
  });
});
