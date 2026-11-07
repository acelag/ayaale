import { verifyResendEvent } from "@/lib/email/resend-events.mjs";
import { photoStorage } from "@/lib/media/storage";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

async function rawWebhook(request: Request) {
  const maximum = 32 * 1024;
  if (!request.body || Number(request.headers.get("content-length")) > maximum) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maximum) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response(null, { status: 503, headers });
  let event;
  try {
    const raw = await rawWebhook(request);
    if (!raw) return new Response(null, { status: 413, headers });
    event = verifyResendEvent(raw, request.headers, secret);
  } catch {
    return new Response(null, { status: 400, headers });
  }
  if (!event) return new Response(null, { status: 200, headers });

  const client = photoStorage();
  if (!client) return new Response(null, { status: 503, headers });
  const { error } = await client.rpc("record_transactional_email_event", event);
  return new Response(null, { status: error ? 503 : 200, headers });
}
