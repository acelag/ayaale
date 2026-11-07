import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
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

async function submit(
  kind,
  slugSuffix,
  { token = randomUUID(), reason = "unreachable_contact", comment = null, email = null } = {},
) {
  const { rows } = await db.query(
    "select public.submit_public_issue_report($1,$2,$3,$4,$5,$6) as result",
    [kind, `synthetic-${slugSuffix}`, token, reason, comment, email],
  );
  return rows[0].result;
}

test("report intake links each target, deduplicates retries and queues manual review", () =>
  transaction(async () => {
    const target = await offer();
    const approved = await revision(target);
    await approve(approved);
    await publish(target, approved);
    await db.query("update public.offers set status='paused' where id=$1", [target]);
    await db.query("set local role service_role");
    const token = randomUUID();
    const options = {
      token,
      reason: "unavailable_offer",
      comment: "  The offer is unavailable.  ",
      email: " reader@example.invalid ",
    };
    assert.equal(await submit("offer", target, options), "received");
    assert.equal(await submit("offer", target, options), "received");
    assert.equal(await submit("property", "property1"), "received");
    const { rows } = await db.query(
      "select offer_id,property_id,reason,comment,reporter_email,status,priority from private.issue_reports order by offer_id nulls last",
    );
    assert.deepEqual(rows, [
      {
        offer_id: target,
        property_id: null,
        reason: "unavailable_offer",
        comment: "The offer is unavailable.",
        reporter_email: "reader@example.invalid",
        status: "open",
        priority: "medium",
      },
      {
        offer_id: null,
        property_id: ids.property1,
        reason: "unreachable_contact",
        comment: null,
        reporter_email: null,
        status: "open",
        priority: "medium",
      },
    ]);
    assert.equal(
      (await db.query("select status from public.offers where id=$1", [target])).rows[0].status,
      "paused",
    );
    assert.equal(
      (await db.query("select count(*)::int as count from private.moderation_actions")).rows[0]
        .count,
      0,
    );
  }));

test("intake rejects nonpublic targets and invalid input", () =>
  transaction(async () => {
    const draft = await offer();
    const hidden = await offer();
    const approved = await revision(hidden);
    await approve(approved);
    await publish(hidden, approved);
    await db.query("update public.offers set status='hidden_by_admin' where id=$1", [hidden]);
    await db.query("update public.properties set verification_status='suspended' where id=$1", [
      ids.property2,
    ]);
    await db.query("set local role service_role");
    assert.equal(await submit("offer", draft), "unavailable");
    assert.equal(await submit("offer", hidden), "unavailable");
    assert.equal(await submit("property", "property2"), "unavailable");
    assert.equal(await submit("property", randomUUID()), "unavailable");
    assert.equal(await submit("listing", ids.property1), "invalid");
    assert.equal(await submit("property", "property1", { reason: "invalid" }), "invalid");
    assert.equal(await submit("property", "property1", { email: "invalid" }), "invalid");
    assert.equal(await submit("property", "property1", { comment: "x".repeat(2001) }), "invalid");
    assert.equal(
      (await db.query("select count(*)::int as count from private.issue_reports")).rows[0].count,
      0,
    );
  }));

test("reports and reporter details are private and the submission RPC is service-only", () =>
  transaction(async () => {
    await db.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])", [
      [ids.staff1, ids.replacement],
    ]);
    await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.replacement]);
    await db.query("set local role service_role");
    assert.equal(
      await submit("property", "property1", { email: "reader@example.invalid" }),
      "received",
    );
    const signature = "public.submit_public_issue_report(text,text,uuid,text,text,text)";
    const { rows } = await db.query(
      "select has_function_privilege('anon',$1,'execute') as anon, has_function_privilege('authenticated',$1,'execute') as authenticated",
      [signature],
    );
    assert.deepEqual(rows[0], { anon: false, authenticated: false });
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.staff1]);
    assert.deepEqual((await db.query("select reporter_email from private.issue_reports")).rows, []);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.replacement]);
    assert.deepEqual((await db.query("select reporter_email from private.issue_reports")).rows, [
      { reporter_email: "reader@example.invalid" },
    ]);
  }));

test("report limits bound target and global queue writes", () =>
  transaction(async () => {
    await db.query("set local role service_role");
    for (let i = 0; i < 20; i++) {
      assert.equal(await submit("property", "property1"), "received");
    }
    assert.equal(await submit("property", "property1"), "limited");
    assert.equal(await submit("property", "property2"), "received");
    await db.query(
      "update private.request_budgets set attempts=200 where action='issue_report_global'",
    );
    assert.equal(await submit("property", "property2"), "limited");
    assert.equal(
      (await db.query("select count(*)::int as count from private.issue_reports")).rows[0].count,
      21,
    );
  }));
