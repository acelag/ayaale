"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { moderationOperations, reportPriorities, reportsPath } from "@/lib/admin/reports";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";

export async function moderateReport(
  id: string,
  version: string,
  _state: { message: string },
  form: FormData,
): Promise<{ message: string }> {
  const unavailable = { message: "We couldn’t save the action. Refresh and try again." };
  if (!(await headers()).get("origin") || !isPropertyId(id)) return unavailable;
  const operation = form.get("operation");
  const note = form.get("note");
  const priority = form.get("priority");
  const message = form.get("ownerMessage");
  const confirm = form.get("confirm") === "on";

  if (typeof operation !== "string" || !Object.hasOwn(moderationOperations, operation))
    return { message: "Choose a moderation action." };
  if (typeof note !== "string" || !note.trim() || note.length > 4000 || note.includes("\0"))
    return { message: "Enter an internal note of 4,000 characters or fewer." };
  if (
    operation === "change_priority" &&
    (typeof priority !== "string" || !Object.hasOwn(reportPriorities, priority))
  )
    return { message: "Choose a new priority." };
  if (
    operation === "request_changes" &&
    (typeof message !== "string" ||
      !message.trim() ||
      message.length > 2000 ||
      message.includes("\0"))
  )
    return { message: "Enter instructions for the owner of 2,000 characters or fewer." };
  if ((operation === "temporarily_hide" || operation === "restore") && !confirm)
    return { message: "Confirm the public visibility change." };

  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const { data, error } = await session.client.rpc("moderate_report", {
    target_report: id,
    expected_version: version,
    operation,
    decision_note: note.trim(),
    new_priority: operation === "change_priority" && typeof priority === "string" ? priority : "",
    owner_message:
      operation === "request_changes" && typeof message === "string" ? message.trim() : "",
    confirm_visibility: confirm,
  });
  if (error) return unavailable;
  if (data === "saved") {
    revalidatePath("/admin");
    revalidatePath(reportsPath);
    if (operation === "temporarily_hide" || operation === "restore") {
      revalidatePath("/");
      revalidatePath("/offers/[slug]", "page");
      revalidatePath("/properties/[slug]", "page");
    }
    redirect(`${reportsPath}/${id}?saved=1`);
  }
  if (data === "stale")
    return { message: "Someone updated this complaint. Reload it before trying again." };
  if (data === "forbidden") return { message: "Platform administrator access is required." };
  if (data === "unavailable")
    return {
      message: "This action is unavailable. Check the complaint and the listing’s current status.",
    };
  if (data === "invalid")
    return { message: "Check the note and the required fields for this action." };
  return unavailable;
}
