import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import {
  processImage,
  readBoundedImage,
  InvalidImage,
  MAX_INPUT_BYTES,
} from "../lib/media/process-image.mjs";
async function image(format = "jpeg", width = 800, height = 600) {
  return sharp({ create: { width, height, channels: 3, background: "#479665" } })
    .toFormat(format)
    .toBuffer();
}
test("accepted JPEG/PNG/WebP become decoded WebP variants with bounded dimensions", async () => {
  for (const format of ["jpeg", "png", "webp"]) {
    const result = await processImage(await image(format, 2200, 1100), `image/${format}`);
    for (const [variant, limit] of [
      [result.main, 1600],
      [result.thumbnail, 480],
    ]) {
      const meta = await sharp(variant.data).metadata();
      assert.equal(meta.format, "webp");
      assert.ok(meta.width <= limit && meta.height <= limit);
    }
    assert.equal(result.main.info.width, 1600);
    assert.equal(result.main.info.height, 800);
  }
});
test("small accepted images are never enlarged", async () => {
  const r = await processImage(await image("png", 300, 240), "image/png");
  assert.equal(r.main.info.width, 300);
  assert.equal(r.thumbnail.info.width, 300);
});
test("EXIF is stripped and orientation is applied before storage", async () => {
  const input = await sharp(await image("jpeg", 800, 400))
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const r = await processImage(input, "image/jpeg"),
    meta = await sharp(r.main.data).metadata();
  assert.equal(meta.width, 400);
  assert.equal(meta.height, 800);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.orientation, undefined);
});
test("empty, oversized, SVG, spoofed MIME and truncated photos are rejected", async () => {
  for (const [input, mime] of [
    [Buffer.alloc(0), "image/png"],
    [Buffer.alloc(MAX_INPUT_BYTES + 1), "image/png"],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml"],
    [await image("png"), "image/jpeg"],
    [(await image()).subarray(0, 100), "image/jpeg"],
  ])
    await assert.rejects(processImage(input, mime), InvalidImage);
});
test("pixel bombs, excessive dimensions and undersized photos are rejected", async () => {
  for (const buffer of [
    await image("png", 5000, 5000),
    await image("png", 13000, 240),
    await image("png", 239, 800),
  ])
    await assert.rejects(processImage(buffer, "image/png"), InvalidImage);
});
test("animated WebP is rejected rather than silently flattening", async () => {
  const frames = Buffer.alloc(300 * 600 * 3, 120);
  frames.fill(220, 300 * 300 * 3);
  const animated = await sharp(frames, {
    raw: { width: 300, height: 600, channels: 3, pageHeight: 300 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  await assert.rejects(processImage(animated, "image/webp"), InvalidImage);
});
test("bounded streaming works without trusting Content-Length and cancels at the limit", async () => {
  const expected = await image();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(expected.subarray(0, 20));
      c.enqueue(expected.subarray(20));
      c.close();
    },
  });
  assert.deepEqual(await readBoundedImage(stream), expected);
  let cancelled = false;
  const oversized = new ReadableStream({
    pull(c) {
      c.enqueue(new Uint8Array(MAX_INPUT_BYTES + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(readBoundedImage(oversized), InvalidImage);
  assert.equal(cancelled, true);
  await assert.rejects(readBoundedImage(null), InvalidImage);
});
