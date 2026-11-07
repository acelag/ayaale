import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTimedFetch } from "@/lib/security/timed-fetch.mjs";
import type { Database } from "@/lib/database.types";
export async function createClient() {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Authentication is not configured");
  return createServerClient<Database>(url, key, {
    global: { fetch: createTimedFetch() },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        for (const { name, value, options } of values) store.set(name, value, options);
      },
    },
  });
}
