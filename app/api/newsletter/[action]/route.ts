import { sendWithResend } from "@/lib/email/transactional.mjs";
import { photoStorage } from "@/lib/media/storage";
import { newsletterTokenPattern } from "@/lib/newsletter/copy";
import {
  makeNewsletterToken,
  newsletterConfirmationPayload,
  newsletterOrigin,
  newsletterSignupConfig,
  newsletterTokenDigest,
} from "@/lib/newsletter/server";
import { budgetKey } from "@/lib/security/request-keys.mjs";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
type RouteParams = { params: Promise<{ action: string }> };
const respond = (status: string, http = 200) =>
  Response.json({ status }, { status: http, headers });

async function boundedText(request: Request) {
  const maximum = 4096;
  if (!request.body || Number(request.headers.get("content-length")) > maximum) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size).toString("utf8");
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

export async function GET(request: Request, { params }: RouteParams) {
  if ((await params).action !== "unsubscribe") return respond("invalid", 405);
  const origin = newsletterOrigin();
  if (!origin) return respond("unavailable", 503);
  const destination = new URL("/newsletter/unsubscribe", origin);
  const token = new URL(request.url).searchParams.get("token");
  if (token && newsletterTokenPattern.test(token)) destination.hash = token;
  return new Response(null, { status: 303, headers: { ...headers, Location: destination.href } });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { action } = await params;
  if (action !== "subscribe" && action !== "confirm" && action !== "unsubscribe")
    return respond("invalid", 404);
  const origin = newsletterOrigin();
  if (!origin) return respond("unavailable", 503);
  const contentType = request.headers.get("content-type") ?? "";
  const oneClick =
    action === "unsubscribe" &&
    /^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/i.test(contentType);
  if (!oneClick && request.headers.get("origin") !== origin) return respond("invalid", 403);
  if (!oneClick && !/^application\/json(?:;|$)/i.test(contentType)) return respond("invalid", 415);
  const raw = await boundedText(request).catch(() => null);
  if (raw === null) return respond("invalid", 413);

  if (oneClick) {
    const token = new URL(request.url).searchParams.get("token");
    if (!token || !newsletterTokenPattern.test(token)) return respond("invalid", 400);
    let form: FormData;
    try {
      form = await new Response(raw, { headers: { "Content-Type": contentType } }).formData();
    } catch {
      return respond("invalid", 400);
    }
    if ([...form].length !== 1 || form.get("List-Unsubscribe") !== "One-Click")
      return respond("invalid", 400);
    const client = photoStorage();
    if (!client) return respond("unavailable", 503);
    const { error } = await client.rpc("apply_newsletter_token", {
      token_purpose: "unsubscribe",
      token_digest: newsletterTokenDigest(token),
    });
    return new Response(null, { status: error ? 503 : 200, headers });
  }

  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return respond("invalid", 400);
    input = parsed as Record<string, unknown>;
  } catch {
    return respond("invalid", 400);
  }
  const client = photoStorage();
  if (!client) return respond("unavailable", 503);

  if (action !== "subscribe") {
    if (typeof input.token !== "string" || !newsletterTokenPattern.test(input.token))
      return respond("invalid", 400);
    const { data, error } = await client.rpc("apply_newsletter_token", {
      token_purpose: action,
      token_digest: newsletterTokenDigest(input.token),
    });
    if (error) return respond("unavailable", 503);
    return action === "unsubscribe"
      ? respond("withdrawn")
      : respond(data === "confirmed" ? "confirmed" : "invalid");
  }

  const config = newsletterSignupConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret || secret.length < 24) return respond("unavailable", 503);
  if (input.website) return respond("accepted", 202);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    input.consent !== true
  )
    return respond("invalid", 400);

  const confirmation = makeNewsletterToken();
  const unsubscribe = makeNewsletterToken();
  const { data, error } = await client.rpc("request_newsletter_signup", {
    subscriber_email: email,
    confirm_digest: newsletterTokenDigest(confirmation),
    unsubscribe_digest: newsletterTokenDigest(unsubscribe),
    subject_hash: budgetKey(secret, "newsletter_signup", email),
    privacy_version: config.version,
  });
  if (error) return respond("unavailable", 503);
  const result = data as { status: string; requestId?: string } | null;
  if (result?.status === "limited") return respond("limited", 429);
  if (result?.status === "invalid") return respond("invalid", 400);
  if (result?.status === "send" && result.requestId) {
    try {
      const delivery = await sendWithResend({
        apiKey: config.apiKey,
        body: JSON.stringify(
          newsletterConfirmationPayload(config, email, confirmation, unsubscribe),
        ),
        key: `ayaale/newsletter-confirm/${result.requestId}`,
      });
      if (delivery.outcome !== "sent")
        console.warn("Newsletter confirmation email was not accepted.");
    } catch {
      console.warn("Newsletter confirmation email provider unavailable.");
    }
  }
  return respond("accepted", 202);
}
