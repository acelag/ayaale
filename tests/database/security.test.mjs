import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import pg from "pg";
import { createDatabaseHarness } from "./helpers.mjs";
const { db, ids, testUrl, setup, cleanup } = createDatabaseHarness();
before(setup);
after(cleanup);
const hash = "a".repeat(64);
async function tx(fn) {
  await db.query("begin");
  try {
    await fn();
  } finally {
    await db.query("rollback");
  }
}
async function denied(sql, params = [], code = "42501") {
  await db.query("savepoint expected");
  try {
    await assert.rejects(db.query(sql, params), (e) => e.code === code);
  } finally {
    await db.query("rollback to savepoint expected;release savepoint expected");
  }
}
test("database selects fixed budgets, caps attempts and reports retry time", () =>
  tx(async () => {
    await db.query("set local role service_role");
    for (let i = 0; i < 7; i++) {
      const r = (
        await db.query("select * from public.consume_request_budget('auth_signup_subject',$1)", [
          hash,
        ])
      ).rows[0];
      assert.equal(r.allowed, i < 5);
      assert.ok(r.retry_after >= 1 && r.retry_after <= 3600);
    }
    assert.equal(
      (
        await db.query(
          "select attempts from private.request_budgets where action='auth_signup_subject'",
        )
      ).rows[0].attempts,
      6,
    );
    await denied(
      "select * from public.consume_request_budget('caller_controls_quota',$1)",
      [hash],
      "22023",
    );
    await denied(
      "select * from public.consume_request_budget('auth_signup_subject','raw-email')",
      [],
      "22023",
    );
  }));
test("new fixed window resets old budget without retaining a row per historical window", () =>
  tx(async () => {
    await db.query(
      "insert into private.request_budgets values('auth_signup_subject',$1,now()-interval '2 hours',now()-interval '1 hour',6)",
      [hash],
    );
    const r = (
      await db.query("select * from public.consume_request_budget('auth_signup_subject',$1)", [
        hash,
      ])
    ).rows[0];
    assert.equal(r.allowed, true);
    assert.equal(
      (await db.query("select attempts from private.request_budgets where key_hash=$1", [hash]))
        .rows[0].attempts,
      1,
    );
  }));
test("concurrent budget claims never exceed the final available allowance", async () => {
  const pool = new pg.Pool({ connectionString: testUrl.toString(), max: 12 });
  try {
    const result = await Promise.all(
      Array.from({ length: 12 }, () =>
        pool.query("select * from public.consume_request_budget('auth_signup_subject',$1)", [
          "b".repeat(64),
        ]),
      ),
    );
    assert.equal(result.filter((r) => r.rows[0].allowed).length, 5);
  } finally {
    await pool.end();
  }
});
test("browser roles cannot consume budgets, insert audit evidence or enumerate request hashes", () =>
  tx(async () => {
    await db.query("set local role authenticated");
    await denied("select * from public.consume_request_budget('auth_signup_subject',$1)", [hash]);
    await denied("select * from private.request_budgets");
    await denied("select public.record_auth_audit('auth_signin_succeeded',$1)", [ids.staff2]);
    await denied(
      "insert into private.audit_logs(relation_name,operation,actor_kind) values('forged','INSERT','user')",
    );
  }));
test("profile self-edit atomically appends only actor/record metadata", () =>
  tx(async () => {
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.staff2]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.staff2]);
    await db.query("set local role authenticated");
    await db.query(
      "update public.profiles set display_name='Do not copy this secret text' where id=$1",
      [ids.staff2],
    );
    assert.equal((await db.query("select count(*) from private.audit_logs")).rows[0].count, "0");
    await db.query("reset role");
    const row = (
      await db.query(
        "select * from private.audit_logs where relation_name='public.profiles' and record_id=$1 and operation='UPDATE'",
        [ids.staff2],
      )
    ).rows[0];
    assert.equal(row.actor_id, ids.staff2);
    assert.equal(row.actor_kind, "user");
    assert.ok(!JSON.stringify(row).includes("Do not copy"));
  }));
test("audit history is append-only even for service writers and rolls back with failed work", () =>
  tx(async () => {
    const before = (await db.query("select count(*) from private.audit_logs")).rows[0].count;
    await db.query("savepoint mutation");
    await db.query("update public.profiles set display_name='Synthetic rollback' where id=$1", [
      ids.owner,
    ]);
    await db.query("rollback to savepoint mutation");
    assert.equal((await db.query("select count(*) from private.audit_logs")).rows[0].count, before);
    await denied("update private.audit_logs set actor_id=null", [], "55000");
    await denied("delete from private.audit_logs", [], "55000");
    await db.query("set local role service_role");
    await denied("delete from private.audit_logs");
  }));
test("only current verified platform admins read audit history", () =>
  tx(async () => {
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.third]);
    await db.query("insert into private.platform_admins(profile_id) values($1)", [ids.third]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.third]);
    await db.query("set local role authenticated");
    assert.ok(
      Number((await db.query("select count(*) from private.audit_logs")).rows[0].count) > 0,
    );
  }));
test("service auth events reject arbitrary payloads and store no credentials", () =>
  tx(async () => {
    await db.query("set local role service_role");
    await db.query("select public.record_auth_audit('auth_signin_failed',null)");
    await denied("select public.record_auth_audit('password=secret',null)", [], "22023");
    const r = (await db.query("select * from private.audit_logs where relation_name='auth'"))
      .rows[0];
    assert.equal(r.operation, "auth_signin_failed");
    assert.equal(r.actor_id, null);
  }));
