"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requirePartnerSession } from "./session";
import { isPropertyId } from "./registration";
import { validateWizard, wizardFields, type WizardContent } from "./offer-wizard";
import type { Json } from "@/lib/database.types";

type Result = { message: string; step?: number };
const unavailable = { message: "We couldn’t save this offer. Please try again." };

export async function saveWizard(
  propertyId: string,
  draftId: string,
  version: number,
  _previous: Result,
  form: FormData,
): Promise<Result> {
  if (
    !(await headers()).get("origin") ||
    !isPropertyId(propertyId) ||
    !isPropertyId(draftId) ||
    !Number.isInteger(version) ||
    version < 0 ||
    !(form instanceof FormData)
  )
    return unavailable;
  const raw = form.get("content");
  let content: WizardContent;
  try {
    if (typeof raw !== "string" || raw.length > 32768) return unavailable;
    const value = JSON.parse(raw);
    if (
      !value?.fields ||
      typeof value.fields !== "object" ||
      Array.isArray(value.fields) ||
      !Array.isArray(value.gallery) ||
      value.gallery.length > 11 ||
      !value.gallery.every(isPropertyId) ||
      new Set(value.gallery).size !== value.gallery.length
    )
      return unavailable;
    const fields: Record<string, string> = {};
    for (const { name, max } of wizardFields) {
      const field = value.fields[name];
      if (field === undefined) continue;
      if (typeof field !== "string" || field.length > (max ?? 1000) || field.includes("\0"))
        return unavailable;
      fields[name] = field.trim();
    }
    const cover = value.fields.cover;
    if (cover && !isPropertyId(cover)) return { step: 3, message: "Choose a valid cover photo." };
    if (cover) fields.cover = cover.toLowerCase();
    content = { fields, gallery: value.gallery.map((id: string) => id.toLowerCase()) };
  } catch {
    return unavailable;
  }

  const submitting = form.get("intent") === "submit";
  if (submitting) {
    const validation = validateWizard(content);
    if (validation) return validation;
  }
  const { client } = await requirePartnerSession();
  const { data, error } = await client.rpc("save_offer_wizard", {
    target_property: propertyId,
    draft_id: draftId,
    expected_version: version,
    content: { ...content.fields, gallery: content.gallery } as Json,
    submit_for_review: submitting,
  });
  if (error) return unavailable;
  if (data === "saved" || data === "submitted") {
    const step = form.get("step");
    redirect(
      `/partner/properties/${propertyId}/offer?draft=${draftId}&${data}=1${typeof step === "string" && /^[0-4]$/.test(step) ? `&step=${step}` : ""}`,
    );
  }
  if (data === "stale")
    return { message: "This draft changed in another tab. Reload it before saving again." };
  if (data === "locked")
    return { message: "This offer was already submitted and its review copy is locked." };
  if (data === "unverified")
    return {
      message: "Verify this property before submitting. You can still save the offer as a draft.",
    };
  if (data === "contact")
    return {
      message:
        "Add an approved business phone or WhatsApp number to this property before submitting.",
    };
  if (data === "photos")
    return {
      step: 3,
      message:
        "Choose distinct photos uploaded to this property and include a cover before submitting.",
    };
  if (data === "dates")
    return {
      step: 2,
      message:
        "Check the dates. The publication window and redemption end must still be current in Sri Lanka time.",
    };
  if (data === "forbidden")
    return { message: "Your account no longer has access to this property." };
  if (data === "invalid")
    return {
      message:
        "Some offer details aren’t valid for submission. Check the category, pricing and required fields.",
    };
  return unavailable;
}
