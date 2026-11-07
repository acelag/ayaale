"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { offerOperations, type OfferOperation } from "./manage-offers";
import { isPropertyId } from "./registration";
import { requirePartnerSession } from "./session";

export async function changeOffer(
  propertyId: string,
  itemId: string,
  operation: OfferOperation,
  version: string,
  newDraftId: string | undefined,
  page: number,
): Promise<{ message: string }> {
  const unavailable = { message: "We couldn’t update this offer. Please try again." };
  if (
    !(await headers()).get("origin") ||
    !isPropertyId(propertyId) ||
    !isPropertyId(itemId) ||
    !Object.hasOwn(offerOperations, operation) ||
    typeof version !== "string" ||
    version.length > 40 ||
    (newDraftId !== undefined && !isPropertyId(newDraftId)) ||
    !Number.isInteger(page) ||
    page < 0 ||
    page > 999999
  )
    return unavailable;
  const { client } = await requirePartnerSession();
  const { data, error } = await client.rpc("manage_partner_offer", {
    target_property: propertyId,
    item_id: itemId,
    operation,
    expected_version: version,
    new_draft_id: newDraftId,
  });
  if (error) return unavailable;
  const base = `/partner/properties/${propertyId}`;
  if (data === "saved" || isPropertyId(data)) {
    revalidatePath(`${base}/offers`);
    if (data === "saved") redirect(`${base}/offers?page=${page}&updated=${operation}`);
    redirect(`${base}/offer?draft=${data}`);
  }
  if (data === "stale") return { message: "This offer changed. Refresh before trying again." };
  if (data === "review")
    return { message: "Wait for the current review decision before editing again." };
  if (data === "capacity")
    return { message: "All active slots are full. Pause or end an active offer before resuming." };
  if (data === "ineligible")
    return {
      message: "This offer can’t resume. Check its dates, property verification and subscription.",
    };
  if (data === "unavailable")
    return { message: "This action is unavailable for the offer’s current state." };
  if (data === "forbidden")
    return { message: "Your account no longer has access to this property." };
  return unavailable;
}
