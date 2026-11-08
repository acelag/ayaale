import assert from "node:assert/strict";
import { test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
import { seedManualDemo } from "../e2e/manual-demo-seed.mjs";
import { fixtureUserByEmail } from "../e2e/partner-fixture.mjs";

test("manual practice seed stays isolated and provides real role-scoped workflows", async () => {
  const harness = createDatabaseHarness();
  const previous = process.env.AYAALE_LOCAL_DEMO;
  const objects = new Map();
  try {
    await harness.setup();
    delete process.env.AYAALE_LOCAL_DEMO;
    await assert.rejects(
      seedManualDemo(harness.db, harness.ids, objects),
      /isolated test database/,
    );
    process.env.AYAALE_LOCAL_DEMO = "1";
    await seedManualDemo(harness.db, harness.ids, objects);
    const db = harness.db;
    const result = (
      await db.query(`select
      (select count(*)::int from public.offers where status='active') active,
      (select count(*)::int from private.offer_wizard_drafts) drafts,
      (select count(*)::int from private.issue_reports) reports,
      (select count(*)::int from private.newsletters) newsletters,
      (select count(*)::int from private.email_delivery_logs) emails`)
    ).rows[0];
    assert.deepEqual(result, { active: 6, drafts: 3, reports: 1, newsletters: 1, emails: 0 });
    assert.equal(objects.size, 6);
    const owner = fixtureUserByEmail("fixture-owner@example.invalid");
    const staff = fixtureUserByEmail("fixture-staff@example.invalid");
    const admin = fixtureUserByEmail("fixture-admin@example.invalid");
    await db.query("begin; set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner.id]);
    const owned = (await db.query("select public.get_partner_overview() as data")).rows[0].data
      .properties;
    assert.equal(owned.length, 4);
    assert.equal((await db.query("select public.get_admin_overview() as data")).rows[0].data, null);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [staff.id]);
    assert.equal(
      (
        await db.query("select public.get_property_subscription($1) as data", [
          harness.ids.property1,
        ])
      ).rows[0].data,
      null,
    );
    assert.equal(
      (await db.query("select public.get_offer_wizard($1) as data", [harness.ids.property2]))
        .rows[0].data,
      null,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [admin.id]);
    assert.ok((await db.query("select public.get_admin_overview() as data")).rows[0].data);
    await db.query("rollback");
  } finally {
    if (previous === undefined) delete process.env.AYAALE_LOCAL_DEMO;
    else process.env.AYAALE_LOCAL_DEMO = previous;
    await harness.cleanup();
  }
});
