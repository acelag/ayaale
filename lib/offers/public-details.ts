import "server-only";

import { cache } from "react";
import type { Category, priceUnits } from "@/lib/discovery/model";

export type PublicOfferDetails = {
  title: string;
  description: string;
  category: Exclude<Category, "all">;
  property: string;
  propertySlug: string;
  district: string;
  address: string;
  mapsUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  priceUnit: keyof typeof priceUnits;
  startingFrom: boolean;
  coverage: string;
  adults: number;
  children: number;
  nights: number | null;
  childAgeMin: number | null;
  childAgeMax: number | null;
  childPolicy: string | null;
  inclusions: string[];
  terms: string;
  taxesIncluded: boolean;
  taxDetails: string | null;
  exclusions: string | null;
  restrictions: string | null;
  extraCharges: string | null;
  publicationStart: string;
  publicationEnd: string;
  redemptionStart: string;
  redemptionEnd: string;
  details: Record<string, string | number | string[]>;
  hasCover: boolean;
};

export type UnavailableOfferPage = {
  state: "paused" | "ended" | "unavailable";
  title: string | null;
  related: { slug: string; title: string; property: string; district: string }[];
};

type PublicOfferPage = { state: "active"; offer: PublicOfferDetails } | UnavailableOfferPage;

export function isOfferSlug(slug: string) {
  return slug.length >= 3 && slug.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export const readPublicOfferPage = cache(async (slug: string): Promise<PublicOfferPage | null> => {
  if (!isOfferSlug(slug)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Offer service is unavailable");

  const response = await fetch(new URL("/rest/v1/rpc/get_public_offer_page", url), {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ offer_slug: slug }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Offer service is unavailable");
  return response.json();
});
