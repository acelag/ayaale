import "server-only";

import { cache } from "react";
import type { Category } from "@/lib/discovery/model";

export type PublicPropertyProfile = {
  name: string;
  description: string | null;
  category: Exclude<Category, "all">;
  propertyType: string;
  address: string;
  district: string;
  mapsUrl: string | null;
  reviewsUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  websiteUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  amenities: string[];
  photos: { position: number; alt: string }[];
  offers: { slug: string; title: string }[];
};

export function isPropertySlug(slug: string) {
  return slug.length >= 3 && slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export const readPublicProperty = cache(
  async (slug: string): Promise<PublicPropertyProfile | null> => {
    if (!isPropertySlug(slug)) return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Property service is unavailable");

    const response = await fetch(new URL("/rest/v1/rpc/get_public_property_profile", url), {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ property_slug: slug }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Property service is unavailable");
    return response.json();
  },
);
