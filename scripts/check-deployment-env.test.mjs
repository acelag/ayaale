import assert from "node:assert/strict";
import test from "node:test";
import { validateDeploymentEnv } from "./check-deployment-env.mjs";

const staging = {
  APP_ENV: "staging",
  NEXT_PUBLIC_SITE_URL: "https://ayaale-staging.onrender.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_test_only",
};

test("accepts separate HTTPS staging and canonical production configurations", () => {
  assert.deepEqual(validateDeploymentEnv(staging), []);
  assert.deepEqual(
    validateDeploymentEnv({
      ...staging,
      APP_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://ayaale.com",
    }),
    [],
  );
});

test("fails closed on missing configuration or invalid origins", () => {
  for (const change of [
    { APP_ENV: "" },
    { NEXT_PUBLIC_SITE_URL: "http://ayaale-staging.onrender.com" },
    { NEXT_PUBLIC_SITE_URL: "https://user:password@site.example" },
    { NEXT_PUBLIC_SITE_URL: "https://site.example/path" },
    { NEXT_PUBLIC_SUPABASE_URL: "" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://wrong.example" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
  ])
    assert.ok(validateDeploymentEnv({ ...staging, ...change }).length);
});

test("rejects staging use of production or local origins and wrong production host", () => {
  for (const url of [
    "https://ayaale.com",
    "https://www.ayaale.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
  ]) {
    assert.ok(validateDeploymentEnv({ ...staging, NEXT_PUBLIC_SITE_URL: url }).length);
  }
  assert.ok(validateDeploymentEnv({ ...staging, APP_ENV: "production" }).length);
});

test("rejects privileged or legacy keys in public configuration without printing values", () => {
  for (const change of [
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_synthetic_only" },
    { NEXT_PUBLIC_SERVICE_ROLE_KEY: "synthetic_private_value" },
    { NEXT_PUBLIC_OTHER: "eyJsynthetic_legacy_jwt" },
    { NEXT_PUBLIC_OTHER: "sb_secret_synthetic_only" },
  ]) {
    const errors = validateDeploymentEnv({ ...staging, ...change });
    assert.ok(errors.length);
    for (const value of Object.values(change)) assert.ok(!errors.join("\n").includes(value));
  }
});
