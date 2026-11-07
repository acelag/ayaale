import "server-only";
import { newsletterOrigin } from "./server";

export function newsletterTestConfig() {
  if (process.env.NEWSLETTER_TEST_SEND_ENABLED !== "true" || !process.env.SUPABASE_SECRET_KEY)
    return null;
  const origin = newsletterOrigin();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TRANSACTIONAL_EMAIL_FROM?.trim();
  if (
    !origin?.startsWith("https://") ||
    !apiKey?.startsWith("re_") ||
    !from ||
    from.length > 200 ||
    /[\r\n]/.test(from) ||
    !from.includes("@")
  )
    return null;
  return { origin, apiKey, from };
}
