import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish, submit: submitRevision } = createOfferFixtures(db, ids);
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
async function verified(...users) {
  await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
    users,
  ]);
}
async function list(property = ids.property1) {
  return (await db.query("select public.get_partner_offers($1) as result", [property])).rows[0]
    .result;
}
async function capacity(property = ids.property1) {
  return (await db.query("select public.get_property_offer_capacity($1) as result", [property]))
    .rows[0].result;
}
async function manage(id, operation, version = "", draft = null, property = ids.property1) {
  return (
    await db.query("select public.manage_partner_offer($1,$2,$3,$4,$5) as result", [
      property,
      id,
      operation,
      version,
      draft,
    ])
  ).rows[0].result;
}
async function draft(id) {
  return (await db.query("select public.get_offer_wizard($1,$2) as result", [ids.property1, id]))
    .rows[0].result.draft;
}
async function submit(id, content) {
  return (
    await db.query("select public.save_offer_wizard($1,$2,1,$3,true) as result", [
      ids.property1,
      id,
      content,
    ])
  ).rows[0].result;
}
async function publicPage(id) {
  return (await db.query("select public.get_public_offer_page($1) as result", [`synthetic-${id}`]))
    .rows[0].result;
}
async function photo() {
  const id = randomUUID();
  const main = `${ids.property1}/${id}/main.webp`;
  await db.query(
    "insert into public.photo_assets(id,property_id,created_by,main_path,thumbnail_path,width,height,byte_size) values($1,$2,$3,$4,$5,320,240,256)",
    [id, ids.property1, ids.owner, main, `${ids.property1}/${id}/thumbnail.webp`],
  );
  return { id, main };
}
async function activeOffer(cover) {
  const id = await offer();
  const rev = await revision(id);
  if (cover)
    await db.query("update private.offer_revisions set cover_photo_path=$2 where id=$1", [
      rev,
      cover.main,
    ]);
  await approve(rev);
  await publish(id, rev);
  return { id, rev };
}

test("assigned staff can pause, resume and end offers without changing the approved revision", () =>
  tx(async () => {
    await verified(ids.staff2, ids.third);
    const { id, rev } = await activeOffer();
    await asUser(ids.staff2);
    const active = (await list())[0];
    assert.equal(active.status, "active");
    assert.equal(await manage(id, "pause", active.version), "saved");
    assert.equal((await publicPage(id)).state, "paused");
    assert.equal(await manage(id, "pause", active.version), "saved");
    const paused = (await list())[0];
    assert.equal(await manage(id, "resume", paused.version), "saved");
    assert.equal((await publicPage(id)).state, "active");
    assert.equal(await manage(id, "pause", active.version), "stale");
    const resumed = (await list())[0];
    assert.equal(await manage(id, "end", resumed.version), "saved");
    assert.equal((await publicPage(id)).state, "ended");
    const ended = (await list())[0];
    assert.deepEqual(ended.history, { views: 0, clicks: 0 });
    assert.equal(await manage(id, "resume", ended.version), "unavailable");
    const row = (await db.query("select approved_revision_id from public.offers where id=$1", [id]))
      .rows[0];
    assert.equal(row.approved_revision_id, rev);
    assert.equal(await list(ids.property2), null);
    await asUser(ids.third);
    assert.equal(await list(), null);
    assert.equal(await manage(id, "duplicate", "", randomUUID()), "forbidden");
  }));

test("usage counts live offers and an assigned partner cannot resume into a full property", () =>
  tx(async () => {
    await verified(ids.staff2, ids.third);
    await asUser(ids.staff2);
    assert.deepEqual(await capacity(), { active: 0, limit: 3, eligibility: "available" });
    assert.equal(await capacity(ids.property2), null);

    await db.query("reset role");
    const first = await activeOffer();
    const second = await activeOffer();
    await activeOffer();
    const pending = await offer();
    await submitRevision(await revision(pending));

    await asUser(ids.staff2);
    const version = async (id) => (await list()).find((item) => item.id === id).version;
    assert.equal((await capacity()).active, 3);
    const copy = randomUUID();
    assert.equal(await manage(first.id, "duplicate", "", copy), copy);
    assert.equal((await capacity()).active, 3);
    assert.equal(await manage(first.id, "pause", await version(first.id)), "saved");
    assert.equal((await capacity()).active, 2);
    await db.query("reset role");
    await activeOffer();

    await asUser(ids.staff2);
    assert.equal((await capacity()).active, 3);
    assert.equal(await manage(first.id, "resume", await version(first.id)), "capacity");
    assert.equal((await capacity()).active, 3);

    await db.query("reset role");
    // Simulate expiry before the scheduled job updates the offer status.
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.offer_revisions set publication_starts_at=now()-interval '2 days', publication_ends_at=now()-interval '1 day' where id=$1",
      [second.rev],
    );
    await db.query("set local session_replication_role='origin'");
    await asUser(ids.staff2);
    assert.equal((await capacity()).active, 2);
    assert.equal(await manage(first.id, "resume", await version(first.id)), "saved");
    assert.equal((await capacity()).active, 3);
    await asUser(ids.third);
    assert.equal(await capacity(), null);
  }));

test("editing submits a separate revision and leaves the approved live content intact", () =>
  tx(async () => {
    await verified(ids.owner);
    await db.query("update public.properties set public_phone='+94771234567' where id=$1", [
      ids.property1,
    ]);
    const cover = await photo();
    const gallery = await photo();
    const { id, rev } = await activeOffer(cover);
    await db.query(
      "insert into private.offer_revision_gallery(revision_id,asset_id,position) values($1,$2,1)",
      [rev, gallery.id],
    );
    await asUser(ids.owner);
    const edit = randomUUID();
    assert.equal(await manage(id, "edit", "", edit), edit);
    assert.equal(await manage(id, "edit", "", randomUUID()), edit);
    const saved = await draft(edit);
    assert.equal(saved.content.cover, cover.id);
    assert.deepEqual(saved.content.gallery, [gallery.id]);
    const changed = { ...saved.content, title: "New title for review" };
    assert.equal(await submit(edit, changed), "submitted");
    assert.equal(await submit(edit, changed), "submitted");
    assert.equal(await manage(id, "edit", "", randomUUID()), "review");
    const row = (await list())[0];
    assert.equal(row.status, "active");
    assert.equal(row.reviewStatus, "pending_review");
    assert.equal(row.title, "Synthetic offer");
    assert.equal((await publicPage(id)).offer.title, "Synthetic offer");
    await db.query("reset role");
    const revisions = await db.query(
      "select revision_number,title,status from private.offer_revisions where offer_id=$1 order by revision_number",
      [id],
    );
    assert.deepEqual(revisions.rows, [
      { revision_number: 1, title: "Synthetic offer", status: "approved" },
      { revision_number: 2, title: "New title for review", status: "pending_review" },
    ]);
  }));

test("expired offers can be duplicated with fresh dates and resuming still enforces entitlement", () =>
  tx(async () => {
    await verified(ids.owner);
    const { id, rev } = await activeOffer();
    await asUser(ids.owner);
    assert.equal(await manage(id, "pause", (await list())[0].version), "saved");
    await db.query("reset role");
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [ids.property1],
    );
    await asUser(ids.owner);
    assert.equal(await manage(id, "resume", (await list())[0].version), "ineligible");
    assert.deepEqual(await capacity(), { active: 0, limit: 3, eligibility: "no_entitlement" });
    await db.query("reset role");
    // Simulate an elapsed approved window before the scheduled expiry job changes the raw state.
    await db.query("set local session_replication_role='replica'");
    await db.query("update public.offers set status='active' where id=$1", [id]);
    await db.query(
      "update private.offer_revisions set publication_starts_at=now()-interval '2 days', publication_ends_at=now()-interval '1 day' where id=$1",
      [rev],
    );
    await db.query("set local session_replication_role='origin'");
    await db.query(
      "insert into private.offer_view_events(offer_id,deduplication_key) values($1,repeat('a',64))",
      [id],
    );
    await asUser(ids.owner);
    const expired = (await list())[0];
    assert.equal(expired.status, "expired");
    assert.equal(expired.canPause, false);
    assert.equal(await manage(id, "pause", expired.version), "unavailable");
    assert.deepEqual(expired.history, { views: 1, clicks: 0 });
    const copy = randomUUID();
    assert.equal(await manage(id, "duplicate", "", copy), copy);
    assert.equal(await manage(id, "duplicate", "", copy), copy);
    const copied = (await draft(copy)).content;
    assert.equal(copied.title, "Synthetic offer");
    assert.equal(copied.promotional_price, "150.00");
    assert.equal(Object.hasOwn(copied, "publication_starts_at"), false);
    assert.equal(Object.hasOwn(copied, "redemption_ends_on"), false);
    assert.equal((await db.query("select id from public.offers where id=$1", [copy])).rowCount, 0);
    assert.equal(
      (await db.query("select approved_revision_id from public.offers where id=$1", [id])).rows[0]
        .approved_revision_id,
      rev,
    );
  }));

test("a changes-requested offer can be revised without publishing or replacing review history", () =>
  tx(async () => {
    await verified(ids.owner);
    await db.query("update public.properties set public_phone='+94771234567' where id=$1", [
      ids.property1,
    ]);
    const cover = await photo();
    const id = await offer();
    const rev = await revision(id);
    await db.query("update private.offer_revisions set cover_photo_path=$2 where id=$1", [
      rev,
      cover.main,
    ]);
    await submitRevision(rev);
    await db.query(
      "update private.offer_revisions set status='changes_requested',reviewed_by=$2,reviewed_at=clock_timestamp(),review_message='Clarify terms' where id=$1",
      [rev, ids.replacement],
    );
    await db.query("update public.offers set status='changes_requested' where id=$1", [id]);
    await asUser(ids.owner);
    assert.equal((await list())[0].reviewMessage, "Clarify terms");
    const edit = randomUUID();
    assert.equal(await manage(id, "edit", "", edit), edit);
    const revised = { ...(await draft(edit)).content, terms: "Book two days in advance." };
    assert.equal(await submit(edit, revised), "submitted");
    assert.equal((await list())[0].status, "pending_review");
    assert.equal(await publicPage(id), null);
    await db.query("reset role");
    const original = await db.query(
      "select status,review_message from private.offer_revisions where id=$1",
      [rev],
    );
    assert.deepEqual(original.rows[0], {
      status: "changes_requested",
      review_message: "Clarify terms",
    });
  }));

const completeChecklist = {
  price: true,
  dates: true,
  inclusions: true,
  contact: true,
  photos: true,
  terms: true,
};

async function reviewDetail(offerId, revisionId = null) {
  return (
    await db.query("select public.get_admin_offer_reviews($1,$2) as result", [offerId, revisionId])
  ).rows[0].result;
}

async function reviewDecision(
  detail,
  operation = "approve",
  message = "",
  checklist = completeChecklist,
) {
  return (
    await db.query("select public.decide_offer_review($1,$2,$3,$4,$5,$6) as result", [
      detail.offerId,
      detail.revision.id,
      detail.version,
      operation,
      message,
      checklist,
    ])
  ).rows[0].result;
}

async function submittedOffer(cover, { title, existing, number = 1, future = false } = {}) {
  const id = existing ?? (await offer());
  const rev = await revision(id, number);
  await db.query(
    "update private.offer_revisions set cover_photo_path=$2,title=coalesce($3,title) where id=$1",
    [rev, cover.main, title ?? null],
  );
  if (future)
    await db.query(
      "update private.offer_revisions set publication_starts_at=now()+interval '1 day',publication_ends_at=now()+interval '2 days' where id=$1",
      [rev],
    );
  await submitRevision(rev);
  if (!existing)
    await db.query("update public.offers set status='pending_review' where id=$1", [id]);
  return { id, rev };
}

async function allowReview() {
  await verified(ids.third, ids.owner);
  await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.third]);
  await db.query("update public.properties set public_phone='+94771234567' where id=$1", [
    ids.property1,
  ]);
}

test("offer review keeps a private preview, records immutable decisions and preserves live content on rejection", () =>
  tx(async () => {
    await allowReview();
    const cover = await photo();
    const gallery = await photo();
    const first = await submittedOffer(cover);
    await db.query(
      "insert into private.offer_revision_gallery(revision_id,asset_id,position) values($1,$2,1)",
      [first.rev, gallery.id],
    );
    await asUser(ids.owner);
    assert.equal(await reviewDetail(first.id), null);
    assert.equal(
      await reviewDecision({ offerId: first.id, revision: { id: first.rev }, version: "0" }),
      "forbidden",
    );
    assert.equal((await db.query("select * from private.offer_revision_gallery")).rowCount, 0);
    assert.equal(await publicPage(first.id), null);

    await asUser(ids.third);
    const pending = await reviewDetail(first.id);
    assert.equal(pending.preview.title, "Synthetic offer");
    assert.equal(pending.cover.id, cover.id);
    assert.deepEqual(
      pending.gallery.map(({ id }) => id),
      [gallery.id],
    );
    assert.equal(Object.hasOwn(pending.preview, "cover_photo_path"), false);
    assert.equal(await reviewDecision(pending, "approve", "", { price: true }), "checklist");
    assert.equal(await reviewDecision(pending), "saved");
    assert.equal(await reviewDecision(pending), "stale");
    assert.equal((await publicPage(first.id)).state, "active");

    await db.query("reset role");
    const second = await submittedOffer(cover, {
      existing: first.id,
      number: 2,
      title: "Edited title under review",
    });
    await asUser(ids.third);
    assert.equal(await reviewDetail(first.id, randomUUID()), null);
    assert.equal((await reviewDetail(first.id, first.rev)).revision.status, "approved");
    const edited = await reviewDetail(first.id, second.rev);
    assert.equal(
      await reviewDecision(edited, "request_changes", "Clarify the meal included."),
      "saved",
    );
    assert.equal((await publicPage(first.id)).offer.title, "Synthetic offer");
    await db.query("reset role");
    await submittedOffer(cover, { existing: first.id, number: 3, title: "A second edit" });
    await asUser(ids.third);
    assert.equal(
      await reviewDecision(
        await reviewDetail(first.id),
        "reject",
        "This edit could not be verified.",
      ),
      "saved",
    );
    assert.equal((await publicPage(first.id)).offer.title, "Synthetic offer");
    const final = await reviewDetail(first.id);
    assert.equal(final.approvedRevisionId, first.rev);
    assert.deepEqual(
      final.history.map(({ status }) => status),
      ["rejected", "changes_requested", "approved"],
    );
    await db.query("reset role");
    const firstPublished = (
      await db.query("select first_published_at from public.offers where id=$1", [first.id])
    ).rows[0].first_published_at;
    const accepted = await submittedOffer(cover, {
      existing: first.id,
      number: 4,
      title: "Approved new title",
    });
    await asUser(ids.third);
    assert.equal(await reviewDecision(await reviewDetail(first.id)), "saved");
    assert.equal((await reviewDetail(first.id)).approvedRevisionId, accepted.rev);
    assert.equal((await publicPage(first.id)).offer.title, "Approved new title");
    assert.deepEqual(
      (await db.query("select first_published_at from public.offers where id=$1", [first.id]))
        .rows[0].first_published_at,
      firstPublished,
    );
  }));

test("review approval schedules future windows and defers activation at capacity or without entitlement", () =>
  tx(async () => {
    await allowReview();
    const cover = await photo();
    await activeOffer(cover);
    await activeOffer(cover);
    await activeOffer(cover);
    const fourth = await submittedOffer(cover);
    const future = await submittedOffer(cover, { future: true });
    const noTrial = await submittedOffer(cover);
    await asUser(ids.third);
    assert.equal(await reviewDecision(await reviewDetail(fourth.id)), "saved");
    assert.equal((await reviewDetail(fourth.id)).offerStatus, "approved");
    assert.equal(await reviewDecision(await reviewDetail(future.id)), "saved");
    assert.equal((await reviewDetail(future.id)).offerStatus, "scheduled");
    assert.equal(await publicPage(fourth.id), null);

    await db.query("reset role");
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [ids.property1],
    );
    await asUser(ids.third);
    assert.equal(await reviewDecision(await reviewDetail(noTrial.id)), "saved");
    assert.equal((await reviewDetail(noTrial.id)).offerStatus, "approved");
  }));
