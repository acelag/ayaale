import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { createDatabaseHarness } from "./helpers.mjs";
import { createOfferFixtures } from "./offer-fixtures.mjs";

const { db, ids, setup, cleanup } = createDatabaseHarness();
const { offer, revision, approve, publish } = createOfferFixtures(db, ids);
before(setup);
after(cleanup);
const result = async (sql, args) => (await db.query(sql, args)).rows[0].result;
const get = (id) => result("select public.get_admin_newsletter($1) as result", [id]);
const find = (query) =>
  result("select public.search_admin_newsletter_offers($1) as result", [query]);
const save = (id, version, choices, subject = "Friday offers") =>
  result("select public.save_admin_newsletter($1,$2,$3,'Our latest offers.',$4,$5) as result", [
    id,
    version,
    subject,
    choices.map((item) => item.id),
    choices.map((item) => item.rev),
  ]);
const prepare = (id, version, testId) =>
  result("select public.prepare_admin_newsletter_test($1,$2,$3) as result", [id, version, testId]);
async function asUser(id) {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}

test("admins can save and reorder current revisions, while test sends stay private and reject stale offers", async () => {
  await db.query("begin");
  try {
    await db.query("update auth.users set email_confirmed_at=now()");
    await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.replacement]);
    const choices = [];
    for (let i = 0; i < 5; i++) {
      const id = await offer(i < 3 ? ids.property1 : ids.property2);
      const rev = await revision(id, 1, i < 3 ? "stays" : "dining");
      await db.query("update private.offer_revisions set title=$2 where id=$1", [
        rev,
        `Offer choice ${i}`,
      ]);
      await approve(rev);
      await publish(id, rev);
      choices.push({ id, rev });
    }
    const paused = await offer(ids.property2);
    const pausedRev = await revision(paused);
    await approve(pausedRev);
    await publish(paused, pausedRev, "paused");

    await asUser(ids.owner);
    assert.equal(await get(null), null);
    assert.equal(await find(""), null);
    assert.equal((await save(null, "", choices)).status, "forbidden");
    await asUser(ids.replacement);
    assert.equal((await find("")).length, 5);
    assert.equal((await find("choice 3"))[0].id, choices[3].id);
    assert.deepEqual(await find("no match"), []);
    assert.equal((await save(null, "", [choices[0], choices[0]])).status, "invalid");
    assert.equal((await save(null, "", [{ id: paused, rev: pausedRev }])).status, "offers_changed");
    const { id } = await save(null, "", []);
    assert.ok(id);
    const initial = await get(id);
    assert.equal(initial.status, "draft");
    assert.equal((await prepare(id, initial.version, randomUUID())).status, "incomplete");
    assert.equal((await save(id, initial.version, choices)).status, "saved");
    const populated = await get(id);
    const reversed = [...choices].reverse();
    assert.equal((await save(id, initial.version, reversed)).status, "stale");
    assert.equal((await save(id, populated.version, reversed)).status, "saved");
    const draft = await get(id);
    assert.deepEqual(
      draft.offers.map((row) => row.id),
      reversed.map((row) => row.id),
    );

    const testId = randomUUID();
    const testSend = await prepare(id, draft.version, testId);
    assert.equal(testSend.status, "ready");
    assert.match(testSend.recipient, /@tests.invalid$/);
    assert.deepEqual(testSend.draft.offers, draft.offers);
    assert.equal((await prepare(id, draft.version, testId)).status, "duplicate");
    assert.equal(
      await result(
        "select has_function_privilege('authenticated','public.finish_admin_newsletter_test(uuid,text,text)','execute') as result",
      ),
      false,
    );
    await db.query("set local role service_role");
    assert.equal(
      await result(
        "select public.finish_admin_newsletter_test($1,'accepted','provider-id') as result",
        [testId],
      ),
      true,
    );
    await db.query("reset role");
    assert.equal(
      await result("select status as result from private.newsletter_test_sends where id=$1", [
        testId,
      ]),
      "accepted",
    );
    assert.equal(
      await result("select count(*)::int as result from private.newsletter_deliveries"),
      0,
    );
    await db.query("update public.offers set status='paused' where id=$1", [choices[0].id]);
    await asUser(ids.replacement);
    assert.equal((await get(id)).offers.at(-1).current, false);
    assert.equal((await prepare(id, draft.version, randomUUID())).status, "offers_changed");
    assert.equal((await save(id, draft.version, reversed)).status, "offers_changed");
  } finally {
    await db.query("rollback");
  }
});
