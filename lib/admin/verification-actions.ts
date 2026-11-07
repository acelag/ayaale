"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decisionLabels } from "./verification";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";
import { safeMapsUrl } from "@/lib/properties/public-links";

export async function decideVerification(
  id: string,
  version: string,
  _state: { message: string },
  form: FormData,
): Promise<{ message: string }> {
  const unavailable = { message: "We couldn’t save the decision. Refresh and try again." };
  if (
    !(await headers()).get("origin") ||
    !isPropertyId(id) ||
    typeof version !== "string" ||
    version.length > 100
  )
    return unavailable;
  const operation = form.get("operation");
  const message = form.get("message");
  const evidence = form.get("evidence");
  if (
    typeof operation !== "string" ||
    !Object.hasOwn(decisionLabels, operation) ||
    typeof message !== "string" ||
    message.length > 2000 ||
    message.includes("\0") ||
    typeof evidence !== "string" ||
    evidence.length > 4000 ||
    evidence.includes("\0")
  )
    return unavailable;

  const decision: Record<string, string | boolean> = { message, evidence };
  if (operation === "approve") {
    const maps = form.get("maps");
    const latitude = form.get("latitude");
    const longitude = form.get("longitude");
    const method = form.get("method");
    const safeMaps =
      typeof maps === "string" && maps.length <= 2048 ? safeMapsUrl(maps.trim()) : null;
    if (
      !safeMaps ||
      typeof latitude !== "string" ||
      latitude.length > 12 ||
      typeof longitude !== "string" ||
      longitude.length > 12 ||
      typeof method !== "string" ||
      method.length > 30
    )
      return {
        message: "Enter a Google Maps link, latitude, longitude, and a verification method.",
      };
    Object.assign(decision, {
      maps: safeMaps,
      latitude,
      longitude,
      method,
      existence: form.get("existence") === "on",
      authority: form.get("authority") === "on",
    });
  } else if (operation === "suspend") {
    decision.confirm = form.get("confirm") === "on";
  }

  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const { data, error } = await session.client.rpc("decide_property_verification", {
    target_property: id,
    expected_version: version,
    operation,
    decision,
  });
  if (error) return unavailable;
  if (data === "saved") {
    revalidatePath("/admin");
    revalidatePath("/admin/verifications");
    revalidatePath(`/partner/properties/${id}`, "layout");
    redirect(`/admin/verifications/${id}?saved=1`);
  }
  if (data === "duplicate")
    return {
      message:
        "An existing listing matches these details. Resolve the duplicate through an ownership claim before approving.",
    };
  if (data === "stale")
    return { message: "This review changed. Reload it before making a decision." };
  if (data === "forbidden") return { message: "Administrator access is required." };
  if (data === "unavailable")
    return { message: "That decision is unavailable for the current status." };
  if (data === "invalid")
    return {
      message:
        operation === "approve"
          ? "Complete the checklist and evidence summary, and check the location and proposed profile."
          : "Add a message for the partner and confirm the suspension if selected.",
    };
  return unavailable;
}
