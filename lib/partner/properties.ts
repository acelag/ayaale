import "server-only";

import type { requirePartnerSession } from "./session";

type Session = Awaited<ReturnType<typeof requirePartnerSession>>;

export type PartnerProperty = {
  id: string;
  name: string;
  district: string;
  verification_status: string;
  role: string;
};

export async function loadPartnerProperties({ client, user }: Session) {
  const properties: PartnerProperty[] = [];
  const batchSize = 500;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await client
      .from("property_memberships")
      .select("role,properties!inner(id,name,district,verification_status)")
      .eq("profile_id", user.id)
      .is("properties.archived_at", null)
      .order("property_id")
      .range(offset, offset + batchSize - 1);
    if (error || !data) return null;
    properties.push(
      ...data.flatMap(({ role, properties }) => (properties ? [{ ...properties, role }] : [])),
    );
    if (data.length < batchSize) break;
  }
  return properties.sort((left, right) => left.name.localeCompare(right.name, "en-LK"));
}

type Activity = { views: number; whatsapp: number; calls: number };
type PropertyTotals = {
  id: string;
  published: number;
  active: number;
  current: Activity;
  previous: Activity;
};

export type PartnerOverview = {
  currentMonth: string;
  previousMonth: string;
  properties: PropertyTotals[];
};

export async function loadPartnerOverview({ client }: Session): Promise<PartnerOverview | null> {
  const { data, error } = await client.rpc("get_partner_overview");
  if (error || !data) return null;
  return data as PartnerOverview;
}

export async function loadPartnerPhotoAssets({ client }: Session, propertyId: string) {
  const assets: { id: string; width: number; height: number }[] = [];
  const batchSize = 500;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await client
      .from("photo_assets")
      .select("id,width,height")
      .eq("property_id", propertyId)
      .order("created_at")
      .order("id")
      .range(offset, offset + batchSize - 1);
    if (error || !data) return null;
    assets.push(...data);
    if (data.length < batchSize) return assets;
  }
}
