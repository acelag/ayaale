import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetKey, acquireImageSlot } from "../lib/security/request-keys.mjs";
import { readBoundedImage, InvalidImage } from "../lib/media/process-image.mjs";
test("budget keys normalize subjects, separate actions and do not expose email", () => {
  const secret = "synthetic-test-secret-not-used-in-production";
  const a = budgetKey(secret, "auth_signup", "Person@tests.invalid");
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, budgetKey(secret, "auth_signup", " person@tests.invalid "));
  assert.notEqual(a, budgetKey(secret, "auth_signin", "Person@tests.invalid"));
  assert.notEqual(a, budgetKey(secret + "x", "auth_signup", "Person@tests.invalid"));
  assert.throws(() => budgetKey("short", "a", "b"));
});
test("at most two image slots can be held and release is idempotent", () => {
  const a = acquireImageSlot(),
    b = acquireImageSlot();
  assert.ok(a);
  assert.ok(b);
  assert.equal(acquireImageSlot(), null);
  a();
  a();
  const c = acquireImageSlot();
  assert.ok(c);
  assert.equal(acquireImageSlot(), null);
  b();
  c();
});
test("a stalled input is cancelled at the overall upload deadline", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(readBoundedImage(stream, 20), InvalidImage);
  assert.equal(cancelled, true);
});

const { createTimedFetch } = await import("../lib/security/timed-fetch.mjs");
function stalledFetch(_input, init) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response("late")), 2000);
    const fail = () => {
      clearTimeout(timer);
      reject(init.signal.reason);
    };
    if (init.signal.aborted) fail();
    else init.signal.addEventListener("abort", fail, { once: true });
  });
}
test("privileged fetch aborts a stalled upstream request", async () => {
  await assert.rejects(
    createTimedFetch(stalledFetch, 20)("https://synthetic.invalid"),
    (e) => e.name === "TimeoutError",
  );
});
test("privileged fetch preserves caller cancellation and disables caching", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    createTimedFetch(stalledFetch)("https://synthetic.invalid", { signal: controller.signal }),
    (e) => e.name === "AbortError",
  );
  let cache;
  const response = await createTimedFetch(async (_url, init) => {
    cache = init.cache;
    return new Response("ok");
  })("https://synthetic.invalid", { cache: "force-cache" });
  assert.equal(cache, "no-store");
  assert.equal(await response.text(), "ok");
});
