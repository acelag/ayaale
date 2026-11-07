"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signin, signout, signup } from "@/lib/auth/actions";
import { httpsLink, safeMapsUrl } from "@/lib/properties/public-links";
import {
  districts,
  isPropertyId,
  propertyCategories,
  propertyTypes,
  stayTypes,
} from "./registration";
import { requirePartnerSession } from "./session";

type FormState = { ok: boolean; message: string };
type RegistrationState = FormState & { offerClaim?: boolean };
const unavailable = { ok: false, message: "Please try again in a moment." };

export async function submitPartnerAuth(
  mode: "signup" | "signin",
  destination: "partner" | "admin",
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  if (!(await headers()).get("origin") || !(form instanceof FormData)) return unavailable;
  if (mode === "signup") {
    try {
      return await signup(form);
    } catch {
      return unavailable;
    }
  }
  if (mode !== "signin") return unavailable;
  let result: FormState;
  try {
    result = await signin(form);
  } catch {
    return unavailable;
  }
  if (result.ok) redirect(destination === "admin" ? "/admin" : "/partner");
  return result;
}

export async function signOutPartner() {
  if (!(await headers()).get("origin")) return;
  let ok = false;
  try {
    ({ ok } = await signout());
  } catch {
    // A network failure can leave the current session active.
  }
  redirect(ok ? "/partner/sign-in" : "/partner?signout=failed");
}

export async function registerProperty(
  registrationId: string,
  _state: RegistrationState,
  form: FormData,
): Promise<RegistrationState> {
  if (
    !(await headers()).get("origin") ||
    !isPropertyId(registrationId) ||
    !(form instanceof FormData)
  ) {
    return unavailable;
  }
  const { client } = await requirePartnerSession();
  const limits = {
    name: 160,
    contact_name: 120,
    primary_category: 20,
    property_type: 24,
    address: 500,
    district: 80,
    public_phone: 16,
    public_whatsapp: 16,
    google_maps_url: 2048,
    website_url: 2048,
  };
  const values: Record<string, string> = {};
  for (const [key, max] of Object.entries(limits)) {
    const field = form.get(key);
    if (typeof field !== "string" || field.length > max || field.includes("\0")) {
      return {
        ok: false,
        message: "Check the format and length of your property details.",
      };
    }
    values[key] = field.trim();
  }

  const error = (message: string) => ({ ok: false, message });
  const {
    name,
    contact_name,
    address,
    district,
    primary_category,
    property_type,
    public_phone,
    public_whatsapp,
    google_maps_url,
    website_url,
  } = values;
  if (name.length < 2 || contact_name.length < 2 || address.length < 5) {
    return error("Enter the property name, contact person and full street address.");
  }
  if (!(districts as readonly string[]).includes(district)) {
    return error("Choose a district from the list.");
  }
  if (
    !Object.hasOwn(propertyCategories, primary_category) ||
    !Object.hasOwn(propertyTypes, property_type)
  ) {
    return error("Choose a category and property type.");
  }
  if (primary_category === "stays" && !stayTypes.includes(property_type)) {
    return error("For Stays, choose hotel, boutique hotel, resort, villa or guest house.");
  }
  const phone = /^\+[1-9][0-9]{6,14}$/;
  if (
    (!public_phone && !public_whatsapp) ||
    [public_phone, public_whatsapp].some((value) => value && !phone.test(value))
  ) {
    return error("Enter at least one business phone or WhatsApp number with its country code.");
  }
  const map = google_maps_url ? safeMapsUrl(google_maps_url) : null;
  const website = website_url ? httpsLink(website_url) : null;
  if (google_maps_url && !map) return error("Enter a valid Google Maps link or leave it blank.");
  if (website_url && !website) return error("Enter a secure website URL or leave it blank.");

  const wantsClaim = form.get("intent") === "claim";
  const claimNote = form.get("claim_message");
  if (
    wantsClaim &&
    (typeof claimNote !== "string" ||
      claimNote.trim().length < 10 ||
      claimNote.length > 2000 ||
      claimNote.includes("\0"))
  ) {
    return {
      ...error("Explain your authority to represent the property in at least 10 characters."),
      offerClaim: true,
    };
  }

  let result: string | null;
  try {
    const response = await client.rpc("register_partner_property", {
      registration_id: registrationId,
      details: {
        ...values,
        google_maps_url: map ?? "",
        website_url: website?.href ?? "",
        ...(wantsClaim && typeof claimNote === "string" ? { claim_message: claimNote.trim() } : {}),
      },
    });
    if (response.error) return error(unavailable.message);
    result = response.data;
  } catch {
    return error(unavailable.message);
  }
  if (result === "registered") redirect(`/partner/properties/${registrationId}`);
  if (result === "claimed" || result === "existing_claim") redirect("/partner/claims");
  if (result === "duplicate")
    return {
      ...error(
        "A property may already match these details. Check your details or submit an ownership claim.",
      ),
      offerClaim: true,
    };
  if (result === "no_match")
    return error(
      "We couldn’t match those details to a property you can claim. Check the details before trying again.",
    );
  if (result === "limited") return error("Too many registration attempts. Please try again later.");
  if (result === "unauthorized") redirect("/partner/sign-in");
  return error("We couldn’t register this property. Check your details and try again.");
}
