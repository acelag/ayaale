import sharp from "sharp";
export const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_PIXELS = 24_000_000;
export class InvalidImage extends Error {}
/** @param {ReadableStream<Uint8Array> | null} stream @param {number} [timeoutMs] */
export async function readBoundedImage(stream, timeoutMs = 20_000) {
  if (!stream) throw new InvalidImage("An image is required.");
  const reader = stream.getReader(),
    chunks = [];
  let bytes = 0;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new InvalidImage("Image upload timed out."));
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_INPUT_BYTES) {
        await reader.cancel();
        throw new InvalidImage("Images must be 8 MiB or smaller.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
/** @param {Buffer} input @param {string} mime */
export async function processImage(input, mime) {
  if (!input.length || input.length > MAX_INPUT_BYTES)
    throw new InvalidImage("Images must be between 1 byte and 8 MiB.");
  const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
  if (!Object.hasOwn(formats, mime)) throw new InvalidImage("Use JPEG, PNG or WebP.");
  try {
    const options = { limitInputPixels: MAX_PIXELS, failOn: /** @type {const} */ ("warning") };
    const meta = await sharp(input, options).metadata();
    if (
      meta.format !== formats[/** @type {keyof typeof formats} */ (mime)] ||
      !meta.width ||
      !meta.height ||
      meta.width > 12000 ||
      meta.height > 12000 ||
      (meta.pages ?? 1) !== 1 ||
      meta.width < 240 ||
      meta.height < 240
    )
      throw new InvalidImage("Use a still photo with both dimensions at least 240 pixels.");
    // Full decoding/re-encoding, auto-orientation and metadata stripping. Originals are never persisted.
    const main = await sharp(input, options)
      .timeout({ seconds: 10 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(main.data)
      .timeout({ seconds: 10 })
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer({ resolveWithObject: true });
    if (main.data.length > 2 * 1024 * 1024 || thumbnail.data.length > 512 * 1024)
      throw new InvalidImage("This photo is too complex. Choose a smaller image.");
    return { main, thumbnail };
  } catch (error) {
    if (error instanceof InvalidImage) throw error;
    throw new InvalidImage("The photo could not be decoded safely.");
  }
}
