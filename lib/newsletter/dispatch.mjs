import { createHash, createHmac } from "node:crypto";
import { newsletterContent } from "./content.mjs";

export const newsletterDigest = (token) => createHash("sha256").update(token).digest("hex");

export function newsletterDeliveryPayload(
  job,
  { origin, from, linkSecret, senderDetails, privacyUrl },
) {
  const token = (purpose) =>
    createHmac("sha256", linkSecret)
      .update(JSON.stringify(["ayaale-newsletter-v1", job.id, purpose]))
      .digest("base64url");
  const unsubscribe = token("unsubscribe");
  const unsubscribeUrl = new URL("/newsletter/unsubscribe", origin);
  unsubscribeUrl.hash = unsubscribe;
  const oneClick = new URL("/api/newsletter/unsubscribe", origin);
  oneClick.searchParams.set("token", unsubscribe);
  const links = {};
  const digests = {};
  for (const offer of job.draft.offers) {
    const click = token(`click:${offer.id}`);
    const url = new URL("/newsletter/click", origin);
    url.searchParams.set("token", click);
    links[offer.id] = url.href;
    digests[offer.id] = newsletterDigest(click);
  }
  const footer = [
    "You confirmed an Ayaale newsletter subscription.",
    `Unsubscribe: ${unsubscribeUrl.href}`,
    `Privacy Policy: ${privacyUrl}`,
    senderDetails,
  ].join("\n");
  return {
    payload: {
      from,
      to: [job.email],
      subject: job.draft.subject,
      ...newsletterContent(
        job.draft,
        origin,
        false,
        links,
        footer,
        unsubscribeUrl.href,
        privacyUrl,
      ),
      headers: {
        "List-Unsubscribe": `<${oneClick.href}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [{ name: "ayaale_delivery", value: job.id }],
    },
    unsubscribeDigest: newsletterDigest(unsubscribe),
    clickDigests: digests,
  };
}

export async function dispatchNewsletters({ rpc, send, config, limit = 20 }) {
  const totals = { accepted: 0, deferred: 0, failed: 0, skipped: 0 };
  for (let index = 0; index < limit; index++) {
    const job = await rpc("claim_newsletter_email", {});
    if (!job) break;
    const { payload, unsubscribeDigest, clickDigests } = newsletterDeliveryPayload(job, config);
    const body = JSON.stringify(payload);
    const claim = { delivery_id: job.id, lease: job.lease };
    if (
      !(await rpc("prepare_newsletter_email", {
        ...claim,
        digest: newsletterDigest(body),
        unsubscribe_digest: unsubscribeDigest,
        click_digests: clickDigests,
      }))
    ) {
      totals.skipped++;
      continue;
    }
    const outcome = await send({ body, key: job.key });
    if (!(await rpc("finish_transactional_email", { ...claim, ...outcome }))) {
      totals.skipped++;
      continue;
    }
    if (outcome.outcome === "sent") totals.accepted++;
    else if (outcome.outcome === "retry") totals.deferred++;
    else totals.failed++;
  }
  return totals;
}
