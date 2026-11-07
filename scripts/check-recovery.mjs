import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, chmod, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { createDatabaseHarness } from "../tests/database/helpers.mjs";
const run = promisify(execFile),
  h = createDatabaseHarness();
const base = new URL(process.env.AYAALE_TEST_DATABASE_URL);
const targetName = `ayaale_restore_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({ connectionString: base.toString() });
const targetURL = new URL(base);
targetURL.pathname = `/${targetName}`;
const target = new pg.Client({ connectionString: targetURL.toString() });
let created = false,
  connected = false,
  adminConnected = false;
const folder = await mkdtemp(path.join(tmpdir(), "ayaale-recovery-"));
await chmod(folder, 0o700);
const dump = path.join(folder, "synthetic.dump");
const bin = (name) => (process.env.PG_BIN_DIR ? path.join(process.env.PG_BIN_DIR, name) : name);
const args = [
  "--host",
  base.hostname,
  "--port",
  base.port || "5432",
  "--username",
  decodeURIComponent(base.username),
];
const env = { ...process.env, PGPASSWORD: decodeURIComponent(base.password) };
try {
  await h.setup();
  await h.db.query("update auth.users set email_confirmed_at=now() where id=$1", [h.ids.staff2]);
  await h.db.query(
    "update public.profiles set display_name='Synthetic restore sentinel' where id=$1",
    [h.ids.owner],
  );
  const sourceCount = (await h.db.query("select count(*) from private.audit_logs")).rows[0].count;
  await run(
    bin("pg_dump"),
    [...args, "--format=custom", "--file", dump, "--dbname", h.testUrl.pathname.slice(1)],
    { env, timeout: 60_000 },
  );
  await chmod(dump, 0o600);
  const checksum = createHash("sha256")
    .update(await readFile(dump))
    .digest("hex");
  await admin.connect();
  adminConnected = true;
  await admin.query(`create database "${targetName}"`);
  created = true;
  await run(bin("pg_restore"), [...args, "--exit-on-error", "--dbname", targetName, dump], {
    env,
    timeout: 60_000,
  });
  await target.connect();
  connected = true;
  assert.equal(
    (await target.query("select display_name from public.profiles where id=$1", [h.ids.owner]))
      .rows[0].display_name,
    "Synthetic restore sentinel",
  );
  assert.equal(
    (await target.query("select count(*) from private.audit_logs")).rows[0].count,
    sourceCount,
  );
  assert.equal(
    (
      await target.query(
        "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity",
      )
    ).rows[0].count,
    "0",
  );
  await target.query("begin");
  await target.query("select set_config('request.jwt.claim.sub',$1,true)", [h.ids.staff2]);
  await target.query("set local role authenticated");
  assert.equal((await target.query("select count(*) from public.properties")).rows[0].count, "1");
  assert.equal(
    (await target.query("select count(*) from private.property_subscriptions")).rows[0].count,
    "0",
  );
  await target.query("rollback");
  await target.query("begin");
  await target.query("set local role anon");
  await assert.rejects(target.query("select * from public.properties"), (e) => e.code === "42501");
  await target.query("rollback");
  await target.query("begin");
  await assert.rejects(target.query("delete from private.audit_logs"), (e) => e.code === "55000");
  await target.query("rollback");
  assert.equal(
    (await target.query("select public from storage.buckets where id='ayaale-private-photos'"))
      .rows[0].public,
    false,
  );
  console.log(
    JSON.stringify({
      result: "PASS",
      checks: [
        "custom-format dump/restore",
        "sentinel data",
        "audit records and immutability",
        "RLS enabled",
        "staff property isolation",
        "billing denial",
        "anonymous denial",
        "bucket catalogue",
      ],
      dumpSHA256: checksum,
      scope:
        "disposable synthetic local database only; no Storage bytes or hosted recovery coverage",
    }),
  );
} finally {
  if (connected) await target.end();
  if (created) await admin.query(`drop database "${targetName}"`);
  if (adminConnected) await admin.end();
  await h.cleanup();
  await rm(folder, { recursive: true, force: true });
}
