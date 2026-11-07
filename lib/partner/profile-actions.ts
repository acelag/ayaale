"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  httpsLink,
  safeMapsUrl,
  safeReviewsUrl,
  safeSocialUrl,
} from "@/lib/properties/public-links";
import { requirePartnerSession } from "./session";
import { isPropertyId } from "./registration";
import { contactFields, informationFields, type GalleryPhoto } from "./profile-editor";

type Result = { message: string };
const unavailable = { message: "We couldn’t save your changes. Please try again." };

export async function submitProfile(
  propertyId: string,
  version: string,
  _state: Result,
  form: FormData,
): Promise<Result> {
  if (
    !(await headers()).get("origin") ||
    !isPropertyId(propertyId) ||
    typeof version !== "string" ||
    version.length > 100 ||
    !(form instanceof FormData)
  ) {
    return unavailable;
  }

  const { client } = await requirePartnerSession();
  const details: Record<string, string | null> = {};
  for (const field of [...informationFields, ...contactFields]) {
    const value = form.get(field.name);
    if (typeof value !== "string" || value.length > field.max || value.includes("\0")) {
      return { message: `Check the length and format of ${field.label.toLowerCase()}.` };
    }
    details[field.name] = value.trim() || null;
  }
  if (
    (details.name?.length ?? 0) < 2 ||
    (details.address?.length ?? 0) < 5 ||
    (details.district?.length ?? 0) < 2
  ) {
    return { message: "Enter the property name, street address and district." };
  }
  const phone = /^\+[1-9][0-9]{6,14}$/;
  const { public_phone, public_whatsapp, public_email } = details;
  if (
    (!public_phone && !public_whatsapp) ||
    [public_phone, public_whatsapp].some((value) => value && !phone.test(value))
  ) {
    return {
      message: "Enter at least one business phone or WhatsApp number with its country code.",
    };
  }
  if (public_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(public_email)) {
    return { message: "Enter a valid business email or leave it blank." };
  }
  for (const [key, label, validate] of [
    ["website_url", "website", (url: string) => httpsLink(url)?.href],
    ["google_maps_url", "Google Maps", safeMapsUrl],
    ["google_reviews_url", "Google reviews", safeReviewsUrl],
    ["facebook_url", "Facebook", (url: string) => safeSocialUrl(url, "facebook.com")],
    ["instagram_url", "Instagram", (url: string) => safeSocialUrl(url, "instagram.com")],
  ] as const) {
    const value = details[key];
    if (!value) continue;
    const normalized = validate(value);
    if (!normalized || normalized.length > 2048) return { message: `Enter a valid ${label} link.` };
    details[key] = normalized;
  }

  const amenityText = form.get("amenities");
  if (typeof amenityText !== "string" || amenityText.length > 2500 || amenityText.includes("\0")) {
    return { message: "Enter up to 24 amenities, one per line." };
  }
  const amenities = [
    ...new Set(
      amenityText
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (amenities.length > 24 || amenities.some((item) => item.length > 100)) {
    return { message: "Enter up to 24 amenities of 100 characters or fewer." };
  }

  const encodedGallery = form.get("gallery");
  let gallery: GalleryPhoto[];
  try {
    if (typeof encodedGallery !== "string" || encodedGallery.length > 5000) throw new Error();
    const items: unknown = JSON.parse(encodedGallery);
    if (!Array.isArray(items) || items.length > 12) throw new Error();
    const ids = new Set<string>();
    gallery = items.map((item) => {
      if (
        !isPropertyId(item?.id) ||
        ids.has(item.id.toLowerCase()) ||
        typeof item.alt !== "string" ||
        item.alt.trim().length < 2 ||
        item.alt.length > 180 ||
        item.alt.includes("\0")
      )
        throw new Error();
      const id = item.id.toLowerCase();
      ids.add(id);
      return { id, alt: item.alt.trim() };
    });
  } catch {
    return { message: "Use up to 12 different photos, each with a short description." };
  }

  const { data, error } = await client.rpc("submit_property_profile", {
    target_property: propertyId,
    expected_version: version,
    changes: { ...details, amenities, gallery },
  });
  if (error) return unavailable;
  if (data === "saved") redirect(`/partner/properties/${propertyId}/profile?submitted=1`);
  if (data === "unchanged") return { message: "There are no changes to submit." };
  if (data === "stale")
    return { message: "The saved profile changed. Reload this page before submitting again." };
  if (data === "locked")
    return { message: "This review is locked. Reload this page to check its status." };
  if (data === "forbidden")
    return { message: "Only the current property owner can submit profile changes." };
  if (data === "invalid")
    return {
      message:
        "Check your profile and gallery. Verified properties need a Google Maps link, and gallery photos must belong to this property.",
    };
  return unavailable;
}
