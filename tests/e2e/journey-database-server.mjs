// Local-only test gateway. Business workflows run in the real migrated database;
// only the external Auth provider and object-storage bytes are substitutes.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";
import { createDatabaseHarness } from "../database/helpers.mjs";
import { fixtureIdentity, fixtureIdentityById, handlePartnerFixture } from "./partner-fixture.mjs";

const harness = createDatabaseHarness(); // Rejects hosted URLs before any connection.
try {
  await harness.setup();
} catch (error) {
  await harness.cleanup().catch(() => {});
  throw error;
}
const pool = new pg.Pool({ connectionString: harness.testUrl.toString(), max: 6 });
const maintenance = new pg.Pool({ connectionString: harness.testUrl.toString(), max: 1 });
const adminQuery = (...args) => maintenance.query(...args);
const serviceKey = "synthetic-service-key-for-tests";
const controlKey = "synthetic-journey-control";
const registered = new Set();
const objects = new Map();
const signedObjects = new Map();
const calls = [];
const identifiers = /^[a-z_][a-z0-9_]*$/;
const allowedRPCs = new Set([
  "consume_request_budget",
  "record_auth_audit",
  "get_notification_inbox",
  "get_partner_overview",
  "get_my_ownership_claims",
  "register_partner_property",
  "has_platform_admin_access",
  "get_admin_overview",
  "get_admin_verifications",
  "decide_property_verification",
  "get_property_subscription",
  "get_offer_wizard",
  "save_offer_wizard",
  "get_admin_offer_reviews",
  "decide_offer_review",
  "get_partner_offers",
  "get_property_offer_capacity",
  "manage_partner_offer",
  "get_public_offer_page",
  "get_public_offer_cover_path",
  "get_public_offer_contact",
  "get_public_offer_gallery_path",
  "list_discovery_offers_filtered",
  "get_public_property_profile",
  "get_public_property_photo_path",
  "record_offer_view_attributed",
  "record_offer_contact_click",
  "get_property_analytics",
]);
function reply(res, code, data, headers = {}) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(data));
}
async function json(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw Error("Test JSON too large");
  }
  return body ? JSON.parse(body) : {};
}
async function identity(user) {
  if (!user) return;
  await adminQuery(
    `insert into auth.users(id,email,email_confirmed_at,is_anonymous)
    values($1,$2,$3,false) on conflict(id) do update set email_confirmed_at=excluded.email_confirmed_at`,
    [user.id, user.email, user.email_confirmed_at ?? null],
  );
  if (user.email === "fixture-admin@example.invalid") {
    await adminQuery(
      "insert into public.profiles(id,display_name) values($1,'Journey admin') on conflict do nothing",
      [user.id],
    );
    await adminQuery(
      "insert into private.platform_admins(profile_id) values($1) on conflict do nothing",
      [user.id],
    );
  }
}
async function scoped(user, service, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `set local role ${service ? "service_role" : user ? "authenticated" : "anon"}`,
    );
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [user?.id ?? ""]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
async function snapshot(property) {
  const { rows } = await adminQuery(
    `select
    (select verification_status from public.properties where id=$1) as verification,
    (select count(*)::int from private.trial_allocations where property_id=$1) as trials,
    (select jsonb_build_object('start',s.period_starts_at,'end',s.period_ends_at,'sixMonths',s.period_ends_at=((s.period_starts_at at time zone 'Asia/Colombo')+interval '6 months') at time zone 'Asia/Colombo') from private.trial_allocations t join private.property_subscriptions s on s.id=t.subscription_id where t.property_id=$1) as trial,
    coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'slug',o.slug,'status',o.status,'firstPublished',o.first_published_at,
      'revision',o.approved_revision_id)) from public.offers o where o.property_id=$1),'[]'::jsonb) as offers,
    coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'submitted',d.submitted_at is not null,'content',d.content)) from private.offer_wizard_drafts d where d.property_id=$1),'[]'::jsonb) as drafts,
    (select count(*)::int from private.contact_click_events c join public.offers o on o.id=c.offer_id where o.property_id=$1) as contacts,
    (select count(*)::int from private.offer_status_history h join public.offers o on o.id=h.offer_id where o.property_id=$1 and h.new_status='expired') as expirations
    `,
    [property],
  );
  return {
    ...rows[0],
    calls: calls.filter(
      (call) => call.property === property || call.name === "record_offer_contact_click",
    ),
  };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:3101");
    if (url.pathname === "/ready") return reply(res, 200, { ready: true });
    if (url.pathname.startsWith("/auth/v1/")) return await handlePartnerFixture(req, res);
    if (url.pathname.startsWith("/__journey/")) {
      if (req.headers["x-journey-control"] !== controlKey) return reply(res, 403, {});
      const body = await json(req);
      if (!registered.has(body.property)) return reply(res, 404, {});
      if (url.pathname === "/__journey/expire") {
        // Advance only the approved test offer's deadline. Never change its status
        // directly: the actual service-only lifecycle job performs the transition.
        const clock = await maintenance.connect();
        await clock.query("begin");
        try {
          await clock.query("set local session_replication_role='replica'");
          await clock.query(
            `update private.offer_revisions set publication_ends_at=clock_timestamp()-interval '1 second'
            where id in (select approved_revision_id from public.offers where property_id=$1 and status='active')`,
            [body.property],
          );
          await clock.query("commit");
        } catch (error) {
          await clock.query("rollback");
          throw error;
        } finally {
          clock.release();
        }
        const before = await snapshot(body.property);
        before.publicState = await scoped(
          null,
          false,
          async (db) =>
            (
              await db.query("select public.get_public_offer_page($1) as result", [
                before.offers[0].slug,
              ])
            ).rows[0].result?.state,
        );
        const job = await scoped(
          null,
          true,
          async (db) =>
            (await db.query("select public.run_offer_lifecycle() as result")).rows[0].result,
        );
        const retry = await scoped(
          null,
          true,
          async (db) =>
            (await db.query("select public.run_offer_lifecycle() as result")).rows[0].result,
        );
        return reply(res, 200, { before, job, retry, after: await snapshot(body.property) });
      }
      if (url.pathname === "/__journey/state")
        return reply(res, 200, await snapshot(body.property));
      return reply(res, 404, {});
    }
    const user = fixtureIdentity(req);
    const service = req.headers.apikey === serviceKey;
    const signed = signedObjects.get(url.searchParams.get("token"));
    const signedRead =
      req.method === "GET" &&
      signed &&
      signed.expires > Date.now() &&
      url.pathname === `/storage/v1/object/ayaale-private-photos/${signed.path}`;
    if (!signedRead && ![serviceKey, "synthetic-test-key"].includes(req.headers.apikey))
      return reply(res, 401, {});
    await identity(user);
    if (url.pathname.startsWith("/storage/v1/")) {
      const prefix = "/storage/v1/object/ayaale-private-photos/";
      if (url.pathname.startsWith(prefix)) {
        const path = decodeURIComponent(url.pathname.slice(prefix.length));
        if (!service && !signedRead) return reply(res, 403, {});
        if (req.method === "POST") {
          const buffers = [];
          let bytes = 0;
          for await (const buffer of req) {
            bytes += buffer.length;
            if (bytes > 10_000_000) throw Error("Test image too large");
            buffers.push(buffer);
          }
          objects.set(path, Buffer.concat(buffers));
          return reply(res, 200, { Key: path });
        }
        if (req.method === "GET" && objects.has(path)) {
          res.writeHead(200, { "Content-Type": "image/webp" });
          return res.end(objects.get(path));
        }
      }
      if (url.pathname === "/storage/v1/object/sign/ayaale-private-photos" && service) {
        const body = await json(req);
        return reply(
          res,
          200,
          body.paths.map((path) => {
            const token = randomUUID();
            signedObjects.set(token, { path, expires: Date.now() + 60_000 });
            return { path, signedURL: `/object/ayaale-private-photos/${path}?token=${token}` };
          }),
        );
      }
      return reply(res, 404, {});
    }
    const body = req.method === "POST" ? await json(req) : {};
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const name = url.pathname.slice("/rest/v1/rpc/".length);
      if (!allowedRPCs.has(name) || !Object.keys(body).every((key) => identifiers.test(key))) {
        console.error("Unsupported journey RPC:", name);
        return reply(res, 404, { message: "Unsupported journey RPC" });
      }
      if (name === "record_auth_audit" && body.verified_actor)
        await identity(fixtureIdentityById(body.verified_actor));
      const keys = Object.keys(body);
      const args = keys.map((key, index) => `${key} => $${index + 1}`).join(",");
      const returnsSet = (
        await adminQuery(
          "select proretset from pg_proc where pronamespace='public'::regnamespace and proname=$1",
          [name],
        )
      ).rows[0]?.proretset;
      const result = await scoped(user, service, async (db) => {
        const query = returnsSet
          ? `select * from public.${name}(${args})`
          : `select public.${name}(${args}) as result`;
        const values = keys.map((key) => body[key]);
        const { rows } = await db.query(query, values);
        return returnsSet ? rows : rows[0]?.result;
      });
      if (name === "register_partner_property" && result === "registered")
        registered.add(body.registration_id);
      if (
        [
          "register_partner_property",
          "decide_property_verification",
          "save_offer_wizard",
          "decide_offer_review",
          "manage_partner_offer",
          "record_offer_contact_click",
        ].includes(name)
      )
        calls.push({ name, property: body.target_property ?? body.registration_id, result });
      return reply(res, 200, result);
    }
    const table = url.pathname.slice("/rest/v1/".length);
    const rows = await scoped(user, service, async (db) => {
      if (table === "profiles" && req.method === "POST") {
        await db.query(
          "insert into public.profiles(id,display_name) values($1,$2) on conflict(id) do nothing",
          [body.id, body.display_name],
        );
        return [];
      }
      if (table === "photo_assets" && req.method === "POST" && service) {
        const { id, property_id, created_by, main_path, thumbnail_path, width, height, byte_size } =
          body;
        await db.query(
          "insert into public.photo_assets(id,property_id,created_by,main_path,thumbnail_path,width,height,byte_size) values($1,$2,$3,$4,$5,$6,$7,$8)",
          [id, property_id, created_by, main_path, thumbnail_path, width, height, byte_size],
        );
        return [];
      }
      if (!["GET", "HEAD"].includes(req.method)) throw Error("Unsupported journey write");
      const filter = (key) => url.searchParams.get(key)?.replace(/^eq\./, "");
      if (table === "property_memberships") {
        if (url.searchParams.get("select") === "role")
          return (
            await db.query(
              "select role from public.property_memberships where property_id=$1 and profile_id=$2",
              [filter("property_id"), filter("profile_id")],
            )
          ).rows;
        return (
          await db.query(
            `select m.role,jsonb_build_object('id',p.id,'name',p.name,'district',p.district,'verification_status',p.verification_status) as properties
          from public.property_memberships m join public.properties p on p.id=m.property_id
          where m.profile_id=$1 and p.archived_at is null order by m.property_id`,
            [filter("profile_id")],
          )
        ).rows;
      }
      if (["properties", "photo_assets"].includes(table)) {
        const columns = (url.searchParams.get("select") ?? "id").split(",");
        if (!columns.every((key) => identifiers.test(key)))
          throw Error("Unsupported journey projection");
        const keys = ["id", "property_id"].filter((key) => url.searchParams.has(key));
        const where = keys.map((key, i) => `${key}=$${i + 1}`).join(" and ");
        return (
          await db.query(
            `select ${columns.join(",")} from public.${table}${where ? ` where ${where}` : ""} order by id`,
            keys.map(filter),
          )
        ).rows;
      }
      throw Error(`Unsupported journey table: ${table}`);
    });
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
      return res.end();
    }
    return reply(
      res,
      req.method === "POST" ? 201 : 200,
      req.headers.accept?.includes("vnd.pgrst.object") ? (rows[0] ?? null) : rows,
    );
  } catch (error) {
    console.error("Journey gateway:", error.code ?? "error", error.message);
    reply(res, 500, { code: error.code ?? "TEST_GATEWAY", message: error.message });
  }
});
server.listen(3101, "127.0.0.1");
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  await pool.end();
  await maintenance.end();
  await harness.cleanup();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
