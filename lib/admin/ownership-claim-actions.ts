"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";

export async function decideOwnershipClaim(
  id: string,
  _state: { message: string },
  form: FormData,
): Promise<{ message: string }> {
  const unavailable = { message: "We couldn’t save this decision. Refresh and try again." };
  if (!(await headers()).get("origin") || !isPropertyId(id)) return unavailable;
  const operation = form.get("operation");
  const target = form.get("property");
  const note = form.get("note");
  const evidence = form.get("evidence");
  const verified = form.get("verified") === "on";
  if (operation !== "approve" && operation !== "reject") return unavailable;
  if (
    typeof note !== "string" ||
    !note.trim() ||
    note.length > 2000 ||
    note.includes("\0") ||
    typeof evidence !== "string" ||
    evidence.length > 4000 ||
    evidence.includes("\0")
  )
    return { message: "Enter a decision message and check the length of the evidence summary." };
  if (operation === "approve" && (!isPropertyId(target) || !evidence.trim() || !verified))
    return { message: "Choose a matching property and record your independent verification." };

  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const { data, error } = await session.client.rpc("decide_ownership_claim", {
    target_claim: id,
    ...(operation === "approve" && isPropertyId(target) ? { target_property: target } : {}),
    operation,
    decision_note: note.trim(),
    evidence: evidence.trim(),
    independently_verified: verified,
  });
  if (error) return unavailable;
  if (data === "saved") {
    revalidatePath("/admin/ownership-claims");
    revalidatePath("/admin/verifications");
    revalidatePath("/partner");
    revalidatePath("/partner/claims");
    redirect(`/admin/ownership-claims/${id}?saved=1`);
  }
  if (data === "stale")
    return {
      message:
        "The claim or current property assignment changed. Reload the claim before deciding.",
    };
  if (data === "forbidden") return { message: "Platform administrator access is required." };
  if (data === "unavailable")
    return { message: "This claim or claimant is no longer eligible for this decision." };
  if (data === "invalid")
    return { message: "Check the decision message and independent verification details." };
  return unavailable;
}
