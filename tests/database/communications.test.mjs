import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";
const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);
const digest = () => createHash("sha256").update(randomUUID()).digest("hex");
async function tx(fn) {
  await db.query("begin");
  try {
    await fn();
  } finally {
    await db.query("rollback");
  }
}
async function rejects(sql, params = [], code = "23514") {
  await db.query("savepoint expected_failure");
  try {
    await assert.rejects(db.query(sql, params), (e) => e.code === code);
  } finally {
    await db.query("rollback to savepoint expected_failure; release savepoint expected_failure");
  }
}
async function subscriber() {
  const id = randomUUID();
  await db.query("insert into private.newsletter_subscribers(id,email) values($1,$2)", [
    id,
    `${id}@tests.invalid`,
  ]);
  return id;
}
async function evidence(id, action = "requested", request = null, time = null) {
  const result = await db.query(
    `insert into private.subscriber_consents(subscriber_id,action,request_id,consent_text,consent_version,privacy_version,source,occurred_at)
 values($1,$2,$3,'Synthetic explicit weekly newsletter consent','test-v1','test-privacy-v1',$4,coalesce($5,clock_timestamp())) returning id,occurred_at::text`,
    [
      id,
      action,
      request,
      action === "requested"
        ? "homepage"
        : action === "confirmed"
          ? "confirmation"
          : action === "withdrawn"
            ? "unsubscribe"
            : "provider",
      time,
    ],
  );
  return result.rows[0];
}
async function confirmed() {
  const id = await subscriber(),
    request = await evidence(id),
    consent = await evidence(id, "confirmed", request.id);
  await db.query(
    "update private.newsletter_subscribers set status='confirmed',confirmed_at=$2 where id=$1",
    [id, consent.occurred_at],
  );
  return id;
}
async function newsletter(ready = false, mixed = true) {
  const id = randomUUID();
  await db.query(
    "insert into private.newsletters(id,subject,created_by) values($1,'Synthetic Friday selection',$2)",
    [id, ids.owner],
  );
  if (ready) {
    for (let i = 0; i < 5; i++) {
      const off = await offer(i < 3 ? ids.property1 : ids.property2),
        rev = await revision(off, 1, i < 3 || !mixed ? "stays" : "dining");
      await db.query(
        "update private.offer_revisions set publication_ends_at=now()+interval '30 days' where id=$1",
        [rev],
      );
      await approve(rev);
      await publish(off, rev);
      await db.query(
        "insert into private.newsletter_offers(newsletter_id,offer_id,revision_id,position) values($1,$2,$3,$4)",
        [id, off, rev, i + 1],
      );
    }
    if (ready === true)
      await db.query(
        `update private.newsletters set status='scheduled',scheduled_at=
    ((date_trunc('week',clock_timestamp() at time zone 'Asia/Colombo')+interval '11 days 10 hours') at time zone 'Asia/Colombo') where id=$1`,
        [id],
      );
  }
  return id;
}

test("all thirteen T010 tables have RLS, deny browsers and expose no sensitive public types", async () => {
  const names = [
    "issue_reports",
    "moderation_actions",
    "offer_view_events",
    "contact_click_events",
    "daily_offer_metrics",
    "newsletter_subscribers",
    "subscriber_consents",
    "newsletter_tokens",
    "newsletters",
    "newsletter_offers",
    "newsletter_deliveries",
    "notification_events",
    "email_delivery_logs",
  ];
  const { rows } = await db.query(
    `select c.relrowsecurity,has_table_privilege('anon',c.oid,'select,insert,update,delete') as anon_access,
 has_table_privilege('authenticated',c.oid,'select,insert,update,delete') as user_access from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='private' and c.relname=any($1::text[])`,
    [names],
  );
  assert.equal(rows.length, 13);
  for (const row of rows)
    assert.deepEqual(row, { relrowsecurity: true, anon_access: false, user_access: true });
  assert.equal(
    (
      await db.query(
        "select has_table_privilege('service_role','private.subscriber_consents','update,delete') as access",
      )
    ).rows[0].access,
    false,
  );
});

test("reports require exactly one valid offer/business target and never auto-suspend", async () =>
  tx(async () => {
    const off = await offer();
    await rejects("insert into private.issue_reports(reason) values('other')");
    await rejects(
      "insert into private.issue_reports(offer_id,property_id,reason) values($1,$2,'other')",
      [off, ids.property1],
    );
    await rejects(
      "insert into private.issue_reports(property_id,reason) values($1,'other')",
      [randomUUID()],
      "23503",
    );
    await rejects(
      "insert into private.issue_reports(property_id,reason,reporter_email) values($1,'other','invalid')",
      [ids.property1],
    );
    await rejects(
      "insert into private.issue_reports(property_id,reason) values($1,'booking_refund')",
      [ids.property1],
    );
    for (let i = 0; i < 15; i++)
      await db.query(
        "insert into private.issue_reports(offer_id,reason) values($1,'incorrect_price')",
        [off],
      );
    await db.query(
      "insert into private.issue_reports(property_id,reason) values($1,'unreachable_contact')",
      [ids.property1],
    );
    assert.equal(
      (
        await db.query("select verification_status from public.properties where id=$1", [
          ids.property1,
        ])
      ).rows[0].verification_status,
      "verified",
    );
    assert.equal(
      (await db.query("select status from public.offers where id=$1", [off])).rows[0].status,
      "draft",
    );
  }));

test("moderation actions retain actor and notes as immutable manual history", async () =>
  tx(async () => {
    const report = (
      await db.query(
        "insert into private.issue_reports(property_id,reason) values($1,'other') returning id",
        [ids.property1],
      )
    ).rows[0].id;
    await db.query(
      "insert into private.moderation_actions(report_id,actor_id,action,note) values($1,$2,'temporarily_hide','Synthetic manual decision')",
      [report, ids.owner],
    );
    await rejects("update private.moderation_actions set note='rewritten'", [], "55000");
    await rejects("delete from private.moderation_actions", [], "55000");
    await rejects("update private.issue_reports set status='resolved' where id=$1", [report]);
    await db.query(
      "update private.issue_reports set status='resolved',resolved_at=clock_timestamp() where id=$1",
      [report],
    );
    assert.equal(
      (
        await db.query("select verification_status from public.properties where id=$1", [
          ids.property1,
        ])
      ).rows[0].verification_status,
      "verified",
    );
  }));

test("view/click events use deduplication, known sources and explicit exclusions without booking data", async () =>
  tx(async () => {
    const off = await offer(),
      key = digest();
    await db.query(
      "insert into private.offer_view_events(offer_id,deduplication_key) values($1,$2)",
      [off, key],
    );
    await rejects(
      "insert into private.offer_view_events(offer_id,deduplication_key) values($1,$2)",
      [off, key],
      "23505",
    );
    await rejects(
      "insert into private.offer_view_events(offer_id,deduplication_key,source) values($1,$2,'search')",
      [off, digest()],
    );
    await db.query(
      "insert into private.contact_click_events(offer_id,channel,deduplication_key,source,source_reliable,excluded_reason) values($1,'whatsapp',$2,'newsletter',true,'internal_test')",
      [off, key],
    );
    await db.query(
      "insert into private.contact_click_events(offer_id,channel,deduplication_key) values($1,'call',$2)",
      [off, key],
    );
    await rejects(
      "insert into private.contact_click_events(offer_id,channel,deduplication_key) values($1,'booking',$2)",
      [off, digest()],
    );
    await rejects(
      "insert into private.offer_view_events(offer_id,deduplication_key,occurred_at) values($1,$2,'infinity')",
      [off, digest()],
    );
    const { rows } = await db.query(
      "select column_name from information_schema.columns where table_schema='private' and table_name in ('offer_view_events','contact_click_events')",
    );
    for (const name of ["ip_address", "user_agent", "email", "phone", "message", "booking_id"])
      assert.ok(!rows.some((x) => x.column_name === name));
  }));

test("daily metrics upsert replaces aggregates rather than double-counting retries", async () =>
  tx(async () => {
    const off = await offer();
    const sql = `insert into private.daily_offer_metrics(offer_id,metric_date,views,whatsapp_clicks) values($1,current_date,10,2)
 on conflict(offer_id,metric_date,source) do update set views=excluded.views,whatsapp_clicks=excluded.whatsapp_clicks`;
    await db.query(sql, [off]);
    await db.query(sql, [off]);
    assert.deepEqual(
      (
        await db.query(
          "select views,whatsapp_clicks,call_clicks from private.daily_offer_metrics where offer_id=$1",
          [off],
        )
      ).rows,
      [{ views: "10", whatsapp_clicks: "2", call_clicks: "0" }],
    );
    await rejects("update private.daily_offer_metrics set views=-1 where offer_id=$1", [off]);
  }));

test("signup is pending, canonical email is unique and confirmation requires exact current evidence", async () =>
  tx(async () => {
    const id = await subscriber();
    await rejects(
      "insert into private.newsletter_subscribers(email) select email from private.newsletter_subscribers where id=$1",
      [id],
      "23505",
    );
    await rejects(
      "insert into private.newsletter_subscribers(email) values('UPPER@tests.invalid')",
    );
    await db.query("set constraints all immediate");
    await rejects(
      "update private.newsletter_subscribers set status='confirmed',confirmed_at=clock_timestamp() where id=$1",
      [id],
    );
    await db.query("set constraints all deferred");
    const request = await evidence(id);
    await rejects(
      `insert into private.subscriber_consents(subscriber_id,action,request_id,consent_text,consent_version,privacy_version,source)
 values($1,'confirmed',$2,'Changed terms','test-v1','test-privacy-v1','confirmation')`,
      [id, request.id],
    );
    const consent = await evidence(id, "confirmed", request.id);
    await db.query(
      "update private.newsletter_subscribers set status='confirmed',confirmed_at=$2 where id=$1",
      [id, consent.occurred_at],
    );
    await db.query("set constraints all immediate");
    await rejects(
      "update private.subscriber_consents set consent_text='rewritten' where subscriber_id=$1",
      [id],
      "55000",
    );
    await rejects(
      `insert into private.subscriber_consents(subscriber_id,action,request_id,consent_text,consent_version,privacy_version,source)
 values($1,'confirmed',$2,'Synthetic explicit weekly newsletter consent','test-v1','test-privacy-v1','confirmation')`,
      [id, request.id],
      "23505",
    );
  }));

test("expired and cross-subscriber confirmations fail; withdrawal needs fresh signup to rejoin", async () =>
  tx(async () => {
    const id = await confirmed(),
      other = await subscriber();
    const request = await evidence(other);
    await rejects(
      `insert into private.subscriber_consents(subscriber_id,action,request_id,consent_text,consent_version,privacy_version,source,occurred_at)
 values($1,'confirmed',$2,'Synthetic explicit weekly newsletter consent','test-v1','test-privacy-v1','confirmation',$3::timestamptz+interval '24 hours')`,
      [other, request.id, request.occurred_at],
    );
    await rejects(
      `insert into private.subscriber_consents(subscriber_id,action,request_id,consent_text,consent_version,privacy_version,source)
 values($1,'confirmed',$2,'Synthetic explicit weekly newsletter consent','test-v1','test-privacy-v1','confirmation')`,
      [id, request.id],
    );
    const withdrawn = await evidence(id, "withdrawn");
    await db.query(
      "update private.newsletter_subscribers set status='unsubscribed',withdrawn_at=$2 where id=$1",
      [id, withdrawn.occurred_at],
    );
    await db.query("set constraints all immediate");
    await rejects(
      "update private.newsletter_subscribers set status='confirmed',withdrawn_at=null where id=$1",
      [id],
    );
    await db.query("set constraints all deferred");
    const fresh = await evidence(id),
      consent = await evidence(id, "confirmed", fresh.id);
    await db.query(
      "update private.newsletter_subscribers set status='confirmed',withdrawn_at=null,confirmed_at=$2 where id=$1",
      [id, consent.occurred_at],
    );
    await db.query("set constraints all immediate");
  }));

test("confirmation tokens store digests, expire within 24h and cannot be reset or extended", async () =>
  tx(async () => {
    const id = await subscriber(),
      request = await evidence(id),
      hash = digest();
    const token = (
      await db.query(
        `insert into private.newsletter_tokens(subscriber_id,purpose,token_hash,request_id,expires_at)
 values($1,'confirm',$2,$3,$4::timestamptz+interval '23 hours') returning id`,
        [id, hash, request.id, request.occurred_at],
      )
    ).rows[0].id;
    await rejects("update private.newsletter_tokens set token_hash='plaintext' where id=$1", [
      token,
    ]);
    await rejects(
      "update private.newsletter_tokens set expires_at=expires_at+interval '2 days' where id=$1",
      [token],
    );
    await db.query(
      "update private.newsletter_tokens set consumed_at=clock_timestamp() where id=$1",
      [token],
    );
    await rejects("update private.newsletter_tokens set consumed_at=null where id=$1", [token]);
    await rejects(
      `insert into private.newsletter_tokens(subscriber_id,purpose,token_hash,request_id,expires_at)
 values($1,'confirm',$2,$3,$4::timestamptz+interval '25 hours')`,
      [id, digest(), request.id, request.occurred_at],
    );
  }));

test("campaign scheduling blocks empty selections, seals content and rechecks stale offers", async () =>
  tx(async () => {
    const id = await newsletter();
    await rejects(
      "update private.newsletters set status='scheduled',scheduled_at='2026-11-06 10:00+05:30' where id=$1",
      [id],
    );
    const ready = await newsletter(true);
    await rejects("update private.newsletters set intro='Changed after scheduling' where id=$1", [
      ready,
    ]);
    await rejects("delete from private.newsletter_offers where newsletter_id=$1", [ready]);
    const selected = (
      await db.query(
        "select offer_id from private.newsletter_offers where newsletter_id=$1 limit 1",
        [ready],
      )
    ).rows[0].offer_id;
    await db.query("update public.offers set status='paused' where id=$1", [selected]);
    await rejects("update private.newsletters set status='sending' where id=$1", [ready]);
  }));

test("weekly editions require mixed categories", async () =>
  tx(async () => {
    const single = await newsletter("selected", false);
    await rejects(
      `update private.newsletters set status='scheduled',scheduled_at=
    ((date_trunc('week',clock_timestamp() at time zone 'Asia/Colombo')+interval '11 days 10 hours') at time zone 'Asia/Colombo') where id=$1`,
      [single],
    );
    // Roll back the single-category active offers before preparing another campaign.
  }));

test("valid selections still reject a non-Friday schedule and duplicate weekly edition", async () =>
  tx(async () => {
    const draft = await newsletter("selected");
    await rejects(
      `update private.newsletters set status='scheduled',scheduled_at=
    ((date_trunc('week',clock_timestamp() at time zone 'Asia/Colombo')+interval '10 days 10 hours') at time zone 'Asia/Colombo') where id=$1`,
      [draft],
    );
    const schedule = `update private.newsletters set status='scheduled',scheduled_at=
    ((date_trunc('week',clock_timestamp() at time zone 'Asia/Colombo')+interval '11 days 10 hours') at time zone 'Asia/Colombo') where id=$1`;
    await db.query(schedule, [draft]);
    const duplicate = await newsletter();
    await db.query(
      `insert into private.newsletter_offers(newsletter_id,offer_id,revision_id,position)
    select $1,offer_id,revision_id,position from private.newsletter_offers where newsletter_id=$2`,
      [duplicate, draft],
    );
    await rejects(schedule, [duplicate], "23505");
  }));

test("newsletter selections reject duplicate positions and cross-offer revisions", async () =>
  tx(async () => {
    const id = await newsletter(),
      a = await offer(),
      b = await offer(),
      rev = await revision(a);
    await rejects(
      "insert into private.newsletter_offers(newsletter_id,offer_id,revision_id,position) values($1,$2,$3,1)",
      [id, b, rev],
      "23503",
    );
    await db.query(
      "insert into private.newsletter_offers(newsletter_id,offer_id,revision_id,position) values($1,$2,$3,1)",
      [id, a, rev],
    );
    await rejects(
      "insert into private.newsletter_offers(newsletter_id,offer_id,revision_id,position) values($1,$2,$3,1)",
      [id, a, rev],
      "23505",
    );
  }));

test("queued recipients require confirmation, deduplicate and are rechecked after withdrawal", async () =>
  tx(async () => {
    const campaign = await newsletter(true),
      id = await confirmed(),
      pending = await subscriber();
    await rejects(
      "insert into private.newsletter_deliveries(newsletter_id,subscriber_id) values($1,$2)",
      [campaign, pending],
    );
    const delivery = (
      await db.query(
        "insert into private.newsletter_deliveries(newsletter_id,subscriber_id) values($1,$2) returning id",
        [campaign, id],
      )
    ).rows[0].id;
    await rejects(
      "insert into private.newsletter_deliveries(newsletter_id,subscriber_id) values($1,$2)",
      [campaign, id],
      "23505",
    );
    const log = (
      await db.query(
        `insert into private.email_delivery_logs(newsletter_delivery_id,idempotency_key,recipient_email,template_key)
 select $1,$2,email,'weekly_newsletter' from private.newsletter_subscribers where id=$3 returning id`,
        [delivery, randomUUID(), id],
      )
    ).rows[0].id;
    const event = await evidence(id, "withdrawn");
    await db.query(
      "update private.newsletter_subscribers set status='unsubscribed',withdrawn_at=$2 where id=$1",
      [id, event.occurred_at],
    );
    await db.query("set constraints all immediate");
    await rejects("update private.newsletter_deliveries set status='sending' where id=$1", [
      delivery,
    ]);
    await rejects("update private.email_delivery_logs set status='sending' where id=$1", [log]);
    await db.query("update private.newsletter_deliveries set status='suppressed' where id=$1", [
      delivery,
    ]);
  }));

test("notification and email records deduplicate, validate scope and protect retry identity", async () =>
  tx(async () => {
    const off = await offer();
    await rejects(
      `insert into private.notification_events(recipient_id,property_id,offer_id,kind,deduplication_key,title,body)
 values($1,$2,$3,'offer_review','bad-scope','Review','Synthetic')`,
      [ids.owner, ids.property2, off],
    );
    const notice = (
      await db.query(
        `insert into private.notification_events(recipient_id,property_id,offer_id,kind,deduplication_key,title,body)
 values($1,$2,$3,'offer_review','review-1','Review','Synthetic') returning id`,
        [ids.owner, ids.property1, off],
      )
    ).rows[0].id;
    await rejects(
      `insert into private.notification_events(recipient_id,kind,deduplication_key,title,body)
 values($1,'offer_review','review-1','Review','Synthetic')`,
      [ids.owner],
      "23505",
    );
    const key = randomUUID(),
      log = (
        await db.query(
          `insert into private.email_delivery_logs(notification_id,idempotency_key,recipient_email,template_key)
 values($1,$2,'synthetic@tests.invalid','offer_review') returning id`,
          [notice, key],
        )
      ).rows[0].id;
    await rejects(
      `insert into private.email_delivery_logs(notification_id,idempotency_key,recipient_email,template_key)
 values($1,$2,'synthetic@tests.invalid','offer_review')`,
      [notice, key],
      "23505",
    );
    await db.query("update private.email_delivery_logs set attempts=1 where id=$1", [log]);
    await rejects("update private.email_delivery_logs set attempts=0 where id=$1", [log]);
    await rejects(
      "update private.email_delivery_logs set idempotency_key='replacement' where id=$1",
      [log],
    );
    await rejects(
      "update private.email_delivery_logs set status='delivered',delivered_at=clock_timestamp() where id=$1",
      [log],
    );
    await db.query("set local role service_role");
    await db.query("update private.notification_events set read_at=clock_timestamp() where id=$1", [
      notice,
    ]);
    await rejects(
      "update private.notification_events set body='rewritten' where id=$1",
      [notice],
      "42501",
    );
  }));
