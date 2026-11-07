"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { reviewChecks, reviewOperations } from "./offer-review";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";

export async function decideOfferReview(
  offerId: string,
  revisionId: string,
  version: string,
  _state: { message: string },
  form: FormData,
): Promise<{ message: string }> {
  const unavailable = { message: "We couldn’t save this review. Refresh and try again." };
  if (
    !(await headers()).get("origin") ||
    !isPropertyId(offerId) ||
    !isPropertyId(revisionId) ||
    typeof version !== "string" ||
    version.length > 40
  )
    return unavailable;
  const operation = form.get("operation");
  const note = form.get("note");
  if (
    typeof operation !== "string" ||
    !Object.hasOwn(reviewOperations, operation) ||
    typeof note !== "string" ||
    note.length > 2000 ||
    note.includes("\0")
  )
    return unavailable;
  if (operation !== "approve" && note.trim().length < 2)
    return { message: "Add a message explaining the decision to the partner." };

  const checklist = Object.fromEntries(
    Object.keys(reviewChecks).map((key) => [key, form.get(key) === "on"]),
  );
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const { data, error } = await session.client.rpc("decide_offer_review", {
    target_offer: offerId,
    target_revision: revisionId,
    expected_version: version,
    operation,
    decision_message: note.trim(),
    checklist,
  });
  if (error) return unavailable;
  if (data === "saved") {
    revalidatePath("/admin");
    revalidatePath("/admin/offer-reviews");
    redirect(`/admin/offer-reviews/${offerId}?revision=${revisionId}&saved=1`);
  }
  const feedback: Record<string, string> = {
    checklist: "Complete every approval check before approving this offer.",
    dates: "The publication or redemption window has ended. Request updated dates.",
    stale: "The offer changed or this revision was already reviewed. Reload before deciding.",
    unavailable: "This offer or property is unavailable for that decision.",
    content: "Check the price, property contact and photo assignments before approving.",
    forbidden: "Platform administrator access is required.",
    invalid: "Check the review message and try again.",
  };
  return typeof data === "string" && Object.hasOwn(feedback, data)
    ? { message: feedback[data] }
    : unavailable;
}
