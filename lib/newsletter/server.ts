import "server-only";
import { createHash, randomBytes } from "node:crypto";

export function newsletterOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (
      url.protocol === "https:" ||
      (process.env.APP_ENV === "development" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
      return url.origin;
  } catch {
    // A malformed deployment URL leaves public signup closed.
  }
  return null;
}

export function newsletterSignupConfig() {
  if (
    process.env.NEWSLETTER_SIGNUP_ENABLED !== "true" ||
    (process.env.SUPABASE_SECRET_KEY?.length ?? 0) < 24
  )
    return null;
  const origin = newsletterOrigin();
  const from = process.env.TRANSACTIONAL_EMAIL_FROM?.trim();
  const apiKey = process.env.RESEND_API_KEY;
  const details = process.env.NEWSLETTER_SENDER_DETAILS?.trim();
  const version = process.env.NEWSLETTER_PRIVACY_VERSION;
  try {
    const privacy = new URL(process.env.NEWSLETTER_PRIVACY_URL ?? "");
    if (
      !origin ||
      !from ||
      !apiKey?.startsWith("re_") ||
      /[\r\n]/.test(from) ||
      from.length > 200 ||
      !from.includes("@") ||
      !details ||
      details.length > 400 ||
      details.includes("[[") ||
      !version ||
      !/^[a-zA-Z0-9_.-]{1,80}$/.test(version) ||
      privacy.protocol !== "https:" ||
      privacy.username ||
      privacy.password
    )
      return null;
    return { origin, from, apiKey, details, version, privacyUrl: privacy.href };
  } catch {
    return null;
  }
}

export const makeNewsletterToken = () => randomBytes(32).toString("base64url");
export const newsletterTokenDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function newsletterConfirmationPayload(
  config: NonNullable<ReturnType<typeof newsletterSignupConfig>>,
  email: string,
  confirmation: string,
  unsubscribe: string,
) {
  const confirmUrl = new URL("/newsletter/confirm", config.origin);
  confirmUrl.hash = confirmation;
  const unsubscribeUrl = new URL("/newsletter/unsubscribe", config.origin);
  unsubscribeUrl.hash = unsubscribe;
  return {
    from: config.from,
    to: [email],
    subject: "Confirm your Ayaale newsletter subscription",
    text: [
      "Someone requested Ayaale’s free Friday newsletter with selected Sri Lankan offers.",
      `Confirm subscription: ${confirmUrl.href}`,
      "The confirmation link expires in 24 hours. If you didn’t request this, you can ignore it.",
      `Stop newsletter emails: ${unsubscribeUrl.href}`,
      `Privacy Policy: ${config.privacyUrl}`,
      config.details,
    ].join("\n\n"),
  };
}
