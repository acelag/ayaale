import test from "node:test";
import assert from "node:assert/strict";
import {
  accessCode,
  cookieName,
  createAttemptLimiter,
  gateEnabled,
  issuePreview,
  matchesCode,
  validPreview,
  previewLifetime,
} from "../lib/prelaunch/access.mjs";
const env = {
  APP_ENV: "production",
  PRELAUNCH_ENABLED: "true",
  PRELAUNCH_ACCESS_CODE: "synthetic-preview-code-12345",
};
const now = Date.parse("2026-11-08T00:00:00Z");
test("preview cookie rejects forgery, expiry, future windows and rotated or missing codes", () => {
  const token = issuePreview(env, now);
  assert.equal(validPreview(token, env, now), true);
  assert.equal(validPreview(token, env, now + previewLifetime * 1000), false);
  assert.equal(validPreview(token, env, now - 1000), false);
  assert.equal(
    validPreview(token, { ...env, PRELAUNCH_ACCESS_CODE: "different-synthetic-code" }, now),
    false,
  );
  assert.equal(validPreview(token, {}, now), false);
  for (const malformed of [
    "",
    token + "x",
    "9999999999." + "a".repeat(64),
    token.replace(/.$/, "g"),
    "../../secret",
    null,
  ])
    assert.equal(validPreview(malformed, env, now), false);
});
test("preview requires a long server code, exact comparison and separate production cookie", () => {
  assert.equal(matchesCode("synthetic-preview-code-12345", env), true);
  assert.equal(matchesCode("Synthetic-preview-code-12345", env), false);
  for (const code of ["1234", "", undefined, "has space long enough"])
    assert.equal(accessCode({ PRELAUNCH_ACCESS_CODE: code }), null);
  assert.equal(cookieName(env), "__Host-ayaale-preview");
  assert.equal(cookieName({ APP_ENV: "development" }), "ayaale-preview");
  assert.equal(gateEnabled({ PRELAUNCH_ENABLED: "false" }), false);
});
test("preview attempts have a bounded window independent of submitted code", () => {
  const allowed = createAttemptLimiter(2, 1000);
  assert.equal(allowed(2000), true);
  assert.equal(allowed(2001), true);
  assert.equal(allowed(2002), false);
  assert.equal(allowed(3000), true);
});
