import "server-only";
import { createTimedFetch } from "@/lib/security/timed-fetch.mjs";
import { createClient } from "@supabase/supabase-js";
export const PHOTO_BUCKET = "ayaale-private-photos";
export function photoStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: createTimedFetch() },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
