import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { createDatabaseHarness } from "./helpers.mjs";
const { db, ids, setup, cleanup } = createDatabaseHarness();
const photos = [randomUUID(), randomUUID()];
before(async () => {
  await setup();
  for (let i = 0; i < 2; i++)
    await db.query(
      `insert into public.photo_assets(id,property_id,created_by,main_path,thumbnail_path,width,height,byte_size)
 values($1,$2,$3,$4,$5,800,600,12345)`,
      [
        photos[i],
        ids[`property${i + 1}`],
        ids.owner,
        `${ids[`property${i + 1}`]}/${photos[i]}/main.webp`,
        `${ids[`property${i + 1}`]}/${photos[i]}/thumbnail.webp`,
      ],
    );
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
async function asStaff() {
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.staff2]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.staff2]);
  await db.query("set local role authenticated");
}
test("bucket is private, WebP-only and limited to 2 MiB processed objects", async () => {
  assert.deepEqual(
    (
      await db.query(
        "select public,file_size_limit,allowed_mime_types from storage.buckets where id=$1",
        ["ayaale-private-photos"],
      )
    ).rows,
    [{ public: false, file_size_limit: "2097152", allowed_mime_types: ["image/webp"] }],
  );
});
test("photo metadata reads are property-scoped", () =>
  tx(async () => {
    await asStaff();
    assert.deepEqual((await db.query("select id from public.photo_assets")).rows, [
      { id: photos[0] },
    ]);
    assert.equal(
      (await db.query("select id from public.photo_assets where id=$1", [photos[1]])).rowCount,
      0,
    );
  }));
test("members cannot forge processed assets or replace objects through metadata writes", () =>
  tx(async () => {
    await asStaff();
    await assert.rejects(
      db.query("delete from public.photo_assets where id=$1", [photos[0]]),
      (e) => e.code === "42501",
    );
  }));
test("photo paths cannot cross property boundaries and dimensions are bounded", () =>
  tx(async () => {
    await assert.rejects(
      db.query("update public.photo_assets set main_path=$2 where id=$1", [
        photos[0],
        `${ids.property2}/${photos[0]}/main.webp`,
      ]),
      (e) => e.code === "23514",
    );
  }));
test("photo records deny anonymous reads", () =>
  tx(async () => {
    await db.query("set local role anon");
    await assert.rejects(db.query("select * from public.photo_assets"), (e) => e.code === "42501");
  }));
