import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { createDatabaseHarness } from "./helpers.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
before(setup);
after(cleanup);

const result = async (sql, args) => (await db.query(sql, args)).rows[0].result;
const inbox = (admin = false, countOnly = false) =>
  result("select public.get_notification_inbox($1,0,$2) as result", [admin, countOnly]);
const mark = (id, admin = false) =>
  result("select public.mark_notification_read($1,$2) as result", [id, admin]);
async function asUser(id) {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
async function transaction(run) {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now()");
    await db.query("insert into private.platform_admins(profile_id) values($1),($2)", [
      ids.replacement,
      ids.third,
    ]);
    await run();
  } finally {
    await db.query("rollback");
  }
}

test("registration and complaint notifications are scoped to the recipient and the dashboard", () =>
  transaction(async () => {
    const property = randomUUID();
    await asUser(ids.owner);
    assert.equal(
      await result("select public.register_partner_property($1,$2) as result", [
        property,
        {
          name: "Notification Hotel",
          contact_name: "Fixture owner",
          primary_category: "stays",
          property_type: "hotel",
          address: "42 Notification Road",
          district: "Galle",
          public_phone: "+94771234560",
        },
      ]),
      "registered",
    );
    const own = await inbox();
    assert.equal(own.unread, 1);
    assert.equal(own.items[0].title, "Property registration received");
    assert.equal(await inbox(true), null);
    assert.deepEqual(await inbox(false, true), { unread: 1 });

    await asUser(ids.staff1);
    assert.deepEqual(await inbox(), { unread: 0, items: [] });
    assert.equal(await mark(own.items[0].id), false);

    await asUser(ids.replacement);
    assert.equal((await inbox(true)).items[0].title, "Property registration awaits review");
    assert.deepEqual(await inbox(), { unread: 0, items: [] });
    assert.equal(await mark(own.items[0].id), false);
    assert.equal(await mark(own.items[0].id, true), false);

    await asUser(ids.owner);
    assert.equal(await mark(own.items[0].id), true);
    assert.equal(await mark(own.items[0].id), true);
    const read = await inbox();
    assert.equal(read.unread, 0);
    assert.equal(read.items[0].read, true);
    await db.query("reset role");
    assert.equal(
      await result(
        "select has_function_privilege('anon','public.get_notification_inbox(boolean,integer,boolean)','execute') as result",
      ),
      false,
    );
    assert.equal(
      await result(
        "select has_function_privilege('anon','public.mark_notification_read(uuid,boolean)','execute') as result",
      ),
      false,
    );
  }));

test("manual high priority queues one urgent alert per active admin and it takes email precedence", () =>
  transaction(async () => {
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [
      ids.third,
    ]);
    await db.query(
      `insert into private.notification_events(recipient_id,property_id,kind,deduplication_key,title,body,created_at)
      values ($1,$2,'property_verification','old-normal','Ordinary notice','Ordinary body',now()-interval '1 day')`,
      [ids.owner, ids.property1],
    );
    const report = await result(
      `insert into private.issue_reports(property_id,reason,comment,reporter_email)
      values($1,'other','Private visitor statement','private@example.invalid') returning id as result`,
      [ids.property1],
    );
    await asUser(ids.replacement);
    const change = async (priority) => {
      const view = await result("select public.get_admin_reports($1) as result", [report]);
      return result(
        "select public.moderate_report($1,$2,'change_priority','Admin decision',$3,'',false) as result",
        [report, view.version, priority],
      );
    };
    assert.equal((await inbox(true)).unread, 0);
    for (const priority of ["high", "low", "high"]) assert.equal(await change(priority), "saved");
    const notices = await inbox(true);
    assert.equal(notices.unread, 1);
    assert.equal(notices.items[0].reportId, report);
    assert.doesNotMatch(JSON.stringify(notices), /private@example|Private visitor|Admin decision/);
    await db.query("reset role");
    assert.equal(
      await result(
        "select count(*)::int as result from private.notification_events where deduplication_key like 'critical-complaint:%'",
      ),
      1,
    );

    const email = await result("select public.claim_transactional_email() as result");
    assert.equal(email.critical, true);
    await db.query(
      "update private.issue_reports set status='resolved',resolved_at=clock_timestamp() where id=$1",
      [report],
    );
    assert.equal(
      await result("select public.prepare_transactional_email($1,$2,$3) as result", [
        email.id,
        email.lease,
        "a".repeat(64),
      ]),
      false,
    );
    assert.equal(
      await result("select status as result from private.email_delivery_logs where id=$1", [
        email.id,
      ]),
      "suppressed",
    );
  }));
