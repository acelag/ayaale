import type { OutputInfo } from "sharp";
export const MAX_INPUT_BYTES: number;
export const MAX_PIXELS: number;
export class InvalidImage extends Error {}
export function readBoundedImage(
  stream: ReadableStream<Uint8Array> | null,
  timeoutMs?: number,
): Promise<Buffer>;
export function processImage(
  input: Buffer,
  mime: string,
): Promise<{
  main: { data: Buffer; info: OutputInfo };
  thumbnail: { data: Buffer; info: OutputInfo };
}>;
