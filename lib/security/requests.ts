import "server-only";
import { photoStorage } from "@/lib/media/storage";
import { budgetKey } from "./request-keys.mjs";
export class RequestBlocked extends Error {
  constructor(
    public status: number,
    public retryAfter = 60,
  ) {
    super("Please try again later.");
  }
}
export async function enforceBudget(
  action: "auth_signup" | "auth_signin" | "photo_upload" | "photo_read" | "auth_callback",
  subject?: string,
  propertyId?: string,
) {
  const client = photoStorage(),
    secret = process.env.SUPABASE_SECRET_KEY;
  if (!client || !secret) throw new RequestBlocked(503);
  const keys: [[string, string], ...[string, string][]] = [[`${action}_global`, "global"]];
  if (subject) keys.push([`${action}_subject`, subject]);
  if (propertyId) keys.push([`${action}_property`, propertyId]);
  for (const [name, key] of keys) {
    const { data, error } = await client.rpc("consume_request_budget", {
      budget_action: name,
      subject_hash: budgetKey(secret, name, key),
    });
    if (error || !data?.[0]) throw new RequestBlocked(503);
    if (!data[0].allowed) throw new RequestBlocked(429, data[0].retry_after);
  }
}
export async function authAudit(event: string, actor?: string) {
  const client = photoStorage();
  if (!client) throw new RequestBlocked(503);
  const { error } = await client.rpc("record_auth_audit", {
    event_name: event,
    verified_actor: actor ?? null,
  });
  if (error) throw new RequestBlocked(503);
}
