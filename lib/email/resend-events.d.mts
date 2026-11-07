export function verifyResendEvent(
  raw: Uint8Array,
  headers: Headers,
  secret: string,
  now?: number,
): {
  delivery_id: string;
  provider_id: string;
  event_status: string;
  occurred_at: string;
} | null;
