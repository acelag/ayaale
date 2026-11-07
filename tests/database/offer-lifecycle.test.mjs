import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import pg from "pg";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, testUrl, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);

const result = async (query, args) => (await db.query(query, args)).rows[0].result;
const run = () => result("select public.run_offer_lifecycle() as result");
const idle = { activated: 0, expired: 0, busy: false };

async function ready(status, property = ids.property1) {
  const id = await offer(property);
  const rev = await revision(id);
  await approve(rev);
  await publish(id, rev, status === "paused" || status === "hidden_by_admin" ? "active" : status);
  if (status === "paused" || status === "hidden_by_admin")
    await db.query("update public.offers set status=$2 where id=$1", [id, status]);
  return { id, rev };
}

test("the job expires elapsed offers and publishes the due approved revision into the freed slot", async () => {
  await db.query("begin");
  try {
    const ended = await ready("active");
    const active = [await ready("active"), await ready("active")];
    const due = await ready("scheduled");
    const next = await ready("approved");
    const paused = await ready("paused", ids.property2);
    const redemptionEnded = await ready("paused", ids.property2);
    const hidden = await ready("hidden_by_admin", ids.property2);
    const noEntitlement = await ready("scheduled", ids.property2);
    await db.query(
      "update private.property_subscriptions set status='cancelled' where property_id=$1",
      [ids.property2],
    );
    await db.query("set local session_replication_role='replica'");
    await db.query(
      "update private.offer_revisions set publication_ends_at=now()-interval '1 second' where id=$1",
      [ended.rev],
    );
    await db.query(
      "update private.offer_revisions set redemption_starts_on=(now() at time zone 'Asia/Colombo')::date-2,redemption_ends_on=(now() at time zone 'Asia/Colombo')::date-1 where id=any($1::uuid[])",
      [[hidden.rev, redemptionEnded.rev]],
    );
    await db.query(
      "update private.offer_revisions set publication_starts_at=now()-interval '2 days' where id=$1",
      [due.rev],
    );
    await db.query("set local session_replication_role='origin'");
    for (const role of ["anon", "authenticated"])
      assert.equal(
        await result(
          "select has_function_privilege($1,'public.run_offer_lifecycle()','execute') as result",
          [role],
        ),
        false,
      );

    const page = ({ id }) =>
      result("select public.get_public_offer_page($1) as result", [`synthetic-${id}`]);
    assert.equal((await page(ended)).state, "ended");
    assert.equal(await page(due), null);
    await db.query("set local role service_role");
    assert.deepEqual(await run(), { activated: 1, expired: 2, busy: false });
    assert.deepEqual(await run(), idle);
    await db.query("reset role");

    for (const [item, status] of [
      [ended, "expired"],
      [due, "active"],
      [next, "approved"],
      [paused, "paused"],
      [hidden, "hidden_by_admin"],
      [redemptionEnded, "expired"],
      [noEntitlement, "scheduled"],
      ...active.map((item) => [item, "active"]),
    ]) {
      const row = await result(
        "select jsonb_build_object('status',status,'revision',approved_revision_id) as result from public.offers where id=$1",
        [item.id],
      );
      assert.deepEqual(row, { status, revision: item.rev });
    }
    assert.equal((await page(due)).state, "active");
    assert.equal((await page(ended)).state, "ended");
    assert.equal(
      await result(
        "select count(*)::int as result from private.offer_status_history where offer_id=$1 and new_status='expired'",
        [ended.id],
      ),
      1,
    );
    assert.equal(
      await result(
        "select count(*)::int as result from private.offer_status_history where offer_id=$1 and new_status='active'",
        [due.id],
      ),
      1,
    );
  } finally {
    await db.query("rollback");
  }
});

test("overlapping scheduler invocations return without repeating the work", async () => {
  const other = new pg.Client({ connectionString: testUrl.toString() });
  await other.connect();
  try {
    await other.query("begin");
    await other.query("select public.run_offer_lifecycle()");
    assert.deepEqual(await run(), { ...idle, busy: true });
    await other.query("rollback");
    assert.deepEqual(await run(), idle);
  } finally {
    await other.end();
  }
});
