import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);

const value = async (query, args) => (await db.query(query, args)).rows[0]?.result;
const detail = (id, page = 0) =>
  value("select public.get_admin_reports($1,false,$2,0) as result", [id, page]);
const queue = (closed = false) =>
  value("select public.get_admin_reports(null,$1) as result", [closed]);
const act = (
  id,
  version,
  action,
  { note = "Internal decision", priority = "", message = "", confirm = false } = {},
) =>
  value("select public.moderate_report($1,$2,$3,$4,$5,$6,$7) as result", [
    id,
    version,
    action,
    note,
    priority,
    message,
    confirm,
  ]);
const report = (property, offerId = null, priority = "medium") =>
  value(
    `insert into private.issue_reports(property_id,offer_id,reason,priority,comment,reporter_email,created_at)
    values ($1,$2,'incorrect_price',$3,'Private visitor statement','private@example.invalid',clock_timestamp()) returning id as result`,
    [property, offerId, priority],
  );
const as = async (role, user = "") => {
  await db.query(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
};
const transaction = async (fn) => {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now()");
    await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.replacement]);
    await fn();
  } finally {
    await db.query("rollback");
  }
};

test("only admins can moderate; business history and owner instructions keep reporter data private", () =>
  transaction(async () => {
    const offerId = await offer();
    const offerReport = await report(null, offerId, "low");
    const propertyReport = await report(ids.property1);
    const differentProperty = await report(ids.property2, null, "high");

    assert.equal(
      await value(
        "select has_function_privilege('anon','public.get_admin_reports(uuid,boolean,integer,integer)','execute') as result",
      ),
      false,
    );
    assert.equal(
      await value(
        "select has_function_privilege('anon','public.moderate_report(uuid,text,text,text,text,text,boolean)','execute') as result",
      ),
      false,
    );
    assert.equal(
      await value(
        "select has_table_privilege('authenticated','private.issue_reports','UPDATE') as result",
      ),
      false,
    );

    for (const identity of ["", ids.owner, ids.staff1]) {
      await as("authenticated", identity);
      assert.equal(await detail(propertyReport), null);
      assert.equal(await queue(), null);
      assert.equal(await act(propertyReport, "fake", "resolve"), "forbidden");
    }

    await as("authenticated", ids.replacement);
    assert.deepEqual(
      (await queue()).map((row) => row.id),
      [differentProperty, propertyReport, offerReport],
    );
    assert.equal((await queue())[0].reporterEmail, undefined);
    const initial = await detail(propertyReport);
    assert.equal(initial.reporterEmail, "private@example.invalid");
    assert.deepEqual(
      initial.related.map((row) => row.id),
      [offerReport],
    );
    assert.equal(initial.related[0].comment, undefined);
    assert.deepEqual((await detail(propertyReport, 1)).related, []);
    assert.equal(
      await act(offerReport, (await detail(offerReport)).version, "change_priority", {
        priority: "high",
      }),
      "saved",
    );
    assert.deepEqual(
      (await queue()).map((row) => row.id),
      [offerReport, differentProperty, propertyReport],
    );
    assert.equal(
      await act(propertyReport, initial.version, "review", { note: " \n\t " }),
      "invalid",
    );
    assert.equal(await act(propertyReport, initial.version, "review"), "saved");
    assert.equal(await act(propertyReport, initial.version, "resolve"), "stale");
    const investigation = await detail(propertyReport);
    assert.equal(investigation.status, "investigating");
    assert.equal(await act(propertyReport, investigation.version, "request_changes"), "invalid");
    assert.equal(
      await act(propertyReport, investigation.version, "request_changes", {
        message: "Please correct the price.",
      }),
      "saved",
    );
    const waiting = await detail(propertyReport);
    assert.equal(waiting.status, "awaiting_changes");
    assert.equal(waiting.actions[0].changes.statusBefore, "investigating");
    assert.equal(waiting.actions[0].actor, "Synthetic replacement");

    await as("authenticated", ids.owner);
    assert.deepEqual((await db.query("select kind,body from private.notification_events")).rows, [
      { kind: "complaint", body: "Please correct the price." },
    ]);
    assert.deepEqual((await db.query("select note from private.moderation_actions")).rows, []);
    await as("authenticated", ids.staff1);
    assert.deepEqual((await db.query("select kind from private.notification_events")).rows, []);

    await as("authenticated", ids.replacement);
    assert.equal(await act(propertyReport, waiting.version, "resolve"), "saved");
    const resolved = await detail(propertyReport);
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolvedAt);
    assert.deepEqual(
      (await queue(true)).map((row) => row.id),
      [propertyReport],
    );
    assert.equal(await act(propertyReport, resolved.version, "dismiss"), "unavailable");
    assert.equal(
      await value(
        "select count(*)::int as result from private.audit_logs where relation_name='private.moderation_actions' and record_id=$1 and actor_id=$2",
        [resolved.actions[0].id, ids.replacement],
      ),
      1,
    );
    await db.query("reset role");
    await assert.rejects(
      db.query("update private.moderation_actions set note='tampered' where id=$1", [
        resolved.actions[0].id,
      ]),
      /append-only/i,
    );
  }));

test("hiding an offer or business removes public content immediately and restoration is scoped", () =>
  transaction(async () => {
    const id = await offer();
    const approved = await revision(id);
    await approve(approved);
    await publish(id, approved);
    const original = await report(null, id);
    const competing = await report(null, id);
    const business = await report(ids.property1);
    const slug = `synthetic-${id}`;
    const publicOffer = () => value("select public.get_public_offer_page($1) as result", [slug]);
    const publicProperty = () =>
      value("select public.get_public_property_profile('synthetic-property1') as result");
    await as("anon");
    assert.equal((await publicOffer()).state, "active");
    assert.ok(await publicProperty());

    await as("authenticated", ids.replacement);
    const start = await detail(original);
    assert.equal(start.canHide, true);
    assert.equal(await act(original, start.version, "temporarily_hide"), "invalid");
    assert.equal(
      await act(original, start.version, "temporarily_hide", { confirm: true }),
      "saved",
    );
    const hidden = await detail(original);
    assert.equal(hidden.targetStatus, "hidden_by_admin");
    assert.equal(hidden.canRestore, true);
    assert.equal(hidden.actions[0].changes.targetBefore, "active");
    assert.equal(
      await act(competing, (await detail(competing)).version, "restore", { confirm: true }),
      "unavailable",
    );
    assert.equal(
      await value("select approved_revision_id as result from public.offers where id=$1", [id]),
      approved,
    );
    await as("anon");
    const unavailable = await publicOffer();
    assert.equal(unavailable.state, "unavailable");
    assert.equal(unavailable.title, null);
    assert.equal(unavailable.offer, undefined);
    assert.ok(await publicProperty());

    await as("authenticated", ids.replacement);
    assert.equal(await act(original, hidden.version, "restore", { confirm: true }), "saved");
    const businessDetail = await detail(business);
    assert.equal(
      await act(business, businessDetail.version, "temporarily_hide", { confirm: true }),
      "saved",
    );
    const suspended = await detail(business);
    assert.equal(suspended.targetStatus, "suspended");
    assert.equal(suspended.canRestore, true);
    await as("anon");
    assert.equal((await publicOffer()).state, "unavailable");
    assert.equal(await publicProperty(), null);

    await as("authenticated", ids.replacement);
    assert.equal(await act(business, suspended.version, "restore", { confirm: true }), "saved");
    const restored = await detail(business);
    assert.equal(restored.targetStatus, "verified");
    assert.equal(restored.canRestore, false);
    assert.equal(await act(business, restored.version, "dismiss"), "saved");
    await as("anon");
    assert.equal((await publicOffer()).state, "active");
    assert.ok(await publicProperty());
  }));
