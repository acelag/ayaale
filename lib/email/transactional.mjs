import { createHash } from "node:crypto";

const templates = {
  registration: ["Property registration", "Your Ayaale property registration has been received."],
  property_verification: ["Property verification"],
  offer_review: ["Offer review"],
  complaint: ["Listing update"],
  trial_reminder: ["Starter trial reminder"],
  performance_summary: ["Offer performance summary"],
  inactive_property: ["Publish a new offer"],
  offer_expiry: ["Offer expiry reminder"],
};

const propertySections = {
  offer_review: "/offers",
  trial_reminder: "/subscription",
  performance_summary: "/analytics",
};

export function transactionalPayload(job, { from, origin }) {
  if (!Object.hasOwn(templates, job.kind)) throw new Error("Unknown transactional template");
  const [heading, fallback] = templates[job.kind];
  const subject = job.critical
    ? "Ayaale: Complaint needs review"
    : `Ayaale: ${
        job.title
          .replace(/[\r\n\t]+/g, " ")
          .trim()
          .slice(0, 155) || heading
      }`;
  const path = job.critical
    ? "/admin/reports"
    : job.propertyId
      ? `/partner/properties/${job.propertyId}${propertySections[job.kind] ?? ""}`
      : "/partner";
  const body = job.critical
    ? "A complaint needs a platform administrator’s attention. Review the report privately in Ayaale."
    : job.body || fallback || "Open your dashboard for the latest update.";
  return {
    from,
    to: [job.email],
    subject,
    text: `${body}\n\nOpen Ayaale: ${new URL(path, origin).href}\n\nAyaale`,
    tags: [{ name: "ayaale_delivery", value: job.id }],
  };
}

export async function sendWithResend({ apiKey, body, key, fetcher = fetch }) {
  let response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { outcome: "retry", error_code: "network_error", provider_id: null };
  }
  if (response.status === 401 || response.status === 403) {
    // Leave the lease recoverable and stop the batch when provider configuration is rejected.
    throw new Error("Provider authorization failed");
  }
  const result = await response.json().catch(() => null);
  if (response.ok && typeof result?.id === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(result.id)) {
    return { outcome: "sent", provider_id: result.id, error_code: null };
  }
  const retry =
    response.ok ||
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500 ||
    (response.status === 409 && result?.name === "concurrent_idempotent_requests");
  return {
    outcome: retry ? "retry" : "failed",
    error_code: response.ok ? "invalid_provider_response" : `provider_http_${response.status}`,
    provider_id: null,
  };
}

export async function dispatchTransactionalEmails({ rpc, send, from, origin, limit = 10 }) {
  const totals = { accepted: 0, deferred: 0, failed: 0, skipped: 0 };
  for (let index = 0; index < limit; index++) {
    const job = await rpc("claim_transactional_email", {});
    if (!job) break;
    const body = JSON.stringify(transactionalPayload(job, { from, origin }));
    const digest = createHash("sha256").update(body).digest("hex");
    const claim = { delivery_id: job.id, lease: job.lease };
    if (!(await rpc("prepare_transactional_email", { ...claim, digest }))) {
      totals.skipped++;
      continue;
    }
    const result = await send({ body, key: job.key });
    if (!(await rpc("finish_transactional_email", { ...claim, ...result }))) {
      // A signed provider event can finalize the delivery before the HTTP response.
      totals.skipped++;
      continue;
    }
    if (result.outcome === "sent") totals.accepted++;
    else if (result.outcome === "retry") totals.deferred++;
    else totals.failed++;
  }
  return totals;
}
