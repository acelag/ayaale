"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";
import { newsletterEditorPath } from "./editor";
import { newsletterTestConfig } from "./editor-config";

export async function scheduleNewsletter(
  id: string,
  version: string,
  cancel: boolean,
  _state: { message: string },
  form: FormData,
): Promise<{ message: string }> {
  const failed = { message: "We couldn’t update this newsletter. Refresh and try again." };
  if (
    !(await headers()).get("origin") ||
    !isPropertyId(id) ||
    typeof version !== "string" ||
    version.length > 40
  )
    return failed;
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  if (
    !cancel &&
    (process.env.NEWSLETTER_SEND_ENABLED !== "true" ||
      !newsletterTestConfig() ||
      (process.env.NEWSLETTER_LINK_SECRET?.length ?? 0) < 32 ||
      !process.env.NEWSLETTER_SENDER_DETAILS ||
      !process.env.NEWSLETTER_PRIVACY_URL)
  )
    return {
      message: "Campaign delivery is unavailable until the sender and worker are configured.",
    };
  const raw = form.get("sendAt");
  if (!cancel && (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)))
    return { message: "Choose a Friday date and time in Sri Lanka." };
  const sendAt = !cancel && typeof raw === "string" ? new Date(`${raw}:00+05:30`) : null;
  if (sendAt && !Number.isFinite(sendAt.getTime())) return failed;
  const { data, error } = await session.client.rpc("schedule_admin_newsletter", {
    campaign_id: id,
    expected_version: version,
    send_at: sendAt?.toISOString() ?? null,
    cancel,
  });
  if (error) return failed;
  if (data === "saved") {
    revalidatePath(newsletterEditorPath);
    redirect(`${newsletterEditorPath}/${id}?scheduled=1`);
  }
  const messages: Record<string, string> = {
    friday: "Choose a future Friday date and time in Sri Lanka.",
    offers_changed:
      "Choose five or six approved offers across categories that remain live at the scheduled time.",
    week_taken: "Another newsletter already occupies that Friday week.",
    repetitive:
      "This edition repeats the previous edition’s complete offer selection. Choose a fresh selection.",
    stale: "This newsletter changed. Reload it before continuing.",
    forbidden: "Platform administrator access is required.",
    unavailable: "This newsletter is no longer eligible for this action.",
  };
  return {
    message: typeof data === "string" ? (messages[data] ?? failed.message) : failed.message,
  };
}
