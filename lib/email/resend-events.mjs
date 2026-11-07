import { createHmac, timingSafeEqual } from "node:crypto";

const statuses = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function verifyResendEvent(raw, headers, secret, now = Date.now()) {
  const id = headers.get("svix-id");
  const stamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (
    !id ||
    id.length > 200 ||
    !stamp ||
    !/^\d{1,12}$/.test(stamp) ||
    Math.abs(now / 1000 - Number(stamp)) > 300 ||
    !signatures ||
    signatures.length > 4096 ||
    !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)
  )
    throw new Error("Invalid webhook");

  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length < 16) throw new Error("Invalid webhook");
  const expected = createHmac("sha256", key).update(`${id}.${stamp}.`).update(raw).digest();
  if (
    !signatures.split(/\s+/).some((signature) => {
      if (!/^v1,[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
      const received = Buffer.from(signature.slice(3), "base64");
      return received.length === expected.length && timingSafeEqual(expected, received);
    })
  )
    throw new Error("Invalid webhook");

  const event = JSON.parse(Buffer.from(raw).toString("utf8"));
  if (typeof event?.type !== "string" || !Object.hasOwn(statuses, event.type)) return null;
  const delivery = event.data?.tags?.ayaale_delivery;
  const provider = event.data?.email_id;
  if (typeof delivery !== "string" || !uuid.test(delivery)) return null;
  if (
    typeof provider !== "string" ||
    !uuid.test(provider) ||
    typeof event.created_at !== "string" ||
    !Number.isFinite(Date.parse(event.created_at))
  ) {
    throw new Error("Invalid webhook");
  }
  return {
    delivery_id: delivery,
    provider_id: provider,
    event_status: statuses[event.type],
    occurred_at: new Date(event.created_at).toISOString(),
  };
}
