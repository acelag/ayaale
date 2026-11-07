import { test, expect } from "@playwright/test";
const path = "/api/properties/00000000-0000-4000-8000-000000000001/photos";
test("upload rejects foreign-origin writes before processing bytes", async ({ request }) => {
  const response = await request.post(path, {
    headers: { origin: "https://untrusted.invalid", "content-type": "image/png" },
    data: "not an image",
  });
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toContain("no-store");
});
test("photo delivery requires property authentication and is never public-cacheable", async ({
  request,
}) => {
  const response = await request.get(`${path}/00000000-0000-4000-8000-000000000002`);
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).not.toContain("signedUrl");
});
