import { resolveTxt } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function backupIsFresh(receipt, now = Date.now()) {
  const time = Date.parse(receipt?.verifiedAt);
  return (
    receipt?.version === 1 &&
    receipt?.offsiteVerified === true &&
    receipt?.database === true &&
    receipt?.storage === true &&
    /^[a-f0-9]{64}$/.test(receipt?.sha256 ?? "") &&
    Number.isFinite(time) &&
    time <= now &&
    now - time <= 36 * 60 * 60 * 1000
  );
}

export async function checkOperations({
  full = false,
  fetcher = fetch,
  txt = resolveTxt,
  env = process.env,
  read = readFile,
} = {}) {
  const checks = {};
  // Fixed targets: never forward credentials or let untrusted input select an internal URL.
  for (const [name, path] of [
    ["health", "/api/health"],
    ["homepage", "/"],
  ]) {
    try {
      const response = await fetcher(`https://ayaale.com${path}`, {
        redirect: "error",
        signal: AbortSignal.timeout(75_000), // Free Render cold starts can be slow.
        headers: { "User-Agent": "Ayaale-Operations/1.0" },
      });
      checks[name] = response.status === 200;
      if (name === "health") checks[name] &&= (await response.json()).status === "ok";
      else await response.body?.cancel();
    } catch {
      checks[name] = false;
    }
  }
  if (full) {
    try {
      const records = (await txt("_dmarc.ayaale.com")).map((parts) => parts.join(""));
      checks.dmarc =
        records.length === 1 &&
        /^v=DMARC1;/.test(records[0]) &&
        /(?:^|;)\s*p=(?:quarantine|reject)(?:;|$)/.test(records[0]);
    } catch {
      checks.dmarc = false;
    }
    for (const kind of ["SPF", "DKIM"]) {
      const host = env[`MONITOR_${kind}_HOST`];
      const expected = env[`MONITOR_${kind}_VALUE`];
      // Provider-issued records only; never infer SPF/DKIM values.
      if (!host || !expected || !/^(?:[a-z0-9_-]+\.)*ayaale\.com$/i.test(host)) {
        checks[kind.toLowerCase()] = false;
        continue;
      }
      try {
        checks[kind.toLowerCase()] = (await txt(host)).some((parts) => parts.join("") === expected);
      } catch {
        checks[kind.toLowerCase()] = false;
      }
    }
    try {
      checks.backup = backupIsFresh(JSON.parse(await read(env.MONITOR_BACKUP_RECEIPT, "utf8")));
    } catch {
      checks.backup = false;
    }
  }
  return {
    scope: full ? "public-dns-backup" : "public-only",
    checks,
    ok: Object.values(checks).every(Boolean),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkOperations({ full: process.argv.includes("--full") });
    console.log(JSON.stringify(result)); // No response bodies, URLs, DNS values or credentials.
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error("Operations check failed; inspect protected provider dashboards.");
    process.exitCode = 1;
  }
}
