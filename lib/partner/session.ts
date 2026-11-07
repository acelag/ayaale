import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const partnerSession = cache(async () => {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at || user.is_anonymous) return null;
  return { client, user };
});

export async function requirePartnerSession() {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in");
  return session;
}
