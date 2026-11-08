// Starts an isolated, reset-on-restart practice site. Never reads hosted credentials.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve, join } from "node:path";
import { mkdtemp, cp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";

if (!process.env.AYAALE_TEST_DATABASE_URL) {
  console.error("Set AYAALE_TEST_DATABASE_URL to the disposable loopback /ayaale_test database.");
  process.exit(1);
}
const env = {
  ...process.env,
  AYAALE_LOCAL_DEMO: "1",
  APP_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3200",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-test-key",
  SUPABASE_SECRET_KEY: "synthetic-service-key-for-tests",
  SUPABASE_SERVICE_ROLE_KEY: "",
  TRANSACTIONAL_EMAIL_ENABLED: "false",
  RESEND_API_KEY: "",
  RESEND_WEBHOOK_SECRET: "",
  TRANSACTIONAL_EMAIL_FROM: "",
  NEWSLETTER_SIGNUP_ENABLED: "false",
  NEWSLETTER_TEST_SEND_ENABLED: "false",
  NEWSLETTER_SEND_ENABLED: "false",
  NEWSLETTER_LINK_SECRET: "",
  NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: "",
  SEO_INDEXING_ENABLED: "false",
  GOOGLE_SITE_VERIFICATION: "",
  OFFER_VIEW_TRACKING: "on",
};
// Fail before seeding if another test process owns either practice port.
for (const port of [3101, 3200]) {
  const probe = createServer();
  try {
    await new Promise((ok, fail) => {
      probe.once("error", fail);
      probe.listen(port, "127.0.0.1", ok);
    });
  } catch {
    console.error(`Practice port ${port} is busy. Stop that practice/test process first.`);
    process.exit(1);
  }
  await new Promise((ok) => probe.close(ok));
}
// An isolated source snapshot also separates Next's .next cache and generated types
// from the user's running server. Never copy .env files or hosted credentials.
const appDirectory = await mkdtemp(join(tmpdir(), "ayaale-local-practice-"));
for (const name of [
  "app",
  "components",
  "lib",
  "public",
  "design",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "proxy.ts",
  "tsconfig.json",
  "next-env.d.ts",
  "postcss.config.mjs",
]) {
  await cp(resolve(name), join(appDirectory, name), { recursive: true });
}
await symlink(resolve("node_modules"), join(appDirectory, "node_modules"), "dir");
const children = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const waits = children
    .filter((c) => c.exitCode === null)
    .map(async (c) => {
      c.kill("SIGTERM");
      await once(c, "exit");
    });
  const timer = setTimeout(() => {
    for (const c of children) if (c.exitCode === null) c.kill("SIGKILL");
  }, 10000);
  timer.unref();
  await Promise.all(waits);
  clearTimeout(timer);
  await rm(appDirectory, { recursive: true, force: true });
  process.exit(code);
}
function start(args, cwd = process.cwd()) {
  const child = spawn(process.execPath, args, { env, stdio: "inherit", cwd });
  children.push(child);
  child.on("error", () => void stop(1));
  child.on("exit", (code) => {
    if (!stopping) void stop(code ?? 1);
  });
  return child;
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
start(["tests/e2e/journey-database-server.mjs"]);
let ready = false;
for (let i = 0; i < 100; i++) {
  try {
    const r = await fetch("http://127.0.0.1:3101/ready", { signal: AbortSignal.timeout(500) });
    if (r.ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
if (!ready) {
  console.error("Practice database did not become ready.");
  await stop(1);
}
console.log(
  "\nPractice site: http://127.0.0.1:3200\nTest password (local only): fixture-only-password\nChanges last until this demo stops. Restart to reset.\n",
);
start(
  [
    resolve("node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3200",
  ],
  appDirectory,
);
