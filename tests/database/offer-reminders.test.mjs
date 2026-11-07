import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);

const counts = async () =>
  (await db.query("select public.queue_offer_and_inactivity_reminders() as result")).rows[0].result;
const empty = { offerExpiry: 0, inactiveBusiness: 0, busy: false };

test("reminders honor the 72-hour window and one reminder per inactivity episode, including transfers", async () => {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now()");
    const due = await offer();
    const later = await offer();
    const hidden = await offer();
    for (const id of [due, later, hidden]) {
      const rev = await revision(id);
      if (id === later)
        await db.query(
          "update private.offer_revisions set publication_ends_at=now()+interval '4 days' where id=$1",
          [rev],
        );
      await approve(rev);
      await publish(id, rev);
    }
    await db.query("update public.offers set status='hidden_by_admin' where id=$1", [hidden]);
    await db.query("set local session_replication_role='replica'");
    await db.query(`
      update public.properties set verified_at=now()-interval '40 days';
      update private.trial_allocations a set approved_at=p.verified_at
        from public.properties p where p.id=a.property_id;
      update private.property_subscriptions s
        set period_starts_at=p.verified_at,
            period_ends_at=((p.verified_at at time zone 'Asia/Colombo')+interval '6 months') at time zone 'Asia/Colombo'
        from public.properties p where p.id=s.property_id;
    `);
    await db.query("set local session_replication_role='origin'");

    const {
      rows: [grants],
    } = await db.query(`select
      has_function_privilege('anon','public.queue_offer_and_inactivity_reminders()','execute') as anon,
      has_function_privilege('authenticated','public.queue_offer_and_inactivity_reminders()','execute') as partner`);
    assert.deepEqual(grants, { anon: false, partner: false });
    await db.query("set local role service_role");
    assert.deepEqual(await counts(), { offerExpiry: 1, inactiveBusiness: 1, busy: false });
    assert.deepEqual(await counts(), empty);
    await db.query("reset role");
    const { rows } = await db.query(`select recipient_id,property_id,offer_id,kind,body
      from private.notification_events where kind in ('offer_expiry','inactive_property') order by kind`);
    assert.deepEqual(
      rows.map(({ recipient_id, property_id, offer_id, kind }) => ({
        recipient_id,
        property_id,
        offer_id,
        kind,
      })),
      [
        {
          recipient_id: ids.owner,
          property_id: ids.property2,
          offer_id: null,
          kind: "inactive_property",
        },
        {
          recipient_id: ids.owner,
          property_id: ids.property1,
          offer_id: due,
          kind: "offer_expiry",
        },
      ],
    );
    assert.match(rows[1].body, /Sri Lanka time/);

    await db.query("update public.property_memberships set profile_id=$1 where role='owner'", [
      ids.replacement,
    ]);
    assert.deepEqual(await counts(), empty);

    const returning = await offer(ids.property2);
    const returningRevision = await revision(returning);
    await approve(returningRevision);
    await publish(returning, returningRevision);
    await db.query("update public.offers set status='ended' where id=$1", [returning]);
    assert.deepEqual(await counts(), empty);
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.offer_status_history set changed_at=now()-interval '31 days' where offer_id=$1 and new_status='active'",
      [returning],
    );
    await db.query("set local session_replication_role='origin'");
    assert.deepEqual(await counts(), { ...empty, inactiveBusiness: 1 });
    assert.equal(
      (
        await db.query(
          "select id from private.notification_events where kind='inactive_property' and recipient_id=$1",
          [ids.replacement],
        )
      ).rowCount,
      1,
    );

    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.staff1]);
    assert.equal((await db.query("select id from private.notification_events")).rowCount, 0);
  } finally {
    await db.query("rollback");
  }
});

test("a recent publication or a blocked owner prevents inactive business reminders", async () => {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now()");
    const id = await offer();
    const approved = await revision(id);
    await approve(approved);
    await publish(id, approved);
    await db.query("update public.offers set status='ended' where id=$1", [id]);
    await db.query(
      "update public.property_memberships set profile_id=$1 where role='owner' and property_id=$2",
      [ids.replacement, ids.property2],
    );
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [
      ids.replacement,
    ]);
    await db.query("set local session_replication_role='replica'");
    await db.query("update public.properties set verified_at=now()-interval '40 days'");
    await db.query("set local session_replication_role='origin'");
    assert.deepEqual(await counts(), empty);

    // A later inactive spell is eligible once 30 days have passed since publication.
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.offer_status_history set changed_at=now()-interval '31 days' where offer_id=$1 and new_status='active'",
      [id],
    );
    await db.query("set local session_replication_role='origin'");
    assert.deepEqual(await counts(), { ...empty, inactiveBusiness: 1 });
    assert.deepEqual(await counts(), empty);
  } finally {
    await db.query("rollback");
  }
});
