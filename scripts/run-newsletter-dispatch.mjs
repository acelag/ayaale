import { sendWithResend } from "../lib/email/transactional.mjs";
import { dispatchNewsletters } from "../lib/newsletter/dispatch.mjs";

async function main() {
  if (process.env.NEWSLETTER_SEND_ENABLED !== "true") {
    console.log("Newsletter dispatch is disabled.");
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TRANSACTIONAL_EMAIL_FROM?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY;
  const linkSecret = process.env.NEWSLETTER_LINK_SECRET;
  const senderDetails = process.env.NEWSLETTER_SENDER_DETAILS?.trim();
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL);
  const privacy = new URL(process.env.NEWSLETTER_PRIVACY_URL);
  if (
    [project, site, privacy].some(
      (url) => url.protocol !== "https:" || url.username || url.password,
    ) ||
    !secret?.startsWith("sb_secret_") ||
    !apiKey?.startsWith("re_") ||
    !linkSecret ||
    linkSecret.length < 32 ||
    !senderDetails ||
    senderDetails.length > 400 ||
    senderDetails.includes("[[") ||
    !from ||
    !from.includes("@") ||
    from.length > 200 ||
    /[\r\n]/.test(from)
  ) {
    throw new Error("Newsletter configuration invalid");
  }
  const rpc = async (name, args) => {
    const response = await fetch(new URL(`/rest/v1/rpc/${name}`, project), {
      method: "POST",
      redirect: "error",
      headers: { apikey: secret, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Newsletter database request failed");
    return response.json();
  };
  console.log(
    JSON.stringify(
      await dispatchNewsletters({
        rpc,
        config: { origin: site.origin, from, linkSecret, senderDetails, privacyUrl: privacy.href },
        send: (request) => sendWithResend({ apiKey, ...request }),
      }),
    ),
  );
}

try {
  await main();
} catch {
  console.error("Newsletter dispatch failed. Check configuration and private delivery logs.");
  process.exitCode = 1;
}
