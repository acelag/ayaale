import test from "node:test";
import assert from "node:assert/strict";
import {
  canonical,
  discoveryVariant,
  indexingEnabled,
  jsonLd,
  summary,
  verificationCode,
} from "../lib/seo/policy.mjs";
import { sitemapPaths, sitemapXml } from "../lib/seo/sitemap.mjs";
const production = {
  APP_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://ayaale.com",
  SEO_INDEXING_ENABLED: "true",
};
test("indexing requires explicit canonical production release configuration", () => {
  assert.equal(indexingEnabled(production), true);
  for (const override of [
    { APP_ENV: "development" },
    { APP_ENV: "staging" },
    { NEXT_PUBLIC_SITE_URL: "https://preview.ayaale.com" },
    { SEO_INDEXING_ENABLED: undefined },
    { SEO_INDEXING_ENABLED: "false" },
    { IS_PULL_REQUEST: "true" },
    { VERCEL_ENV: "preview" },
  ])
    assert.equal(indexingEnabled({ ...production, ...override }), false);
  assert.equal(
    verificationCode({ ...production, GOOGLE_SITE_VERIFICATION: "synthetic-code-123" }),
    "synthetic-code-123",
  );
  assert.equal(
    verificationCode({
      ...production,
      APP_ENV: "development",
      GOOGLE_SITE_VERIFICATION: "synthetic-code-123",
    }),
    undefined,
  );
});
test("canonicals and descriptions never retain arbitrary search or campaign data", () => {
  assert.equal(canonical("/offers/sample-offer"), "https://ayaale.com/offers/sample-offer");
  for (const path of [
    "//evil.example",
    "/partner",
    "/?email=secret",
    "/offers/a?token=secret",
    "/offers/a#secret",
  ])
    assert.throws(() => canonical(path));
  assert.equal(discoveryVariant({ utm_source: "newsletter" }), false);
  for (const params of [
    { q: "private" },
    { category: "stays" },
    { cursor: "private" },
    { price_max: "5000" },
  ])
    assert.equal(discoveryVariant(params), true);
  assert.equal(summary(" One\n two  three "), "One two three");
  assert.equal(summary("x".repeat(200)).length, 160);
});
test("JSON-LD serialization prevents executable script breakout", () => {
  const payload = { name: '</script><script>alert("x")</script>\u2028\u2029' };
  const serialized = jsonLd(payload);
  assert.ok(!serialized.includes("<"));
  assert.deepEqual(JSON.parse(serialized), payload);
});
test("sitemap pages exhaust a sorted bounded catalogue with canonical XML", async () => {
  const rows = Array.from({ length: 1001 }, (_, n) => ({
    path: `/offers/offer-${String(n).padStart(4, "0")}`,
  }));
  const cursors = [];
  const paths = await sitemapPaths(async (after) => {
    cursors.push(after);
    return rows.filter((row) => !after || row.path > after).slice(0, 1000);
  });
  assert.equal(paths.length, 1002);
  assert.deepEqual(cursors, [null, "/offers/offer-0999"]);
  assert.match(sitemapXml(paths), /<loc>https:\/\/ayaale.com\/offers\/offer-1000<\/loc>/);
  assert.doesNotMatch(sitemapXml(paths), /lastmod|changefreq|priority/);
});
test("sitemap rejects errors, private/injected paths, duplicate pages and oversized catalogues", async () => {
  for (const rows of [
    null,
    [{ path: "/partner/private" }],
    [{ path: "/offers/a?token=secret" }],
    [{ path: "/offers/b" }, { path: "/offers/a" }],
    [{ path: "/offers/a" }, { path: "/offers/a" }],
  ])
    await assert.rejects(sitemapPaths(async () => rows));
  await assert.rejects(
    sitemapPaths(async () => {
      throw new Error("outage");
    }),
  );
  await assert.rejects(sitemapPaths(async () => Array(1001).fill({ path: "/offers/a" })));
});
