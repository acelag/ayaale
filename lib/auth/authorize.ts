import "server-only";
import { createClient } from "@/lib/supabase/server";
export async function requireVerifiedUser() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || !user.email_confirmed_at || user.is_anonymous)
    throw new Error("Authentication required");
  return { client, user };
}
export async function requirePropertyRole(propertyId: string, ownerOnly = false) {
  const { client, user } = await requireVerifiedUser();
  const { data, error } = await client
    .from("property_memberships")
    .select("role")
    .eq("property_id", propertyId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error || !data || (ownerOnly && data.role !== "owner")) throw new Error("Access denied");
  return { client, user, role: data.role };
}
export async function requirePlatformAdmin() {
  const { client, user } = await requireVerifiedUser();
  const { data, error } = await client.rpc("has_platform_admin_access");
  if (error || data !== true) throw new Error("Access denied");
  return { client, user };
}
