import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { backupArchive } from "./backup-archive.mjs";
import { backupIsFresh, checkOperations } from "./check-operations.mjs";

test("encrypted backups authenticate, restore exact bytes and reject corruption without partial output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ayaale-backup-test-"));
  try {
    const key = randomBytes(32).toString("base64");
    const input = join(dir, "synthetic.tar");
    const output = join(dir, "sealed");
    const restored = join(dir, "restored");
    const bytes = randomBytes(180_001);
    await writeFile(input, bytes);
    const result = await backupArchive({ mode: "seal", input, output, key });
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    const sealed = await readFile(output);
    assert.equal(sealed.includes(bytes.subarray(0, 64)), false);
    assert.deepEqual(await backupArchive({ mode: "verify", input: output, key }), {
      authenticated: true,
    });
    await backupArchive({ mode: "open", input: output, output: restored, key });
    assert.deepEqual(await readFile(restored), bytes);
    await assert.rejects(backupArchive({ mode: "seal", input, output, key }));
    assert.deepEqual(await readFile(output), sealed);
    await rm(restored);
    for (const damaged of [
      sealed.subarray(0, 20),
      Buffer.concat([sealed, Buffer.from("extra")]),
      Buffer.from(sealed),
    ]) {
      if (damaged.length === sealed.length) damaged[40] ^= 1;
      await writeFile(join(dir, "damaged"), damaged);
      await assert.rejects(
        backupArchive({ mode: "open", input: join(dir, "damaged"), output: restored, key }),
      );
      await assert.rejects(stat(restored), { code: "ENOENT" });
    }
    await assert.rejects(
      backupArchive({ mode: "verify", input: output, key: randomBytes(32).toString("base64") }),
    );
    await assert.rejects(backupArchive({ mode: "verify", input: output, key: "weak" }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("empty backup archive authenticates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ayaale-backup-test-"));
  try {
    const key = randomBytes(32).toString("base64");
    await writeFile(join(dir, "empty"), "");
    await backupArchive({
      mode: "seal",
      input: join(dir, "empty"),
      output: join(dir, "sealed"),
      key,
    });
    await backupArchive({ mode: "verify", input: join(dir, "sealed"), key });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("monitor fails closed on invalid health, redirects, network failure and missing full configuration", async () => {
  assert.equal(
    (await checkOperations({ fetcher: async () => new Response('{"status":"ok"}') })).ok,
    true,
  );
  for (const fetcher of [
    async () => new Response("oops"),
    async () => new Response("", { status: 302 }),
    async () => {
      throw new Error("sensitive provider details");
    },
  ]) {
    const result = await checkOperations({ fetcher });
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes("sensitive"), false);
  }
  const result = await checkOperations({
    full: true,
    env: {},
    fetcher: async () => new Response('{"status":"ok"}'),
    txt: async () => [],
    read: async () => {
      throw new Error();
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.checks.backup, false);
  assert.equal(result.checks.dkim, false);
});

test("monitor checks joined DNS values and independently verified fresh complete backup receipts", async () => {
  const receipt = {
    version: 1,
    verifiedAt: new Date().toISOString(),
    offsiteVerified: true,
    database: true,
    storage: true,
    sha256: "a".repeat(64),
  };
  const result = await checkOperations({
    full: true,
    env: {
      MONITOR_SPF_HOST: "send.ayaale.com",
      MONITOR_SPF_VALUE: "v=spf1 synthetic",
      MONITOR_DKIM_HOST: "test._domainkey.ayaale.com",
      MONITOR_DKIM_VALUE: "p=synthetic",
      MONITOR_BACKUP_RECEIPT: "unused",
    },
    fetcher: async () => new Response('{"status":"ok"}'),
    txt: async (host) =>
      host.startsWith("_dmarc")
        ? [["v=DMARC1; p=quarantine;"]]
        : host.startsWith("send")
          ? [["v=spf1 ", "synthetic"]]
          : [["p=synthetic"]],
    read: async () => JSON.stringify(receipt),
  });
  assert.equal(result.ok, true);
  for (const override of [
    { verifiedAt: new Date(Date.now() - 37 * 3600_000).toISOString() },
    { verifiedAt: new Date(Date.now() + 3600_000).toISOString() },
    { storage: false },
    { offsiteVerified: false },
    { sha256: "invalid" },
  ])
    assert.equal(backupIsFresh({ ...receipt, ...override }), false);
});
