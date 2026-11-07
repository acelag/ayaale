import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";

export function createDatabaseHarness() {
  // Never accept a hosted database or URL query overrides. Each run creates and
  // drops ONLY its own randomly named database in a disposable local test cluster.
  const connection = process.env.AYAALE_TEST_DATABASE_URL;
  if (!connection) throw new Error("Set AYAALE_TEST_DATABASE_URL to a local ayaale_test database");
  const base = new URL(connection);
  if (
    !["postgres:", "postgresql:"].includes(base.protocol) ||
    !["127.0.0.1", "[::1]", "localhost"].includes(base.hostname) ||
    base.pathname !== "/ayaale_test" ||
    base.search ||
    base.hash
  )
    throw new Error("Database tests require loopback /ayaale_test with no URL query/fragment");
  const databaseName = `ayaale_test_${randomUUID().replaceAll("-", "")}`;
  const testUrl = new URL(base);
  testUrl.pathname = `/${databaseName}`;
  const admin = new pg.Client({ connectionString: base.toString() });
  const db = new pg.Client({ connectionString: testUrl.toString() });
  let created = false;
  let connected = false;
  const ids = Object.fromEntries(
    ["owner", "staff1", "staff2", "third", "replacement", "property1", "property2"].map((key) => [
      key,
      randomUUID(),
    ]),
  );

  const setup = async () => {
    await admin.connect();
    await admin.query("begin; select pg_advisory_xact_lock(707)");
    try {
      await admin.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$`);
      await admin.query("commit");
    } catch (error) {
      await admin.query("rollback");
      throw error;
    }
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    await db.connect();
    connected = true;
    await db.query(`
    alter default privileges in schema public grant all on tables to service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text not null,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, banned_until timestamptz, is_anonymous boolean not null default false);
    grant usage on schema auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable set search_path='' as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  `);
    const migrations = (await fs.readdir("supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of migrations) {
      const sql = await fs.readFile(`supabase/migrations/${file}`, "utf8");
      await db.query(`begin;\n${sql}\ncommit;`);
    }
    await db.query("begin");
    for (const key of ["owner", "staff1", "staff2", "third", "replacement"]) {
      await db.query("insert into auth.users(id,email) values ($1,$2)", [
        ids[key],
        `${randomUUID()}@tests.invalid`,
      ]);
      await db.query("insert into public.profiles(id,display_name) values ($1,$2)", [
        ids[key],
        `Synthetic ${key}`,
      ]);
    }
    for (const key of ["property1", "property2"]) {
      await db.query(
        `insert into public.properties(id,slug,name,primary_category,property_type,address,district,
      latitude,longitude,google_maps_url,verification_status,verified_at)
      values ($1,$2,'Synthetic hotel','stays','hotel','Synthetic address','Colombo',6.9271,79.8612,
      'https://maps.google.com/?q=6.9271,79.8612','verified',now())`,
        [ids[key], `synthetic-${key}`],
      );
      await db.query(
        "insert into public.property_memberships(property_id,profile_id,role) values ($1,$2,'owner')",
        [ids[key], ids.owner],
      );
      await db.query(
        "insert into public.property_memberships(property_id,profile_id,role,staff_slot) values ($1,$2,'staff',1)",
        [ids[key], ids.staff1],
      );
    }
    await db.query(
      "insert into public.property_memberships(property_id,profile_id,role,staff_slot) values ($1,$2,'staff',2)",
      [ids.property1, ids.staff2],
    );
    await db.query("commit");
  };

  const cleanup = async () => {
    if (connected) await db.end();
    if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.end();
  };

  return { db, ids, testUrl, setup, cleanup };
}
