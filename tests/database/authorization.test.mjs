import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";
const { db, ids, setup, cleanup } = createDatabaseHarness();
const fixtures = createOfferFixtures(db, ids);
const offerIds = [],
  revisionIds = [],
  reportIds = [];
before(async () => {
  await setup();
  await db.query("begin");
  await db.query("update auth.users set email_confirmed_at=now()");
  await db.query(
    "update public.property_memberships set profile_id=$2 where property_id=$1 and role='owner'",
    [ids.property2, ids.replacement],
  );
  for (const propertyId of [ids.property1, ids.property2]) {
    const off = await fixtures.offer(propertyId),
      rev = await fixtures.revision(off);
    await fixtures.approve(rev);
    await fixtures.publish(off, rev);
    offerIds.push(off);
    revisionIds.push(rev);
    await db.query(
      "insert into private.daily_offer_metrics(offer_id,metric_date,views) values($1,current_date,17)",
      [off],
    );
    await db.query(
      `insert into private.property_verification_requests(property_id,requested_by,request_kind,proposed_profile,evidence_summary)
   values($1,$2,'critical_change','{"name":"Synthetic change"}','Synthetic private evidence')`,
      [propertyId, ids.owner],
    );
    reportIds.push(
      (
        await db.query(
          "insert into private.issue_reports(property_id,reason,reporter_email,comment) values($1,'other','reporter@tests.invalid','Synthetic private complaint') returning id",
          [propertyId],
        )
      ).rows[0].id,
    );
  }
  await db.query(
    "insert into private.moderation_actions(report_id,actor_id,action,note) values($1,$2,'review','Synthetic private note')",
    [reportIds[0], ids.third],
  );
  const sub = (
    await db.query(
      "insert into private.newsletter_subscribers(email) values('subscriber@tests.invalid') returning id",
    )
  ).rows[0].id;
  const request = (
    await db.query(
      `insert into private.subscriber_consents(subscriber_id,action,consent_text,consent_version,privacy_version,source)
 values($1,'requested','Synthetic consent','test-v1','test-v1','homepage') returning id`,
      [sub],
    )
  ).rows[0].id;
  await db.query(
    `insert into private.newsletter_tokens(subscriber_id,purpose,token_hash,request_id,expires_at)
 select $1,'confirm',repeat('d',64),id,occurred_at+interval '23 hours' from private.subscriber_consents where id=$2`,
    [sub, request],
  );
  await db.query(
    "insert into private.offer_view_events(offer_id,deduplication_key) values($1,repeat('e',64))",
    [offerIds[0]],
  );
  await db.query(
    "insert into private.contact_click_events(offer_id,channel,deduplication_key) values($1,'call',repeat('f',64))",
    [offerIds[0]],
  );
  for (const recipient of [ids.owner, ids.staff2, ids.replacement]) {
    const notice = (
      await db.query(
        `insert into private.notification_events(recipient_id,kind,deduplication_key,title,body)
   values($1,'offer_review','synthetic-review','Synthetic title','Synthetic private body') returning id`,
        [recipient],
      )
    ).rows[0].id;
    await db.query(
      `insert into private.email_delivery_logs(notification_id,idempotency_key,recipient_email,template_key)
   values($1,$2,'recipient@tests.invalid','offer_review')`,
      [notice, randomUUID()],
    );
  }
  await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.third]);
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
async function identity(id, role = "authenticated") {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id ?? ""]);
  await db.query(`set local role ${role === "anon" ? "anon" : "authenticated"}`);
}
async function denied(sql, params = []) {
  await db.query("savepoint denied");
  try {
    await assert.rejects(db.query(sql, params), (e) => e.code === "42501");
  } finally {
    await db.query("rollback to savepoint denied; release savepoint denied");
  }
}
async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

test("staff cannot enumerate another property by UUID, list filter or property-role helper", () =>
  tx(async () => {
    await identity(ids.staff2);
    assert.deepEqual(await rows("select id from public.properties order by id"), [
      { id: ids.property1 },
    ]);
    assert.deepEqual(
      await rows("select id from public.properties where id=$1", [ids.property2]),
      [],
    );
    assert.deepEqual(
      await rows("select id from public.property_memberships where property_id=$1", [
        ids.property2,
      ]),
      [],
    );
    assert.equal(
      (await rows("select private.property_role($1) as role", [ids.property2]))[0].role,
      null,
    );
    assert.equal(
      (await rows("select private.property_role($1) as role", [ids.property1]))[0].role,
      "staff",
    );
  }));
test("cross-property offers, approved snapshots, history and aggregates remain hidden", () =>
  tx(async () => {
    await identity(ids.staff2);
    for (const [table, key, id] of [
      ["public.offers", "id", offerIds[1]],
      ["private.offer_revisions", "id", revisionIds[1]],
      ["private.offer_status_history", "offer_id", offerIds[1]],
      ["private.daily_offer_metrics", "offer_id", offerIds[1]],
    ]) {
      assert.deepEqual(await rows(`select * from ${table} where ${key}=$1`, [id]), []);
    }
    assert.equal((await rows("select count(*) from private.offer_revisions"))[0].count, "1");
    assert.equal((await rows("select views from private.daily_offer_metrics"))[0].views, "17");
    assert.equal((await rows("select count(*) from private.offer_status_history"))[0].count, "2");
  }));
test("staff explicitly assigned to two properties can read both without becoming owner", () =>
  tx(async () => {
    await identity(ids.staff1);
    assert.equal((await rows("select count(*) from public.properties"))[0].count, "2");
    assert.equal((await rows("select count(*) from public.offers"))[0].count, "2");
    assert.equal((await rows("select count(*) from private.property_subscriptions"))[0].count, "0");
    assert.equal(
      (await rows("select private.property_role($1) as role", [ids.property2]))[0].role,
      "staff",
    );
  }));
test("owner reads only owned billing/trials/evidence after property ownership diverges", () =>
  tx(async () => {
    await identity(ids.owner);
    for (const table of [
      "property_subscriptions",
      "trial_allocations",
      "property_verification_requests",
    ]) {
      assert.deepEqual(await rows(`select property_id from private.${table}`), [
        { property_id: ids.property1 },
      ]);
    }
    await identity(ids.replacement);
    for (const table of [
      "property_subscriptions",
      "trial_allocations",
      "property_verification_requests",
    ]) {
      assert.deepEqual(await rows(`select property_id from private.${table}`), [
        { property_id: ids.property2 },
      ]);
    }
  }));
test("staff cannot read populated verification, subscription or trial rows even for assigned property", () =>
  tx(async () => {
    await identity(ids.staff2);
    for (const table of [
      "property_subscriptions",
      "trial_allocations",
      "property_verification_requests",
    ])
      assert.deepEqual(await rows(`select * from private.${table}`), []);
  }));
test("neither staff nor owners can read populated reporter, subscriber, token or raw tracking data", () =>
  tx(async () => {
    for (const id of [ids.staff2, ids.owner, ids.replacement]) {
      await identity(id);
      for (const table of [
        "issue_reports",
        "moderation_actions",
        "newsletter_subscribers",
        "subscriber_consents",
        "newsletter_tokens",
        "offer_view_events",
        "contact_click_events",
        "email_delivery_logs",
      ])
        assert.deepEqual(await rows(`select * from private.${table}`), []);
    }
  }));
test("notifications remain recipient-scoped even for another member of the same property", () =>
  tx(async () => {
    for (const id of [ids.owner, ids.staff2, ids.replacement]) {
      await identity(id);
      assert.deepEqual(
        await rows("select distinct recipient_id from private.notification_events"),
        [{ recipient_id: id }],
      );
    }
  }));
test("staff cannot create/delete assignments, self-promote or transfer an owner", () =>
  tx(async () => {
    await identity(ids.staff2);
    await denied(
      "insert into public.property_memberships(property_id,profile_id,role) values($1,$2,'owner')",
      [ids.property2, ids.staff2],
    );
    await denied(
      "update public.property_memberships set role='owner',staff_slot=null where profile_id=$1",
      [ids.staff2],
    );
    await denied("delete from public.property_memberships where property_id=$1", [ids.property1]);
    await denied(
      "update public.property_memberships set profile_id=$2 where property_id=$1 and role='owner'",
      [ids.property1, ids.staff2],
    );
  }));
test("staff cannot edit billing, restart a trial, verify property or approve an offer", () =>
  tx(async () => {
    await identity(ids.staff2);
    await denied("update private.property_subscriptions set status='active' where property_id=$1", [
      ids.property1,
    ]);
    await denied("update private.trial_allocations set approved_at=now() where property_id=$1", [
      ids.property1,
    ]);
    await denied("update public.properties set verification_status='verified' where id=$1", [
      ids.property1,
    ]);
    await denied("update private.offer_revisions set status='approved' where id=$1", [
      revisionIds[0],
    ]);
    await denied("select private.allocate_launch_trial($1)", [ids.property1]);
  }));
test("direct offer mutations stay denied until trusted task-specific workflows exist", () =>
  tx(async () => {
    await identity(ids.staff2);
    await denied("update public.offers set status='active' where id=$1", [offerIds[1]]);
    await denied("update public.offers set property_id=$2 where id=$1", [
      offerIds[0],
      ids.property2,
    ]);
    await denied("delete from public.offers where id=$1", [offerIds[0]]);
    await denied("insert into public.offers(property_id,slug) values($1,'unauthorized-draft')", [
      ids.property1,
    ]);
  }));
test("profile self-edit works but UUID changes, other profiles and admin assignment are denied", () =>
  tx(async () => {
    await identity(ids.staff2);
    assert.equal(
      (
        await db.query(
          "update public.profiles set display_name='Synthetic allowed edit' where id=$1",
          [ids.staff2],
        )
      ).rowCount,
      1,
    );
    assert.equal(
      (
        await db.query("update public.profiles set display_name='Hijacked' where id=$1", [
          ids.owner,
        ])
      ).rowCount,
      0,
    );
    await denied("update public.profiles set id=$2 where id=$1", [ids.staff2, ids.owner]);
    await denied("insert into public.profiles(id,display_name) values($1,'Hijacked')", [ids.owner]);
    await denied("insert into private.platform_admins(profile_id) values($1)", [ids.staff2]);
  }));
test("forged editable metadata claims do not grant platform admin or property ownership", () =>
  tx(async () => {
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: ids.staff2,
        user_metadata: { role: "admin", is_admin: true, property_id: ids.property2 },
        app_metadata: { role: "admin" },
      }),
    ]);
    await identity(ids.staff2);
    assert.equal(
      (await rows("select public.has_platform_admin_access() as allowed"))[0].allowed,
      false,
    );
    assert.equal(
      (await rows("select private.property_role($1) as role", [ids.property2]))[0].role,
      null,
    );
  }));
test("membership removal and owner transfer revoke old access without refreshing a token", () =>
  tx(async () => {
    await identity(ids.staff2);
    assert.equal((await rows("select count(*) from public.properties"))[0].count, "1");
    await db.query("reset role");
    await db.query(
      "delete from public.property_memberships where property_id=$1 and profile_id=$2",
      [ids.property1, ids.staff2],
    );
    await identity(ids.staff2);
    assert.deepEqual(await rows("select * from public.properties"), []);
    await db.query("reset role");
    await db.query(
      "update public.property_memberships set profile_id=$2 where property_id=$1 and role='owner'",
      [ids.property1, ids.replacement],
    );
    await identity(ids.owner);
    assert.deepEqual(await rows("select * from public.properties"), []);
    assert.deepEqual(await rows("select * from private.property_subscriptions"), []);
  }));
test("admin can read populated private records but cannot self-provision or bypass mutation grants", () =>
  tx(async () => {
    await identity(ids.third);
    assert.equal(
      (await rows("select public.has_platform_admin_access() as allowed"))[0].allowed,
      true,
    );
    assert.equal((await rows("select count(*) from private.issue_reports"))[0].count, "2");
    assert.equal((await rows("select count(*) from private.newsletter_tokens"))[0].count, "1");
    await denied("insert into private.platform_admins(profile_id) values($1)", [ids.owner]);
    await denied("update public.properties set verification_status='verified'");
    await db.query("reset role");
    await db.query("delete from private.platform_admins where profile_id=$1", [ids.third]);
    await identity(ids.third);
    assert.equal(
      (await rows("select public.has_platform_admin_access() as allowed"))[0].allowed,
      false,
    );
    assert.deepEqual(await rows("select * from private.issue_reports"), []);
  }));
test("unconfirmed and banned identities cannot retain assigned data or notification access", () =>
  tx(async () => {
    for (const clause of ["email_confirmed_at=null", "banned_until=now()+interval '1 day'"]) {
      await db.query("reset role");
      await db.query(
        "update auth.users set email_confirmed_at=now(),banned_until=null where id=$1",
        [ids.staff2],
      );
      await db.query(`update auth.users set ${clause} where id=$1`, [ids.staff2]);
      await identity(ids.staff2);
      for (const table of [
        "public.profiles",
        "public.properties",
        "public.offers",
        "private.offer_revisions",
        "private.daily_offer_metrics",
        "private.notification_events",
      ])
        assert.deepEqual(await rows(`select * from ${table}`), []);
    }
  }));
test("anonymous and missing-subject callers cannot use authenticated helpers or inherit access", () =>
  tx(async () => {
    await identity(null);
    assert.deepEqual(await rows("select * from public.properties"), []);
    assert.equal(
      (await rows("select public.has_platform_admin_access() as allowed"))[0].allowed,
      false,
    );
    await identity(null, "anon");
    await denied("select * from public.properties");
    await denied("select public.has_platform_admin_access()");
    await denied("select private.property_role($1)", [ids.property1]);
  }));

test("admin overview returns bounded queues only to a verified platform admin", () =>
  tx(async () => {
    const edit = await fixtures.revision(offerIds[0], 2);
    await fixtures.submit(edit);
    await fixtures.revision(offerIds[1], 2);
    await db.query(
      "update private.property_verification_requests set status='more_information_required',reviewed_at=now() where property_id=$1",
      [ids.property2],
    );
    await db.query(
      "update private.issue_reports set status='resolved',resolved_at=now() where id=$1",
      [reportIds[1]],
    );
    await db.query(
      `insert into private.issue_reports(offer_id,reason,priority,status,created_at)
       select $1,'incorrect_price',case when n=1 then 'high' else 'low' end,
         'investigating',now()-n*interval '1 minute' from generate_series(1,6) n`,
      [offerIds[0]],
    );

    const overview = async () =>
      (await rows("select public.get_admin_overview() as result"))[0].result;
    await identity(null, "anon");
    await denied("select public.get_admin_overview()");
    for (const id of [ids.owner, ids.staff2, ids.replacement, null]) {
      await identity(id);
      assert.equal(await overview(), null);
    }
    await identity(ids.third);
    const data = await overview();
    assert.equal(data.verifications.total, 1);
    assert.equal(data.verifications.items[0].kind, "critical_change");
    assert.equal(data.offers.total, 1);
    assert.equal(data.offers.items[0].revision, 2);
    assert.equal(data.reports.total, 7);
    assert.equal(data.reports.items.length, 5);
    assert.equal(data.reports.items[0].priority, "high");
    assert.equal(data.reports.items[0].status, "investigating");
    assert.equal(data.reports.items[0].target, "offer");
    assert.ok(!data.reports.items.some(({ id }) => id === reportIds[1]));
    assert.doesNotMatch(
      JSON.stringify(data),
      /reporter@tests\.invalid|private evidence|private complaint/,
    );

    await db.query("reset role");
    await db.query("delete from private.platform_admins where profile_id=$1", [ids.third]);
    await identity(ids.third);
    assert.equal(await overview(), null);
  }));
