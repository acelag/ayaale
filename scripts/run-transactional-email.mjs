import { dispatchTransactionalEmails, sendWithResend } from "../lib/email/transactional.mjs";

async function main() {
  if (process.env.TRANSACTIONAL_EMAIL_ENABLED !== "true") {
    console.log("Transactional email dispatch is disabled.");
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TRANSACTIONAL_EMAIL_FROM?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY;
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL);
  if (
    project.protocol !== "https:" ||
    site.protocol !== "https:" ||
    project.username ||
    project.password ||
    site.username ||
    site.password ||
    !secret?.startsWith("sb_secret_") ||
    !apiKey?.startsWith("re_") ||
    !from ||
    from.length > 200 ||
    /[\r\n]/.test(from) ||
    !from.includes("@")
  )
    throw new Error("Email worker configuration is invalid");

  const rpc = async (name, args) => {
    const response = await fetch(new URL(`/rest/v1/rpc/${name}`, project), {
      method: "POST",
      redirect: "error",
      headers: { apikey: secret, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Email worker database request failed");
    return response.json();
  };
  const totals = await dispatchTransactionalEmails({
    rpc,
    from,
    origin: site.origin,
    send: (request) => sendWithResend({ apiKey, ...request }),
  });
  console.log(JSON.stringify(totals));
}

try {
  await main();
} catch {
  console.error("Transactional email worker failed. Check configuration and delivery logs.");
  process.exitCode = 1;
}
